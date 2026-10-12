'use client';

import React, { useEffect, useState } from 'react';
import { useSyncStatus } from '../lib/sync/hooks';
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
    <div className={cn('flex items-center gap-2 text-left', className)}>
      <span
        className={cn(
          'h-2 w-2 rounded-full shrink-0',
          connected ? 'bg-emerald-500' : 'bg-amber-500'
        )}
      />
      <div className="flex flex-col">
        <div className="flex items-center gap-1.5">
          <span className="text-xs font-medium text-gray-700 dark:text-zinc-300">
            {connected ? 'Connected' : 'Offline'}
          </span>
          {pendingUploads > 0 && (
            <span className="text-[11px] text-amber-500 dark:text-amber-400 font-medium">
              ({pendingUploads} queued)
            </span>
          )}
        </div>
        <span className="text-[11px] text-gray-400 dark:text-zinc-500">
          Last synced {timeText}
        </span>
      </div>
    </div>
  );
}

