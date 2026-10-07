'use client';

import React, { useEffect, useState } from 'react';
import { useSyncStatus } from '../lib/sync/hooks';
import { RefreshCw } from 'lucide-react';
import { cn } from '../lib/utils';

export function SyncIndicator({ className }: { className?: string } = {}) {
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
    <div
      className={cn(
        'flex items-center gap-2.5 rounded-full border px-3 py-1.5 text-xs font-medium transition-all duration-300',
        className
          ? className
          : 'fixed bottom-4 right-4 z-50 bg-slate-900/90 border-slate-800/80 text-slate-300 shadow-xl backdrop-blur-md hover:border-slate-700 hover:bg-slate-900'
      )}
    >
      {/* Network Connectivity Status */}
      <div className="flex items-center gap-1.5 shrink-0">
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
        <span className="text-[10px] font-semibold uppercase tracking-wider text-gray-500 dark:text-zinc-400">
          {connected ? 'Connected' : 'Offline'}
        </span>
      </div>

      <div className="h-3 w-px bg-gray-200 dark:bg-[#27272a] shrink-0"></div>

      {/* Last Synced details */}
      <div className="flex items-center gap-1 text-[11px] truncate">
        <span className="text-gray-400 dark:text-zinc-500">Sync:</span>
        <span className="text-gray-700 dark:text-zinc-300 tabular-nums">{timeText}</span>
      </div>

      {/* Pending uploads queue */}
      {pendingUploads > 0 && (
        <>
          <div className="h-3 w-px bg-gray-200 dark:bg-[#27272a] shrink-0"></div>
          <div className="flex items-center gap-1 text-[11px] text-amber-500 dark:text-amber-400 animate-pulse shrink-0">
            <RefreshCw className="h-3 w-3 animate-spin duration-[3000ms]" />
            <span className="font-semibold">{pendingUploads} queued</span>
          </div>
        </>
      )}
    </div>
  );
}
