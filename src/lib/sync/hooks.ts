import { useSyncExternalStore } from 'react';
import { db } from './db';

export interface SyncStatus {
  connected: boolean;
  connecting: boolean;
  lastSyncedAt: Date | null;
  hasSynced: boolean;
  pendingUploads: number;
}

let currentStatus: SyncStatus = {
  connected: false,
  connecting: false,
  lastSyncedAt: null,
  hasSynced: false,
  pendingUploads: 0
};

const listeners = new Set<() => void>();
let pollingInterval: NodeJS.Timeout | null = null;
let listenerUnsubscribe: (() => void) | null = null;
let isUpdating = false;

async function updateSyncStatus() {
  if (!db || isUpdating) return;
  isUpdating = true;
  try {
    const stats = await db.getUploadQueueStats();
    const newStatus: SyncStatus = {
      connected: db.currentStatus?.connected ?? false,
      connecting: db.currentStatus?.connecting ?? false,
      lastSyncedAt: db.currentStatus?.lastSyncedAt ?? null,
      hasSynced: db.currentStatus?.hasSynced ?? false,
      pendingUploads: stats.count
    };

    const hasChanged =
      currentStatus.connected !== newStatus.connected ||
      currentStatus.connecting !== newStatus.connecting ||
      currentStatus.hasSynced !== newStatus.hasSynced ||
      currentStatus.pendingUploads !== newStatus.pendingUploads ||
      currentStatus.lastSyncedAt?.getTime() !== newStatus.lastSyncedAt?.getTime();

    if (hasChanged) {
      currentStatus = newStatus;
      for (const listener of Array.from(listeners)) {
        listener();
      }
    }
  } catch {
    // Non-blocking
  } finally {
    isUpdating = false;
  }
}

function subscribe(callback: () => void) {
  listeners.add(callback);
  if (listeners.size === 1 && typeof window !== 'undefined' && db) {
    updateSyncStatus();
    const listener = {
      statusChanged: () => {
        updateSyncStatus();
      }
    };
    listenerUnsubscribe = db.registerListener(listener);
    pollingInterval = setInterval(updateSyncStatus, 2000);
  }

  return () => {
    listeners.delete(callback);
    if (listeners.size === 0) {
      if (listenerUnsubscribe) {
        listenerUnsubscribe();
        listenerUnsubscribe = null;
      }
      if (pollingInterval) {
        clearInterval(pollingInterval);
        pollingInterval = null;
      }
    }
  };
}

function getSnapshot(): SyncStatus {
  return currentStatus;
}

function getServerSnapshot(): SyncStatus {
  return currentStatus;
}

// React Hook exposing connection status, sync times, and pending queue size via a shared singleton
export function useSyncStatus(): SyncStatus {
  return useSyncExternalStore(subscribe, getSnapshot, getServerSnapshot);
}

