import NetInfo, { NetInfoState } from '@react-native-community/netinfo';
import * as offlineService from './offlineService';

// ============================================
// Connectivity Service
// Monitors internet status and triggers sync
// Like CR1: works offline, syncs when online
// ============================================

type ConnectivityListener = (online: boolean) => void;

class ConnectivityService {
  private _isConnected: boolean = false;
  private listeners: ConnectivityListener[] = [];
  private syncInProgress: boolean = false;
  private unsubscribe: (() => void) | null = null;
  private syncRetryTimer: ReturnType<typeof setTimeout> | null = null;

  /** Interval for periodic sync when online (5 minutes) */
  private readonly SYNC_INTERVAL_MS = 5 * 60 * 1000;
  private periodicSyncTimer: ReturnType<typeof setInterval> | null = null;

  /**
   * Start monitoring connectivity.
   * Call once at app startup after initDatabase().
   */
  start(): void {
    this.unsubscribe = NetInfo.addEventListener((state: NetInfoState) => {
      const wasOffline = !this._isConnected;
      this._isConnected = state.isConnected ?? false;

      console.log(
        `[ConnectivityService] Network status: ${this._isConnected ? 'ONLINE' : 'OFFLINE'}`
      );

      // Notify all listeners
      this.notifyListeners();

      // If we just came online, trigger sync immediately
      if (wasOffline && this._isConnected) {
        console.log('[ConnectivityService] Back online - triggering sync');
        this.triggerSync();
      }
    });

    // Start periodic sync for when we stay online
    this.startPeriodicSync();
  }

  /**
   * Stop monitoring connectivity.
   * Call on app shutdown / logout.
   */
  stop(): void {
    if (this.unsubscribe) {
      this.unsubscribe();
      this.unsubscribe = null;
    }
    if (this.syncRetryTimer) {
      clearTimeout(this.syncRetryTimer);
      this.syncRetryTimer = null;
    }
    if (this.periodicSyncTimer) {
      clearInterval(this.periodicSyncTimer);
      this.periodicSyncTimer = null;
    }
  }

  /**
   * Trigger a full bidirectional sync.
   * Upload pending local records, then download master data.
   */
  async triggerSync(fazenda_id?: string): Promise<{
    upload: Awaited<ReturnType<typeof offlineService.syncToSupabase>>;
    download: Awaited<ReturnType<typeof offlineService.syncFromSupabase>>;
  } | null> {
    if (this.syncInProgress) {
      console.log('[ConnectivityService] Sync already in progress, skipping');
      return null;
    }

    if (!this._isConnected) {
      console.log('[ConnectivityService] Offline, cannot sync');
      return null;
    }

    this.syncInProgress = true;

    try {
      console.log('[ConnectivityService] Starting sync...');

      // 1. Upload pending local data to Supabase
      const uploadResult = await offlineService.syncToSupabase();

      // 2. Download master data from Supabase
      const downloadResult = await offlineService.syncFromSupabase(fazenda_id);

      console.log(
        `[ConnectivityService] Sync complete. Uploaded: ${uploadResult.totalSynced}, Downloaded: ${downloadResult.totalDownloaded}`
      );

      return { upload: uploadResult, download: downloadResult };
    } catch (err) {
      console.error('[ConnectivityService] Sync failed:', err);

      // Retry after 30 seconds on failure
      if (this._isConnected) {
        this.syncRetryTimer = setTimeout(() => {
          this.triggerSync(fazenda_id);
        }, 30_000);
      }

      return null;
    } finally {
      this.syncInProgress = false;
    }
  }

  /**
   * Get current connectivity status.
   */
  getStatus(): boolean {
    return this._isConnected;
  }

  /**
   * Check if a sync is currently running.
   */
  isSyncing(): boolean {
    return this.syncInProgress;
  }

  /**
   * Add a listener for connectivity changes.
   */
  addListener(fn: ConnectivityListener): void {
    this.listeners.push(fn);
  }

  /**
   * Remove a previously added listener.
   */
  removeListener(fn: ConnectivityListener): void {
    this.listeners = this.listeners.filter((l) => l !== fn);
  }

  /**
   * Perform an immediate connectivity check (not cached).
   */
  async checkNow(): Promise<boolean> {
    try {
      const state = await NetInfo.fetch();
      this._isConnected = state.isConnected ?? false;
      this.notifyListeners();
      return this._isConnected;
    } catch {
      return this._isConnected;
    }
  }

  // ---- Private Helpers ----

  private notifyListeners(): void {
    for (const listener of this.listeners) {
      try {
        listener(this._isConnected);
      } catch (err) {
        console.error('[ConnectivityService] Listener error:', err);
      }
    }
  }

  private startPeriodicSync(): void {
    this.periodicSyncTimer = setInterval(() => {
      if (this._isConnected && !this.syncInProgress) {
        this.triggerSync();
      }
    }, this.SYNC_INTERVAL_MS);
  }
}

export const connectivityService = new ConnectivityService();
