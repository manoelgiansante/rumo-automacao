import { supabase } from '@/lib/supabase';
import { connectivityService } from './connectivityService';
import * as offlineService from './offlineService';

// ============================================
// API Veterinaria Service
// Cross-module data sharing between Automacao and Veterinaria
// Both apps share the same Supabase project, so data is already
// in the same database. This service provides explicit mapping
// and sync between vet_auto_ tables and vet_ / vet_conf_ tables.
// ============================================

// ============================================
// Types
// ============================================

interface FornecimentoResumo {
  curral_id: string;
  curral_codigo: string;
  receita_nome: string;
  trato_numero: number;
  total_fornecido_kg: number;
  data_registro: string;
}

interface AnimalLoteInfo {
  lote_id: string;
  lote_nome: string;
  curral_id: string;
  curral_codigo: string;
  quantidade_animais: number;
  peso_medio_kg: number | null;
}

interface PlanoNutricional {
  id: string;
  curral_id: string;
  receita_id: string;
  receita_nome: string;
  kg_por_cabeca_dia: number;
  data_inicio: string;
  data_fim: string | null;
}

// ============================================
// ENVIAR PARA VETERINARIA
// Push automacao data to veterinaria tables
// ============================================

/**
 * Sync fornecimento totals from automacao to veterinaria trato tables.
 * Maps vet_auto_fornecimentos -> vet_tratos (or similar veterinaria format).
 * Call after successful sync or at end of day.
 */
export async function enviarParaVeterinaria(fazenda_id: string): Promise<{
  sucesso: boolean;
  registros_enviados: number;
  mensagem: string;
}> {
  const result = {
    sucesso: false,
    registros_enviados: 0,
    mensagem: '',
  };

  if (!connectivityService.getStatus()) {
    result.mensagem = 'Sem conexao. Os dados serao enviados quando houver internet.';
    return result;
  }

  try {
    // 1. Get today's completed fornecimentos from automacao
    const hoje = new Date().toISOString().split('T')[0];

    const { data: carregamentos, error: cError } = await supabase
      .from('vet_auto_carregamentos')
      .select('id')
      .eq('fazenda_id', fazenda_id)
      .eq('data_registro', hoje)
      .eq('status', 'concluido');

    if (cError) throw new Error(cError.message);

    const carregamentoIds = (carregamentos ?? []).map((c) => c.id);

    if (carregamentoIds.length === 0) {
      result.sucesso = true;
      result.mensagem = 'Nenhum carregamento concluido hoje para enviar';
      return result;
    }

    // 2. Get fornecimentos with curral info
    const { data: fornecimentos, error: fError } = await supabase
      .from('vet_auto_fornecimentos')
      .select(`
        *,
        curral_rfid:vet_auto_currais_rfid!curral_rfid_id(
          id,
          curral:vet_auto_currais!curral_id(id, codigo)
        ),
        receita:vet_auto_receitas!receita_id(id, nome)
      `)
      .in('carregamento_id', carregamentoIds);

    if (fError) throw new Error(fError.message);

    if (!fornecimentos || fornecimentos.length === 0) {
      result.sucesso = true;
      result.mensagem = 'Nenhum fornecimento para enviar';
      return result;
    }

    // 3. Aggregate fornecimentos by curral+trato
    const resumos = new Map<string, FornecimentoResumo>();

    for (const f of fornecimentos) {
      const curralRfid = f.curral_rfid as unknown as {
        curral?: { id: string; codigo: string };
      } | null;
      const receita = f.receita as unknown as { id: string; nome: string } | null;
      const curralId = curralRfid?.curral?.id ?? '';
      const curralCodigo = curralRfid?.curral?.codigo ?? '';
      const tratoNum = f.trato_numero ?? 1;
      const key = `${curralId}-${tratoNum}`;

      const existing = resumos.get(key);
      if (existing) {
        existing.total_fornecido_kg += f.fornecido_kg ?? 0;
      } else {
        resumos.set(key, {
          curral_id: curralId,
          curral_codigo: curralCodigo,
          receita_nome: receita?.nome ?? '',
          trato_numero: tratoNum,
          total_fornecido_kg: f.fornecido_kg ?? 0,
          data_registro: hoje,
        });
      }
    }

    // 4. Upsert aggregated data to veterinaria trato table
    // The vet_trato_realizados table stores actual feeding results for veterinaria module
    for (const resumo of resumos.values()) {
      try {
        const { error: upsertError } = await supabase
          .from('vet_trato_realizados')
          .upsert(
            {
              fazenda_id,
              curral_id: resumo.curral_id,
              trato_numero: resumo.trato_numero,
              total_fornecido_kg: resumo.total_fornecido_kg,
              receita_nome: resumo.receita_nome,
              data_registro: resumo.data_registro,
              origem: 'automacao',
              updated_at: new Date().toISOString(),
            },
            {
              onConflict: 'fazenda_id,curral_id,trato_numero,data_registro',
            }
          );

        if (upsertError) {
          console.warn(
            `[ApiVeterinaria] Upsert error for curral ${resumo.curral_codigo}:`,
            upsertError.message
          );
        } else {
          result.registros_enviados += 1;
        }
      } catch (err) {
        console.warn('[ApiVeterinaria] Upsert exception:', err);
      }
    }

    // 5. Also sync fabricacao totals (totais de producao do dia)
    try {
      const { data: fabricacoes, error: fabError } = await supabase
        .from('vet_auto_fabricacoes')
        .select('receita_id, numero_trato, total_kg_mn_fabricada')
        .eq('fazenda_id', fazenda_id)
        .eq('data_registro', hoje)
        .eq('status', 'processado');

      if (!fabError && fabricacoes && fabricacoes.length > 0) {
        // Aggregate by receita+trato
        const fabResumo = new Map<string, number>();
        for (const fab of fabricacoes) {
          const key = `${fab.receita_id}-${fab.numero_trato}`;
          fabResumo.set(key, (fabResumo.get(key) ?? 0) + (fab.total_kg_mn_fabricada ?? 0));
        }

        for (const [key, totalKg] of fabResumo) {
          const [receitaId, tratoNum] = key.split('-');
          await supabase
            .from('vet_producao_diaria')
            .upsert(
              {
                fazenda_id,
                receita_id: receitaId,
                trato_numero: parseInt(tratoNum, 10),
                total_fabricado_kg: totalKg,
                data_registro: hoje,
                origem: 'automacao',
                updated_at: new Date().toISOString(),
              },
              {
                onConflict: 'fazenda_id,receita_id,trato_numero,data_registro',
              }
            );
        }
      }
    } catch (err) {
      console.warn('[ApiVeterinaria] Fabricacao sync error:', err);
    }

    result.sucesso = true;
    result.mensagem = `Enviados ${result.registros_enviados} registros para Veterinaria`;
  } catch (err) {
    result.mensagem = `Erro ao enviar para Veterinaria: ${err instanceof Error ? err.message : 'Erro desconhecido'}`;
    console.error('[ApiVeterinaria] enviarParaVeterinaria error:', err);
  }

  return result;
}

