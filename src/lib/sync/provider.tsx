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

    const connector = new SupabaseConnector();

    const initDb = async (): Promise<void> => {
      if (globalInitPromise) {
        return globalInitPromise;
      }

      globalInitPromise = (async () => {
        if (db && typeof db.init === 'function') {
          await db.init();
        }
      })();

      try {
        await globalInitPromise;
      } catch (err: unknown) {
        globalInitPromise = null; // Allow retry on failure
        throw err;
      }
    };

    const connectDb = async (): Promise<void> => {
      if (globalConnectPromise) {
        return globalConnectPromise;
      }

      globalConnectPromise = (async () => {
        // Ensure database is initialized before calling connect
        await initDb();
        await db.connect(connector);
        isInitialized = true;
      })();

      try {
        await globalConnectPromise;
      } catch (err: unknown) {
        globalConnectPromise = null; // Allow retry on failure
        throw err;
      }
    };

    const initAndConnect = async () => {
      try {
        const { data: { session } } = await supabase.auth.getSession();
        if (session) {
          await connectDb();
        }
      } catch (err: unknown) {
        console.error('Initial database connection failed:', err);
      }
    };

    initAndConnect();

    // Reactively connect on sign-in, disconnect and wipe database on sign-out
    const { data: { subscription } } = supabase.auth.onAuthStateChange(async (event, session) => {
      if (session) {
        try {
          await connectDb();
        } catch (err: unknown) {
          console.error('Auth-triggered database connection failed:', err);
        }
      } else if (event === 'SIGNED_OUT') {
        if (!isInitialized) return;

        try {
          await db.disconnectAndClear();
          isInitialized = false;
          globalConnectPromise = null;
          globalInitPromise = null;
        } catch (err: unknown) {
          console.error('Failed to clear PowerSync database on signout:', err);
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
