import AsyncStorage from '@react-native-async-storage/async-storage';
import { 
  Certificate, 
  UserCertificate, 
  VehicleCertificate, 
  RootCACertificate,
  CertificateRequest,
  CertificateValidationResult 
} from '@/types';
import { ECCKeyManager } from './ECCKeyManager';
import { AuthService } from '@/services/api';
import axios from 'axios';
import { API_BASE_URL } from '@/utils/constants';

export class CertificateService {
  private static readonly ROOT_CA_STORAGE_KEY = 'root_ca_certificate';
  private static readonly USER_CERT_STORAGE_KEY = 'user_certificate';
  private static readonly VEHICLE_CERTS_STORAGE_KEY = 'vehicle_certificates';
  private static readonly CERT_CACHE_DURATION = 24 * 60 * 60 * 1000; // 24 hours

  static async initializePKI(): Promise<void> {
    try {
      console.log('Initializing PKI system...');
      
      // Check if keys exist, generate if not
      const hasKeys = await ECCKeyManager.hasValidKeyPair();
      if (!hasKeys) {
        console.log('Generating new ECC key pair...');
        const keyPair = await ECCKeyManager.generateKeyPair();
        await ECCKeyManager.storeKeyPair(keyPair);
      }

      // Try to download Root CA, but don't fail if server is unavailable
      try {
        await this.ensureRootCA();
        console.log('PKI system initialized with Root CA');
      } catch (error) {
        console.warn('Root CA unavailable, continuing in offline mode:', error.message);
      }
      
      console.log('PKI system initialized successfully');
    } catch (error) {
      console.error('PKI initialization failed:', error);
      throw new Error('PKI initialization failed');
    }
  }

  static async getRootCACertificate(): Promise<RootCACertificate> {
    try {
      const response = await axios.get(`${API_BASE_URL}/certificates/root-ca/public-key`, {
        timeout: 10000
      });

      if (!response.data || !response.data.certificate) {
        throw new Error('Invalid Root CA response');
      }

      const rootCA: RootCACertificate = {
        id: response.data.certificate.id,
        subject: response.data.certificate.subject,
        issuer: response.data.certificate.issuer,
        publicKey: response.data.certificate.publicKey,
        signature: response.data.certificate.signature,
        notBefore: new Date(response.data.certificate.notBefore),
        notAfter: new Date(response.data.certificate.notAfter),
        serialNumber: response.data.certificate.serialNumber,
        version: response.data.certificate.version,
        isRootCA: true
      };

      // Cache Root CA
      await AsyncStorage.setItem(
        this.ROOT_CA_STORAGE_KEY, 
        JSON.stringify({
          certificate: rootCA,
          cachedAt: Date.now()
        })
      );

      return rootCA;
    } catch (error) {
      console.error('Failed to get Root CA certificate:', error);
      throw new Error('Root CA download failed');
    }
  }

  static async ensureRootCA(): Promise<RootCACertificate> {
    try {
      // Check cache first
      const cached = await AsyncStorage.getItem(this.ROOT_CA_STORAGE_KEY);
      if (cached) {
        const { certificate, cachedAt } = JSON.parse(cached);
        const age = Date.now() - cachedAt;
        
        if (age < this.CERT_CACHE_DURATION) {
          return certificate;
        }
      }

      // Download fresh Root CA
      return await this.getRootCACertificate();
    } catch (error) {
      console.error('Failed to ensure Root CA:', error);
      throw error;
    }
  }

  static async requestUserCertificate(
    vehicleId: number, 
    permissions: CertificateRequest['permissions']
  ): Promise<UserCertificate> {
    try {
      const publicKey = await ECCKeyManager.getPublicKey();
      if (!publicKey) {
        throw new Error('No public key available');
      }

      const request: CertificateRequest = {
        vehicleId,
        publicKey,
        permissions
      };

      const response = await axios.post(
        `${API_BASE_URL}/certificates/digital-key`,
        request,
        {
          headers: {
            'Authorization': `Bearer ${await this.getAuthToken()}`,
            'Content-Type': 'application/json'
          },
          timeout: 15000
        }
      );

      if (!response.data || !response.data.certificate) {
        throw new Error('Invalid certificate response');
      }

      const certificate: UserCertificate = {
        ...response.data.certificate,
        notBefore: new Date(response.data.certificate.notBefore),
        notAfter: new Date(response.data.certificate.notAfter),
      };

      // Store certificate
      await this.storeUserCertificate(certificate);

      return certificate;
    } catch (error) {
      console.error('Failed to request user certificate:', error);
      throw new Error('Certificate request failed');
    }
  }

  static async storeUserCertificate(certificate: UserCertificate): Promise<void> {
    try {
      await AsyncStorage.setItem(
        `${this.USER_CERT_STORAGE_KEY}_${certificate.vehicleId}`,
        JSON.stringify({
          certificate,
          storedAt: Date.now()
        })
      );
    } catch (error) {
      console.error('Failed to store user certificate:', error);
      throw error;
    }
  }

