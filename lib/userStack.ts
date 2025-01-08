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

    const userTableIndexNameForEmail =
      config.USER_TABLE_INDEX_NAME_FOR_EMAIL(stageName);

    // Create a DynamoDB table named 'User' with email as the partition key
    this.userTable = new dynamodb.Table(this, "UserTable", {
      partitionKey: { name: "id", type: dynamodb.AttributeType.STRING },
      tableName: config.USER_TABLE_NAME(stageName),
      billingMode: dynamodb.BillingMode.PAY_PER_REQUEST,
      deletionProtection:
        removalPolicy == cdk.RemovalPolicy.RETAIN ? true : false,
      pointInTimeRecovery: true,
      removalPolicy: removalPolicy, // Set removal policy
    });

    // Add a Global Secondary Index for email with specific attribute projections
    // This index is useful to fetch user details during authentication based on email.
    this.userTable.addGlobalSecondaryIndex({
      indexName: `userTableIndex-${stageName}`,
      partitionKey: { name: "email", type: dynamodb.AttributeType.STRING },
      projectionType: dynamodb.ProjectionType.INCLUDE,
      nonKeyAttributes: ["profile_state"], // id is automatically included as it's the table's primary key
    });

    // Create a role for Lambda functions with CloudWatch logs permissions
    const lambdaRole = new iam.Role(this, "LambdaExecutionRole", {
      assumedBy: new iam.ServicePrincipal("lambda.amazonaws.com"),
      managedPolicies: [
        iam.ManagedPolicy.fromAwsManagedPolicyName(
          "service-role/AWSLambdaBasicExecutionRole"
        ),
      ],
    });

    const getUserProfile = new lambda_nodejs.NodejsFunction(
      this,
      "getUserProfile",
      {
        functionName: `${stageName}-updateUser`,
        runtime: lambda.Runtime.NODEJS_20_X, // Import Runtime from aws-lambda
        entry: path.join(__dirname, "../lambda/user/index.ts"),
        handler: "handler",
        environment: {
          USER_TABLE_NAME: this.userTable.tableName,
          // JWT_SECRET_NAME: config.AWS_SECRET.JWT_SECRET(stageName),
          STAGE: stageName,
        },
        role: lambdaRole,
        bundling: commonNodeJsFunctionBundling,
      }
    );

    // const authLambda = new lambda_nodejs.NodejsFunction(this, "authLambda", {
    //   functionName: `${stageName}-auth`,
    //   runtime: lambda.Runtime.NODEJS_20_X, // Import Runtime from aws-lambda
    //   entry: path.join(__dirname, "../lambda/auth/index.ts"),
    //   handler: "handler",
    //   environment: {
    //     USER_TABLE_NAME: this.userTable.tableName,
    //     USER_TABLE_INDEX_NAME_FOR_EMAIL: userTableIndexNameForEmail,
    //     JWT_SECRET_NAME: config.AWS_SECRET.JWT_SECRET(stageName),
    //     GOOGLE_CLIENT_ID_NAME: config.AWS_SECRET.GOOGLE_CLIENT_ID(stageName),
    //     STAGE: stageName,
    //   },
    //   role: lambdaRole,
    //   bundling: commonNodeJsFunctionBundling,
    // });

    // Add permissions to access Secrets Manager
    // getUserProfile.addToRolePolicy(
    //   new iam.PolicyStatement({
    //     actions: ["secretsmanager:GetSecretValue"],
    //     resources: [
    //       `arn:aws:secretsmanager:${this.region}:${
    //         this.account
    //       }:secret:${config.AWS_SECRET.JWT_SECRET(stageName)}*`,
    //     ],
    //   })
    // );

    // authLambda.addToRolePolicy(
    //   new iam.PolicyStatement({
    //     actions: ["secretsmanager:GetSecretValue"],
    //     resources: [
    //       `arn:aws:secretsmanager:${this.region}:${
    //         this.account
    //       }:secret:${config.AWS_SECRET.JWT_SECRET(stageName)}*`,
    //       `arn:aws:secretsmanager:${this.region}:${
    //         this.account
    //       }:secret:${config.AWS_SECRET.GOOGLE_CLIENT_ID(stageName)}*`,
    //     ],
    //   })
    // );

    // Grant the Lambda functions appropriate permissions to the DynamoDB table
    this.userTable.grantReadWriteData(getUserProfile);
    // this.userTable.grantReadWriteData(authLambda);

    // Create an API Gateway REST API
    const api = new apigateway.RestApi(this, "UserAPI", {
      restApiName: `${stageName}-UserAPI`,
      defaultCorsPreflightOptions: config.DEFAULT_CORS_PREFLIGHT_OPTIONS,
      deployOptions: config.DEPLOY_OPTIONS[stageName as STAGES],
    });
    addCorsToResponses(api);

    // Define the /user path
    const userResource = api.root.addResource("user");

    // Attach the Lambda functions to API Gateway
    userResource.addMethod(
      "GET",
      new apigateway.LambdaIntegration(getUserProfile)
    );

    new cdk.CfnOutput(this, "UserApiUrl", {
      value: api.url,
      description: "The base URL of the API",
      exportName: "UserApiUrlOutput",
    });

    // Apply Removal policy to not delete resources if the CFN stack is deleted.
    api.applyRemovalPolicy(removalPolicy);
    [getUserProfile].forEach((resource) => {
      const cfnResource = resource.node.defaultChild as cdk.CfnResource;
      cfnResource.applyRemovalPolicy(removalPolicy);
    });

    // Add stage-specific tags
    cdk.Tags.of(this).add("Stage", stageName);
  }
}
