import * as SQLite from 'expo-sqlite';
import { supabase } from '@/lib/supabase';

// ============================================
// Offline Service - Local SQLite Storage
// Mirrors CR1's db2.sdb offline-first approach
// flag_sync = 0 means "not sent" (like CR1's flag_envio = 2)
// flag_sync = 1 means "synced to server"
// ============================================

const DB_NAME = 'rumo_automacao.db';

let db: SQLite.SQLiteDatabase | null = null;

// ============================================
// Database Initialization
// ============================================

async function getDb(): Promise<SQLite.SQLiteDatabase> {
  if (!db) {
    db = await SQLite.openDatabaseAsync(DB_NAME);
    await db.execAsync('PRAGMA journal_mode = WAL;');
    await db.execAsync('PRAGMA foreign_keys = ON;');
  }
  return db;
}

/**
 * Initialize all local SQLite tables.
 * Called once at app startup.
 */
export async function initDatabase(): Promise<void> {
  const database = await getDb();

  // ---- Operational tables (read-write, synced to Supabase) ----

  await database.execAsync(`
    CREATE TABLE IF NOT EXISTS vet_auto_fabricacoes (
      id TEXT PRIMARY KEY,
      fazenda_id TEXT,
      lote_fabricacao TEXT,
      receita_id TEXT,
      misturador_id TEXT,
      usuario_id TEXT,
      operador_pa_id TEXT,
      numero_trato INTEGER,
      total_cabeca INTEGER,
      total_kg_mn_previsto REAL,
      total_kg_mn_fabricada REAL,
      total_perda_kg REAL,
      total_sobra_carregado_kg REAL,
      lote_fabricacao_sobra TEXT,
      status TEXT DEFAULT 'espera',
      hora_inicio TEXT,
      hora_fim TEXT,
      data_registro TEXT,
      flag_automation INTEGER DEFAULT 0,
      flag_sync INTEGER DEFAULT 0,
      created_at TEXT,
      updated_at TEXT
    );
  `);

  await database.execAsync(`
    CREATE TABLE IF NOT EXISTS vet_auto_fabricacao_ingredientes (
      id TEXT PRIMARY KEY,
      fabricacao_id TEXT,
      ingrediente_id TEXT,
      peso_inicial REAL,
      peso_final REAL,
      total_kg_fabricada REAL,
      total_kg_previsto REAL,
      tolerancia REAL,
      diferenca_percentual REAL,
      diferenca_kg REAL,
      ordem INTEGER,
      flag_manual TEXT,
      hora_inicio TEXT,
      hora_fim TEXT,
      flag_sync INTEGER DEFAULT 0,
      created_at TEXT
    );
  `);

  await database.execAsync(`
    CREATE TABLE IF NOT EXISTS vet_auto_carregamentos (
      id TEXT PRIMARY KEY,
      fazenda_id TEXT,
      trato_id TEXT,
      misturador_id TEXT,
      data_registro TEXT,
      status TEXT DEFAULT 'em_andamento',
      total_carregado_kg REAL,
      peso_balancao REAL,
      peso_balancao_retorno REAL,
      hora_saida TEXT,
      hora_retorno TEXT,
      flag_sync INTEGER DEFAULT 0,
      created_at TEXT,
      updated_at TEXT
    );
  `);

  await database.execAsync(`
    CREATE TABLE IF NOT EXISTS vet_auto_carregamento_detalhes (
      id TEXT PRIMARY KEY,
      carregamento_id TEXT,
      peso_inicial REAL,
      peso_final REAL,
      lote_fabricacao TEXT,
      receita_id TEXT,
      hora_inicial TEXT,
      hora_final TEXT,
      flag_sync INTEGER DEFAULT 0,
      created_at TEXT
    );
  `);

  await database.execAsync(`
    CREATE TABLE IF NOT EXISTS vet_auto_fornecimentos (
      id TEXT PRIMARY KEY,
      carregamento_id TEXT,
      curral_rfid_id TEXT,
      tag_inicial TEXT,
      tag_final TEXT,
      peso_inicial REAL,
      peso_final REAL,
      fornecido_kg REAL,
      receita_id TEXT,
      trato_numero INTEGER,
      hora_inicio TEXT,
      hora_final TEXT,
      flag_rateio INTEGER DEFAULT 0,
      entrada_manual INTEGER DEFAULT 0,
      previsto_kg REAL,
      flag_sync INTEGER DEFAULT 0,
      created_at TEXT
    );
  `);

  await database.execAsync(`
    CREATE TABLE IF NOT EXISTS vet_auto_descartes (
      id TEXT PRIMARY KEY,
      tipo TEXT,
      referencia_id TEXT,
      misturador_id TEXT,
      motivo TEXT,
      quantidade_kg REAL,
      flag_sync INTEGER DEFAULT 0,
      created_at TEXT
    );
  `);

  await database.execAsync(`
    CREATE TABLE IF NOT EXISTS vet_auto_safe_points (
      id TEXT PRIMARY KEY,
      fazenda_id TEXT,
      nome TEXT,
      tag TEXT,
      tipo TEXT,
      ativo INTEGER DEFAULT 1,
      flag_sync INTEGER DEFAULT 0,
      created_at TEXT,
      updated_at TEXT
    );
  `);

  await database.execAsync(`
    CREATE TABLE IF NOT EXISTS vet_auto_safe_point_leituras (
      id TEXT PRIMARY KEY,
      safe_point_id TEXT,
      carregamento_id TEXT,
      peso_kg REAL,
      input_type TEXT,
      tara_kg REAL,
      peso_bruto_kg REAL,
      data_registro TEXT,
      flag_sync INTEGER DEFAULT 0,
      created_at TEXT
    );
  `);

  await database.execAsync(`
    CREATE TABLE IF NOT EXISTS vet_auto_ocorrencia_paradas (
      id TEXT PRIMARY KEY,
      fazenda_id TEXT,
      nome TEXT,
      carregamento_id TEXT,
      data_registro TEXT,
      flag_sync INTEGER DEFAULT 0,
      created_at TEXT
    );
  `);

  await database.execAsync(`
    CREATE TABLE IF NOT EXISTS vet_auto_ocorrencia_paradas_itens (
      id TEXT PRIMARY KEY,
      ocorrencia_id TEXT,
      nome TEXT,
      observacao TEXT,
      operador TEXT,
      receita TEXT,
      peso_balanca REAL,
      hora_registro TEXT,
      flag_sync INTEGER DEFAULT 0,
      created_at TEXT
    );
  `);

  await database.execAsync(`
    CREATE TABLE IF NOT EXISTS vet_auto_log_atividades (
      id TEXT PRIMARY KEY,
      fazenda_id TEXT,
      usuario_id TEXT,
      usuario_nome TEXT,
      acao TEXT,
      detalhes TEXT,
      flag_sync INTEGER DEFAULT 0,
      created_at TEXT
    );
  `);

  // ---- Master data tables (downloaded from server, read-only locally) ----

  await database.execAsync(`
    CREATE TABLE IF NOT EXISTS vet_auto_receitas (
      id TEXT PRIMARY KEY,
      fazenda_id TEXT,
      nome TEXT,
      codigo_alfa TEXT,
      materia_seca REAL,
      imn_por_cabeca_dia REAL,
      custo_tonelada_mn REAL,
      tempo_mistura REAL,
      tipo_receita TEXT,
      perc_tolerancia REAL,
      status TEXT DEFAULT 'ativo',
      created_at TEXT,
      updated_at TEXT
    );
  `);

  await database.execAsync(`
    CREATE TABLE IF NOT EXISTS vet_auto_receita_ingredientes (
      id TEXT PRIMARY KEY,
      receita_id TEXT,
      ingrediente_id TEXT,
      percentual_mn REAL,
      percentual_ms REAL,
      tolerancia REAL,
      ordem_batida INTEGER,
      automatizado INTEGER DEFAULT 0,
      created_at TEXT
    );
  `);

  await database.execAsync(`
    CREATE TABLE IF NOT EXISTS vet_auto_ingredientes (
      id TEXT PRIMARY KEY,
      fazenda_id TEXT,
      nome TEXT,
      tipo TEXT,
      materia_seca REAL,
      custo_kg REAL,
      estoque_atual REAL,
      codigo_alfa TEXT,
      estoque_minimo_kg REAL,
      local_fisico TEXT,
      status TEXT DEFAULT 'ativo',
      created_at TEXT,
      updated_at TEXT
    );
  `);

  await database.execAsync(`
    CREATE TABLE IF NOT EXISTS vet_auto_currais (
      id TEXT PRIMARY KEY,
      fazenda_id TEXT,
      codigo TEXT,
      nome TEXT,
      ativo INTEGER DEFAULT 1,
      created_at TEXT,
      updated_at TEXT
    );
  `);

  await database.execAsync(`
    CREATE TABLE IF NOT EXISTS vet_auto_currais_rfid (
      id TEXT PRIMARY KEY,
      fazenda_id TEXT,
      curral_id TEXT,
      tag_inicial TEXT,
      tag_final TEXT,
      linha INTEGER,
      ativo INTEGER DEFAULT 1,
      created_at TEXT,
      updated_at TEXT
    );
  `);

  await database.execAsync(`
    CREATE TABLE IF NOT EXISTS vet_auto_tratos (
      id TEXT PRIMARY KEY,
      fazenda_id TEXT,
      numero INTEGER,
      nome TEXT,
      horario TEXT,
      ativo INTEGER DEFAULT 1,
      created_at TEXT,
      updated_at TEXT
    );
  `);

  await database.execAsync(`
    CREATE TABLE IF NOT EXISTS vet_auto_previstos (
      id TEXT PRIMARY KEY,
      fazenda_id TEXT,
      curral_rfid_id TEXT,
      trato_id TEXT,
      receita_id TEXT,
      data_fornecimento TEXT,
      previsto_kg REAL,
      quantidade_cab INTEGER,
      realizado_kg REAL DEFAULT 0,
      created_at TEXT,
      updated_at TEXT
    );
  `);

  await database.execAsync(`
    CREATE TABLE IF NOT EXISTS vet_auto_previsoes (
      id TEXT PRIMARY KEY,
      fazenda_id TEXT,
      curral_rfid_id TEXT,
      trato_id TEXT,
      receita_id TEXT,
      data TEXT,
      previsto_kg REAL,
      quantidade_cab INTEGER,
      realizado_kg REAL DEFAULT 0,
      created_at TEXT,
      updated_at TEXT
    );
  `);

  await database.execAsync(`
    CREATE TABLE IF NOT EXISTS vet_auto_misturadores (
      id TEXT PRIMARY KEY,
      fazenda_id TEXT,
      nome TEXT,
      numero INTEGER,
      capacidade_kg REAL,
      ativo INTEGER DEFAULT 1,
      created_at TEXT,
      updated_at TEXT
    );
  `);

  await database.execAsync(`
    CREATE TABLE IF NOT EXISTS vet_auto_usuarios (
      id TEXT PRIMARY KEY,
      fazenda_id TEXT,
      nome TEXT,
      email TEXT,
      cargo TEXT,
      ativo INTEGER DEFAULT 1,
      created_at TEXT,
      updated_at TEXT
    );
  `);

  await database.execAsync(`
    CREATE TABLE IF NOT EXISTS vet_auto_configuracoes (
      id TEXT PRIMARY KEY,
      fazenda_id TEXT,
      chave TEXT,
      valor TEXT,
      descricao TEXT,
      created_at TEXT,
      updated_at TEXT
    );
  `);

  await database.execAsync(`
    CREATE TABLE IF NOT EXISTS vet_auto_dispositivos (
      id TEXT PRIMARY KEY,
      fazenda_id TEXT,
      nome TEXT,
      tipo TEXT,
      mac_address TEXT,
      ip_address TEXT,
      porta INTEGER,
      ativo INTEGER DEFAULT 1,
      flag_sync INTEGER DEFAULT 0,
      created_at TEXT,
      updated_at TEXT
    );
  `);

  // ---- Sync metadata ----

  await database.execAsync(`
    CREATE TABLE IF NOT EXISTS _sync_meta (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      table_name TEXT NOT NULL,
      last_sync_at TEXT,
      direction TEXT,
      records_synced INTEGER DEFAULT 0
    );
  `);

  console.log('[OfflineService] Database initialized successfully');
}

