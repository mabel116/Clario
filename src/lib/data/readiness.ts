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
    // Only check SQLite when we don't already have proven data in React state,
    // and we haven't already confirmed empty state.
    if (!hasLocalData && isConfirmedEmpty === null) {
      let active = true;
      checkEmpty()
        .then((isEmpty) => {
          if (!active) return;
          if (isEmpty === false) {
            // Local disk confirmed has data! Holds skeleton until live queries emit rows,
            // never waits for network hasSynced.
            setIsConfirmedEmpty(false);
          } else if (isEmpty === true) {
            // Local disk is currently 0.
            // If hasSynced is true, initial network sync finished, so 0 on disk means genuinely empty!
            // If hasSynced is false, network download is still in flight, so leave isConfirmedEmpty as null
            // (holding skeleton) until hasSynced transitions to true.
            if (hasSynced) {
              setIsConfirmedEmpty(true);
            }
          }
        })
        .catch((err) => {
          console.error('[useDataReady] Error executing checkEmpty:', err);
          // Strict error safety: on error, leave isConfirmedEmpty as null (hold skeleton, retry on sync change)
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

/**
 * Shared deterministic readiness gate for single-entity views (e.g. `/invoices/[id]`, `/clients/[id]`).
 * Conforms to ADR 036.
 *
 * @param hasEntity Boolean indicating if the entity is already loaded in React state (e.g. `invoice !== null && invoice !== undefined`)
 * @param checkExists Async callback performing a deterministic one-shot direct read against local SQLite (e.g. `InvoiceRepo.exists(id)`)
 * @param entityId Optional entity identifier to track identity transitions and reset latch state
 * @returns { isReady: boolean; isLoading: boolean; isNotFound: boolean }
 */
export function useEntityReady(
  hasEntity: boolean,
  checkExists: () => Promise<boolean>,
  entityId?: string | null
): { isReady: boolean; isLoading: boolean; isNotFound: boolean } {
  const { user } = useAuth();
  const { hasSynced } = useSyncStatus();
  const [isConfirmedNotFound, setIsConfirmedNotFound] = useState<boolean | null>(null);
  const hasLoadedRef = useRef(false);

  // Reset check and re-arm latch if authenticated user changes
  useEffect(() => {
    setIsConfirmedNotFound(null);
    hasLoadedRef.current = false;
  }, [user?.id]);

  // Reset check and re-arm latch when entity identifier changes
  useEffect(() => {
    setIsConfirmedNotFound(null);
    hasLoadedRef.current = false;
  }, [entityId]);

  const isNoEntity = entityId !== undefined && (entityId === null || entityId === '');

  useEffect(() => {
    // If an entity identifier is specified and is empty/null, do not probe SQLite or latch not-found
    if (isNoEntity) {
      return;
    }

    // Only check SQLite when we don't already have the entity in state,
    // and we haven't already confirmed not found.
    if (!hasEntity && isConfirmedNotFound === null) {
      let active = true;
      checkExists()
        .then((exists) => {
          if (!active) return;
          if (exists === true) {
            // Entity confirmed exists in local SQLite! Holds skeleton until live query emits.
            // Never waits for network hasSynced.
            setIsConfirmedNotFound(false);
          } else if (exists === false) {
            // Entity is not in local SQLite.
            // If hasSynced is true, initial sync finished, so missing from disk means genuine 404!
            // If hasSynced is false, initial sync in flight, hold skeleton until hasSynced is true.
            if (hasSynced) {
              setIsConfirmedNotFound(true);
            }
          }
        })
        .catch((err) => {
          console.error('[useEntityReady] Error executing checkExists:', err);
          // Strict error safety: on error, do NOT confirm not found (fails toward skeleton)
        });
      return () => {
        active = false;
      };
    }
  }, [hasSynced, hasEntity, isConfirmedNotFound, checkExists, isNoEntity]);

  // Is ready if the entity exists in React state, OR if we deterministically confirmed it does not exist
  const isReady = !isNoEntity && (hasEntity || isConfirmedNotFound === true);

  // Latch: once ready, never re-arm loading skeleton during live query updates for the same entity
  if (isReady) {
    hasLoadedRef.current = true;
  }

  return {
    isReady,
    isLoading: isNoEntity ? false : !hasLoadedRef.current,
    isNotFound: !isNoEntity && isConfirmedNotFound === true && !hasEntity,
  };
}

