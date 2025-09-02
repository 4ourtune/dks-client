import { 
  PKICommandPacket, 
  PKIResponsePacket, 
  VehicleCertificate,
  PKISession,
  UserCertificate 
} from '@/types';
import { CryptoService } from './CryptoService';
import { CertificateService } from '@/services/crypto/CertificateService';
import { ECCKeyManager } from '@/services/crypto/ECCKeyManager';

export class PKIProtocolHandler {
  private static readonly PROTOCOL_VERSION = '2.0-PKI';
  private static readonly MAX_PACKET_SIZE = 4096; // Increased for certificates
  private static readonly CHUNK_SIZE = 512; // BLE chunk size

  static async establishSecureConnection(
    vehicleId: string,
    vehicleCertData: string
  ): Promise<PKISession> {
    try {
      console.log('Starting PKI secure connection establishment...');
      
      // Step 1: Parse and verify vehicle certificate
      const vehicleCert = await this.parseVehicleCertificate(vehicleCertData);
      const isCertValid = await CertificateService.verifyVehicleCertificate(vehicleCert);
      
      if (!isCertValid) {
        throw new Error('Vehicle certificate verification failed');
      }

      // Step 2: Establish ECDH session
      const session = await CryptoService.establishSecureSession(
        vehicleId,
        vehicleCert.publicKey
      );

      console.log('PKI secure connection established successfully');
      return session;
    } catch (error) {
      console.error('PKI connection establishment failed:', error);
      throw error;
    }
  }

  static async createSecureCommand(
    command: 'UNLOCK' | 'LOCK' | 'START' | 'STOP' | 'STATUS' | 'TRUNK',
    vehicleId: number,
    session: PKISession
  ): Promise<string[]> {
    try {
      const pkiCommand = await CryptoService.createPKICommand(command, vehicleId, session);
      
      // Serialize and chunk the command
      const serialized = this.serializePKICommand(pkiCommand);
      const chunks = this.chunkData(serialized);
      
      return chunks;
    } catch (error) {
      console.error('Failed to create secure command:', error);
      throw error;
    }
  }

  static async processSecureResponse(
    responseChunks: string[],
    session: PKISession,
    vehiclePublicKey: string
  ): Promise<any> {
    try {
      // Reconstruct response from chunks
      const fullResponse = this.reconstructFromChunks(responseChunks);
      const pkiResponse = this.deserializePKIResponse(fullResponse);
      
      // Verify and decrypt response
      const decryptedData = await CryptoService.verifyPKIResponse(
        pkiResponse,
        session,
        vehiclePublicKey
      );

      return decryptedData;
    } catch (error) {
      console.error('Failed to process secure response:', error);
      throw error;
    }
  }

  static serializePKICommand(command: PKICommandPacket): string {
    try {
      const packet = {
        version: this.PROTOCOL_VERSION,
        type: 'pki_command',
        ...command
      };

      const serialized = JSON.stringify(packet);
      
      if (serialized.length > this.MAX_PACKET_SIZE) {
        throw new Error('PKI command packet too large');
      }

      return serialized;
    } catch (error) {
      console.error('PKI command serialization failed:', error);
      throw error;
    }
  }

  static deserializePKIResponse(data: string): PKIResponsePacket {
    try {
      const parsed = JSON.parse(data);
      
      if (parsed.version !== this.PROTOCOL_VERSION) {
        console.warn('Protocol version mismatch:', parsed.version);
      }

      if (parsed.type !== 'pki_response') {
        throw new Error('Invalid response type');
      }

      return {
        success: Boolean(parsed.success),
        sessionId: parsed.sessionId,
        encryptedPayload: parsed.encryptedPayload,
        timestamp: Number(parsed.timestamp),
        signature: parsed.signature,
        error: parsed.error
      };
    } catch (error) {
      console.error('PKI response deserialization failed:', error);
      throw error;
    }
  }

