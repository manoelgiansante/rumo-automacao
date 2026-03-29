// ============================================
// RFID Reader Communication Service
// Rumo Automacao - Complete RFID Integration
// ============================================
// Protocols: Intermec BRI (TCP), ESP32 V10 HTTP,
//            Ideal (Binary), CentralGA, BLE, Manual
// Features: Multi-antenna, tag debounce, curral ID,
//           antenna switching, tag size validation
// ============================================
// Runtime: React Native / Expo (no Node.js modules)
// TCP: react-native-tcp-socket
// BLE: react-native-ble-plx
// ============================================

import type {
  RfidConfig,
  RFIDStatus,
  TagReading,
  RfidCallbacks,
  ESP32TagResponse,
  CurralRfid,
  AntenaSide,
} from './types';
import { DEFAULT_RFID_CONFIG } from './types';
import {
  INTERMEC_COMMANDS,
  IDEAL_PROTOCOL,
  V10_ENDPOINTS,
  parseIntermecResponse,
  parseCentralGAResponse,
  parseIdealResponse,
  parseIdealTagHeader,
} from './protocols';

// ============================================
// Optional native dependencies (React Native)
// ============================================

let TcpSocket: any = null;
try {
  TcpSocket = require('react-native-tcp-socket');
} catch (e) {
  console.warn('[RfidService] react-native-tcp-socket nao instalado. TCP nao disponivel.');
}

let BleManager: any = null;
try {
  const blePlx = require('react-native-ble-plx');
  BleManager = new blePlx.BleManager();
} catch (e) {
  console.warn('[RfidService] react-native-ble-plx nao instalado. BLE nao disponivel.');
}

// ============================================
// ESP32 RFID BLE UUIDs (Nordic UART Service)
// ============================================

const ESP32_RFID_SERVICE_UUID = '6E400001-B5A3-F393-E0A9-E50E24DCCA9E';
const ESP32_RFID_TX_CHAR_UUID = '6E400003-B5A3-F393-E0A9-E50E24DCCA9E';

// ============================================
// Constants
// ============================================

const MAX_RECONNECT_ATTEMPTS = 5;
const RECONNECT_DELAY_MS = 5000;
const ESP32_CONSECUTIVE_FAILURE_THRESHOLD = 3;

// ============================================
// Tag Debouncer
// ============================================

class TagDebouncer {
  private lastSeen: Map<string, number> = new Map();
  private debounceMs: number;

  constructor(debounceMs: number) {
    this.debounceMs = debounceMs;
  }

  updateConfig(debounceMs: number) {
    this.debounceMs = debounceMs;
  }

  /**
   * Returns true if this tag should be processed (not debounced).
   */
  shouldProcess(tag: string): boolean {
    const now = Date.now();
    const lastTime = this.lastSeen.get(tag);

    if (lastTime && now - lastTime < this.debounceMs) {
      return false;
    }

    this.lastSeen.set(tag, now);

    // Cleanup old entries periodically
    if (this.lastSeen.size > 1000) {
      const cutoff = now - this.debounceMs * 2;
      for (const [t, ts] of this.lastSeen) {
        if (ts < cutoff) this.lastSeen.delete(t);
      }
    }

    return true;
  }

  reset() {
    this.lastSeen.clear();
  }
}

// ============================================
// RfidService Class
// ============================================

class RfidService {
  private config: RfidConfig = { ...DEFAULT_RFID_CONFIG };
  private status: RFIDStatus = 'desconectado';
  private callbacks: RfidCallbacks = {};
  private pollingTimer: ReturnType<typeof setInterval> | null = null;
  private noTagTimer: ReturnType<typeof setTimeout> | null = null;
  private reconnectTimeout: ReturnType<typeof setTimeout> | null = null;
  private reconnectAttempts = 0;
  private debouncer: TagDebouncer;
  private ultimaLeitura: TagReading | null = null;
  private tagCounter = 0;
  private abortController: AbortController | null = null;
  private lastTagTimestamp = 0;

  /** Consecutive ESP32 HTTP poll failures (tolerance before reconnect) */
  private esp32ConsecutiveFailures = 0;

  /** TCP socket reference for Intermec/CentralGA/Ideal */
  private socket: any = null;
  private socketBuffer = '';
  private binaryBuffer: Uint8Array = new Uint8Array(0);

  /** BLE device reference */
  private bleDevice: any = null;
  /** BLE characteristic subscription */
  private bleSubscription: any = null;

  /** Current active antenna number (for switching) */
  private currentAntenna = 1;

  /** Curral RFID mappings */
  private curraisRfid: CurralRfid[] = [];

  constructor() {
    this.debouncer = new TagDebouncer(DEFAULT_RFID_CONFIG.tempo_debounce_ms);
  }

  // ----------------------------------------
  // Configuration
  // ----------------------------------------

