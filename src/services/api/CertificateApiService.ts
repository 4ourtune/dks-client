import { createHttpClient } from "./httpClient";
import {
  Certificate,
  UserCertificate,
  RootCACertificate,
  CertificateRequest,
  CertificateValidationResult,
} from "@/types";
import { API_TIMEOUTS, RETRY_CONFIG } from "@/utils/constants";

class CertificateApiServiceClass {
  private api = createHttpClient();

  private retryCount = 0;

  constructor() {
    this.setupInterceptors();
  }

  private setupInterceptors() {
    this.api.interceptors.request.use(
      (config) => {
        if (config.url?.includes("root-ca") && config.headers) {
          if (typeof (config.headers as any).delete === "function") {
            (config.headers as any).delete("Authorization");
          } else {
            delete (config.headers as Record<string, unknown>).Authorization;
          }
        }
        return config;
      },
      (error) => Promise.reject(error),
    );

    // Response interceptor for retry logic
    this.api.interceptors.response.use(
      (response) => response,
      async (error) => {
        if (this.shouldRetry(error) && this.retryCount < RETRY_CONFIG.MAX_ATTEMPTS) {
          this.retryCount++;
          const delay =
            RETRY_CONFIG.DELAY * Math.pow(RETRY_CONFIG.BACKOFF_FACTOR, this.retryCount - 1);

          console.log(
            `Retrying certificate API request (attempt ${this.retryCount}/${RETRY_CONFIG.MAX_ATTEMPTS})...`,
          );
          await this.delay(delay);

          return this.api.request(error.config);
        }

        this.retryCount = 0;
        return Promise.reject(error);
      },
    );
  }

