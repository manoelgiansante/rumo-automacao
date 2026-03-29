/**
 * React hook para integracao com hardware (balanca + RFID + LED)
 * Uso: const { peso, tag, status, conectar, desconectar } = useHardware();
 */

import { useEffect, useState, useCallback, useRef } from 'react';
import {
  hardwareManager,
  balancaService,
  rfidService,
  ledDisplayService,
  type HardwareStatus,
  type LeituraPeso,
  type LeituraRfid,
  type BalancaConfig,
  type RfidConfig,
} from '@/services/hardware';
import { useHardwareStore } from '@/stores/hardwareStore';

// ─── Options ─────────────────────────────────────────────────────────────────

export interface UseHardwareOptions {
  /** Auto-conectar ao montar o componente */
  autoConectar?: boolean;
  /** Auto-iniciar leitura apos conectar */
  autoIniciarLeitura?: boolean;
  /** Configuracao customizada da balanca */
  balancaConfig?: Partial<BalancaConfig>;
  /** Configuracao customizada do RFID */
  rfidConfig?: Partial<RfidConfig>;
  /** Callback a cada leitura de peso */
  onPeso?: (leitura: LeituraPeso) => void;
  /** Callback quando peso estabiliza */
  onPesoEstavel?: (leitura: LeituraPeso) => void;
  /** Callback a cada leitura de tag RFID */
  onTag?: (leitura: LeituraRfid) => void;
  /** Callback quando curral e detectado via RFID */
  onCurralDetectado?: (tag: string, tipo: 'entrada' | 'saida') => void;
}

// ─── Hook ────────────────────────────────────────────────────────────────────

export function useHardware(options: UseHardwareOptions = {}) {
  const [status, setStatus] = useState<HardwareStatus>(hardwareManager.status);
  const [conectado, setConectado] = useState(false);
  const [erro, setErro] = useState<string | null>(null);
  const optionsRef = useRef(options);
  optionsRef.current = options;

  // Sync with hardware store
  const store = useHardwareStore();

  useEffect(() => {
    // Configure hardware
    if (options.balancaConfig) balancaService.configurar(options.balancaConfig);
    if (options.rfidConfig) rfidService.configurar(options.rfidConfig);

    // Set up callbacks
    const statusListener = (s: HardwareStatus) => {
      setStatus({ ...s });
      // Sync with store
      store.atualizarStatusBalanca(
        s.balanca === 'conectada' ? 'conectado' :
        s.balanca === 'desconectada' ? 'desconectado' :
        s.balanca === 'conectando' ? 'conectando' : 'erro',
      );
      store.atualizarStatusRFID(
        s.rfid === 'conectado' ? 'conectado' :
        s.rfid === 'desconectado' ? 'desconectado' :
        s.rfid === 'conectando' ? 'conectando' : 'erro',
      );
    };
    hardwareManager.addListener(statusListener);

    balancaService.setOnPeso((l) => {
      store.atualizarPeso(l);
      optionsRef.current.onPeso?.(l);
    });
    balancaService.setOnPesoEstavel((l) => {
      optionsRef.current.onPesoEstavel?.(l);
    });
    rfidService.setOnTag((l) => {
      store.atualizarTag(l);
      optionsRef.current.onTag?.(l);
    });
    rfidService.setOnCurralDetectado((tag, tipo) => {
      optionsRef.current.onCurralDetectado?.(tag, tipo);
    });
    balancaService.setOnErro((e) => setErro(e));
    rfidService.setOnErro((e) => setErro(e));

    // Auto connect
    if (options.autoConectar) {
      hardwareManager.conectarTudo().then((result) => {
        setConectado(result.balanca || result.rfid);
        if (options.autoIniciarLeitura && (result.balanca || result.rfid)) {
          hardwareManager.iniciarTudo();
        }
      });
    }

    return () => {
      hardwareManager.removeListener(statusListener);
      hardwareManager.pararTudo();
    };
  }, []);

  // ── Connection methods ─────────────────────────────────────────────

  const conectar = useCallback(async () => {
    setErro(null);
    const result = await hardwareManager.conectarTudo();
    setConectado(result.balanca || result.rfid);
    if (result.balanca || result.rfid) {
      hardwareManager.iniciarTudo();
    }
    return result;
  }, []);

  const desconectar = useCallback(() => {
    hardwareManager.desconectarTudo();
    setConectado(false);
    store.desconectarTudo();
  }, []);

  // ── Balanca methods ────────────────────────────────────────────────

  const zerarBalanca = useCallback(() => balancaService.zero(), []);
  const tararBalanca = useCallback(() => balancaService.tara(), []);
  const pesoManual = useCallback((kg: number) => balancaService.setPesoManual(kg), []);

  // ── RFID methods ───────────────────────────────────────────────────

  const simularTag = useCallback((tag: string) => rfidService.simularTag(tag), []);

  // ── Display methods ────────────────────────────────────────────────

  const escreverDisplay = useCallback(
    (linhas: Array<{ line: number; txt: string }>) =>
      ledDisplayService.escreverMultiplas(linhas),
    [],
  );

  const mostrarPesoDisplay = useCallback(
    (peso: number, estavel: boolean) => ledDisplayService.mostrarPeso(peso, estavel),
    [],
  );

  const limparDisplay = useCallback(() => ledDisplayService.limpar(), []);

  // ── Return ─────────────────────────────────────────────────────────

  return {
    // State
    status,
    peso: status.pesoAtual,
    tag: status.ultimaTag,
    statusBalanca: status.balanca,
    statusRFID: status.rfid,
    statusDisplay: store.statusDisplay,
    conectado,
    erro,

    // Connection
    conectar,
    desconectar,

    // Balanca
    zerarBalanca,
    tararBalanca,
    pesoManual,

    // RFID
    simularTag,

    // Display
    escreverDisplay,
    mostrarPesoDisplay,
    limparDisplay,
  };
}
