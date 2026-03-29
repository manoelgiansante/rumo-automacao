import { supabase } from '@/lib/supabase';
import { dataService } from '@/services/dataService';
import { generateId } from '@/services/offlineService';

// ============================================
// Types
// ============================================

export type StatusFabricacao = 'espera' | 'processando' | 'processado' | 'cancelado';

export type FlagManual = 'troca_automatica' | 'manual' | 'deslocamento' | 'pausa' | 'cancelamento';

export interface VetAutoFabricacao {
  id: string;
  fazenda_id: string;
  receita_id: string;
  misturador_id: string;
  usuario_id: string;
  operador_pa_id: string | null;
  lote_fabricacao: string;
  numero_trato: number;
  total_cabeca: number;
  total_kg_mn_previsto: number | null;
  total_kg_mn_fabricada: number | null;
  total_perda_kg: number | null;
  total_sobra_carregado_kg: number | null;
  status: StatusFabricacao;
  hora_inicio: string | null;
  hora_fim: string | null;
  data_registro: string;
  flag_automation: boolean;
  created_at: string;
  updated_at: string;
}

export interface VetAutoFabricacaoIngrediente {
  id: string;
  fabricacao_id: string;
  ingrediente_id: string;
  peso_inicial: number;
  peso_final: number;
  total_kg_fabricada: number | null;
  total_kg_previsto: number | null;
  tolerancia: number | null;
  diferenca_percentual: number | null;
  diferenca_kg: number | null;
  ordem: number;
  flag_manual: FlagManual | null;
  hora_inicio: string | null;
  hora_fim: string | null;
  created_at: string;
}

export interface FabricacaoComDetalhes extends VetAutoFabricacao {
  receita?: { id: string; nome: string } | null;
  misturador?: { id: string; nome: string; numero: number } | null;
  ingredientes?: VetAutoFabricacaoIngrediente[];
}

export interface ResumoFabricacaoDia {
  receita_id: string;
  receita_nome: string;
  trato: number;
  total_fabricado_kg: number;
  total_batidas: number;
}

// ============================================
// Helpers
// ============================================

function getHoje(): string {
  return new Date().toISOString().split('T')[0];
}

function gerarLoteFabricacao(): string {
  const now = new Date();
  const ts = now.toISOString().replace(/[-:T]/g, '').slice(0, 14);
  const rand = Math.floor(Math.random() * 1000).toString().padStart(3, '0');
  return `FAB-${ts}-${rand}`;
}

// ============================================
// FABRICACAO (Manufacturing/Batch)
// ============================================

/**
 * Cria uma nova fabricacao (lote de producao)
 */
export async function createFabricacao(
  receita_id: string,
  misturador_id: string,
  usuario_id: string,
  operador_pa_id: string | null,
  numero_trato: number,
  total_cabeca: number,
  fazenda_id?: string
): Promise<VetAutoFabricacao> {
  const record = {
    id: generateId(),
    fazenda_id: fazenda_id ?? null,
    receita_id,
    misturador_id,
    usuario_id,
    operador_pa_id: operador_pa_id || null,
    lote_fabricacao: gerarLoteFabricacao(),
    numero_trato,
    total_cabeca,
    status: 'espera' as StatusFabricacao,
    data_registro: getHoje(),
    hora_inicio: new Date().toISOString(),
    flag_automation: false,
  };

  const data = await dataService.save('vet_auto_fabricacoes', record);
  return data as unknown as VetAutoFabricacao;
}

/**
 * Atualiza o status de uma fabricacao
 */
export async function updateFabricacaoStatus(
  id: string,
  status: StatusFabricacao
): Promise<VetAutoFabricacao> {
  const updates: Record<string, unknown> = {
    status,
  };

  if (status === 'processando') {
    updates.hora_inicio = new Date().toISOString();
  }

  await dataService.update('vet_auto_fabricacoes', id, updates);
  const updated = await dataService.getById('vet_auto_fabricacoes', id);
  return updated as unknown as VetAutoFabricacao;
}

/**
 * Adiciona um ingrediente fabricado ao lote
 */
export async function addIngredienteFabricado(
  fabricacao_id: string,
  ingrediente_id: string,
  peso_inicial: number,
  peso_final: number,
  tolerancia: number | null,
  ordem: number,
  flag_manual: FlagManual | null
): Promise<VetAutoFabricacaoIngrediente> {
  const total_kg_fabricada = Math.abs(peso_final - peso_inicial);
  const diferenca_kg = tolerancia != null
    ? total_kg_fabricada - (tolerancia > 0 ? tolerancia : 0)
    : null;

  const record = {
    id: generateId(),
    fabricacao_id,
    ingrediente_id,
    peso_inicial,
    peso_final,
    total_kg_fabricada,
    tolerancia,
    diferenca_kg,
    ordem,
    flag_manual: flag_manual || null,
    hora_inicio: new Date().toISOString(),
    hora_fim: new Date().toISOString(),
  };

  const data = await dataService.save('vet_auto_fabricacao_ingredientes', record);
  return data as unknown as VetAutoFabricacaoIngrediente;
}

/**
 * Finaliza uma fabricacao com o total produzido
 */
export async function finalizarFabricacao(
  id: string,
  total_kg_fabricada: number,
  hora_fim: string
): Promise<VetAutoFabricacao> {
  await dataService.update('vet_auto_fabricacoes', id, {
    status: 'processado' as StatusFabricacao,
    total_kg_mn_fabricada: total_kg_fabricada,
    hora_fim,
  });
  const data = await dataService.getById('vet_auto_fabricacoes', id);
  return data as unknown as VetAutoFabricacao;
}