// ============================================
// RECEBER DE VETERINARIA
// Pull veterinaria data into automacao context
// ============================================

/**
 * Get animal/lot data from veterinaria tables.
 * Used to display lot info in automacao screens.
 */
export async function receberDeVeterinaria(fazenda_id: string): Promise<{
  sucesso: boolean;
  animais_lotes: AnimalLoteInfo[];
  planos_nutricionais: PlanoNutricional[];
  mensagem: string;
}> {
  const result = {
    sucesso: false,
    animais_lotes: [] as AnimalLoteInfo[],
    planos_nutricionais: [] as PlanoNutricional[],
    mensagem: '',
  };

  if (!connectivityService.getStatus()) {
    // Try to read from local cache
    try {
      const cachedLotes = await offlineService.getLocal('_vet_animais_lotes_cache', {
        fazenda_id,
      });
      const cachedPlanos = await offlineService.getLocal('_vet_planos_cache', {
        fazenda_id,
      });

      result.animais_lotes = cachedLotes as unknown as AnimalLoteInfo[];
      result.planos_nutricionais = cachedPlanos as unknown as PlanoNutricional[];
      result.sucesso = true;
      result.mensagem = 'Dados carregados do cache local (offline)';
    } catch {
      result.mensagem = 'Sem conexao e sem cache local disponivel';
    }
    return result;
  }

  try {
    // 1. Get animal/lot assignments from veterinaria
    const { data: lotes, error: lotesError } = await supabase
      .from('vet_lotes')
      .select(`
        id,
        nome,
        curral_id,
        quantidade_animais,
        peso_medio_kg,
        curral:vet_currais!curral_id(id, codigo)
      `)
      .eq('fazenda_id', fazenda_id)
      .eq('ativo', true);

    if (lotesError) {
      console.warn('[ApiVeterinaria] Lotes fetch error:', lotesError.message);
    } else if (lotes) {
      result.animais_lotes = lotes.map((l) => {
        const curral = l.curral as unknown as { id: string; codigo: string } | null;
        return {
          lote_id: l.id,
          lote_nome: l.nome,
          curral_id: curral?.id ?? l.curral_id,
          curral_codigo: curral?.codigo ?? '',
          quantidade_animais: l.quantidade_animais ?? 0,
          peso_medio_kg: l.peso_medio_kg ?? null,
        };
      });
    }

    // 2. Get nutrition plans
    const { data: planos, error: planosError } = await supabase
      .from('vet_planos_nutricionais')
      .select(`
        id,
        curral_id,
        receita_id,
        kg_por_cabeca_dia,
        data_inicio,
        data_fim,
        receita:vet_auto_receitas!receita_id(id, nome)
      `)
      .eq('fazenda_id', fazenda_id)
      .eq('ativo', true);

    if (planosError) {
      console.warn('[ApiVeterinaria] Planos fetch error:', planosError.message);
    } else if (planos) {
      result.planos_nutricionais = planos.map((p) => {
        const receita = p.receita as unknown as { id: string; nome: string } | null;
        return {
          id: p.id,
          curral_id: p.curral_id,
          receita_id: p.receita_id,
          receita_nome: receita?.nome ?? '',
          kg_por_cabeca_dia: p.kg_por_cabeca_dia ?? 0,
          data_inicio: p.data_inicio,
          data_fim: p.data_fim ?? null,
        };
      });
    }

    // 3. Cache locally for offline access
    // We create simple cache tables if they do not exist
    try {
      const db = await import('./offlineService');
      // Cache will be stored as JSON in the existing local db
      // For simplicity, store in a generic cache pattern
      for (const lote of result.animais_lotes) {
        await db.saveLocal('_vet_animais_lotes_cache' as any, {
          id: lote.lote_id,
          fazenda_id,
          ...lote,
        });
      }
      for (const plano of result.planos_nutricionais) {
        await db.saveLocal('_vet_planos_cache' as any, {
          id: plano.id,
          fazenda_id,
          ...plano,
        });
      }
    } catch {
      // Cache write failure is non-critical
    }

    result.sucesso = true;
    result.mensagem = `Recebidos ${result.animais_lotes.length} lotes e ${result.planos_nutricionais.length} planos nutricionais`;
  } catch (err) {
    result.mensagem = `Erro ao receber de Veterinaria: ${err instanceof Error ? err.message : 'Erro desconhecido'}`;
    console.error('[ApiVeterinaria] receberDeVeterinaria error:', err);
  }

  return result;
}

