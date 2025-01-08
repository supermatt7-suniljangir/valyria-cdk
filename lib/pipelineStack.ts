import * as cdk from "aws-cdk-lib";
import { Construct } from "constructs";
import * as iam from "aws-cdk-lib/aws-iam";
import {
  CodePipeline,
  CodePipelineSource,
  ShellStep,
} from "aws-cdk-lib/pipelines";
import { PipelineStage } from "./pipelineStage";
import { STAGES } from "../utils/stages";

interface PipelineStackProps extends cdk.StackProps {
  stageName: STAGES;
  removalPolicy: cdk.RemovalPolicy;
}

export class PipelineStack extends cdk.Stack {
  constructor(scope: Construct, id: string, props?: PipelineStackProps) {
    super(scope, id, props);
    const {
      stageName = STAGES.DEV,
      removalPolicy = cdk.RemovalPolicy.DESTROY,
    } = props || {};

    // Include stageName in logical IDs to keep them unique across pipelines
    const pipelineRole = new iam.Role(
      this,
      `Valyria-CDKPipelineRole-${stageName}`,
      {
        assumedBy: new iam.ServicePrincipal("codepipeline.amazonaws.com"),
        description: `Role used by CodePipeline to deploy CDK stacks for ${stageName}`,
        managedPolicies: [
          iam.ManagedPolicy.fromAwsManagedPolicyName(
            "AWSCodePipeline_FullAccess"
          ),
          iam.ManagedPolicy.fromAwsManagedPolicyName("AWSCodeBuildAdminAccess"),
          iam.ManagedPolicy.fromAwsManagedPolicyName("AdministratorAccess"),
        ],
      }
    );

    const pipeline = new CodePipeline(this, `Valyria-PipelineId-${stageName}`, {
      pipelineName: `Valyria-CDKPipeline-${stageName}`,
      role: pipelineRole,
      synth: new ShellStep("Synth", {
        input: CodePipelineSource.gitHub(
          "supermatt7-suniljangir/valyria-cdk",
          stageName === STAGES.DEV ? "main-dev" : "main",
          {
            authentication: cdk.SecretValue.secretsManager("CDK-GITHUB-TOKEN"),
          }
        ),
        commands: [
          "npm ci",
          "npm run build",
          `npx cdk synth -c stage=${stageName}`,
        ],
        primaryOutputDirectory: "cdk.out",
      }),
    });

    pipeline.addStage(
      new PipelineStage(this, `CDK-Deployment-Stage-${stageName}`, {
        stageName: stageName,
        removalPolicy: removalPolicy,
      })
    );
  }
}
