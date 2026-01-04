import { Injectable, Logger } from '@nestjs/common';
import OpenAI from 'openai';

const SUPERVISOR_INSTRUCTIONS = `You are an expert customer service supervisor agent, tasked with providing responses to customer inquiries for NewTelco.

# Instructions
- Provide helpful, accurate, and concise responses to customer questions
- Use the available tools to look up information when needed
- Be professional and courteous
- Keep responses brief and suitable for voice conversation

# Available Information
You can look up:
- Policy documents and company information
- User account information (requires phone number)
- Store locations (requires zip code)

# Response Format
- Keep responses concise for voice conversation
- Do not use bullet points or lists
- Provide specific numbers when available
`;

const TOOLS: OpenAI.Responses.Tool[] = [
    {
        type: 'function',
        name: 'lookupPolicyDocument',
        description: 'Look up internal documents and policies by topic or keyword.',
        strict: true,
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
    },
    {
        type: 'function',
        name: 'getUserAccountInfo',
        description: 'Get user account information by phone number.',
        strict: true,
        parameters: {
            type: 'object',
            properties: {
                phone_number: {
                    type: 'string',
                    description: "User's phone number.",
                },
            },
            required: ['phone_number'],
            additionalProperties: false,
        },
    },
    {
        type: 'function',
        name: 'findNearestStore',
        description: 'Find the nearest store location given a zip code.',
        strict: true,
        parameters: {
            type: 'object',
            properties: {
                zip_code: {
                    type: 'string',
                    description: "Customer's 5-digit zip code.",
                },
            },
            required: ['zip_code'],
            additionalProperties: false,
        },
    },
];

// Sample data for tool responses
const SAMPLE_DATA = {
    policyDocs: [
        {
            id: 'ID-001',
            name: 'Return Policy',
            topic: 'returns',
            content: 'Products can be returned within 30 days of purchase with original receipt. Refunds are processed to the original payment method within 5-7 business days.',
        },
        {
            id: 'ID-002',
            name: 'Family Plan Policy',
            topic: 'family plan',
            content: 'The family plan allows up to 5 lines per account. All lines share a single data pool. Each additional line receives a 10% discount.',
        },
        {
            id: 'ID-003',
            name: 'International Calling',
            topic: 'international',
            content: 'International calls are billed at $0.25 per minute to most countries. International calling packages are available starting at $10/month for unlimited calls to 50+ countries.',
        },
    ],
    storeLocations: [
        {
            id: 'store-001',
            name: 'NewTelco Downtown',
            address: '123 Main St',
            city: 'New York',
            state: 'NY',
            zip: '10001',
            phone: '(212) 555-0100',
        },
        {
            id: 'store-002',
            name: 'NewTelco Midtown',
            address: '456 5th Ave',
            city: 'New York',
            state: 'NY',
            zip: '10018',
            phone: '(212) 555-7007',
        },
    ],
    accountInfo: {
        name: 'John Doe',
        phone: '(206) 555-1234',
        plan: 'Unlimited Plus',
        monthlyCharge: 85.00,
        dataUsage: '12.5 GB',
        lastBill: 95.50,
        address: '1234 Pine St, Seattle, WA 98101',
    },
};

@Injectable()
export class SupervisorService {
    private readonly logger = new Logger(SupervisorService.name);
    private openai: OpenAI;

    constructor() {
        // Responses API requires a regular API key (sk_), not ephemeral key (ek_)
        const apiKey = process.env.OPENAI_API_KEY;
        if (!apiKey) {
            this.logger.warn('OPENAI_API_KEY is not set. SupervisorService will not work.');
        }
        this.openai = new OpenAI({ apiKey });
    }

    /**
     * Generate a response to a user question using the Responses API.
     */
    async generateResponse(callId: string, userQuestion: string, conversationHistory?: string): Promise<string> {
        this.logger.log(`Generating response for: ${userQuestion}`);

        try {

            const messages: any[] = [
                {
                    type: 'message',
                    role: 'system',
                    content: SUPERVISOR_INSTRUCTIONS,
                },
                {
                    type: 'message',
                    role: 'user',
                    content: conversationHistory
                        ? `Previous conversation:\n${conversationHistory}\n\nCurrent question: ${userQuestion}`
                        : userQuestion,
                },
            ];

            let response = await this.openai.responses.create({
                model: 'gpt-4.1',
                input: messages,
                tools: TOOLS,
            });

            // Handle tool calls iteratively
            while (response.output?.some((item) => item.type === 'function_call')) {
                const functionCalls = response.output.filter((item) => item.type === 'function_call');

                for (const toolCall of functionCalls) {
                    if (toolCall.type !== 'function_call') continue;
                    const toolResult = this.executeToolCall(toolCall.name, JSON.parse(toolCall.arguments || '{}'));

                    messages.push({
                        type: 'function_call',
                        call_id: toolCall.call_id,
                        name: toolCall.name,
                        arguments: toolCall.arguments,
                    });
                    messages.push({
                        type: 'function_call_output',
                        call_id: toolCall.call_id,
                        output: JSON.stringify(toolResult),
                    });
                }

                response = await this.openai.responses.create({
                    model: 'gpt-4.1',
                    input: messages,
                    tools: TOOLS,
                });
            }

            // Extract the final text response
            const textOutput = response.output?.find((item) => item.type === 'message');
            if (textOutput && textOutput.type === 'message' && textOutput.content) {
                const textContent = textOutput.content.find((c) => c.type === 'output_text');
                if (textContent && textContent.type === 'output_text' && textContent.text) {
                    this.logger.log(`Generated response: ${textContent.text.substring(0, 100)}...`);
                    return textContent.text;
                }
            }

            return 'I apologize, but I was unable to generate a response. Please try again.';
        } catch (error) {
            this.logger.error(`Failed to generate response: ${error}`);
            return 'I apologize, but an error occurred. Please try again.';
        }
    }

    private executeToolCall(functionName: string, args: any): any {
        this.logger.log(`Executing tool: ${functionName} with args: ${JSON.stringify(args)}`);

        switch (functionName) {
            case 'lookupPolicyDocument':
                const topic = args.topic?.toLowerCase() || '';
                const matchingDocs = SAMPLE_DATA.policyDocs.filter(
                    (doc) => doc.topic.includes(topic) || doc.content.toLowerCase().includes(topic)
                );
                return matchingDocs.length > 0 ? matchingDocs : SAMPLE_DATA.policyDocs;

            case 'getUserAccountInfo':
                return SAMPLE_DATA.accountInfo;

            case 'findNearestStore':
                return SAMPLE_DATA.storeLocations;

            default:
                return { error: 'Unknown function' };
        }
    }
}

