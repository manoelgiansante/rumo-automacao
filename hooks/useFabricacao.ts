/**
 * Hook de fabricacao - integra hardware + fabricacaoStore
 * Gerencia o fluxo completo de pesagem de ingredientes
 */

import { useEffect, useCallback, useRef, useState } from 'react';
import { Vibration, Platform } from 'react-native';
import { useHardware, type UseHardwareOptions } from './useHardware';
import { useFabricacaoStore, type IngredienteFabricacao } from '@/stores/fabricacaoStore';
import type { LeituraPeso } from '@/services/hardware';
import type { FlagManual, StatusIngrediente } from '@/types/automacao';
import { supabase } from '@/lib/supabase';

// ─── Options ─────────────────────────────────────────────────────────────────

export interface UseFabricacaoOptions {
  /** Auto-avancar quando peso dentro da tolerancia */
  autoAvancar?: boolean;
  /** Tempo em ms para confirmar auto-avanco (peso estavel) */
  tempoAutoAvancoMs?: number;
  /** Vibrar ao atingir tolerancia */
  vibrarAlerta?: boolean;
  /** Callback ao entrar na tolerancia */
  onDentroTolerancia?: (ingrediente: IngredienteFabricacao, pesoAtual: number) => void;
  /** Callback ao sair da tolerancia (excesso) */
  onExcessoTolerancia?: (ingrediente: IngredienteFabricacao, pesoAtual: number) => void;
  /** Callback ao finalizar ingrediente */
  onIngredienteFinalizado?: (ingrediente: IngredienteFabricacao) => void;
  /** Callback ao finalizar todos os ingredientes */
  onTodosIngredientesFinalizados?: () => void;
  /** Callback ao finalizar mistura */
  onMisturaFinalizada?: () => void;
  /** Opcoes de hardware */
  hardwareOptions?: UseHardwareOptions;
}

// ─── Hook ────────────────────────────────────────────────────────────────────

