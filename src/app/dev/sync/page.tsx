'use client';

import React, { useState, useEffect } from 'react';
import { useQuery, usePowerSync } from '@powersync/react';
import { supabase } from '../../../lib/supabase';
import { User, LogIn, LogOut, Plus, ShieldCheck } from 'lucide-react';
import { User as SupabaseUser } from '@supabase/supabase-js';

export default function DevSyncPage() {
  const db = usePowerSync();
  const [currentUser, setCurrentUser] = useState<SupabaseUser | null>(null);
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [authError, setAuthError] = useState('');
  const [loading, setLoading] = useState(false);

  // Read current active session
  useEffect(() => {
    supabase.auth.getSession().then(({ data: { session } }) => {
      setCurrentUser(session?.user ?? null);
    });

    const { data: { subscription } } = supabase.auth.onAuthStateChange((event, session) => {
      setCurrentUser(session?.user ?? null);
    });

    return () => subscription.unsubscribe();
  }, []);

  // Fetch counts from local SQLite reactive queries
  const { data: clientsData } = useQuery('SELECT COUNT(*) as count FROM clients');
  const { data: linksData } = useQuery('SELECT COUNT(*) as count FROM client_links');
  const { data: invoicesData } = useQuery('SELECT COUNT(*) as count FROM invoices');
  const { data: lineItemsData } = useQuery('SELECT COUNT(*) as count FROM invoice_line_items');
  const { data: paymentsData } = useQuery('SELECT COUNT(*) as count FROM payment_events');
  const { data: profilesData } = useQuery('SELECT COUNT(*) as count FROM profiles');

  const counts = {
    profiles: profilesData?.[0]?.count ?? 0,
    clients: clientsData?.[0]?.count ?? 0,
    client_links: linksData?.[0]?.count ?? 0,
    invoices: invoicesData?.[0]?.count ?? 0,
    invoice_line_items: lineItemsData?.[0]?.count ?? 0,
    payment_events: paymentsData?.[0]?.count ?? 0
  };

  const handleSignUp = async () => {
    setLoading(true);
    setAuthError('');
    try {
      const { error } = await supabase.auth.signUp({ email, password });
      if (error) throw error;
      alert('Sign up successful! Please check your email (or sign in directly if auto-confirmed).');
    } catch (err: unknown) {
      setAuthError((err as Error).message);
    } finally {
      setLoading(false);
    }
  };

  const handleSignIn = async () => {
    setLoading(true);
    setAuthError('');
    try {
      const { error } = await supabase.auth.signInWithPassword({ email, password });
      if (error) throw error;
    } catch (err: unknown) {
      setAuthError((err as Error).message);
    } finally {
      setLoading(false);
    }
  };

  const handleSignOut = async () => {
    setLoading(true);
    try {
      await supabase.auth.signOut();
    } catch (err: unknown) {
      console.error((err as Error).message);
    } finally {
      setLoading(false);
    }
  };

  const handleInsertClient = async () => {
    if (!currentUser) {
      alert('Please sign in to write data to local database.');
      return;
    }

    try {
      const clientId = crypto.randomUUID();
      const timestamp = new Date().toISOString();

      // Write directly to local SQLite
      await db.execute(
        `INSERT INTO clients (id, user_id, name, default_currency, created_at, updated_at)
         VALUES (?, ?, ?, ?, ?, ?);`,
        [
          clientId,
          currentUser.id,
          `Dev Client ${new Date().toLocaleTimeString()}`,
          'USD',
          timestamp,
          timestamp
        ]
      );
      console.log('Client row written locally:', clientId);
    } catch (err: unknown) {
      alert(`Local write failed: ${(err as Error).message}`);
    }
  };

  return (
    <div className="min-h-screen bg-slate-950 text-slate-100 p-8 flex flex-col items-center">
      <div className="max-w-4xl w-full flex flex-col gap-8">
        
        {/* Header */}
        <header className="flex justify-between items-center border-b border-slate-900 pb-6">
          <div>
            <h1 className="text-2xl font-bold bg-gradient-to-r from-violet-400 to-indigo-400 bg-clip-text text-transparent">
              Clario Dev Sync Console
            </h1>
            <p className="text-xs text-slate-500 mt-1">
              Phase 2 Offline Sync Integration Diagnostics
            </p>
          </div>
          <div className="flex items-center gap-2 bg-slate-900 border border-slate-800 rounded-full px-3 py-1 text-xs">
            <ShieldCheck className="h-3.5 w-3.5 text-violet-400" />
            <span className="text-slate-400">PowerSync Boundary Active</span>
          </div>
        </header>

        {/* Grid Area */}
        <div className="grid grid-cols-1 md:grid-cols-2 gap-8">
          
          {/* Auth Controls */}
          <section className="bg-slate-900/40 border border-slate-900 rounded-2xl p-6 flex flex-col gap-4">
            <h2 className="text-sm font-semibold uppercase tracking-wider text-slate-400 flex items-center gap-2">
              <User className="h-4 w-4" /> Auth Controller
            </h2>
            
            {currentUser ? (
              <div className="flex flex-col gap-4">
                <div className="bg-slate-900/80 border border-slate-800 rounded-xl p-4 flex flex-col gap-1.5 text-xs">
                  <span className="text-slate-500 font-semibold">Logged in as:</span>
                  <span className="text-slate-300 font-mono truncate">{currentUser.email}</span>
                  <span className="text-slate-500 font-semibold mt-1">User ID:</span>
                  <span className="text-slate-400 font-mono truncate">{currentUser.id}</span>
                </div>
                <button
                  onClick={handleSignOut}
                  disabled={loading}
                  className="w-full flex justify-center items-center gap-2 rounded-xl bg-red-950/40 border border-red-900/60 text-red-300 py-2.5 text-sm font-medium hover:bg-red-900/20 disabled:opacity-50 transition-all duration-300"
                >
                  <LogOut className="h-4 w-4" /> Sign Out & Clear Database
                </button>
              </div>
            ) : (
              <div className="flex flex-col gap-3">
                <div className="flex flex-col gap-1 text-xs">
                  <label className="text-slate-500">Email Address</label>
                  <input
                    type="email"
                    placeholder="freelancer@example.com"
                    value={email}
                    onChange={(e) => setEmail(e.target.value)}
                    className="bg-slate-950 border border-slate-850 rounded-lg p-2.5 text-slate-300 focus:outline-none focus:border-violet-500"
                  />
                </div>
                <div className="flex flex-col gap-1 text-xs">
                  <label className="text-slate-500">Password</label>
                  <input
                    type="password"
                    placeholder="••••••••"
                    value={password}
                    onChange={(e) => setPassword(e.target.value)}
                    className="bg-slate-950 border border-slate-850 rounded-lg p-2.5 text-slate-300 focus:outline-none focus:border-violet-500"
                  />
                </div>

                {authError && (
                  <div className="text-red-400 text-xs bg-red-950/20 border border-red-900/40 rounded-lg p-2.5">
                    {authError}
                  </div>
                )}

                <div className="flex gap-3 mt-2 text-xs">
                  <button
                    onClick={handleSignIn}
                    disabled={loading}
                    className="flex-1 flex justify-center items-center gap-1.5 rounded-xl bg-violet-650 hover:bg-violet-600 text-white font-semibold py-2.5 disabled:opacity-50 transition-all duration-300"
                  >
                    <LogIn className="h-4 w-4" /> Sign In
                  </button>
                  <button
                    onClick={handleSignUp}
                    disabled={loading}
                    className="flex-1 flex justify-center items-center gap-1.5 rounded-xl bg-slate-950 border border-slate-800 hover:border-slate-750 text-slate-300 py-2.5 disabled:opacity-50 transition-all duration-300"
                  >
                    Sign Up
                  </button>
                </div>

                <div className="flex flex-col gap-2 mt-4 pt-4 border-t border-slate-900">
                  <span className="text-[10px] text-slate-500 font-semibold uppercase tracking-wider">Quick Dev Auth</span>
                  <div className="flex gap-2 text-[11px]">
                    <button
                      onClick={async () => {
                        setLoading(true);
                        setAuthError('');
                        try {
                          const { error: signInErr } = await supabase.auth.signInWithPassword({
                            email: 'usera@example.com',
                            password: 'password123'
                          });
                          if (signInErr) {
                            const { error: signUpErr } = await supabase.auth.signUp({
                              email: 'usera@example.com',
                              password: 'password123'
                            });
                            if (signUpErr) throw signUpErr;
                            alert('User A signed up! If confirmation is needed, run DB query then login.');
                          }
                        } catch (err: unknown) {
                          setAuthError((err as Error).message);
                        } finally {
                          setLoading(false);
                        }
                      }}
                      disabled={loading}
                      className="flex-1 bg-slate-900 border border-slate-800 hover:bg-slate-850 text-violet-300 font-semibold py-2 rounded-xl"
                    >
                      Login User A
                    </button>
                    <button
                      onClick={async () => {
                        setLoading(true);
                        setAuthError('');
                        try {
                          const { error: signInErr } = await supabase.auth.signInWithPassword({
                            email: 'userb@example.com',
                            password: 'password123'
                          });
                          if (signInErr) {
                            const { error: signUpErr } = await supabase.auth.signUp({
                              email: 'userb@example.com',
                              password: 'password123'
                            });
                            if (signUpErr) throw signUpErr;
                            alert('User B signed up! If confirmation is needed, run DB query then login.');
                          }
                        } catch (err: unknown) {
                          setAuthError((err as Error).message);
                        } finally {
                          setLoading(false);
                        }
                      }}
                      disabled={loading}
                      className="flex-1 bg-slate-900 border border-slate-800 hover:bg-slate-850 text-indigo-300 font-semibold py-2 rounded-xl"
                    >
                      Login User B
                    </button>
                  </div>
                </div>
              </div>
            )}
          </section>

          {/* Database Info */}
          <section className="bg-slate-900/40 border border-slate-900 rounded-2xl p-6 flex flex-col gap-5">
            <h2 className="text-sm font-semibold uppercase tracking-wider text-slate-400">
              Local SQLite Database State
            </h2>

            <div className="border border-slate-900 rounded-xl overflow-hidden text-xs">
              <table className="w-full text-left border-collapse">
                <thead>
                  <tr className="bg-slate-900 text-slate-500 border-b border-slate-900 font-semibold">
                    <th className="p-3">SQLite Table</th>
                    <th className="p-3 text-right">Row Count</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-900/60 font-mono text-slate-300">
                  <tr>
                    <td className="p-3">profiles</td>
                    <td className="p-3 text-right">{counts.profiles}</td>
                  </tr>
                  <tr>
                    <td className="p-3">clients</td>
                    <td className="p-3 text-right font-bold text-violet-400">{counts.clients}</td>
                  </tr>
                  <tr>
                    <td className="p-3">client_links</td>
                    <td className="p-3 text-right">{counts.client_links}</td>
                  </tr>
                  <tr>
                    <td className="p-3">invoices</td>
                    <td className="p-3 text-right">{counts.invoices}</td>
                  </tr>
                  <tr>
                    <td className="p-3">invoice_line_items</td>
                    <td className="p-3 text-right">{counts.invoice_line_items}</td>
                  </tr>
                  <tr>
                    <td className="p-3">payment_events</td>
                    <td className="p-3 text-right">{counts.payment_events}</td>
                  </tr>
                </tbody>
              </table>
            </div>

            <button
              onClick={handleInsertClient}
              disabled={!currentUser}
              className="w-full flex justify-center items-center gap-1.5 rounded-xl bg-violet-650 hover:bg-violet-600 disabled:bg-slate-900 disabled:text-slate-600 text-white text-sm font-semibold py-3 transition-all duration-300 shadow-md shadow-violet-950/20"
            >
              <Plus className="h-4 w-4" /> Insert Offline-Ready Client Row
            </button>
          </section>

        </div>

      </div>
    </div>
  );
}
