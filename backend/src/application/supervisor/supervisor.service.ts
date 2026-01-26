import { Injectable, Logger } from '@nestjs/common';
import { run } from '@openai/agents';
import { triageAgent } from '../../agents';

@Injectable()
export class SupervisorService {
    private readonly logger = new Logger(SupervisorService.name);

    constructor() {
        // Agents SDK uses OPENAI_API_KEY from environment
        const apiKey = process.env.OPENAI_API_KEY;
        if (!apiKey) {
            this.logger.warn('OPENAI_API_KEY is not set. SupervisorService will not work.');
        }
    }

    /**
     * トリアージエージェントを使ってリクエストを処理
     * 
     * Flow:
     * 1. ユーザーのリクエストをトリアージエージェントに渡す
     * 2. トリアージエージェントが必要に応じてツールを呼び出す
     * 3. 最終回答を返す
     * 
     * @param userRequest ユーザーのリクエスト内容
     * @param conversationHistory 会話履歴（オプション）
     * @returns トリアージエージェントの最終回答
     */
    async processWithTriageAgent(
        userRequest: string,
        conversationHistory?: string,
    ): Promise<string> {
        this.logger.log(`[TriageAgent] Processing request: ${userRequest}`);

        try {
            // 会話履歴があればコンテキストとして追加
            const input = conversationHistory
                ? `Previous conversation:\n${conversationHistory}\n\nCurrent request: ${userRequest}`
                : userRequest;

            this.logger.log(`[TriageAgent] Running agent with input: ${input.substring(0, 100)}...`);

            // トリアージエージェントを実行
            const result = await run(triageAgent, input);

            this.logger.log(`[TriageAgent] Agent completed`);

            // 最終出力を取得
            const finalOutput = result.finalOutput;

            if (typeof finalOutput === 'string' && finalOutput.length > 0) {
                this.logger.log(`[TriageAgent] Final output: ${finalOutput.substring(0, 100)}...`);
                return finalOutput;
            }

            this.logger.warn(`[TriageAgent] No final output received`);
            return 'I apologize, but I was unable to process your request. Please try again.';
        } catch (error) {
            this.logger.error(`[TriageAgent] Error: ${error}`);
            return 'I apologize, but an error occurred while processing your request. Please try again.';
        }
    }
}
