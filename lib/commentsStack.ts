import * as cdk from "aws-cdk-lib";
import { aws_lambda as lambda } from "aws-cdk-lib";
import { aws_lambda_nodejs as lambda_nodejs } from "aws-cdk-lib";
import { aws_dynamodb as dynamodb } from "aws-cdk-lib";
import { aws_apigateway as apigateway } from "aws-cdk-lib";
import { aws_iam as iam } from "aws-cdk-lib";
import { Stack, StackProps } from "aws-cdk-lib";
import { Construct } from "constructs";
import * as path from "path";

import { STAGES } from "../utils/stages";
import config from "../utils/config";
import { commonNodeJsFunctionBundling } from "../utils/bundling";
import { addCorsToResponses } from "../utils/others";

interface CommentStackProps extends StackProps {
  stageName: string;
  removalPolicy: cdk.RemovalPolicy;
}

export class CommentStack extends Stack {
  public readonly commentTable: dynamodb.Table;

  constructor(scope: Construct, id: string, props: CommentStackProps) {
    super(scope, id, props);

    const { stageName = STAGES.DEV, removalPolicy = cdk.RemovalPolicy.RETAIN } =
      props || {};

    // Create Comment table
    this.commentTable = new dynamodb.Table(this, "CommentTable", {
      tableName: config.COMMENTS_TABLE_NAME(stageName),
      partitionKey: {
        name: "projectId",
        type: dynamodb.AttributeType.STRING,
      },
      sortKey: {
        name: "commentId",
        type: dynamodb.AttributeType.STRING,
      },
      billingMode: dynamodb.BillingMode.PAY_PER_REQUEST,
      deletionProtection:
        removalPolicy == cdk.RemovalPolicy.RETAIN ? true : false,
      pointInTimeRecovery: true,
      removalPolicy: removalPolicy,
      stream: dynamodb.StreamViewType.NEW_AND_OLD_IMAGES, // Useful for notifications
    });

    // Add GSI for user-based queries
    this.commentTable.addGlobalSecondaryIndex({
      indexName: `commentTableIndex-${stageName}-userId`,
      partitionKey: {
        name: "userId",
        type: dynamodb.AttributeType.STRING,
      },
      sortKey: {
        name: "createdAt",
        type: dynamodb.AttributeType.STRING,
      },
      projectionType: dynamodb.ProjectionType.ALL,
    });

    // Add LSI for time-based queries
    this.commentTable.addLocalSecondaryIndex({
      indexName: `commentTableIndex-${stageName}-recent`,
      sortKey: {
        name: "createdAt",
        type: dynamodb.AttributeType.STRING,
      },
      projectionType: dynamodb.ProjectionType.ALL,
    });

    // Create Lambda role
    const lambdaRole = new iam.Role(this, "CommentLambdaRole", {
      assumedBy: new iam.ServicePrincipal("lambda.amazonaws.com"),
      managedPolicies: [
        iam.ManagedPolicy.fromAwsManagedPolicyName(
          "service-role/AWSLambdaBasicExecutionRole"
        ),
      ],
    });

    // Create Lambda functions
    const getProjectComments = new lambda_nodejs.NodejsFunction(
      this,
      "getProjectComments",
      {
        functionName: `${stageName}-getProjectComments`,
        runtime: lambda.Runtime.NODEJS_20_X,
        entry: path.join(__dirname, "../lambda/comment/getProjectComments.ts"),
        handler: "handler",
        environment: {
          COMMENT_TABLE_NAME: this.commentTable.tableName,
          JWT_SECRET_NAME: config.AWS_SECRET.JWT_SECRET(stageName),
          STAGE: stageName,
        },
        role: lambdaRole,
        bundling: commonNodeJsFunctionBundling,
      }
    );

    const getUserComments = new lambda_nodejs.NodejsFunction(
      this,
      "getUserComments",
      {
        functionName: `${stageName}-getUserComments`,
        runtime: lambda.Runtime.NODEJS_20_X,
        entry: path.join(__dirname, "../lambda/comment/getUserComments.ts"),
        handler: "handler",
        environment: {
          COMMENT_TABLE_NAME: this.commentTable.tableName,
          JWT_SECRET_NAME: config.AWS_SECRET.JWT_SECRET(stageName),
          STAGE: stageName,
        },
        role: lambdaRole,
        bundling: commonNodeJsFunctionBundling,
      }
    );

    const createComment = new lambda_nodejs.NodejsFunction(
      this,
      "createComment",
      {
        functionName: `${stageName}-createComment`,
        runtime: lambda.Runtime.NODEJS_20_X,
        entry: path.join(__dirname, "../lambda/comment/createComment.ts"),
        handler: "handler",
        environment: {
          COMMENT_TABLE_NAME: this.commentTable.tableName,
          JWT_SECRET_NAME: config.AWS_SECRET.JWT_SECRET(stageName),
          STAGE: stageName,
        },
        role: lambdaRole,
        bundling: commonNodeJsFunctionBundling,
      }
    );

    const deleteComment = new lambda_nodejs.NodejsFunction(
      this,
      "deleteComment",
      {
        functionName: `${stageName}-deleteComment`,
        runtime: lambda.Runtime.NODEJS_20_X,
        entry: path.join(__dirname, "../lambda/comment/deleteComment.ts"),
        handler: "handler",
        environment: {
          COMMENT_TABLE_NAME: this.commentTable.tableName,
          JWT_SECRET_NAME: config.AWS_SECRET.JWT_SECRET(stageName),
          STAGE: stageName,
        },
        role: lambdaRole,
        bundling: commonNodeJsFunctionBundling,
      }
    );

    // Grant permissions
    const lambdaFunctions = [
      getProjectComments,
      getUserComments,
      createComment,
      deleteComment,
    ];

    lambdaFunctions.forEach((fn) => {
      this.commentTable.grantReadWriteData(fn);
      fn.addToRolePolicy(
        new iam.PolicyStatement({
          actions: ["secretsmanager:GetSecretValue"],
          resources: [
            `arn:aws:secretsmanager:${this.region}:${
              this.account
            }:secret:${config.AWS_SECRET.JWT_SECRET(stageName)}*`,
          ],
        })
      );
    });

    // Create API Gateway
    const api = new apigateway.RestApi(this, "CommentAPI", {
      restApiName: `${stageName}-CommentAPI`,
      defaultCorsPreflightOptions: config.DEFAULT_CORS_PREFLIGHT_OPTIONS,
      deployOptions: config.DEPLOY_OPTIONS[stageName as STAGES],
    });
    addCorsToResponses(api);

    // Add routes
    const commentResource = api.root.addResource("comment");

    // GET /comment/project/{projectId} - Get project comments
    const projectCommentResource = commentResource
      .addResource("project")
      .addResource("{projectId}");
    projectCommentResource.addMethod(
      "GET",
      new apigateway.LambdaIntegration(getProjectComments)
    );

    // GET /comment/user/{userId} - Get user comments
    const userCommentResource = commentResource
      .addResource("user")
      .addResource("{userId}");
    userCommentResource.addMethod(
      "GET",
      new apigateway.LambdaIntegration(getUserComments)
    );

    // POST /comment - Create comment
    commentResource.addMethod(
      "POST",
      new apigateway.LambdaIntegration(createComment)
    );

    // PUT /comment/{commentId} - Update comment
    const singleCommentResource = commentResource.addResource("{commentId}");

    // DELETE /comment/{commentId} - Delete comment
    singleCommentResource.addMethod(
      "DELETE",
      new apigateway.LambdaIntegration(deleteComment)
    );

    // Outputs
    new cdk.CfnOutput(this, "CommentApiUrl", {
      value: api.url,
      description: "The base URL of the Comment API",
      exportName: "CommentApiUrlOutput",
    }
  );

    // Apply removal policy
    api.applyRemovalPolicy(removalPolicy);
    lambdaFunctions.forEach((resource) => {
      const cfnResource = resource.node.defaultChild as cdk.CfnResource;
      cfnResource.applyRemovalPolicy(removalPolicy);
    });

    // Add tags
    cdk.Tags.of(this).add("Stage", stageName);
  }
}
