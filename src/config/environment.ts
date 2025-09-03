// Environment configuration
export type Environment = 'development' | 'production' | 'staging';

const configs = {
  // Local development with Android emulator
  development: {
    API_BASE_URL: 'http://10.0.2.2:3000/api', // 상황에 맞게 이 값을 변경하세요. 자세한 것은 README.md 참고
    ENVIRONMENT: 'development' as Environment,
    DEBUG: true,
  },
  
  // Production cloud server
  production: {
    API_BASE_URL: 'http://34.46.208.174:3000/api',
    ENVIRONMENT: 'production' as Environment,
    DEBUG: false,
  },
  
  // Testing/staging with cloud server + debug
  staging: {
    API_BASE_URL: 'http://34.46.208.174:3000/api',
    ENVIRONMENT: 'staging' as Environment,
    DEBUG: true,
  }
};

// 여기서 환경을 변경하세요 👇
const CURRENT_ENV: Environment = 'development';

export const Config = configs[CURRENT_ENV];
export default Config;