import { AppState, AppStateStatus } from 'react-native';
import AsyncStorage from '@react-native-async-storage/async-storage';
import { CertificateService } from '@/services/crypto/CertificateService';
import { ECCKeyManager } from '@/services/crypto/ECCKeyManager';
import { BLEManager } from '@/services/ble/BLEManager';
import { CryptoService } from '@/services/ble/CryptoService';

export class BackgroundOptimizer {
  private static instance: BackgroundOptimizer;
  private appState: AppStateStatus = 'active';
  private backgroundTasks: Map<string, NodeJS.Timeout> = new Map();
  private isInitialized = false;

  private constructor() {}

  static getInstance(): BackgroundOptimizer {
    if (!BackgroundOptimizer.instance) {
      BackgroundOptimizer.instance = new BackgroundOptimizer();
    }
    return BackgroundOptimizer.instance;
  }

  async initialize(): Promise<void> {
    if (this.isInitialized) {
      return;
    }

    try {
      console.log('Initializing background optimizer...');
      
      // Listen to app state changes
      AppState.addEventListener('change', this.handleAppStateChange.bind(this));
      this.appState = AppState.currentState;

      // Initialize PKI system proactively
      await this.initializePKIBackground();

      // Schedule certificate validation
      this.scheduleCertificateValidation();

      // Schedule session cleanup
      this.scheduleSessionCleanup();

      // Preload ECC keys
      await this.preloadCryptoKeys();

      this.isInitialized = true;
      console.log('Background optimizer initialized successfully');
    } catch (error) {
      console.error('Background optimizer initialization failed:', error);
      throw error;
    }
  }

  private handleAppStateChange(nextAppState: AppStateStatus): void {
    const previousState = this.appState;
    this.appState = nextAppState;

    console.log('App state changed:', previousState, '->', nextAppState);

    if (nextAppState === 'active') {
      this.onAppBecameActive();
    } else if (nextAppState === 'background') {
      this.onAppWentToBackground();
    }
  }

  private async onAppBecameActive(): Promise<void> {
    try {
      console.log('App became active - running foreground optimizations...');

      // Validate certificates immediately
      await this.validateCertificatesNow();

      // Resume BLE scanning if needed
      this.resumeBLEOperations();

      // Clear expired sessions
      this.cleanupExpiredSessions();

      // Refresh crypto state
      await this.refreshCryptoState();

    } catch (error) {
      console.error('Foreground optimization failed:', error);
    }
  }

  private async onAppWentToBackground(): Promise<void> {
    try {
      console.log('App went to background - running background optimizations...');

      // Maintain BLE connections for a short time
      this.maintainBLEConnections();

      // Save current state
      await this.saveOptimizationState();

      // Schedule background certificate refresh
      this.scheduleBackgroundCertRefresh();

    } catch (error) {
      console.error('Background optimization failed:', error);
    }
  }

  private async initializePKIBackground(): Promise<void> {
    try {
      console.log('Initializing PKI in background...');
      
      // Check if PKI is already initialized
      const hasKeys = await ECCKeyManager.hasValidKeyPair();
      
      if (!hasKeys) {
        console.log('Generating ECC keys proactively...');
        const keyPair = await ECCKeyManager.generateKeyPair();
        await ECCKeyManager.storeKeyPair(keyPair);
        console.log('ECC keys generated and stored');
      }

      // Initialize certificate service
      await CertificateService.initializePKI();
      
      console.log('PKI background initialization completed');
    } catch (error) {
      console.error('PKI background initialization failed:', error);
      // Don't throw - this is a background operation
    }
  }

  private scheduleCertificateValidation(): void {
    // Validate certificates every 30 minutes
    const interval = setInterval(() => {
      this.validateCertificatesBackground();
    }, 30 * 60 * 1000);

    this.backgroundTasks.set('certificate_validation', interval);
  }

  private scheduleSessionCleanup(): void {
    // Clean up expired sessions every 10 minutes
    const interval = setInterval(() => {
      this.cleanupExpiredSessions();
    }, 10 * 60 * 1000);

    this.backgroundTasks.set('session_cleanup', interval);
  }

  private async preloadCryptoKeys(): Promise<void> {
    try {
      // Preload ECC keys into memory for faster access
      const keyPair = await ECCKeyManager.getKeyPair();
      
      if (keyPair) {
        console.log('ECC keys preloaded into memory');
      }
    } catch (error) {
      console.error('Failed to preload crypto keys:', error);
    }
  }

  private async validateCertificatesBackground(): Promise<void> {
    try {
      console.log('Running background certificate validation...');
      
      // Get all stored certificates and check expiration
      const vehicles = await this.getStoredVehicleIds();
      
      for (const vehicleId of vehicles) {
        const certificate = await CertificateService.getUserCertificate(vehicleId);
        
        if (certificate) {
          const now = new Date();
          const expiresIn = certificate.notAfter.getTime() - now.getTime();
          const daysUntilExpiry = expiresIn / (1000 * 60 * 60 * 24);
          
          // Renew certificates that expire within 7 days
          if (daysUntilExpiry < 7 && daysUntilExpiry > 0) {
            console.log(`Certificate for vehicle ${vehicleId} expires soon, scheduling renewal...`);
            await this.scheduleRenewal(vehicleId, certificate);
          }
        }
      }
    } catch (error) {
      console.error('Background certificate validation failed:', error);
    }
  }

