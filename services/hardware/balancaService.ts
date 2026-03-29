// ============================================
// Balanca (Scale) Communication Service
// Rumo Automacao - Complete Scale Integration
// ============================================
// Protocols: SMA Serial, ESP32 V10 HTTP, BLE, Manual
// Features: Stability detection, auto-reconnection,
//           CRC-16 validation, multi-protocol support
// ============================================
// React Native / Expo compatible - no Node.js or Web APIs

import type {
  BalancaConfig,
  BalancaStatus,
  PesoStatus,
  WeightReading,
  BalancaCallbacks,
  ESP32ScaleResponse,
  SMAStatusChar,
} from './types';
import { DEFAULT_BALANCA_CONFIG } from './types';
import {
  SMA_COMMANDS,
  SMA_EXTENDED_COMMANDS,
  parseSMAResponse,
  parseSMAExtendedResponse,
  parseWeightScaleInformation,
  smaStatusToPesoStatus,
  V10_ENDPOINTS,
} from './protocols';
import type { WeightScaleInformation } from './protocols';

// ============================================
// React Native native module imports
// ============================================
// These are optional peer dependencies. Each transport
// only works if its native library is installed. If not,
// a clear error is thrown at connection time.

let TcpSocket: any = null;
try {
  TcpSocket = require('react-native-tcp-socket');
} catch (e) {
  console.warn('[BalancaService] react-native-tcp-socket nao instalado. TCP nao disponivel.');
}

let RNSerialPort: any = null;
try {
  RNSerialPort = require('react-native-serialport');
} catch (e) {
  console.warn('[BalancaService] react-native-serialport nao instalado. Serial nao disponivel.');
}

let BleManager: any = null;
try {
  const blePlx = require('react-native-ble-plx');
  BleManager = new blePlx.BleManager();
} catch (e) {
  console.warn('[BalancaService] react-native-ble-plx nao instalado. BLE nao disponivel.');
}

// ============================================
// ESP32 BLE UUIDs (Nordic UART Service)
// ============================================

const ESP32_SCALE_SERVICE_UUID = '6E400001-B5A3-F393-E0A9-E50E24DCCA9E'; // Nordic UART
const ESP32_SCALE_TX_CHAR_UUID = '6E400003-B5A3-F393-E0A9-E50E24DCCA9E'; // TX (notifications from device)
const ESP32_SCALE_RX_CHAR_UUID = '6E400002-B5A3-F393-E0A9-E50E24DCCA9E'; // RX (write to device)

// ============================================
// AbortController timeout helper
// ============================================
// AbortSignal.timeout() is not available in older Hermes.
// Use AbortController + setTimeout instead.

function fetchWithTimeout(
  url: string,
  options: RequestInit & { timeoutMs?: number } = {},
): Promise<Response> {
  const { timeoutMs = 5000, ...fetchOptions } = options;
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), timeoutMs);

  // If caller passed a signal, chain it
  if (fetchOptions.signal) {
    const externalSignal = fetchOptions.signal;
    if (externalSignal.aborted) {
      controller.abort();
    } else {
      externalSignal.addEventListener('abort', () => controller.abort());
    }
  }

  return fetch(url, { ...fetchOptions, signal: controller.signal }).finally(() =>
    clearTimeout(timer),
  );
}

// ============================================
// Stability Tracker
// ============================================

class StabilityTracker {
  private readings: Array<{ peso: number; ts: number }> = [];
  private tempoEstabilidade: number;
  private tolerancia: number;
  private faixaEstabilidade: number;
  private maxReadings = 200;

  constructor(config: BalancaConfig) {
    this.tempoEstabilidade = config.min_time_estabilidade;
    this.tolerancia = config.tolerancia_estabilidade_kg;
    this.faixaEstabilidade = config.faixa_estabilidade;
  }

  updateConfig(config: BalancaConfig) {
    this.tempoEstabilidade = config.min_time_estabilidade;
    this.tolerancia = config.tolerancia_estabilidade_kg;
    this.faixaEstabilidade = config.faixa_estabilidade;
  }

  /**
   * Add a weight reading and determine if weight is stable.
   * Stability requires all readings within the time window to be
   * within the tolerance of the current reading.
   */
  addReading(peso: number): boolean {
    const now = Date.now();
    this.readings.push({ peso, ts: now });

    // Trim old readings beyond 2x the stability window
    const cutoff = now - this.tempoEstabilidade * 2;
    this.readings = this.readings.filter(r => r.ts >= cutoff);

    if (this.readings.length > this.maxReadings) {
      this.readings = this.readings.slice(-this.maxReadings);
    }

    return this.isStable(now);
  }

  private isStable(now: number): boolean {
    const windowStart = now - this.tempoEstabilidade;
    const windowReadings = this.readings.filter(r => r.ts >= windowStart);

    if (windowReadings.length < 2) return false;

    const lastPeso = windowReadings[windowReadings.length - 1].peso;

    // All readings within window must be within tolerance of the last reading
    const withinTolerance = windowReadings.every(
      r => Math.abs(r.peso - lastPeso) <= this.tolerancia
    );

    // Also check total range within window is within faixa_estabilidade
    const pesos = windowReadings.map(r => r.peso);
    const min = Math.min(...pesos);
    const max = Math.max(...pesos);
    const withinRange = (max - min) <= this.faixaEstabilidade;

    return withinTolerance && withinRange;
  }

  reset() {
    this.readings = [];
  }
}

// ============================================
// BalancaService Class
// ============================================

