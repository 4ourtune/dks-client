export type KeyPermission = 'unlock' | 'lock' | 'start' | 'trunk';

export interface DigitalKey {
  id: string;
  userId: string;
  vehicleId: string;
  name: string;
  permissions: KeyPermission[];
  expiresAt?: string;
  isActive: boolean;
  createdAt: string;
  updatedAt: string;
}

export interface KeyCreateRequest {
  vehicleId: string;
  name: string;
  permissions: KeyPermission[];
  expiresAt?: string;
}

export interface KeyUpdateRequest {
  name?: string;
  permissions?: KeyPermission[];
  expiresAt?: string;
  isActive?: boolean;
}

export interface KeyValidationRequest {
  keyId: string;
  command: string;
  timestamp: number;
}

export interface KeyValidationResponse {
  isValid: boolean;
  permissions: KeyPermission[];
  expiresAt?: string;
}

export interface KeyState {
  keys: DigitalKey[];
  selectedKey: DigitalKey | null;
  isLoading: boolean;
  error: string | null;
}