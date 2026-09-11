'use client';

import React, { useState, useEffect, useRef } from 'react';
import { ProtectedRoute } from '../../components/ProtectedRoute';
import { AppShell } from '../../components/AppShell';
import { useAuth } from '../../lib/auth/provider';
import { useProfile } from '../../lib/data/hooks';
import { ProfileRepo } from '../../lib/data/profile';
import { useEntityReady } from '../../lib/data/readiness';
import { useSyncStatus } from '../../lib/sync/hooks';
import { CURRENCIES } from '../../lib/money';
import {
  Check,
  RefreshCw,
  AlertCircle,
  Building,
  MapPin,
  BadgeDollarSign,
  Wifi,
  WifiOff,
  Cloud,
  LogOut,
  AlertTriangle,
  X
} from 'lucide-react';

export default function SettingsPage() {
  return (
    <ProtectedRoute>
      <AppShell>
        <SettingsForm />
      </AppShell>
    </ProtectedRoute>
  );
}

const SUPPORTED_CURRENCIES = Object.values(CURRENCIES).map((c) => ({
  code: c.code,
  name: `${c.name} (${c.symbol})`
}));

function SettingsForm() {
  const { user, signOut } = useAuth();
  const { data: profile } = useProfile();
  const { connected, pendingUploads, lastSyncedAt } = useSyncStatus();

  // ADR 036 entity readiness gate: holds loading skeleton until profile exists on disk or genuine 404 confirmed
  const { isReady, isLoading: isEntityLoading } = useEntityReady(
    Boolean(profile),
    () => ProfileRepo.exists(user?.id),
    user?.id
  );

  // Form State
  const [businessName, setBusinessName] = useState('');
  const [businessAddress, setBusinessAddress] = useState('');
  const [defaultCurrency, setDefaultCurrency] = useState('USD');

  const [isSaving, setIsSaving] = useState(false);
  const [saveSuccess, setSaveSuccess] = useState(false);
  const [saveError, setSaveError] = useState<string | null>(null);

  // Sign out warning modal state
  const [showSignOutWarning, setShowSignOutWarning] = useState(false);
  const [isSigningOut, setIsSigningOut] = useState(false);

  // Dirty tracking to preserve typed input against async background sync clobbering
  const isDirtyRef = useRef(false);

  // Sync inputs with reactive profile row only when not actively dirtied by user
  useEffect(() => {
    if (profile && !isDirtyRef.current) {
      setBusinessName(profile.business_name || '');
      setBusinessAddress(profile.business_address || '');
      setDefaultCurrency(profile.default_currency || 'USD');
    }
  }, [profile]);

  const handleSave = async (e: React.FormEvent) => {
    e.preventDefault();
    setIsSaving(true);
    setSaveSuccess(false);
    setSaveError(null);

    try {
      await ProfileRepo.update({
        business_name: businessName,
        business_address: businessAddress,
        default_currency: defaultCurrency
      });
      isDirtyRef.current = false;
      setSaveSuccess(true);
      setTimeout(() => setSaveSuccess(false), 4000);
    } catch (err: unknown) {
      const msg = err instanceof Error ? err.message : 'Failed to update profile settings.';
      setSaveError(msg);
    } finally {
      setIsSaving(false);
    }
  };

  const handleSignOutClick = () => {
    if (pendingUploads > 0) {
      setShowSignOutWarning(true);
    } else {
      executeSignOut();
    }
  };

  const executeSignOut = async () => {
    try {
      setIsSigningOut(true);
      await signOut();
    } catch (err: unknown) {
      console.error('Sign out failed:', err);
    } finally {
      setIsSigningOut(false);
      setShowSignOutWarning(false);
    }
  };

  return (
    <div className="space-y-8 animate-fade-in">
      {/* Header Title */}
      <div>
        <h1 className="text-3xl font-bold tracking-tight text-white">Settings</h1>
        <p className="text-sm text-slate-400 mt-1">Manage your freelance profile settings and monitor sync status</p>
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-3 gap-8">
        {/* Left/Middle Column: Edit Profile Form */}
        <div className="lg:col-span-2 space-y-6">
          <div className="rounded-2xl border border-slate-900 bg-slate-900/20 p-6 backdrop-blur-xl">
            <h3 className="text-lg font-bold text-white mb-6">Business Profile</h3>

            {isEntityLoading && !profile ? (
              /* Geometry-matched structured skeleton preventing layout pop */
              <div className="space-y-6 animate-pulse" aria-busy="true" aria-label="Loading profile settings">
                {/* Business Name Field Skeleton */}
                <div className="space-y-2">
                  <div className="h-4 w-48 rounded bg-slate-800/60" />
                  <div className="h-12 w-full rounded-lg border border-slate-800/60 bg-slate-950/60" />
                </div>

                {/* Business Address Field Skeleton */}
                <div className="space-y-2">
                  <div className="h-4 w-36 rounded bg-slate-800/60" />
                  <div className="h-24 w-full rounded-lg border border-slate-800/60 bg-slate-950/60" />
                </div>

                {/* Default Currency Field Skeleton */}
                <div className="space-y-2">
                  <div className="h-4 w-44 rounded bg-slate-800/60" />
                  <div className="h-12 w-full rounded-lg border border-slate-800/60 bg-slate-950/60" />
                  <div className="h-3.5 w-72 rounded bg-slate-800/40 mt-1" />
                </div>

                {/* Save Button Skeleton */}
                <div className="pt-2">
                  <div className="h-11 w-36 rounded-lg bg-indigo-900/40 border border-indigo-500/20" />
                </div>
              </div>
            ) : (
              <form onSubmit={handleSave} className="space-y-6">
                {/* Business Name */}
                <div className="space-y-2">
                  <label htmlFor="businessName" className="text-sm font-semibold text-slate-300 flex items-center gap-2">
                    <Building className="h-4.5 w-4.5 text-slate-500" />
                    Business Name / Freelancer Name
                  </label>
                  <input
                    id="businessName"
                    type="text"
                    value={businessName}
                    onChange={(e) => {
                      isDirtyRef.current = true;
                      setBusinessName(e.target.value);
                    }}
                    placeholder="e.g. Acme Creative Agency or Jane Doe Studio"
                    className="block w-full rounded-lg border border-slate-800 bg-slate-950/60 py-3 px-4 text-sm text-white placeholder-slate-600 focus:border-indigo-500 focus:ring-1 focus:ring-indigo-500 focus:outline-none transition"
                  />
                </div>

                {/* Business Address */}
                <div className="space-y-2">
                  <label htmlFor="businessAddress" className="text-sm font-semibold text-slate-300 flex items-center gap-2">
                    <MapPin className="h-4.5 w-4.5 text-slate-500" />
                    Business Address
                  </label>
                  <textarea
                    id="businessAddress"
                    rows={3}
                    value={businessAddress}
                    onChange={(e) => {
                      isDirtyRef.current = true;
                      setBusinessAddress(e.target.value);
                    }}
                    placeholder="Enter business address displayed on your invoices..."
                    className="block w-full rounded-lg border border-slate-800 bg-slate-950/60 py-3 px-4 text-sm text-white placeholder-slate-600 focus:border-indigo-500 focus:ring-1 focus:ring-indigo-500 focus:outline-none transition resize-none"
                  />
                </div>

                {/* Default Currency */}
                <div className="space-y-2">
                  <label htmlFor="defaultCurrency" className="text-sm font-semibold text-slate-300 flex items-center gap-2">
                    <BadgeDollarSign className="h-4.5 w-4.5 text-slate-500" />
                    Default Invoice Currency
                  </label>
                  <div className="relative">
                    <select
                      id="defaultCurrency"
                      value={defaultCurrency}
                      onChange={(e) => {
                        isDirtyRef.current = true;
                        setDefaultCurrency(e.target.value);
                      }}
                      className="block w-full rounded-lg border border-slate-800 bg-slate-950/60 py-3 px-4 text-sm text-white placeholder-slate-500 focus:border-indigo-500 focus:ring-1 focus:ring-indigo-500 focus:outline-none transition appearance-none"
                    >
                      {SUPPORTED_CURRENCIES.map((curr) => (
                        <option key={curr.code} value={curr.code} className="bg-slate-950 text-white">
                          {curr.code} - {curr.name}
                        </option>
                      ))}
                    </select>
                    {/* Custom Arrow */}
                    <div className="pointer-events-none absolute inset-y-0 right-0 flex items-center pr-4 text-slate-500">
                      <svg className="h-4 w-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M19 9l-7 7-7-7" />
                      </svg>
                    </div>
                  </div>
                  <p className="text-xs text-slate-500">This pre-fills the currency selection when generating new clients and invoices.</p>
                </div>

                {/* Save Button Row with Fixed Geometry Feedback */}
                <div className="pt-2 flex flex-wrap items-center gap-4">
                  <button
                    type="submit"
                    disabled={isSaving}
                    className="inline-flex justify-center items-center gap-2 rounded-lg bg-indigo-600 px-6 py-3 text-sm font-semibold text-white hover:bg-indigo-500 focus:outline-none focus:ring-2 focus:ring-indigo-500 focus:ring-offset-2 focus:ring-offset-slate-950 transition disabled:opacity-50"
                  >
                    {isSaving ? (
                      <RefreshCw className="h-4 w-4 animate-spin" />
                    ) : (
                      'Save Changes'
                    )}
                  </button>

                  {saveSuccess && (
                    <div className="flex items-center gap-2 rounded-lg bg-emerald-950/40 border border-emerald-900/50 py-2 px-3 text-xs font-semibold text-emerald-400 animate-fade-in">
                      <Check className="h-4 w-4 text-emerald-400" />
                      <span>Settings saved locally</span>
                    </div>
                  )}

                  {saveError && (
                    <div className="flex items-center gap-2 rounded-lg bg-red-950/40 border border-red-900/50 py-2 px-3 text-xs font-semibold text-red-400 animate-fade-in">
                      <AlertCircle className="h-4 w-4 text-red-400" />
                      <span>{saveError}</span>
                    </div>
                  )}
                </div>
              </form>
            )}
          </div>
        </div>

        {/* Right Column: Sync Status & Account widgets */}
        <div className="space-y-6">
          {/* Sync Engine Status Card */}
          <div className="rounded-2xl border border-slate-900 bg-slate-900/20 p-6 backdrop-blur-xl space-y-6">
            <h3 className="text-lg font-bold text-white flex items-center gap-2.5">
              <Cloud className="h-5 w-5 text-indigo-400" />
              Sync Engine Status
            </h3>

            {/* Sync State Badge */}
            <div className="flex items-center gap-3">
              {connected ? (
                <div className="inline-flex items-center gap-2 rounded-full bg-emerald-950/40 border border-emerald-800/40 px-3 py-1.5 text-xs font-semibold text-emerald-400">
                  <Wifi className="h-4 w-4 text-emerald-400" />
                  Online & Connected
                </div>
              ) : (
                <div className="inline-flex items-center gap-2 rounded-full bg-amber-950/40 border border-amber-800/40 px-3 py-1.5 text-xs font-semibold text-amber-400">
                  <WifiOff className="h-4 w-4 text-amber-400" />
                  Offline Mode
                </div>
              )}
            </div>

            {/* Sync Properties */}
            <div className="space-y-4 pt-2">
              <div className="flex items-center justify-between text-sm">
                <span className="text-slate-400 font-medium">Pending changes:</span>
                {pendingUploads > 0 ? (
                  <span className="text-amber-400 font-bold animate-pulse">{pendingUploads} changes queued</span>
                ) : (
                  <span className="text-emerald-400 font-semibold flex items-center gap-1">
                    <Check className="h-4.5 w-4.5" /> All changes synced
                  </span>
                )}
              </div>

              <div className="flex items-center justify-between text-sm">
                <span className="text-slate-400 font-medium">Last synced:</span>
                <span className="text-slate-300 font-semibold tabular-nums">
                  {lastSyncedAt ? lastSyncedAt.toLocaleTimeString() : 'Never'}
                </span>
              </div>
            </div>

            <div className="h-px bg-slate-900"></div>

            <div className="text-xs text-slate-500 leading-relaxed space-y-1">
              <p>Clario keeps a complete local cache of your client, invoice, and payment information.</p>
              <p className="font-semibold text-slate-400">Any modifications made offline will automatically sync with Supabase replication as soon as you reconnect to internet.</p>
            </div>
          </div>

          {/* Account & Session Card (PRD Prompt 5 Task 4) */}
          <div className="rounded-2xl border border-slate-900 bg-slate-900/20 p-6 backdrop-blur-xl space-y-4">
            <h3 className="text-lg font-bold text-white flex items-center gap-2.5">
              <LogOut className="h-5 w-5 text-indigo-400" />
              Account & Session
            </h3>

            <div className="space-y-1 text-left">
              <span className="text-xs font-semibold text-slate-500 uppercase tracking-wider">Signed in as</span>
              <p className="text-sm font-medium text-white truncate">{user?.email || 'Authenticated User'}</p>
            </div>

            <div className="pt-2">
              <button
                type="button"
                onClick={handleSignOutClick}
                disabled={isSigningOut}
                className="w-full inline-flex justify-center items-center gap-2 rounded-lg border border-red-900/40 bg-red-950/20 px-4 py-2.5 text-sm font-semibold text-red-400 hover:bg-red-950/40 hover:text-red-300 transition disabled:opacity-50"
              >
                <LogOut className="h-4 w-4" />
                {isSigningOut ? 'Signing out...' : 'Sign Out'}
              </button>
            </div>
          </div>
        </div>
      </div>

      {/* Pending Uploads Sign-Out Warning Dialog Modal */}
      {showSignOutWarning && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-slate-950/80 backdrop-blur-sm animate-fade-in">
          <div className="w-full max-w-md rounded-3xl border border-slate-900 bg-slate-950 p-6 shadow-2xl space-y-6">
            <div className="flex items-center justify-between">
              <div className="flex items-center gap-2">
                <AlertTriangle className="h-5 w-5 text-amber-400" />
                <h3 className="text-lg font-bold text-white">Unsynced Changes Warning</h3>
              </div>
              <button
                onClick={() => setShowSignOutWarning(false)}
                className="p-1 rounded-lg text-slate-500 hover:text-white transition"
              >
                <X className="h-5 w-5" />
              </button>
            </div>

            <div className="space-y-3 text-left text-xs text-slate-400">
              <p>
                You have <span className="font-bold text-amber-400">{pendingUploads} unsaved offline {pendingUploads === 1 ? 'change' : 'changes'}</span> queued on this device that have not yet synced with the cloud.
              </p>
              <p className="rounded-xl border border-amber-900/30 bg-amber-950/10 p-3 text-amber-300/90 leading-relaxed">
                Signing out will clear this device&apos;s local database for security. Any changes made offline that have not finished syncing will be permanently lost.
              </p>
              <p>
                To keep your changes, click <span className="text-white font-semibold">Cancel</span>, connect to the internet, and allow the sync to complete before signing out.
              </p>
            </div>

            <div className="pt-2 flex justify-end gap-3 border-t border-slate-900">
              <button
                type="button"
                onClick={() => setShowSignOutWarning(false)}
                disabled={isSigningOut}
                className="px-4 py-2.5 rounded-lg border border-slate-800 text-sm font-semibold text-slate-400 hover:text-white transition"
              >
                Cancel
              </button>
              <button
                type="button"
                onClick={executeSignOut}
                disabled={isSigningOut}
                className="px-4 py-2.5 rounded-lg bg-red-600 hover:bg-red-500 disabled:opacity-50 text-sm font-semibold text-white transition shadow-lg shadow-red-600/20"
              >
                {isSigningOut ? 'Signing out...' : 'Sign Out Anyway'}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