/**
 * Get the quantity of animals in a specific curral.
 * Useful for calculating kg/cab in automacao screens.
 */
export async function getQuantidadeAnimaisCurral(
  fazenda_id: string,
  curral_id: string
): Promise<number> {
  if (!connectivityService.getStatus()) {
    // Try local cache
    try {
      const cached = await offlineService.getLocal('_vet_animais_lotes_cache', {
        fazenda_id,
        curral_id,
      });
      if (cached.length > 0) {
        return (cached[0] as any).quantidade_animais ?? 0;
      }
    } catch {
      // no cache
    }
    return 0;
  }

  try {
    const { data, error } = await supabase
      .from('vet_lotes')
      .select('quantidade_animais')
      .eq('fazenda_id', fazenda_id)
      .eq('curral_id', curral_id)
      .eq('ativo', true);

    if (error) {
      console.warn('[ApiVeterinaria] getQuantidadeAnimaisCurral error:', error.message);
      return 0;
    }

    return (data ?? []).reduce((sum, l) => sum + (l.quantidade_animais ?? 0), 0);
  } catch {
    return 0;
  }
}

/**
 * Get the nutrition plan (kg/cab/dia) for a specific curral.
 * Used by automacao to calculate expected feeding amounts.
 */
export async function getPlanoNutricionalCurral(
  fazenda_id: string,
  curral_id: string
): Promise<PlanoNutricional | null> {
  if (!connectivityService.getStatus()) {
    try {
      const cached = await offlineService.getLocal('_vet_planos_cache', {
        fazenda_id,
        curral_id,
      });
      if (cached.length > 0) {
        return cached[0] as unknown as PlanoNutricional;
      }
    } catch {
      // no cache
    }
    return null;
  }

  try {
    const hoje = new Date().toISOString().split('T')[0];

    const { data, error } = await supabase
      .from('vet_planos_nutricionais')
      .select(`
        id,
        curral_id,
        receita_id,
        kg_por_cabeca_dia,
        data_inicio,
        data_fim,
        receita:vet_auto_receitas!receita_id(id, nome)
      `)
      .eq('fazenda_id', fazenda_id)
      .eq('curral_id', curral_id)
      .eq('ativo', true)
      .lte('data_inicio', hoje)
      .or(`data_fim.is.null,data_fim.gte.${hoje}`)
      .order('data_inicio', { ascending: false })
      .limit(1)
      .maybeSingle();

    if (error || !data) return null;

    const receita = data.receita as unknown as { id: string; nome: string } | null;

    return {
      id: data.id,
      curral_id: data.curral_id,
      receita_id: data.receita_id,
      receita_nome: receita?.nome ?? '',
      kg_por_cabeca_dia: data.kg_por_cabeca_dia ?? 0,
      data_inicio: data.data_inicio,
      data_fim: data.data_fim ?? null,
    };
  } catch {
    return null;
  }
}