  configurar(config: Partial<RfidConfig>, callbacks?: RfidCallbacks) {
    this.config = { ...this.config, ...config };
    if (config.v10) {
      this.config.v10 = { ...this.config.v10, ...config.v10 };
    }
    if (config.tcp) {
      this.config.tcp = { ...this.config.tcp, ...config.tcp };
    }
    if (config.serial) {
      this.config.serial = { ...this.config.serial, ...config.serial };
    }
    if (callbacks) {
      this.callbacks = { ...this.callbacks, ...callbacks };
    }
    this.debouncer.updateConfig(this.config.tempo_debounce_ms);
  }

  setCurraisRfid(currais: CurralRfid[]) {
    this.curraisRfid = currais;
  }

  getConfig(): Readonly<RfidConfig> {
    return { ...this.config };
  }

  getStatus(): RFIDStatus {
    return this.status;
  }

  getUltimaLeitura(): TagReading | null {
    return this.ultimaLeitura ? { ...this.ultimaLeitura } : null;
  }

  // ----------------------------------------
  // Event Handler Setters
  // ----------------------------------------

  setOnTag(cb: (leitura: TagReading) => void) {
    this.callbacks.onTag = cb;
  }

  setOnNewRead(cb: (leitura: TagReading) => void) {
    this.callbacks.onNewRead = cb;
  }

  setOnNoTag(cb: () => void) {
    this.callbacks.onNoTag = cb;
  }

  setOnCurralDetectado(cb: (curralId: string, tag: string, tipo: 'entrada' | 'saida') => void) {
    this.callbacks.onCurralIdentificado = cb;
  }

  setOnStatus(cb: (status: RFIDStatus, mensagem?: string) => void) {
    this.callbacks.onStatus = cb;
  }

  setOnErro(cb: (erro: string) => void) {
    this.callbacks.onErro = cb;
  }

  // ----------------------------------------
  // Connection
  // ----------------------------------------

  async conectar(): Promise<boolean> {
    if (this.status === 'conectado' || this.status === 'lendo') {
      return true;
    }

    this.setStatus('conectando');
    this.reconnectAttempts = 0;

    try {
      switch (this.config.protocolo) {
        case 'esp32_http':
          return await this.conectarESP32HTTP();
        case 'esp32_ble':
          return await this.conectarESP32BLE();
        case 'intermec_tcp':
          return await this.conectarIntermec();
        case 'ideal_serial':
          return await this.conectarIdeal();
        case 'centralga':
          return await this.conectarCentralGA();
        case 'manual':
          this.setStatus('conectado');
          return true;
        default:
          throw new Error(`Protocolo RFID desconhecido: ${this.config.protocolo}`);
      }
    } catch (err) {
      const msg = err instanceof Error ? err.message : String(err);
      this.emitErro(`Falha ao conectar RFID: ${msg}`);
      this.setStatus('erro');
      return false;
    }
  }

  async desconectar() {
    this.pararLeitura();
    this.cancelReconnect();
    this.reconnectAttempts = 0;
    this.esp32ConsecutiveFailures = 0;

    if (this.abortController) {
      this.abortController.abort();
      this.abortController = null;
    }

    if (this.socket) {
      try {
        // Send stop command before disconnecting (Intermec)
        if (this.config.protocolo === 'intermec_tcp' && typeof this.socket.write === 'function') {
          this.socket.write(INTERMEC_COMMANDS.STOP);
        }
        if (typeof this.socket.destroy === 'function') {
          this.socket.destroy();
        } else if (typeof this.socket.close === 'function') {
          this.socket.close();
        }
      } catch { /* ignore */ }
      this.socket = null;
    }

    // Cancel BLE subscription before disconnecting device
    if (this.bleSubscription) {
      try {
        this.bleSubscription.remove();
      } catch { /* ignore */ }
      this.bleSubscription = null;
    }

    if (this.bleDevice) {
      try {
        if (typeof this.bleDevice.cancelConnection === 'function') {
          await this.bleDevice.cancelConnection();
        }
      } catch { /* ignore */ }
      this.bleDevice = null;
    }

    if (this.noTagTimer) {
      clearTimeout(this.noTagTimer);
      this.noTagTimer = null;
    }

    this.socketBuffer = '';
    this.binaryBuffer = new Uint8Array(0);
    this.debouncer.reset();
    this.ultimaLeitura = null;
    this.tagCounter = 0;
    this.lastTagTimestamp = 0;
    this.setStatus('desconectado');
    this.callbacks.onConexao?.(false);
  }

  // ----------------------------------------
  // ESP32 V10 HTTP Connection
  // ----------------------------------------

