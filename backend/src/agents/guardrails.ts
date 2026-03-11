import { Logger } from '@nestjs/common';
import type { RealtimeOutputGuardrail } from '@openai/agents/realtime';

interface OutputGuardrailResult {
  moderationCategory: 'NONE';
  moderationRationale: string;
  testText: string;
}

const logger = new Logger('RealtimeGuardrails');

export function createModerationGuardrail(): RealtimeOutputGuardrail {
  return {
    name: 'test_output_guardrail',
    policyHint: 'Test guardrail that only logs assistant output.',
    async execute({ agentOutput }) {
      const message =
        typeof agentOutput === 'string'
          ? agentOutput.trim()
          : JSON.stringify(agentOutput);

      if (!message) {
        return {
          tripwireTriggered: false,
          outputInfo: {
            moderationCategory: 'NONE',
            moderationRationale: '',
            testText: '',
          } satisfies OutputGuardrailResult,
        };
      }

      logger.log(
        `[Output Guardrail] Observed assistant output: ${message.slice(0, 200)}`,
      );

      return {
        tripwireTriggered: false,
        outputInfo: {
          moderationCategory: 'NONE',
          moderationRationale: 'Logged assistant output for test purposes.',
          testText: message,
        } satisfies OutputGuardrailResult,
      };
    },
  };
}
