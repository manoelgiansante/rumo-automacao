import { supabase } from '@/lib/supabase';

// ============================================
// Types
// ============================================

export type TipoSafePoint = 'entrada' | 'saida' | 'intermediario';

export type InputType = 'automatico' | 'manual';

export interface VetAutoSafePoint {
  id: string;
  fazenda_id: string;
  nome: string;
  tag: string;
  tipo: TipoSafePoint;
  ativo: boolean;
  created_at: string;
  updated_at: string;
}

export interface VetAutoSafePointLeitura {
  id: string;
  safe_point_id: string;
  carregamento_id: string;
  peso_kg: number;
  input_type: InputType;
  tara_kg: number | null;
  peso_bruto_kg: number | null;
  data_registro: string;
  created_at: string;
}

export interface SafePointComLeituras extends VetAutoSafePoint {
  leituras?: VetAutoSafePointLeitura[];
}

export interface RateioSafePoint {
  safe_point_id: string;
  safe_point_nome: string;
  peso_kg: number;
  percentual: number;
  peso_rateado_kg: number;
}

// ============================================
// SAFE POINTS
// ============================================

/**
 * Lista todos os safe points de uma fazenda
 */
export async function getSafePoints(
  fazenda_id: string
): Promise<VetAutoSafePoint[]> {
  const { data, error } = await supabase
    .from('vet_auto_safe_points')
    .select('*')
    .eq('fazenda_id', fazenda_id)
    .eq('ativo', true)
    .order('nome', { ascending: true });

  if (error) throw new Error(`Erro ao buscar safe points: ${error.message}`);
  return (data ?? []) as VetAutoSafePoint[];
}

/**
 * Cria um novo safe point
 */
export async function createSafePoint(
  fazenda_id: string,
  nome: string,
  tag: string,
  tipo: TipoSafePoint
): Promise<VetAutoSafePoint> {
  const { data, error } = await supabase
    .from('vet_auto_safe_points')
    .insert({
      fazenda_id,
      nome,
      tag,
      tipo,
      ativo: true,
    })
    .select()
    .single();

  if (error) throw new Error(`Erro ao criar safe point: ${error.message}`);
  return data as VetAutoSafePoint;
}

/**
 * Registra uma leitura em um safe point
 */
export async function registrarLeitura(
  safe_point_id: string,
  carregamento_id: string,
  peso_kg: number,
  input_type: InputType,
  tara_kg: number | null,
  peso_bruto_kg: number | null
): Promise<VetAutoSafePointLeitura> {
  const { data, error } = await supabase
    .from('vet_auto_safe_point_leituras')
    .insert({
      safe_point_id,
      carregamento_id,
      peso_kg,
      input_type,
      tara_kg: tara_kg ?? null,
      peso_bruto_kg: peso_bruto_kg ?? null,
      data_registro: new Date().toISOString(),
    })
    .select()
    .single();

  if (error) throw new Error(`Erro ao registrar leitura no safe point: ${error.message}`);
  return data as VetAutoSafePointLeitura;
}

/**
 * Calcula o rateio proporcional de peso entre safe points de um carregamento
 * Distribui o peso proporcionalmente com base nas leituras registradas
 */
export async function calcularRateio(
  carregamento_id: string
): Promise<RateioSafePoint[]> {
  // Get total weight from carregamento
  const { data: carregamento, error: carregamentoError } = await supabase
    .from('vet_auto_carregamentos')
    .select('total_carregado')
    .eq('id', carregamento_id)
    .single();

  if (carregamentoError) throw new Error(`Erro ao buscar carregamento: ${carregamentoError.message}`);

  const totalCarregado = carregamento?.total_carregado ?? 0;

  const { data: leituras, error } = await supabase
    .from('vet_auto_safe_point_leituras')
    .select(`
      *,
      safe_point:vet_auto_safe_points!safe_point_id(id, nome, tipo)
    `)
    .eq('carregamento_id', carregamento_id)
    .order('created_at', { ascending: true });

  if (error) throw new Error(`Erro ao buscar leituras para rateio: ${error.message}`);
  if (!leituras || leituras.length === 0) return [];

  // Agrupar leituras por safe point (pegar a ultima leitura de cada)
  const leiturasPorSP = new Map<
    string,
    { peso_kg: number; nome: string }
  >();

  for (const l of leituras) {
    const sp = l.safe_point as unknown as { id: string; nome: string };
    leiturasPorSP.set(l.safe_point_id, {
      peso_kg: l.peso_kg,
      nome: sp?.nome ?? 'Sem nome',
    });
  }

  // Calcular total dos pesos nos safe points para distribuicao proporcional
  const totalPesoSafePoints = Array.from(leiturasPorSP.values()).reduce(
    (sum, sp) => sum + sp.peso_kg,
    0
  );

  if (totalPesoSafePoints === 0) return [];

  return Array.from(leiturasPorSP.entries()).map(([spId, spData]) => {
    const percentual = (spData.peso_kg / totalPesoSafePoints) * 100;
    return {
      safe_point_id: spId,
      safe_point_nome: spData.nome,
      peso_kg: spData.peso_kg,
      percentual: Math.round(percentual * 100) / 100,
      peso_rateado_kg: Math.round((totalCarregado * (spData.peso_kg / totalPesoSafePoints)) * 100) / 100,
    };
  });
}

/**
 * Busca todas as leituras de safe points de um carregamento
 */
export async function getSafePointLeituras(
  carregamento_id: string
): Promise<(VetAutoSafePointLeitura & { safe_point?: VetAutoSafePoint })[]> {
  const { data, error } = await supabase
    .from('vet_auto_safe_point_leituras')
    .select(`
      *,
      safe_point:vet_auto_safe_points!safe_point_id(*)
    `)
    .eq('carregamento_id', carregamento_id)
    .order('created_at', { ascending: true });

  if (error) throw new Error(`Erro ao buscar leituras do safe point: ${error.message}`);
  return (data ?? []) as (VetAutoSafePointLeitura & { safe_point?: VetAutoSafePoint })[];
}
