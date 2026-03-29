// ============================================
// Hardware Communication Layer - Manager & Re-exports
// Rumo Automacao - Unified Hardware Orchestration
// ============================================
// Manages balanca, RFID, and LED display devices.
// Provides unified connect/disconnect/status.
// Loads configuration from Supabase tables:
//   vet_auto_dispositivos, vet_auto_configuracoes
// ============================================

import { balancaService } from './balancaService';
import { rfidService } from './rfidService';
import { ledDisplayService } from './ledDisplayService';

import type {
  HardwareStatus,
  HardwareConfig,
  WeightReading,
  TagReading,
  BalancaStatus,
  RFIDStatus,
  DisplayStatus,
  BalancaConfig,
  RfidConfig,
  DisplayConfig,
  BalancaCallbacks,
  RfidCallbacks,
  DisplayCallbacks,
  DispositivoConfig,
  CurralRfid,
  DeviceType,
} from './types';

// ============================================
// HardwareManager Class
// ============================================

type HardwareCallback = (status: HardwareStatus) => void;

class HardwareManager {
  private listeners: HardwareCallback[] = [];
  private statusPollingInterval: ReturnType<typeof setInterval> | null = null;
  private _status: HardwareStatus = {
    balanca: 'desconectada',
    rfid: 'desconectado',
    display: 'desconectado',
    pesoAtual: null,
    ultimaTag: null,
    todosConectados: false,
    algumConectado: false,
    timestamp: Date.now(),
  };

  constructor() {
    // Wire up internal callbacks
    balancaService.setOnStatus((status) => {
      this._status.balanca = status;
      this.updateConnectionFlags();
      this.notificar();
    });

    balancaService.setOnPeso((leitura) => {
      this._status.pesoAtual = leitura;
      // Auto-update LED display with current weight
      ledDisplayService.mostrarPeso(leitura.peso_bruto_kg, leitura.estavel, leitura.tara_kg).catch(() => {});
      this.notificar();
    });

    rfidService.setOnStatus((status) => {
      this._status.rfid = status;
      this.updateConnectionFlags();
      this.notificar();
    });

    rfidService.setOnTag((leitura) => {
      this._status.ultimaTag = leitura;
      this.notificar();
    });

    ledDisplayService.setOnStatus((status) => {
      this._status.display = status;
      this.updateConnectionFlags();
      this.notificar();
    });
  }

  // ----------------------------------------
  // Status
  // ----------------------------------------

  get status(): HardwareStatus {
    return { ...this._status, timestamp: Date.now() };
  }

  getStatus(): HardwareStatus {
    return this.status;
  }

  // ----------------------------------------
  // Listeners
  // ----------------------------------------

  addListener(cb: HardwareCallback) {
    this.listeners.push(cb);
  }

  removeListener(cb: HardwareCallback) {
    this.listeners = this.listeners.filter(l => l !== cb);
  }

  // ----------------------------------------
  // Configuration
  // ----------------------------------------

  configurar(config: HardwareConfig, callbacks?: {
    balanca?: BalancaCallbacks;
    rfid?: RfidCallbacks;
    display?: DisplayCallbacks;
  }) {
    if (config.balanca) {
      balancaService.configurar(config.balanca, callbacks?.balanca);
    }
    if (config.rfid) {
      rfidService.configurar(config.rfid, callbacks?.rfid);
    }
    if (config.display) {
      ledDisplayService.configurar(config.display, callbacks?.display);
    }
  }

