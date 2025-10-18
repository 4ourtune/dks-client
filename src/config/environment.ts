// Environment configuration
export type Environment = "development" | "production" | "staging";

const configs = {
  // Local development with Android emulator
  development: {
    API_BASE_URL: "http://127.0.0.1:3000/api",
    ENVIRONMENT: "development" as Environment,
    DEBUG: true,
  },

  // Production cloud server
  production: {
    API_BASE_URL: "http://34.46.208.174:3000/api",
    ENVIRONMENT: "production" as Environment,
    DEBUG: false,
  },

  // Testing/staging with cloud server + debug
  staging: {
    API_BASE_URL: "http://34.46.208.174:3000/api",
    ENVIRONMENT: "staging" as Environment,
    DEBUG: true,
  },
};

const CURRENT_ENV: Environment = "production";

export const Config = configs[CURRENT_ENV];
export default Config;
