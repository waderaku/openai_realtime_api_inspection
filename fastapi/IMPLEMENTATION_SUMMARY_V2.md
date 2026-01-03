# 実装サマリー: OpenAI Realtime API 監視サーバー（v2.0）

## 📅 実装日時
2025年10月25日

## 🎯 実装目的

Next.jsがWebRTCでOpenAI Realtime APIと直接通信するアーキテクチャに変更し、FastAPIは監視サーバーとして機能させる。

## 🏗️ アーキテクチャ変更

### 変更前（v1.0）
```
クライアント (Next.js)
    ↕ WebSocket
FastAPI (プロキシサーバー)
    ↕ WebSocket
OpenAI Realtime API
```

### 変更後（v2.0）
```
クライアント (Next.js)
    ↕ WebRTC (直接接続)
OpenAI Realtime API
    ↓ WebSocket (監視専用)
    wss://api.openai.com/v1/realtime?call_id={call_id}
FastAPI (監視サーバー)
```

## 📝 実装内容

### 1. main.py（監視サーバー実装）

#### クラス
- **OpenAIRealtimeMonitor**: OpenAI Realtime APIのイベントを監視
  - `connect()`: call_idを使用してOpenAIに接続
  - `monitor_events()`: イベントを受信・記録
  - `close()`: 接続を閉じる

#### エンドポイント

| メソッド | パス | 説明 |
|---------|------|------|
| GET | `/` | サービス情報 |
| GET | `/health` | ヘルスチェック |
| POST | `/monitor/start` | 監視開始 |
| POST | `/monitor/stop` | 監視停止 |
| GET | `/monitor/events/{call_id}` | イベント履歴取得 |
| GET | `/monitor/sessions` | セッション一覧 |
| DELETE | `/monitor/session/{call_id}` | セッション削除 |

#### 主要機能
- call_idベースの監視セッション管理
- バックグラウンドタスクでイベント監視
- イベント履歴の記録と取得
- リアルタイム統計情報

### 2. session_manager.py（監視セッション管理）

#### クラス
- **MonitorManager**: 監視セッションの管理
  - `create_session(call_id)`: 新しい監視セッション作成
  - `get_session(call_id)`: セッション取得
  - `remove_session(call_id)`: セッション削除
  - `get_active_sessions_count()`: アクティブセッション数取得
  - `get_all_sessions()`: すべてのセッション取得

- **MonitorSession**: 個別のセッション情報
  - `call_id`: OpenAIのcall_id
  - `events`: イベント履歴（List）
  - `event_counts`: イベントタイプ別カウント（Dict）
  - `is_monitoring`: 監視状態
  - `monitor`: Monitorインスタンスへの参照
  - `add_event(event)`: イベント追加
  - `get_events(limit)`: イベント取得
  - `get_stats()`: 統計情報取得

### 3. event_handler.py（イベント監視）

#### 変更点
- すべてのログに`[監視]`プレフィックスを追加
- イベントにタイムスタンプを自動付与
- 詳細なログ記録（item_id、response_id等を含む）

#### 監視対象イベント
- セッション関連: `session.created`, `session.updated`
- エラー: `error`
- 音声バッファ: `input_audio_buffer.committed`
- 発話検出: `input_audio_buffer.speech_started`, `input_audio_buffer.speech_stopped`
- アイテム作成: `conversation.item.created`
- レスポンス: `response.created`, `response.done`
- 音声データ: `response.audio.delta`, `response.audio.done`
- 文字起こし: `response.audio_transcript.delta`, `response.audio_transcript.done`
- テキスト: `response.text.delta`, `response.text.done`

## 📦 ファイル構成

```
fastapi/
├── main.py                  # ✅ 新規実装（監視サーバー）
├── session_manager.py       # ✅ 新規実装（MonitorManager）
├── event_handler.py         # ✅ 更新（監視専用）
├── main.py.backup          # ✅ 旧実装のバックアップ
├── README_NEW.md           # ✅ 新しいREADME
├── MIGRATION_GUIDE.md      # ✅ 移行ガイド
├── IMPLEMENTATION_SUMMARY.md # このファイル
├── requirements.txt        # 変更なし
├── .env                    # 変更なし
├── function_tools.py       # 旧実装用（削除可能）
├── audio_utils.py          # 旧実装用（削除可能）
└── config.py               # 旧実装用（削除可能）
```

## 🔌 API仕様

### POST /monitor/start

**リクエスト:**
```json
{
  "call_id": "string"
}
```

**レスポンス:**
```json
{
  "status": "monitoring_started",
  "call_id": "string",
  "message": "イベント監視を開始しました",
  "timestamp": "ISO8601"
}
```

### POST /monitor/stop

**リクエスト:**
```json
{
  "call_id": "string"
}
```

**レスポンス:**
```json
{
  "status": "monitoring_stopped",
  "call_id": "string",
  "message": "イベント監視を停止しました",
  "stats": {
    "call_id": "string",
    "created_at": "ISO8601",
    "last_activity": "ISO8601",
    "duration_seconds": 0,
    "is_monitoring": false,
    "total_events": 0,
    "event_counts": {},
    "events_per_minute": 0
  },
  "timestamp": "ISO8601"
}
```

### GET /monitor/events/{call_id}

**クエリパラメータ:**
- `limit`: 取得するイベント数（デフォルト: 100）

