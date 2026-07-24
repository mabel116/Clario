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
            downloadStatus: status.downloadStatus,
            uploadStatus: status.uploadStatus,
            lastSyncedAt: status.lastSyncedAt
          });
        }
      });
    } else {
      console.log('[DIAGNOSTIC] db.registerListener is not available or db is null');
    }

    const connector = new SupabaseConnector();

    const initAndConnect = async () => {
      try {
        console.log('[DIAGNOSTIC] Checking session...');
        const { data: { session } } = await supabase.auth.getSession();
        console.log('[DIAGNOSTIC] Session exists:', !!session);
        
        if (session) {
          console.log('[DIAGNOSTIC] Initializing db...');
          // Check if db.init() needs to be called
          if (typeof db.init === 'function') {
            await db.init();
            console.log('[DIAGNOSTIC] db.init completed.');
          } else {
            console.log('[DIAGNOSTIC] db.init not found on db object.');
          }

          console.log('[DIAGNOSTIC] calling connect');
          await db.connect(connector);
          console.log('[DIAGNOSTIC] db.connect returned successfully.');
        }
      } catch (err: unknown) {
        console.error('[DIAGNOSTIC] Error in initAndConnect:', err);
        if (err instanceof Error) {
          console.error('[DIAGNOSTIC] Error stack:', err.stack);
        }
      }
    };

    initAndConnect();

    // Reactively connect on sign-in, disconnect and wipe database on sign-out
    const { data: { subscription } } = supabase.auth.onAuthStateChange(async (event, session) => {
      console.log('[DIAGNOSTIC] onAuthStateChange event:', event, 'session exists:', !!session);
      if (session) {
        try {
          if (typeof db.init === 'function') {
            await db.init();
          }
          console.log('[DIAGNOSTIC] calling connect (via auth change)');
          await db.connect(connector);
          console.log('[DIAGNOSTIC] db.connect (via auth change) returned successfully.');
        } catch (err: unknown) {
          console.error('[DIAGNOSTIC] Error in auth-triggered connect:', err);
        }
      } else {
        try {
          console.log('[DIAGNOSTIC] calling disconnectAndClear');
          await db.disconnectAndClear();
          console.log('[DIAGNOSTIC] PowerSync local SQLite database cleared on signout.');
        } catch (err: unknown) {
          console.error('[DIAGNOSTIC] Failed to clear PowerSync SQLite database on signout:', err);
        }
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
