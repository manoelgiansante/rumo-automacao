import { supabase } from '@/lib/supabase';
import { connectivityService } from './connectivityService';
import * as offlineService from './offlineService';

// ============================================
// DataService - Offline-first data layer
// Like CR1: always save locally, sync when online
// ============================================

/**
 * Tables that are "operational" (created locally, synced to server).
 * These use the full offline-first flow: save local -> sync to Supabase.
 */
const OPERATIONAL_TABLES = new Set([
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
]);

/**
 * Tables that are "master data" (downloaded from server, read-only locally).
 * These are only read from local SQLite, never written directly by the app.
 */
const MASTER_TABLES = new Set([
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
]);

class DataService {
  /**
   * Save a record. Offline-first approach:
   * 1. Always save to local SQLite first
   * 2. If online, also save to Supabase immediately
   * 3. If Supabase save fails, record stays as flag_sync=0 for later sync
   */
  async save(table: string, data: Record<string, unknown>): Promise<Record<string, unknown>> {
    // Ensure record has an id
    if (!data.id) {
      data.id = offlineService.generateId();
    }

    // Ensure timestamps
    const now = new Date().toISOString();
    if (!data.created_at) {
      data.created_at = now;
    }
    data.updated_at = now;

    // 1. Save locally with flag_sync = 0 (pending)
    await offlineService.saveLocal(table, { ...data, flag_sync: 0 });

    // 2. If online, try to save to Supabase immediately
    if (connectivityService.getStatus()) {
      try {
        const cleanData = this.cleanForSupabase(data);
        const { error } = await supabase
          .from(table)
          .upsert(cleanData as any, { onConflict: 'id' });

        if (!error) {
          // Mark as synced locally
          await offlineService.markSynced(table, [data.id as string]);
        } else {
          console.warn(`[DataService] Supabase save error for ${table}:`, error.message);
          // Record stays as flag_sync=0, will be synced later
        }
      } catch (err) {
        console.warn(`[DataService] Supabase save exception for ${table}:`, err);
        // Record stays as flag_sync=0, will be synced later
      }
    }

    return data;
  }

  /**
   * Save multiple records in batch.
   */
  async saveBatch(
    table: string,
    records: Record<string, unknown>[]
  ): Promise<Record<string, unknown>[]> {
    const now = new Date().toISOString();
    const prepared = records.map((r) => ({
      ...r,
      id: r.id || offlineService.generateId(),
      created_at: r.created_at || now,
      updated_at: now,
    }));

    // Save all locally
    for (const record of prepared) {
      await offlineService.saveLocal(table, { ...record, flag_sync: 0 });
    }

    // If online, try batch upsert to Supabase
    if (connectivityService.getStatus()) {
      try {
        const cleanBatch = prepared.map((r) => this.cleanForSupabase(r));
        const { error } = await supabase
          .from(table)
          .upsert(cleanBatch as any[], { onConflict: 'id' });

        if (!error) {
          const ids = prepared.map((r) => r.id as string);
          await offlineService.markSynced(table, ids);
        }
      } catch {
        // Records stay as flag_sync=0
      }
    }

    return prepared;
  }

  /**
   * Query records. Prefers fresh data from Supabase when online,
   * falls back to local SQLite when offline.
   * For master data tables, always reads from local cache first.
   */
  async query(
    table: string,
    filters?: Record<string, unknown>,
    options?: {
      orderBy?: string;
      ascending?: boolean;
      limit?: number;
      select?: string;
      forceLocal?: boolean;
    }
  ): Promise<Record<string, unknown>[]> {
    const isOnline = connectivityService.getStatus();
    const isMaster = MASTER_TABLES.has(table);
    const forceLocal = options?.forceLocal ?? false;

    // If online and not forcing local, try Supabase for fresh data
    if (isOnline && !forceLocal) {
      try {
        let query = supabase.from(table).select(options?.select ?? '*');

        // Apply filters
        if (filters) {
          for (const [key, value] of Object.entries(filters)) {
            query = query.eq(key, value);
          }
        }

        // Apply ordering
        if (options?.orderBy) {
          query = query.order(options.orderBy, {
            ascending: options.ascending ?? true,
          });
        }

        // Apply limit
        if (options?.limit) {
          query = query.limit(options.limit);
        }

        const { data, error } = await query;

        if (!error && data) {
          // Cache results locally (for offline access)
          if (isMaster || OPERATIONAL_TABLES.has(table)) {
            for (const row of data) {
              const localRow = { ...row, flag_sync: 1 };
              await offlineService.saveLocal(table, localRow);
            }
          }
          return data as Record<string, unknown>[];
        }

        // If Supabase query fails, fall through to local
        console.warn(`[DataService] Supabase query failed for ${table}:`, error?.message);
      } catch (err) {
        console.warn(`[DataService] Supabase query exception for ${table}:`, err);
        // Fall through to local
      }
    }

    // Offline or Supabase failed: read from local SQLite
    return offlineService.getLocal(table, filters);
  }

  /**
   * Get a single record by id.
   */
  async getById(
    table: string,
    id: string
  ): Promise<Record<string, unknown> | null> {
    const results = await this.query(table, { id });
    return results.length > 0 ? results[0] : null;
  }

  /**
   * Update a record. Offline-first: update locally, then sync.
   */
  async update(
    table: string,
    id: string,
    updates: Record<string, unknown>
  ): Promise<void> {
    const now = new Date().toISOString();
    const data = { ...updates, updated_at: now };

    // 1. Update locally and mark as pending sync
    await offlineService.updateLocal(table, id, { ...data, flag_sync: 0 });

    // 2. If online, update Supabase immediately
    if (connectivityService.getStatus()) {
      try {
        const cleanData = this.cleanForSupabase(data);
        const { error } = await supabase
          .from(table)
          .update(cleanData as any)
          .eq('id', id);

        if (!error) {
          await offlineService.markSynced(table, [id]);
        }
      } catch {
        // Will sync later
      }
    }
  }

  /**
   * Delete a record. Marks locally and deletes from Supabase if online.
   */
  async delete(table: string, id: string): Promise<void> {
    // Delete locally
    await offlineService.deleteLocal(table, id);

    // If online, delete from Supabase
    if (connectivityService.getStatus()) {
      try {
        await supabase.from(table).delete().eq('id', id);
      } catch {
        // If deletion fails on server, it is acceptable since
        // the record no longer exists locally
      }
    }
  }

  // ---- Private Helpers ----

  /**
   * Remove local-only fields before sending to Supabase.
   */
  private cleanForSupabase(data: Record<string, unknown>): Record<string, unknown> {
    const clean = { ...data };
    delete clean.flag_sync;
    return clean;
  }
}

export const dataService = new DataService();