  /**
   * Load hardware configuration from Supabase tables.
   * Reads vet_auto_dispositivos for device connection info
   * and vet_auto_configuracoes for behavior settings.
   *
   * @param supabase - Supabase client instance
   * @param fazendaId - Current farm ID for filtering configs
   */
  async carregarConfiguracao(supabase: any, fazendaId?: string): Promise<void> {
    try {
      // Load device configurations
      let query = supabase
        .from('vet_auto_dispositivos')
        .select('*')
        .eq('ativo', true);

      if (fazendaId) {
        query = query.eq('fazenda_id', fazendaId);
      }

      const { data: dispositivos, error: dispError } = await query;

      if (dispError) {
        console.error('[HardwareManager] Erro ao carregar dispositivos:', dispError.message);
      }

      if (dispositivos && dispositivos.length > 0) {
        this.aplicarConfigDispositivos(dispositivos);
      }

      // Load behavior/general configurations
      let configQuery = supabase
        .from('vet_auto_configuracoes')
        .select('*');

      if (fazendaId) {
        configQuery = configQuery.eq('fazenda_id', fazendaId);
      }

      const { data: configuracoes, error: confError } = await configQuery;

      if (confError) {
        console.error('[HardwareManager] Erro ao carregar configuracoes:', confError.message);
      }

      if (configuracoes && configuracoes.length > 0) {
        this.aplicarConfiguracoes(configuracoes);
      }

      // Load curral RFID mappings
      const { data: currais, error: curralError } = await supabase
        .from('vet_auto_currais')
        .select('curral_id, curral_nome, tag_inicial, tag_final')
        .not('tag_inicial', 'is', null);

      if (!curralError && currais) {
        rfidService.setCurraisRfid(currais as CurralRfid[]);
      }

      console.log(
        `[HardwareManager] Configuracao carregada: ${dispositivos?.length || 0} dispositivos, ${configuracoes?.length || 0} configs`
      );
    } catch (err) {
      console.error('[HardwareManager] Erro ao carregar configuracao:', err);
    }
  }

  private aplicarConfigDispositivos(dispositivos: DispositivoConfig[]) {
    for (const disp of dispositivos) {
      const configs = disp.configuracoes || {};

      switch (disp.tipo) {
        case 'balanca' as DeviceType:
          balancaService.configurar({
            protocolo: disp.protocolo as any,
            v10: disp.ip ? {
              ip: disp.ip,
              port: disp.porta || 80,
              timeout_ms: configs.timeout_ms || 3000,
            } : undefined,
            serial: disp.porta_serial ? {
              endereco: disp.porta_serial,
              baudRate: disp.baudRate || 9600,
              dataBits: configs.dataBits || 8,
              stopBits: configs.stopBits || 1,
              parity: configs.parity || 'none',
              handshake: configs.handshake || 'none',
              encoding: configs.encoding || 'iso-8859-1',
            } : undefined,
            tcp: disp.ip ? {
              ip: disp.ip,
              port: disp.porta || 2189,
              timeout_ms: configs.timeout_ms || 5000,
            } : undefined,
            ...configs,
          } as Partial<BalancaConfig>);
          break;

        case 'rfid' as DeviceType:
          rfidService.configurar({
            protocolo: disp.protocolo as any,
            v10: disp.ip ? {
              ip: disp.ip,
              port: disp.porta || 80,
              timeout_ms: configs.timeout_ms || 3000,
            } : undefined,
            tcp: disp.ip ? {
              ip: disp.ip,
              port: disp.porta || 2189,
              timeout_ms: configs.timeout_ms || 5000,
            } : undefined,
            serial: disp.porta_serial ? {
              endereco: disp.porta_serial,
              baudRate: disp.baudRate || 9600,
              dataBits: configs.dataBits || 8,
              stopBits: configs.stopBits || 1,
              parity: configs.parity || 'none',
              handshake: configs.handshake || 'none',
              encoding: configs.encoding || 'iso-8859-1',
            } : undefined,
            ...configs,
          } as Partial<RfidConfig>);
          break;

        case 'led_display' as DeviceType:
          ledDisplayService.configurar({
            protocolo: disp.protocolo as any,
            v10: disp.ip ? {
              ip: disp.ip,
              port: disp.porta || 80,
              timeout_ms: configs.timeout_ms || 3000,
            } : undefined,
            serial: disp.porta_serial ? {
              endereco: disp.porta_serial,
              baudRate: disp.baudRate || 9600,
              dataBits: configs.dataBits || 8,
              stopBits: configs.stopBits || 1,
              parity: configs.parity || 'none',
              handshake: configs.handshake || 'none',
              encoding: configs.encoding || 'iso-8859-1',
            } : undefined,
            ...configs,
          } as Partial<DisplayConfig>);
          break;
      }
    }
  }

