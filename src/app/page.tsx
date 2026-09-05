'use client';

import React, { useState, useMemo } from 'react';
import { useRouter } from 'next/navigation';
import { ProtectedRoute } from '../components/ProtectedRoute';
import { AppShell } from '../components/AppShell';
import { useDashboard, useClients, useProfile } from '../lib/data/hooks';
import { DashboardRepo } from '../lib/data/dashboard';
import { useDataReady } from '../lib/data/readiness';
import { formatMoney } from '../lib/money';
import { 
  LayoutDashboard, Receipt, Landmark, AlertTriangle, 
  ChevronRight, TrendingUp, CheckCircle, Clock 
} from 'lucide-react';

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
  const router = useRouter();

  // States
  const [periodDays, setPeriodDays] = useState<30 | 90 | 365>(30);
  const [showAllOutstanding, setShowAllOutstanding] = useState(false);

  // Queries
  const { data: profile } = useProfile();
  const liveDefaultCurrency = (profile?.default_currency || 'USD').toUpperCase();

  const { data: dashboard, isCached, cachedAt } = useDashboard(periodDays, liveDefaultCurrency);
  const { data: clients } = useClients();

  // If dashboard is cached, use its cached defaultCurrency and invoices immediately without waiting
  const defaultCurrency = (isCached && dashboard?.defaultCurrency) ? dashboard.defaultCurrency : liveDefaultCurrency;
  const allInvoices = dashboard?.invoices || [];

  // 1. Proven data exists if cached snapshot has actual records OR real rows have landed in React state
  const hasCachedData = isCached && (
    (dashboard?.invoices && dashboard.invoices.length > 0) ||
    (dashboard?.outstanding && dashboard.outstanding.some(o => o.amountMinor > 0)) ||
    (dashboard?.earnings && dashboard.earnings.length > 0) ||
    (dashboard?.recentPayments && dashboard.recentPayments.length > 0)
  );
  const hasProvenData = hasCachedData || (clients !== undefined && clients.length > 0) || allInvoices.length > 0;

  // 2. Lifted deterministic readiness gate (ADR 036)
  const { isLoading, isConfirmedEmpty } = useDataReady(hasProvenData, DashboardRepo.isAccountEmpty);

  // 3. First-run onboarding: ONLY true if SQLite explicitly confirmed 0 rows on disk
  const isFirstRun = isConfirmedEmpty === true;

  // Resolve active currencies in dashboard context
  const activeCurrencies = useMemo(() => {
    const currencies = new Set<string>();
    if (dashboard?.outstanding) {
      dashboard.outstanding.forEach(o => {
        if (o.amountMinor > 0) currencies.add(o.currency.toUpperCase());
      });
    }
    if (dashboard?.earnings) {
      dashboard.earnings.forEach(e => {
        currencies.add(e.currency.toUpperCase());
      });
    }
    if (dashboard?.recentPayments) {
      dashboard.recentPayments.forEach(p => {
        currencies.add(p.currency.toUpperCase());
      });
    }
    return Array.from(currencies);
  }, [dashboard]);

  const isMultiCurrency = activeCurrencies.length > 1;

  // Derive counts directly from active invoices
  const invoiceCountsByCurrency = useMemo(() => {
    const counts: Record<string, { total: number; overdue: number }> = {};
    if (allInvoices) {
      allInvoices.forEach(inv => {
        const curr = inv.currency.toUpperCase();
        if (!counts[curr]) {
          counts[curr] = { total: 0, overdue: 0 };
        }
        const isOutstanding = (inv.displayStatus === 'sent' || inv.displayStatus === 'overdue') && inv.balanceDueMinor > 0;
        if (isOutstanding) {
          counts[curr].total += 1;
          if (inv.displayStatus === 'overdue') {
            counts[curr].overdue += 1;
          }
        }
      });
    }
    return counts;
  }, [allInvoices]);

  // Collapse outstanding cards logic
  const sortedOutstanding = useMemo(() => {
    if (!dashboard?.outstanding) return [];
    
    // Filtering out zero balances
    const active = dashboard.outstanding.filter(o => o.amountMinor > 0);
    const defaultCurrency = (profile?.default_currency || 'USD').toUpperCase();
    
    return [...active].sort((a, b) => {
      const aCurr = a.currency.toUpperCase();
      const bCurr = b.currency.toUpperCase();
      if (aCurr === defaultCurrency && bCurr !== defaultCurrency) return -1;
      if (aCurr !== defaultCurrency && bCurr === defaultCurrency) return 1;
      return b.amountMinor - a.amountMinor;
    });
  }, [dashboard?.outstanding, profile?.default_currency]);

  const displayedOutstanding = useMemo(() => {
    if (showAllOutstanding || sortedOutstanding.length <= 3) {
      return sortedOutstanding;
    }
    return sortedOutstanding.slice(0, 3);
  }, [sortedOutstanding, showAllOutstanding]);

  // Earnings sorted logic
  const sortedEarnings = useMemo(() => {
    if (!dashboard?.earnings) return [];
    const defaultCurrency = (profile?.default_currency || 'USD').toUpperCase();

    return [...dashboard.earnings].sort((a, b) => {
      const aCurr = a.currency.toUpperCase();
      const bCurr = b.currency.toUpperCase();
      if (aCurr === defaultCurrency && bCurr !== defaultCurrency) return -1;
      if (aCurr !== defaultCurrency && bCurr === defaultCurrency) return 1;
      return b.amountMinor - a.amountMinor;
    });
  }, [dashboard?.earnings, profile?.default_currency]);

  // Extract attention items (overdue invoices, oldest due date first)
  const attentionInvoices = useMemo(() => {
    if (!allInvoices) return [];
    
    const overdue = allInvoices.filter(inv => inv.displayStatus === 'overdue' && inv.balanceDueMinor > 0);
    
    return overdue.sort((a, b) => {
      const dateA = a.due_date || '';
      const dateB = b.due_date || '';
      return dateA.localeCompare(dateB);
    });
  }, [allInvoices]);

  const getDaysOverdue = (dueDate: string | null | undefined) => {
    if (!dueDate) return 0;
    const today = new Date().toISOString().split('T')[0];
    const todayTime = new Date(today).getTime();
    const dueTime = new Date(dueDate).getTime();
    const diffTime = todayTime - dueTime;
    const diffDays = Math.ceil(diffTime / (1000 * 60 * 60 * 24));
    return Math.max(0, diffDays);
  };


  // Period label translation
  const periodLabel = {
    30: 'Last 30 Days',
    90: 'Last 90 Days',
    365: 'This Year'
  }[periodDays];

  // Format relative timestamp for cached snapshot badge
  const formatCachedAgo = (timestamp?: number) => {
    if (!timestamp) return 'earlier';
    const seconds = Math.floor((Date.now() - timestamp) / 1000);
    if (seconds < 60) return `${Math.max(1, seconds)}s ago`;
    const minutes = Math.floor(seconds / 60);
    if (minutes < 60) return `${minutes}m ago`;
    const hours = Math.floor(minutes / 60);
    if (hours < 24) return `${hours}h ago`;
    return `${Math.floor(hours / 24)}d ago`;
  };

  return (
    <div className="space-y-8 animate-fade-in text-left">
      
      {/* 1. Header Title */}
      <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4">
        <div>
          <h1 className="text-3xl font-black text-white tracking-tight flex items-center gap-3">
            <LayoutDashboard className="h-8 w-8 text-indigo-500" />
            Financial Dashboard
          </h1>
          <div className="flex flex-wrap items-center gap-2 mt-1 min-h-[22px]">
            <p className="text-xs text-slate-400">Real-time ledger balances and aggregates</p>
            {isCached && (
              <span className="inline-flex items-center gap-1.5 px-2.5 py-0.5 rounded-full text-[11px] font-medium bg-amber-500/10 text-amber-400 border border-amber-500/20 transition-opacity duration-300 animate-fade-in">
                <Clock className="w-3 h-3 text-amber-400 shrink-0" />
                Showing snapshot from {formatCachedAgo(cachedAt)}
              </span>
            )}
          </div>
        </div>

        {/* Global Period Selector (disclosed on header/earnings card) */}
        {!isFirstRun && !isLoading && (
          <div className="flex bg-slate-900/50 border border-slate-900 rounded-xl p-1 shrink-0 self-start sm:self-auto shadow-inner">
            {([30, 90, 365] as const).map((days) => (
              <button
                key={days}
                onClick={() => setPeriodDays(days)}
                className={`px-3 py-1.5 rounded-lg text-xs font-bold transition-all ${
                  periodDays === days
                    ? 'bg-indigo-600 text-white shadow shadow-indigo-600/20'
                    : 'text-slate-500 hover:text-slate-300'
                }`}
              >
                {days === 365 ? 'This Year' : `${days} Days`}
              </button>
            ))}
          </div>
        )}
      </div>

      {isLoading ? (
        <div className="grid grid-cols-1 lg:grid-cols-3 gap-6 animate-pulse">
          <div className="lg:col-span-2 space-y-6">
            <div className="h-40 rounded-3xl border border-slate-900 bg-slate-900/10"></div>
            <div className="h-44 rounded-3xl border border-slate-900 bg-slate-900/10"></div>
          </div>
          <div className="h-96 rounded-3xl border border-slate-900 bg-slate-900/10"></div>
        </div>
      ) : isFirstRun ? (
        <div className="max-w-xl mx-auto rounded-3xl border border-slate-900 bg-gradient-to-br from-slate-950 to-slate-900/50 p-8 shadow-2xl space-y-6 text-center">
          <div className="mx-auto flex h-14 w-14 items-center justify-center rounded-2xl bg-indigo-950/40 text-indigo-400">
            <CheckCircle className="h-7 w-7" />
          </div>
          <div className="space-y-2">
            <h3 className="text-xl font-bold text-white">Let&apos;s set up your business</h3>
            <p className="text-sm text-slate-400 leading-relaxed max-w-sm mx-auto">
              Follow these simple steps to register offline-first clients, generate professional billing documents, and track manual payments.
            </p>
          </div>

          <div className="space-y-3.5 text-left max-w-sm mx-auto">
            <div 
              onClick={() => router.push('/clients')}
              className="rounded-2xl border border-slate-900 bg-slate-950/50 p-4 flex items-start gap-4 hover:border-slate-800 transition cursor-pointer group"
            >
              <div className="h-6 w-6 rounded-full bg-slate-900 border border-slate-800 flex items-center justify-center text-xs font-bold text-indigo-400 shrink-0">1</div>
              <div className="space-y-1">
                <span className="block font-bold text-sm text-white group-hover:text-indigo-400 transition">Add your first client</span>
                <span className="block text-xs text-slate-500">Log client billing coordinates and default currency.</span>
              </div>
              <ChevronRight className="h-4 w-4 text-slate-600 ml-auto self-center group-hover:text-slate-400 group-hover:translate-x-0.5 transition" />
            </div>

            <div 
              onClick={() => router.push('/clients')}
              className="rounded-2xl border border-slate-900 bg-slate-950/50 p-4 flex items-start gap-4 hover:border-slate-800 transition cursor-pointer group opacity-60 hover:opacity-100"
            >
              <div className="h-6 w-6 rounded-full bg-slate-900 border border-slate-800 flex items-center justify-center text-xs font-bold text-indigo-400 shrink-0">2</div>
              <div className="space-y-1">
                <span className="block font-bold text-sm text-white group-hover:text-indigo-400 transition">Issue your first invoice</span>
                <span className="block text-xs text-slate-500">Build custom line items and set payment due dates.</span>
              </div>
              <ChevronRight className="h-4 w-4 text-slate-600 ml-auto self-center group-hover:text-slate-400 group-hover:translate-x-0.5 transition" />
            </div>
          </div>
        </div>
      ) : (
        <div className="grid grid-cols-1 lg:grid-cols-3 gap-6 items-start">
          
          <div className="lg:col-span-2 space-y-6">
            
            <div className="rounded-3xl border border-slate-900 bg-gradient-to-br from-slate-950 to-slate-950/20 p-6 space-y-5 shadow-lg">
              <div className="flex items-center justify-between border-b border-slate-900/60 pb-3">
                <div className="flex items-center gap-2">
                  <Landmark className="h-5 w-5 text-amber-500" />
                  <h3 className="text-base font-extrabold text-white uppercase tracking-wider">Outstanding Balances</h3>
                </div>
              </div>

              <div className="space-y-3">
                {sortedOutstanding.length > 0 ? (
                  <>
                    {displayedOutstanding.map((out) => {
                      const currKey = out.currency.toUpperCase();
                      const invoiceCount = invoiceCountsByCurrency[currKey]?.total || 0;
                      const overdueCount = invoiceCountsByCurrency[currKey]?.overdue || 0;
                      return (
                        <div 
                          key={out.currency}
                          onClick={() => router.push(`/invoices?status=outstanding&currency=${out.currency}`)}
                          className="rounded-2xl border border-slate-900/60 bg-slate-950/40 p-4.5 flex flex-col sm:flex-row sm:items-center justify-between gap-3 group hover:border-slate-800 transition cursor-pointer"
                        >
                          <div className="flex items-center gap-3">
                            <span className="font-mono font-bold text-sm bg-slate-900 text-indigo-400 border border-slate-800 px-2 py-0.5 rounded-lg">
                              {out.currency.toUpperCase()}
                            </span>
                            {isMultiCurrency && (
                              <span className="text-xs text-slate-500 font-medium">
                                {invoiceCount} {invoiceCount === 1 ? 'Invoice' : 'Invoices'}
                              </span>
                            )}
                          </div>

                          <div className="flex items-center gap-4 sm:justify-end">
                            <div className="text-right">
                              <span className="text-lg font-black text-white group-hover:text-indigo-400 transition tracking-tight">
                                {formatMoney({ amountMinor: out.amountMinor, currency: out.currency })}
                              </span>
                              {overdueCount > 0 && (
                                <span className="block text-[11px] font-bold text-red-400">
                                  {overdueCount} overdue
                                </span>
                              )}
                            </div>
                            <ChevronRight className="h-4 w-4 text-slate-600 group-hover:text-slate-400 group-hover:translate-x-0.5 transition" />
                          </div>
                        </div>
                      );
                    })}

                    {sortedOutstanding.length > 2 && (
                      <button
                        onClick={() => setShowAllOutstanding(!showAllOutstanding)}
                        className="w-full text-center py-2 text-xs font-bold text-indigo-400 hover:text-indigo-300 transition"
                      >
                        {showAllOutstanding ? 'Show Less' : `+${sortedOutstanding.length - 2} More Currencies`}
                      </button>
                    )}
                  </>
                ) : (
                  <div className="text-center py-6 text-slate-500 text-xs">
                    No outstanding invoices. You&apos;re completely caught up!
                  </div>
                )}
              </div>
            </div>

            <div className="rounded-3xl border border-slate-900 bg-gradient-to-br from-slate-950 to-slate-950/20 p-6 space-y-5 shadow-lg">
              <div className="flex items-center justify-between border-b border-slate-900/60 pb-3">
                <div className="flex items-center gap-2">
                  <TrendingUp className="h-5 w-5 text-emerald-400" />
                  <h3 className="text-base font-extrabold text-white uppercase tracking-wider">Earnings</h3>
                </div>
                <span className="text-xs font-medium text-slate-500">
                  Past {periodDays === 365 ? '12 Months' : `${periodDays} Days`}
                </span>
              </div>

              <div className="space-y-3">
                {sortedEarnings.length > 0 ? (
                  sortedEarnings.map((e) => (
                    <div 
                      key={e.currency}
                      className="rounded-2xl border border-slate-900/60 bg-slate-950/40 p-4.5 flex items-center justify-between gap-3"
                    >
                      <span className="font-mono font-bold text-sm bg-slate-900 text-emerald-400 border border-slate-800 px-2 py-0.5 rounded-lg">
                        {e.currency.toUpperCase()}
                      </span>
                      <span className="text-lg font-black text-white tracking-tight">
                        {formatMoney({ amountMinor: e.amountMinor, currency: e.currency })}
                      </span>
                    </div>
                  ))
                ) : (
                  <div className="text-center py-6 text-slate-500 text-xs">
                    No earnings collected in this period.
                  </div>
                )}
              </div>
            </div>

            <div className="rounded-3xl border border-slate-900 bg-gradient-to-br from-slate-950 to-slate-950/20 p-6 space-y-5 shadow-lg">
              <div className="flex items-center justify-between border-b border-slate-900/60 pb-3">
                <div className="flex items-center gap-2">
                  <Receipt className="h-5 w-5 text-indigo-400" />
                  <h3 className="text-base font-extrabold text-white uppercase tracking-wider">Recent Activity</h3>
                </div>
                <span className="text-xs font-medium text-slate-500">Latest 10 Events</span>
              </div>

              <div className="divide-y divide-slate-900/50">
                {dashboard?.recentPayments && dashboard.recentPayments.length > 0 ? (
                  dashboard.recentPayments.map((p) => {
                    const isReversal = !!p.reverses_id || p.amount_minor < 0;
                    return (
                      <div key={p.id} className="py-3.5 flex items-center justify-between gap-4 first:pt-0 last:pb-0">
                        <div className="space-y-0.5">
                          <div className="flex items-center gap-2">
                            <span className="font-extrabold text-sm text-white">
                              {p.client_name || 'Client'}
                            </span>
                            {p.invoice_number && (
                              <span 
                                onClick={() => router.push(`/invoices/${p.invoice_id}`)}
                                className="text-xs text-indigo-400 hover:underline cursor-pointer font-medium"
                              >
                                #{p.invoice_number}
                              </span>
                            )}
                          </div>
                          <span className="block text-[11px] text-slate-500 font-medium">
                            {p.occurred_at || new Date(p.created_at).toLocaleDateString()} &bull; {p.method}
                          </span>
                        </div>

                        <div className="text-right">
                          <span className={`text-sm font-extrabold tabular-nums ${isReversal ? 'text-rose-400' : 'text-emerald-400'}`}>
                            {isReversal ? '-' : '+'}{formatMoney({ amountMinor: Math.abs(p.amount_minor), currency: p.currency })}
                          </span>
                          {isReversal && (
                            <span className="block text-[10px] font-bold text-rose-500/80 uppercase">
                              Reversal
                            </span>
                          )}
                        </div>
                      </div>
                    );
                  })
                ) : (
                  <div className="text-center py-6 text-slate-500 text-xs">
                    No payment transactions recorded yet.
                  </div>
                )}
              </div>
            </div>

          </div>

          <div className="space-y-6">
            {attentionInvoices.length > 0 && (
              <div className="rounded-3xl border border-red-950/20 bg-gradient-to-br from-red-950/5 to-slate-950/20 p-6 space-y-4 shadow-lg">
                <h3 className="text-xs font-bold text-red-400 uppercase tracking-widest flex items-center gap-1.5 border-b border-red-950/30 pb-2.5">
                  <Clock className="h-4 w-4 text-red-500" />
                  Needs Attention
                </h3>
                <div className="space-y-3">
                  {attentionInvoices.map((inv) => {
                    const days = getDaysOverdue(inv.due_date);
                    return (
                      <div key={inv.id} onClick={() => router.push(`/invoices/${inv.id}`)} className="rounded-2xl border border-slate-900 bg-slate-950/40 p-4 flex flex-col gap-2 hover:border-slate-800 transition cursor-pointer group">
                        <div className="flex items-center justify-between">
                          <span className="font-extrabold text-sm text-white group-hover:text-indigo-400 transition">{inv.invoice_number}</span>
                          <span className="text-xs font-bold text-red-400">{days}d overdue</span>
                        </div>
                        <div className="flex items-end justify-between border-t border-slate-900/50 pt-2 text-[10px] text-slate-500 font-semibold">
                          <span>{inv.client_name}</span>
                          <span className="font-extrabold text-xs text-white">{formatMoney({ amountMinor: inv.balanceDueMinor, currency: inv.currency })}</span>
                        </div>
                      </div>
                    );
                  })}
                </div>
              </div>
            )}
          </div>
        </div>
      )}
    </div>
  );
}
