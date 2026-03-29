import { create } from 'zustand';
import { persist, createJSONStorage } from 'zustand/middleware';
import AsyncStorage from '@react-native-async-storage/async-storage';
import { supabase } from '@/lib/supabase';
import { dataService } from '@/services/dataService';
import { generateId } from '@/services/offlineService';
import type {
  VetAutoFabricacao,
  VetAutoFabricacaoCreate,
  VetAutoFabricacaoIngrediente,
  VetAutoFabricacaoIngredienteCreate,
  VetAutoReceitaIngrediente,
  VetAutoReceita,
  StatusFabricacao,
  StatusIngrediente,
  FlagManual,
  ScreenFabricar,
  TipoUsoMisturador,
} from '@/types/automacao';

// ─── Derived types ───────────────────────────────────────────────────────────

/** Ingrediente na fila de fabricacao com peso calculado */
export interface IngredienteFabricacao {
  receitaIngrediente: VetAutoReceitaIngrediente;
  /** Peso previsto em kg para este ingrediente */
  pesoPrevisto: number;
  /** Tolerancia em kg (calculada a partir do %) */
  toleranciaKg: number;
  /** Peso minimo aceitavel */
  pesoMinimo: number;
  /** Peso maximo aceitavel */
  pesoMaximo: number;
  /** Status do ingrediente */
  status: StatusIngrediente;
  /** Hora de inicio da pesagem deste ingrediente */
  horaInicio: string | null;
  /** Peso registrado (apos pesagem) */
  pesoRegistrado: number | null;
  /** Diferenca em kg */
  diferencaKg: number | null;
}

// ─── State interface ─────────────────────────────────────────────────────────

interface FabricacaoState {
  // Fabricacao ativa
  fabricacaoAtiva: VetAutoFabricacao | null;
  ingredienteAtual: IngredienteFabricacao | null;
  ingredienteAtualIndex: number;
  ingredientes: IngredienteFabricacao[];
  receita: VetAutoReceita | null;

  // Pesos
  pesoPrevisto: number;
  pesoAtual: number;
  pesoInicialIngrediente: number;
  pesoAcumulado: number;

  // Status
  status: StatusFabricacao;
  screen: ScreenFabricar;
  progresso: number;
  tempoMistura: number;
  tempoMisturaRestante: number;

  // Loading/error
  loading: boolean;
  loadingSalvar: boolean;
  error: string | null;

  // Actions - Flow
  iniciar: (
    fazendaId: string,
    receitaId: string,
    codigoMisturador: number,
    totalPrevisto: number,
    numeroTrato?: number,
    tipoUso?: TipoUsoMisturador,
    operadorPaId?: string | null,
  ) => Promise<VetAutoFabricacao>;
  proximoIngrediente: () => void;
  registrarPeso: (pesoFinal: number, flagManual: FlagManual) => Promise<void>;
  pausar: () => void;
  cancelar: () => Promise<void>;
  finalizar: () => Promise<void>;
  iniciarMistura: () => void;

  // Actions - Real-time
  atualizarPesoAtual: (peso: number) => void;
  atualizarTempoMisturaRestante: (segundos: number) => void;

  // Actions - Restore
  restaurarFabricacao: (fabricacaoId: string) => Promise<void>;

  // Reset
  limpar: () => void;
}

// ─── Helpers ─────────────────────────────────────────────────────────────────

function calcularIngredientesFabricacao(
  ingredientesReceita: VetAutoReceitaIngrediente[],
  totalPrevisto: number,
): IngredienteFabricacao[] {
  return ingredientesReceita
    .sort((a, b) => a.ordem_batida - b.ordem_batida)
    .map((ri) => {
      const pesoPrevisto = (ri.percentual_materia_natural / 100) * totalPrevisto;
      const toleranciaKg = (ri.tolerancia / 100) * pesoPrevisto;
      return {
        receitaIngrediente: ri,
        pesoPrevisto,
        toleranciaKg,
        pesoMinimo: pesoPrevisto - toleranciaKg,
        pesoMaximo: pesoPrevisto + toleranciaKg,
        status: 'espera' as StatusIngrediente,
        horaInicio: null,
        pesoRegistrado: null,
        diferencaKg: null,
      };
    });
}

function gerarLoteFabricacao(): string {
  const now = new Date();
  const ts = now.toISOString().replace(/[-:T.Z]/g, '').slice(0, 14);
  const rand = Math.floor(Math.random() * 1000).toString().padStart(3, '0');
  return `FAB-${ts}-${rand}`;
}

