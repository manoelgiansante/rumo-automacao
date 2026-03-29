import { supabase } from '@/lib/supabase';

// ============================================
// Types
// ============================================

export type SyncStatus = 'pendente' | 'sincronizado' | 'erro' | 'conflito';

export type SyncEntidade = 'fabricacoes' | 'fornecimentos' | 'safe_points' | 'previsoes' | 'receitas' | 'dispositivos';

export interface VetAutoSyncLog {
  id: string;
  fazenda_id: string;
  entidade: SyncEntidade;
  direcao: 'upload' | 'download';
  total_registros: number;
  registros_sucesso: number;
  registros_erro: number;
  registros_conflito: number;
  status: SyncStatus;
  mensagem: string | null;
  data_sync: string;
  created_at: string;
}

export interface SyncResult {
  entidade: SyncEntidade;
  sucesso: boolean;
  total_registros: number;
  registros_sincronizados: number;
  registros_erro: number;
  registros_conflito: number;
  mensagem: string;
}

export interface LastSyncInfo {
  entidade: SyncEntidade;
  ultima_sync: string | null;
  status: SyncStatus | null;
  total_pendentes: number;
}

export interface FullSyncResult {
  fazenda_id: string;
  data_sync: string;
  resultados: SyncResult[];
  sucesso_total: boolean;
}

// ============================================
// Helpers
// ============================================

async function registrarSyncLog(
  fazenda_id: string,
  entidade: SyncEntidade,
  direcao: 'upload' | 'download',
  result: SyncResult
): Promise<void> {
  const { error } = await supabase
    .from('vet_auto_sync_logs')
    .insert({
      fazenda_id,
      entidade,
      direcao,
      total_registros: result.total_registros,
      registros_sucesso: result.registros_sincronizados,
      registros_erro: result.registros_erro,
      registros_conflito: result.registros_conflito,
      status: result.sucesso ? 'sincronizado' : 'erro',
      mensagem: result.mensagem,
      data_sync: new Date().toISOString(),
    });

  if (error) {
    console.error(`Erro ao registrar log de sync: ${error.message}`);
  }
}

// ============================================
// SYNC FABRICACOES
// ============================================

/**
 * Sincroniza fabricacoes pendentes de envio
 * Busca registros com flag_sync = false e marca como sincronizados
 */
export async function syncFabricacoes(
  fazenda_id: string
): Promise<SyncResult> {
  const result: SyncResult = {
    entidade: 'fabricacoes',
    sucesso: false,
    total_registros: 0,
    registros_sincronizados: 0,
    registros_erro: 0,
    registros_conflito: 0,
    mensagem: '',
  };

  try {
    // Buscar fabricacoes pendentes de sync
    const { data: pendentes, error: fetchError } = await supabase
      .from('vet_auto_fabricacoes')
      .select('id, lote_fabricacao, updated_at')
      .eq('fazenda_id', fazenda_id)
      .eq('flag_sync', false);

    if (fetchError) throw new Error(fetchError.message);

    const registros = pendentes ?? [];
    result.total_registros = registros.length;

    if (registros.length === 0) {
      result.sucesso = true;
      result.mensagem = 'Nenhuma fabricacao pendente de sincronizacao';
      return result;
    }

    // Verificar conflitos: registros com mesmo lote_fabricacao ja existentes remotamente
    const lotes = registros.map((r) => r.lote_fabricacao);
    const { data: remotos, error: remoteError } = await supabase
      .from('vet_auto_fabricacoes')
      .select('id, lote_fabricacao, updated_at')
      .eq('fazenda_id', fazenda_id)
      .eq('flag_sync', true)
      .in('lote_fabricacao', lotes);

    if (remoteError) throw new Error(remoteError.message);

    const remotosMap = new Map(
      (remotos ?? []).map((r) => [r.lote_fabricacao, r])
    );

    for (const registro of registros) {
      try {
        const remoto = remotosMap.get(registro.lote_fabricacao);

        if (remoto) {
          // Conflito: resolver por ultima atualizacao (wins last write)
          const localDate = new Date(registro.updated_at).getTime();
          const remoteDate = new Date(remoto.updated_at).getTime();

          if (localDate > remoteDate) {
            // Local e mais recente, sobrescrever
            await supabase
              .from('vet_auto_fabricacoes')
              .update({ flag_sync: true, updated_at: new Date().toISOString() })
              .eq('id', registro.id);
            result.registros_sincronizados += 1;
          } else {
            result.registros_conflito += 1;
          }
        } else {
          // Sem conflito, marcar como sincronizado
          await supabase
            .from('vet_auto_fabricacoes')
            .update({ flag_sync: true, updated_at: new Date().toISOString() })
            .eq('id', registro.id);
          result.registros_sincronizados += 1;
        }
      } catch {
        result.registros_erro += 1;
      }
    }

    result.sucesso = result.registros_erro === 0;
    result.mensagem = `Sincronizadas ${result.registros_sincronizados}/${result.total_registros} fabricacoes`;

    if (result.registros_conflito > 0) {
      result.mensagem += ` (${result.registros_conflito} conflitos)`;
    }
  } catch (err) {
    result.mensagem = `Erro na sincronizacao: ${err instanceof Error ? err.message : 'Erro desconhecido'}`;
  }

  await registrarSyncLog(fazenda_id, 'fabricacoes', 'upload', result);
  return result;
}

