import CryptoJS from 'crypto-js';
import { ECCKeyManager } from '@/services/crypto/ECCKeyManager';
import { CertificateService } from '@/services/crypto/CertificateService';
import { PKISession, PKICommandPacket, PKIResponsePacket } from '@/types';

export class CryptoService {
  private static readonly SECRET_KEY = 'digital-key-tc375-secret-2024'; // Legacy fallback
  private static sessions: Map<string, PKISession> = new Map();
  private static readonly SESSION_DURATION = 30 * 60 * 1000; // 30 minutes

  static signCommand(commandData: { timestamp: number; command: string; keyId: string }): string {
    const dataString = JSON.stringify(commandData);
    const hash = CryptoJS.HmacSHA256(dataString, this.SECRET_KEY);
    return hash.toString(CryptoJS.enc.Hex);
  }

  static verifySignature(
    commandData: { timestamp: number; command: string; keyId: string },
    signature: string
  ): boolean {
    const expectedSignature = this.signCommand(commandData);
    return expectedSignature === signature;
  }

  static encryptData(data: string, key?: string): string {
    const encryptionKey = key || this.SECRET_KEY;
    const encrypted = CryptoJS.AES.encrypt(data, encryptionKey);
    return encrypted.toString();
  }

  static decryptData(encryptedData: string, key?: string): string {
    try {
      const encryptionKey = key || this.SECRET_KEY;
      const decrypted = CryptoJS.AES.decrypt(encryptedData, encryptionKey);
      return decrypted.toString(CryptoJS.enc.Utf8);
    } catch (error) {
      throw new Error('Failed to decrypt data');
    }
  }

  static generateRandomKey(length: number = 32): string {
    const characters = 'ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789';
    let result = '';
    
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

  static async establishSecureSession(vehicleId: string, vehiclePublicKey: string): Promise<PKISession> {
    try {
      console.log('Establishing secure PKI session...');
      
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
        throw new Error('No user public key available');
      }

      const session: PKISession = {
        sessionId,
        sessionKey,
        vehiclePublicKey,
        userPublicKey,
        createdAt: new Date(),
        expiresAt: new Date(Date.now() + this.SESSION_DURATION),
        isValid: true
      };

      this.sessions.set(vehicleId, session);
      console.log('Secure PKI session established');
      
      return session;
    } catch (error) {
      console.error('Failed to establish secure session:', error);
      throw new Error('Secure session establishment failed');
    }
  }

  static getSession(vehicleId: string): PKISession | null {
    const session = this.sessions.get(vehicleId);
    
    if (!session) {
      return null;
    }

    // Check if session is still valid
    if (new Date() > session.expiresAt) {
      this.sessions.delete(vehicleId);
      return null;
    }

    return session;
  }

  static async createPKICommand(
    command: string,
    vehicleId: number,
    session: PKISession
  ): Promise<PKICommandPacket> {
    try {
      // Get user certificate
      const userCertificate = await CertificateService.getUserCertificate(vehicleId);
      if (!userCertificate) {
        throw new Error('No user certificate available');
      }

      const nonce = ECCKeyManager.generateNonce();
      const timestamp = Date.now();

      const payload = {
        command,
        timestamp,
        vehicleId,
        nonce
      };

      // Encrypt payload with session key
      const encryptedPayload = this.encryptData(JSON.stringify(payload), session.sessionKey);
      
      // Create signature data
      const signatureData = JSON.stringify({
        sessionId: session.sessionId,
        encryptedPayload,
        nonce,
        timestamp
      });

      // Sign with ECC private key
      const signature = await ECCKeyManager.signData(signatureData);

      const pkiCommand: PKICommandPacket = {
        certificate: userCertificate,
        encryptedPayload,
        nonce,
        sessionId: session.sessionId,
        timestamp,
        signature
      };

      return pkiCommand;
    } catch (error) {
      console.error('Failed to create PKI command:', error);
      throw new Error('PKI command creation failed');
    }
  }

  static async verifyPKIResponse(
    response: PKIResponsePacket,
    session: PKISession,
    vehiclePublicKey: string
  ): Promise<any> {
    try {
      // Verify signature
      const signatureData = JSON.stringify({
        sessionId: response.sessionId,
        encryptedPayload: response.encryptedPayload,
        timestamp: response.timestamp,
        success: response.success
      });

      const isSignatureValid = ECCKeyManager.verifySignature(
        signatureData,
        response.signature,
        vehiclePublicKey
      );

      if (!isSignatureValid) {
        throw new Error('Invalid response signature');
      }

      // Check session ID
      if (response.sessionId !== session.sessionId) {
        throw new Error('Session ID mismatch');
      }

      // Check timestamp (max 30 seconds)
      if (!this.validateTimestamp(response.timestamp, 30000)) {
        throw new Error('Response timestamp invalid');
      }

      // Decrypt payload
      const decryptedPayload = this.decryptData(response.encryptedPayload, session.sessionKey);
      
      return JSON.parse(decryptedPayload);
    } catch (error) {
      console.error('PKI response verification failed:', error);
      throw error;
    }
  }

  static async encryptAES(data: string, key: string): Promise<string> {
    try {
      const encrypted = CryptoJS.AES.encrypt(data, key, {
        mode: CryptoJS.mode.GCM,
        padding: CryptoJS.pad.PKCS7
      });
      return encrypted.toString();
    } catch (error) {
      console.error('AES encryption failed:', error);
      throw new Error('Encryption failed');
    }
  }

  static async decryptAES(encryptedData: string, key: string): Promise<string> {
    try {
      const decrypted = CryptoJS.AES.decrypt(encryptedData, key, {
        mode: CryptoJS.mode.GCM,
        padding: CryptoJS.pad.PKCS7
      });
      return decrypted.toString(CryptoJS.enc.Utf8);
    } catch (error) {
      console.error('AES decryption failed:', error);
      throw new Error('Decryption failed');
    }
  }

  static clearSession(vehicleId: string): void {
    this.sessions.delete(vehicleId);
    console.log('PKI session cleared for vehicle:', vehicleId);
  }

  static clearAllSessions(): void {
    this.sessions.clear();
    console.log('All PKI sessions cleared');
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
  static async signCommandLegacy(commandData: { timestamp: number; command: string; keyId: string }): Promise<string> {
    return this.signCommand(commandData);
  }

  static async signCommandPKI(commandData: any): Promise<string> {
    return await ECCKeyManager.signData(JSON.stringify(commandData));
  }
}