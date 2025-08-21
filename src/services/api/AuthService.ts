import axios, { AxiosResponse } from 'axios';
import { AuthResponse, LoginRequest, RegisterRequest, User, ApiResponse } from '@/types';
import { API_BASE_URL } from '@/utils/constants';

class AuthServiceClass {
  private api = axios.create({
    baseURL: API_BASE_URL,
    headers: {
      'Content-Type': 'application/json',
    },
    timeout: 10000,
  });

  async login(credentials: LoginRequest): Promise<AuthResponse> {
    try {
      const response = await this.api.post('/auth/login', credentials);
      
      if (response.data.error) {
        throw new Error(response.data.error);
      }
      
      return {
        user: response.data.user,
        access_token: response.data.accessToken,
        refresh_token: response.data.refreshToken
      };
    } catch (error: any) {
      if (error.response?.data?.error) {
        throw new Error(error.response.data.error);
      }
      throw new Error('Network error: Please check your connection');
    }
  }

  async register(userData: RegisterRequest): Promise<AuthResponse> {
    try {
      const response = await this.api.post('/auth/register', userData);
      
      if (response.data.error) {
        throw new Error(response.data.error);
      }
      
      return {
        user: response.data.user,
        access_token: response.data.accessToken,
        refresh_token: response.data.refreshToken
      };
    } catch (error: any) {
      if (error.response?.data?.error) {
        throw new Error(error.response.data.error);
      }
      throw new Error('Network error: Please check your connection');
    }
  }

  async refreshToken(refreshToken: string): Promise<AuthResponse> {
    try {
      const response = await this.api.post('/auth/refresh', { refreshToken });
      
      if (response.data.error) {
        throw new Error(response.data.error);
      }
      
      return {
        access_token: response.data.accessToken,
        refresh_token: response.data.refreshToken
      };
    } catch (error: any) {
      if (error.response?.data?.error) {
        throw new Error(error.response.data.error);
      }
      throw new Error('Network error: Please check your connection');
    }
  }

  async getProfile(token: string): Promise<User> {
    try {
      const response = await this.api.get('/auth/profile', {
        headers: {
          Authorization: `Bearer ${token}`,
        },
      });
      
      if (response.data.error) {
        throw new Error(response.data.error);
      }
      
      return response.data.user;
    } catch (error: any) {
      if (error.response?.status === 401) {
        throw new Error('Token expired');
      }
      if (error.response?.data?.error) {
        throw new Error(error.response.data.error);
      }
      throw new Error('Network error: Please check your connection');
    }
  }

  setAuthToken(token: string) {
    this.api.defaults.headers.common['Authorization'] = `Bearer ${token}`;
  }

  clearAuthToken() {
    delete this.api.defaults.headers.common['Authorization'];
  }
}

export const AuthService = new AuthServiceClass();