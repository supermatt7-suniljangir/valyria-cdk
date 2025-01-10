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

interface AppreciationStackProps extends StackProps {
  stageName: string;
  removalPolicy: cdk.RemovalPolicy;
}

export class AppreciationStack extends Stack {
  public readonly appreciationTable: dynamodb.Table;

  constructor(scope: Construct, id: string, props: AppreciationStackProps) {
    super(scope, id, props);

    const { stageName = STAGES.DEV, removalPolicy = cdk.RemovalPolicy.RETAIN } =
      props || {};

    // Create Appreciation table
    this.appreciationTable = new dynamodb.Table(this, "AppreciationTable", {
      tableName: config.APPRECIATION_TABLE_NAME(stageName),
      partitionKey: {
        name: "userId",
        type: dynamodb.AttributeType.STRING,
      },
      sortKey: {
        name: "projectId",
        type: dynamodb.AttributeType.STRING,
      },
      billingMode: dynamodb.BillingMode.PAY_PER_REQUEST,
      deletionProtection:
        removalPolicy == cdk.RemovalPolicy.RETAIN ? true : false,
      pointInTimeRecovery: true,
      removalPolicy: removalPolicy,
    });

    // Add GSI for project-based queries
    this.appreciationTable.addGlobalSecondaryIndex({
      indexName: `appreciationTableIndex-${stageName}-projectId`,
      partitionKey: {
        name: "projectId",
        type: dynamodb.AttributeType.STRING,
      },
      sortKey: {
        name: "createdAt",
        type: dynamodb.AttributeType.STRING,
      },
      projectionType: dynamodb.ProjectionType.ALL,
    });

    // Create Lambda role
    const lambdaRole = new iam.Role(this, "AppreciationLambdaRole", {
      assumedBy: new iam.ServicePrincipal("lambda.amazonaws.com"),
      managedPolicies: [
        iam.ManagedPolicy.fromAwsManagedPolicyName(
          "service-role/AWSLambdaBasicExecutionRole"
        ),
      ],
    });

    // Create Lambda functions
    const getAppreciations = new lambda_nodejs.NodejsFunction(
      this,
      "getAppreciations",
      {
        functionName: `${stageName}-getAppreciations`,
        runtime: lambda.Runtime.NODEJS_20_X,
        entry: path.join(__dirname, "../lambda/appreciation/getAppreciations.ts"),
        handler: "handler",
        environment: {
          APPRECIATION_TABLE_NAME: this.appreciationTable.tableName,
          JWT_SECRET_NAME: config.AWS_SECRET.JWT_SECRET(stageName),
          STAGE: stageName,
        },
        role: lambdaRole,
        bundling: commonNodeJsFunctionBundling,
      }
    );

    const toggleAppreciation = new lambda_nodejs.NodejsFunction(
      this,
      "toggleAppreciation",
      {
        functionName: `${stageName}-toggleAppreciation`,
        runtime: lambda.Runtime.NODEJS_20_X,
        entry: path.join(__dirname, "../lambda/appreciation/toggleAppreciation.ts"),
        handler: "handler",
        environment: {
          APPRECIATION_TABLE_NAME: this.appreciationTable.tableName,
          JWT_SECRET_NAME: config.AWS_SECRET.JWT_SECRET(stageName),
          STAGE: stageName,
        },
        role: lambdaRole,
        bundling: commonNodeJsFunctionBundling,
      }
    );

    // Grant permissions
    this.appreciationTable.grantReadWriteData(getAppreciations);
    this.appreciationTable.grantReadWriteData(toggleAppreciation);

    // Add Secrets Manager permissions
    [getAppreciations, toggleAppreciation].forEach((fn) => {
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
    const api = new apigateway.RestApi(this, "AppreciationAPI", {
      restApiName: `${stageName}-AppreciationAPI`,
      defaultCorsPreflightOptions: config.DEFAULT_CORS_PREFLIGHT_OPTIONS,
      deployOptions: config.DEPLOY_OPTIONS[stageName as STAGES],
    });
    addCorsToResponses(api);

    // Add routes
    const rootResource = api.root.addResource("project");
    const appreciationResource = rootResource.addResource("appreciation");
    appreciationResource.addMethod(
      "GET",
      new apigateway.LambdaIntegration(getAppreciations)
    );
    appreciationResource.addMethod(
      "POST",
      new apigateway.LambdaIntegration(toggleAppreciation)
    );

    // Outputs
    new cdk.CfnOutput(this, "AppreciationApiUrl", {
      value: api.url,
      description: "The base URL of the Appreciation API",
      exportName: "AppreciationApiUrlOutput",
    });

    // Apply removal policy
    api.applyRemovalPolicy(removalPolicy);
    [getAppreciations, toggleAppreciation].forEach((resource) => {
      const cfnResource = resource.node.defaultChild as cdk.CfnResource;
      cfnResource.applyRemovalPolicy(removalPolicy);
    });

    // Add tags
    cdk.Tags.of(this).add("Stage", stageName);
  }
}
