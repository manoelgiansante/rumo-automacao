import { supabase } from '@/lib/supabase';

// ============================================
// Types
// ============================================

export interface VetAutoPrevisao {
  id: string;
  fazenda_id: string;
  curral_rfid_id: string;
  trato_id: string;
  receita_id: string;
  data: string;
  previsto_kg: number;
  quantidade_cab: number;
  realizado_kg: number;
  created_at: string;
  updated_at: string;
}

export interface PrevisaoComDetalhes extends VetAutoPrevisao {
  curral_rfid?: {
    id: string;
    tag_inicial: string;
    tag_final: string;
    curral?: { id: string; codigo: string; nome: string | null } | null;
  } | null;
  receita?: { id: string; nome: string } | null;
}

export interface ResumoDiarioTrato {
  trato_id: string;
  total_previsto_kg: number;
  total_realizado_kg: number;
  diferenca_kg: number;
  diferenca_percentual: number;
  total_currais: number;
}

export interface ResumoDiarioReceita {
  receita_id: string;
  receita_nome: string;
  total_previsto_kg: number;
  total_realizado_kg: number;
  diferenca_kg: number;
  diferenca_percentual: number;
  total_currais: number;
}

export interface ResumoDiario {
  data: string;
  total_previsto_kg: number;
  total_realizado_kg: number;
  eficiencia_percentual: number;
  por_trato: ResumoDiarioTrato[];
  por_receita: ResumoDiarioReceita[];
}

// ============================================
// Helpers
// ============================================

function getHoje(): string {
  return new Date().toISOString().split('T')[0];
}

// ============================================
// PREVISOES
// ============================================

/**
 * Busca todas as previsoes de um dia para uma fazenda
 */
export async function getPrevisoesDia(
  fazenda_id: string,
  data?: string
): Promise<PrevisaoComDetalhes[]> {
  const dataFiltro = data || getHoje();

  const { data: result, error } = await supabase
    .from('vet_auto_previsoes')
    .select(`
      *,
      curral_rfid:vet_auto_currais_rfid!curral_rfid_id(
        id, tag_inicial, tag_final,
        curral:vet_auto_currais!curral_id(id, codigo, nome)
      ),
      receita:vet_auto_receitas!receita_id(id, nome)
    `)
    .eq('fazenda_id', fazenda_id)
    .eq('data', dataFiltro)
    .order('trato_id', { ascending: true });

  if (error) throw new Error(`Erro ao buscar previsoes do dia: ${error.message}`);
  return (result ?? []) as PrevisaoComDetalhes[];
}

/**
 * Cria uma nova previsao de fornecimento
 */
export async function createPrevisao(
  fazenda_id: string,
  curral_rfid_id: string,
  trato_id: string,
  receita_id: string,
  data: string,
  previsto_kg: number,
  quantidade_cab: number
): Promise<VetAutoPrevisao> {
  const { data: result, error } = await supabase
    .from('vet_auto_previsoes')
    .insert({
      fazenda_id,
      curral_rfid_id,
      trato_id,
      receita_id,
      data,
      previsto_kg,
      quantidade_cab,
      realizado_kg: 0,
    })
    .select()
    .single();

  if (error) throw new Error(`Erro ao criar previsao: ${error.message}`);
  return result as VetAutoPrevisao;
}

/**
 * Atualiza o realizado de uma previsao
 */
export async function updateRealizado(
  previsao_id: string,
  realizado_kg: number
): Promise<VetAutoPrevisao> {
  const { data, error } = await supabase
    .from('vet_auto_previsoes')
    .update({
      realizado_kg,
      updated_at: new Date().toISOString(),
    })
    .eq('id', previsao_id)
    .select()
    .single();

  if (error) throw new Error(`Erro ao atualizar realizado: ${error.message}`);
  return data as VetAutoPrevisao;
}

/**
 * Retorna resumo diario com totais por trato e por receita
 */
export async function getResumoDiario(
  fazenda_id: string,
  data?: string
): Promise<ResumoDiario> {
  const dataFiltro = data || getHoje();

  const { data: previsoes, error } = await supabase
    .from('vet_auto_previsoes')
    .select(`
      *,
      receita:vet_auto_receitas!receita_id(id, nome)
    `)
    .eq('fazenda_id', fazenda_id)
    .eq('data', dataFiltro);

  if (error) throw new Error(`Erro ao buscar resumo diario: ${error.message}`);

  const items = previsoes ?? [];

  // Totais gerais
  let totalPrevisto = 0;
  let totalRealizado = 0;

  // Agrupamento por trato
  const porTrato = new Map<string, ResumoDiarioTrato>();

  // Agrupamento por receita
  const porReceita = new Map<string, ResumoDiarioReceita>();

  for (const p of items) {
    const previsto = p.previsto_kg ?? 0;
    const realizado = p.realizado_kg ?? 0;
    totalPrevisto += previsto;
    totalRealizado += realizado;

    // Por trato
    const tratoKey = p.trato_id;
    const existingTrato = porTrato.get(tratoKey);
    if (existingTrato) {
      existingTrato.total_previsto_kg += previsto;
      existingTrato.total_realizado_kg += realizado;
      existingTrato.total_currais += 1;
    } else {
      porTrato.set(tratoKey, {
        trato_id: tratoKey,
        total_previsto_kg: previsto,
        total_realizado_kg: realizado,
        diferenca_kg: 0,
        diferenca_percentual: 0,
        total_currais: 1,
      });
    }

    // Por receita
    const receitaKey = p.receita_id;
    const receitaData = p.receita as unknown as { id: string; nome: string } | null;
    const existingReceita = porReceita.get(receitaKey);
    if (existingReceita) {
      existingReceita.total_previsto_kg += previsto;
      existingReceita.total_realizado_kg += realizado;
      existingReceita.total_currais += 1;
    } else {
      porReceita.set(receitaKey, {
        receita_id: receitaKey,
        receita_nome: receitaData?.nome ?? 'Sem nome',
        total_previsto_kg: previsto,
        total_realizado_kg: realizado,
        diferenca_kg: 0,
        diferenca_percentual: 0,
        total_currais: 1,
      });
    }
  }

  // Calcular diferencas
  const tratoArray = Array.from(porTrato.values()).map((t) => {
    const dif = t.total_realizado_kg - t.total_previsto_kg;
    return {
      ...t,
      diferenca_kg: dif,
      diferenca_percentual: t.total_previsto_kg > 0
        ? Math.round((dif / t.total_previsto_kg) * 10000) / 100
        : 0,
    };
  });

  const receitaArray = Array.from(porReceita.values()).map((r) => {
    const dif = r.total_realizado_kg - r.total_previsto_kg;
    return {
      ...r,
      diferenca_kg: dif,
      diferenca_percentual: r.total_previsto_kg > 0
        ? Math.round((dif / r.total_previsto_kg) * 10000) / 100
        : 0,
    };
  });

  return {
    data: dataFiltro,
    total_previsto_kg: totalPrevisto,
    total_realizado_kg: totalRealizado,
    eficiencia_percentual: totalPrevisto > 0
      ? Math.round((totalRealizado / totalPrevisto) * 10000) / 100
      : 0,
    por_trato: tratoArray,
    por_receita: receitaArray,
  };
}
