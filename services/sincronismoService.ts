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
// SYNC FABRICACOES (+ cascade: ingredientes, descartes)
// ============================================

/**
 * Sincroniza fabricacoes pendentes de envio
 * Busca registros com flag_sync = false e marca como sincronizados
 * Also cascades to vet_auto_fabricacao_ingredientes and vet_auto_descartes (tipo='fabricacao')
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

    const syncedFabricacaoIds: string[] = [];

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
            syncedFabricacaoIds.push(registro.id);
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
          syncedFabricacaoIds.push(registro.id);
        }
      } catch {
        result.registros_erro += 1;
      }
    }

    // Cascade: sync fabricacao_ingredientes for synced fabricacoes
    if (syncedFabricacaoIds.length > 0) {
      try {
        await supabase
          .from('vet_auto_fabricacao_ingredientes')
          .update({ flag_sync: true, updated_at: new Date().toISOString() })
          .in('fabricacao_id', syncedFabricacaoIds)
          .eq('flag_sync', false);
      } catch (err) {
        console.error('Erro ao sincronizar fabricacao_ingredientes:', err);
      }

      // Cascade: sync descartes (tipo='fabricacao') for synced fabricacoes
      try {
        await supabase
          .from('vet_auto_descartes')
          .update({ flag_sync: true, updated_at: new Date().toISOString() })
          .eq('tipo', 'fabricacao')
          .in('referencia_id', syncedFabricacaoIds)
          .eq('flag_sync', false);
      } catch (err) {
        console.error('Erro ao sincronizar descartes de fabricacao:', err);
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
// SYNC FORNECIMENTOS (+ cascade: carregamento_detalhes, descartes)
// ============================================

/**
 * Sincroniza fornecimentos pendentes de envio
 * Also cascades to vet_auto_carregamento_detalhes and vet_auto_descartes (tipo='fornecimento')
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

    // Cascade: sync carregamento_detalhes for synced carregamentos
    try {
      await supabase
        .from('vet_auto_carregamento_detalhes')
        .update({ flag_sync: true, updated_at: new Date().toISOString() })
        .in('carregamento_id', carregamentoIds)
        .eq('flag_sync', false);
    } catch (err) {
      console.error('Erro ao sincronizar carregamento_detalhes:', err);
    }

    // Cascade: sync descartes (tipo='fornecimento') for synced carregamentos
    try {
      await supabase
        .from('vet_auto_descartes')
        .update({ flag_sync: true, updated_at: new Date().toISOString() })
        .eq('tipo', 'fornecimento')
        .in('referencia_id', carregamentoIds)
        .eq('flag_sync', false);
    } catch (err) {
      console.error('Erro ao sincronizar descartes de fornecimento:', err);
    }

    result.sucesso = result.registros_erro === 0;
    result.mensagem = `Sincronizados ${result.registros_sincronizados}/${result.total_registros} registros de fornecimento`;
  } catch (err) {
    result.mensagem = `Erro na sincronizacao: ${err instanceof Error ? err.message : 'Erro desconhecido'}`;
  }

  await registrarSyncLog(fazenda_id, 'fornecimentos', 'upload', result);
  return result;
}

// ============================================
// SYNC SAFE POINTS (with updated_at fix)
// ============================================

/**
 * Sincroniza leituras de safe points pendentes
 * Includes updated_at in the sync update
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

    // Marcar como sincronizadas (with updated_at)
    const ids = registros.map((r) => r.id);
    const { error: updateError } = await supabase
      .from('vet_auto_safe_point_leituras')
      .update({ flag_sync: true, updated_at: new Date().toISOString() })
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
// SYNC PREVISOES
// ============================================

/**
 * Sincroniza previstos pendentes de envio
 */
