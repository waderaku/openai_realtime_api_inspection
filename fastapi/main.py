"""
FastAPI WebSocket server for OpenAI Realtime API
このサーバーはクライアントとOpenAI Realtime APIの間のプロキシとして機能します
"""

import os
import json
import asyncio
import logging
import base64
import uuid
from typing import Optional
from fastapi import FastAPI, WebSocket, WebSocketDisconnect
from fastapi.middleware.cors import CORSMiddleware
from dotenv import load_dotenv
import websockets
from websockets.client import WebSocketClientProtocol

from event_handler import RealtimeEventHandler
from session_manager import session_manager
from function_tools import get_tool_definitions, execute_function_call

load_dotenv()

logging.basicConfig(
    level=logging.INFO, format="%(asctime)s - %(name)s - %(levelname)s - %(message)s"
)
logger = logging.getLogger(__name__)

app = FastAPI(title="OpenAI Realtime WebSocket Proxy")

app.add_middleware(
    CORSMiddleware,
    allow_origins=["*"],
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)


class OpenAIRealtimeConnection:
    """OpenAI Realtime APIへのWebSocket接続を管理するクラス"""

    def __init__(self, api_key: str, model: str = "gpt-realtime"):
        self.api_key = api_key
        self.model = model
        self.openai_ws: Optional[WebSocketClientProtocol] = None
        self.is_connected = False
        self.event_handler = RealtimeEventHandler()

    async def connect(self):
        """OpenAI Realtime APIに接続"""
        url = f"wss://api.openai.com/v1/realtime?model={self.model}"
        headers = {
            "Authorization": f"Bearer {self.api_key}",
            "OpenAI-Beta": "realtime=v1",
        }

        try:
            self.openai_ws = await websockets.connect(url, extra_headers=headers)
            self.is_connected = True
            logger.info("OpenAI Realtime APIに接続しました")

            await self.send_session_update()

        except Exception as e:
            logger.error(f"OpenAI接続エラー: {e}")
            raise

    async def send_session_update(self, config: Optional[dict] = None):
        """セッション設定を更新"""
        default_config = {
            "modalities": ["text", "audio"],
            "instructions": "あなたは親切なアシスタントです。日本語で応答してください。",
            "voice": "alloy",
            "input_audio_format": "pcm16",
            "output_audio_format": "pcm16",
            "input_audio_transcription": {"model": "whisper-1"},
            "turn_detection": {
                "type": "server_vad",
                "threshold": 0.5,
                "prefix_padding_ms": 300,
                "silence_duration_ms": 500,
            },
            "temperature": 0.8,
            "max_response_output_tokens": 4096,
            "tools": get_tool_definitions(),
        }

        if config:
            default_config.update(config)

        session_update = {"type": "session.update", "session": default_config}

        await self.send(session_update)
        logger.info("セッション設定を送信しました")

    async def send(self, message: dict):
        """OpenAI APIにメッセージを送信"""
        if self.openai_ws and self.is_connected:
            await self.openai_ws.send(json.dumps(message))

    async def receive(self):
        """OpenAI APIからメッセージを受信"""
        if self.openai_ws and self.is_connected:
            message = await self.openai_ws.recv()
            if isinstance(message, str):
                event = json.loads(message)
                return self.event_handler.handle_event(event)
            return message
        return None

    async def close(self):
        """接続を閉じる"""
        if self.openai_ws:
            await self.openai_ws.close()
            self.is_connected = False
            logger.info("OpenAI接続を閉じました")


@app.get("/health")
async def health():
    active_sessions = await session_manager.get_active_sessions_count()
    return {"status": "healthy", "active_sessions": active_sessions}


@app.get("/stats")
async def stats():
    """統計情報エンドポイント"""
    active_sessions = await session_manager.get_active_sessions_count()
    return {
        "active_sessions": active_sessions,
        "total_sessions": len(session_manager.sessions),
    }


async def handle_function_call(
    message: dict, openai_conn: OpenAIRealtimeConnection, session_id: str
):
    """
    Function Callイベントを処理
    関数を実行し、結果をOpenAI APIに返す
    """
    try:
        call_id = message.get("call_id")
        function_name = message.get("name")
        arguments_str = message.get("arguments", "{}")

        logger.info(f"Function Call: {function_name} (session: {session_id})")

        try:
            arguments = json.loads(arguments_str)
        except json.JSONDecodeError:
            logger.error(f"Invalid function arguments: {arguments_str}")
            arguments = {}

        result = await execute_function_call(function_name, arguments)

        logger.info(f"Function Result: {function_name} -> {result}")

        response_message = {
            "type": "conversation.item.create",
            "item": {
                "type": "function_call_output",
                "call_id": call_id,
                "output": json.dumps(result, ensure_ascii=False),
            },
        }
        await openai_conn.send(response_message)

        create_response = {"type": "response.create"}
        await openai_conn.send(create_response)
        logger.info(f"Function Call後のレスポンス生成をリクエストしました")

    except Exception as e:
        logger.error(f"Function call error: {e}")
        # エラー時もOpenAI APIに通知
        error_message = {
            "type": "conversation.item.create",
            "item": {
                "type": "function_call_output",
                "call_id": message.get("call_id"),
                "output": json.dumps({"error": str(e)}, ensure_ascii=False),
            },
        }
        await openai_conn.send(error_message)