  private async conectarESP32HTTP(): Promise<boolean> {
    const url = `http://${this.config.v10.ip}:${this.config.v10.port}${V10_ENDPOINTS.TAG_READ}`;

    try {
      const controller = new AbortController();
      const timeoutId = setTimeout(() => controller.abort(), this.config.v10.timeout_ms);

      const response = await fetch(url, {
        method: 'GET',
        headers: { 'Accept': 'application/json' },
        signal: controller.signal,
      });

      clearTimeout(timeoutId);

      if (!response.ok) {
        throw new Error(`HTTP ${response.status}: ${response.statusText}`);
      }

      this.esp32ConsecutiveFailures = 0;
      this.setStatus('conectado');
      this.callbacks.onConexao?.(true);
      return true;
    } catch (err) {
      throw new Error(
        `Nao foi possivel conectar ao ESP32 RFID em ${this.config.v10.ip}: ${
          err instanceof Error ? err.message : String(err)
        }`
      );
    }
  }

  // ----------------------------------------
  // ESP32 BLE Connection
  // ----------------------------------------

  private async conectarESP32BLE(): Promise<boolean> {
    if (!BleManager) {
      throw new Error(
        'BLE nao disponivel. Instale react-native-ble-plx:\n' +
        '  npx expo install react-native-ble-plx\n' +
        'e reconstrua o app com npx expo prebuild.'
      );
    }

    const address = this.config.serial?.endereco;
    if (!address) {
      throw new Error('Endereco BLE nao configurado (config.serial.endereco)');
    }

    try {
      this.bleDevice = await BleManager.connectToDevice(address, {
        timeout: this.config.v10.timeout_ms,
      });

      await this.bleDevice.discoverAllServicesAndCharacteristics();

      // Subscribe to tag notifications via Nordic UART TX characteristic
      this.bleSubscription = this.bleDevice.monitorCharacteristicForDevice(
        this.bleDevice.id,
        ESP32_RFID_SERVICE_UUID,
        ESP32_RFID_TX_CHAR_UUID,
        (error: any, characteristic: any) => {
          if (error) {
            console.error('[RfidService] BLE notification error:', error.message);
            if (this.status !== 'desconectado') {
              this.tentarReconexao();
            }
            return;
          }

          if (characteristic?.value) {
            // BLE characteristic value is base64-encoded
            const decoded = this.decodeBase64(characteristic.value);
            if (decoded) {
              this.processBLEData(decoded);
            }
          }
        },
      );

      this.setStatus('conectado');
      this.callbacks.onConexao?.(true);
      return true;
    } catch (err) {
      throw new Error(
        `Falha na conexao BLE RFID: ${err instanceof Error ? err.message : String(err)}`
      );
    }
  }

  /**
   * Decode base64 string to UTF-8 text.
   * Works in React Native without atob.
   */
  private decodeBase64(base64: string): string {
    try {
      // React Native global atob may be available
      if (typeof atob === 'function') {
        return atob(base64);
      }
      // Fallback: manual base64 decode
      const chars = 'ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789+/';
      let result = '';
      let i = 0;
      const str = base64.replace(/=+$/, '');
      while (i < str.length) {
        const a = chars.indexOf(str.charAt(i++));
        const b = chars.indexOf(str.charAt(i++));
        const c = chars.indexOf(str.charAt(i++));
        const d = chars.indexOf(str.charAt(i++));
        const triplet = (a << 18) | (b << 12) | (c << 6) | d;
        result += String.fromCharCode((triplet >> 16) & 0xFF);
        if (c !== -1) result += String.fromCharCode((triplet >> 8) & 0xFF);
        if (d !== -1) result += String.fromCharCode(triplet & 0xFF);
      }
      return result;
    } catch {
      return '';
    }
  }

  /**
   * Process text data received via BLE notifications.
   * Tries Intermec and CentralGA parsers, or treats as plain tag ID.
   */
  private processBLEData(data: string) {
    // Try known parsers
    const intermec = parseIntermecResponse(data.trim());
    if (intermec) {
      this.handleTagRead(intermec.tag, intermec.rssi, intermec.antenna || this.currentAntenna);
      return;
    }

    const centralga = parseCentralGAResponse(data.trim());
    if (centralga) {
      this.handleTagRead(centralga.tag, centralga.rssi, centralga.antenna);
      return;
    }

    // Fallback: treat entire string as a raw tag ID (trimmed)
    const rawTag = data.trim();
    if (rawTag.length >= 4 && rawTag.length <= 64) {
      this.handleTagRead(rawTag, 0, this.currentAntenna);
    }
  }

  // ----------------------------------------
  // Intermec BRI Connection (TCP ASCII)
  // ----------------------------------------

