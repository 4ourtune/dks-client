import AsyncStorage from "@react-native-async-storage/async-storage";
import { useAuthStore } from "@/stores";
import { StorageService } from "@/services/storage/StorageService";
import {
  Certificate,
  UserCertificate,
  VehicleCertificate,
  RootCACertificate,
  CertificateRequest,
  CertificateValidationResult,
} from "@/types";
import { ECCKeyManager } from "./ECCKeyManager";
import axios from "axios";
import { API_BASE_URL } from "@/utils/constants";
import { httpClient } from "@/services/api/httpClient";

export class CertificateService {
  private static readonly ROOT_CA_STORAGE_KEY = "root_ca_certificate";
  private static readonly USER_CERT_STORAGE_KEY = "user_certificate";
  private static readonly VEHICLE_CERTS_STORAGE_KEY = "vehicle_certificates";
  private static readonly CERT_CACHE_DURATION = 24 * 60 * 60 * 1000; // 24 hours
  private static readonly VEHICLE_CERT_REFRESH_THRESHOLD = 10 * 60 * 1000; // 10 minutes

  static async initializePKI(): Promise<void> {
    try {
      console.log("Initializing PKI system...");

      const authState = useAuthStore.getState();
      if (!authState.token) {
        console.log("Skipping PKI initialization before authentication");
        return;
      }

      // Check if keys exist, generate if not
      const hasKeys = await ECCKeyManager.hasValidKeyPair();
      if (!hasKeys) {
        console.log("Generating new ECC key pair...");
        const keyPair = await ECCKeyManager.generateKeyPair();
        await ECCKeyManager.storeKeyPair(keyPair);
      }

      try {
        await this.ensureRootCA();
        console.log("PKI system initialized with Root CA");
      } catch (error) {
        const message = error instanceof Error ? error.message : String(error);
        console.warn("Root CA unavailable, continuing in offline mode:", message);
      }

      console.log("PKI system initialized successfully");
    } catch (error) {
      console.error("PKI initialization failed:", error);
      throw new Error("PKI initialization failed");
    }
  }

  static async getRootCACertificate(): Promise<RootCACertificate> {
    try {
      const response = await axios.get(`${API_BASE_URL}/certificates/root-ca/public-key`, {
        timeout: 10000,
      });

      if (!response.data || !response.data.certificate) {
        throw new Error("Invalid Root CA response");
      }

      const rootCA: RootCACertificate = {
        id: response.data.certificate.id,
        subject: response.data.certificate.subject,
        issuer: response.data.certificate.issuer,
        publicKey: response.data.certificate.publicKey,
        signature: response.data.certificate.signature,
        notBefore: new Date(response.data.certificate.notBefore),
        notAfter: new Date(response.data.certificate.notAfter),
        serialNumber: response.data.certificate.serialNumber,
        version: response.data.certificate.version,
        isRootCA: true,
      };

      // Cache Root CA
      await AsyncStorage.setItem(
        this.ROOT_CA_STORAGE_KEY,
        JSON.stringify({
          certificate: rootCA,
          cachedAt: Date.now(),
        }),
      );

      return rootCA;
    } catch (error) {
      console.error("Failed to get Root CA certificate:", error);
      throw new Error("Root CA download failed");
    }
  }

  static async ensureRootCA(): Promise<RootCACertificate> {
    const cached = await AsyncStorage.getItem(this.ROOT_CA_STORAGE_KEY);
    let cachedCertificate: RootCACertificate | null = null;
    let cachedAt: number | null = null;

    if (cached) {
      try {
        const parsed = JSON.parse(cached) as { certificate?: RootCACertificate; cachedAt?: number };
        if (parsed?.certificate) {
          cachedCertificate = parsed.certificate;
          cachedAt = typeof parsed.cachedAt === "number" ? parsed.cachedAt : null;

          if (cachedAt && Date.now() - cachedAt < this.CERT_CACHE_DURATION) {
            return cachedCertificate;
          }
        }
      } catch (error) {
        console.warn("Failed to parse cached Root CA certificate:", error);
      }
    }

    try {
      const freshCertificate = await this.getRootCACertificate();
      return freshCertificate;
    } catch (error) {
      console.warn("Failed to refresh Root CA certificate, using cached copy if available:", error);
      if (cachedCertificate) {
        return cachedCertificate;
      }

      throw error instanceof Error ? error : new Error("Root CA download failed");
    }
  }

