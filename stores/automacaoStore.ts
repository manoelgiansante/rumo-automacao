import { create } from 'zustand';
import { persist, createJSONStorage } from 'zustand/middleware';
import AsyncStorage from '@react-native-async-storage/async-storage';
import { supabase } from '@/lib/supabase';
import { dataService } from '@/services/dataService';
import { generateId } from '@/services/offlineService';
import type {
  VetAutoFabricacao,
  VetAutoCarregamento,
  VetAutoFornecido,
  VetAutoPrevisto,
  ResumoDiario,
  VetAutoFabricacaoCreate,
  VetAutoCarregamentoCreate,
  VetAutoFornecidoCreate,
  StatusFabricacao,
  StatusCarregamento,
} from '@/types/automacao';

// ─── State interface ─────────────────────────────────────────────────────────

interface AutomacaoState {
  // Fazenda ativa
  fazendaAtiva: { fazenda_id: string } | null;
  setFazendaAtiva: (fazenda: { fazenda_id: string }) => void;

  // Data
  fabricacaoAtiva: VetAutoFabricacao | null;
  carregamentoAtivo: VetAutoCarregamento | null;
  fornecimentosDia: VetAutoFornecido[];
  previsoesDia: VetAutoPrevisto[];
  resumoDiario: ResumoDiario | null;
  dataAtual: string;

  // Loading/error
  loading: boolean;
  loadingDetail: boolean;
  loadingSalvar: boolean;
  error: string | null;

  // Actions - Fabricacao
  iniciarFabricacao: (dados: VetAutoFabricacaoCreate) => Promise<VetAutoFabricacao>;
  finalizarFabricacao: (id: string, totalFabricado: number) => Promise<void>;
  cancelarFabricacao: (id: string) => Promise<void>;

  // Actions - Carregamento
  iniciarCarregamento: (dados: VetAutoCarregamentoCreate) => Promise<VetAutoCarregamento>;
  fecharCarregamento: (id: string, pesoRetorno: number) => Promise<void>;
  cancelarCarregamento: (id: string) => Promise<void>;

  // Actions - Fornecimento
  registrarFornecimento: (dados: VetAutoFornecidoCreate) => Promise<VetAutoFornecido>;

  // Actions - Dados do dia
  carregarDadosDia: (fazendaId: string, data?: string) => Promise<void>;
  fetchFornecimentosDia: (fazendaId: string, data?: string) => Promise<void>;
  fetchPrevisoesDia: (fazendaId: string, data?: string) => Promise<void>;
  fetchResumoDiario: (fazendaId: string, data?: string) => Promise<void>;

  // Actions - UI
  setDataAtual: (data: string) => void;

  // Reset
  limpar: () => void;
}

// ─── Store ───────────────────────────────────────────────────────────────────

