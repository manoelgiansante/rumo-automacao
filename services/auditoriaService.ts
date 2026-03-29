import { supabase } from '@/lib/supabase';

// ============================================
// Types
// ============================================

export type EventoFabricacao = 'inicio' | 'ingrediente' | 'pausa' | 'cancelamento' | 'finalizacao';
export type EventoFornecimento = 'carregamento' | 'fornecimento' | 'descarte' | 'finalizacao';

export interface VetAutoLogAtividade {
  id: string;
  fazenda_id: string;
  usuario_id: string;
  usuario_nome: string;
  acao: string;
  detalhes: Record<string, unknown> | null;
  created_at: string;
}

export interface LogAtividadeFiltros {
  usuario_id?: string;
  acao?: string;
  data_inicio?: string;
  data_fim?: string;
  limite?: number;
}

// ============================================
// LOG DE ATIVIDADES
// ============================================

/**
 * Registra uma atividade generica no log
 */
export async function logAtividade(
  fazenda_id: string,
  usuario_id: string,
  usuario_nome: string,
  acao: string,
  detalhes?: Record<string, unknown>
): Promise<void> {
  const { error } = await supabase
    .from('vet_auto_log_atividades')
    .insert({
      fazenda_id,
      usuario_id,
      usuario_nome,
      acao,
      detalhes: detalhes || null,
    });

  if (error) {
    console.error(`Erro ao registrar log de atividade: ${error.message}`);
  }
}

/**
 * Registra evento de fabricacao
 */
export async function logFabricacao(
  fazenda_id: string,
  usuario_id: string,
  evento: EventoFabricacao,
  detalhes: Record<string, unknown>
): Promise<void> {
  await logAtividade(
    fazenda_id,
    usuario_id,
    detalhes.usuario_nome as string || 'Sistema',
    `fabricacao.${evento}`,
    detalhes
  );
}

/**
 * Registra evento de fornecimento
 */
export async function logFornecimento(
  fazenda_id: string,
  usuario_id: string,
  evento: EventoFornecimento,
  detalhes: Record<string, unknown>
): Promise<void> {
  await logAtividade(
    fazenda_id,
    usuario_id,
    detalhes.usuario_nome as string || 'Sistema',
    `fornecimento.${evento}`,
    detalhes
  );
}

/**
 * Busca log de atividades com filtros
 */
export async function getLogAtividades(
  fazenda_id: string,
  filtros?: LogAtividadeFiltros
): Promise<VetAutoLogAtividade[]> {
  let query = supabase
    .from('vet_auto_log_atividades')
    .select('*')
    .eq('fazenda_id', fazenda_id)
    .order('created_at', { ascending: false });

  if (filtros?.usuario_id) {
    query = query.eq('usuario_id', filtros.usuario_id);
  }
  if (filtros?.acao) {
    query = query.ilike('acao', `%${filtros.acao}%`);
  }
  if (filtros?.data_inicio) {
    query = query.gte('created_at', filtros.data_inicio);
  }
  if (filtros?.data_fim) {
    query = query.lte('created_at', filtros.data_fim + 'T23:59:59');
  }
  if (filtros?.limite) {
    query = query.limit(filtros.limite);
  } else {
    query = query.limit(100);
  }

  const { data, error } = await query;
  if (error) throw new Error(`Erro ao buscar log de atividades: ${error.message}`);
  return (data ?? []) as VetAutoLogAtividade[];
}
