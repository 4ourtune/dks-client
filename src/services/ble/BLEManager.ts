import { BleManager, Device, Service, Characteristic, State } from 'react-native-ble-plx';
import { PermissionsAndroid, Platform, Alert } from 'react-native';
import { check, request, PERMISSIONS, RESULTS } from 'react-native-permissions';
import { BLEDevice, CommandPacket, ResponsePacket, BLE_CONFIG, PKISession } from '@/types';
import { CryptoService } from './CryptoService';
import { PKIProtocolHandler } from './PKIProtocolHandler';
import { CertificateService } from '@/services/crypto/CertificateService';

class BLEManagerClass {
  private manager: BleManager;
  private connectedDevice: Device | null = null;
  private characteristic: Characteristic | null = null;
  private mockMode: boolean = false;
  private pkiSession: PKISession | null = null;
  private usePKI: boolean = true;

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
      
      // Mock PKI session establishment
      if (this.usePKI) {
        await this.delay(1000);
        console.log('Mock: PKI session established');
      }
      
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

      // Establish PKI session if enabled
      if (this.usePKI) {
        await this.establishPKISession(deviceId);
      }
      
    } catch (error: any) {
      this.connectedDevice = null;
      this.characteristic = null;
      this.pkiSession = null;
      throw new Error(`Connection failed: ${error.message}`);
    }
  }

  async disconnect(): Promise<void> {
    if (this.mockMode) {
      console.log('Mock: Disconnected from device');
      this.pkiSession = null;
      return;
    }

    try {
      // Clear PKI session
      if (this.pkiSession) {
        CryptoService.clearSession(this.connectedDevice?.id || '');
        this.pkiSession = null;
      }

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
      // Use PKI or legacy method
      if (this.usePKI && this.pkiSession) {
        return await this.sendSecureCommand(command);
      } else {
        return await this.sendLegacyCommand(command);
      }
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

  // PKI Methods

  private async establishPKISession(deviceId: string): Promise<void> {
    try {
      console.log('Establishing PKI session...');
      
      // Step 1: Request vehicle certificate
      const vehicleCertResponse = await this.requestVehicleCertificate();
      
      // Step 2: Establish secure session
      this.pkiSession = await PKIProtocolHandler.establishSecureConnection(
        deviceId,
        vehicleCertResponse
      );
      
      console.log('PKI session established successfully');
    } catch (error) {
      console.error('PKI session establishment failed:', error);
      throw new Error('PKI session failed');
    }
  }

  private async requestVehicleCertificate(): Promise<string> {
    if (!this.characteristic) {
      throw new Error('No characteristic available');
    }

    try {
      // Send certificate request
      const request = { type: 'cert_request', timestamp: Date.now() };
      const requestData = JSON.stringify(request);
      const base64Data = Buffer.from(requestData).toString('base64');

      await this.characteristic.writeWithResponse(base64Data);
      await this.delay(1000);

      // Read certificate response
      const response = await this.characteristic.read();
      const responseData = Buffer.from(response.value!, 'base64').toString();
      
      const parsed = JSON.parse(responseData);
      if (!parsed.certificate) {
        throw new Error('No certificate in response');
      }

      return JSON.stringify(parsed.certificate);
    } catch (error) {
      console.error('Vehicle certificate request failed:', error);
      throw error;
    }
  }

  private async sendSecureCommand(command: CommandPacket): Promise<ResponsePacket> {
    if (!this.pkiSession || !this.characteristic) {
      throw new Error('No secure session or characteristic available');
    }

    try {
      console.log('Sending secure PKI command:', command.command);
      
      // Get vehicle ID from session or command
      const vehicleId = 1; // Should be derived from session context
      
      // Create secure command chunks
      const commandChunks = await PKIProtocolHandler.createSecureCommand(
        command.command,
        vehicleId,
        this.pkiSession
      );

      // Send command chunks
      const responseChunks: string[] = [];
      for (const chunk of commandChunks) {
        const base64Chunk = Buffer.from(chunk).toString('base64');
        await this.characteristic.writeWithResponse(base64Chunk);
        await this.delay(200); // Small delay between chunks
      }

      // Receive response chunks
      await this.delay(500); // Wait for processing
      
      // For now, simulate single response chunk
      const response = await this.characteristic.read();
      const responseData = Buffer.from(response.value!, 'base64').toString();
      responseChunks.push(responseData);

      // Process secure response
      const decryptedResponse = await PKIProtocolHandler.processSecureResponse(
        responseChunks,
        this.pkiSession,
        this.pkiSession.vehiclePublicKey
      );

      return {
        success: decryptedResponse.success,
        command: command.command,
        timestamp: Date.now(),
        data: decryptedResponse.data,
        error: decryptedResponse.error
      };

    } catch (error) {
      console.error('Secure command failed:', error);
      throw error;
    }
  }

  private async sendLegacyCommand(command: CommandPacket): Promise<ResponsePacket> {
    if (!this.characteristic) {
      throw new Error('No characteristic available');
    }

    try {
      console.log('Sending legacy command:', command.command);
      
      const commandData = JSON.stringify(command);
      const base64Data = Buffer.from(commandData).toString('base64');

      await this.characteristic.writeWithResponse(base64Data);
      await this.delay(500);

      const response = await this.characteristic.read();
      const responseData = Buffer.from(response.value!, 'base64').toString();
      
      return JSON.parse(responseData) as ResponsePacket;
    } catch (error) {
      console.error('Legacy command failed:', error);
      throw error;
    }
  }

  // Configuration methods
  setPKIMode(enabled: boolean): void {
    this.usePKI = enabled;
    console.log('PKI mode:', enabled ? 'enabled' : 'disabled');
  }

  isPKIEnabled(): boolean {
    return this.usePKI;
  }

  hasPKISession(): boolean {
    return this.pkiSession !== null && this.pkiSession.isValid;
  }

  getPKISessionInfo(): { sessionId?: string; expiresAt?: Date; isValid?: boolean } {
    if (!this.pkiSession) {
      return {};
    }

    return {
      sessionId: this.pkiSession.sessionId,
      expiresAt: this.pkiSession.expiresAt,
      isValid: this.pkiSession.isValid
    };
  }
}

export const BLEManager = new BLEManagerClass();