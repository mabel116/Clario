'use client';

import React, { useState, useMemo } from 'react';
import { useRouter } from 'next/navigation';
import { ProtectedRoute } from '../components/ProtectedRoute';
import { AppShell } from '../components/AppShell';
import { useDashboard, useClients, useInvoices, useProfile } from '../lib/data/hooks';
import { formatMoney } from '../lib/money';
import { 
  LayoutDashboard, Receipt, Landmark, FileText, AlertTriangle, 
  Users, Plus, ArrowRight, ChevronRight, Calendar, TrendingUp, CheckCircle, Clock 
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
  const { data: dashboard, isLoading: isDashboardLoading } = useDashboard(periodDays);
  const { data: clients, isLoading: isClientsLoading } = useClients();
  const { data: allInvoices, isLoading: isInvoicesLoading } = useInvoices();
  const { data: profile } = useProfile();

  const isLoading = isDashboardLoading || isClientsLoading || isInvoicesLoading;

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

  // Determine if it's first run state
  const isFirstRun = useMemo(() => {
    if (isLoading) return false;
    const hasNoClients = !clients || clients.length === 0;
    const hasNoInvoices = !allInvoices || allInvoices.length === 0;
    return hasNoClients && hasNoInvoices;
  }, [clients, allInvoices, isLoading]);

  // Period label translation
  const periodLabel = {
    30: 'Last 30 Days',
    90: 'Last 90 Days',
    365: 'This Year'
  }[periodDays];

  return (
    <div className="space-y-8 animate-fade-in text-left">
      
      {/* 1. Header Title */}
      <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4">
        <div>
          <h1 className="text-3xl font-black text-white tracking-tight flex items-center gap-3">
            <LayoutDashboard className="h-8 w-8 text-indigo-500" />
            Financial Dashboard
          </h1>
          <p className="text-xs text-slate-400 mt-1">Real-time ledger balances and aggregates</p>
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
        
        /* 2. Onboarding/First-Run Empty State Checklist */
        <div className="max-w-xl mx-auto rounded-3xl border border-slate-900 bg-gradient-to-br from-slate-950 to-slate-900/50 p-8 shadow-2xl space-y-6 text-center">
          <div className="mx-auto flex h-14 w-14 items-center justify-center rounded-2xl bg-indigo-950/40 text-indigo-400">
            <CheckCircle className="h-7 w-7" />
          </div>
          <div className="space-y-2">
            <h3 className="text-xl font-bold text-white">Let's set up your business</h3>
            <p className="text-sm text-slate-400 leading-relaxed max-w-sm mx-auto">
              Follow these simple steps to register offline-first clients, generate professional billing documents, and track manual payments.
            </p>
          </div>

          <div className="space-y-3.5 text-left max-w-sm mx-auto">
            {/* Step 1 */}
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

            {/* Step 2 */}
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
        
        /* 3. Primary Dashboard Layout Grid */
        <div className="grid grid-cols-1 lg:grid-cols-3 gap-6 items-start">
          
          {/* Main Dashboard Cards (Left 2 Columns) */}
          <div className="lg:col-span-2 space-y-6">
            
            {/* A. Outstanding Balance Segmented Card */}
            <div className="rounded-3xl border border-slate-900 bg-gradient-to-br from-slate-950 to-slate-950/20 p-6 space-y-5 shadow-lg">
              <div className="flex items-center justify-between border-b border-slate-900/60 pb-3">
                <div className="flex items-center gap-2">
                  <Landmark className="h-5 w-5 text-amber-500" />
                  <h3 className="text-base font-extrabold text-white uppercase tracking-wider">Outstanding Balances</h3>
                </div>
                {!isMultiCurrency && sortedOutstanding[0] && (() => {
                  const singleCurr = sortedOutstanding[0].currency.toUpperCase();
                  const totalCounts = invoiceCountsByCurrency[singleCurr]?.total || 0;
                  return (
                    <span className="text-xs font-semibold text-slate-400">
                      {totalCounts} {totalCounts === 1 ? 'Invoice' : 'Invoices'} total
                    </span>
                  );
                })()}
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
                          <div className="space-y-0.5 text-left">
                            <span className="text-[10px] font-extrabold text-indigo-400 uppercase tracking-widest block">
                              {isMultiCurrency ? `${out.currency} Ledger` : 'Active Ledger'}
                            </span>
                            <span className="text-2xl font-black text-white tracking-tight block">
                              {formatMoney({ amountMinor: out.amountMinor, currency: out.currency })}
                            </span>
                          </div>

                          <div className="flex items-center gap-3 sm:ml-auto">
                            <div className="text-right text-xs text-slate-400 font-semibold space-y-0.5">
                              <div>{invoiceCount} outstanding {invoiceCount === 1 ? 'invoice' : 'invoices'}</div>
                              {overdueCount > 0 && (
                                <div className="text-amber-500 flex items-center gap-1 justify-end">
                                  <AlertTriangle className="h-3 w-3 shrink-0" />
                                  <span aria-label={`Overdue invoices: ${overdueCount}`}>{overdueCount} overdue</span>
                                </div>
                              )}
                            </div>
                            <ChevronRight className="h-4 w-4 text-slate-600 group-hover:text-slate-400 group-hover:translate-x-0.5 transition" />
                          </div>
                        </div>
                      );
                    })}

                    {/* "+N more" Collapse Trigger */}
                    {sortedOutstanding.length > 3 && (
                      <button
                        onClick={() => setShowAllOutstanding(!showAllOutstanding)}
                        className="w-full text-center py-2 text-xs font-extrabold text-indigo-400 hover:text-indigo-300 transition"
                      >
                        {showAllOutstanding 
                          ? 'Show less' 
                          : `+${sortedOutstanding.length - 3} more currencies`}
                      </button>
                    )}
                  </>
                ) : (
                  <div className="rounded-2xl border border-dashed border-slate-900 p-8 text-center text-slate-500">
                    <p className="text-xs font-semibold">No outstanding balance due.</p>
                  </div>
                )}
              </div>
            </div>

            {/* B. Rolling Earnings Card */}
            <div className="rounded-3xl border border-slate-900 bg-gradient-to-br from-slate-950 to-slate-950/20 p-6 space-y-5 shadow-lg">
              <div className="flex items-center justify-between border-b border-slate-900/60 pb-3">
                <div className="flex items-center gap-2">
                  <TrendingUp className="h-5 w-5 text-emerald-500" />
                  <h3 className="text-base font-extrabold text-white uppercase tracking-wider">Earnings</h3>
                </div>
                <span className="text-xs font-bold text-slate-400 uppercase tracking-widest">{periodLabel}</span>
              </div>

              {/* Earnings Tiles Grid */}
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                {sortedEarnings.length > 0 ? (
                  sortedEarnings.map((earning) => (
                    <div 
                      key={earning.currency} 
                      className="rounded-2xl border border-slate-900/60 bg-slate-950/30 p-5 space-y-1 hover:border-slate-800 transition text-left"
                    >
                      <span className="text-[10px] font-extrabold text-slate-500 uppercase tracking-widest block">
                        {earning.currency} Earnings
                      </span>
                      <span className={`text-2xl font-black block tracking-tight ${earning.amountMinor < 0 ? 'text-red-400' : 'text-emerald-400'}`}>
                        {formatMoney({ amountMinor: earning.amountMinor, currency: earning.currency })}
                      </span>
                      <span className="block text-[9px] text-slate-500 font-semibold pt-1 border-t border-slate-900/50 mt-1.5 uppercase">
                        Net ledger period sum
                      </span>
                    </div>
                  ))
                ) : (
                  <div className="col-span-full rounded-2xl border border-dashed border-slate-900 p-8 text-center text-slate-500">
                    <p className="text-xs font-semibold">No payments recorded during this period.</p>
                  </div>
                )}
              </div>
            </div>

            {/* C. Recent Payments Table */}
            <div className="rounded-3xl border border-slate-900 bg-gradient-to-br from-slate-950 to-slate-950/20 p-6 space-y-4 shadow-lg text-left">
              <h3 className="text-base font-extrabold text-white uppercase tracking-wider border-b border-slate-900/60 pb-3 flex items-center gap-2">
                <Receipt className="h-5 w-5 text-indigo-400" />
                Recent Payments
              </h3>

              <div className="space-y-3.5">
                {dashboard?.recentPayments && dashboard.recentPayments.length > 0 ? (
                  dashboard.recentPayments
                    .filter(p => p.amount_minor > 0) // Render only positive payment events
                    .map((pmt) => {
                      const isReversal = !!pmt.reverses_id;
                      return (
                        <div
                          key={pmt.id}
                          onClick={() => router.push(`/invoices/${pmt.invoice_id}`)}
                          className="rounded-2xl border border-slate-900/60 bg-slate-950/40 p-4 flex items-center justify-between group hover:border-slate-800 transition cursor-pointer"
                        >
                          <div className="min-w-0 pr-3 space-y-1">
                            <span className="block font-bold text-sm text-white truncate group-hover:text-indigo-400 transition">
                              {pmt.client_name}
                            </span>
                            <div className="text-[10px] text-slate-500 font-semibold font-mono">
                              Invoice: {pmt.invoice_number} · {pmt.occurred_at}
                            </div>
                          </div>

                          <div className="flex items-center gap-2.5 shrink-0">
                            <span className="text-sm font-extrabold text-emerald-400 font-sans">
                              {formatMoney({ amountMinor: pmt.amount_minor, currency: pmt.currency })}
                            </span>
                            <ChevronRight className="h-4 w-4 text-slate-600 group-hover:text-slate-400 group-hover:translate-x-0.5 transition" />
                          </div>
                        </div>
                      );
                    })
                ) : (
                  <div className="rounded-2xl border border-dashed border-slate-900 p-8 text-center text-slate-500">
                    <p className="text-xs font-semibold">No recent payments recorded.</p>
                  </div>
                )}
              </div>
            </div>

          </div>

          {/* Attention & Details Side Panel (Right Column) */}
          <div className="space-y-6">
            
            {/* Attention Card (Overdue items requiring attention) */}
            {attentionInvoices.length > 0 && (
              <div className="rounded-3xl border border-red-950/20 bg-gradient-to-br from-red-950/5 to-slate-950/20 p-6 space-y-4 shadow-lg">
                <h3 className="text-xs font-bold text-red-400 uppercase tracking-widest flex items-center gap-1.5 border-b border-red-950/30 pb-2.5">
                  <Clock className="h-4 w-4 text-red-500" />
                  Needs Attention
                </h3>

                <div className="space-y-3">
                  {attentionInvoices.map((inv) => {
                    const overdueDays = getDaysOverdue(inv.due_date);
                    return (
                      <div
                        key={inv.id}
                        onClick={() => router.push(`/invoices/${inv.id}`)}
                        className="rounded-2xl border border-slate-900 bg-slate-950/40 p-4 flex flex-col gap-2 hover:border-slate-800 transition cursor-pointer group"
                      >
                        <div className="flex items-center justify-between">
                          <span className="font-extrabold text-sm text-white group-hover:text-indigo-400 transition truncate">
                            {inv.invoice_number}
                          </span>
                          <span className="text-xs font-bold text-red-400 shrink-0">
                            {overdueDays}d overdue
                          </span>
                        </div>
                        
                        <div className="flex items-end justify-between border-t border-slate-900/50 pt-2 text-[10px] text-slate-500 font-semibold">
                          <div>
                            Client: <span className="text-slate-300">{inv.client_name}</span>
                          </div>
                          <span className="font-extrabold text-xs text-white">
                            {formatMoney({ amountMinor: inv.balanceDueMinor, currency: inv.currency })}
                          </span>
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