// ============================================
// SYNC FORNECIMENTOS
// ============================================

/**
 * Sincroniza fornecimentos pendentes de envio
 */
export async function syncFornecimentos(
  fazenda_id: string
): Promise<SyncResult> {
  const result: SyncResult = {
    entidade: 'fornecimentos',
    sucesso: false,
    total_registros: 0,
    registros_sincronizados: 0,
    registros_erro: 0,
    registros_conflito: 0,
    mensagem: '',
  };

  try {
    // Buscar carregamentos pendentes via fazenda_id
    const { data: carregamentosPendentes, error: cError } = await supabase
      .from('vet_auto_carregamentos')
      .select('id')
      .eq('fazenda_id', fazenda_id)
      .eq('flag_sync', false);

    if (cError) throw new Error(cError.message);

    const carregamentoIds = (carregamentosPendentes ?? []).map((c) => c.id);

    if (carregamentoIds.length === 0) {
      result.sucesso = true;
      result.mensagem = 'Nenhum fornecimento pendente de sincronizacao';
      return result;
    }

    // Buscar fornecimentos desses carregamentos
    const { data: fornecimentos, error: fError } = await supabase
      .from('vet_auto_fornecimentos')
      .select('id, carregamento_id')
      .in('carregamento_id', carregamentoIds);

    if (fError) throw new Error(fError.message);

    result.total_registros = (fornecimentos ?? []).length + carregamentoIds.length;

    // Marcar carregamentos como sincronizados
    for (const cId of carregamentoIds) {
      try {
        await supabase
          .from('vet_auto_carregamentos')
          .update({ flag_sync: true, updated_at: new Date().toISOString() })
          .eq('id', cId);
        result.registros_sincronizados += 1;
      } catch {
        result.registros_erro += 1;
      }
    }

    // Fornecimentos sao sincronizados junto com seus carregamentos
    result.registros_sincronizados += (fornecimentos ?? []).length;

    result.sucesso = result.registros_erro === 0;
    result.mensagem = `Sincronizados ${result.registros_sincronizados}/${result.total_registros} registros de fornecimento`;
  } catch (err) {
    result.mensagem = `Erro na sincronizacao: ${err instanceof Error ? err.message : 'Erro desconhecido'}`;
  }

  await registrarSyncLog(fazenda_id, 'fornecimentos', 'upload', result);
  return result;
}

// ============================================
// SYNC SAFE POINTS
// ============================================

/**
 * Sincroniza leituras de safe points pendentes
 */