  private async conectarIntermec(): Promise<boolean> {
    if (!TcpSocket) {
      throw new Error(
        'TCP nao disponivel. Instale react-native-tcp-socket:\n' +
        '  npm install react-native-tcp-socket\n' +
        'e reconstrua o app com npx expo prebuild.\n' +
        'Alternativa: use processExternalData() para alimentar dados Intermec via bridge.'
      );
    }

    return new Promise((resolve, reject) => {
      try {
        this.socket = TcpSocket.createConnection(
          {
            host: this.config.tcp.ip,
            port: this.config.tcp.port,
            timeout: this.config.tcp.timeout_ms,
          },
          () => {
            console.log(
              `[RfidService] Conectado Intermec BRI em ${this.config.tcp.ip}:${this.config.tcp.port}`
            );

            // Configure antenna(s)
            const antennaConfig = this.getAntennaNumbers();
            this.socket.write(INTERMEC_COMMANDS.SET_ANTENNA(antennaConfig));

            // Start event-based reading
            this.socket.write(INTERMEC_COMMANDS.READ_EVENT);

            this.setStatus('conectado');
            this.callbacks.onConexao?.(true);
            resolve(true);
          },
        );

        this.socket.on('data', (data: any) => {
          // react-native-tcp-socket returns string or Buffer-like
          const str = typeof data === 'string' ? data : data.toString();
          this.processIntermecData(str);
        });

        this.socket.on('error', (err: Error) => {
          if (this.status === 'conectando') {
            reject(new Error(`Intermec TCP error: ${err.message}`));
          } else {
            this.emitErro(`Intermec TCP error: ${err.message}`);
            this.tentarReconexao();
          }
        });

        this.socket.on('close', () => {
          if (this.status !== 'desconectado') {
            this.tentarReconexao();
          }
        });
      } catch (err) {
        reject(new Error(
          `Falha ao criar socket TCP Intermec: ${err instanceof Error ? err.message : String(err)}`
        ));
      }
    });
  }

  private processIntermecData(data: string) {
    this.socketBuffer += data;

    let lineEnd: number;
    while ((lineEnd = this.socketBuffer.indexOf('\n')) !== -1) {
      const line = this.socketBuffer.substring(0, lineEnd).trim();
      this.socketBuffer = this.socketBuffer.substring(lineEnd + 1);

      if (!line) continue;

      const parsed = parseIntermecResponse(line);
      if (parsed) {
        const antenna = parsed.antenna || this.currentAntenna;
        this.handleTagRead(parsed.tag, parsed.rssi, antenna);
      }
    }

    // Prevent buffer overflow
    if (this.socketBuffer.length > 4096) {
      this.socketBuffer = this.socketBuffer.slice(-512);
    }
  }

  // ----------------------------------------
  // Ideal Connection (Binary protocol)
  // ----------------------------------------

  private async conectarIdeal(): Promise<boolean> {
    if (!TcpSocket) {
      throw new Error(
        'TCP nao disponivel. Instale react-native-tcp-socket:\n' +
        '  npm install react-native-tcp-socket\n' +
        'e reconstrua o app com npx expo prebuild.\n' +
        'Alternativa: use processExternalBinaryData() para alimentar dados Ideal via bridge.'
      );
    }

    return new Promise((resolve, reject) => {
      try {
        this.socket = TcpSocket.createConnection(
          {
            host: this.config.tcp.ip,
            port: this.config.tcp.port,
            timeout: this.config.tcp.timeout_ms,
          },
          () => {
            console.log(`[RfidService] Conectado Ideal em ${this.config.tcp.ip}:${this.config.tcp.port}`);

            // Send init packages
            for (const pkg of IDEAL_PROTOCOL.INIT_PACKAGES) {
              this.socket.write(new Uint8Array(pkg));
            }

            // Send alternative init packages
            for (const pkg of IDEAL_PROTOCOL.INIT_PKG_ALT) {
              this.socket.write(new Uint8Array(pkg));
            }

            // Set power
            if (this.config.potencia_mw > 0) {
              this.socket.write(new Uint8Array(IDEAL_PROTOCOL.SET_POWER(this.config.potencia_mw)));
            }

            this.setStatus('conectado');
            this.callbacks.onConexao?.(true);
            resolve(true);
          },
        );

        this.socket.on('data', (data: any) => {
          // react-native-tcp-socket may return string or Uint8Array-like
          let bytes: Uint8Array;
          if (data instanceof Uint8Array) {
            bytes = data;
          } else if (typeof data === 'string') {
            // Convert string to bytes
            bytes = new Uint8Array(data.length);
            for (let i = 0; i < data.length; i++) {
              bytes[i] = data.charCodeAt(i);
            }
          } else if (data && typeof data.length === 'number') {
            bytes = new Uint8Array(data);
          } else {
            return;
          }
          this.processIdealData(bytes);
        });

        this.socket.on('error', (err: Error) => {
          if (this.status === 'conectando') {
            reject(new Error(`Ideal TCP error: ${err.message}`));
          } else {
            this.emitErro(`Ideal TCP error: ${err.message}`);
            this.tentarReconexao();
          }
        });

        this.socket.on('close', () => {
          if (this.status !== 'desconectado') {
            this.tentarReconexao();
          }
        });
      } catch (err) {
        reject(new Error(
          `Falha ao criar socket TCP Ideal: ${err instanceof Error ? err.message : String(err)}`
        ));
      }
    });
  }

