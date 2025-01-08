import { aws_apigateway as apigateway } from "aws-cdk-lib";

export function addCorsToResponses(api: apigateway.RestApi) {
    // Add CORS headers to 4XX responses
    api.addGatewayResponse("Response4XX", {
      type: apigateway.ResponseType.DEFAULT_4XX,
      responseHeaders: {
        "Access-Control-Allow-Origin": "'*'",
        "Access-Control-Allow-Methods": "'OPTIONS,GET,PUT,POST,DELETE'",
      },
    });
  
    // Add CORS headers to 5XX responses
    api.addGatewayResponse("Response5XX", {
      type: apigateway.ResponseType.DEFAULT_5XX,
      responseHeaders: {
        "Access-Control-Allow-Origin": "'*'",
        "Access-Control-Allow-Methods": "'OPTIONS,GET,PUT,POST,DELETE'",
      },
    });
  }