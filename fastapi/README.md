# FastAPI WebSocket Server for OpenAI Realtime API

このFastAPIサーバーは、Next.jsフロントエンドとOpenAI Realtime APIの間のWebSocketプロキシとして機能します。

## 📋 目次

- [機能](#機能)
- [アーキテクチャ](#アーキテクチャ)
- [セットアップ](#セットアップ)
- [使い方](#使い方)
- [エンドポイント](#エンドポイント)
- [ファイル構成](#ファイル構成)
- [開発](#開発)
- [トラブルシューティング](#トラブルシューティング)

## ✨ 機能

- ✅ クライアントとのWebSocket接続を管理
- ✅ OpenAI Realtime APIとのWebSocket接続を管理
- ✅ 音声データとイベントの双方向転送
- ✅ セッション管理と統計情報の追跡
- ✅ イベントハンドリングとロギング
- ✅ エラーハンドリング
- ✅ 音声データのbase64エンコード/デコード
- ✅ CORS対応

## 🏗️ アーキテクチャ

```
┌─────────────────┐
│  Next.jsクライアント  │
│  (フロントエンド)   │
└────────┬────────┘
         │ WebSocket (ws://localhost:8000/ws)
         │
┌────────▼────────┐
│  FastAPIサーバー   │
│  (このサーバー)    │
│                 │
│  - WebSocket管理 │
│  - セッション管理  │
│  - イベント処理   │
│  - 音声変換      │
└────────┬────────┘
         │ WebSocket (wss://api.openai.com/v1/realtime)
         │
┌────────▼────────┐
│ OpenAI Realtime │
│      API        │
└─────────────────┘
```

## 🚀 セットアップ

### 方法1: 自動セットアップスクリプト（推奨）

```bash
cd fastapi
chmod +x setup.sh
./setup.sh
```

### 方法2: 手動セットアップ

#### 1. 依存関係のインストール

```bash
cd fastapi

# 仮想環境を作成
python3 -m venv venv

# 仮想環境をアクティベート
source venv/bin/activate  # Linux/Mac
# または
venv\Scripts\activate  # Windows

# 依存関係をインストール
pip install -r requirements.txt
```

#### 2. 環境変数の設定

`.env`ファイルを作成：

```bash
cp .env.example .env
```

`.env`ファイルを編集してOpenAI APIキーを設定：

```env
OPENAI_API_KEY=sk-your-actual-openai-api-key-here
LOG_LEVEL=INFO
```

## 📖 使い方

### サーバーの起動

#### 方法1: 起動スクリプト使用

```bash
chmod +x start.sh
./start.sh
```

#### 方法2: 直接起動

```bash
# 本番モード
python main.py

# 開発モード（自動リロード有効）
uvicorn main:app --reload --host 0.0.0.0 --port 8000
```

サーバーは `http://localhost:8000` で起動します。

### 接続テスト

```bash
# 仮想環境内で実行
python test_client.py
```

## 🔌 エンドポイント

### WebSocket: `/ws`

クライアントとの間でWebSocket接続を確立し、OpenAI Realtime APIと通信します。

#### 接続フロー

1. クライアントが `/ws` に接続
2. サーバーがOpenAI Realtime APIに接続
3. セッション設定を送信
4. 双方向通信を開始
5. 接続確立メッセージをクライアントに送信

#### メッセージフォーマット

**クライアント → サーバー:**
- **JSONメッセージ**: OpenAI Realtime APIイベント
  ```json
  {
    "type": "conversation.item.create",
    "item": {
      "type": "message",
      "role": "user",
      "content": [{"type": "input_text", "text": "こんにちは"}]
    }
  }
  ```
- **バイナリデータ**: PCM16フォーマットの音声データ（自動的にbase64エンコード）

**サーバー → クライアント:**
- **JSONメッセージ**: OpenAI Realtime APIからのイベント
  ```json
  {
    "type": "connection.established",
    "session_id": "uuid-here",
    "message": "OpenAI Realtime APIに接続しました"
  }
  ```

### HTTP: `GET /`

ルートエンドポイント - サービス情報を返します

```bash
curl http://localhost:8000/
```

レスポンス:
```json
{
  "status": "ok",
  "service": "OpenAI Realtime WebSocket Proxy",
  "version": "1.0.0",
  "endpoints": {
    "websocket": "/ws",
    "health": "/health",
    "stats": "/stats"
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
  "active_sessions": 2
}
```

### HTTP: `GET /stats`

統計情報エンドポイント

```bash
curl http://localhost:8000/stats
```

レスポンス:
```json
{
  "active_sessions": 2,
  "total_sessions": 5
}
```

## 📁 ファイル構成

```
fastapi/
├── main.py              # メインアプリケーション
├── config.py            # 設定管理
├── event_handler.py     # イベント処理
├── session_manager.py   # セッション管理
├── audio_utils.py       # 音声処理ユーティリティ
├── requirements.txt     # Python依存関係
├── .env.example         # 環境変数テンプレート
├── .env                 # 環境変数（作成が必要）
├── .gitignore          # Git除外設定
├── README.md           # このファイル
├── setup.sh            # セットアップスクリプト
├── start.sh            # 起動スクリプト
└── test_client.py      # テストクライアント
```

### ファイル説明

- **main.py**: FastAPIアプリケーションのエントリーポイント。WebSocketエンドポイントとHTTPエンドポイントを定義
- **config.py**: アプリケーション設定を管理（Pydanticモデル使用）
- **event_handler.py**: OpenAI Realtime APIからのイベントを処理
- **session_manager.py**: WebSocketセッションの状態と統計を管理
- **audio_utils.py**: 音声データのエンコード/デコード、バッファ管理

## 🛠️ 開発

### ログレベルの変更

`.env`ファイルで設定：

```env
LOG_LEVEL=DEBUG  # より詳細なログ
```

または、`main.py`で直接変更：

```python
logging.basicConfig(level=logging.DEBUG)
```

### セッション設定のカスタマイズ

`config.py`の`SessionConfig`クラスを編集：

```python
class SessionConfig(BaseModel):
    voice: str = "nova"  # 音声を変更
    temperature: float = 0.9  # 温度を変更
    instructions: str = "カスタム指示"  # 指示を変更
```

利用可能な音声:
- `alloy` - ニュートラル
- `echo` - 男性的
- `fable` - イギリス英語
- `onyx` - 深い男性的
- `nova` - 女性的
- `shimmer` - 優しい女性的

### カスタムイベントハンドラーの追加

`event_handler.py`でカスタムハンドラーを追加：

```python
def custom_handler(event: Dict[str, Any]) -> Dict[str, Any]:
    # カスタム処理
    return event

handler = RealtimeEventHandler()
handler.register_handler("custom.event", custom_handler)
```

## 🐛 トラブルシューティング

### OPENAI_API_KEYエラー

**症状**: `OPENAI_API_KEYが設定されていません` エラー

**解決方法**:
1. `.env`ファイルが存在するか確認
2. `.env`ファイルにAPIキーが正しく設定されているか確認
3. APIキーが`sk-`で始まっているか確認

```bash
cat .env  # ファイル内容を確認
```

### 接続エラー

**症状**: `WebSocketエラー: ...` または接続拒否

**解決方法**:
1. サーバーが起動しているか確認
   ```bash
   curl http://localhost:8000/health
   ```
2. ファイアウォール設定を確認
3. OpenAI APIのステータスを確認: https://status.openai.com/
4. APIキーの権限を確認

### 音声が聞こえない

**症状**: 接続はできるが音声が再生されない

**解決方法**:
1. 音声フォーマット (pcm16) が正しいか確認
2. サーバーログで音声データの送受信を確認
   ```bash
   # DEBUGレベルでログを確認
   LOG_LEVEL=DEBUG python main.py
   ```
3. ブラウザの音声権限を確認
4. クライアント側の音声再生コードを確認

### 依存関係エラー

**症状**: モジュールが見つからないエラー

**解決方法**:
```bash
# 仮想環境をアクティベート
source venv/bin/activate

# 依存関係を再インストール
pip install --upgrade pip
pip install -r requirements.txt
```

### ポート使用中エラー

**症状**: `Address already in use`

**解決方法**:
```bash
# ポート8000を使用しているプロセスを確認
lsof -i :8000

# プロセスを終了
kill -9 <PID>

# または、別のポートを使用
uvicorn main:app --host 0.0.0.0 --port 8001
```

## 📝 ライセンス

このプロジェクトはMITライセンスの下で公開されています。

## 🤝 貢献

バグ報告や機能リクエストは、GitHubのIssuesページでお願いします。

## 📚 参考資料

- [OpenAI Realtime API Documentation](https://platform.openai.com/docs/guides/realtime)
- [FastAPI Documentation](https://fastapi.tiangolo.com/)
- [WebSocket Protocol](https://tools.ietf.org/html/rfc6455)