export async function syncSafePoints(
  fazenda_id: string
): Promise<SyncResult> {
  const result: SyncResult = {
    entidade: 'safe_points',
    sucesso: false,
    total_registros: 0,
    registros_sincronizados: 0,
    registros_erro: 0,
    registros_conflito: 0,
    mensagem: '',
  };

  try {
    // Buscar safe points da fazenda
    const { data: safePoints, error: spError } = await supabase
      .from('vet_auto_safe_points')
      .select('id')
      .eq('fazenda_id', fazenda_id);

    if (spError) throw new Error(spError.message);

    const spIds = (safePoints ?? []).map((sp) => sp.id);
    if (spIds.length === 0) {
      result.sucesso = true;
      result.mensagem = 'Nenhum safe point encontrado';
      return result;
    }

    // Buscar leituras pendentes de sync
    const { data: leituras, error: lError } = await supabase
      .from('vet_auto_safe_point_leituras')
      .select('id')
      .in('safe_point_id', spIds)
      .eq('flag_sync', false);

    if (lError) throw new Error(lError.message);

    const registros = leituras ?? [];
    result.total_registros = registros.length;

    if (registros.length === 0) {
      result.sucesso = true;
      result.mensagem = 'Nenhuma leitura de safe point pendente';
      return result;
    }

    // Marcar como sincronizadas
    const ids = registros.map((r) => r.id);
    const { error: updateError } = await supabase
      .from('vet_auto_safe_point_leituras')
      .update({ flag_sync: true })
      .in('id', ids);

    if (updateError) throw new Error(updateError.message);

    result.registros_sincronizados = registros.length;
    result.sucesso = true;
    result.mensagem = `Sincronizadas ${registros.length} leituras de safe points`;
  } catch (err) {
    result.mensagem = `Erro na sincronizacao: ${err instanceof Error ? err.message : 'Erro desconhecido'}`;
  }

  await registrarSyncLog(fazenda_id, 'safe_points', 'upload', result);
  return result;
}

// ============================================
// LAST SYNC
// ============================================

/**
 * Retorna informacoes da ultima sincronizacao por entidade
 */
export async function getLastSync(
  fazenda_id: string
): Promise<LastSyncInfo[]> {
  const entidades: SyncEntidade[] = [
    'fabricacoes',
    'fornecimentos',
    'safe_points',
    'previsoes',
    'receitas',
    'dispositivos',
  ];

  const results: LastSyncInfo[] = [];

  for (const entidade of entidades) {
    // Buscar ultimo log de sync
    const { data: lastLog, error } = await supabase
      .from('vet_auto_sync_logs')
      .select('data_sync, status')
      .eq('fazenda_id', fazenda_id)
      .eq('entidade', entidade)
      .order('data_sync', { ascending: false })
      .limit(1)
      .maybeSingle();

    if (error) {
      console.error(`Erro ao buscar ultimo sync de ${entidade}: ${error.message}`);
    }

    // Contar registros pendentes por entidade
    let totalPendentes = 0;
    try {
      const tableName = getTableForEntidade(entidade);
      if (tableName) {
        const { count, error: countError } = await supabase
          .from(tableName)
          .select('*', { count: 'exact', head: true })
          .eq('fazenda_id', fazenda_id)
          .eq('flag_sync', false);

        if (!countError && count != null) {
          totalPendentes = count;
        }
      }
    } catch {
      // Ignora erro de contagem
    }

    results.push({
      entidade,
      ultima_sync: lastLog?.data_sync ?? null,
      status: (lastLog?.status as SyncStatus) ?? null,
      total_pendentes: totalPendentes,
    });
  }

  return results;
}

function getTableForEntidade(entidade: SyncEntidade): string | null {
  const map: Record<SyncEntidade, string> = {
    fabricacoes: 'vet_auto_fabricacoes',
    fornecimentos: 'vet_auto_carregamentos',
    safe_points: 'vet_auto_safe_point_leituras',
    previsoes: 'vet_auto_previsoes',
    receitas: 'vet_auto_receitas',
    dispositivos: 'vet_auto_dispositivos',
  };
  return map[entidade] ?? null;
}

// ============================================
// FULL SYNC
// ============================================

/**
 * Executa sincronizacao completa de todas as entidades
 * Resolve conflitos usando last-write-wins
 */
export async function fullSync(
  fazenda_id: string
): Promise<FullSyncResult> {
  const resultados: SyncResult[] = [];

  // Sync na ordem de dependencia
  resultados.push(await syncFabricacoes(fazenda_id));
  resultados.push(await syncFornecimentos(fazenda_id));
  resultados.push(await syncSafePoints(fazenda_id));

  const sucesso_total = resultados.every((r) => r.sucesso);

  return {
    fazenda_id,
    data_sync: new Date().toISOString(),
    resultados,
    sucesso_total,
  };
}
