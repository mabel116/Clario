'use client';

import { useState, useRef, useEffect } from 'react';
import { useAuth } from '../auth/provider';
import { useSyncStatus } from '../sync/hooks';

/**
 * Shared deterministic readiness gate for Clario views.
 * Conforms to ADR 036.
 *
 * @param hasLocalData Boolean indicating if the calling screen already has active live records in React state (e.g. `clients.length > 0` or `isCached`)
 * @param checkEmpty Async callback performing a deterministic one-shot direct read against local SQLite (e.g. `ClientRepo.isEmpty` or `DashboardRepo.isAccountEmpty`)
 * @returns { isDataReady: boolean; isLoading: boolean }
 */
export function useDataReady(
  hasLocalData: boolean,
  checkEmpty: () => Promise<boolean>
): { isDataReady: boolean; isLoading: boolean; isConfirmedEmpty: boolean | null } {
  const { user } = useAuth();
  const { hasSynced } = useSyncStatus();
  const [isConfirmedEmpty, setIsConfirmedEmpty] = useState<boolean | null>(null);

  // Reset check if authenticated user changes in the same browser session
  useEffect(() => {
    setIsConfirmedEmpty(null);
  }, [user?.id]);

  useEffect(() => {
    // Only check SQLite when initial sync has completed, we don't already have proven data,
    // and we haven't already confirmed empty state.
    if (hasSynced && !hasLocalData && isConfirmedEmpty === null) {
      let active = true;
      checkEmpty()
        .then((isEmpty) => {
          if (active) {
            setIsConfirmedEmpty(isEmpty);
          }
        })
        .catch((err) => {
          console.error('[useDataReady] Error executing checkEmpty:', err);
          // Strict error safety: on error, do NOT set isConfirmedEmpty (fails toward skeleton)
        });
      return () => {
        active = false;
      };
    }
  }, [hasSynced, hasLocalData, isConfirmedEmpty, checkEmpty]);

  // Asymmetric gate (ADR 036):
  // - Confirmed empty (isConfirmedEmpty === true) -> unblocks immediately
  // - Confirmed has data (isConfirmedEmpty === false) -> holds skeleton until live queries land (hasLocalData === true)
  // - Pending (isConfirmedEmpty === null) -> holds skeleton unless hasLocalData is already true
  const isDataReady = hasLocalData || isConfirmedEmpty === true;

  // Latch: once ready, never re-arm the loading skeleton during live background query updates
  const hasLoadedRef = useRef(false);
  if (isDataReady) {
    hasLoadedRef.current = true;
  }

  return {
    isDataReady,
    isLoading: !hasLoadedRef.current,
    isConfirmedEmpty,
  };
}
