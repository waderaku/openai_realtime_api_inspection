import { RealtimeEvent } from '../events/realtime-event';

export class MonitorSession {
    readonly callId: string;
    readonly createdAt: Date;
    lastActivity: Date;
    events: RealtimeEvent[] = [];
    eventCounts: Record<string, number> = {};
    isMonitoring = false;

    constructor(callId: string) {
        this.callId = callId;
        this.createdAt = new Date();
        this.lastActivity = new Date();
    }

    addEvent(event: RealtimeEvent) {
        this.events.push(event);
        this.lastActivity = new Date();
        const type = event.type ?? 'unknown';
        this.eventCounts[type] = (this.eventCounts[type] ?? 0) + 1;
    }

    getEvents(limit = 100) {
        return this.events.slice(-limit);
    }

    getStats() {
        const durationSeconds = (Date.now() - this.createdAt.getTime()) / 1000;
        return {
            call_id: this.callId,
            created_at: this.createdAt.toISOString(),
            last_activity: this.lastActivity.toISOString(),
            duration_seconds: durationSeconds,
            is_monitoring: this.isMonitoring,
            total_events: this.events.length,
            event_counts: this.eventCounts,
            events_per_minute: durationSeconds > 0 ? (this.events.length / durationSeconds) * 60 : 0,
        };
    }
}
