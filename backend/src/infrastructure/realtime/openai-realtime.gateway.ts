import { Injectable, Logger } from '@nestjs/common';
import { OpenAIRealtimeWebSocket } from '@openai/agents/realtime';
import { RealtimeEvent } from '../../domain/events/realtime-event';

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

        this.connections.set(callId, connection);
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
     * Inject a text response into the conversation.
     * This creates a conversation item and triggers a response.
     */
    injectResponse(callId: string, text: string): boolean {
        const connection = this.connections.get(callId);
        if (!connection) {
            this.logger.warn(`No connection found for call_id=${callId}`);
            return false;
        }

        try {
            // Create a conversation item with the response text
            connection.sendEvent({
                type: 'conversation.item.create',
                item: {
                    type: 'message',
                    role: 'assistant',
                    content: [
                        {
                            type: 'input_text',
                            text: text,
                        },
                    ],
                },
            });

            // Trigger the model to speak the response
            connection.sendEvent({
                type: 'response.create',
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
