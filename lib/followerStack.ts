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

interface FollowerStackProps extends StackProps {
  stageName: string;
  removalPolicy: cdk.RemovalPolicy;
}

export class FollowerStack extends Stack {
  public readonly followerTable: dynamodb.Table;

  constructor(scope: Construct, id: string, props: FollowerStackProps) {
    super(scope, id, props);

    const { stageName = STAGES.DEV, removalPolicy = cdk.RemovalPolicy.RETAIN } =
      props || {};

    // Create Follower table
    this.followerTable = new dynamodb.Table(this, "FollowerTable", {
      tableName: config.FOLLOWERS_TABLE_NAME(stageName),
      partitionKey: {
        name: "userId",
        type: dynamodb.AttributeType.STRING,
      },
      sortKey: {
        name: "followerId",
        type: dynamodb.AttributeType.STRING,
      },
      billingMode: dynamodb.BillingMode.PAY_PER_REQUEST,
      deletionProtection:
        removalPolicy == cdk.RemovalPolicy.RETAIN ? true : false,
      pointInTimeRecovery: true,
      removalPolicy: removalPolicy,
    });

    // Add GSI for follower-based queries
    this.followerTable.addGlobalSecondaryIndex({
      indexName: `followerTableIndex-${stageName}-followerId`,
      partitionKey: {
        name: "followerId",
        type: dynamodb.AttributeType.STRING,
      },
      sortKey: {
        name: "followedAt",
        type: dynamodb.AttributeType.STRING,
      },
      projectionType: dynamodb.ProjectionType.ALL,
    });

    // Create Lambda role
    const lambdaRole = new iam.Role(this, "FollowerLambdaRole", {
      assumedBy: new iam.ServicePrincipal("lambda.amazonaws.com"),
      managedPolicies: [
        iam.ManagedPolicy.fromAwsManagedPolicyName(
          "service-role/AWSLambdaBasicExecutionRole"
        ),
      ],
    });

    // Create Lambda functions
    const getFollowers = new lambda_nodejs.NodejsFunction(
      this,
      "getFollowers",
      {
        functionName: `${stageName}-getFollowers`,
        runtime: lambda.Runtime.NODEJS_20_X,
        entry: path.join(__dirname, "../lambda/follow/getFollowers.ts"),
        handler: "handler",
        environment: {
          FOLLOWER_TABLE_NAME: this.followerTable.tableName,
          JWT_SECRET_NAME: config.AWS_SECRET.JWT_SECRET(stageName),
          STAGE: stageName,
        },
        role: lambdaRole,
        bundling: commonNodeJsFunctionBundling,
      }
    );

    const getFollowing = new lambda_nodejs.NodejsFunction(
      this,
      "getFollowing",
      {
        functionName: `${stageName}-getFollowing`,
        runtime: lambda.Runtime.NODEJS_20_X,

        entry: path.join(__dirname, "../lambda/follow/getFollowing.ts"),
        handler: "handler",
        environment: {
          FOLLOWER_TABLE_NAME: this.followerTable.tableName,
          JWT_SECRET_NAME: config.AWS_SECRET.JWT_SECRET(stageName),
          STAGE: stageName,
        },
        role: lambdaRole,
        bundling: commonNodeJsFunctionBundling
      }
    );

    const toggleFollow = new lambda_nodejs.NodejsFunction(
      this,
      "toggleFollow",
      {
        functionName: `${stageName}-toggleFollow`,
        runtime: lambda.Runtime.NODEJS_20_X,
        entry: path.join(__dirname, "../lambda/follow/toggleFollow.ts"),
        handler: "handler",
        environment: {
          FOLLOWER_TABLE_NAME: this.followerTable.tableName,
          JWT_SECRET_NAME: config.AWS_SECRET.JWT_SECRET(stageName),
          STAGE: stageName,
        },
        role: lambdaRole,
        bundling: commonNodeJsFunctionBundling,
      }
    );

    // Grant permissions
    this.followerTable.grantReadWriteData(getFollowers);
    this.followerTable.grantReadWriteData(getFollowing);
    this.followerTable.grantReadWriteData(toggleFollow);

    // Add Secrets Manager permissions
    [getFollowers, getFollowing, toggleFollow].forEach((fn) => {
      fn.addToRolePolicy(
        new iam.PolicyStatement({
          actions: ["secretsmanager:GetSecretValue"],
          resources: [
            `arn:aws:secretsmanager:${this.region}:${
              this.account
            }:secret:${config.AWS_SECRET.JWT_SECRET(stageName)}*`],
        })
      );
    });

    // Create API Gateway
    const api = new apigateway.RestApi(this, "FollowerAPI", {
      restApiName: `${stageName}-FollowerAPI`,
      defaultCorsPreflightOptions: config.DEFAULT_CORS_PREFLIGHT_OPTIONS,
      deployOptions: config.DEPLOY_OPTIONS[stageName as STAGES],
    });
    addCorsToResponses(api);



    // Add routes
    const followResource = api.root.addResource("user");

    // GET /follow/followers - Get user's followers
    const followersResource = followResource.addResource("followers");
    followersResource.addMethod(
      "GET",
      new apigateway.LambdaIntegration(getFollowers)
    );


    // GET /follow/following - Get users being followed
    const followingResource = followResource.addResource("following");
    followingResource.addMethod("GET",
      new apigateway.LambdaIntegration(getFollowing));

    // POST /follow - Toggle follow status
    followResource.addMethod(
      "POST",
      new apigateway.LambdaIntegration(toggleFollow)
    );

    // Outputs
    new cdk.CfnOutput(this, "FollowerApiUrl", {
      value: api.url,
      description: "The base URL of the Follower API",
      exportName: "FollowerApiUrlOutput",
    });

    // Apply removal policy
    api.applyRemovalPolicy(removalPolicy);
    [getFollowers, getFollowing, toggleFollow].forEach((resource) => {
      const cfnResource = resource.node.defaultChild as cdk.CfnResource;
      cfnResource.applyRemovalPolicy(removalPolicy);
    }
  );

    // Add tags
    cdk.Tags.of(this).add("Stage", stageName);
  }
}
