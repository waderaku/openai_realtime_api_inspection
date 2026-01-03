# FastAPI Monitoring Server for OpenAI Realtime API

このFastAPIサーバーは、Next.jsとOpenAI Realtime APIのWebRTC接続を監視するサーバーです。

## 📋 アーキテクチャ

### 新しいアーキテクチャ（v2.0）

```
┌─────────────────┐
│  Next.jsクライアント  │
│  (フロントエンド)   │
└────────┬────────┘
         │ WebRTC (直接接続)
         │
┌────────▼────────┐
│ OpenAI Realtime │
│      API        │
└────────┬────────┘
         │
         │ WebSocket (wss://api.openai.com/v1/realtime?call_id={call_id})
         │ ※監視専用接続
         │
┌────────▼────────┐
│  FastAPIサーバー   │
│  (監視サーバー)    │
│                 │
│  - イベント監視   │
│  - ログ記録      │
│  - 統計情報      │
└─────────────────┘
```

### 変更点

**旧アーキテクチャ（v1.0）:**
- FastAPIがクライアントとOpenAIの間のプロキシとして動作
- クライアント ↔ FastAPI ↔ OpenAI

**新アーキテクチャ（v2.0）:**
- Next.jsがWebRTCでOpenAIと直接通信
- FastAPIは監視専用サーバーとして動作
- Next.js → OpenAI (WebRTC)
- FastAPI → OpenAI (WebSocket、監視専用)

## ✨ 機能

- ✅ OpenAI Realtime APIのイベント監視
- ✅ call_idベースのセッション管理
- ✅ イベント履歴の記録と取得
- ✅ リアルタイム統計情報
- ✅ 監視の開始・停止制御
- ✅ CORS対応

## 🚀 セットアップ

### 1. 依存関係のインストール

```bash
cd fastapi

# 仮想環境を作成（必要に応じて）
python3 -m venv venv
source venv/bin/activate  # Linux/Mac
# または
venv\Scripts\activate  # Windows

# 依存関係をインストール
pip install -r requirements.txt
```

### 2. 環境変数の設定

`.env`ファイルを作成：

```env
OPENAI_API_KEY=sk-your-actual-openai-api-key-here
LOG_LEVEL=INFO
```

## 📖 使い方

### サーバーの起動

```bash
# 本番モード
python main.py

# 開発モード（自動リロード有効）
uvicorn main:app --reload --host 0.0.0.0 --port 8000
```

サーバーは `http://localhost:8000` で起動します。

### Next.js側の実装

Next.jsでWebRTC接続を確立した後、call_idをFastAPIに送信して監視を開始します：

```typescript
// WebRTC接続を確立
const pc = new RTCPeerConnection();
// ... WebRTC設定 ...

// データチャネルまたはWebSocketでcall_idを取得
const callId = "your-call-id-here";

// 監視を開始
const response = await fetch('http://localhost:8000/monitor/start', {
  method: 'POST',
  headers: { 'Content-Type': 'application/json' },
  body: JSON.stringify({ call_id: callId })
});

const result = await response.json();
console.log('監視開始:', result);
```

## 🔌 エンドポイント

### HTTP: `GET /`

ルートエンドポイント - サービス情報を返します

```bash
curl http://localhost:8000/
```

レスポンス:
```json
{
  "status": "ok",
  "service": "OpenAI Realtime Monitoring Server",
  "version": "2.0.0",
  "description": "Next.jsとOpenAIのWebRTC接続を監視するサーバー",
  "endpoints": {
    "start_monitoring": "POST /monitor/start",
    "stop_monitoring": "POST /monitor/stop",
    "get_events": "GET /monitor/events/{call_id}",
    "list_sessions": "GET /monitor/sessions",
    "health": "GET /health"
  }
}
```

### HTTP: `GET /health`

ヘルスチェックエンドポイント

```bash
curl http://localhost:8000/health
```

レスポンス:
```json
{
  "status": "healthy",
  "active_monitors": 2,
  "timestamp": "2025-10-25T10:30:00.000000"
}
```

### HTTP: `POST /monitor/start`

監視を開始

**リクエスト:**
```bash
curl -X POST http://localhost:8000/monitor/start \
  -H "Content-Type: application/json" \
  -d '{"call_id": "your-call-id"}'
```

**レスポンス:**
```json
{
  "status": "monitoring_started",
  "call_id": "your-call-id",
  "message": "イベント監視を開始しました",
  "timestamp": "2025-10-25T10:30:00.000000"
}
```

### HTTP: `POST /monitor/stop`

監視を停止

**リクエスト:**
```bash
curl -X POST http://localhost:8000/monitor/stop \
  -H "Content-Type: application/json" \
  -d '{"call_id": "your-call-id"}'
```

