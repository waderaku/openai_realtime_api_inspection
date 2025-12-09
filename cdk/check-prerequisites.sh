#!/bin/bash

# AWS認証情報とデプロイ前提条件をチェックするスクリプト

set -e

# カラーコード
RED='\033[0;31m'
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
BLUE='\033[0;34m'
NC='\033[0m' # No Color

echo "=========================================="
echo "AWS ECS デプロイ - 前提条件チェック"
echo "=========================================="
echo ""

ERRORS=0
WARNINGS=0

# AWS CLI
echo -n "AWS CLI: "
if command -v aws &> /dev/null; then
    VERSION=$(aws --version 2>&1 | head -n1)
    echo -e "${GREEN}✓${NC} インストール済み ($VERSION)"
else
    echo -e "${RED}✗${NC} インストールされていません"
    echo "  → https://aws.amazon.com/cli/ からインストールしてください"
    ((ERRORS++))
fi

# Node.js
echo -n "Node.js: "
if command -v node &> /dev/null; then
    VERSION=$(node --version)
    echo -e "${GREEN}✓${NC} インストール済み ($VERSION)"
else
    echo -e "${RED}✗${NC} インストールされていません"
    echo "  → https://nodejs.org/ からインストールしてください"
    ((ERRORS++))
fi

# Docker
echo -n "Docker: "
if command -v docker &> /dev/null; then
    VERSION=$(docker --version)
    echo -e "${GREEN}✓${NC} インストール済み ($VERSION)"
else
    echo -e "${RED}✗${NC} インストールされていません"
    echo "  → https://www.docker.com/ からインストールしてください"
    ((ERRORS++))
fi

# CDK
echo -n "AWS CDK: "
if command -v cdk &> /dev/null; then
    VERSION=$(cdk --version)
    echo -e "${GREEN}✓${NC} インストール済み ($VERSION)"
elif [ -f "node_modules/.bin/cdk" ]; then
    echo -e "${YELLOW}⚠${NC} ローカルにインストール済み (npm run cdk で実行可能)"
    ((WARNINGS++))
else
    echo -e "${YELLOW}⚠${NC} グローバルインストールなし (npm installで解決)"
    ((WARNINGS++))
fi

echo ""
echo "=========================================="
echo "AWS認証情報チェック"
echo "=========================================="
echo ""

# AWS認証情報
echo -n "AWS認証情報: "
if aws sts get-caller-identity &> /dev/null; then
    echo -e "${GREEN}✓${NC} 設定済み"
    
    AWS_ACCOUNT=$(aws sts get-caller-identity --query Account --output text)
    AWS_REGION=$(aws configure get region 2>/dev/null || echo "未設定")
    AWS_USER=$(aws sts get-caller-identity --query Arn --output text)
    
    echo ""
    echo "  📋 AWSアカウントID: ${BLUE}${AWS_ACCOUNT}${NC}"
    echo "  🌍 リージョン: ${BLUE}${AWS_REGION}${NC}"
    echo "  👤 IAMユーザー/ロール: ${BLUE}${AWS_USER}${NC}"
    
    if [ "$AWS_REGION" = "未設定" ]; then
        echo ""
        echo -e "  ${YELLOW}⚠ 警告: リージョンが設定されていません${NC}"
        echo "  → 以下のコマンドで設定してください:"
        echo "    aws configure set region ap-northeast-1"
        ((WARNINGS++))
    fi
else
    echo -e "${RED}✗${NC} 設定されていません"
    echo ""
    echo "  AWS認証情報を設定する必要があります。"
    echo ""
    echo "  【推奨】AWS CLIで設定:"
    echo -e "    ${GREEN}aws configure${NC}"
    echo ""
    echo "  または環境変数で設定:"
    echo -e "    ${GREEN}export AWS_ACCESS_KEY_ID=your-access-key-id${NC}"
    echo -e "    ${GREEN}export AWS_SECRET_ACCESS_KEY=your-secret-access-key${NC}"
    echo -e "    ${GREEN}export AWS_DEFAULT_REGION=ap-northeast-1${NC}"
    echo ""
    echo "  📖 詳細: ./AWS_CREDENTIALS_SETUP.md"
    echo ""
    ((ERRORS++))
fi

