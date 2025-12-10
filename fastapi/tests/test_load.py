"""
リソース監視・負荷テスト用スクリプト

複数のWebSocket接続を同時に確立し、
サーバーのリソース消費を確認する

使用方法:
python test_load.py ws://your-alb.amazonaws.com/ws --connections 5 --duration 300
"""

import asyncio
import websockets
import json
import sys
import argparse
import time
from datetime import datetime
from dataclasses import dataclass
from typing import List


@dataclass
class ConnectionStats:
    connection_id: int
    connected: bool = False
    messages_sent: int = 0
    messages_received: int = 0
    errors: int = 0
    reconnects: int = 0


class LoadTester:
    def __init__(self, ws_url: str, num_connections: int, duration: int):
        self.ws_url = ws_url
        self.num_connections = num_connections
        self.duration = duration
        self.stats: List[ConnectionStats] = []
        self.running = True

    async def single_connection(self, conn_id: int):
        """単一のWebSocket接続を管理"""
        stats = ConnectionStats(connection_id=conn_id)
        self.stats.append(stats)

        while self.running:
            try:
                async with websockets.connect(self.ws_url) as ws:
                    stats.connected = True
                    print(f"[接続{conn_id}] ✅ 接続成功")

                    while self.running:
                        try:
                            # 10秒ごとにメッセージ送信
                            await asyncio.sleep(10)

                            test_message = {
                                "type": "session.update",
                                "session": {
                                    "instructions": f"負荷テスト接続 {conn_id}"
                                },
                            }
                            await ws.send(json.dumps(test_message))
                            stats.messages_sent += 1

                            # 応答を待つ
                            try:
                                response = await asyncio.wait_for(
                                    ws.recv(), timeout=5.0
                                )
                                stats.messages_received += 1
                            except asyncio.TimeoutError:
                                pass

                        except websockets.ConnectionClosed:
                            stats.connected = False
                            stats.reconnects += 1
                            print(f"[接続{conn_id}] ❌ 切断、再接続...")
                            break

            except Exception as e:
                stats.errors += 1
                stats.connected = False
                print(f"[接続{conn_id}] エラー: {e}")
                await asyncio.sleep(5)

    async def print_stats(self):
        """定期的に統計を表示"""
        start_time = time.time()

        while self.running:
            await asyncio.sleep(10)

            elapsed = time.time() - start_time
            connected = sum(1 for s in self.stats if s.connected)
            total_sent = sum(s.messages_sent for s in self.stats)
            total_received = sum(s.messages_received for s in self.stats)
            total_errors = sum(s.errors for s in self.stats)
            total_reconnects = sum(s.reconnects for s in self.stats)

            print(f"\n{'='*60}")
            print(f"[{datetime.now()}] 経過時間: {elapsed:.0f}秒")
            print(f"接続数: {connected}/{len(self.stats)}")
            print(f"送信メッセージ: {total_sent}, 受信: {total_received}")
            print(f"エラー: {total_errors}, 再接続: {total_reconnects}")
            print(f"{'='*60}\n")

            if elapsed >= self.duration:
                print("テスト終了時間に達しました")
                self.running = False

    async def run(self):
        """負荷テストを実行"""
        print(f"負荷テスト開始: {self.num_connections}接続, {self.duration}秒間")
        print(f"URL: {self.ws_url}")
        print("=" * 60)

        # 接続タスクを作成
        tasks = [self.single_connection(i) for i in range(self.num_connections)]
        tasks.append(self.print_stats())

        try:
            await asyncio.gather(*tasks)
        except asyncio.CancelledError:
            pass

        # 最終結果
        print("\n" + "=" * 60)
        print("最終結果:")
        print("=" * 60)
        for s in self.stats:
            status = "✅" if s.connected else "❌"
            print(
                f"接続{s.connection_id}: {status} 送信:{s.messages_sent} 受信:{s.messages_received} エラー:{s.errors} 再接続:{s.reconnects}"
            )


async def main():
    parser = argparse.ArgumentParser(description="WebSocket負荷テスト")
    parser.add_argument("ws_url", help="WebSocket URL")
    parser.add_argument("--connections", "-c", type=int, default=5, help="同時接続数")
    parser.add_argument(
        "--duration", "-d", type=int, default=300, help="テスト時間（秒）"
    )

    args = parser.parse_args()

    tester = LoadTester(args.ws_url, args.connections, args.duration)
    await tester.run()


if __name__ == "__main__":
    asyncio.run(main())
