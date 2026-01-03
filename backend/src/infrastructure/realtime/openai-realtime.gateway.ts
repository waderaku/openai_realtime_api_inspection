import { Injectable, Logger } from '@nestjs/common';
import OpenAI from 'openai';
import { RealtimeEvent } from '../../domain/events/realtime-event';

type EventCallback = (event: RealtimeEvent) => void;

type RealtimeConn = {
    send?: (payload: any) => void | Promise<void>;
    close?: () => void | Promise<void>;
    on?: (event: string, handler: (data: any) => void) => void;
};

@Injectable()
export class OpenAIRealtimeGateway {
    private readonly logger = new Logger(OpenAIRealtimeGateway.name);
    private connections = new Map<string, RealtimeConn>();

    async startMonitoring(callId: string, apiToken: string, onEvent: EventCallback) {
        if (this.connections.has(callId)) {
            this.logger.warn(`Connection already exists for call_id=${callId}`);
            return;
        }

        const client = new OpenAI({ apiKey: apiToken });

        // Agents SDK (Realtime) — using the ws helper if available
        const factory = (client as any).realtime?.connections?.ws ?? (client as any).realtime?.connect;
        if (!factory) {
            throw new Error('OpenAI Realtime client is not available in this SDK version.');
        }

        const connection: RealtimeConn = await factory({
            model: 'gpt-4o-realtime-preview-2024-12-17',
        });

        connection.on?.('event', (event: any) => {
            try {
                onEvent({ ...event, call_id: callId });
            } catch (err) {
                this.logger.error(`Failed to forward event for ${callId}: ${err}`);
            }
        });

        connection.on?.('open', async () => {
            this.logger.log(`Connected to OpenAI Realtime (call_id=${callId})`);
            try {
                await connection.send?.({
                    type: 'session.update',
                    session: { type: 'realtime', instructions: 'Monitor this call session' },
                });
            } catch (err) {
                this.logger.error(`Failed to send session.update for ${callId}: ${err}`);
            }
        });

        connection.on?.('close', (payload: any) => {
            const reason = typeof payload === 'string' ? payload : JSON.stringify(payload ?? {});
            this.logger.log(`Realtime connection closed (call_id=${callId}, reason=${reason})`);
            this.connections.delete(callId);
        });

        connection.on?.('error', (err: any) => {
            this.logger.error(`Realtime connection error (call_id=${callId}): ${err}`);
            this.connections.delete(callId);
        });

        this.connections.set(callId, connection);
    }

    async stop(callId: string) {
        const conn = this.connections.get(callId);
        if (!conn) return;
        this.connections.delete(callId);
        try {
            await conn.close?.();
        } catch (err) {
            this.logger.error(`Error closing connection for ${callId}: ${err}`);
        }
    }
}
