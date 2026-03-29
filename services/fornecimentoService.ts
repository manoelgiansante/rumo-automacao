import { supabase } from '@/lib/supabase';

// ============================================
// Types
// ============================================

export type StatusCarregamento = 'em_andamento' | 'concluido' | 'cancelado';

export interface VetAutoCarregamento {
  id: string;
  fazenda_id: string;
  trato_id: string | null;
  misturador_id: string;
  data_registro: string;
  status: StatusCarregamento;
  total_carregado_kg: number | null;
  peso_balancao: number | null;
  peso_balancao_retorno: number | null;
  hora_saida: string | null;
  hora_retorno: string | null;
  created_at: string;
  updated_at: string;
}

export interface VetAutoDetalheCarregamento {
  id: string;
  carregamento_id: string;
  peso_inicial: number;
  peso_final: number;
  lote_fabricacao: string | null;
  receita_id: string | null;
  hora_inicial: string | null;
  hora_final: string | null;
  created_at: string;
}

export interface VetAutoFornecimento {
  id: string;
  carregamento_id: string;
  curral_rfid_id: string | null;
  tag_inicial: string | null;
  tag_final: string | null;
  peso_inicial: number;
  peso_final: number;
  fornecido_kg: number;
  receita_id: string | null;
  trato_numero: number | null;
  hora_inicio: string | null;
  hora_final: string | null;
  flag_rateio: boolean;
  entrada_manual: boolean;
  created_at: string;
}

export interface VetAutoDescarte {
  id: string;
  tipo: 'fabricacao' | 'fornecimento';
  referencia_id: string;
  misturador_id: string | null;
  motivo: string | null;
  quantidade_kg: number;
  created_at: string;
}

export interface CarregamentoComDetalhes extends VetAutoCarregamento {
  misturador?: { id: string; nome: string; numero: number } | null;
  detalhes?: VetAutoDetalheCarregamento[];
  fornecimentos?: FornecimentoComDetalhes[];
}

export interface FornecimentoComDetalhes extends VetAutoFornecimento {
  curral_rfid?: {
    id: string;
    tag_inicial: string;
    tag_final: string;
    curral?: { id: string; codigo: string; nome: string | null } | null;
  } | null;
  receita?: { id: string; nome: string } | null;
}

export interface PrevistoVsRealizado {
  curral_id: string;
  curral_codigo: string;
  curral_nome: string | null;
  trato_numero: number;
  receita_nome: string | null;
  previsto_kg: number;
  realizado_kg: number;
  diferenca_kg: number;
  diferenca_percentual: number;
}

export interface CurralIdentificado {
  id: string;
  curral_id: string;
  curral_codigo: string;
  curral_nome: string | null;
  tag_inicial: string;
  tag_final: string;
  linha: number | null;
}

// ============================================
// Helpers
// ============================================

function getHoje(): string {
  return new Date().toISOString().split('T')[0];
}

// ============================================
// CARREGAMENTOS
// ============================================

/**
 * Cria um novo carregamento (saida do misturador para fornecimento)
 */
export async function createCarregamento(
  fazenda_id: string,
  trato_id: string | null,
  misturador_id: string,
  peso_balancao: number | null
): Promise<VetAutoCarregamento> {
  const { data, error } = await supabase
    .from('vet_auto_carregamentos')
    .insert({
      fazenda_id,
      trato_id: trato_id || null,
      misturador_id,
      data_registro: getHoje(),
      status: 'em_andamento' as StatusCarregamento,
      peso_balancao: peso_balancao ?? null,
      hora_saida: new Date().toISOString(),
    })
    .select()
    .single();

  if (error) throw new Error(`Erro ao criar carregamento: ${error.message}`);
  return data as VetAutoCarregamento;
}

/**
 * Adiciona detalhe de carregamento (receitas/lotes carregados)
 */
export async function addDetalheCarregamento(
  carregamento_id: string,
  peso_inicial: number,
  peso_final: number,
  lote_fabricacao: string | null,
  receita_id: string | null
): Promise<VetAutoDetalheCarregamento> {
  const { data, error } = await supabase
    .from('vet_auto_carregamento_detalhes')
    .insert({
      carregamento_id,
      peso_inicial,
      peso_final,
      lote_fabricacao: lote_fabricacao || null,
      receita_id: receita_id || null,
      hora_inicial: new Date().toISOString(),
      hora_final: new Date().toISOString(),
    })
    .select()
    .single();

  if (error) throw new Error(`Erro ao adicionar detalhe do carregamento: ${error.message}`);
  return data as VetAutoDetalheCarregamento;
}

/**
 * Registra fornecimento em um curral (CORE)
 * Auto-calcula fornecido_kg = peso_inicial - peso_final
 * When flag_rateio is true, uses peso_rateado_kg instead of the raw calculation
 */
