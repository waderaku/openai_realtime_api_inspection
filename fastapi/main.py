# coding: utf-8
"""FastAPI monitoring server for OpenAI Realtime API"""

import os
import json
import asyncio
import logging
from typing import Optional
from datetime import datetime
from fastapi import FastAPI, HTTPException, BackgroundTasks
from fastapi.middleware.cors import CORSMiddleware
from pydantic import BaseModel
from dotenv import load_dotenv
import websockets

from event_handler import RealtimeEventHandler
from session_manager import monitor_manager

load_dotenv()
logging.basicConfig(
    level=logging.INFO, format="%(asctime)s - %(levelname)s - %(message)s"
)
logger = logging.getLogger(__name__)

app = FastAPI(title="OpenAI Realtime Monitoring Server")
app.add_middleware(
    CORSMiddleware,
    allow_origins=["*"],
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)


class MonitorStartRequest(BaseModel):
    call_id: str
    api_token: str


class MonitorStopRequest(BaseModel):
    call_id: str


class OpenAIRealtimeMonitor:
    def __init__(self, api_key: str, call_id: str):
        self.api_key = api_key
        self.call_id = call_id
        self.openai_ws = None
        self.is_connected = False
        self.is_monitoring = True
        self.event_handler = RealtimeEventHandler()

    async def connect(self):
        # Connect to a WebSocket for the in-progress call
        url = f"wss://api.openai.com/v1/realtime?call_id={self.call_id}"
        headers = {"Authorization": f"Bearer {self.api_key}"}

        logger.info(f"Connecting to: {url}")

        try:
            self.openai_ws = await websockets.connect(url, extra_headers=headers)
            self.is_connected = True
            logger.info(f"Connected to server. (call_id: {self.call_id})")

            # Send session.update event over the WebSocket once connected
            session_update = {
                "type": "session.update",
                "session": {
                    "type": "realtime",
                    "instructions": "Monitor this call session",
                },
            }
            await self.openai_ws.send(json.dumps(session_update))
            logger.info(f"Sent session.update event (call_id: {self.call_id})")

        except websockets.exceptions.InvalidStatusCode as e:
            logger.error(f"HTTP Status Error (call_id: {self.call_id})")
            logger.error(f"  Status Code: {e.status_code}")
            logger.error(f"  Response Headers: {dict(e.headers)}")
            raise
        except Exception as e:
            logger.error(f"Connection error (call_id: {self.call_id})")
            logger.error(f"  Error Type: {type(e).__name__}")
            logger.error(f"  Error: {str(e)}")
            raise

    async def monitor_events(self):
        """イベントを監視し続ける（サンプル実装に準拠）"""
        if not self.openai_ws or not self.is_connected:
            logger.error("WebSocket not connected")
            return

        logger.info(f"Starting event monitoring for call_id: {self.call_id}")

        try:
            while self.is_monitoring and self.is_connected:
                try:
                    # WebSocketからメッセージを受信（タイムアウトなし）
                    message = await self.openai_ws.recv()

                    if isinstance(message, str):
                        event = json.loads(message)

                        # イベントハンドラーで処理（ログに記録）
                        processed_event = self.event_handler.handle_event(event)

                        # 監視セッションに記録
                        monitor_session = await monitor_manager.get_session(
                            self.call_id
                        )
                        if monitor_session:
                            monitor_session.add_event(processed_event)

                except websockets.exceptions.ConnectionClosed:
                    logger.info(
                        f"WebSocket connection closed (call_id: {self.call_id})"
                    )
                    break
                except Exception as e:
                    logger.error(
                        f"Error receiving message (call_id: {self.call_id}): {e}"
                    )
                    # エラーが発生しても継続
                    await asyncio.sleep(1)

        except Exception as e:
            logger.error(f"Fatal monitoring error (call_id: {self.call_id}): {e}")
        finally:
            await self.close()
            logger.info(f"Event monitoring stopped for call_id: {self.call_id}")

    async def close(self):
        self.is_monitoring = False
        if self.openai_ws:
            await self.openai_ws.close()
            self.is_connected = False
            logger.info(f"Closed connection (call_id: {self.call_id})")


@app.get("/")
async def root():
    return {
        "status": "ok",
        "service": "OpenAI Realtime Monitoring Server",
        "version": "2.0.0",
        "endpoints": {
            "start": "POST /monitor/start",
            "stop": "POST /monitor/stop",
            "events": "GET /monitor/events/{call_id}",
            "sessions": "GET /monitor/sessions",
            "health": "GET /health",
        },
    }


@app.get("/health")
async def health():
    count = await monitor_manager.get_active_sessions_count()
    return {
        "status": "healthy",
        "active_monitors": count,
        "timestamp": datetime.now().isoformat(),
    }


@app.post("/monitor/start")
async def start_monitoring(
    request: MonitorStartRequest, background_tasks: BackgroundTasks
):
    call_id = request.call_id
    api_token = request.api_token

    existing = await monitor_manager.get_session(call_id)
    if existing and existing.is_monitoring:
        return {"status": "already_monitoring", "call_id": call_id}

    if not api_token:
        raise HTTPException(status_code=400, detail="api_token is required")

    try:
        session = await monitor_manager.create_session(call_id)
        monitor = OpenAIRealtimeMonitor(api_token, call_id)
        await monitor.connect()
        session.monitor = monitor
        session.is_monitoring = True
        background_tasks.add_task(monitor.monitor_events)
        logger.info(f"Started monitoring (call_id: {call_id})")
        return {
            "status": "monitoring_started",
            "call_id": call_id,
            "timestamp": datetime.now().isoformat(),
        }
    except Exception as e:
        await monitor_manager.remove_session(call_id)
        raise HTTPException(status_code=500, detail=str(e))


@app.post("/monitor/stop")
async def stop_monitoring(request: MonitorStopRequest):
    session = await monitor_manager.get_session(request.call_id)
    if not session:
        raise HTTPException(status_code=404, detail="Session not found")
    if session.monitor:
        await session.monitor.close()
    session.is_monitoring = False
    return {
        "status": "stopped",
        "call_id": request.call_id,
        "stats": session.get_stats(),
    }


@app.get("/monitor/events/{call_id}")
async def get_events(call_id: str, limit: int = 100):
    session = await monitor_manager.get_session(call_id)
    if not session:
        raise HTTPException(status_code=404, detail="Session not found")
    return {
        "call_id": call_id,
        "events": session.get_events(limit),
        "total": len(session.events),
        "stats": session.get_stats(),
    }


@app.get("/monitor/sessions")
async def list_sessions():
    sessions = await monitor_manager.get_all_sessions()
    return {
        "sessions": [
            {
                "call_id": s.call_id,
                "is_monitoring": s.is_monitoring,
                "event_count": len(s.events),
            }
            for s in sessions
        ]
    }


@app.delete("/monitor/session/{call_id}")
async def delete_session(call_id: str):
    session = await monitor_manager.get_session(call_id)
    if not session:
        raise HTTPException(status_code=404, detail="Session not found")
    if session.is_monitoring and session.monitor:
        await session.monitor.close()
    await monitor_manager.remove_session(call_id)
    return {"status": "deleted", "call_id": call_id}


if __name__ == "__main__":
    import uvicorn

    uvicorn.run(app, host="0.0.0.0", port=8000)
