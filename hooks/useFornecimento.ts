/**
 * Hook de fornecimento - integra hardware + fornecimentoStore
 * Gerencia o fluxo completo de deteccao de curral via RFID e pesagem
 */

import { useEffect, useCallback, useRef, useState } from 'react';
import { Vibration, Platform } from 'react-native';
import { useHardware, type UseHardwareOptions } from './useHardware';
import { useFornecimentoStore, type FornecimentoEmAndamento } from '@/stores/fornecimentoStore';
import type { LeituraPeso, LeituraRfid } from '@/services/hardware';
import type { VetAutoCurral, VetAutoCarregamento, VetAutoFornecido } from '@/types/automacao';
import { registrarLeitura as registrarLeituraSafePoint } from '@/services/safePointService';

// ─── Options ─────────────────────────────────────────────────────────────────

export interface UseFornecimentoOptions {
  /** Capturar peso_inicial automaticamente ao detectar tag de entrada */
  autoCapturaInicial?: boolean;
  /** Capturar peso_final automaticamente ao detectar tag de saida */
  autoCapturaFinal?: boolean;
  /** Tempo em ms para considerar peso estavel para captura */
  tempoEstabilizacaoMs?: number;
  /** Vibrar ao detectar curral */
  vibrarAlerta?: boolean;
  /** Callback ao detectar curral via RFID */
  onCurralDetectado?: (curral: VetAutoCurral, tipo: 'entrada' | 'saida') => void;
  /** Callback ao iniciar fornecimento */
  onFornecimentoIniciado?: (fornecimento: FornecimentoEmAndamento) => void;
  /** Callback ao registrar fornecimento */
  onFornecimentoRegistrado?: (fornecido: VetAutoFornecido) => void;
  /** Callback quando curral nao e encontrado pela tag */
  onCurralNaoEncontrado?: (tag: string) => void;
  /** Opcoes de hardware */
  hardwareOptions?: UseHardwareOptions;
}

// ─── Hook ────────────────────────────────────────────────────────────────────

