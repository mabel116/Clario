import { useEffect, useState } from 'react';
import { db } from './db';

export interface SyncStatus {
  connected: boolean;
  connecting: boolean;
  lastSyncedAt: Date | null;
  hasSynced: boolean;
  pendingUploads: number;
}

// React Hook exposing connection status, sync times, and pending queue size
export function useSyncStatus(): SyncStatus {
  const [status, setStatus] = useState<SyncStatus>({
    connected: false,
    connecting: false,
    lastSyncedAt: null,
    hasSynced: false,
    pendingUploads: 0
  });

  useEffect(() => {
    if (!db) return;

    let active = true;

    const updateStatus = async () => {
      if (!active) return;
      try {
        const stats = await db.getUploadQueueStats();
        setStatus({
          connected: db.currentStatus?.connected ?? false,
          connecting: db.currentStatus?.connecting ?? false,
          lastSyncedAt: db.currentStatus?.lastSyncedAt ?? null,
          hasSynced: db.currentStatus?.hasSynced ?? false,
          pendingUploads: stats.count
        });
      } catch (err) {
        console.error('Failed to retrieve sync status:', err);
      }
    };

    // Initial fetch
    updateStatus();

    // Register status change listener
    const listener = {
      statusChanged: () => {
        updateStatus();
      }
    };
    
    const unsubscribe = db.registerListener(listener);

    // Periodic check to capture write mutations in local SQLite
    const interval = setInterval(updateStatus, 1000);

    return () => {
      active = false;
      unsubscribe();
      clearInterval(interval);
    };
  }, []);

  return status;
}