export async function registrarFornecimento(
  carregamento_id: string,
  curral_rfid_id: string | null,
  tag_inicial: string | null,
  tag_final: string | null,
  peso_inicial: number,
  peso_final: number,
  receita_id: string | null,
  trato_numero: number | null,
  options?: {
    flag_rateio?: boolean;
    peso_rateado_kg?: number;
    entrada_manual?: boolean;
  }
): Promise<VetAutoFornecimento> {
  const flag_rateio = options?.flag_rateio ?? false;
  const fornecido_kg = flag_rateio && options?.peso_rateado_kg != null
    ? options.peso_rateado_kg
    : peso_inicial - peso_final;

  const { data, error } = await supabase
    .from('vet_auto_fornecimentos')
    .insert({
      carregamento_id,
      curral_rfid_id: curral_rfid_id || null,
      tag_inicial: tag_inicial || null,
      tag_final: tag_final || null,
      peso_inicial,
      peso_final,
      fornecido_kg,
      receita_id: receita_id || null,
      trato_numero: trato_numero ?? null,
      hora_inicio: new Date().toISOString(),
      hora_final: new Date().toISOString(),
      flag_rateio,
      entrada_manual: options?.entrada_manual ?? false,
    })
    .select()
    .single();

  if (error) throw new Error(`Erro ao registrar fornecimento: ${error.message}`);
  return data as VetAutoFornecimento;
}

/**
 * Finaliza um carregamento com o peso de retorno
 */
export async function finalizarCarregamento(
  id: string,
  peso_balancao_retorno: number | null
): Promise<VetAutoCarregamento> {
  // Calcula total carregado somando os fornecimentos
  const { data: fornecimentos, error: fetchError } = await supabase
    .from('vet_auto_fornecimentos')
    .select('fornecido_kg')
    .eq('carregamento_id', id);

  if (fetchError) throw new Error(`Erro ao buscar fornecimentos: ${fetchError.message}`);

  const total_carregado_kg = (fornecimentos ?? []).reduce(
    (sum, f) => sum + (f.fornecido_kg ?? 0),
    0
  );

  const { data, error } = await supabase
    .from('vet_auto_carregamentos')
    .update({
      status: 'concluido' as StatusCarregamento,
      total_carregado_kg,
      peso_balancao_retorno: peso_balancao_retorno ?? null,
      hora_retorno: new Date().toISOString(),
      updated_at: new Date().toISOString(),
    })
    .eq('id', id)
    .select()
    .single();

  if (error) throw new Error(`Erro ao finalizar carregamento: ${error.message}`);
  return data as VetAutoCarregamento;
}

/**
 * Busca todos os fornecimentos do dia
 */
export async function getFornecimentosDia(
  fazenda_id: string,
  data?: string
): Promise<FornecimentoComDetalhes[]> {
  const dataFiltro = data || getHoje();

  const { data: carregamentos, error: cError } = await supabase
    .from('vet_auto_carregamentos')
    .select('id')
    .eq('fazenda_id', fazenda_id)
    .eq('data_registro', dataFiltro);

  if (cError) throw new Error(`Erro ao buscar carregamentos: ${cError.message}`);

  const ids = (carregamentos ?? []).map((c) => c.id);
  if (ids.length === 0) return [];

  const { data: result, error } = await supabase
    .from('vet_auto_fornecimentos')
    .select(`
      *,
      curral_rfid:vet_auto_currais_rfid!curral_rfid_id(
        id, tag_inicial, tag_final,
        curral:vet_auto_currais!curral_id(id, codigo, nome)
      ),
      receita:vet_auto_receitas!receita_id(id, nome)
    `)
    .in('carregamento_id', ids)
    .order('created_at', { ascending: true });

  if (error) throw new Error(`Erro ao buscar fornecimentos do dia: ${error.message}`);
  return (result ?? []) as FornecimentoComDetalhes[];
}

/**
 * Calcula previsto vs realizado para uma fazenda/data
 */
