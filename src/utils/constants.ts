export const API_BASE_URL = 'http://34.46.208.174:3000/api';

export const APP_CONFIG = {
  name: 'Digital Key',
  version: '1.0.0',
  buildNumber: 1,
};

export const STORAGE_KEYS = {
  AUTH_TOKEN: 'auth_token',
  REFRESH_TOKEN: 'refresh_token',
  USER_DATA: 'user_data',
  SELECTED_VEHICLE: 'selected_vehicle',
  APP_SETTINGS: 'app_settings',
};

export const API_TIMEOUTS = {
  DEFAULT: 10000,
  LONG: 30000,
  SHORT: 5000,
};

export const BLE_TIMEOUTS = {
  SCAN: 10000,
  CONNECTION: 15000,
  COMMAND: 5000,
};

export const CACHE_DURATIONS = {
  VEHICLES: 5 * 60 * 1000,
  KEYS: 5 * 60 * 1000,
  STATUS: 30 * 1000,
};

export const VALIDATION_RULES = {
  EMAIL: /^[^\s@]+@[^\s@]+\.[^\s@]+$/,
  PASSWORD: {
    MIN_LENGTH: 8,
    REQUIRE_UPPERCASE: true,
    REQUIRE_LOWERCASE: true,
    REQUIRE_NUMBERS: true,
    REQUIRE_SPECIAL: true,
    PATTERN: /^(?=.*[a-z])(?=.*[A-Z])(?=.*\d)(?=.*[@$!%*?&])[A-Za-z\d@$!%*?&]/,
  },
  NAME: {
    MIN_LENGTH: 1,
    MAX_LENGTH: 100,
  },
  VIN: /^[A-HJ-NPR-Z0-9]{17}$/,
  DEVICE_ID: /^[A-F0-9]{12}$/i,
};

export const ERROR_MESSAGES = {
  NETWORK_ERROR: 'Network error. Please check your connection.',
  TIMEOUT_ERROR: 'Request timed out. Please try again.',
  UNAUTHORIZED: 'Session expired. Please log in again.',
  FORBIDDEN: 'Access denied.',
  NOT_FOUND: 'Resource not found.',
  SERVER_ERROR: 'Server error. Please try again later.',
  VALIDATION_ERROR: 'Invalid input. Please check your data.',
  BLE_ERROR: 'Bluetooth connection error.',
  PERMISSION_ERROR: 'Permission required to proceed.',
};

export const VEHICLE_COMMANDS = {
  UNLOCK: 'UNLOCK',
  LOCK: 'LOCK',
  START: 'START',
  STOP: 'STOP',
  TRUNK: 'TRUNK',
  STATUS: 'STATUS',
} as const;

export const KEY_PERMISSIONS = {
  UNLOCK: 'unlock',
  LOCK: 'lock',
  START: 'start',
  TRUNK: 'trunk',
} as const;

export const BLE_CONFIG = {
  SERVICE_UUID: '12345678-1234-1234-1234-123456789abc',
  CHAR_UUID: '87654321-4321-4321-4321-cba987654321',
  DEVICE_NAME_PREFIX: 'TC375',
};

export const PERMISSIONS_ANDROID = [
  'android.permission.BLUETOOTH',
  'android.permission.BLUETOOTH_ADMIN',
  'android.permission.ACCESS_FINE_LOCATION',
  'android.permission.BLUETOOTH_SCAN',
  'android.permission.BLUETOOTH_CONNECT',
];

export const PERMISSIONS_IOS = [
  'NSBluetoothAlwaysUsageDescription',
  'NSBluetoothPeripheralUsageDescription',
  'NSLocationWhenInUseUsageDescription',
];

export const LOG_LEVELS = {
  ERROR: 0,
  WARN: 1,
  INFO: 2,
  DEBUG: 3,
} as const;

export const ANIMATION_DURATIONS = {
  FAST: 200,
  NORMAL: 300,
  SLOW: 500,
};

export const RETRY_CONFIG = {
  MAX_ATTEMPTS: 3,
  DELAY: 1000,
  BACKOFF_FACTOR: 2,
};