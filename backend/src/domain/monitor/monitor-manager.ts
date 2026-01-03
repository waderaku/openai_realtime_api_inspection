import { Injectable, Logger } from '@nestjs/common';
import { MonitorSession } from './monitor-session';

@Injectable()
export class MonitorSessionManager {
    private readonly logger = new Logger(MonitorSessionManager.name);
    private sessions = new Map<string, MonitorSession>();

    createSession(callId: string): MonitorSession {
        const existing = this.sessions.get(callId);
        if (existing) {
            this.logger.warn(`監視セッション ${callId} は既に存在します`);
            return existing;
        }
        const session = new MonitorSession(callId);
        this.sessions.set(callId, session);
        this.logger.log(`監視セッション作成: ${callId}`);
        return session;
    }

    getSession(callId: string) {
        return this.sessions.get(callId);
    }

    removeSession(callId: string) {
        const existed = this.sessions.delete(callId);
        if (existed) {
            this.logger.log(`監視セッション削除: ${callId}`);
        }
    }

    getAllSessions() {
        return Array.from(this.sessions.values());
    }

    getActiveSessionsCount() {
        return Array.from(this.sessions.values()).filter((s) => s.isMonitoring).length;
    }
}
