import * as cdk from "aws-cdk-lib";
import { Bucket, CfnBucket, StorageClass } from "aws-cdk-lib/aws-s3";
import { Queue } from "aws-cdk-lib/aws-sqs";
import { Construct } from "constructs";
import * as s3 from "aws-cdk-lib/aws-s3";
import * as s3n from "aws-cdk-lib/aws-s3-notifications";
import * as lambda from "aws-cdk-lib/aws-lambda";
import * as iam from "aws-cdk-lib/aws-iam";
import { aws_apigateway as apigateway } from "aws-cdk-lib";
import { NodejsFunction, LogLevel } from "aws-cdk-lib/aws-lambda-nodejs";
import path = require("path");
import config from "../utils/config";
import { addCorsToResponses } from "../utils/others";
import { STAGES } from "../utils/stages";
import { commonNodeJsFunctionBundling } from "../utils/bundling";
import * as ddb from "aws-cdk-lib/aws-dynamodb";

interface AuthStackProps extends cdk.StackProps {
  stageName: STAGES;
  removalPolicy?: cdk.RemovalPolicy;
}

export class AuthStack extends cdk.Stack {
  constructor(scope: Construct, id: string, props?: AuthStackProps) {
    super(scope, id, props);
    const {
      stageName = STAGES.DEV,
      removalPolicy = cdk.RemovalPolicy.DESTROY,
    } = props || {};
  }
}
