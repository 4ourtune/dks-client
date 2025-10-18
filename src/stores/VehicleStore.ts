import { create } from "zustand";
import {
  VehicleState,
  Vehicle,
  VehicleCreateRequest,
  VehicleUpdateRequest,
  VehicleControlRequest,
  VehicleControlResponse,
  VehicleStatus,
  VehicleLog,
} from "@/types";
import { VehicleService } from "@/services/api/VehicleService";
import { useBLEStore } from "./BLEStore";
import { StorageService } from "@/services/storage/StorageService";

const buildDefaultStatus = (overrides: Partial<VehicleStatus> = {}): VehicleStatus => ({
  doorsLocked: false,
  engineRunning: false,
  connected: false,
  lastUpdated: new Date().toISOString(),
  ...overrides,
});

const computeNextStatus = (
  previous: VehicleStatus,
  command: VehicleControlRequest["command"],
  statusUpdate?: Partial<VehicleStatus>,
  timestamp?: string,
): VehicleStatus => {
  const base = buildDefaultStatus({
    ...previous,
    connected: true,
    lastUpdated: timestamp ?? new Date().toISOString(),
  });

  if (statusUpdate) {
    return buildDefaultStatus({
      doorsLocked: statusUpdate.doorsLocked ?? previous.doorsLocked ?? base.doorsLocked,
      engineRunning: statusUpdate.engineRunning ?? previous.engineRunning ?? base.engineRunning,
      connected: statusUpdate.connected ?? true,
      lastUpdated: statusUpdate.lastUpdated ?? base.lastUpdated,
    });
  }

  switch (command) {
    case "UNLOCK":
      return buildDefaultStatus({
        ...base,
        doorsLocked: false,
      });
    case "LOCK":
      return buildDefaultStatus({
        ...base,
        doorsLocked: true,
      });
    case "START":
      return buildDefaultStatus({
        ...base,
        engineRunning: true,
      });
    default:
      return base;
  }
};
interface VehicleStore extends VehicleState {
  fetchVehicles: () => Promise<Vehicle[]>;
  createVehicle: (vehicleData: VehicleCreateRequest) => Promise<Vehicle>;
  updateVehicle: (vehicleId: string, updates: VehicleUpdateRequest) => Promise<void>;
  deleteVehicle: (vehicleId: string) => Promise<void>;
  selectVehicle: (vehicle: Vehicle | null) => Promise<void>;
  controlVehicle: (
    vehicleId: string,
    command: VehicleControlRequest,
  ) => Promise<VehicleControlResponse>;
  applyStatusFromBle: (
    vehicleId: string,
    command: VehicleControlRequest["command"],
    status?: Partial<VehicleStatus>,
    timestamp?: number | string,
  ) => Promise<void>;
  fetchVehicleStatus: (vehicleId: string) => Promise<void>;
  fetchVehicleLogs: (vehicleId: string) => Promise<VehicleLog[]>;
  clearError: () => void;
  loadSelectedVehicle: () => Promise<Vehicle | null>;
}