// ============================================
// Generic CRUD Operations
// ============================================

/**
 * Save a record to local SQLite.
 * If the record already exists (by id), it is replaced (upsert).
 */
export async function saveLocal(
  table: string,
  data: Record<string, unknown>
): Promise<void> {
  const database = await getDb();

  const keys = Object.keys(data);
  const placeholders = keys.map(() => '?').join(', ');
  const values = keys.map((k) => {
    const v = data[k];
    if (v === null || v === undefined) return null;
    if (typeof v === 'boolean') return v ? 1 : 0;
    if (typeof v === 'object') return JSON.stringify(v);
    return v;
  });

  const sql = `INSERT OR REPLACE INTO ${table} (${keys.join(', ')}) VALUES (${placeholders})`;
  await database.runAsync(sql, values);
}

/**
 * Read records from local SQLite with optional filters.
 */
export async function getLocal(
  table: string,
  filters?: Record<string, unknown>
): Promise<Record<string, unknown>[]> {
  const database = await getDb();

  let sql = `SELECT * FROM ${table}`;
  const values: unknown[] = [];

  if (filters && Object.keys(filters).length > 0) {
    const conditions = Object.entries(filters).map(([key, val]) => {
      values.push(val);
      return `${key} = ?`;
    });
    sql += ` WHERE ${conditions.join(' AND ')}`;
  }

  const rows = await database.getAllAsync(sql, values);
  return rows as Record<string, unknown>[];
}

