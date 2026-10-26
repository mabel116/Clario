'use client';

import React, { useState, useEffect, useCallback, useMemo, useRef, Suspense } from 'react';
import { createPortal } from 'react-dom';
import Link from 'next/link';
import { useRouter, useParams, useSearchParams, usePathname } from 'next/navigation';
import { ProtectedRoute } from '../../../components/ProtectedRoute';
import { AppShell } from '../../../components/AppShell';
import { useInvoice, useCanEditFinancials, usePaymentsForInvoice, useClient, useProfile } from '../../../lib/data/hooks';
import { useEntityReady } from '../../../lib/data/readiness';
import { InvoiceRepo } from '../../../lib/data/invoice';
import { PaymentRepo } from '../../../lib/data/payment';
import { RecordPaymentModal } from '../../../components/RecordPaymentModal';
import { formatMoney, parseMoneyInput, multiplyMinor } from '../../../lib/money';
import { Money } from '../../../components/ui/money';
import { useToast } from '../../../components/Toast';
import { 
  ChevronLeft, Pencil, Download, X, AlertTriangle, 
  Trash2, Send, Ban, Calendar, ChevronRight, Check, MoreHorizontal
} from 'lucide-react';
import { PaymentEventRow } from '../../../lib/sync/schema';
import { resolveInvoiceBackLink, resolveRouteParam } from '../../../lib/navigation';
import { cn } from '../../../lib/utils';
import { DatePickerPopover, formatDateDisplay } from '../../../components/ui/DatePickerPopover';

type InvoiceVisualBadge =
  | 'draft'
  | 'void'
  | 'paid'
  | 'overdue'
  | 'partially_paid'
  | 'unpaid';

function InvoiceStatusBadge({ status }: { status: InvoiceVisualBadge }) {
  const configs: Record<InvoiceVisualBadge, { label: string; dot: string; pill: string }> = {
    draft: {
      label: 'Draft',
      dot: 'bg-gray-400 dark:bg-zinc-500',
      pill: 'bg-gray-100 text-gray-700 border-gray-200 dark:bg-zinc-800/60 dark:text-zinc-300 dark:border-zinc-700',
    },
    void: {
      label: 'Void',
      dot: 'bg-gray-400 dark:bg-zinc-500',
      pill: 'bg-gray-100 text-gray-600 border-gray-200 dark:bg-zinc-800/40 dark:text-zinc-400 dark:border-zinc-700/60',
    },
    paid: {
      label: 'Paid',
      dot: 'bg-emerald-500',
      pill: 'bg-emerald-50 text-emerald-700 border-emerald-200 dark:bg-emerald-500/10 dark:text-emerald-400 dark:border-emerald-500/20',
    },
    overdue: {
      label: 'Overdue',
      dot: 'bg-rose-500',
      pill: 'bg-rose-50 text-rose-700 border-rose-200 dark:bg-rose-500/10 dark:text-rose-400 dark:border-rose-500/20',
    },
    partially_paid: {
      label: 'Partially paid',
      dot: 'bg-blue-500',
      pill: 'bg-blue-50 text-blue-700 border-blue-200 dark:bg-blue-500/10 dark:text-blue-400 dark:border-blue-500/20',
    },
    unpaid: {
      label: 'Unpaid',
      dot: 'bg-amber-500',
      pill: 'bg-amber-50 text-amber-700 border-amber-200 dark:bg-amber-500/10 dark:text-amber-400 dark:border-amber-500/20',
    },
  };

  const config = configs[status] || configs.unpaid;
  return (
    <span
      className={cn(
        'inline-flex items-center gap-1.5 px-2.5 py-1 rounded-full text-[12px] leading-none font-medium border select-none shrink-0',
        config.pill
      )}
      aria-label={`Status: ${config.label}`}
    >
      <span className={cn('w-1.5 h-1.5 rounded-full shrink-0', config.dot)} aria-hidden="true" />
      {config.label}
    </span>
  );
}

const StatusBadge = InvoiceStatusBadge;