class BalancaService {
  private config: BalancaConfig = { ...DEFAULT_BALANCA_CONFIG };
  private status: BalancaStatus = 'desconectada';
  private callbacks: BalancaCallbacks = {};
  private pollingTimer: ReturnType<typeof setInterval> | null = null;
  private reconnectTimeout: ReturnType<typeof setTimeout> | null = null;
  private reconnectAttempts = 0;
  private stabilityTracker: StabilityTracker;
  private ultimaLeitura: WeightReading | null = null;
  private taraAtual = 0;
  private contadorLeituras = 0;
  private abortController: AbortController | null = null;
  private wasStable = false;

  /** Consecutive HTTP failure counter for ESP32 HTTP tolerance */
  private httpConsecutiveFailures = 0;
  private static readonly HTTP_FAILURE_THRESHOLD = 3;

  /** Serial port reference (react-native-serialport or TCP socket) */
  private serialPort: any = null;
  private serialBuffer = '';

  /** BLE device reference (react-native-ble-plx) */
  private bleDevice: any = null;
  private bleSubscription: any = null;

  constructor() {
    this.stabilityTracker = new StabilityTracker(DEFAULT_BALANCA_CONFIG);
  }

  // ----------------------------------------
  // Configuration
  // ----------------------------------------

  configurar(config: Partial<BalancaConfig>, callbacks?: BalancaCallbacks) {
    this.config = { ...this.config, ...config };
    if (config.serial) {
      this.config.serial = { ...this.config.serial, ...config.serial };
    }
    if (config.tcp) {
      this.config.tcp = { ...this.config.tcp, ...config.tcp };
    }
    if (config.v10) {
      this.config.v10 = { ...this.config.v10, ...config.v10 };
    }
    if (callbacks) {
      this.callbacks = { ...this.callbacks, ...callbacks };
    }
    this.stabilityTracker.updateConfig(this.config);
  }

  getConfig(): Readonly<BalancaConfig> {
    return { ...this.config };
  }

  getStatus(): BalancaStatus {
    return this.status;
  }

  getUltimaLeitura(): WeightReading | null {
    return this.ultimaLeitura ? { ...this.ultimaLeitura } : null;
  }

  // ----------------------------------------
  // Event Handler Setters (rumo-confinamento style)
  // ----------------------------------------

  setOnPeso(cb: (leitura: WeightReading) => void) {
    this.callbacks.onPeso = cb;
  }

  setOnPesoEstavel(cb: (leitura: WeightReading) => void) {
    this.callbacks.onPesoEstavel = cb;
  }

  setOnStatus(cb: (status: BalancaStatus, mensagem?: string) => void) {
    this.callbacks.onStatus = cb;
  }

  setOnErro(cb: (erro: string) => void) {
    this.callbacks.onErro = cb;
  }

  // ----------------------------------------
  // Connection
  // ----------------------------------------

  async conectar(): Promise<boolean> {
    if (this.status === 'conectada' || this.status === 'lendo') {
      return true;
    }

    this.setStatus('conectando');
    this.reconnectAttempts = 0;
    this.httpConsecutiveFailures = 0;

    try {
      switch (this.config.protocolo) {
        case 'esp32_http':
          return await this.conectarESP32HTTP();
        case 'esp32_ble':
          return await this.conectarESP32BLE();
        case 'sma':
        case 'digistar':
          return await this.conectarSMA();
        case 'manual':
          this.setStatus('conectada');
          return true;
        default:
          throw new Error(`Protocolo de balanca desconhecido: ${this.config.protocolo}`);
      }
    } catch (err) {
      const msg = err instanceof Error ? err.message : String(err);
      this.emitErro(`Falha ao conectar balanca: ${msg}`);
      this.setStatus('erro');
      return false;
    }
  }

  async desconectar() {
    this.pararLeitura();
    this.cancelReconnect();
    this.reconnectAttempts = 0;
    this.httpConsecutiveFailures = 0;

    if (this.abortController) {
      this.abortController.abort();
      this.abortController = null;
    }

    // Disconnect serial (react-native-serialport or TCP socket)
    if (this.serialPort) {
      try {
        if (typeof this.serialPort.destroy === 'function') {
          // TCP socket
          this.serialPort.destroy();
        } else if (typeof this.serialPort.close === 'function') {
          await this.serialPort.close();
        }
      } catch { /* ignore close errors */ }
      this.serialPort = null;
    }

    // Disconnect RNSerialPort if it was opened
    if (RNSerialPort) {
      try {
        if (typeof RNSerialPort.disconnect === 'function') {
          RNSerialPort.disconnect();
        }
      } catch { /* ignore */ }
    }

    // Disconnect BLE
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

    this.serialBuffer = '';
    this.stabilityTracker.reset();
    this.ultimaLeitura = null;
    this.taraAtual = 0;
    this.contadorLeituras = 0;
    this.wasStable = false;
    this.setStatus('desconectada');
    this.callbacks.onConexao?.(false);
  }

  // ----------------------------------------
  // ESP32 V10 HTTP Connection
  // ----------------------------------------

