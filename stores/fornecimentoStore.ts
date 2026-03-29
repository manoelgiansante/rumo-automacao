import { create } from 'zustand';
import { persist, createJSONStorage } from 'zustand/middleware';
import AsyncStorage from '@react-native-async-storage/async-storage';
import { supabase } from '@/lib/supabase';
import { dataService } from '@/services/dataService';
import { generateId } from '@/services/offlineService';
import type {
  VetAutoCarregamento,
  VetAutoFornecido,
  VetAutoFornecidoCreate,
  VetAutoCurral,
  VetAutoPrevisto,
  StatusCarregamento,
  StatusFornecido,
} from '@/types/automacao';
import type { VetAutoSafePoint } from '@/services/safePointService';
import { getSafePoints } from '@/services/safePointService';

// ─── Derived types ───────────────────────────────────────────────────────────

/** Fornecimento em andamento com dados calculados */
export interface FornecimentoEmAndamento {
  curral: VetAutoCurral;
  previsto: VetAutoPrevisto | null;
  pesoInicial: number;
  pesoFinal: number | null;
  fornecidoKg: number | null;
  tagInicial: string | null;
  tagFinal: string | null;
  horaInicio: string;
  horaFinal: string | null;
  status: 'aguardando_tag_inicial' | 'pesando_inicial' | 'fornecendo' | 'aguardando_tag_final' | 'pesando_final' | 'registrado';
}

// ─── State interface ─────────────────────────────────────────────────────────

interface FornecimentoState {
  // Carregamento ativo (vagao saiu com racao)
  carregamentoAtivo: VetAutoCarregamento | null;

  // Fornecimentos do carregamento atual
  fornecimentos: VetAutoFornecido[];

  // Fornecimento em andamento (curral atual)
  fornecimentoAtual: FornecimentoEmAndamento | null;

  // Curral detectado via RFID
  curralAtual: VetAutoCurral | null;

  // Pesos do fornecimento em andamento
  pesoInicial: number;
  pesoFinal: number;

  // Tags do fornecimento em andamento
  tagInicial: string | null;
  tagFinal: string | null;

  // Currais com RFID disponíveis
  curraisRfid: VetAutoCurral[];

  // Previstos do dia para o trato atual
  previstosTrato: VetAutoPrevisto[];

  // Safe points da fazenda
  safePoints: VetAutoSafePoint[];

  // Safe point group ativo (quando tag de safe point e lida)
  activeSafePoint: VetAutoSafePoint | null;

  // Totais
  totalFornecido: number;
  totalPrevisto: number;
  pesoRestante: number;

  // Loading/error
  loading: boolean;
  loadingSalvar: boolean;
  error: string | null;

  // Actions - Carregamento
  iniciarCarregamento: (carregamento: VetAutoCarregamento) => Promise<void>;
  finalizarCarregamento: (pesoRetorno: number) => Promise<void>;
  cancelarCarregamento: () => Promise<void>;

  // Actions - Fornecimento
  identificarCurral: (tag: string) => VetAutoCurral | null;
  iniciarFornecimento: (curral: VetAutoCurral, pesoInicial: number, tagInicial: string | null) => void;
  registrarTagInicial: (tag: string) => void;
  confirmarPesoInicial: (peso: number) => void;
  registrarTagFinal: (tag: string) => void;
  confirmarPesoFinal: (peso: number) => void;
  registrarFornecimento: (pesoFinal: number, tagFinal: string | null, entradaManual?: boolean) => Promise<VetAutoFornecido>;
  cancelarFornecimentoAtual: () => void;

  // Actions - Safe Points
  carregarSafePoints: (fazendaId: string) => Promise<void>;
  identificarSafePoint: (tag: string) => VetAutoSafePoint | null;

  // Actions - Data
  fetchCurraisRfid: (fazendaId: string) => Promise<void>;
  fetchPrevistosTrato: (fazendaId: string, numeroTrato: number, data?: string) => Promise<void>;
  fetchFornecimentosCarregamento: (carregamentoId: string) => Promise<void>;

  // Reset
  limpar: () => void;
}

// ─── Store ───────────────────────────────────────────────────────────────────