export const useVehicleStore = create<VehicleStore>((set, get) => ({
  vehicles: [],
  selectedVehicle: null,
  vehicleStatuses: {},
  isLoading: false,
  error: null,

  fetchVehicles: async () => {
    set({ isLoading: true, error: null });

    try {
      const vehicles = await VehicleService.getVehicles();
      const previousState = get();
      const currentSelectedId = previousState.selectedVehicle?.id ?? null;
      const selectedStillExists = currentSelectedId
        ? vehicles.some((vehicle) => vehicle.id === currentSelectedId)
        : false;

      const updatedStatuses: Record<string, VehicleStatus> = {};
      for (const vehicle of vehicles) {
        const key = String(vehicle.id);
        if (previousState.vehicleStatuses[key]) {
          updatedStatuses[key] = previousState.vehicleStatuses[key];
        }
      }

      set({
        vehicles,
        selectedVehicle: selectedStillExists ? previousState.selectedVehicle : null,
        vehicleStatuses: updatedStatuses,
        isLoading: false,
      });

      if (!selectedStillExists && currentSelectedId) {
        await StorageService.removeSelectedVehicle();
      }

      if (vehicles.length === 0) {
        set({ selectedVehicle: null });
      } else if (!selectedStillExists) {
        await get().selectVehicle(vehicles[0]);
      }

      return vehicles;
    } catch (error: any) {
      set({
        error: error.message || "Failed to fetch vehicles",
        isLoading: false,
      });
      throw error;
    }
  },

  createVehicle: async (vehicleData: VehicleCreateRequest) => {
    try {
      set({ isLoading: true, error: null });

      const newVehicle = await VehicleService.createVehicle(vehicleData);

      set((state) => ({
        vehicles: [...state.vehicles, newVehicle],
        isLoading: false,
      }));

      return newVehicle;
    } catch (error: any) {
      set({
        error: error.message || "Failed to create vehicle",
        isLoading: false,
      });
      throw error;
    }
  },

  updateVehicle: async (vehicleId: string, updates: VehicleUpdateRequest) => {
    try {
      set({ isLoading: true, error: null });

      const updatedVehicle = await VehicleService.updateVehicle(vehicleId, updates);

      set((state) => ({
        vehicles: state.vehicles.map((vehicle) =>
          vehicle.id === updatedVehicle.id ? updatedVehicle : vehicle,
        ),
        selectedVehicle:
          state.selectedVehicle?.id === updatedVehicle.id ? updatedVehicle : state.selectedVehicle,
        isLoading: false,
      }));
    } catch (error: any) {
      set({
        error: error.message || "Failed to update vehicle",
        isLoading: false,
      });
      throw error;
    }
  },

  selectVehicle: async (vehicle: Vehicle | null) => {
    set({ selectedVehicle: vehicle });

    if (vehicle) {
      const vehicleId = String(vehicle.id);
      await StorageService.setSelectedVehicle(vehicleId);
      set((state) => ({
        vehicleStatuses: state.vehicleStatuses[vehicleId]
          ? state.vehicleStatuses
          : {
              ...state.vehicleStatuses,
              [vehicleId]: buildDefaultStatus(),
            },
      }));
      const bleStore = useBLEStore.getState();
      const [statusResult, reconnectResult] = await Promise.allSettled([
        get().fetchVehicleStatus(vehicleId),
        bleStore.autoReconnect(vehicleId),
      ]);

      if (statusResult.status === "rejected") {
        console.warn("Vehicle status refresh after selection failed:", statusResult.reason);
      }

      if (reconnectResult.status === "rejected") {
        console.warn("BLE auto-reconnect after vehicle selection failed:", reconnectResult.reason);
      }
    } else {
      await StorageService.removeSelectedVehicle();
    }
  },

  deleteVehicle: async (vehicleId: string) => {
    try {
      set({ isLoading: true, error: null });

      await VehicleService.deleteVehicle(vehicleId);

      set((state) => {
        const remainingVehicles = state.vehicles.filter(
          (vehicle) => String(vehicle.id) !== vehicleId,
        );
        const selectedRemoved =
          state.selectedVehicle?.id && String(state.selectedVehicle.id) === vehicleId;
        const updatedStatuses = Object.fromEntries(
          Object.entries(state.vehicleStatuses).filter(([key]) => key !== vehicleId),
        );

        return {
          vehicles: remainingVehicles,
          selectedVehicle: selectedRemoved ? null : state.selectedVehicle,
          vehicleStatuses: updatedStatuses,
          isLoading: false,
        };
      });

      const currentSelected = get().selectedVehicle;
      if (!currentSelected) {
        await StorageService.removeSelectedVehicle();
      }
    } catch (error: any) {
      set({
        error: error.message || "Failed to delete vehicle",
        isLoading: false,
      });
      throw error;
    }
  },

  controlVehicle: async (vehicleId: string, command: VehicleControlRequest) => {
    try {
      const response = await VehicleService.controlVehicle(vehicleId, command);

      if (response.success) {
        const key = String(vehicleId);
        const previous = get().vehicleStatuses[key] ?? buildDefaultStatus();
        const nextStatus = computeNextStatus(
          previous,
          command.command,
          response.status,
          response.timestamp,
        );

        set((state) => ({
          vehicleStatuses: {
            ...state.vehicleStatuses,
            [key]: nextStatus,
          },
        }));
      }

      return response;
    } catch (error: any) {
      set({
        error: error.message || "Failed to control vehicle",
      });
      throw error;
    }
  },

  applyStatusFromBle: async (
    vehicleId: string,
    command: VehicleControlRequest["command"],
    status?: Partial<VehicleStatus>,
    timestamp?: number | string,
  ) => {
    const timestampIso =
      typeof timestamp === "number"
        ? new Date(timestamp).toISOString()
        : (timestamp ?? new Date().toISOString());

    const key = String(vehicleId);
    const previous = get().vehicleStatuses[key] ?? buildDefaultStatus();
    const nextStatus = computeNextStatus(previous, command, status, timestampIso);

    set((state) => ({
      vehicleStatuses: {
        ...state.vehicleStatuses,
        [key]: nextStatus,
      },
    }));
  },

  fetchVehicleStatus: async (vehicleId: string) => {
    const existing = get().vehicleStatuses[vehicleId];
    if (existing) {
      set((state) => ({
        vehicleStatuses: {
          ...state.vehicleStatuses,
          [vehicleId]: buildDefaultStatus(existing),
        },
      }));
      return;
    }

    set((state) => ({
      vehicleStatuses: {
        ...state.vehicleStatuses,
        [vehicleId]: buildDefaultStatus(),
      },
    }));
  },

  fetchVehicleLogs: async (vehicleId: string) => {
    try {
      return await VehicleService.getVehicleLogs(vehicleId);
    } catch (error: any) {
      set({
        error: error.message || "Failed to fetch vehicle logs",
      });
      throw error;
    }
  },

  clearError: () => {
    set({ error: null });
  },

  loadSelectedVehicle: async () => {
    try {
      const storedVehicleId = await StorageService.getSelectedVehicle();
      const vehicles = get().vehicles;

      if (!storedVehicleId) {
        if (vehicles.length > 0) {
          const defaultVehicle = vehicles[0];
          await get().selectVehicle(defaultVehicle);
          return defaultVehicle;
        }

        set({ selectedVehicle: null });
        return null;
      }

      const selectedVehicle =
        vehicles.find((vehicle) => String(vehicle.id) === storedVehicleId) || null;

      if (!selectedVehicle) {
        await StorageService.removeSelectedVehicle();

        if (vehicles.length > 0) {
          const fallbackVehicle = vehicles[0];
          await get().selectVehicle(fallbackVehicle);
          return fallbackVehicle;
        }

        set({ selectedVehicle: null });
        return null;
      }

      await get().selectVehicle(selectedVehicle);
      return selectedVehicle;
    } catch (error) {
      console.error("Failed to load selected vehicle:", error);
      set({ selectedVehicle: null });
      return null;
    }
  },
}));
