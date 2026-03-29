import { supabase } from '@/lib/supabase';

// ============================================
// Types
// ============================================

export type StatusOrdemProducao = 'aguardando' | 'produzindo' | 'encerrado' | 'cancelado';

export interface VetAutoOrdemProducao {
  id: string;
  fazenda_id: string;
  receita_id: string;
  previsto_kg: number;
  realizado_kg: number | null;
  data_producao: string;
  status: StatusOrdemProducao;
  fabricacao_id: string | null;
  observacao: string | null;
  created_at: string;
  updated_at: string;
}

export interface OrdemProducaoComDetalhes extends VetAutoOrdemProducao {
  receita?: { id: string; nome: string } | null;
  fabricacao?: { id: string; lote_fabricacao: string; status: string } | null;
}

export interface OrdemProducaoFilters {
  status?: StatusOrdemProducao;
  data_inicio?: string;
  data_fim?: string;
}

// ============================================
// Helpers
// ============================================

function getHoje(): string {
  return new Date().toISOString().split('T')[0];
}

// ============================================
// ORDEM DE PRODUCAO
// ============================================

/**
 * Lista ordens de producao com filtros opcionais
 */
export async function getOrdens(
  fazenda_id: string,
  filters?: OrdemProducaoFilters
): Promise<OrdemProducaoComDetalhes[]> {
  let query = supabase
    .from('vet_auto_ordens_producao')
    .select(`
      *,
      receita:receita_id ( id, nome ),
      fabricacao:fabricacao_id ( id, lote_fabricacao, status )
    `)
    .eq('fazenda_id', fazenda_id)
    .order('data_producao', { ascending: false });

  if (filters?.status) {
    query = query.eq('status', filters.status);
  }
  if (filters?.data_inicio) {
    query = query.gte('data_producao', filters.data_inicio);
  }
  if (filters?.data_fim) {
    query = query.lte('data_producao', filters.data_fim);
  }

  const { data, error } = await query;
  if (error) throw new Error(`Erro ao buscar ordens: ${error.message}`);
  return (data ?? []) as OrdemProducaoComDetalhes[];
}

/**
 * Cria uma nova ordem de producao
 */
export async function createOrdem(
  fazenda_id: string,
  receita_id: string,
  previsto_kg: number,
  data_producao: string
): Promise<VetAutoOrdemProducao> {
  const { data, error } = await supabase
    .from('vet_auto_ordens_producao')
    .insert({
      fazenda_id,
      receita_id,
      previsto_kg,
      data_producao,
      status: 'aguardando' as StatusOrdemProducao,
    })
    .select()
    .single();

  if (error) throw new Error(`Erro ao criar ordem: ${error.message}`);
  return data as VetAutoOrdemProducao;
}

/**
 * Atualiza o status de uma ordem de producao
 */
export async function updateOrdemStatus(
  id: string,
  status: StatusOrdemProducao
): Promise<VetAutoOrdemProducao> {
  const { data, error } = await supabase
    .from('vet_auto_ordens_producao')
    .update({
      status,
      updated_at: new Date().toISOString(),
    })
    .eq('id', id)
    .select()
    .single();

  if (error) throw new Error(`Erro ao atualizar status da ordem: ${error.message}`);
  return data as VetAutoOrdemProducao;
}

/**
 * Busca ordens com status aguardando
 */
export async function getOrdensAguardando(
  fazenda_id: string
): Promise<OrdemProducaoComDetalhes[]> {
  return getOrdens(fazenda_id, { status: 'aguardando' });
}

/**
 * Vincula uma fabricacao a uma ordem de producao
 */
export async function vincularFabricacao(
  ordem_id: string,
  fabricacao_id: string
): Promise<VetAutoOrdemProducao> {
  const { data, error } = await supabase
    .from('vet_auto_ordens_producao')
    .update({
      fabricacao_id,
      status: 'produzindo' as StatusOrdemProducao,
      updated_at: new Date().toISOString(),
    })
    .eq('id', ordem_id)
    .select()
    .single();

  if (error) throw new Error(`Erro ao vincular fabricacao: ${error.message}`);
  return data as VetAutoOrdemProducao;
}
