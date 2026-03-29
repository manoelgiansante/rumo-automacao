// ============================================
// Protocol Definitions & Utilities
// Rumo Automacao - Hardware Communication Layer
// ============================================
// SMA, Intermec BRI, Triunfo, CentralGA protocols
// CRC-16 checksum, response parsers, command builders
// ============================================

import type { ScaleResponse, SMAStatusChar, TagReading, AntenaSide } from './types';

// ============================================
// Scale Error Types
// ============================================

export enum ScaleErrorType {
  TARE_ERROR = 'tare_error',
  RAM_ROM_ERROR = 'ram_rom_error',
  EEPROM_ERROR = 'eeprom_error',
  COMMUNICATION_ERROR = 'communication_error',
  CALIBRATION_ERROR = 'calibration_error',
  INITIAL_ZERO_ERROR = 'initial_zero_error',
  MANUFACTURER_ERROR = 'manufacturer_error',
  UNRECOGNIZED_COMMAND = 'unrecognized_command',
}

// ============================================
// Weight Scale Information
// ============================================

export interface WeightScaleInformation {
  fundoEscala: number;      // full scale
  numSerie: string;         // serial number
  manufacturer: string;
  model: string;
  decimalPointPosition: number;
  resolution: number;
  totalCapacity: number;
}

// ============================================
// SMA Protocol Constants
// Based on CR1_TGT Communication.dll - ProtocolSMA1
// Encoding: ISO-8859-1, Terminator: CR/LF
// ============================================

export const SMA_COMMANDS = {
  /** Read current weight (gross) */
  PESO: '\nW',
  /** Read stable weight only (returns when stable) */
  PESO_ESTAVEL: '\nP',
  /** Zero scale */
  ZERO: '\nZ',
  /** Tare (capture current weight as tare) */
  TARA: '\nT',
  /** Clear tare (reset tare to 0) */
  LIMPAR_TARA: '\nTC',
  /** Net weight */
  PESO_LIQUIDO: '\nN',
  /** Start continuous weight reading */
  CONTINUO: '\nR',
  /** Stop continuous reading */
  PARAR_CONTINUO: '\nS',
  /** High resolution weight */
  ALTA_RESOLUCAO: '\nH',
  /** Scale info/status */
  STATUS: '\nI',
  /** Firmware version */
  VERSAO: '\nV',
  /** Set specific tare weight value */
  SET_TARA_VALUE: (value: number) => `\nT${value}`,
  /** Return current tare weight */
  RETURN_TARE: '\nTA',
  /** Gross weight (normal resolution) */
  GROSS_WEIGHT: '\nG',
} as const;

/** SMA Extended commands (model-specific) */
export const SMA_EXTENDED_COMMANDS = {
  /** Auto-zero enable/disable */
  AUTO_ZERO: '\nXA',
  /** Read calibration data */
  CALIB_DATA: '\nXc',
  /** Set filter level */
  FILTRO: '\nXf',
  /** Set motion threshold */
  MOTION_THRESHOLD: '\nXm',
  /** Print formatted weight */
  PRINT: '\nXp',
  /** Read scale parameters */
  PARAMETROS: '\nXr',
  /** Set scale unit */
  UNIDADE: '\nXu',
  /** Disable auto-zero */
  AUTO_ZERO_OFF: '\nXa',
  /** Get current auto-zero value */
  GET_AUTO_ZERO_VALUE: '\nXv',
  /** Get sensor name */
  GET_SENSOR_NAME: '\nXn',
  /** Set calibration data (6 parameters) */
  SET_CALIB_DATA: (p1: string, p2: string, p3: string, p4: string, p5: string, p6: string) =>
    `\nXC:${p1}:${p2}:${p3}:${p4}:${p5}:${p6}`,
  /** Calibrate scale (3 parameters) */
  CALIBRAR: (p1: string, p2: string, p3: string) => `\nXR:${p1}:${p2}:${p3}`,
  /** Set memory value */
  SET_MEMORY: (p1: string, p2: string) => `\nXM:${p1}:${p2}`,
  /** Set serial number */
  SET_SERIAL_NUMBER: (p1: string, p2: string, p3: string) => `\nXS:${p1}:${p2}:${p3}`,
  /** Set sensor name */
  SET_SENSOR_NAME: (p1: string, p2: string) => `\nXN:${p1}:${p2}`,
  /** Set license key */
  SET_LICENSE_KEY: (p1: string, p2: string) => `\nXL:${p1}:${p2}`,
  /** Write value */
  WRITE_VALUE: (value: string) => `\nXW:${value}`,
} as const;

