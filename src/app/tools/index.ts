// SDK非依存のツール定義
// OpenAI Realtime APIのツール形式に準拠

// chatSupervisorで使用するサンプルデータ
import {
    exampleAccountInfo,
    examplePolicyDocs,
    exampleStoreLocations,
} from '../agentConfigs/chatSupervisor/sampleData';


export const getOrderHistoryTool = {
    type: "function" as const,
    name: "get_order_history",
    description: "Get the order history for an authenticated user",
    parameters: {
        type: "object",
        properties: {
            phone_number: {
                type: "string",
                description: "User's phone number",
            },
        },
        required: ["phone_number"],
    },
};

// ツールのリスト
export const allTools = [
    {
        type: "function" as const,
        name: "save_or_update_address",
        description: "Saves or updates an address for a given phone number. Should be run only if the user is authenticated and provides an address. Only run AFTER confirming all details with the user.",
        parameters: {
            type: "object",
            properties: {
                phone_number: {
                    type: "string",
                    description: "The phone number associated with the address",
                },
                new_address: {
                    type: "object",
                    properties: {
                        street: {
                            type: "string",
                            description: "The street part of the address",
                        },
                        city: {
                            type: "string",
                            description: "The city part of the address",
                        },
                        state: {
                            type: "string",
                            description: "The state part of the address",
                        },
                        postal_code: {
                            type: "string",
                            description: "The postal or ZIP code",
                        },
                    },
                    required: ["street", "city", "state", "postal_code"],
                },
            },
            required: ["phone_number", "new_address"],
        },
    },
    {
        type: "function" as const,
        name: "update_user_offer_response",
        description: "A tool definition for signing up a user for a promotional offer",
        parameters: {
            type: "object",
            properties: {
                phone: {
                    type: "string",
                    description: "The user's phone number for contacting them",
                },
                offer_id: {
                    type: "string",
                    description: "The identifier for the promotional offer",
                },
                user_response: {
                    type: "string",
                    description: "The user's response to the promotional offer",
                    enum: ["ACCEPTED", "DECLINED", "REMIND_LATER"],
                },
            },
            required: ["phone", "offer_id", "user_response"],
        },
    },
    {
        type: "function" as const,
        name: "lookupOrders",
        description: "Retrieve detailed order information by using the user's phone number, including shipping status and item details.",
        parameters: {
            type: "object",
            properties: {
                phoneNumber: {
                    type: "string",
                    description: "The user's phone number tied to their order(s).",
                },
            },
            required: ["phoneNumber"],
        },
    },
    {
        type: "function" as const,
        name: "retrievePolicy",
        description: "Retrieve and present the store's policies, including eligibility for returns.",
        parameters: {
            type: "object",
            properties: {
                policy_type: {
                    type: "string",
                    enum: ["return", "shipping", "warranty"],
                    description: "The type of policy to retrieve",
                },
            },
            required: ["policy_type"],
        },
    },
    {
        type: "function" as const,
        name: "checkEligibilityAndPossiblyInitiateReturn",
        description: "Check if an item is eligible for return and initiate the return process if requested.",
        parameters: {
            type: "object",
            properties: {
                order_id: {
                    type: "string",
                    description: "The order ID",
                },
                item_id: {
                    type: "string",
                    description: "The item ID to return",
                },
                reason: {
                    type: "string",
                    description: "Reason for the return",
                },
            },
            required: ["order_id", "item_id"],
        },
    },
    // chatSupervisor tools - exact match with SDK version
    {
        type: "function" as const,
        name: "lookupPolicyDocument",
        description: "Tool to look up internal documents and policies by topic or keyword.",
        parameters: {
            type: "object",
            properties: {
                topic: {
                    type: "string",
                    description: "The topic or keyword to search for in company policies or documents.",
                },
            },
            required: ["topic"],
            additionalProperties: false,
        },
    },
    {
        type: "function" as const,
        name: "getUserAccountInfo",
        description: "Tool to get user account information. This only reads user accounts information, and doesn't provide the ability to modify or delete any values.",
        parameters: {
            type: "object",
            properties: {
                phone_number: {
                    type: "string",
                    description: "Formatted as '(xxx) xxx-xxxx'. MUST be provided by the user, never a null or empty string.",
                },
            },
            required: ["phone_number"],
            additionalProperties: false,
        },
    },
    {
        type: "function" as const,
        name: "findNearestStore",
        description: "Tool to find the nearest store location to a customer, given their zip code.",
        parameters: {
            type: "object",
            properties: {
                zip_code: {
                    type: "string",
                    description: "The customer's 5-digit zip code.",
                },
            },
            required: ["zip_code"],
            additionalProperties: false,
        },
    },
    {
        type: "function" as const,
        name: "getNextResponseFromSupervisor",
        description: "Determines the next response whenever the agent faces a non-trivial decision, produced by a highly intelligent supervisor agent. Returns a message describing what to do next.",
        parameters: {
            type: "object",
            properties: {
                relevantContextFromLastUserMessage: {
                    type: "string",
                    description: "Key information from the user described in their most recent message. This is critical to provide as the supervisor agent with full context as the last message might not be available. Okay to omit if the user message didn\'t add any new information.",
                },
            },
            required: ["relevantContextFromLastUserMessage"],
            additionalProperties: false,
        },
    },
];

