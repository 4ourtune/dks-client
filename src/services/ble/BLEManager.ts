import {
  BleManager,
  Device,
  Characteristic,
  State,
  Subscription,
  BleError,
  BleErrorCode,
} from "react-native-ble-plx";
import { AppState, AppStateStatus, NativeEventSubscription, Platform } from "react-native";
import { check, request, PERMISSIONS, RESULTS, PermissionStatus } from "react-native-permissions";
import { Buffer } from "buffer";
import {
  BLEDevice,
  CommandPacket,
  ResponsePacket,
  BLE_CONFIG,
  PKISession,
  PKISessionCache,
  PKIResponsePacket,
  VehicleCertificate,
} from "@/types";
import { CryptoService } from "./CryptoService";
import { CertificateService } from "@/services/crypto/CertificateService";
import { ECCKeyManager } from "@/services/crypto/ECCKeyManager";
import { PKIProtocolHandler } from "./PKIProtocolHandler";
import { PairingService } from "@/services/api/PairingService";
import { StorageService } from "@/services/storage/StorageService";

class BLEManagerClass {
  private manager: BleManager;
  private connectedDevice: Device | null = null;
  private characteristic: Characteristic | null = null;
  private pairingChallengeCharacteristic: Characteristic | null = null;
  private pairingResultCharacteristic: Characteristic | null = null;
  private mockMode: boolean = false;
  private pkiSession: PKISession | null = null;
  private usePKI: boolean = true;
  private negotiatedMtu: number | null = null;
  private currentAppState: AppStateStatus;
  private appStateSubscription: NativeEventSubscription | null = null;
  private connectingPromise: Promise<void> | null = null;
  private notificationsEnabledFor: Set<string> = new Set();
  private writeQueue: Promise<void> = Promise.resolve();
  private activeVehicleId: number | null = null;

  constructor() {
    this.manager = new BleManager();
    this.currentAppState = AppState.currentState;
    this.setupAppStateTracking();
  }

  async initialize(): Promise<void> {
    try {
      const state = await this.manager.state();

      if (state === State.PoweredOff) {
        throw new Error("Bluetooth is turned off");
      }

      if (state === State.PoweredOn) {
        console.log("BLE Manager initialized successfully");
      } else {
        throw new Error(`Bluetooth state: ${state}`);
      }
    } catch (error: any) {
      console.error("BLE initialization failed:", error);

      this.mockMode = true;
      console.log("Enabling mock mode for BLE");
    }
  }

  private setupAppStateTracking(): void {
    if (this.appStateSubscription) {
      return;
    }

    this.currentAppState = AppState.currentState;

    this.appStateSubscription = AppState.addEventListener("change", (nextState) => {
      const previousState = this.currentAppState;
      this.currentAppState = nextState;

      console.log(`App state changed: ${previousState} -> ${nextState}`);
    });
  }

  private enqueueWrite<T>(operation: () => Promise<T>): Promise<T> {
    const queued = this.writeQueue.then(operation, operation);
    this.writeQueue = queued.then(
      () => undefined,
      () => undefined,
    );
    return queued;
  }

  private async writeCharacteristicData(
    characteristic: Characteristic,
    base64Data: string,
    context: string,
    options: { allowFallback?: boolean } = {},
  ): Promise<void> {
    const { allowFallback = true } = options;

    await this.enqueueWrite(async () => {
      try {
        await this.performWriteWithResponse(characteristic, base64Data);
        console.log(`[BLE] ${context} write acknowledged`);
      } catch (error: any) {
        const bleError = error as BleError | undefined;
        const message = typeof bleError?.message === "string" ? bleError.message : "";
        const code = bleError?.errorCode;

        if (allowFallback && this.isRecoverableWriteRejection(code, message)) {
          console.warn(`[BLE] ${context} write rejected; retrying without response`, {
            message,
            code,
          });
          await this.delay(50);
          await this.performWriteWithoutResponse(characteristic, base64Data);
          console.log(`[BLE] ${context} write completed without response`);
          return;
        }

        console.warn(`[BLE] ${context} write failed:`, error);
        throw error instanceof Error ? error : new Error(String(error));
      }
    });
  }

  private async performWriteWithResponse(
    characteristic: Characteristic,
    base64Data: string,
  ): Promise<void> {
    if (typeof (characteristic as any).writeWithResponse === "function") {
      await (characteristic as any).writeWithResponse(base64Data);
      return;
    }

    const deviceId = this.connectedDevice?.id;
    const serviceUUID = characteristic.serviceUUID || BLE_CONFIG.SERVICE_UUID;
    if (!deviceId || !serviceUUID) {
      throw new Error("Device or service identifier missing for write operation");
    }

    const managerAny = this.manager as any;
    if (typeof managerAny.writeCharacteristicWithResponseForDevice === "function") {
      await managerAny.writeCharacteristicWithResponseForDevice(
        deviceId,
        serviceUUID,
        characteristic.uuid,
        base64Data,
      );
      return;
    }

    throw new Error("writeWithResponse not supported on this platform");
  }

  private async performWriteWithoutResponse(
    characteristic: Characteristic,
    base64Data: string,
  ): Promise<void> {
    if (typeof (characteristic as any).writeWithoutResponse === "function") {
      await (characteristic as any).writeWithoutResponse(base64Data);
      return;
    }

    const deviceId = this.connectedDevice?.id;
    const serviceUUID = characteristic.serviceUUID || BLE_CONFIG.SERVICE_UUID;
    if (!deviceId || !serviceUUID) {
      throw new Error("Device or service identifier missing for write operation");
    }

    const managerAny = this.manager as any;
    if (typeof managerAny.writeCharacteristicWithoutResponseForDevice === "function") {
      await managerAny.writeCharacteristicWithoutResponseForDevice(
        deviceId,
        serviceUUID,
        characteristic.uuid,
        base64Data,
      );
      return;
    }

    throw new Error("writeWithoutResponse not supported on this platform");
  }

  private async waitForActiveAppState(
    timeoutMs: number = BLE_CONFIG.APP_STATE_WAIT_TIMEOUT,
  ): Promise<void> {
    if (this.currentAppState === "active") {
      return;
    }

    await new Promise<void>((resolve, reject) => {
      let resolved = false;

      const cleanup = (
        subscription: NativeEventSubscription | null,
        timer: ReturnType<typeof setTimeout>,
      ) => {
        if (subscription) {
          subscription.remove();
        }
        clearTimeout(timer);
      };

      const subscription = AppState.addEventListener("change", (state) => {
        this.currentAppState = state;

        if (!resolved && state === "active") {
          resolved = true;
          cleanup(subscription, timer);
          resolve();
        }
      });

      const timer = setTimeout(() => {
        if (!resolved) {
          resolved = true;
          cleanup(subscription, timer);
          reject(new Error("App did not return to foreground in time"));
        }
      }, timeoutMs);
    });
  }

  private isPermissionGranted(status: PermissionStatus): boolean {
    return status === RESULTS.GRANTED || status === RESULTS.LIMITED;
  }

  async checkPermissions(): Promise<{ bluetooth: boolean; location: boolean }> {
    if (this.mockMode) {
      return { bluetooth: true, location: true };
    }

    let bluetoothPermission = true;
    let locationPermission = true;

    try {
      if (Platform.OS === "android") {
        const bluetoothScanResult = await check(PERMISSIONS.ANDROID.BLUETOOTH_SCAN);
        const bluetoothConnectResult = await check(PERMISSIONS.ANDROID.BLUETOOTH_CONNECT);
        const locationResult = await check(PERMISSIONS.ANDROID.ACCESS_FINE_LOCATION);

        bluetoothPermission =
          this.isPermissionGranted(bluetoothScanResult) &&
          this.isPermissionGranted(bluetoothConnectResult);
        locationPermission = this.isPermissionGranted(locationResult);
      } else {
        const bluetoothResult = await check(PERMISSIONS.IOS.BLUETOOTH);
        const locationResult = await check(PERMISSIONS.IOS.LOCATION_WHEN_IN_USE);

        bluetoothPermission = this.isPermissionGranted(bluetoothResult);
        locationPermission = this.isPermissionGranted(locationResult);
      }
    } catch (error: any) {
      const bleError = error as BleError;
      const tolerantMessages = [
        "Cannot write to descriptor",
        "Operation was rejected",
        "Descriptors are not writable",
      ];
      const tolerantCodes = new Set<BleErrorCode | undefined>([
        BleErrorCode.DescriptorWriteFailed,
        BleErrorCode.OperationCancelled,
        BleErrorCode.OperationStartFailed,
      ]);

      const messageMatches =
        typeof bleError?.message === "string" &&
        tolerantMessages.some((text) => bleError.message.includes(text));
      const codeMatches = tolerantCodes.has(bleError?.errorCode);

      if (messageMatches || codeMatches) {
        console.log(
          "Platform rejected explicit CCCD write during secure command; treating as failure for visibility.",
        );
      } else {
        console.warn("Secure PKI command failed:", error);
      }

      throw error;
    }

    return { bluetooth: bluetoothPermission, location: locationPermission };
  }

  async requestPermissions(): Promise<{
    bluetooth: boolean;
    location: boolean;
  }> {
    if (this.mockMode) {
      return { bluetooth: true, location: true };
    }

    let bluetoothPermission = true;
    let locationPermission = true;

    try {
      if (Platform.OS === "android") {
        const bluetoothScanResult = await request(PERMISSIONS.ANDROID.BLUETOOTH_SCAN);
        const bluetoothConnectResult = await request(PERMISSIONS.ANDROID.BLUETOOTH_CONNECT);
        const locationResult = await request(PERMISSIONS.ANDROID.ACCESS_FINE_LOCATION);

        bluetoothPermission =
          this.isPermissionGranted(bluetoothScanResult) &&
          this.isPermissionGranted(bluetoothConnectResult);
        locationPermission = this.isPermissionGranted(locationResult);
      } else {
        const bluetoothResult = await request(PERMISSIONS.IOS.BLUETOOTH);
        const locationResult = await request(PERMISSIONS.IOS.LOCATION_WHEN_IN_USE);

        bluetoothPermission = this.isPermissionGranted(bluetoothResult);
        locationPermission = this.isPermissionGranted(locationResult);
      }
    } catch (error: any) {
      if (error?.message?.includes("Cannot write to descriptor")) {
        console.log("Skipping explicit notification enable; platform restricts CCCD writes.");
      } else {
        console.warn("Failed to enable notifications explicitly:", error);
      }
    }

    return { bluetooth: bluetoothPermission, location: locationPermission };
  }

