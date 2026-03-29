import { supabase } from '@/lib/supabase';
import { dataService } from '@/services/dataService';
import { generateId } from '@/services/offlineService';

// ============================================
// Types
// ============================================

export interface VetAutoOcorrenciaParada {
  id: string;
  fazenda_id: string;
  nome: string;
  carregamento_id: string | null;
  data_registro: string;
  created_at: string;
}

export interface VetAutoOcorrenciaParadaItem {
  id: string;
  ocorrencia_id: string;
  nome: string;
  observacao: string | null;
  operador: string | null;
  receita: string | null;
  peso_balanca: number | null;
  hora_registro: string;
  created_at: string;
}

export interface OcorrenciaParadaComItens extends VetAutoOcorrenciaParada {
  itens?: VetAutoOcorrenciaParadaItem[];
}

// ============================================
// OCORRENCIA DE PARADAS
// ============================================

/**
 * Registra uma nova ocorrencia de parada
 */
export async function registrarParada(
  fazenda_id: string,
  nome: string,
  carregamento_id?: string
): Promise<VetAutoOcorrenciaParada> {
  const record = {
    id: generateId(),
    fazenda_id,
    nome,
    carregamento_id: carregamento_id || null,
    data_registro: new Date().toISOString().split('T')[0],
  };

  const data = await dataService.save('vet_auto_ocorrencia_paradas', record);
  return data as unknown as VetAutoOcorrenciaParada;
}

/**
 * Adiciona um item a uma ocorrencia de parada
 */
export async function addItemParada(
  ocorrencia_id: string,
  nome: string,
  observacao: string | null,
  operador: string | null,
  receita: string | null,
  peso_balanca: number | null
): Promise<VetAutoOcorrenciaParadaItem> {
  const record = {
    id: generateId(),
    ocorrencia_id,
    nome,
    observacao,
    operador,
    receita,
    peso_balanca,
    hora_registro: new Date().toISOString(),
  };

  const data = await dataService.save('vet_auto_ocorrencia_paradas_itens', record);
  return data as unknown as VetAutoOcorrenciaParadaItem;
}

/**
 * Busca paradas do dia
 */
export async function getParadasDia(
  fazenda_id: string,
  data: string
): Promise<OcorrenciaParadaComItens[]> {
  const { data: paradas, error } = await supabase
    .from('vet_auto_ocorrencia_paradas')
    .select(`
      *,
      itens:vet_auto_ocorrencia_paradas_itens ( * )
    `)
    .eq('fazenda_id', fazenda_id)
    .eq('data_registro', data)
    .order('created_at', { ascending: false });

  if (error) throw new Error(`Erro ao buscar paradas: ${error.message}`);
  return (paradas ?? []) as OcorrenciaParadaComItens[];
}

/**
 * Busca paradas por carregamento
 */
export async function getParadasPorCarregamento(
  carregamento_id: string
): Promise<OcorrenciaParadaComItens[]> {
  const { data: paradas, error } = await supabase
    .from('vet_auto_ocorrencia_paradas')
    .select(`
      *,
      itens:vet_auto_ocorrencia_paradas_itens ( * )
    `)
    .eq('carregamento_id', carregamento_id)
    .order('created_at', { ascending: false });

  if (error) throw new Error(`Erro ao buscar paradas do carregamento: ${error.message}`);
  return (paradas ?? []) as OcorrenciaParadaComItens[];
}