/** SMA response status characters */
export const SMA_STATUS_CHARS = {
  ESTAVEL: 'S' as SMAStatusChar,
  INSTAVEL: 'U' as SMAStatusChar,
  SOBRECARGA: 'O' as SMAStatusChar,
  SUBCARGA: 'I' as SMAStatusChar,
  ERRO: 'E' as SMAStatusChar,
  BRUTO: 'G' as SMAStatusChar,
  LIQUIDO: 'N' as SMAStatusChar,
} as const;

// ============================================
// SMA Response Parser
// ============================================

/**
 * Parse SMA protocol response.
 *
 * Format: StatusChar + Weight + Unit + CR/LF
 * Status chars: S=stable, U=unstable, O=overload, I=underload, E=error, G=gross, N=net
 *
 * Examples:
 *   "S     123.45 kg\r\n"
 *   "U    -0.50 kg\r\n"
 *   "O  99999.99 kg\r\n"
 *
 * @param raw - Raw response string from scale
 * @returns Parsed response or null if invalid
 */
export function parseSMAResponse(raw: string): ScaleResponse | null {
  if (!raw || raw.length < 3) return null;

  const trimmed = raw.replace(/[\r\n]+$/, '');
  const statusChar = trimmed.charAt(0) as SMAStatusChar;

  const validStatuses: string[] = ['S', 'U', 'O', 'I', 'E', 'G', 'N'];
  if (!validStatuses.includes(statusChar)) {
    return null;
  }

  // Extract weight value: everything between status char and unit
  const body = trimmed.substring(1).trim();
  const match = body.match(/^([+-]?\s*[\d.]+)\s*(\w+)?$/);

  if (!match) return null;

  const weightStr = match[1].replace(/\s/g, '');
  const weight = parseFloat(weightStr);
  const unit = match[2] || 'kg';

  if (isNaN(weight)) return null;

  return { status: statusChar, weight, unit, raw: trimmed };
}

/**
 * Convert SMA status character to PesoStatus string.
 */
export function smaStatusToPesoStatus(smaStatus: SMAStatusChar): string {
  switch (smaStatus) {
    case 'S': return 'estavel';
    case 'U': return 'instavel';
    case 'O': return 'sobrecarga';
    case 'I': return 'subcarga';
    case 'E': return 'erro';
    case 'G': return 'instavel'; // gross mode, treat as unstable unless stable
    case 'N': return 'instavel'; // net mode, treat as unstable unless stable
    default: return 'erro';
  }
}

// ============================================
// SMA Extended Response Parser
// ============================================

export interface SMAExtendedResponse {
  type: 'sensor_name' | 'calibration_data' | 'end' | 'unknown';
  data: string;
  raw: string;
}

/**
 * Parse SMA extended protocol response.
 *
 * Handles response markers:
 *   "Ynam:..." → sensor name response
 *   "Ycal:..." → calibration data response
 *   "END:"     → end of multi-line response
 *
 * @param data - Raw response string from scale
 * @returns Parsed extended response or null if not an extended response
 */
export function parseSMAExtendedResponse(data: string): SMAExtendedResponse | null {
  if (!data || typeof data !== 'string') return null;

  const trimmed = data.replace(/[\r\n]+$/, '').trim();
  if (!trimmed) return null;

  if (trimmed.startsWith('Ynam:')) {
    return {
      type: 'sensor_name',
      data: trimmed.substring('Ynam:'.length).trim(),
      raw: trimmed,
    };
  }

  if (trimmed.startsWith('Ycal:')) {
    return {
      type: 'calibration_data',
      data: trimmed.substring('Ycal:'.length).trim(),
      raw: trimmed,
    };
  }

  if (trimmed.startsWith('END:')) {
    return {
      type: 'end',
      data: trimmed.substring('END:'.length).trim(),
      raw: trimmed,
    };
  }

  return null;
}