export async function getPrevistoVsRealizado(
  fazenda_id: string,
  data?: string
): Promise<PrevistoVsRealizado[]> {
  const dataFiltro = data || getHoje();

  // Buscar previsoes do dia
  const { data: previsoes, error: prevError } = await supabase
    .from('vet_auto_previsoes')
    .select(`
      id,
      curral_rfid_id,
      trato_id,
      receita_id,
      previsto_kg,
      realizado_kg,
      curral_rfid:vet_auto_currais_rfid!curral_rfid_id(
        id,
        curral:vet_auto_currais!curral_id(id, codigo, nome)
      ),
      receita:vet_auto_receitas!receita_id(id, nome)
    `)
    .eq('fazenda_id', fazenda_id)
    .eq('data', dataFiltro);

  if (prevError) throw new Error(`Erro ao buscar previsoes: ${prevError.message}`);

  return (previsoes ?? []).map((p) => {
    const curralData = p.curral_rfid as unknown as {
      curral?: { id: string; codigo: string; nome: string | null };
    };
    const receitaData = p.receita as unknown as { nome: string } | null;
    const previsto = p.previsto_kg ?? 0;
    const realizado = p.realizado_kg ?? 0;
    const diferenca = realizado - previsto;

    return {
      curral_id: curralData?.curral?.id ?? '',
      curral_codigo: curralData?.curral?.codigo ?? '',
      curral_nome: curralData?.curral?.nome ?? null,
      trato_numero: p.trato_id ?? 0,
      receita_nome: receitaData?.nome ?? null,
      previsto_kg: previsto,
      realizado_kg: realizado,
      diferenca_kg: diferenca,
      diferenca_percentual: previsto > 0 ? (diferenca / previsto) * 100 : 0,
    };
  });
}

/**
 * Registra um descarte (fabricacao ou fornecimento)
 */
export async function registrarDescarte(
  tipo: 'fabricacao' | 'fornecimento',
  referencia_id: string,
  misturador_id: string | null,
  motivo: string | null,
  quantidade_kg: number
): Promise<VetAutoDescarte> {
  const { data, error } = await supabase
    .from('vet_auto_descartes')
    .insert({
      tipo,
      referencia_id,
      misturador_id: misturador_id || null,
      motivo: motivo || null,
      quantidade_kg,
    })
    .select()
    .single();

  if (error) throw new Error(`Erro ao registrar descarte: ${error.message}`);
  return data as VetAutoDescarte;
}

/**
 * Busca o carregamento ativo (em andamento) de um misturador
 */
export async function getCarregamentoAtivo(
  misturador_id: string
): Promise<CarregamentoComDetalhes | null> {
  const { data, error } = await supabase
    .from('vet_auto_carregamentos')
    .select(`
      *,
      misturador:vet_auto_misturadores!misturador_id(id, nome, numero),
      detalhes:vet_auto_carregamento_detalhes!carregamento_id(*),
      fornecimentos:vet_auto_fornecimentos!carregamento_id(
        *,
        curral_rfid:vet_auto_currais_rfid!curral_rfid_id(
          id, tag_inicial, tag_final,
          curral:vet_auto_currais!curral_id(id, codigo, nome)
        ),
        receita:vet_auto_receitas!receita_id(id, nome)
      )
    `)
    .eq('misturador_id', misturador_id)
    .eq('status', 'em_andamento')
    .order('created_at', { ascending: false })
    .maybeSingle();

  if (error) throw new Error(`Erro ao buscar carregamento ativo: ${error.message}`);
  return data as CarregamentoComDetalhes | null;
}

/**
 * Identifica curral por tag RFID lida
 * Compara a tag com os ranges tag_inicial/tag_final dos currais
 */
export async function identificarCurralPorTag(
  fazenda_id: string,
  tag: string
): Promise<CurralIdentificado | null> {
  const { data: currais, error } = await supabase
    .from('vet_auto_currais_rfid')
    .select(`
      id,
      tag_inicial,
      tag_final,
      linha,
      curral:vet_auto_currais!curral_id(id, codigo, nome)
    `)
    .eq('fazenda_id', fazenda_id)
    .eq('ativo', true);

  if (error) throw new Error(`Erro ao buscar currais RFID: ${error.message}`);

  // Buscar curral cuja tag esteja dentro do range tag_inicial <= tag <= tag_final
  const tagNormalizada = tag.trim().toUpperCase();

  for (const c of currais ?? []) {
    const tagIni = (c.tag_inicial ?? '').trim().toUpperCase();
    const tagFin = (c.tag_final ?? '').trim().toUpperCase();

    // Correspondencia exata com tag_inicial ou tag_final
    if (tagNormalizada === tagIni || tagNormalizada === tagFin) {
      const curral = c.curral as unknown as { id: string; codigo: string; nome: string | null };
      return {
        id: c.id,
        curral_id: curral?.id ?? '',
        curral_codigo: curral?.codigo ?? '',
        curral_nome: curral?.nome ?? null,
        tag_inicial: c.tag_inicial,
        tag_final: c.tag_final,
        linha: c.linha ?? null,
      };
    }

    // Comparacao lexicografica para range
    if (tagIni && tagFin && tagNormalizada >= tagIni && tagNormalizada <= tagFin) {
      const curral = c.curral as unknown as { id: string; codigo: string; nome: string | null };
      return {
        id: c.id,
        curral_id: curral?.id ?? '',
        curral_codigo: curral?.codigo ?? '',
        curral_nome: curral?.nome ?? null,
        tag_inicial: c.tag_inicial,
        tag_final: c.tag_final,
        linha: c.linha ?? null,
      };
    }
  }

  return null;
}
