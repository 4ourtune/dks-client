import axios, { AxiosError } from "axios";
import { PendingPinSession, PinConfirmResponse, PKISessionRefreshResponse } from "@/types";
import { createHttpClient } from "./httpClient";

class PairingApiService {
  private api = createHttpClient();

  private extractError(error: unknown): Error {
    if (axios.isAxiosError(error)) {
      const axiosError = error as AxiosError<{
        error?: string;
        code?: string;
        remainingAttempts?: number;
      }>;
      const message =
        axiosError.response?.data?.error || axiosError.message || "Pairing request failed";
      const custom = new Error(message);
      if (axiosError.response?.data?.code) {
        (custom as any).code = axiosError.response.data.code;
      }
      if (axiosError.response?.data?.remainingAttempts !== undefined) {
        (custom as any).remainingAttempts = axiosError.response.data.remainingAttempts;
      }
      return custom;
    }
    return error instanceof Error ? error : new Error("Pairing request failed");
  }

  async getPendingSession(vehicleId: number): Promise<PendingPinSession | null> {
    try {
      const response = await this.api.get<PendingPinSession | null>("/pairing/pin/status", {
        params: { vehicleId },
      });
      return response.data;
    } catch (error) {
      throw this.extractError(error);
    }
  }

  async confirmPin(vehicleId: number, pin: string): Promise<PinConfirmResponse> {
    try {
      const response = await this.api.post<PinConfirmResponse>("/pairing/pin/confirm", {
        vehicleId,
        pin,
      });
      return response.data;
    } catch (error) {
      throw this.extractError(error);
    }
  }

  async refreshPKISession(params: {
    vehicleId: number;
    pairingToken?: string;
    sessionId?: string;
  }): Promise<PKISessionRefreshResponse> {
    try {
      const response = await this.api.post<PKISessionRefreshResponse>(
        "/pairing/session/refresh",
        params,
      );
      return response.data;
    } catch (error) {
      throw this.extractError(error);
    }
  }
}

export const PairingService = new PairingApiService();
