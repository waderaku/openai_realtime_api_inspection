import { Injectable, Logger } from '@nestjs/common';
import {
    RealtimeEvent,
    RealtimeEventProcessor,
} from '../../domain/events/realtime-event';
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
                    const transcript = typeof rawEvent.transcript === 'string'
                        ? rawEvent.transcript.trim()
                        : '';
                    if (transcript) {
                        this.logger.log(`[Monitor] User said: ${transcript}`);
                        this.recentUserTranscript.set(callId, transcript);
                    }
                }

                if (rawEvent.type === 'conversation.item.created') {
                    const userText = this.extractUserText(rawEvent);
                    if (userText) {
                        this.logger.log(`[Monitor] User text: ${userText}`);
                        this.recentUserTranscript.set(callId, userText);
                    }
                }

                // Detect Tool Call from Realtime API
                // We're looking for "askSupervisor" tool call specifically
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

                        // Process the tool call with Triage Agent and inject result via sideband
                        this.processToolCallWithTriageAgent(callId);
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
     * ツールコールをトリアージエージェントで処理し、結果をサイドバンドで注入
     * 
     * Flow:
     * 1. askSupervisorツールコールを検出
     * 2. リクエスト内容を抽出
     * 3. トリアージエージェントに渡す
     * 4. トリアージエージェントが適切なツールを使って処理
     * 5. 最終回答をサイドバンドで注入
     */
    private async processToolCallWithTriageAgent(callId: string) {
        const pendingCall = this.pendingToolCalls.get(callId);
        if (!pendingCall) {
            this.logger.warn(`[Sideband] No pending tool call found for call_id=${callId}`);
            return;
        }

        try {
            this.logger.log(`[Sideband] Processing with Triage Agent: ${pendingCall.functionName}(${pendingCall.arguments})`);

            // askSupervisorツールの引数からリクエストを抽出
            let userRequest: string;
            try {
                const args = JSON.parse(pendingCall.arguments);
                userRequest = args.request || pendingCall.userContext || 'Please help me with my request.';
            } catch {
                userRequest = pendingCall.userContext || 'Please help me with my request.';
            }

            // 会話履歴を取得
            const session = this.manager.getSession(callId);
            const history = session?.events
                .filter(e => e.type === 'conversation.item.input_audio_transcription.completed' ||
                    e.type === 'response.output_audio_transcript.done')
                .slice(-10)
                .map(e => e.transcript || '')
                .filter(t => t.length > 0)
                .join('\n');

            this.logger.log(`[Sideband] User request: ${userRequest}`);
            this.logger.log(`[Sideband] Conversation history: ${history?.substring(0, 100)}...`);

            // トリアージエージェントで処理
            const finalResponse = await this.supervisor.processWithTriageAgent(
                userRequest,
                history,
            );

            this.logger.log(`[Sideband] Triage Agent response: ${finalResponse.substring(0, 100)}...`);

            // サイドバンドで回答を注入
            const success = this.gateway.injectResponse(callId, finalResponse);

            if (success) {
                this.logger.log(`[Sideband] Response injected successfully for call_id=${callId}`);
            } else {
                this.logger.error(`[Sideband] Failed to inject response for call_id=${callId}`);
            }

            // クリーンアップ
            this.pendingToolCalls.delete(callId);
        } catch (error) {
            this.logger.error(`[Sideband] Error processing with Triage Agent: ${error}`);
            this.pendingToolCalls.delete(callId);

            // エラー時もユーザーに回答を返す
            try {
                this.gateway.injectResponse(callId, 'I apologize, but I encountered an error while processing your request. Please try again.');
            } catch (injectError) {
                this.logger.error(`[Sideband] Failed to inject error response: ${injectError}`);
            }
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

    private extractUserText(event: RealtimeEvent): string | null {
        if (event.item?.type !== 'message' || event.item?.role !== 'user') {
            return null;
        }

        const content = Array.isArray(event.item?.content)
            ? (event.item.content as Array<{ type?: string; text?: string }>)
            : [];
        const text = content
            .filter((entry) => entry.type === 'input_text')
            .map((entry) =>
                typeof entry.text === 'string' ? entry.text.trim() : '',
            )
            .filter((entry) => entry.length > 0)
            .join('\n');

        return text.length > 0 ? text : null;
    }
}