  async startScan(
    options: {
      allowedDeviceIds?: string[];
      nameKeywords?: string[];
    } = {},
  ): Promise<BLEDevice[]> {
    if (this.mockMode) {
      return this.getMockDevices();
    }

    return new Promise((resolve, reject) => {
      const devices: BLEDevice[] = [];
      const observedIds = new Set<string>();

      const allowedIdSet = new Set(
        (options.allowedDeviceIds ?? [])
          .map((id) => id?.trim().toLowerCase())
          .filter((id): id is string => Boolean(id)),
      );

      const configuredKeywords =
        BLE_CONFIG.SCAN_DEVICE_NAME_KEYWORDS?.map((keyword) => keyword.toLowerCase()) ?? [];
      const optionKeywords = options.nameKeywords?.map((keyword) => keyword.toLowerCase()) ?? [];
      const keywordList = Array.from(
        new Set([...configuredKeywords, ...optionKeywords].filter((keyword) => keyword.length > 0)),
      );

      const macPrefixes =
        BLE_CONFIG.SCAN_DEVICE_MAC_PREFIXES?.map((prefix) => prefix.toLowerCase()) ?? [];

      const shouldFilterByService = BLE_CONFIG.SCAN_WITH_SERVICE_FILTER ?? false;
      const scanUuids = shouldFilterByService ? [BLE_CONFIG.SERVICE_UUID] : null;

      const timeout = setTimeout(() => {
        this.manager.stopDeviceScan();
        resolve(devices);
      }, BLE_CONFIG.SCAN_TIMEOUT);

      console.log(
        `Starting BLE scan (${shouldFilterByService ? "filtered" : "unfiltered"})...`,
        scanUuids ?? "all services",
      );

      this.manager.startDeviceScan(scanUuids, null, (error, device) => {
        if (error) {
          clearTimeout(timeout);
          this.manager.stopDeviceScan();
          reject(new Error(`Scan failed: ${error.message}`));
          return;
        }

        if (device && !devices.find((d) => d.id === device.id)) {
          const deviceId = device.id?.toLowerCase() ?? "";

          if (allowedIdSet.size > 0 && (!deviceId || !allowedIdSet.has(deviceId))) {
            return;
          }

          if (macPrefixes.length > 0 && deviceId) {
            const matchesMacPrefix = macPrefixes.some((prefix) => deviceId.startsWith(prefix));
            if (!matchesMacPrefix) {
              return;
            }
          }

          const extendedDevice = device as { localName?: unknown };
          const localName =
            typeof extendedDevice.localName === "string"
              ? (extendedDevice.localName as string)
              : undefined;

          const candidateNames = [device.name, localName]
            .filter((value): value is string => typeof value === "string")
            .map((value) => value.toLowerCase());

          if (BLE_CONFIG.SCAN_DEVICE_NAME_PREFIX) {
            const prefix = BLE_CONFIG.SCAN_DEVICE_NAME_PREFIX.toLowerCase();
            const matchesName =
              candidateNames.length > 0 && candidateNames.some((value) => value.startsWith(prefix));

            if (!matchesName && allowedIdSet.size === 0) {
              return;
            }
          }
          if (keywordList.length > 0 && allowedIdSet.size === 0) {
            const matchesKeyword =
              candidateNames.length > 0 &&
              candidateNames.some((value) =>
                keywordList.some((keyword) => value.includes(keyword)),
              );

            if (!matchesKeyword) {
              return;
            }
          }

          observedIds.add(device.id);
          const entry = {
            id: device.id,
            name: device.name || "Unknown Device",
            rssi: device.rssi || undefined,
            isConnectable: device.isConnectable ?? undefined,
          };
          devices.push(entry);
          console.log("Discovered BLE device:", entry);
        }
      });
    });
  }

  stopScan(): void {
    if (!this.mockMode) {
      this.manager.stopDeviceScan();
    }
  }

  async connectToDevice(deviceId: string, vehicleId?: string | number): Promise<void> {
    if (this.connectingPromise) {
      console.log("BLE connection already in progress, awaiting existing attempt");
      return this.connectingPromise;
    }

    if (vehicleId !== undefined) {
      const parsedVehicleId = typeof vehicleId === "number" ? vehicleId : Number(vehicleId);
      this.activeVehicleId = Number.isFinite(parsedVehicleId) ? parsedVehicleId : null;
    }

    const connectOperation = this.performDeviceConnection(deviceId);
    this.connectingPromise = connectOperation;

    try {
      await connectOperation;
    } finally {
      this.connectingPromise = null;
    }
  }

  private async performDeviceConnection(deviceId: string): Promise<void> {
    this.negotiatedMtu = null;

    if (this.mockMode) {
      await this.waitForActiveAppState();
      await this.delay(2000);
      console.log("Mock: Connected to device", deviceId);

      if (this.usePKI) {
        await this.delay(1000);
        console.log("Mock: PKI session established");
      }

      return;
    }

    await this.waitForActiveAppState();

    const maxAttempts = Math.max(1, BLE_CONFIG.CONNECT_RETRY_ATTEMPTS ?? 1);
    const retryDelay = Math.max(0, BLE_CONFIG.CONNECT_RETRY_DELAY_MS ?? 0);
    let lastError: any = null;

    for (let attempt = 0; attempt < maxAttempts; attempt += 1) {
      try {
        await this.connectOnce(deviceId);
        return;
      } catch (error: any) {
        lastError = error;
        this.resetConnectionState();

        const shouldRetry = attempt < maxAttempts - 1 && this.isRecoverableConnectionError(error);
        if (!shouldRetry) {
          throw new Error(`Connection failed: ${error?.message ?? String(error)}`);
        }

        console.warn(
          `[BLE] Connection attempt ${attempt + 1}/${maxAttempts} failed (${error?.message}); retrying...`,
        );
        await this.safeCancelDeviceConnection(deviceId);

        if (retryDelay > 0) {
          await this.delay(retryDelay);
        }
      }
    }

    if (lastError) {
      throw new Error(`Connection failed: ${lastError?.message ?? String(lastError)}`);
    }
  }

  private async connectOnce(deviceId: string): Promise<void> {
    const device = await this.manager.connectToDevice(deviceId, {
      timeout: BLE_CONFIG.CONNECTION_TIMEOUT,
    });

    this.connectedDevice = device;

    if (BLE_CONFIG.WAIT_BEFORE_DISCOVERY_MS && BLE_CONFIG.WAIT_BEFORE_DISCOVERY_MS > 0) {
      await this.delay(BLE_CONFIG.WAIT_BEFORE_DISCOVERY_MS);
    }

    await this.negotiateMtu(device);

    await device.discoverAllServicesAndCharacteristics();

    const services = await device.services();
    console.log(
      "BLE services discovered:",
      services.map((service) => service.uuid),
    );
    const service = services.find((s) => s.uuid === BLE_CONFIG.SERVICE_UUID);

    if (!service) {
      throw new Error("Service not found");
    }

    const characteristics = await service.characteristics();
    console.log(
      "BLE characteristics discovered:",
      characteristics.map((characteristic) => characteristic.uuid),
    );
    const commandCharacteristic =
      characteristics.find((c) => c.uuid === BLE_CONFIG.COMMAND_CHAR_UUID) || null;
    const challengeCharacteristic =
      characteristics.find((c) => c.uuid === BLE_CONFIG.PAIRING_CHALLENGE_CHAR_UUID) || null;
    const resultCharacteristic =
      characteristics.find((c) => c.uuid === BLE_CONFIG.PAIRING_RESULT_CHAR_UUID) || null;

    this.characteristic = commandCharacteristic;
    this.pairingChallengeCharacteristic = challengeCharacteristic || commandCharacteristic;
    this.pairingResultCharacteristic = resultCharacteristic || commandCharacteristic;

    if (!this.characteristic) {
      throw new Error("Command characteristic not found");
    }

    console.log("Connected to device successfully");

    if (this.usePKI) {
      const currentVehicleId =
        typeof this.activeVehicleId === "number" && !Number.isNaN(this.activeVehicleId)
          ? this.activeVehicleId
          : null;
      if (currentVehicleId !== null) {
        await this.ensureServerPKISession(currentVehicleId);
      }
      await this.establishPKISession(deviceId);
    }
  }

  private resetConnectionState(): void {
    this.connectedDevice = null;
    this.characteristic = null;
    this.pairingChallengeCharacteristic = null;
    this.pairingResultCharacteristic = null;
    this.pkiSession = null;
    this.negotiatedMtu = null;
  }

  private isRecoverableConnectionError(error: any): boolean {
    const bleError = error as BleError | undefined;
    const message = typeof bleError?.message === "string" ? bleError.message.toLowerCase() : "";

    if (!bleError) {
      return false;
    }

    if (bleError.errorCode === BleErrorCode.DeviceDisconnected) {
      return true;
    }

    if (bleError.errorCode === BleErrorCode.OperationCancelled) {
      return true;
    }

    if (message.includes("was disconnected") || message.includes("connection failed")) {
      return true;
    }

    return false;
  }

  private async safeCancelDeviceConnection(deviceId: string): Promise<void> {
    try {
      await this.manager.cancelDeviceConnection(deviceId);
    } catch (error) {
      console.log("cancelDeviceConnection during retry failed:", error);
    }
  }

  private async negotiateMtu(device: Device): Promise<void> {
    if (Platform.OS !== "android") {
      return;
    }

    const requestedMtu = BLE_CONFIG.REQUEST_MTU_SIZE;
    if (!requestedMtu || requestedMtu < 23) {
      console.log("Skipping MTU negotiation (no requested size)");
      return;
    }

    try {
      const updatedDevice = await device.requestMTU(requestedMtu);
      if (!updatedDevice.isConnected) {
        throw new Error("Device disconnected during MTU negotiation");
      }
      this.connectedDevice = updatedDevice;
      this.negotiatedMtu = updatedDevice.mtu ?? null;

      if (this.negotiatedMtu) {
        console.log(`Negotiated MTU: ${this.negotiatedMtu}`);
      } else {
        console.log("Requested MTU negotiation, device did not report MTU value");
      }
    } catch (error) {
      console.warn("MTU negotiation failed:", error);
    }
  }

