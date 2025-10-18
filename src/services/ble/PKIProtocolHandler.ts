import {
  PKICommandPacket,
  PKIResponsePacket,
  VehicleCertificate,
  PKISession,
  UserCertificate,
} from "@/types";
import { Buffer } from "buffer";
import { CryptoService } from "./CryptoService";
import { CertificateService } from "@/services/crypto/CertificateService";
import { ECCKeyManager } from "@/services/crypto/ECCKeyManager";

export class PKIProtocolHandler {
  static readonly PROTOCOL_VERSION = "2.0-PKI";
  private static readonly MAX_PACKET_SIZE = 4096; // Increased for certificates
  private static readonly CHUNK_SIZE = 512; // BLE chunk size

  static async establishSecureConnection(
    vehicleId: string,
    vehicleCertData: string,
  ): Promise<PKISession> {
    try {
      console.log("Starting PKI secure connection establishment...");

      // Step 1: Parse and verify vehicle certificate
      const vehicleCert = await this.parseVehicleCertificate(vehicleCertData);
      const isCertValid = await CertificateService.verifyVehicleCertificate(vehicleCert);

      if (!isCertValid) {
        throw new Error("Vehicle certificate verification failed");
      }

      // Step 2: Establish ECDH session
      const session = await CryptoService.establishSecureSession(vehicleId, vehicleCert.publicKey);

      console.log("PKI secure connection established successfully");
      return session;
    } catch (error) {
      console.error("PKI connection establishment failed:", error);
      throw error;
    }
  }

  static async createSecureCommand(
    command: "UNLOCK" | "LOCK" | "START" | "STOP" | "STATUS" | "TRUNK",
    vehicleId: number,
    session: PKISession,
    options: { maxPayloadBytes?: number } = {},
  ): Promise<{ command: PKICommandPacket; chunks: string[] }> {
    try {
      const pkiCommand = await CryptoService.createPKICommand(command, vehicleId, session);

      // Serialize and chunk the command
      const serialized = this.serializePKICommand(pkiCommand);
      const chunks = this.chunkData(serialized, options.maxPayloadBytes);

      return {
        command: pkiCommand,
        chunks,
      };
    } catch (error) {
      console.error("Failed to create secure command:", error);
      throw error;
    }
  }

  static async processSecureResponse(
    responseChunks: string[],
    session: PKISession,
    vehiclePublicKey: string,
  ): Promise<any> {
    try {
      // Reconstruct response from chunks
      const fullResponse = this.reconstructFromChunks(responseChunks);
      const pkiResponse = this.deserializePKIResponse(fullResponse);

      // Verify and decrypt response
      const decryptedData = await CryptoService.verifyPKIResponse(
        pkiResponse,
        session,
        vehiclePublicKey,
      );

      return decryptedData;
    } catch (error) {
      console.error("Failed to process secure response:", error);
      throw error;
    }
  }

  static serializePKICommand(command: PKICommandPacket): string {
    try {
      const packet = {
        version: this.PROTOCOL_VERSION,
        type: "pki_command",
        ...command,
      };

      const serialized = JSON.stringify(packet);

      if (serialized.length > this.MAX_PACKET_SIZE) {
        throw new Error("PKI command packet too large");
      }

      return serialized;
    } catch (error) {
      console.error("PKI command serialization failed:", error);
      throw error;
    }
  }

  static deserializePKIResponse(data: string): PKIResponsePacket {
    try {
      const parsed = JSON.parse(data);

      if (parsed.version !== this.PROTOCOL_VERSION) {
        console.warn("Protocol version mismatch:", parsed.version);
      }

      if (parsed.type !== "pki_response") {
        throw new Error("Invalid response type");
      }

      return {
        success: Boolean(parsed.success),
        sessionId: parsed.sessionId,
        encryptedPayload: parsed.encryptedPayload,
        timestamp: Number(parsed.timestamp),
        signature: parsed.signature,
        error: parsed.error,
      };
    } catch (error) {
      console.error("PKI response deserialization failed:", error);
      throw error;
    }
  }

