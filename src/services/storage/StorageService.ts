import AsyncStorage from '@react-native-async-storage/async-storage';

const KEYS = {
  AUTH_TOKEN: 'auth_token',
  REFRESH_TOKEN: 'refresh_token',
  USER_DATA: 'user_data',
  SELECTED_VEHICLE: 'selected_vehicle',
  APP_SETTINGS: 'app_settings',
  BLE_DEVICES: 'ble_devices',
  CACHED_VEHICLES: 'cached_vehicles',
  CACHED_KEYS: 'cached_keys',
};

export class StorageService {
  static async setTokens(token: string, refreshToken: string): Promise<void> {
    try {
      if (!token || !refreshToken) {
        throw new Error('Token and refresh token are required');
      }
      
      await Promise.all([
        AsyncStorage.setItem(KEYS.AUTH_TOKEN, token),
        AsyncStorage.setItem(KEYS.REFRESH_TOKEN, refreshToken),
      ]);
    } catch (error) {
      console.error('Failed to save tokens:', error);
      throw new Error('Failed to save authentication tokens');
    }
  }

  static async getTokens(): Promise<{ token: string | null; refreshToken: string | null }> {
    try {
      const [token, refreshToken] = await Promise.all([
        AsyncStorage.getItem(KEYS.AUTH_TOKEN),
        AsyncStorage.getItem(KEYS.REFRESH_TOKEN),
      ]);
      
      return { token, refreshToken };
    } catch (error) {
      console.error('Failed to get tokens:', error);
      return { token: null, refreshToken: null };
    }
  }

  static async clearTokens(): Promise<void> {
    try {
      await Promise.all([
        AsyncStorage.removeItem(KEYS.AUTH_TOKEN),
        AsyncStorage.removeItem(KEYS.REFRESH_TOKEN),
        AsyncStorage.removeItem(KEYS.USER_DATA),
      ]);
    } catch (error) {
      console.error('Failed to clear tokens:', error);
      throw new Error('Failed to clear authentication data');
    }
  }

  static async setUserData(userData: any): Promise<void> {
    try {
      await AsyncStorage.setItem(KEYS.USER_DATA, JSON.stringify(userData));
    } catch (error) {
      console.error('Failed to save user data:', error);
      throw new Error('Failed to save user data');
    }
  }

  static async getUserData(): Promise<any | null> {
    try {
      const data = await AsyncStorage.getItem(KEYS.USER_DATA);
      return data ? JSON.parse(data) : null;
    } catch (error) {
      console.error('Failed to get user data:', error);
      return null;
    }
  }

  static async setSelectedVehicle(vehicleId: string): Promise<void> {
    try {
      await AsyncStorage.setItem(KEYS.SELECTED_VEHICLE, vehicleId);
    } catch (error) {
      console.error('Failed to save selected vehicle:', error);
      throw new Error('Failed to save selected vehicle');
    }
  }

  static async getSelectedVehicle(): Promise<string | null> {
    try {
      return await AsyncStorage.getItem(KEYS.SELECTED_VEHICLE);
    } catch (error) {
      console.error('Failed to get selected vehicle:', error);
      return null;
    }
  }

  static async removeSelectedVehicle(): Promise<void> {
    try {
      await AsyncStorage.removeItem(KEYS.SELECTED_VEHICLE);
    } catch (error) {
      console.error('Failed to remove selected vehicle:', error);
    }
  }

  static async setAppSettings(settings: any): Promise<void> {
    try {
      await AsyncStorage.setItem(KEYS.APP_SETTINGS, JSON.stringify(settings));
    } catch (error) {
      console.error('Failed to save app settings:', error);
      throw new Error('Failed to save app settings');
    }
  }

  static async getAppSettings(): Promise<any | null> {
    try {
      const settings = await AsyncStorage.getItem(KEYS.APP_SETTINGS);
      return settings ? JSON.parse(settings) : null;
    } catch (error) {
      console.error('Failed to get app settings:', error);
      return null;
    }
  }

