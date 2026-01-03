## Nest.js Backend

`backend/` は Nest.js 製のサーバーアプリのベースプロジェクトです。このリポジトリではフロントエンド（Next.js）と並行して開発する想定です。

### 前提

- Node.js 18 以上を推奨
- npm 利用（`package-lock.json` をコミット対象にします）

### セットアップ

```bash
cd backend
npm install
```

### 開発サーバーの起動

```bash
# ホットリロード付き（推奨）
npm run start:dev

# 通常起動
npm run start
```

デフォルトでポート `8000` で `http://localhost:8000` にルート/ヘルスチェックが立ち上がります。

### モニタリング API（OpenAI Realtime のサイドバンド監視）

- `POST /monitor/start` — call_id と api_token を受け取り、OpenAI Realtime API へ監視専用 WebSocket を張ってイベント収集を開始
- `POST /monitor/stop` — 監視を停止し、統計情報を返却
- `GET /monitor/events/:callId?limit=100` — 指定 call_id の最近のイベント履歴と stats を取得
- `GET /monitor/sessions` — すべての監視セッション一覧
- `DELETE /monitor/session/:callId` — セッションを削除
- `GET /monitor/health` — 監視コンポーネントのヘルス確認（active_monitors 付き）
- `POST /monitor/events` — （任意）手動でイベントを投入しログに流す

例: 監視開始

```bash
curl -X POST http://localhost:8000/monitor/start \
  -H "Content-Type: application/json" \
  -d '{"call_id":"your-call-id","api_token":"sk-..."}'
```

例: イベント履歴取得

```bash
curl "http://localhost:8000/monitor/events/your-call-id?limit=50"
```

### テスト

```bash
# ユニットテスト
npm test

# E2E テスト
npm run test:e2e

# カバレッジ
npm run test:cov
```

### ビルド

```bash
npm run build
```

### ディレクトリ構成（抜粋）

- `src/` — Nest.js アプリ本体
  - `presentation/` — HTTP コントローラ & DTO
  - `main.ts` / `app.module.ts` — エントリーポイントとルートモジュール
- `test/` — Jest テスト（E2E 含む）

### メモ

- ルートの `package.json` とは独立した npm プロジェクトです。フロントエンドや FastAPI とは別に `backend/` ディレクトリでコマンドを実行してください。
