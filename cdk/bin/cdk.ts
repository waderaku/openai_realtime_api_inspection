#!/usr/bin/env node
import * as cdk from 'aws-cdk-lib';
import { OpenAIRealtimeStack } from '../lib/openai-realtime-stack';

const app = new cdk.App();

new OpenAIRealtimeStack(app, 'OpenAIRealtimeStack', {
  env: {
    account: process.env.CDK_DEFAULT_ACCOUNT,
    region: process.env.CDK_DEFAULT_REGION || 'ap-northeast-1',
  },
  description: 'OpenAI Realtime API FastAPI Server on ECS with ALB',
});
