import * as cdk from "aws-cdk-lib";
import { aws_lambda as lambda } from "aws-cdk-lib";
import { aws_iam as iam } from "aws-cdk-lib";
import { aws_dynamodb as dynamodb } from "aws-cdk-lib";
import { Table } from "aws-cdk-lib/aws-dynamodb";
import { Construct } from "constructs";
import { aws_lambda_nodejs as lambda_nodejs } from "aws-cdk-lib";
import * as path from "path";
import { aws_apigateway as apigateway } from "aws-cdk-lib";
import config from "../utils/config";
import { STAGES } from "../utils/stages";
import { commonNodeJsFunctionBundling } from "../utils/bundling";
import { addCorsToResponses } from "../utils/others";
interface BookmarkStackProps extends cdk.StackProps {
  stageName: string;
  removalPolicy: cdk.RemovalPolicy;
}
export class BookmarkStack extends cdk.Stack {
  public readonly bookmarksTable: Table;
  constructor(scope: Construct, id: string, props: BookmarkStackProps) {
    super(scope, id, props);

    const { stageName = STAGES.DEV, removalPolicy = cdk.RemovalPolicy.RETAIN } =
      props || {};
    // Assuming 'bookmarksTable' is already created
    this.bookmarksTable = new dynamodb.Table(this, "BookmarksTable", {
      tableName: config.BOOKMARKS_TABLE_NAME(stageName),
      partitionKey: { name: "userId", type: dynamodb.AttributeType.STRING },
      sortKey: { name: "projectId", type: dynamodb.AttributeType.STRING },
      billingMode: dynamodb.BillingMode.PAY_PER_REQUEST,
      deletionProtection:
        removalPolicy == cdk.RemovalPolicy.RETAIN ? true : false,
      pointInTimeRecovery: true,
      removalPolicy: removalPolicy,
      stream: dynamodb.StreamViewType.NEW_AND_OLD_IMAGES, // Useful for notifications
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

    const toggleBookmark = new lambda_nodejs.NodejsFunction(
      this,
      "toggleBookmark",
      {
        functionName: `${stageName}-toggleBookmark`,
        runtime: lambda.Runtime.NODEJS_20_X,
        entry: path.join(__dirname, "../lambda/bookmark/toggleBookmark.ts"),
        handler: "handler",
        environment: {
          COMMENT_TABLE_NAME: this.bookmarksTable.tableName,
          JWT_SECRET_NAME: config.AWS_SECRET.JWT_SECRET(stageName),
          STAGE: stageName,
        },
        role: lambdaRole,
        bundling: commonNodeJsFunctionBundling,
      }
    );

    const getBookmarks = new lambda_nodejs.NodejsFunction(
      this,
      "getBookmarks",
      {
        functionName: `${stageName}-getBookmarks`,
        runtime: lambda.Runtime.NODEJS_20_X,
        entry: path.join(__dirname, "../lambda/bookmark/getAllBookmarks.ts"),
        handler: "handler",
        environment: {
          COMMENT_TABLE_NAME: this.bookmarksTable.tableName,
          JWT_SECRET_NAME: config.AWS_SECRET.JWT_SECRET(stageName),
          STAGE: stageName,
        },
        role: lambdaRole,
        bundling: commonNodeJsFunctionBundling,
      }
    );

    [toggleBookmark, getBookmarks].forEach((fn) =>
      fn.addToRolePolicy(
        new iam.PolicyStatement({
          actions: ["secretsmanager:GetSecretValue"],
          resources: [
            `arn:aws:secretsmanager:${this.region}:${
              this.account
            }:secret:${config.AWS_SECRET.JWT_SECRET(stageName)}*`,
          ],
        })
      )
    );

    // Create API Gateway
    const api = new apigateway.RestApi(this, "bookmarksApi", {
      restApiName: `${stageName}-BookmarksApi`,
      defaultCorsPreflightOptions: config.DEFAULT_CORS_PREFLIGHT_OPTIONS,
      deployOptions: config.DEPLOY_OPTIONS[stageName as STAGES],
    });
    addCorsToResponses(api);

    const bookmarkResource = api.root.addResource("bookmark");

    bookmarkResource.addMethod(
      "GET",
      new apigateway.LambdaIntegration(getBookmarks)
    );
    bookmarkResource.addMethod(
      "PUT",
      new apigateway.LambdaIntegration(toggleBookmark)
    );

    // Grant permissions for Lambda to write to DynamoDB table
    this.bookmarksTable.grantWriteData(toggleBookmark);
    this.bookmarksTable.grantWriteData(getBookmarks);

    // Outputs
    new cdk.CfnOutput(this, "BookmarkApiUrl", {
      value: api.url,
      description: "The base URL of the Bookmarks API",
      exportName: "BookmarkApiUrlOutput",
    });

    
    // Apply removal policy
    api.applyRemovalPolicy(removalPolicy);
    [toggleBookmark, getBookmarks].forEach((resource) => {
      const cfnResource = resource.node.defaultChild as cdk.CfnResource;
      cfnResource.applyRemovalPolicy(removalPolicy);
    }
  );
        cdk.Tags.of(this).add("Stage", stageName);
  }
}
