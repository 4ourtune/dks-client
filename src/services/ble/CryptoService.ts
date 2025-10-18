import CryptoJS from "crypto-js";
import { gcm } from "@noble/ciphers/aes";
import { randomBytes } from "@noble/hashes/utils";
import { Buffer } from "buffer";
import { ECCKeyManager } from "@/services/crypto/ECCKeyManager";
import { CertificateService } from "@/services/crypto/CertificateService";
import { PKISession, PKICommandPacket, PKIResponsePacket } from "@/types";

export class CryptoService {
  private static readonly SECRET_KEY = "digital-key-device-secret-2024"; // Legacy fallback
  private static sessions: Map<string, PKISession> = new Map();
  private static readonly SESSION_DURATION = 30 * 60 * 1000; // 30 minutes

  private static normalizeKey(rawKey: string): string {
    if (!rawKey) {
      return rawKey;
    }

    const trimmed = rawKey.trim();
    if (trimmed.length === 0) {
      return trimmed;
    }

    const lower = trimmed.toLowerCase();
    if (lower.startsWith("device:")) {
      const rest = trimmed.slice("device:".length).trim();
      return `device:${rest.toUpperCase()}`;
    }

    if (lower.startsWith("vehicle:")) {
      const rest = trimmed.slice("vehicle:".length).trim();
      return `vehicle:${rest}`;
    }

    if (/^\d+$/.test(trimmed)) {
      return `vehicle:${trimmed}`;
    }

    return `device:${trimmed.toUpperCase()}`;
  }

  static signCommand(commandData: { timestamp: number; command: string; keyId: string }): string {
    const dataString = JSON.stringify(commandData);
    const hash = CryptoJS.HmacSHA256(dataString, this.SECRET_KEY);
    return hash.toString(CryptoJS.enc.Hex);
  }

  static verifySignature(
    commandData: { timestamp: number; command: string; keyId: string },
    signature: string,
  ): boolean {
    const expectedSignature = this.signCommand(commandData);
    return expectedSignature === signature;
  }

  private static hexToBytes(hex: string): Uint8Array {
    if (hex.length % 2 !== 0) {
      throw new Error("Invalid hex string");
    }
    const bytes = new Uint8Array(hex.length / 2);
    for (let i = 0; i < bytes.length; i += 1) {
      bytes[i] = parseInt(hex.substr(i * 2, 2), 16);
    }
    return bytes;
  }

  private static getAesKeyBytes(rawKey: string): Uint8Array {
    const isHex = /^[0-9a-fA-F]+$/.test(rawKey) && rawKey.length === 64;
    if (isHex) {
      return this.hexToBytes(rawKey);
    }
    const hashHex = CryptoJS.SHA256(rawKey).toString(CryptoJS.enc.Hex);
    return this.hexToBytes(hashHex);
  }

  private static encryptWithAesGcm(plaintext: string, keyBytes: Uint8Array): string {
    const iv = randomBytes(12);
    const cipher = gcm(keyBytes, iv);
    const plaintextBytes = Buffer.from(plaintext, "utf8");
    const ciphertext = cipher.encrypt(plaintextBytes);
    const combined = new Uint8Array(iv.length + ciphertext.length);
    combined.set(iv, 0);
    combined.set(ciphertext, iv.length);
    return Buffer.from(combined).toString("base64");
  }

  private static tryDecryptWithAesGcm(encryptedData: string, keyBytes: Uint8Array): string | null {
    const raw = Buffer.from(encryptedData, "base64");
    if (raw.length >= 8) {
      const prefix = raw.subarray(0, 8).toString("ascii");
      if (prefix === "Salted__") {
        return null;
      }
    }

    if (raw.length <= 12) {
      throw new Error("Invalid ciphertext");
    }

    const iv = raw.subarray(0, 12);
    const ciphertext = raw.subarray(12);
    const cipher = gcm(keyBytes, iv);
    const plaintextBytes = cipher.decrypt(ciphertext);
    return Buffer.from(plaintextBytes).toString("utf8");
  }

