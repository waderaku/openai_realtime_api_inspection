import { Logger } from '@nestjs/common';

export type RealtimeEventHandler = (event: RealtimeEvent) => RealtimeEvent;

export interface RealtimeEvent {
    type: string;
    timestamp?: string;
    [key: string]: any;
}

/**
 * 単一イベントの処理（タイムスタンプ付与とログ、type別ハンドラ実行）を担う。
 * 状態を持たないため、どのセッションからでも共有可能。
 */
export class RealtimeEventProcessor {
    private readonly logger = new Logger(RealtimeEventProcessor.name);
    private handlers: Record<string, RealtimeEventHandler> = {};

    constructor() {
        this.registerDefaultHandlers();
    }

    handle(event: RealtimeEvent): RealtimeEvent {
        const enriched: RealtimeEvent = {
            ...event,
            timestamp: event.timestamp ?? new Date().toISOString(),
        };

        // Log without large audio data to prevent performance issues
        const logSafe = this.createLogSafeEvent(enriched);
        this.logger.log(`Received from WebSocket: ${JSON.stringify(logSafe)}`);

        const handler = this.handlers[enriched.type] ?? this.handleUnknown;
        try {
            return handler(enriched);
        } catch (err) {
            this.logger.error(`イベント処理エラー (${enriched.type}): ${err}`);
            return enriched;
        }
    }

    registerHandler(eventType: string, handler: RealtimeEventHandler) {
        this.handlers[eventType] = handler;
        this.logger.log(`[監視] カスタムハンドラー登録: ${eventType}`);
    }

    private registerDefaultHandlers() {
        this.handlers = {
            'session.created': this.handleSessionCreated,
            'session.updated': this.handleSessionUpdated,
            error: this.handleError,
            'input_audio_buffer.committed': this.handleAudioBufferCommitted,
            'input_audio_buffer.speech_started': this.handleSpeechStarted,
            'input_audio_buffer.speech_stopped': this.handleSpeechStopped,
            'conversation.item.created': this.handleItemCreated,
            'response.created': this.handleResponseCreated,
            'response.done': this.handleResponseDone,
            'response.audio.delta': this.handleAudioDelta,
            'response.audio.done': this.handleAudioDone,
            'response.audio_transcript.delta': this.handleTranscriptDelta,
            'response.audio_transcript.done': this.handleTranscriptDone,
            'response.text.delta': this.handleTextDelta,
            'response.text.done': this.handleTextDone,
            'guardrail_tripped': this.handleGuardrailTripped,
        };
    }

    private handleSessionCreated = (event: RealtimeEvent): RealtimeEvent => {
        const sessionId = event.session?.id ?? 'unknown';
        this.logger.log(`[監視] セッション作成: ${sessionId}`);
        return event;
    };

    private handleSessionUpdated = (event: RealtimeEvent): RealtimeEvent => {
        this.logger.log('[監視] セッション更新完了');
        return event;
    };

    private handleError = (event: RealtimeEvent): RealtimeEvent => {
        const error = event.error ?? {};
        const errorType = error.type ?? 'unknown';
        const errorMessage = error.message ?? 'no message';
        this.logger.error(`[監視] OpenAIエラー: ${errorType} - ${errorMessage}`);
        return event;
    };

    private handleAudioBufferCommitted = (event: RealtimeEvent): RealtimeEvent => {
        this.logger.debug('[監視] 音声バッファコミット完了');
        return event;
    };

    private handleSpeechStarted = (event: RealtimeEvent): RealtimeEvent => {
        const itemId = event.item_id ?? 'unknown';
        this.logger.log(`[監視] ユーザー発話開始: ${itemId}`);
        return event;
    };

    private handleSpeechStopped = (event: RealtimeEvent): RealtimeEvent => {
        const itemId = event.item_id ?? 'unknown';
        this.logger.log(`[監視] ユーザー発話停止: ${itemId}`);
        return event;
    };