  private processIdealData(data: Uint8Array) {
    // Append to binary buffer
    const combined = new Uint8Array(this.binaryBuffer.length + data.length);
    combined.set(this.binaryBuffer);
    combined.set(data, this.binaryBuffer.length);
    this.binaryBuffer = combined;

    // Process complete frames
    while (this.binaryBuffer.length >= 7) {
      // Find start byte
      let startIdx = -1;
      for (let i = 0; i < this.binaryBuffer.length; i++) {
        if (this.binaryBuffer[i] === IDEAL_PROTOCOL.START_BYTE) {
          startIdx = i;
          break;
        }
      }

      if (startIdx === -1) {
        this.binaryBuffer = new Uint8Array(0);
        break;
      }

      // Discard bytes before start
      if (startIdx > 0) {
        this.binaryBuffer = this.binaryBuffer.slice(startIdx);
      }

      // Find end byte
      let endIdx = -1;
      for (let i = 1; i < this.binaryBuffer.length; i++) {
        if (this.binaryBuffer[i] === IDEAL_PROTOCOL.END_BYTE) {
          endIdx = i;
          break;
        }
      }

      if (endIdx === -1) break; // Incomplete frame

      const frame = this.binaryBuffer.slice(0, endIdx + 1);
      this.binaryBuffer = this.binaryBuffer.slice(endIdx + 1);

      // Try standard parser first, then tag header parser
      let parsed = parseIdealResponse(frame);
      if (!parsed) {
        parsed = parseIdealTagHeader(frame);
      }

      if (parsed) {
        this.handleTagRead(parsed.tag, parsed.rssi, this.currentAntenna);
      }
    }

    // Prevent buffer overflow
    if (this.binaryBuffer.length > 8192) {
      this.binaryBuffer = this.binaryBuffer.slice(-1024);
    }
  }

  // ----------------------------------------
  // CentralGA Connection (TCP semicolon-delimited)
  // ----------------------------------------

  private async conectarCentralGA(): Promise<boolean> {
    if (!TcpSocket) {
      throw new Error(
        'TCP nao disponivel. Instale react-native-tcp-socket:\n' +
        '  npm install react-native-tcp-socket\n' +
        'e reconstrua o app com npx expo prebuild.\n' +
        'Alternativa: use processExternalData() para alimentar dados CentralGA via bridge.'
      );
    }

    return new Promise((resolve, reject) => {
      try {
        this.socket = TcpSocket.createConnection(
          {
            host: this.config.tcp.ip,
            port: this.config.tcp.port,
            timeout: this.config.tcp.timeout_ms,
          },
          () => {
            console.log(`[RfidService] Conectado CentralGA em ${this.config.tcp.ip}:${this.config.tcp.port}`);
            this.setStatus('conectado');
            this.callbacks.onConexao?.(true);
            resolve(true);
          },
        );

        this.socket.on('data', (data: any) => {
          const str = typeof data === 'string' ? data : data.toString();
          this.processCentralGAData(str);
        });

        this.socket.on('error', (err: Error) => {
          if (this.status === 'conectando') {
            reject(new Error(`CentralGA TCP error: ${err.message}`));
          } else {
            this.emitErro(`CentralGA TCP error: ${err.message}`);
            this.tentarReconexao();
          }
        });

        this.socket.on('close', () => {
          if (this.status !== 'desconectado') {
            this.tentarReconexao();
          }
        });
      } catch (err) {
        reject(new Error(
          `Falha ao criar socket TCP CentralGA: ${err instanceof Error ? err.message : String(err)}`
        ));
      }
    });
  }

  private processCentralGAData(data: string) {
    this.socketBuffer += data;

    let lineEnd: number;
    while ((lineEnd = this.socketBuffer.indexOf('\n')) !== -1) {
      const line = this.socketBuffer.substring(0, lineEnd).trim();
      this.socketBuffer = this.socketBuffer.substring(lineEnd + 1);

      if (!line) continue;

      const parsed = parseCentralGAResponse(line);
      if (parsed) {
        this.handleTagRead(parsed.tag, parsed.rssi, parsed.antenna);
      }
    }

    // Handle packets without newline (semicolon-terminated)
    if (this.socketBuffer.includes(';') && this.socketBuffer.split(';').length > 3) {
      const parsed = parseCentralGAResponse(this.socketBuffer.trim());
      if (parsed) {
        this.handleTagRead(parsed.tag, parsed.rssi, parsed.antenna);
        this.socketBuffer = '';
      }
    }

    // Prevent buffer overflow
    if (this.socketBuffer.length > 4096) {
      this.socketBuffer = this.socketBuffer.slice(-512);
    }
  }

  // ----------------------------------------
  // External Data Feed (for RN bridges)
  // ----------------------------------------