  static encryptData(data: string, key?: string): string {
    const encryptionKey = key || this.SECRET_KEY;
    const keyBytes = this.getAesKeyBytes(encryptionKey);
    return this.encryptWithAesGcm(data, keyBytes);
  }

  static decryptData(encryptedData: string, key?: string): string {
    const encryptionKey = key || this.SECRET_KEY;
    const keyBytes = this.getAesKeyBytes(encryptionKey);

    try {
      const maybeGcm = this.tryDecryptWithAesGcm(encryptedData, keyBytes);
      if (maybeGcm !== null) {
        return maybeGcm;
      }
    } catch (error) {
      console.warn("AES-GCM decrypt failed, attempting legacy decrypt:", error);
    }

    try {
      const legacy = CryptoJS.AES.decrypt(encryptedData, encryptionKey);
      return legacy.toString(CryptoJS.enc.Utf8);
    } catch (legacyError) {
      throw new Error("Failed to decrypt data");
    }
  }

  static generateRandomKey(length: number = 32): string {
    const characters = "ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789";
    let result = "";

    for (let i = 0; i < length; i++) {
      result += characters.charAt(Math.floor(Math.random() * characters.length));
    }

    return result;
  }

  static hashData(data: string): string {
    return CryptoJS.SHA256(data).toString(CryptoJS.enc.Hex);
  }

  static validateTimestamp(timestamp: number, maxAgeMs: number = 300000): boolean {
    const age = Date.now() - timestamp;
    return age >= 0 && age <= maxAgeMs;
  }

  // PKI Methods

  static async establishSecureSession(
    vehicleId: string,
    vehiclePublicKey: string,
  ): Promise<PKISession> {
    try {
      console.log("[Crypto] establishSecureSession called", { cacheKey: vehicleId });

      const normalizedKey = this.normalizeKey(vehicleId);
      const existing = this.sessions.get(normalizedKey);
      const now = new Date();

      if (existing && existing.expiresAt > now && existing.isValid !== false) {
        console.log("[Crypto] Reusing cached PKI session", {
          cacheKey: vehicleId,
          sessionId: existing.sessionId,
          expiresAt: existing.expiresAt.toISOString(),
        });
        const userPublicKey = existing.userPublicKey ?? (await ECCKeyManager.getPublicKey());
        if (!userPublicKey) {
          throw new Error("No user public key available");
        }

        const updated: PKISession = {
          ...existing,
          userPublicKey,
          vehiclePublicKey,
          vehicleId:
            existing.vehicleId ??
            (Number.isFinite(Number(vehicleId)) ? Number(vehicleId) : undefined),
          isValid: true,
        };

        this.sessions.set(normalizedKey, updated);
        if (updated.vehicleId !== undefined) {
          this.sessions.set(this.normalizeKey(String(updated.vehicleId)), updated);
        }
        console.log("Reusing server-provisioned PKI session");
        return updated;
      }

      // Generate ECDH shared secret
      const sharedSecret = await ECCKeyManager.performECDH(vehiclePublicKey);

      // Generate nonces
      const userNonce = ECCKeyManager.generateNonce();
      const vehicleNonce = ECCKeyManager.generateNonce(); // Should come from vehicle

      // Create session key
      const sessionKey = ECCKeyManager.generateSessionKey(sharedSecret, userNonce, vehicleNonce);

      const sessionId = this.generateRandomKey(16);
      const userPublicKey = await ECCKeyManager.getPublicKey();

      if (!userPublicKey) {
        throw new Error("No user public key available");
      }

      const numericVehicleId = Number(vehicleId);

      const session: PKISession = {
        sessionId,
        sessionKey,
        vehiclePublicKey,
        userPublicKey,
        vehicleId: Number.isFinite(numericVehicleId) ? numericVehicleId : undefined,
        clientNonce: userNonce,
        serverNonce: vehicleNonce,
        createdAt: now,
        expiresAt: new Date(Date.now() + this.SESSION_DURATION),
        isValid: true,
      };

      this.sessions.set(normalizedKey, session);
      if (session.vehicleId !== undefined) {
        this.sessions.set(this.normalizeKey(String(session.vehicleId)), session);
      }
      console.log("[Crypto] Generated new PKI session", {
        cacheKey: normalizedKey,
        sessionId: session.sessionId,
      });

      return session;
    } catch (error) {
      console.error("Failed to establish secure session:", error);
      throw new Error("Secure session establishment failed");
    }
  }