export async function syncPrevisoes(
  fazenda_id: string
): Promise<SyncResult> {
  const result: SyncResult = {
    entidade: 'previsoes',
    sucesso: false,
    total_registros: 0,
    registros_sincronizados: 0,
    registros_erro: 0,
    registros_conflito: 0,
    mensagem: '',
  };

  try {
    const { data: pendentes, error: fetchError } = await supabase
      .from('vet_auto_previstos')
      .select('id, updated_at')
      .eq('fazenda_id', fazenda_id)
      .eq('flag_sync', false);

    if (fetchError) throw new Error(fetchError.message);

    const registros = pendentes ?? [];
    result.total_registros = registros.length;

    if (registros.length === 0) {
      result.sucesso = true;
      result.mensagem = 'Nenhuma previsao pendente de sincronizacao';
      return result;
    }

    for (const registro of registros) {
      try {
        await supabase
          .from('vet_auto_previstos')
          .update({ flag_sync: true, updated_at: new Date().toISOString() })
          .eq('id', registro.id);
        result.registros_sincronizados += 1;
      } catch {
        result.registros_erro += 1;
      }
    }

    result.sucesso = result.registros_erro === 0;
    result.mensagem = `Sincronizadas ${result.registros_sincronizados}/${result.total_registros} previsoes`;
  } catch (err) {
    result.mensagem = `Erro na sincronizacao: ${err instanceof Error ? err.message : 'Erro desconhecido'}`;
  }

  await registrarSyncLog(fazenda_id, 'previsoes', 'upload', result);
  return result;
}

// ============================================
// SYNC RECEITAS (+ cascade: receita_ingredientes)
// ============================================

/**
 * Sincroniza receitas pendentes de envio
 * Also cascades to vet_auto_receita_ingredientes
 */
export async function syncReceitas(
  fazenda_id: string
): Promise<SyncResult> {
  const result: SyncResult = {
    entidade: 'receitas',
    sucesso: false,
    total_registros: 0,
    registros_sincronizados: 0,
    registros_erro: 0,
    registros_conflito: 0,
    mensagem: '',
  };

  try {
    const { data: pendentes, error: fetchError } = await supabase
      .from('vet_auto_receitas')
      .select('id, updated_at')
      .eq('fazenda_id', fazenda_id)
      .eq('flag_sync', false);

    if (fetchError) throw new Error(fetchError.message);

    const registros = pendentes ?? [];
    result.total_registros = registros.length;

    if (registros.length === 0) {
      result.sucesso = true;
      result.mensagem = 'Nenhuma receita pendente de sincronizacao';
      return result;
    }

    const syncedReceitaIds: string[] = [];

    for (const registro of registros) {
      try {
        await supabase
          .from('vet_auto_receitas')
          .update({ flag_sync: true, updated_at: new Date().toISOString() })
          .eq('id', registro.id);
        result.registros_sincronizados += 1;
        syncedReceitaIds.push(registro.id);
      } catch {
        result.registros_erro += 1;
      }
    }

    // Cascade: sync receita_ingredientes for synced receitas
    if (syncedReceitaIds.length > 0) {
      try {
        await supabase
          .from('vet_auto_receita_ingredientes')
          .update({ flag_sync: true, updated_at: new Date().toISOString() })
          .in('receita_id', syncedReceitaIds)
          .eq('flag_sync', false);
      } catch (err) {
        console.error('Erro ao sincronizar receita_ingredientes:', err);
      }
    }

    result.sucesso = result.registros_erro === 0;
    result.mensagem = `Sincronizadas ${result.registros_sincronizados}/${result.total_registros} receitas`;
  } catch (err) {
    result.mensagem = `Erro na sincronizacao: ${err instanceof Error ? err.message : 'Erro desconhecido'}`;
  }

  await registrarSyncLog(fazenda_id, 'receitas', 'upload', result);
  return result;
}

// ============================================
// SYNC DISPOSITIVOS
// ============================================

/**
 * Sincroniza dispositivos pendentes de envio
 */
