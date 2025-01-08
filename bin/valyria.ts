import * as cdk from "aws-cdk-lib";
import { App } from "aws-cdk-lib";
import { PipelineStack } from "../lib/pipelineStack";
import { STAGES } from "../utils/stages";

const app = new App();

function createPipelineStack(
  stageName: STAGES,
  removalPolicy: cdk.RemovalPolicy
): void {
  new PipelineStack(app, `Valyria-PipelineStack-${stageName}`, {
    stageName,
    env: {
      account: process.env.CDK_DEFAULT_ACCOUNT || "225989334376",
      region: process.env.CDK_DEFAULT_REGION || "us-east-1",
    },
    removalPolicy,
  });
}

const devPipeline = createPipelineStack(STAGES.DEV, cdk.RemovalPolicy.DESTROY);
// const prodPipeline = createPipelineStack(STAGES.PROD, cdk.RemovalPolicy.RETAIN);

app.synth();