/**
 * Update a record in local SQLite by id.
 */
export async function updateLocal(
  table: string,
  id: string,
  data: Record<string, unknown>
): Promise<void> {
  const database = await getDb();

  const entries = Object.entries(data).filter(([k]) => k !== 'id');
  if (entries.length === 0) return;

  const setClauses = entries.map(([k]) => `${k} = ?`).join(', ');
  const values = entries.map(([, v]) => {
    if (v === null || v === undefined) return null;
    if (typeof v === 'boolean') return v ? 1 : 0;
    if (typeof v === 'object') return JSON.stringify(v);
    return v;
  });
  values.push(id);

  const sql = `UPDATE ${table} SET ${setClauses} WHERE id = ?`;
  await database.runAsync(sql, values);
}

/**
 * Delete a record from local SQLite by id.
 */
export async function deleteLocal(table: string, id: string): Promise<void> {
  const database = await getDb();
  await database.runAsync(`DELETE FROM ${table} WHERE id = ?`, [id]);
}

/**
 * Get all records that have not been synced yet (flag_sync = 0).
 */
export async function getPendingSync(
  table: string
): Promise<Record<string, unknown>[]> {
  const database = await getDb();
  const rows = await database.getAllAsync(
    `SELECT * FROM ${table} WHERE flag_sync = 0`
  );
  return rows as Record<string, unknown>[];
}

