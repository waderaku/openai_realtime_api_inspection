import { Module } from '@nestjs/common';
import { MonitorController } from './presentation/http/monitor.controller';
import { MonitoringService } from './application/monitoring/monitoring.service';
import { RealtimeEventProcessor } from './domain/events/realtime-event';
import { OpenAIRealtimeGateway } from './infrastructure/realtime/openai-realtime.gateway';
import { MonitorSessionManager } from './domain/monitor/monitor-manager';
import { SupervisorService } from './application/supervisor/supervisor.service';

@Module({
    controllers: [MonitorController],
    providers: [
        MonitoringService,
        RealtimeEventProcessor,
        MonitorSessionManager,
        OpenAIRealtimeGateway,
        SupervisorService,
    ],
    exports: [MonitoringService],
})
export class MonitorModule { }
