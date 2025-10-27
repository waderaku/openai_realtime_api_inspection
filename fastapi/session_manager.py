"""
監視セッションの管理とイベント履歴の追跡
"""

import logging
import asyncio
from typing import Optional, Dict, Any, List
from datetime import datetime

logger = logging.getLogger(__name__)


class MonitorManager:
    """監視セッションを管理するクラス"""

    def __init__(self):
        self.sessions: Dict[str, "MonitorSession"] = {}
        self.lock = asyncio.Lock()

    async def create_session(self, call_id: str) -> "MonitorSession":
        """新しい監視セッションを作成"""
        async with self.lock:
            if call_id in self.sessions:
                logger.warning(f"監視セッション {call_id} は既に存在します")
                return self.sessions[call_id]

            session = MonitorSession(call_id)
            self.sessions[call_id] = session
            logger.info(f"監視セッション作成: {call_id}")
            return session

    async def get_session(self, call_id: str) -> Optional["MonitorSession"]:
        """監視セッション情報を取得"""
        async with self.lock:
            return self.sessions.get(call_id)

    async def remove_session(self, call_id: str):
        """監視セッションを削除"""
        async with self.lock:
            if call_id in self.sessions:
                del self.sessions[call_id]
                logger.info(f"監視セッション削除: {call_id}")

    async def get_active_sessions_count(self) -> int:
        """アクティブな監視セッション数を取得"""
        async with self.lock:
            return sum(1 for s in self.sessions.values() if s.is_monitoring)

    async def get_all_sessions(self) -> List["MonitorSession"]:
        """すべての監視セッションを取得"""
        async with self.lock:
            return list(self.sessions.values())


class MonitorSession:
    """個別の監視セッション情報を保持するクラス"""

    def __init__(self, call_id: str):
        self.call_id = call_id
        self.created_at = datetime.now()
        self.last_activity = datetime.now()

        # イベント履歴
        self.events: List[Dict[str, Any]] = []

        # 統計情報
        self.event_counts: Dict[str, int] = {}

        # 状態
        self.is_monitoring = False

        # モニターインスタンス（型ヒントをAnyに変更）
        self.monitor: Any = None

        # メタデータ
        self.metadata: Dict[str, Any] = {}

    def update_activity(self):
        """最終アクティビティ時刻を更新"""
        self.last_activity = datetime.now()

    def add_event(self, event: Dict[str, Any]):
        """イベントを記録"""
        self.events.append(event)
        self.update_activity()

        # イベントタイプごとのカウント
        event_type = event.get("type", "unknown")
        self.event_counts[event_type] = self.event_counts.get(event_type, 0) + 1

    def get_events(self, limit: int = 100) -> List[Dict[str, Any]]:
        """最新のイベントを取得"""
        return self.events[-limit:]

    def get_stats(self) -> Dict[str, Any]:
        """統計情報を取得"""
        duration = (datetime.now() - self.created_at).total_seconds()

        return {
            "call_id": self.call_id,
            "created_at": self.created_at.isoformat(),
            "last_activity": self.last_activity.isoformat(),
            "duration_seconds": duration,
            "is_monitoring": self.is_monitoring,
            "total_events": len(self.events),
            "event_counts": self.event_counts,
            "events_per_minute": (
                (len(self.events) / duration * 60) if duration > 0 else 0
            ),
        }

    def __repr__(self):
        return f"MonitorSession(call_id={self.call_id}, monitoring={self.is_monitoring}, events={len(self.events)})"


# グローバルな監視マネージャー
monitor_manager = MonitorManager()
