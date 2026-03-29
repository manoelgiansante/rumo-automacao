// ============================================
// LED Display Communication Service
// Rumo Automacao - Complete LED Display Integration
// ============================================
// Protocols: Triunfo Serial, ESP32 V10 HTTP,
//            CentralGA Serial, Manual
// Features: Weight display, curral info, time,
//           intensity control, diacritics removal
// ============================================

import type {
  DisplayConfig,
  DisplayStatus,
  DisplayCallbacks,
  LineVM,
  LedUpdateVM,
} from './types';
import { DEFAULT_DISPLAY_CONFIG } from './types';
import {
  buildTriunfoFrame,
  buildTriunfoFrameWithIntensity,
  buildCentralGAFrame,
  buildCentralGATimeFrame,
  V10_ENDPOINTS,
  removeDiacritics,
} from './protocols';

// ============================================
// LedDisplayService Class
// ============================================

class LedDisplayService {
  private config: DisplayConfig = { ...DEFAULT_DISPLAY_CONFIG };
  private status: DisplayStatus = 'desconectado';
  private callbacks: DisplayCallbacks = {};
  private serialPort: any = null;
  private currentLines: Map<number, string> = new Map();

  /** External serial sender for React Native native modules */
  private externalSerialSender: ((data: string) => void) | null = null;
  /** External binary sender for Uint8Array data */
  private externalBinarySender: ((data: Uint8Array) => void) | null = null;

  // ----------------------------------------
  // Configuration
  // ----------------------------------------

  configurar(config: Partial<DisplayConfig>, callbacks?: DisplayCallbacks) {
    this.config = { ...this.config, ...config };
    if (config.v10) {
      this.config.v10 = { ...this.config.v10, ...config.v10 };
    }
    if (config.serial) {
      this.config.serial = { ...this.config.serial, ...config.serial };
    }
    if (callbacks) {
      this.callbacks = { ...this.callbacks, ...callbacks };
    }
  }

  getConfig(): Readonly<DisplayConfig> {
    return { ...this.config };
  }

  getStatus(): DisplayStatus {
    return this.status;
  }

  getCurrentLines(): Map<number, string> {
    return new Map(this.currentLines);
  }

  // ----------------------------------------
  // Event Handler Setters
  // ----------------------------------------

  setOnStatus(cb: (status: DisplayStatus) => void) {
    this.callbacks.onStatus = cb;
  }

  setOnErro(cb: (erro: string) => void) {
    this.callbacks.onErro = cb;
  }

  /**
   * Set external serial sender for React Native native modules.
   * Called instead of Web Serial API when a native serial bridge is available.
   */
  setExternalSerialSender(sender: (data: string) => void) {
    this.externalSerialSender = sender;
  }

  /**
   * Set external binary sender for protocols that require Uint8Array.
   */
  setExternalBinarySender(sender: (data: Uint8Array) => void) {
    this.externalBinarySender = sender;
  }

  // ----------------------------------------
  // Connection
  // ----------------------------------------

  async conectar(): Promise<boolean> {
    if (this.status === 'conectado') return true;

    this.setStatus('conectando');

    try {
      switch (this.config.protocolo) {
        case 'esp32_http':
          return await this.conectarESP32();
        case 'triunfo_serial':
        case 'centralga':
          return await this.conectarSerial();
        case 'manual':
          this.setStatus('conectado');
          return true;
        default:
          throw new Error(`Protocolo de display desconhecido: ${this.config.protocolo}`);
      }
    } catch (err) {
      const msg = err instanceof Error ? err.message : String(err);
      this.emitErro(`Falha ao conectar display: ${msg}`);
      this.setStatus('erro');
      return false;
    }
  }

  async desconectar() {
    if (this.serialPort) {
      try {
        if (typeof this.serialPort.close === 'function') {
          await this.serialPort.close();
        }
      } catch { /* ignore */ }
      this.serialPort = null;
    }

    this.currentLines.clear();
    this.setStatus('desconectado');
    this.callbacks.onConexao?.(false);
  }

  // ----------------------------------------
  // ESP32 V10 HTTP Connection
  // ----------------------------------------