echo ""
echo "=========================================="
echo "IAM権限チェック"
echo "=========================================="
echo ""

if aws sts get-caller-identity &> /dev/null; then
    echo "基本的な権限をチェック中..."
    echo ""
    
    # ECS権限
    echo -n "  ECS権限: "
    if aws ecs list-clusters &> /dev/null; then
        echo -e "${GREEN}✓${NC}"
    else
        echo -e "${RED}✗${NC}"
        echo "    → ECS関連の権限が不足している可能性があります"
        ((WARNINGS++))
    fi
    
    # EC2/VPC権限
    echo -n "  EC2/VPC権限: "
    if aws ec2 describe-vpcs --max-results 1 &> /dev/null; then
        echo -e "${GREEN}✓${NC}"
    else
        echo -e "${RED}✗${NC}"
        echo "    → EC2/VPC関連の権限が不足している可能性があります"
        ((WARNINGS++))
    fi
    
    # CloudFormation権限
    echo -n "  CloudFormation権限: "
    if aws cloudformation list-stacks --stack-status-filter CREATE_COMPLETE --max-results 1 &> /dev/null; then
        echo -e "${GREEN}✓${NC}"
    else
        echo -e "${RED}✗${NC}"
        echo "    → CloudFormation関連の権限が不足している可能性があります"
        ((WARNINGS++))
    fi
    
    echo ""
    if [ $WARNINGS -gt 0 ]; then
        echo -e "${YELLOW}⚠ 一部の権限チェックに失敗しました${NC}"
        echo "  デプロイ時に権限エラーが発生する可能性があります。"
        echo "  IAM管理者に以下のポリシーのアタッチを依頼してください:"
        echo "    • AmazonECS_FullAccess"
        echo "    • AmazonVPCFullAccess"
        echo "    • CloudFormationFullAccess"
        echo "    • IAMFullAccess (IAMロール作成用)"
        echo "  または AdministratorAccess (開発環境のみ)"
        echo ""
    fi
fi

echo ""
echo "=========================================="
echo "プロジェクト設定チェック"
echo "=========================================="
echo ""

# CDK依存関係
echo -n "CDK依存関係: "
if [ -f "package.json" ] && [ -d "node_modules" ]; then
    echo -e "${GREEN}✓${NC} インストール済み"
elif [ -f "package.json" ]; then
    echo -e "${YELLOW}⚠${NC} npm installが必要です"
    ((WARNINGS++))
else
    echo -e "${RED}✗${NC} package.jsonが見つかりません"
    ((ERRORS++))
fi

# FastAPI Dockerfile
echo -n "FastAPI Dockerfile: "
if [ -f "../fastapi/Dockerfile" ]; then
    echo -e "${GREEN}✓${NC} 存在します"
else
    echo -e "${RED}✗${NC} 見つかりません"
    ((ERRORS++))
fi

echo ""
echo "=========================================="
echo "チェック結果"
echo "=========================================="
echo ""

if [ $ERRORS -eq 0 ] && [ $WARNINGS -eq 0 ]; then
    echo -e "${GREEN}✓ すべてのチェックに合格しました！${NC}"
    echo ""
    echo "デプロイを開始できます:"
    echo -e "  ${GREEN}./deploy.sh${NC}"
    echo ""
    exit 0
elif [ $ERRORS -eq 0 ]; then
    echo -e "${YELLOW}⚠ ${WARNINGS}個の警告があります${NC}"
    echo ""
    echo "デプロイは可能ですが、問題が発生する可能性があります。"
    echo "警告を確認して必要に応じて対処してください。"
    echo ""
    exit 0
else
    echo -e "${RED}✗ ${ERRORS}個のエラーがあります${NC}"
    if [ $WARNINGS -gt 0 ]; then
        echo -e "${YELLOW}⚠ ${WARNINGS}個の警告もあります${NC}"
    fi
    echo ""
    echo "エラーを解決してから再度実行してください。"
    echo ""
    echo "📖 詳細なガイド:"
    echo "  • AWS認証情報: ./AWS_CREDENTIALS_SETUP.md"
    echo "  • デプロイ手順: ./README.md"
    echo "  • クイックスタート: ./QUICKSTART.md"
    echo ""
    exit 1
fi