// ─── Store ───────────────────────────────────────────────────────────────────

export const useFabricacaoStore = create<FabricacaoState>()(
  persist(
    (set, get) => ({
      // Initial state
      fabricacaoAtiva: null,
      ingredienteAtual: null,
      ingredienteAtualIndex: -1,
      ingredientes: [],
      receita: null,
      pesoPrevisto: 0,
      pesoAtual: 0,
      pesoInicialIngrediente: 0,
      pesoAcumulado: 0,
      status: 'espera',
      screen: 'blank',
      progresso: 0,
      tempoMistura: 0,
      tempoMisturaRestante: 0,
      loading: false,
      loadingSalvar: false,
      error: null,

      // ── Flow ────────────────────────────────────────────────────────────

      iniciar: async (fazendaId, receitaId, codigoMisturador, totalPrevisto, numeroTrato, tipoUso, operadorPaId) => {
        set({ loading: true, error: null });
        try {
          // Fetch receita and ingredients
          const [receitaRes, ingredientesRes] = await Promise.all([
            supabase
              .from('vet_auto_receitas')
              .select('*')
              .eq('id', receitaId)
              .single(),
            supabase
              .from('vet_auto_receita_ingredientes')
              .select('*, ingrediente:ingrediente_id(*)')
              .eq('receita_id', receitaId)
              .order('ordem_batida', { ascending: true }),
          ]);

          if (receitaRes.error) throw receitaRes.error;
          if (ingredientesRes.error) throw ingredientesRes.error;

          const receita = receitaRes.data as VetAutoReceita;
          const ingredientesReceita = (ingredientesRes.data ?? []) as VetAutoReceitaIngrediente[];
          const ingredientes = calcularIngredientesFabricacao(ingredientesReceita, totalPrevisto);

          // Create fabricacao record
          const fabricacaoData: VetAutoFabricacaoCreate = {
            fazenda_id: fazendaId,
            lote_fabricacao: gerarLoteFabricacao(),
            receita_id: receitaId,
            usuario_id: null,
            operador_pa_id: operadorPaId ?? null,
            codigo_misturador: codigoMisturador,
            numero_lote_animais: null,
            numero_trato: numeroTrato ?? null,
            data_registro: new Date().toISOString(),
            hora_inicio_fabricacao: new Date().toISOString(),
            hora_fim_fabricacao: null,
            total_kg_mn_fabricada: 0,
            total_kg_mn_previsto: totalPrevisto,
            total_cabeca: null,
            tipo_uso: tipoUso ?? 'estacionario',
            total_perda_kg: 0,
            total_sobra_carregado_kg: 0,
            lote_fabricacao_sobra: null,
            flag_automation: false,
            flag_batchbox: (tipoUso ?? 'estacionario') === 'batchbox',
            ordem_producao_id: null,
            status: 'processando',
          };

          const fabricacao = await dataService.save('vet_auto_fabricacoes', {
            id: generateId(),
            ...fabricacaoData,
          });


          // For BatchBox mode, skip mixing timer (mixes externally)
          const isBatchbox = (tipoUso ?? 'estacionario') === 'batchbox';
          const tempoMisturaFinal = isBatchbox ? 0 : (receita.tempo_mistura ?? 0);

          set({
            fabricacaoAtiva: fabricacao as VetAutoFabricacao,
            receita,
            ingredientes,
            ingredienteAtualIndex: -1,
            ingredienteAtual: null,
            pesoPrevisto: totalPrevisto,
            pesoAtual: 0,
            pesoInicialIngrediente: 0,
            pesoAcumulado: 0,
            status: 'processando',
            screen: 'fabricar',
            progresso: 0,
            tempoMistura: tempoMisturaFinal,
            tempoMisturaRestante: tempoMisturaFinal,
            loading: false,
          });

          return fabricacao as VetAutoFabricacao;
        } catch (error) {
          const msg = error instanceof Error ? error.message : 'Erro ao iniciar fabricacao';
          set({ error: msg, loading: false });
          throw error;
        }
      },

      proximoIngrediente: () => {
        const { ingredientes, ingredienteAtualIndex, pesoAtual } = get();
        const nextIndex = ingredienteAtualIndex + 1;

        if (nextIndex >= ingredientes.length) {
          // All ingredients done, start mixing
          set({ screen: 'misturar', ingredienteAtual: null });
          return;
        }

        const horaInicioIngrediente = new Date().toISOString();
        const nextIngrediente = { ...ingredientes[nextIndex], status: 'processando' as StatusIngrediente, horaInicio: horaInicioIngrediente };
        const updatedIngredientes = [...ingredientes];
        updatedIngredientes[nextIndex] = nextIngrediente;

        set({
          ingredienteAtualIndex: nextIndex,
          ingredienteAtual: nextIngrediente,
          ingredientes: updatedIngredientes,
          pesoInicialIngrediente: pesoAtual,
          progresso: (nextIndex / ingredientes.length) * 100,
        });
      },

      registrarPeso: async (pesoFinal: number, flagManual: FlagManual) => {
        const { fabricacaoAtiva, ingredienteAtual, ingredienteAtualIndex, ingredientes, pesoInicialIngrediente } = get();
        if (!fabricacaoAtiva || !ingredienteAtual) return;

        set({ loadingSalvar: true, error: null });
        try {
          const pesoRegistrado = pesoFinal - pesoInicialIngrediente;
          const diferencaKg = pesoRegistrado - ingredienteAtual.pesoPrevisto;
          const diferencaPerc = ingredienteAtual.pesoPrevisto > 0
            ? (diferencaKg / ingredienteAtual.pesoPrevisto) * 100
            : 0;

          // Save ingredient record
          const ingredienteData: VetAutoFabricacaoIngredienteCreate = {
            fabricacao_id: fabricacaoAtiva.id,
            ingrediente_id: ingredienteAtual.receitaIngrediente.ingrediente_id,
            usuario_id: null,
            total_kg_mn_fabricada: pesoRegistrado,
            total_kg_mn_previsto: ingredienteAtual.pesoPrevisto,
            materia_seca_ingrediente: ingredienteAtual.receitaIngrediente.ingrediente?.materia_seca ?? null,
            hora_inicio: ingredienteAtual.horaInicio ?? new Date().toISOString(),
            hora_fim: new Date().toISOString(),
            total_diferenca_percentual: diferencaPerc,
            total_diferenca_kg: diferencaKg,
            status: 'processado',
            ordem: ingredienteAtual.receitaIngrediente.ordem_batida,
            nome: ingredienteAtual.receitaIngrediente.ingrediente?.nome ?? '',
            tolerancia: ingredienteAtual.receitaIngrediente.tolerancia,
            codigo_operador: null,
            nome_operador: null,
            peso_inicial: pesoInicialIngrediente,
            peso_final: pesoFinal,
            flag_manual: flagManual,
            flag_automation: false,
            flag_batchbox: false,
          };

          await dataService.save('vet_auto_fabricacao_ingredientes', {
            id: generateId(),
            ...ingredienteData,
          });

          // Update local state
          const updatedIngrediente: IngredienteFabricacao = {
            ...ingredienteAtual,
            status: 'processado',
            pesoRegistrado,
            diferencaKg,
          };
          const updatedIngredientes = [...ingredientes];
          updatedIngredientes[ingredienteAtualIndex] = updatedIngrediente;

          set({
            ingredientes: updatedIngredientes,
            ingredienteAtual: updatedIngrediente,
            pesoAcumulado: pesoFinal,
            loadingSalvar: false,
          });
        } catch (error) {
          const msg = error instanceof Error ? error.message : 'Erro ao registrar peso';
          set({ error: msg, loadingSalvar: false });
          throw error;
        }
      },

      pausar: () => {
        set({ status: 'espera', screen: 'blank' });
      },

      cancelar: async () => {
        const { fabricacaoAtiva } = get();
        if (!fabricacaoAtiva) return;

        set({ loadingSalvar: true, error: null });
        try {
          await dataService.update('vet_auto_fabricacoes', fabricacaoAtiva.id, {
            status: 'cancelado' as StatusFabricacao,
            hora_fim_fabricacao: new Date().toISOString(),
          });
          get().limpar();
        } catch (error) {
          const msg = error instanceof Error ? error.message : 'Erro ao cancelar fabricacao';
          set({ error: msg, loadingSalvar: false });
          throw error;
        }
      },

      finalizar: async () => {
        const { fabricacaoAtiva, pesoAcumulado, pesoAtual } = get();
        if (!fabricacaoAtiva) return;

        set({ loadingSalvar: true, error: null });
        try {
          const totalFabricado = pesoAtual > 0 ? pesoAtual : pesoAcumulado;

          await dataService.update('vet_auto_fabricacoes', fabricacaoAtiva.id, {
            status: 'processado' as StatusFabricacao,
            hora_fim_fabricacao: new Date().toISOString(),
            total_kg_mn_fabricada: totalFabricado,
          });
          get().limpar();
        } catch (error) {
          const msg = error instanceof Error ? error.message : 'Erro ao finalizar fabricacao';
          set({ error: msg, loadingSalvar: false });
          throw error;
        }
      },

      iniciarMistura: () => {
        set({ screen: 'misturar' });
      },

      // ── Real-time ───────────────────────────────────────────────────────

      atualizarPesoAtual: (peso) => set({ pesoAtual: peso }),

      atualizarTempoMisturaRestante: (segundos) => set({ tempoMisturaRestante: segundos }),

      // ── Restore ─────────────────────────────────────────────────────────

      restaurarFabricacao: async (fabricacaoId: string) => {
        set({ loading: true, error: null });
        try {
          const [fabricacaoRes, ingredientesRes] = await Promise.all([
            supabase
              .from('vet_auto_fabricacoes')
              .select('*, receita:receita_id(*)')
              .eq('id', fabricacaoId)
              .single(),
            supabase
              .from('vet_auto_fabricacao_ingredientes')
              .select('*')
              .eq('fabricacao_id', fabricacaoId)
              .order('ordem', { ascending: true }),
          ]);

          if (fabricacaoRes.error) throw fabricacaoRes.error;

          const fabricacao = fabricacaoRes.data as VetAutoFabricacao;
          const ingredientesFabricados = (ingredientesRes.data ?? []) as VetAutoFabricacaoIngrediente[];

          // Fetch recipe ingredients to rebuild the queue
          const { data: receitaIngredientes, error: riError } = await supabase
            .from('vet_auto_receita_ingredientes')
            .select('*, ingrediente:ingrediente_id(*)')
            .eq('receita_id', fabricacao.receita_id)
            .order('ordem_batida', { ascending: true });

          if (riError) throw riError;

          const ingredientes = calcularIngredientesFabricacao(
            (receitaIngredientes ?? []) as VetAutoReceitaIngrediente[],
            fabricacao.total_kg_mn_previsto,
          );

          // Mark already-completed ingredients
          let lastCompletedIndex = -1;
          for (const fab of ingredientesFabricados) {
            const idx = ingredientes.findIndex(
              (i) => i.receitaIngrediente.ingrediente_id === fab.ingrediente_id,
            );
            if (idx !== -1) {
              ingredientes[idx] = {
                ...ingredientes[idx],
                status: fab.status,
                pesoRegistrado: fab.total_kg_mn_fabricada,
                diferencaKg: fab.total_diferenca_kg,
              };
              if (idx > lastCompletedIndex) lastCompletedIndex = idx;
            }
          }

          set({
            fabricacaoAtiva: fabricacao,
            receita: fabricacao.receita ?? null,
            ingredientes,
            ingredienteAtualIndex: lastCompletedIndex,
            ingredienteAtual: lastCompletedIndex >= 0 ? ingredientes[lastCompletedIndex] : null,
            pesoPrevisto: fabricacao.total_kg_mn_previsto,
            pesoAcumulado: ingredientesFabricados.reduce((sum, i) => sum + i.total_kg_mn_fabricada, 0),
            status: fabricacao.status,
            screen: fabricacao.status === 'processando' ? 'fabricar' : 'blank',
            progresso: ingredientes.length > 0
              ? ((lastCompletedIndex + 1) / ingredientes.length) * 100
              : 0,
            tempoMistura: fabricacao.receita?.tempo_mistura ?? 0,
            tempoMisturaRestante: fabricacao.receita?.tempo_mistura ?? 0,
            loading: false,
          });
        } catch (error) {
          const msg = error instanceof Error ? error.message : 'Erro ao restaurar fabricacao';
          set({ error: msg, loading: false });
        }
      },

      // ── Reset ──────────────────────────────────────────────────────────

      limpar: () => {
        set({
          fabricacaoAtiva: null,
          ingredienteAtual: null,
          ingredienteAtualIndex: -1,
          ingredientes: [],
          receita: null,
          pesoPrevisto: 0,
          pesoAtual: 0,
          pesoInicialIngrediente: 0,
          pesoAcumulado: 0,
          status: 'espera',
          screen: 'blank',
          progresso: 0,
          tempoMistura: 0,
          tempoMisturaRestante: 0,
          loading: false,
          loadingSalvar: false,
          error: null,
        });
      },
    }),
    {
      name: 'rumo-fabricacao-store',
      storage: createJSONStorage(() => AsyncStorage),
      partialize: (state) => ({
        fabricacaoAtiva: state.fabricacaoAtiva,
        ingredienteAtualIndex: state.ingredienteAtualIndex,
        status: state.status,
      }),
    },
  ),
);
