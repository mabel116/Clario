'use client';

import React, { Suspense, useState, useMemo, useCallback } from 'react';
import Link from 'next/link';
import { ProtectedRoute } from '../../components/ProtectedRoute';
import { AppShell } from '../../components/AppShell';
import { useAllPayments } from '../../lib/data/hooks';
import { PaymentRepo } from '../../lib/data/payment';
import { useDataReady } from '../../lib/data/readiness';
import { formatMoney } from '../../lib/money';
import { CreditCard, ExternalLink, ArrowDownLeft, RotateCcw } from 'lucide-react';

function formatMethod(method?: string | null): string {
  if (!method) return 'Other';
  const m = method.toLowerCase().trim();
  if (m === 'cash') return 'Cash';
  if (m === 'bank_transfer' || m === 'bank transfer') return 'Bank Transfer';
  if (m === 'card') return 'Card';
  if (m === 'mobile_money' || m === 'mobile money') return 'Mobile Money';
  return method.replace(/_/g, ' ').replace(/\b\w/g, (c) => c.toUpperCase());
}

function PaymentsContent() {
  const { data: payments } = useAllPayments();
  const hasPaymentsData = payments !== undefined && payments.length > 0;
  const checkEmpty = useCallback(() => PaymentRepo.isEmpty(), []);
  const { isLoading, isConfirmedEmpty } = useDataReady(hasPaymentsData, checkEmpty);

  const [filter, setFilter] = useState<'all' | 'received' | 'reversals'>('all');

  const counts = useMemo(() => {
    if (!payments) return { all: 0, received: 0, reversals: 0 };
    let received = 0;
    let reversals = 0;
    for (const p of payments) {
      if (p.reverses_id || p.amount_minor < 0) {
        reversals++;
      } else if (p.amount_minor > 0) {
        received++;
      }
    }
    return { all: payments.length, received, reversals };
  }, [payments]);

  const filteredPayments = useMemo(() => {
    if (!payments) return [];
    return payments.filter((p) => {
      const isReversal = !!p.reverses_id || p.amount_minor < 0;
      if (filter === 'received') return !isReversal && p.amount_minor > 0;
      if (filter === 'reversals') return isReversal;
      return true;
    });
  }, [payments, filter]);

  return (
    <div className="space-y-6 font-sans text-left">
      {/* Page Header */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4 border-b border-slate-900 pb-5">
        <div>
          <h1 className="text-2xl font-black text-white tracking-tight flex items-center gap-2.5">
            <CreditCard className="h-6 w-6 text-indigo-500" />
            Payments
          </h1>
          <p className="text-xs text-slate-400 mt-1">
            Real-time ledger view of all payment events and reversals across all clients and invoices
          </p>
        </div>

        {/* Filter Tabs / Pills */}
        {!isLoading && isConfirmedEmpty !== true && payments && payments.length > 0 && (
          <div className="flex items-center gap-1.5 p-1 rounded-xl bg-slate-950 border border-slate-900 self-start sm:self-center">
            <button
              onClick={() => setFilter('all')}
              className={`px-3 py-1.5 rounded-lg text-xs font-semibold transition ${
                filter === 'all'
                  ? 'bg-indigo-600 text-white shadow-sm shadow-indigo-600/20'
                  : 'text-slate-400 hover:text-slate-200 hover:bg-slate-900/50'
              }`}
            >
              All ({counts.all})
            </button>
            <button
              onClick={() => setFilter('received')}
              className={`px-3 py-1.5 rounded-lg text-xs font-semibold transition flex items-center gap-1.5 ${
                filter === 'received'
                  ? 'bg-indigo-600 text-white shadow-sm shadow-indigo-600/20'
                  : 'text-slate-400 hover:text-slate-200 hover:bg-slate-900/50'
              }`}
            >
              <ArrowDownLeft className="h-3.5 w-3.5 text-emerald-400" />
              Received ({counts.received})
            </button>
            <button
              onClick={() => setFilter('reversals')}
              className={`px-3 py-1.5 rounded-lg text-xs font-semibold transition flex items-center gap-1.5 ${
                filter === 'reversals'
                  ? 'bg-indigo-600 text-white shadow-sm shadow-indigo-600/20'
                  : 'text-slate-400 hover:text-slate-200 hover:bg-slate-900/50'
              }`}
            >
              <RotateCcw className="h-3.5 w-3.5 text-rose-400" />
              Reversals ({counts.reversals})
            </button>
          </div>
        )}
      </div>

      {/* Main Content Area */}
      {isLoading ? (
        /* Geometry-matched skeleton mirroring header filter tabs and 4 payment item cards (ADR 036 & ADR 041) */
        <div className="space-y-4 animate-pulse" aria-busy="true" aria-label="Loading payments ledger">
          {/* Skeleton filter pills placeholder */}
          <div className="flex items-center gap-2">
            <div className="h-8 w-20 rounded-xl bg-slate-900/60" />
            <div className="h-8 w-28 rounded-xl bg-slate-900/60" />
            <div className="h-8 w-28 rounded-xl bg-slate-900/60" />
          </div>

          {/* 4 Stacked Card Skeletons */}
          <div className="space-y-3">
            {[1, 2, 3, 4].map((i) => (
              <div
                key={i}
                className="rounded-2xl border border-slate-900 bg-slate-950/40 p-4 sm:p-5 flex flex-col sm:flex-row sm:items-center justify-between gap-4"
              >
                <div className="space-y-2.5 flex-1">
                  <div className="flex items-center gap-2">
                    <div className="h-4 w-24 rounded bg-slate-800/60" />
                    <div className="h-4 w-20 rounded bg-slate-800/40" />
                  </div>
                  <div className="flex items-center gap-2">
                    <div className="h-5 w-36 rounded bg-slate-800/80" />
                    <div className="h-4 w-16 rounded bg-slate-800/50" />
                  </div>
                  <div className="h-3.5 w-52 rounded bg-slate-800/30" />
                </div>
                <div className="flex sm:flex-col items-baseline sm:items-end justify-between sm:justify-center shrink-0 space-y-1.5">
                  <div className="h-6 w-24 rounded bg-slate-800/70" />
                </div>
              </div>
            ))}
          </div>
        </div>
      ) : isConfirmedEmpty === true ? (
        /* Confirmed Empty State */
        <div className="rounded-2xl border border-dashed border-slate-900 bg-slate-950/20 p-12 text-center text-slate-400 space-y-4">
          <div className="mx-auto w-12 h-12 rounded-2xl bg-slate-900/80 border border-slate-800 flex items-center justify-center text-slate-500">
            <CreditCard className="h-6 w-6" />
          </div>
          <div className="space-y-1 max-w-sm mx-auto">
            <h3 className="text-sm font-bold text-slate-200">No payments recorded yet</h3>
            <p className="text-xs text-slate-500 leading-relaxed">
              Payments and reversals are recorded directly against active, sent invoices. When you record a payment, it will appear here in real time.
            </p>
          </div>
          <div className="pt-2">
            <Link
              href="/invoices"
              prefetch={false}
              className="inline-flex justify-center items-center gap-1.5 rounded-lg bg-indigo-600 px-4 py-2 text-xs font-semibold text-white hover:bg-indigo-500 transition shadow shadow-indigo-600/20"
            >
              View Invoices
            </Link>
          </div>
        </div>
      ) : filteredPayments.length > 0 ? (
        /* Payment Event Cards */
        <div className="space-y-3">
          {filteredPayments.map((p) => {
            const isReversal = !!p.reverses_id || p.amount_minor < 0;
            const invoiceHref = `/invoices/${p.invoice_id}?from=${encodeURIComponent('/payments')}`;

            return (
              <div
                key={p.id}
                className={`rounded-2xl border p-4 sm:p-5 transition flex flex-col sm:flex-row sm:items-center justify-between gap-4 ${
                  isReversal
                    ? 'border-rose-950/50 bg-rose-950/10 hover:border-rose-900/60'
                    : 'border-slate-900 bg-slate-950/40 hover:border-slate-800'
                }`}
              >
                <div className="space-y-1.5 min-w-0 flex-1">
                  {/* Date, Method Badge, Reversal Badge */}
                  <div className="flex flex-wrap items-center gap-2">
                    <span className="text-xs font-semibold text-slate-400">
                      {p.occurred_at || new Date(p.created_at).toLocaleDateString()}
                    </span>
                    <span className="text-slate-700">&bull;</span>
                    <span className="inline-flex items-center px-2 py-0.5 rounded text-[11px] font-medium bg-slate-900 border border-slate-800 text-slate-300">
                      {formatMethod(p.method)}
                    </span>
                    {isReversal && (
                      <span className="inline-flex items-center px-2 py-0.5 rounded text-[10px] font-bold uppercase tracking-wider bg-rose-950/60 border border-rose-900/60 text-rose-400">
                        Reversal
                      </span>
                    )}
                  </div>

                  {/* Client Name & Linked Invoice */}
                  <div className="flex flex-wrap items-center gap-2 pt-0.5">
                    <span className="font-bold text-sm sm:text-base text-white">
                      {p.client_name || 'Client'}
                    </span>
                    {p.invoice_number && (
                      <Link
                        href={invoiceHref}
                        prefetch={false}
                        className="inline-flex items-center gap-1 text-xs font-semibold text-indigo-400 hover:text-indigo-300 transition"
                      >
                        <span>#{p.invoice_number}</span>
                        <ExternalLink className="h-3 w-3 opacity-60" />
                      </Link>
                    )}
                  </div>

                  {/* Note / Reference */}
                  {p.note && (
                    <p className="text-xs text-slate-400 italic pt-0.5">
                      &ldquo;{p.note}&rdquo;
                    </p>
                  )}
                </div>

                {/* Amount & Reversal indicator */}
                <div className="flex sm:flex-col items-baseline sm:items-end justify-between sm:justify-center shrink-0">
                  <span
                    className={`text-base sm:text-lg font-black tracking-tight tabular-nums ${
                      isReversal ? 'text-rose-400' : 'text-emerald-400'
                    }`}
                  >
                    {isReversal ? '-' : '+'}
                    {formatMoney({ amountMinor: Math.abs(p.amount_minor), currency: p.currency })}
                  </span>
                  {isReversal && (
                    <span className="text-[11px] font-semibold text-rose-500/80">
                      Reversal Event
                    </span>
                  )}
                </div>
              </div>
            );
          })}
        </div>
      ) : (
        /* Empty Filter State */
        <div className="rounded-2xl border border-dashed border-slate-900 bg-slate-950/20 p-8 text-center text-slate-400 space-y-3">
          <p className="text-sm font-semibold">No payments match the &ldquo;{filter}&rdquo; filter.</p>
          <button
            onClick={() => setFilter('all')}
            className="text-xs font-semibold text-indigo-400 hover:text-indigo-300 transition"
          >
            Show all payments
          </button>
        </div>
      )}
    </div>
  );
}

export default function PaymentsPage() {
  return (
    <ProtectedRoute>
      <AppShell>
        <Suspense fallback={null}>
          <PaymentsContent />
        </Suspense>
      </AppShell>
    </ProtectedRoute>
  );
}
