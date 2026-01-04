import { Injectable, Logger } from '@nestjs/common';
import { RealtimeEvent, RealtimeEventProcessor } from '../../domain/events/realtime-event';
import { MonitorSessionManager } from '../../domain/monitor/monitor-manager';
import { OpenAIRealtimeGateway } from '../../infrastructure/realtime/openai-realtime.gateway';
import { SupervisorService } from '../supervisor/supervisor.service';

// Phrases that indicate the agent is waiting for backend response
const WAITING_PHRASES = [
    '少々お待ちください',
    '確認いたします',
    'お調べいたします',
    '少しお待ちください',
    'かしこまりました',
    'just a second',
    'let me check',
    'one moment',
    'let me look',
    'give me a moment',
];

@Injectable()
export class MonitoringService {
    private readonly logger = new Logger(MonitoringService.name);
    // Track pending questions per call to avoid duplicate processing
    private pendingQuestions = new Map<string, string>();
    // Track if we're waiting for the agent's acknowledgment
    private waitingForAck = new Map<string, boolean>();

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

                // Handle user transcription completed - store the question
                if (rawEvent.type === 'conversation.item.input_audio_transcription.completed') {
                    const transcript = rawEvent.transcript;
                    if (transcript && this.isUserQuestion(transcript)) {
                        this.logger.log(`[Supervisor] User question detected: ${transcript}`);
                        this.pendingQuestions.set(callId, transcript);
                        this.waitingForAck.set(callId, true);
                    }
                }

                // Handle agent response done - check if it's a waiting phrase
                if (rawEvent.type === 'response.output_audio_transcript.done' ||
                    rawEvent.type === 'response.audio_transcript.done') {
                    const transcript = rawEvent.transcript?.toLowerCase() || '';

                    if (this.waitingForAck.get(callId) && this.isWaitingPhrase(transcript)) {
                        const userQuestion = this.pendingQuestions.get(callId);
                        if (userQuestion) {
                            this.logger.log(`[Supervisor] Agent acknowledged, generating response for: ${userQuestion}`);
                            this.pendingQuestions.delete(callId);
                            this.waitingForAck.set(callId, false);

                            // Generate and inject response asynchronously
                            this.generateAndInjectResponse(callId, userQuestion);
                        }
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

    private isUserQuestion(transcript: string): boolean {
        // Simple heuristics to detect if this is a question/request
        const text = transcript.toLowerCase();

        // Skip simple greetings
        const greetings = ['hi', 'hello', 'hey', 'こんにちは', 'おはよう'];
        if (greetings.some(g => text === g || text === `${g}!` || text === `${g}.`)) {
            return false;
        }

        // Skip thank you / goodbye
        const farewells = ['thank', 'thanks', 'bye', 'goodbye', 'ありがとう', 'さようなら'];
        if (farewells.some(f => text.includes(f))) {
            return false;
        }

        // Consider it a question if it's more than a few words
        return transcript.length > 10;
    }

    private isWaitingPhrase(transcript: string): boolean {
        return WAITING_PHRASES.some(phrase => transcript.includes(phrase.toLowerCase()));
    }

    private async generateAndInjectResponse(callId: string, userQuestion: string) {
        try {
            // Get conversation history from session
            const session = this.manager.getSession(callId);
            const history = session?.events
                .filter(e => e.type === 'conversation.item.input_audio_transcription.completed' ||
                    e.type === 'response.output_audio_transcript.done')
                .slice(-10) // Last 10 messages for context
                .map(e => e.transcript || '')
                .join('\n');

            // Generate response using Supervisor
            const response = await this.supervisor.generateResponse(callId, userQuestion, history);

            // Inject the response into the conversation
            const success = this.gateway.injectResponse(callId, response);
            if (success) {
                this.logger.log(`[Supervisor] Response injected for call_id=${callId}`);
            } else {
                this.logger.error(`[Supervisor] Failed to inject response for call_id=${callId}`);
            }
        } catch (error) {
            this.logger.error(`[Supervisor] Error generating/injecting response: ${error}`);
        }
    }

    async stopMonitoring(callId: string) {
        const session = this.manager.getSession(callId);
        if (!session) return null;

        await this.gateway.stop(callId);
        session.isMonitoring = false;

        // Clean up state
        this.pendingQuestions.delete(callId);
        this.waitingForAck.delete(callId);

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