export const useFornecimentoStore = create<FornecimentoState>()(
  persist(
    (set, get) => ({
      // Initial state
      carregamentoAtivo: null,
      fornecimentos: [],
      fornecimentoAtual: null,
      curralAtual: null,
      pesoInicial: 0,
      pesoFinal: 0,
      tagInicial: null,
      tagFinal: null,
      curraisRfid: [],
      previstosTrato: [],
      safePoints: [],
      activeSafePoint: null,
      totalFornecido: 0,
      totalPrevisto: 0,
      pesoRestante: 0,
      loading: false,
      loadingSalvar: false,
      error: null,

      // ── Carregamento ───────────────────────────────────────────────────

      iniciarCarregamento: async (carregamento: VetAutoCarregamento) => {
        set({ loading: true, error: null });
        try {
          // Update carregamento status to fornecendo
          await dataService.update('vet_auto_carregamentos', carregamento.id, {
            status: 'fornecendo' as StatusCarregamento,
          });

          // Fetch currais, previstos, and safe points
          await Promise.all([
            get().fetchCurraisRfid(carregamento.fazenda_id),
            get().fetchPrevistosTrato(carregamento.fazenda_id, carregamento.numero_trato, carregamento.data),
            get().fetchFornecimentosCarregamento(carregamento.id),
            get().carregarSafePoints(carregamento.fazenda_id),
          ]);

          const previstos = get().previstosTrato;
          const totalPrevisto = previstos.reduce((sum, p) => sum + p.previsto_kg, 0);

          set({
            carregamentoAtivo: { ...carregamento, status: 'fornecendo' },
            pesoRestante: carregamento.total_carregado,
            totalPrevisto,
            totalFornecido: 0,
            loading: false,
          });
        } catch (error) {
          const msg = error instanceof Error ? error.message : 'Erro ao iniciar carregamento';
          set({ error: msg, loading: false });
          throw error;
        }
      },

      finalizarCarregamento: async (pesoRetorno: number) => {
        const { carregamentoAtivo } = get();
        if (!carregamentoAtivo) return;

        set({ loadingSalvar: true, error: null });
        try {
          await dataService.update('vet_auto_carregamentos', carregamentoAtivo.id, {
            status: 'fechado' as StatusCarregamento,
            peso_balancao_retorno: pesoRetorno,
          });
          get().limpar();
        } catch (error) {
          const msg = error instanceof Error ? error.message : 'Erro ao finalizar carregamento';
          set({ error: msg, loadingSalvar: false });
          throw error;
        }
      },

      cancelarCarregamento: async () => {
        const { carregamentoAtivo } = get();
        if (!carregamentoAtivo) return;

        set({ loadingSalvar: true, error: null });
        try {
          await dataService.update('vet_auto_carregamentos', carregamentoAtivo.id, {
            status: 'cancelado' as StatusCarregamento,
          });
          get().limpar();
        } catch (error) {
          const msg = error instanceof Error ? error.message : 'Erro ao cancelar carregamento';
          set({ error: msg, loadingSalvar: false });
          throw error;
        }
      },

      // ── Fornecimento ───────────────────────────────────────────────────

      identificarCurral: (tag: string): VetAutoCurral | null => {
        const { curraisRfid } = get();

        // Search by tag_inicial or tag_final
        const curral = curraisRfid.find(
          (c) =>
            (c.tag_inicial && c.tag_inicial.toLowerCase() === tag.toLowerCase()) ||
            (c.tag_final && c.tag_final.toLowerCase() === tag.toLowerCase()),
        );

        if (curral) {
          set({ curralAtual: curral });
        }

        return curral ?? null;
      },

      iniciarFornecimento: (curral: VetAutoCurral, pesoInicial: number, tagInicial: string | null) => {
        const { previstosTrato, carregamentoAtivo } = get();

        // Find previsto for this curral
        const previsto = previstosTrato.find(
          (p) => p.curral_id === curral.id && p.numero_trato === carregamentoAtivo?.numero_trato,
        ) ?? null;

        // Determine initial status based on what data we have:
        // - If tagInicial is provided, we already detected the initial tag -> pesando_inicial
        // - Otherwise start at aguardando_tag_inicial
        const initialStatus: FornecimentoEmAndamento['status'] = tagInicial
          ? 'pesando_inicial'
          : 'aguardando_tag_inicial';

        const fornecimentoAtual: FornecimentoEmAndamento = {
          curral,
          previsto,
          pesoInicial,
          pesoFinal: null,
          fornecidoKg: null,
          tagInicial,
          tagFinal: null,
          horaInicio: new Date().toISOString(),
          horaFinal: null,
          status: initialStatus,
        };

        set({
          fornecimentoAtual,
          curralAtual: curral,
          pesoInicial,
          tagInicial,
          pesoFinal: 0,
          tagFinal: null,
        });
      },

      registrarTagInicial: (tag: string) => {
        const { fornecimentoAtual } = get();
        if (!fornecimentoAtual || fornecimentoAtual.status !== 'aguardando_tag_inicial') return;

        set({
          fornecimentoAtual: {
            ...fornecimentoAtual,
            tagInicial: tag,
            status: 'pesando_inicial',
          },
          tagInicial: tag,
        });
      },

      confirmarPesoInicial: (peso: number) => {
        const { fornecimentoAtual } = get();
        if (!fornecimentoAtual || fornecimentoAtual.status !== 'pesando_inicial') return;

        set({
          fornecimentoAtual: {
            ...fornecimentoAtual,
            pesoInicial: peso,
            status: 'fornecendo',
          },
          pesoInicial: peso,
        });
      },

      registrarTagFinal: (tag: string) => {
        const { fornecimentoAtual } = get();
        if (!fornecimentoAtual || fornecimentoAtual.status !== 'fornecendo') return;

        set({
          fornecimentoAtual: {
            ...fornecimentoAtual,
            tagFinal: tag,
            status: 'pesando_final',
          },
          tagFinal: tag,
        });
      },

      confirmarPesoFinal: (peso: number) => {
        const { fornecimentoAtual } = get();
        if (!fornecimentoAtual || fornecimentoAtual.status !== 'pesando_final') return;

        const fornecidoKg = fornecimentoAtual.pesoInicial - peso;

        set({
          fornecimentoAtual: {
            ...fornecimentoAtual,
            pesoFinal: peso,
            fornecidoKg,
            horaFinal: new Date().toISOString(),
            status: 'registrado',
          },
          pesoFinal: peso,
        });
      },

      registrarFornecimento: async (pesoFinal: number, tagFinal: string | null, entradaManual = false) => {
        const { fornecimentoAtual, carregamentoAtivo, pesoInicial, tagInicial, fornecimentos, activeSafePoint } = get();
        if (!fornecimentoAtual || !carregamentoAtivo) {
          throw new Error('Nenhum fornecimento em andamento');
        }

        set({ loadingSalvar: true, error: null });
        try {
          const fornecidoKg = pesoInicial - pesoFinal;

          const dados: VetAutoFornecidoCreate = {
            fazenda_id: carregamentoAtivo.fazenda_id,
            fornecido_kg: fornecidoKg,
            status: 'fornecido' as StatusFornecido,
            data: carregamentoAtivo.data,
            tag_inicial: tagInicial,
            tag_final: tagFinal,
            ordem_trato: fornecimentoAtual.curral.ordem_trato ?? null,
            peso_inicial: pesoInicial,
            peso_final: pesoFinal,
            hora_inicio: fornecimentoAtual.horaInicio,
            hora_final: new Date().toISOString(),
            carregamento_id: carregamentoAtivo.id,
            curral_id: fornecimentoAtual.curral.id,
            usuario_id: null,
            misturador_vagao_id: carregamentoAtivo.misturador_vagao_id,
            numero_trato: carregamentoAtivo.numero_trato,
            grupo_safe_point: activeSafePoint?.id ?? null,
            grupo_safe_point_nome: activeSafePoint?.nome ?? null,
            numero_dispositivo: null,
            receita_id: null,
            flag_rateio: false,
            peso_antigo: null,
            entrada_manual: entradaManual,
            previsto_kg: fornecimentoAtual.previsto?.previsto_kg ?? null,
          };

          const savedData = await dataService.save('vet_auto_fornecidos', {
            id: generateId(),
            ...dados,
          });
          const fornecido = savedData as unknown as VetAutoFornecido;

          // Update previsto realizado_kg
          if (fornecimentoAtual.previsto) {
            const novoRealizado = (fornecimentoAtual.previsto.realizado_kg ?? 0) + fornecidoKg;
            await dataService.update('vet_auto_previstos', fornecimentoAtual.previsto.id, {
              realizado_kg: novoRealizado,
            });

            // Update local previstos
            const previstos = get().previstosTrato.map((p) =>
              p.id === fornecimentoAtual.previsto!.id
                ? { ...p, realizado_kg: novoRealizado }
                : p,
            );
            set({ previstosTrato: previstos });
          }

          // Update totals
          const totalFornecido = get().totalFornecido + fornecidoKg;
          const pesoRestante = pesoFinal;

          set({
            fornecimentos: [...fornecimentos, fornecido],
            fornecimentoAtual: null,
            curralAtual: null,
            pesoInicial: 0,
            pesoFinal: 0,
            tagInicial: null,
            tagFinal: null,
            totalFornecido,
            pesoRestante,
            loadingSalvar: false,
          });

          return fornecido;
        } catch (error) {
          const msg = error instanceof Error ? error.message : 'Erro ao registrar fornecimento';
          set({ error: msg, loadingSalvar: false });
          throw error;
        }
      },

      cancelarFornecimentoAtual: () => {
        set({
          fornecimentoAtual: null,
          curralAtual: null,
          pesoInicial: 0,
          pesoFinal: 0,
          tagInicial: null,
          tagFinal: null,
        });
      },

      // ── Safe Points ─────────────────────────────────────────────────────

      carregarSafePoints: async (fazendaId: string) => {
        try {
          const safePoints = await getSafePoints(fazendaId);
          set({ safePoints });
        } catch (error) {
          console.error('Erro ao carregar safe points:', error);
        }
      },

      identificarSafePoint: (tag: string): VetAutoSafePoint | null => {
        const { safePoints } = get();
        const tagNorm = tag.toLowerCase();
        const sp = safePoints.find((s) => s.tag.toLowerCase() === tagNorm) ?? null;
        if (sp) {
          set({ activeSafePoint: sp });
        }
        return sp;
      },

      // ── Data ────────────────────────────────────────────────────────────

      fetchCurraisRfid: async (fazendaId: string) => {
        try {
          const data = await dataService.query(
            'vet_auto_currais',
            { fazenda_id: fazendaId, ativo: true },
            { orderBy: 'linha', ascending: true }
          );
          set({ curraisRfid: data as unknown as VetAutoCurral[] });
        } catch (error) {
          console.error('Erro ao buscar currais RFID:', error);
        }
      },

      fetchPrevistosTrato: async (fazendaId: string, numeroTrato: number, data?: string) => {
        try {
          const dataFornecimento = data ?? new Date().toISOString().split('T')[0];

          const { data: previstos, error } = await supabase
            .from('vet_auto_previstos')
            .select('*, curral:curral_id(*), receita:receita_id(*)')
            .eq('fazenda_id', fazendaId)
            .eq('numero_trato', numeroTrato)
            .eq('data_fornecimento', dataFornecimento)
            .order('curral_id', { ascending: true });

          if (error) throw error;
          set({ previstosTrato: (previstos ?? []) as VetAutoPrevisto[] });
        } catch (error) {
          console.error('Erro ao buscar previstos do trato:', error);
        }
      },

      fetchFornecimentosCarregamento: async (carregamentoId: string) => {
        try {
          const { data, error } = await supabase
            .from('vet_auto_fornecidos')
            .select('*, curral:curral_id(*)')
            .eq('carregamento_id', carregamentoId)
            .order('created_at', { ascending: true });

          if (error) throw error;
          const fornecimentos = (data ?? []) as VetAutoFornecido[];
          const totalFornecido = fornecimentos.reduce((sum, f) => sum + f.fornecido_kg, 0);
          set({ fornecimentos, totalFornecido });
        } catch (error) {
          console.error('Erro ao buscar fornecimentos do carregamento:', error);
        }
      },

      // ── Reset ──────────────────────────────────────────────────────────

      limpar: () => {
        set({
          carregamentoAtivo: null,
          fornecimentos: [],
          fornecimentoAtual: null,
          curralAtual: null,
          pesoInicial: 0,
          pesoFinal: 0,
          tagInicial: null,
          tagFinal: null,
          curraisRfid: [],
          previstosTrato: [],
          safePoints: [],
          activeSafePoint: null,
          totalFornecido: 0,
          totalPrevisto: 0,
          pesoRestante: 0,
          loading: false,
          loadingSalvar: false,
          error: null,
        });
      },
    }),
    {
      name: 'rumo-fornecimento-store',
      storage: createJSONStorage(() => AsyncStorage),
      partialize: (state) => ({
        carregamentoAtivo: state.carregamentoAtivo,
        fornecimentos: state.fornecimentos,
        totalFornecido: state.totalFornecido,
      }),
    },
  ),
);