// TranscriptItemの型定義（TranscriptContextから）
export interface TranscriptItem {
    itemId: string;
    role?: 'user' | 'assistant';
    text?: string;
    timestamp?: string;
    type?: 'MESSAGE' | 'BREADCRUMB';
    title?: string;
    data?: Record<string, any>;
    isExpanded?: boolean;
    isHidden?: boolean;
}

// ツール実行ハンドラー
export function executeToolCall(name: string, args: any, conversationHistory?: TranscriptItem[]): any {
    console.log('[Tools] Executing:', name, args);

    switch (name) {
        case 'authenticate_user_information':
            return { success: true };

        case 'save_or_update_address':
            return { success: true };

        case 'update_user_offer_response':
            return { success: true };

        case 'lookupOrders':
            return {
                orders: [
                    {
                        order_id: 'SNP-20230914-001',
                        order_date: '2024-09-14T09:30:00Z',
                        delivered_date: '2024-09-16T14:00:00Z',
                        order_status: 'delivered',
                        subtotal_usd: 409.98,
                        total_usd: 471.48,
                        items: [
                            {
                                item_id: 'SNB-TT-X01',
                                item_name: 'Twin Tip Snowboard X',
                                retail_price_usd: 249.99,
                            },
                            {
                                item_id: 'SNB-BOOT-ALM02',
                                item_name: 'All-Mountain Snowboard Boots',
                                retail_price_usd: 159.99,
                            },
                        ],
                    },
                ],
            };

        case 'retrievePolicy':
            return {
                policy: {
                    type: args.policy_type,
                    description: 'Sample policy content',
                },
            };

        case 'checkEligibilityAndPossiblyInitiateReturn':
            return {
                eligible: true,
                return_id: 'RET-12345',
                message: 'Return initiated successfully',
            };

        // chatSupervisor tools
        case 'lookupPolicyDocument':
            return examplePolicyDocs;

        case 'getUserAccountInfo':
            return exampleAccountInfo;

        case 'findNearestStore':
            return exampleStoreLocations;

        case 'getNextResponseFromSupervisor':
            return executeGetNextResponseFromSupervisor(
                args.relevantContextFromLastUserMessage,
                conversationHistory || []
            );

        default:
            return { error: `Unknown function: ${name}` };
    }
}

