import { create } from "zustand";
import {
  BLEState,
  BLEDevice,
  CommandPacket,
  ResponsePacket,
  BLECommand,
  PairingStep,
  PairingContext,
  VehicleBLERegistration,
  BLE_CONFIG,
} from "@/types";
import { BLEManager } from "@/services/ble/BLEManager";
import { StorageService } from "@/services/storage/StorageService";
import { useKeyStore } from "./KeyStore";

interface BLEStore extends BLEState {
  initialize: () => Promise<void>;
  loadRegistrations: () => Promise<void>;
  startScan: () => Promise<void>;
  stopScan: () => void;
  connectToDevice: (
    deviceId: string,
    options?: {
      device?: BLEDevice;
      vehicleId?: string;
      autoReconnect?: boolean;
      preservePairingState?: boolean;
    },
  ) => Promise<void>;
  disconnect: () => Promise<void>;
  sendCommand: (command: CommandPacket) => Promise<ResponsePacket>;
  clearError: () => void;
  checkPermissions: () => Promise<{ bluetooth: boolean; location: boolean }>;
  requestPermissions: () => Promise<{ bluetooth: boolean; location: boolean }>;
  startPairing: (vehicleId: string, options?: { expectedDeviceIds?: string[] }) => Promise<void>;
  selectPairingDevice: (deviceId: string) => Promise<void>;
  markPairingRegistering: (sessionId: string) => void;
  markPairingCompleting: () => void;
  markPairingCompleted: (result?: {
    keyId?: string;
    message?: string;
    pairingToken?: string;
    certificate?: string;
  }) => Promise<void>;
  autoPairWithFirstDevice: (
    vehicleId: string,
    options?: { skipScanStart?: boolean; timeoutMs?: number },
  ) => Promise<BLEDevice>;
  failPairing: (error: string) => void;
  cancelPairing: () => Promise<void>;
  resetPairing: () => Promise<void>;
  autoReconnect: (vehicleId: string) => Promise<void>;
}

