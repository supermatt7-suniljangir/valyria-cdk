import { Construct } from "constructs";
import * as cdk from "aws-cdk-lib";
import { UserStack } from "./userStack";
import { STAGES } from "../utils/stages";
import { AuthStack } from "./authStack";

interface PipelineStageProps {
  stageName?: STAGES;
  removalPolicy?: cdk.RemovalPolicy;
}

export class PipelineStage extends cdk.Stage {
  constructor(scope: Construct, id: string, props: PipelineStageProps) {
    super(scope, id, props);
    const {
      stageName = STAGES.DEV,
      removalPolicy = cdk.RemovalPolicy.DESTROY,
    } = props || {};

    const demoStack = new UserStack(this, `user-${stageName}`, {
      stageName: stageName,
      removalPolicy: removalPolicy,
    });
    const authStack = new AuthStack(this, `auth-${stageName}`, {
      stageName: stageName,
      removalPolicy: removalPolicy,
    });
  }
}