/**
 * Parse weight scale information from SMA status/info response.
 *
 * @param raw - Raw info response string(s) from scale
 * @returns Parsed scale information or null
 */
export function parseWeightScaleInformation(raw: string): WeightScaleInformation | null {
  if (!raw) return null;

  const fields = raw.split(/[;:,\s]+/).filter(Boolean);
  if (fields.length < 4) return null;

  return {
    fundoEscala: parseFloat(fields[0]) || 0,
    numSerie: fields[1] || '',
    manufacturer: fields[2] || '',
    model: fields[3] || '',
    decimalPointPosition: parseInt(fields[4], 10) || 0,
    resolution: parseFloat(fields[5]) || 0,
    totalCapacity: parseFloat(fields[6]) || 0,
  };
}

// ============================================
// CRC-16 Checksum (CCITT / Modbus)
// ============================================

/**
 * Calculate CRC-16 (CCITT) checksum.
 * Used by SMA extended protocol and some scale models.
 *
 * @param data - Input data as Uint8Array or string
 * @returns CRC-16 value as number
 */
export function crc16CCITT(data: Uint8Array | string): number {
  const bytes = typeof data === 'string'
    ? new TextEncoder().encode(data)
    : data;

  let crc = 0xFFFF;

  for (let i = 0; i < bytes.length; i++) {
    crc ^= bytes[i];
    for (let j = 0; j < 8; j++) {
      if (crc & 0x0001) {
        crc = (crc >> 1) ^ 0xA001;
      } else {
        crc >>= 1;
      }
    }
  }

  return crc & 0xFFFF;
}

/**
 * Calculate CRC-16 and return as two-byte Uint8Array [low, high].
 */
export function crc16Bytes(data: Uint8Array | string): Uint8Array {
  const crc = crc16CCITT(data);
  return new Uint8Array([crc & 0xFF, (crc >> 8) & 0xFF]);
}

/**
 * Validate a message with appended CRC-16.
 * Last two bytes of the buffer are expected to be CRC [low, high].
 *
 * @param buffer - Full message including CRC bytes
 * @returns true if CRC is valid
 */
export function validateCRC16(buffer: Uint8Array): boolean {
  if (buffer.length < 3) return false;

  const message = buffer.slice(0, buffer.length - 2);
  const expectedCRC = crc16CCITT(message);
  const receivedCRC = buffer[buffer.length - 2] | (buffer[buffer.length - 1] << 8);

  return expectedCRC === receivedCRC;
}

// ============================================
// Intermec BRI Protocol
// TCP-based, ASCII commands, default port 2189
// ============================================

export const INTERMEC_COMMANDS = {
  /** Set active antenna(s). N = antenna number (1-4) or comma-separated */
  SET_ANTENNA: (n: number | number[]) => {
    const antennas = Array.isArray(n) ? n.join(',') : String(n);
    return `attribute ants=${antennas}\r\n`;
  },
  /** Start event-based reading (tags pushed as events) */
  READ_EVENT: 'read report=event\r\n',
  /** Synchronous single read */
  READ_SYNC: 'read\r\n',
  /** Stop reading */
  STOP: 'stop\r\n',
  /** Set reader power in dBm */
  SET_POWER: (dbm: number) => `attribute power=${dbm}\r\n`,
  /** Query reader status */
  STATUS: 'status\r\n',
  /** Set tag filter by EPC prefix */
  SET_FILTER: (prefix: string) => `attribute filter=${prefix}\r\n`,
  /** Clear tag filter */
  CLEAR_FILTER: 'attribute filter=\r\n',
  /** Set read timeout in seconds */
  SET_TIMEOUT: (seconds: number) => `attribute timeout=${seconds}\r\n`,
  /** Get firmware version */
  VERSION: 'version\r\n',
} as const;

/**
 * Parse Intermec BRI response line.
 *
 * Formats supported:
 *   "EP:E200001234567890;RSSI:-45"
 *   "EVENT:E200001234567890"
 *   Raw hex line (24+ hex chars)
 *   "Antenna:1,EP:E200001234567890,RSSI:-35"
 *
 * @param data - Raw response line
 * @returns Parsed tag and RSSI, or null
 */
