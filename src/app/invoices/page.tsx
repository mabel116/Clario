'use client';

import React, { Suspense, useMemo } from 'react';
import { useRouter, useSearchParams } from 'next/navigation';
import { ProtectedRoute } from '../../components/ProtectedRoute';
import { AppShell } from '../../components/AppShell';
import { useInvoices } from '../../lib/data/hooks';
import { InvoiceRepo } from '../../lib/data/invoice';
import { useDataReady } from '../../lib/data/readiness';
import { formatMoney } from '../../lib/money';
import { FileText, ArrowLeft, Loader2 } from 'lucide-react';

function InvoicesListContent() {
  const router = useRouter();
  const searchParams = useSearchParams();
  const targetCurrency = searchParams.get('currency');
  const targetStatus = searchParams.get('status');

  const { data: invoices } = useInvoices();
  const hasInvoicesData = invoices !== undefined && invoices.length > 0;
  const { isLoading, isConfirmedEmpty } = useDataReady(hasInvoicesData, InvoiceRepo.isEmpty);

  const filteredInvoices = useMemo(() => {
    if (!invoices) return [];
    return invoices.filter((inv) => {
      // 1. Currency filter
      if (targetCurrency && inv.currency.toUpperCase() !== targetCurrency.toUpperCase()) {
        return false;
      }
      // 2. Status filter
      if (targetStatus === 'outstanding') {
        return (inv.displayStatus === 'sent' || inv.displayStatus === 'overdue') && inv.balanceDueMinor > 0;
      }
      return true;
    });
  }, [invoices, targetCurrency, targetStatus]);

  return (
    <div className="space-y-6 font-sans text-left">
      {/* Back to Dashboard */}
      <button
        onClick={() => router.push('/')}
        className="inline-flex items-center gap-2 text-xs font-semibold text-slate-400 hover:text-white transition"
      >
        <ArrowLeft className="h-4 w-4" /> Back to Dashboard
      </button>

      {/* Header */}
      <div>
        <h1 className="text-2xl font-black text-white tracking-tight flex items-center gap-2">
          <FileText className="h-6 w-6 text-indigo-500" />
          {targetCurrency ? `${targetCurrency.toUpperCase()} ` : ''}
          {targetStatus === 'outstanding' ? 'Outstanding ' : ''}
          Invoices
        </h1>
        <p className="text-xs text-slate-400 mt-1">
          {targetStatus === 'outstanding'
            ? 'Unpaid invoices awaiting payment'
            : 'All generated client invoices'}
        </p>
      </div>

      {isLoading ? (
        <div className="py-20 flex flex-col items-center justify-center text-slate-500 gap-3">
          <Loader2 className="h-8 w-8 animate-spin text-indigo-500" />
          <p className="text-sm font-semibold">Loading invoices...</p>
        </div>
      ) : isConfirmedEmpty === true ? (
        <div className="rounded-2xl border border-dashed border-slate-900 p-12 text-center text-slate-500 space-y-3">
          <p className="text-sm font-semibold">No invoices generated yet.</p>
          <p className="text-xs text-slate-600">Create your first invoice by navigating to a client profile.</p>
          <button
            onClick={() => router.push('/clients')}
            className="inline-flex justify-center items-center gap-1.5 rounded-lg bg-indigo-600 px-4 py-2 text-xs font-semibold text-white hover:bg-indigo-500 transition shadow shadow-indigo-600/20"
          >
            Go to Clients
          </button>
        </div>
      ) : filteredInvoices.length > 0 ? (
        <div className="space-y-3">
          {filteredInvoices.map((inv) => {
            const statusColors: Record<string, string> = {
              draft: 'bg-slate-900 border-slate-800 text-slate-400',
              sent: 'bg-indigo-950/40 border-indigo-900/40 text-indigo-400',
              paid: 'bg-green-950/40 border-green-900/40 text-green-400',
              partially_paid: 'bg-yellow-950/40 border-yellow-900/40 text-yellow-400',
              overdue: 'bg-red-950/40 border-red-900/40 text-red-400',
              void: 'bg-slate-950 border-slate-900/60 text-slate-600 line-through'
            };

            const badgeText: Record<string, string> = {
              draft: 'Draft',
              sent: 'Sent',
              paid: 'Paid',
              partially_paid: 'Partial',
              overdue: 'Overdue',
              void: 'Void'
            };

            return (
              <div
                key={inv.id}
                onClick={() => router.push(`/invoices/${inv.id}`)}
                className="rounded-2xl border border-slate-900/60 bg-slate-950/20 p-4 flex items-center justify-between group hover:border-slate-800 transition cursor-pointer"
              >
                <div className="min-w-0 pr-3 space-y-1">
                  <div className="flex items-center gap-2">
                    <span className="font-extrabold text-sm text-white group-hover:text-indigo-400 transition truncate">
                      {inv.invoice_number}
                    </span>
                    <span 
                      className={`inline-flex rounded px-1.5 py-0.5 text-[9px] font-bold border ${statusColors[inv.displayStatus]}`}
                      aria-label={`Status: ${badgeText[inv.displayStatus]}`}
                    >
                      {badgeText[inv.displayStatus]}
                    </span>
                  </div>
                  <div className="text-[10px] text-slate-500 font-semibold">
                    Client: <span className="text-slate-300">{inv.client_name}</span>
                    {inv.issue_date ? ` · Issued: ${inv.issue_date}` : ' · Draft'}
                    {inv.due_date ? ` · Due: ${inv.due_date}` : ''}
                  </div>
                </div>

                <div className="text-right shrink-0">
                  <div className="text-sm font-extrabold text-white">
                    {formatMoney({ amountMinor: inv.total_minor, currency: inv.currency })}
                  </div>
                  {inv.balanceDueMinor > 0 && inv.displayStatus !== 'void' && (
                    <div className="text-[10px] text-slate-400">
                      Due: {formatMoney({ amountMinor: inv.balanceDueMinor, currency: inv.currency })}
                    </div>
                  )}
                </div>
              </div>
            );
          })}
        </div>
      ) : (
        <div className="rounded-2xl border border-dashed border-slate-900 p-12 text-center text-slate-500 space-y-3">
          <p className="text-sm font-semibold">No invoices match the requested criteria.</p>
          {(targetCurrency || targetStatus) && (
            <button
              onClick={() => router.push('/invoices')}
              className="inline-flex items-center gap-1 text-xs font-semibold text-indigo-400 hover:text-indigo-300 transition"
            >
              Clear Filters
            </button>
          )}
        </div>
      )}
    </div>
  );
}

export default function InvoicesListPage() {
  return (
    <ProtectedRoute>
      <AppShell>
        <Suspense fallback={
          <div className="py-20 flex flex-col items-center justify-center text-slate-500 gap-3">
            <Loader2 className="h-8 w-8 animate-spin text-indigo-500" />
            <p className="text-sm font-semibold">Initializing invoices view...</p>
          </div>
        }>
          <InvoicesListContent />
        </Suspense>
      </AppShell>
    </ProtectedRoute>
  );
}
