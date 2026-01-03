import { Injectable, Logger } from '@nestjs/common';
import { RealtimeEvent, RealtimeEventProcessor } from '../../domain/events/realtime-event';
import { MonitorSessionManager } from '../../domain/monitor/monitor-manager';
import { OpenAIRealtimeGateway } from '../../infrastructure/realtime/openai-realtime.gateway';

@Injectable()
export class MonitoringService {
    private readonly logger = new Logger(MonitoringService.name);

    constructor(
        private readonly manager: MonitorSessionManager,
        private readonly gateway: OpenAIRealtimeGateway,
        private readonly processor: RealtimeEventProcessor,
    ) { }

    async startMonitoring(callId: string, apiToken: string) {
        const existing = this.manager.getSession(callId);
        if (existing?.isMonitoring) {
            return { status: 'already_monitoring', call_id: callId };
        }

        const session = existing ?? this.manager.createSession(callId);
        session.isMonitoring = true;

        try {
            await this.gateway.startMonitoring(callId, apiToken, (rawEvent) => {
                const processed = this.processor.handle(rawEvent);
                session.addEvent(processed);
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

    async stopMonitoring(callId: string) {
        const session = this.manager.getSession(callId);
        if (!session) return null;

        await this.gateway.stop(callId);
        session.isMonitoring = false;
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