  /**
   * Feed raw text data from an external TCP/serial bridge.
   * Automatically selects parser based on configured protocol.
   */
  processExternalData(data: string) {
    switch (this.config.protocolo) {
      case 'intermec_tcp':
        this.processIntermecData(data);
        break;
      case 'centralga':
        this.processCentralGAData(data);
        break;
      default:
        // Try all text parsers
        const intermec = parseIntermecResponse(data);
        if (intermec) {
          this.handleTagRead(intermec.tag, intermec.rssi, intermec.antenna || this.currentAntenna);
          return;
        }
        const centralga = parseCentralGAResponse(data);
        if (centralga) {
          this.handleTagRead(centralga.tag, centralga.rssi, centralga.antenna);
        }
    }
  }

  /**
   * Feed raw binary data from an external TCP bridge (for Ideal protocol).
   */
  processExternalBinaryData(data: Uint8Array) {
    this.processIdealData(data);
  }

  // ----------------------------------------
  // Antenna Management
  // ----------------------------------------

  /**
   * Switch active antenna (async - sends command to reader).
   * For Intermec BRI, sends "attribute ants=N" command.
   */
  async switchAntenna(antennaNumber: number): Promise<boolean> {
    if (antennaNumber < 1 || antennaNumber > this.config.numero_antenas) {
      this.emitErro(`Antena ${antennaNumber} invalida. Maximo: ${this.config.numero_antenas}`);
      return false;
    }

    this.currentAntenna = antennaNumber;
    this.callbacks.onAntenaChange?.(antennaNumber);

    if (this.config.protocolo === 'intermec_tcp' && this.socket) {
      try {
        this.socket.write(INTERMEC_COMMANDS.SET_ANTENNA(antennaNumber));
        return true;
      } catch (err) {
        this.emitErro(`Falha ao trocar antena: ${err instanceof Error ? err.message : String(err)}`);
        return false;
      }
    }

    return true;
  }

  /**
   * Get antenna number(s) based on configuration.
   * Returns single number for single mode, or array for multi-antenna.
   */
  private getAntennaNumbers(): number | number[] {
    if (this.config.numero_antenas === 1) {
      return this.currentAntenna;
    }

    switch (this.config.antena_ativa) {
      case 'esquerda':
        return 1;
      case 'direita':
        return 2;
      case 'ambas':
        return Array.from({ length: this.config.numero_antenas }, (_, i) => i + 1);
      default:
        return this.currentAntenna;
    }
  }

  private antennaNumberToSide(n: number): AntenaSide {
    if (this.config.numero_antenas <= 1) return 'ambas';
    if (n === 1) return 'esquerda';
    if (n === 2) return 'direita';
    return 'ambas';
  }

  // ----------------------------------------
  // Reading Control
  // ----------------------------------------

  iniciarLeitura() {
    if (this.pollingTimer) return;

    if (this.status !== 'conectado' && this.status !== 'lendo') {
      this.emitErro('Leitor RFID nao conectado. Conecte antes de iniciar leitura.');
      return;
    }

    this.setStatus('lendo');
    this.debouncer.reset();
    this.lastTagTimestamp = Date.now();
    this.esp32ConsecutiveFailures = 0;

    // Only ESP32 HTTP needs polling; TCP/BLE protocols push data
    if (this.config.protocolo === 'esp32_http') {
      this.pollingTimer = setInterval(async () => {
        try {
          await this.executarLeituraESP32();
          // Reset failure counter on success
          this.esp32ConsecutiveFailures = 0;
        } catch (err) {
          this.esp32ConsecutiveFailures++;
          const msg = err instanceof Error ? err.message : String(err);

          if (this.esp32ConsecutiveFailures >= ESP32_CONSECUTIVE_FAILURE_THRESHOLD) {
            this.emitErro(
              `Erro na leitura RFID (${this.esp32ConsecutiveFailures} falhas consecutivas): ${msg}`
            );
            this.esp32ConsecutiveFailures = 0;
            this.tentarReconexao();
          } else {
            console.warn(
              `[RfidService] Falha ESP32 HTTP ${this.esp32ConsecutiveFailures}/${ESP32_CONSECUTIVE_FAILURE_THRESHOLD}: ${msg}`
            );
          }
        }
      }, this.config.intervalo_leitura_ms);
    }

    // Start no-tag timeout monitoring
    this.startNoTagMonitor();
  }

  pararLeitura() {
    if (this.pollingTimer) {
      clearInterval(this.pollingTimer);
      this.pollingTimer = null;
    }

    if (this.noTagTimer) {
      clearTimeout(this.noTagTimer);
      this.noTagTimer = null;
    }

    if (this.status === 'lendo') {
      this.setStatus('conectado');
    }
  }

  // ----------------------------------------
  // No-Tag Timeout Monitor
  // ----------------------------------------

  private startNoTagMonitor() {
    if (this.noTagTimer) {
      clearTimeout(this.noTagTimer);
    }

    if (this.config.timeout_rfid_sem_leitura <= 0) return;

    this.noTagTimer = setTimeout(() => {
      if (this.status === 'lendo') {
        const elapsed = Date.now() - this.lastTagTimestamp;
        if (elapsed >= this.config.timeout_rfid_sem_leitura) {
          this.callbacks.onNoTag?.();
        }
        // Restart monitor
        this.startNoTagMonitor();
      }
    }, this.config.timeout_rfid_sem_leitura);
  }

