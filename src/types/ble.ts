export type PairingStep =
  | "idle"
  | "scanning"
  | "deviceSelected"
  | "connecting"
  | "challenge"
  | "registering"
  | "completing"
  | "completed"
  | "error";

export interface PairingContext {
  vehicleId?: string;
  expectedDeviceIds?: string[];
  device?: BLEDevice;
  challenge?: {
    nonce: string;
    issuedAt?: number;
    [key: string]: any;
  };
  sessionId?: string;
  pairingToken?: string;
  certificate?: string;
  session?: PKISessionCache;
  registration?: VehicleBLERegistration;
  result?: {
    keyId?: string;
    message?: string;
    pairingToken?: string;
    certificate?: string;
  };
  error?: string;
}

export interface PKISessionCache {
  sessionId?: string;
  expiresAt?: number;
  vehiclePublicKey?: string;
  sessionKey?: string;
  clientNonce?: string;
  serverNonce?: string;
}

export interface VehicleBLERegistration {
  vehicleId: string;
  device: BLEDevice;
  pairingToken?: string;
  certificate?: string;
  session?: PKISessionCache;
  updatedAt: number;
}

export interface BLEPairingState {
  step: PairingStep;
  context: PairingContext;
  startedAt?: number;
}

export interface CommandPacket {
  timestamp: number;
  command: "UNLOCK" | "LOCK" | "START" | "STOP" | "STATUS" | "TRUNK";
  keyId: string;
  signature: string;
}

export interface ResponsePacket {
  success: boolean;
  command: string;
  timestamp: number;
  data?: any;
  vehicleState?: {
    locked?: boolean;
    engineOn?: boolean;
    [key: string]: any;
  };
  metadata?: any;
  error?: string;
}

export interface BLEDevice {
  id: string;
  name?: string;
  rssi?: number;
  isConnectable?: boolean;
}

export interface BLEConnectionState {
  isScanning: boolean;
  isConnecting: boolean;
  isConnected: boolean;
  connectedDevice: BLEDevice | null;
  discoveredDevices: BLEDevice[];
  connectionQuality: "excellent" | "good" | "fair" | "poor" | "unknown";
  lastConnected?: string;
  lastConnectAttempt?: number;
  autoReconnectSuspended: boolean;
  error: string | null;
}

export interface BLECommand {
  id: string;
  command: CommandPacket;
  status: "pending" | "sent" | "success" | "failed";
  response?: ResponsePacket;
  timestamp: number;
}

export interface BLEState {
  connection: BLEConnectionState;
  commands: BLECommand[];
  registrations: Partial<Record<string, VehicleBLERegistration>>;
  isInitialized: boolean;
  permissions: {
    bluetooth: boolean;
    location: boolean;
  };
  pairing: BLEPairingState;
}

export const BLE_CONFIG = {
  SERVICE_UUID: "12345678-1234-1234-1234-123456789abc",
  COMMAND_CHAR_UUID: "87654321-4321-4321-4321-cba987654321",
  PAIRING_CHALLENGE_CHAR_UUID: "87654321-4321-4321-4321-cba987654322",
  PAIRING_RESULT_CHAR_UUID: "87654321-4321-4321-4321-cba987654323",
  SCAN_TIMEOUT: 10000,
  CONNECTION_TIMEOUT: 15000,
  COMMAND_TIMEOUT: 5000,
  NOTIFICATION_IDLE_TIMEOUT: 300,
  APP_STATE_WAIT_TIMEOUT: 5000,
  AUTO_RECONNECT_COOLDOWN: 10000,
  SCAN_WITH_SERVICE_FILTER: false,
  SCAN_DEVICE_NAME_PREFIX: undefined as string | undefined,
  SCAN_DEVICE_NAME_KEYWORDS: ["rapa", "raspberry"] as string[],
  SCAN_DEVICE_MAC_PREFIXES: [] as string[],
  REQUEST_MTU_SIZE: 247 as number | undefined,
  MAX_WRITE_PAYLOAD: 180,
  // Keep chunk throttling disabled by default to evaluate end-to-end latency.
  PKI_WRITE_DELAY_MS: 0,
  READ_POLL_INTERVAL_MS: 200,
  READ_IDLE_TIMEOUT_MS: 400,
  READ_OVERALL_TIMEOUT_MS: 8000,
  CCCD_UUID: "00002902-0000-1000-8000-00805f9b34fb",
  WAIT_BEFORE_DISCOVERY_MS: 300,
  CONNECT_RETRY_ATTEMPTS: 2,
  CONNECT_RETRY_DELAY_MS: 600,
  PAIRING_TIMEOUTS: {
    scan: 10000,
    connect: 15000,
    challenge: 10000,
    server: 20000,
  },
};
