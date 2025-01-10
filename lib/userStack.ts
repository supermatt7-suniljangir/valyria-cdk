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

interface UserStackProps extends StackProps {
  stageName: string;
  removalPolicy: cdk.RemovalPolicy;
}

export class UserStack extends Stack {
  public readonly userTable: dynamodb.Table;

  constructor(scope: Construct, id: string, props: UserStackProps) {
    super(scope, id, props);

    const { stageName = STAGES.DEV, removalPolicy = cdk.RemovalPolicy.RETAIN } =
      props || {};

    // Create User table
    this.userTable = new dynamodb.Table(this, "UserTable", {
      tableName: config.USER_TABLE_NAME(stageName),
      partitionKey: {
        name: "userId",
        type: dynamodb.AttributeType.STRING,
      },
      billingMode: dynamodb.BillingMode.PAY_PER_REQUEST,
      deletionProtection:
        removalPolicy == cdk.RemovalPolicy.RETAIN ? true : false,
      pointInTimeRecovery: true,
      removalPolicy: removalPolicy,
    });

    // Add GSIs for user lookups
    this.userTable.addGlobalSecondaryIndex({
      indexName: `userTableIndex-${stageName}-email`,
      partitionKey: { name: "email", type: dynamodb.AttributeType.STRING },
      sortKey: { name: "createdAt", type: dynamodb.AttributeType.STRING },
      projectionType: dynamodb.ProjectionType.INCLUDE,
      nonKeyAttributes: ["avatar", "availableForHire", "fullName"],
    });

    this.userTable.addGlobalSecondaryIndex({
      indexName: `userTableIndex-${stageName}-fullName`,
      partitionKey: { name: "fullName", type: dynamodb.AttributeType.STRING },
      projectionType: dynamodb.ProjectionType.INCLUDE,
      nonKeyAttributes: ["email", "avatar", "availableForHire"],
    });

    // Create Lambda role
    const lambdaRole = new iam.Role(this, "UserLambdaRole", {
      assumedBy: new iam.ServicePrincipal("lambda.amazonaws.com"),
      managedPolicies: [
        iam.ManagedPolicy.fromAwsManagedPolicyName(
          "service-role/AWSLambdaBasicExecutionRole"
        ),
      ],
    });

    // Create Lambda functions
    const getUserProfile = new lambda_nodejs.NodejsFunction(
      this,
      "getUserProfile",
      {
        functionName: `${stageName}-getUserProfile`,
        runtime: lambda.Runtime.NODEJS_20_X,
        entry: path.join(__dirname, "../lambda/user/getProfile.ts"),
        handler: "handler",
        environment: {
          USER_TABLE_NAME: this.userTable.tableName,
          JWT_SECRET_NAME: config.AWS_SECRET.JWT_SECRET(stageName),
          STAGE: stageName,
        },
        role: lambdaRole,
        bundling: commonNodeJsFunctionBundling,
      }
    );

    const updateUserProfile = new lambda_nodejs.NodejsFunction(
      this,
      "updateUserProfile",
      {
        functionName: `${stageName}-updateUserProfile`,
        runtime: lambda.Runtime.NODEJS_20_X,
        entry: path.join(__dirname, "../lambda/user/updateProfile.ts"),
        handler: "handler",
        environment: {
          USER_TABLE_NAME: this.userTable.tableName,
          JWT_SECRET_NAME: config.AWS_SECRET.JWT_SECRET(stageName),
          STAGE: stageName,
        },
        role: lambdaRole,
        bundling: commonNodeJsFunctionBundling,
      }
    );

    // Grant permissions
    this.userTable.grantReadWriteData(getUserProfile);
    this.userTable.grantReadWriteData(updateUserProfile);

    // Add Secrets Manager permissions
    [getUserProfile, updateUserProfile].forEach((fn) => {
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
    const api = new apigateway.RestApi(this, "UserAPI", {
      restApiName: `${stageName}-UserAPI`,
      defaultCorsPreflightOptions: config.DEFAULT_CORS_PREFLIGHT_OPTIONS,
      deployOptions: config.DEPLOY_OPTIONS[stageName as STAGES],
    });
    addCorsToResponses(api);

    // Add routes
    const userResource = api.root.addResource("user");
    userResource.addMethod(
      "GET",
      new apigateway.LambdaIntegration(getUserProfile)
    );
    userResource.addMethod(
      "PUT",
      new apigateway.LambdaIntegration(updateUserProfile)
    );

    // Outputs
    new cdk.CfnOutput(this, "UserApiUrl", {
      value: api.url,
      description: "The base URL of the User API",
      exportName: "UserApiUrlOutput",
    });

    // Apply removal policy
    api.applyRemovalPolicy(removalPolicy);
    [getUserProfile, updateUserProfile].forEach((resource) => {
      const cfnResource = resource.node.defaultChild as cdk.CfnResource;
      cfnResource.applyRemovalPolicy(removalPolicy);
    });

    // Add tags
    cdk.Tags.of(this).add("Stage", stageName);
  }
}