  // ----------------------------------------
  // Single Read
  // ----------------------------------------

  async lerTag(): Promise<TagReading | null> {
    if (this.config.protocolo === 'esp32_http') {
      try {
        return await this.lerTagESP32();
      } catch {
        return null;
      }
    }
    return this.ultimaLeitura;
  }

  private async lerTagESP32(): Promise<TagReading | null> {
    const url = `http://${this.config.v10.ip}:${this.config.v10.port}${V10_ENDPOINTS.TAG_READ}`;

    const controller = new AbortController();
    const timeoutId = setTimeout(() => controller.abort(), this.config.v10.timeout_ms);

    try {
      const response = await fetch(url, {
        method: 'GET',
        headers: { 'Accept': 'application/json' },
        signal: controller.signal,
      });

      clearTimeout(timeoutId);

      if (!response.ok) {
        throw new Error(`HTTP ${response.status}`);
      }

      const data = await response.json();
      const reader = data.TagReader || data.tagReader || data;
      const tag = (reader.tag || reader.Tag || '').toString();
      const rssi = parseInt(reader.rssi || reader.RSSI || '0');
      const contador = parseInt(reader.counter || reader.contador || '0');

      if (!tag || tag === '' || tag === '0' || tag === '000000000000') {
        return null;
      }

      const normalizedTag = tag.toUpperCase();

      if (!this.passesFilter(normalizedTag)) return null;
      if (!this.validateTagSize(normalizedTag)) return null;
      if (!this.debouncer.shouldProcess(normalizedTag)) return null;

      this.tagCounter++;

      const leitura: TagReading = {
        tag: normalizedTag,
        rssi,
        antena: this.antennaNumberToSide(this.currentAntenna),
        antenaNr: this.currentAntenna,
        timestamp: Date.now(),
        contador: this.tagCounter,
        EPC: reader.EPC,
        ID: reader.ID,
      };

      this.ultimaLeitura = leitura;
      return leitura;
    } finally {
      clearTimeout(timeoutId);
    }
  }

  private async executarLeituraESP32() {
    const leitura = await this.lerTagESP32();
    if (leitura) {
      this.lastTagTimestamp = Date.now();
      this.callbacks.onTag?.(leitura);
      this.callbacks.onNewRead?.(leitura);
      this.checkCurral(leitura.tag);

      // Reset no-tag monitor
      this.startNoTagMonitor();
    }
  }

  // ----------------------------------------
  // Tag Processing
  // ----------------------------------------

  private handleTagRead(tag: string, rssi: number, antenaNr: number) {
    if (!tag) return;

    const normalizedTag = tag.toUpperCase();

    if (!this.passesFilter(normalizedTag)) return;
    if (!this.validateTagSize(normalizedTag)) return;
    if (!this.debouncer.shouldProcess(normalizedTag)) return;

    this.tagCounter++;
    this.lastTagTimestamp = Date.now();

    const leitura: TagReading = {
      tag: normalizedTag,
      rssi,
      antena: this.antennaNumberToSide(antenaNr),
      antenaNr,
      timestamp: Date.now(),
      contador: this.tagCounter,
    };

    this.ultimaLeitura = leitura;
    this.callbacks.onTag?.(leitura);
    this.callbacks.onNewRead?.(leitura);
    this.checkCurral(normalizedTag);

    // Reset no-tag monitor
    this.startNoTagMonitor();
  }

  private passesFilter(tag: string): boolean {
    if (!this.config.filtro_prefixo) return true;
    return tag.startsWith(this.config.filtro_prefixo.toUpperCase());
  }

  /**
   * Validate tag length matches expected size (tamanho_tag config).
   * If tamanho_tag is 0, any size is accepted.
   */
  private validateTagSize(tag: string): boolean {
    if (this.config.tamanho_tag <= 0) return true;
    return tag.length === this.config.tamanho_tag;
  }

  // ----------------------------------------
  // Curral Identification
  // ----------------------------------------

  /**
   * Match a tag against known curral RFID ranges.
   * For exact matches: tag_inicial -> 'entrada', tag_final -> 'saida'.
   * For range matches: compares lexicographic distance to tag_inicial vs tag_final
   * to determine if the tag is closer to the entrance or exit.
   */
  identificarCurral(
    tag: string,
    currais?: CurralRfid[],
  ): { curral_id: string; tipo: 'entrada' | 'saida'; curral_nome: string } | null {
    const list = currais || this.curraisRfid;
    const normalizedTag = tag.toUpperCase().trim();

    for (const curral of list) {
      const tagInicial = curral.tag_inicial.toUpperCase().trim();
      const tagFinal = curral.tag_final.toUpperCase().trim();

      // Exact match for entrada/saida tags
      if (normalizedTag === tagInicial) {
        return { curral_id: curral.curral_id, tipo: 'entrada', curral_nome: curral.curral_nome };
      }
      if (normalizedTag === tagFinal) {
        return { curral_id: curral.curral_id, tipo: 'saida', curral_nome: curral.curral_nome };
      }

      // Range match (lexicographic comparison)
      if (normalizedTag >= tagInicial && normalizedTag <= tagFinal) {
        // Determine if tag is closer to tag_inicial (entrada) or tag_final (saida)
        const tipo = this.tagCloserTo(normalizedTag, tagInicial, tagFinal);
        return { curral_id: curral.curral_id, tipo, curral_nome: curral.curral_nome };
      }
    }

    return null;
  }