  static chunkData(data: string): string[] {
    const chunks: string[] = [];
    const totalChunks = Math.ceil(data.length / this.CHUNK_SIZE);
    
    for (let i = 0; i < totalChunks; i++) {
      const start = i * this.CHUNK_SIZE;
      const end = Math.min(start + this.CHUNK_SIZE, data.length);
      const chunk = data.substring(start, end);
      
      const chunkPacket = {
        index: i,
        total: totalChunks,
        data: chunk,
        checksum: this.calculateChecksum(chunk)
      };
      
      chunks.push(JSON.stringify(chunkPacket));
    }
    
    return chunks;
  }

  static reconstructFromChunks(chunks: string[]): string {
    try {
      const parsedChunks = chunks.map(chunk => JSON.parse(chunk));
      
      // Validate chunks
      const totalChunks = parsedChunks[0]?.total;
      if (parsedChunks.length !== totalChunks) {
        throw new Error('Missing chunks');
      }

      // Sort by index
      parsedChunks.sort((a, b) => a.index - b.index);

      // Verify checksums and reconstruct
      let reconstructed = '';
      for (const chunk of parsedChunks) {
        const calculatedChecksum = this.calculateChecksum(chunk.data);
        if (calculatedChecksum !== chunk.checksum) {
          throw new Error(`Chunk ${chunk.index} checksum mismatch`);
        }
        reconstructed += chunk.data;
      }

      return reconstructed;
    } catch (error) {
      console.error('Failed to reconstruct from chunks:', error);
      throw error;
    }
  }

  static async parseVehicleCertificate(certData: string): Promise<VehicleCertificate> {
    try {
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
        version: parsed.version,
        vehicleId: parsed.vehicleId,
        deviceId: parsed.deviceId,
        capabilities: parsed.capabilities || []
      };
    } catch (error) {
      console.error('Vehicle certificate parsing failed:', error);
      throw new Error('Invalid vehicle certificate format');
    }
  }

  static createHandshakePacket(userPublicKey: string): string {
    const handshake = {
      version: this.PROTOCOL_VERSION,
      type: 'handshake',
      userPublicKey,
      timestamp: Date.now(),
      nonce: ECCKeyManager.generateNonce()
    };

    return JSON.stringify(handshake);
  }

  static processHandshakeResponse(responseData: string): {
    vehiclePublicKey: string;
    vehicleNonce: string;
    success: boolean;
  } {
    try {
      const parsed = JSON.parse(responseData);
      
      return {
        vehiclePublicKey: parsed.vehiclePublicKey,
        vehicleNonce: parsed.vehicleNonce,
        success: Boolean(parsed.success)
      };
    } catch (error) {
      console.error('Handshake response processing failed:', error);
      throw error;
    }
  }

  static createCertificateExchangePacket(userCert: UserCertificate): string {
    const exchange = {
      version: this.PROTOCOL_VERSION,
      type: 'cert_exchange',
      certificate: userCert,
      timestamp: Date.now()
    };

    return JSON.stringify(exchange);
  }

  static validateResponseTiming(timestamp: number, maxDelayMs: number = 30000): boolean {
    const age = Date.now() - timestamp;
    return age >= 0 && age <= maxDelayMs;
  }

  static createErrorResponse(error: string): PKIResponsePacket {
    return {
      success: false,
      sessionId: '',
      encryptedPayload: '',
      timestamp: Date.now(),
      signature: '',
      error
    };
  }

  private static calculateChecksum(data: string): string {
    let checksum = 0;
    for (let i = 0; i < data.length; i++) {
      checksum = ((checksum << 5) - checksum + data.charCodeAt(i)) & 0xffffffff;
    }
    return checksum.toString(16);
  }

  static logSecureCommand(command: PKICommandPacket, response?: PKIResponsePacket) {
    const logEntry = {
      timestamp: new Date().toISOString(),
      sessionId: command.sessionId,
      certificateId: command.certificate.id,
      vehicleId: command.certificate.vehicleId,
      success: response?.success || false,
      error: response?.error,
      responseTime: response ? response.timestamp - command.timestamp : null,
      encryptionUsed: true,
      protocolVersion: this.PROTOCOL_VERSION
    };

    console.log('PKI BLE Command Log:', logEntry);
  }
}