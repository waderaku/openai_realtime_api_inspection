import { Injectable } from '@nestjs/common';

@Injectable()
export class AppService {
  getRoot() {
    return {
      status: 'ok',
      service: 'Nest Backend',
      version: '1.0.0',
      endpoints: {
        health: 'GET /health',
        monitorHealth: 'GET /monitor/health',
        monitorIngest: 'POST /monitor/events',
        monitorStart: 'POST /monitor/start',
        monitorStop: 'POST /monitor/stop',
        monitorEvents: 'GET /monitor/events/:callId?limit=100',
        monitorSessions: 'GET /monitor/sessions',
        monitorDeleteSession: 'DELETE /monitor/session/:callId',
      },
    };
  }
}