// DatePickerPopover imported from shared ui component
export function InvoiceDetailsSkeleton() {
  return (
    <div className="w-full pb-12 animate-pulse text-left font-sans">
      <div className="sticky top-0 z-30 w-full px-4 sm:px-6 lg:px-8 pt-5 pb-3.5 bg-white dark:bg-[#09090b] border-b border-gray-200 dark:border-[#27272a]">
        <div className="w-full">
          <div className="h-7 w-20 bg-gray-200 dark:bg-[#27272a] rounded-lg" />
          <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-3 mt-2.5">
            <div className="flex flex-wrap items-center gap-2.5 sm:gap-3">
              <div className="inline-flex items-baseline gap-1.5 sm:gap-2">
                <div className="h-4 w-24 rounded-md bg-gray-200 dark:bg-zinc-800" />
                <div className="h-3 w-4 rounded bg-gray-200 dark:bg-zinc-800" />
                <div className="h-7 w-28 rounded-lg bg-gray-200 dark:bg-zinc-800" />
              </div>
              <div className="inline-flex items-center">
                <div className="h-6 w-20 rounded-full bg-gray-200 dark:bg-zinc-800" />
              </div>
            </div>
            <div className="hidden sm:flex items-center gap-2.5">
              <div className="h-10 w-28 bg-gray-200 dark:bg-[#27272a] rounded-xl" />
              <div className="h-10 w-28 bg-gray-200 dark:bg-[#27272a] rounded-xl" />
              <div className="h-10 w-32 bg-gray-200 dark:bg-[#27272a] rounded-xl" />
            </div>
            <div className="grid grid-cols-2 gap-2 sm:hidden w-full mt-1">
              <div className="h-10 w-full bg-gray-200 dark:bg-[#27272a] rounded-xl" />
              <div className="h-10 w-full bg-gray-200 dark:bg-[#27272a] rounded-xl" />
            </div>
          </div>
        </div>
      </div>

      <div className="px-4 sm:px-6 lg:px-8 py-6 max-w-[1040px] space-y-6">
        <div className="rounded-2xl border border-gray-200 dark:border-[#27272a] bg-white dark:bg-[#18181b] p-5 sm:p-8 space-y-6">
          <div className="h-5 w-32 bg-gray-200 dark:bg-[#27272a] rounded" />
          <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
            <div className="space-y-2">
              <div className="h-4 w-16 bg-gray-200 dark:bg-[#27272a] rounded" />
              <div className="h-5 w-36 bg-gray-200 dark:bg-[#27272a] rounded" />
              <div className="h-4 w-44 bg-gray-100 dark:bg-[#121215] rounded" />
            </div>
            <div className="space-y-2">
              <div className="h-4 w-16 bg-gray-200 dark:bg-[#27272a] rounded" />
              <div className="h-5 w-36 bg-gray-200 dark:bg-[#27272a] rounded" />
              <div className="h-4 w-44 bg-gray-100 dark:bg-[#121215] rounded" />
            </div>
            <div className="space-y-2">
              <div className="h-4 w-24 bg-gray-200 dark:bg-[#27272a] rounded" />
              <div className="h-4 w-32 bg-gray-100 dark:bg-[#121215] rounded" />
              <div className="h-4 w-32 bg-gray-100 dark:bg-[#121215] rounded" />
            </div>
          </div>
          <div className="h-32 bg-gray-100 dark:bg-[#121215] rounded-xl" />
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

export const InvoiceDetailClient = InvoiceDetailsClient;

function InvoiceDetails({ invoiceId: propInvoiceId }: { invoiceId: string }) {
  const router = useRouter();
  const params = useParams();
  const pathname = usePathname();
  const invoiceId = propInvoiceId || resolveRouteParam(params?.id as string | undefined, 'invoices', pathname);
  const searchParams = useSearchParams();
  const fromParam = searchParams?.get('from') || null;
  const { showToast } = useToast();

  const [isMounted, setIsMounted] = useState(false);
  useEffect(() => {
    setIsMounted(true);
  }, []);

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
      showToast(message, 'info');
    } finally {
      setIsGeneratingPDF(false);
    }
  };

  // Modal dialog states
  const [showMarkSent, setShowMarkSent] = useState(false);
  const [sentIssueDate, setSentIssueDate] = useState('');
  const [sentDueDate, setSentDueDate] = useState('');
  const [showVoidModal, setShowVoidModal] = useState(false);
  const [showDeleteModal, setShowDeleteModal] = useState(false);
  const [showRecordPayment, setShowRecordPayment] = useState(false);
  const [reversalTargetEvent, setReversalTargetEvent] = useState<PaymentEventRow | null>(null);
  const [reversalNote, setReversalNote] = useState('');
  const [isReversing, setIsReversing] = useState(false);
  const [isMarkingSent, setIsMarkingSent] = useState(false);
  const [isVoiding, setIsVoiding] = useState(false);
  const [isDeleting, setIsDeleting] = useState(false);
  const [mobileMoreOpen, setMobileMoreOpen] = useState(false);
  const mobileMoreRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (!mobileMoreOpen) return;
    const handleClickOutside = (e: MouseEvent) => {
      if (mobileMoreRef.current && !mobileMoreRef.current.contains(e.target as Node)) {
        setMobileMoreOpen(false);
      }
    };
    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.key === 'Escape') setMobileMoreOpen(false);
    };
    document.addEventListener('mousedown', handleClickOutside);
    window.addEventListener('keydown', handleKeyDown);
    return () => {
      document.removeEventListener('mousedown', handleClickOutside);
      window.removeEventListener('keydown', handleKeyDown);
    };
  }, [mobileMoreOpen]);

  const handleReversePayment = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!reversalTargetEvent || isReversing) return;

    try {
      setIsReversing(true);
      await PaymentRepo.reverse(reversalTargetEvent.id, reversalNote.trim() || undefined);
      setReversalTargetEvent(null);
      setReversalNote('');
      showToast('Payment reversed successfully');
    } catch (err: unknown) {
      const message = err instanceof Error ? err.message : 'Failed to reverse payment.';
      showToast(message, 'info');
    } finally {
      setIsReversing(false);
    }
  };

  const handleOpenMarkSent = () => {
    const today = new Date();
    const todayStr = today.toISOString().split('T')[0];
    setSentIssueDate(todayStr);

    const twoWeeksLater = new Date(today.getTime() + 14 * 24 * 60 * 60 * 1000);
    setSentDueDate(twoWeeksLater.toISOString().split('T')[0]);
    setShowMarkSent(true);
  };

  const handleSentIssueDateChange = (val: string) => {
    setSentIssueDate(val);
    if (val) {
      const parts = val.split('-');
      if (parts.length === 3) {
        const y = parseInt(parts[0], 10);
        const m = parseInt(parts[1], 10) - 1;
        const d = parseInt(parts[2], 10);
        const baseDate = new Date(y, m, d);
        if (!isNaN(baseDate.getTime())) {
          baseDate.setDate(baseDate.getDate() + 14);
          const nextY = baseDate.getFullYear();
          const nextM = String(baseDate.getMonth() + 1).padStart(2, '0');
          const nextD = String(baseDate.getDate()).padStart(2, '0');
          setSentDueDate(`${nextY}-${nextM}-${nextD}`);
        }
      }
    }
  };

  const handleMarkSent = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!sentIssueDate || !sentDueDate || isMarkingSent) return;

    try {
      setIsMarkingSent(true);
      await InvoiceRepo.markSent(invoiceId, sentIssueDate, sentDueDate);
      setShowMarkSent(false);
      showToast('Invoice marked as sent');
    } catch (err: unknown) {
      const message = err instanceof Error ? err.message : 'Failed to mark invoice as sent.';
      showToast(message, 'info');
    } finally {
      setIsMarkingSent(false);
    }
  };

  const handleVoid = async () => {
    if (isVoiding) return;
    try {
      setIsVoiding(true);
      await InvoiceRepo.void(invoiceId);
      setShowVoidModal(false);
      showToast('Invoice voided successfully');
    } catch (err: unknown) {
      const message = err instanceof Error ? err.message : 'Failed to void invoice.';
      showToast(message, 'info');
    } finally {
      setIsVoiding(false);
    }
  };

  const handleDelete = async () => {
    if (isDeleting) return;
    try {
      setIsDeleting(true);
      await InvoiceRepo.softDelete(invoiceId);
      setShowDeleteModal(false);
      showToast('Draft invoice deleted');
      router.push('/invoices');
    } catch (err: unknown) {
      const message = err instanceof Error ? err.message : 'Failed to delete invoice.';
      showToast(message, 'info');
    } finally {
      setIsDeleting(false);
    }
  };

  const derivedStatus: InvoiceVisualBadge = useMemo(() => {
    if (!invoice) return 'unpaid';
    if (invoice.status === 'draft') return 'draft';
    if (invoice.status === 'void') return 'void';
    if (invoice.balanceDueMinor <= 0 || invoice.displayStatus === 'paid') return 'paid';
    if (invoice.displayStatus === 'overdue') return 'overdue';
    if (invoice.amountPaidMinor > 0) return 'partially_paid';
    return 'unpaid';
  }, [invoice]);

  const currencyLabel = useMemo(() => {
    if (!invoice?.currency) return 'USD';
    const c = invoice.currency.toUpperCase();
    const map: Record<string, string> = {
      USD: 'USD - US Dollar',
      EUR: 'EUR - Euro',
      GBP: 'GBP - British Pound',
      NGN: 'NGN - Nigerian Naira',
      CAD: 'CAD - Canadian Dollar',
      AUD: 'AUD - Australian Dollar',
      ZAR: 'ZAR - South African Rand',
      GHS: 'GHS - Ghanaian Cedi',
      KES: 'KES - Kenyan Shilling',
      INR: 'INR - Indian Rupee',
      JPY: 'JPY - Japanese Yen',
      KRW: 'KRW - South Korean Won',
    };
    return map[c] || `${c} - ${c}`;
  }, [invoice?.currency]);

  const clientAddress = useMemo(() => {
    if (!client?.notes) return '';
    const lines = client.notes.split('\n');
    const addressLine = lines.find((l) => l.startsWith('Address: '));
    if (addressLine) return addressLine.replace('Address: ', '').trim();
    return '';
  }, [client?.notes]);

  const editHref = useMemo(() => {
    const base = `/invoices/${invoiceId}/edit`;
    if (fromParam) {
      return `${base}?from=${encodeURIComponent(fromParam)}`;
    }
    return base;
  }, [invoiceId, fromParam]);

  const reversedIds = useMemo(() => {
    return new Set(
      (payments || [])
        .map((p) => p.reverses_id)
        .filter((id): id is string => Boolean(id))
    );
  }, [payments]);

  // Loading state
  if (isEntityLoading) {
    return <InvoiceDetailsSkeleton />;
  }

  // Not Found State
  if (isNotFound || !invoice) {
    return (
      <div className="px-4 sm:px-6 lg:px-8 py-12 max-w-[1040px] text-center font-sans space-y-4">
        <div className="mx-auto flex h-12 w-12 items-center justify-center rounded-2xl bg-amber-500/10 border border-amber-500/20 text-amber-500">
          <AlertTriangle className="h-6 w-6" />
        </div>
        <div className="space-y-1">
          <h2 className="text-[18px] font-semibold text-gray-900 dark:text-white">Invoice Not Found</h2>
          <p className="text-[13px] text-gray-500 dark:text-zinc-400">
            This invoice may have been deleted or has not synced to your device yet.
          </p>
        </div>
        <div className="pt-2">
          <Link
            href="/invoices"
            prefetch={false}
            className="h-10 px-4 rounded-xl border border-gray-200 dark:border-[#27272a] bg-white dark:bg-[#18181b] text-[13px] font-medium text-gray-700 dark:text-zinc-300 hover:bg-gray-50 dark:hover:bg-[#222226] inline-flex items-center justify-center no-underline transition-colors"
          >
            Back to Invoices
          </Link>
        </div>
      </div>
    );
  }

  const totalMinor = invoice.total_minor;
  const amountPaidMinor = invoice.amountPaidMinor;
  const balanceDueMinor = invoice.balanceDueMinor;
  const recordedPayments = payments || [];

  return (
    <div className="w-full pb-12 text-left font-sans">
      {/* Flush Sticky Header */}
      <div className="sticky top-0 z-30 w-full px-4 sm:px-6 lg:px-8 pt-5 pb-3.5 bg-white dark:bg-[#09090b] border-b border-gray-200 dark:border-[#27272a]">
        <div className="w-full">
          {/* Row 1: Back Link */}
          <Link
            className="inline-flex items-center gap-1 px-2.5 py-1.5 rounded-lg bg-gray-100 hover:bg-gray-200/80 dark:bg-[#18181b] dark:hover:bg-[#222226] text-[12px] leading-none font-medium text-gray-700 dark:text-zinc-300 transition-colors no-underline w-fit"
            href={backLinkHref}
            prefetch={false}
            title={backLinkLabel}
          >
            <ChevronLeft className="h-3.5 w-3.5" strokeWidth={2} /> Back
          </Link>

          {/* Row 2: Title + Action Buttons */}
          <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-3 mt-2.5">
            {/* Left Title Group: Amount commands primary visual weight; StatusBadge optically centered */}
            <div className="flex flex-wrap items-center gap-2.5 sm:gap-3">
              <div className="inline-flex items-baseline gap-1.5 sm:gap-2">
                <span className="text-[14px] sm:text-[15px] font-medium text-gray-500 dark:text-zinc-400 tabular-nums">
                  {invoice.invoice_number}
                </span>
                <span className="text-[13px] font-normal text-gray-400 dark:text-zinc-500">
                  for
                </span>
                <h1 className="leading-none tracking-tight">
                  <Money
                    amountMinor={totalMinor}
                    currency={invoice.currency}
                    className="text-[22px] sm:text-[24px] font-semibold text-gray-900 dark:text-white tabular-nums leading-none tracking-tight"
                  />
                </h1>
              </div>
              <div className="inline-flex items-center">
                <StatusBadge status={derivedStatus} />
              </div>
            </div>

            {/* Desktop Action Group */}
            <div className="hidden sm:flex items-center gap-2 shrink-0">
              <button
                type="button"
                onClick={handleDownloadPDF}
                disabled={isGeneratingPDF}
                className="h-10 px-3.5 rounded-xl border border-gray-200 dark:border-[#27272a] bg-white dark:bg-[#18181b] hover:bg-gray-50 dark:hover:bg-[#222226] text-[13px] font-medium text-gray-700 dark:text-zinc-300 inline-flex items-center justify-center gap-1.5 transition-colors no-underline disabled:opacity-50"
              >
                <Download className="h-4 w-4 text-gray-500 dark:text-zinc-400" strokeWidth={2} />
                <span>{isGeneratingPDF ? 'Downloading...' : 'Download PDF'}</span>
              </button>

              {invoice.status !== 'void' && (
                <Link
                  href={editHref}
                  prefetch={false}
                  className="h-10 px-3.5 rounded-xl border border-gray-200 dark:border-[#27272a] bg-white dark:bg-[#18181b] hover:bg-gray-50 dark:hover:bg-[#222226] text-[13px] font-medium text-gray-700 dark:text-zinc-300 inline-flex items-center justify-center gap-1.5 transition-colors no-underline"
                >
                  <Pencil className="h-4 w-4 text-gray-500 dark:text-zinc-400" strokeWidth={2} />
                  <span>Edit Invoice</span>
                </Link>
              )}

              {invoice.status === 'draft' && (
                <>
                  <button
                    type="button"
                    onClick={() => setShowDeleteModal(true)}
                    className="h-10 px-3.5 rounded-xl border border-rose-200 dark:border-rose-500/20 bg-rose-50 hover:bg-rose-100 dark:bg-rose-500/10 dark:hover:bg-rose-500/20 text-[13px] font-medium text-rose-700 dark:text-rose-400 inline-flex items-center justify-center gap-1.5 transition-colors"
                  >
                    <Trash2 className="h-4 w-4" strokeWidth={2} />
                    <span>Delete Draft</span>
                  </button>
                  <button
                    type="button"
                    onClick={handleOpenMarkSent}
                    className="h-10 px-4 rounded-xl bg-blue-600 hover:bg-blue-700 text-white text-[13px] font-medium inline-flex items-center justify-center gap-1.5 transition-colors"
                  >
                    <Send className="h-4 w-4" strokeWidth={2} />
                    <span>Mark as Sent</span>
                  </button>
                </>
              )}

              {invoice.status === 'sent' && (
                <>
                  <button
                    type="button"
                    onClick={() => setShowVoidModal(true)}
                    className="h-10 px-3.5 rounded-xl border border-gray-200 dark:border-[#27272a] bg-white dark:bg-[#18181b] hover:bg-gray-50 dark:hover:bg-[#222226] text-[13px] font-medium text-gray-700 dark:text-zinc-300 inline-flex items-center justify-center gap-1.5 transition-colors"
                  >
                    <Ban className="h-4 w-4 text-gray-500 dark:text-zinc-400" strokeWidth={2} />
                    <span>Void Invoice</span>
                  </button>
                  {balanceDueMinor > 0 && (
                    <button
                      type="button"
                      onClick={() => setShowRecordPayment(true)}
                      className="h-10 px-4 rounded-xl bg-blue-600 hover:bg-blue-700 text-white text-[13px] font-medium inline-flex items-center justify-center gap-1.5 transition-colors"
                    >
                      <span>Record Payment</span>
                    </button>
                  )}
                </>
              )}
            </div>

            {/* Mobile Action Group (Option A: Single-Row with ⋯ Menu) */}
            <div className="sm:hidden w-full mt-3">
              {invoice.status === 'sent' && balanceDueMinor > 0n ? (
                <div className="flex items-center gap-2 w-full relative">
                  <button
                    type="button"
                    onClick={() => setShowRecordPayment(true)}
                    className="flex-1 h-10 px-4 rounded-xl bg-blue-600 hover:bg-blue-700 text-white text-[13px] font-medium inline-flex items-center justify-center gap-1.5 transition-colors cursor-pointer"
                  >
                    Record Payment
                  </button>
                  <button
                    type="button"
                    onClick={handleDownloadPDF}
                    disabled={isGeneratingPDF}
                    className="h-10 px-3.5 rounded-xl border border-gray-200 dark:border-[#27272a] bg-white dark:bg-[#18181b] text-[13px] font-medium text-gray-700 dark:text-zinc-300 inline-flex items-center justify-center gap-1.5 shrink-0 disabled:opacity-50 transition-colors cursor-pointer"
                  >
                    <Download className="h-4 w-4 text-gray-500 dark:text-zinc-400" strokeWidth={2} />
                    <span>PDF</span>
                  </button>
                  <div className="relative" ref={mobileMoreRef}>
                    <button
                      type="button"
                      onClick={() => setMobileMoreOpen((prev) => !prev)}
                      className="h-10 w-10 rounded-xl border border-gray-200 dark:border-[#27272a] bg-white dark:bg-[#18181b] inline-flex items-center justify-center text-gray-700 dark:text-zinc-300 shrink-0 transition-colors cursor-pointer"
                      aria-label="More actions"
                    >
                      <MoreHorizontal className="h-4 w-4 text-gray-700 dark:text-zinc-300" strokeWidth={2} />
                    </button>
                    {mobileMoreOpen && (
                      <div
                        data-popover="true"
                        className="absolute right-0 top-full mt-1.5 w-44 rounded-xl border border-gray-200 dark:border-[#27272a] bg-white dark:bg-[#18181b] shadow-xl py-1.5 z-40"
                      >
                        <Link
                          href={editHref}
                          prefetch={false}
                          onClick={() => setMobileMoreOpen(false)}
                          className="flex items-center gap-2.5 px-3.5 py-2 text-[13px] font-medium text-gray-700 dark:text-zinc-300 hover:bg-gray-50 dark:hover:bg-[#222226] transition-colors no-underline"
                        >
                          <Pencil className="h-4 w-4 text-gray-400" />
                          <span>Edit Invoice</span>
                        </Link>
                        <button
                          type="button"
                          onClick={() => {
                            setMobileMoreOpen(false);
                            setShowVoidModal(true);
                          }}
                          className="w-full flex items-center gap-2.5 px-3.5 py-2 text-[13px] font-medium text-gray-700 dark:text-zinc-300 hover:bg-gray-50 dark:hover:bg-[#222226] transition-colors text-left cursor-pointer"
                        >
                          <Ban className="h-4 w-4 text-gray-400" />
                          <span>Void Invoice</span>
                        </button>
                      </div>
                    )}
                  </div>
                </div>
              ) : invoice.status === 'sent' && balanceDueMinor <= 0n ? (
                <div className="flex items-center gap-2 w-full relative">
                  <button
                    type="button"
                    onClick={handleDownloadPDF}
                    disabled={isGeneratingPDF}
                    className="flex-1 h-10 px-3.5 rounded-xl border border-gray-200 dark:border-[#27272a] bg-white dark:bg-[#18181b] text-[13px] font-medium text-gray-700 dark:text-zinc-300 inline-flex items-center justify-center gap-1.5 disabled:opacity-50 transition-colors cursor-pointer"
                  >
                    <Download className="h-4 w-4 text-gray-500 dark:text-zinc-400" strokeWidth={2} />
                    <span>Download PDF</span>
                  </button>
                  <Link
                    href={editHref}
                    prefetch={false}
                    className="flex-1 h-10 px-3.5 rounded-xl border border-gray-200 dark:border-[#27272a] bg-white dark:bg-[#18181b] text-[13px] font-medium text-gray-700 dark:text-zinc-300 inline-flex items-center justify-center gap-1.5 no-underline transition-colors cursor-pointer"
                  >
                    <Pencil className="h-4 w-4 text-gray-500 dark:text-zinc-400" strokeWidth={2} />
                    <span>Edit Invoice</span>
                  </Link>
                  <div className="relative" ref={mobileMoreRef}>
                    <button
                      type="button"
                      onClick={() => setMobileMoreOpen((prev) => !prev)}
                      className="h-10 w-10 rounded-xl border border-gray-200 dark:border-[#27272a] bg-white dark:bg-[#18181b] inline-flex items-center justify-center text-gray-700 dark:text-zinc-300 shrink-0 transition-colors cursor-pointer"
                      aria-label="More actions"
                    >
                      <MoreHorizontal className="h-4 w-4 text-gray-700 dark:text-zinc-300" strokeWidth={2} />
                    </button>
                    {mobileMoreOpen && (
                      <div
                        data-popover="true"
                        className="absolute right-0 top-full mt-1.5 w-44 rounded-xl border border-gray-200 dark:border-[#27272a] bg-white dark:bg-[#18181b] shadow-xl py-1.5 z-40"
                      >
                        <button
                          type="button"
                          onClick={() => {
                            setMobileMoreOpen(false);
                            setShowVoidModal(true);
                          }}
                          className="w-full flex items-center gap-2.5 px-3.5 py-2 text-[13px] font-medium text-gray-700 dark:text-zinc-300 hover:bg-gray-50 dark:hover:bg-[#222226] transition-colors text-left cursor-pointer"
                        >
                          <Ban className="h-4 w-4 text-gray-400" />
                          <span>Void Invoice</span>
                        </button>
                      </div>
                    )}
                  </div>
                </div>
              ) : invoice.status === 'draft' ? (
                <div className="flex items-center gap-2 w-full relative">
                  <button
                    type="button"
                    onClick={handleOpenMarkSent}
                    className="flex-1 h-10 px-4 rounded-xl bg-blue-600 hover:bg-blue-700 text-white text-[13px] font-medium inline-flex items-center justify-center gap-1.5 transition-colors cursor-pointer"
                  >
                    <Send className="h-4 w-4" strokeWidth={2} />
                    <span>Mark as Sent</span>
                  </button>
                  <Link
                    href={editHref}
                    prefetch={false}
                    className="h-10 px-3.5 rounded-xl border border-gray-200 dark:border-[#27272a] bg-white dark:bg-[#18181b] text-[13px] font-medium text-gray-700 dark:text-zinc-300 inline-flex items-center justify-center gap-1.5 no-underline transition-colors cursor-pointer"
                  >
                    <Pencil className="h-4 w-4 text-gray-500 dark:text-zinc-400" strokeWidth={2} />
                    <span>Edit</span>
                  </Link>
                  <div className="relative" ref={mobileMoreRef}>
                    <button
                      type="button"
                      onClick={() => setMobileMoreOpen((prev) => !prev)}
                      className="h-10 w-10 rounded-xl border border-gray-200 dark:border-[#27272a] bg-white dark:bg-[#18181b] inline-flex items-center justify-center text-gray-700 dark:text-zinc-300 shrink-0 transition-colors cursor-pointer"
                      aria-label="More actions"
                    >
                      <MoreHorizontal className="h-4 w-4 text-gray-700 dark:text-zinc-300" strokeWidth={2} />
                    </button>
                    {mobileMoreOpen && (
                      <div
                        data-popover="true"
                        className="absolute right-0 top-full mt-1.5 w-44 rounded-xl border border-gray-200 dark:border-[#27272a] bg-white dark:bg-[#18181b] shadow-xl py-1.5 z-40"
                      >
                        <button
                          type="button"
                          onClick={() => {
                            setMobileMoreOpen(false);
                            handleDownloadPDF();
                          }}
                          disabled={isGeneratingPDF}
                          className="w-full flex items-center gap-2.5 px-3.5 py-2 text-[13px] font-medium text-gray-700 dark:text-zinc-300 hover:bg-gray-50 dark:hover:bg-[#222226] transition-colors text-left cursor-pointer disabled:opacity-50"
                        >
                          <Download className="h-4 w-4 text-gray-400" />
                          <span>Download PDF</span>
                        </button>
                        <button
                          type="button"
                          onClick={() => {
                            setMobileMoreOpen(false);
                            setShowDeleteModal(true);
                          }}
                          className="w-full flex items-center gap-2.5 px-3.5 py-2 text-[13px] font-medium text-rose-600 dark:text-rose-400 hover:bg-rose-50 dark:hover:bg-rose-950/30 transition-colors text-left cursor-pointer"
                        >
                          <Trash2 className="h-4 w-4 text-rose-500" />
                          <span>Delete Draft</span>
                        </button>
                      </div>
                    )}
                  </div>
                </div>
              ) : invoice.status === 'void' ? (
                <button
                  type="button"
                  onClick={handleDownloadPDF}
                  disabled={isGeneratingPDF}
                  className="w-full h-10 px-4 rounded-xl border border-gray-200 dark:border-[#27272a] bg-white dark:bg-[#18181b] text-[13px] font-medium text-gray-700 dark:text-zinc-300 inline-flex items-center justify-center gap-1.5 disabled:opacity-50 transition-colors cursor-pointer"
                >
                  <Download className="h-4 w-4 text-gray-500 dark:text-zinc-400" strokeWidth={2} />
                  <span>Download PDF</span>
                </button>
              ) : null}
            </div>
          </div>
        </div>
      </div>

      {/* Main Content Area */}
      <div className="px-4 sm:px-6 lg:px-8 py-6 max-w-[1040px] space-y-6">
        {/* Single-Sheet Document Card matching Invoice Detailz.jpg */}
        <div className="rounded-2xl border border-gray-200 dark:border-[#27272a] bg-white dark:bg-[#18181b] p-5 sm:p-8">
          {/* Full-Bleed Card Heading Divider */}
          <div className="-mx-5 sm:-mx-8 px-5 sm:px-8 pb-4 mb-6 border-b border-gray-100 dark:border-[#27272a]">
            <h2 className="text-[16px] leading-[22px] font-semibold text-gray-900 dark:text-white">
              Invoice Details
            </h2>
          </div>

          {/* 3-Column Metadata Grid */}
          <div className="grid grid-cols-1 md:grid-cols-3 gap-6 sm:gap-8 mb-8">
            {/* Col 1 (From) */}
            <div>
              <p className="text-[12px] font-normal text-gray-400 dark:text-zinc-500 mb-2.5">
                From
              </p>
              <p className="text-[14px] font-semibold text-gray-900 dark:text-white mb-1">
                {profile?.business_name || 'Your Studio'}
              </p>
              <div className="text-[13px] leading-[22px] text-gray-500 dark:text-zinc-400 whitespace-pre-line space-y-0.5">
                {profile?.business_address && <p>{profile.business_address}</p>}
              </div>
            </div>

            {/* Col 2 (Billed To) */}
            <div>
              <p className="text-[12px] font-normal text-gray-400 dark:text-zinc-500 mb-2.5">
                Billed To
              </p>
              <Link
                href={`/clients/${invoice.client_id}`}
                prefetch={false}
                className="text-[14px] font-semibold text-gray-900 dark:text-white hover:text-blue-600 dark:hover:text-blue-400 transition-colors no-underline block mb-1"
              >
                {invoice.client_name || client?.name || 'Client'}
              </Link>
              <div className="text-[13px] leading-[22px] text-gray-500 dark:text-zinc-400 whitespace-pre-line space-y-0.5">
                {client?.company && <p>{client.company}</p>}
                {client?.phone && <p>{client.phone}</p>}
                {client?.email && <p>{client.email}</p>}
                {clientAddress && <p>{clientAddress}</p>}
              </div>
            </div>

            {/* Col 3 (Invoice Details) */}
            <div>
              <p className="text-[12px] font-normal text-gray-400 dark:text-zinc-500 mb-2.5">
                Invoice Details
              </p>
              <div className="space-y-1.5 text-[13px] leading-[22px]">
                <div className="grid grid-cols-[115px_1fr] items-baseline gap-2">
                  <span className="text-gray-500 dark:text-zinc-400">Invoice Number:</span>
                  <span className="font-semibold text-gray-900 dark:text-white tabular-nums">
                    {invoice.invoice_number}
                  </span>
                </div>
                <div className="grid grid-cols-[115px_1fr] items-baseline gap-2">
                  <span className="text-gray-500 dark:text-zinc-400">Issue Date:</span>
                  <span className="font-semibold text-gray-900 dark:text-white tabular-nums">
                    {formatDateDisplay(invoice.issue_date)}
                  </span>
                </div>
                <div className="grid grid-cols-[115px_1fr] items-baseline gap-2">
                  <span className="text-gray-500 dark:text-zinc-400">Due Date:</span>
                  <span className="font-semibold text-gray-900 dark:text-white tabular-nums">
                    {formatDateDisplay(invoice.due_date)}
                  </span>
                </div>
                <div className="grid grid-cols-[115px_1fr] items-baseline gap-2">
                  <span className="text-gray-500 dark:text-zinc-400">Currency:</span>
                  <span className="font-semibold text-gray-900 dark:text-white">
                    {currencyLabel}
                  </span>
                </div>
              </div>
            </div>
          </div>

          {/* Line Items Section: Desktop Table + Mobile Stacked Rows */}
          {/* Desktop Table (hidden sm:block) */}
          <div className="hidden sm:block pt-2 overflow-x-auto">
            <table className="w-full text-left border-collapse min-w-[500px]">
              <thead>
                <tr className="bg-[#F8FAFC] dark:bg-[#121215] border-b border-gray-200 dark:border-[#27272a]">
                  <th className="py-3 px-4 text-[12px] font-medium text-gray-500 dark:text-zinc-400 w-[50%] text-left">
                    Item Description
                  </th>
                  <th className="py-3 px-4 text-[12px] font-medium text-gray-500 dark:text-zinc-400 w-[16%] text-left">
                    Quantity
                  </th>
                  <th className="py-3 px-4 text-[12px] font-medium text-gray-500 dark:text-zinc-400 w-[17%] text-left">
                    Unit Price
                  </th>
                  <th className="py-3 px-4 text-[12px] font-medium text-gray-500 dark:text-zinc-400 w-[17%] text-left">
                    Total
                  </th>
                </tr>
              </thead>
              <tbody className="divide-y divide-gray-100 dark:divide-[#27272a]">
                {(invoice.lineItems || []).map((item) => {
                  const lineTotalMinor = multiplyMinor(item.unit_price_minor, item.quantity);
                  return (
                    <tr key={item.id} className="text-[13px] font-semibold text-gray-900 dark:text-white">
                      <td className="py-4 px-4 font-normal text-gray-800 dark:text-zinc-200">
                        {item.description || '—'}
                      </td>
                      <td className="py-4 px-4 tabular-nums text-left">{item.quantity}</td>
                      <td className="py-4 px-4 tabular-nums text-left">
                        <Money amountMinor={item.unit_price_minor} currency={invoice.currency} />
                      </td>
                      <td className="py-4 px-4 tabular-nums text-left">
                        <Money amountMinor={lineTotalMinor} currency={invoice.currency} />
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>

          {/* Mobile Stacked Items (sm:hidden) */}
          <div className="sm:hidden divide-y divide-gray-100 dark:divide-[#27272a] border-y border-gray-200 dark:border-[#27272a] my-4">
            {(invoice.lineItems || []).map((item) => {
              const lineTotalMinor = multiplyMinor(item.unit_price_minor, item.quantity);
              return (
                <div key={item.id} className="py-3.5 space-y-1">
                  <div className="text-[13px] font-semibold text-gray-900 dark:text-white">
                    {item.description || '—'}
                  </div>
                  <div className="flex items-center justify-between text-[12px] text-gray-500 dark:text-zinc-400 tabular-nums">
                    <span>
                      Qty: {item.quantity} × <Money amountMinor={item.unit_price_minor} currency={invoice.currency} />
                    </span>
                    <span className="text-[13px] font-semibold text-gray-900 dark:text-white">
                      <Money amountMinor={lineTotalMinor} currency={invoice.currency} />
                    </span>
                  </div>
                </div>
              );
            })}
          </div>

          {/* Right-Aligned Totals Block (Folded Statement Summary) */}
          <div className="flex justify-end pt-5">
            {recordedPayments.length === 0 && amountPaidMinor === 0 ? (
              <div className="w-full sm:w-[320px] flex items-center justify-between">
                <span className="text-[15px] font-semibold text-gray-900 dark:text-white">Total Amount</span>
                <Money
                  amountMinor={totalMinor}
                  currency={invoice.currency}
                  className="text-[22px] font-semibold text-gray-900 dark:text-white tabular-nums"
                />
              </div>
            ) : (
              <div className="w-full sm:w-[320px] space-y-2.5">
                <div className="flex items-center justify-between text-[13px]">
                  <span className="text-gray-500 dark:text-zinc-400 font-medium">Total Amount</span>
                  <Money
                    amountMinor={totalMinor}
                    currency={invoice.currency}
                    className="text-[14px] font-semibold text-gray-900 dark:text-white tabular-nums"
                  />
                </div>
                <div className="flex items-center justify-between text-[13px]">
                  <span className="text-gray-500 dark:text-zinc-400 font-medium">Amount Paid</span>
                  <span className="text-[14px] font-semibold text-emerald-600 dark:text-emerald-400 tabular-nums">
                    -<Money amountMinor={amountPaidMinor} currency={invoice.currency} />
                  </span>
                </div>
                <div className="border-t border-gray-100 dark:border-[#27272a] pt-3 flex items-center justify-between">
                  <span className="text-[15px] font-semibold text-gray-900 dark:text-white">Balance Due</span>
                  <Money
                    amountMinor={balanceDueMinor}
                    currency={invoice.currency}
                    className="text-[22px] font-semibold text-gray-900 dark:text-white tabular-nums"
                  />
                </div>
              </div>
            )}
          </div>

          {/* Bottom Notes Section */}
          {(invoice.notes || invoice.internal_note) && (
            <div className="border-t border-gray-100 dark:border-[#27272a] mt-6 pt-6 grid grid-cols-1 md:grid-cols-2 gap-6">
              {invoice.notes && (
                <div className="space-y-1">
                  <span className="text-[12px] font-semibold text-gray-600 dark:text-zinc-400 block">
                    Notes:
                  </span>
                  <p className="text-[13px] leading-relaxed text-gray-500 dark:text-zinc-400 whitespace-pre-line">
                    {invoice.notes}
                  </p>
                </div>
              )}
              {invoice.internal_note && (
                <div className="space-y-1">
                  <span className="text-[12px] font-semibold text-gray-600 dark:text-zinc-400 block">
                    Internal Note:
                  </span>
                  <p className="text-[13px] leading-relaxed text-gray-500 dark:text-zinc-400 whitespace-pre-line">
                    {invoice.internal_note}
                  </p>
                </div>
              )}
            </div>
          )}
        </div>

        {/* Conditional Payments Recorded Card */}
        {recordedPayments.length > 0 && (
          <div className="rounded-2xl border border-gray-200 dark:border-[#27272a] bg-white dark:bg-[#18181b] p-5 sm:p-8 space-y-4">
            <div className="-mx-5 sm:-mx-8 px-5 sm:px-8 pb-4 mb-4 border-b border-gray-100 dark:border-[#27272a]">
              <h2 className="text-[16px] leading-[22px] font-semibold text-gray-900 dark:text-white">
                Payments Recorded
              </h2>
            </div>
            <div className="divide-y divide-gray-100 dark:divide-[#27272a]">
              {recordedPayments.map((p) => {
                const isReversed = reversedIds.has(p.id) || p.amount_minor < 0 || Boolean(p.reverses_id);
                const isReversible = !isReversed && p.amount_minor > 0 && invoice.status !== 'void';
                return (
                  <div key={p.id} className="py-3 flex flex-col sm:flex-row sm:items-center justify-between gap-3">
                    <div className="space-y-0.5">
                      <div className="flex items-center gap-2">
                        <span className="text-[13px] font-semibold text-gray-900 dark:text-white tabular-nums">
                          {formatDateDisplay(p.occurred_at || p.created_at)}
                        </span>
                        <span className="text-[11px] font-medium px-2 py-0.5 rounded-full bg-gray-100 dark:bg-zinc-800 text-gray-600 dark:text-zinc-400 capitalize">
                          {p.method?.replace('_', ' ') || 'payment'}
                        </span>
                        {isReversed && (
                          <span className="text-[11px] font-medium px-2 py-0.5 rounded-full bg-rose-50 text-rose-600 dark:bg-rose-500/10 dark:text-rose-400">
                            Reversed
                          </span>
                        )}
                      </div>
                      {p.note && (
                        <p className="text-[12px] text-gray-500 dark:text-zinc-400">
                          {p.note}
                        </p>
                      )}
                    </div>
                    <div className="flex items-center gap-3">
                      <span className={cn('text-[14px] font-semibold tabular-nums', isReversed ? 'line-through text-gray-400' : 'text-gray-900 dark:text-white')}>
                        <Money amountMinor={p.amount_minor} currency={p.currency || invoice.currency} />
                      </span>
                      {isReversible && (
                        <button
                          type="button"
                          onClick={() => {
                            setReversalTargetEvent(p);
                            setReversalNote('');
                          }}
                          className="h-8 px-2.5 rounded-lg border border-gray-200 dark:border-[#27272a] text-[12px] font-medium text-gray-700 dark:text-zinc-300 hover:bg-gray-50 dark:hover:bg-[#222226] transition-colors"
                        >
                          Reverse
                        </button>
                      )}
                    </div>
                  </div>
                );
              })}
            </div>
          </div>
        )}
      </div>

      {/* Portal Action Modals */}
      {isMounted && (
        <>
          {/* Mark as Sent Modal */}
          {showMarkSent && createPortal(
            <div className="fixed inset-0 z-[100] w-screen h-dvh bg-black/60 backdrop-blur-xs flex items-end sm:items-center justify-center p-0 sm:p-4">
              <div className="w-full sm:max-w-[480px] max-h-[88dvh] sm:max-h-[85dvh] rounded-t-2xl sm:rounded-2xl border-t sm:border border-gray-200 dark:border-[#27272a] bg-white dark:bg-[#18181b] flex flex-col shadow-2xl overflow-hidden animate-in slide-in-from-bottom sm:zoom-in-95 duration-200">
                {/* Mobile Drag Handle */}
                <div className="sm:hidden w-10 h-1 rounded-full bg-gray-300 dark:bg-zinc-700 mx-auto mt-2.5 mb-1 shrink-0" />
                <div className="px-5 pt-2 pb-3.5 sm:px-6 sm:pt-5 sm:pb-4 border-b border-gray-100 dark:border-[#27272a] flex items-center justify-between gap-3 shrink-0">
                  <div className="flex items-center gap-2">
                    <Send className="h-4.5 w-4.5 text-blue-600 dark:text-blue-400" />
                    <h3 className="text-[17px] leading-[22px] font-semibold text-gray-900 dark:text-white">
                      Mark as Sent
                    </h3>
                  </div>
                  <button
                    type="button"
                    onClick={() => setShowMarkSent(false)}
                    className="text-gray-400 hover:text-gray-600 dark:hover:text-zinc-200 p-1 rounded-lg transition-colors cursor-pointer"
                    aria-label="Close"
                  >
                    <X className="h-5 w-5" strokeWidth={2} />
                  </button>
                </div>

                <form onSubmit={handleMarkSent} className="flex flex-col flex-1 min-h-0 font-sans text-left">
                  <div className="flex-1 overflow-y-auto px-5 py-4 sm:px-6 sm:py-5 space-y-4">
                  <p className="text-[13px] text-gray-500 dark:text-zinc-400">
                    Marking this invoice as sent confirms it has been delivered to your client. Confirm the issue date and due date below:
                  </p>

                  <div className="grid grid-cols-1 sm:grid-cols-2 gap-3.5">
                    <div className="space-y-1.5">
                      <label className="block text-[12px] font-medium text-gray-700 dark:text-zinc-300">
                        Issue Date
                      </label>
                      <DatePickerPopover
                        value={sentIssueDate}
                        onChange={handleSentIssueDateChange}
                        placement="top"
                      />
                    </div>
                    <div className="space-y-1.5">
                      <label className="block text-[12px] font-medium text-gray-700 dark:text-zinc-300">
                        Due Date
                      </label>
                      <DatePickerPopover
                        value={sentDueDate}
                        onChange={(d) => setSentDueDate(d)}
                        placement="top"
                      />
                    </div>
                  </div>

                  </div>
                  <div className="shrink-0 px-5 py-3.5 sm:px-6 sm:py-4 border-t border-gray-100 dark:border-[#27272a] bg-white dark:bg-[#18181b] flex items-center justify-end gap-2.5">
                    <button
                      type="button"
                      onClick={() => setShowMarkSent(false)}
                      className="h-10 px-4 rounded-xl border border-gray-200 dark:border-[#27272a] bg-white dark:bg-[#18181b] text-[13px] font-medium text-gray-700 dark:text-zinc-300 hover:bg-gray-50 dark:hover:bg-[#222226] transition-colors cursor-pointer"
                    >
                      Cancel
                    </button>
                    <button
                      type="submit"
                      disabled={isMarkingSent}
                      className="h-10 px-5 rounded-xl bg-blue-600 hover:bg-blue-700 text-white text-[13px] font-medium transition-colors disabled:opacity-50 cursor-pointer"
                    >
                      {isMarkingSent ? 'Marking...' : 'Mark as Sent'}
                    </button>
                  </div>
                </form>
              </div>
            </div>,
            document.body
          )}

          {/* Void Invoice Confirmation Modal */}
          {showVoidModal && createPortal(
            <div className="fixed inset-0 z-[100] w-screen h-dvh bg-black/60 backdrop-blur-xs flex items-end sm:items-center justify-center p-0 sm:p-4">
              <div className="w-full sm:max-w-[440px] rounded-t-2xl sm:rounded-2xl border-t sm:border border-gray-200 dark:border-[#27272a] bg-white dark:bg-[#18181b] p-5 sm:p-6 space-y-4 my-auto overflow-hidden text-left shadow-2xl animate-in slide-in-from-bottom sm:zoom-in-95 duration-200">
                <div className="sm:hidden w-10 h-1 rounded-full bg-gray-300 dark:bg-zinc-700 mx-auto -mt-1 mb-1 shrink-0" />
                <div className="flex items-center justify-between">
                  <div className="flex items-center gap-2">
                    <Ban className="h-4.5 w-4.5 text-gray-500" />
                    <h3 className="text-[17px] leading-[22px] font-semibold text-gray-900 dark:text-white">
                      Void Invoice
                    </h3>
                  </div>
                  <button
                    type="button"
                    onClick={() => setShowVoidModal(false)}
                    className="text-gray-400 hover:text-gray-600 dark:hover:text-zinc-200 p-1 rounded-lg transition-colors"
                    aria-label="Close"
                  >
                    <X className="h-5 w-5" strokeWidth={2} />
                  </button>
                </div>

                <div className="space-y-3">
                  <div className="rounded-xl border border-amber-200 dark:border-amber-500/20 bg-amber-50 dark:bg-amber-500/10 p-3.5 text-[13px] text-gray-700 dark:text-zinc-300 space-y-1.5">
                    <p className="font-semibold text-gray-900 dark:text-white">Are you sure you want to void this invoice?</p>
                    <p className="text-[12px] text-gray-600 dark:text-zinc-400">
                      Voiding removes it from outstanding balances and earnings, but preserves the record for auditing. This cannot be undone.
                    </p>
                  </div>
                </div>

                <div className="pt-2 flex items-center justify-end gap-2.5 border-t border-gray-100 dark:border-[#27272a]">
                  <button
                    type="button"
                    onClick={() => setShowVoidModal(false)}
                    className="h-10 px-4 rounded-xl border border-gray-200 dark:border-[#27272a] bg-white dark:bg-[#18181b] text-[13px] font-medium text-gray-700 dark:text-zinc-300 hover:bg-gray-50 dark:hover:bg-[#222226] transition-colors"
                  >
                    Cancel
                  </button>
                  <button
                    type="button"
                    onClick={handleVoid}
                    disabled={isVoiding}
                    className="h-10 px-5 rounded-xl border border-rose-200 dark:border-rose-500/20 bg-rose-50 hover:bg-rose-100 dark:bg-rose-500/10 dark:hover:bg-rose-500/20 text-[13px] font-medium text-rose-700 dark:text-rose-400 transition-colors disabled:opacity-50"
                  >
                    {isVoiding ? 'Voiding...' : 'Void Invoice'}
                  </button>
                </div>
              </div>
            </div>,
            document.body
          )}

          {/* Delete Draft Modal */}
          {showDeleteModal && createPortal(
            <div className="fixed inset-0 z-[100] w-screen h-dvh bg-black/60 backdrop-blur-xs flex items-end sm:items-center justify-center p-0 sm:p-4">
              <div className="w-full sm:max-w-[440px] rounded-t-2xl sm:rounded-2xl border-t sm:border border-gray-200 dark:border-[#27272a] bg-white dark:bg-[#18181b] p-5 sm:p-6 space-y-4 my-auto overflow-hidden text-left shadow-2xl animate-in slide-in-from-bottom sm:zoom-in-95 duration-200">
                <div className="sm:hidden w-10 h-1 rounded-full bg-gray-300 dark:bg-zinc-700 mx-auto -mt-1 mb-1 shrink-0" />
                <div className="flex items-center justify-between">
                  <div className="flex items-center gap-2">
                    <Trash2 className="h-4.5 w-4.5 text-rose-600 dark:text-rose-400" />
                    <h3 className="text-[17px] leading-[22px] font-semibold text-gray-900 dark:text-white">
                      Delete Draft Invoice
                    </h3>
                  </div>
                  <button
                    type="button"
                    onClick={() => setShowDeleteModal(false)}
                    className="text-gray-400 hover:text-gray-600 dark:hover:text-zinc-200 p-1 rounded-lg transition-colors"
                    aria-label="Close"
                  >
                    <X className="h-5 w-5" strokeWidth={2} />
                  </button>
                </div>

                <p className="text-[13px] text-gray-500 dark:text-zinc-400">
                  Are you sure you want to delete this draft invoice? This action is soft and preserves historical data.
                </p>

                <div className="pt-2 flex items-center justify-end gap-2.5 border-t border-gray-100 dark:border-[#27272a]">
                  <button
                    type="button"
                    onClick={() => setShowDeleteModal(false)}
                    className="h-10 px-4 rounded-xl border border-gray-200 dark:border-[#27272a] bg-white dark:bg-[#18181b] text-[13px] font-medium text-gray-700 dark:text-zinc-300 hover:bg-gray-50 dark:hover:bg-[#222226] transition-colors"
                  >
                    Cancel
                  </button>
                  <button
                    type="button"
                    onClick={handleDelete}
                    disabled={isDeleting}
                    className="h-10 px-5 rounded-xl bg-rose-600 hover:bg-rose-700 text-white text-[13px] font-medium transition-colors disabled:opacity-50"
                  >
                    {isDeleting ? 'Deleting...' : 'Delete Draft'}
                  </button>
                </div>
              </div>
            </div>,
            document.body
          )}

          {/* Reverse Payment Modal */}
          {reversalTargetEvent && createPortal(
            <div className="fixed inset-0 z-[100] w-screen h-dvh bg-black/60 backdrop-blur-xs flex items-end sm:items-center justify-center p-0 sm:p-4">
              <div className="w-full sm:max-w-[440px] rounded-t-2xl sm:rounded-2xl border-t sm:border border-gray-200 dark:border-[#27272a] bg-white dark:bg-[#18181b] p-5 sm:p-6 space-y-4 my-auto overflow-hidden text-left shadow-2xl animate-in slide-in-from-bottom sm:zoom-in-95 duration-200">
                <div className="sm:hidden w-10 h-1 rounded-full bg-gray-300 dark:bg-zinc-700 mx-auto -mt-1 mb-1 shrink-0" />
                <div className="flex items-center justify-between">
                  <div className="flex items-center gap-2">
                    <AlertTriangle className="h-4.5 w-4.5 text-amber-500" />
                    <h3 className="text-[17px] leading-[22px] font-semibold text-gray-900 dark:text-white">
                      Reverse Payment
                    </h3>
                  </div>
                  <button
                    type="button"
                    onClick={() => setReversalTargetEvent(null)}
                    className="text-gray-400 hover:text-gray-600 dark:hover:text-zinc-200 p-1 rounded-lg transition-colors"
                    aria-label="Close"
                  >
                    <X className="h-5 w-5" strokeWidth={2} />
                  </button>
                </div>

                <form onSubmit={handleReversePayment} className="space-y-4">
                  <p className="text-[13px] text-gray-600 dark:text-zinc-300">
                    You are reversing payment of{' '}
                    <span className="font-semibold text-gray-900 dark:text-white">
                      <Money amountMinor={reversalTargetEvent.amount_minor} currency={reversalTargetEvent.currency || invoice.currency} />
                    </span>{' '}
                    recorded on {formatDateDisplay(reversalTargetEvent.occurred_at || reversalTargetEvent.created_at)}. This will create an offsetting reversal entry in the ledger.
                  </p>

                  <div className="space-y-1.5">
                    <label className="block text-[12px] font-medium text-gray-700 dark:text-zinc-300">
                      Reversal Reason (Optional)
                    </label>
                    <input
                      type="text"
                      placeholder="e.g. Bounced check, Client request..."
                      value={reversalNote}
                      onChange={(e) => setReversalNote(e.target.value)}
                      className="w-full h-10 px-3.5 rounded-xl bg-[#F9FAFB] dark:bg-[#121215] border border-gray-200/80 dark:border-[#27272a] text-[13px] font-medium text-gray-900 dark:text-white placeholder:font-normal placeholder:text-gray-400 dark:placeholder:text-zinc-500 focus:outline-none focus:border-blue-600 dark:focus:border-blue-500 focus:ring-2 focus:ring-blue-600/15 dark:focus:ring-blue-500/20 transition-colors"
                    />
                  </div>

                  <div className="pt-2 flex items-center justify-end gap-2.5 border-t border-gray-100 dark:border-[#27272a]">
                    <button
                      type="button"
                      onClick={() => setReversalTargetEvent(null)}
                      className="h-10 px-4 rounded-xl border border-gray-200 dark:border-[#27272a] bg-white dark:bg-[#18181b] text-[13px] font-medium text-gray-700 dark:text-zinc-300 hover:bg-gray-50 dark:hover:bg-[#222226] transition-colors"
                    >
                      Cancel
                    </button>
                    <button
                      type="submit"
                      disabled={isReversing}
                      className="h-10 px-5 rounded-xl bg-rose-600 hover:bg-rose-700 text-white text-[13px] font-medium transition-colors disabled:opacity-50"
                    >
                      {isReversing ? 'Reversing...' : 'Reverse Payment'}
                    </button>
                  </div>
                </form>
              </div>
            </div>,
            document.body
          )}

          {/* Record Payment Modal */}
          {showRecordPayment && (
            <RecordPaymentModal
              clientId={invoice.client_id}
              invoiceId={invoiceId}
              onClose={() => setShowRecordPayment(false)}
            />
          )}
        </>
      )}
    </div>
  );
}

export default InvoiceDetailsClient;
