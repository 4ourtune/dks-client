export interface CommandPacket {
  timestamp: number;
  command: 'UNLOCK' | 'LOCK' | 'START' | 'STOP' | 'STATUS' | 'TRUNK';
  keyId: string;
  signature: string;
}

export interface ResponsePacket {
  success: boolean;
  command: string;
  timestamp: number;
  data?: any;
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
  isConnected: boolean;
  connectedDevice: BLEDevice | null;
  discoveredDevices: BLEDevice[];
  connectionQuality: 'excellent' | 'good' | 'fair' | 'poor' | 'unknown';
  lastConnected?: string;
  error: string | null;
}

export interface BLECommand {
  id: string;
  command: CommandPacket;
  status: 'pending' | 'sent' | 'success' | 'failed';
  response?: ResponsePacket;
  timestamp: number;
}

export interface BLEState {
  connection: BLEConnectionState;
  commands: BLECommand[];
  isInitialized: boolean;
  permissions: {
    bluetooth: boolean;
    location: boolean;
  };
}

export const BLE_CONFIG = {
  SERVICE_UUID: '12345678-1234-1234-1234-123456789abc',
  CHAR_UUID: '87654321-4321-4321-4321-cba987654321',
  SCAN_TIMEOUT: 10000,
  CONNECTION_TIMEOUT: 15000,
  COMMAND_TIMEOUT: 5000,
};