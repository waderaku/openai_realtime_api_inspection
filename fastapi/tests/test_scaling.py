"""
スケーリング検証用スクリプト

使用方法:
1. WebSocket接続を確立したままにする
2. 別ターミナルでECSタスクをスケールする
3. 接続が維持されているか確認

検証コマンド:
# 接続維持テスト開始
python test_scaling.py ws://openai-realtime-alb-1392163497.ap-northeast-1.elb.amazonaws.com/ws

# 別ターミナルでスケールアウト
aws ecs update-service --cluster openai-realtime-cluster --service fastapi-service --desired-count 2

# スケールイン（既存接続への影響を確認）
aws ecs update-service --cluster openai-realtime-cluster --service fastapi-service --desired-count 1
"""

import asyncio
import websockets
import json
import sys
import time
from datetime import datetime


async def monitor_connection(ws_url: str):
    """WebSocket接続を維持し、状態を監視"""
    reconnect_count = 0
    message_count = 0
    start_time = time.time()

    while True:
        try:
            print(f"\n[{datetime.now()}] WebSocket接続を開始...")

            async with websockets.connect(ws_url) as ws:
                print(f"[{datetime.now()}] ✅ 接続成功!")
                connected_time = time.time()

                # 接続維持ループ
                while True:
                    try:
                        # 30秒ごとにping的なメッセージを送信
                        await asyncio.sleep(30)

                        elapsed = time.time() - connected_time
                        total_elapsed = time.time() - start_time

                        # 接続状態を表示
                        print(
                            f"[{datetime.now()}] 📊 接続維持中: {elapsed:.0f}秒 (総経過: {total_elapsed:.0f}秒, 再接続: {reconnect_count}回)"
                        )

                        # テスト用メッセージ送信（session.updateを送信）
                        test_message = {
                            "type": "session.update",
                            "session": {
                                "modalities": ["text", "audio"],
                                "instructions": "テスト接続維持確認",
                            },
                        }
                        await ws.send(json.dumps(test_message))
                        message_count += 1

                        # サーバーからの応答を待つ（タイムアウト付き）
                        try:
                            response = await asyncio.wait_for(ws.recv(), timeout=5.0)
                            data = json.loads(response)
                            print(
                                f"[{datetime.now()}] 📩 応答受信: {data.get('type', 'unknown')}"
                            )
                        except asyncio.TimeoutError:
                            print(f"[{datetime.now()}] ⏰ 応答タイムアウト（正常）")

                    except websockets.ConnectionClosed as e:
                        print(
                            f"[{datetime.now()}] ❌ 接続が閉じられました: {e.code} - {e.reason}"
                        )
                        break

        except Exception as e:
            print(f"[{datetime.now()}] ❌ 接続エラー: {e}")

        reconnect_count += 1
        print(f"[{datetime.now()}] 🔄 5秒後に再接続... (再接続回数: {reconnect_count})")
        await asyncio.sleep(5)


async def main():
    if len(sys.argv) < 2:
        print("使用方法: python test_scaling.py <websocket_url>")
        print(
            "例: python test_scaling.py ws://openai-realtime-alb-xxx.ap-northeast-1.elb.amazonaws.com/ws"
        )
        sys.exit(1)

    ws_url = sys.argv[1]
    print(f"WebSocket URL: {ws_url}")
    print("=" * 60)
    print("接続監視を開始します。Ctrl+Cで終了。")
    print("別ターミナルでECSタスクをスケールして影響を確認してください。")
    print("=" * 60)

    await monitor_connection(ws_url)


if __name__ == "__main__":
    asyncio.run(main())