  static getSession(key: string): PKISession | null {
    const normalized = this.normalizeKey(key);
    const session = this.sessions.get(normalized);

    if (!session) {
      return null;
    }

    // Check if session is still valid
    if (new Date() > session.expiresAt) {
      this.sessions.delete(normalized);
      return null;
    }

    return session;
  }

  static async createPKICommand(
    command: string,
    vehicleId: number,
    session: PKISession,
  ): Promise<PKICommandPacket> {
    try {
      // Get user certificate
      const userCertificate = await CertificateService.getUserCertificate(vehicleId);
      if (!userCertificate) {
        throw new Error("No user certificate available");
      }

      const nonce = ECCKeyManager.generateNonce();
      const timestamp = Date.now();
      const keyId = userCertificate.keyId ?? userCertificate.id;
      if (!keyId) {
        throw new Error("User certificate missing key identifier");
      }

      const payload = {
        command,
        timestamp,
        vehicleId,
        keyId,
        nonce,
      };

      // Encrypt payload with session key
      const encryptedPayload = this.encryptData(JSON.stringify(payload), session.sessionKey);

      // Create signature data
      const signatureData = JSON.stringify({
        sessionId: session.sessionId,
        encryptedPayload,
        nonce,
        timestamp,
      });

      // Sign with ECC private key
      const signature = await ECCKeyManager.signData(signatureData);

      const pkiCommand: PKICommandPacket = {
        certificate: userCertificate,
        encryptedPayload,
        nonce,
        sessionId: session.sessionId,
        timestamp,
        signature,
      };

      return pkiCommand;
    } catch (error) {
      console.error("Failed to create PKI command:", error);
      throw new Error("PKI command creation failed");
    }
  }

  static async verifyPKIResponse(
    response: PKIResponsePacket,
    session: PKISession,
    vehiclePublicKey: string,
  ): Promise<any> {
    try {
      // Verify signature
      const signatureData = JSON.stringify({
        sessionId: response.sessionId,
        encryptedPayload: response.encryptedPayload,
        timestamp: response.timestamp,
        success: response.success,
      });

      const isSignatureValid = ECCKeyManager.verifySignature(
        signatureData,
        response.signature,
        vehiclePublicKey,
      );

      if (!isSignatureValid) {
        throw new Error("Invalid response signature");
      }

      // Check session ID
      if (response.sessionId !== session.sessionId) {
        throw new Error("Session ID mismatch");
      }

      // Check timestamp (max 30 seconds)
      if (!this.validateTimestamp(response.timestamp, 30000)) {
        throw new Error("Response timestamp invalid");
      }

      // Decrypt payload
      const decryptedPayload = this.decryptData(response.encryptedPayload, session.sessionKey);

      return JSON.parse(decryptedPayload);
    } catch (error) {
      console.error("PKI response verification failed:", error);
      throw error;
    }
  }

  static async encryptAES(data: string, key: string): Promise<string> {
    try {
      const encrypted = CryptoJS.AES.encrypt(data, key, {
        mode: CryptoJS.mode.CBC,
        padding: CryptoJS.pad.Pkcs7,
      });
      return encrypted.toString();
    } catch (error) {
      console.error("AES encryption failed:", error);
      throw new Error("Encryption failed");
    }
  }

