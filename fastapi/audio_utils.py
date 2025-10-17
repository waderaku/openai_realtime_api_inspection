"""
音声データ処理のユーティリティ関数
"""

import base64
import logging
from typing import Optional

logger = logging.getLogger(__name__)


def encode_audio_to_base64(audio_bytes: bytes) -> str:
    """
    音声バイトデータをbase64文字列にエンコード
    
    Args:
        audio_bytes: PCM16形式の音声バイトデータ
        
    Returns:
        base64エンコードされた文字列
    """
    try:
        return base64.b64encode(audio_bytes).decode('utf-8')
    except Exception as e:
        logger.error(f"音声エンコードエラー: {e}")
        raise


def decode_audio_from_base64(audio_base64: str) -> bytes:
    """
    base64文字列を音声バイトデータにデコード
    
    Args:
        audio_base64: base64エンコードされた音声文字列
        
    Returns:
        PCM16形式の音声バイトデータ
    """
    try:
        return base64.b64decode(audio_base64)
    except Exception as e:
        logger.error(f"音声デコードエラー: {e}")
        raise


def validate_audio_format(audio_bytes: bytes, expected_format: str = "pcm16") -> bool:
    """
    音声データのフォーマットを検証
    
    Args:
        audio_bytes: 音声バイトデータ
        expected_format: 期待される音声フォーマット
        
    Returns:
        フォーマットが正しいかどうか
    """
    if not audio_bytes:
        logger.warning("音声データが空です")
        return False
    
    # PCM16の場合、バイト数は2の倍数である必要がある
    if expected_format == "pcm16":
        if len(audio_bytes) % 2 != 0:
            logger.warning(f"PCM16フォーマットエラー: バイト数が2の倍数ではありません ({len(audio_bytes)})")
            return False
    
    return True


def chunk_audio_data(audio_bytes: bytes, chunk_size: int = 4096) -> list[bytes]:
    """
    音声データをチャンクに分割
    
    Args:
        audio_bytes: 音声バイトデータ
        chunk_size: チャンクサイズ（バイト）
        
    Returns:
        チャンクのリスト
    """
    chunks = []
    for i in range(0, len(audio_bytes), chunk_size):
        chunk = audio_bytes[i:i + chunk_size]
        chunks.append(chunk)
    
    logger.debug(f"音声データを{len(chunks)}チャンクに分割 (chunk_size={chunk_size})")
    return chunks


def calculate_audio_duration(audio_bytes: bytes, sample_rate: int = 24000, 
                            channels: int = 1, sample_width: int = 2) -> float:
    """
    音声データの長さ（秒）を計算
    
    Args:
        audio_bytes: 音声バイトデータ
        sample_rate: サンプリングレート（Hz）
        channels: チャンネル数
        sample_width: サンプル幅（バイト）
        
    Returns:
        音声の長さ（秒）
    """
    num_samples = len(audio_bytes) / (channels * sample_width)
    duration = num_samples / sample_rate
    return duration


class AudioBuffer:
    """音声バッファを管理するクラス"""
    
    def __init__(self, max_size: int = 1024 * 1024):  # デフォルト1MB
        self.buffer = bytearray()
        self.max_size = max_size
    
    def append(self, audio_bytes: bytes) -> bool:
        """
        音声データをバッファに追加
        
        Args:
            audio_bytes: 追加する音声バイトデータ
            
        Returns:
            追加が成功したかどうか
        """
        if len(self.buffer) + len(audio_bytes) > self.max_size:
            logger.warning(f"バッファオーバーフロー: {len(self.buffer) + len(audio_bytes)} > {self.max_size}")
            return False
        
        self.buffer.extend(audio_bytes)
        return True
    
    def get_and_clear(self) -> bytes:
        """
        バッファの内容を取得してクリア
        
        Returns:
            バッファの内容
        """
        data = bytes(self.buffer)
        self.buffer.clear()
        return data
    
    def clear(self):
        """バッファをクリア"""
        self.buffer.clear()
    
    def size(self) -> int:
        """バッファのサイズを取得"""
        return len(self.buffer)
    
    def is_empty(self) -> bool:
        """バッファが空かどうか"""
        return len(self.buffer) == 0
    
    def get_duration(self, sample_rate: int = 24000) -> float:
        """バッファ内の音声の長さ（秒）を取得"""
        return calculate_audio_duration(bytes(self.buffer), sample_rate)
