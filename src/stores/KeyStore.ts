import { create } from 'zustand';
import { KeyState, DigitalKey, KeyCreateRequest, KeyUpdateRequest } from '@/types';
import { KeyService } from '@/services/api/KeyService';

interface KeyStore extends KeyState {
  fetchKeys: (vehicleId?: string) => Promise<void>;
  createKey: (keyData: KeyCreateRequest) => Promise<DigitalKey>;
  updateKey: (keyId: string, updates: KeyUpdateRequest) => Promise<void>;
  deleteKey: (keyId: string) => Promise<void>;
  selectKey: (key: DigitalKey | null) => void;
  validateKey: (keyId: string, command: string) => Promise<boolean>;
  clearError: () => void;
}

export const useKeyStore = create<KeyStore>((set, get) => ({
  keys: [],
  selectedKey: null,
  isLoading: false,
  error: null,

  fetchKeys: async (vehicleId?: string) => {
    try {
      set({ isLoading: true, error: null });
      
      const keys = await KeyService.getKeys(vehicleId);
      
      set({
        keys,
        isLoading: false,
      });
    } catch (error: any) {
      set({
        error: error.message || 'Failed to fetch keys',
        isLoading: false,
      });
      throw error;
    }
  },

  createKey: async (keyData: KeyCreateRequest) => {
    try {
      set({ isLoading: true, error: null });
      
      const newKey = await KeyService.createKey(keyData);
      
      set(state => ({
        keys: [...state.keys, newKey],
        isLoading: false,
      }));
      
      return newKey;
    } catch (error: any) {
      set({
        error: error.message || 'Failed to create key',
        isLoading: false,
      });
      throw error;
    }
  },

  updateKey: async (keyId: string, updates: KeyUpdateRequest) => {
    try {
      set({ isLoading: true, error: null });
      
      const updatedKey = await KeyService.updateKey(keyId, updates);
      
      set(state => ({
        keys: state.keys.map(k => 
          k.id === keyId ? updatedKey : k
        ),
        selectedKey: state.selectedKey?.id === keyId 
          ? updatedKey 
          : state.selectedKey,
        isLoading: false,
      }));
    } catch (error: any) {
      set({
        error: error.message || 'Failed to update key',
        isLoading: false,
      });
      throw error;
    }
  },

  deleteKey: async (keyId: string) => {
    try {
      set({ isLoading: true, error: null });
      
      await KeyService.deleteKey(keyId);
      
      set(state => ({
        keys: state.keys.filter(k => k.id !== keyId),
        selectedKey: state.selectedKey?.id === keyId 
          ? null 
          : state.selectedKey,
        isLoading: false,
      }));
    } catch (error: any) {
      set({
        error: error.message || 'Failed to delete key',
        isLoading: false,
      });
      throw error;
    }
  },

  selectKey: (key: DigitalKey | null) => {
    set({ selectedKey: key });
  },

  validateKey: async (keyId: string, command: string) => {
    try {
      const response = await KeyService.validateKey(keyId, {
        keyId,
        command,
        timestamp: Date.now(),
      });
      
      return response.isValid;
    } catch (error: any) {
      set({
        error: error.message || 'Failed to validate key',
      });
      return false;
    }
  },

  clearError: () => {
    set({ error: null });
  },
}));