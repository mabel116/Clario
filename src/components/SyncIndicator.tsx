'use client';

import React, { useEffect, useState } from 'react';
import { useSyncStatus } from '../lib/sync/hooks';
import { RefreshCw } from 'lucide-react';

export function SyncIndicator() {
  const { connected, lastSyncedAt, pendingUploads } = useSyncStatus();
  const [timeText, setTimeText] = useState('Never');

  useEffect(() => {
    if (!lastSyncedAt) {
      setTimeText('Never');
      return;
    }

    const updateTime = () => {
      const diffMs = Date.now() - lastSyncedAt.getTime();
      const diffSec = Math.floor(diffMs / 1000);
      if (diffSec < 5) {
        setTimeText('Just now');
      } else if (diffSec < 60) {
        setTimeText(`${diffSec}s ago`);
      } else {
        const diffMin = Math.floor(diffSec / 60);
        setTimeText(`${diffMin}m ago`);
      }
    };

    updateTime();
    const interval = setInterval(updateTime, 5000);
    return () => clearInterval(interval);
  }, [lastSyncedAt]);

  return (
    <div className="fixed bottom-4 right-4 z-50 flex items-center gap-3 rounded-full bg-slate-900/90 border border-slate-800/80 px-4 py-2 text-xs font-medium text-slate-300 shadow-xl backdrop-blur-md transition-all duration-300 hover:border-slate-700 hover:bg-slate-900">
      {/* Network Connectivity Status */}
      <div className="flex items-center gap-1.5">
        <span className="relative flex h-2 w-2">
          {connected ? (
            <>
              <span className="animate-ping absolute inline-flex h-full w-full rounded-full bg-emerald-400 opacity-75"></span>
              <span className="relative inline-flex rounded-full h-2 w-2 bg-emerald-500"></span>
            </>
          ) : (
            <>
              <span className="animate-ping absolute inline-flex h-full w-full rounded-full bg-amber-400 opacity-75"></span>
              <span className="relative inline-flex rounded-full h-2 w-2 bg-amber-500"></span>
            </>
          )}
        </span>
        <span className="text-slate-400 font-semibold uppercase tracking-wider text-[10px]">
          {connected ? 'Sync Connected' : 'Sync Offline'}
        </span>
      </div>

      <div className="h-3 w-px bg-slate-800"></div>

      {/* Last Synced details */}
      <div className="flex items-center gap-1">
        <span className="text-slate-500">Last:</span>
        <span className="text-slate-300 tabular-nums">{timeText}</span>
      </div>

      {/* Pending uploads queue */}
      {pendingUploads > 0 && (
        <>
          <div className="h-3 w-px bg-slate-800"></div>
          <div className="flex items-center gap-1.5 text-amber-400 animate-pulse">
            <RefreshCw className="h-3 w-3 animate-spin duration-[3000ms]" />
            <span className="font-semibold">{pendingUploads} queued</span>
          </div>
        </>
      )}
    </div>
  );
}
