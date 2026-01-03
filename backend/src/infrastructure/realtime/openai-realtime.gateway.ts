import { Injectable, Logger } from '@nestjs/common';
import { OpenAIRealtimeWebSocket } from '@openai/agents/realtime';
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

        const connection = new OpenAIRealtimeWebSocket();

        // SDK uses 'connected' event (not 'open')
        connection.on('connected', () => {
            this.logger.log(`Connected to OpenAI Realtime (call_id=${callId})`);
        });

        // SDK uses '*' wildcard for ALL server events (not 'server_event')
        connection.on('*', (event: any) => {
            try {
                onEvent({ ...event, call_id: callId });
            } catch (err) {
                this.logger.error(`Failed to forward event for ${callId}: ${err}`);
            }
        });

        // SDK uses 'disconnected' event (not 'close')
        connection.on('disconnected', () => {
            this.logger.log(`Realtime connection closed (call_id=${callId})`);
            this.connections.delete(callId);
        });

        // 'error' event for error handling
        connection.on('error', (err: any) => {
            this.logger.error(`Realtime connection error (call_id=${callId}): ${err}`);
            this.connections.delete(callId);
        });

        try {
            // Use callId parameter for sideband connection (attach to existing session)
            await connection.connect({
                apiKey: apiToken,
                model: 'gpt-realtime',
                callId: callId,
            });
        } catch (e) {
            this.logger.error(`Failed to connect for ${callId}: ${e}`);
            return;
        }

        this.connections.set(callId, connection as any);
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
