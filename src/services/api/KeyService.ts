import {
  DigitalKey,
  KeyCreateRequest,
  KeyPermissions,
  KeyUpdateRequest,
  KeyValidationRequest,
  KeyValidationResponse,
  PairingSessionStartRequest,
  PairingSessionStartResponse,
  PairingCompletionRequest,
  PairingCompletionResult,
} from "@/types";
import { createHttpClient } from "./httpClient";

class KeyServiceClass {
  private api = createHttpClient();

  /**
   * Normalizes permission keys from the API. Server responses use camelCase (`startEngine`),
   * but we still accept possible legacy snake_case keys to handle older payloads gracefully.
   */
  private mapPermissions(raw: any): KeyPermissions {
    const permissions = raw ?? {};
    const startEngineValue =
      permissions.startEngine ?? permissions.start_engine ?? permissions.start;

    return {
      unlock: Boolean(permissions.unlock),
      lock: Boolean(permissions.lock),
      startEngine: Boolean(startEngineValue),
    };
  }

  /**
   * Shapes permission payloads the way the API expects (camelCase `startEngine`).
   */
  private mapPermissionsToApi(permissions: KeyPermissions): Record<string, boolean> {
    return {
      unlock: Boolean(permissions.unlock),
      lock: Boolean(permissions.lock),
      startEngine: Boolean(permissions.startEngine),
    };
  }

  private mapKey(raw: unknown): DigitalKey {
    const record = (raw ?? {}) as Record<string, any>;

    const rawId = record.id ?? record.key_id;
    const rawVehicleId = record.vehicle_id ?? record.vehicleId;
    const rawUserId = record.user_id ?? record.userId;

    if (rawId == null || rawVehicleId == null) {
      throw new Error("Incomplete key payload received");
    }

    return {
      id: String(rawId),
      vehicleId: String(rawVehicleId),
      userId: rawUserId != null ? String(rawUserId) : undefined,
      permissions: this.mapPermissions(record.permissions),
      expiresAt: record.expires_at ?? record.expiresAt ?? null,
      isActive: record.is_active ?? record.isActive ?? false,
      createdAt: record.created_at ?? record.createdAt,
      updatedAt: record.updated_at ?? record.updatedAt,
      vehicleInfo: record.vehicle_info ?? record.vehicleInfo ?? null,
    };
  }

  async getKeys(vehicleId?: string): Promise<DigitalKey[]> {
    try {
      const url = vehicleId ? `/keys?vehicleId=${vehicleId}` : "/keys";
      const response = await this.api.get(url);

      if (response.data?.error) {
        throw new Error(response.data.error);
      }

      const keys: unknown[] = Array.isArray(response.data?.keys) ? response.data.keys : [];
      return keys.map((rawKey) => this.mapKey(rawKey));
    } catch (error: any) {
      if (error.response?.data?.error) {
        throw new Error(error.response.data.error);
      }
      throw new Error("Network error: Please check your connection");
    }
  }

  async getKey(keyId: string): Promise<DigitalKey> {
    try {
      const response = await this.api.get(`/keys/${keyId}`);

      if (response.data?.error) {
        throw new Error(response.data.error);
      }

      if (!response.data?.key) {
        throw new Error("Failed to fetch key");
      }

      return this.mapKey(response.data.key);
    } catch (error: any) {
      if (error.response?.data?.message) {
        throw new Error(error.response.data.message);
      }
      throw new Error("Network error: Please check your connection");
    }
  }

  async createKey(keyData: KeyCreateRequest): Promise<DigitalKey> {
    try {
      const payload = {
        vehicle_id: keyData.vehicleId,
        permissions: this.mapPermissionsToApi(keyData.permissions),
        expires_at: keyData.expiresAt,
      };

      const response = await this.api.post("/keys/register", payload);

      if (response.data?.error) {
        throw new Error(response.data.error);
      }

      if (!response.data?.key) {
        throw new Error("Invalid response from server");
      }

      return this.mapKey(response.data.key);
    } catch (error: any) {
      if (error.response?.data?.error) {
        throw new Error(error.response.data.error);
      }
      throw new Error("Network error: Please check your connection");
    }
  }