export async function syncDispositivos(
  fazenda_id: string
): Promise<SyncResult> {
  const result: SyncResult = {
    entidade: 'dispositivos',
    sucesso: false,
    total_registros: 0,
    registros_sincronizados: 0,
    registros_erro: 0,
    registros_conflito: 0,
    mensagem: '',
  };

  try {
    const { data: pendentes, error: fetchError } = await supabase
      .from('vet_auto_dispositivos')
      .select('id, updated_at')
      .eq('fazenda_id', fazenda_id)
      .eq('flag_sync', false);

    if (fetchError) throw new Error(fetchError.message);

    const registros = pendentes ?? [];
    result.total_registros = registros.length;

    if (registros.length === 0) {
      result.sucesso = true;
      result.mensagem = 'Nenhum dispositivo pendente de sincronizacao';
      return result;
    }

    for (const registro of registros) {
      try {
        await supabase
          .from('vet_auto_dispositivos')
          .update({ flag_sync: true, updated_at: new Date().toISOString() })
          .eq('id', registro.id);
        result.registros_sincronizados += 1;
      } catch {
        result.registros_erro += 1;
      }
    }

    result.sucesso = result.registros_erro === 0;
    result.mensagem = `Sincronizados ${result.registros_sincronizados}/${result.total_registros} dispositivos`;
  } catch (err) {
    result.mensagem = `Erro na sincronizacao: ${err instanceof Error ? err.message : 'Erro desconhecido'}`;
  }

  await registrarSyncLog(fazenda_id, 'dispositivos', 'upload', result);
  return result;
}

// ============================================
// DOWNLOAD SYNC (bidirectional)
// ============================================

/**
 * Download receitas from server and update local
 */
export async function downloadReceitas(
  fazenda_id: string
): Promise<SyncResult> {
  const result: SyncResult = {
    entidade: 'receitas',
    sucesso: false,
    total_registros: 0,
    registros_sincronizados: 0,
    registros_erro: 0,
    registros_conflito: 0,
    mensagem: '',
  };

  try {
    // Fetch all receitas from server for this fazenda
    const { data: serverReceitas, error: fetchError } = await supabase
      .from('vet_auto_receitas')
      .select('*, ingredientes:vet_auto_receita_ingredientes(*)')
      .eq('fazenda_id', fazenda_id)
      .eq('ativo', true);

    if (fetchError) throw new Error(fetchError.message);

    const registros = serverReceitas ?? [];
    result.total_registros = registros.length;

    if (registros.length === 0) {
      result.sucesso = true;
      result.mensagem = 'Nenhuma receita no servidor para download';
      return result;
    }

    // Upsert receitas locally (server wins on download)
    for (const receita of registros) {
      try {
        const { ingredientes, ...receitaData } = receita;
        await supabase
          .from('vet_auto_receitas')
          .upsert({ ...receitaData, flag_sync: true }, { onConflict: 'id' });

        // Upsert ingredientes da receita
        if (ingredientes && ingredientes.length > 0) {
          await supabase
            .from('vet_auto_receita_ingredientes')
            .upsert(
              ingredientes.map((ing: any) => ({ ...ing, flag_sync: true })),
              { onConflict: 'id' }
            );
        }

        result.registros_sincronizados += 1;
      } catch {
        result.registros_erro += 1;
      }
    }

    result.sucesso = result.registros_erro === 0;
    result.mensagem = `Baixadas ${result.registros_sincronizados}/${result.total_registros} receitas`;
  } catch (err) {
    result.mensagem = `Erro no download: ${err instanceof Error ? err.message : 'Erro desconhecido'}`;
  }

  await registrarSyncLog(fazenda_id, 'receitas', 'download', result);
  return result;
}

/**
 * Download previsoes from server and update local
 */
