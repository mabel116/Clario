'use client';

import React, { useEffect } from 'react';
import { PowerSyncContext } from '@powersync/react';
import { getAuthSession, onAuthStateChange } from '../auth/client';
import { db } from './db';
import { SupabaseConnector } from './connector';
import { clearDashboardSnapshot } from '../data/snapshot';

// Module-level locks to prevent concurrent deadlocks during hot reload, strict mode double-mounts, or rapid auth state changes
let globalInitPromise: Promise<void> | null = null;
let globalConnectPromise: Promise<void> | null = null;
let isInitialized = false;
let lastConnectedUserId: string | null = null;

// Wraps layouts to provide database singleton and manage connection/wipe cycles
export const PowerSyncProvider = ({ children }: { children: React.ReactNode }) => {

  useEffect(() => {
    if (typeof window === 'undefined') return;

    const connector = new SupabaseConnector();

    const initDb = async (): Promise<void> => {
      if (globalInitPromise) {
        return globalInitPromise;
      }

      globalInitPromise = (async () => {
        if (db && typeof db.init === 'function') {
          const t0 = typeof performance !== 'undefined' ? performance.now() : Date.now();
          console.log('⏱️ [POWERSYNC] db.init() starting...');
          await db.init();
          const elapsed = (typeof performance !== 'undefined' ? performance.now() : Date.now()) - t0;
          console.log(`⏱️ [POWERSYNC] db.init() completed in ${elapsed.toFixed(1)}ms`);
        }
      })();

      try {
        await globalInitPromise;
      } catch (err: unknown) {
        globalInitPromise = null; // Allow retry on failure
        throw err;
      }
    };

    const connectDb = async (targetUserId?: string): Promise<void> => {
      if (globalConnectPromise) {
        return globalConnectPromise;
      }

      // Skip if already connected to the same user account
      if (db?.connected && lastConnectedUserId && (!targetUserId || targetUserId === lastConnectedUserId)) {
        return;
      }

      globalConnectPromise = (async () => {
        // Ensure database is initialized before calling connect
        await initDb();
        const t0 = typeof performance !== 'undefined' ? performance.now() : Date.now();
        console.log('⏱️ [POWERSYNC] db.connect() starting...');
        await db.connect(connector);
        const elapsed = (typeof performance !== 'undefined' ? performance.now() : Date.now()) - t0;
        console.log(`⏱️ [POWERSYNC] db.connect() completed in ${elapsed.toFixed(1)}ms (connected=${db?.connected})`);
        isInitialized = true;
        if (targetUserId) {
          lastConnectedUserId = targetUserId;
        } else {
          const session = await getAuthSession();
          lastConnectedUserId = session?.user?.id || null;
        }
      })();

      try {
        await globalConnectPromise;
      } catch (err: unknown) {
        globalConnectPromise = null; // Allow retry on failure
        throw err;
      } finally {
        globalConnectPromise = null; // Clear so subsequent account switches or sign-ins can reconnect
      }
    };

    const initAndConnect = async () => {
      try {
        const session = await getAuthSession();
        if (session?.user?.id) {
          lastConnectedUserId = session.user.id;
          await connectDb(session.user.id);
        }
      } catch (err: unknown) {
        console.error('Initial database connection failed:', err);
      }
    };

    initAndConnect();

    // Reactively connect only on new sign-in / account switch, disconnect and wipe database on sign-out
    const subscription = onAuthStateChange(async (event, session) => {
      if (event === 'SIGNED_IN' && session?.user?.id) {
        lastConnectedUserId = session.user.id;
        if (session.user.id !== lastConnectedUserId || !db?.connected) {
          try {
            await connectDb(session.user.id);
          } catch (err: unknown) {
            console.error('Auth-triggered database connection failed:', err);
          }
        }
      } else if (event === 'SIGNED_OUT') {
        try {
          const prevUserId = lastConnectedUserId;
          if (db && typeof db.disconnectAndClear === 'function') {
            await db.disconnectAndClear();
          }
          if (prevUserId) {
            await clearDashboardSnapshot(prevUserId);
          }
        } catch (err: unknown) {
          console.error('Failed to clear PowerSync database on signout:', err);
        } finally {
          isInitialized = false;
          globalConnectPromise = null;
          globalInitPromise = null;
          lastConnectedUserId = null;
        }
      }
    });

    return () => {
      subscription.unsubscribe();
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
