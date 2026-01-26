import { RealtimeAgent, tool } from '@openai/agents/realtime'
import { z } from 'zod'

/**
 * askSupervisor ツール（フロントエンド用ダミー）
 * 
 * 重要: このツールは実際には実行されません。
 * - needsApproval: true により、フロントエンドでの自動実行を防止
 * - 実際の処理はバックエンドのサイドバンドで行われます
 * 
 * なぜこれが必要か:
 * - サイドバンドから session.update でツールを注入すると、
 *   Realtime API がツールを呼び出した際にフロントエンドにも通知が来る
 * - フロントエンド側にツール定義がないとエラーになる
 * - needsApproval: true で「承認待ち」状態にして、サイドバンドで処理
 */
const askSupervisorTool = tool({
  name: 'askSupervisor',
  description: 'Ask the supervisor agent to help with the customer request.',
  parameters: z.object({
    request: z.string().describe('The customer request to process'),
  }),
  // needsApproval: true により、executeは呼ばれない（承認待ち状態になる）
  needsApproval: true,
  execute: async () => {
    // このコードは実行されない（needsApproval: true のため）
    // 実際の処理はバックエンドのサイドバンドで行われる
    console.warn('[Frontend] askSupervisor execute called unexpectedly');
    return {};
  },
});

/**
 * フロントエンド用のRealtimeAgent設定
 * 
 * 重要: 本物のPromptとToolsは バックエンドから session.update で注入されます。
 * フロントエンドでは最小限の設定と、ダミーの askSupervisor ツールを定義します。
 * 
 * Flow:
 * 1. フロントエンドがRealtimeセッションを開始（ダミー設定 + askSupervisorダミー）
 * 2. バックエンドがサイドバンド接続
 * 3. バックエンドが session.update で本物の Instructions + Tools を注入
 * 4. ユーザーがリクエスト → Realtime APIがaskSupervisorツールを呼び出し
 * 5. フロントエンドはneedsApproval: trueで承認待ち状態
 * 6. サイドバンドでツールコールを検出 → バックエンドのトリアージエージェントが処理
 * 7. 結果をサイドバンドでresponse.createで注入 → 音声出力
 * 
 * この設計のメリット:
 * - 具体的なTools定義（内部ツール）がフロントエンドに露出しない
 * - Instructions/Toolsの一元管理（バックエンドのみ）
 * - バックエンドで動的に設定を変更可能（柔軟性）
 */
export const chatAgent = new RealtimeAgent({
  name: 'chatAgent',
  voice: 'sage',
  // ダミー Instructions（サイドバンドから上書きされる）
  instructions: `
You are a helpful assistant.
Please wait for configuration to be loaded from the backend.
`,
  // askSupervisorのダミーツール（needsApproval: true）
  // 実際のツール定義はサイドバンドから session.update で注入される
  tools: [askSupervisorTool],
});

export const chatSupervisorScenario = [chatAgent];

// Name of the company represented by this agent set. Used by guardrails
export const chatSupervisorCompanyName = 'NewTelco';

export default chatSupervisorScenario;
