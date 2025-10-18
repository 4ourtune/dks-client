export interface PendingPinSession {
  sessionId: string;
  vehicleId: number;
  expiresAt: string;
  attemptsRemaining: number;
}

export interface PinConfirmResponse {
  vehicleId: number;
  pairingToken: string;
}

export interface PKISessionRefreshResponse {
  vehicleId: number;
  sessionId: string;
  sessionKey: string;
  expiresAt: string;
  serverNonce: string;
  clientNonce: string;
  pairingToken?: string | null;
  vehiclePublicKey?: string | null;
}
