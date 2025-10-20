import CryptoJS from "crypto-js";
import * as Keychain from "react-native-keychain";
import { ec as EC } from "elliptic";
import BN from "bn.js";
import { Buffer } from "buffer";
import { ECCKeyPair } from "@/types";

export class ECCKeyManager {
  private static readonly PRIVATE_KEY_STORAGE_KEY = "user_ecc_private_key";
  private static readonly PUBLIC_KEY_STORAGE_KEY = "user_ecc_public_key";
  private static readonly KEY_SERVICE = "DKS_ECC_KEYS";
  private static readonly CURVE_NAME = "secp256r1";
  private static readonly ec = new EC("p256");

  private static normalizePublicKey(rawKey: string): string {
    if (!rawKey) {
      throw new Error("Public key is empty");
    }

    const trimmed = rawKey.trim();
    if (!trimmed) {
      throw new Error("Public key is empty");
    }

    const hexCandidate = trimmed.replace(/^0x/i, "");
    if (/^[0-9a-fA-F]+$/.test(hexCandidate) && hexCandidate.length >= 128) {
      return hexCandidate.toLowerCase();
    }

    if (trimmed.includes("BEGIN PUBLIC KEY")) {
      const base64 = trimmed
        .replace(/-----BEGIN PUBLIC KEY-----/g, "")
        .replace(/-----END PUBLIC KEY-----/g, "")
        .replace(/\s+/g, "");
      const der = Buffer.from(base64, "base64");
      if (!der.length) {
        throw new Error("Failed to decode PEM public key");
      }

      const markerIndex = der.lastIndexOf(0x04);
      const slice =
        markerIndex >= 0 && der.length - markerIndex >= 65
          ? der.slice(markerIndex, markerIndex + 65)
          : der.slice(der.length - 65);
      if (slice.length !== 65 || slice[0] !== 0x04) {
        throw new Error("Unsupported public key format");
      }
      return Buffer.from(slice).toString("hex");
    }

    throw new Error("Unsupported public key format");
  }

  private static normalizeSignature(signature: string): string {
    if (!signature) {
      throw new Error("Signature is empty");
    }

    const trimmed = signature.trim();
    if (!trimmed) {
      throw new Error("Signature is empty");
    }

    if (/^[0-9a-fA-F]+$/.test(trimmed)) {
      return trimmed.toLowerCase();
    }

    try {
      const buffer = Buffer.from(trimmed, "base64");
      if (!buffer.length) {
        throw new Error("Decoded signature empty");
      }
      return buffer.toString("hex");
    } catch (error) {
      throw new Error(
        `Unsupported signature format (${(error as Error)?.message ?? "decode failed"})`,
      );
    }
  }

  private static decodeDERSignature(hexSignature: string): { r: Buffer; s: Buffer } | null {
    const der = Buffer.from(hexSignature, "hex");
    if (der.length < 8 || der[0] !== 0x30) {
      return null;
    }

    let offset = 2;
    const firstLengthByte = der[1];
    if (firstLengthByte > 0x80) {
      const lengthBytes = firstLengthByte - 0x80;
      if (lengthBytes === 0 || lengthBytes > 2 || der.length < 2 + lengthBytes) {
        return null;
      }
      const declaredLength = der.readUIntBE(2, lengthBytes);
      offset = 2 + lengthBytes;
      if (declaredLength !== der.length - offset) {
        // Length mismatch; continue best-effort.
      }
    } else if (firstLengthByte === 0x80) {
      // Indefinite length not expected.
      return null;
    }

    if (der[offset] !== 0x02) {
      return null;
    }
    const lenR = der[offset + 1];
    let rStart = offset + 2;
    let rEnd = rStart + lenR;
    if (rEnd > der.length) {
      return null;
    }
    const rBytes = der.slice(rStart, rEnd);

    offset = rEnd;
    if (der[offset] !== 0x02) {
      return null;
    }
    const lenS = der[offset + 1];
    const sStart = offset + 2;
    const sEnd = sStart + lenS;
    if (sEnd > der.length) {
      return null;
    }
    const sBytes = der.slice(sStart, sEnd);

    return { r: rBytes, s: sBytes };
  }

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
      const normalizedKey = this.normalizePublicKey(publicKey);
      const normalizedSignature = this.normalizeSignature(signature);
      const verifier = this.ec.keyFromPublic(normalizedKey, "hex");
      const hashHex = CryptoJS.SHA256(data).toString(CryptoJS.enc.Hex);
      let signatureObj: any = normalizedSignature;
      const decoded = this.decodeDERSignature(normalizedSignature);
      if (decoded) {
        signatureObj = {
          r: new BN(decoded.r.toString("hex"), 16),
          s: new BN(decoded.s.toString("hex"), 16),
        };
      } else {
        try {
          const derBuffer = Buffer.from(normalizedSignature, "hex");
          signatureObj = (this.ec as any).signatureFromDER
            ? (this.ec as any).signatureFromDER(derBuffer)
            : derBuffer;
        } catch (parseError) {
          console.warn("Failed to parse DER signature; attempting raw verification", parseError);
        }
      }
      const hashBuffer = Buffer.from(hashHex, "hex");
      const isValid = verifier.verify(hashBuffer, signatureObj);
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
      const normalizedOtherKey = this.normalizePublicKey(otherPublicKey);
      const publicKey = this.ec.keyFromPublic(normalizedOtherKey, "hex");

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
