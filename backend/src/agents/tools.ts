import { tool } from '@openai/agents';

/**
 * サンプルデータ（実際の実装では外部APIやDBから取得）
 */
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

/**
 * ポリシードキュメント検索ツール
 */
export const lookupPolicyDocument = tool({
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
    execute: async (args: { topic: string }) => {
        console.log(`[Tool] lookupPolicyDocument called with topic: ${args.topic}`);
        const topic = args.topic?.toLowerCase() || '';
        const matchingDocs = SAMPLE_DATA.policyDocs.filter(
            (doc) => doc.topic.includes(topic) || doc.content.toLowerCase().includes(topic)
        );
        const result = matchingDocs.length > 0 ? matchingDocs : SAMPLE_DATA.policyDocs;
        return JSON.stringify(result, null, 2);
    },
});

/**
 * ユーザーアカウント情報取得ツール
 */
export const getUserAccountInfo = tool({
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
    execute: async (args: { phone_number: string }) => {
        console.log(`[Tool] getUserAccountInfo called with phone: ${args.phone_number}`);
        return JSON.stringify(SAMPLE_DATA.accountInfo, null, 2);
    },
});

/**
 * 最寄り店舗検索ツール
 */
export const findNearestStore = tool({
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
    execute: async (args: { zip_code: string }) => {
        console.log(`[Tool] findNearestStore called with zip: ${args.zip_code}`);
        return JSON.stringify(SAMPLE_DATA.storeLocations, null, 2);
    },
});

/**
 * 全ツールのリスト
 */
export const ALL_TOOLS = [
    lookupPolicyDocument,
    getUserAccountInfo,
    findNearestStore,
];