  static chunkData(data: string, maxPayloadBytes?: number): string[] {
    const payloadBudget = Math.max(64, maxPayloadBytes ?? this.CHUNK_SIZE);
    const slices: string[] = [];

    let offset = 0;
    while (offset < data.length) {
      let step = Math.min(payloadBudget, data.length - offset);
      let slice = data.substring(offset, offset + step);

      const previewSize = (candidate: string): number => {
        const packetPreview = {
          index: slices.length,
          total: 0,
          data: candidate,
          checksum: this.calculateChecksum(candidate),
        };
        return Buffer.from(JSON.stringify(packetPreview), "utf8").length;
      };

      let packetBytes = previewSize(slice);
      while (packetBytes > payloadBudget && step > 16) {
        step = Math.max(16, Math.floor(step * 0.75));
        slice = data.substring(offset, offset + step);
        packetBytes = previewSize(slice);
      }

      if (packetBytes > payloadBudget) {
        throw new Error(
          `Unable to fit PKI chunk into BLE payload budget (required=${packetBytes}, budget=${payloadBudget})`,
        );
      }

      slices.push(slice);
      offset += slice.length;
    }

    const totalChunks = slices.length;
    return slices.map((slice, index) => {
      const chunkPacket = {
        index,
        total: totalChunks,
        data: slice,
        checksum: this.calculateChecksum(slice),
      };
      const packetSize = Buffer.from(JSON.stringify(chunkPacket), "utf8").length;
      if (packetSize > payloadBudget) {
        throw new Error(
          `PKI chunk ${index} exceeds BLE payload budget after final assembly (${packetSize} > ${payloadBudget})`,
        );
      }
      return JSON.stringify(chunkPacket);
    });
  }

  static reconstructFromChunks(chunks: string[]): string {
    try {
      const parsedChunks = chunks.map((chunk) => JSON.parse(chunk));

      // Validate chunks
      const totalChunks = parsedChunks[0]?.total;
      if (parsedChunks.length !== totalChunks) {
        throw new Error("Missing chunks");
      }

      // Sort by index
      parsedChunks.sort((a, b) => a.index - b.index);

      // Verify checksums and reconstruct
      let reconstructed = "";
      for (const chunk of parsedChunks) {
        const calculatedChecksum = this.calculateChecksum(chunk.data);
        if (calculatedChecksum !== chunk.checksum) {
          throw new Error(`Chunk ${chunk.index} checksum mismatch`);
        }
        reconstructed += chunk.data;
      }

      return reconstructed;
    } catch (error) {
      console.error("Failed to reconstruct from chunks:", error);
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
        capabilities: parsed.capabilities || [],
      };
    } catch (error) {
      console.error("Vehicle certificate parsing failed:", error);
      throw new Error("Invalid vehicle certificate format");
    }
  }

  static createHandshakePacket(userPublicKey: string): string {
    const handshake = {
      version: this.PROTOCOL_VERSION,
      type: "handshake",
      userPublicKey,
      timestamp: Date.now(),
      nonce: ECCKeyManager.generateNonce(),
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
        success: Boolean(parsed.success),
      };
    } catch (error) {
      console.error("Handshake response processing failed:", error);
      throw error;
    }
  }

  static createCertificateExchangePacket(userCert: UserCertificate): string {
    const exchange = {
      version: this.PROTOCOL_VERSION,
      type: "cert_exchange",
      certificate: userCert,
      timestamp: Date.now(),
    };

    return JSON.stringify(exchange);
  }

  static createSessionSeedPacket({
    sessionId,
    sessionKey,
    expiresAt,
    vehicleId,
    clientNonce,
    serverNonce,
  }: {
    sessionId: string;
    sessionKey: string;
    expiresAt: string;
    vehicleId?: number;
    clientNonce?: string;
    serverNonce?: string;
  }): string {
    const packet = {
      version: this.PROTOCOL_VERSION,
      type: "session_seed",
      session: {
        sessionId,
        sessionKey,
        expiresAt,
        vehicleId,
        clientNonce,
        serverNonce,
      },
      timestamp: Date.now(),
    };

    return JSON.stringify(packet);
  }

  static validateResponseTiming(timestamp: number, maxDelayMs: number = 30000): boolean {
    const age = Date.now() - timestamp;
    return age >= 0 && age <= maxDelayMs;
  }

  static createErrorResponse(error: string): PKIResponsePacket {
    return {
      success: false,
      sessionId: "",
      encryptedPayload: "",
      timestamp: Date.now(),
      signature: "",
      error,
    };
  }

  private static calculateChecksum(data: string): string {
    let checksum = 0;
    const modulo = 4294967296;
    for (let i = 0; i < data.length; i += 1) {
      checksum = (Math.imul(checksum, 31) + data.charCodeAt(i)) % modulo;
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
      protocolVersion: this.PROTOCOL_VERSION,
    };

    console.log("PKI BLE Command Log:", logEntry);
  }
}
