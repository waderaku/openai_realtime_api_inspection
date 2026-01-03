# WebSocket接続のスケーリング・リソース検証ガイド

## 検証目的

1. **スケーリング時の接続維持**: ECSタスクのスケールイン/アウト時に既存WebSocket接続が維持されるか
2. **リソース消費**: 長時間接続・複数接続時のCPU/メモリ使用量の推移

---

## 事前準備

```bash
cd /root/openai-realtime-agents/fastapi/tests
pip install websockets
```

---

## 検証1: スケーリング時の接続維持

### 理論的な動作

| シナリオ | 既存接続への影響 |
|---------|----------------|
| スケールアウト | ✅ 影響なし（新タスク追加のみ） |
| スケールイン | ⚠️ 終了するタスクの接続は切断（draining期間後） |
| ローリングデプロイ | ⚠️ 旧タスク終了時に切断 |

### 検証手順

**ターミナル1: 接続監視**
```bash
cd /root/openai-realtime-agents/fastapi/tests
python test_scaling.py ws://openai-realtime-alb-1392163497.ap-northeast-1.elb.amazonaws.com/ws
```

**ターミナル2: スケーリング操作**
```bash
# 現在のタスク数確認
aws ecs describe-services --cluster openai-realtime-cluster --services fastapi-service \
  --query 'services[0].{desired:desiredCount,running:runningCount}'

# スケールアウト（1→2）
aws ecs update-service --cluster openai-realtime-cluster --service fastapi-service --desired-count 2

# 数分待ってからスケールイン（2→1）
aws ecs update-service --cluster openai-realtime-cluster --service fastapi-service --desired-count 1
```

### 確認ポイント

- [ ] スケールアウト時、接続が維持されているか
- [ ] スケールイン時、どのタイミングで切断されるか
- [ ] 切断後、自動再接続できるか

---

## 検証2: リソース消費監視

### CloudWatchメトリクス確認

```bash
# CPU使用率
aws cloudwatch get-metric-statistics \
  --namespace AWS/ECS \
  --metric-name CPUUtilization \
  --dimensions Name=ClusterName,Value=openai-realtime-cluster Name=ServiceName,Value=fastapi-service \
  --start-time $(date -u -d '1 hour ago' +%Y-%m-%dT%H:%M:%SZ) \
  --end-time $(date -u +%Y-%m-%dT%H:%M:%SZ) \
  --period 60 \
  --statistics Average Maximum

# メモリ使用率
aws cloudwatch get-metric-statistics \
  --namespace AWS/ECS \
  --metric-name MemoryUtilization \
  --dimensions Name=ClusterName,Value=openai-realtime-cluster Name=ServiceName,Value=fastapi-service \
  --start-time $(date -u -d '1 hour ago' +%Y-%m-%dT%H:%M:%SZ) \
  --end-time $(date -u +%Y-%m-%dT%H:%M:%SZ) \
  --period 60 \
  --statistics Average Maximum
```

### 負荷テスト実行

```bash
# 5接続で5分間テスト
python test_load.py ws://openai-realtime-alb-1392163497.ap-northeast-1.elb.amazonaws.com/ws -c 5 -d 300

# 10接続で10分間テスト
python test_load.py ws://openai-realtime-alb-1392163497.ap-northeast-1.elb.amazonaws.com/ws -c 10 -d 600
```

### 確認ポイント

- [ ] 単一接続時のベースラインCPU/メモリ使用率
- [ ] 接続数増加に伴うリソース増加の傾向
- [ ] OpenAI WebSocket接続のメモリリーク有無

---

## 検証3: 接続あたりのリソース見積もり

### 現在のスペック
- CPU: 256 (0.25 vCPU)
- メモリ: 512 MB

### 見積もり方法

1. 1接続時のリソース使用率を計測
2. 5接続、10接続時の使用率を計測
3. 線形増加するか確認

### 計算例

```
1接続: CPU 5%, メモリ 100MB
5接続: CPU 20%, メモリ 200MB
→ 1接続あたり: CPU ~4%, メモリ ~25MB
→ 最大接続数見込み: CPU基準で約25接続, メモリ基準で約16接続
```

---

## 検証4: 長時間接続テスト

```bash
# 1時間の長時間接続テスト
python test_scaling.py ws://openai-realtime-alb-1392163497.ap-northeast-1.elb.amazonaws.com/ws
# 1時間後にCloudWatchでリソース推移を確認
```

### 確認ポイント

- [ ] 時間経過に伴うメモリ増加（リーク）がないか
- [ ] ALBのアイドルタイムアウト（1時間）で切断されないか

---

## 結果記録テンプレート

| 検証項目 | 結果 | 備考 |
|---------|------|------|
| スケールアウト時の接続維持 | ✅/❌ | |
| スケールイン時の切断タイミング | | draining: ○秒後 |
| 1接続時CPU使用率 | | % |
| 1接続時メモリ使用率 | | MB |
| 5接続時CPU使用率 | | % |
| 5接続時メモリ使用率 | | MB |
| 長時間接続後のメモリリーク | ✅/❌ | |

---

## 推奨アクション（検証後）

### スケーリング対策
- [ ] 適切なdraining時間の設定（現在30秒）
- [ ] クライアント側の自動再接続ロジック確認

### リソース対策
- [ ] 想定同時接続数に基づくスペック調整
- [ ] オートスケーリング閾値の調整（現在CPU 70%）

### 監視設定
- [ ] CloudWatchアラーム設定（CPU/メモリ高負荷時）
- [ ] WebSocket接続数のカスタムメトリクス追加