  private async conectarESP32(): Promise<boolean> {
    try {
      const url = `http://${this.config.v10.ip}:${this.config.v10.port}${V10_ENDPOINTS.LED_WRITE}`;
      const response = await fetch(url, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ lines: [] }),
        signal: AbortSignal.timeout(this.config.v10.timeout_ms),
      });

      if (!response.ok) {
        throw new Error(`HTTP ${response.status}`);
      }

      this.setStatus('conectado');
      this.callbacks.onConexao?.(true);
      return true;
    } catch (err) {
      throw new Error(
        `Nao foi possivel conectar ao display ESP32 em ${this.config.v10.ip}: ${
          err instanceof Error ? err.message : String(err)
        }`
      );
    }
  }

  // ----------------------------------------
  // Serial Connection (Triunfo / CentralGA)
  // ----------------------------------------

  private async conectarSerial(): Promise<boolean> {
    // Web Serial API (browser)
    if (typeof navigator !== 'undefined' && 'serial' in navigator) {
      try {
        const serial = (navigator as any).serial;
        this.serialPort = await serial.requestPort();
        await this.serialPort.open({
          baudRate: this.config.serial.baudRate,
          dataBits: this.config.serial.dataBits,
          parity: this.config.serial.parity,
          stopBits: this.config.serial.stopBits,
        });
        this.setStatus('conectado');
        this.callbacks.onConexao?.(true);
        return true;
      } catch (err) {
        throw new Error(
          `Falha ao abrir porta serial do display: ${err instanceof Error ? err.message : String(err)}`
        );
      }
    }

    // React Native serial port (native module)
    let RNSerialPort: any = null;
    try {
      RNSerialPort = require('react-native-serialport');
    } catch (e) {
      // not available
    }

    if (RNSerialPort) {
      try {
        const portName = this.config.serial.portName ?? 'ttyUSB0';
        RNSerialPort.setInterface(-1); // auto
        RNSerialPort.setReturnedDataType(
          RNSerialPort.DATA_TYPES?.INTARRAY ?? 1
        );
        await new Promise<void>((resolve, reject) => {
          RNSerialPort.startUsbService();
          RNSerialPort.connectDevice(portName, this.config.serial.baudRate);
          // Give it a moment to connect
          setTimeout(() => {
            resolve();
          }, 500);
        });
        this.setStatus('conectado');
        this.callbacks.onConexao?.(true);
        return true;
      } catch (err) {
        throw new Error(
          `Falha ao abrir porta serial do display (RN): ${err instanceof Error ? err.message : String(err)}`
        );
      }
    }

    // External serial bridge available
    if (this.externalSerialSender) {
      this.setStatus('conectado');
      this.callbacks.onConexao?.(true);
      return true;
    }

    // No serial transport available - do NOT silently report connected
    const msg = '[LedDisplayService] Nenhum transporte serial disponivel. Instale react-native-serialport ou use setExternalSerialSender().';
    console.warn(msg);
    this.emitErro(msg);
    this.setStatus('erro');
    this.callbacks.onConexao?.(false);
    return false;
  }

  // ----------------------------------------
  // Write Operations
  // ----------------------------------------

  /**
   * Write text to a single display line.
   */
  async escreverLinha(line: number, text: string, x: number = 0, y?: number): Promise<boolean> {
    return this.escreverMultiplas([{
      line,
      txt: text,
      x,
      y: y ?? (line - 1),
    }]);
  }

  /**
   * Write text to multiple display lines at once.
   * Automatically removes diacritics for display compatibility.
   */
  async escreverMultiplas(lines: LineVM[]): Promise<boolean> {
    if (this.status !== 'conectado') {
      this.emitErro('Display nao conectado');
      return false;
    }

    // Remove diacritics from all text
    const sanitizedLines = lines.map(l => ({
      ...l,
      txt: removeDiacritics(l.txt),
    }));

    try {
      switch (this.config.protocolo) {
        case 'esp32_http':
          return await this.writeESP32(sanitizedLines);
        case 'triunfo_serial':
          return await this.writeTriunfo(sanitizedLines);
        case 'centralga':
          return await this.writeCentralGA(sanitizedLines);
        case 'manual':
          for (const l of sanitizedLines) {
            this.currentLines.set(l.line, l.txt);
          }
          return true;
        default:
          return false;
      }
    } catch (err) {
      const msg = err instanceof Error ? err.message : String(err);
      this.emitErro(`Erro ao escrever no display: ${msg}`);
      return false;
    }
  }

  // ----------------------------------------
  // High-Level Display Methods
  // ----------------------------------------

  /**
   * Display weight value on LED display.
   * Line 1: Weight formatted with unit
   * Line 2: Status (ESTAVEL/INSTAVEL) and tare if present
   */
  async mostrarPeso(
    pesoKg: number,
    estavel: boolean,
    taraKg: number = 0,
  ): Promise<boolean> {
    const pesoStr = pesoKg.toFixed(1).padStart(8, ' ') + ' kg';
    const statusStr = estavel ? 'ESTAVEL' : 'INSTAVEL';
    const taraStr = taraKg > 0 ? ` T:${taraKg.toFixed(1)}` : '';
    const line2 = (statusStr + taraStr).substring(0, this.config.caracteres_por_linha);

    return this.escreverMultiplas([
      { line: 1, txt: pesoStr.substring(0, this.config.caracteres_por_linha), x: 0, y: 0 },
      { line: 2, txt: line2, x: 0, y: 1 },
    ]);
  }

  /**
   * Display curral/pen identification with optional weight info.
   */
  async mostrarCurral(
    curralNome: string,
    pesoFornecido?: number,
    previsto?: number,
    tagRfid?: string,
  ): Promise<boolean> {
    const maxCols = this.config.caracteres_por_linha;
    let line1: string;
    let line2: string;

    if (pesoFornecido !== undefined && previsto !== undefined) {
      // Show curral with weight progress
      line1 = `CURRAL: ${curralNome}`.substring(0, maxCols);
      line2 = `${pesoFornecido.toFixed(0)}/${previsto.toFixed(0)} kg`.substring(0, maxCols);
    } else if (tagRfid) {
      // Show curral with tag
      line1 = `CURRAL: ${curralNome}`.substring(0, maxCols);
      line2 = `TAG: ${tagRfid.substring(tagRfid.length - 8)}`.substring(0, maxCols);
    } else {
      line1 = `CURRAL: ${curralNome}`.substring(0, maxCols);
      line2 = '';
    }

    const lines: LineVM[] = [
      { line: 1, txt: line1, x: 0, y: 0 },
    ];

    if (line2) {
      lines.push({ line: 2, txt: line2, x: 0, y: 1 });
    }

    return this.escreverMultiplas(lines);
  }

  /**
   * Display time on the LED display.
   * For CentralGA, uses the dedicated time command.
   */
  async mostrarHora(time: string): Promise<boolean> {
    if (this.config.protocolo === 'centralga') {
      try {
        const frame = buildCentralGATimeFrame(time);
        await this.sendSerial(frame);
        return true;
      } catch {
        return false;
      }
    }

    return this.escreverLinha(2, time.substring(0, this.config.caracteres_por_linha));
  }

  /**
   * Display a title/header message.
   */
  async mostrarTitulo(titulo: string): Promise<boolean> {
    const maxCols = this.config.caracteres_por_linha;
    // Center the title
    const padding = Math.max(0, Math.floor((maxCols - titulo.length) / 2));
    const centered = ' '.repeat(padding) + titulo.substring(0, maxCols);

    return this.escreverLinha(1, centered.substring(0, maxCols));
  }

  /**
   * Set display brightness/intensity.
   * Only supported by Triunfo protocol (0-7).
   */
  async setIntensidade(intensity: number): Promise<boolean> {
    this.config.intensidade = Math.min(7, Math.max(0, Math.round(intensity)));

    if (this.config.protocolo === 'triunfo_serial') {
      // Send intensity-only frame
      const frame = `&B${this.config.intensidade}`;
      try {
        await this.sendSerial(frame);
        return true;
      } catch {
        return false;
      }
    }

    return true;
  }

  /**
   * Clear the entire display.
   */
  async limpar(): Promise<boolean> {
    const emptyLines: LineVM[] = [];
    for (let i = 1; i <= this.config.linhas; i++) {
      emptyLines.push({
        line: i,
        txt: ' '.repeat(this.config.caracteres_por_linha),
        x: 0,
        y: i - 1,
      });
    }

    this.currentLines.clear();
    return this.escreverMultiplas(emptyLines);
  }

  // ----------------------------------------
  // ESP32 HTTP Write
  // ----------------------------------------

  private async writeESP32(lines: LineVM[]): Promise<boolean> {
    const url = `http://${this.config.v10.ip}:${this.config.v10.port}${V10_ENDPOINTS.LED_WRITE}`;

    const payload: LedUpdateVM = {
      lines: lines.map(l => ({
        line: l.line,
        txt: l.txt,
        x: l.x ?? 0,
        y: l.y ?? (l.line - 1),
      })),
    };

    const response = await fetch(url, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(payload),
      signal: AbortSignal.timeout(this.config.v10.timeout_ms),
    });

    if (!response.ok) {
      throw new Error(`HTTP ${response.status}`);
    }

    for (const l of lines) {
      this.currentLines.set(l.line, l.txt);
    }

    return true;
  }

  // ----------------------------------------
  // Triunfo Serial Write
  // ----------------------------------------

  private async writeTriunfo(lines: LineVM[]): Promise<boolean> {
    // Triunfo displays typically show a single scrolling message
    // Concatenate all lines with separator
    const combinedText = lines.map(l => l.txt).join(' | ');

    let frame: string;
    if (this.config.intensidade < 7) {
      frame = buildTriunfoFrameWithIntensity(
        combinedText,
        this.config.velocidade_triunfo,
        this.config.intensidade,
      );
    } else {
      frame = buildTriunfoFrame(combinedText, this.config.velocidade_triunfo);
    }

    await this.sendSerial(frame);

    for (const l of lines) {
      this.currentLines.set(l.line, l.txt);
    }

    return true;
  }

  // ----------------------------------------
  // CentralGA Serial Write
  // ----------------------------------------

  private async writeCentralGA(lines: LineVM[]): Promise<boolean> {
    for (const l of lines) {
      const position = l.x ?? 0;
      const frame = buildCentralGAFrame(l.line, position, l.txt);
      await this.sendSerial(frame);
      this.currentLines.set(l.line, l.txt);
    }

    return true;
  }

  // ----------------------------------------
  // Serial I/O
  // ----------------------------------------

  private async sendSerial(data: string): Promise<void> {
    // Web Serial API
    if (this.serialPort?.writable) {
      const writer = this.serialPort.writable.getWriter();
      try {
        const encoder = new TextEncoder();
        await writer.write(encoder.encode(data));
      } finally {
        writer.releaseLock();
      }
      return;
    }

    // External sender (React Native native module)
    if (this.externalSerialSender) {
      this.externalSerialSender(data);
      return;
    }

    console.warn('[LedDisplayService] Nenhum meio de envio serial disponivel');
  }

  // ----------------------------------------
  // Frame Generators (for external use)
  // ----------------------------------------

  /**
   * Generate a Triunfo serial frame without sending it.
   * Useful when the caller manages the serial connection directly.
   */
  gerarFrameTriunfo(texto: string, velocidade?: number): string {
    return buildTriunfoFrame(
      removeDiacritics(texto),
      velocidade ?? this.config.velocidade_triunfo,
    );
  }

  /**
   * Generate a CentralGA display command without sending it.
   */
  gerarFrameCentralGA(linha: number, posicao: number, texto: string): string {
    return buildCentralGAFrame(linha, posicao, removeDiacritics(texto));
  }

  // ----------------------------------------
  // Internal Helpers
  // ----------------------------------------

  private setStatus(newStatus: DisplayStatus) {
    if (this.status !== newStatus) {
      this.status = newStatus;
      this.callbacks.onStatus?.(newStatus);
    }
  }

  private emitErro(mensagem: string) {
    console.error(`[LedDisplayService] ${mensagem}`);
    this.callbacks.onErro?.(mensagem);
  }
}

// ============================================
// Singleton Export
// ============================================

export const ledDisplayService = new LedDisplayService();
