import { create } from "zustand";
import { PairingService } from "@/services/api";
import { KeyService } from "@/services/api/KeyService";
import { VehicleService } from "@/services/api/VehicleService";
import { CertificateService } from "@/services/crypto/CertificateService";
import { StorageService } from "@/services/storage/StorageService";
import type { PendingPinSession, PinConfirmResponse, KeyPermissions } from "@/types";
import { useBLEStore } from "./BLEStore";
import { useKeyStore } from "./KeyStore";
import { useVehicleStore } from "./VehicleStore";

export type PairingStatus = "idle" | "checking" | "confirming" | "success" | "error";

interface PairingStoreState {
  status: PairingStatus;
  pendingSession: PendingPinSession | null;
  pairingResult: PinConfirmResponse | null;
  attemptsRemaining: number | null;
  error?: string;
  checkPendingSession: (vehicleId: number) => Promise<PendingPinSession | null>;
  confirmPin: (vehicleId: number, pin: string) => Promise<PinConfirmResponse>;
  reset: () => void;
}

export const usePairingStore = create<PairingStoreState>((set, get) => ({
  status: "idle",
  pendingSession: null,
  pairingResult: null,
  attemptsRemaining: null,
  error: undefined,

  checkPendingSession: async (vehicleId: number) => {
    set({ status: "checking", error: undefined });
    try {
      const session = await PairingService.getPendingSession(vehicleId);

      if (!session) {
        set({
          pendingSession: null,
          status: "idle",
          attemptsRemaining: null,
          error: undefined,
        });
        throw new Error("No pending pairing session for this vehicle");
      }

      set({
        pendingSession: session,
        status: "idle",
        attemptsRemaining: session.attemptsRemaining,
        error: undefined,
      });

      try {
        await useBLEStore.getState().startPairing(String(vehicleId));
      } catch (bleError) {
        console.warn("BLE pairing scan failed:", bleError);
      }

      return session;
    } catch (error) {
      const message = error instanceof Error ? error.message : "Unable to check pairing status";
      set({ status: "error", error: message });
      throw error;
    }
  },

  confirmPin: async (vehicleId: number, pin: string) => {
    const bleStore = useBLEStore.getState();
    const keyState = useKeyStore.getState();
    const vehicleState = useVehicleStore.getState();
    const vehicleIdString = String(vehicleId);

    const ensureBleInitialized = async () => {
      if (bleStore.isInitialized) {
        return;
      }
      try {
        await bleStore.initialize();
      } catch (initError) {
        const message =
          initError instanceof Error ? initError.message : "Failed to initialize BLE manager";
        set({
          status: "error",
          error: message,
          attemptsRemaining: null,
        });
        throw initError;
      }
    };

    const resolvePermissions = async (finalizeKeyId?: string | null): Promise<KeyPermissions> => {
      const defaultPermissions: KeyPermissions = {
        unlock: true,
        lock: true,
        startEngine: false,
      };

      let permissions =
        useKeyStore.getState().keys.find((key) => key.vehicleId === vehicleIdString)?.permissions ??
        null;

      if (!permissions) {
        try {
          await keyState.fetchKeys(vehicleIdString);
          permissions =
            useKeyStore.getState().keys.find((key) => key.vehicleId === vehicleIdString)
              ?.permissions ?? null;
        } catch (fetchError) {
          console.warn("Failed to refresh keys before provisioning certificate:", fetchError);
        }
      }

      if (!permissions && finalizeKeyId) {
        try {
          const key = await KeyService.getKey(finalizeKeyId);
          permissions = key.permissions;
          keyState
            .fetchKeys(vehicleIdString)
            .catch((syncError) =>
              console.warn("Failed to sync keys after fetching key:", syncError),
            );
        } catch (keyError) {
          console.warn("Failed to load key permissions for certificate request:", keyError);
        }
      }

      return permissions ?? defaultPermissions;
    };

    const persistPairingContext = async (result: PinConfirmResponse) => {
      const session = get().pendingSession;
      if (session?.sessionId) {
        bleStore.markPairingRegistering(session.sessionId);
      }

      useBLEStore.setState((state) => ({
        pairing: {
          ...state.pairing,
          context: {
            ...state.pairing.context,
            pairingToken: result.pairingToken,
            result: {
              ...state.pairing.context.result,
              pairingToken: result.pairingToken ?? undefined,
            },
          },
        },
      }));

      const contextDevice =
        useBLEStore.getState().pairing.context.device ?? bleStore.connection.connectedDevice;
      if (!contextDevice) {
        return;
      }

      try {
        await StorageService.setVehicleRegistration(vehicleIdString, {
          device: contextDevice,
          pairingToken: result.pairingToken ?? undefined,
          updatedAt: Date.now(),
        });
      } catch (storageError) {
        console.warn("Failed to persist pairing metadata:", storageError);
      }
    };

    const executeBlePairing = async () => {
      try {
        bleStore.markPairingCompleting();
        await bleStore.autoPairWithFirstDevice(vehicleIdString);
      } catch (pairingError) {
        const pairingMessage =
          pairingError instanceof Error ? pairingError.message : "BLE pairing failed";
        set({
          status: "error",
          error: pairingMessage,
          attemptsRemaining: null,
        });
        throw pairingError;
      }
    };

    const finalizeServerRegistration = async (pairingToken: string) => {
      try {
        const finalizeResult = await VehicleService.registerUserVehicle(vehicleIdString, {
          pairingToken,
        });
        await vehicleState.fetchVehicles().catch((fetchError) => {
          console.warn("Vehicle list refresh after pairing finalize failed:", fetchError);
        });
        return finalizeResult;
      } catch (finalizeError) {
        const message =
          finalizeError instanceof Error && finalizeError.message
            ? finalizeError.message
            : "Failed to finalize vehicle registration with server";
        set({
          status: "error",
          error: message,
          attemptsRemaining: null,
        });
        throw finalizeError;
      }
    };

    const applyFinalizeResult = async (pairingToken: string, finalizeKeyId?: string | null) => {
      try {
        await bleStore.markPairingCompleted({
          pairingToken,
          keyId: finalizeKeyId ?? undefined,
          message: "Vehicle pairing completed.",
        });
      } catch (error) {
        console.warn("Failed to mark pairing completed:", error);
      }

      if (finalizeKeyId) {
        useBLEStore.setState((state) => ({
          pairing: {
            ...state.pairing,
            context: {
              ...state.pairing.context,
              result: {
                ...state.pairing.context.result,
                keyId: finalizeKeyId,
              },
            },
          },
        }));
      }
    };

    set({ status: "confirming", error: undefined, attemptsRemaining: null });

    try {
      await ensureBleInitialized();

      const result = await PairingService.confirmPin(vehicleId, pin);
      await persistPairingContext(result);
      await executeBlePairing();
      const finalizeResult = await finalizeServerRegistration(result.pairingToken);
      const finalizeKeyId = finalizeResult?.keyId ?? null;
      await applyFinalizeResult(result.pairingToken, finalizeKeyId);

      try {
        const permissions = await resolvePermissions(finalizeKeyId);
        await CertificateService.ensureUserCertificate(result.vehicleId, permissions);
      } catch (certificateError: any) {
        const message =
          certificateError instanceof Error && certificateError.message
            ? certificateError.message
            : "Failed to provision user certificate";
        console.error("Failed to provision user certificate during pairing:", certificateError);
        throw new Error(message);
      }

      set({
        pairingResult: result,
        status: "success",
        pendingSession: null,
        attemptsRemaining: null,
        error: undefined,
      });

      return result;
    } catch (error) {
      const message = error instanceof Error ? error.message : "Unable to confirm pairing PIN";
      const remaining =
        error instanceof Error && (error as any).remainingAttempts !== undefined
          ? (error as any).remainingAttempts
          : null;
      set({
        status: "error",
        error: message,
        attemptsRemaining: remaining,
      });
      throw error;
    }
  },

  reset: () => {
    set({
      status: "idle",
      pendingSession: null,
      pairingResult: null,
      attemptsRemaining: null,
      error: undefined,
    });
  },
}));
