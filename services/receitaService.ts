import { supabase } from '@/lib/supabase';

// ============================================
// Types
// ============================================

export interface VetAutoReceita {
  id: string;
  fazenda_id: string;
  nome: string;
  codigo_alfa: string | null;
  materia_seca: number | null;
  imn_por_cabeca_dia: number | null;
  custo_tonelada_mn: number | null;
  tempo_mistura: number | null;
  tipo_receita: string | null;
  perc_tolerancia: number | null;
  status: 'ativo' | 'inativo';
  created_at: string;
  updated_at: string;
}

export interface VetAutoReceitaIngrediente {
  id: string;
  receita_id: string;
  ingrediente_id: string;
  percentual_mn: number;
  percentual_ms: number | null;
  tolerancia: number | null;
  ordem_batida: number;
  automatizado: boolean;
  created_at: string;
}

export interface VetAutoIngrediente {
  id: string;
  fazenda_id: string;
  nome: string;
  tipo: string | null;
  materia_seca: number | null;
  custo_kg: number | null;
  estoque_atual: number | null;
  codigo_alfa: string | null;
  estoque_minimo_kg: number | null;
  local_fisico: string | null;
  status: 'ativo' | 'inativo';
  created_at: string;
  updated_at: string;
}

export interface ReceitaComIngredientes extends VetAutoReceita {
  ingredientes: IngredienteReceitaExpandido[];
}

export interface IngredienteReceitaExpandido extends VetAutoReceitaIngrediente {
  ingrediente?: {
    id: string;
    nome: string;
    tipo: string | null;
    materia_seca: number | null;
    custo_kg: number | null;
  } | null;
}

export interface PesoIngredienteCalculado {
  ingrediente_id: string;
  ingrediente_nome: string;
  percentual_mn: number;
  peso_kg: number;
  tolerancia_kg: number;
  ordem_batida: number;
}

// ============================================
// RECEITAS
// ============================================

/**
 * Lista todas as receitas de uma fazenda
 */
export async function getReceitas(
  fazenda_id: string
): Promise<VetAutoReceita[]> {
  const { data, error } = await supabase
    .from('vet_auto_receitas')
    .select('*')
    .eq('fazenda_id', fazenda_id)
    .eq('status', 'ativo')
    .order('nome', { ascending: true });

  if (error) throw new Error(`Erro ao buscar receitas: ${error.message}`);
  return (data ?? []) as VetAutoReceita[];
}

/**
 * Busca uma receita com seus ingredientes expandidos
 */
export async function getReceitaComIngredientes(
  id: string
): Promise<ReceitaComIngredientes | null> {
  const { data, error } = await supabase
    .from('vet_auto_receitas')
    .select(`
      *,
      ingredientes:vet_auto_receita_ingredientes!receita_id(
        *,
        ingrediente:vet_auto_ingredientes!ingrediente_id(id, nome, tipo, materia_seca, custo_kg)
      )
    `)
    .eq('id', id)
    .maybeSingle();

  if (error) throw new Error(`Erro ao buscar receita com ingredientes: ${error.message}`);
  return data as ReceitaComIngredientes | null;
}

/**
 * Cria uma nova receita
 */
export async function createReceita(
  receitaData: Omit<VetAutoReceita, 'id' | 'created_at' | 'updated_at'>
): Promise<VetAutoReceita> {
  const { data, error } = await supabase
    .from('vet_auto_receitas')
    .insert({
      fazenda_id: receitaData.fazenda_id,
      nome: receitaData.nome,
      codigo_alfa: receitaData.codigo_alfa || null,
      materia_seca: receitaData.materia_seca ?? null,
      imn_por_cabeca_dia: receitaData.imn_por_cabeca_dia ?? null,
      custo_tonelada_mn: receitaData.custo_tonelada_mn ?? null,
      tempo_mistura: receitaData.tempo_mistura ?? null,
      tipo_receita: receitaData.tipo_receita || null,
      perc_tolerancia: receitaData.perc_tolerancia ?? null,
      status: receitaData.status ?? 'ativo',
    })
    .select()
    .single();

  if (error) throw new Error(`Erro ao criar receita: ${error.message}`);
  return data as VetAutoReceita;
}

/**
 * Atualiza uma receita existente
 */
export async function updateReceita(
  id: string,
  updates: Partial<VetAutoReceita>
): Promise<VetAutoReceita> {
  const { data, error } = await supabase
    .from('vet_auto_receitas')
    .update({
      ...updates,
      updated_at: new Date().toISOString(),
    })
    .eq('id', id)
    .select()
    .single();

  if (error) throw new Error(`Erro ao atualizar receita: ${error.message}`);
  return data as VetAutoReceita;
}

/**
 * Adiciona um ingrediente a uma receita
 */
export async function addIngredienteReceita(
  receita_id: string,
  ingrediente_id: string,
  percentual_mn: number,
  percentual_ms: number | null,
  tolerancia: number | null,
  ordem_batida: number
): Promise<VetAutoReceitaIngrediente> {
  const { data, error } = await supabase
    .from('vet_auto_receita_ingredientes')
    .insert({
      receita_id,
      ingrediente_id,
      percentual_mn,
      percentual_ms: percentual_ms ?? null,
      tolerancia: tolerancia ?? null,
      ordem_batida,
      automatizado: false,
    })
    .select()
    .single();

  if (error) throw new Error(`Erro ao adicionar ingrediente a receita: ${error.message}`);
  return data as VetAutoReceitaIngrediente;
}

/**
 * Calcula o peso de cada ingrediente para um total_kg desejado
 * Retorna array de ingredientes com peso_kg e tolerancia_kg calculados
 */
export async function calcularPesoIngredientes(
  receita_id: string,
  total_kg: number
): Promise<PesoIngredienteCalculado[]> {
  const receita = await getReceitaComIngredientes(receita_id);
  if (!receita) throw new Error('Receita nao encontrada');

  const toleranciaGlobal = receita.perc_tolerancia ?? 0;

  return receita.ingredientes
    .sort((a, b) => a.ordem_batida - b.ordem_batida)
    .map((ing) => {
      const percentual = ing.percentual_mn ?? 0;
      const peso_kg = (percentual / 100) * total_kg;
      const toleranciaPerc = ing.tolerancia ?? toleranciaGlobal;
      const tolerancia_kg = (toleranciaPerc / 100) * peso_kg;

      return {
        ingrediente_id: ing.ingrediente_id,
        ingrediente_nome: ing.ingrediente?.nome ?? 'Sem nome',
        percentual_mn: percentual,
        peso_kg: Math.round(peso_kg * 100) / 100,
        tolerancia_kg: Math.round(tolerancia_kg * 100) / 100,
        ordem_batida: ing.ordem_batida,
      };
    });
}