// supervisorAgentからの指示（supervisorAgent.tsと同じ）
const supervisorAgentInstructions = `You are an expert customer service supervisor agent, tasked with providing real-time guidance to a more junior agent that's chatting directly with the customer. You will be given detailed response instructions, tools, and the full conversation history so far, and you should create a correct next message that the junior agent can read directly.

# Instructions
- You can provide an answer directly, or call a tool first and then answer the question
- If you need to call a tool, but don't have the right information, you can tell the junior agent to ask for that information in your message
- Your message will be read verbatim by the junior agent, so feel free to use it like you would talk directly to the user
  
==== Domain-Specific Agent Instructions ====
You are a helpful customer service agent working for NewTelco, helping a user efficiently fulfill their request while adhering closely to provided guidelines.

# Instructions
- Always greet the user at the start of the conversation with "Hi, you've reached NewTelco, how can I help you?"
- Always call a tool before answering factual questions about the company, its offerings or products, or a user's account. Only use retrieved context and never rely on your own knowledge for any of these questions.
- Escalate to a human if the user requests.
- Do not discuss prohibited topics (politics, religion, controversial current events, medical, legal, or financial advice, personal conversations, internal company operations, or criticism of any people or company).
- Rely on sample phrases whenever appropriate, but never repeat a sample phrase in the same conversation. Feel free to vary the sample phrases to avoid sounding repetitive and make it more appropriate for the user.
- Always follow the provided output format for new messages, including citations for any factual statements from retrieved policy documents.

# Response Instructions
- Maintain a professional and concise tone in all responses.
- Respond appropriately given the above guidelines.
- The message is for a voice conversation, so be very concise, use prose, and never create bulleted lists. Prioritize brevity and clarity over completeness.
    - Even if you have access to more information, only mention a couple of the most important items and summarize the rest at a high level.
- Do not speculate or make assumptions about capabilities or information. If a request cannot be fulfilled with available tools or information, politely refuse and offer to escalate to a human representative.
- If you do not have all required information to call a tool, you MUST ask the user for the missing information in your message. NEVER attempt to call a tool with missing, empty, placeholder, or default values (such as "", "REQUIRED", "null", or similar). Only call a tool when you have all required parameters provided by the user.
- For store location requests, if the user mentions a city or area without a specific zip code, you can use representative zip codes: NYC=10118, San Francisco=94105, Los Angeles=90028, Boston=02199, etc.
- Do not offer or attempt to fulfill requests for capabilities or services not explicitly supported by your tools or provided information.
- Only offer to provide more information if you know there is more information available to provide, based on the tools and context you have.
- When possible, please provide specific numbers or dollar amounts to substantiate your answer.

# Sample Phrases
## Deflecting a Prohibited Topic
- "I'm sorry, but I'm unable to discuss that topic. Is there something else I can help you with?"
- "That's not something I'm able to provide information on, but I'm happy to help with any other questions you may have."

## If you do not have a tool or information to fulfill a request
- "Sorry, I'm actually not able to do that. Would you like me to transfer you to someone who can help, or help you find your nearest NewTelco store?"
- "I'm not able to assist with that request. Would you like to speak with a human representative, or would you like help finding your nearest NewTelco store?"

## Before calling a tool
- "To help you with that, I'll just need to verify your information."
- "Let me check that for you—one moment, please."
- "I'll retrieve the latest details for you now."

## If required information is missing for a tool call
- "To help you with that, could you please provide your [required info, e.g., zip code/phone number]?"
- "I'll need your [required info] to proceed. Could you share that with me?"

# User Message Format
- Always include your final response to the user.
- When providing factual information from retrieved context, always include citations immediately after the relevant statement(s). Use the following citation format:
    - For a single source: [NAME](ID)
    - For multiple sources: [NAME](ID), [NAME](ID)
- Only provide information about this company, its policies, its products, or the customer's account, and only if it is based on information provided in context. Do not answer questions outside this scope.

# Example (tool call)
- User: Can you tell me about your family plan options?
- Supervisor Assistant: lookup_policy_document(topic="family plan options")
- lookup_policy_document(): [
  {
    id: "ID-010",
    name: "Family Plan Policy",
    topic: "family plan options",
    content:
      "The family plan allows up to 5 lines per account. All lines share a single data pool. Each additional line after the first receives a 10% discount. All lines must be on the same account.",
  },
  {
    id: "ID-011",
    name: "Unlimited Data Policy",
    topic: "unlimited data",
    content:
      "Unlimited data plans provide high-speed data up to 50GB per month. After 50GB, speeds may be reduced during network congestion. All lines on a family plan share the same data pool. Unlimited plans are available for both individual and family accounts.",
  },
];
- Supervisor Assistant:
# Message
Yes we do—up to five lines can share data, and you get a 10% discount for each new line [Family Plan Policy](ID-010).

# Example (Refusal for Unsupported Request)
- User: Can I make a payment over the phone right now?
- Supervisor Assistant:
# Message
I'm sorry, but I'm not able to process payments over the phone. Would you like me to connect you with a human representative, or help you find your nearest NewTelco store for further assistance?
`;

const supervisorAgentTools = [
    {
        type: "function",
        name: "lookupPolicyDocument",
        description: "Tool to look up internal documents and policies by topic or keyword.",
        parameters: {
            type: "object",
            properties: {
                topic: {
                    type: "string",
                    description: "The topic or keyword to search for in company policies or documents.",
                },
            },
            required: ["topic"],
            additionalProperties: false,
        },
    },
    {
        type: "function",
        name: "getUserAccountInfo",
        description: "Tool to get user account information. This only reads user accounts information, and doesn't provide the ability to modify or delete any values.",
        parameters: {
            type: "object",
            properties: {
                phone_number: {
                    type: "string",
                    description: "Formatted as '(xxx) xxx-xxxx'. MUST be provided by the user, never a null or empty string.",
                },
            },
            required: ["phone_number"],
            additionalProperties: false,
        },
    },
    {
        type: "function",
        name: "findNearestStore",
        description: "Tool to find the nearest store location to a customer, given their zip code. If you don't know the exact zip code but know the city/area (e.g., 'New York'), you can use a representative zip code for that area (e.g., '10118' for NYC, '94105' for San Francisco). The tool will return relevant store information.",
        parameters: {
            type: "object",
            properties: {
                zip_code: {
                    type: "string",
                    description: "The customer's 5-digit zip code. If unknown, use a representative zip code for the mentioned city: NYC=10118, San Francisco=94105, Los Angeles=90028, Boston=02199, etc.",
                },
            },
            required: ["zip_code"],
            additionalProperties: false,
        },
    },
];

