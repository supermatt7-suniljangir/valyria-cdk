import * as cdk from "aws-cdk-lib";
import { aws_lambda as lambda } from "aws-cdk-lib";
import { aws_lambda_nodejs as lambda_nodejs } from "aws-cdk-lib";
import { aws_dynamodb as dynamodb } from "aws-cdk-lib";
import { aws_apigateway as apigateway } from "aws-cdk-lib";
import { aws_iam as iam } from "aws-cdk-lib";
import { Stack, StackProps } from "aws-cdk-lib";
import { Construct } from "constructs";
import * as path from "path";

import { addCorsToResponses } from "../utils/others";
import { STAGES } from "../utils/stages";
import config from "../utils/config";
import { commonNodeJsFunctionBundling } from "../utils/bundling";

interface FeedbackStackProps extends StackProps {
  stageName: string;
  removalPolicy: cdk.RemovalPolicy;
}

export class FeedbackStack extends Stack {
  public readonly feedbackTable: dynamodb.Table;

  constructor(scope: Construct, id: string, props: FeedbackStackProps) {
    super(scope, id, props);

    const { stageName, removalPolicy } = props;

    // Create a DynamoDB table for storing feedback
    this.feedbackTable = new dynamodb.Table(this, "FeedbackTable", {
      partitionKey: { name: "id", type: dynamodb.AttributeType.STRING },
      tableName: config.FEEDBACK_TABLE_NAME(stageName as STAGES),
      billingMode: dynamodb.BillingMode.PAY_PER_REQUEST,
      removalPolicy: removalPolicy,
      pointInTimeRecovery: true,
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



    // Create Lambda function for handling feedback submission
    const submitFeedbackLambda = new lambda_nodejs.NodejsFunction(
      this,
      "submitFeedbackLambda",
      {
        functionName: `${stageName}-submitFeedback`,
        runtime: lambda.Runtime.NODEJS_20_X,
        entry: path.join(__dirname, "../lambda/feedback/submitFeedback.ts"),
        handler: "handler",
        environment: {
          FEEDBACK_TABLE_NAME: this.feedbackTable.tableName,
          JWT_SECRET_NAME: config.AWS_SECRET.JWT_SECRET(stageName),
          GOOGLE_CLIENT_ID_NAME: config.AWS_SECRET.GOOGLE_CLIENT_ID(stageName),
          STAGE: stageName,
        },
        role: lambdaRole,
        bundling: commonNodeJsFunctionBundling,
      }
    );


    submitFeedbackLambda.addToRolePolicy(
      new iam.PolicyStatement({
        actions: ["secretsmanager:GetSecretValue"],
        resources: [
          `arn:aws:secretsmanager:${this.region}:${
            this.account
          }:secret:${config.AWS_SECRET.JWT_SECRET(stageName)}*`,
          `arn:aws:secretsmanager:${this.region}:${
            this.account
          }:secret:${config.AWS_SECRET.GOOGLE_CLIENT_ID(stageName)}*`,
        ],
      })
    );
    // Grant DynamoDB permissions to the Lambda function
    this.feedbackTable.grantReadWriteData(submitFeedbackLambda);

    // Create API Gateway REST API for submitting feedback
    const api = new apigateway.RestApi(this, "FeedbackAPI", {
      restApiName: `${stageName}-FeedbackAPI`,
      defaultCorsPreflightOptions: config.DEFAULT_CORS_PREFLIGHT_OPTIONS,
      deployOptions: config.DEPLOY_OPTIONS[stageName as STAGES],
    });

    addCorsToResponses(api);

    const feedbackResource = api.root.addResource("feedback");
    feedbackResource.addMethod(
      "POST",
      new apigateway.LambdaIntegration(submitFeedbackLambda)
    );

    new cdk.CfnOutput(this, "FeedbackApiUrl", {
      value: api.url,
      description: "The base URL of the Feedback API",
      exportName: `FeedbackApiUrlOutput-${stageName}`,
    });

    // Apply removal policy to the resources
    api.applyRemovalPolicy(removalPolicy);
    if (submitFeedbackLambda.node.defaultChild instanceof cdk.CfnResource) {
      (
        submitFeedbackLambda.node.defaultChild as cdk.CfnResource
      ).applyRemovalPolicy(removalPolicy);
    }

    // Add stage-specific tags
    cdk.Tags.of(this).add("Stage", stageName);
  }
}