/**
 * Mark records as synced (flag_sync = 1) after successful upload.
 */
export async function markSynced(
  table: string,
  ids: string[]
): Promise<void> {
  if (ids.length === 0) return;
  const database = await getDb();
  const placeholders = ids.map(() => '?').join(', ');
  await database.runAsync(
    `UPDATE ${table} SET flag_sync = 1 WHERE id IN (${placeholders})`,
    ids
  );
}

/**
 * Count all pending (unsynced) records across all operational tables.
 */
export async function getTotalPendingCount(): Promise<number> {
  const database = await getDb();

  const operationalTables = [
    'vet_auto_fabricacoes',
    'vet_auto_fabricacao_ingredientes',
    'vet_auto_carregamentos',
    'vet_auto_carregamento_detalhes',
    'vet_auto_fornecimentos',
    'vet_auto_descartes',
    'vet_auto_safe_point_leituras',
    'vet_auto_ocorrencia_paradas',
    'vet_auto_ocorrencia_paradas_itens',
    'vet_auto_log_atividades',
  ];

  let total = 0;
  for (const table of operationalTables) {
    try {
      const result = await database.getFirstAsync<{ cnt: number }>(
        `SELECT COUNT(*) as cnt FROM ${table} WHERE flag_sync = 0`
      );
      total += result?.cnt ?? 0;
    } catch {
      // Table may not have flag_sync column; skip
    }
  }
  return total;
}

// ============================================
// Internet Connectivity Check
// ============================================

/**
 * Simple connectivity check. Returns true if online.
 * Used as fallback when NetInfo is not available.
 */