  static async getUserCertificate(vehicleId: number): Promise<UserCertificate | null> {
    try {
      const stored = await AsyncStorage.getItem(`${this.USER_CERT_STORAGE_KEY}_${vehicleId}`);
      if (!stored) {
        return null;
      }

      const { certificate } = JSON.parse(stored);
      
      // Check expiration
      const now = new Date();
      const expiryDate = new Date(certificate.notAfter);
      
      if (now >= expiryDate) {
        console.log('User certificate expired, removing...');
        await AsyncStorage.removeItem(`${this.USER_CERT_STORAGE_KEY}_${vehicleId}`);
        return null;
      }

      return {
        ...certificate,
        notBefore: new Date(certificate.notBefore),
        notAfter: new Date(certificate.notAfter)
      };
    } catch (error) {
      console.error('Failed to get user certificate:', error);
      return null;
    }
  }

  static async verifyCertificate(certificate: Certificate): Promise<CertificateValidationResult> {
    try {
      const response = await axios.post(
        `${API_BASE_URL}/certificates/verify`,
        { certificate },
        {
          headers: {
            'Content-Type': 'application/json'
          },
          timeout: 5000
        }
      );

      const result: CertificateValidationResult = {
        isValid: response.data.isValid,
        certificate: response.data.certificate,
        error: response.data.error,
        expiresAt: response.data.expiresAt ? new Date(response.data.expiresAt) : undefined
      };

      return result;
    } catch (error) {
      console.error('Certificate verification failed:', error);
      return {
        isValid: false,
        error: 'Verification request failed'
      };
    }
  }

  static async verifyVehicleCertificate(vehicleCert: VehicleCertificate): Promise<boolean> {
    try {
      const rootCA = await this.ensureRootCA();
      
      // Verify certificate signature with Root CA
      const isSignatureValid = ECCKeyManager.verifySignature(
        this.getCertificateSigningData(vehicleCert),
        vehicleCert.signature,
        rootCA.publicKey
      );

      if (!isSignatureValid) {
        console.error('Vehicle certificate signature invalid');
        return false;
      }

      // Check expiration
      const now = new Date();
      if (now < vehicleCert.notBefore || now > vehicleCert.notAfter) {
        console.error('Vehicle certificate expired or not yet valid');
        return false;
      }

      return true;
    } catch (error) {
      console.error('Vehicle certificate verification failed:', error);
      return false;
    }
  }

  static async ensureUserCertificate(
    vehicleId: number,
    permissions: CertificateRequest['permissions']
  ): Promise<UserCertificate> {
    // Check if valid certificate exists
    let certificate = await this.getUserCertificate(vehicleId);
    
    if (!certificate) {
      console.log('No user certificate found, requesting new one...');
      certificate = await this.requestUserCertificate(vehicleId, permissions);
    }

    return certificate;
  }

  static parseCertificate(certData: string): Certificate {
    try {
      // Simple parsing - in production, use proper ASN.1 parsing
      const parsed = JSON.parse(certData);
      
      return {
        id: parsed.id,
        subject: parsed.subject,
        issuer: parsed.issuer,
        publicKey: parsed.publicKey,
        signature: parsed.signature,
        notBefore: new Date(parsed.notBefore),
        notAfter: new Date(parsed.notAfter),
        serialNumber: parsed.serialNumber,
        version: parsed.version
      };
    } catch (error) {
      console.error('Certificate parsing failed:', error);
      throw new Error('Invalid certificate format');
    }
  }

  private static getCertificateSigningData(cert: Certificate): string {
    return JSON.stringify({
      subject: cert.subject,
      publicKey: cert.publicKey,
      notBefore: cert.notBefore.toISOString(),
      notAfter: cert.notAfter.toISOString(),
      serialNumber: cert.serialNumber
    });
  }

  private static async getAuthToken(): Promise<string> {
    // This should integrate with your auth system
    try {
      const credentials = await AuthService.getProfile(''); // Get from stored token
      return ''; // Return actual token
    } catch (error) {
      throw new Error('Authentication required');
    }
  }

  static async clearAllCertificates(): Promise<void> {
    try {
      const keys = await AsyncStorage.getAllKeys();
      const certKeys = keys.filter(key => 
        key.includes(this.ROOT_CA_STORAGE_KEY) ||
        key.includes(this.USER_CERT_STORAGE_KEY) ||
        key.includes(this.VEHICLE_CERTS_STORAGE_KEY)
      );
      
      await AsyncStorage.multiRemove(certKeys);
      console.log('All certificates cleared');
    } catch (error) {
      console.error('Failed to clear certificates:', error);
      throw error;
    }
  }
}