export function useFornecimento(options: UseFornecimentoOptions = {}) {
  const {
    autoCapturaInicial = true,
    autoCapturaFinal = true,
    tempoEstabilizacaoMs = 2000,
    vibrarAlerta = true,
  } = options;

  const optionsRef = useRef(options);
  optionsRef.current = options;

  // Track latest stable weight and when it was captured
  const ultimoPesoEstavelRef = useRef<number>(0);
  const ultimoPesoEstavelTimestampRef = useRef<number>(0);
  const pesoEstavelTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const [pesoDisplay, setPesoDisplay] = useState(0);

  // Store
  const store = useFornecimentoStore();

  // Hardware hook
  const hardware = useHardware({
    autoConectar: true,
    autoIniciarLeitura: true,
    ...options.hardwareOptions,
    onPeso: (leitura) => {
      setPesoDisplay(leitura.peso_bruto_kg);
      options.hardwareOptions?.onPeso?.(leitura);
    },
    onPesoEstavel: (leitura) => {
      ultimoPesoEstavelRef.current = leitura.peso_bruto_kg;
      ultimoPesoEstavelTimestampRef.current = Date.now();
      options.hardwareOptions?.onPesoEstavel?.(leitura);
    },
    onTag: (leitura) => {
      processarTag(leitura);
      options.hardwareOptions?.onTag?.(leitura);
    },
  });

  // ── Tag processing ──────────────────────────────────────────────────

  const processarTag = useCallback((leitura: LeituraRfid) => {
    const currentStore = useFornecimentoStore.getState();
    if (!currentStore.carregamentoAtivo) return;

    const tag = leitura.tag;

    // Check if it's a safe point tag first
    const safePoint = currentStore.identificarSafePoint(tag);
    if (safePoint && currentStore.carregamentoAtivo) {
      // Register safe point reading with current weight
      const pesoAtual = ultimoPesoEstavelRef.current > 0
        ? ultimoPesoEstavelRef.current
        : pesoDisplay;
      registrarLeituraSafePoint(
        safePoint.id,
        currentStore.carregamentoAtivo.id,
        pesoAtual,
        'automatico',
        null,
        pesoAtual,
      ).catch((err) => {
        console.error('Erro ao registrar leitura safe point:', err);
      });
      return;
    }

    const curral = currentStore.identificarCurral(tag);

    if (!curral) {
      optionsRef.current.onCurralNaoEncontrado?.(tag);
      return;
    }

    // Determine if this is an entry or exit tag
    const isEntrada = curral.tag_inicial?.toLowerCase() === tag.toLowerCase();
    const isSaida = curral.tag_final?.toLowerCase() === tag.toLowerCase();

    if (vibrarAlerta && Platform.OS !== 'web') {
      Vibration.vibrate([0, 150, 100, 150]);
    }

    if (isEntrada && !currentStore.fornecimentoAtual) {
      // Entry tag detected: start fornecimento
      optionsRef.current.onCurralDetectado?.(curral, 'entrada');

      if (autoCapturaInicial) {
        // Wait for stable weight, then start
        aguardarPesoEstavel((pesoEstavel) => {
          const latestStore = useFornecimentoStore.getState();
          if (!latestStore.fornecimentoAtual) {
            latestStore.iniciarFornecimento(curral, pesoEstavel, tag);
            const fornecimentoAtual = useFornecimentoStore.getState().fornecimentoAtual;
            if (fornecimentoAtual) {
              optionsRef.current.onFornecimentoIniciado?.(fornecimentoAtual);
            }
            atualizarDisplayCurral(curral, pesoEstavel);
          }
        });
      }
    } else if (isSaida && currentStore.fornecimentoAtual) {
      // Exit tag detected: finish fornecimento
      optionsRef.current.onCurralDetectado?.(curral, 'saida');

      if (autoCapturaFinal) {
        // Wait for stable weight, then register
        aguardarPesoEstavel(async (pesoEstavel) => {
          try {
            const fornecido = await useFornecimentoStore.getState()
              .registrarFornecimento(pesoEstavel, tag);
            optionsRef.current.onFornecimentoRegistrado?.(fornecido);

            if (vibrarAlerta && Platform.OS !== 'web') {
              Vibration.vibrate([0, 100, 50, 100, 50, 100]);
            }

            atualizarDisplayRegistrado(fornecido);
          } catch (error) {
            console.error('Erro ao registrar fornecimento automatico:', error);
          }
        });
      }
    }
  }, [autoCapturaInicial, autoCapturaFinal, vibrarAlerta]);

  // ── Weight stabilization ────────────────────────────────────────────

  const aguardarPesoEstavel = useCallback((callback: (peso: number) => void) => {
    if (pesoEstavelTimerRef.current) {
      clearTimeout(pesoEstavelTimerRef.current);
    }

    // Freshness threshold: only reuse a cached stable weight if it was captured
    // within the last 5 seconds. Stale readings lead to incorrect peso_inicial/final.
    const FRESHNESS_MS = 5000;
    const isFresh =
      ultimoPesoEstavelRef.current > 0 &&
      (Date.now() - ultimoPesoEstavelTimestampRef.current) <= FRESHNESS_MS;

    if (isFresh) {
      callback(ultimoPesoEstavelRef.current);
      return;
    }

    // Wait for a new stable reading within tempoEstabilizacaoMs
    pesoEstavelTimerRef.current = setTimeout(() => {
      // After waiting, check again if we got a fresh stable reading
      const nowFresh =
        ultimoPesoEstavelRef.current > 0 &&
        (Date.now() - ultimoPesoEstavelTimestampRef.current) <= FRESHNESS_MS;

      callback(nowFresh ? ultimoPesoEstavelRef.current : pesoDisplay);
    }, tempoEstabilizacaoMs);
  }, [tempoEstabilizacaoMs, pesoDisplay]);

  // ── Manual operations ───────────────────────────────────────────────

  const iniciarManual = useCallback((curral: VetAutoCurral, peso?: number) => {
    const pesoInicial = peso ?? ultimoPesoEstavelRef.current ?? pesoDisplay;
    store.iniciarFornecimento(curral, pesoInicial, null);

    const fornecimentoAtual = useFornecimentoStore.getState().fornecimentoAtual;
    if (fornecimentoAtual) {
      optionsRef.current.onFornecimentoIniciado?.(fornecimentoAtual);
    }

    atualizarDisplayCurral(curral, pesoInicial);
  }, [pesoDisplay]);

  const registrarManual = useCallback(async (peso?: number) => {
    const pesoFinal = peso ?? ultimoPesoEstavelRef.current ?? pesoDisplay;
    try {
      const fornecido = await store.registrarFornecimento(pesoFinal, null, true);
      optionsRef.current.onFornecimentoRegistrado?.(fornecido);
      atualizarDisplayRegistrado(fornecido);
      return fornecido;
    } catch (error) {
      console.error('Erro ao registrar fornecimento manual:', error);
      throw error;
    }
  }, [pesoDisplay]);

  const cancelarFornecimentoAtual = useCallback(() => {
    store.cancelarFornecimentoAtual();
    if (hardware.conectado) {
      hardware.escreverDisplay([
        { line: 1, txt: 'CANCELADO' },
        { line: 2, txt: '' },
      ]);
    }
  }, [hardware]);

  // ── Display helpers ─────────────────────────────────────────────────

  const atualizarDisplayCurral = useCallback((curral: VetAutoCurral, pesoInicial: number) => {
    if (!hardware.conectado) return;

    const previsto = useFornecimentoStore.getState().previstosTrato.find(
      (p) => p.curral_id === curral.id,
    );

    hardware.escreverDisplay([
      { line: 1, txt: `${curral.nome} - ${previsto ? previsto.previsto_kg.toFixed(0) + 'kg' : ''}` },
      { line: 2, txt: `Ini: ${pesoInicial.toFixed(0)} kg` },
    ]);
  }, [hardware]);

  const atualizarDisplayRegistrado = useCallback((fornecido: VetAutoFornecido) => {
    if (!hardware.conectado) return;

    hardware.escreverDisplay([
      { line: 1, txt: `${fornecido.curral?.nome ?? 'CURRAL'} OK` },
      { line: 2, txt: `Forn: ${fornecido.fornecido_kg.toFixed(0)} kg` },
    ]);
  }, [hardware]);

  // ── Display update for active fornecimento ─────────────────────────

  useEffect(() => {
    if (!store.fornecimentoAtual || !hardware.conectado) return;

    const interval = setInterval(() => {
      const currentStore = useFornecimentoStore.getState();
      if (!currentStore.fornecimentoAtual) return;

      const { curral, pesoInicial, previsto } = currentStore.fornecimentoAtual;
      const fornecido = pesoInicial - pesoDisplay;
      const previstoKg = previsto?.previsto_kg ?? 0;

      hardware.escreverDisplay([
        { line: 1, txt: `${curral.nome} P:${previstoKg.toFixed(0)}kg` },
        { line: 2, txt: `Forn: ${fornecido.toFixed(0)} kg  Bal: ${pesoDisplay.toFixed(0)}` },
      ]);
    }, 2000);

    return () => clearInterval(interval);
  }, [store.fornecimentoAtual, hardware.conectado, pesoDisplay]);

  // ── Cleanup ─────────────────────────────────────────────────────────

  useEffect(() => {
    return () => {
      if (pesoEstavelTimerRef.current) clearTimeout(pesoEstavelTimerRef.current);
    };
  }, []);

  // ── Return ─────────────────────────────────────────────────────────

  return {
    // Hardware state
    hardware,
    pesoDisplay,

    // Fornecimento state
    carregamentoAtivo: store.carregamentoAtivo,
    fornecimentoAtual: store.fornecimentoAtual,
    fornecimentos: store.fornecimentos,
    curralAtual: store.curralAtual,
    curraisRfid: store.curraisRfid,
    previstosTrato: store.previstosTrato,
    totalFornecido: store.totalFornecido,
    totalPrevisto: store.totalPrevisto,
    pesoRestante: store.pesoRestante,
    loading: store.loading,
    loadingSalvar: store.loadingSalvar,
    error: store.error,

    // Computed
    fornecidoAtual: store.fornecimentoAtual
      ? store.fornecimentoAtual.pesoInicial - pesoDisplay
      : 0,
    percentualRealizado: store.totalPrevisto > 0
      ? (store.totalFornecido / store.totalPrevisto) * 100
      : 0,

    // Actions - Carregamento
    iniciarCarregamento: store.iniciarCarregamento,
    finalizarCarregamento: store.finalizarCarregamento,
    cancelarCarregamento: store.cancelarCarregamento,

    // Actions - Fornecimento (manual)
    iniciarManual,
    registrarManual,
    cancelarFornecimentoAtual,

    // Actions - Curral
    identificarCurral: store.identificarCurral,

    // Safe Points
    safePoints: store.safePoints,
    activeSafePoint: store.activeSafePoint,
    carregarSafePoints: store.carregarSafePoints,

    // Actions - Data
    fetchCurraisRfid: store.fetchCurraisRfid,
    fetchPrevistosTrato: store.fetchPrevistosTrato,
  };
}
