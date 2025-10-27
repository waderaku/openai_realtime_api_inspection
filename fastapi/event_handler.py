"""
OpenAI Realtime APIのイベントハンドラー（監視専用）
"""

import json
import logging
from typing import Callable, Dict, Any
from datetime import datetime

logger = logging.getLogger(__name__)


class RealtimeEventHandler:
    """OpenAI Realtime APIイベントを監視・記録するクラス"""

    def __init__(self):
        self.handlers: Dict[str, Callable] = {}
        self._setup_default_handlers()

    def _setup_default_handlers(self):
        """デフォルトのイベントハンドラーをセットアップ"""
        self.handlers = {
            "session.created": self._handle_session_created,
            "session.updated": self._handle_session_updated,
            "error": self._handle_error,
            "input_audio_buffer.committed": self._handle_audio_buffer_committed,
            "input_audio_buffer.speech_started": self._handle_speech_started,
            "input_audio_buffer.speech_stopped": self._handle_speech_stopped,
            "conversation.item.created": self._handle_item_created,
            "response.created": self._handle_response_created,
            "response.done": self._handle_response_done,
            "response.audio.delta": self._handle_audio_delta,
            "response.audio.done": self._handle_audio_done,
            "response.audio_transcript.delta": self._handle_transcript_delta,
            "response.audio_transcript.done": self._handle_transcript_done,
            "response.text.delta": self._handle_text_delta,
            "response.text.done": self._handle_text_done,
        }

    def handle_event(self, event: Dict[str, Any]) -> Dict[str, Any]:
        """
        イベントを処理し、タイムスタンプを追加して返す

        Args:
            event: OpenAI APIからのイベント

        Returns:
            処理済みイベント（タイムスタンプ付き）
        """
        event_type = event.get("type", "unknown")

        # タイムスタンプを追加
        if "timestamp" not in event:
            event["timestamp"] = datetime.now().isoformat()

        # 全てのイベントをログに記録（サンプル実装に準拠）
        logger.info(f"Received from WebSocket: {json.dumps(event, ensure_ascii=False)}")

        # 個別ハンドラーも実行（詳細ログ用）
        handler = self.handlers.get(event_type, self._handle_unknown)
        try:
            return handler(event)
        except Exception as e:
            logger.error(f"イベント処理エラー ({event_type}): {e}")
            return event

    def _handle_session_created(self, event: Dict[str, Any]) -> Dict[str, Any]:
        """セッション作成イベント"""
        session_id = event.get("session", {}).get("id", "unknown")
        logger.info(f"[監視] セッション作成: {session_id}")
        return event

    def _handle_session_updated(self, event: Dict[str, Any]) -> Dict[str, Any]:
        """セッション更新イベント"""
        logger.info("[監視] セッション更新完了")
        return event

    def _handle_error(self, event: Dict[str, Any]) -> Dict[str, Any]:
        """エラーイベント"""
        error = event.get("error", {})
        error_type = error.get("type", "unknown")
        error_message = error.get("message", "no message")
        logger.error(f"[監視] OpenAIエラー: {error_type} - {error_message}")
        return event

    def _handle_audio_buffer_committed(self, event: Dict[str, Any]) -> Dict[str, Any]:
        """音声バッファコミットイベント"""
        logger.debug("[監視] 音声バッファコミット完了")
        return event

    def _handle_speech_started(self, event: Dict[str, Any]) -> Dict[str, Any]:
        """音声入力開始イベント"""
        item_id = event.get("item_id", "unknown")
        logger.info(f"[監視] ユーザー発話開始: {item_id}")
        return event

    def _handle_speech_stopped(self, event: Dict[str, Any]) -> Dict[str, Any]:
        """音声入力停止イベント"""
        item_id = event.get("item_id", "unknown")
        logger.info(f"[監視] ユーザー発話停止: {item_id}")
        return event

    def _handle_item_created(self, event: Dict[str, Any]) -> Dict[str, Any]:
        """会話アイテム作成イベント"""
        item = event.get("item", {})
        item_type = item.get("type", "unknown")
        item_id = item.get("id", "unknown")
        logger.debug(f"[監視] アイテム作成: {item_type} ({item_id})")
        return event

    def _handle_response_created(self, event: Dict[str, Any]) -> Dict[str, Any]:
        """レスポンス作成イベント"""
        response = event.get("response", {})
        response_id = response.get("id", "unknown")
        logger.info(f"[監視] レスポンス作成: {response_id}")
        return event

    def _handle_response_done(self, event: Dict[str, Any]) -> Dict[str, Any]:
        """レスポンス完了イベント"""
        response = event.get("response", {})
        response_id = response.get("id", "unknown")
        status = response.get("status", "unknown")
        logger.info(f"[監視] レスポンス完了: {response_id} (status: {status})")
        return event

    def _handle_audio_delta(self, event: Dict[str, Any]) -> Dict[str, Any]:
        """音声データデルタイベント"""
        delta = event.get("delta", "")
        logger.debug(f"[監視] 音声デルタ受信: {len(delta)} chars")
        return event

    def _handle_audio_done(self, event: Dict[str, Any]) -> Dict[str, Any]:
        """音声データ完了イベント"""
        logger.debug("[監視] 音声出力完了")
        return event

    def _handle_transcript_delta(self, event: Dict[str, Any]) -> Dict[str, Any]:
        """文字起こしデルタイベント"""
        delta = event.get("delta", "")
        logger.debug(f"[監視] 文字起こしデルタ: {delta}")
        return event

    def _handle_transcript_done(self, event: Dict[str, Any]) -> Dict[str, Any]:
        """文字起こし完了イベント"""
        transcript = event.get("transcript", "")
        logger.info(f"[監視] 文字起こし完了: {transcript}")
        return event

    def _handle_text_delta(self, event: Dict[str, Any]) -> Dict[str, Any]:
        """テキストデルタイベント"""
        delta = event.get("delta", "")
        logger.debug(f"[監視] テキストデルタ: {delta}")
        return event

    def _handle_text_done(self, event: Dict[str, Any]) -> Dict[str, Any]:
        """テキスト完了イベント"""
        text = event.get("text", "")
        logger.info(f"[監視] テキスト完了: {text}")
        return event

    def _handle_unknown(self, event: Dict[str, Any]) -> Dict[str, Any]:
        """不明なイベント"""
        event_type = event.get("type", "unknown")
        logger.warning(f"[監視] 不明なイベントタイプ: {event_type}")
        return event

    def register_handler(self, event_type: str, handler: Callable):
        """カスタムハンドラーを登録"""
        self.handlers[event_type] = handler
        logger.info(f"[監視] カスタムハンドラー登録: {event_type}")