  async disconnect(): Promise<void> {
    if (this.mockMode) {
      console.log("Mock: Disconnected from device");
      this.pkiSession = null;
      this.pairingChallengeCharacteristic = null;
      this.pairingResultCharacteristic = null;
      this.negotiatedMtu = null;
      this.activeVehicleId = null;
      return;
    }

    try {
      // Clear PKI session
      if (this.pkiSession) {
        CryptoService.clearSession(this.connectedDevice?.id || "");
        this.pkiSession = null;
      }

      if (this.connectedDevice) {
        await this.connectedDevice.cancelConnection();
        this.connectedDevice = null;
        this.characteristic = null;
        this.pairingChallengeCharacteristic = null;
        this.pairingResultCharacteristic = null;
      }

      this.negotiatedMtu = null;
      this.activeVehicleId = null;
    } catch (error: any) {
      console.error("Disconnect error:", error);
      throw new Error(`Disconnect failed: ${error.message}`);
    }
  }

  async readPairingChallenge(deviceId: string): Promise<{
    deviceId: string;
    nonce: string;
    issuedAt?: number;
    [key: string]: any;
  }> {
    if (this.mockMode) {
      return {
        deviceId,
        nonce: `mock-nonce-${Date.now()}`,
        issuedAt: Date.now(),
      };
    }

    if (!this.connectedDevice || this.connectedDevice.id !== deviceId) {
      throw new Error("Device not connected");
    }

    const characteristic = this.pairingChallengeCharacteristic || this.characteristic;
    if (!characteristic) {
      throw new Error("Pairing challenge characteristic not available");
    }

    const response = await characteristic.read();
    const rawValue = response.value;

    if (!rawValue) {
      throw new Error("Empty pairing challenge received");
    }

    let parsed: any;
    try {
      const decoded = Buffer.from(rawValue, "base64").toString();
      parsed = JSON.parse(decoded);
    } catch (error: any) {
      if (error?.message?.includes("Cannot write to descriptor")) {
        console.log("Skipping explicit notification enable; platform restricts CCCD writes.");
      } else {
        console.warn("Failed to enable notifications explicitly:", error);
      }
    }

    if (!parsed.nonce) {
      throw new Error("Pairing challenge missing nonce");
    }

    return {
      deviceId,
      ...parsed,
    };
  }

  async writePairingResponse(deviceId: string, payload: Record<string, any>): Promise<void> {
    if (this.mockMode) {
      console.log("Mock: pairing response sent", payload);
      return;
    }

    if (!this.connectedDevice || this.connectedDevice.id !== deviceId) {
      throw new Error("Device not connected");
    }

    const characteristic = this.pairingResultCharacteristic || this.characteristic;
    if (!characteristic) {
      throw new Error("Pairing result characteristic not available");
    }

    const serialized = JSON.stringify(payload);
    const maxPayload = this.getMaxWritePayload();
    const chunks = PKIProtocolHandler.chunkData(serialized, maxPayload);

    console.log("[BLE] Writing pairing result", {
      characteristic: characteristic.uuid,
      payloadSize: serialized.length,
      chunks: chunks.length,
      maxPayload,
    });

    for (let index = 0; index < chunks.length; index += 1) {
      const chunk = chunks[index];
      const base64Chunk = Buffer.from(chunk, "utf8").toString("base64");
      await this.writeCharacteristicData(
        characteristic,
        base64Chunk,
        `pairing_result chunk ${index + 1}/${chunks.length}`,
      );
    }

    console.log("[BLE] Pairing result delivery completed");
  }