export async function isOnline(): Promise<boolean> {
  try {
    const controller = new AbortController();
    const timeoutId = setTimeout(() => controller.abort(), 5000);
    const response = await fetch('https://www.google.com/generate_204', {
      method: 'HEAD',
      signal: controller.signal,
    });
    clearTimeout(timeoutId);
    return response.ok;
  } catch {
    return false;
  }
}

// ============================================
// Sync TO Supabase (upload pending records)
// ============================================

/** Tables that produce data locally and need upload sync */
const UPLOAD_TABLES = [
  'vet_auto_fabricacoes',
  'vet_auto_fabricacao_ingredientes',
  'vet_auto_carregamentos',
  'vet_auto_carregamento_detalhes',
  'vet_auto_fornecimentos',
  'vet_auto_descartes',
  'vet_auto_safe_points',
  'vet_auto_safe_point_leituras',
  'vet_auto_ocorrencia_paradas',
  'vet_auto_ocorrencia_paradas_itens',
  'vet_auto_log_atividades',
] as const;

/**
 * Upload all pending local records to Supabase.
 * Like CR1: reads flag_sync=0, upserts to server, marks flag_sync=1 on success.
 */
export async function syncToSupabase(): Promise<{
  totalSynced: number;
  totalErrors: number;
  details: { table: string; synced: number; errors: number }[];
}> {
  const details: { table: string; synced: number; errors: number }[] = [];
  let totalSynced = 0;
  let totalErrors = 0;

  for (const table of UPLOAD_TABLES) {
    let synced = 0;
    let errors = 0;

    try {
      const pending = await getPendingSync(table);
      if (pending.length === 0) {
        details.push({ table, synced: 0, errors: 0 });
        continue;
      }

      // Upsert in batches of 50
      const batchSize = 50;
      for (let i = 0; i < pending.length; i += batchSize) {
        const batch = pending.slice(i, i + batchSize);

        // Clean up local-only fields before sending
        const cleanBatch = batch.map((row) => {
          const clean = { ...row };
          delete clean.flag_sync;
          // Convert SQLite integers back to booleans where needed
          if ('flag_rateio' in clean) clean.flag_rateio = !!clean.flag_rateio;
          if ('entrada_manual' in clean) clean.entrada_manual = !!clean.entrada_manual;
          if ('flag_automation' in clean) clean.flag_automation = !!clean.flag_automation;
          if ('automatizado' in clean) clean.automatizado = !!clean.automatizado;
          if ('ativo' in clean) clean.ativo = !!clean.ativo;
          // Parse JSON strings back to objects
          if ('detalhes' in clean && typeof clean.detalhes === 'string') {
            try {
              clean.detalhes = JSON.parse(clean.detalhes as string);
            } catch {
              // keep as string
            }
          }
          return clean;
        });

        const { error } = await supabase
          .from(table)
          .upsert(cleanBatch as any[], { onConflict: 'id' });

        if (error) {
          console.error(`[OfflineService] Sync error for ${table}:`, error.message);
          errors += batch.length;
        } else {
          const ids = batch.map((r) => r.id as string);
          await markSynced(table, ids);
          synced += batch.length;
        }
      }
    } catch (err) {
      console.error(`[OfflineService] Sync exception for ${table}:`, err);
      errors += 1;
    }

    totalSynced += synced;
    totalErrors += errors;
    details.push({ table, synced, errors });
  }

  // Update sync metadata
  const database = await getDb();
  await database.runAsync(
    `INSERT OR REPLACE INTO _sync_meta (id, table_name, last_sync_at, direction, records_synced)
     VALUES (1, 'all_upload', ?, 'upload', ?)`,
    [new Date().toISOString(), totalSynced]
  );

  console.log(`[OfflineService] Upload sync complete: ${totalSynced} synced, ${totalErrors} errors`);
  return { totalSynced, totalErrors, details };
}

// ============================================
// Sync FROM Supabase (download master data)
// ============================================

/** Master data tables that are downloaded from server */
const DOWNLOAD_TABLES = [
  'vet_auto_receitas',
  'vet_auto_receita_ingredientes',
  'vet_auto_ingredientes',
  'vet_auto_currais',
  'vet_auto_currais_rfid',
  'vet_auto_tratos',
  'vet_auto_previstos',
  'vet_auto_previsoes',
  'vet_auto_misturadores',
  'vet_auto_usuarios',
  'vet_auto_configuracoes',
  'vet_auto_dispositivos',
] as const;