// スーパーバイザーのツール呼び出しに対してサンプルデータを返す関数
// supervisorAgent.tsのgetToolResponse関数と同じ
function getToolResponse(functionName: string): any {
    switch (functionName) {
        case "getUserAccountInfo":
            return exampleAccountInfo;
        case "lookupPolicyDocument":
            return examplePolicyDocs;
        case "findNearestStore":
            // SDK版と同じ動作: 引数に関係なく全店舗リストを返す
            return exampleStoreLocations;
        default:
            return { result: true };
    }
}

// /api/responsesを呼び出すヘルパー関数
async function fetchResponsesMessage(body: any): Promise<any> {
    try {
        const response = await fetch('/api/responses', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            // 順次ツール呼び出しを強制（supervisorAgent.tsと同じ）
            body: JSON.stringify({ ...body, parallel_tool_calls: false }),
        });

        if (!response.ok) {
            console.warn('[Tools] Server returned an error:', response.status);
            return { error: 'Something went wrong.' };
        }

        const completion = await response.json();
        return completion;
    } catch (error) {
        console.error('[Tools] Error fetching responses:', error);
        return { error: 'Something went wrong.' };
    }
}

/**
 * スーパーバイザーが返すツール呼び出しを反復的に処理し、
 * 最終的なテキスト応答を返す関数
 * supervisorAgent.tsのhandleToolCalls関数と同じロジック
 */
async function handleToolCalls(body: any, response: any): Promise<string | { error: string }> {
    let currentResponse = response;

    while (true) {
        if (currentResponse?.error) {
            return { error: 'Something went wrong.' };
        }

        const outputItems: any[] = currentResponse.output ?? [];

        // 出力内のすべてのfunction_callを収集
        const functionCalls = outputItems.filter((item) => item.type === 'function_call');

        if (functionCalls.length === 0) {
            // これ以上のfunction callがない場合、最終的なアシスタントメッセージを構築
            const assistantMessages = outputItems.filter((item) => item.type === 'message');

            const finalText = assistantMessages
                .map((msg: any) => {
                    const contentArr = msg.content ?? [];
                    return contentArr
                        .filter((c: any) => c.type === 'output_text')
                        .map((c: any) => c.text)
                        .join('');
                })
                .join('\n');

            return finalText;
        }

        // スーパーバイザーモデルが返した各ツール呼び出しを実行し、
        // その出力をfunction_call_outputとしてリクエストボディに追加
        for (const toolCall of functionCalls) {
            const fName = toolCall.name;
            const args = JSON.parse(toolCall.arguments || '{}');
            const toolRes = getToolResponse(fName);

            // function_callとその結果をbodyに追加
            body.input.push(
                {
                    type: 'function_call',
                    call_id: toolCall.call_id,
                    name: toolCall.name,
                    arguments: toolCall.arguments,
                },
                {
                    type: 'function_call_output',
                    call_id: toolCall.call_id,
                    output: JSON.stringify(toolRes),
                }
            );
        }

        // ツール出力を含めて次のリクエストを送信
        currentResponse = await fetchResponsesMessage(body);
    }
}

// 会話履歴を使って getNextResponseFromSupervisor を実行する関数
// supervisorAgent.tsのexecute関数と同じロジック
export async function executeGetNextResponseFromSupervisor(
    context: string,
    conversationHistory: TranscriptItem[]
): Promise<any> {
    // 会話履歴をフィルタリング（MESSAGEタイプのみ）
    const filteredLogs = conversationHistory.filter(
        (item) => item.type === 'MESSAGE' && !item.isHidden
    );

    // 会話履歴が空でも処理を続行
    if (filteredLogs.length === 0) {
        console.log('[Tools] No conversation history available, but proceeding with context only');
    }

    const body: any = {
        model: 'gpt-4o-mini',
        input: [
            {
                type: 'message',
                role: 'system',
                content: supervisorAgentInstructions,
            },
            {
                type: 'message',
                role: 'user',
                content: `==== Conversation History ====
${JSON.stringify(filteredLogs, null, 2)}

==== Relevant Context From Last User Message ===
${context}
`,
            },
        ],
        tools: supervisorAgentTools,
    };

    const response = await fetchResponsesMessage(body);

    if (response.error) {
        console.error('[Tools] Error from supervisor:', response.error);
        return { error: 'Something went wrong.' };
    }

    const finalText = await handleToolCalls(body, response);
    if ((finalText as any)?.error) {
        return { error: 'Something went wrong.' };
    }

    return { nextResponse: finalText as string };
}
