import { IsNotEmpty, IsOptional, IsString } from 'class-validator';
import { RealtimeEvent } from '../../../domain/events/realtime-event';

export class RealtimeEventDto implements RealtimeEvent {
    @IsString()
    @IsNotEmpty()
    type: string;

    @IsOptional()
    @IsString()
    timestamp?: string;

    // 任意の追加フィールドを許容する（バリデーションは最低限）
    [key: string]: any;
}

export class MonitorStartRequestDto {
    @IsString()
    @IsNotEmpty()
    call_id: string;

    @IsString()
    @IsNotEmpty()
    api_token: string;
}

export class MonitorStopRequestDto {
    @IsString()
    @IsNotEmpty()
    call_id: string;
}
