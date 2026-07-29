'use client';

import React from 'react';
import { ProtectedRoute } from '../components/ProtectedRoute';
import { AppShell } from '../components/AppShell';
import { useDashboard } from '../lib/data/hooks';
import { formatMoney } from '../lib/money';
import { LayoutDashboard, Receipt, UserCheck, AlertTriangle } from 'lucide-react';

export default function Home() {
  return (
    <ProtectedRoute>
      <AppShell>
        <DashboardView />
      </AppShell>
    </ProtectedRoute>
  );
}

function DashboardView() {
  // Pull dashboard data for 30-day period
  const { data: dashboard, isLoading } = useDashboard(30);

  return (
    <div className="space-y-8 animate-fade-in">
      {/* Title */}
      <div>
        <h1 className="text-3xl font-bold tracking-tight text-white flex items-center gap-3">
          <LayoutDashboard className="h-8 w-8 text-indigo-500" />
          Dashboard
        </h1>
        <p className="text-sm text-slate-400 mt-1">Financial summary and invoicing overview</p>
      </div>

      {isLoading ? (
        <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
          <div className="rounded-2xl border border-slate-900 bg-slate-900/10 p-6 animate-pulse h-32"></div>
          <div className="rounded-2xl border border-slate-900 bg-slate-900/10 p-6 animate-pulse h-32"></div>
        </div>
      ) : (
        <div className="space-y-8">
          {/* Metrics summary row */}
          <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
            {/* Outstanding Balance Panel */}
            <div className="rounded-2xl border border-slate-900 bg-gradient-to-br from-slate-900/50 to-slate-950 p-6 backdrop-blur-xl space-y-4">
              <div className="flex items-center justify-between">
                <span className="text-sm font-semibold text-slate-400 uppercase tracking-wider">Outstanding Balances</span>
                <AlertTriangle className="h-5 w-5 text-amber-500" />
              </div>
              <div className="space-y-2">
                {dashboard?.outstanding && dashboard.outstanding.length > 0 ? (
                  dashboard.outstanding.map((out) => (
                    <div key={out.currency} className="flex justify-between items-baseline border-b border-slate-900/40 pb-2 last:border-0 last:pb-0">
                      <span className="text-slate-400 font-bold text-sm">{out.currency}</span>
                      <span className="text-2xl font-extrabold text-white">
                        {formatMoney({ amountMinor: out.amountMinor, currency: out.currency })}
                      </span>
                    </div>
                  ))
                ) : (
                  <p className="text-slate-500 font-semibold text-sm">No outstanding balances</p>
                )}
              </div>
            </div>

            {/* Rolling Earnings Panel */}
            <div className="rounded-2xl border border-slate-900 bg-gradient-to-br from-slate-900/50 to-slate-950 p-6 backdrop-blur-xl space-y-4">
              <div className="flex items-center justify-between">
                <span className="text-sm font-semibold text-slate-400 uppercase tracking-wider">30-Day Earnings</span>
                <Receipt className="h-5 w-5 text-emerald-500" />
              </div>
              <div className="space-y-2">
                {dashboard?.earnings && dashboard.earnings.length > 0 ? (
                  dashboard.earnings.map((earning) => (
                    <div key={earning.currency} className="flex justify-between items-baseline border-b border-slate-900/40 pb-2 last:border-0 last:pb-0">
                      <span className="text-slate-400 font-bold text-sm">{earning.currency}</span>
                      <span className="text-2xl font-extrabold text-emerald-400">
                        {formatMoney({ amountMinor: earning.amountMinor, currency: earning.currency })}
                      </span>
                    </div>
                  ))
                ) : (
                  <p className="text-slate-500 font-semibold text-sm">No earnings in this period</p>
                )}
              </div>
            </div>
          </div>

          {/* Placeholder Notification */}
          <div className="rounded-2xl border border-slate-900 bg-slate-900/10 p-8 text-center max-w-xl mx-auto space-y-4 pt-12">
            <div className="mx-auto flex h-12 w-12 items-center justify-center rounded-full bg-indigo-950/40 text-indigo-400">
              <UserCheck className="h-6 w-6" />
            </div>
            <h3 className="text-lg font-bold text-white">Application Ready</h3>
            <p className="text-sm text-slate-400 leading-relaxed">
              Authentication and offline settings sync are fully operational. Financial analytics dashboards and client portals are connected to database tables.
            </p>
          </div>
        </div>
      )}
    </div>
  );
}
