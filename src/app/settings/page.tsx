'use client';

import React, { useState, useEffect } from 'react';
import { ProtectedRoute } from '../../components/ProtectedRoute';
import { AppShell } from '../../components/AppShell';
import { useProfile } from '../../lib/data/hooks';
import { ProfileRepo } from '../../lib/data/profile';
import { useSyncStatus } from '../../lib/sync/hooks';
import { Check, RefreshCw, AlertCircle, Building, MapPin, BadgeDollarSign, Wifi, WifiOff, Cloud } from 'lucide-react';

export default function SettingsPage() {
  return (
    <ProtectedRoute>
      <AppShell>
        <SettingsForm />
      </AppShell>
    </ProtectedRoute>
  );
}

const SUPPORTED_CURRENCIES = [
  { code: 'USD', name: 'US Dollar ($)' },
  { code: 'EUR', name: 'Euro (€)' },
  { code: 'GBP', name: 'British Pound (£)' },
  { code: 'NGN', name: 'Nigerian Naira (₦)' },
  { code: 'KES', name: 'Kenyan Shilling (Ksh)' },
  { code: 'GHS', name: 'Ghanaian Cedi (₵)' },
  { code: 'ZAR', name: 'South African Rand (R)' },
  { code: 'CAD', name: 'Canadian Dollar (C$)' },
  { code: 'AUD', name: 'Australian Dollar (A$)' },
  { code: 'INR', name: 'Indian Rupee (₹)' },
  { code: 'JPY', name: 'Japanese Yen (¥)' },
  { code: 'KRW', name: 'South Korean Won (₩)' },
];

function SettingsForm() {
  const { data: profile, isLoading: isProfileLoading } = useProfile();
  const { connected, pendingUploads, lastSyncedAt } = useSyncStatus();

  // Form State
  const [businessName, setBusinessName] = useState('');
  const [businessAddress, setBusinessAddress] = useState('');
  const [defaultCurrency, setDefaultCurrency] = useState('USD');

  const [isSaving, setIsSaving] = useState(false);
  const [saveSuccess, setSaveSuccess] = useState(false);
  const [saveError, setSaveError] = useState<string | null>(null);

  // Sync inputs with reactive profile row
  useEffect(() => {
    if (profile) {
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
      setSaveSuccess(true);
      setTimeout(() => setSaveSuccess(false), 3000);
    } catch (err: any) {
      setSaveError(err.message || 'Failed to update profile settings.');
    } finally {
      setIsSaving(false);
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

            {saveSuccess && (
              <div className="mb-6 flex items-center gap-2 rounded-lg bg-emerald-950/40 border border-emerald-900/50 p-3 text-sm text-emerald-400">
                <Check className="h-5 w-5 text-emerald-500" />
                <p>Profile settings updated successfully (saved locally).</p>
              </div>
            )}

            {saveError && (
              <div className="mb-6 flex items-center gap-2.5 rounded-lg bg-red-950/40 border border-red-900/50 p-3 text-sm text-red-400">
                <AlertCircle className="h-5 w-5 text-red-500" />
                <p>{saveError}</p>
              </div>
            )}

            {isProfileLoading ? (
              <div className="flex flex-col items-center justify-center py-12 gap-3 text-slate-500">
                <RefreshCw className="h-8 w-8 animate-spin" />
                <span className="text-sm">Loading profile configurations...</span>
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
                    onChange={(e) => setBusinessName(e.target.value)}
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
                    onChange={(e) => setBusinessAddress(e.target.value)}
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
                      onChange={(e) => setDefaultCurrency(e.target.value)}
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

                <div className="pt-2">
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
                </div>
              </form>
            )}
          </div>
        </div>

        {/* Right Column: Sync Status widget */}
        <div className="space-y-6">
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
        </div>
      </div>
    </div>
  );
}
