import { Injectable, Logger } from '@nestjs/common';
import { OpenAIRealtimeWebSocket } from '@openai/agents/realtime';
import { RealtimeEvent } from '../../domain/events/realtime-event';
import { createSessionUpdateConfig } from '../../agents/realtime-config';

type EventCallback = (event: RealtimeEvent) => void;

@Injectable()
export class OpenAIRealtimeGateway {
    private readonly logger = new Logger(OpenAIRealtimeGateway.name);
    private connections = new Map<string, OpenAIRealtimeWebSocket>();

    async startMonitoring(callId: string, apiToken: string, onEvent: EventCallback) {
        if (this.connections.has(callId)) {
            this.logger.warn(`Connection already exists for call_id=${callId}`);
            return;
        }

        const connection = new OpenAIRealtimeWebSocket();

        // SDK uses 'connected' event (not 'open')
        connection.on('connected', () => {
            this.logger.log(`Connected to OpenAI Realtime (call_id=${callId})`);

            // サイドバンド接続後、session.updateで本物のInstructions + Toolsを注入
            // 注意: この時点ではまだ this.connections.set が実行されていない可能性があるため、
            // connection 変数を直接使用する
            this.injectSessionConfigDirect(callId, connection);
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
        // Note: Not all errors mean the connection should be closed
        // Only delete connection on actual connection errors, not API validation errors
        connection.on('error', (err: any) => {
            this.logger.error(`Realtime connection error (call_id=${callId}): ${JSON.stringify(err)}`);
            // Don't automatically delete connection - let 'disconnected' event handle that
            // Some errors are just API validation errors and the connection is still valid
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

        this.connections.set(callId, connection);
    }

    /**
     * サイドバンドから session.update で本物の Instructions + Tools を注入
     * connection を直接受け取るバージョン（connected イベント内で使用）
     */
    private injectSessionConfigDirect(callId: string, connection: OpenAIRealtimeWebSocket): boolean {
        try {
            const sessionConfig = createSessionUpdateConfig();

            connection.sendEvent({
                type: 'session.update',
                session: sessionConfig,
            });

            this.logger.log(`[Sideband] Injected session config for call_id=${callId}`);
            this.logger.log(`[Sideband] Tools: ${sessionConfig.tools.map(t => t.name).join(', ')}`);
            return true;
        } catch (err) {
            this.logger.error(`Failed to inject session config for ${callId}: ${err}`);
            return false;
        }
    }

    /**
     * Send an event to the Realtime API via the sideband connection.
     * Used to inject responses or control the conversation.
     */
    sendEvent(callId: string, event: any): boolean {
        const connection = this.connections.get(callId);
        if (!connection) {
            this.logger.warn(`No connection found for call_id=${callId}`);
            return false;
        }

        try {
            connection.sendEvent(event);
            this.logger.log(`Sent event to Realtime API (call_id=${callId}): ${event.type}`);
            return true;
        } catch (err) {
            this.logger.error(`Failed to send event for ${callId}: ${err}`);
            return false;
        }
    }

    /**
     * Inject a text response into the conversation and have it spoken.
     * 
     * We use response.create with instructions to make the model speak the exact text.
     * Without instructions, response.create generates a NEW response instead of
     * reading the injected text.
     */
    injectResponse(callId: string, text: string): boolean {
        const connection = this.connections.get(callId);
        if (!connection) {
            this.logger.warn(`No connection found for call_id=${callId}`);
            return false;
        }

        try {
            // Don't use conversation.item.create - it just adds text to history
            // but response.create ignores it and generates new content.

            // Instead, use response.create with instructions to speak specific text
            connection.sendEvent({
                type: 'response.create',
                response: {
                    instructions: `あなたの回答は次の通りです。この内容を正確に、そのまま読み上げてください。余計な言葉を追加しないでください:\n\n${text}`,
                },
            });

            this.logger.log(`Injected response for call_id=${callId}: ${text.substring(0, 50)}...`);
            return true;
        } catch (err) {
            this.logger.error(`Failed to inject response for ${callId}: ${err}`);
            return false;
        }
    }

    getConnection(callId: string): OpenAIRealtimeWebSocket | undefined {
        return this.connections.get(callId);
    }

    async stop(callId: string) {
        const conn = this.connections.get(callId);
        if (!conn) return;
        this.connections.delete(callId);
        try {
            conn.close();
        } catch (err) {
            this.logger.error(`Error closing connection for ${callId}: ${err}`);
        }
    }
}