/**
 * Download master data from Supabase and store locally.
 * Replaces local data with server data for each master table.
 */
export async function syncFromSupabase(
  fazenda_id?: string
): Promise<{
  totalDownloaded: number;
  totalErrors: number;
  details: { table: string; downloaded: number; error: string | null }[];
}> {
  const details: { table: string; downloaded: number; error: string | null }[] = [];
  let totalDownloaded = 0;
  let totalErrors = 0;

  for (const table of DOWNLOAD_TABLES) {
    try {
      let query = supabase.from(table).select('*');

      // Filter by fazenda_id if provided and column exists in the table
      if (fazenda_id) {
        query = query.eq('fazenda_id', fazenda_id);
      }

      const { data, error } = await query;

      if (error) {
        console.error(`[OfflineService] Download error for ${table}:`, error.message);
        details.push({ table, downloaded: 0, error: error.message });
        totalErrors += 1;
        continue;
      }

      if (!data || data.length === 0) {
        details.push({ table, downloaded: 0, error: null });
        continue;
      }

      const database = await getDb();

      // Clear existing master data for this fazenda and table
      if (fazenda_id) {
        await database.runAsync(`DELETE FROM ${table} WHERE fazenda_id = ?`, [fazenda_id]);
      } else {
        await database.runAsync(`DELETE FROM ${table}`);
      }

      // Insert downloaded records
      for (const row of data) {
        await saveLocal(table, row);
      }

      details.push({ table, downloaded: data.length, error: null });
      totalDownloaded += data.length;
    } catch (err) {
      const msg = err instanceof Error ? err.message : 'Unknown error';
      console.error(`[OfflineService] Download exception for ${table}:`, msg);
      details.push({ table, downloaded: 0, error: msg });
      totalErrors += 1;
    }
  }

  // Update sync metadata
  const database = await getDb();
  await database.runAsync(
    `INSERT OR REPLACE INTO _sync_meta (id, table_name, last_sync_at, direction, records_synced)
     VALUES (2, 'all_download', ?, 'download', ?)`,
    [new Date().toISOString(), totalDownloaded]
  );

  console.log(`[OfflineService] Download sync complete: ${totalDownloaded} downloaded, ${totalErrors} errors`);
  return { totalDownloaded, totalErrors, details };
}

// ============================================
// Utility Functions
// ============================================

/**
 * Get the last sync timestamp for a given direction.
 */
export async function getLastSyncTime(
  direction: 'upload' | 'download'
): Promise<string | null> {
  const database = await getDb();
  const idVal = direction === 'upload' ? 1 : 2;
  const result = await database.getFirstAsync<{ last_sync_at: string | null }>(
    `SELECT last_sync_at FROM _sync_meta WHERE id = ?`,
    [idVal]
  );
  return result?.last_sync_at ?? null;
}

/**
 * Execute a raw SQL query on the local database.
 * Use sparingly - prefer the typed helpers above.
 */
export async function rawQuery(
  sql: string,
  params?: unknown[]
): Promise<Record<string, unknown>[]> {
  const database = await getDb();
  const rows = await database.getAllAsync(sql, params ?? []);
  return rows as Record<string, unknown>[];
}

/**
 * Clear all local data (for logout / factory reset).
 */
export async function clearAllData(): Promise<void> {
  const database = await getDb();

  const allTables = [
    ...UPLOAD_TABLES,
    ...DOWNLOAD_TABLES,
    '_sync_meta',
  ];

  for (const table of allTables) {
    try {
      await database.runAsync(`DELETE FROM ${table}`);
    } catch {
      // Table may not exist yet
    }
  }

  console.log('[OfflineService] All local data cleared');
}

/**
 * Generate a UUID v4 for new local records.
 */
export function generateId(): string {
  return 'xxxxxxxx-xxxx-4xxx-yxxx-xxxxxxxxxxxx'.replace(/[xy]/g, (c) => {
    const r = (Math.random() * 16) | 0;
    const v = c === 'x' ? r : (r & 0x3) | 0x8;
    return v.toString(16);
  });
}