**レスポンス:**
```json
{
  "status": "monitoring_stopped",
  "call_id": "your-call-id",
  "message": "イベント監視を停止しました",
  "stats": {
    "call_id": "your-call-id",
    "created_at": "2025-10-25T10:30:00.000000",
    "last_activity": "2025-10-25T10:35:00.000000",
    "duration_seconds": 300,
    "is_monitoring": false,
    "total_events": 150,
    "event_counts": {
      "response.audio.delta": 100,
      "response.text.delta": 30,
      "session.updated": 1
    },
    "events_per_minute": 30
  },
  "timestamp": "2025-10-25T10:35:00.000000"
}
```

### HTTP: `GET /monitor/events/{call_id}`

特定のcall_idのイベント履歴を取得

```bash
curl http://localhost:8000/monitor/events/your-call-id?limit=50
```

**レスポンス:**
```json
{
  "call_id": "your-call-id",
  "events": [
    {
      "type": "session.created",
      "session": { "id": "sess_123", ... },
      "timestamp": "2025-10-25T10:30:00.000000"
    },
    {
      "type": "response.audio.delta",
      "delta": "base64_audio_data...",
      "timestamp": "2025-10-25T10:30:01.000000"
    }
  ],
  "total_events": 150,
  "stats": { ... },
  "timestamp": "2025-10-25T10:35:00.000000"
}
```

### HTTP: `GET /monitor/sessions`

すべての監視セッションを一覧表示

```bash
curl http://localhost:8000/monitor/sessions
```

**レスポンス:**
```json
{
  "sessions": [
    {
      "call_id": "call-1",
      "is_monitoring": true,
      "event_count": 150,
      "created_at": "2025-10-25T10:30:00.000000",
      "last_activity": "2025-10-25T10:35:00.000000"
    }
  ],
  "total_sessions": 1,
  "timestamp": "2025-10-25T10:35:00.000000"
}
```

### HTTP: `DELETE /monitor/session/{call_id}`

監視セッションを削除

```bash
curl -X DELETE http://localhost:8000/monitor/session/your-call-id
```

**レスポンス:**
```json
{
  "status": "session_deleted",
  "call_id": "your-call-id",
  "message": "監視セッションを削除しました",
  "timestamp": "2025-10-25T10:35:00.000000"
}
```

## 📁 ファイル構成

```
fastapi/
├── main.py                  # メインアプリケーション（監視サーバー）
├── event_handler.py         # イベント処理（監視専用）
├── session_manager.py       # セッション管理（call_idベース）
├── function_tools.py        # ファンクションツール（旧実装用）
├── audio_utils.py          # 音声処理（旧実装用）
├── config.py               # 設定管理（旧実装用）
├── requirements.txt        # Python依存関係
├── .env                    # 環境変数
├── README.md              # 旧READMEの名前変更版
├── README_NEW.md          # このファイル
├── MIGRATION_GUIDE.md     # 移行ガイド
├── main.py.backup         # 旧main.pyのバックアップ
└── test_*.py              # テストファイル
```

## 🛠️ 開発

### ログレベルの変更

`.env`ファイルで設定：

```env
LOG_LEVEL=DEBUG  # より詳細なログ
```

### カスタムイベントハンドラーの追加

`event_handler.py`でカスタムハンドラーを追加：

```python
def custom_handler(event: Dict[str, Any]) -> Dict[str, Any]:
    # カスタム処理
    logger.info(f"カスタムイベント: {event}")
    return event

handler = RealtimeEventHandler()
handler.register_handler("custom.event", custom_handler)
```

## 🐛 トラブルシューティング

### OPENAI_API_KEYエラー

**症状**: `OPENAI_API_KEYが設定されていません` エラー

**解決方法**:
1. `.env`ファイルが存在するか確認
2. APIキーが正しく設定されているか確認
3. APIキーが`sk-`で始まっているか確認

### call_id取得方法

Next.js側でWebRTC接続を確立する際に、OpenAIから提供されるcall_idを取得する必要があります。詳細はOpenAI Realtime APIのドキュメントを参照してください。

### 監視が開始されない

**症状**: 監視開始リクエストは成功するが、イベントが記録されない

**解決方法**:
1. call_idが正しいか確認
2. OpenAI APIのステータスを確認: https://status.openai.com/
3. サーバーログを確認（`LOG_LEVEL=DEBUG`に設定）

## 📚 参考資料

- [OpenAI Realtime API Documentation](https://platform.openai.com/docs/guides/realtime)
- [FastAPI Documentation](https://fastapi.tiangolo.com/)
- [WebRTC API](https://developer.mozilla.org/en-US/docs/Web/API/WebRTC_API)

## 📝 ライセンス

このプロジェクトはMITライセンスの下で公開されています。
