'use client';

import React, { useEffect } from 'react';
import { PowerSyncContext } from '@powersync/react';
import { supabase } from '../supabase';
import { db } from './db';
import { SupabaseConnector } from './connector';

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

    let isInitialized = false;
    let currentConnectionPromise: Promise<void> | null = null;
    const connector = new SupabaseConnector();

    const connectDb = async (context: string) => {
      if (currentConnectionPromise) {
        console.log(`[DIAGNOSTIC] [${context}] connect already in progress; reusing promise.`);
        return currentConnectionPromise;
      }

      console.log(`[DIAGNOSTIC] [${context}] calling connect`);
      currentConnectionPromise = db.connect(connector);
      
      const timer = setTimeout(() => {
        console.warn(`[DIAGNOSTIC] [${context}] db.connect is hanging! (10s timeout exceeded)`);
      }, 10000);

      try {
        await currentConnectionPromise;
        isInitialized = true;
        console.log(`[DIAGNOSTIC] [${context}] db.connect returned successfully.`);
      } catch (err: unknown) {
        console.error(`[DIAGNOSTIC] [${context}] db.connect failed:`, err);
        if (err instanceof Error) {
          console.error(`[DIAGNOSTIC] [${context}] Error stack:`, err.stack);
        }
        throw err;
      } finally {
        clearTimeout(timer);
        currentConnectionPromise = null;
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
