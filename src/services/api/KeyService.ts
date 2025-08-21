import axios, { AxiosResponse } from 'axios';
import { 
  DigitalKey, 
  KeyCreateRequest, 
  KeyUpdateRequest, 
  KeyValidationRequest,
  KeyValidationResponse,
  ApiResponse 
} from '@/types';
import { API_BASE_URL } from '@/utils/constants';
import { StorageService } from '@/services/storage/StorageService';

class KeyServiceClass {
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

  async getKeys(vehicleId?: string): Promise<DigitalKey[]> {
    try {
      const url = vehicleId ? `/keys?vehicleId=${vehicleId}` : '/keys';
      const response = await this.api.get(url);
      
      if (response.data.error) {
        throw new Error(response.data.error);
      }
      
      return response.data.keys || [];
    } catch (error: any) {
      if (error.response?.data?.error) {
        throw new Error(error.response.data.error);
      }
      throw new Error('Network error: Please check your connection');
    }
  }

  async getKey(keyId: string): Promise<DigitalKey> {
    try {
      const response: AxiosResponse<ApiResponse<DigitalKey>> = await this.api.get(
        `/keys/${keyId}`
      );
      
      if (!response.data.success) {
        throw new Error(response.data.message || 'Failed to fetch key');
      }
      
      return response.data.data;
    } catch (error: any) {
      if (error.response?.data?.message) {
        throw new Error(error.response.data.message);
      }
      throw new Error('Network error: Please check your connection');
    }
  }

  async createKey(keyData: KeyCreateRequest): Promise<DigitalKey> {
    try {
      const response = await this.api.post('/keys/register', keyData);
      
      if (response.data.error) {
        throw new Error(response.data.error);
      }
      
      return response.data.key;
    } catch (error: any) {
      if (error.response?.data?.error) {
        throw new Error(error.response.data.error);
      }
      throw new Error('Network error: Please check your connection');
    }
  }

  async updateKey(keyId: string, updates: KeyUpdateRequest): Promise<DigitalKey> {
    try {
      const response: AxiosResponse<ApiResponse<DigitalKey>> = await this.api.put(
        `/keys/${keyId}`,
        updates
      );
      
      if (!response.data.success) {
        throw new Error(response.data.message || 'Failed to update key');
      }
      
      return response.data.data;
    } catch (error: any) {
      if (error.response?.data?.message) {
        throw new Error(error.response.data.message);
      }
      throw new Error('Network error: Please check your connection');
    }
  }

  async deleteKey(keyId: string): Promise<void> {
    try {
      const response: AxiosResponse<ApiResponse<null>> = await this.api.delete(
        `/keys/${keyId}`
      );
      
      if (!response.data.success) {
        throw new Error(response.data.message || 'Failed to delete key');
      }
    } catch (error: any) {
      if (error.response?.data?.message) {
        throw new Error(error.response.data.message);
      }
      throw new Error('Network error: Please check your connection');
    }
  }

  async validateKey(keyId: string, validation: KeyValidationRequest): Promise<KeyValidationResponse> {
    try {
      const response: AxiosResponse<ApiResponse<KeyValidationResponse>> = await this.api.post(
        `/keys/${keyId}/validate`,
        validation
      );
      
      if (!response.data.success) {
        throw new Error(response.data.message || 'Failed to validate key');
      }
      
      return response.data.data;
    } catch (error: any) {
      if (error.response?.data?.message) {
        throw new Error(error.response.data.message);
      }
      throw new Error('Network error: Please check your connection');
    }
  }
}

export const KeyService = new KeyServiceClass();