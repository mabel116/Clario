'use client';

import React, { useState, useMemo, useEffect } from 'react';
import Link from 'next/link';
import { ProtectedRoute } from '../components/ProtectedRoute';
import { AppShell } from '../components/AppShell';
import { useDashboard, useClients, useProfile } from '../lib/data/hooks';
import { DashboardRepo } from '../lib/data/dashboard';
import { useDataReady } from '../lib/data/readiness';
import { useSyncStatus } from '../lib/sync/hooks';
import { Money } from '../components/ui/money';
import { 
  Receipt, Landmark, 
  ChevronRight, TrendingUp, CheckCircle, Clock, AlertCircle 
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
  // States
  const [periodDays, setPeriodDays] = useState<30 | 90 | 365>(30);
  const [showAllOutstanding, setShowAllOutstanding] = useState(false);

  // Queries
  const { data: profile } = useProfile();
  const liveDefaultCurrency = (profile?.default_currency || 'USD').toUpperCase();

  const { data: dashboard, isCached, cachedAt } = useDashboard(periodDays, liveDefaultCurrency);
  const { data: clients } = useClients();

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
  const overdueInvoices = useMemo(() => {
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

  const { lastSyncedAt } = useSyncStatus();
  const effectiveTimestamp = lastSyncedAt ? lastSyncedAt.getTime() : cachedAt;
  const [cachedAgoText, setCachedAgoText] = useState(() => formatCachedAgo(effectiveTimestamp));

  useEffect(() => {
    const updateTime = () => {
      setCachedAgoText(formatCachedAgo(effectiveTimestamp));
    };
    updateTime();

    const interval = setInterval(updateTime, 10000);
    const onVisibilityChange = () => {
      if (document.visibilityState === 'visible') {
        updateTime();
      }
    };
    const onFocus = () => {
      updateTime();
    };

    window.addEventListener('visibilitychange', onVisibilityChange);
    window.addEventListener('focus', onFocus);

    return () => {
      clearInterval(interval);
      window.removeEventListener('visibilitychange', onVisibilityChange);
      window.removeEventListener('focus', onFocus);
    };
  }, [effectiveTimestamp]);

  return (
    <div className="space-y-6 text-left">
      
      {/* 1. Page Header & Period Selector */}
      <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4">
        <div>
          <h1 className="text-2xl font-bold tracking-tight text-gray-900 dark:text-white">
            Dashboard
          </h1>
          <div className="flex flex-wrap items-center gap-2 mt-1 min-h-[22px]">
            <p className="text-xs text-gray-500 dark:text-zinc-400">
              Real-time ledger balances and aggregates
            </p>
            {isCached && (
              <span className="inline-flex items-center gap-1.5 px-2.5 py-0.5 rounded-full text-[11px] font-medium bg-amber-500/10 text-amber-600 dark:text-amber-400 border border-amber-500/20 transition-opacity duration-300">
                <Clock className="w-3 h-3 text-amber-500 shrink-0" />
                Showing snapshot from {cachedAgoText}
              </span>
            )}
          </div>
        </div>

        {/* Global Period Selector */}
        {!isFirstRun && !isLoading && (
          <div className="bg-gray-100 dark:bg-[#1c1c21] p-1 rounded-xl border border-gray-200 dark:border-[#27272a] inline-flex items-center gap-1 shrink-0 self-start sm:self-auto shadow-xs">
            {([30, 90, 365] as const).map((days) => {
              const label = days === 365 ? 'This Year' : `${days} Days`;
              const isActive = periodDays === days;
              return (
                <button
                  key={days}
                  type="button"
                  onClick={() => setPeriodDays(days)}
                  className={`px-3 py-1.5 text-xs rounded-lg transition-all tap-target ${
                    isActive
                      ? 'bg-white dark:bg-[#27272a] text-gray-900 dark:text-white font-semibold shadow-xs'
                      : 'text-gray-600 dark:text-zinc-400 hover:text-gray-900 dark:hover:text-white font-medium transition-colors'
                  }`}
                >
                  {label}
                </button>
              );
            })}
          </div>
        )}
      </div>

      {isLoading ? (
        <div className="grid grid-cols-1 lg:grid-cols-3 gap-6 animate-pulse">
          <div className="lg:col-span-2 space-y-6">
            <div className="h-44 rounded-2xl border border-gray-200 dark:border-[#27272a] bg-gray-100 dark:bg-[#121215]" />
            <div className="h-44 rounded-2xl border border-gray-200 dark:border-[#27272a] bg-gray-100 dark:bg-[#121215]" />
            <div className="h-56 rounded-2xl border border-gray-200 dark:border-[#27272a] bg-gray-100 dark:bg-[#121215]" />
          </div>
          <div className="h-80 rounded-2xl border border-gray-200 dark:border-[#27272a] bg-gray-100 dark:bg-[#121215]" />
        </div>
      ) : isFirstRun ? (
        <div className="max-w-xl mx-auto rounded-2xl border border-gray-200 dark:border-[#27272a] bg-white dark:bg-[#121215] p-8 shadow-xs space-y-6 text-center">
          <div className="mx-auto flex h-14 w-14 items-center justify-center rounded-2xl bg-blue-50 dark:bg-blue-950/40 text-blue-600 dark:text-blue-400">
            <CheckCircle className="h-7 w-7" />
          </div>
          <div className="space-y-2">
            <h3 className="text-xl font-bold text-gray-900 dark:text-white">Let&apos;s set up your business</h3>
            <p className="text-sm text-gray-500 dark:text-zinc-400 leading-relaxed max-w-sm mx-auto">
              Follow these simple steps to register offline-first clients, generate professional billing documents, and track manual payments.
            </p>
          </div>

          <div className="space-y-3.5 text-left max-w-sm mx-auto">
            <Link 
              href="/clients"
              prefetch={false}
              className="rounded-xl border border-gray-200 dark:border-[#27272a] bg-gray-50 dark:bg-[#1c1c21] p-4 flex items-start gap-4 hover:border-gray-300 dark:hover:border-zinc-700 transition cursor-pointer group"
            >
              <div className="h-6 w-6 rounded-full bg-white dark:bg-[#121215] border border-gray-200 dark:border-[#27272a] flex items-center justify-center text-xs font-bold text-blue-600 dark:text-blue-400 shrink-0">1</div>
              <div className="space-y-1">
                <span className="block font-bold text-sm text-gray-900 dark:text-white group-hover:text-blue-600 dark:group-hover:text-blue-400 transition">Add your first client</span>
                <span className="block text-xs text-gray-500 dark:text-zinc-400">Log client billing coordinates and default currency.</span>
              </div>
              <ChevronRight className="h-4 w-4 text-gray-400 dark:text-zinc-500 ml-auto self-center group-hover:text-gray-600 dark:group-hover:text-zinc-300 group-hover:translate-x-0.5 transition" />
            </Link>

            <Link 
              href="/clients"
              prefetch={false}
              className="rounded-xl border border-gray-200 dark:border-[#27272a] bg-gray-50 dark:bg-[#1c1c21] p-4 flex items-start gap-4 hover:border-gray-300 dark:hover:border-zinc-700 transition cursor-pointer group opacity-60 hover:opacity-100"
            >
              <div className="h-6 w-6 rounded-full bg-white dark:bg-[#121215] border border-gray-200 dark:border-[#27272a] flex items-center justify-center text-xs font-bold text-blue-600 dark:text-blue-400 shrink-0">2</div>
              <div className="space-y-1">
                <span className="block font-bold text-sm text-gray-900 dark:text-white group-hover:text-blue-600 dark:group-hover:text-blue-400 transition">Issue your first invoice</span>
                <span className="block text-xs text-gray-500 dark:text-zinc-400">Build custom line items and set payment due dates.</span>
              </div>
              <ChevronRight className="h-4 w-4 text-gray-400 dark:text-zinc-500 ml-auto self-center group-hover:text-gray-600 dark:group-hover:text-zinc-300 group-hover:translate-x-0.5 transition" />
            </Link>
          </div>
        </div>
      ) : (
        /* 2. Main Layout Structure (Desktop 2 Columns) */
        <div className="grid grid-cols-1 lg:grid-cols-3 gap-6 items-start">
          
          {/* Left Column (lg:col-span-2 space-y-6): Outstanding Balances, Earnings, Recent Activity */}
          <div className="lg:col-span-2 space-y-6">
            
            {/* 3. Outstanding Balances Card */}
            <div className="bg-white dark:bg-[#121215] border border-gray-200 dark:border-[#27272a] rounded-2xl p-6 shadow-xs space-y-4">
              <div className="flex items-center justify-between border-b border-gray-100 dark:border-[#27272a] pb-3">
                <div className="flex items-center gap-2">
                  <Landmark className="h-4 w-4 text-amber-500" />
                  <h3 className="text-xs font-semibold tracking-wider uppercase text-gray-500 dark:text-zinc-400">
                    Outstanding Balances
                  </h3>
                </div>
              </div>

              <div className="space-y-2.5">
                {sortedOutstanding.length > 0 ? (
                  <>
                    {displayedOutstanding.map((out) => {
                      const currKey = out.currency.toUpperCase();
                      const invoiceCount = invoiceCountsByCurrency[currKey]?.total || 0;
                      const overdueCount = invoiceCountsByCurrency[currKey]?.overdue || 0;
                      return (
                        <Link 
                          key={out.currency}
                          href={`/invoices?status=outstanding&currency=${out.currency}`}
                          prefetch={false}
                          className="flex items-center justify-between p-3.5 rounded-xl hover:bg-gray-50 dark:hover:bg-[#1c1c21] transition-colors border border-transparent hover:border-gray-200 dark:hover:border-[#27272a] group block tap-target"
                        >
                          <div className="flex items-center gap-3">
                            <span className="bg-gray-100 dark:bg-[#1c1c21] text-gray-700 dark:text-zinc-300 font-mono text-xs px-2.5 py-1 rounded-md font-semibold border border-gray-200/60 dark:border-[#27272a]">
                              {out.currency.toUpperCase()}
                            </span>
                            {isMultiCurrency && (
                              <span className="text-xs text-gray-500 dark:text-zinc-400 font-medium">
                                {invoiceCount} {invoiceCount === 1 ? 'Invoice' : 'Invoices'}
                              </span>
                            )}
                          </div>

                          <div className="flex items-center gap-4 sm:justify-end">
                            <div className="text-right">
                              <Money
                                amountMinor={out.amountMinor}
                                currency={out.currency}
                                variant="table"
                                tone="attention"
                                className="text-base font-bold"
                              />
                              {overdueCount > 0 && (
                                <span className="block text-[11px] font-semibold text-rose-600 dark:text-rose-400">
                                  {overdueCount} overdue
                                </span>
                              )}
                            </div>
                            <ChevronRight className="h-4 w-4 text-gray-400 dark:text-zinc-500 group-hover:text-gray-600 dark:group-hover:text-zinc-300 group-hover:translate-x-0.5 transition-transform" />
                          </div>
                        </Link>
                      );
                    })}

                    {sortedOutstanding.length > 3 && (
                      <button
                        type="button"
                        onClick={() => setShowAllOutstanding(!showAllOutstanding)}
                        className="w-full text-center py-2 text-xs font-semibold text-blue-600 hover:text-blue-700 dark:text-blue-400 dark:hover:text-blue-300 transition-colors tap-target"
                      >
                        {showAllOutstanding ? 'Show Less' : `+${sortedOutstanding.length - 3} More Currencies`}
                      </button>
                    )}
                  </>
                ) : (
                  <div className="text-center py-6 text-gray-500 dark:text-zinc-400 text-xs">
                    No outstanding invoices. You&apos;re completely caught up!
                  </div>
                )}
              </div>
            </div>

            {/* 4. Earnings Card */}
            <div className="bg-white dark:bg-[#121215] border border-gray-200 dark:border-[#27272a] rounded-2xl p-6 shadow-xs space-y-4">
              <div className="flex items-center justify-between border-b border-gray-100 dark:border-[#27272a] pb-3">
                <div className="flex items-center gap-2">
                  <TrendingUp className="h-4 w-4 text-emerald-500" />
                  <h3 className="text-xs font-semibold tracking-wider uppercase text-gray-500 dark:text-zinc-400">
                    Earnings
                  </h3>
                </div>
                <span className="text-xs font-medium text-gray-500 dark:text-zinc-400">
                  Past {periodDays === 365 ? '12 Months' : `${periodDays} Days`}
                </span>
              </div>

              <div className="space-y-2">
                {sortedEarnings.length > 0 ? (
                  sortedEarnings.map((e) => (
                    <div 
                      key={e.currency}
                      className="flex items-center justify-between p-3.5 rounded-xl bg-gray-50/50 dark:bg-[#1c1c21]/50 border border-gray-100 dark:border-[#27272a]/60"
                    >
                      <span className="bg-gray-100 dark:bg-[#1c1c21] text-emerald-700 dark:text-emerald-400 font-mono text-xs px-2.5 py-1 rounded-md font-semibold border border-emerald-200/50 dark:border-emerald-500/20">
                        {e.currency.toUpperCase()}
                      </span>
                      <Money
                        amountMinor={e.amountMinor}
                        currency={e.currency}
                        variant="table"
                        tone="positive"
                        className="text-base font-bold"
                      />
                    </div>
                  ))
                ) : (
                  <div className="text-center py-6 text-gray-500 dark:text-zinc-400 text-xs">
                    No earnings collected in this period.
                  </div>
                )}
              </div>
            </div>

            {/* 5. Recent Activity Card */}
            <div className="bg-white dark:bg-[#121215] border border-gray-200 dark:border-[#27272a] rounded-2xl p-6 shadow-xs space-y-4">
              <div className="flex items-center justify-between border-b border-gray-100 dark:border-[#27272a] pb-3">
                <div className="flex items-center gap-2">
                  <Receipt className="h-4 w-4 text-blue-500" />
                  <h3 className="text-xs font-semibold tracking-wider uppercase text-gray-500 dark:text-zinc-400">
                    Recent Activity
                  </h3>
                </div>
                <span className="text-xs font-medium text-gray-500 dark:text-zinc-400">Latest 10 Events</span>
              </div>

              <div className="divide-y divide-gray-100 dark:divide-[#27272a]/60">
                {dashboard?.recentPayments && dashboard.recentPayments.length > 0 ? (
                  dashboard.recentPayments.map((p) => {
                    const isReversal = !!p.reverses_id || p.amount_minor < 0;
                    return (
                      <div key={p.id} className="py-3.5 flex items-center justify-between gap-4 first:pt-0 last:pb-0">
                        <div className="space-y-0.5 min-w-0">
                          <div className="flex items-center gap-2">
                            <span className="font-semibold text-sm text-gray-900 dark:text-white truncate">
                              {p.client_name || 'Client'}
                            </span>
                            {p.invoice_number && (
                              <Link 
                                href={`/invoices/${p.invoice_id}?from=/`}
                                prefetch={false}
                                className="text-xs text-blue-600 dark:text-blue-400 hover:underline font-medium shrink-0"
                              >
                                #{p.invoice_number}
                              </Link>
                            )}
                          </div>
                          <span className="block text-[11px] text-gray-500 dark:text-zinc-400 font-medium">
                            {p.occurred_at || new Date(p.created_at).toLocaleDateString()} &bull; {p.method}
                          </span>
                        </div>

                        <div className="text-right shrink-0">
                          <div className="flex items-center justify-end gap-1">
                            {isReversal ? (
                              <span className="text-rose-600 dark:text-rose-400 font-bold text-sm">−</span>
                            ) : (
                              <span className="text-emerald-600 dark:text-emerald-400 font-semibold text-sm">+</span>
                            )}
                            <Money
                              amountMinor={Math.abs(p.amount_minor)}
                              currency={p.currency}
                              variant="table"
                              tone={isReversal ? 'overdue' : 'positive'}
                              className="text-sm font-bold"
                            />
                          </div>
                          {isReversal && (
                            <span className="block text-[10px] font-bold text-rose-600 dark:text-rose-400 uppercase tracking-wider">
                              Reversal
                            </span>
                          )}
                        </div>
                      </div>
                    );
                  })
                ) : (
                  <div className="text-center py-6 text-gray-500 dark:text-zinc-400 text-xs">
                    No payment transactions recorded yet.
                  </div>
                )}
              </div>
            </div>

          </div>

          {/* Right Column (lg:col-span-1): Needs Attention */}
          <div className="lg:col-span-1 space-y-6">
            <div className="bg-white dark:bg-[#121215] border border-gray-200 dark:border-[#27272a] rounded-2xl p-6 shadow-xs space-y-4">
              <div className="flex items-center gap-2 border-b border-gray-100 dark:border-[#27272a] pb-3">
                <AlertCircle className="h-4 w-4 text-rose-600 dark:text-rose-400" />
                <h3 className="text-xs font-semibold tracking-wider uppercase text-rose-600 dark:text-rose-400">
                  Needs Attention
                </h3>
              </div>

              {overdueInvoices.length > 0 ? (
                <>
                  <div className="space-y-3">
                    {overdueInvoices.slice(0, 5).map((inv) => {
                      const days = getDaysOverdue(inv.due_date);
                      return (
                        <Link
                          key={inv.id}
                          href={`/invoices/${inv.id}?from=/`}
                          prefetch={false}
                          className="block p-3.5 rounded-xl border border-rose-100 dark:border-rose-950/40 bg-rose-50/30 dark:bg-rose-950/10 hover:border-rose-200 dark:hover:border-rose-800 transition-colors group tap-target"
                        >
                          <div className="flex items-center justify-between mb-1.5">
                            <span className="text-xs font-semibold text-gray-900 dark:text-white group-hover:text-blue-600 dark:group-hover:text-blue-400 transition-colors">
                              {inv.invoice_number}
                            </span>
                            <span className="text-[11px] font-semibold text-rose-600 dark:text-rose-400 bg-rose-100/60 dark:bg-rose-950/60 px-2 py-0.5 rounded-full">
                              {days}d overdue
                            </span>
                          </div>
                          <div className="flex items-center justify-between text-xs pt-1.5 border-t border-rose-100/60 dark:border-rose-950/30">
                            <span className="text-gray-600 dark:text-zinc-400 font-medium truncate pr-2">
                              {inv.client_name || 'Client'}
                            </span>
                            <Money
                              amountMinor={inv.balanceDueMinor}
                              currency={inv.currency}
                              variant="table"
                              tone="overdue"
                              className="text-xs font-bold"
                            />
                          </div>
                        </Link>
                      );
                    })}
                  </div>

                  {overdueInvoices.length > 5 && (
                    <Link
                      href="/invoices?status=overdue"
                      prefetch={false}
                      className="block text-center py-2.5 text-xs font-semibold text-blue-600 hover:text-blue-700 dark:text-blue-400 dark:hover:text-blue-300 border-t border-gray-100 dark:border-[#27272a] transition-colors tap-target"
                    >
                      View all {overdueInvoices.length} overdue invoices →
                    </Link>
                  )}
                </>
              ) : (
                <div className="text-center py-6 text-gray-500 dark:text-zinc-400 text-xs">
                  All caught up! No invoices require immediate attention.
                </div>
              )}
            </div>
          </div>

        </div>
      )}
    </div>
  );
}