  private async conectarESP32HTTP(): Promise<boolean> {
    const baseUrl = `http://${this.config.v10.ip}:${this.config.v10.port}`;
    this.abortController = new AbortController();

    try {
      // Try /status first, fall back to /scale/read-weight
      let response: Response;
      try {
        response = await fetchWithTimeout(`${baseUrl}${V10_ENDPOINTS.STATUS}`, {
          method: 'GET',
          timeoutMs: this.config.v10.timeout_ms,
        });
      } catch {
        response = await fetchWithTimeout(`${baseUrl}${V10_ENDPOINTS.SCALE_READ}`, {
          method: 'GET',
          timeoutMs: this.config.v10.timeout_ms,
        });
      }

      if (!response.ok) {
        throw new Error(`HTTP ${response.status}: ${response.statusText}`);
      }

      this.httpConsecutiveFailures = 0;
      this.setStatus('conectada');
      this.callbacks.onConexao?.(true);
      return true;
    } catch (err) {
      throw new Error(
        `Nao foi possivel conectar ao ESP32 em ${this.config.v10.ip}: ${
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
        'Modo BLE nao disponivel. Instale react-native-ble-plx: npx expo install react-native-ble-plx'
      );
    }

    const address = this.config.serial.endereco;
    if (!address) {
      throw new Error('Endereco BLE nao configurado (serial.endereco)');
    }

    try {
      // Connect to device by address
      this.bleDevice = await BleManager.connectToDevice(address, {
        timeout: this.config.v10.timeout_ms,
      });

      await this.bleDevice.discoverAllServicesAndCharacteristics();

      // First try known ESP32 Nordic UART service UUID
      let txCharacteristic: any = null;

      try {
        const services = await this.bleDevice.services();
        for (const service of services) {
          const serviceUUID = service.uuid.toUpperCase();
          const characteristics = await service.characteristics();

          // Check for Nordic UART TX characteristic (preferred)
          if (serviceUUID === ESP32_SCALE_SERVICE_UUID.toUpperCase()) {
            for (const char of characteristics) {
              if (char.uuid.toUpperCase() === ESP32_SCALE_TX_CHAR_UUID.toUpperCase()) {
                txCharacteristic = char;
                break;
              }
            }
          }

          // Fallback: find any notifiable characteristic
          if (!txCharacteristic) {
            for (const char of characteristics) {
              if (char.isNotifiable || char.isIndicatable) {
                txCharacteristic = char;
                break;
              }
            }
          }

          if (txCharacteristic) break;
        }
      } catch (err) {
        throw new Error(
          `Falha ao descobrir servicos BLE: ${err instanceof Error ? err.message : String(err)}`
        );
      }

      if (!txCharacteristic) {
        throw new Error('Caracteristica BLE de peso nao encontrada no dispositivo');
      }

      // Set up notifications for weight data using monitorCharacteristicForDevice
      this.bleSubscription = this.bleDevice.monitorCharacteristicForService(
        txCharacteristic.serviceUUID,
        txCharacteristic.uuid,
        (error: any, characteristic: any) => {
          if (error) {
            this.emitErro(`BLE notification error: ${error.message}`);
            if (this.status !== 'desconectada') {
              this.tentarReconexao();
            }
            return;
          }
          if (characteristic?.value) {
            // Decode base64 value to string and process
            const decoded = this.decodeBase64(characteristic.value);
            this.processSerialData(decoded);
          }
        },
      );

      // Monitor disconnection
      BleManager.onDeviceDisconnected(address, (error: any, device: any) => {
        if (this.status !== 'desconectada') {
          this.emitErro('Dispositivo BLE desconectado');
          this.tentarReconexao();
        }
      });

      this.setStatus('conectada');
      this.callbacks.onConexao?.(true);
      return true;
    } catch (err) {
      throw new Error(
        `Falha na conexao BLE: ${err instanceof Error ? err.message : String(err)}`
      );
    }
  }

  private decodeBase64(base64: string): string {
    try {
      if (typeof atob === 'function') {
        return atob(base64);
      }
      // React Native polyfill fallback
      const chars = 'ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789+/';
      let result = '';
      let i = 0;
      const str = base64.replace(/[^A-Za-z0-9+/]/g, '');
      while (i < str.length) {
        const a = chars.indexOf(str.charAt(i++));
        const b = chars.indexOf(str.charAt(i++));
        const c = chars.indexOf(str.charAt(i++));
        const d = chars.indexOf(str.charAt(i++));
        const n = (a << 18) | (b << 12) | (c << 6) | d;
        result += String.fromCharCode((n >> 16) & 0xFF);
        if (c !== 64) result += String.fromCharCode((n >> 8) & 0xFF);
        if (d !== 64) result += String.fromCharCode(n & 0xFF);
      }
      return result;
    } catch {
      return base64;
    }
  }

  // ----------------------------------------
  // SMA Serial Connection
  // ----------------------------------------

  private async conectarSMA(): Promise<boolean> {
    // Strategy 1: react-native-serialport (USB OTG / hardware serial)
    if (RNSerialPort) {
      try {
        return await this.conectarSMASerial();
      } catch (err) {
        console.warn(
          `[BalancaService] Serial falhou, tentando TCP: ${
            err instanceof Error ? err.message : String(err)
          }`
        );
      }
    }

    // Strategy 2: TCP connection (some scales expose SMA over TCP)
    if (this.config.tcp.ip && this.config.tcp.port) {
      return await this.conectarSMATCP();
    }

    // Strategy 3: External bridge via processSerialData() / processExternalData()
    // Only allow if explicitly configured (no silent "conectado" fallback)
    if (this.config.serial.endereco === 'external_bridge') {
      console.warn(
        '[BalancaService] Modo external_bridge ativo. Use processSerialData() para alimentar dados SMA.'
      );
      this.setStatus('conectada');
      this.callbacks.onConexao?.(true);
      return true;
    }

    // No transport available - throw clear error
    throw new Error(
      'Nenhum transporte serial disponivel. Opcoes:\n' +
      '  - Instale react-native-serialport: npx expo install react-native-serialport\n' +
      '  - Configure TCP (config.tcp.ip e config.tcp.port)\n' +
      '  - Use serial.endereco = "external_bridge" com processSerialData()'
    );
  }

  private async conectarSMASerial(): Promise<boolean> {
    if (!RNSerialPort) {
      throw new Error(
        'Modo Serial nao disponivel. Instale react-native-serialport: npx expo install react-native-serialport'
      );
    }

    return new Promise((resolve, reject) => {
      try {
        const devicePath = this.config.serial.endereco || '/dev/ttyUSB0';
        const baudRate = this.config.serial.baudRate;

        // Set up data listener before connecting
        RNSerialPort.setReturnedDataType(
          RNSerialPort.DATA_TYPES?.INTARRAY ?? 1
        );

        // Listen for incoming serial data
        if (typeof RNSerialPort.onReceived === 'function') {
          RNSerialPort.onReceived((data: any) => {
            try {
              let text: string;
              if (data && data.payload) {
                // Convert int array to string (latin1/iso-8859-1 encoding)
                if (Array.isArray(data.payload)) {
                  text = String.fromCharCode(...data.payload);
                } else if (typeof data.payload === 'string') {
                  text = data.payload;
                } else {
                  text = String(data.payload);
                }
              } else if (typeof data === 'string') {
                text = data;
              } else {
                return;
              }
              this.processSerialData(text);
            } catch (err) {
              this.emitErro(
                `Erro ao processar dados serial: ${err instanceof Error ? err.message : String(err)}`
              );
            }
          });
        }

        // Listen for errors
        if (typeof RNSerialPort.onError === 'function') {
          RNSerialPort.onError((error: any) => {
            this.emitErro(`Serial error: ${error?.message || String(error)}`);
            if (this.status !== 'desconectada') {
              this.tentarReconexao();
            }
          });
        }

        // Connect
        RNSerialPort.connectDevice(devicePath, baudRate);

        // Mark as connected
        this.serialPort = { type: 'rn-serialport', devicePath };
        console.log(`[BalancaService] Conectado via Serial a ${devicePath} @ ${baudRate} bps`);
        this.setStatus('conectada');
        this.callbacks.onConexao?.(true);
        resolve(true);
      } catch (err) {
        reject(
          new Error(
            `Falha ao abrir porta serial: ${err instanceof Error ? err.message : String(err)}`
          )
        );
      }
    });
  }

  private async conectarSMATCP(): Promise<boolean> {
    if (!TcpSocket) {
      throw new Error(
        'Modo TCP nao disponivel. Instale react-native-tcp-socket: npx expo install react-native-tcp-socket'
      );
    }

    return new Promise((resolve, reject) => {
      try {
        const options = {
          port: this.config.tcp.port,
          host: this.config.tcp.ip,
          reuseAddress: true,
        };

        this.serialPort = TcpSocket.createConnection(options, () => {
          console.log(
            `[BalancaService] Conectado via TCP a ${this.config.tcp.ip}:${this.config.tcp.port}`
          );
          this.setStatus('conectada');
          this.callbacks.onConexao?.(true);
          resolve(true);
        });

        this.serialPort.on('data', (data: any) => {
          // react-native-tcp-socket can return Buffer or string
          let text: string;
          if (typeof data === 'string') {
            text = data;
          } else if (data && typeof data.toString === 'function') {
            text = data.toString('latin1');
          } else {
            text = String(data);
          }
          this.processSerialData(text);
        });

        this.serialPort.on('error', (err: Error) => {
          this.emitErro(`TCP error: ${err.message}`);
          if (this.status !== 'desconectada') {
            this.tentarReconexao();
          }
        });

        this.serialPort.on('close', () => {
          if (this.status !== 'desconectada') {
            this.tentarReconexao();
          }
        });

        // Connection timeout
        const timeoutTimer = setTimeout(() => {
          if (this.status === 'conectando') {
            this.serialPort?.destroy();
            this.serialPort = null;
            reject(new Error(`Timeout ao conectar TCP a ${this.config.tcp.ip}:${this.config.tcp.port}`));
          }
        }, this.config.v10.timeout_ms);

        this.serialPort.on('connect', () => {
          clearTimeout(timeoutTimer);
        });
      } catch (err) {
        reject(
          new Error(
            `Falha ao criar socket TCP: ${err instanceof Error ? err.message : String(err)}`
          )
        );
      }
    });
  }

  // ----------------------------------------
  // External Data Feed
  // ----------------------------------------

  /**
   * Feed raw serial data from an external serial bridge (React Native native module, etc.)
   * Buffers data and processes complete lines (CR/LF terminated).
   */
  processSerialData(data: string) {
    this.serialBuffer += data;

    // Process complete lines (CR/LF or LF terminated)
    let lineEnd: number;
    while ((lineEnd = this.serialBuffer.indexOf('\n')) !== -1) {
      const line = this.serialBuffer.substring(0, lineEnd + 1);
      this.serialBuffer = this.serialBuffer.substring(lineEnd + 1);
      this.handleSMALine(line);
    }

    // Prevent buffer overflow
    if (this.serialBuffer.length > 4096) {
      this.serialBuffer = this.serialBuffer.slice(-512);
    }
  }

  /**
   * Feed a pre-parsed weight reading from an external source
   * (native module, custom bridge, etc.)
   */
  processExternalData(pesoKg: number, estavel: boolean, raw?: string) {
    const resolucao = this.config.resolucao_kg;
    const pesoArredondado =
      resolucao > 0 ? Math.round(pesoKg / resolucao) * resolucao : pesoKg;

    const estavelAlg = this.stabilityTracker.addReading(pesoArredondado);
    const isEstavel = estavel || estavelAlg;

    let status: PesoStatus = isEstavel ? 'estavel' : 'instavel';
    if (pesoArredondado > this.config.capacidade_max_kg) status = 'sobrecarga';
    if (pesoArredondado < this.config.capacidade_min_kg && pesoArredondado !== 0)
      status = 'subcarga';

    this.contadorLeituras++;

    const leitura: WeightReading = {
      peso_bruto_kg: pesoArredondado,
      peso_liquido_kg: pesoArredondado - this.taraAtual,
      tara_kg: this.taraAtual,
      status,
      estavel: isEstavel,
      timestamp: Date.now(),
      unidade: 'kg',
      contador: this.contadorLeituras,
      raw,
    };

    this.ultimaLeitura = leitura;
    this.callbacks.onPeso?.(leitura);

    if (isEstavel && !this.wasStable) {
      this.callbacks.onPesoEstavel?.(leitura);
    }
    this.wasStable = isEstavel;
  }

  private handleSMALine(line: string) {
    const parsed = parseSMAResponse(line);
    if (!parsed) return;

    const pesoStatus = smaStatusToPesoStatus(parsed.status) as PesoStatus;
    const pesoBruto = parsed.weight;

    // Apply resolution rounding
    const resolucao = this.config.resolucao_kg;
    const pesoArredondado = resolucao > 0
      ? Math.round(pesoBruto / resolucao) * resolucao
      : pesoBruto;

    // Check capacity limits
    let status = pesoStatus;
    if (pesoArredondado > this.config.capacidade_max_kg) status = 'sobrecarga';
    if (pesoArredondado < this.config.capacidade_min_kg && pesoArredondado !== 0) status = 'subcarga';

    const estavelHw = parsed.status === 'S';
    const estavelAlg = this.stabilityTracker.addReading(pesoArredondado);
    const estavel = estavelHw || estavelAlg;

    this.contadorLeituras++;

    const leitura: WeightReading = {
      peso_bruto_kg: pesoArredondado,
      peso_liquido_kg: pesoArredondado - this.taraAtual,
      tara_kg: this.taraAtual,
      status: estavel ? 'estavel' : status,
      estavel,
      timestamp: Date.now(),
      unidade: parsed.unit,
      contador: this.contadorLeituras,
      raw: line.trim(),
    };

    this.ultimaLeitura = leitura;
    this.callbacks.onPeso?.(leitura);

    // Fire stable event only on transition to stable
    if (estavel && !this.wasStable) {
      this.callbacks.onPesoEstavel?.(leitura);
    }
    this.wasStable = estavel;
  }

  // ----------------------------------------
  // Reading Control
  // ----------------------------------------

  iniciarLeitura() {
    if (this.pollingTimer) return;

    if (this.status !== 'conectada' && this.status !== 'lendo') {
      this.emitErro('Balanca nao conectada. Conecte antes de iniciar leitura.');
      return;
    }

    this.setStatus('lendo');
    this.stabilityTracker.reset();
    this.wasStable = false;

    // SMA serial: send continuous reading command if using direct serial
    if (
      (this.config.protocolo === 'sma' || this.config.protocolo === 'digistar') &&
      this.serialPort
    ) {
      this.sendSerial(SMA_COMMANDS.CONTINUO).catch(() => {});
    }

    // ESP32 HTTP: poll at configured interval (default 500ms for ESP32 reliability)
    if (this.config.protocolo === 'esp32_http') {
      const pollInterval = Math.max(this.config.intervalo_leitura_ms, 500);
      this.pollingTimer = setInterval(async () => {
        try {
          await this.executarLeitura();
          this.httpConsecutiveFailures = 0; // Reset on success
        } catch (err) {
          this.httpConsecutiveFailures++;
          const msg = err instanceof Error ? err.message : String(err);

          if (this.httpConsecutiveFailures >= BalancaService.HTTP_FAILURE_THRESHOLD) {
            this.emitErro(
              `${this.httpConsecutiveFailures} falhas consecutivas na leitura HTTP: ${msg}`
            );
            this.httpConsecutiveFailures = 0;
            this.tentarReconexao();
          } else {
            console.warn(
              `[BalancaService] Falha HTTP ${this.httpConsecutiveFailures}/${BalancaService.HTTP_FAILURE_THRESHOLD}: ${msg}`
            );
          }
        }
      }, pollInterval);
    } else if (this.config.protocolo === 'esp32_ble') {
      // BLE uses notifications, no polling needed.
      // But we can poll for connection health checks.
    } else if (
      (this.config.protocolo === 'sma' || this.config.protocolo === 'digistar') &&
      !this.serialPort
    ) {
      // SMA without direct serial: poll with weight commands
      // (for external bridge or TCP)
      this.pollingTimer = setInterval(async () => {
        try {
          await this.executarLeitura();
        } catch (err) {
          const msg = err instanceof Error ? err.message : String(err);
          this.emitErro(`Erro na leitura SMA: ${msg}`);
        }
      }, this.config.intervalo_leitura_ms);
    }
  }

  pararLeitura() {
    if (this.pollingTimer) {
      clearInterval(this.pollingTimer);
      this.pollingTimer = null;
    }

    // Stop continuous SMA reading
    if (
      (this.config.protocolo === 'sma' || this.config.protocolo === 'digistar') &&
      this.serialPort
    ) {
      this.sendSerial(SMA_COMMANDS.PARAR_CONTINUO).catch(() => {});
    }

    if (this.status === 'lendo') {
      this.setStatus('conectada');
    }
  }

  // ----------------------------------------
  // Single Read
  // ----------------------------------------

  async lerPeso(): Promise<WeightReading | null> {
    try {
      switch (this.config.protocolo) {
        case 'esp32_http':
          return await this.lerPesoESP32HTTP();
        case 'sma':
        case 'digistar':
          return await this.lerPesoSMA();
        case 'manual':
          return this.ultimaLeitura;
        default:
          return null;
      }
    } catch (err) {
      const msg = err instanceof Error ? err.message : String(err);
      this.emitErro(`Erro ao ler peso: ${msg}`);
      return null;
    }
  }

  private async executarLeitura() {
    const leitura = await this.lerPeso();
    if (leitura) {
      this.ultimaLeitura = leitura;
      this.callbacks.onPeso?.(leitura);

      if (leitura.estavel && !this.wasStable) {
        this.callbacks.onPesoEstavel?.(leitura);
      }
      this.wasStable = leitura.estavel;
    }
  }

  // ----------------------------------------
  // ESP32 HTTP Read
  // ----------------------------------------

  private async lerPesoESP32HTTP(): Promise<WeightReading> {
    const url = `http://${this.config.v10.ip}:${this.config.v10.port}${V10_ENDPOINTS.SCALE_READ}`;

    const response = await fetchWithTimeout(url, {
      method: 'GET',
      headers: { 'Accept': 'application/json' },
      timeoutMs: this.config.v10.timeout_ms,
    });

    if (!response.ok) {
      throw new Error(`HTTP ${response.status}`);
    }

    const data = await response.json();
    // Support multiple response formats
    const scale = data.Scale || data.scale || data;

    const pesoBruto = parseFloat(scale.weight ?? scale.peso_bruto ?? 0);
    const tara = parseFloat(scale.tare ?? scale.tara ?? 0);
    const pesoLiquido = parseFloat(scale.netWeight ?? scale.peso_liquido ?? (pesoBruto - tara));
    const estavelHw = scale.stable === true || scale.stable === 1 || scale.estavel === true;
    const contador = parseInt(scale.counter ?? scale.contador ?? 0);

    // Apply resolution rounding
    const resolucao = this.config.resolucao_kg;
    const pesoArredondado = resolucao > 0
      ? Math.round(pesoBruto / resolucao) * resolucao
      : pesoBruto;

    const estavelAlg = this.stabilityTracker.addReading(pesoArredondado);
    const estavel = estavelHw && estavelAlg;

    // Check capacity
    let status: PesoStatus = estavel ? 'estavel' : 'instavel';
    if (pesoArredondado > this.config.capacidade_max_kg) status = 'sobrecarga';
    if (pesoArredondado < this.config.capacidade_min_kg && pesoArredondado !== 0) status = 'subcarga';

    this.taraAtual = tara;
    this.contadorLeituras++;

    return {
      peso_bruto_kg: pesoArredondado,
      peso_liquido_kg: resolucao > 0
        ? Math.round(pesoLiquido / resolucao) * resolucao
        : pesoLiquido,
      tara_kg: tara,
      status,
      estavel,
      timestamp: Date.now(),
      unidade: 'kg',
      contador: this.contadorLeituras,
    };
  }

  // ----------------------------------------
  // SMA Read (sends command, waits for response)
  // ----------------------------------------

  private async lerPesoSMA(): Promise<WeightReading | null> {
    if (!this.serialPort) {
      // If using external bridge, return last available reading
      return this.ultimaLeitura;
    }

    // For TCP sockets or react-native-serialport
    try {
      await this.sendSerial(SMA_COMMANDS.PESO);
      // Response will arrive via data event and processSerialData
      // Return last reading (will be updated when response arrives)
      return this.ultimaLeitura;
    } catch {
      return this.ultimaLeitura;
    }
  }

  // ----------------------------------------
  // Scale Commands
  // ----------------------------------------

  /** Send zero command to scale */
  async zero(): Promise<boolean> {
    try {
      switch (this.config.protocolo) {
        case 'esp32_http': {
          const url = `http://${this.config.v10.ip}:${this.config.v10.port}${V10_ENDPOINTS.SCALE_ZERO}`;
          const resp = await fetchWithTimeout(url, {
            method: 'POST',
            timeoutMs: this.config.v10.timeout_ms,
          });
          this.stabilityTracker.reset();
          return resp.ok;
        }
        case 'sma':
        case 'digistar':
          await this.sendSerial(SMA_COMMANDS.ZERO);
          this.stabilityTracker.reset();
          return true;
        case 'manual':
          this.taraAtual = 0;
          this.stabilityTracker.reset();
          if (this.ultimaLeitura) {
            this.ultimaLeitura = {
              ...this.ultimaLeitura,
              peso_bruto_kg: 0,
              peso_liquido_kg: 0,
              tara_kg: 0,
              timestamp: Date.now(),
            };
          }
          return true;
        default:
          return false;
      }
    } catch (err) {
      this.emitErro(`Falha no comando zero: ${err instanceof Error ? err.message : String(err)}`);
      return false;
    }
  }

  /** Send tare command to scale */
  async tara(): Promise<boolean> {
    try {
      switch (this.config.protocolo) {
        case 'esp32_http': {
          const url = `http://${this.config.v10.ip}:${this.config.v10.port}${V10_ENDPOINTS.SCALE_TARE}`;
          const resp = await fetchWithTimeout(url, {
            method: 'POST',
            timeoutMs: this.config.v10.timeout_ms,
          });
          return resp.ok;
        }
        case 'sma':
        case 'digistar':
          await this.sendSerial(SMA_COMMANDS.TARA);
          if (this.ultimaLeitura) {
            this.taraAtual = this.ultimaLeitura.peso_bruto_kg;
          }
          return true;
        case 'manual':
          if (this.ultimaLeitura) {
            this.taraAtual = this.ultimaLeitura.peso_bruto_kg;
            this.ultimaLeitura = {
              ...this.ultimaLeitura,
              tara_kg: this.taraAtual,
              peso_liquido_kg: 0,
              timestamp: Date.now(),
            };
          }
          return true;
        default:
          return false;
      }
    } catch (err) {
      this.emitErro(`Falha no comando tara: ${err instanceof Error ? err.message : String(err)}`);
      return false;
    }
  }

  /** Clear tare (reset tare to 0) */
  async limparTara(): Promise<boolean> {
    try {
      switch (this.config.protocolo) {
        case 'sma':
        case 'digistar':
          await this.sendSerial(SMA_COMMANDS.LIMPAR_TARA);
          this.taraAtual = 0;
          return true;
        case 'manual':
          this.taraAtual = 0;
          if (this.ultimaLeitura) {
            this.ultimaLeitura = {
              ...this.ultimaLeitura,
              tara_kg: 0,
              peso_liquido_kg: this.ultimaLeitura.peso_bruto_kg,
              timestamp: Date.now(),
            };
          }
          return true;
        default:
          return false;
      }
    } catch (err) {
      this.emitErro(`Falha ao limpar tara: ${err instanceof Error ? err.message : String(err)}`);
      return false;
    }
  }

  /** Request high resolution weight */
  async lerAltaResolucao(): Promise<void> {
    if (this.config.protocolo === 'sma' || this.config.protocolo === 'digistar') {
      await this.sendSerial(SMA_COMMANDS.ALTA_RESOLUCAO);
    }
  }

  /** Request scale status/info */
  async lerStatus(): Promise<void> {
    if (this.config.protocolo === 'sma' || this.config.protocolo === 'digistar') {
      await this.sendSerial(SMA_COMMANDS.STATUS);
    }
  }

  /** Send SMA extended command: auto-zero */
  async setAutoZero(enabled: boolean): Promise<void> {
    if (this.config.protocolo === 'sma' || this.config.protocolo === 'digistar') {
      await this.sendSerial(`${SMA_EXTENDED_COMMANDS.AUTO_ZERO}${enabled ? '1' : '0'}`);
    }
  }

  /** Set weight manually (for manual protocol mode or testing) */
  setPesoManual(pesoKg: number) {
    const estavel = this.stabilityTracker.addReading(pesoKg);
    this.contadorLeituras++;

    const leitura: WeightReading = {
      peso_bruto_kg: pesoKg,
      peso_liquido_kg: pesoKg - this.taraAtual,
      tara_kg: this.taraAtual,
      status: 'manual',
      estavel,
      timestamp: Date.now(),
      unidade: 'kg',
      contador: this.contadorLeituras,
    };

    this.ultimaLeitura = leitura;
    this.callbacks.onPeso?.(leitura);

    if (estavel) {
      this.callbacks.onPesoEstavel?.(leitura);
    }
  }

  // ----------------------------------------
  // SMA Extended Commands
  // ----------------------------------------

  /** Set a specific tare weight value */
  async setTareValue(value: number): Promise<boolean> {
    try {
      if (this.config.protocolo === 'sma' || this.config.protocolo === 'digistar') {
        await this.sendSerial(SMA_COMMANDS.SET_TARA_VALUE(value));
        this.taraAtual = value;
        return true;
      }
      return false;
    } catch (err) {
      this.emitErro(`Falha ao definir valor de tara: ${err instanceof Error ? err.message : String(err)}`);
      return false;
    }
  }

  /** Get current tare weight from scale */
  async returnTare(): Promise<number> {
    try {
      if (this.config.protocolo === 'sma' || this.config.protocolo === 'digistar') {
        await this.sendSerial(SMA_COMMANDS.RETURN_TARE);
      }
      return this.taraAtual;
    } catch (err) {
      this.emitErro(`Falha ao retornar tara: ${err instanceof Error ? err.message : String(err)}`);
      return this.taraAtual;
    }
  }

  /** Get gross weight (normal resolution) */
  async grossWeight(): Promise<WeightReading | null> {
    try {
      if (this.config.protocolo === 'sma' || this.config.protocolo === 'digistar') {
        await this.sendSerial(SMA_COMMANDS.GROSS_WEIGHT);
      }
      return this.ultimaLeitura;
    } catch (err) {
      this.emitErro(`Falha ao ler peso bruto: ${err instanceof Error ? err.message : String(err)}`);
      return null;
    }
  }

  /** Disable auto-zero */
  async autoZeroOff(): Promise<void> {
    if (this.config.protocolo === 'sma' || this.config.protocolo === 'digistar') {
      await this.sendSerial(SMA_EXTENDED_COMMANDS.AUTO_ZERO_OFF);
    }
  }

  /** Get current auto-zero value */
  async getAutoZeroValue(): Promise<void> {
    if (this.config.protocolo === 'sma' || this.config.protocolo === 'digistar') {
      await this.sendSerial(SMA_EXTENDED_COMMANDS.GET_AUTO_ZERO_VALUE);
    }
  }

  /** Get sensor name */
  async getSensorName(): Promise<void> {
    if (this.config.protocolo === 'sma' || this.config.protocolo === 'digistar') {
      await this.sendSerial(SMA_EXTENDED_COMMANDS.GET_SENSOR_NAME);
    }
  }

  /** Calibrate scale with 3 parameters */
  async calibrate(p1: string, p2: string, p3: string): Promise<void> {
    if (this.config.protocolo === 'sma' || this.config.protocolo === 'digistar') {
      await this.sendSerial(SMA_EXTENDED_COMMANDS.CALIBRAR(p1, p2, p3));
    }
  }

  /** Get calibration data */
  async getCalibData(): Promise<void> {
    if (this.config.protocolo === 'sma' || this.config.protocolo === 'digistar') {
      await this.sendSerial(SMA_EXTENDED_COMMANDS.CALIB_DATA);
    }
  }

  /** Get scale information (requires SMA protocol, parses STATUS response) */
  async getScaleInformation(): Promise<WeightScaleInformation | null> {
    try {
      if (this.config.protocolo === 'sma' || this.config.protocolo === 'digistar') {
        await this.sendSerial(SMA_COMMANDS.STATUS);
        // The response will arrive asynchronously via processSerialData.
        // For TCP/serial, we wait briefly for the response.
        await new Promise(resolve => setTimeout(resolve, 500));

        // Try to parse the last received data as scale info
        if (this.ultimaLeitura?.raw) {
          return parseWeightScaleInformation(this.ultimaLeitura.raw);
        }
      }
      return null;
    } catch (err) {
      this.emitErro(`Falha ao obter informacoes da balanca: ${err instanceof Error ? err.message : String(err)}`);
      return null;
    }
  }

  // ----------------------------------------
  // Serial I/O Helpers
  // ----------------------------------------

  private async sendSerial(command: string): Promise<void> {
    // react-native-serialport
    if (this.serialPort?.type === 'rn-serialport' && RNSerialPort) {
      try {
        if (typeof RNSerialPort.writeString === 'function') {
          RNSerialPort.writeString(command);
        } else if (typeof RNSerialPort.write === 'function') {
          // Convert string to int array for write()
          const bytes = [];
          for (let i = 0; i < command.length; i++) {
            bytes.push(command.charCodeAt(i));
          }
          RNSerialPort.write(bytes);
        }
      } catch (err) {
        throw new Error(
          `Falha ao enviar comando serial: ${err instanceof Error ? err.message : String(err)}`
        );
      }
      return;
    }

    // TCP socket (react-native-tcp-socket)
    if (this.serialPort && typeof this.serialPort.write === 'function') {
      return new Promise((resolve, reject) => {
        try {
          this.serialPort.write(command, 'latin1', (err: Error | null) => {
            if (err) reject(err);
            else resolve();
          });
        } catch (err) {
          reject(err);
        }
      });
    }

    // BLE write (if connected via BLE with RX characteristic)
    if (this.bleDevice && BleManager) {
      try {
        // Encode command to base64 for BLE write
        const base64Command = this.encodeBase64(command);
        await this.bleDevice.writeCharacteristicWithResponseForService(
          ESP32_SCALE_SERVICE_UUID,
          ESP32_SCALE_RX_CHAR_UUID,
          base64Command,
        );
      } catch (err) {
        throw new Error(
          `Falha ao enviar comando BLE: ${err instanceof Error ? err.message : String(err)}`
        );
      }
      return;
    }

    console.warn('[BalancaService] Nenhum meio de envio serial disponivel');
  }

  private encodeBase64(str: string): string {
    try {
      if (typeof btoa === 'function') {
        return btoa(str);
      }
      // Manual base64 encoding fallback for Hermes
      const chars = 'ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789+/';
      let result = '';
      let i = 0;
      while (i < str.length) {
        const a = str.charCodeAt(i++);
        const b = i < str.length ? str.charCodeAt(i++) : 0;
        const c = i < str.length ? str.charCodeAt(i++) : 0;
        const n = (a << 16) | (b << 8) | c;
        result += chars[(n >> 18) & 63];
        result += chars[(n >> 12) & 63];
        result += i - 2 < str.length ? chars[(n >> 6) & 63] : '=';
        result += i - 1 < str.length ? chars[n & 63] : '=';
      }
      return result;
    } catch {
      return str;
    }
  }

  // ----------------------------------------
  // Reconnection
  // ----------------------------------------

  private tentarReconexao() {
    if (this.status === 'reconectando') return;
    if (this.reconnectAttempts >= this.config.max_tentativas_reconexao) {
      this.emitErro(
        `Numero maximo de tentativas de reconexao atingido (${this.config.max_tentativas_reconexao})`
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
      `[BalancaService] Tentativa de reconexao ${this.reconnectAttempts}/${this.config.max_tentativas_reconexao}`
    );

    this.reconnectTimeout = setTimeout(async () => {
      try {
        const connected = await this.conectar();
        if (connected) {
          this.reconnectAttempts = 0;
          this.iniciarLeitura();
        } else if (this.reconnectAttempts < this.config.max_tentativas_reconexao) {
          this.tentarReconexao();
        }
      } catch {
        if (this.reconnectAttempts < this.config.max_tentativas_reconexao) {
          this.tentarReconexao();
        }
      }
    }, this.config.intervalo_reconexao_ms);
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

  private setStatus(newStatus: BalancaStatus, mensagem?: string) {
    if (this.status !== newStatus) {
      this.status = newStatus;
      this.callbacks.onStatus?.(newStatus, mensagem);
    }
  }

  private emitErro(mensagem: string) {
    console.error(`[BalancaService] ${mensagem}`);
    this.callbacks.onErro?.(mensagem);
  }
}

// ============================================
// Singleton Export
// ============================================

export const balancaService = new BalancaService();
