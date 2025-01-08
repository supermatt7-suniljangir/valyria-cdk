import { STAGES } from "./stages";

interface Config {
  USER_TABLE_NAME: (stageName: string) => string;
  USER_TABLE_INDEX_NAME_FOR_EMAIL: (stageName: string) => string;
  USER_API_RATE_LIMIT: {
    dev: number;
    prod: number;
  };
  USER_API_RATE_LIMIT_BURST: {
    dev: number;
    prod: number;
  };
  DEFAULT_CORS_PREFLIGHT_OPTIONS: {
    allowOrigins: string[];
    allowMethods: string[];
    allowHeaders: string[];
  };
  DEPLOY_OPTIONS: {
    dev: {
      stageName: string;
      description: string;
      throttlingRateLimit: number;
      throttlingBurstLimit: number;
    };
    prod: {
      stageName: string;
      description: string;
      throttlingRateLimit: number;
      throttlingBurstLimit: number;
    };
  };
  AWS_SECRET: {
    JWT_SECRET: (stageName: string) => string;
    GOOGLE_CLIENT_ID: (stageName: string) => string;
  };
}

const config: Config = Object.freeze({
  USER_TABLE_INDEX_NAME_FOR_EMAIL: (stageName: string) =>
    `${stageName}-userTableIndex`,
  USER_TABLE_NAME: (stageName: string) => `${stageName}-userTable-ddb`,
  USER_API_RATE_LIMIT: Object.freeze({
    dev: 100,
    prod: 1000,
  }),
  USER_API_RATE_LIMIT_BURST: Object.freeze({
    dev: 200,
    prod: 2000,
  }),
  DEFAULT_CORS_PREFLIGHT_OPTIONS: Object.freeze({
    allowOrigins: ["*"],
    allowMethods: ["POST", "GET", "PUT", "OPTIONS"],
    allowHeaders: ["Authorization", "Content-Type"],
  }),
  DEPLOY_OPTIONS: Object.freeze({
    dev: {
      stageName: STAGES.DEV,
      description: "Development stage deployment",
      throttlingRateLimit: 100,
      throttlingBurstLimit: 200,
    },
    prod: {
      stageName: STAGES.PROD,
      description: "Production stage deployment",
      throttlingRateLimit: 1000,
      throttlingBurstLimit: 2000,
    },
  }),

  AWS_SECRET: Object.freeze({
    JWT_SECRET: (stageName: string) => `${stageName}-jwt-secret`,
    GOOGLE_CLIENT_ID: (stageName: string) => `${stageName}-google-client-id`,
  }),
});

export default config;