  private static normalizeUserCertificatePayload(
    rawCertificate: any,
    fallbackVehicleId: number,
  ): UserCertificate {
    if (!rawCertificate) {
      throw new Error("Certificate payload missing from response");
    }

    const payload = rawCertificate.certificate ?? rawCertificate;

    const validityStart = payload.notBefore ?? payload.validFrom;
    const validityEnd = payload.notAfter ?? payload.validTo;
    if (!validityStart || !validityEnd) {
      throw new Error("Certificate payload missing validity period");
    }

    const vehicleIdSource =
      payload.vehicleId ??
      payload.allowedVehicles?.[0] ??
      payload.subject?.vehicleId ??
      fallbackVehicleId;

    const vehicleId = Number(vehicleIdSource);
    if (!Number.isFinite(vehicleId)) {
      throw new Error("Certificate payload missing vehicle reference");
    }

    const allowedVehicles = Array.isArray(payload.allowedVehicles)
      ? payload.allowedVehicles
          .map((item: unknown): number => Number(item))
          .filter((value: number): value is number => Number.isFinite(value))
      : [vehicleId];

    const permissions = {
      unlock: Boolean(payload.permissions?.unlock),
      lock: Boolean(payload.permissions?.lock),
      startEngine: Boolean(payload.permissions?.startEngine ?? payload.permissions?.engine_on),
    };

    const userIdSource = payload.userId ?? payload.subject?.userId;
    const userId = userIdSource !== undefined && userIdSource !== null ? String(userIdSource) : "";
    const keyId = payload.keyId ?? payload.subject?.keyId;
    return {
      id: payload.id ?? payload.serialNumber,
      subject: payload.subject,
      issuer: payload.issuer,
      publicKey: payload.publicKey,
      signature: payload.signature,
      notBefore: new Date(validityStart),
      notAfter: new Date(validityEnd),
      serialNumber: payload.serialNumber,
      version: payload.version || 1,
      vehicleId,
      permissions,
      userId,
      keyId,
      allowedVehicles,
    };
  }

  static async requestUserCertificate(
    vehicleId: number,
    permissions: CertificateRequest["permissions"],
  ): Promise<UserCertificate> {
    try {
      const publicKey = await ECCKeyManager.getPublicKey();
      if (!publicKey) {
        throw new Error("No public key available");
      }

      const request: CertificateRequest = {
        vehicleId,
        publicKey,
        permissions,
      };

      const response = await httpClient.post(
        "/certificates/digital-key",
        {
          ...request,
          permissions: {
            unlock: request.permissions.unlock,
            lock: request.permissions.lock,
            engine_on: request.permissions.startEngine,
          },
        },
        {
          headers: {
            Authorization: `Bearer ${await this.getAuthToken()}`,
            "Content-Type": "application/json",
          },
          timeout: 15000,
        },
      );

      const certificatePayload = response.data?.certificate ?? response.data?.data?.certificate;
      const certificate = this.normalizeUserCertificatePayload(certificatePayload, vehicleId);
      await this.storeUserCertificate(certificate);
      console.log("Stored user certificate for vehicle", certificate.vehicleId);
      return certificate;
    } catch (error) {
      const message = error instanceof Error ? error.message : "Certificate request failed";
      console.error("Failed to request user certificate:", error);
      throw new Error(message);
    }
  }

