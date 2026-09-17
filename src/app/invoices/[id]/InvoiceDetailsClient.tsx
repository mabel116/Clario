'use client';

import React, { useState, useEffect, useCallback, useMemo, Suspense } from 'react';
import Link from 'next/link';
import { useRouter, useParams, useSearchParams, usePathname } from 'next/navigation';
import { ProtectedRoute } from '../../../components/ProtectedRoute';
import { AppShell } from '../../../components/AppShell';
import { useInvoice, useCanEditFinancials, usePaymentsForInvoice, useClient, useProfile } from '../../../lib/data/hooks';
import { useEntityReady } from '../../../lib/data/readiness';
import { InvoiceRepo } from '../../../lib/data/invoice';
import { PaymentRepo } from '../../../lib/data/payment';
import { RecordPaymentModal } from '../../../components/RecordPaymentModal';
import { formatMoney } from '../../../lib/money';
import { 
  ArrowLeft, Edit3, Send, Ban, Trash2, Calendar, FileText, 
  User, Lock, AlertTriangle, Download, Undo2, Plus, Loader2
} from 'lucide-react';

import { PaymentEventRow } from '../../../lib/sync/schema';
import { resolveInvoiceBackLink, resolveRouteParam } from '../../../lib/navigation';

export function InvoiceDetailsSkeleton() {
  return (
    <div className="space-y-6 font-sans animate-pulse transition-opacity duration-150">
      {/* Header breadcrumb & quick actions */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
        <div className="w-full sm:w-auto">
          <div className="h-5 w-36 bg-slate-800/60 rounded" />
        </div>
        <div className="flex flex-wrap items-center gap-2 w-full sm:w-auto min-h-[76px] sm:min-h-[34px] content-start">
          <div className="h-[34px] w-[72px] bg-slate-800/60 rounded-lg" />
          <div className="h-[34px] w-[104px] bg-slate-800/60 rounded-lg" />
          <div className="h-[34px] w-[120px] bg-slate-800/60 rounded-lg" />
        </div>
      </div>

      {/* Main Details Grid */}
      <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
        {/* Left Column: Invoice Header Details & Line Items */}
        <div className="lg:col-span-2 space-y-6">
          <div className="rounded-3xl border border-slate-900 bg-slate-950/20 p-6 space-y-6 backdrop-blur-xl">
            {/* Title & Metadata */}
            <div className="flex flex-col sm:flex-row justify-between items-start gap-4 pb-6 border-b border-slate-900/60">
              <div className="space-y-2">
                <div className="h-3 w-24 bg-slate-800/60 rounded" />
                <div className="h-8 w-40 bg-slate-800/60 rounded" />
              </div>
              <div className="h-6 w-16 bg-slate-800/60 rounded-lg" />
            </div>

            {/* Dates / Client */}
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-6">
              <div className="space-y-3">
                <div className="h-3 w-16 bg-slate-800/60 rounded" />
                <div className="h-5 w-36 bg-slate-800/60 rounded" />
              </div>
              <div className="space-y-3">
                <div className="h-3 w-16 bg-slate-800/60 rounded" />
                <div className="grid grid-cols-2 gap-4">
                  <div className="h-4 w-20 bg-slate-800/60 rounded" />
                  <div className="h-4 w-20 bg-slate-800/60 rounded" />
                </div>
              </div>
            </div>

            {/* Line Items */}
            <div className="space-y-4 pt-4">
              <div className="h-3 w-20 bg-slate-800/60 rounded" />
              <div className="space-y-2">
                <div className="h-16 w-full bg-slate-900/40 rounded-xl" />
                <div className="h-16 w-full bg-slate-900/40 rounded-xl" />
              </div>
            </div>

            {/* Invoices Notes section */}
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-6 pt-4 border-t border-slate-900/60">
              <div className="space-y-2">
                <div className="h-3 w-24 bg-slate-800/60 rounded" />
                <div className="h-10 w-full bg-slate-900/40 rounded" />
              </div>
              <div className="space-y-2 bg-slate-950/40 p-4 rounded-2xl border border-slate-900">
                <div className="h-3 w-24 bg-slate-800/60 rounded" />
                <div className="h-10 w-full bg-slate-900/40 rounded" />
              </div>
            </div>
          </div>
        </div>

        {/* Right Column: Ledger Summary & Payments Shell */}
        <div className="space-y-6">
          <div className="rounded-3xl border border-slate-900 bg-slate-950/20 p-6 space-y-4 shadow-xl">
            <div className="h-4 w-36 bg-slate-800/60 rounded" />
            <div className="space-y-3 pt-2">
              <div className="h-7 w-full bg-slate-900/40 rounded" />
              <div className="h-7 w-full bg-slate-900/40 rounded" />
              <div className="h-9 w-full bg-slate-900/40 rounded" />
            </div>
          </div>

          <div className="rounded-3xl border border-slate-900 bg-slate-950/20 p-6 space-y-4 backdrop-blur-xl">
            <div className="h-4 w-32 bg-slate-800/60 rounded" />
            <div className="h-16 w-full bg-slate-900/40 rounded-xl" />
          </div>
        </div>
      </div>
    </div>
  );
}

export function InvoiceDetailsClient() {
  const params = useParams();
  const pathname = usePathname();
  const invoiceId = resolveRouteParam(params?.id as string | undefined, 'invoices', pathname);

  return (
    <ProtectedRoute>
      <AppShell>
        <Suspense fallback={<InvoiceDetailsSkeleton />}>
          <InvoiceDetails invoiceId={invoiceId} />
        </Suspense>
      </AppShell>
    </ProtectedRoute>
  );
}

function InvoiceDetails({ invoiceId: propInvoiceId }: { invoiceId: string }) {
  const router = useRouter();
  const params = useParams();
  const pathname = usePathname();
  const invoiceId = propInvoiceId || resolveRouteParam(params?.id as string | undefined, 'invoices', pathname);
  const searchParams = useSearchParams();
  const fromParam = searchParams?.get('from') || null;

  // Queries
  const { data: invoice, isLoading: isInvoiceLoading } = useInvoice(invoiceId);
  const checkInvoiceExists = useCallback(() => InvoiceRepo.exists(invoiceId), [invoiceId]);
  const hasInvoice = invoice !== null && invoice !== undefined;
  const { isLoading: isEntityLoading, isNotFound } = useEntityReady(hasInvoice, checkInvoiceExists, invoiceId);

  const { data: canEditFinancials } = useCanEditFinancials(invoiceId);
  const { data: payments } = usePaymentsForInvoice(invoiceId);
  const { data: client } = useClient(invoice?.client_id || '');
  const { data: profile } = useProfile();

  // Contextual back-link destination and label
  const { backLinkHref, backLinkLabel } = useMemo(
    () => resolveInvoiceBackLink(fromParam, client?.name, invoice?.client_id),
    [fromParam, client?.name, invoice?.client_id]
  );

  // PDF Generation State
  const [isGeneratingPDF, setIsGeneratingPDF] = useState(false);

  const handleDownloadPDF = async () => {
    if (isGeneratingPDF || !invoice || !profile || !client) return;

    try {
      setIsGeneratingPDF(true);
      const { generateInvoicePDF } = await import('../../../lib/pdf/generator');
      await generateInvoicePDF({ invoice, profile, client, mode: 'download' });
    } catch (err: unknown) {
      const message = err instanceof Error ? err.message : 'Failed to generate PDF document.';
      alert(message);
    } finally {
      setIsGeneratingPDF(false);
    }
  };

  // Modal dialog states
  const [showMarkSent, setShowMarkSent] = useState(false);
  const [sentIssueDate, setSentIssueDate] = useState('');
  const [sentDueDate, setSentDueDate] = useState('');
  const [showRecordPayment, setShowRecordPayment] = useState(false);
  const [reversalTargetEvent, setReversalTargetEvent] = useState<PaymentEventRow | null>(null);
  const [reversalNote, setReversalNote] = useState('');
  const [isReversing, setIsReversing] = useState(false);

  const handleReversePayment = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!reversalTargetEvent || isReversing) return;

    try {
      setIsReversing(true);
      await PaymentRepo.reverse(reversalTargetEvent.id, reversalNote.trim() || undefined);
      setReversalTargetEvent(null);
      setReversalNote('');
    } catch (err: unknown) {
      const message = err instanceof Error ? err.message : 'Failed to reverse payment.';
      alert(message);
    } finally {
      setIsReversing(false);
    }
  };

  // Setup date defaults when Mark as Sent is opened
  const handleOpenMarkSent = () => {
    const today = new Date();
    const todayStr = today.toISOString().split('T')[0];
    setSentIssueDate(todayStr);

    const twoWeeksLater = new Date(today.getTime() + 14 * 24 * 60 * 60 * 1000);
    setSentDueDate(twoWeeksLater.toISOString().split('T')[0]);
    setShowMarkSent(true);
  };

  const handleIssueDateChange = (val: string) => {
    setSentIssueDate(val);
    if (val) {
      const baseDate = new Date(val);
      if (!isNaN(baseDate.getTime())) {
        const nextDueDate = new Date(baseDate.getTime() + 14 * 24 * 60 * 60 * 1000);
        setSentDueDate(nextDueDate.toISOString().split('T')[0]);
      }
    }
  };

  // Lifecycle actions
  const handleMarkSent = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!sentIssueDate || !sentDueDate) return;

    try {
      await InvoiceRepo.markSent(invoiceId, sentIssueDate, sentDueDate);
      setShowMarkSent(false);
    } catch (err: unknown) {
      const message = err instanceof Error ? err.message : 'Failed to mark invoice as sent.';
      alert(message);
    }
  };

  const handleVoid = async () => {
    const proceed = confirm('Are you sure you want to void this invoice? Voiding removes it from outstanding totals and earnings, but preserves the record for auditing. This cannot be undone.');
    if (!proceed) return;

    try {
      await InvoiceRepo.void(invoiceId);
    } catch (err: unknown) {
      const message = err instanceof Error ? err.message : 'Failed to void invoice.';
      alert(message);
    }
  };

  const handleDelete = async () => {
    const proceed = confirm('Are you sure you want to delete this draft invoice? This action is soft and preserves historical data.');
    if (!proceed) return;

    try {
      await InvoiceRepo.softDelete(invoiceId);
      router.push('/clients');
    } catch (err: unknown) {
      const message = err instanceof Error ? err.message : 'Failed to delete invoice.';
      alert(message);
    }
  };

  // Synchronously derive financial editability with secondary fallback
  const isFinancialsLocked = useMemo(() => {
    if (invoice?.payments && invoice.payments.length > 0) return true;
    if (invoice?.status === 'void') return true;
    if (canEditFinancials === false) return true;
    return false;
  }, [invoice?.payments, invoice?.status, canEditFinancials]);

  const isDetailsLoading = !isNotFound && (
    !invoiceId ||
    invoiceId === '_shell_' ||
    isEntityLoading ||
    isInvoiceLoading ||
    !invoice
  );

  const [showSkeleton, setShowSkeleton] = useState(false);

  useEffect(() => {
    if (!isDetailsLoading) {
      setShowSkeleton(false);
      return;
    }
    const timer = setTimeout(() => {
      setShowSkeleton(true);
    }, 75);
    return () => clearTimeout(timer);
  }, [isDetailsLoading]);

  if (isDetailsLoading) {
    if (!showSkeleton) {
      return <div className="min-h-[600px] opacity-0" aria-busy="true" />;
    }
    return <InvoiceDetailsSkeleton />;
  }

  if (isNotFound || !invoice) {
    return (
      <div className="flex flex-col items-center justify-center min-h-[300px] text-center space-y-4">
        <div className="text-red-400 font-semibold">Invoice record not found.</div>
        <Link href={backLinkHref} prefetch={false} className="text-sm text-indigo-400 hover:underline">
          {backLinkLabel}
        </Link>
      </div>
    );
  }

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
    overdue: 'Overdue',
    void: 'Void'
  };

  const isDraft = invoice.displayStatus === 'draft';
  const isVoid = invoice.displayStatus === 'void';
  const isSent = invoice.displayStatus !== 'draft' && invoice.displayStatus !== 'void';

  return (
    <div className="space-y-6 font-sans transition-opacity duration-150">
      {/* Header breadcrumb & quick actions */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
        <Link
          href={backLinkHref}
          prefetch={false}
          className="inline-flex items-center gap-1 text-slate-400 hover:text-white transition text-sm"
        >
          <ArrowLeft className="h-4 w-4" /> {backLinkLabel.replace(/^←\s*/, '')}
        </Link>

        <div className="flex flex-wrap items-center gap-2 w-full sm:w-auto min-h-[76px] sm:min-h-[34px] content-start">
          {!isVoid && (
            <button
              onClick={() => {
                const editUrl = fromParam
                  ? `/invoices/${invoiceId}/edit?from=${encodeURIComponent(fromParam)}`
                  : `/invoices/${invoiceId}/edit`;
                router.push(editUrl);
              }}
              className="inline-flex items-center gap-1.5 rounded-lg border border-slate-800 bg-slate-900/40 hover:bg-slate-900 px-3.5 py-2 text-xs font-semibold text-white transition"
            >
              <Edit3 className="h-3.5 w-3.5" /> Edit
            </button>
          )}

          {isDraft && (
            <>
              <button
                onClick={handleOpenMarkSent}
                className="inline-flex items-center gap-1.5 rounded-lg bg-indigo-600 hover:bg-indigo-500 px-3.5 py-2 text-xs font-semibold text-white transition shadow-lg shadow-indigo-600/20"
              >
                <Send className="h-3.5 w-3.5" /> Mark as Sent
              </button>
              <button
                onClick={handleDelete}
                className="inline-flex items-center gap-1.5 rounded-lg bg-red-950/20 border border-red-900/40 hover:border-red-800 text-red-400 px-3.5 py-2 text-xs font-semibold transition"
              >
                <Trash2 className="h-3.5 w-3.5" /> Delete
              </button>
            </>
          )}

          {isSent && !isVoid && invoice.displayStatus !== 'paid' && (
            <button
              onClick={handleVoid}
              className="inline-flex items-center gap-1.5 rounded-lg bg-slate-900 border border-slate-800 hover:border-slate-700 hover:text-white text-slate-400 px-3.5 py-2 text-xs font-semibold transition"
            >
              <Ban className="h-3.5 w-3.5" /> Void Invoice
            </button>
          )}

          {invoice && profile && client && (
            <button
              onClick={handleDownloadPDF}
              disabled={isGeneratingPDF}
              className="inline-flex items-center gap-1.5 rounded-lg border border-slate-800 bg-slate-900/40 hover:bg-slate-900 px-3.5 py-2 text-xs font-semibold text-white transition disabled:opacity-50"
            >
              <Download className={`h-3.5 w-3.5 ${isGeneratingPDF ? 'animate-pulse' : ''}`} />
              {isGeneratingPDF ? 'Generating...' : 'Download PDF'}
            </button>
          )}
        </div>
      </div>

      {/* Editing Lock Banner */}
      {isFinancialsLocked && (
        <div className="w-full">
          <div className="rounded-2xl border border-yellow-900/30 bg-yellow-950/10 p-4 flex gap-3 items-start backdrop-blur-xl">
            <Lock className="h-5 w-5 text-yellow-500 shrink-0 mt-0.5" />
            <div className="space-y-1">
              <h4 className="text-xs font-bold text-yellow-500 uppercase tracking-wider">Financial Editing Locked</h4>
              <p className="text-xs text-slate-400 leading-relaxed">
                Payments have been recorded against this invoice. In order to preserve ledger integrity, numbers, dates, and line item prices are locked. Correction entries should be made via payment reversals or voiding and reissuing.
              </p>
            </div>
          </div>
        </div>
      )}

      {/* Main Details Grid */}
      <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
        
        {/* Left Column: Invoice Header Details & Line Items */}
        <div className="lg:col-span-2 space-y-6">
          <div className="rounded-3xl border border-slate-900 bg-slate-950/20 p-6 space-y-6 backdrop-blur-xl">
            {/* Title & Metadata */}
            <div className="flex flex-col sm:flex-row justify-between items-start gap-4 pb-6 border-b border-slate-900/60">
              <div className="space-y-1">
                <span className="text-xs text-slate-500 font-bold uppercase tracking-widest block">Invoice Number</span>
                <h1 className="text-2xl font-extrabold text-white font-mono">{invoice.invoice_number}</h1>
              </div>

              <div className="flex flex-col sm:items-end gap-1.5">
                <span className="text-xs text-slate-500 font-bold uppercase tracking-widest block">Status</span>
                <span className={`inline-flex rounded-lg px-2.5 py-1 text-xs font-bold border ${statusColors[invoice.displayStatus]}`}>
                  {badgeText[invoice.displayStatus]}
                </span>
              </div>
            </div>

            {/* Dates / Client */}
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-6">
              <div className="space-y-3">
                <h4 className="text-xs font-bold text-slate-500 uppercase tracking-widest flex items-center gap-1.5">
                  <User className="h-4 w-4 text-indigo-400" />
                  Billed To
                </h4>
                <div>
                  <span className="block text-white font-bold text-base">{invoice.client_name}</span>
                </div>
              </div>

              <div className="space-y-3">
                <h4 className="text-xs font-bold text-slate-500 uppercase tracking-widest flex items-center gap-1.5">
                  <Calendar className="h-4 w-4 text-indigo-400" />
                  Timeline
                </h4>
                <div className="grid grid-cols-2 gap-4 text-xs text-slate-400">
                  <div>
                    <span className="block font-semibold text-slate-500 uppercase">Issue Date</span>
                    <span className="text-white font-medium text-sm mt-0.5 block">{invoice.issue_date || 'Draft (Unissued)'}</span>
                  </div>
                  <div>
                    <span className="block font-semibold text-slate-500 uppercase">Due Date</span>
                    <span className="text-white font-medium text-sm mt-0.5 block">{invoice.due_date || 'None'}</span>
                  </div>
                </div>
              </div>
            </div>

            {/* Line Items List */}
            <div className="space-y-4 pt-4">
              <h4 className="text-xs font-bold text-slate-500 uppercase tracking-widest flex items-center gap-1.5">
                <FileText className="h-4 w-4 text-indigo-400" />
                Line Items
              </h4>

              <div className="space-y-2">
                {invoice.lineItems && invoice.lineItems.length > 0 ? (
                  invoice.lineItems.map((item) => (
                    <div
                      key={item.id}
                      className="rounded-xl border border-slate-900 bg-slate-950/20 p-4 flex flex-col sm:flex-row justify-between items-start sm:items-center gap-3"
                    >
                      <div className="min-w-0 flex-1">
                        <span className="font-bold text-sm text-white block">{item.description}</span>
                        <span className="text-xs text-slate-500 mt-1 block">
                          {item.quantity} × {formatMoney({ amountMinor: item.unit_price_minor, currency: invoice.currency })}
                        </span>
                      </div>
                      <span className="font-extrabold text-sm text-slate-300">
                        {formatMoney({ amountMinor: item.line_total_minor, currency: invoice.currency })}
                      </span>
                    </div>
                  ))
                ) : (
                  <p className="text-xs text-slate-500 italic">No line items added yet.</p>
                )}
              </div>
            </div>

            {/* Invoices Notes section */}
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-6 pt-4 border-t border-slate-900/60">
              <div className="space-y-2">
                <h5 className="text-xs font-bold text-slate-500 uppercase tracking-widest">Public Terms</h5>
                <p className="text-sm text-slate-400 whitespace-pre-line leading-relaxed">
                  {invoice.notes || 'No terms or public memos.'}
                </p>
              </div>

              <div className="space-y-2 bg-slate-950/40 p-4 rounded-2xl border border-slate-900">
                <h5 className="text-xs font-bold text-slate-500 uppercase tracking-widest flex items-center gap-1.5">
                  <span>Private Notes</span>
                  <span className="inline-flex rounded bg-slate-900 border border-slate-800 px-1 py-0.2 text-[8px] font-bold text-slate-500 uppercase tracking-normal">Private</span>
                </h5>
                <p className="text-sm text-slate-400 whitespace-pre-line leading-relaxed">
                  {invoice.internal_note || 'No internal negotiations logged.'}
                </p>
              </div>
            </div>
          </div>
        </div>

        {/* Right Column: Ledger Summary & Payments Shell */}
        <div className="space-y-6">
          {/* Ledger calculations summary card */}
          <div className="rounded-3xl border border-slate-900 bg-gradient-to-br from-slate-900/40 to-slate-950/40 p-6 space-y-4 shadow-xl">
            <h3 className="text-sm font-bold uppercase tracking-widest text-indigo-400">Statement Summary</h3>
            
            <div className="space-y-3 pt-2">
              <div className="flex justify-between items-baseline border-b border-slate-900/40 pb-2.5">
                <span className="text-xs text-slate-400 font-semibold uppercase">Total Amount</span>
                <span className="text-lg font-bold text-white">
                  {formatMoney({ amountMinor: invoice.total_minor, currency: invoice.currency })}
                </span>
              </div>

              <div className="flex justify-between items-baseline border-b border-slate-900/40 pb-2.5">
                <span className="text-xs text-slate-400 font-semibold uppercase">Paid to Date</span>
                <span className="text-lg font-bold text-green-400">
                  {formatMoney({ amountMinor: invoice.amountPaidMinor, currency: invoice.currency })}
                </span>
              </div>

              <div className="flex justify-between items-baseline">
                <span className="text-xs text-slate-400 font-semibold uppercase">Balance Due</span>
                <span className="text-xl font-extrabold text-white">
                  {formatMoney({ amountMinor: invoice.balanceDueMinor, currency: invoice.currency })}
                </span>
              </div>
            </div>
          </div>

          {/* Payments ledger section (Prompt 8) */}
          <div className="rounded-3xl border border-slate-900 bg-slate-950/20 p-6 space-y-4 backdrop-blur-xl">
            <div className="flex items-center justify-between">
              <h3 className="text-sm font-bold uppercase tracking-widest text-slate-400">Payments Ledger</h3>
              {invoice.displayStatus !== 'draft' && invoice.displayStatus !== 'void' && (
                <button
                  onClick={() => setShowRecordPayment(true)}
                  className="inline-flex items-center gap-1 rounded bg-indigo-600 hover:bg-indigo-500 px-2.5 py-1.5 text-xs font-semibold text-white transition shadow shadow-indigo-600/10"
                >
                  <Plus className="h-3 w-3" /> Record
                </button>
              )}
            </div>

            {/* List of Payments */}
            {payments && payments.length > 0 ? (
              <div className="space-y-3">
                {(() => {
                  const reversedIds = new Set(payments.map(p => p.reverses_id).filter(Boolean) as string[]);
                  return payments.map((pmt) => {
                    const isReversal = !!pmt.reverses_id || pmt.amount_minor < 0;
                    const isReversed = reversedIds.has(pmt.id);

                    return (
                      <div
                        key={pmt.id}
                        className={`rounded-2xl border p-3.5 space-y-2 text-left transition ${
                          isReversal
                            ? 'border-red-950/40 bg-red-950/5'
                            : isReversed
                            ? 'border-slate-900 bg-slate-950/40 opacity-60'
                            : 'border-slate-900/60 bg-slate-950/20'
                        }`}
                      >
                        <div className="flex justify-between items-start">
                          <div>
                            <div className="flex items-center gap-1.5">
                              <span className={`text-sm font-extrabold ${isReversal ? 'text-red-400' : 'text-white'}`}>
                                {isReversal ? '-' : ''}
                                {formatMoney({ amountMinor: Math.abs(pmt.amount_minor), currency: invoice.currency })}
                              </span>
                              {isReversal && (
                                <span className="inline-flex items-center gap-0.5 rounded bg-red-950 border border-red-900/50 px-1 py-0.2 text-[8px] font-bold text-red-400 uppercase">
                                  Reversal
                                </span>
                              )}
                              {isReversed && (
                                <span className="inline-flex items-center gap-0.5 rounded bg-slate-900 border border-slate-800 px-1 py-0.2 text-[8px] font-bold text-slate-500 uppercase">
                                  Reversed
                                </span>
                              )}
                            </div>
                            <div className="text-[10px] text-slate-500 mt-0.5">
                              {pmt.occurred_at} · {pmt.method ? pmt.method.replace('_', ' ') : 'other'}
                            </div>
                          </div>

                          {/* Reversal action button */}
                          {!isReversal && !isReversed && invoice.displayStatus !== 'void' && (
                            <button
                              onClick={() => setReversalTargetEvent(pmt)}
                              className="inline-flex items-center gap-1 rounded bg-slate-900 border border-slate-800 hover:border-slate-700 hover:text-white px-2 py-1 text-[10px] font-bold text-slate-400 transition"
                            >
                              <Undo2 className="h-3 w-3" /> Reverse
                            </button>
                          )}
                        </div>

                        {pmt.note && (
                          <p className={`text-xs text-slate-400 bg-slate-950/30 p-2 rounded-lg border border-slate-900/30 ${isReversed ? 'line-through' : ''}`}>
                            {pmt.note}
                          </p>
                        )}
                      </div>
                    );
                  });
                })()}
              </div>
            ) : (
              <div className="rounded-2xl border border-dashed border-slate-900 p-6 text-center space-y-3">
                <p className="text-xs text-slate-500">No payment events recorded against this invoice.</p>
                {invoice.displayStatus !== 'draft' && invoice.displayStatus !== 'void' ? (
                  <button
                    onClick={() => setShowRecordPayment(true)}
                    className="inline-flex items-center gap-1 text-[10px] font-bold text-indigo-400 hover:underline"
                  >
                    Record first payment
                  </button>
                ) : (
                  <p className="text-[10px] text-slate-600 italic">Invoice is in {invoice.displayStatus} state.</p>
                )}
              </div>
            )}
          </div>
        </div>
      </div>

      {/* Mark as Sent Dialog Modal */}
      {showMarkSent && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-slate-950/80 backdrop-blur-sm animate-fade-in">
          <div className="w-full max-w-md rounded-3xl border border-slate-900 bg-slate-950 p-6 shadow-2xl space-y-6">
            <div className="flex items-center justify-between">
              <h3 className="text-lg font-bold text-white">Mark Invoice as Sent</h3>
              <button onClick={() => setShowMarkSent(false)} className="p-1 rounded-lg text-slate-500 hover:text-white transition">
                <X className="h-5 w-5" />
              </button>
            </div>

            <form onSubmit={handleMarkSent} className="space-y-4">
              <div className="space-y-2">
                <label htmlFor="issueDateSent" className="text-xs font-semibold text-slate-400">Issue Date *</label>
                <input
                  id="issueDateSent"
                  type="date"
                  required
                  value={sentIssueDate}
                  onChange={(e) => handleIssueDateChange(e.target.value)}
                  className="block w-full rounded-lg border border-slate-800 bg-slate-900/40 py-2.5 px-3.5 text-sm text-white focus:border-indigo-500 focus:outline-none transition"
                />
              </div>

              <div className="space-y-2">
                <label htmlFor="dueDateSent" className="text-xs font-semibold text-slate-400">Due Date *</label>
                <input
                  id="dueDateSent"
                  type="date"
                  required
                  value={sentDueDate}
                  onChange={(e) => setSentDueDate(e.target.value)}
                  className="block w-full rounded-lg border border-slate-800 bg-slate-900/40 py-2.5 px-3.5 text-sm text-white focus:border-indigo-500 focus:outline-none transition"
                />
              </div>

              <div className="pt-2 flex justify-end gap-3">
                <button
                  type="button"
                  onClick={() => setShowMarkSent(false)}
                  className="px-4 py-2.5 rounded-lg border border-slate-800 text-sm font-semibold text-slate-400 hover:text-white transition"
                >
                  Cancel
                </button>
                <button
                  type="submit"
                  className="px-4 py-2.5 rounded-lg bg-indigo-600 text-sm font-semibold text-white hover:bg-indigo-500 transition"
                >
                  Confirm Sent
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* Record Payment Dialog Modal */}
      {showRecordPayment && (
        <RecordPaymentModal
          clientId={invoice.client_id}
          invoiceId={invoiceId}
          onClose={() => setShowRecordPayment(false)}
        />
      )}

      {/* Reversal Confirmation Dialog Modal */}
      {reversalTargetEvent && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-slate-950/80 backdrop-blur-sm animate-fade-in">
          <div className="w-full max-w-md rounded-3xl border border-slate-900 bg-slate-950 p-6 shadow-2xl space-y-6">
            <div className="flex items-center justify-between">
              <div className="flex items-center gap-2">
                <AlertTriangle className="h-5 w-5 text-red-400" />
                <h3 className="text-lg font-bold text-white">Confirm Reversal</h3>
              </div>
              <button
                onClick={() => {
                  setReversalTargetEvent(null);
                  setReversalNote('');
                }}
                className="p-1 rounded-lg text-slate-500 hover:text-white transition"
              >
                <X className="h-5 w-5" />
              </button>
            </div>

            <form onSubmit={handleReversePayment} className="space-y-4 text-left">
              <div className="rounded-2xl border border-red-950/20 bg-red-950/5 p-4 text-xs text-slate-400 space-y-2">
                <p>
                  You are about to reverse the payment of{' '}
                  <span className="font-extrabold text-white">
                    {formatMoney({ amountMinor: reversalTargetEvent.amount_minor, currency: invoice.currency })}
                  </span>{' '}
                  recorded on <span className="font-semibold text-white">{reversalTargetEvent.occurred_at}</span>.
                </p>
                <p>
                  The original payment record remains immutable in the ledger. A correcting entry with negative amount{' '}
                  <span className="font-extrabold text-red-400">
                    -{formatMoney({ amountMinor: reversalTargetEvent.amount_minor, currency: invoice.currency })}
                  </span>{' '}
                  will be appended to offset the balance. This cannot be undone.
                </p>
              </div>

              <div className="space-y-1.5">
                <label htmlFor="revNote" className="text-xs font-semibold text-slate-400">Reason for Reversal (Optional)</label>
                <textarea
                  id="revNote"
                  rows={3}
                  value={reversalNote}
                  onChange={(e) => setReversalNote(e.target.value)}
                  placeholder="e.g. Correcting double entry, check bounced, data entry mistake..."
                  className="block w-full rounded-lg border border-slate-800 bg-slate-900/40 py-2 px-3 text-sm text-white focus:border-indigo-500 focus:outline-none transition resize-none"
                />
              </div>

              <div className="pt-2 flex justify-end gap-3 border-t border-slate-900">
                <button
                  type="button"
                  onClick={() => {
                    setReversalTargetEvent(null);
                    setReversalNote('');
                  }}
                  className="px-4 py-2.5 rounded-lg border border-slate-800 text-sm font-semibold text-slate-400 hover:text-white transition"
                >
                  Cancel
                </button>
                <button
                  type="submit"
                  disabled={isReversing}
                  className="px-4 py-2.5 rounded-lg bg-red-600 hover:bg-red-500 disabled:opacity-50 text-sm font-semibold text-white transition shadow-lg shadow-red-600/20"
                >
                  {isReversing ? 'Reversing...' : 'Confirm Reversal'}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}
    </div>
  );
}

// Inline fallback X close icon since lucide might not export it or imports differ
function X(props: React.SVGProps<SVGSVGElement>) {
  return (
    <svg
      xmlns="http://www.w3.org/2000/svg"
      width="24"
      height="24"
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth="2"
      strokeLinecap="round"
      strokeLinejoin="round"
      {...props}
    >
      <path d="M18 6 6 18" />
      <path d="m6 6 12 12" />
    </svg>
  );
}