  static async setBLEDevices(devices: any[]): Promise<void> {
    try {
      await AsyncStorage.setItem(KEYS.BLE_DEVICES, JSON.stringify(devices));
    } catch (error) {
      console.error('Failed to save BLE devices:', error);
    }
  }

  static async getBLEDevices(): Promise<any[]> {
    try {
      const devices = await AsyncStorage.getItem(KEYS.BLE_DEVICES);
      return devices ? JSON.parse(devices) : [];
    } catch (error) {
      console.error('Failed to get BLE devices:', error);
      return [];
    }
  }

  static async cacheVehicles(vehicles: any[]): Promise<void> {
    try {
      const cacheData = {
        vehicles,
        timestamp: Date.now(),
      };
      await AsyncStorage.setItem(KEYS.CACHED_VEHICLES, JSON.stringify(cacheData));
    } catch (error) {
      console.error('Failed to cache vehicles:', error);
    }
  }

  static async getCachedVehicles(maxAgeMs: number = 300000): Promise<any[] | null> {
    try {
      const cached = await AsyncStorage.getItem(KEYS.CACHED_VEHICLES);
      if (!cached) return null;

      const cacheData = JSON.parse(cached);
      const age = Date.now() - cacheData.timestamp;
      
      if (age > maxAgeMs) {
        await AsyncStorage.removeItem(KEYS.CACHED_VEHICLES);
        return null;
      }

      return cacheData.vehicles;
    } catch (error) {
      console.error('Failed to get cached vehicles:', error);
      return null;
    }
  }

  static async cacheKeys(vehicleId: string, keys: any[]): Promise<void> {
    try {
      const cached = await AsyncStorage.getItem(KEYS.CACHED_KEYS);
      const allCached = cached ? JSON.parse(cached) : {};
      
      allCached[vehicleId] = {
        keys,
        timestamp: Date.now(),
      };
      
      await AsyncStorage.setItem(KEYS.CACHED_KEYS, JSON.stringify(allCached));
    } catch (error) {
      console.error('Failed to cache keys:', error);
    }
  }

  static async getCachedKeys(vehicleId: string, maxAgeMs: number = 300000): Promise<any[] | null> {
    try {
      const cached = await AsyncStorage.getItem(KEYS.CACHED_KEYS);
      if (!cached) return null;

      const allCached = JSON.parse(cached);
      const vehicleCache = allCached[vehicleId];
      
      if (!vehicleCache) return null;

      const age = Date.now() - vehicleCache.timestamp;
      
      if (age > maxAgeMs) {
        delete allCached[vehicleId];
        await AsyncStorage.setItem(KEYS.CACHED_KEYS, JSON.stringify(allCached));
        return null;
      }

      return vehicleCache.keys;
    } catch (error) {
      console.error('Failed to get cached keys:', error);
      return null;
    }
  }

  static async clearCache(): Promise<void> {
    try {
      await Promise.all([
        AsyncStorage.removeItem(KEYS.CACHED_VEHICLES),
        AsyncStorage.removeItem(KEYS.CACHED_KEYS),
        AsyncStorage.removeItem(KEYS.BLE_DEVICES),
      ]);
    } catch (error) {
      console.error('Failed to clear cache:', error);
    }
  }

  static async clearAllData(): Promise<void> {
    try {
      await AsyncStorage.clear();
    } catch (error) {
      console.error('Failed to clear all data:', error);
      throw new Error('Failed to clear all application data');
    }
  }

  static async getStorageSize(): Promise<number> {
    try {
      const keys = await AsyncStorage.getAllKeys();
      const items = await AsyncStorage.multiGet(keys);
      
      let totalSize = 0;
      items.forEach(([key, value]) => {
        if (value) {
          totalSize += key.length + value.length;
        }
      });
      
      return totalSize;
    } catch (error) {
      console.error('Failed to get storage size:', error);
      return 0;
    }
  }
}