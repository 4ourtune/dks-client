import CryptoJS from 'crypto-js';

export class CryptoService {
  private static readonly SECRET_KEY = 'digital-key-tc375-secret-2024';

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
}