  private aplicarConfiguracoes(configuracoes: Array<{ chave: string; valor: any }>) {
    const configMap = new Map<string, any>();
    for (const c of configuracoes) {
      configMap.set(c.chave, c.valor);
    }

    // Apply scale-specific configs
    const balancaUpdates: Partial<BalancaConfig> = {};
    if (configMap.has('intervalo_leitura_ms')) balancaUpdates.intervalo_leitura_ms = configMap.get('intervalo_leitura_ms');
    if (configMap.has('tempo_estabilidade_ms')) balancaUpdates.tempo_estabilidade_ms = configMap.get('tempo_estabilidade_ms');
    if (configMap.has('tolerancia_estabilidade_kg')) balancaUpdates.tolerancia_estabilidade_kg = configMap.get('tolerancia_estabilidade_kg');
    if (configMap.has('faixa_estabilidade')) balancaUpdates.faixa_estabilidade = configMap.get('faixa_estabilidade');
    if (configMap.has('min_time_estabilidade')) balancaUpdates.min_time_estabilidade = configMap.get('min_time_estabilidade');
    if (configMap.has('resolucao_kg')) balancaUpdates.resolucao_kg = configMap.get('resolucao_kg');
    if (configMap.has('capacidade_max_kg')) balancaUpdates.capacidade_max_kg = configMap.get('capacidade_max_kg');

    if (Object.keys(balancaUpdates).length > 0) {
      balancaService.configurar(balancaUpdates);
    }

    // Apply RFID-specific configs
    const rfidUpdates: Partial<RfidConfig> = {};
    if (configMap.has('intervalo_leitura_rfid_ms')) rfidUpdates.intervalo_leitura_ms = configMap.get('intervalo_leitura_rfid_ms');
    if (configMap.has('potencia_mw')) rfidUpdates.potencia_mw = configMap.get('potencia_mw');
    if (configMap.has('tamanho_tag')) rfidUpdates.tamanho_tag = configMap.get('tamanho_tag');
    if (configMap.has('tempo_debounce_ms')) rfidUpdates.tempo_debounce_ms = configMap.get('tempo_debounce_ms');
    if (configMap.has('timeout_rfid_sem_leitura')) rfidUpdates.timeout_rfid_sem_leitura = configMap.get('timeout_rfid_sem_leitura');
    if (configMap.has('filtro_prefixo')) rfidUpdates.filtro_prefixo = configMap.get('filtro_prefixo');
    if (configMap.has('numero_antenas')) rfidUpdates.numero_antenas = configMap.get('numero_antenas');

    if (Object.keys(rfidUpdates).length > 0) {
      rfidService.configurar(rfidUpdates);
    }
  }

  // ----------------------------------------
  // Connection Management
  // ----------------------------------------

  /**
   * Connect all hardware devices in parallel.
   * Returns an object with individual connection results.
   */
  async conectarTudo(): Promise<{
    balanca: boolean;
    rfid: boolean;
    display: boolean;
  }> {
    const [balanca, rfid, display] = await Promise.allSettled([
      balancaService.conectar(),
      rfidService.conectar(),
      ledDisplayService.conectar(),
    ]);

    const result = {
      balanca: balanca.status === 'fulfilled' && balanca.value,
      rfid: rfid.status === 'fulfilled' && rfid.value,
      display: display.status === 'fulfilled' && display.value,
    };

    this.updateConnectionFlags();
    this.notificar();
    return result;
  }

  /**
   * Disconnect all hardware devices.
   */
  async desconectarTudo() {
    this.pararTudo();

    await Promise.allSettled([
      balancaService.desconectar(),
      rfidService.desconectar(),
      ledDisplayService.limpar().catch(() => {}),
      ledDisplayService.desconectar(),
    ]);

    this.updateConnectionFlags();
    this.notificar();
  }