export async function downloadPrevisoes(
  fazenda_id: string
): Promise<SyncResult> {
  const result: SyncResult = {
    entidade: 'previsoes',
    sucesso: false,
    total_registros: 0,
    registros_sincronizados: 0,
    registros_erro: 0,
    registros_conflito: 0,
    mensagem: '',
  };

  try {
    // Fetch previsoes from server (today and future)
    const hoje = new Date().toISOString().split('T')[0];
    const { data: serverPrevisoes, error: fetchError } = await supabase
      .from('vet_auto_previstos')
      .select('*')
      .eq('fazenda_id', fazenda_id)
      .gte('data_fornecimento', hoje);

    if (fetchError) throw new Error(fetchError.message);

    const registros = serverPrevisoes ?? [];
    result.total_registros = registros.length;

    if (registros.length === 0) {
      result.sucesso = true;
      result.mensagem = 'Nenhuma previsao no servidor para download';
      return result;
    }

    for (const previsao of registros) {
      try {
        await supabase
          .from('vet_auto_previstos')
          .upsert({ ...previsao, flag_sync: true }, { onConflict: 'id' });
        result.registros_sincronizados += 1;
      } catch {
        result.registros_erro += 1;
      }
    }

    result.sucesso = result.registros_erro === 0;
    result.mensagem = `Baixadas ${result.registros_sincronizados}/${result.total_registros} previsoes`;
  } catch (err) {
    result.mensagem = `Erro no download: ${err instanceof Error ? err.message : 'Erro desconhecido'}`;
  }

  await registrarSyncLog(fazenda_id, 'previsoes', 'download', result);
  return result;
}

/**
 * Download currais from server and update local
 */
export async function downloadCurrais(
  fazenda_id: string
): Promise<SyncResult> {
  const result: SyncResult = {
    entidade: 'dispositivos', // uses dispositivos entidade for logging
    sucesso: false,
    total_registros: 0,
    registros_sincronizados: 0,
    registros_erro: 0,
    registros_conflito: 0,
    mensagem: '',
  };

  try {
    const { data: serverCurrais, error: fetchError } = await supabase
      .from('vet_auto_currais')
      .select('*')
      .eq('fazenda_id', fazenda_id)
      .eq('ativo', true);

    if (fetchError) throw new Error(fetchError.message);

    const registros = serverCurrais ?? [];
    result.total_registros = registros.length;

    if (registros.length === 0) {
      result.sucesso = true;
      result.mensagem = 'Nenhum curral no servidor para download';
      return result;
    }

    for (const curral of registros) {
      try {
        await supabase
          .from('vet_auto_currais')
          .upsert({ ...curral, flag_sync: true }, { onConflict: 'id' });
        result.registros_sincronizados += 1;
      } catch {
        result.registros_erro += 1;
      }
    }

    result.sucesso = result.registros_erro === 0;
    result.mensagem = `Baixados ${result.registros_sincronizados}/${result.total_registros} currais`;
  } catch (err) {
    result.mensagem = `Erro no download: ${err instanceof Error ? err.message : 'Erro desconhecido'}`;
  }

  await registrarSyncLog(fazenda_id, 'dispositivos', 'download', result);
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
    previsoes: 'vet_auto_previstos',
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
 * Includes all 6 entity uploads + 3 downloads
 */
export async function fullSync(
  fazenda_id: string
): Promise<FullSyncResult> {
  const resultados: SyncResult[] = [];

  // Upload sync na ordem de dependencia
  resultados.push(await syncFabricacoes(fazenda_id));
  resultados.push(await syncFornecimentos(fazenda_id));
  resultados.push(await syncSafePoints(fazenda_id));
  resultados.push(await syncPrevisoes(fazenda_id));
  resultados.push(await syncReceitas(fazenda_id));
  resultados.push(await syncDispositivos(fazenda_id));

  // Download sync (bidirectional)
  resultados.push(await downloadReceitas(fazenda_id));
  resultados.push(await downloadPrevisoes(fazenda_id));
  resultados.push(await downloadCurrais(fazenda_id));

  const sucesso_total = resultados.every((r) => r.sucesso);

  return {
    fazenda_id,
    data_sync: new Date().toISOString(),
    resultados,
    sucesso_total,
  };
}