export function parseIntermecResponse(data: string): {
  tag: string;
  rssi: number;
  antenna?: number;
} | null {
  if (!data || typeof data !== 'string') return null;

  const trimmed = data.trim();
  if (!trimmed) return null;

  // Format: "Antenna:1,EP:E200001234567890,RSSI:-35"
  const antennaMatch = trimmed.match(/Antenna:\s*(\d+)/i);
  const antenna = antennaMatch ? parseInt(antennaMatch[1], 10) : undefined;

  // Format: "EP:E200001234567890;RSSI:-45" or comma-separated
  const epMatch = trimmed.match(/EP:([0-9A-Fa-f]+)/i);
  if (epMatch) {
    const tag = epMatch[1].toUpperCase();
    const rssiMatch = trimmed.match(/RSSI:\s*(-?\d+)/i);
    const rssi = rssiMatch ? parseInt(rssiMatch[1], 10) : 0;
    return { tag, rssi, antenna };
  }

  // Format: "EVENT:E200001234567890"
  const eventMatch = trimmed.match(/EVENT:([0-9A-Fa-f]+)/i);
  if (eventMatch) {
    return { tag: eventMatch[1].toUpperCase(), rssi: 0, antenna };
  }

  // Raw hex line (24+ hex chars = EPC)
  if (/^[0-9A-Fa-f]{24,}$/.test(trimmed)) {
    return { tag: trimmed.toUpperCase(), rssi: 0, antenna };
  }

  return null;
}

// ============================================
// CentralGA Protocol
// Semicolon-delimited packets
// ============================================

/**
 * Parse CentralGA packet.
 *
 * Format: semicolon-delimited fields.
 *   Field[0] = sequence
 *   Field[1] = reader ID
 *   Field[2] = RFID tag in hex
 *   Field[3] = antenna
 *   Field[4] = RSSI
 *   Field[5] = timestamp
 *   Field[6] = control (X=disconnect, R/4=RFID down)
 *
 * Example: "001;12;E200001234567890;1;-45;2024-01-01T12:00:00;OK"
 */
export function parseCentralGAResponse(packet: string): {
  tag: string;
  rssi: number;
  antenna: number;
} | null {
  if (!packet || typeof packet !== 'string') return null;

  const fields = packet.trim().split(';');
  if (fields.length < 3) return null;

  const tagHex = fields[2]?.trim();
  if (!tagHex || tagHex.length < 8 || tagHex === '0') return null;

  // Validate hex characters
  if (!/^[0-9A-Fa-f]+$/.test(tagHex)) return null;

  // Check control field for disconnect/error signals
  if (fields.length > 6) {
    const control = fields[6]?.trim();
    if (control === 'X' || control === 'R' || control === '4') return null;
  }

  const rssi = fields.length > 4 ? parseInt(fields[4], 10) : 0;
  const antenna = fields.length > 3 ? parseInt(fields[3], 10) : 1;

  return {
    tag: tagHex.toUpperCase(),
    rssi: isNaN(rssi) ? 0 : rssi,
    antenna: isNaN(antenna) ? 1 : antenna,
  };
}

// ============================================
// Ideal Binary Protocol
// Start: 0xAA, End: 0x8E
// ============================================

export const IDEAL_PROTOCOL = {
  START_BYTE: 0xAA,
  END_BYTE: 0x8E,
  INIT_PACKAGES: [
    new Uint8Array([0xAA, 0x00, 0x03, 0x01, 0x00, 0x04, 0x8E]),
    new Uint8Array([0xAA, 0x00, 0x03, 0x02, 0xB6, 0xBB, 0x8E]),
    new Uint8Array([0xAA, 0x00, 0x03, 0x03, 0x06, 0x0C, 0x8E]),
    new Uint8Array([0xAA, 0x00, 0x03, 0x04, 0x00, 0x07, 0x8E]),
  ],
  INIT_PKG_ALT: [
    new Uint8Array([0x11, 0x00, 0x6F, 0x10, 0x02, 0xFF, 0x03, 0xE8, 0x8E]),
    new Uint8Array([0x11, 0x00, 0x6F, 0x10, 0x02, 0x03, 0x8E]),
  ],
  SET_POWER: (mw: number): Uint8Array => {
    const hi = (mw >> 8) & 0xFF;
    const lo = mw & 0xFF;
    return new Uint8Array([0x11, 0x00, 0x6F, 0x10, 0x02, hi, lo, 0x03, 0x8E]);
  },
  READ_CMD: new Uint8Array([0x11, 0x00, 0x6F, 0x10, 0x01, 0x03, 0x8E]),
  TAG_HEADERS: [
    [0x02, 0x22] as const,
    [0xAA, 0xAA] as const,
  ],
} as const;