    private handleItemCreated = (event: RealtimeEvent): RealtimeEvent => {
        const item = event.item ?? {};
        const itemType = item.type ?? 'unknown';
        const itemId = item.id ?? 'unknown';
        this.logger.debug(`[監視] アイテム作成: ${itemType} (${itemId})`);
        return event;
    };

    private handleResponseCreated = (event: RealtimeEvent): RealtimeEvent => {
        const response = event.response ?? {};
        const responseId = response.id ?? 'unknown';
        this.logger.log(`[監視] レスポンス作成: ${responseId}`);
        return event;
    };

    private handleResponseDone = (event: RealtimeEvent): RealtimeEvent => {
        const response = event.response ?? {};
        const responseId = response.id ?? 'unknown';
        const status = response.status ?? 'unknown';
        this.logger.log(`[監視] レスポンス完了: ${responseId} (status: ${status})`);
        return event;
    };

    private handleAudioDelta = (event: RealtimeEvent): RealtimeEvent => {
        const delta = event.delta ?? '';
        const length = typeof delta === 'string' ? delta.length : JSON.stringify(delta).length;
        this.logger.debug(`[監視] 音声デルタ受信: ${length} chars`);
        return event;
    };

    private handleAudioDone = (event: RealtimeEvent): RealtimeEvent => {
        this.logger.debug('[監視] 音声出力完了');
        return event;
    };

    private handleTranscriptDelta = (event: RealtimeEvent): RealtimeEvent => {
        const delta = event.delta ?? '';
        this.logger.debug(`[監視] 文字起こしデルタ: ${delta}`);
        return event;
    };

    private handleTranscriptDone = (event: RealtimeEvent): RealtimeEvent => {
        const transcript = event.transcript ?? '';
        this.logger.log(`[監視] 文字起こし完了: ${transcript}`);
        return event;
    };

    private handleTextDelta = (event: RealtimeEvent): RealtimeEvent => {
        const delta = event.delta ?? '';
        this.logger.debug(`[監視] テキストデルタ: ${delta}`);
        return event;
    };

    private handleTextDone = (event: RealtimeEvent): RealtimeEvent => {
        const text = event.text ?? '';
        this.logger.log(`[監視] テキスト完了: ${text}`);
        return event;
    };

    private handleGuardrailTripped = (event: RealtimeEvent): RealtimeEvent => {
        const category = event.output_info?.moderationCategory ?? 'unknown';
        const rationale = event.output_info?.moderationRationale ?? '';
        this.logger.warn(
            `[監視] Guardrail発火: ${category}${rationale ? ` - ${rationale}` : ''}`,
        );
        return event;
    };

    private handleUnknown = (event: RealtimeEvent): RealtimeEvent => {
        const eventType = event.type ?? 'unknown';
        this.logger.warn(`[監視] 不明なイベントタイプ: ${eventType}`);
        return event;
    };

    /**
     * Create a log-safe version of the event by truncating large audio data
     */
    private createLogSafeEvent(event: RealtimeEvent): any {
        const safe = { ...event };

        // Truncate audio data in content arrays
        if (safe.item?.content && Array.isArray(safe.item.content)) {
            safe.item = {
                ...safe.item,
                content: safe.item.content.map((c: any) => {
                    if (c.type === 'input_audio' && c.transcript !== undefined) {
                        return {
                            type: c.type,
                            transcript: c.transcript,
                            audio: '[AUDIO_DATA_TRUNCATED]'
                        };
                    }
                    return c;
                })
            };
        }

        // Truncate direct audio/delta fields
        if (safe.audio && typeof safe.audio === 'string' && safe.audio.length > 100) {
            safe.audio = `[AUDIO_DATA_TRUNCATED: ${safe.audio.length} chars]`;
        }
        if (safe.delta && typeof safe.delta === 'string' && safe.delta.length > 100) {
            safe.delta = `[DELTA_TRUNCATED: ${safe.delta.length} chars]`;
        }

        return safe;
    }
}