@app.websocket("/ws")
async def websocket_endpoint(websocket: WebSocket):
    """
    クライアントとの間のWebSocket接続を処理
    クライアントからの音声データをOpenAI APIに転送し、
    OpenAI APIからのレスポンスをクライアントに転送する
    """
    session_id = str(uuid.uuid4())
    session_info = await session_manager.create_session(session_id)

    await websocket.accept()
    session_info.is_connected = True
    logger.info(f"クライアントが接続しました (session: {session_id})")

    api_key = os.getenv("OPENAI_API_KEY")
    if not api_key:
        logger.error("OPENAI_API_KEYが設定されていません")
        await websocket.send_json({"type": "error", "message": "サーバー設定エラー"})
        await websocket.close()
        await session_manager.remove_session(session_id)
        return

    openai_conn = OpenAIRealtimeConnection(api_key)

    try:
        await openai_conn.connect()

        await websocket.send_json(
            {
                "type": "connection.established",
                "session_id": session_id,
                "message": "OpenAI Realtime APIに接続しました",
            }
        )
        session_info.increment_messages_sent()

        async def forward_client_to_openai():
            """クライアント → OpenAI APIへの転送"""
            try:
                while openai_conn.is_connected:
                    # クライアントからメッセージを受信
                    data = await websocket.receive()

                    if "text" in data:
                        # JSONメッセージ
                        message = json.loads(data["text"])
                        event_type = message.get("type", "unknown")
                        logger.debug(f"クライアントから受信: {event_type}")

                        # 特殊なイベント処理
                        if event_type == "input_audio_buffer.speech_started":
                            session_info.is_speaking = True
                        elif event_type == "input_audio_buffer.speech_stopped":
                            session_info.is_speaking = False

                        # 音声データが含まれているか確認
                        if (
                            event_type == "input_audio_buffer.append"
                            and "audio" in message
                        ):
                            # 音声データがある場合はカウント
                            session_info.increment_audio_sent()
                            logger.debug(
                                f"音声データ転送: {len(message['audio'])} chars (base64)"
                            )

                        await openai_conn.send(message)
                        session_info.increment_messages_received()

                    elif "bytes" in data:
                        # バイナリデータ（音声）
                        audio_data = data["bytes"]
                        logger.debug(f"音声データ受信: {len(audio_data)} bytes")

                        # 音声データをbase64エンコードしてOpenAI APIに送信
                        audio_base64 = base64.b64encode(audio_data).decode("utf-8")
                        audio_message = {
                            "type": "input_audio_buffer.append",
                            "audio": audio_base64,
                        }
                        await openai_conn.send(audio_message)
                        session_info.increment_audio_sent()

            except WebSocketDisconnect:
                logger.info(f"クライアントが切断しました (session: {session_id})")
            except RuntimeError as e:
                if "disconnect" in str(e).lower():
                    logger.info(
                        f"クライアント接続が閉じられました (session: {session_id})"
                    )
                else:
                    logger.error(f"クライアント→OpenAI転送エラー: {e}")
                    session_info.increment_errors()
            except Exception as e:
                logger.error(f"クライアント→OpenAI転送エラー: {e}")
                session_info.increment_errors()

        async def forward_openai_to_client():
            """OpenAI API → クライアントへの転送"""
            try:
                while openai_conn.is_connected:
                    # OpenAI APIからメッセージを受信
                    message = await openai_conn.receive()

                    if message:
                        event_type = message.get("type", "unknown")
                        logger.debug(f"OpenAIから受信: {event_type}")

                        # 音声データの統計
                        if event_type == "response.audio.delta":
                            session_info.increment_audio_received()

                        # Function Callイベントの処理
                        if event_type == "response.function_call_arguments.done":
                            # まずクライアントにイベントを転送（UI表示用）
                            try:
                                await websocket.send_json(message)
                                session_info.increment_messages_sent()
                            except RuntimeError:
                                pass
                            # その後、サーバー側でFunction Callを実行
                            await handle_function_call(message, openai_conn, session_id)
                            continue

                        # クライアントに転送
                        try:
                            await websocket.send_json(message)
                            session_info.increment_messages_sent()
                        except RuntimeError:
                            # クライアントが切断済み
                            logger.info(
                                f"クライアントが切断済みのためメッセージ送信をスキップ (session: {session_id})"
                            )
                            break

            except Exception as e:
                if "disconnect" not in str(e).lower():
                    logger.error(f"OpenAI→クライアント転送エラー: {e}")
                    session_info.increment_errors()

        # 両方向の転送を並行実行
        await asyncio.gather(
            forward_client_to_openai(),
            forward_openai_to_client(),
            return_exceptions=True,
        )

    except Exception as e:
        logger.error(f"WebSocketエラー: {e}")
        try:
            await websocket.send_json({"type": "error", "message": str(e)})
        except:
            pass

    finally:
        # クリーンアップ
        session_info.is_connected = False
        await openai_conn.close()

        # セッション統計をログ出力
        stats = session_info.get_stats()
        logger.info(f"セッション終了: {stats}")

        try:
            await websocket.close()
        except:
            pass

        # セッションを削除
        await session_manager.remove_session(session_id)
        logger.info(f"接続を閉じました (session: {session_id})")


if __name__ == "__main__":
    import uvicorn

    uvicorn.run(app, host="0.0.0.0", port=8000)
