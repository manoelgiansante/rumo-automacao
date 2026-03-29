// ============================================
// Hardware Communication Types & Interfaces
// Rumo Automacao - Unified Hardware Layer
// ============================================

// ============================================
// Connection & Device Enums
// ============================================

export enum ConnectionStatus {
  DESCONECTADO = 'DESCONECTADO',
  CONECTANDO = 'CONECTANDO',
  CONECTADO = 'CONECTADO',
  RECONECTANDO = 'RECONECTANDO',
  ERRO = 'ERRO',
}

export enum ScaleStatus {
  ESTAVEL = 'ESTAVEL',
  MOVIMENTO = 'MOVIMENTO',
  ZERANDO = 'ZERANDO',
  SOBRECARGA = 'SOBRECARGA',
  SUBCARGA = 'SUBCARGA',
  ERRO = 'ERRO',
  DESCONECTADA = 'DESCONECTADA',
}

export enum DeviceType {
  BALANCA = 'balanca',
  RFID = 'rfid',
  LED_DISPLAY = 'led_display',
}

export enum ConnectionType {
  SERIAL = 'serial',
  TCP = 'tcp',
  HTTP = 'http',
  BLE = 'ble',
  MANUAL = 'manual',
}

// ============================================
// Protocol Enums
// ============================================

export type BalancaProtocolo = 'sma' | 'digistar' | 'esp32_http' | 'esp32_ble' | 'manual';
export type RfidProtocolo = 'esp32_http' | 'esp32_ble' | 'intermec_tcp' | 'ideal_serial' | 'centralga' | 'manual';
export type DisplayProtocolo = 'esp32_http' | 'triunfo_serial' | 'centralga' | 'manual';

// ============================================
// Status Types (legacy-compatible aliases)
// ============================================

export type BalancaStatus = 'desconectada' | 'conectando' | 'conectada' | 'lendo' | 'erro' | 'reconectando';
export type RFIDStatus = 'desconectado' | 'conectando' | 'conectado' | 'lendo' | 'erro' | 'reconectando';
export type DisplayStatus = 'desconectado' | 'conectando' | 'conectado' | 'erro';
export type PesoStatus = 'estavel' | 'instavel' | 'sobrecarga' | 'subcarga' | 'erro' | 'manual' | 'zerando';
export type StatusCLP = 'desconectada' | 'conectando' | 'standby' | 'timeout' | 'erro_antena';
export type AntenaSide = 'esquerda' | 'direita' | 'ambas';

// ============================================
// Serial Port Configuration
// ============================================

export interface SerialPortConfig {
  baudRate: number;
  dataBits: 7 | 8;
  stopBits: 1 | 2;
  parity: 'none' | 'even' | 'odd';
  handshake: 'none' | 'rtscts' | 'xonxoff';
  dtrEnable?: boolean;
  rtsEnable?: boolean;
  encoding: string; // default 'iso-8859-1'
  endereco: string; // COM port or BLE address
}

export interface TCPConfig {
  ip: string;
  port: number;
  timeout_ms: number;
}

export interface V10Config {
  ip: string;
  port: number;
  timeout_ms: number;
}

// ============================================
// Scale (Balanca) Types
// ============================================

export interface BalancaConfig {
  protocolo: BalancaProtocolo;
  // Serial/BLE
  serial: SerialPortConfig;
  // TCP/IP
  tcp: TCPConfig;
  // ESP32 V10 HTTP
  v10: V10Config;
  // Behavior
  intervalo_leitura_ms: number;
  tempo_estabilidade_ms: number;
  tolerancia_estabilidade_kg: number;
  faixa_estabilidade: number; // weight range to consider stable (kg)
  min_time_estabilidade: number; // minimum time stable to confirm (ms)
  resolucao_kg: number; // scale resolution (e.g. 0.020 = 20g, 1 = 1kg, 5 = 5kg)
  capacidade_max_kg: number;
  capacidade_min_kg: number;
  // Reconnection
  max_tentativas_reconexao: number;
  intervalo_reconexao_ms: number;
}

export interface WeightReading {
  peso_bruto_kg: number;
  peso_liquido_kg: number;
  tara_kg: number;
  status: PesoStatus;
  estavel: boolean;
  timestamp: number;
  unidade: string;
  contador: number;
  /** Raw response from device */
  raw?: string;
}

/** Alias for backward compatibility */
export type LeituraPeso = WeightReading;

export interface ScaleResponse {
  status: SMAStatusChar;
  weight: number;
  unit: string;
  raw: string;
}

export type SMAStatusChar = 'S' | 'U' | 'O' | 'I' | 'E' | 'G' | 'N';

export interface ESP32ScaleResponse {
  Scale: {
    weight: number;
    tare: number;
    counter: number;
    model: string;
    stable: boolean;
    netWeight: number;
  };
}

// ============================================
// RFID Types
// ============================================

export interface RfidConfig {
  protocolo: RfidProtocolo;
  // ESP32 HTTP
  v10: V10Config;
  // TCP (Intermec BRI)
  tcp: TCPConfig;
  // Serial
  serial: SerialPortConfig;
  // Behavior
  intervalo_leitura_ms: number;
  potencia_mw: number;
  antena_ativa: AntenaSide;
  numero_antenas: 1 | 2 | 3 | 4;
  // Tag filtering
  filtro_prefixo: string;
  tamanho_tag: number; // expected tag length in chars
  tempo_debounce_ms: number;
  timeout_rfid_sem_leitura: number; // ms before onNoTag fires
  // Antenna IDs
  id_antena_esquerda: string;
  id_antena_direita: string;
}

export interface TagReading {
  tag: string;
  rssi: number;
  antena: AntenaSide;
  antenaNr: number;
  timestamp: number;
  contador: number;
  EPC?: string;
  ID?: string;
}

