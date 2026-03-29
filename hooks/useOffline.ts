import { useState, useEffect, useCallback, useRef } from 'react';
import { connectivityService } from '@/services/connectivityService';
import * as offlineService from '@/services/offlineService';

// ============================================
// useOffline Hook
// Provides offline status, pending count, and sync controls
// ============================================

export interface UseOfflineResult {
  /** Whether the device is currently online */
  isOnline: boolean;
  /** Number of records pending sync to server */
  pendingCount: number;
  /** Timestamp of last successful sync */
  lastSync: Date | null;
  /** Whether a sync is currently in progress */
  syncing: boolean;
  /** Force a manual sync (upload + download) */
  forceSync: (fazenda_id?: string) => Promise<void>;
  /** Last sync upload timestamp */
  lastUpload: Date | null;
  /** Last sync download timestamp */
  lastDownload: Date | null;
}

export function useOffline(): UseOfflineResult {
  const [isOnline, setIsOnline] = useState<boolean>(connectivityService.getStatus());
  const [pendingCount, setPendingCount] = useState<number>(0);
  const [lastSync, setLastSync] = useState<Date | null>(null);
  const [lastUpload, setLastUpload] = useState<Date | null>(null);
  const [lastDownload, setLastDownload] = useState<Date | null>(null);
  const [syncing, setSyncing] = useState<boolean>(false);
  const pollTimer = useRef<ReturnType<typeof setInterval> | null>(null);

  // Subscribe to connectivity changes
  useEffect(() => {
    const listener = (online: boolean) => {
      setIsOnline(online);
    };
    connectivityService.addListener(listener);

    return () => {
      connectivityService.removeListener(listener);
    };
  }, []);

  // Poll pending count every 10 seconds
  useEffect(() => {
    const updatePendingCount = async () => {
      try {
        const count = await offlineService.getTotalPendingCount();
        setPendingCount(count);
      } catch {
        // silently fail
      }
    };

    // Initial count
    updatePendingCount();

    pollTimer.current = setInterval(updatePendingCount, 10_000);

    return () => {
      if (pollTimer.current) {
        clearInterval(pollTimer.current);
      }
    };
  }, []);

  // Load last sync times on mount
  useEffect(() => {
    const loadSyncTimes = async () => {
      try {
        const uploadTime = await offlineService.getLastSyncTime('upload');
        const downloadTime = await offlineService.getLastSyncTime('download');

        if (uploadTime) {
          const d = new Date(uploadTime);
          setLastUpload(d);
          setLastSync(d);
        }
        if (downloadTime) {
          const d = new Date(downloadTime);
          setLastDownload(d);
          if (!lastSync || d > lastSync) {
            setLastSync(d);
          }
        }
      } catch {
        // silently fail
      }
    };

    loadSyncTimes();
  }, []);

  // Force sync function
  const forceSync = useCallback(async (fazenda_id?: string) => {
    if (syncing) return;
    setSyncing(true);

    try {
      const result = await connectivityService.triggerSync(fazenda_id);

      if (result) {
        const now = new Date();
        setLastSync(now);

        if (result.upload.totalSynced > 0) {
          setLastUpload(now);
        }
        if (result.download.totalDownloaded > 0) {
          setLastDownload(now);
        }
      }

      // Refresh pending count
      const count = await offlineService.getTotalPendingCount();
      setPendingCount(count);
    } catch (err) {
      console.error('[useOffline] Force sync error:', err);
    } finally {
      setSyncing(false);
    }
  }, [syncing]);

  return {
    isOnline,
    pendingCount,
    lastSync,
    syncing,
    forceSync,
    lastUpload,
    lastDownload,
  };
}