export const useAutomacaoStore = create<AutomacaoState>()(
  persist(
    (set, get) => ({
      // Initial state
      fazendaAtiva: null,
      setFazendaAtiva: (fazenda) => set({ fazendaAtiva: fazenda }),
      fabricacaoAtiva: null,
      carregamentoAtivo: null,
      fornecimentosDia: [],
      previsoesDia: [],
      resumoDiario: null,
      dataAtual: new Date().toISOString().split('T')[0],
      loading: false,
      loadingDetail: false,
      loadingSalvar: false,
      error: null,

      // ── Fabricacao ──────────────────────────────────────────────────────

      iniciarFabricacao: async (dados: VetAutoFabricacaoCreate) => {
        set({ loadingSalvar: true, error: null });
        try {
          const data = await dataService.save('vet_auto_fabricacoes', {
            id: generateId(),
            ...dados,
            status: 'processando' as StatusFabricacao,
            hora_inicio_fabricacao: new Date().toISOString(),
          });
          const fabricacao = data as unknown as VetAutoFabricacao;
          set({ fabricacaoAtiva: fabricacao, loadingSalvar: false });
          return fabricacao;
        } catch (error) {
          const msg = error instanceof Error ? error.message : 'Erro ao iniciar fabricacao';
          set({ error: msg, loadingSalvar: false });
          throw error;
        }
      },

      finalizarFabricacao: async (id: string, totalFabricado: number) => {
        set({ loadingSalvar: true, error: null });
        try {
          await dataService.update('vet_auto_fabricacoes', id, {
            status: 'processado' as StatusFabricacao,
            hora_fim_fabricacao: new Date().toISOString(),
            total_kg_mn_fabricada: totalFabricado,
          });
          set({ fabricacaoAtiva: null, loadingSalvar: false });
        } catch (error) {
          const msg = error instanceof Error ? error.message : 'Erro ao finalizar fabricacao';
          set({ error: msg, loadingSalvar: false });
          throw error;
        }
      },

      cancelarFabricacao: async (id: string) => {
        set({ loadingSalvar: true, error: null });
        try {
          await dataService.update('vet_auto_fabricacoes', id, {
            status: 'cancelado' as StatusFabricacao,
            hora_fim_fabricacao: new Date().toISOString(),
          });
          set({ fabricacaoAtiva: null, loadingSalvar: false });
        } catch (error) {
          const msg = error instanceof Error ? error.message : 'Erro ao cancelar fabricacao';
          set({ error: msg, loadingSalvar: false });
          throw error;
        }
      },

      // ── Carregamento ───────────────────────────────────────────────────

      iniciarCarregamento: async (dados: VetAutoCarregamentoCreate) => {
        set({ loadingSalvar: true, error: null });
        try {
          const data = await dataService.save('vet_auto_carregamentos', {
            id: generateId(),
            ...dados,
            status: 'carregando' as StatusCarregamento,
          });
          const carregamento = data as unknown as VetAutoCarregamento;
          set({ carregamentoAtivo: carregamento, loadingSalvar: false });
          return carregamento;
        } catch (error) {
          const msg = error instanceof Error ? error.message : 'Erro ao iniciar carregamento';
          set({ error: msg, loadingSalvar: false });
          throw error;
        }
      },

      fecharCarregamento: async (id: string, pesoRetorno: number) => {
        set({ loadingSalvar: true, error: null });
        try {
          await dataService.update('vet_auto_carregamentos', id, {
            status: 'fechado' as StatusCarregamento,
            peso_balancao_retorno: pesoRetorno,
          });

          const carregamento = get().carregamentoAtivo;
          set({ carregamentoAtivo: null, loadingSalvar: false });

          // Refresh daily data
          if (carregamento) {
            get().carregarDadosDia(carregamento.fazenda_id, carregamento.data);
          }
        } catch (error) {
          const msg = error instanceof Error ? error.message : 'Erro ao fechar carregamento';
          set({ error: msg, loadingSalvar: false });
          throw error;
        }
      },

      cancelarCarregamento: async (id: string) => {
        set({ loadingSalvar: true, error: null });
        try {
          await dataService.update('vet_auto_carregamentos', id, {
            status: 'cancelado' as StatusCarregamento,
          });
          set({ carregamentoAtivo: null, loadingSalvar: false });
        } catch (error) {
          const msg = error instanceof Error ? error.message : 'Erro ao cancelar carregamento';
          set({ error: msg, loadingSalvar: false });
          throw error;
        }
      },

      // ── Fornecimento ───────────────────────────────────────────────────

      registrarFornecimento: async (dados: VetAutoFornecidoCreate) => {
        set({ loadingSalvar: true, error: null });
        try {
          const savedData = await dataService.save('vet_auto_fornecidos', {
            id: generateId(),
            ...dados,
          });
          const fornecimento = savedData as unknown as VetAutoFornecido;

          // Update previstos with realized amount
          if (dados.curral_id && dados.numero_trato) {
            const previstos = get().previsoesDia;
            const previsto = previstos.find(
              (p) => p.curral_id === dados.curral_id && p.numero_trato === dados.numero_trato,
            );
            if (previsto) {
              await dataService.update('vet_auto_previstos', previsto.id, {
                realizado_kg: previsto.realizado_kg + fornecimento.fornecido_kg,
              });
            }
          }

          // Refresh fornecimentos do dia
          await get().fetchFornecimentosDia(dados.fazenda_id, dados.data);
          set({ loadingSalvar: false });
          return fornecimento;
        } catch (error) {
          const msg = error instanceof Error ? error.message : 'Erro ao registrar fornecimento';
          set({ error: msg, loadingSalvar: false });
          throw error;
        }
      },

      // ── Dados do dia ───────────────────────────────────────────────────

      carregarDadosDia: async (fazendaId: string, data?: string) => {
        set({ loading: true, error: null });
        try {
          await Promise.all([
            get().fetchFornecimentosDia(fazendaId, data),
            get().fetchPrevisoesDia(fazendaId, data),
            get().fetchResumoDiario(fazendaId, data),
          ]);
          set({ loading: false });
        } catch (error) {
          const msg = error instanceof Error ? error.message : 'Erro ao carregar dados do dia';
          set({ error: msg, loading: false });
        }
      },

      fetchFornecimentosDia: async (fazendaId: string, data?: string) => {
        try {
          const dataFornecimento = data ?? get().dataAtual;
          const { data: fornecimentos, error } = await supabase
            .from('vet_auto_fornecidos')
            .select('*, curral:curral_id(*), receita:receita_id(*)')
            .eq('fazenda_id', fazendaId)
            .eq('data', dataFornecimento)
            .order('numero_trato', { ascending: true })
            .order('created_at', { ascending: true });

          if (error) throw error;
          set({ fornecimentosDia: (fornecimentos ?? []) as VetAutoFornecido[] });
        } catch (error) {
          console.error('Erro ao buscar fornecimentos do dia:', error);
        }
      },

      fetchPrevisoesDia: async (fazendaId: string, data?: string) => {
        try {
          const dataPrevisto = data ?? get().dataAtual;
          const { data: previstos, error } = await supabase
            .from('vet_auto_previstos')
            .select('*, curral:curral_id(*), receita:receita_id(*)')
            .eq('fazenda_id', fazendaId)
            .eq('data_fornecimento', dataPrevisto)
            .order('numero_trato', { ascending: true })
            .order('curral_id', { ascending: true });

          if (error) throw error;
          set({ previsoesDia: (previstos ?? []) as VetAutoPrevisto[] });
        } catch (error) {
          console.error('Erro ao buscar previstos do dia:', error);
        }
      },

      fetchResumoDiario: async (fazendaId: string, data?: string) => {
        try {
          const dataResumo = data ?? get().dataAtual;
          const { data: resumo, error } = await supabase
            .rpc('resumo_automacao_dia', {
              p_fazenda_id: fazendaId,
              p_data: dataResumo,
            });

          if (error) throw error;
          set({ resumoDiario: (resumo as ResumoDiario) ?? null });
        } catch (error) {
          console.error('Erro ao buscar resumo diario:', error);
        }
      },

      // ── UI ─────────────────────────────────────────────────────────────

      setDataAtual: (data) => set({ dataAtual: data }),

      // ── Reset ──────────────────────────────────────────────────────────

      limpar: () => {
        set({
          fazendaAtiva: null,
          fabricacaoAtiva: null,
          carregamentoAtivo: null,
          fornecimentosDia: [],
          previsoesDia: [],
          resumoDiario: null,
          dataAtual: new Date().toISOString().split('T')[0],
          loading: false,
          loadingDetail: false,
          loadingSalvar: false,
          error: null,
        });
      },
    }),
    {
      name: 'rumo-automacao-store',
      storage: createJSONStorage(() => AsyncStorage),
      partialize: (state) => ({
        fazendaAtiva: state.fazendaAtiva,
        fabricacaoAtiva: state.fabricacaoAtiva,
        carregamentoAtivo: state.carregamentoAtivo,
        dataAtual: state.dataAtual,
      }),
    },
  ),
);
