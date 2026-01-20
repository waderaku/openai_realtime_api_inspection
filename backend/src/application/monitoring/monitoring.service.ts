import { Injectable, Logger } from '@nestjs/common';
import { RealtimeEvent, RealtimeEventProcessor } from '../../domain/events/realtime-event';
import { MonitorSessionManager } from '../../domain/monitor/monitor-manager';
import { OpenAIRealtimeGateway } from '../../infrastructure/realtime/openai-realtime.gateway';
import { SupervisorService } from '../supervisor/supervisor.service';

// Track pending tool calls per call
interface PendingToolCall {
    callId: string;
    functionName: string;
    arguments: string;
    userContext?: string;
}

@Injectable()
export class MonitoringService {
    private readonly logger = new Logger(MonitoringService.name);
    // Track pending tool calls per call_id
    private pendingToolCalls = new Map<string, PendingToolCall>();
    // Track recent user transcript for context
    private recentUserTranscript = new Map<string, string>();

    constructor(
        private readonly manager: MonitorSessionManager,
        private readonly gateway: OpenAIRealtimeGateway,
        private readonly processor: RealtimeEventProcessor,
        private readonly supervisor: SupervisorService,
    ) { }

    async startMonitoring(callId: string, apiToken: string) {
        const existing = this.manager.getSession(callId);
        if (existing?.isMonitoring) {
            return { status: 'already_monitoring', call_id: callId };
        }

        const session = existing ?? this.manager.createSession(callId);
        session.isMonitoring = true;

        try {
            await this.gateway.startMonitoring(callId, apiToken, async (rawEvent) => {
                const processed = this.processor.handle(rawEvent);
                session.addEvent(processed);

                // Track user transcription for context
                if (rawEvent.type === 'conversation.item.input_audio_transcription.completed') {
                    const transcript = rawEvent.transcript;
                    if (transcript) {
                        this.logger.log(`[Monitor] User said: ${transcript}`);
                        this.recentUserTranscript.set(callId, transcript);
                    }
                }

                // Detect Tool Call from Realtime API
                // When needsApproval is true on frontend, tool execution is paused
                // We detect the tool call, process with Responses API, and inject via sideband
                if (rawEvent.type === 'conversation.item.done') {
                    const item = rawEvent.item;

                    // Check if this is a function_call item
                    if (item?.type === 'function_call' && item?.name && item?.arguments) {
                        const functionName = item.name;
                        const functionArgs = item.arguments || '{}';
                        const toolCallId = item.call_id;

                        this.logger.log(`[Sideband] Tool call detected: ${functionName}(${functionArgs})`);

                        // Store the pending tool call
                        this.pendingToolCalls.set(callId, {
                            callId: toolCallId,
                            functionName,
                            arguments: functionArgs,
                            userContext: this.recentUserTranscript.get(callId),
                        });

                        // Process the tool call with Responses API and inject result via sideband
                        this.processToolCallAndInjectResponse(callId);
                    }
                }
            });
        } catch (err) {
            session.isMonitoring = false;
            if (!existing) {
                this.manager.removeSession(callId);
            }
            throw err;
        }

        this.logger.log(`Started monitoring call_id=${callId}`);
        return {
            status: 'monitoring_started',
            call_id: callId,
            timestamp: new Date().toISOString(),
        };
    }

    /**
     * Process a tool call using Responses API and inject the response via sideband.
     * 
     * Flow:
     * 1. Frontend has needsApproval: true, so tool execution is paused
     * 2. Backend detects the tool call via sideband
     * 3. Backend uses Responses API to execute tool and generate response
     * 4. Backend injects the response via sideband
     * 5. Frontend never approves the tool (response already provided via sideband)
     */
    private async processToolCallAndInjectResponse(callId: string) {
        const pendingCall = this.pendingToolCalls.get(callId);
        if (!pendingCall) {
            this.logger.warn(`[Sideband] No pending tool call found for call_id=${callId}`);
            return;
        }

        try {
            this.logger.log(`[Sideband] Processing: ${pendingCall.functionName}(${pendingCall.arguments})`);

            // Get conversation history for context
            const session = this.manager.getSession(callId);
            const history = session?.events
                .filter(e => e.type === 'conversation.item.input_audio_transcription.completed' ||
                    e.type === 'response.output_audio_transcript.done')
                .slice(-10)
                .map(e => e.transcript || '')
                .join('\n');

            // Process the tool call using Responses API
            const finalResponse = await this.supervisor.processToolCallFromRealtimeApi(
                pendingCall.functionName,
                pendingCall.arguments,
                pendingCall.userContext,
                history,
            );

            this.logger.log(`[Sideband] Responses API generated: ${finalResponse.substring(0, 100)}...`);

            // Inject the final response via sideband
            const success = this.gateway.injectResponse(callId, finalResponse);

            if (success) {
                this.logger.log(`[Sideband] Response injected successfully for call_id=${callId}`);
            } else {
                this.logger.error(`[Sideband] Failed to inject response for call_id=${callId}`);
            }

            // Clean up
            this.pendingToolCalls.delete(callId);
        } catch (error) {
            this.logger.error(`[Sideband] Error processing tool call: ${error}`);
            this.pendingToolCalls.delete(callId);
        }
    }

    async stopMonitoring(callId: string) {
        const session = this.manager.getSession(callId);
        if (!session) return null;

        await this.gateway.stop(callId);
        session.isMonitoring = false;

        // Clean up state
        this.pendingToolCalls.delete(callId);
        this.recentUserTranscript.delete(callId);

        return session;
    }

    processEvent(event: RealtimeEvent): RealtimeEvent {
        // 手動投入イベントもログ・集計に載せる
        const processed = this.processor.handle(event);
        const callId = (event as any).call_id as string | undefined;
        if (callId) {
            const session = this.manager.getSession(callId) ?? this.manager.createSession(callId);
            session.addEvent(processed);
        }
        return processed;
    }

    getEvents(callId: string, limit = 100) {
        const session = this.manager.getSession(callId);
        if (!session) return null;
        return {
            call_id: callId,
            events: session.getEvents(limit),
            total: session.events.length,
            stats: session.getStats(),
        };
    }

    listSessions() {
        return this.manager.getAllSessions().map((s) => ({
            call_id: s.callId,
            is_monitoring: s.isMonitoring,
            event_count: s.events.length,
            created_at: s.createdAt.toISOString(),
            last_activity: s.lastActivity.toISOString(),
        }));
    }

    deleteSession(callId: string) {
        const session = this.manager.getSession(callId);
        if (!session) return false;
        this.manager.removeSession(callId);
        return true;
    }

    getSession(callId: string) {
        return this.manager.getSession(callId);
    }

    getActiveCount() {
        return this.manager.getActiveSessionsCount();
    }
}
