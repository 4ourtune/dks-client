import axios, { AxiosResponse } from 'axios';
import { 
  Vehicle, 
  VehicleCreateRequest, 
  VehicleUpdateRequest, 
  VehicleControlRequest, 
  VehicleControlResponse,
  VehicleStatus,
  VehicleLog,
  ApiResponse 
} from '@/types';
import { API_BASE_URL } from '@/utils/constants';
import { StorageService } from '@/services/storage/StorageService';

class VehicleServiceClass {
  private api = axios.create({
    baseURL: API_BASE_URL,
    headers: {
      'Content-Type': 'application/json',
    },
    timeout: 10000,
  });

  constructor() {
    this.setupInterceptors();
  }

  private async setupInterceptors() {
    this.api.interceptors.request.use(
      async (config) => {
        const tokens = await StorageService.getTokens();
        if (tokens.token) {
          config.headers.Authorization = `Bearer ${tokens.token}`;
        }
        return config;
      },
      (error) => Promise.reject(error)
    );

    this.api.interceptors.response.use(
      (response) => response,
      async (error) => {
        if (error.response?.status === 401) {
          await StorageService.clearTokens();
        }
        return Promise.reject(error);
      }
    );
  }

  async getVehicles(): Promise<Vehicle[]> {
    try {
      const response = await this.api.get('/vehicles');
      
      if (response.data.error) {
        throw new Error(response.data.error);
      }
      
      return response.data.vehicles || [];
    } catch (error: any) {
      if (error.response?.data?.error) {
        throw new Error(error.response.data.error);
      }
      throw new Error('Network error: Please check your connection');
    }
  }

  async getVehicle(vehicleId: string): Promise<Vehicle> {
    try {
      const response = await this.api.get(`/vehicles/${vehicleId}`);
      
      if (response.data.error) {
        throw new Error(response.data.error);
      }
      
      return response.data.vehicle;
    } catch (error: any) {
      if (error.response?.data?.error) {
        throw new Error(error.response.data.error);
      }
      throw new Error('Network error: Please check your connection');
    }
  }

  async createVehicle(vehicleData: VehicleCreateRequest): Promise<Vehicle> {
    try {
      const response = await this.api.post('/vehicles', vehicleData);
      
      if (response.data.error) {
        throw new Error(response.data.error);
      }
      
      return response.data.vehicle;
    } catch (error: any) {
      if (error.response?.data?.error) {
        throw new Error(error.response.data.error);
      }
      throw new Error('Network error: Please check your connection');
    }
  }

  async updateVehicle(vehicleId: string, updates: VehicleUpdateRequest): Promise<Vehicle> {
    try {
      const response: AxiosResponse<ApiResponse<Vehicle>> = await this.api.put(
        `/vehicles/${vehicleId}`,
        updates
      );
      
      if (!response.data.success) {
        throw new Error(response.data.message || 'Failed to update vehicle');
      }
      
      return response.data.data;
    } catch (error: any) {
      if (error.response?.data?.message) {
        throw new Error(error.response.data.message);
      }
      throw new Error('Network error: Please check your connection');
    }
  }

  async deleteVehicle(vehicleId: string): Promise<void> {
    try {
      const response: AxiosResponse<ApiResponse<null>> = await this.api.delete(
        `/vehicles/${vehicleId}`
      );
      
      if (!response.data.success) {
        throw new Error(response.data.message || 'Failed to delete vehicle');
      }
    } catch (error: any) {
      if (error.response?.data?.message) {
        throw new Error(error.response.data.message);
      }
      throw new Error('Network error: Please check your connection');
    }
  }

  async controlVehicle(
    vehicleId: string, 
    command: VehicleControlRequest
  ): Promise<VehicleControlResponse> {
    try {
      const endpoint = this.getControlEndpoint(command.command);
      const response: AxiosResponse<ApiResponse<VehicleControlResponse>> = await this.api.post(
        `/vehicles/${vehicleId}${endpoint}`,
        { keyId: command.keyId }
      );
      
      if (!response.data.success) {
        throw new Error(response.data.message || 'Failed to control vehicle');
      }
      
      return response.data.data;
    } catch (error: any) {
      if (error.response?.data?.message) {
        throw new Error(error.response.data.message);
      }
      throw new Error('Network error: Please check your connection');
    }
  }

  async getVehicleStatus(vehicleId: string): Promise<VehicleStatus> {
    try {
      const response: AxiosResponse<ApiResponse<VehicleStatus>> = await this.api.get(
        `/vehicles/${vehicleId}/status`
      );
      
      if (!response.data.success) {
        throw new Error(response.data.message || 'Failed to get vehicle status');
      }
      
      return response.data.data;
    } catch (error: any) {
      if (error.response?.data?.message) {
        throw new Error(error.response.data.message);
      }
      throw new Error('Network error: Please check your connection');
    }
  }

  async getVehicleLogs(vehicleId: string): Promise<VehicleLog[]> {
    try {
      const response: AxiosResponse<ApiResponse<VehicleLog[]>> = await this.api.get(
        `/vehicles/${vehicleId}/logs`
      );
      
      if (!response.data.success) {
        throw new Error(response.data.message || 'Failed to get vehicle logs');
      }
      
      return response.data.data;
    } catch (error: any) {
      if (error.response?.data?.message) {
        throw new Error(error.response.data.message);
      }
      throw new Error('Network error: Please check your connection');
    }
  }

  private getControlEndpoint(command: string): string {
    switch (command) {
      case 'UNLOCK':
        return '/unlock';
      case 'LOCK':
        return '/lock';
      case 'START':
        return '/start';
      case 'STOP':
        return '/stop';
      case 'TRUNK':
        return '/trunk';
      default:
        throw new Error(`Unknown command: ${command}`);
    }
  }
}

export const VehicleService = new VehicleServiceClass();