  /**
   * Determine whether a tag is lexicographically closer to tagInicial or tagFinal.
   * Compares character-by-character distance to decide entrada vs saida.
   */
  private tagCloserTo(
    tag: string,
    tagInicial: string,
    tagFinal: string,
  ): 'entrada' | 'saida' {
    // Compute a simple numeric distance using char codes
    let distInicial = 0;
    let distFinal = 0;
    const len = Math.max(tag.length, tagInicial.length, tagFinal.length);

    for (let i = 0; i < len; i++) {
      const t = i < tag.length ? tag.charCodeAt(i) : 0;
      const ini = i < tagInicial.length ? tagInicial.charCodeAt(i) : 0;
      const fin = i < tagFinal.length ? tagFinal.charCodeAt(i) : 0;
      distInicial += Math.abs(t - ini);
      distFinal += Math.abs(t - fin);
    }

    return distInicial <= distFinal ? 'entrada' : 'saida';
  }

  private checkCurral(tag: string) {
    if (this.curraisRfid.length === 0) return;

    const result = this.identificarCurral(tag);
    if (result) {
      this.callbacks.onCurralIdentificado?.(result.curral_id, tag, result.tipo);
    }
  }

  // ----------------------------------------
  // Manual / Simulation
  // ----------------------------------------

  /**
   * Simulate a tag read (for manual mode or testing)
   */
  simularTag(tag: string, rssi: number = -30) {
    this.handleTagRead(tag, rssi, this.currentAntenna);
  }

  // ----------------------------------------
  // Reconnection
  // ----------------------------------------

  private tentarReconexao() {
    if (this.status === 'reconectando') return;

    if (this.reconnectAttempts >= MAX_RECONNECT_ATTEMPTS) {
      this.emitErro(
        `Numero maximo de tentativas de reconexao RFID atingido (${MAX_RECONNECT_ATTEMPTS})`
      );
      this.pararLeitura();
      this.setStatus('erro');
      this.callbacks.onConexao?.(false);
      return;
    }

    this.pararLeitura();
    this.setStatus('reconectando');
    this.reconnectAttempts++;

    console.log(
      `[RfidService] Tentativa de reconexao ${this.reconnectAttempts}/${MAX_RECONNECT_ATTEMPTS}`
    );

    this.reconnectTimeout = setTimeout(async () => {
      try {
        // Reset status so conectar() proceeds
        this.status = 'desconectado';

        // Cleanup old socket/ble before reconnecting
        if (this.socket) {
          try {
            if (typeof this.socket.destroy === 'function') this.socket.destroy();
          } catch { /* ignore */ }
          this.socket = null;
        }
        if (this.bleSubscription) {
          try { this.bleSubscription.remove(); } catch { /* ignore */ }
          this.bleSubscription = null;
        }
        if (this.bleDevice) {
          try {
            if (typeof this.bleDevice.cancelConnection === 'function') {
              await this.bleDevice.cancelConnection();
            }
          } catch { /* ignore */ }
          this.bleDevice = null;
        }

        const connected = await this.conectar();
        if (connected) {
          this.reconnectAttempts = 0;
          this.iniciarLeitura();
        } else if (this.reconnectAttempts < MAX_RECONNECT_ATTEMPTS) {
          this.tentarReconexao();
        }
      } catch {
        if (this.reconnectAttempts < MAX_RECONNECT_ATTEMPTS) {
          this.tentarReconexao();
        }
      }
    }, RECONNECT_DELAY_MS);
  }

  private cancelReconnect() {
    if (this.reconnectTimeout) {
      clearTimeout(this.reconnectTimeout);
      this.reconnectTimeout = null;
    }
  }

  // ----------------------------------------
  // Internal Helpers
  // ----------------------------------------

  private setStatus(newStatus: RFIDStatus, mensagem?: string) {
    if (this.status !== newStatus) {
      this.status = newStatus;
      this.callbacks.onStatus?.(newStatus, mensagem);
    }
  }

  private emitErro(mensagem: string) {
    console.error(`[RfidService] ${mensagem}`);
    this.callbacks.onErro?.(mensagem);
  }
}

// ============================================
// Singleton Export
// ============================================

export const rfidService = new RfidService();