export const useBLEStore = create<BLEStore>((set, get) => {
  const updatePairing = (
    step: PairingStep,
    contextPatch: Partial<PairingContext> = {},
    resetContext = false,
  ) => {
    set((state) => {
      const shouldReset = resetContext || step === "idle";
      const nextContext = shouldReset
        ? { ...contextPatch }
        : { ...state.pairing.context, ...contextPatch };

      const startedAt = shouldReset ? undefined : (state.pairing.startedAt ?? Date.now());

      return {
        pairing: {
          step,
          context: nextContext,
          startedAt,
        },
      };
    });
  };

  const failPairingInternal = (error: string) => {
    updatePairing("error", { error });
  };

  const loadRegistrations = async () => {
    try {
      const registrations = await StorageService.getVehicleRegistrations();
      set({ registrations });
    } catch (error) {
      console.warn("Failed to load BLE registrations:", error);
    }
  };

  return {
    connection: {
      isScanning: false,
      isConnecting: false,
      isConnected: false,
      connectedDevice: null,
      discoveredDevices: [],
      connectionQuality: "unknown",
      lastConnectAttempt: undefined,
      autoReconnectSuspended: false,
      error: null,
    },
    commands: [],
    registrations: {},
    isInitialized: false,
    permissions: {
      bluetooth: false,
      location: false,
    },
    pairing: {
      step: "idle",
      context: {},
      startedAt: undefined,
    },

    initialize: async () => {
      try {
        await BLEManager.initialize();

        set({
          isInitialized: true,
          connection: {
            ...get().connection,
            error: null,
          },
        });

        await get().checkPermissions();
        await loadRegistrations();
      } catch (error: any) {
        set({
          connection: {
            ...get().connection,
            error: error.message || "Failed to initialize BLE",
          },
        });
        throw error;
      }
    },
    loadRegistrations,

    startScan: async () => {
      try {
        if (!get().isInitialized) {
          await get().initialize();
        }

        let permissions = await get().checkPermissions();
        if (!permissions.bluetooth || !permissions.location) {
          permissions = await get().requestPermissions();

          if (!permissions.bluetooth || !permissions.location) {
            throw new Error("Bluetooth and location permissions are required to scan for devices");
          }
        }

        set({
          connection: {
            ...get().connection,
            isScanning: true,
            discoveredDevices: [],
            error: null,
          },
        });

        const pairingExpectedIds = get().pairing.context.expectedDeviceIds ?? [];
        const registrationDeviceIds = Object.values(get().registrations)
          .map((registration) => registration?.device?.id)
          .filter((id): id is string => Boolean(id));

        const allowedDeviceIds = Array.from(
          new Set([...pairingExpectedIds, ...registrationDeviceIds]),
        );

        const devices = await BLEManager.startScan({
          allowedDeviceIds: allowedDeviceIds.length > 0 ? allowedDeviceIds : undefined,
        });

        set({
          connection: {
            ...get().connection,
            discoveredDevices: devices,
            isScanning: false,
          },
        });
      } catch (error: any) {
        set({
          connection: {
            ...get().connection,
            isScanning: false,
            error: error.message || "Failed to scan for devices",
          },
        });
        throw error;
      }
    },

    stopScan: () => {
      BLEManager.stopScan();

      set({
        connection: {
          ...get().connection,
          isScanning: false,
        },
      });
    },

    connectToDevice: async (
      deviceId: string,
      options?: {
        device?: BLEDevice;
        vehicleId?: string;
        autoReconnect?: boolean;
        preservePairingState?: boolean;
      },
    ) => {
      try {
        get().stopScan();

        const device =
          options?.device ?? get().connection.discoveredDevices.find((d) => d.id === deviceId);
        if (!device) {
          throw new Error("Device not found");
        }

        const now = Date.now();

        set({
          connection: {
            ...get().connection,
            error: null,
            isConnecting: true,
            lastConnectAttempt: now,
            autoReconnectSuspended: options?.autoReconnect
              ? get().connection.autoReconnectSuspended
              : false,
          },
        });

        const vehicleIdForConnection =
          options?.vehicleId ?? get().pairing.context.vehicleId ?? undefined;

        await BLEManager.connectToDevice(deviceId, vehicleIdForConnection);

        set({
          connection: {
            ...get().connection,
            isConnecting: false,
            isConnected: true,
            connectedDevice: device,
            connectionQuality: "good",
            lastConnected: new Date().toISOString(),
            autoReconnectSuspended: false,
            error: null,
          },
        });

        if (!options?.preservePairingState) {
          updatePairing("idle", {}, true);
        }

        const vehicleId = options?.vehicleId ?? get().pairing.context.vehicleId;
        if (vehicleId) {
          try {
            await useKeyStore.getState().fetchKeys(String(vehicleId));
          } catch (error) {
            console.warn("Failed to refresh keys after connection:", error);
          }

          const timestamp = Date.now();
          try {
            await StorageService.setVehicleRegistration(vehicleId, {
              device,
              updatedAt: timestamp,
            });
            set((state) => {
              const current = state.registrations[vehicleId];
              const next: VehicleBLERegistration = {
                vehicleId,
                device,
                pairingToken: current?.pairingToken,
                certificate: current?.certificate,
                session: current?.session,
                updatedAt: timestamp,
              };
              return {
                registrations: {
                  ...state.registrations,
                  [vehicleId]: next,
                },
              };
            });
          } catch (error) {
            console.warn("Failed to store BLE registration:", error);
          }
        }
      } catch (error: any) {
        set({
          connection: {
            ...get().connection,
            isConnecting: false,
            isConnected: false,
            connectedDevice: null,
            autoReconnectSuspended: options?.autoReconnect
              ? true
              : get().connection.autoReconnectSuspended,
            error: error.message || "Failed to connect to device",
          },
        });
        throw error;
      }
    },
    disconnect: async () => {
      try {
        await BLEManager.disconnect();

        set({
          connection: {
            ...get().connection,
            isConnecting: false,
            isConnected: false,
            connectedDevice: null,
            connectionQuality: "unknown",
            error: null,
          },
        });
      } catch (error: any) {
        set({
          connection: {
            ...get().connection,
            isConnecting: false,
            error: error.message || "Failed to disconnect",
          },
        });
      }
    },

    sendCommand: async (command: CommandPacket) => {
      try {
        if (!get().connection.isConnected) {
          throw new Error("Device not connected");
        }

        const commandId = Date.now().toString();
        const bleCommand: BLECommand = {
          id: commandId,
          command,
          status: "pending",
          timestamp: Date.now(),
        };

        set({
          commands: [...get().commands, bleCommand],
        });

        const response = await BLEManager.sendCommand(command);

        set({
          commands: get().commands.map((cmd) =>
            cmd.id === commandId ? { ...cmd, status: "success", response } : cmd,
          ),
        });

        return response;
      } catch (error: any) {
        const commandId = get().commands[get().commands.length - 1]?.id;

        if (commandId) {
          set({
            commands: get().commands.map((cmd) =>
              cmd.id === commandId ? { ...cmd, status: "failed" } : cmd,
            ),
          });
        }

        set({
          connection: {
            ...get().connection,
            error: error.message || "Failed to send command",
          },
        });

        throw error;
      }
    },

    clearError: () => {
      set({
        connection: {
          ...get().connection,
          error: null,
        },
      });

      if (get().pairing.step === "error") {
        updatePairing("idle", {}, true);
      }
    },

    checkPermissions: async () => {
      try {
        const permissions = await BLEManager.checkPermissions();

        set({
          permissions,
        });

        return permissions;
      } catch (error) {
        console.error("Failed to check permissions:", error);
        return get().permissions;
      }
    },

    requestPermissions: async () => {
      try {
        const permissions = await BLEManager.requestPermissions();

        set({
          permissions,
        });

        return permissions;
      } catch (error: any) {
        set({
          connection: {
            ...get().connection,
            error: error.message || "Failed to request permissions",
          },
        });
        throw error;
      }
    },

    startPairing: async (vehicleId: string, options?: { expectedDeviceIds?: string[] }) => {
      try {
        const expectedSet = new Set<string>(
          (options?.expectedDeviceIds ?? []).filter((id): id is string => Boolean(id)),
        );

        const registration = get().registrations[vehicleId];
        if (registration?.device?.id) {
          expectedSet.add(registration.device.id);
        }

        const expectedDeviceIds = Array.from(expectedSet);

        updatePairing(
          "scanning",
          {
            vehicleId,
            expectedDeviceIds,
            error: undefined,
            challenge: undefined,
            sessionId: undefined,
            result: undefined,
          },
          true,
        );
        await get().startScan();
      } catch (error: any) {
        failPairingInternal(error.message || "Failed to start pairing");
      }
    },

    selectPairingDevice: async (deviceId: string) => {
      const device = get().connection.discoveredDevices.find((d) => d.id === deviceId);
      if (!device) {
        failPairingInternal("Selected device is no longer available. Please rescan.");
        return;
      }

      updatePairing("deviceSelected", { device, error: undefined });

      try {
        updatePairing("connecting", { device, error: undefined });
        const vehicleId = get().pairing.context.vehicleId;
        await get().connectToDevice(deviceId, {
          preservePairingState: true,
          vehicleId,
        });
        const challenge = await BLEManager.readPairingChallenge(deviceId);
        updatePairing("challenge", { device, challenge, error: undefined });
      } catch (error: any) {
        failPairingInternal(error.message || "Failed to prepare pairing challenge");
      }
    },

    markPairingRegistering: (sessionId: string) => {
      updatePairing("registering", { sessionId, error: undefined });
    },

    markPairingCompleting: () => {
      updatePairing("completing", { error: undefined });
    },

    markPairingCompleted: async (result) => {
      const context = get().pairing.context;
      updatePairing("completed", { result, error: undefined });

      const vehicleId = context.vehicleId;
      const device = get().connection.connectedDevice ?? context.device;
      const pairingToken = result?.pairingToken ?? context.pairingToken;
      const certificate = result?.certificate ?? context.certificate;
      const sessionInfo = BLEManager.getPKISessionInfo();
      const session = sessionInfo.sessionId
        ? {
            sessionId: sessionInfo.sessionId,
            expiresAt: sessionInfo.expiresAt ? sessionInfo.expiresAt.getTime() : undefined,
          }
        : undefined;

      if (vehicleId && device) {
        const timestamp = Date.now();
        try {
          await StorageService.setVehicleRegistration(vehicleId, {
            device,
            pairingToken,
            certificate,
            session,
            updatedAt: timestamp,
          });
          set((state) => {
            const current = state.registrations[vehicleId];
            const next: VehicleBLERegistration = {
              vehicleId,
              device,
              pairingToken: pairingToken ?? current?.pairingToken,
              certificate: certificate ?? current?.certificate,
              session: session ?? current?.session,
              updatedAt: timestamp,
            };
            return {
              registrations: {
                ...state.registrations,
                [vehicleId]: next,
              },
            };
          });
        } catch (error) {
          console.warn("Failed to persist pairing completion:", error);
        }
      }
    },

    autoPairWithFirstDevice: async (
      vehicleId: string,
      options?: { skipScanStart?: boolean; timeoutMs?: number },
    ) => {
      const { skipScanStart = false, timeoutMs = BLE_CONFIG.PAIRING_TIMEOUTS.scan ?? 10000 } =
        options ?? {};

      try {
        if (!skipScanStart) {
          await get().startPairing(vehicleId);
        }

        const startTime = Date.now();
        let discovered = get().connection.discoveredDevices;

        while (!discovered.length && Date.now() - startTime < timeoutMs) {
          await new Promise((resolve) => setTimeout(resolve, 400));
          discovered = get().connection.discoveredDevices;
        }

        if (!discovered.length) {
          throw new Error("Unable to find a nearby BLE device. Try again closer to the vehicle.");
        }

        const bestDevice = [...discovered].sort((a, b) => {
          const rssiA = typeof a.rssi === "number" ? a.rssi : -999;
          const rssiB = typeof b.rssi === "number" ? b.rssi : -999;
          return rssiB - rssiA;
        })[0];

        await get().selectPairingDevice(bestDevice.id);
        return bestDevice;
      } catch (error: any) {
        failPairingInternal(error.message || "Failed to complete BLE pairing");
        throw error;
      }
    },

    failPairing: (error: string) => {
      failPairingInternal(error);
    },

    cancelPairing: async () => {
      get().stopScan();

      if (get().connection.isConnected) {
        await get().disconnect();
      }

      updatePairing("idle", {}, true);
    },

    resetPairing: async () => {
      if (get().connection.isConnected) {
        await get().disconnect();
      }

      updatePairing("idle", {}, true);
    },

    autoReconnect: async (vehicleId: string) => {
      try {
        let registration = get().registrations[vehicleId];
        if (!registration) {
          registration = await StorageService.getVehicleRegistration(vehicleId);
          if (registration) {
            const resolved = registration;
            set((state) => ({
              registrations: {
                ...state.registrations,
                [vehicleId]: resolved,
              },
            }));
          }
        }

        const savedDevice =
          registration?.device ?? (await StorageService.getVehicleBLEDevice(vehicleId));
        if (!savedDevice?.id) {
          return;
        }

        if (!get().isInitialized) {
          await get().initialize();
        }

        const connection = get().connection;

        if (connection.autoReconnectSuspended) {
          console.log("Auto reconnect suspended; awaiting manual retry");
          return;
        }

        if (connection.isConnecting || BLEManager.isConnecting()) {
          console.log("Skipping auto reconnect while connection is in progress");
          return;
        }

        const cooldownMs = BLE_CONFIG.AUTO_RECONNECT_COOLDOWN ?? 0;
        if (
          cooldownMs > 0 &&
          connection.lastConnectAttempt &&
          Date.now() - connection.lastConnectAttempt < cooldownMs
        ) {
          console.log("Auto reconnect cooldown active");
          return;
        }

        if (connection.isConnected && connection.connectedDevice?.id === savedDevice.id) {
          return;
        }

        if (connection.isConnected) {
          await get().disconnect();
        }

        if (!BLEManager.isAppActive()) {
          console.log("Skipping auto reconnect while app is not active");
          return;
        }

        await get().connectToDevice(savedDevice.id, {
          device: savedDevice,
          vehicleId,
          autoReconnect: true,
        });
      } catch (error) {
        console.warn("Auto reconnect failed:", error);
        set({
          connection: {
            ...get().connection,
            isConnecting: false,
            autoReconnectSuspended: true,
            error:
              error instanceof Error
                ? error.message || "Auto reconnect failed"
                : "Auto reconnect failed",
          },
        });
      }
    },
  };
});
