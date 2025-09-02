import EC from 'elliptic';
import * as Keychain from 'react-native-keychain';
import CryptoJS from 'crypto-js';
import { ECCKeyPair } from '@/types';

const ec = new EC.ec('secp256r1');

export class ECCKeyManager {
  private static readonly PRIVATE_KEY_STORAGE_KEY = 'user_ecc_private_key';
  private static readonly PUBLIC_KEY_STORAGE_KEY = 'user_ecc_public_key';
  private static readonly KEY_SERVICE = 'DKS_ECC_KEYS';

  static async generateKeyPair(): Promise<ECCKeyPair> {
    try {
      console.log('Generating ECC key pair...');
      const keyPair = ec.genKeyPair();
      
      const privateKeyHex = keyPair.getPrivate('hex');
      const publicKeyHex = keyPair.getPublic(true, 'hex'); // Compressed format
      
      const eccKeyPair: ECCKeyPair = {
        privateKey: privateKeyHex,
        publicKey: publicKeyHex,
        curve: 'secp256r1'
      };

      console.log('ECC key pair generated successfully');
      return eccKeyPair;
    } catch (error) {
      console.error('Failed to generate ECC key pair:', error);
      throw new Error('ECC key generation failed');
    }
  }

  static async storeKeyPair(keyPair: ECCKeyPair): Promise<void> {
    try {
      await Keychain.setInternetCredentials(
        this.KEY_SERVICE,
        this.PRIVATE_KEY_STORAGE_KEY,
        keyPair.privateKey,
        {
          accessControl: Keychain.ACCESS_CONTROL.BIOMETRY_CURRENT_SET,
          accessGroup: 'group.dks.keys',
          storage: Keychain.STORAGE_TYPE.AES_GCM_NO_AUTH
        }
      );

      await Keychain.setInternetCredentials(
        `${this.KEY_SERVICE}_PUBLIC`,
        this.PUBLIC_KEY_STORAGE_KEY,
        keyPair.publicKey,
        {
          storage: Keychain.STORAGE_TYPE.AES_GCM_NO_AUTH
        }
      );

      console.log('ECC key pair stored securely');
    } catch (error) {
      console.error('Failed to store ECC key pair:', error);
      throw new Error('Key storage failed');
    }
  }

  static async getKeyPair(): Promise<ECCKeyPair | null> {
    try {
      const privateKeyResult = await Keychain.getInternetCredentials(this.KEY_SERVICE);
      const publicKeyResult = await Keychain.getInternetCredentials(`${this.KEY_SERVICE}_PUBLIC`);

      if (!privateKeyResult || !publicKeyResult) {
        return null;
      }

      return {
        privateKey: privateKeyResult.password,
        publicKey: publicKeyResult.password,
        curve: 'secp256r1'
      };
    } catch (error) {
      console.error('Failed to retrieve ECC key pair:', error);
      return null;
    }
  }

  static async getPublicKey(): Promise<string | null> {
    try {
      const result = await Keychain.getInternetCredentials(`${this.KEY_SERVICE}_PUBLIC`);
      return result ? result.password : null;
    } catch (error) {
      console.error('Failed to retrieve public key:', error);
      return null;
    }
  }

  static async signData(data: string, privateKey?: string): Promise<string> {
    try {
      let privKey = privateKey;
      
      if (!privKey) {
        const keyPair = await this.getKeyPair();
        if (!keyPair) {
          throw new Error('No private key available');
        }
        privKey = keyPair.privateKey;
      }

      const key = ec.keyFromPrivate(privKey, 'hex');
      const hash = CryptoJS.SHA256(data).toString();
      const signature = key.sign(hash, 'hex');
      
      return signature.toDER('hex');
    } catch (error) {
      console.error('Failed to sign data:', error);
      throw new Error('Data signing failed');
    }
  }

  static verifySignature(data: string, signature: string, publicKey: string): boolean {
    try {
      const key = ec.keyFromPublic(publicKey, 'hex');
      const hash = CryptoJS.SHA256(data).toString();
      
      return key.verify(hash, signature, 'hex');
    } catch (error) {
      console.error('Failed to verify signature:', error);
      return false;
    }
  }

  static async performECDH(otherPublicKey: string): Promise<string> {
    try {
      const keyPair = await this.getKeyPair();
      if (!keyPair) {
        throw new Error('No private key available for ECDH');
      }

      const privateKeyObj = ec.keyFromPrivate(keyPair.privateKey, 'hex');
      const publicKeyObj = ec.keyFromPublic(otherPublicKey, 'hex');
      
      const sharedSecret = privateKeyObj.derive(publicKeyObj.getPublic());
      return sharedSecret.toString('hex');
    } catch (error) {
      console.error('ECDH key exchange failed:', error);
      throw new Error('ECDH failed');
    }
  }

  static generateSessionKey(sharedSecret: string, nonce1: string, nonce2: string): string {
    try {
      const combinedData = sharedSecret + nonce1 + nonce2;
      const sessionKey = CryptoJS.SHA256(combinedData).toString();
      return sessionKey.substring(0, 64); // 256-bit key
    } catch (error) {
      console.error('Session key generation failed:', error);
      throw new Error('Session key generation failed');
    }
  }

  static async clearKeys(): Promise<void> {
    try {
      await Keychain.resetInternetCredentials(this.KEY_SERVICE);
      await Keychain.resetInternetCredentials(`${this.KEY_SERVICE}_PUBLIC`);
      console.log('ECC keys cleared');
    } catch (error) {
      console.error('Failed to clear ECC keys:', error);
      throw new Error('Key clearing failed');
    }
  }

  static async hasValidKeyPair(): Promise<boolean> {
    try {
      const keyPair = await this.getKeyPair();
      if (!keyPair) {
        return false;
      }

      // Validate key format
      const privateKeyObj = ec.keyFromPrivate(keyPair.privateKey, 'hex');
      const publicKeyFromPrivate = privateKeyObj.getPublic(true, 'hex');
      
      return publicKeyFromPrivate === keyPair.publicKey;
    } catch (error) {
      console.error('Key validation failed:', error);
      return false;
    }
  }

  static generateNonce(): string {
    const randomBytes = CryptoJS.lib.WordArray.random(16);
    return randomBytes.toString(CryptoJS.enc.Hex);
  }
}