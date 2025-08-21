import { create } from 'zustand';
import { BLEState, BLEDevice, CommandPacket, ResponsePacket, BLECommand } from '@/types';
import { BLEManager } from '@/services/ble/BLEManager';

interface BLEStore extends BLEState {
  initialize: () => Promise<void>;
  startScan: () => Promise<void>;
  stopScan: () => void;
  connectToDevice: (deviceId: string) => Promise<void>;
  disconnect: () => Promise<void>;
  sendCommand: (command: CommandPacket) => Promise<ResponsePacket>;
  clearError: () => void;
  checkPermissions: () => Promise<void>;
  requestPermissions: () => Promise<void>;
}

export const useBLEStore = create<BLEStore>((set, get) => ({
  connection: {
    isScanning: false,
    isConnected: false,
    connectedDevice: null,
    discoveredDevices: [],
    connectionQuality: 'unknown',
    error: null,
  },
  commands: [],
  isInitialized: false,
  permissions: {
    bluetooth: false,
    location: false,
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
      
      get().checkPermissions();
    } catch (error: any) {
      set({
        connection: {
          ...get().connection,
          error: error.message || 'Failed to initialize BLE',
        },
      });
      throw error;
    }
  },

  startScan: async () => {
    try {
      if (!get().isInitialized) {
        await get().initialize();
      }
      
      set({
        connection: {
          ...get().connection,
          isScanning: true,
          discoveredDevices: [],
          error: null,
        },
      });
      
      const devices = await BLEManager.startScan();
      
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
          error: error.message || 'Failed to scan for devices',
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

  connectToDevice: async (deviceId: string) => {
    try {
      get().stopScan();
      
      const device = get().connection.discoveredDevices.find(d => d.id === deviceId);
      if (!device) {
        throw new Error('Device not found');
      }
      
      set({
        connection: {
          ...get().connection,
          error: null,
        },
      });
      
      await BLEManager.connectToDevice(deviceId);
      
      set({
        connection: {
          ...get().connection,
          isConnected: true,
          connectedDevice: device,
          connectionQuality: 'good',
          lastConnected: new Date().toISOString(),
        },
      });
    } catch (error: any) {
      set({
        connection: {
          ...get().connection,
          isConnected: false,
          connectedDevice: null,
          error: error.message || 'Failed to connect to device',
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
          isConnected: false,
          connectedDevice: null,
          connectionQuality: 'unknown',
          error: null,
        },
      });
    } catch (error: any) {
      set({
        connection: {
          ...get().connection,
          error: error.message || 'Failed to disconnect',
        },
      });
    }
  },

  sendCommand: async (command: CommandPacket) => {
    try {
      if (!get().connection.isConnected) {
        throw new Error('Device not connected');
      }
      
      const commandId = Date.now().toString();
      const bleCommand: BLECommand = {
        id: commandId,
        command,
        status: 'pending',
        timestamp: Date.now(),
      };
      
      set({
        commands: [...get().commands, bleCommand],
      });
      
      const response = await BLEManager.sendCommand(command);
      
      set({
        commands: get().commands.map(cmd =>
          cmd.id === commandId
            ? { ...cmd, status: 'success', response }
            : cmd
        ),
      });
      
      return response;
    } catch (error: any) {
      const commandId = get().commands[get().commands.length - 1]?.id;
      
      if (commandId) {
        set({
          commands: get().commands.map(cmd =>
            cmd.id === commandId
              ? { ...cmd, status: 'failed' }
              : cmd
          ),
        });
      }
      
      set({
        connection: {
          ...get().connection,
          error: error.message || 'Failed to send command',
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
  },

  checkPermissions: async () => {
    try {
      const permissions = await BLEManager.checkPermissions();
      
      set({
        permissions,
      });
    } catch (error: any) {
      console.error('Failed to check permissions:', error);
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
          error: error.message || 'Failed to request permissions',
        },
      });
      throw error;
    }
  },
}));