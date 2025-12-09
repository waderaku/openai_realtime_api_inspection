import * as cdk from 'aws-cdk-lib';
import * as ec2 from 'aws-cdk-lib/aws-ec2';
import * as ecs from 'aws-cdk-lib/aws-ecs';
import * as ecr from 'aws-cdk-lib/aws-ecr';
import * as elbv2 from 'aws-cdk-lib/aws-elasticloadbalancingv2';
import * as logs from 'aws-cdk-lib/aws-logs';
import * as secretsmanager from 'aws-cdk-lib/aws-secretsmanager';
import { Construct } from 'constructs';

// ============================================================
// 2段階デプロイ方式（DevContainer/Docker未使用環境向け）
// ============================================================
// Step 1: npx cdk deploy -c deployService=false
//   → ECR, VPC, ALB等のインフラのみ作成
//
// Step 2: Docker環境でイメージをビルド＆ECRにプッシュ
//
// Step 3: npx cdk deploy -c deployService=true
//   → ECSサービスを作成
// ============================================================

export class OpenAIRealtimeStack extends cdk.Stack {
  constructor(scope: Construct, id: string, props?: cdk.StackProps) {
    super(scope, id, props);

    // コンテキストからECSサービスをデプロイするかどうかを取得
    // 初回はfalse（インフラのみ）、イメージプッシュ後にtrue
    const deployService = this.node.tryGetContext('deployService') === 'true';

    // ECRリポジトリの作成（Dockerイメージ用）
    const ecrRepository = new ecr.Repository(this, 'FastAPIRepository', {
      repositoryName: 'openai-realtime-fastapi',
      removalPolicy: cdk.RemovalPolicy.DESTROY,
      emptyOnDelete: true,
    });

    // VPCの作成（パブリックサブネットのみ、NAT Gateway不要）
    const vpc = new ec2.Vpc(this, 'OpenAIRealtimeVPC', {
      maxAzs: 2, // 2つのアベイラビリティゾーンを使用
      natGateways: 0, // NAT Gatewayなし（コスト削減）
      subnetConfiguration: [
        {
          name: 'Public',
          subnetType: ec2.SubnetType.PUBLIC,
          cidrMask: 24,
        },
      ],
    });

    // ECSクラスターの作成
    const cluster = new ecs.Cluster(this, 'OpenAIRealtimeCluster', {
      vpc,
      clusterName: 'openai-realtime-cluster',
      containerInsights: false, // コスト削減のためContainer Insightsは無効化
    });

    // CloudWatch Logsグループの作成（保持期間短縮でコスト削減）
    const logGroup = new logs.LogGroup(this, 'OpenAIRealtimeLogGroup', {
      logGroupName: '/ecs/openai-realtime-fastapi',
      retention: logs.RetentionDays.THREE_DAYS, // 3日間（コスト削減）
      removalPolicy: cdk.RemovalPolicy.DESTROY,
    });

    // OpenAI API Keyを保存するSecrets Managerシークレット
    const openaiApiKeySecret = new secretsmanager.Secret(this, 'OpenAIApiKey', {
      secretName: 'openai-realtime-api-key',
      description: 'OpenAI API Key for Realtime API',
      generateSecretString: {
        secretStringTemplate: JSON.stringify({ OPENAI_API_KEY: '' }),
        generateStringKey: 'password',
      },
    });

    // Application Load Balancerの作成
    const alb = new elbv2.ApplicationLoadBalancer(this, 'OpenAIRealtimeALB', {
      vpc,
      internetFacing: true, // インターネット向け
      loadBalancerName: 'openai-realtime-alb',
      vpcSubnets: {
        subnetType: ec2.SubnetType.PUBLIC,
      },
      idleTimeout: cdk.Duration.seconds(3600), // WebSocket用に1時間に延長
    });

    // ALBのセキュリティグループ設定
    alb.connections.allowFromAnyIpv4(ec2.Port.tcp(80), 'Allow HTTP traffic');
    alb.connections.allowFromAnyIpv4(ec2.Port.tcp(443), 'Allow HTTPS traffic');

    // ターゲットグループの作成
    const targetGroup = new elbv2.ApplicationTargetGroup(this, 'FastAPITargetGroup', {
      vpc,
      port: 8000,
      protocol: elbv2.ApplicationProtocol.HTTP,
      targetType: elbv2.TargetType.IP,
      targetGroupName: 'fastapi-target-group',
      healthCheck: {
        path: '/health',
        interval: cdk.Duration.seconds(30),
        timeout: cdk.Duration.seconds(5),
        healthyThresholdCount: 2,
        unhealthyThresholdCount: 3,
        healthyHttpCodes: '200',
      },
      deregistrationDelay: cdk.Duration.seconds(30),
      stickinessCookieDuration: cdk.Duration.days(1), // WebSocket用にスティッキーセッション追加
    });

    // HTTPリスナーの追加
    alb.addListener('HttpListener', {
      port: 80,
      protocol: elbv2.ApplicationProtocol.HTTP,
      defaultTargetGroups: [targetGroup],
    });

    // 出力（常に表示）
    new cdk.CfnOutput(this, 'ECRRepositoryURI', {
      value: ecrRepository.repositoryUri,
      description: 'ECR Repository URI - Push your Docker image here',
      exportName: 'OpenAIRealtimeECRURI',
    });

    new cdk.CfnOutput(this, 'LoadBalancerDNS', {
      value: alb.loadBalancerDnsName,
      description: 'ALB DNS Name',
      exportName: 'OpenAIRealtimeALBDNS',
    });

    new cdk.CfnOutput(this, 'LoadBalancerURL', {
      value: `http://${alb.loadBalancerDnsName}`,
      description: 'FastAPI Server URL',
    });

    new cdk.CfnOutput(this, 'WebSocketURL', {
      value: `ws://${alb.loadBalancerDnsName}/ws`,
      description: 'WebSocket Endpoint URL',
    });

    new cdk.CfnOutput(this, 'SecretArn', {
      value: openaiApiKeySecret.secretArn,
      description: 'OpenAI API Key Secret ARN',
    });

    new cdk.CfnOutput(this, 'ClusterName', {
      value: cluster.clusterName,
      description: 'ECS Cluster Name',
    });

    // ECSサービスのデプロイ（deployService=trueの場合のみ）
    if (deployService) {
      // タスク定義の作成（最小コスト設定）
      const taskDefinition = new ecs.FargateTaskDefinition(this, 'FastAPITaskDef', {
        memoryLimitMiB: 512, // 0.5GB（最小スペック）
        cpu: 256, // 0.25 vCPU（最小スペック）
        runtimePlatform: {
          operatingSystemFamily: ecs.OperatingSystemFamily.LINUX,
          cpuArchitecture: ecs.CpuArchitecture.X86_64,
        },
      });

      // Secrets Managerへのアクセス権限を付与
      openaiApiKeySecret.grantRead(taskDefinition.taskRole);

      // コンテナの追加（ECRリポジトリからイメージを取得）
      const container = taskDefinition.addContainer('FastAPIContainer', {
        containerName: 'fastapi-server',
        image: ecs.ContainerImage.fromEcrRepository(ecrRepository, 'latest'),
        logging: ecs.LogDrivers.awsLogs({
          streamPrefix: 'fastapi',
          logGroup: logGroup,
        }),
        environment: {
          PORT: '8000',
          PYTHONUNBUFFERED: '1',
        },
        secrets: {
          OPENAI_API_KEY: ecs.Secret.fromSecretsManager(openaiApiKeySecret, 'OPENAI_API_KEY'),
        },
        healthCheck: {
          command: ['CMD-SHELL', 'python -c "import urllib.request; urllib.request.urlopen(\'http://localhost:8000/health\')" || exit 1'],
          interval: cdk.Duration.seconds(30),
          timeout: cdk.Duration.seconds(10),
          retries: 3,
          startPeriod: cdk.Duration.seconds(60),
        },
      });

      container.addPortMappings({
        containerPort: 8000,
        protocol: ecs.Protocol.TCP,
      });

      // Fargateサービスの作成（パブリックサブネット、最小コスト構成）
      const fargateService = new ecs.FargateService(this, 'FastAPIService', {
        cluster,
        taskDefinition,
        serviceName: 'fastapi-service',
        desiredCount: 1,
        minHealthyPercent: 50,
        maxHealthyPercent: 200,
        healthCheckGracePeriod: cdk.Duration.seconds(60),
        assignPublicIp: true,
        vpcSubnets: {
          subnetType: ec2.SubnetType.PUBLIC,
        },
        enableExecuteCommand: true,
      });

      // ターゲットグループにサービスを登録
      fargateService.attachToApplicationTargetGroup(targetGroup);

      // ALBからのトラフィックを許可
      fargateService.connections.allowFrom(
        alb,
        ec2.Port.tcp(8000),
        'Allow traffic from ALB'
      );

      // オートスケーリングの設定
      const scaling = fargateService.autoScaleTaskCount({
        minCapacity: 1,
        maxCapacity: 5,
      });

      scaling.scaleOnCpuUtilization('CpuScaling', {
        targetUtilizationPercent: 70,
        scaleInCooldown: cdk.Duration.seconds(300),
        scaleOutCooldown: cdk.Duration.seconds(60),
      });

      scaling.scaleOnMemoryUtilization('MemoryScaling', {
        targetUtilizationPercent: 80,
        scaleInCooldown: cdk.Duration.seconds(300),
        scaleOutCooldown: cdk.Duration.seconds(60),
      });

      scaling.scaleOnRequestCount('RequestCountScaling', {
        requestsPerTarget: 500,
        targetGroup: targetGroup,
        scaleInCooldown: cdk.Duration.seconds(300),
        scaleOutCooldown: cdk.Duration.seconds(60),
      });

      new cdk.CfnOutput(this, 'ServiceName', {
        value: fargateService.serviceName,
        description: 'ECS Service Name',
      });
    } else {
      // deployService=falseの場合、次のステップを表示
      new cdk.CfnOutput(this, 'NextStep', {
        value: 'Push Docker image to ECR, then run: npx cdk deploy -c deployService=true',
        description: 'Next deployment step',
      });
    }

    new cdk.CfnOutput(this, 'CostEstimate', {
      value: 'Estimated Monthly Cost: ~$32-35 (No NAT Gateway, 256 CPU/512MB, 1 task)',
      description: 'Cost Optimization Info',
    });
  }
}