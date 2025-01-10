import { Construct } from "constructs";
import * as cdk from "aws-cdk-lib";
import { STAGES } from "../utils/stages";
import { UserStack } from "./userStack";
import { AuthStack } from "./authStack";
import { FeedbackStack } from "./feedbackStack";
import { AppreciationStack } from "./appreciationStack";
import { BookmarkStack } from "./bookmarkStack";
import { FollowerStack } from "./followerStack";
import { CommentStack } from "./commentsStack";

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

    const userStack = new UserStack(this, `user-${stageName}`, {
      stageName: stageName,
      removalPolicy: removalPolicy,
    });
    const feedbackStack = new FeedbackStack(this, `feedback-${stageName}`, {
      stageName: stageName,
      removalPolicy: removalPolicy,
    });
    const followStack = new FollowerStack(this, `follow-${stageName}`, {
      stageName: stageName,
      removalPolicy: removalPolicy,
    });
    const comment = new CommentStack(this, `comment-${stageName}`, {
      stageName: stageName,
      removalPolicy: removalPolicy,
    });
    const bookmarkStack = new BookmarkStack(this, `bookmark-${stageName}`, {
      stageName: stageName,
      removalPolicy: removalPolicy,
    });

    const appreciationStack = new AppreciationStack(
      this,
      `appreciation-${stageName}`,
      {
        stageName: stageName,
        removalPolicy: removalPolicy,
      }
    );

    const authStack = new AuthStack(this, `auth-${stageName}`, {
      stageName: stageName,
      removalPolicy: removalPolicy,
      userTable: userStack.userTable,
    });
  }
}
