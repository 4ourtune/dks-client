import { BleManager, Device, Service, Characteristic, State } from 'react-native-ble-plx';
import { PermissionsAndroid, Platform, Alert } from 'react-native';
import { check, request, PERMISSIONS, RESULTS } from 'react-native-permissions';
import { BLEDevice, CommandPacket, ResponsePacket, BLE_CONFIG } from '@/types';

class BLEManagerClass {
  private manager: BleManager;
  private connectedDevice: Device | null = null;
  private characteristic: Characteristic | null = null;
  private mockMode: boolean = false;

  constructor() {
    this.manager = new BleManager();
  }

  async initialize(): Promise<void> {
    try {
      const state = await this.manager.state();
      
      if (state === State.PoweredOff) {
        throw new Error('Bluetooth is turned off');
      }
      
      if (state === State.PoweredOn) {
        console.log('BLE Manager initialized successfully');
      } else {
        throw new Error(`Bluetooth state: ${state}`);
      }
    } catch (error: any) {
      console.error('BLE initialization failed:', error);
      
      this.mockMode = true;
      console.log('Enabling mock mode for BLE');
    }
  }

  async checkPermissions(): Promise<{ bluetooth: boolean; location: boolean }> {
    if (this.mockMode) {
      return { bluetooth: true, location: true };
    }

    let bluetoothPermission = true;
    let locationPermission = true;

    try {
      if (Platform.OS === 'android') {
        const bluetoothResult = await check(PERMISSIONS.ANDROID.BLUETOOTH_SCAN);
        const locationResult = await check(PERMISSIONS.ANDROID.ACCESS_FINE_LOCATION);
        
        bluetoothPermission = bluetoothResult === RESULTS.GRANTED;
        locationPermission = locationResult === RESULTS.GRANTED;
      } else {
        const bluetoothResult = await check(PERMISSIONS.IOS.BLUETOOTH);
        const locationResult = await check(PERMISSIONS.IOS.LOCATION_WHEN_IN_USE);
        
        bluetoothPermission = bluetoothResult === RESULTS.GRANTED;
        locationPermission = locationResult === RESULTS.GRANTED;
      }
    } catch (error) {
      console.error('Permission check failed:', error);
    }

    return { bluetooth: bluetoothPermission, location: locationPermission };
  }

  async requestPermissions(): Promise<{ bluetooth: boolean; location: boolean }> {
    if (this.mockMode) {
      return { bluetooth: true, location: true };
    }

    let bluetoothPermission = true;
    let locationPermission = true;

    try {
      if (Platform.OS === 'android') {
        const bluetoothResult = await request(PERMISSIONS.ANDROID.BLUETOOTH_SCAN);
        const locationResult = await request(PERMISSIONS.ANDROID.ACCESS_FINE_LOCATION);
        
        bluetoothPermission = bluetoothResult === RESULTS.GRANTED;
        locationPermission = locationResult === RESULTS.GRANTED;
      } else {
        const bluetoothResult = await request(PERMISSIONS.IOS.BLUETOOTH);
        const locationResult = await request(PERMISSIONS.IOS.LOCATION_WHEN_IN_USE);
        
        bluetoothPermission = bluetoothResult === RESULTS.GRANTED;
        locationPermission = locationResult === RESULTS.GRANTED;
      }
    } catch (error) {
      console.error('Permission request failed:', error);
      throw new Error('Failed to request permissions');
    }

    return { bluetooth: bluetoothPermission, location: locationPermission };
  }

  async startScan(): Promise<BLEDevice[]> {
    if (this.mockMode) {
      return this.getMockDevices();
    }

    return new Promise((resolve, reject) => {
      const devices: BLEDevice[] = [];
      const timeout = setTimeout(() => {
        this.manager.stopDeviceScan();
        resolve(devices);
      }, BLE_CONFIG.SCAN_TIMEOUT);

      this.manager.startDeviceScan(
        [BLE_CONFIG.SERVICE_UUID],
        null,
        (error, device) => {
          if (error) {
            clearTimeout(timeout);
            this.manager.stopDeviceScan();
            reject(new Error(`Scan failed: ${error.message}`));
            return;
          }

          if (device && !devices.find(d => d.id === device.id)) {
            devices.push({
              id: device.id,
              name: device.name || 'Unknown Device',
              rssi: device.rssi || undefined,
              isConnectable: device.isConnectable,
            });
          }
        }
      );
    });
  }

