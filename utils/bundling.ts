import { LogLevel } from "aws-cdk-lib/aws-lambda-nodejs";

export const commonNodeJsFunctionBundling = {
  minify: true,
  externalModules: [
    "@aws-sdk/client-dynamodb",
    "@aws-sdk/lib-dynamodb",
    "@aws-sdk/client-secrets-manager",
  ],
  target: "es2020",
  logLevel: LogLevel.ERROR,
};