  static async storeUserCertificate(certificate: UserCertificate): Promise<void> {
    try {
      await AsyncStorage.setItem(
        `${this.USER_CERT_STORAGE_KEY}_${certificate.vehicleId}`,
        JSON.stringify({
          certificate,
          storedAt: Date.now(),
        }),
      );
    } catch (error) {
      console.error("Failed to store user certificate:", error);
      throw error;
    }
  }

  static async getCachedVehicleCertificate(vehicleId: number): Promise<VehicleCertificate | null> {
    try {
      const stored = await AsyncStorage.getItem(`${this.VEHICLE_CERTS_STORAGE_KEY}_${vehicleId}`);
      if (!stored) {
        return null;
      }

      const parsed = JSON.parse(stored) as {
        certificate?: Partial<VehicleCertificate> & { notBefore?: string; notAfter?: string };
        cachedAt?: number;
      };

      if (!parsed?.certificate) {
        return null;
      }

      const notBefore = parsed.certificate.notBefore
        ? new Date(parsed.certificate.notBefore)
        : new Date();
      const notAfter = parsed.certificate.notAfter
        ? new Date(parsed.certificate.notAfter)
        : new Date(0);

      const now = Date.now();
      const cacheAge = parsed.cachedAt ? now - parsed.cachedAt : 0;
      const timeUntilExpiry = notAfter.getTime() - now;

      if (timeUntilExpiry <= 0 || cacheAge > this.CERT_CACHE_DURATION) {
        await AsyncStorage.removeItem(`${this.VEHICLE_CERTS_STORAGE_KEY}_${vehicleId}`);
        return null;
      }

      if (
        this.VEHICLE_CERT_REFRESH_THRESHOLD > 0 &&
        timeUntilExpiry <= this.VEHICLE_CERT_REFRESH_THRESHOLD
      ) {
        const secondsUntilExpiry = Math.max(0, Math.round(timeUntilExpiry / 1000));
        console.log(
          `Vehicle certificate for ${vehicleId} expires in ${secondsUntilExpiry}s; invalidating cache to refresh`,
        );
        await AsyncStorage.removeItem(`${this.VEHICLE_CERTS_STORAGE_KEY}_${vehicleId}`);
        return null;
      }

      return {
        ...(parsed.certificate as VehicleCertificate),
        notBefore,
        notAfter,
      };
    } catch (error) {
      console.warn("Failed to get cached vehicle certificate:", error);
      return null;
    }
  }

  static async storeVehicleCertificate(
    vehicleId: number,
    certificate: VehicleCertificate,
  ): Promise<void> {
    try {
      const payload = {
        certificate: {
          ...certificate,
          notBefore:
            certificate.notBefore instanceof Date
              ? certificate.notBefore.toISOString()
              : certificate.notBefore,
          notAfter:
            certificate.notAfter instanceof Date
              ? certificate.notAfter.toISOString()
              : certificate.notAfter,
        },
        cachedAt: Date.now(),
      };

      await AsyncStorage.setItem(
        `${this.VEHICLE_CERTS_STORAGE_KEY}_${vehicleId}`,
        JSON.stringify(payload),
      );
    } catch (error) {
      console.error("Failed to store vehicle certificate:", error);
    }
  }

  static async getUserCertificate(vehicleId: number): Promise<UserCertificate | null> {
    try {
      const stored = await AsyncStorage.getItem(`${this.USER_CERT_STORAGE_KEY}_${vehicleId}`);
      if (!stored) {
        return null;
      }

      const { certificate } = JSON.parse(stored);

      // Check expiration
      const now = new Date();
      const expiryDate = new Date(certificate.notAfter);

      if (now >= expiryDate) {
        console.log("User certificate expired, removing...");
        await AsyncStorage.removeItem(`${this.USER_CERT_STORAGE_KEY}_${vehicleId}`);
        return null;
      }

      return {
        ...certificate,
        notBefore: new Date(certificate.notBefore),
        notAfter: new Date(certificate.notAfter),
      };
    } catch (error) {
      console.error("Failed to get user certificate:", error);
      return null;
    }
  }

