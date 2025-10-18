export interface Certificate {
  id: string;
  subject: string;
  issuer: string;
  publicKey: string;
  signature: string;
  notBefore: Date;
  notAfter: Date;
  serialNumber: string;
  version: number;
}

export interface UserCertificate extends Certificate {
  vehicleId: number;
  permissions: {
    unlock: boolean;
    lock: boolean;
    startEngine: boolean;
  };
  userId: string;
  keyId?: string;
  allowedVehicles?: number[];
}

export interface VehicleCertificate extends Certificate {
  vehicleId: string;
  deviceId: string;
  capabilities: string[];
}

export interface RootCACertificate extends Certificate {
  isRootCA: boolean;
}

export interface ECCKeyPair {
  publicKey: string;
  privateKey: string;
  curve: "secp256r1" | "secp256k1";
}

export interface PKISession {
  sessionId: string;
  sessionKey: string;
  vehiclePublicKey: string;
  userPublicKey: string;
  vehicleId?: number;
  clientNonce?: string;
  serverNonce?: string;
  createdAt: Date;
  expiresAt: Date;
  isValid: boolean;
}

export interface PKICommandPacket {
  certificate: UserCertificate;
  encryptedPayload: string;
  nonce: string;
  sessionId: string;
  timestamp: number;
  signature: string;
}

export interface PKIResponsePacket {
  success: boolean;
  sessionId: string;
  encryptedPayload: string;
  timestamp: number;
  signature: string;
  error?: string;
}

export interface CertificateRequest {
  vehicleId: number;
  publicKey: string;
  permissions: {
    unlock: boolean;
    lock: boolean;
    startEngine: boolean;
  };
}

export interface CertificateValidationResult {
  isValid: boolean;
  certificate?: Certificate;
  error?: string;
  expiresAt?: Date;
}

export interface PKIConfig {
  rootCAUrl: string;
  certificateUrl: string;
  verificationUrl: string;
  keyStorageKey: string;
  certificateStorageKey: string;
  sessionDuration: number;
}