**レスポンス:**
```json
{
  "call_id": "string",
  "events": [
    {
      "type": "event_type",
      "timestamp": "ISO8601",
      ...
    }
  ],
  "total_events": 0,
  "stats": {},
  "timestamp": "ISO8601"
}
```

### GET /monitor/sessions

**レスポンス:**
```json
{
  "sessions": [
    {
      "call_id": "string",
      "is_monitoring": true,
      "event_count": 0,
      "created_at": "ISO8601",
      "last_activity": "ISO8601"
    }
  ],
  "total_sessions": 0,
  "timestamp": "ISO8601"
}
```

## 🚀 使用方法

### 1. サーバー起動

```bash
cd /root/openai-realtime-agents/fastapi
python main.py
```

### 2. Next.js側の実装例

```typescript
// WebRTC接続確立後
const callId = "obtained-from-openai";

// 監視開始
await fetch('http://localhost:8000/monitor/start', {
  method: 'POST',
  headers: { 'Content-Type': 'application/json' },
  body: JSON.stringify({ call_id: callId })
});

// イベント取得
const response = await fetch(
  `http://localhost:8000/monitor/events/${callId}`
);
const data = await response.json();
console.log('イベント:', data.events);

// 監視停止
await fetch('http://localhost:8000/monitor/stop', {
  method: 'POST',
  headers: { 'Content-Type': 'application/json' },
  body: JSON.stringify({ call_id: callId })
});
```

## 🔍 監視内容

### イベント記録

すべてのOpenAI Realtime APIイベントが記録されます：

1. **セッション情報**: セッション作成・更新
2. **音声処理**: 音声データの送受信、文字起こし
3. **会話管理**: アイテム作成、レスポンス生成
4. **エラー**: API エラーやタイムアウト

### 統計情報

各セッションで以下の統計が自動計算されます：

- 総イベント数
- イベントタイプ別カウント
- セッション継続時間
- 毎分あたりのイベント数
- 最終アクティビティ時刻

### ログ出力

すべての監視イベントは`[監視]`プレフィックス付きでログ出力されます：

```
2025-10-25 10:30:00 - __main__ - INFO - [監視] セッション作成: sess_123
2025-10-25 10:30:01 - __main__ - INFO - [監視] ユーザー発話開始: item_456
2025-10-25 10:30:05 - __main__ - INFO - [監視] レスポンス作成: resp_789
```

## ⚙️ 設定

### 環境変数

```env
OPENAI_API_KEY=sk-xxx  # 必須
LOG_LEVEL=INFO         # オプション（DEBUG, INFO, WARNING, ERROR）
```

### 依存関係

```txt
fastapi>=0.104.0
uvicorn[standard]>=0.24.0
websockets>=12.0
python-dotenv>=1.0.0
pydantic>=2.0.0
```

## 🧪 テスト方法

### ヘルスチェック

```bash
curl http://localhost:8000/health
```

### 監視開始テスト

```bash
curl -X POST http://localhost:8000/monitor/start \
  -H "Content-Type: application/json" \
  -d '{"call_id": "test-call-id"}'
```

### イベント取得テスト

```bash
curl http://localhost:8000/monitor/events/test-call-id
```

### 監視停止テスト

```bash
curl -X POST http://localhost:8000/monitor/stop \
  -H "Content-Type: application/json" \
  -d '{"call_id": "test-call-id"}'
```

## 📊 パフォーマンス考慮事項

### メモリ使用量

- イベント履歴はメモリに保存されます
- 長時間の監視では、イベント数が増加します
- 必要に応じて`GET /monitor/events`で取得後、セッションを削除してください

### 推奨設定

- **短期監視**: セッション終了後すぐに削除
- **長期監視**: 定期的にイベントを取得し、古いセッションを削除
- **大量監視**: イベントの永続化（データベース等）を検討

## 🔐 セキュリティ考慮事項

1. **API Key**: 環境変数で管理、コミットしない
2. **CORS**: 本番環境では適切なオリジン設定
3. **認証**: 必要に応じてエンドポイントに認証を追加
4. **レート制限**: 大量リクエストへの対策を検討

## 🐛 既知の制限事項

1. イベント履歴はメモリ上にのみ保存（永続化なし）
2. サーバー再起動で監視セッションは失われます
3. call_idの取得はクライアント側の実装に依存

## 📋 今後の拡張案

- [ ] イベントの永続化（データベース、ファイル）
- [ ] WebSocketでのリアルタイムイベント配信
- [ ] イベントのフィルタリング機能
- [ ] 複数call_idの一括監視
- [ ] ダッシュボードUI
- [ ] Prometheus/Grafanaとの統合

## ✅ 動作確認

- [x] サーバー起動確認
- [x] ヘルスチェック確認
- [x] 監視開始API実装
- [x] 監視停止API実装
- [x] イベント取得API実装
- [x] セッション一覧API実装
- [x] セッション削除API実装
- [x] エラーハンドリング
- [x] ログ出力
- [x] 統計情報生成

## 📞 サポート

問題が発生した場合：

1. ログを確認（`LOG_LEVEL=DEBUG`で実行）
2. `MIGRATION_GUIDE.md`を参照
3. `README_NEW.md`を参照
4. GitHubのIssuesで質問

---

**実装者**: GitHub Copilot  
**レビュー**: 必要に応じてコードレビューを実施してください  
**ドキュメント**: README_NEW.md、MIGRATION_GUIDE.md を参照
