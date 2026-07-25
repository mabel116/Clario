'use client';

import React, { useEffect } from 'react';
import { PowerSyncContext } from '@powersync/react';
import { supabase } from '../supabase';
import { db } from './db';
import { SupabaseConnector } from './connector';

// Module-level locks to prevent concurrent deadlocks during hot reload, strict mode double-mounts, or rapid auth state changes
let globalInitPromise: Promise<void> | null = null;
let globalConnectPromise: Promise<void> | null = null;
let isInitialized = false;

// Wraps layouts to provide database singleton and manage connection/wipe cycles
export const PowerSyncProvider = ({ children }: { children: React.ReactNode }) => {

  useEffect(() => {
    if (typeof window === 'undefined') return;

    // Diagnostic on mount
    const powersyncUrl = process.env.NEXT_PUBLIC_POWERSYNC_URL || '';
    console.log('[DIAGNOSTIC] Provider mounted.');
    console.log('[DIAGNOSTIC] NEXT_PUBLIC_POWERSYNC_URL length:', powersyncUrl.length);

    // Subscribe to PowerSync status transitions
    let unsubscribeStatus: (() => void) | undefined;
    if (db && typeof db.registerListener === 'function') {
      console.log('[DIAGNOSTIC] Registering PowerSync status listener.');
      unsubscribeStatus = db.registerListener({
        statusChanged: (status) => {
          console.log('[DIAGNOSTIC] PowerSync status transition:', {
            connected: status.connected,
            connecting: status.connecting,
            hasSynced: status.hasSynced,
            lastSyncedAt: status.lastSyncedAt,
            downloadFraction: status.downloadProgress?.downloadedFraction
          });
        }
      });
    } else {
      console.log('[DIAGNOSTIC] db.registerListener is not available or db is null');
    }

    const connector = new SupabaseConnector();

    const initDb = async (context: string): Promise<void> => {
      if (globalInitPromise) {
        console.log(`[DIAGNOSTIC] [${context}] db.init already in progress or completed; sharing promise.`);
        return globalInitPromise;
      }

      console.log(`[DIAGNOSTIC] [${context}] starting db.init`);
      const timer = setTimeout(() => {
        console.warn(`[DIAGNOSTIC] [${context}] db.init is hanging! (10s timeout exceeded)`);
      }, 10000);

      globalInitPromise = (async () => {
        if (db && typeof db.init === 'function') {
          await db.init();
        } else {
          console.log(`[DIAGNOSTIC] [${context}] db.init not found on db object.`);
        }
      })();

      try {
        await globalInitPromise;
        console.log(`[DIAGNOSTIC] [${context}] db.init completed successfully.`);
      } catch (err: unknown) {
        console.error(`[DIAGNOSTIC] [${context}] db.init failed:`, err);
        globalInitPromise = null; // Allow retry on failure
        throw err;
      } finally {
        clearTimeout(timer);
      }
    };

    const connectDb = async (context: string): Promise<void> => {
      if (globalConnectPromise) {
        console.log(`[DIAGNOSTIC] [${context}] db.connect already in progress; sharing promise.`);
        return globalConnectPromise;
      }

      console.log(`[DIAGNOSTIC] [${context}] starting db.connect flow`);
      const timer = setTimeout(() => {
        console.warn(`[DIAGNOSTIC] [${context}] db.connect flow is hanging! (10s timeout exceeded)`);
      }, 10000);

      globalConnectPromise = (async () => {
        // Step 1: Ensure database is initialized before calling connect
        await initDb(context);

        // Step 2: Connect via connector
        console.log(`[DIAGNOSTIC] [${context}] calling db.connect`);
        await db.connect(connector);
        isInitialized = true;
      })();

      try {
        await globalConnectPromise;
        console.log(`[DIAGNOSTIC] [${context}] db.connect flow completed successfully.`);
      } catch (err: unknown) {
        console.error(`[DIAGNOSTIC] [${context}] db.connect flow failed:`, err);
        if (err instanceof Error) {
          console.error(`[DIAGNOSTIC] [${context}] Error stack:`, err.stack);
        }
        globalConnectPromise = null; // Allow retry on failure
        throw err;
      } finally {
        clearTimeout(timer);
      }
    };

    const initAndConnect = async () => {
      try {
        console.log('[DIAGNOSTIC] Checking session...');
        const { data: { session } } = await supabase.auth.getSession();
        console.log('[DIAGNOSTIC] Session exists:', !!session);
        
        if (session) {
          await connectDb('initAndConnect');
        }
      } catch (err: unknown) {
        console.error('[DIAGNOSTIC] Error in initAndConnect:', err);
      }
    };

    initAndConnect();

    // Reactively connect on sign-in, disconnect and wipe database on sign-out
    const { data: { subscription } } = supabase.auth.onAuthStateChange(async (event, session) => {
      console.log('[DIAGNOSTIC] onAuthStateChange event:', event, 'session exists:', !!session);
      
      if (session) {
        try {
          await connectDb(`onAuthStateChange:${event}`);
        } catch (err: unknown) {
          console.error('[DIAGNOSTIC] Error in auth-triggered connect:', err);
        }
      } else if (event === 'SIGNED_OUT') {
        if (!isInitialized) {
          console.log('[DIAGNOSTIC] skipping disconnectAndClear: database not initialized.');
          return;
        }

        try {
          console.log('[DIAGNOSTIC] calling disconnectAndClear');
          const timer = setTimeout(() => {
            console.warn('[DIAGNOSTIC] disconnectAndClear is hanging! (10s timeout exceeded)');
          }, 10000);

          try {
            await db.disconnectAndClear();
            isInitialized = false;
            globalConnectPromise = null; // Clear connection state cache
            globalInitPromise = null;    // Clear initialization state cache
            console.log('[DIAGNOSTIC] disconnectAndClear completed successfully. PowerSync local SQLite database cleared.');
          } finally {
            clearTimeout(timer);
          }
        } catch (err: unknown) {
          console.error('[DIAGNOSTIC] Failed to clear PowerSync SQLite database on signout:', err);
        }
      } else {
        console.log(`[DIAGNOSTIC] ignoring auth event without session: ${event}`);
      }
    });

    return () => {
      subscription.unsubscribe();
      if (unsubscribeStatus) {
        unsubscribeStatus();
      }
    };
  }, []);

  // Bypass server-side rendering execution
  if (typeof window === 'undefined') {
    return <>{children}</>;
  }

  return (
    <PowerSyncContext.Provider value={db}>
      {children}
    </PowerSyncContext.Provider>
  );
};