/**
 * Parse Ideal binary response frame.
 *
 * Frame structure: 0xAA + len_hi + len_lo + cmd + data[...] + checksum + 0x8E
 * Inventory response cmd = 0x04 or 0x01
 * Last byte of payload = RSSI (signed)
 * Remaining payload bytes = tag EPC
 */
export function parseIdealResponse(buffer: Uint8Array): {
  tag: string;
  rssi: number;
} | null {
  if (!buffer || buffer.length < 7) return null;

  // Find start byte
  let startIdx = -1;
  for (let i = 0; i < buffer.length; i++) {
    if (buffer[i] === IDEAL_PROTOCOL.START_BYTE) {
      startIdx = i;
      break;
    }
  }
  if (startIdx === -1) return null;

  // Find end byte
  let endIdx = -1;
  for (let i = startIdx + 1; i < buffer.length; i++) {
    if (buffer[i] === IDEAL_PROTOCOL.END_BYTE) {
      endIdx = i;
      break;
    }
  }
  if (endIdx === -1) return null;

  const frame = buffer.slice(startIdx, endIdx + 1);
  if (frame.length < 7) return null;

  // frame[3] = command byte
  const cmd = frame[3];
  if (cmd !== 0x04 && cmd !== 0x01) return null;

  // Extract payload (between header and checksum+end)
  const payloadStart = 4;
  const payloadEnd = frame.length - 2;
  const payload = frame.slice(payloadStart, payloadEnd);

  if (payload.length < 2) return null;

  // Last byte is RSSI (signed byte)
  const rssiByte = payload[payload.length - 1];
  const rssi = rssiByte > 127 ? rssiByte - 256 : rssiByte;

  // Remaining bytes are tag EPC
  const tagBytes = payload.slice(0, payload.length - 1);
  const tag = Array.from(tagBytes)
    .map(b => b.toString(16).padStart(2, '0'))
    .join('')
    .toUpperCase();

  if (tag.length < 8) return null;

  return { tag, rssi };
}

/**
 * Alternative Ideal parser that looks for tag headers [0x02, 0x22] or [0xAA, 0xAA].
 */
export function parseIdealTagHeader(data: Uint8Array): {
  tag: string;
  rssi: number;
} | null {
  let tagStart = -1;
  for (let i = 0; i < data.length - 1; i++) {
    for (const header of IDEAL_PROTOCOL.TAG_HEADERS) {
      if (data[i] === header[0] && data[i + 1] === header[1]) {
        tagStart = i + 2;
        break;
      }
    }
    if (tagStart !== -1) break;
  }

  if (tagStart === -1 || tagStart >= data.length) return null;

  const tagBytes: number[] = [];
  for (let i = tagStart; i < data.length && data[i] !== IDEAL_PROTOCOL.END_BYTE; i++) {
    tagBytes.push(data[i]);
  }

  if (tagBytes.length < 4) return null;

  const tag = tagBytes.map(b => b.toString(16).padStart(2, '0')).join('').toUpperCase();
  return { tag, rssi: 0 };
}

// ============================================
// Triunfo Display Protocol
// Serial frame: "&10{speed}{text}10#"
// ============================================

/**
 * Build Triunfo serial frame for LED display.
 *
 * @param text - Text to display (diacritics will NOT be removed here)
 * @param speed - Scroll speed 1-8 (1=slowest)
 * @returns Frame string ready to send
 */
export function buildTriunfoFrame(text: string, speed: number = 4): string {
  const clampedSpeed = Math.min(8, Math.max(1, Math.round(speed)));
  return `&10${clampedSpeed}${text}10#`;
}

