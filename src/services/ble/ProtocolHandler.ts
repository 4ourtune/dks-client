import { CommandPacket, ResponsePacket } from "@/types";
import { CryptoService } from "./CryptoService";

export class ProtocolHandler {
  static createCommandPacket(
    command: "UNLOCK" | "LOCK" | "START" | "STOP" | "STATUS" | "TRUNK",
    keyId: string,
  ): CommandPacket {
    const timestamp = Date.now();
    const commandData = {
      timestamp,
      command,
      keyId,
    };

    const signature = CryptoService.signCommand(commandData);

    return {
      timestamp,
      command,
      keyId,
      signature,
    };
  }

  static validateResponse(response: ResponsePacket, originalCommand: CommandPacket): boolean {
    if (!response || typeof response !== "object") {
      return false;
    }

    if (response.command !== originalCommand.command) {
      return false;
    }

    if (!response.timestamp || typeof response.timestamp !== "number") {
      return false;
    }

    const timeDiff = Math.abs(Date.now() - response.timestamp);
    if (timeDiff > 30000) {
      return false;
    }

    return true;
  }

  static isCommandExpired(command: CommandPacket, maxAgeMs: number = 30000): boolean {
    const age = Date.now() - command.timestamp;
    return age > maxAgeMs;
  }

  static sanitizeCommand(command: CommandPacket): CommandPacket {
    return {
      timestamp: command.timestamp,
      command: command.command,
      keyId: command.keyId,
      signature: command.signature,
    };
  }

  static parseResponse(rawData: string): ResponsePacket {
    try {
      const parsed = JSON.parse(rawData);

      if (!parsed || typeof parsed !== "object") {
        throw new Error("Invalid response format");
      }

      return {
        success: Boolean(parsed.success),
        command: String(parsed.command || ""),
        timestamp: Number(parsed.timestamp || Date.now()),
        data: parsed.data,
        error: parsed.error ? String(parsed.error) : undefined,
      };
    } catch (error) {
      throw new Error(`Failed to parse response: ${error}`);
    }
  }

  static createErrorResponse(command: string, error: string): ResponsePacket {
    return {
      success: false,
      command,
      timestamp: Date.now(),
      error,
    };
  }

  static logCommand(command: CommandPacket, response?: ResponsePacket) {
    const logEntry = {
      timestamp: new Date().toISOString(),
      command: command.command,
      keyId: command.keyId,
      success: response?.success || false,
      error: response?.error,
      responseTime: response ? response.timestamp - command.timestamp : null,
    };

    console.log("BLE Command Log:", logEntry);
  }
}
