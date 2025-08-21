import { CommandPacket, ResponsePacket } from '@/types';

export class CommandEncoder {
  private static readonly PROTOCOL_VERSION = '1.0';
  private static readonly MAX_PACKET_SIZE = 1024;

  static encodeCommand(command: CommandPacket): string {
    try {
      const packet = {
        version: this.PROTOCOL_VERSION,
        ...command,
      };

      const encoded = JSON.stringify(packet);
      
      if (encoded.length > this.MAX_PACKET_SIZE) {
        throw new Error('Command packet too large');
      }

      return encoded;
    } catch (error) {
      throw new Error(`Failed to encode command: ${error}`);
    }
  }

  static decodeResponse(rawData: string): ResponsePacket {
    try {
      if (!rawData || rawData.trim().length === 0) {
        throw new Error('Empty response data');
      }

      const parsed = JSON.parse(rawData);
      
      if (!parsed.version || parsed.version !== this.PROTOCOL_VERSION) {
        console.warn('Protocol version mismatch:', parsed.version);
      }

      return {
        success: Boolean(parsed.success),
        command: String(parsed.command || ''),
        timestamp: Number(parsed.timestamp || Date.now()),
        data: parsed.data,
        error: parsed.error ? String(parsed.error) : undefined,
      };
    } catch (error) {
      throw new Error(`Failed to decode response: ${error}`);
    }
  }

  static createHeartbeatCommand(keyId: string): CommandPacket {
    return {
      timestamp: Date.now(),
      command: 'STATUS',
      keyId,
      signature: '',
    };
  }

  static validatePacketSize(data: string): boolean {
    return data.length <= this.MAX_PACKET_SIZE;
  }

  static compressCommand(command: CommandPacket): string {
    const compressed = {
      t: command.timestamp,
      c: this.getCommandCode(command.command),
      k: command.keyId,
      s: command.signature,
    };

    return JSON.stringify(compressed);
  }

  static decompressResponse(rawData: string): ResponsePacket {
    try {
      const parsed = JSON.parse(rawData);
      
      return {
        success: Boolean(parsed.ok || parsed.success),
        command: this.getCommandFromCode(parsed.c) || parsed.command,
        timestamp: Number(parsed.t || parsed.timestamp || Date.now()),
        data: parsed.d || parsed.data,
        error: parsed.e || parsed.error,
      };
    } catch (error) {
      throw new Error(`Failed to decompress response: ${error}`);
    }
  }

  private static getCommandCode(command: string): string {
    const codes: Record<string, string> = {
      'UNLOCK': 'U',
      'LOCK': 'L',
      'START': 'S',
      'STOP': 'T',
      'STATUS': 'Q',
      'TRUNK': 'R',
    };

    return codes[command] || command;
  }

  private static getCommandFromCode(code: string): string {
    const commands: Record<string, string> = {
      'U': 'UNLOCK',
      'L': 'LOCK',
      'S': 'START',
      'T': 'STOP',
      'Q': 'STATUS',
      'R': 'TRUNK',
    };

    return commands[code] || code;
  }

  static createBatchCommand(commands: CommandPacket[]): string {
    const batch = {
      version: this.PROTOCOL_VERSION,
      type: 'batch',
      commands: commands.map(cmd => ({
        t: cmd.timestamp,
        c: this.getCommandCode(cmd.command),
        k: cmd.keyId,
        s: cmd.signature,
      })),
    };

    const encoded = JSON.stringify(batch);
    
    if (encoded.length > this.MAX_PACKET_SIZE) {
      throw new Error('Batch command packet too large');
    }

    return encoded;
  }

  static parseBatchResponse(rawData: string): ResponsePacket[] {
    try {
      const parsed = JSON.parse(rawData);
      
      if (parsed.type !== 'batch' || !Array.isArray(parsed.responses)) {
        throw new Error('Invalid batch response format');
      }

      return parsed.responses.map((resp: any) => ({
        success: Boolean(resp.ok || resp.success),
        command: this.getCommandFromCode(resp.c) || resp.command,
        timestamp: Number(resp.t || resp.timestamp || Date.now()),
        data: resp.d || resp.data,
        error: resp.e || resp.error,
      }));
    } catch (error) {
      throw new Error(`Failed to parse batch response: ${error}`);
    }
  }
}