  // ----------------------------------------
  // Reading Control
  // ----------------------------------------

  /**
   * Start reading on all input devices (balanca + RFID).
   */
  iniciarTudo() {
    balancaService.iniciarLeitura();
    rfidService.iniciarLeitura();

    // Start status polling
    if (!this.statusPollingInterval) {
      this.statusPollingInterval = setInterval(() => {
        this.notificar();
      }, 5000);
    }
  }

  /**
   * Stop reading on all input devices.
   */
  pararTudo() {
    balancaService.pararLeitura();
    rfidService.pararLeitura();

    if (this.statusPollingInterval) {
      clearInterval(this.statusPollingInterval);
      this.statusPollingInterval = null;
    }
  }

  // ----------------------------------------
  // Internal Helpers
  // ----------------------------------------

  private updateConnectionFlags() {
    const balancaConectada = ['conectada', 'lendo'].includes(this._status.balanca);
    const rfidConectado = ['conectado', 'lendo'].includes(this._status.rfid);
    const displayConectado = this._status.display === 'conectado';

    this._status.todosConectados = balancaConectada && rfidConectado && displayConectado;
    this._status.algumConectado = balancaConectada || rfidConectado || displayConectado;
  }

  private notificar() {
    this._status.timestamp = Date.now();
    const snapshot = { ...this._status };
    this.listeners.forEach(l => {
      try {
        l(snapshot);
      } catch (err) {
        console.error('[HardwareManager] Erro em listener:', err);
      }
    });
  }
}

// ============================================
// Singleton Export
// ============================================

export const hardwareManager = new HardwareManager();

// ============================================
// Re-exports: Services
// ============================================

export { balancaService } from './balancaService';
export { rfidService } from './rfidService';
export { ledDisplayService } from './ledDisplayService';

// ============================================
// Re-exports: Types
// ============================================

export type {
  // Connection & Status
  ConnectionStatus,
  ScaleStatus,
  DeviceType,
  ConnectionType,
  BalancaStatus,
  RFIDStatus,
  DisplayStatus,
  PesoStatus,
  StatusCLP,
  AntenaSide,
  // Config
  BalancaConfig,
  RfidConfig,
  DisplayConfig,
  SerialPortConfig,
  TCPConfig,
  V10Config,
  HardwareStatus,
  HardwareConfig,
  DispositivoConfig,
  // Readings
  WeightReading,
  LeituraPeso,
  TagReading,
  LeituraRfid,
  ScaleResponse,
  ESP32ScaleResponse,
  ESP32TagResponse,
  CurralRfid,
  // Display
  LineVM,
  LedUpdateVM,
  // Callbacks
  BalancaCallbacks,
  RfidCallbacks,
  DisplayCallbacks,
} from './types';

export {
  // Defaults
  DEFAULT_BALANCA_CONFIG,
  DEFAULT_RFID_CONFIG,
  DEFAULT_DISPLAY_CONFIG,
  DEFAULT_SERIAL_CONFIG,
  DEFAULT_TCP_CONFIG,
  DEFAULT_V10_CONFIG,
} from './types';

// ============================================
// Re-exports: Protocols
// ============================================

export {
  // SMA
  SMA_COMMANDS,
  SMA_EXTENDED_COMMANDS,
  SMA_STATUS_CHARS,
  parseSMAResponse,
  smaStatusToPesoStatus,
  // CRC
  crc16CCITT,
  crc16Bytes,
  validateCRC16,
  // Intermec
  INTERMEC_COMMANDS,
  parseIntermecResponse,
  // CentralGA
  parseCentralGAResponse,
  // Ideal
  IDEAL_PROTOCOL,
  parseIdealResponse,
  parseIdealTagHeader,
  // Display frames
  buildTriunfoFrame,
  buildTriunfoFrameWithIntensity,
  buildCentralGAFrame,
  buildCentralGATimeFrame,
  // Utilities
  removeDiacritics,
  V10_ENDPOINTS,
} from './protocols';