export function useFabricacao(options: UseFabricacaoOptions = {}) {
  const {
    autoAvancar = false,
    tempoAutoAvancoMs = 3000,
    vibrarAlerta = true,
  } = options;

  const optionsRef = useRef(options);
  optionsRef.current = options;

  // Timer refs
  const autoAvancoTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const misturaTimerRef = useRef<ReturnType<typeof setInterval> | null>(null);
  const trocaIngredienteTimerRef = useRef<ReturnType<typeof setInterval> | null>(null);
  const dentroToleranciaRef = useRef(false);

  // Tempo troca ingrediente state
  const [trocaIngredienteCountdown, setTrocaIngredienteCountdown] = useState(0);
  const [emTrocaIngrediente, setEmTrocaIngrediente] = useState(false);
  const tempoTrocaIngredienteRef = useRef(0);

  // Hardware hook
  const hardware = useHardware({
    autoConectar: true,
    autoIniciarLeitura: true,
    ...options.hardwareOptions,
    onPeso: (leitura) => {
      store.atualizarPesoAtual(leitura.peso_bruto_kg);
      verificarTolerancia(leitura);
      options.hardwareOptions?.onPeso?.(leitura);
    },
    onPesoEstavel: (leitura) => {
      options.hardwareOptions?.onPesoEstavel?.(leitura);
    },
  });

  // Store
  const store = useFabricacaoStore();

  // ── Load tempo_troca_ingrediente from configuracao_misturadores ──

  useEffect(() => {
    const fabricacao = useFabricacaoStore.getState().fabricacaoAtiva;
    if (!fabricacao) {
      tempoTrocaIngredienteRef.current = 0;
      return;
    }

    const codigoMisturador = (fabricacao as any).codigo_misturador;
    const fazendaId = fabricacao.fazenda_id;
    if (!codigoMisturador || !fazendaId) return;

    supabase
      .from('vet_auto_configuracao_misturadores')
      .select('tempo_troca_ingrediente')
      .eq('fazenda_id', fazendaId)
      .eq('codigo_misturador', codigoMisturador)
      .maybeSingle()
      .then(({ data }) => {
        tempoTrocaIngredienteRef.current = data?.tempo_troca_ingrediente ?? 0;
      });
  }, [store.fabricacaoAtiva?.id]);

  // ── Tolerance checking ──────────────────────────────────────────────

  const verificarTolerancia = useCallback((leitura: LeituraPeso) => {
    const { ingredienteAtual, pesoInicialIngrediente } = useFabricacaoStore.getState();
    if (!ingredienteAtual || ingredienteAtual.status !== 'processando') return;

    const pesoAdicionado = leitura.peso_bruto_kg - pesoInicialIngrediente;
    const dentroTolerancia =
      pesoAdicionado >= ingredienteAtual.pesoMinimo &&
      pesoAdicionado <= ingredienteAtual.pesoMaximo;
    const excesso = pesoAdicionado > ingredienteAtual.pesoMaximo;

    if (dentroTolerancia && !dentroToleranciaRef.current) {
      dentroToleranciaRef.current = true;

      // Vibrate alert
      if (vibrarAlerta && Platform.OS !== 'web') {
        Vibration.vibrate([0, 200, 100, 200]);
      }

      optionsRef.current.onDentroTolerancia?.(ingredienteAtual, pesoAdicionado);

      // Auto-advance after stable weight
      if (autoAvancar && leitura.estavel) {
        autoAvancoTimerRef.current = setTimeout(() => {
          const currentState = useFabricacaoStore.getState();
          if (currentState.ingredienteAtual?.status === 'processando') {
            registrarEAvancar(leitura.peso_bruto_kg, 'troca_automatica');
          }
        }, tempoAutoAvancoMs);
      }
    } else if (!dentroTolerancia && dentroToleranciaRef.current) {
      // Left tolerance zone
      dentroToleranciaRef.current = false;
      if (autoAvancoTimerRef.current) {
        clearTimeout(autoAvancoTimerRef.current);
        autoAvancoTimerRef.current = null;
      }
    }

    if (excesso) {
      if (vibrarAlerta && Platform.OS !== 'web') {
        Vibration.vibrate([0, 500, 200, 500]);
      }
      optionsRef.current.onExcessoTolerancia?.(ingredienteAtual, pesoAdicionado);
    }
  }, [autoAvancar, tempoAutoAvancoMs, vibrarAlerta]);

  // ── Ingredient change countdown ───────────────────────────────────

  const iniciarTrocaIngrediente = useCallback((onComplete: () => void) => {
    const tempoTroca = tempoTrocaIngredienteRef.current;

    // If no tempo_troca or zero, advance immediately
    if (!tempoTroca || tempoTroca <= 0) {
      onComplete();
      return;
    }

    setEmTrocaIngrediente(true);
    let restante = tempoTroca;
    setTrocaIngredienteCountdown(restante);

    // Show on LED display
    if (hardware.conectado) {
      hardware.escreverDisplay([
        { line: 1, txt: 'TROCA DE INGREDIENTE' },
        { line: 2, txt: `${restante}s` },
      ]);
    }

    trocaIngredienteTimerRef.current = setInterval(() => {
      restante -= 1;
      setTrocaIngredienteCountdown(restante);

      // Update LED display
      if (hardware.conectado) {
        hardware.escreverDisplay([
          { line: 1, txt: 'TROCA DE INGREDIENTE' },
          { line: 2, txt: `${restante}s` },
        ]);
      }

      if (restante <= 0) {
        if (trocaIngredienteTimerRef.current) {
          clearInterval(trocaIngredienteTimerRef.current);
          trocaIngredienteTimerRef.current = null;
        }
        setEmTrocaIngrediente(false);
        setTrocaIngredienteCountdown(0);
        onComplete();
      }
    }, 1000);
  }, [hardware]);

  // ── Ingredient flow ─────────────────────────────────────────────────

  const registrarEAvancar = useCallback(async (pesoFinal: number, flagManual: FlagManual) => {
    const currentStore = useFabricacaoStore.getState();

    try {
      await currentStore.registrarPeso(pesoFinal, flagManual);
      dentroToleranciaRef.current = false;

      const ingredienteAtualizado = useFabricacaoStore.getState().ingredienteAtual;
      if (ingredienteAtualizado) {
        optionsRef.current.onIngredienteFinalizado?.(ingredienteAtualizado);
      }

      // Update display with ingredient info
      if (hardware.conectado) {
        hardware.escreverDisplay([
          { line: 1, txt: 'CONCLUIDO' },
          { line: 2, txt: `${pesoFinal.toFixed(0)} kg` },
        ]);
      }

      // Check if there are more ingredients before starting countdown
      const stateAfterRegister = useFabricacaoStore.getState();
      const nextIndex = stateAfterRegister.ingredienteAtualIndex + 1;
      const hasMoreIngredients = nextIndex < stateAfterRegister.ingredientes.length;

      if (hasMoreIngredients) {
        // Start countdown before advancing to next ingredient
        iniciarTrocaIngrediente(() => {
          const latestStore = useFabricacaoStore.getState();
          latestStore.proximoIngrediente();
        });
      } else {
        // No more ingredients, go to mixing
        currentStore.proximoIngrediente();
        const updatedState = useFabricacaoStore.getState();
        if (updatedState.screen === 'misturar') {
          optionsRef.current.onTodosIngredientesFinalizados?.();
        }
      }
    } catch (error) {
      console.error('Erro ao registrar peso:', error);
    }
  }, [hardware, iniciarTrocaIngrediente]);

  const avancarManual = useCallback((pesoFinal: number) => {
    return registrarEAvancar(pesoFinal, 'manual');
  }, [registrarEAvancar]);

  const avancarAutomatico = useCallback((pesoFinal: number) => {
    return registrarEAvancar(pesoFinal, 'troca_automatica');
  }, [registrarEAvancar]);

  const pularIngrediente = useCallback(() => {
    const currentStore = useFabricacaoStore.getState();
    if (currentStore.ingredienteAtual) {
      registrarEAvancar(currentStore.pesoAtual, 'deslocamento');
    }
  }, [registrarEAvancar]);

  // ── Mixing timer ────────────────────────────────────────────────────

  const iniciarMistura = useCallback(() => {
    store.iniciarMistura();
    const { tempoMistura } = useFabricacaoStore.getState();

    if (tempoMistura <= 0) {
      optionsRef.current.onMisturaFinalizada?.();
      return;
    }

    let restante = tempoMistura;
    store.atualizarTempoMisturaRestante(restante);

    misturaTimerRef.current = setInterval(() => {
      restante -= 1;
      store.atualizarTempoMisturaRestante(restante);

      // Update display with mixing countdown
      if (hardware.conectado) {
        const min = Math.floor(restante / 60);
        const sec = restante % 60;
        hardware.escreverDisplay([
          { line: 1, txt: 'MISTURANDO' },
          { line: 2, txt: `${min}:${sec.toString().padStart(2, '0')}` },
        ]);
      }

      if (restante <= 0) {
        if (misturaTimerRef.current) {
          clearInterval(misturaTimerRef.current);
          misturaTimerRef.current = null;
        }
        if (vibrarAlerta && Platform.OS !== 'web') {
          Vibration.vibrate([0, 300, 200, 300, 200, 300]);
        }
        optionsRef.current.onMisturaFinalizada?.();
      }
    }, 1000);
  }, [hardware, vibrarAlerta]);

  // ── Display updates ─────────────────────────────────────────────────

  const atualizarDisplay = useCallback(() => {
    const { ingredienteAtual, pesoAtual, pesoInicialIngrediente } = useFabricacaoStore.getState();
    if (!ingredienteAtual || !hardware.conectado) return;

    const pesoAdicionado = pesoAtual - pesoInicialIngrediente;
    const falta = ingredienteAtual.pesoPrevisto - pesoAdicionado;

    hardware.escreverDisplay([
      { line: 1, txt: ingredienteAtual.receitaIngrediente.ingrediente?.nome ?? 'INGREDIENTE' },
      { line: 2, txt: `${pesoAdicionado.toFixed(0)}/${ingredienteAtual.pesoPrevisto.toFixed(0)} kg  F:${falta.toFixed(0)}` },
    ]);
  }, [hardware]);

  // ── Cleanup ─────────────────────────────────────────────────────────

  useEffect(() => {
    return () => {
      if (autoAvancoTimerRef.current) clearTimeout(autoAvancoTimerRef.current);
      if (misturaTimerRef.current) clearInterval(misturaTimerRef.current);
      if (trocaIngredienteTimerRef.current) clearInterval(trocaIngredienteTimerRef.current);
    };
  }, []);

  // ── Update display periodically ────────────────────────────────────

  useEffect(() => {
    if (store.screen !== 'fabricar' || !store.ingredienteAtual) return;

    const interval = setInterval(atualizarDisplay, 2000);
    return () => clearInterval(interval);
  }, [store.screen, store.ingredienteAtual, atualizarDisplay]);

  // ── Return ─────────────────────────────────────────────────────────

  return {
    // Hardware state
    hardware,

    // Fabricacao state
    fabricacaoAtiva: store.fabricacaoAtiva,
    ingredienteAtual: store.ingredienteAtual,
    ingredienteAtualIndex: store.ingredienteAtualIndex,
    ingredientes: store.ingredientes,
    receita: store.receita,
    pesoPrevisto: store.pesoPrevisto,
    pesoAtual: store.pesoAtual,
    pesoInicialIngrediente: store.pesoInicialIngrediente,
    pesoAcumulado: store.pesoAcumulado,
    status: store.status,
    screen: store.screen,
    progresso: store.progresso,
    tempoMistura: store.tempoMistura,
    tempoMisturaRestante: store.tempoMisturaRestante,
    loading: store.loading,
    loadingSalvar: store.loadingSalvar,
    error: store.error,

    // Troca de ingrediente state
    emTrocaIngrediente,
    trocaIngredienteCountdown,

    // Computed
    dentroTolerancia: dentroToleranciaRef.current,
    pesoAdicionado: store.ingredienteAtual
      ? store.pesoAtual - store.pesoInicialIngrediente
      : 0,
    pesoFaltante: store.ingredienteAtual
      ? store.ingredienteAtual.pesoPrevisto - (store.pesoAtual - store.pesoInicialIngrediente)
      : 0,

    // Actions - Flow
    iniciar: store.iniciar,
    proximoIngrediente: store.proximoIngrediente,
    avancarManual,
    avancarAutomatico,
    pularIngrediente,
    pausar: store.pausar,
    cancelar: store.cancelar,
    finalizar: store.finalizar,
    iniciarMistura,
    restaurar: store.restaurarFabricacao,

    // Actions - Display
    atualizarDisplay,
  };
}