  stopScan(): void {
    if (!this.mockMode) {
      this.manager.stopDeviceScan();
    }
  }

  async connectToDevice(deviceId: string): Promise<void> {
    if (this.mockMode) {
      await this.delay(2000);
      console.log('Mock: Connected to device', deviceId);
      return;
    }

    try {
      const device = await this.manager.connectToDevice(deviceId, {
        timeout: BLE_CONFIG.CONNECTION_TIMEOUT,
      });

      this.connectedDevice = device;

      await device.discoverAllServicesAndCharacteristics();

      const services = await device.services();
      const service = services.find(s => s.uuid === BLE_CONFIG.SERVICE_UUID);

      if (!service) {
        throw new Error('Service not found');
      }

      const characteristics = await service.characteristics();
      this.characteristic = characteristics.find(c => c.uuid === BLE_CONFIG.CHAR_UUID) || null;

      if (!this.characteristic) {
        throw new Error('Characteristic not found');
      }

      console.log('Connected to device successfully');
    } catch (error: any) {
      this.connectedDevice = null;
      this.characteristic = null;
      throw new Error(`Connection failed: ${error.message}`);
    }
  }

  async disconnect(): Promise<void> {
    if (this.mockMode) {
      console.log('Mock: Disconnected from device');
      return;
    }

    try {
      if (this.connectedDevice) {
        await this.connectedDevice.cancelConnection();
        this.connectedDevice = null;
        this.characteristic = null;
      }
    } catch (error: any) {
      console.error('Disconnect error:', error);
      throw new Error(`Disconnect failed: ${error.message}`);
    }
  }

  async sendCommand(command: CommandPacket): Promise<ResponsePacket> {
    if (this.mockMode) {
      return this.getMockResponse(command);
    }

    if (!this.connectedDevice || !this.characteristic) {
      throw new Error('Device not connected');
    }

    try {
      const commandData = JSON.stringify(command);
      const base64Data = Buffer.from(commandData).toString('base64');

      await this.characteristic.writeWithResponse(base64Data);

      await this.delay(500);

      const response = await this.characteristic.read();
      const responseData = Buffer.from(response.value!, 'base64').toString();
      
      return JSON.parse(responseData) as ResponsePacket;
    } catch (error: any) {
      throw new Error(`Command failed: ${error.message}`);
    }
  }

  private getMockDevices(): BLEDevice[] {
    return [
      {
        id: 'mock-tc375-001',
        name: 'TC375 Digital Key',
        rssi: -45,
        isConnectable: true,
      },
      {
        id: 'mock-tc375-002',
        name: 'TC375 Backup',
        rssi: -65,
        isConnectable: true,
      },
    ];
  }

  private async getMockResponse(command: CommandPacket): Promise<ResponsePacket> {
    await this.delay(1000 + Math.random() * 1000);

    const responses: Record<string, any> = {
      UNLOCK: { success: true, data: { doorsLocked: false } },
      LOCK: { success: true, data: { doorsLocked: true } },
      START: { success: true, data: { engineRunning: true } },
      STOP: { success: true, data: { engineRunning: false } },
      STATUS: {
        success: true,
        data: {
          doorsLocked: Math.random() > 0.5,
          engineRunning: Math.random() > 0.7,
          battery: Math.floor(Math.random() * 30) + 70,
          lastUpdated: new Date().toISOString(),
          connected: true,
        },
      },
      TRUNK: { success: true, data: { trunkOpen: true } },
    };

    const response = responses[command.command];
    
    if (Math.random() < 0.1) {
      return {
        success: false,
        command: command.command,
        timestamp: Date.now(),
        error: 'Mock error: Command timeout',
      };
    }

    return {
      success: response.success,
      command: command.command,
      timestamp: Date.now(),
      data: response.data,
    };
  }

  private delay(ms: number): Promise<void> {
    return new Promise(resolve => setTimeout(resolve, ms));
  }

  isConnected(): boolean {
    return this.mockMode || (this.connectedDevice !== null);
  }

  getConnectionQuality(): 'excellent' | 'good' | 'fair' | 'poor' | 'unknown' {
    if (this.mockMode) {
      const qualities: ('excellent' | 'good' | 'fair' | 'poor')[] = ['excellent', 'good', 'fair', 'poor'];
      return qualities[Math.floor(Math.random() * qualities.length)];
    }

    return 'unknown';
  }
}

export const BLEManager = new BLEManagerClass();