/**
 * Build Triunfo frame with intensity control.
 *
 * @param text - Text to display
 * @param speed - Scroll speed 1-8
 * @param intensity - Brightness 0-7 (7=max)
 * @returns Frame string
 */
export function buildTriunfoFrameWithIntensity(
  text: string,
  speed: number = 4,
  intensity: number = 7,
): string {
  const clampedSpeed = Math.min(8, Math.max(1, Math.round(speed)));
  const clampedIntensity = Math.min(7, Math.max(0, Math.round(intensity)));
  // Intensity prefix: &B{intensity}
  return `&B${clampedIntensity}&10${clampedSpeed}${text}10#`;
}

// ============================================
// CentralGA Display Protocol
// Frame: "\nL{line}{position}{text}\r"
// Time:  "\nD{time}\r"
// ============================================

/**
 * Build CentralGA display command to write text at a position.
 *
 * @param line - Display line (1-based)
 * @param position - Character position (0-based)
 * @param text - Text to display
 */
export function buildCentralGAFrame(line: number, position: number, text: string): string {
  const lineStr = String(Math.max(1, line));
  const posStr = String(Math.max(0, position)).padStart(2, '0');
  return `\nL${lineStr}${posStr}${text}\r`;
}

/**
 * Build CentralGA time display command.
 *
 * @param time - Time string (e.g. "12:34")
 */
export function buildCentralGATimeFrame(time: string): string {
  return `\nD${time}\r`;
}

// ============================================
// Utility: Remove Diacritics
// LED displays typically only support ASCII
// ============================================

const DIACRITICS_MAP: Record<string, string> = {
  '\u00E0': 'a', '\u00E1': 'a', '\u00E2': 'a', '\u00E3': 'a', '\u00E4': 'a', '\u00E5': 'a',
  '\u00C0': 'A', '\u00C1': 'A', '\u00C2': 'A', '\u00C3': 'A', '\u00C4': 'A', '\u00C5': 'A',
  '\u00E8': 'e', '\u00E9': 'e', '\u00EA': 'e', '\u00EB': 'e',
  '\u00C8': 'E', '\u00C9': 'E', '\u00CA': 'E', '\u00CB': 'E',
  '\u00EC': 'i', '\u00ED': 'i', '\u00EE': 'i', '\u00EF': 'i',
  '\u00CC': 'I', '\u00CD': 'I', '\u00CE': 'I', '\u00CF': 'I',
  '\u00F2': 'o', '\u00F3': 'o', '\u00F4': 'o', '\u00F5': 'o', '\u00F6': 'o',
  '\u00D2': 'O', '\u00D3': 'O', '\u00D4': 'O', '\u00D5': 'O', '\u00D6': 'O',
  '\u00F9': 'u', '\u00FA': 'u', '\u00FB': 'u', '\u00FC': 'u',
  '\u00D9': 'U', '\u00DA': 'U', '\u00DB': 'U', '\u00DC': 'U',
  '\u00E7': 'c', '\u00C7': 'C',
  '\u00F1': 'n', '\u00D1': 'N',
  '\u00FF': 'y', '\u0178': 'Y',
};

/**
 * Remove diacritics/accents from text for LED display compatibility.
 * Converts characters like a/e/i/o/u/c/n to their ASCII equivalents.
 */
export function removeDiacritics(text: string): string {
  let result = '';
  for (let i = 0; i < text.length; i++) {
    const char = text[i];
    result += DIACRITICS_MAP[char] || char;
  }
  return result;
}

// ============================================
// ESP32 V10 HTTP Endpoints
// Based on CR1_TGT DriverBoardMKD.dll - CommAPI_V10
// ============================================

export const V10_ENDPOINTS = {
  SCALE_READ: '/scale/read-weight',
  SCALE_ZERO: '/scale/zero',
  SCALE_TARE: '/scale/tare',
  SCALE_CALIBRATE: '/scale/calibrate',
  TAG_READ: '/tag/read-tag',
  TAG_CONFIG: '/tag/config',
  TAG_ANTENNA: '/tag/antenna',
  LED_WRITE: '/led/write-lines',
  STATUS: '/status',
  CONFIG: '/config',
} as const;
