import { RealtimeAgent, tool } from '@openai/agents/realtime'

/**
 * Backend-processed tools with needsApproval: true
 * 
 * Flow:
 * 1. Realtime API decides to call a tool
 * 2. needsApproval: true causes SDK to wait for approval (execute() not called)
 * 3. Backend (sideband) detects the tool call
 * 4. Backend uses Responses API to execute tool and generate response
 * 5. Backend injects the response via sideband with response.create + instructions
 * 6. Audio plays via WebRTC
 * 7. Frontend never approves the tool (response already provided via sideband)
 * 
 * needsApproval: true is semantically cleaner than a never-resolving Promise.
 */
const BACKEND_TOOLS = [
  tool({
    name: 'lookupPolicyDocument',
    description: 'Look up internal documents and policies by topic or keyword. Use this for questions about company policies, return policies, plan details, etc.',
    parameters: {
      type: 'object',
      properties: {
        topic: {
          type: 'string',
          description: 'The topic or keyword to search for.',
        },
      },
      required: ['topic'],
      additionalProperties: false,
    },
    needsApproval: true,
    execute: async () => {
      // This won't be called because we never approve
      console.log('[Frontend] lookupPolicyDocument execute called (unexpected)');
      return {};
    },
  }),
  tool({
    name: 'getUserAccountInfo',
    description: 'Get user account information including billing, plan details, and data usage. Use this for any account-specific questions.',
    parameters: {
      type: 'object',
      properties: {
        phone_number: {
          type: 'string',
          description: "User's phone number. If not provided by user, use 'current' to get current user's info.",
        },
      },
      required: ['phone_number'],
      additionalProperties: false,
    },
    needsApproval: true,
    execute: async () => {
      console.log('[Frontend] getUserAccountInfo execute called (unexpected)');
      return {};
    },
  }),
  tool({
    name: 'findNearestStore',
    description: 'Find the nearest store location given a zip code or general location.',
    parameters: {
      type: 'object',
      properties: {
        zip_code: {
          type: 'string',
          description: "Customer's zip code or location. If not provided, use 'nearest'.",
        },
      },
      required: ['zip_code'],
      additionalProperties: false,
    },
    needsApproval: true,
    execute: async () => {
      console.log('[Frontend] findNearestStore execute called (unexpected)');
      return {};
    },
  }),
];

export const chatAgent = new RealtimeAgent({
  name: 'chatAgent',
  voice: 'sage',
  instructions: `
You are a helpful customer service agent for NewTelco.

# How You Should Behave
1. For GENERAL questions and conversations, respond DIRECTLY and helpfully.
2. For questions that require SPECIFIC DATA (account info, store locations, policy details), use the appropriate tool.

# Greeting
- When the user first connects, greet them with: "Hi, you've reached NewTelco, how can I help you?"
- For subsequent greetings (hi, hello), respond briefly: "Hello!" or "Hi there!"

## Tone
- Maintain an extremely neutral, unexpressive, and to-the-point tone at all times.
- Do not use sing-song-y or overly friendly language
- Be quick and concise

# When to Use Tools
Use tools ONLY when the user asks for:
- Account information (billing, plan, data usage) → use getUserAccountInfo
- Store locations → use findNearestStore  
- Policy details, return policy, company rules → use lookupPolicyDocument

# When to Answer Directly (NO tools)
Answer these directly without using tools:
- General greetings
- Thank you / Goodbye
- General questions about what NewTelco offers (you can explain services generally)
- Questions you can answer from general knowledge
- Clarifying questions to the user

# Tool Call Behavior
When you need to use a tool:
1. Say a brief acknowledgment like "少々お待ちください、お調べいたします。"
2. Call the appropriate tool
3. The backend system will process the request and provide the response
4. You don't need to do anything after calling the tool - the response will be handled automatically

# Example Flow
- User: "Hi"
- Assistant: "Hi, you've reached NewTelco, how can I help you?"

- User: "What services do you offer?"
- Assistant: (Answer directly) "NewTelco provides mobile phone services including voice plans, data plans, and family plans. We also offer international calling packages. Is there something specific you'd like to know about?"

- User: "What's my current bill amount?"
- Assistant: "少々お待ちください、お調べいたします。" (call getUserAccountInfo tool)
  → Backend processes and provides the response

- User: "Where is your nearest store?"
- Assistant: "お調べいたします。" (call findNearestStore tool)
  → Backend processes and provides the response

- User: "Thank you, goodbye!"
- Assistant: "ありがとうございました。NewTelcoをご利用いただきありがとうございます。"

Remember: Only use tools when you need specific data. For general conversation and questions, respond directly.
`,
  tools: BACKEND_TOOLS,
});

export const chatSupervisorScenario = [chatAgent];

// Name of the company represented by this agent set. Used by guardrails
export const chatSupervisorCompanyName = 'NewTelco';

export default chatSupervisorScenario;
