import * as cdk from "aws-cdk-lib";
import * as lambda from "aws-cdk-lib/aws-lambda";
import * as ddb from "aws-cdk-lib/aws-dynamodb";
import * as iam from "aws-cdk-lib/aws-iam";
import { aws_apigateway as apigateway } from "aws-cdk-lib";
import { aws_lambda_nodejs as lambda_nodejs } from "aws-cdk-lib";
import * as path from "path";
import { Construct } from "constructs";
import config from "../utils/config";
import { STAGES } from "../utils/stages";
import { addCorsToResponses } from "../utils/others";
import { commonNodeJsFunctionBundling } from "../utils/bundling";

interface AuthStackProps extends cdk.StackProps {
  stageName: STAGES;
  removalPolicy?: cdk.RemovalPolicy;
  userTable: ddb.Table;
}

export class AuthStack extends cdk.Stack {
  constructor(scope: Construct, id: string, props: AuthStackProps) {
    super(scope, id, props);

    const {
      stageName,
      removalPolicy = cdk.RemovalPolicy.DESTROY,
      userTable,
    } = props;

    // Lambda role for accessing DynamoDB and secrets
    const lambdaRole = new iam.Role(this, "AuthLambdaRole", {
      assumedBy: new iam.ServicePrincipal("lambda.amazonaws.com"),
      managedPolicies: [
        iam.ManagedPolicy.fromAwsManagedPolicyName(
          "service-role/AWSLambdaBasicExecutionRole"
        ),
      ],
    });

    // Define Lambda Functions
    const loginLambda = new lambda_nodejs.NodejsFunction(this, "loginLambda", {
      functionName: `${stageName}-login`,
      runtime: lambda.Runtime.NODEJS_20_X,
      entry: path.join(__dirname, "../lambda/auth/login.ts"),
      handler: "handler",
      environment: {
        USER_TABLE_NAME: userTable.tableName,
        JWT_SECRET_NAME: config.AWS_SECRET.JWT_SECRET(stageName),
        STAGE: stageName,
      },
      role: lambdaRole,
      bundling: commonNodeJsFunctionBundling,
    });

    const registerLambda = new lambda_nodejs.NodejsFunction(
      this,
      "registerLambda",
      {
        functionName: `${stageName}-register`,
        runtime: lambda.Runtime.NODEJS_20_X,
        entry: path.join(__dirname, "../lambda/auth/register.ts"),
        handler: "handler",
        environment: {
          USER_TABLE_NAME: userTable.tableName,
          JWT_SECRET_NAME: config.AWS_SECRET.JWT_SECRET(stageName),
          STAGE: stageName,
        },
        role: lambdaRole,
        bundling: commonNodeJsFunctionBundling,
      }
    );

    const passwordResetLambda = new lambda_nodejs.NodejsFunction(
      this,
      "PasswordResetLambda",
      {
        functionName: `${stageName}-passwordReset`,
        runtime: lambda.Runtime.NODEJS_20_X,
        entry: path.join(__dirname, "../lambda/auth/passwordReset.ts"),
        handler: "handler",
        environment: {
          USER_TABLE_NAME: userTable.tableName,
          JWT_SECRET_NAME: config.AWS_SECRET.JWT_SECRET(stageName),
          STAGE: stageName,
        },
        role: lambdaRole,
        bundling: commonNodeJsFunctionBundling,
      }
    );

    // API Gateway setup
    const authApi = new apigateway.RestApi(this, "AuthApi", {
      restApiName: `${stageName}-AuthApi`,
      defaultCorsPreflightOptions: config.DEFAULT_CORS_PREFLIGHT_OPTIONS,
      deployOptions: config.DEPLOY_OPTIONS[stageName],
    });

    addCorsToResponses(authApi);

    const authResource = authApi.root.addResource("auth");
    authResource
      .addResource("login")
      .addMethod("POST", new apigateway.LambdaIntegration(loginLambda));
    authResource
      .addResource("register")
      .addMethod("POST", new apigateway.LambdaIntegration(registerLambda));
    authResource.addResource("reset").addMethod("POST", new apigateway.LambdaIntegration(passwordResetLambda));

    // Grant Lambda functions permissions to access DynamoDB
    userTable.grantReadWriteData(loginLambda);
    userTable.grantReadWriteData(registerLambda);
    userTable.grantReadWriteData(passwordResetLambda);

    // Add policy for accessing secrets in Secrets Manager
    [loginLambda, registerLambda, passwordResetLambda].forEach((fn) =>
      fn.addToRolePolicy(
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
      )
    );

    // Apply removal policy for API and Lambda resources
    authApi.applyRemovalPolicy(removalPolicy);
    [loginLambda, registerLambda, passwordResetLambda].forEach((lambdaFn) => {
      const cfnResource = lambdaFn.node.defaultChild as cdk.CfnResource;
      cfnResource.applyRemovalPolicy(removalPolicy);
    });
    cdk.Tags.of(this).add("Stage", stageName);
  }
}
