import CryptoJS from "crypto-js";
import * as Keychain from "react-native-keychain";
import { ec as EC } from "elliptic";
import { Buffer } from "buffer";
import { ECCKeyPair } from "@/types";

export class ECCKeyManager {
  private static readonly PRIVATE_KEY_STORAGE_KEY = "user_ecc_private_key";
  private static readonly PUBLIC_KEY_STORAGE_KEY = "user_ecc_public_key";
  private static readonly KEY_SERVICE = "DKS_ECC_KEYS";
  private static readonly CURVE_NAME = "secp256r1";
  private static readonly ec = new EC("p256");

  static async generateKeyPair(): Promise<ECCKeyPair> {
    try {
      console.log("Generating ECC key pair using secp256r1...");

      const keyPair = this.ec.genKeyPair();
      const privateKeyHex = keyPair.getPrivate("hex").padStart(64, "0");
      // Uncompressed public key, starts with 0x04 and is 65 bytes (130 hex chars)
      const publicKeyHex = keyPair.getPublic(false, "hex");

      const eccKeyPair: ECCKeyPair = {
        privateKey: privateKeyHex,
        publicKey: publicKeyHex,
        curve: this.CURVE_NAME,
      };

      console.log("ECC key pair generated successfully");
      return eccKeyPair;
    } catch (error) {
      console.error("Failed to generate ECC key pair:", error);
      throw new Error("ECC key generation failed");
    }
  }

  static async storeKeyPair(keyPair: ECCKeyPair): Promise<void> {
    try {
      await Keychain.setInternetCredentials(
        this.KEY_SERVICE,
        this.PRIVATE_KEY_STORAGE_KEY,
        keyPair.privateKey,
      );

      await Keychain.setInternetCredentials(
        `${this.KEY_SERVICE}_PUBLIC`,
        this.PUBLIC_KEY_STORAGE_KEY,
        keyPair.publicKey,
      );

      console.log("ECC key pair stored securely");
    } catch (error) {
      console.error("Failed to store ECC key pair:", error);
      throw new Error("Key storage failed");
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
        curve: this.CURVE_NAME,
      };
    } catch (error) {
      console.error("Failed to retrieve ECC key pair:", error);
      return null;
    }
  }

  static async getPublicKey(): Promise<string | null> {
    try {
      const result = await Keychain.getInternetCredentials(`${this.KEY_SERVICE}_PUBLIC`);
      return result ? result.password : null;
    } catch (error) {
      console.error("Failed to retrieve public key:", error);
      return null;
    }
  }

  static async signData(data: string, privateKey?: string): Promise<string> {
    try {
      let privKey = privateKey;

      if (!privKey) {
        const keyPair = await this.getKeyPair();
        if (!keyPair) {
          throw new Error("No private key available");
        }
        privKey = keyPair.privateKey;
      }

      const signer = this.ec.keyFromPrivate(privKey, "hex");
      const hashHex = CryptoJS.SHA256(data).toString(CryptoJS.enc.Hex);
      const signature = signer.sign(hashHex, { canonical: true });

      const derHex = signature.toDER("hex");
      console.log("Data signed using ECDSA (secp256r1)");
      return derHex;
    } catch (error) {
      console.error("Failed to sign data:", error);
      throw new Error("Data signing failed");
    }
  }

  static verifySignature(data: string, signature: string, publicKey: string): boolean {
    try {
      const verifier = this.ec.keyFromPublic(publicKey, "hex");
      const hashHex = CryptoJS.SHA256(data).toString(CryptoJS.enc.Hex);
      const isValid = verifier.verify(hashHex, signature);
      if (isValid) {
        console.log("Signature verified using ECDSA");
      } else {
        console.warn("ECDSA signature verification failed");
      }
      return isValid;
    } catch (error) {
      console.error("Failed to verify signature:", error);
      return false;
    }
  }

  static async performECDH(otherPublicKey: string): Promise<string> {
    try {
      const keyPair = await this.getKeyPair();
      if (!keyPair) {
        throw new Error("No private key available for ECDH");
      }

      const privateKey = this.ec.keyFromPrivate(keyPair.privateKey, "hex");
      const publicKey = this.ec.keyFromPublic(otherPublicKey, "hex");

      const shared = privateKey.derive(publicKey.getPublic()); // BN instance
      const sharedBuffer = Buffer.from(shared.toArray("be", 32));
      const sharedSecretHex = sharedBuffer.toString("hex");

      console.log("ECDH performed using secp256r1");
      return sharedSecretHex;
    } catch (error) {
      console.error("ECDH key exchange failed:", error);
      throw new Error("ECDH failed");
    }
  }

  static generateSessionKey(sharedSecret: string, nonce1: string, nonce2: string): string {
    try {
      const combinedData = sharedSecret + nonce1 + nonce2;
      const sessionKey = CryptoJS.SHA256(combinedData).toString();
      return sessionKey.substring(0, 64); // 256-bit key
    } catch (error) {
      console.error("Session key generation failed:", error);
      throw new Error("Session key generation failed");
    }
  }

  static async clearKeys(): Promise<void> {
    try {
      await Keychain.resetInternetCredentials(this.KEY_SERVICE);
      await Keychain.resetInternetCredentials(`${this.KEY_SERVICE}_PUBLIC`);
      console.log("ECC keys cleared");
    } catch (error) {
      console.error("Failed to clear ECC keys:", error);
      throw new Error("Key clearing failed");
    }
  }

  static async hasValidKeyPair(): Promise<boolean> {
    try {
      const keyPair = await this.getKeyPair();
      if (!keyPair) {
        return false;
      }

      try {
        const privateKey = this.ec.keyFromPrivate(keyPair.privateKey, "hex");
        const publicKey = this.ec.keyFromPublic(keyPair.publicKey, "hex");
        const isValid = privateKey.validate().result && publicKey.validate().result;
        if (!isValid) {
          console.warn("Stored ECC key pair failed curve validation");
        } else {
          console.log("ECC key pair validated successfully");
        }
        return isValid;
      } catch (validationError) {
        console.warn("Failed to validate stored ECC key pair:", validationError);
        return false;
      }
    } catch (error) {
      console.error("Key validation failed:", error);
      return false;
    }
  }

  static generateNonce(): string {
    const wordArray = CryptoJS.lib.WordArray.random(16);
    return wordArray.toString(CryptoJS.enc.Hex);
  }
}
