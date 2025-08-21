import { create } from 'zustand';
import { AuthState, User, LoginRequest, RegisterRequest } from '@/types';
import { AuthService } from '@/services/api/AuthService';
import { StorageService } from '@/services/storage/StorageService';

interface AuthStore extends AuthState {
  login: (credentials: LoginRequest) => Promise<void>;
  register: (userData: RegisterRequest) => Promise<void>;
  logout: () => Promise<void>;
  refreshToken: () => Promise<void>;
  checkAuthStatus: () => Promise<void>;
  clearError: () => void;
  updateUser: (user: User) => void;
}

export const useAuthStore = create<AuthStore>((set, get) => ({
  user: null,
  token: null,
  refreshToken: null,
  isAuthenticated: false,
  isLoading: false,
  error: null,

  login: async (credentials: LoginRequest) => {
    try {
      set({ isLoading: true, error: null });
      
      const response = await AuthService.login(credentials);
      
      await StorageService.setTokens(response.access_token, response.refresh_token);
      
      set({
        user: response.user,
        token: response.access_token,
        refreshToken: response.refresh_token,
        isAuthenticated: true,
        isLoading: false,
      });
    } catch (error: any) {
      set({
        error: error.message || 'Login failed',
        isLoading: false,
      });
      throw error;
    }
  },

  register: async (userData: RegisterRequest) => {
    try {
      set({ isLoading: true, error: null });
      
      const response = await AuthService.register(userData);
      
      await StorageService.setTokens(response.access_token, response.refresh_token);
      
      set({
        user: response.user,
        token: response.access_token,
        refreshToken: response.refresh_token,
        isAuthenticated: true,
        isLoading: false,
      });
    } catch (error: any) {
      set({
        error: error.message || 'Registration failed',
        isLoading: false,
      });
      throw error;
    }
  },

  logout: async () => {
    try {
      set({ isLoading: true });
      
      await StorageService.clearTokens();
      
      set({
        user: null,
        token: null,
        refreshToken: null,
        isAuthenticated: false,
        isLoading: false,
        error: null,
      });
    } catch (error: any) {
      set({
        error: error.message || 'Logout failed',
        isLoading: false,
      });
    }
  },

  refreshToken: async () => {
    try {
      const currentRefreshToken = get().refreshToken;
      if (!currentRefreshToken) {
        throw new Error('No refresh token available');
      }

      const response = await AuthService.refreshToken(currentRefreshToken);
      
      await StorageService.setTokens(response.access_token, response.refresh_token);
      
      set({
        token: response.access_token,
        refreshToken: response.refresh_token,
        isAuthenticated: true,
      });
    } catch (error: any) {
      set({
        user: null,
        token: null,
        refreshToken: null,
        isAuthenticated: false,
        error: error.message || 'Token refresh failed',
      });
      await StorageService.clearTokens();
      throw error;
    }
  },

  checkAuthStatus: async () => {
    try {
      set({ isLoading: true });
      
      const tokens = await StorageService.getTokens();
      
      if (tokens.token && tokens.refreshToken) {
        try {
          const profile = await AuthService.getProfile(tokens.token);
          
          set({
            user: profile,
            token: tokens.token,
            refreshToken: tokens.refreshToken,
            isAuthenticated: true,
            isLoading: false,
          });
        } catch (error) {
          await get().refreshToken();
        }
      } else {
        set({ isLoading: false });
      }
    } catch (error: any) {
      set({
        error: error.message || 'Auth check failed',
        isLoading: false,
      });
    }
  },

  clearError: () => {
    set({ error: null });
  },

  updateUser: (user: User) => {
    set({ user });
  },
}));