  static async verifyCertificate(certificate: Certificate): Promise<CertificateValidationResult> {
    try {
      const response = await axios.post(
        `${API_BASE_URL}/certificates/verify`,
        { certificate },
        {
          headers: {
            "Content-Type": "application/json",
          },
          timeout: 5000,
        },
      );

      const result: CertificateValidationResult = {
        isValid: response.data.isValid,
        certificate: response.data.certificate,
        error: response.data.error,
        expiresAt: response.data.expiresAt ? new Date(response.data.expiresAt) : undefined,
      };

      return result;
    } catch (error) {
      console.error("Certificate verification failed:", error);
      return {
        isValid: false,
        error: "Verification request failed",
      };
    }
  }

  static async verifyVehicleCertificate(vehicleCert: VehicleCertificate): Promise<boolean> {
    try {
      const rootCA = await this.ensureRootCA();

      // Verify certificate signature with Root CA
      const isSignatureValid = ECCKeyManager.verifySignature(
        this.getCertificateSigningData(vehicleCert),
        vehicleCert.signature,
        rootCA.publicKey,
      );

      if (!isSignatureValid) {
        console.error("Vehicle certificate signature invalid");
        return false;
      }

      // Check expiration
      const now = new Date();
      if (now < vehicleCert.notBefore || now > vehicleCert.notAfter) {
        console.error("Vehicle certificate expired or not yet valid");
        return false;
      }

      return true;
    } catch (error) {
      console.error("Vehicle certificate verification failed:", error);
      return false;
    }
  }

  static async ensureUserCertificate(
    vehicleId: number,
    permissions: CertificateRequest["permissions"],
  ): Promise<UserCertificate> {
    // Check if valid certificate exists
    let certificate = await this.getUserCertificate(vehicleId);

    if (!certificate) {
      console.log("No user certificate found, requesting new one...");
      certificate = await this.requestUserCertificate(vehicleId, permissions);
    }

    return certificate;
  }

  static parseCertificate(certData: string): Certificate {
    try {
      // Simple parsing - in production, use proper ASN.1 parsing
      const parsed = JSON.parse(certData);

      return {
        id: parsed.id,
        subject: parsed.subject,
        issuer: parsed.issuer,
        publicKey: parsed.publicKey,
        signature: parsed.signature,
        notBefore: new Date(parsed.notBefore),
        notAfter: new Date(parsed.notAfter),
        serialNumber: parsed.serialNumber,
        version: parsed.version,
      };
    } catch (error) {
      console.error("Certificate parsing failed:", error);
      throw new Error("Invalid certificate format");
    }
  }

  private static getCertificateSigningData(cert: Certificate): string {
    return JSON.stringify({
      subject: cert.subject,
      publicKey: cert.publicKey,
      notBefore: cert.notBefore.toISOString(),
      notAfter: cert.notAfter.toISOString(),
      serialNumber: cert.serialNumber,
    });
  }

  private static async getAuthToken(): Promise<string> {
    const authState = useAuthStore.getState();
    if (authState?.token) {
      return authState.token;
    }

    const { token } = await StorageService.getTokens();
    if (token) {
      return token;
    }

    throw new Error("Authentication required");
  }

  static async clearAllCertificates(): Promise<void> {
    try {
      const keys = await AsyncStorage.getAllKeys();
      const certKeys = keys.filter(
        (key) =>
          key.includes(this.ROOT_CA_STORAGE_KEY) ||
          key.includes(this.USER_CERT_STORAGE_KEY) ||
          key.includes(this.VEHICLE_CERTS_STORAGE_KEY),
      );

      await AsyncStorage.multiRemove(certKeys);
      console.log("All certificates cleared");
    } catch (error) {
      console.error("Failed to clear certificates:", error);
      throw error;
    }
  }
}
