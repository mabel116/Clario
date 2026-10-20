'use client';

import React, { useState, useMemo, useEffect } from 'react';
import Link from 'next/link';
import { ProtectedRoute } from '../components/ProtectedRoute';
import { AppShell } from '../components/AppShell';
import { useAuth } from '../lib/auth/provider';
import { useDashboard, useClients, useProfile, useAllPayments } from '../lib/data/hooks';
import { DashboardRepo } from '../lib/data/dashboard';
import { useDataReady } from '../lib/data/readiness';
import { useSyncStatus } from '../lib/sync/hooks';
import { Money } from '../components/ui/money';
import {
  CreditCard,
  Banknote,
  Clock,
  CheckCircle,
  ChevronRight,
  ChevronDown,
  Check,
  MoreVertical,
  Eye,
  X,
  Plus,
} from 'lucide-react';
import {
  DropdownMenu,
  DropdownMenuTrigger,
  DropdownMenuContent,
  DropdownMenuItem,
} from '../components/ui/dropdown-menu';
import { RecordPaymentModal } from '../components/RecordPaymentModal';
import { cn } from '../lib/utils';

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
  const { user } = useAuth();

  // States
  const [periodDays, setPeriodDays] = useState<30 | 90 | 365>(30);
  const [selectedOutstandingCurr, setSelectedOutstandingCurr] = useState<string>('');
  const [selectedEarningsCurr, setSelectedEarningsCurr] = useState<string>('');
  const [currencyDrawer, setCurrencyDrawer] = useState<'outstanding' | 'earnings' | null>(null);
  const [recordPaymentTarget, setRecordPaymentTarget] = useState<{ clientId: string; invoiceId: string } | null>(null);

  // Queries
  const { data: profile } = useProfile();
  const liveDefaultCurrency = (profile?.default_currency || 'USD').toUpperCase();

  const { data: dashboard, isCached, cachedAt } = useDashboard(periodDays, liveDefaultCurrency);
  const { data: clients } = useClients();
  const { data: allPayments } = useAllPayments();

  const allInvoices = dashboard?.invoices || [];

  const clientMap = useMemo(() => {
    const map: Record<string, { id: string; name: string }> = {};
    if (clients) {
      clients.forEach((c) => {
        map[c.id] = c;
      });
    }
    return map;
  }, [clients]);

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

  // Derive payment counts by currency within periodDays
  const paymentCountsByCurrency = useMemo(() => {
    const counts: Record<string, number> = {};
    const paymentsList = allPayments || dashboard?.recentPayments || [];
    const today = new Date().toISOString().split('T')[0];
    const todayDate = new Date(today);
    const startDate = new Date(todayDate.getTime() - periodDays * 24 * 60 * 60 * 1000)
      .toISOString()
      .split('T')[0];

    paymentsList.forEach((p) => {
      const isReversal = !!p.reverses_id || p.amount_minor < 0;
      if (isReversal) return;
      const occDate = (p.occurred_at || p.created_at || '').split('T')[0];
      if (occDate >= startDate && occDate <= today) {
        const curr = p.currency.toUpperCase();
        counts[curr] = (counts[curr] || 0) + 1;
      }
    });
    return counts;
  }, [allPayments, dashboard?.recentPayments, periodDays]);

  // Active outstanding balances sorted
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

  // Active earnings sorted
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

  const maxDaysOverdue = useMemo(() => {
    if (!overdueInvoices || overdueInvoices.length === 0) return 0;
    let max = 0;
    overdueInvoices.forEach((inv) => {
      const d = getDaysOverdue(inv.due_date);
      if (d > max) max = d;
    });
    return max;
  }, [overdueInvoices]);

  // Close drawer on ESC key
  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.key === 'Escape' && currencyDrawer) {
        setCurrencyDrawer(null);
      }
    };
    if (currencyDrawer) {
      window.addEventListener('keydown', handleKeyDown);
    }
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, [currencyDrawer]);

  const formatDashboardDate = (dateStr: string | null | undefined): string => {
    if (!dateStr) return '';
    try {
      const datePart = dateStr.includes('T') ? dateStr.split('T')[0] : dateStr;
      const parts = datePart.split('-');
      if (parts.length === 3 && parts[0].length === 4) {
        const year = parts[0];
        const monthIdx = parseInt(parts[1], 10) - 1;
        const day = parseInt(parts[2], 10);
        const monthNames = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];
        if (monthIdx >= 0 && monthIdx < 12 && !isNaN(day)) {
          return `${day} ${monthNames[monthIdx]}, ${year}`;
        }
      }
      const d = new Date(dateStr);
      if (isNaN(d.getTime())) return dateStr;
      const day = d.getDate();
      const monthNames = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];
      const month = monthNames[d.getMonth()];
      const year = d.getFullYear();
      return `${day} ${month}, ${year}`;
    } catch {
      return dateStr;
    }
  };

  // Option B activity stream
  const activityStream = useMemo(() => {
    const items: Array<{
      id: string;
      type: 'payment' | 'reversal' | 'invoice_created';
      timestamp: number;
      dateText: string;
      clientName: string;
      invoiceNumber?: string;
      invoiceId?: string;
      amountMinor: number;
      currency: string;
    }> = [];

    if (dashboard?.recentPayments) {
      dashboard.recentPayments.forEach((p) => {
        const isReversal = !!p.reverses_id || p.amount_minor < 0;
        const dateVal = p.occurred_at || p.created_at;
        const ts = new Date(dateVal).getTime();
        items.push({
          id: `payment-${p.id}`,
          type: isReversal ? 'reversal' : 'payment',
          timestamp: isNaN(ts) ? 0 : ts,
          dateText: formatDashboardDate(dateVal),
          clientName: p.client_name || clientMap[p.client_id]?.name || 'Client',
          invoiceNumber: p.invoice_number,
          invoiceId: p.invoice_id,
          amountMinor: Math.abs(p.amount_minor),
          currency: p.currency,
        });
      });
    }

    if (allInvoices) {
      allInvoices.forEach((inv) => {
        const dateVal = inv.issue_date || '';
        const ts = dateVal ? new Date(dateVal).getTime() : 0;
        items.push({
          id: `invoice-${inv.id}`,
          type: 'invoice_created',
          timestamp: isNaN(ts) ? 0 : ts,
          dateText: formatDashboardDate(dateVal),
          clientName: inv.client_name || clientMap[inv.client_id]?.name || 'Client',
          invoiceNumber: inv.invoice_number,
          invoiceId: inv.id,
          amountMinor: inv.total_minor,
          currency: inv.currency,
        });
      });
    }

    items.sort((a, b) => b.timestamp - a.timestamp);
    return items.slice(0, 5);
  }, [dashboard?.recentPayments, allInvoices, clientMap]);

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

  // Selected currency derivations for Top Tier Cards
  const activeOutstandingCurrencies = useMemo(() => sortedOutstanding.map(o => o.currency.toUpperCase()), [sortedOutstanding]);
  const effectiveOutstandingCurr = selectedOutstandingCurr && activeOutstandingCurrencies.includes(selectedOutstandingCurr)
    ? selectedOutstandingCurr
    : (sortedOutstanding[0]?.currency?.toUpperCase() || liveDefaultCurrency);
  const currentOutstandingData = sortedOutstanding.find(o => o.currency.toUpperCase() === effectiveOutstandingCurr);
  const currentOutstandingAmount = currentOutstandingData?.amountMinor || 0;
  const currentOutstandingCount = invoiceCountsByCurrency[effectiveOutstandingCurr]?.total || 0;
  const currentOverdueCount = invoiceCountsByCurrency[effectiveOutstandingCurr]?.overdue || 0;

  const activeEarningsCurrencies = useMemo(() => sortedEarnings.map(e => e.currency.toUpperCase()), [sortedEarnings]);
  const effectiveEarningsCurr = selectedEarningsCurr && activeEarningsCurrencies.includes(selectedEarningsCurr)
    ? selectedEarningsCurr
    : (sortedEarnings[0]?.currency?.toUpperCase() || liveDefaultCurrency);
  const currentEarningsData = sortedEarnings.find(e => e.currency.toUpperCase() === effectiveEarningsCurr);
  const currentEarningsAmount = currentEarningsData?.amountMinor || 0;
  const currentEarningsCount = paymentCountsByCurrency[effectiveEarningsCurr] || 0;

  // Resolve User First Name Cleanly
  const firstName = useMemo(() => {
    const meta = user?.user_metadata;
    if (meta?.first_name && typeof meta.first_name === 'string') {
      return meta.first_name.trim();
    }
    if (meta?.full_name && typeof meta.full_name === 'string') {
      return meta.full_name.trim().split(' ')[0];
    }
    if (meta?.name && typeof meta.name === 'string') {
      return meta.name.trim().split(' ')[0];
    }
    if (profile?.business_name && typeof profile.business_name === 'string') {
      return profile.business_name.trim();
    }
    if (user?.email) {
      const localPart = user.email.split('@')[0];
      const match = localPart.match(/^[a-zA-Z]+/);
      if (match && match[0]) {
        return match[0].charAt(0).toUpperCase() + match[0].slice(1).toLowerCase();
      }
    }
    return '';
  }, [user, profile?.business_name]);

  const getGreeting = (name: string, isPastThreeDays: boolean = false) => {
    if (isPastThreeDays) {
      return name ? `Welcome back, ${name}` : 'Welcome back';
    }
    const hour = new Date().getHours();
    if (hour === 23 || hour < 5) {
      return name ? `Working late, ${name}?` : 'Working late?';
    }
    if (hour >= 5 && hour < 12) {
      return name ? `Good morning, ${name}` : 'Good morning';
    }
    if (hour >= 12 && hour < 17) {
      return name ? `Good afternoon, ${name}` : 'Good afternoon';
    }
    return name ? `Good evening, ${name}` : 'Good evening';
  };

  const [headerGreeting, setHeaderGreeting] = useState<string>(() => getGreeting(firstName, false));

  useEffect(() => {
    let isPastThreeDays = false;
    try {
      const lastVisit = localStorage.getItem('clario_last_visit_ts');
      localStorage.setItem('clario_last_visit_ts', String(Date.now()));
      if (lastVisit && Date.now() - Number(lastVisit) > 3 * 24 * 60 * 60 * 1000) {
        isPastThreeDays = true;
      }
    } catch {
      // localStorage may fail in restricted/SSR environments
    }
    setHeaderGreeting(getGreeting(firstName, isPastThreeDays));
  }, [firstName]);

  return (
    <>
      <div className="space-y-6 text-left">
      
      {/* 1. Page Header with Period Selector & Primary Action */}
      <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4 pb-2">
        <div>
          <h1 className="text-2xl font-semibold tracking-tight text-gray-900 dark:text-white">
            {headerGreeting}
          </h1>
          <div className="flex flex-wrap items-center gap-2 mt-1 min-h-[22px]">
            <p className="text-xs text-gray-500 dark:text-zinc-400 font-normal">
              Here&apos;s a quick look at your money and what needs your attention.
            </p>
            {isCached && (
              <span className="text-xs text-gray-400 dark:text-zinc-500 font-normal">
                &bull; Showing snapshot from {cachedAgoText}
              </span>
            )}
          </div>
        </div>

        {/* Header Right Controls */}
        {!isFirstRun && !isLoading && (
          <div className="flex flex-wrap items-center gap-3 shrink-0 self-start sm:self-auto">
            {/* Period Selector */}
            <div className="inline-flex items-center h-10 bg-gray-100 dark:bg-[#1c1c21] p-1 rounded-xl border border-gray-200 dark:border-[#27272a]">
              {([30, 90, 365] as const).map((days) => {
                const label = days === 365 ? 'This Year' : `${days} Days`;
                const isActive = periodDays === days;
                return (
                  <button
                    key={days}
                    type="button"
                    onClick={() => setPeriodDays(days)}
                    className={cn(
                      'h-8 px-3 text-xs font-medium rounded-lg transition-all tap-target',
                      isActive
                        ? 'bg-white dark:bg-[#27272a] text-gray-900 dark:text-white font-medium'
                        : 'text-gray-600 dark:text-zinc-400 hover:text-gray-900 dark:hover:text-white font-medium transition-colors'
                    )}
                  >
                    {label}
                  </button>
                );
              })}
            </div>

            {/* Primary Action Button */}
            <Link
              href="/invoices"
              prefetch={false}
              className="inline-flex items-center justify-center gap-2 h-10 px-4 rounded-xl bg-blue-600 hover:bg-blue-700 text-white text-sm font-medium transition-colors tap-target"
            >
              <Plus className="h-4 w-4 shrink-0" strokeWidth={2} aria-hidden="true" />
              <span className="leading-none">Create invoice</span>
            </Link>
          </div>
        )}
      </div>

      {isLoading ? (
        <div className="space-y-6 animate-pulse">
          <div className="grid grid-cols-1 md:grid-cols-3 gap-6 items-stretch">
            <div className="h-36 rounded-2xl border border-gray-200 dark:border-[#27272a] bg-gray-50 dark:bg-[#121215]" />
            <div className="h-36 rounded-2xl border border-gray-200 dark:border-[#27272a] bg-gray-50 dark:bg-[#121215]" />
            <div className="h-36 rounded-2xl border border-gray-200 dark:border-[#27272a] bg-gray-50 dark:bg-[#121215]" />
          </div>
          <div className="grid grid-cols-1 lg:grid-cols-5 gap-6 items-start mt-6">
            <div className="lg:col-span-3 h-64 rounded-2xl border border-gray-200 dark:border-[#27272a] bg-gray-50 dark:bg-[#121215]" />
            <div className="lg:col-span-2 h-64 rounded-2xl border border-gray-200 dark:border-[#27272a] bg-gray-50 dark:bg-[#121215]" />
          </div>
        </div>
      ) : isFirstRun ? (
        <div className="max-w-xl mx-auto rounded-2xl border border-gray-200 dark:border-[#27272a] bg-white dark:bg-[#121215] p-6 sm:p-8 space-y-6 text-center">
          <div className="mx-auto flex h-14 w-14 items-center justify-center rounded-2xl bg-blue-50 dark:bg-blue-950/40 text-blue-600 dark:text-blue-400">
            <CheckCircle className="h-7 w-7" strokeWidth={2} />
          </div>
          <div className="space-y-2">
            <h3 className="text-xl font-semibold text-gray-900 dark:text-white">Let&apos;s set up your business</h3>
            <p className="text-sm text-gray-500 dark:text-zinc-400 leading-relaxed max-w-sm mx-auto">
              Follow these simple steps to register offline-first clients, generate professional billing documents, and track manual payments.
            </p>
          </div>

          <div className="space-y-3 text-left max-w-sm mx-auto">
            <Link 
              href="/clients"
              prefetch={false}
              className="rounded-xl border border-gray-200 dark:border-[#27272a] bg-gray-50 dark:bg-[#1c1c21] p-4 flex items-start gap-4 hover:border-gray-300 dark:hover:border-zinc-700 transition cursor-pointer group"
            >
              <div className="h-6 w-6 rounded-full bg-white dark:bg-[#121215] border border-gray-200 dark:border-[#27272a] flex items-center justify-center text-xs font-semibold text-blue-600 dark:text-blue-400 shrink-0">1</div>
              <div className="space-y-1">
                <span className="block font-semibold text-sm text-gray-900 dark:text-white group-hover:text-blue-600 dark:group-hover:text-blue-400 transition">Add your first client</span>
                <span className="block text-xs text-gray-500 dark:text-zinc-400">Log client billing coordinates and default currency.</span>
              </div>
              <ChevronRight className="h-4 w-4 text-gray-400 dark:text-zinc-500 ml-auto self-center group-hover:text-gray-600 dark:group-hover:text-zinc-300 group-hover:translate-x-0.5 transition" strokeWidth={2} />
            </Link>

            <Link 
              href="/clients"
              prefetch={false}
              className="rounded-xl border border-gray-200 dark:border-[#27272a] bg-gray-50 dark:bg-[#1c1c21] p-4 flex items-start gap-4 hover:border-gray-300 dark:hover:border-zinc-700 transition cursor-pointer group opacity-60 hover:opacity-100"
            >
              <div className="h-6 w-6 rounded-full bg-white dark:bg-[#121215] border border-gray-200 dark:border-[#27272a] flex items-center justify-center text-xs font-semibold text-blue-600 dark:text-blue-400 shrink-0">2</div>
              <div className="space-y-1">
                <span className="block font-semibold text-sm text-gray-900 dark:text-white group-hover:text-blue-600 dark:group-hover:text-blue-400 transition">Issue your first invoice</span>
                <span className="block text-xs text-gray-500 dark:text-zinc-400">Build custom line items and set payment due dates.</span>
              </div>
              <ChevronRight className="h-4 w-4 text-gray-400 dark:text-zinc-500 ml-auto self-center group-hover:text-gray-600 dark:group-hover:text-zinc-300 group-hover:translate-x-0.5 transition" strokeWidth={2} />
            </Link>
          </div>
        </div>
      ) : (
        <>
          {/* Top Tier: 3 Horizontal Metric Cards (Two-Tone Card Anatomy) */}
          <div className="grid grid-cols-1 md:grid-cols-3 gap-6 items-stretch">
            
            {/* Card 1: Outstanding Balances */}
            <div className="border border-gray-200 dark:border-[#27272a] rounded-2xl flex flex-col justify-between overflow-hidden bg-white dark:bg-[#18181b]">
              {/* Header Shelf */}
              <div className="bg-gray-50/80 dark:bg-[#121215] border-b border-gray-100 dark:border-[#27272a] px-4 py-2.5 min-h-[44px] flex items-center justify-between">
                <div className="inline-flex items-center gap-2 text-sm font-normal text-gray-600 dark:text-zinc-400 leading-none">
                  <CreditCard className="h-3.5 w-3.5 shrink-0 text-gray-600 dark:text-zinc-400" strokeWidth={2.25} />
                  <span className="text-[13px] leading-none font-medium text-gray-600 dark:text-zinc-400">Outstanding Balances</span>
                </div>
                {sortedOutstanding.length > 1 && (
                  <DropdownMenu>
                    <DropdownMenuTrigger className="inline-flex items-center gap-1.5 h-7 px-2.5 rounded-lg border border-gray-200 dark:border-[#27272a] bg-white dark:bg-[#18181b] text-xs font-medium text-gray-700 dark:text-zinc-300 transition-colors focus:outline-none">
                      <span>{effectiveOutstandingCurr}</span>
                      <ChevronDown className="h-3 w-3 text-gray-400 dark:text-zinc-500" strokeWidth={2} />
                    </DropdownMenuTrigger>
                    <DropdownMenuContent align="end" className="w-28 max-h-[260px] overflow-y-auto overscroll-contain p-1">
                      {sortedOutstanding.map((o) => {
                        const curr = o.currency.toUpperCase();
                        const isActive = curr === effectiveOutstandingCurr;
                        return (
                          <DropdownMenuItem
                            key={o.currency}
                            onClick={() => setSelectedOutstandingCurr(curr)}
                            className={cn(
                              'cursor-pointer text-[13px] leading-[18px] justify-between flex items-center rounded-lg px-3 py-2 transition-colors',
                              isActive
                                ? 'font-medium text-gray-900 dark:text-white bg-gray-50 dark:bg-[#222226]'
                                : 'font-normal text-gray-600 dark:text-zinc-400 hover:text-gray-900 dark:hover:text-white hover:bg-gray-50 dark:hover:bg-[#222226]'
                            )}
                          >
                            <span>{curr}</span>
                            {isActive && <Check className="h-[15px] w-[15px] text-gray-900 dark:text-white shrink-0" strokeWidth={2} />}
                          </DropdownMenuItem>
                        );
                      })}
                    </DropdownMenuContent>
                  </DropdownMenu>
                )}
              </div>

              {/* Card Body */}
              <div className="p-4 flex-1 flex flex-col justify-between bg-white dark:bg-[#18181b]">
                <div>
                  <div className="block">
                    <Money
                      amountMinor={currentOutstandingAmount}
                      currency={effectiveOutstandingCurr}
                      variant="table"
                      tone="default"
                      className="text-[18px] font-medium text-gray-900 dark:text-white tabular-nums"
                    />
                  </div>
                  <Link
                    href={`/invoices?status=outstanding&currency=${effectiveOutstandingCurr}`}
                    prefetch={false}
                    className="block mt-1 text-[12px] leading-[16px] font-normal text-gray-500 hover:text-gray-900 dark:text-zinc-400 dark:hover:text-white transition-colors w-fit no-underline"
                  >
                    {currentOutstandingCount} {currentOutstandingCount === 1 ? 'invoice' : 'invoices'} • {currentOverdueCount} overdue
                  </Link>
                </div>

                {sortedOutstanding.length > 1 && (
                  <div className="border-t border-gray-100 dark:border-[#27272a] mt-3 pt-3">
                    <button
                      type="button"
                      onClick={() => setCurrencyDrawer('outstanding')}
                      className="group w-full flex items-center justify-between text-[12px] leading-[16px] font-medium text-gray-600 dark:text-zinc-400 hover:text-gray-900 dark:hover:text-white transition-colors text-left"
                    >
                      <span>View +{sortedOutstanding.length - 1} other {sortedOutstanding.length - 1 === 1 ? 'currency' : 'currencies'}</span>
                      <ChevronRight className="h-3.5 w-3.5 text-gray-400 dark:text-zinc-500 group-hover:text-gray-900 dark:group-hover:text-white group-hover:translate-x-0.5 transition-all shrink-0" strokeWidth={2} />
                    </button>
                  </div>
                )}
              </div>
            </div>

            {/* Card 2: Payments Received */}
            <div className="border border-gray-200 dark:border-[#27272a] rounded-2xl flex flex-col justify-between overflow-hidden bg-white dark:bg-[#18181b]">
              {/* Header Shelf */}
              <div className="bg-gray-50/80 dark:bg-[#121215] border-b border-gray-100 dark:border-[#27272a] px-4 py-2.5 min-h-[44px] flex items-center justify-between">
                <div className="inline-flex items-center gap-2 text-sm font-normal text-gray-600 dark:text-zinc-400 leading-none">
                  <Banknote className="h-[15px] w-[15px] shrink-0 text-gray-600 dark:text-zinc-400" strokeWidth={2.25} />
                  <span className="text-[13px] leading-none font-medium text-gray-600 dark:text-zinc-400">Payments Received</span>
                </div>
                {sortedEarnings.length > 1 && (
                  <DropdownMenu>
                    <DropdownMenuTrigger className="inline-flex items-center gap-1.5 h-7 px-2.5 rounded-lg border border-gray-200 dark:border-[#27272a] bg-white dark:bg-[#18181b] text-xs font-medium text-gray-700 dark:text-zinc-300 transition-colors focus:outline-none">
                      <span>{effectiveEarningsCurr}</span>
                      <ChevronDown className="h-3 w-3 text-gray-400 dark:text-zinc-500" strokeWidth={2} />
                    </DropdownMenuTrigger>
                    <DropdownMenuContent align="end" className="w-28 max-h-[260px] overflow-y-auto overscroll-contain p-1">
                      {sortedEarnings.map((e) => {
                        const curr = e.currency.toUpperCase();
                        const isActive = curr === effectiveEarningsCurr;
                        return (
                          <DropdownMenuItem
                            key={e.currency}
                            onClick={() => setSelectedEarningsCurr(curr)}
                            className={cn(
                              'cursor-pointer text-[13px] leading-[18px] justify-between flex items-center rounded-lg px-3 py-2 transition-colors',
                              isActive
                                ? 'font-medium text-gray-900 dark:text-white bg-gray-50 dark:bg-[#222226]'
                                : 'font-normal text-gray-600 dark:text-zinc-400 hover:text-gray-900 dark:hover:text-white hover:bg-gray-50 dark:hover:bg-[#222226]'
                            )}
                          >
                            <span>{curr}</span>
                            {isActive && <Check className="h-[15px] w-[15px] text-gray-900 dark:text-white shrink-0" strokeWidth={2} />}
                          </DropdownMenuItem>
                        );
                      })}
                    </DropdownMenuContent>
                  </DropdownMenu>
                )}
              </div>

              {/* Card Body */}
              <div className="p-4 flex-1 flex flex-col justify-between bg-white dark:bg-[#18181b]">
                <div>
                  <div className="block">
                    <Money
                      amountMinor={currentEarningsAmount}
                      currency={effectiveEarningsCurr}
                      variant="table"
                      tone="default"
                      className="text-[18px] font-medium text-gray-900 dark:text-white tabular-nums"
                    />
                  </div>
                  <p className="block mt-1 text-xs text-gray-500 dark:text-zinc-400 font-normal">
                    Past {periodDays} days • {currentEarningsCount} {currentEarningsCount === 1 ? 'payment' : 'payments'}
                  </p>
                </div>

                {sortedEarnings.length > 1 && (
                  <div className="border-t border-gray-100 dark:border-[#27272a] mt-3 pt-3">
                    <button
                      type="button"
                      onClick={() => setCurrencyDrawer('earnings')}
                      className="group w-full flex items-center justify-between text-[12px] leading-[16px] font-medium text-gray-600 dark:text-zinc-400 hover:text-gray-900 dark:hover:text-white transition-colors text-left"
                    >
                      <span>View +{sortedEarnings.length - 1} other {sortedEarnings.length - 1 === 1 ? 'currency' : 'currencies'}</span>
                      <ChevronRight className="h-3.5 w-3.5 text-gray-400 dark:text-zinc-500 group-hover:text-gray-900 dark:group-hover:text-white group-hover:translate-x-0.5 transition-all shrink-0" strokeWidth={2} />
                    </button>
                  </div>
                )}
              </div>
            </div>

            {/* Card 3: Overdue Invoices */}
            <div className="border border-gray-200 dark:border-[#27272a] rounded-2xl flex flex-col justify-between overflow-hidden bg-white dark:bg-[#18181b]">
              {/* Header Shelf */}
              <div className="bg-gray-50/80 dark:bg-[#121215] border-b border-gray-100 dark:border-[#27272a] px-4 py-2.5 min-h-[44px] flex items-center justify-between">
                <div className="inline-flex items-center gap-2 text-sm font-normal text-gray-600 dark:text-zinc-400 leading-none">
                  <Clock className="h-3.5 w-3.5 shrink-0 text-gray-600 dark:text-zinc-400" strokeWidth={2.25} />
                  <span className="text-[13px] leading-none font-medium text-gray-600 dark:text-zinc-400">Overdue Invoices</span>
                </div>
              </div>

              {/* Card Body */}
              <div className="p-4 flex-1 flex flex-col justify-between bg-white dark:bg-[#18181b]">
                <div>
                  <div className="block">
                    <span className="text-[18px] font-medium text-gray-900 dark:text-white tabular-nums">
                      {overdueInvoices.length}
                    </span>
                  </div>
                  <p className="block mt-1 text-xs text-gray-500 dark:text-zinc-400 font-normal">
                    Across all currencies
                  </p>
                </div>

                <div className="border-t border-gray-100 dark:border-[#27272a] mt-3 pt-3">
                  <span className="text-xs font-medium text-rose-600 dark:text-rose-400">
                    {overdueInvoices.length > 0 ? `Oldest: ${maxDaysOverdue}d overdue` : 'None overdue'}
                  </span>
                </div>
              </div>
            </div>

          </div>

          {/* Middle Tier: Equal-Height 60/40 Split */}
          <div className="grid grid-cols-1 lg:grid-cols-5 gap-6 items-stretch mt-6">
            
            {/* Left Panel (60% / lg:col-span-3): Needs Attention */}
            <div className="lg:col-span-3 h-full flex flex-col border border-gray-200 dark:border-[#27272a] rounded-2xl overflow-hidden bg-white dark:bg-[#18181b]">
              <div className="bg-gray-50/80 dark:bg-[#121215] border-b border-gray-100 dark:border-[#27272a] px-4 py-3 flex items-center justify-between">
                <h2 className="text-sm font-semibold text-gray-900 dark:text-white">
                  Needs Attention
                </h2>
                <Link
                  href="/invoices?status=overdue"
                  prefetch={false}
                  className="inline-flex items-center justify-center px-3 py-2.5 text-[12px] leading-none font-medium text-gray-700 dark:text-zinc-300 bg-white dark:bg-[#18181b] border border-gray-200 dark:border-[#27272a] rounded-lg hover:bg-gray-50 dark:hover:bg-[#222226] transition-colors no-underline"
                >
                  View all invoices
                </Link>
              </div>

              {overdueInvoices.length > 0 ? (
                <>
                  {/* Desktop Table View */}
                  <div className="hidden md:block overflow-x-auto flex-1">
                    <table className="w-full text-left border-collapse">
                      <thead>
                        <tr className="border-b border-gray-100 dark:border-[#27272a]">
                          <th className="py-2.5 pl-4 pr-3 text-left">
                            <span className="text-[12px] leading-[16px] font-medium text-gray-400 dark:text-zinc-500 uppercase tracking-wider">
                              Invoice / Client
                            </span>
                          </th>
                          <th className="py-2.5 px-3 text-left">
                            <span className="text-[12px] leading-[16px] font-medium text-gray-400 dark:text-zinc-500 uppercase tracking-wider">
                              Amount Due
                            </span>
                          </th>
                          <th className="py-2.5 px-3 text-left">
                            <span className="text-[12px] leading-[16px] font-medium text-gray-400 dark:text-zinc-500 uppercase tracking-wider">
                              Due Date
                            </span>
                          </th>
                          <th className="py-2.5 pl-3 pr-4 text-right w-20">
                            <span className="text-[12px] leading-[16px] font-medium text-gray-400 dark:text-zinc-500 uppercase tracking-wider">
                              Actions
                            </span>
                          </th>
                        </tr>
                      </thead>
                      <tbody className="divide-y divide-gray-100 dark:divide-[#27272a]">
                        {overdueInvoices.slice(0, 5).map((inv) => {
                          const days = getDaysOverdue(inv.due_date);
                          return (
                            <tr key={inv.id}>
                              <td className="py-3 pl-4 pr-3 align-middle min-w-0">
                                <Link
                                  href={`/invoices/${inv.id}?from=/`}
                                  prefetch={false}
                                  className="text-sm font-medium text-gray-900 dark:text-white hover:text-blue-600 dark:hover:text-blue-400 transition-colors block truncate"
                                >
                                  {inv.invoice_number}
                                </Link>
                                <p className="text-xs text-gray-500 dark:text-zinc-400 font-normal truncate mt-0.5">
                                  {inv.client_name || clientMap[inv.client_id]?.name || 'Client'}
                                </p>
                              </td>
                              <td className="py-3 px-3 align-middle">
                                <Money
                                  amountMinor={inv.balanceDueMinor}
                                  currency={inv.currency}
                                  variant="table"
                                  tone="default"
                                  className="text-sm font-medium text-gray-900 dark:text-white tabular-nums"
                                />
                              </td>
                              <td className="py-3 px-3 align-middle">
                                <p className="text-sm font-medium text-gray-900 dark:text-white">
                                  {formatDashboardDate(inv.due_date)}
                                </p>
                                <p className="text-xs text-rose-600 dark:text-rose-400 font-normal mt-0.5">
                                  {days}d overdue
                                </p>
                              </td>
                              <td className="py-3 px-2 align-middle text-center w-20">
                                <DropdownMenu>
                                  <DropdownMenuTrigger className="inline-flex items-center justify-center h-8 w-8 rounded-lg mx-auto text-gray-800 hover:text-gray-900 dark:text-zinc-200 dark:hover:text-white hover:bg-gray-100 dark:hover:bg-[#222226] transition-colors focus:outline-none">
                                    <MoreVertical className="h-4 w-4 shrink-0" strokeWidth={2} />
                                  </DropdownMenuTrigger>
                                  <DropdownMenuContent align="end" className="min-w-[180px] rounded-xl border border-gray-200 dark:border-[#27272a] bg-white dark:bg-[#18181b] p-1.5 shadow-none">
                                    <DropdownMenuItem asChild className="text-[13px] leading-none font-medium text-gray-800 dark:text-zinc-100">
                                      <Link
                                        href={`/invoices/${inv.id}?from=/`}
                                        prefetch={false}
                                        className="flex items-center gap-2.5 whitespace-nowrap py-2.5 sm:py-2 px-3.5 sm:px-3 rounded-lg w-full text-left no-underline cursor-pointer hover:bg-gray-100 dark:hover:bg-[#222226]"
                                      >
                                        <Eye className="h-[15px] w-[15px] text-gray-800 dark:text-zinc-100 shrink-0" strokeWidth={2} />
                                        <span className="text-[13px] leading-none font-medium text-gray-800 dark:text-zinc-100">View invoice</span>
                                      </Link>
                                    </DropdownMenuItem>
                                    <DropdownMenuItem asChild className="text-[13px] leading-none font-medium text-gray-800 dark:text-zinc-100">
                                      <button
                                        type="button"
                                        onClick={() => setRecordPaymentTarget({ clientId: inv.client_id, invoiceId: inv.id })}
                                        className="flex items-center gap-2.5 whitespace-nowrap py-2.5 sm:py-2 px-3.5 sm:px-3 rounded-lg w-full text-left no-underline cursor-pointer hover:bg-gray-100 dark:hover:bg-[#222226]"
                                      >
                                        <CreditCard className="h-[15px] w-[15px] text-gray-800 dark:text-zinc-100 shrink-0" strokeWidth={2} />
                                        <span className="text-[13px] leading-none font-medium text-gray-800 dark:text-zinc-100">Record payment</span>
                                      </button>
                                    </DropdownMenuItem>
                                  </DropdownMenuContent>
                                </DropdownMenu>
                              </td>
                            </tr>
                          );
                        })}
                      </tbody>
                    </table>
                  </div>

                  {/* Mobile Stacked Card View */}
                  <div className="md:hidden divide-y divide-gray-100 dark:divide-[#27272a]">
                    {overdueInvoices.slice(0, 5).map((inv) => {
                      const days = getDaysOverdue(inv.due_date);
                      return (
                        <div key={inv.id} className="p-4">
                          {/* Row 1 (Top) */}
                          <div className="flex items-start justify-between gap-3">
                            <Link
                              href={`/invoices/${inv.id}?from=/`}
                              prefetch={false}
                              className="group min-w-0 no-underline"
                            >
                              <span className="block text-[14px] leading-[20px] font-medium text-gray-900 dark:text-white tabular-nums">
                                {inv.invoice_number}
                              </span>
                              <p className="text-[12px] leading-[16px] font-normal text-gray-500 dark:text-zinc-400 truncate mt-0.5">
                                {inv.client_name || clientMap[inv.client_id]?.name || 'Client'}
                              </p>
                            </Link>

                            <div className="flex items-center gap-2 shrink-0">
                              <span className="inline-flex items-center gap-1.5 px-2 py-0.5 rounded-full text-[11px] font-medium bg-rose-50 text-rose-700 border border-rose-200 dark:bg-rose-500/10 dark:text-rose-400 dark:border-rose-500/20">
                                <span className="w-1.5 h-1.5 rounded-full bg-rose-500" aria-hidden="true" />
                                {days}d overdue
                              </span>
                              <DropdownMenu>
                                <DropdownMenuTrigger className="inline-flex items-center justify-center h-8 w-8 rounded-lg mx-auto text-gray-800 hover:text-gray-900 dark:text-zinc-200 dark:hover:text-white hover:bg-gray-100 dark:hover:bg-[#222226] transition-colors focus:outline-none">
                                  <MoreVertical className="h-4 w-4 shrink-0" strokeWidth={2} />
                                </DropdownMenuTrigger>
                                <DropdownMenuContent align="end" className="min-w-[180px] rounded-xl border border-gray-200 dark:border-[#27272a] bg-white dark:bg-[#18181b] p-1.5 shadow-none">
                                  <DropdownMenuItem asChild className="text-[13px] leading-none font-medium text-gray-800 dark:text-zinc-100">
                                    <Link
                                      href={`/invoices/${inv.id}?from=/`}
                                      prefetch={false}
                                      className="flex items-center gap-2.5 whitespace-nowrap py-2.5 sm:py-2 px-3.5 sm:px-3 rounded-lg w-full text-left no-underline cursor-pointer hover:bg-gray-100 dark:hover:bg-[#222226]"
                                    >
                                      <Eye className="h-[15px] w-[15px] text-gray-800 dark:text-zinc-100 shrink-0" strokeWidth={2} />
                                      <span className="text-[13px] leading-none font-medium text-gray-800 dark:text-zinc-100">View invoice</span>
                                    </Link>
                                  </DropdownMenuItem>
                                  <DropdownMenuItem asChild className="text-[13px] leading-none font-medium text-gray-800 dark:text-zinc-100">
                                    <button
                                      type="button"
                                      onClick={() => setRecordPaymentTarget({ clientId: inv.client_id, invoiceId: inv.id })}
                                      className="flex items-center gap-2.5 whitespace-nowrap py-2.5 sm:py-2 px-3.5 sm:px-3 rounded-lg w-full text-left no-underline cursor-pointer hover:bg-gray-100 dark:hover:bg-[#222226]"
                                    >
                                      <CreditCard className="h-[15px] w-[15px] text-gray-800 dark:text-zinc-100 shrink-0" strokeWidth={2} />
                                      <span className="text-[13px] leading-none font-medium text-gray-800 dark:text-zinc-100">Record payment</span>
                                    </button>
                                  </DropdownMenuItem>
                                </DropdownMenuContent>
                              </DropdownMenu>
                            </div>
                          </div>

                          {/* Row 2 (Bottom) */}
                          <div className="flex items-center justify-between pt-2.5 mt-2.5 border-t border-gray-100 dark:border-[#27272a]">
                            <span className="text-[12px] leading-[16px] font-normal text-gray-500 dark:text-zinc-400 tabular-nums">
                              Due {formatDashboardDate(inv.due_date)}
                            </span>
                            <Money
                              amountMinor={inv.balanceDueMinor}
                              currency={inv.currency}
                              variant="table"
                              tone="default"
                              className="text-[14px] leading-[20px] font-medium text-gray-900 dark:text-white tabular-nums"
                            />
                          </div>
                        </div>
                      );
                    })}
                  </div>
                </>
              ) : (
                <div className="p-4 text-center py-8 text-xs text-gray-500 dark:text-zinc-400 flex-1 flex items-center justify-center">
                  All caught up! No invoices require immediate attention.
                </div>
              )}
            </div>

            {/* Right Panel (40% / lg:col-span-2): Recent Activity Feed */}
            <div className="lg:col-span-2 h-full flex flex-col border border-gray-200 dark:border-[#27272a] rounded-2xl overflow-hidden bg-white dark:bg-[#18181b]">
              <div className="bg-gray-50/80 dark:bg-[#121215] border-b border-gray-100 dark:border-[#27272a] px-4 py-3 flex items-center justify-between">
                <h2 className="text-sm font-semibold text-gray-900 dark:text-white">
                  Recent activity
                </h2>
                <Link
                  href="/payments"
                  prefetch={false}
                  className="inline-flex items-center justify-center px-3 py-2.5 text-[12px] leading-none font-medium text-gray-700 dark:text-zinc-300 bg-white dark:bg-[#18181b] border border-gray-200 dark:border-[#27272a] rounded-lg hover:bg-gray-50 dark:hover:bg-[#222226] transition-colors no-underline"
                >
                  View all
                </Link>
              </div>

              {activityStream.length > 0 ? (
                <div className="divide-y divide-gray-100 dark:divide-[#27272a] flex-1">
                  {activityStream.map((item) => {
                    if (item.type === 'payment') {
                      return (
                        <div key={item.id} className="px-4 py-3.5 flex items-center justify-between gap-4">
                          <div className="min-w-0 flex-1">
                            <p className="text-sm font-medium text-gray-900 dark:text-white truncate">
                              {item.clientName}
                            </p>
                            <p className="text-xs text-gray-500 dark:text-zinc-400 font-normal mt-0.5 truncate">
                              Payment received ·{' '}
                              {item.invoiceNumber && item.invoiceId ? (
                                <Link
                                  href={`/invoices/${item.invoiceId}?from=/`}
                                  prefetch={false}
                                  className="font-medium text-gray-600 dark:text-zinc-300 hover:text-gray-900 dark:hover:text-white transition-colors no-underline"
                                >
                                  {item.invoiceNumber}
                                </Link>
                              ) : (
                                <span>Payment</span>
                              )}
                            </p>
                          </div>
                          <div className="text-right shrink-0">
                            <div className="text-sm font-medium text-emerald-600 dark:text-emerald-400 tabular-nums">
                              + <Money
                                amountMinor={item.amountMinor}
                                currency={item.currency}
                                variant="table"
                                tone="positive"
                                className="text-sm font-medium text-emerald-600 dark:text-emerald-400 tabular-nums"
                              />
                            </div>
                            <p className="text-xs text-gray-400 dark:text-zinc-500 font-normal mt-0.5">
                              {item.dateText}
                            </p>
                          </div>
                        </div>
                      );
                    }

                    if (item.type === 'reversal') {
                      return (
                        <div key={item.id} className="px-4 py-3.5 flex items-center justify-between gap-4">
                          <div className="min-w-0 flex-1">
                            <p className="text-sm font-medium text-gray-900 dark:text-white truncate">
                              {item.clientName}
                            </p>
                            <p className="text-xs text-gray-500 dark:text-zinc-400 font-normal mt-0.5 truncate">
                              Payment reversed ·{' '}
                              {item.invoiceNumber && item.invoiceId ? (
                                <Link
                                  href={`/invoices/${item.invoiceId}?from=/`}
                                  prefetch={false}
                                  className="font-medium text-gray-600 dark:text-zinc-300 hover:text-gray-900 dark:hover:text-white transition-colors no-underline"
                                >
                                  {item.invoiceNumber}
                                </Link>
                              ) : (
                                <span>Payment</span>
                              )}
                            </p>
                          </div>
                          <div className="text-right shrink-0">
                            <div className="text-sm font-medium text-rose-600 dark:text-rose-400 tabular-nums">
                              − <Money
                                amountMinor={item.amountMinor}
                                currency={item.currency}
                                variant="table"
                                tone="overdue"
                                className="text-sm font-medium text-rose-600 dark:text-rose-400 tabular-nums"
                              />
                            </div>
                            <p className="text-xs text-gray-400 dark:text-zinc-500 font-normal mt-0.5">
                              {item.dateText}
                            </p>
                          </div>
                        </div>
                      );
                    }

                    // invoice_created
                    return (
                      <div key={item.id} className="px-4 py-3.5 flex items-center justify-between gap-4">
                        <div className="min-w-0 flex-1">
                          <p className="text-sm font-medium text-gray-900 dark:text-white truncate">
                            {item.clientName}
                          </p>
                          <p className="text-xs text-gray-500 dark:text-zinc-400 font-normal mt-0.5 truncate">
                            Invoice created ·{' '}
                            {item.invoiceNumber && item.invoiceId ? (
                              <Link
                                href={`/invoices/${item.invoiceId}?from=/`}
                                prefetch={false}
                                className="font-medium text-gray-600 dark:text-zinc-300 hover:text-gray-900 dark:hover:text-white transition-colors no-underline"
                              >
                                {item.invoiceNumber}
                              </Link>
                            ) : (
                              <span>Invoice</span>
                            )}
                          </p>
                        </div>
                        <div className="text-right shrink-0">
                          <div className="text-sm font-medium text-gray-900 dark:text-white tabular-nums">
                            <Money
                              amountMinor={item.amountMinor}
                              currency={item.currency}
                              variant="table"
                              tone="default"
                              className="text-sm font-medium text-gray-900 dark:text-white tabular-nums"
                            />
                          </div>
                          <p className="text-xs text-gray-400 dark:text-zinc-500 font-normal mt-0.5">
                            {item.dateText}
                          </p>
                        </div>
                      </div>
                    );
                  })}
                </div>
              ) : (
                <div className="p-4 text-center py-8 text-xs text-gray-500 dark:text-zinc-400 flex-1 flex items-center justify-center">
                  No recent activity recorded yet.
                </div>
              )}
            </div>

          </div>
        </>
      )}

      </div>

      {/* Compare Currencies Slide-Over Drawer */}
      {currencyDrawer && (
        <div className="fixed inset-0 z-50 flex justify-end">
          {/* Backdrop Scrim */}
          <div
            className="fixed inset-0 bg-black/40 backdrop-blur-xs transition-opacity animate-in fade-in duration-200"
            onClick={() => setCurrencyDrawer(null)}
            aria-hidden="true"
          />

          {/* Slide-Over Drawer Content */}
          <div className="relative z-50 w-full max-w-md bg-white dark:bg-[#121215] border-l border-gray-200 dark:border-[#27272a] h-screen p-6 flex flex-col animate-in slide-in-from-right duration-200">
            <div className="flex items-start justify-between pb-4 border-b border-gray-100 dark:border-[#27272a] shrink-0">
              <div>
                <h3 className="text-[20px] leading-[28px] font-medium text-gray-900 dark:text-white">
                  Compare currencies
                </h3>
                <p className="text-xs text-gray-500 dark:text-zinc-400 mt-0.5">
                  {currencyDrawer === 'outstanding' ? 'Outstanding balances' : 'Payments received'} • All currencies
                </p>
              </div>
              <button
                type="button"
                onClick={() => setCurrencyDrawer(null)}
                className="p-1 rounded-lg text-gray-400 hover:text-gray-700 dark:hover:text-zinc-200 hover:bg-gray-100 dark:hover:bg-[#1c1c21] transition-colors"
                aria-label="Close drawer"
              >
                <X className="h-5 w-5" strokeWidth={2} />
              </button>
            </div>

            {/* Straight 3-Column Header */}
            <div className="grid grid-cols-[100px_1fr_auto] items-center gap-4 px-2 pb-2 pt-3 border-b border-gray-200 dark:border-[#27272a] text-[12px] leading-[16px] font-medium text-gray-400 dark:text-zinc-500 uppercase tracking-wider shrink-0">
              <span className="text-[12px] leading-[16px] font-medium text-gray-400 dark:text-zinc-500 uppercase tracking-wider">Currency</span>
              <span className="text-[12px] leading-[16px] font-medium text-gray-400 dark:text-zinc-500 uppercase tracking-wider">{currencyDrawer === 'outstanding' ? 'Invoices' : 'Payments'}</span>
              <span className="text-[12px] leading-[16px] font-medium text-gray-400 dark:text-zinc-500 uppercase tracking-wider text-right">Amount</span>
            </div>

            {/* Rows */}
            <div className="flex-1 overflow-y-auto divide-y divide-gray-100 dark:divide-[#27272a]">
              {currencyDrawer === 'outstanding' ? (
                sortedOutstanding.map((out) => {
                  const currKey = out.currency.toUpperCase();
                  const invCount = invoiceCountsByCurrency[currKey]?.total || 0;
                  return (
                    <div key={out.currency} className="grid grid-cols-[100px_1fr_auto] items-center gap-4 px-2 h-12 border-b border-gray-100 dark:border-[#27272a] last:border-b-0">
                      <span className="font-mono text-xs font-medium bg-gray-100 dark:bg-[#27272a] text-gray-800 dark:text-zinc-200 px-2 py-0.5 rounded w-fit">
                        {out.currency.toUpperCase()}
                      </span>
                      <Link
                        href={`/invoices?status=outstanding&currency=${encodeURIComponent(out.currency)}`}
                        prefetch={false}
                        onClick={() => setCurrencyDrawer(null)}
                        className="text-[12px] leading-[16px] font-medium text-gray-700 hover:text-gray-900 dark:text-zinc-300 dark:hover:text-white transition-colors text-left w-fit no-underline cursor-pointer"
                      >
                        {invCount} {invCount === 1 ? 'invoice' : 'invoices'}
                      </Link>
                      <Money
                        amountMinor={out.amountMinor}
                        currency={out.currency}
                        variant="table"
                        tone="default"
                        className="text-sm font-medium text-gray-900 dark:text-white tabular-nums text-right"
                      />
                    </div>
                  );
                })
              ) : (
                sortedEarnings.map((e) => {
                  const currKey = e.currency.toUpperCase();
                  const pCount = paymentCountsByCurrency[currKey] || 0;
                  return (
                    <div key={e.currency} className="grid grid-cols-[100px_1fr_auto] items-center gap-4 px-2 h-12 border-b border-gray-100 dark:border-[#27272a] last:border-b-0">
                      <span className="font-mono text-xs font-medium bg-gray-100 dark:bg-[#27272a] text-gray-800 dark:text-zinc-200 px-2 py-0.5 rounded w-fit">
                        {e.currency.toUpperCase()}
                      </span>
                      <span className="text-[12px] leading-[16px] font-medium text-gray-700 dark:text-zinc-300 text-left">
                        {pCount} {pCount === 1 ? 'payment' : 'payments'}
                      </span>
                      <Money
                        amountMinor={e.amountMinor}
                        currency={e.currency}
                        variant="table"
                        tone="default"
                        className="text-sm font-medium text-gray-900 dark:text-white tabular-nums text-right"
                      />
                    </div>
                  );
                })
              )}
            </div>
          </div>
        </div>
      )}

      {/* Record Payment Modal */}
      {recordPaymentTarget && (
        <RecordPaymentModal
          clientId={recordPaymentTarget.clientId}
          invoiceId={recordPaymentTarget.invoiceId}
          onClose={() => setRecordPaymentTarget(null)}
        />
      )}
    </>
  );
}