  async updateKey(keyId: string, updates: KeyUpdateRequest): Promise<DigitalKey> {
    try {
      const payload: any = {};

      if (updates.permissions) {
        payload.permissions = this.mapPermissionsToApi(updates.permissions);
      }

      if (updates.expiresAt !== undefined) {
        payload.expires_at = updates.expiresAt;
      }

      if (updates.isActive !== undefined) {
        payload.is_active = updates.isActive;
      }

      const response = await this.api.put(`/keys/${keyId}`, payload);

      if (response.data?.error) {
        throw new Error(response.data.error);
      }

      if (!response.data?.key) {
        throw new Error("Failed to update key");
      }

      return this.mapKey(response.data.key);
    } catch (error: any) {
      if (error.response?.data?.message) {
        throw new Error(error.response.data.message);
      }
      throw new Error("Network error: Please check your connection");
    }
  }

  async deleteKey(keyId: string): Promise<void> {
    try {
      const response = await this.api.delete(`/keys/${keyId}`);

      if (response.data?.error) {
        throw new Error(response.data.error);
      }
    } catch (error: any) {
      if (error.response?.data?.message) {
        throw new Error(error.response.data.message);
      }
      throw new Error("Network error: Please check your connection");
    }
  }

  async startPairingSession(
    request: PairingSessionStartRequest,
  ): Promise<PairingSessionStartResponse> {
    try {
      const response = await this.api.post("/pairing-sessions", {
        vehicle_id: request.vehicleId,
        device_id: request.device_id,
        nonce: request.nonce,
        rssi: request.rssi,
      });

      const sessionId = response.data?.sessionId ?? response.data?.session_id;
      if (sessionId) {
        return {
          sessionId: String(sessionId),
          expiresAt: response.data?.expiresAt ?? response.data?.expires_at,
        };
      }

      if (response.data?.error) {
        throw new Error(response.data.error);
      }
    } catch (error: any) {
      console.warn(
        "[KeyService] Pairing session endpoint unavailable, using local stub.",
        error?.message || error,
      );
    }

    return {
      sessionId: `local-${Date.now()}`,
      expiresAt: new Date(Date.now() + 5 * 60 * 1000).toISOString(),
    };
  }

  async completePairingSession(
    request: PairingCompletionRequest,
  ): Promise<PairingCompletionResult> {
    try {
      const response = await this.api.post(
        `/pairing-sessions/${request.sessionId}/complete`,
        request.responsePayload,
      );

      if (response.data?.key) {
        return {
          key: this.mapKey(response.data.key),
          blePayload: response.data?.blePayload ?? response.data?.ble_response ?? undefined,
        };
      }

      if (response.data?.error) {
        throw new Error(response.data.error);
      }
    } catch (error: any) {
      console.warn(
        "[KeyService] Pairing completion endpoint unavailable.",
        error?.message || error,
      );
      throw new Error("Pairing completion is not yet supported by the backend.");
    }

    throw new Error("Invalid response from pairing completion endpoint");
  }

  async validateKey(
    keyId: string,
    validation: KeyValidationRequest,
  ): Promise<KeyValidationResponse> {
    try {
      const response = await this.api.post(`/keys/${keyId}/validate`, {
        action: validation.command,
        timestamp: validation.timestamp,
      });

      if (response.data?.error) {
        throw new Error(response.data.error);
      }

      return {
        isValid: Boolean(response.data?.valid),
        permissions: this.mapPermissions(response.data?.permissions),
        expiresAt: response.data?.expires_at ?? undefined,
      };
    } catch (error: any) {
      if (error.response?.data?.message) {
        throw new Error(error.response.data.message);
      }
      throw new Error("Network error: Please check your connection");
    }
  }
}

export const KeyService = new KeyServiceClass();
