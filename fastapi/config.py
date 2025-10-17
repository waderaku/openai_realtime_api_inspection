"""
設定管理
"""

import os
from typing import Optional
from pydantic import BaseModel, Field


class OpenAIConfig(BaseModel):
    """OpenAI API設定"""
    api_key: str = Field(..., description="OpenAI APIキー")
    model: str = Field(
        default="gpt-4o-realtime-preview-2024-12-17",
        description="使用するモデル"
    )
    api_url: str = Field(
        default="wss://api.openai.com/v1/realtime",
        description="OpenAI Realtime API URL"
    )


class SessionConfig(BaseModel):
    """セッション設定"""
    modalities: list[str] = Field(
        default=["text", "audio"],
        description="モダリティ（テキスト、音声）"
    )
    instructions: str = Field(
        default="あなたは親切なアシスタントです。日本語で応答してください。",
        description="システムプロンプト"
    )
    voice: str = Field(
        default="alloy",
        description="音声の種類 (alloy, echo, fable, onyx, nova, shimmer)"
    )
    input_audio_format: str = Field(
        default="pcm16",
        description="入力音声フォーマット"
    )
    output_audio_format: str = Field(
        default="pcm16",
        description="出力音声フォーマット"
    )
    input_audio_transcription_model: str = Field(
        default="whisper-1",
        description="文字起こしモデル"
    )
    turn_detection_type: str = Field(
        default="server_vad",
        description="ターン検出タイプ"
    )
    turn_detection_threshold: float = Field(
        default=0.5,
        description="音声検出閾値"
    )
    turn_detection_prefix_padding_ms: int = Field(
        default=300,
        description="音声開始前のパディング（ミリ秒）"
    )
    turn_detection_silence_duration_ms: int = Field(
        default=500,
        description="無音と判定する時間（ミリ秒）"
    )
    temperature: float = Field(
        default=0.8,
        description="応答の温度（ランダム性）"
    )
    max_response_output_tokens: int = Field(
        default=4096,
        description="最大レスポンストークン数"
    )
    
    def to_openai_session_config(self) -> dict:
        """OpenAI API用のセッション設定に変換"""
        return {
            "modalities": self.modalities,
            "instructions": self.instructions,
            "voice": self.voice,
            "input_audio_format": self.input_audio_format,
            "output_audio_format": self.output_audio_format,
            "input_audio_transcription": {
                "model": self.input_audio_transcription_model
            },
            "turn_detection": {
                "type": self.turn_detection_type,
                "threshold": self.turn_detection_threshold,
                "prefix_padding_ms": self.turn_detection_prefix_padding_ms,
                "silence_duration_ms": self.turn_detection_silence_duration_ms
            },
            "temperature": self.temperature,
            "max_response_output_tokens": self.max_response_output_tokens
        }


class ServerConfig(BaseModel):
    """サーバー設定"""
    host: str = Field(default="0.0.0.0", description="ホスト")
    port: int = Field(default=8000, description="ポート")
    log_level: str = Field(default="INFO", description="ログレベル")
    cors_origins: list[str] = Field(
        default=["http://localhost:3000", "http://localhost:3001"],
        description="CORS許可オリジン"
    )
    max_connections: int = Field(
        default=100,
        description="最大同時接続数"
    )


class Config:
    """アプリケーション全体の設定"""
    
    def __init__(self):
        self.openai = OpenAIConfig(
            api_key=os.getenv("OPENAI_API_KEY", "")
        )
        self.session = SessionConfig()
        self.server = ServerConfig(
            log_level=os.getenv("LOG_LEVEL", "INFO")
        )
    
    def validate(self) -> bool:
        """設定を検証"""
        if not self.openai.api_key:
            return False
        return True


# グローバル設定インスタンス
config = Config()