  static async decryptAES(encryptedData: string, key: string): Promise<string> {
    try {
      const decrypted = CryptoJS.AES.decrypt(encryptedData, key, {
        mode: CryptoJS.mode.CBC,
        padding: CryptoJS.pad.Pkcs7,
      });
      return decrypted.toString(CryptoJS.enc.Utf8);
    } catch (error) {
      console.error("AES decryption failed:", error);
      throw new Error("Decryption failed");
    }
  }

  static clearSession(key: string): void {
    const normalized = this.normalizeKey(key);
    const existed = this.sessions.delete(normalized);
    console.log("PKI session cleared for cache key:", key, {
      normalizedKey: normalized,
      existed,
    });
  }

  static async seedSessionFromServer(
    cacheKey: string,
    session: {
      sessionId: string;
      sessionKey: string;
      expiresAt: number;
      vehicleId?: number;
      vehiclePublicKey?: string;
      clientNonce?: string;
      serverNonce?: string;
    },
  ): Promise<PKISession> {
    console.log("[Crypto] Seeding PKI session from server", {
      cacheKey,
      sessionId: session.sessionId,
      expiresAt: new Date(session.expiresAt).toISOString(),
      vehicleId: session.vehicleId,
    });

    const candidateKeys = new Set<string>();
    candidateKeys.add(cacheKey);
    candidateKeys.add(cacheKey.toLowerCase());
    candidateKeys.add(cacheKey.toUpperCase());
    if (session.vehicleId !== undefined) {
      candidateKeys.add(String(session.vehicleId));
    }

    let existing: PKISession | undefined;
    for (const candidate of candidateKeys) {
      const normalizedCandidate = this.normalizeKey(candidate);
      const match = this.sessions.get(normalizedCandidate);
      if (match) {
        existing = match;
        break;
      }
    }

    const numericVehicleId = Number.isFinite(session.vehicleId)
      ? session.vehicleId
      : Number(cacheKey);
    const expiresAtDate = new Date(session.expiresAt);
    const userPublicKey = existing?.userPublicKey ?? (await ECCKeyManager.getPublicKey());

    if (!userPublicKey) {
      throw new Error("Unable to seed PKI session without user public key");
    }

    const seeded: PKISession = {
      sessionId: session.sessionId,
      sessionKey: session.sessionKey,
      vehiclePublicKey: session.vehiclePublicKey ?? existing?.vehiclePublicKey ?? "",
      userPublicKey,
      vehicleId: Number.isFinite(numericVehicleId) ? numericVehicleId : existing?.vehicleId,
      clientNonce: session.clientNonce ?? existing?.clientNonce,
      serverNonce: session.serverNonce ?? existing?.serverNonce,
      createdAt: existing?.createdAt ?? new Date(),
      expiresAt: expiresAtDate,
      isValid: true,
    };

    for (const candidate of candidateKeys) {
      const normalized = this.normalizeKey(candidate);
      this.sessions.set(normalized, seeded);
    }

    return seeded;
  }

  static clearAllSessions(): void {
    this.sessions.clear();
    console.log("All PKI sessions cleared");
  }

  static getActiveSessions(): string[] {
    const now = new Date();
    const activeSessions: string[] = [];

    this.sessions.forEach((session, vehicleId) => {
      if (session.isValid && now <= session.expiresAt) {
        activeSessions.push(vehicleId);
      } else {
        this.sessions.delete(vehicleId);
      }
    });

    return activeSessions;
  }

  // Legacy methods - kept for backward compatibility
  static async signCommandLegacy(commandData: {
    timestamp: number;
    command: string;
    keyId: string;
  }): Promise<string> {
    return this.signCommand(commandData);
  }

  static async signCommandPKI(commandData: any): Promise<string> {
    return await ECCKeyManager.signData(JSON.stringify(commandData));
  }
}