/**
 * Busca todas as fabricacoes de um dia para uma fazenda
 */
export async function getFabricacoesDia(
  fazenda_id: string,
  data?: string
): Promise<FabricacaoComDetalhes[]> {
  const dataFiltro = data || getHoje();

  const { data: result, error } = await supabase
    .from('vet_auto_fabricacoes')
    .select(`
      *,
      receita:vet_auto_receitas!receita_id(id, nome),
      misturador:vet_auto_misturadores!misturador_id(id, nome, numero),
      ingredientes:vet_auto_fabricacao_ingredientes!fabricacao_id(*)
    `)
    .eq('fazenda_id', fazenda_id)
    .eq('data_registro', dataFiltro)
    .order('numero_trato', { ascending: true })
    .order('created_at', { ascending: true });

  if (error) throw new Error(`Erro ao buscar fabricacoes do dia: ${error.message}`);
  return (result ?? []) as FabricacaoComDetalhes[];
}

/**
 * Busca a fabricacao ativa (em processamento) de um misturador
 */
export async function getFabricacaoAtiva(
  misturador_id: string
): Promise<FabricacaoComDetalhes | null> {
  const { data, error } = await supabase
    .from('vet_auto_fabricacoes')
    .select(`
      *,
      receita:vet_auto_receitas!receita_id(id, nome),
      misturador:vet_auto_misturadores!misturador_id(id, nome, numero),
      ingredientes:vet_auto_fabricacao_ingredientes!fabricacao_id(*)
    `)
    .eq('misturador_id', misturador_id)
    .in('status', ['espera', 'processando'])
    .order('created_at', { ascending: false })
    .maybeSingle();

  if (error) throw new Error(`Erro ao buscar fabricacao ativa: ${error.message}`);
  return data as FabricacaoComDetalhes | null;
}

/**
 * Retorna o resumo de fabricacao do dia agrupado por receita e trato
 */
export async function getResumoFabricacaoDia(
  fazenda_id: string,
  data?: string
): Promise<ResumoFabricacaoDia[]> {
  const dataFiltro = data || getHoje();

  const { data: fabricacoes, error } = await supabase
    .from('vet_auto_fabricacoes')
    .select(`
      receita_id,
      numero_trato,
      total_kg_mn_fabricada,
      receita:vet_auto_receitas!receita_id(id, nome)
    `)
    .eq('fazenda_id', fazenda_id)
    .eq('data_registro', dataFiltro)
    .eq('status', 'processado');

  if (error) throw new Error(`Erro ao buscar resumo de fabricacao: ${error.message}`);

  const agrupado = new Map<string, ResumoFabricacaoDia>();

  for (const fab of fabricacoes ?? []) {
    const key = `${fab.receita_id}-${fab.numero_trato}`;
    const existing = agrupado.get(key);
    const receitaNome = (fab.receita as unknown as { nome: string })?.nome ?? 'Sem nome';

    if (existing) {
      existing.total_fabricado_kg += fab.total_kg_mn_fabricada ?? 0;
      existing.total_batidas += 1;
    } else {
      agrupado.set(key, {
        receita_id: fab.receita_id,
        receita_nome: receitaNome,
        trato: fab.numero_trato,
        total_fabricado_kg: fab.total_kg_mn_fabricada ?? 0,
        total_batidas: 1,
      });
    }
  }

  return Array.from(agrupado.values());
}

/**
 * Cancela uma fabricacao
 */
export async function cancelarFabricacao(
  id: string
): Promise<VetAutoFabricacao> {
  await dataService.update('vet_auto_fabricacoes', id, {
    status: 'cancelado' as StatusFabricacao,
  });
  const data = await dataService.getById('vet_auto_fabricacoes', id);
  return data as unknown as VetAutoFabricacao;
}

// ============================================
// SOBRA (Leftover management)
// ============================================

/**
 * Registra a quantidade de sobra de uma fabricacao
 */
export async function registrarSobra(
  fabricacao_id: string,
  sobra_kg: number
): Promise<void> {
  await dataService.update('vet_auto_fabricacoes', fabricacao_id, {
    total_sobra_carregado_kg: sobra_kg,
  });
}

/**
 * Busca fabricacoes com sobra disponivel (status processado e sobra > 0)
 */
export async function getFabricacoesComSobra(
  fazenda_id: string
): Promise<FabricacaoComDetalhes[]> {
  const { data, error } = await supabase
    .from('vet_auto_fabricacoes')
    .select('*, receita:vet_auto_receitas!receita_id(id, nome)')
    .eq('fazenda_id', fazenda_id)
    .eq('status', 'processado')
    .gt('total_sobra_carregado_kg', 0)
    .order('created_at', { ascending: false });
  if (error) throw new Error(`Erro ao buscar fabricacoes com sobra: ${error.message}`);
  return (data ?? []) as FabricacaoComDetalhes[];
}

/**
 * Vincula uma sobra de fabricacao anterior a uma nova fabricacao
 */
export async function vincularSobra(
  nova_fabricacao_id: string,
  sobra_fabricacao_id: string,
  sobra_lote: string
): Promise<void> {
  await dataService.update('vet_auto_fabricacoes', nova_fabricacao_id, {
    lote_fabricacao_sobra: sobra_lote,
  });
}

/**
 * Zera a sobra de uma fabricacao apos redistribuicao
 */
export async function zerarSobra(
  fabricacao_id: string
): Promise<void> {
  await dataService.update('vet_auto_fabricacoes', fabricacao_id, {
    total_sobra_carregado_kg: 0,
  });
}
