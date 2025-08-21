import { create } from 'zustand';
import { VehicleState, Vehicle, VehicleCreateRequest, VehicleUpdateRequest, VehicleControlRequest, VehicleStatus } from '@/types';
import { VehicleService } from '@/services/api/VehicleService';
import { StorageService } from '@/services/storage/StorageService';

interface VehicleStore extends VehicleState {
  fetchVehicles: () => Promise<void>;
  createVehicle: (vehicleData: VehicleCreateRequest) => Promise<Vehicle>;
  updateVehicle: (vehicleId: string, updates: VehicleUpdateRequest) => Promise<void>;
  deleteVehicle: (vehicleId: string) => Promise<void>;
  selectVehicle: (vehicle: Vehicle | null) => void;
  controlVehicle: (vehicleId: string, command: VehicleControlRequest) => Promise<void>;
  fetchVehicleStatus: (vehicleId: string) => Promise<void>;
  fetchVehicleLogs: (vehicleId: string) => Promise<any[]>;
  clearError: () => void;
  loadSelectedVehicle: () => Promise<void>;
}

export const useVehicleStore = create<VehicleStore>((set, get) => ({
  vehicles: [],
  selectedVehicle: null,
  vehicleStatuses: {},
  isLoading: false,
  error: null,

  fetchVehicles: async () => {
    try {
      set({ isLoading: true, error: null });
      
      const vehicles = await VehicleService.getVehicles();
      
      set({
        vehicles,
        isLoading: false,
      });
    } catch (error: any) {
      set({
        error: error.message || 'Failed to fetch vehicles',
        isLoading: false,
      });
      throw error;
    }
  },

  createVehicle: async (vehicleData: VehicleCreateRequest) => {
    try {
      set({ isLoading: true, error: null });
      
      const newVehicle = await VehicleService.createVehicle(vehicleData);
      
      set(state => ({
        vehicles: [...state.vehicles, newVehicle],
        isLoading: false,
      }));
      
      return newVehicle;
    } catch (error: any) {
      set({
        error: error.message || 'Failed to create vehicle',
        isLoading: false,
      });
      throw error;
    }
  },

  updateVehicle: async (vehicleId: string, updates: VehicleUpdateRequest) => {
    try {
      set({ isLoading: true, error: null });
      
      const updatedVehicle = await VehicleService.updateVehicle(vehicleId, updates);
      
      set(state => ({
        vehicles: state.vehicles.map(v => 
          v.id === vehicleId ? updatedVehicle : v
        ),
        selectedVehicle: state.selectedVehicle?.id === vehicleId 
          ? updatedVehicle 
          : state.selectedVehicle,
        isLoading: false,
      }));
    } catch (error: any) {
      set({
        error: error.message || 'Failed to update vehicle',
        isLoading: false,
      });
      throw error;
    }
  },

  deleteVehicle: async (vehicleId: string) => {
    try {
      set({ isLoading: true, error: null });
      
      await VehicleService.deleteVehicle(vehicleId);
      
      set(state => ({
        vehicles: state.vehicles.filter(v => v.id !== vehicleId),
        selectedVehicle: state.selectedVehicle?.id === vehicleId 
          ? null 
          : state.selectedVehicle,
        vehicleStatuses: Object.fromEntries(
          Object.entries(state.vehicleStatuses).filter(([id]) => id !== vehicleId)
        ),
        isLoading: false,
      }));
      
      if (get().selectedVehicle?.id === vehicleId) {
        await StorageService.removeSelectedVehicle();
      }
    } catch (error: any) {
      set({
        error: error.message || 'Failed to delete vehicle',
        isLoading: false,
      });
      throw error;
    }
  },

  selectVehicle: async (vehicle: Vehicle | null) => {
    set({ selectedVehicle: vehicle });
    
    if (vehicle) {
      await StorageService.setSelectedVehicle(vehicle.id);
      get().fetchVehicleStatus(vehicle.id);
    } else {
      await StorageService.removeSelectedVehicle();
    }
  },

  controlVehicle: async (vehicleId: string, command: VehicleControlRequest) => {
    try {
      set({ error: null });
      
      const response = await VehicleService.controlVehicle(vehicleId, command);
      
      if (response.success) {
        get().fetchVehicleStatus(vehicleId);
      }
      
      return response;
    } catch (error: any) {
      set({
        error: error.message || 'Failed to control vehicle',
      });
      throw error;
    }
  },

  fetchVehicleStatus: async (vehicleId: string) => {
    try {
      const status = await VehicleService.getVehicleStatus(vehicleId);
      
      set(state => ({
        vehicleStatuses: {
          ...state.vehicleStatuses,
          [vehicleId]: status,
        },
      }));
    } catch (error: any) {
      console.error('Failed to fetch vehicle status:', error);
    }
  },

  fetchVehicleLogs: async (vehicleId: string) => {
    try {
      return await VehicleService.getVehicleLogs(vehicleId);
    } catch (error: any) {
      set({
        error: error.message || 'Failed to fetch vehicle logs',
      });
      throw error;
    }
  },

  clearError: () => {
    set({ error: null });
  },

  loadSelectedVehicle: async () => {
    try {
      const selectedVehicleId = await StorageService.getSelectedVehicle();
      
      if (selectedVehicleId) {
        const vehicles = get().vehicles;
        const selectedVehicle = vehicles.find(v => v.id === selectedVehicleId);
        
        if (selectedVehicle) {
          set({ selectedVehicle });
          get().fetchVehicleStatus(selectedVehicleId);
        } else {
          await StorageService.removeSelectedVehicle();
        }
      }
    } catch (error: any) {
      console.error('Failed to load selected vehicle:', error);
    }
  },
}));