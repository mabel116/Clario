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

    const connector = new SupabaseConnector();

    // Connect to database if session exists initially
    supabase.auth.getSession().then(({ data: { session } }) => {
      if (session) {
        db.connect(connector).catch((err) => {
          console.error('Initial PowerSync connection failed:', err);
        });
      }
    });

    // Reactively connect on sign-in, disconnect and wipe database on sign-out
    const { data: { subscription } } = supabase.auth.onAuthStateChange(async (event, session) => {
      if (session) {
        db.connect(connector).catch((err) => {
          console.error('Auth-triggered PowerSync connection failed:', err);
        });
      } else {
        try {
          await db.disconnectAndClear();
          console.log('PowerSync local SQLite database cleared on signout.');
        } catch (err) {
          console.error('Failed to clear PowerSync SQLite database on signout:', err);
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
