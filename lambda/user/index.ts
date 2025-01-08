import {
  APIGatewayProxyEvent,
  APIGatewayProxyResult,
  //   S3Event,
  //   SNSEvent,
  //   DynamoDBStreamEvent,
  //   SQSEvent,
  //   CloudWatchLogsEvent,
  //   CloudFormationCustomResourceEvent,
} from "aws-lambda";

export const handler = async (
  event: APIGatewayProxyEvent
): Promise<APIGatewayProxyResult> => {
  console.log(JSON.stringify(event, null, 2));
  return {
    statusCode: 200,
    body: JSON.stringify(
      {
        message: "Hello from Lambda!",
        input: event,
      },
      null,
      2
    ),
  };
};
