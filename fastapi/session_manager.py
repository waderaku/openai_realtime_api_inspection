"""
WebSocket接続の管理とセッション状態を追跡
"""

import logging
import asyncio
from typing import Optional, Dict, Any
from datetime import datetime

logger = logging.getLogger(__name__)


class SessionManager:
    """WebSocketセッションを管理するクラス"""
    
    def __init__(self):
        self.sessions: Dict[str, SessionInfo] = {}
        self.lock = asyncio.Lock()
    
    async def create_session(self, session_id: str) -> "SessionInfo":
        """新しいセッションを作成"""
        async with self.lock:
            if session_id in self.sessions:
                logger.warning(f"セッション {session_id} は既に存在します")
                return self.sessions[session_id]
            
            session = SessionInfo(session_id)
            self.sessions[session_id] = session
            logger.info(f"セッション作成: {session_id}")
            return session
    
    async def get_session(self, session_id: str) -> Optional["SessionInfo"]:
        """セッション情報を取得"""
        async with self.lock:
            return self.sessions.get(session_id)
    
    async def remove_session(self, session_id: str):
        """セッションを削除"""
        async with self.lock:
            if session_id in self.sessions:
                del self.sessions[session_id]
                logger.info(f"セッション削除: {session_id}")
    
    async def get_active_sessions_count(self) -> int:
        """アクティブなセッション数を取得"""
        async with self.lock:
            return len(self.sessions)


class SessionInfo:
    """個別のセッション情報を保持するクラス"""
    
    def __init__(self, session_id: str):
        self.session_id = session_id
        self.created_at = datetime.now()
        self.last_activity = datetime.now()
        
        # 統計情報
        self.messages_sent = 0
        self.messages_received = 0
        self.audio_chunks_sent = 0
        self.audio_chunks_received = 0
        self.errors = 0
        
        # 状態
        self.is_connected = False
        self.is_speaking = False
        
        # メタデータ
        self.metadata: Dict[str, Any] = {}
    
    def update_activity(self):
        """最終アクティビティ時刻を更新"""
        self.last_activity = datetime.now()
    
    def increment_messages_sent(self):
        """送信メッセージ数をインクリメント"""
        self.messages_sent += 1
        self.update_activity()
    
    def increment_messages_received(self):
        """受信メッセージ数をインクリメント"""
        self.messages_received += 1
        self.update_activity()
    
    def increment_audio_sent(self):
        """送信音声チャンク数をインクリメント"""
        self.audio_chunks_sent += 1
        self.update_activity()
    
    def increment_audio_received(self):
        """受信音声チャンク数をインクリメント"""
        self.audio_chunks_received += 1
        self.update_activity()
    
    def increment_errors(self):
        """エラー数をインクリメント"""
        self.errors += 1
    
    def get_stats(self) -> Dict[str, Any]:
        """統計情報を取得"""
        return {
            "session_id": self.session_id,
            "created_at": self.created_at.isoformat(),
            "last_activity": self.last_activity.isoformat(),
            "duration_seconds": (datetime.now() - self.created_at).total_seconds(),
            "messages_sent": self.messages_sent,
            "messages_received": self.messages_received,
            "audio_chunks_sent": self.audio_chunks_sent,
            "audio_chunks_received": self.audio_chunks_received,
            "errors": self.errors,
            "is_connected": self.is_connected,
            "is_speaking": self.is_speaking,
        }
    
    def __repr__(self):
        return f"SessionInfo(id={self.session_id}, connected={self.is_connected})"


# グローバルなセッションマネージャー
session_manager = SessionManager()
