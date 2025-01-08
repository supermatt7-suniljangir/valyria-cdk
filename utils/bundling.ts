import { LogLevel } from "aws-cdk-lib/aws-lambda-nodejs";

// nodejs function bundling options
export const commonNodeJsFunctionBundling = {
    minify: true,
    externalModules: [
      "@aws-sdk/client-dynamodb",
      "@aws-sdk/lib-dynamodb",
      "@aws-sdk/client-secrets-manager",
      "aws-cdk-lib",
      "@aws-cdk",
      "@aws-cdk/cloud-assembly-schema",
    ],
    target: "es2020",
    logLevel:LogLevel.INFO,
  };