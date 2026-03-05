import { Injectable, Logger } from '@nestjs/common';
import { OpenAIRealtimeWebSocket, RealtimeAgent, RealtimeSession } from '@openai/agents/realtime';
import { RealtimeEvent } from '../../domain/events/realtime-event';
import { REALTIME_INSTRUCTIONS, askSupervisorTool } from '../../agents/realtime-config';

type EventCallback = (event: RealtimeEvent) => void;

@Injectable()
export class OpenAIRealtimeGateway {
    private readonly logger = new Logger(OpenAIRealtimeGateway.name);
    private sessions = new Map<string, RealtimeSession>();

    async startMonitoring(callId: string, apiToken: string, onEvent: EventCallback) {
        if (this.sessions.has(callId)) {
            this.logger.warn(`Session already exists for call_id=${callId}`);
            return;
        }

        const transport = new OpenAIRealtimeWebSocket();
        transport.on('connected', () => {
            this.logger.log(`Connected to OpenAI Realtime (call_id=${callId})`);
        });
        transport.on('disconnected', () => {
            this.logger.log(`Realtime connection closed (call_id=${callId})`);
            this.sessions.delete(callId);
        });
        transport.on('error', (err: unknown) => {
            this.logger.error(
                `Realtime connection error (call_id=${callId}): ${JSON.stringify(err)}`,
            );
        });

        const session = new RealtimeSession(
            new RealtimeAgent({
                name: 'SidebandMonitorAgent',
                voice: 'sage',
                instructions: REALTIME_INSTRUCTIONS,
                tools: [askSupervisorTool],
            }),
            {
                model: 'gpt-realtime',
                transport,
            },
        );

        session.on('transport_event', (event) => {
            try {
                onEvent({ ...event, call_id: callId });
            } catch (err) {
                this.logger.error(`Failed to forward event for ${callId}: ${err}`);
            }
        });
        session.on('error', (error) => {
            this.logger.error(
                `Realtime session error (call_id=${callId}): ${JSON.stringify(error)}`,
            );
        });

        try {
            // Attach as sideband to the in-progress call.
            await session.connect({
                apiKey: apiToken,
                model: 'gpt-realtime',
                callId,
            });
        } catch (e) {
            this.logger.error(`Failed to connect for ${callId}: ${e}`);
            return;
        }

        this.sessions.set(callId, session);
    }

    /**
     * Send an event to the Realtime API via the sideband connection.
     * Used to inject responses or control the conversation.
     */
    sendEvent(callId: string, event: any): boolean {
        const session = this.sessions.get(callId);
        if (!session) {
            this.logger.warn(`No session found for call_id=${callId}`);
            return false;
        }

        try {
            session.transport.sendEvent(event);
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
        const session = this.sessions.get(callId);
        if (!session) {
            this.logger.warn(`No session found for call_id=${callId}`);
            return false;
        }

        try {
            // Don't use conversation.item.create - it just adds text to history
            // but response.create ignores it and generates new content.

            // Instead, use response.create with instructions to speak specific text
            session.transport.sendEvent({
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
        const session = this.sessions.get(callId);
        if (!session) return undefined;

        const transport = session.transport;
        return transport instanceof OpenAIRealtimeWebSocket ? transport : undefined;
    }

    async stop(callId: string) {
        const session = this.sessions.get(callId);
        if (!session) return;
        this.sessions.delete(callId);
        try {
            session.close();
        } catch (err) {
            this.logger.error(`Error closing connection for ${callId}: ${err}`);
        }
    }
}
