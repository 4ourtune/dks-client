export interface KeyPermissions {
  unlock: boolean;
  lock: boolean;
  startEngine: boolean;
}

export interface DigitalKey {
  id: string;
  vehicleId: string;
  userId?: string;
  permissions: KeyPermissions;
  expiresAt?: string | null;
  isActive: boolean;
  createdAt?: string;
  updatedAt?: string;
  vehicleInfo?: {
    vin: string;
    model: string;
    status?: string;
  } | null;
}

export interface KeyCreateRequest {
  vehicleId: string;
  permissions: KeyPermissions;
  expiresAt?: string;
}

export interface KeyUpdateRequest {
  permissions?: KeyPermissions;
  expiresAt?: string;
  isActive?: boolean;
}

export interface KeyValidationRequest {
  command: "unlock" | "lock" | "startEngine";
  timestamp: number;
}

export interface KeyValidationResponse {
  isValid: boolean;
  permissions: KeyPermissions;
  expiresAt?: string;
}

export interface KeyState {
  keys: DigitalKey[];
  selectedKey: DigitalKey | null;
  isLoading: boolean;
  error: string | null;
}
export interface PairingSessionStartRequest {
  vehicleId: string;
  device_id: string;
  nonce: string;
  rssi?: number;
}

export interface PairingSessionStartResponse {
  sessionId: string;
  expiresAt?: string;
}

export interface PairingCompletionRequest {
  sessionId: string;
  responsePayload: Record<string, any>;
}

export interface PairingCompletionResult {
  key?: DigitalKey;
  blePayload?: Record<string, any>;
}