  private normalizeUserCertificatePayload(
    rawCertificate: any,
    fallbackVehicleId?: number,
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

  async getRootCACertificate(): Promise<RootCACertificate> {
    try {
      console.log("Fetching Root CA certificate...");

      const response = await this.api.get("/certificates/root-ca/public-key", {
        timeout: API_TIMEOUTS.LONG,
      });

      if (!response.data?.certificate) {
        throw new Error("Invalid Root CA response structure");
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
        version: response.data.certificate.version || 1,
        isRootCA: true,
      };

      console.log("Root CA certificate fetched successfully");
      return rootCA;
    } catch (error: any) {
      console.error("Failed to fetch Root CA certificate:", error);

      if (error.code === "ECONNABORTED") {
        throw new Error("Root CA request timed out");
      }

      if (error.response?.status === 404) {
        throw new Error("Root CA certificate not found");
      }

      if (error.response?.data?.error) {
        throw new Error(`Root CA error: ${error.response.data.error}`);
      }

      throw new Error("Root CA certificate download failed");
    }
  }

  async requestUserCertificate(request: CertificateRequest): Promise<UserCertificate> {
    try {
      console.log("Requesting user certificate for vehicle:", request.vehicleId);

      const response = await this.api.post("/certificates/digital-key", request, {
        timeout: API_TIMEOUTS.LONG,
      });

      const certificatePayload = response.data?.certificate ?? response.data?.data?.certificate;

      const certificate = this.normalizeUserCertificatePayload(
        certificatePayload,
        request.vehicleId,
      );

      console.log("User certificate received successfully");
      return certificate;
    } catch (error: any) {
      console.error("Failed to request user certificate:", error);

      if (error.code === "ECONNABORTED") {
        throw new Error("Certificate request timed out");
      }

      if (error.response?.status === 401) {
        throw new Error("Authentication required for certificate request");
      }

      if (error.response?.status === 403) {
        throw new Error("Insufficient permissions for certificate request");
      }

      if (error.response?.status === 400) {
        const errorMsg = error.response.data?.error || "Invalid certificate request";
        throw new Error(errorMsg);
      }

      if (error.response?.data?.error) {
        throw new Error(`Certificate request error: ${error.response.data.error}`);
      }

      throw new Error("Certificate request failed");
    }
  }

  async verifyCertificate(certificate: Certificate): Promise<CertificateValidationResult> {
    try {
      console.log("Verifying certificate:", certificate.id);

      const response = await this.api.post(
        "/certificates/verify",
        { certificate },
        {
          timeout: API_TIMEOUTS.SHORT,
        },
      );

      const result: CertificateValidationResult = {
        isValid: Boolean(response.data.isValid),
        certificate: response.data.certificate,
        error: response.data.error,
        expiresAt: response.data.expiresAt ? new Date(response.data.expiresAt) : undefined,
      };

      console.log("Certificate verification completed:", result.isValid);
      return result;
    } catch (error: any) {
      console.error("Certificate verification failed:", error);

      const result: CertificateValidationResult = {
        isValid: false,
        error: error.response?.data?.error || "Verification request failed",
      };

      return result;
    }
  }

  async revokeCertificate(certificateId: string, reason?: string): Promise<boolean> {
    try {
      console.log("Revoking certificate:", certificateId);

      const response = await this.api.post("/certificates/revoke", {
        certificateId,
        reason: reason || "User requested",
      });

      return Boolean(response.data.success);
    } catch (error: any) {
      console.error("Certificate revocation failed:", error);

      if (error.response?.status === 404) {
        throw new Error("Certificate not found");
      }

      if (error.response?.data?.error) {
        throw new Error(`Revocation error: ${error.response.data.error}`);
      }

      throw new Error("Certificate revocation failed");
    }
  }

  async getUserCertificates(): Promise<UserCertificate[]> {
    try {
      console.log("Fetching user certificates...");

      const response = await this.api.get("/certificates/user");

      const rawCertificates = response.data?.certificates ?? response.data?.data?.certificates;

      if (!Array.isArray(rawCertificates)) {
        throw new Error("Invalid certificates response structure");
      }

      const certificates: UserCertificate[] = rawCertificates.map((cert: any) =>
        this.normalizeUserCertificatePayload(cert),
      );
      console.log("User certificates fetched:", certificates.length);
      return certificates;
    } catch (error: any) {
      console.error("Failed to fetch user certificates:", error);

      if (error.response?.status === 401) {
        throw new Error("Authentication required");
      }

      if (error.response?.data?.error) {
        throw new Error(error.response.data.error);
      }

      throw new Error("Failed to fetch certificates");
    }
  }

  async refreshCertificate(certificateId: string): Promise<UserCertificate> {
    try {
      console.log("Refreshing certificate:", certificateId);

      const response = await this.api.post(
        `/certificates/${certificateId}/refresh`,
        {},
        {
          timeout: API_TIMEOUTS.LONG,
        },
      );

      const certificatePayload = response.data?.certificate ?? response.data?.data?.certificate;

      const certificate = this.normalizeUserCertificatePayload(certificatePayload);
      console.log("Certificate refreshed successfully");
      return certificate;
    } catch (error: any) {
      console.error("Certificate refresh failed:", error);

      if (error.response?.status === 404) {
        throw new Error("Certificate not found");
      }

      if (error.response?.data?.error) {
        throw new Error(`Refresh error: ${error.response.data.error}`);
      }

      throw new Error("Certificate refresh failed");
    }
  }

  // Health check for certificate services
  async checkCertificateService(): Promise<boolean> {
    try {
      const response = await this.api.get("/certificates/health", {
        timeout: API_TIMEOUTS.SHORT,
      });

      return response.data.status === "healthy";
    } catch (error) {
      console.warn("Certificate service health check failed:", error);
      return false;
    }
  }

  private shouldRetry(error: any): boolean {
    // Retry on network errors, timeouts, and 5xx server errors
    return (
      !error.response ||
      error.code === "ECONNABORTED" ||
      error.code === "NETWORK_ERROR" ||
      (error.response.status >= 500 && error.response.status < 600)
    );
  }

  private delay(ms: number): Promise<void> {
    return new Promise((resolve) => setTimeout(resolve, ms));
  }

  // Clear internal state
  reset(): void {
    this.retryCount = 0;
  }
}

export const CertificateApiService = new CertificateApiServiceClass();