/** Alias for backward compatibility */
export type LeituraRfid = TagReading;

export interface ESP32TagResponse {
  TagReader: {
    tag: string;
    rssi: number;
    counter: number;
    model: string;
    EPC?: string;
    ID?: string;
  };
}

export interface CurralRfid {
  curral_id: string;
  curral_nome: string;
  tag_inicial: string;
  tag_final: string;
}

// ============================================
// LED Display Types
// ============================================

export interface DisplayConfig {
  protocolo: DisplayProtocolo;
  // ESP32 HTTP
  v10: V10Config;
  // Serial
  serial: SerialPortConfig;
  // Display specs
  linhas: number;
  caracteres_por_linha: number;
  // Triunfo
  velocidade_triunfo: number; // 1-8, scroll speed
  intensidade: number; // 0-7, brightness
}

export interface LineVM {
  /** Line number (1-based) */
  line: number;
  /** Text content */
  txt: string;
  /** X position (0-based pixel) */
  x: number;
  /** Y position (0-based pixel) */
  y: number;
}

export interface LedUpdateVM {
  lines: LineVM[];
}

// ============================================
// Callback / Event Types
// ============================================

export interface BalancaCallbacks {
  onPeso?: (leitura: WeightReading) => void;
  onPesoEstavel?: (leitura: WeightReading) => void;
  onStatus?: (status: BalancaStatus, mensagem?: string) => void;
  onErro?: (erro: string) => void;
  onConexao?: (conectado: boolean) => void;
}

export interface RfidCallbacks {
  onTag?: (leitura: TagReading) => void;
  onNewRead?: (leitura: TagReading) => void;
  onNoTag?: () => void;
  onCurralIdentificado?: (curralId: string, tag: string, tipo: 'entrada' | 'saida') => void;
  onStatus?: (status: RFIDStatus, mensagem?: string) => void;
  onErro?: (erro: string) => void;
  onConexao?: (conectado: boolean) => void;
  onAntenaChange?: (antena: number) => void;
}

export interface DisplayCallbacks {
  onStatus?: (status: DisplayStatus) => void;
  onErro?: (erro: string) => void;
  onConexao?: (conectado: boolean) => void;
}

// ============================================
// Hardware Manager Types
// ============================================

export interface HardwareStatus {
  balanca: BalancaStatus;
  rfid: RFIDStatus;
  display: DisplayStatus;
  pesoAtual: WeightReading | null;
  ultimaTag: TagReading | null;
  todosConectados: boolean;
  algumConectado: boolean;
  timestamp: number;
}

export interface HardwareConfig {
  balanca?: Partial<BalancaConfig>;
  rfid?: Partial<RfidConfig>;
  display?: Partial<DisplayConfig>;
}

// ============================================
// Supabase Device Configuration
// ============================================

export interface DispositivoConfig {
  id: string;
  tipo: DeviceType;
  nome: string;
  protocolo: string;
  ip?: string;
  porta?: number;
  porta_serial?: string;
  baudRate?: number;
  ativo: boolean;
  configuracoes: Record<string, any>;
}

// ============================================
// Default Configurations
// ============================================

export const DEFAULT_SERIAL_CONFIG: SerialPortConfig = {
  baudRate: 9600,
  dataBits: 8,
  stopBits: 1,
  parity: 'none',
  handshake: 'none',
  encoding: 'iso-8859-1',
  endereco: '',
};

export const DEFAULT_TCP_CONFIG: TCPConfig = {
  ip: '192.168.25.200',
  port: 2189,
  timeout_ms: 5000,
};

export const DEFAULT_V10_CONFIG: V10Config = {
  ip: '192.168.4.1',
  port: 80,
  timeout_ms: 3000,
};

export const DEFAULT_BALANCA_CONFIG: BalancaConfig = {
  protocolo: 'esp32_http',
  serial: { ...DEFAULT_SERIAL_CONFIG },
  tcp: { ...DEFAULT_TCP_CONFIG },
  v10: { ...DEFAULT_V10_CONFIG },
  intervalo_leitura_ms: 200,
  tempo_estabilidade_ms: 3000,
  tolerancia_estabilidade_kg: 2,
  faixa_estabilidade: 5,
  min_time_estabilidade: 3000,
  resolucao_kg: 1,
  capacidade_max_kg: 20000,
  capacidade_min_kg: 0,
  max_tentativas_reconexao: 5,
  intervalo_reconexao_ms: 5000,
};

export const DEFAULT_RFID_CONFIG: RfidConfig = {
  protocolo: 'esp32_http',
  v10: { ...DEFAULT_V10_CONFIG },
  tcp: { ip: '192.168.25.200', port: 2189, timeout_ms: 5000 },
  serial: { ...DEFAULT_SERIAL_CONFIG },
  intervalo_leitura_ms: 500,
  potencia_mw: 3000,
  antena_ativa: 'ambas',
  numero_antenas: 2,
  filtro_prefixo: '',
  tamanho_tag: 24,
  tempo_debounce_ms: 2000,
  timeout_rfid_sem_leitura: 10000,
  id_antena_esquerda: '',
  id_antena_direita: '',
};

export const DEFAULT_DISPLAY_CONFIG: DisplayConfig = {
  protocolo: 'esp32_http',
  v10: { ...DEFAULT_V10_CONFIG },
  serial: { ...DEFAULT_SERIAL_CONFIG },
  linhas: 2,
  caracteres_por_linha: 20,
  velocidade_triunfo: 4,
  intensidade: 7,
};

// ============================================
// Re-exports from protocols
// ============================================

export type { WeightScaleInformation } from './protocols';