  private isRecoverableWriteRejection(code: BleErrorCode | undefined, message: string): boolean {
    const tolerantCodes = new Set<BleErrorCode | undefined>([
      BleErrorCode.OperationCancelled,
      BleErrorCode.OperationStartFailed,
      BleErrorCode.OperationTimedOut,
      BleErrorCode.CharacteristicWriteFailed,
    ]);

    const tolerantMessages = [
      "Operation was rejected",
      "GATT error code: 4",
      "Cannot write characteristic",
    ];

    return tolerantCodes.has(code) || tolerantMessages.some((text) => message.includes(text));
  }
  async sendCommand(command: CommandPacket): Promise<ResponsePacket> {
    if (this.mockMode) {
      return this.getMockResponse(command);
    }

    if (!this.connectedDevice || !this.characteristic) {
      throw new Error("Device not connected");
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
        id: "mock-Device-001",
        name: "Device Digital Key",
        rssi: -45,
        isConnectable: true,
      },
      {
        id: "mock-Device-002",
        name: "Device Backup",
        rssi: -65,
        isConnectable: true,
      },
    ];
  }

  private async getMockResponse(command: CommandPacket): Promise<ResponsePacket> {
    await this.delay(1000 + Math.random() * 1000);

    const responses: Record<string, any> = {
      UNLOCK: {
        success: true,
        data: {
          doorsLocked: false,
          engineRunning: false,
          lastUpdated: new Date().toISOString(),
          connected: true,
        },
      },
      LOCK: {
        success: true,
        data: {
          doorsLocked: true,
          engineRunning: false,
          lastUpdated: new Date().toISOString(),
          connected: true,
        },
      },
      START: {
        success: true,
        data: {
          doorsLocked: true,
          engineRunning: true,
          lastUpdated: new Date().toISOString(),
          connected: true,
        },
      },
    };

    const response = responses[command.command];

    if (!response) {
      return {
        success: true,
        command: command.command,
        timestamp: Date.now(),
      };
    }

    if (Math.random() < 0.1) {
      return {
        success: false,
        command: command.command,
        timestamp: Date.now(),
        error: "Mock error: Command timeout",
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
    return new Promise((resolve) => setTimeout(resolve, ms));
  }

  isConnected(): boolean {
    return this.mockMode || this.connectedDevice !== null;
  }

  isConnecting(): boolean {
    return this.connectingPromise !== null;
  }

  isAppActive(): boolean {
    return this.currentAppState === "active";
  }

  getConnectionQuality(): "excellent" | "good" | "fair" | "poor" | "unknown" {
    if (this.mockMode) {
      const qualities: ("excellent" | "good" | "fair" | "poor")[] = [
        "excellent",
        "good",
        "fair",
        "poor",
      ];
      return qualities[Math.floor(Math.random() * qualities.length)];
    }

    return "unknown";
  }

  // PKI Methods

  private async establishPKISession(deviceId: string): Promise<void> {
    try {
      console.log("Establishing PKI session...");

      const seededSession = CryptoService.getSession(deviceId);
      if (seededSession) {
        console.log("[BLE] Using seeded PKI session without BLE handshake", {
          cacheKey: deviceId,
          sessionId: seededSession.sessionId,
          expiresAt: seededSession.expiresAt.toISOString?.(),
        });
        this.pkiSession = seededSession;
      }

      // Step 1: Obtain vehicle certificate (cached or remote)
      const vehicleId =
        typeof this.activeVehicleId === "number"
          ? this.activeVehicleId
          : typeof this.pkiSession?.vehicleId === "number"
            ? this.pkiSession.vehicleId
            : null;

      if (vehicleId === null || Number.isNaN(vehicleId)) {
        throw new Error("Vehicle context unavailable for secure session");
      }

      const vehicleCertResponse = await this.requestVehicleCertificate(vehicleId);

      const handshake = await this.performBleHandshake(vehicleId);

      if (!this.pkiSession) {
        // Fallback: derive a local session when no server session is present
        this.pkiSession = await PKIProtocolHandler.establishSecureConnection(
          deviceId,
          vehicleCertResponse,
        );
      }

      if (!this.pkiSession) {
        throw new Error("Failed to establish PKI session context after handshake");
      }
      if (handshake?.vehiclePublicKey) {
        const normalizedKey = this.normalizeVehiclePublicKey(handshake.vehiclePublicKey);
        this.pkiSession = {
          ...this.pkiSession,
          vehiclePublicKey: normalizedKey ?? this.pkiSession.vehiclePublicKey ?? "",
          serverNonce: handshake.vehicleNonce ?? this.pkiSession.serverNonce,
        };
        if (normalizedKey) {
          CryptoService.updateSessionVehiclePublicKey(
            [vehicleId, this.connectedDevice?.id, this.activeVehicleId],
            normalizedKey,
          );
        }
      }

      await this.pushSessionToDevice(this.pkiSession, vehicleId);

      console.log("PKI session established successfully");
    } catch (error: any) {
      const bleError = error as BleError;
      const tolerantMessages = [
        "Cannot write to descriptor",
        "Operation was rejected",
        "Descriptors are not writable",
      ];
      const tolerantCodes = new Set<BleErrorCode | undefined>([
        BleErrorCode.DescriptorWriteFailed,
        BleErrorCode.OperationCancelled,
        BleErrorCode.OperationStartFailed,
      ]);

      const messageMatches =
        typeof bleError?.message === "string" &&
        tolerantMessages.some((text) => bleError.message.includes(text));
      const codeMatches = tolerantCodes.has(bleError?.errorCode);

      if (messageMatches || codeMatches) {
        console.log(
          `[BLE] CCCD write rejected (code=${bleError?.errorCode}, reason=${
            bleError?.reason ?? bleError?.message ?? "n/a"
          }); assuming notifications already active.`,
        );
        const characteristic = this.characteristic;
        const connectedDevice = this.connectedDevice;
        const serviceUUID = characteristic?.serviceUUID || BLE_CONFIG.SERVICE_UUID;
        if (characteristic && connectedDevice && serviceUUID) {
          const key = `${connectedDevice.id}:${serviceUUID}:${characteristic.uuid}`;
          this.notificationsEnabledFor.add(key);
        }
        return;
      }

      console.warn(
        `[BLE] Failed to enable notifications explicitly (code=${bleError?.errorCode}, android=${bleError?.androidErrorCode}, ios=${bleError?.iosErrorCode}):`,
        error,
      );
      throw error;
    }
  }

  private hasFreshPKISession(vehicleId: number): boolean {
    if (!this.pkiSession) {
      return false;
    }

    if (!this.pkiSession.sessionId || this.pkiSession.sessionId.length === 0) {
      return false;
    }

    if (!this.pkiSession.isValid) {
      return false;
    }

    if (typeof this.pkiSession.vehicleId === "number" && this.pkiSession.vehicleId !== vehicleId) {
      return false;
    }

    if (this.pkiSession.expiresAt && this.pkiSession.expiresAt.getTime() <= Date.now()) {
      return false;
    }

    return true;
  }

  private async ensurePKISessionForVehicle(vehicleId: number): Promise<void> {
    if (this.hasFreshPKISession(vehicleId)) {
      console.log("[BLE] PKI session already fresh", {
        vehicleId,
        session: this.getPKISessionInfo(),
      });
      return;
    }

    console.log("[BLE] PKI session not fresh, refreshing via BLE handshake", {
      vehicleId,
      session: this.getPKISessionInfo(),
    });
    await this.refreshPKISession(vehicleId);
    console.log("[BLE] PKI session refreshed via BLE handshake", {
      vehicleId,
      session: this.getPKISessionInfo(),
    });
  }

  private async refreshPKISession(vehicleId: number): Promise<void> {
    if (!this.connectedDevice) {
      throw new Error("No connected device available for PKI refresh");
    }

    const serverSession = await this.ensureServerPKISession(vehicleId);
    this.activeVehicleId = vehicleId;

    const coerceDate = (value?: Date | string | number | null): Date | null => {
      if (!value) {
        return null;
      }
      if (value instanceof Date) {
        return Number.isNaN(value.getTime()) ? null : value;
      }
      const coerced = new Date(value);
      return Number.isNaN(coerced.getTime()) ? null : coerced;
    };

    const adoptSession = (session: PKISession, source: string, cacheKey?: string | null) => {
      const expiresAtDate = coerceDate(session.expiresAt) ?? new Date(Date.now() + 5 * 60 * 1000);
      const createdAtDate = coerceDate(session.createdAt) ?? new Date();
      const normalizedKey = this.normalizeVehiclePublicKey(session.vehiclePublicKey);

      this.pkiSession = {
        ...session,
        vehicleId,
        vehiclePublicKey:
          normalizedKey ?? this.normalizeVehiclePublicKey(this.pkiSession?.vehiclePublicKey) ?? "",
        createdAt: createdAtDate,
        expiresAt: expiresAtDate,
        isValid: session.isValid !== false,
      };

      console.log("[BLE] Using server-provisioned PKI session", {
        vehicleId,
        cacheKey: cacheKey ?? source,
        sessionId: this.pkiSession.sessionId,
        expiresAt: this.pkiSession.expiresAt.toISOString(),
        source,
      });

      if (normalizedKey) {
        CryptoService.updateSessionVehiclePublicKey(
          [vehicleId, this.connectedDevice?.id, this.activeVehicleId],
          normalizedKey,
        );
      }
    };

    if (serverSession) {
      adoptSession(serverSession, "server-response");
      return;
    }

    const currentSession = this.pkiSession ?? null;
    const currentExpiresAt = coerceDate(currentSession?.expiresAt);
    if (currentSession?.sessionId && currentExpiresAt && currentExpiresAt.getTime() > Date.now()) {
      adoptSession(
        {
          ...currentSession,
          expiresAt: currentExpiresAt,
        },
        "memory",
      );
      return;
    }

    const cacheKeys = [
      this.connectedDevice.id,
      String(vehicleId),
      this.connectedDevice.id.toLowerCase?.(),
    ].filter(Boolean) as string[];

    for (const key of cacheKeys) {
      const seeded = CryptoService.getSession(key);
      const hasSession = Boolean(seeded);
      console.log("[BLE] Checking PKI cache key", {
        cacheKey: key,
        hasSession,
        sessionId: seeded?.sessionId,
      });
      if (hasSession && seeded) {
        adoptSession(seeded, "cache", key);
        return;
      }
    }

    console.log("[BLE] No cached PKI session available; performing BLE handshake", {
      vehicleId,
      cacheKeys,
    });
    await this.establishPKISession(this.connectedDevice.id);
  }

  private isCharacteristicMissingError(error: any): boolean {
    const bleError = error as BleError | undefined;
    if (!bleError) {
      return false;
    }
    if (bleError.errorCode === BleErrorCode.CharacteristicNotFound) {
      return true;
    }
    const message = typeof bleError.message === "string" ? bleError.message.toLowerCase() : "";
    return message.includes("characteristic") && message.includes("not found");
  }

  private async sendJsonMessage(
    payload: string,
    {
      expectResponse = true,
      operation,
      timeoutMs = BLE_CONFIG.COMMAND_TIMEOUT * 2,
    }: { expectResponse?: boolean; operation: string; timeoutMs?: number },
  ): Promise<string | null> {
    if (!this.characteristic) {
      throw new Error(`No characteristic available for ${operation}`);
    }

    const characteristic = this.characteristic;
    if (expectResponse) {
      await this.ensureNotificationsEnabled(characteristic);
    }

    const base64Payload = Buffer.from(payload, "utf8").toString("base64");
    let collector: { promise: Promise<Buffer>; cancel: (error?: Error) => void } | null = null;

    if (expectResponse) {
      collector = this.startNotificationCollector(characteristic, {
        overallTimeoutMs: timeoutMs,
      });
    }

    try {
      await this.writeCharacteristicData(characteristic, base64Payload, operation);
    } catch (error: any) {
      if (collector) {
        collector.cancel(error instanceof Error ? error : new Error(String(error)));
      }
      if (this.isCharacteristicMissingError(error)) {
        console.warn(
          `[BLE] Characteristic missing during ${operation}; disconnecting to resync BLE handles.`,
        );
        try {
          await this.disconnect();
        } catch (disconnectError) {
          console.warn("Disconnect after characteristic failure failed:", disconnectError);
        }
      }
      throw error;
    }

    if (!collector) {
      return null;
    }

    try {
      const buffer = await collector.promise;
      return this.normalizeUtf8(buffer);
    } catch (error) {
      throw error instanceof Error ? error : new Error(String(error));
    }
  }

  private async performBleHandshake(vehicleId: number): Promise<{
    vehiclePublicKey?: string;
    vehicleNonce?: string;
  }> {
    if (!this.characteristic) {
      throw new Error("No characteristic available for PKI handshake");
    }

    const userPublicKey = await ECCKeyManager.getPublicKey();
    if (!userPublicKey) {
      throw new Error("User public key unavailable for handshake");
    }

    const handshakePacket = PKIProtocolHandler.createHandshakePacket(userPublicKey);
    const handshakeResponseRaw = await this.sendJsonMessage(handshakePacket, {
      operation: "handshake",
      expectResponse: true,
    });

    if (!handshakeResponseRaw) {
      throw new Error("Empty handshake response from vehicle");
    }

    let handshakeJson = handshakeResponseRaw;
    try {
      handshakeJson = this.extractFirstJsonObject(handshakeResponseRaw).json;
    } catch (error) {
      console.warn("Failed to isolate handshake JSON; attempting raw parse:", error);
    }

    const handshakeResult = PKIProtocolHandler.processHandshakeResponse(handshakeJson);
    if (!handshakeResult.success) {
      throw new Error("Vehicle rejected PKI handshake");
    }

    const userCertificate = await CertificateService.getUserCertificate(vehicleId);
    if (!userCertificate) {
      throw new Error("No user certificate available for exchange");
    }

    const certificatePacket = PKIProtocolHandler.createCertificateExchangePacket(userCertificate);
    await this.sendJsonMessage(certificatePacket, {
      operation: "certificate_exchange",
      expectResponse: false,
    });

    const normalizedKey = this.normalizeVehiclePublicKey(handshakeResult.vehiclePublicKey);
    if (normalizedKey) {
      CryptoService.updateSessionVehiclePublicKey(
        [vehicleId, this.connectedDevice?.id, this.activeVehicleId],
        normalizedKey,
      );
    }

    return {
      vehiclePublicKey: normalizedKey,
      vehicleNonce: handshakeResult.vehicleNonce,
    };
  }

  private async pushSessionToDevice(session: PKISession, vehicleId: number): Promise<void> {
    if (!this.characteristic) {
      throw new Error("No characteristic available to push session");
    }

    const expiresAtIso =
      session.expiresAt instanceof Date
        ? session.expiresAt.toISOString()
        : new Date(session.expiresAt).toISOString();

    const packet = PKIProtocolHandler.createSessionSeedPacket({
      sessionId: session.sessionId,
      sessionKey: session.sessionKey,
      expiresAt: expiresAtIso,
      vehicleId,
      clientNonce: session.clientNonce,
      serverNonce: session.serverNonce,
    });

    const responseRaw = await this.sendJsonMessage(packet, {
      operation: "session_seed",
      expectResponse: true,
      timeoutMs: BLE_CONFIG.COMMAND_TIMEOUT * 2,
    });

    if (!responseRaw) {
      console.warn("[BLE] Session seed response empty; proceeding optimistically");
      return;
    }

    let ackJson = responseRaw;
    try {
      ackJson = this.extractFirstJsonObject(responseRaw).json;
    } catch (error) {
      console.warn("Failed to isolate session seed response JSON:", error);
    }

    try {
      const parsed = JSON.parse(ackJson);
      if (parsed?.success === false) {
        throw new Error(parsed?.error || "Vehicle rejected session seed");
      }
      console.log("[BLE] Vehicle acknowledged PKI session seed", {
        sessionId: session.sessionId,
        expiresAt: expiresAtIso,
      });
    } catch (error: any) {
      console.warn("Unable to parse session seed acknowledgement:", error);
    }
  }

  private async ensureServerPKISession(vehicleId: number): Promise<PKISession | null> {
    try {
      const registration = await StorageService.getVehicleRegistration(String(vehicleId));
      const pairingToken = registration?.pairingToken ?? undefined;
      const cachedSessionId =
        this.pkiSession?.sessionId ?? registration?.session?.sessionId ?? undefined;
      console.log("[BLE] Requesting PKI session refresh", {
        vehicleId,
        pairingToken,
        cachedSessionId,
      });

      const response = await PairingService.refreshPKISession({
        vehicleId,
        pairingToken,
        sessionId: cachedSessionId,
      });
      const expiresAtMs = Date.parse(response.expiresAt);
      const sessionCache: PKISessionCache = {
        sessionId: response.sessionId,
        expiresAt: Number.isNaN(expiresAtMs) ? undefined : expiresAtMs,
        vehiclePublicKey:
          this.normalizeVehiclePublicKey(response.vehiclePublicKey) ??
          this.normalizeVehiclePublicKey(registration?.session?.vehiclePublicKey),
        sessionKey: response.sessionKey,
        clientNonce: response.clientNonce,
        serverNonce: response.serverNonce,
      };
      console.log("[BLE] PKI session refresh response", {
        vehicleId,
        sessionId: response.sessionId,
        expiresAt: response.expiresAt,
        expiresAtMs,
      });
      const expiresAtTimestamp = Number.isNaN(expiresAtMs)
        ? Date.now() + 5 * 60 * 1000
        : expiresAtMs;
      const seedTargets = new Set<string>([String(vehicleId)]);
      if (registration?.device?.id) {
        seedTargets.add(registration.device.id);
      }
      if (this.connectedDevice?.id) {
        seedTargets.add(this.connectedDevice.id);
      }

      console.log("[BLE] Seeding PKI session cache", {
        vehicleId,
        cacheKeys: Array.from(seedTargets),
      });

      const seededSessions = await Promise.all(
        Array.from(seedTargets).map((cacheKey) =>
          CryptoService.seedSessionFromServer(cacheKey, {
            sessionId: response.sessionId,
            sessionKey: response.sessionKey,
            expiresAt: expiresAtTimestamp,
            vehicleId,
            vehiclePublicKey:
              this.normalizeVehiclePublicKey(response.vehiclePublicKey) ??
              this.normalizeVehiclePublicKey(registration?.session?.vehiclePublicKey),
            clientNonce: response.clientNonce,
            serverNonce: response.serverNonce,
          }),
        ),
      );
      const primarySession = seededSessions.find(
        (session) => session?.sessionId === response.sessionId,
      );
      if (primarySession) {
        this.pkiSession = {
          ...primarySession,
          vehicleId,
          vehiclePublicKey:
            this.normalizeVehiclePublicKey(primarySession.vehiclePublicKey) ??
            this.normalizeVehiclePublicKey(response.vehiclePublicKey) ??
            this.normalizeVehiclePublicKey(registration?.session?.vehiclePublicKey) ??
            this.normalizeVehiclePublicKey(this.pkiSession?.vehiclePublicKey) ??
            "",
          isValid: true,
        };
        console.log("[BLE] Adopted server PKI session", {
          vehicleId,
          sessionId: this.pkiSession.sessionId,
          expiresAt: this.pkiSession.expiresAt.toISOString(),
        });
        await this.pushSessionToDevice(this.pkiSession, vehicleId);

        const sessionKeyRaw = this.pkiSession.vehiclePublicKey;
        const normalizedPrimaryKey = this.normalizeVehiclePublicKey(sessionKeyRaw);
        if (normalizedPrimaryKey) {
          CryptoService.updateSessionVehiclePublicKey(
            [vehicleId, this.connectedDevice?.id, this.activeVehicleId],
            normalizedPrimaryKey,
          );
        }

        const handshake = await this.performBleHandshake(vehicleId);
        if (handshake?.vehiclePublicKey) {
          const handshakeKeyRaw = handshake.vehiclePublicKey;
          const normalizedHandshakeKey = this.normalizeVehiclePublicKey(handshakeKeyRaw);
          this.pkiSession = {
            ...this.pkiSession,
            vehiclePublicKey: normalizedHandshakeKey ?? this.pkiSession.vehiclePublicKey ?? "",
            serverNonce: handshake.vehicleNonce ?? this.pkiSession.serverNonce,
          };
          if (normalizedHandshakeKey) {
            CryptoService.updateSessionVehiclePublicKey(
              [vehicleId, this.connectedDevice?.id, this.activeVehicleId],
              normalizedHandshakeKey,
            );
          }
        }
      }
      console.log("[BLE] PKI session cache seeded", {
        vehicleId,
        sessionId: response.sessionId,
        cacheKeys: Array.from(seedTargets),
      });

      if (registration?.device) {
        await StorageService.setVehicleRegistration(String(vehicleId), {
          device: registration.device,
          pairingToken: response.pairingToken ?? pairingToken,
          session: sessionCache,
          updatedAt: Date.now(),
        });
      }
      return this.pkiSession ?? null;
    } catch (error: any) {
      const message = error instanceof Error ? (error.message ?? "") : String(error ?? "");
      const normalized = message.toLowerCase();
      const accessErrors = [
        "does not have access to this vehicle",
        "pairing token mismatch",
        "vehicle pairing has not been completed",
      ];
      if (accessErrors.some((entry) => normalized.includes(entry))) {
        console.log("[BLE] PKI session refresh deferred until server pairing finalizes:", message);
      } else {
        console.warn("PKI session refresh via API failed:", error);
      }

      const authErrors = ["invalid or expired token", "access token required", "unauthorized"];
      if (authErrors.some((pattern) => normalized.includes(pattern))) {
        throw new Error("Access token required to refresh PKI session");
      }

      return null;
    }
  }

  private isRecoverablePKIError(message: string): boolean {
    const normalized = message.toLowerCase();
    const patterns = [
      "no pki session material",
      "session id mismatch",
      "secure session expired",
      "session expired",
      "handshake required",
    ];

    return patterns.some((pattern) => normalized.includes(pattern));
  }

  private startNotificationCollector(
    characteristic: Characteristic,
    {
      idleTimeoutMs = BLE_CONFIG.NOTIFICATION_IDLE_TIMEOUT ?? 300,
      overallTimeoutMs = BLE_CONFIG.COMMAND_TIMEOUT,
    }: { idleTimeoutMs?: number; overallTimeoutMs?: number } = {},
  ): { promise: Promise<Buffer>; cancel: (error?: Error) => void } {
    let cancelHandler: (error?: Error) => void = () => {};

    const promise = new Promise<Buffer>((resolve, reject) => {
      const chunks: Buffer[] = [];
      let completed = false;
      let idleTimer: ReturnType<typeof setTimeout> | null = null;
      let overallTimer: ReturnType<typeof setTimeout> | null = null;
      let subscription: Subscription | null = null;

      const cleanup = () => {
        if (idleTimer) {
          clearTimeout(idleTimer);
          idleTimer = null;
        }

        if (overallTimer) {
          clearTimeout(overallTimer);
          overallTimer = null;
        }

        if (subscription) {
          try {
            subscription.remove();
          } catch (removeError) {
            console.warn("Failed to remove BLE notification subscription:", removeError);
          }
          subscription = null;
        }
      };

      const fail = (error: Error) => {
        if (completed) {
          return;
        }

        completed = true;
        cleanup();
        reject(error);
      };

      const finalize = () => {
        if (completed) {
          return;
        }

        completed = true;
        cleanup();

        if (chunks.length === 0) {
          reject(new Error("No data received from BLE device"));
          return;
        }

        const buffer = Buffer.concat(chunks);
        console.log("BLE notification collector completed:", {
          chunks: chunks.length,
          totalBytes: buffer.length,
        });
        resolve(buffer);
      };

      const startIdleTimer = () => {
        if (idleTimeoutMs <= 0) {
          return;
        }

        if (idleTimer) {
          clearTimeout(idleTimer);
        }

        idleTimer = setTimeout(finalize, idleTimeoutMs);
      };

      cancelHandler = (error?: Error) => {
        fail(error ?? new Error("BLE notification collection cancelled"));
      };

      try {
        subscription = characteristic.monitor((error, char) => {
          if (error) {
            fail(new Error(error.message || "BLE notification error"));
            return;
          }

          if (!char?.value) {
            return;
          }

          try {
            const chunk = Buffer.from(char.value, "base64");

            if (chunk.length === 0) {
              return;
            }

            chunks.push(chunk);
            console.log("Received BLE notification chunk bytes:", chunk.length);
            startIdleTimer();
          } catch (decodeError) {
            fail(new Error("Failed to decode BLE notification chunk"));
          }
        });
      } catch (monitorError: any) {
        if (monitorError instanceof Error) {
          fail(monitorError);
        } else {
          fail(new Error(String(monitorError)));
        }
        return;
      }

      if (overallTimeoutMs > 0) {
        overallTimer = setTimeout(() => {
          fail(new Error("BLE response timeout"));
        }, overallTimeoutMs);
      }
    });

    return {
      promise,
      cancel: cancelHandler,
    };
  }

  private supportsNotifications(characteristic: Characteristic | null): boolean {
    if (!characteristic) {
      return false;
    }

    return Boolean(characteristic.isNotifiable || characteristic.isIndicatable);
  }

  private getMaxWritePayload(): number {
    const configuredMax = BLE_CONFIG.MAX_WRITE_PAYLOAD ?? 180;
    const mtuCandidate = this.negotiatedMtu ?? BLE_CONFIG.REQUEST_MTU_SIZE ?? 185;
    const mtuBudget = mtuCandidate > 3 ? mtuCandidate - 3 : 20;
    const safeBudget = Math.max(64, Math.min(configuredMax, mtuBudget - 8));
    console.log(
      `[BLE] Calculated max write payload: configured=${configuredMax}, mtu=${mtuCandidate}, budget=${safeBudget}`,
    );
    return safeBudget;
  }

  private async ensureNotificationsEnabled(characteristic: Characteristic): Promise<void> {
    if (!this.connectedDevice) {
      return;
    }

    const serviceUUID = characteristic.serviceUUID || BLE_CONFIG.SERVICE_UUID;
    if (!serviceUUID) {
      return;
    }

    const descriptorUUID = BLE_CONFIG.CCCD_UUID;
    if (!descriptorUUID) {
      return;
    }

    const key = `${this.connectedDevice.id}:${serviceUUID}:${characteristic.uuid}`;
    if (this.notificationsEnabledFor.has(key)) {
      return;
    }

    const enableValue = Buffer.from([0x01, 0x00]).toString("base64");

    try {
      const maybeWriteDescriptor =
        (characteristic as any).writeDescriptorWithResponse ||
        (characteristic as any).writeDescriptor;

      if (typeof maybeWriteDescriptor === "function") {
        await maybeWriteDescriptor.call(characteristic, descriptorUUID, enableValue);
      } else {
        const managerAny = this.manager as any;
        if (typeof managerAny.writeDescriptorWithResponseForDevice === "function") {
          await managerAny.writeDescriptorWithResponseForDevice(
            this.connectedDevice.id,
            serviceUUID,
            characteristic.uuid,
            descriptorUUID,
            enableValue,
          );
        } else if (typeof managerAny.writeDescriptorForDevice === "function") {
          await managerAny.writeDescriptorForDevice(
            this.connectedDevice.id,
            serviceUUID,
            characteristic.uuid,
            descriptorUUID,
            enableValue,
          );
        } else {
          console.warn(
            "BLE Manager does not expose a descriptor write helper; notification enable may rely on monitor() implementation.",
          );
        }
      }

      this.notificationsEnabledFor.add(key);
      console.log("Explicitly enabled notifications for characteristic:", characteristic.uuid);
    } catch (error: any) {
      const tolerantMessages = [
        "Cannot write to descriptor",
        "Descriptors are not writable",
        "Operation was rejected",
      ];

      if (
        typeof error?.message === "string" &&
        tolerantMessages.some((message) => error.message.includes(message))
      ) {
        console.log("Skipping explicit notification enable; platform restricts CCCD writes.");
        this.notificationsEnabledFor.add(key);
      } else {
        console.warn("Failed to enable notifications explicitly:", error);
      }
    }
  }

  private async collectResponseViaRead(
    characteristic: Characteristic,
    {
      pollIntervalMs = BLE_CONFIG.READ_POLL_INTERVAL_MS ?? 200,
      idleTimeoutMs = BLE_CONFIG.READ_IDLE_TIMEOUT_MS ?? 400,
      overallTimeoutMs = BLE_CONFIG.READ_OVERALL_TIMEOUT_MS ?? BLE_CONFIG.COMMAND_TIMEOUT * 2,
    }: {
      pollIntervalMs?: number;
      idleTimeoutMs?: number;
      overallTimeoutMs?: number;
    } = {},
  ): Promise<Buffer> {
    const seenValues = new Set<string>();
    const buffers: Buffer[] = [];

    const startTime = Date.now();
    let lastDataTime = 0;

    while (Date.now() - startTime < overallTimeoutMs) {
      try {
        const response = await characteristic.read();

        if (response.value) {
          const base64Value = response.value;

          if (!seenValues.has(base64Value)) {
            const chunk = Buffer.from(base64Value, "base64");
            if (chunk.length > 0) {
              buffers.push(chunk);
              seenValues.add(base64Value);
              lastDataTime = Date.now();
              console.log("Read BLE chunk bytes:", chunk.length);
            }
          }
        }
      } catch (error) {
        console.warn("BLE read attempt failed:", error);
      }

      if (buffers.length > 0 && lastDataTime > 0 && Date.now() - lastDataTime >= idleTimeoutMs) {
        break;
      }

      await this.delay(pollIntervalMs);
    }

    if (buffers.length === 0) {
      throw new Error("No data received from BLE device");
    }

    const combined = Buffer.concat(buffers);
    console.log("BLE read collector completed:", {
      chunks: buffers.length,
      totalBytes: combined.length,
    });

    return combined;
  }

  private normalizeUtf8(buffer: Buffer): string {
    let end = buffer.length;
    while (end > 0 && buffer[end - 1] === 0) {
      end--;
    }

    const trimmed = end === buffer.length ? buffer : buffer.subarray(0, end);
    return trimmed.toString("utf8");
  }

  private isLikelyBase64(value: string): boolean {
    const sanitized = value.replace(/\s+/g, "");
    if (sanitized.length === 0) {
      return false;
    }

    if (!/^[A-Za-z0-9+/=]+$/.test(sanitized)) {
      return false;
    }

    return sanitized.length % 4 === 0;
  }

  private extractFirstJsonObject(serialized: string): {
    json: string;
    remainder: string;
  } {
    const start = serialized.indexOf("{");
    if (start < 0) {
      throw new Error("No JSON object start found in payload");
    }

    let depth = 0;
    let inString = false;
    let isEscaped = false;

    for (let i = start; i < serialized.length; i++) {
      const ch = serialized[i];

      if (inString) {
        if (isEscaped) {
          isEscaped = false;
        } else if (ch === "\\") {
          isEscaped = true;
        } else if (ch === '"') {
          inString = false;
        }
        continue;
      }

      if (ch === '"') {
        inString = true;
      } else if (ch === "{") {
        depth++;
      } else if (ch === "}") {
        depth--;
        if (depth === 0) {
          const json = serialized.slice(start, i + 1);
          const remainder = serialized.slice(i + 1);
          return { json, remainder };
        }
      }
    }

    throw new Error("Incomplete JSON object in payload");
  }

  private extractCertificatePayload(serialized: string): {
    payload: any;
    remainder: string;
  } {
    let remainder = serialized;

    while (remainder.trim().length > 0) {
      const { json, remainder: next } = this.extractFirstJsonObject(remainder);
      let parsed: any;
      try {
        parsed = JSON.parse(json);
      } catch (error) {
        throw error;
      }

      if (parsed && (parsed.certificate || parsed.type === "cert_response")) {
        return { payload: parsed, remainder: next };
      }

      remainder = next;
    }

    throw new Error("No certificate payload found");
  }

  private splitJsonSequence(serialized: string): { objects: string[]; remainder: string } {
    let working = serialized;
    const objects: string[] = [];

    while (working.trim().length > 0) {
      const trimmed = working.trimStart();
      working = trimmed;

      if (!working.startsWith("{")) {
        break;
      }

      try {
        const { json, remainder } = this.extractFirstJsonObject(working);
        objects.push(json);
        working = remainder;
      } catch (error) {
        break;
      }
    }

    return { objects, remainder: working };
  }

  private parseResponseEnvelope(payload: string): {
    chunks: string[];
    responses: Array<{ raw: string; value: any }>;
    remainder: string;
  } {
    const { objects, remainder } = this.splitJsonSequence(payload);
    const chunks: string[] = [];
    const responses: Array<{ raw: string; value: any }> = [];

    if (objects.length === 0) {
      const trimmed = payload.trim();
      if (trimmed.length > 0 && this.isLikelyBase64(trimmed)) {
        try {
          return this.parseResponseEnvelope(Buffer.from(trimmed, "base64").toString("utf8"));
        } catch (decodeError) {
          console.warn("Failed to decode base64-encoded response payload:", decodeError);
        }
      }
    }

    const processJsonString = (jsonStr: string): void => {
      try {
        const value = JSON.parse(jsonStr);
        if (this.isChunkPacket(value)) {
          chunks.push(jsonStr);
        } else {
          responses.push({ raw: jsonStr, value });
        }
      } catch (error) {
        if (this.isLikelyBase64(jsonStr)) {
          try {
            const decoded = Buffer.from(jsonStr, "base64").toString("utf8");
            const nested = this.splitJsonSequence(decoded);
            nested.objects.forEach(processJsonString);
            if (nested.remainder.trim().length > 0) {
              console.log(
                "Nested secure response contained trailing payload:",
                nested.remainder.trim(),
              );
            }
          } catch (decodeError) {
            console.warn("Failed to decode base64 response chunk:", decodeError);
          }
        } else {
          console.warn("Failed to parse secure response chunk:", error);
        }
      }
    };

    objects.forEach(processJsonString);

    return { chunks, responses, remainder };
  }

  private isChunkPacket(value: any): boolean {
    return (
      value &&
      typeof value === "object" &&
      typeof value.index === "number" &&
      typeof value.total === "number" &&
      typeof value.data === "string"
    );
  }

  private isPKIResponseEnvelope(value: any): value is PKIResponsePacket & { type?: string } {
    return (
      value &&
      typeof value === "object" &&
      typeof (value as any).encryptedPayload === "string" &&
      typeof (value as any).sessionId === "string" &&
      (value.type === "pki_response" || typeof (value as any).success === "boolean")
    );
  }

  private hydrateVehiclePublicKeyFromResponses(
    responses: Array<{ value: any }>,
    vehicleId?: number,
  ): string | undefined {
    if (!responses || responses.length === 0) {
      return undefined;
    }

    const handshake = responses.find(
      ({ value }) =>
        value &&
        typeof value === "object" &&
        value.type === "handshake_ack" &&
        typeof value.vehiclePublicKey === "string" &&
        value.vehiclePublicKey.trim().length > 0,
    );

    if (!handshake) {
      return undefined;
    }

    const vehiclePublicKey = this.normalizeVehiclePublicKey(handshake.value.vehiclePublicKey);
    if (!vehiclePublicKey) {
      return undefined;
    }

    if (this.pkiSession) {
      if (this.pkiSession.vehiclePublicKey !== vehiclePublicKey) {
        this.pkiSession = {
          ...this.pkiSession,
          vehiclePublicKey,
        };
      }
    }

    const candidateKeys: Array<string | number> = [];
    if (typeof vehicleId === "number" && Number.isFinite(vehicleId)) {
      candidateKeys.push(vehicleId);
    }
    if (typeof this.activeVehicleId === "number" && Number.isFinite(this.activeVehicleId)) {
      candidateKeys.push(this.activeVehicleId);
    }
    if (this.connectedDevice?.id) {
      candidateKeys.push(this.connectedDevice.id);
    }

    CryptoService.updateSessionVehiclePublicKey(candidateKeys, vehiclePublicKey);
    return vehiclePublicKey;
  }

  private normalizeVehiclePublicKey(raw: string | null | undefined): string | undefined {
    if (!raw) {
      return undefined;
    }

    const trimmed = raw.trim();
    if (!trimmed) {
      return undefined;
    }

    const hexCandidate = trimmed.replace(/^0x/i, "");
    if (/^[0-9a-fA-F]+$/.test(hexCandidate) && hexCandidate.length >= 128) {
      return hexCandidate.toLowerCase();
    }

    if (trimmed.includes("BEGIN PUBLIC KEY")) {
      try {
        const base64 = trimmed
          .replace(/-----BEGIN PUBLIC KEY-----/g, "")
          .replace(/-----END PUBLIC KEY-----/g, "")
          .replace(/\s+/g, "");
        const der = Buffer.from(base64, "base64");

        if (der.length >= 65) {
          const markerIndex = der.lastIndexOf(0x04);
          const publicKeySlice =
            markerIndex >= 0 && der.length - markerIndex >= 65
              ? der.slice(markerIndex, markerIndex + 65)
              : der.slice(der.length - 65);

          if (publicKeySlice.length === 65 && publicKeySlice[0] === 0x04) {
            return Buffer.from(publicKeySlice).toString("hex");
          }
        }
      } catch (error) {
        console.warn("Failed to normalize PEM-formatted vehicle public key:", error);
      }
    }

    return undefined;
  }

  private isRelevantResponsePacket(
    packet: any,
    commandName: string,
    commandTimestamp: number,
  ): boolean {
    if (!packet || typeof packet !== "object") {
      return false;
    }

    const slackMs = 5000;
    if (typeof packet.timestamp === "number" && packet.timestamp < commandTimestamp - slackMs) {
      return false;
    }

    if (
      packet.command &&
      typeof packet.command === "string" &&
      packet.command.length > 0 &&
      packet.command !== commandName
    ) {
      return false;
    }

    return true;
  }

  private async requestVehicleCertificate(vehicleId: number): Promise<string> {
    const cachedVehicleCert = await CertificateService.getCachedVehicleCertificate(vehicleId);
    if (cachedVehicleCert) {
      console.log(
        `Using cached vehicle certificate for vehicle ${vehicleId}; skipping cert_request exchange`,
      );
      return JSON.stringify({
        ...cachedVehicleCert,
        notBefore: cachedVehicleCert.notBefore.toISOString(),
        notAfter: cachedVehicleCert.notAfter.toISOString(),
      });
    }

    if (!this.characteristic) {
      throw new Error("No characteristic available");
    }

    const responseCharacteristic = this.characteristic;
    if (!responseCharacteristic) {
      throw new Error("No response characteristic available");
    }

    const supportsNotify = this.supportsNotifications(responseCharacteristic);

    console.log(
      `Vehicle certificate cache miss for vehicle ${vehicleId}; issuing cert_request over BLE`,
    );

    try {
      await this.waitForActiveAppState();

      const certRequest = { type: "cert_request", timestamp: Date.now() };
      const requestData = JSON.stringify(certRequest);
      const base64Data = Buffer.from(requestData).toString("base64");

      let responseBuffer: Buffer;

      if (supportsNotify) {
        await this.ensureNotificationsEnabled(responseCharacteristic);

        const collector = this.startNotificationCollector(responseCharacteristic, {
          overallTimeoutMs: BLE_CONFIG.COMMAND_TIMEOUT * 3,
        });

        try {
          console.log("Writing cert_request to characteristic...");
          await this.writeCharacteristicData(this.characteristic, base64Data, "cert_request");
        } catch (writeError) {
          collector.cancel(
            writeError instanceof Error ? writeError : new Error(String(writeError)),
          );
          throw writeError;
        }

        try {
          responseBuffer = await collector.promise;
        } catch (notifyError) {
          console.warn(
            "BLE notification collection failed, falling back to read polling:",
            notifyError,
          );
          responseBuffer = await this.collectResponseViaRead(this.characteristic, {
            overallTimeoutMs: BLE_CONFIG.READ_OVERALL_TIMEOUT_MS ?? BLE_CONFIG.COMMAND_TIMEOUT * 3,
          });
        }
      } else {
        console.log(
          "Characteristic is not notifiable; using read polling for cert_request response",
        );
        console.log("Writing cert_request to characteristic...");
        await this.writeCharacteristicData(this.characteristic, base64Data, "cert_request");
        responseBuffer = await this.collectResponseViaRead(this.characteristic, {
          overallTimeoutMs: BLE_CONFIG.READ_OVERALL_TIMEOUT_MS ?? BLE_CONFIG.COMMAND_TIMEOUT * 3,
        });
      }

      if (!responseBuffer.length) {
        throw new Error("Empty certificate response");
      }

      console.log("Received certificate response bytes:", responseBuffer.length);

      const decodedPrimary = this.normalizeUtf8(responseBuffer);
      console.log("Decoded certificate response (utf-8):", decodedPrimary);

      let parsed: any;
      let remainderLog: string | null = null;

      try {
        const { payload, remainder } = this.extractCertificatePayload(decodedPrimary);
        parsed = payload;
        remainderLog = remainder.trim();
      } catch (jsonError) {
        if (this.isLikelyBase64(decodedPrimary)) {
          try {
            const decodedBuffer = Buffer.from(decodedPrimary, "base64");
            const decodedSecondary = this.normalizeUtf8(decodedBuffer);
            const { payload, remainder } = this.extractCertificatePayload(decodedSecondary);
            parsed = payload;
            remainderLog = remainder.trim();
          } catch (nestedError) {
            console.error("Vehicle certificate JSON parse failed:", nestedError);
            throw nestedError;
          }
        } else {
          console.error("Vehicle certificate JSON parse failed:", jsonError);
          throw jsonError;
        }
      }

      if (remainderLog && remainderLog.length > 0) {
        console.log(
          "Certificate response contained extra payload after cert_response:",
          remainderLog,
        );
      }

      if (!parsed.certificate) {
        throw new Error("No certificate in response");
      }

      const certificatePayload = parsed.certificate;
      const vehicleCertificate: VehicleCertificate = {
        ...certificatePayload,
        notBefore: new Date(certificatePayload.notBefore),
        notAfter: new Date(certificatePayload.notAfter),
      };

      await CertificateService.storeVehicleCertificate(vehicleId, vehicleCertificate);
      console.log(`Refreshed vehicle certificate cache for vehicle ${vehicleId}`);

      return JSON.stringify(certificatePayload);
    } catch (error: any) {
      if (error?.message?.includes("Cannot write to descriptor")) {
        console.log("Skipping explicit notification enable; platform restricts CCCD writes.");
      } else {
        console.warn("Vehicle certificate request failed:", error);
      }
      const reason = error instanceof Error ? error.message : String(error);
      const guidance =
        "Failed to refresh the vehicle certificate. Please retry; if the problem persists, re-authenticate the vehicle pairing.";
      throw new Error(reason ? `${guidance} (${reason})` : guidance);
    }
  }

  private async sendSecureCommand(command: CommandPacket): Promise<ResponsePacket> {
    if (!this.characteristic) {
      throw new Error("No characteristic available");
    }

    const vehicleId =
      typeof this.activeVehicleId === "number"
        ? this.activeVehicleId
        : typeof this.pkiSession?.vehicleId === "number"
          ? this.pkiSession.vehicleId
          : null;

    if (vehicleId === null || Number.isNaN(vehicleId)) {
      throw new Error("Vehicle context unavailable for secure command");
    }

    console.log("[BLE] PKI session snapshot before ensure", {
      vehicleId,
      session: this.getPKISessionInfo(),
    });
    await this.ensurePKISessionForVehicle(vehicleId);
    console.log("[BLE] PKI session snapshot after ensure", {
      vehicleId,
      session: this.getPKISessionInfo(),
    });

    for (let attempt = 0; attempt < 2; attempt += 1) {
      if (attempt > 0) {
        console.log("Refreshing PKI session before retrying secure command...");
        await this.refreshPKISession(vehicleId);
      }

      try {
        return await this.executeSecureCommandAttempt(command, vehicleId);
      } catch (error: any) {
        const message = error instanceof Error ? error.message : String(error);

        if (attempt === 0 && this.isRecoverablePKIError(message)) {
          console.warn(
            `Secure PKI command failed due to stale session ("${message}"); attempting session refresh.`,
          );
          this.pkiSession = null;
          if (this.connectedDevice) {
            CryptoService.clearSession(this.connectedDevice.id);
          }
          continue;
        }

        if (message?.includes("Cannot write to descriptor")) {
          console.log("Skipping explicit notification enable; platform restricts CCCD writes.");
        } else {
          console.warn("Secure PKI command failed:", error);
        }

        throw error instanceof Error ? error : new Error(String(error));
      }
    }

    throw new Error("Secure PKI command failed after session refresh");
  }

  private async executeSecureCommandAttempt(
    command: CommandPacket,
    vehicleId: number,
  ): Promise<ResponsePacket> {
    if (!this.pkiSession || !this.characteristic) {
      throw new Error("No secure session or characteristic available");
    }

    const responseCharacteristic = this.characteristic;
    const supportsNotify = this.supportsNotifications(responseCharacteristic);

    await this.waitForActiveAppState();

    console.log("Sending secure PKI command:", command.command);

    const maxPayloadBytes = this.getMaxWritePayload();
    const { command: pkiCommand, chunks: commandChunks } =
      await PKIProtocolHandler.createSecureCommand(command.command, vehicleId, this.pkiSession, {
        maxPayloadBytes,
      });
    const commandTimestamp =
      typeof pkiCommand.timestamp === "number" ? pkiCommand.timestamp : command.timestamp;
    console.log(
      `[BLE] Prepared ${commandChunks.length} PKI chunks (limit ${maxPayloadBytes} bytes per chunk)`,
    );

    const chunkDelay = Math.max(0, BLE_CONFIG.PKI_WRITE_DELAY_MS ?? 0);
    console.log(`[BLE] Using PKI chunk delay ${chunkDelay}ms between command fragments`);

    let responseBuffer: Buffer;

    if (supportsNotify) {
      await this.ensureNotificationsEnabled(responseCharacteristic);

      const collector = this.startNotificationCollector(responseCharacteristic, {
        overallTimeoutMs: BLE_CONFIG.COMMAND_TIMEOUT * 2,
      });

      try {
        for (let i = 0; i < commandChunks.length; i += 1) {
          const chunk = commandChunks[i];
          const base64Chunk = Buffer.from(chunk).toString("base64");
          console.log(
            `[BLE] Writing PKI chunk ${i + 1}/${commandChunks.length} (${chunk.length} bytes)`,
          );
          await this.writeCharacteristicData(
            this.characteristic,
            base64Chunk,
            `PKI chunk ${i + 1}/${commandChunks.length}`,
          );
          if (chunkDelay > 0) {
            await this.delay(chunkDelay);
          }
        }
      } catch (writeError) {
        collector.cancel(writeError instanceof Error ? writeError : new Error(String(writeError)));
        throw writeError;
      }

      try {
        responseBuffer = await collector.promise;
      } catch (notifyError) {
        console.warn(
          "BLE notification collection failed, falling back to read polling:",
          notifyError,
        );
        responseBuffer = await this.collectResponseViaRead(this.characteristic, {
          overallTimeoutMs: BLE_CONFIG.READ_OVERALL_TIMEOUT_MS ?? BLE_CONFIG.COMMAND_TIMEOUT * 2,
        });
      }
    } else {
      console.log(
        "Characteristic is not notifiable; using read polling for secure command response",
      );
      for (let i = 0; i < commandChunks.length; i += 1) {
        const chunk = commandChunks[i];
        const base64Chunk = Buffer.from(chunk).toString("base64");
        console.log(
          `[BLE] Writing PKI chunk ${i + 1}/${commandChunks.length} (${chunk.length} bytes)`,
        );
        await this.writeCharacteristicData(
          this.characteristic,
          base64Chunk,
          `PKI chunk ${i + 1}/${commandChunks.length}`,
        );
        if (chunkDelay > 0) {
          await this.delay(chunkDelay);
        }
      }

      responseBuffer = await this.collectResponseViaRead(this.characteristic, {
        overallTimeoutMs: BLE_CONFIG.READ_OVERALL_TIMEOUT_MS ?? BLE_CONFIG.COMMAND_TIMEOUT * 2,
      });
    }

    if (!responseBuffer.length) {
      throw new Error("Empty secure command response");
    }

    console.log("Received secure response bytes:", responseBuffer.length);

    const decodedPrimary = this.normalizeUtf8(responseBuffer);
    console.log("Decoded secure response (utf-8):", decodedPrimary);

    const envelope = this.parseResponseEnvelope(decodedPrimary);
    const discoveredVehiclePublicKey = this.hydrateVehiclePublicKeyFromResponses(
      envelope.responses,
      vehicleId,
    );
    if (envelope.remainder.trim().length > 0) {
      console.log(
        "Secure response contained extra payload after parsing sequence:",
        envelope.remainder.trim(),
      );
    }

    let responsePayload: any | null = null;

    if (envelope.chunks.length > 0) {
      try {
        const preview = JSON.parse(PKIProtocolHandler.reconstructFromChunks(envelope.chunks));
        if (preview?.type === "pki_response") {
          responsePayload = await PKIProtocolHandler.processSecureResponse(
            envelope.chunks,
            this.pkiSession,
            this.pkiSession.vehiclePublicKey,
          );
        } else {
          console.log(`[BLE] Ignoring chunk sequence of type ${preview?.type ?? "unknown"}`);
        }
      } catch (chunkError) {
        console.warn("Failed to process chunked secure response:", chunkError);
      }
    }

    const relevantPackets = envelope.responses.filter(({ value }) =>
      this.isRelevantResponsePacket(value, command.command, commandTimestamp),
    );

    if (!responsePayload) {
      const successPacket = [...relevantPackets]
        .reverse()
        .find(
          ({ value }) =>
            value &&
            (value.type === "pki_response" ||
              value.type === "cert_response" ||
              value.success === true),
        );
      if (successPacket) {
        responsePayload = successPacket.value;
        if (successPacket.raw && typeof successPacket.raw === "string") {
          (responsePayload as any).raw = successPacket.raw;
        }
      }
    }

    if (!responsePayload) {
      const errorPacket = relevantPackets.find(
        ({ value }) => value && (value.success === false || value.error),
      );
      if (errorPacket) {
        throw new Error(errorPacket.value.error || "Secure command failed");
      }
    }

    if (!responsePayload) {
      throw new Error("Secure command response not found");
    }

    let resolvedPayload: any = responsePayload;

    if (this.isPKIResponseEnvelope(responsePayload)) {
      if (!this.pkiSession) {
        throw new Error("PKI session unavailable for secure response verification");
      }

      let vehiclePublicKey =
        this.normalizeVehiclePublicKey(this.pkiSession?.vehiclePublicKey) ??
        this.normalizeVehiclePublicKey((responsePayload as any)?.vehiclePublicKey) ??
        this.normalizeVehiclePublicKey(discoveredVehiclePublicKey);

      if ((!vehiclePublicKey || vehiclePublicKey.length === 0) && typeof vehicleId === "number") {
        try {
          const cachedCertificate = await CertificateService.getCachedVehicleCertificate(vehicleId);
          if (cachedCertificate?.publicKey) {
            vehiclePublicKey = this.normalizeVehiclePublicKey(cachedCertificate.publicKey);
          }
        } catch (certificateError) {
          console.warn(
            "Failed to load cached vehicle certificate for PKI response verification:",
            certificateError,
          );
        }
      }

      if (!vehiclePublicKey) {
        throw new Error("Vehicle public key missing for PKI response verification");
      }

      if (this.pkiSession && this.pkiSession.vehiclePublicKey !== vehiclePublicKey) {
        this.pkiSession = {
          ...this.pkiSession,
          vehiclePublicKey,
        };
      }
      CryptoService.updateSessionVehiclePublicKey(
        [
          typeof vehicleId === "number" ? vehicleId : undefined,
          this.connectedDevice?.id,
          this.activeVehicleId !== null ? this.activeVehicleId : undefined,
        ],
        vehiclePublicKey,
      );

      try {
        const decrypted = await CryptoService.verifyPKIResponse(
          responsePayload,
          this.pkiSession,
          vehiclePublicKey,
        );

        if (decrypted && typeof decrypted === "object") {
          resolvedPayload = {
            ...decrypted,
            success:
              typeof decrypted.success === "boolean" ? decrypted.success : responsePayload.success,
            error: decrypted.error ?? responsePayload.error,
          };
        } else {
          resolvedPayload = {
            success: responsePayload.success,
            result: decrypted,
            error: responsePayload.error,
          };
        }
      } catch (verificationError: any) {
        console.warn("Failed to decrypt PKI response payload:", verificationError);
        throw verificationError instanceof Error
          ? verificationError
          : new Error(String(verificationError));
      }
    }

    const responseSuccess =
      typeof resolvedPayload.success === "boolean"
        ? resolvedPayload.success
        : !resolvedPayload.error;

    return {
      success: responseSuccess,
      command: command.command,
      timestamp: Date.now(),
      data:
        resolvedPayload.data ??
        resolvedPayload.result ??
        resolvedPayload.certificate ??
        resolvedPayload,
      vehicleState: resolvedPayload.vehicleState,
      metadata: resolvedPayload.metadata,
      error: resolvedPayload.error,
    };
  }

  private async sendLegacyCommand(command: CommandPacket): Promise<ResponsePacket> {
    if (!this.characteristic) {
      throw new Error("No characteristic available");
    }

    const responseCharacteristic = this.characteristic;
    if (!responseCharacteristic) {
      throw new Error("No response characteristic available");
    }

    const supportsNotify = this.supportsNotifications(responseCharacteristic);

    try {
      await this.waitForActiveAppState();

      console.log("Sending legacy command:", command.command);

      const commandData = JSON.stringify(command);
      const base64Data = Buffer.from(commandData).toString("base64");

      let responseBuffer: Buffer;

      if (supportsNotify) {
        await this.ensureNotificationsEnabled(responseCharacteristic);

        const collector = this.startNotificationCollector(responseCharacteristic, {
          overallTimeoutMs: BLE_CONFIG.COMMAND_TIMEOUT * 2,
        });

        try {
          await this.writeCharacteristicData(this.characteristic, base64Data, "legacy_command");
        } catch (writeError) {
          collector.cancel(
            writeError instanceof Error ? writeError : new Error(String(writeError)),
          );
          throw writeError;
        }

        try {
          responseBuffer = await collector.promise;
        } catch (notifyError) {
          console.warn(
            "BLE notification collection failed, falling back to read polling:",
            notifyError,
          );
          responseBuffer = await this.collectResponseViaRead(this.characteristic, {
            overallTimeoutMs: BLE_CONFIG.READ_OVERALL_TIMEOUT_MS ?? BLE_CONFIG.COMMAND_TIMEOUT * 2,
          });
        }
      } else {
        console.log(
          "Characteristic is not notifiable; using read polling for legacy command response",
        );
        await this.writeCharacteristicData(this.characteristic, base64Data, "legacy_command");
        responseBuffer = await this.collectResponseViaRead(this.characteristic, {
          overallTimeoutMs: BLE_CONFIG.READ_OVERALL_TIMEOUT_MS ?? BLE_CONFIG.COMMAND_TIMEOUT * 2,
        });
      }

      if (!responseBuffer.length) {
        throw new Error("Empty legacy response");
      }

      console.log("Received legacy response bytes:", responseBuffer.length);

      const decodedPrimary = this.normalizeUtf8(responseBuffer);
      console.log("Decoded legacy response (utf-8):", decodedPrimary);

      const extractedPrimary = this.extractFirstJsonObject(decodedPrimary);

      if (extractedPrimary.remainder.trim().length > 0) {
        console.log(
          "Legacy response contained extra payload after first JSON object:",
          extractedPrimary.remainder.trim(),
        );
      }

      try {
        return JSON.parse(extractedPrimary.json) as ResponsePacket;
      } catch (jsonError) {
        if (this.isLikelyBase64(extractedPrimary.json)) {
          try {
            const decodedBuffer = Buffer.from(extractedPrimary.json, "base64");
            const decodedSecondary = this.normalizeUtf8(decodedBuffer);
            const extractedSecondary = this.extractFirstJsonObject(decodedSecondary);
            if (extractedSecondary.remainder.trim().length > 0) {
              console.log(
                "Secondary decoded legacy response contained extra payload:",
                extractedSecondary.remainder.trim(),
              );
            }
            console.log("Decoded legacy response (second pass):", extractedSecondary.json);
            return JSON.parse(extractedSecondary.json) as ResponsePacket;
          } catch (nestedError) {
            console.error("Legacy command response parse failed:", nestedError);
            throw nestedError;
          }
        } else {
          console.error("Legacy command response parse failed:", jsonError);
          throw jsonError;
        }
      }
    } catch (error: any) {
      if (error?.message?.includes("Cannot write to descriptor")) {
        console.log("Skipping explicit notification enable; platform restricts CCCD writes.");
      } else {
        console.warn("Failed to enable notifications explicitly:", error);
      }
      throw error instanceof Error ? error : new Error(String(error));
    }
  }

  // Configuration methods
  setPKIMode(enabled: boolean): void {
    this.usePKI = enabled;
    console.log("PKI mode:", enabled ? "enabled" : "disabled");
  }

  isPKIEnabled(): boolean {
    return this.usePKI;
  }

  hasPKISession(): boolean {
    return this.pkiSession !== null && this.pkiSession.isValid;
  }

  getPKISessionInfo(): {
    sessionId?: string;
    expiresAt?: Date;
    isValid?: boolean;
  } {
    if (!this.pkiSession) {
      return {};
    }

    return {
      sessionId: this.pkiSession.sessionId,
      expiresAt: this.pkiSession.expiresAt,
      isValid: this.pkiSession.isValid,
    };
  }
}

export const BLEManager = new BLEManagerClass();
