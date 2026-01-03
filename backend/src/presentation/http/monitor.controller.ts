import { Body, Controller, Delete, Get, HttpException, HttpStatus, Param, Post, Query } from '@nestjs/common';
import { MonitoringService } from '../../application/monitoring/monitoring.service';
import { MonitorStartRequestDto, MonitorStopRequestDto, RealtimeEventDto } from './dto/monitor.dto';

@Controller('monitor')
export class MonitorController {
  constructor(private readonly monitoringService: MonitoringService) { }

  @Get('health')
  health() {
    return { status: 'ok', component: 'monitoring', active_monitors: this.monitoringService.getActiveCount() };
  }

  @Post('events')
  ingest(@Body() body: RealtimeEventDto) {
    return this.monitoringService.processEvent(body);
  }

  @Post('start')
  async start(@Body() body: MonitorStartRequestDto) {
    const { call_id, api_token } = body;
    if (!call_id || !api_token) {
      throw new HttpException('call_id and api_token are required', HttpStatus.BAD_REQUEST);
    }
    return this.monitoringService.startMonitoring(call_id, api_token);
  }

  @Post('stop')
  async stop(@Body() body: MonitorStopRequestDto) {
    const { call_id } = body;
    const session = await this.monitoringService.stopMonitoring(call_id);
    if (!session) {
      throw new HttpException('Session not found', HttpStatus.NOT_FOUND);
    }
    return { status: 'monitoring_stopped', call_id, stats: session.getStats() };
  }

  @Get('events/:callId')
  getEvents(@Param('callId') callId: string, @Query('limit') limit = '100') {
    const res = this.monitoringService.getEvents(callId, Number(limit) || 100);
    if (!res) {
      throw new HttpException('Session not found', HttpStatus.NOT_FOUND);
    }
    return res;
  }

  @Get('sessions')
  listSessions() {
    const sessions = this.monitoringService.listSessions();
    return { sessions, total_sessions: sessions.length };
  }

  @Delete('session/:callId')
  deleteSession(@Param('callId') callId: string) {
    const ok = this.monitoringService.deleteSession(callId);
    if (!ok) {
      throw new HttpException('Session not found', HttpStatus.NOT_FOUND);
    }
    return { status: 'session_deleted', call_id: callId };
  }
}