  private async validateCertificatesNow(): Promise<void> {
    try {
      console.log('Running immediate certificate validation...');
      
      const vehicles = await this.getStoredVehicleIds();
      
      for (const vehicleId of vehicles) {
        const certificate = await CertificateService.getUserCertificate(vehicleId);
        
        if (!certificate) {
          console.log(`No certificate found for vehicle ${vehicleId}`);
          continue;
        }

        // Check if certificate is still valid
        const validation = await CertificateService.verifyCertificate(certificate);
        
        if (!validation.isValid) {
          console.warn(`Invalid certificate for vehicle ${vehicleId}:`, validation.error);
        }
      }
    } catch (error) {
      console.error('Immediate certificate validation failed:', error);
    }
  }

  private cleanupExpiredSessions(): void {
    try {
      console.log('Cleaning up expired sessions...');
      
      const activeSessions = CryptoService.getActiveSessions();
      console.log(`Found ${activeSessions.length} active sessions`);
      
      // The getActiveSessions method already removes expired sessions
      // This is mainly for logging purposes
    } catch (error) {
      console.error('Session cleanup failed:', error);
    }
  }

  private async refreshCryptoState(): Promise<void> {
    try {
      console.log('Refreshing crypto state...');
      
      // Validate key pair integrity
      const hasValidKeys = await ECCKeyManager.hasValidKeyPair();
      
      if (!hasValidKeys) {
        console.warn('Invalid key pair detected, regenerating...');
        const newKeyPair = await ECCKeyManager.generateKeyPair();
        await ECCKeyManager.storeKeyPair(newKeyPair);
      }
    } catch (error) {
      console.error('Crypto state refresh failed:', error);
    }
  }

  private resumeBLEOperations(): void {
    try {
      console.log('Resuming BLE operations...');
      
      if (BLEManager.isConnected() && BLEManager.isPKIEnabled()) {
        const sessionInfo = BLEManager.getPKISessionInfo();
        
        if (!sessionInfo.isValid) {
          console.log('PKI session expired, will need to re-establish');
        }
      }
    } catch (error) {
      console.error('Failed to resume BLE operations:', error);
    }
  }

  private maintainBLEConnections(): void {
    try {
      console.log('Maintaining BLE connections in background...');
      
      if (BLEManager.isConnected()) {
        // Keep connection alive for 5 minutes
        setTimeout(() => {
          if (this.appState === 'background') {
            console.log('Disconnecting BLE due to background timeout');
            BLEManager.disconnect();
          }
        }, 5 * 60 * 1000);
      }
    } catch (error) {
      console.error('Failed to maintain BLE connections:', error);
    }
  }

  private async saveOptimizationState(): Promise<void> {
    try {
      const state = {
        lastOptimization: Date.now(),
        activeSessions: CryptoService.getActiveSessions().length,
        pkiEnabled: BLEManager.isPKIEnabled(),
        hasBLEConnection: BLEManager.isConnected()
      };

      await AsyncStorage.setItem('optimization_state', JSON.stringify(state));
    } catch (error) {
      console.error('Failed to save optimization state:', error);
    }
  }

  private scheduleBackgroundCertRefresh(): void {
    // Schedule certificate refresh for 6 hours later
    const timeout = setTimeout(async () => {
      if (this.appState === 'background') {
        await this.validateCertificatesBackground();
      }
    }, 6 * 60 * 60 * 1000);

    this.backgroundTasks.set('bg_cert_refresh', timeout);
  }

  private async scheduleRenewal(vehicleId: number, certificate: any): Promise<void> {
    try {
      console.log(`Scheduling certificate renewal for vehicle ${vehicleId}`);
      
      // This would typically involve API calls to renew the certificate
      // For now, just log the intent
      const renewalInfo = {
        vehicleId,
        certificateId: certificate.id,
        expiresAt: certificate.notAfter,
        scheduledAt: new Date()
      };

      await AsyncStorage.setItem(
        `renewal_${vehicleId}`, 
        JSON.stringify(renewalInfo)
      );
    } catch (error) {
      console.error('Failed to schedule renewal:', error);
    }
  }

  private async getStoredVehicleIds(): Promise<number[]> {
    try {
      const keys = await AsyncStorage.getAllKeys();
      const vehicleKeys = keys.filter(key => key.startsWith('user_certificate_'));
      
      return vehicleKeys
        .map(key => key.replace('user_certificate_', ''))
        .map(id => parseInt(id, 10))
        .filter(id => !isNaN(id));
    } catch (error) {
      console.error('Failed to get stored vehicle IDs:', error);
      return [];
    }
  }

  // Public methods for manual optimization

  async optimizeNow(): Promise<void> {
    console.log('Running manual optimization...');
    
    await Promise.all([
      this.validateCertificatesNow(),
      this.refreshCryptoState(),
      this.cleanupExpiredSessions()
    ]);
    
    console.log('Manual optimization completed');
  }

  async forceReinitialize(): Promise<void> {
    console.log('Force reinitializing PKI system...');
    
    // Clear all sessions
    CryptoService.clearAllSessions();
    
    // Reinitialize PKI
    await this.initializePKIBackground();
    
    console.log('PKI system reinitialized');
  }

  getOptimizationStatus(): {
    isInitialized: boolean;
    backgroundTasksCount: number;
    appState: AppStateStatus;
  } {
    return {
      isInitialized: this.isInitialized,
      backgroundTasksCount: this.backgroundTasks.size,
      appState: this.appState
    };
  }

  // Cleanup method
  dispose(): void {
    console.log('Disposing background optimizer...');
    
    // Clear all background tasks
    this.backgroundTasks.forEach((task) => {
      clearInterval(task);
      clearTimeout(task);
    });
    this.backgroundTasks.clear();

    // Remove app state listener
    AppState.removeEventListener('change', this.handleAppStateChange.bind(this));
    
    this.isInitialized = false;
  }
}

// Export singleton instance
export const backgroundOptimizer = BackgroundOptimizer.getInstance();