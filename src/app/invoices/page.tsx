'use client';

import React, { Suspense, useMemo, useState, useEffect } from 'react';
import Link from 'next/link';
import { useRouter, useSearchParams } from 'next/navigation';
import { ProtectedRoute } from '../../components/ProtectedRoute';
import { AppShell } from '../../components/AppShell';
import { useInvoices, useClients, useProfile } from '../../lib/data/hooks';
import { InvoiceRepo } from '../../lib/data/invoice';
import { ClientRepo } from '../../lib/data/client';
import { ProfileRepo } from '../../lib/data/profile';
import { useDataReady } from '../../lib/data/readiness';
import { Money } from '../../components/ui/money';
import { RecordPaymentModal } from '../../components/RecordPaymentModal';
import { resolveInvoicesListNavigation } from '../../lib/navigation';
import { cn } from '../../lib/utils';
import { LiveQuery, InvoiceSummary } from '../../lib/data/types';
import {
  ArrowLeft,
  Search,
  ChevronDown,
  ChevronLeft,
  ChevronRight,
  Check,
  MoreVertical,
  Eye,
  Pencil,
  Send,
  CreditCard,
  Download,
  Loader2,
  Plus,
  X,
  FileText,
} from 'lucide-react';
import {
  DropdownMenu,
  DropdownMenuTrigger,
  DropdownMenuContent,
  DropdownMenuItem,
} from '../../components/ui/dropdown-menu';

type InvoiceVisualBadge =
  | 'draft'
  | 'void'
  | 'paid'
  | 'overdue'
  | 'partially_paid'
  | 'unpaid';

function getVisualBadgeStatus(inv: InvoiceSummary): InvoiceVisualBadge {
  if (inv.status === 'draft') return 'draft';
  if (inv.status === 'void') return 'void';
  // inv.status === 'sent'
  if (inv.balanceDueMinor <= 0 || inv.displayStatus === 'paid') return 'paid';
  if (inv.displayStatus === 'overdue') return 'overdue';
  if (inv.amountPaidMinor > 0) return 'partially_paid';
  return 'unpaid';
}

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

  const config = configs[status];
  return (
    <span
      className={cn(
        'inline-flex items-center gap-1.5 px-2.5 py-0.5 rounded-full text-[12px] leading-[16px] font-medium border shrink-0',
        config.pill
      )}
      aria-label={`Status: ${config.label}`}
    >
      <span className={cn('w-1.5 h-1.5 rounded-full', config.dot)} aria-hidden="true" />
      {config.label}
    </span>
  );
}

function formatDate(dateStr: string | null | undefined): string {
  if (!dateStr) return '—';
  try {
    const datePart = dateStr.includes('T') ? dateStr.split('T')[0] : dateStr;
    const parts = datePart.split('-');
    if (parts.length === 3 && parts[0].length === 4) {
      const year = parts[0];
      const monthIdx = parseInt(parts[1], 10) - 1;
      const day = parseInt(parts[2], 10);
      const monthNames = [
        'Jan',
        'Feb',
        'Mar',
        'Apr',
        'May',
        'Jun',
        'Jul',
        'Aug',
        'Sep',
        'Oct',
        'Nov',
        'Dec',
      ];
      if (monthIdx >= 0 && monthIdx < 12 && !isNaN(day)) {
        return `${day} ${monthNames[monthIdx]}, ${year}`;
      }
    }
    const d = new Date(dateStr);
    if (isNaN(d.getTime())) return dateStr;
    const day = d.getDate();
    const monthNames = [
      'Jan',
      'Feb',
      'Mar',
      'Apr',
      'May',
      'Jun',
      'Jul',
      'Aug',
      'Sep',
      'Oct',
      'Nov',
      'Dec',
    ];
    const month = monthNames[d.getMonth()];
    const year = d.getFullYear();
    return `${day} ${month}, ${year}`;
  } catch {
    return dateStr;
  }
}

function getPaginationPages(currentPage: number, totalPages: number): (number | 'ellipsis')[] {
  if (totalPages <= 7) {
    return Array.from({ length: totalPages }, (_, i) => i + 1);
  }
  if (currentPage <= 4) {
    return [1, 2, 3, 4, 5, 'ellipsis', totalPages];
  }
  if (currentPage >= totalPages - 3) {
    return [1, 'ellipsis', totalPages - 4, totalPages - 3, totalPages - 2, totalPages - 1, totalPages];
  }
  return [1, 'ellipsis', currentPage - 1, currentPage, currentPage + 1, 'ellipsis', totalPages];
}

function InvoicesSkeleton() {
  return (
    <div className="space-y-6 animate-pulse">
      {/* Filter Bar Skeleton */}
      <div className="flex flex-col lg:flex-row lg:items-center lg:justify-between gap-3">
        <div className="h-10 w-full lg:max-w-[380px] rounded-xl bg-gray-100 dark:bg-[#18181b] border border-gray-200 dark:border-[#27272a]" />
        <div className="flex flex-wrap items-center gap-2.5">
          <div className="h-10 w-28 rounded-xl bg-gray-100 dark:bg-[#18181b] border border-gray-200 dark:border-[#27272a]" />
          <div className="h-10 w-28 rounded-xl bg-gray-100 dark:bg-[#18181b] border border-gray-200 dark:border-[#27272a]" />
          <div className="h-10 w-28 rounded-xl bg-gray-100 dark:bg-[#18181b] border border-gray-200 dark:border-[#27272a]" />
          <div className="h-10 w-28 rounded-xl bg-gray-100 dark:bg-[#18181b] border border-gray-200 dark:border-[#27272a]" />
        </div>
      </div>

      {/* Table Skeleton */}
      <div className="rounded-2xl border border-gray-200 dark:border-[#27272a] bg-white dark:bg-[#18181b] overflow-hidden">
        <div className="h-12 bg-gray-50/80 dark:bg-[#121215] border-b border-gray-200 dark:border-[#27272a]" />
        <div className="divide-y divide-gray-100 dark:divide-[#27272a]">
          {[1, 2, 3, 4, 5].map((i) => (
            <div key={i} className="h-14 px-4 flex items-center justify-between">
              <div className="h-4 w-28 rounded bg-gray-200/70 dark:bg-[#27272a]" />
              <div className="h-4 w-36 rounded bg-gray-200/70 dark:bg-[#27272a]" />
              <div className="h-4 w-20 rounded bg-gray-200/70 dark:bg-[#27272a]" />
              <div className="h-4 w-16 rounded bg-gray-200/70 dark:bg-[#27272a]" />
            </div>
          ))}
        </div>
      </div>
    </div>
  );
}

function InvoicesListContent() {
  const router = useRouter();
  const searchParams = useSearchParams();
  const targetCurrency = searchParams?.get('currency') || null;
  const targetStatus = searchParams?.get('status') || null;

  const isOutstandingDrilldown = targetStatus === 'outstanding';
  const isOverdueDrilldown = targetStatus === 'overdue';
  const isDashboardDrilldown = isOutstandingDrilldown || isOverdueDrilldown || Boolean(targetCurrency);

  const { currentPathWithQuery } = resolveInvoicesListNavigation(
    searchParams?.toString() || '',
    targetCurrency,
    targetStatus
  );

  // Queries
  const { data: invoices } = useInvoices();
  const { data: clients } = useClients();
  const { data: profile } = useProfile();

  const hasInvoicesData = invoices !== undefined && invoices.length > 0;
  const { isLoading, isConfirmedEmpty } = useDataReady(hasInvoicesData, InvoiceRepo.isEmpty);

  // 75ms Skeleton Deferral (ADR 036 Zero-CLS)
  const [showSkeleton, setShowSkeleton] = useState(false);
  useEffect(() => {
    if (!isLoading) {
      setShowSkeleton(false);
      return;
    }
    const timer = setTimeout(() => {
      setShowSkeleton(true);
    }, 75);
    return () => clearTimeout(timer);
  }, [isLoading]);

  // Clients lookup map
  const clientMap = useMemo(() => {
    const map: Record<string, { id: string; name: string; email?: string | null; company?: string | null }> = {};
    if (clients) {
      clients.forEach((c) => {
        map[c.id] = c;
      });
    }
    return map;
  }, [clients]);

  // Filter States
  const [searchQuery, setSearchQuery] = useState('');
  const [statusFilter, setStatusFilter] = useState<string>(() => {
    if (isOverdueDrilldown) return 'overdue';
    return 'all';
  });
  const [currencyFilter, setCurrencyFilter] = useState<string>(() => {
    if (targetCurrency) return targetCurrency.toUpperCase();
    return 'all';
  });
  const [issueDateFilter, setIssueDateFilter] = useState<string>('all');
  const [dueDateFilter, setDueDateFilter] = useState<string>('all');

  // Modals & Inline dialog states
  const [recordPaymentTarget, setRecordPaymentTarget] = useState<{ clientId: string; invoiceId: string } | null>(null);
  const [markSentTarget, setMarkSentTarget] = useState<InvoiceSummary | null>(null);
  const [markSentIssueDate, setMarkSentIssueDate] = useState('');
  const [markSentDueDate, setMarkSentDueDate] = useState('');
  const [isMarkingSent, setIsMarkingSent] = useState(false);
  const [clientSelectorOpen, setClientSelectorOpen] = useState(false);
  const [selectedClientForNewInvoice, setSelectedClientForNewInvoice] = useState('');
  const [generatingPdfInvoiceId, setGeneratingPdfInvoiceId] = useState<string | null>(null);

  // Distinct currencies list
  const distinctCurrencies = useMemo(() => {
    const defaultCurr = (profile?.default_currency || 'USD').toUpperCase();
    const set = new Set<string>();
    if (invoices) {
      invoices.forEach((inv) => {
        if (inv.currency) {
          set.add(inv.currency.toUpperCase());
        }
      });
    }
    const list = Array.from(set);
    return list.sort((a, b) => {
      if (a === defaultCurr) return -1;
      if (b === defaultCurr) return 1;
      return a.localeCompare(b);
    });
  }, [invoices, profile?.default_currency]);

  // Date filter matching helpers
  const matchesIssueDate = (dateStr: string | null | undefined, filter: string): boolean => {
    if (filter === 'all') return true;
    if (!dateStr) return false;
    const isoDate = dateStr.includes('T') ? dateStr.split('T')[0] : dateStr;
    const date = new Date(isoDate);
    if (isNaN(date.getTime())) return false;

    const today = new Date();
    const todayMidnight = new Date(today.getFullYear(), today.getMonth(), today.getDate()).getTime();
    const targetMidnight = new Date(date.getFullYear(), date.getMonth(), date.getDate()).getTime();

    if (filter === 'last_7_days') {
      const diffDays = (todayMidnight - targetMidnight) / (24 * 60 * 60 * 1000);
      return diffDays >= 0 && diffDays <= 7;
    }
    if (filter === 'last_30_days') {
      const diffDays = (todayMidnight - targetMidnight) / (24 * 60 * 60 * 1000);
      return diffDays >= 0 && diffDays <= 30;
    }
    if (filter === 'last_90_days') {
      const diffDays = (todayMidnight - targetMidnight) / (24 * 60 * 60 * 1000);
      return diffDays >= 0 && diffDays <= 90;
    }
    if (filter === 'this_year') {
      return date.getFullYear() === today.getFullYear();
    }
    return true;
  };

  const matchesDueDate = (dateStr: string | null | undefined, filter: string, inv: InvoiceSummary): boolean => {
    if (filter === 'all') return true;
    if (filter === 'overdue') {
      return getVisualBadgeStatus(inv) === 'overdue';
    }
    if (!dateStr) return false;
    const isoDate = dateStr.includes('T') ? dateStr.split('T')[0] : dateStr;
    const date = new Date(isoDate);
    if (isNaN(date.getTime())) return false;

    const today = new Date();
    const todayMidnight = new Date(today.getFullYear(), today.getMonth(), today.getDate()).getTime();
    const targetMidnight = new Date(date.getFullYear(), date.getMonth(), date.getDate()).getTime();

    if (filter === 'due_7_days') {
      const diffDays = (targetMidnight - todayMidnight) / (24 * 60 * 60 * 1000);
      return diffDays >= 0 && diffDays <= 7;
    }
    if (filter === 'due_30_days') {
      const diffDays = (targetMidnight - todayMidnight) / (24 * 60 * 60 * 1000);
      return diffDays >= 0 && diffDays <= 30;
    }
    if (filter === 'this_month') {
      return date.getFullYear() === today.getFullYear() && date.getMonth() === today.getMonth();
    }
    return true;
  };

  // Filtered Invoices Computation
  const filteredInvoices = useMemo(() => {
    if (!invoices) return [];
    return invoices.filter((inv) => {
      // Base drill-down constraint: outstanding mode restricts to sent invoices with positive balance
      if (isOutstandingDrilldown) {
        const isOutstanding = (inv.displayStatus === 'sent' || inv.displayStatus === 'overdue') && inv.balanceDueMinor > 0;
        if (!isOutstanding) return false;
      }

      // 1. Status Filter
      if (statusFilter !== 'all') {
        const badge = getVisualBadgeStatus(inv);
        if (badge !== statusFilter) return false;
      }

      // 2. Currency Filter
      if (currencyFilter !== 'all') {
        if (inv.currency.toUpperCase() !== currencyFilter.toUpperCase()) {
          return false;
        }
      }

      // 3. Issue Date Filter
      if (!matchesIssueDate(inv.issue_date, issueDateFilter)) {
        return false;
      }

      // 4. Due Date Filter
      if (!matchesDueDate(inv.due_date, dueDateFilter, inv)) {
        return false;
      }

      // 5. Search Query
      if (searchQuery.trim()) {
        const q = searchQuery.toLowerCase().trim();
        const client = clientMap[inv.client_id];
        const matchInvoiceNum = inv.invoice_number.toLowerCase().includes(q);
        const matchClientName = (inv.client_name || client?.name || '').toLowerCase().includes(q);
        const matchEmail = (client?.email || '').toLowerCase().includes(q);
        const matchCompany = (client?.company || '').toLowerCase().includes(q);
        if (!matchInvoiceNum && !matchClientName && !matchEmail && !matchCompany) {
          return false;
        }
      }

      return true;
    });
  }, [
    invoices,
    isOutstandingDrilldown,
    statusFilter,
    currencyFilter,
    issueDateFilter,
    dueDateFilter,
    searchQuery,
    clientMap,
  ]);

  // Client-side pagination state
  const [currentPage, setCurrentPage] = useState(1);
  const [rowsPerPage, setRowsPerPage] = useState<number>(10);

  // Reset currentPage to 1 whenever search, filters, rowsPerPage, or URL params change
  useEffect(() => {
    setCurrentPage(1);
  }, [
    searchQuery,
    statusFilter,
    currencyFilter,
    issueDateFilter,
    dueDateFilter,
    rowsPerPage,
    targetStatus,
    targetCurrency,
  ]);

  const totalPages = Math.ceil(filteredInvoices.length / rowsPerPage) || 1;
  const paginatedInvoices = useMemo(() => {
    const start = (currentPage - 1) * rowsPerPage;
    return filteredInvoices.slice(start, start + rowsPerPage);
  }, [filteredInvoices, currentPage, rowsPerPage]);

  // Mark as sent handlers
  const handleOpenMarkSent = (inv: InvoiceSummary) => {
    const today = new Date();
    const todayStr = today.toISOString().split('T')[0];
    setMarkSentIssueDate(todayStr);

    const twoWeeksLater = new Date(today.getTime() + 14 * 24 * 60 * 60 * 1000);
    setMarkSentDueDate(twoWeeksLater.toISOString().split('T')[0]);
    setMarkSentTarget(inv);
  };

  const handleMarkSentSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!markSentTarget || !markSentIssueDate || !markSentDueDate || isMarkingSent) return;

    try {
      setIsMarkingSent(true);
      await InvoiceRepo.markAsSent(markSentTarget.id, markSentIssueDate, markSentDueDate);
      setMarkSentTarget(null);
    } catch (err: unknown) {
      const message = err instanceof Error ? err.message : 'Failed to mark invoice as sent.';
      alert(message);
    } finally {
      setIsMarkingSent(false);
    }
  };

  // On-demand PDF Download handler
  const handleDownloadPDF = async (inv: InvoiceSummary) => {
    if (generatingPdfInvoiceId) return;

    try {
      setGeneratingPdfInvoiceId(inv.id);

      const fetchOne = <T,>(query: LiveQuery<T>): Promise<T> => {
        const current = query.getValue();
        if (current !== undefined) return Promise.resolve(current);
        return new Promise((resolve) => {
          const unsub = query.subscribe((data) => {
            unsub();
            resolve(data);
          });
        });
      };

      const [invoiceDetail, clientDetail, profileRow] = await Promise.all([
        fetchOne(InvoiceRepo.get(inv.id)),
        fetchOne(ClientRepo.get(inv.client_id)),
        fetchOne(ProfileRepo.get()),
      ]);

      if (!invoiceDetail || !clientDetail || !profileRow) {
        throw new Error('Required records for PDF generation could not be retrieved.');
      }

      const { generateInvoicePDF } = await import('../../lib/pdf/generator');
      await generateInvoicePDF({
        invoice: invoiceDetail,
        client: clientDetail,
        profile: profileRow,
        mode: 'download',
      });
    } catch (err: unknown) {
      const message = err instanceof Error ? err.message : 'Failed to generate PDF document.';
      alert(message);
    } finally {
      setGeneratingPdfInvoiceId(null);
    }
  };

  // Primary Create Invoice CTA handler
  const handleCreateInvoiceClick = () => {
    if (!clients || clients.length === 0) {
      router.push('/clients');
      return;
    }
    if (clients.length === 1) {
      router.push(`/clients/${clients[0].id}/invoices/new`);
      return;
    }
    setSelectedClientForNewInvoice(clients[0].id);
    setClientSelectorOpen(true);
  };

  const handleClientSelectorConfirm = () => {
    if (selectedClientForNewInvoice) {
      router.push(`/clients/${selectedClientForNewInvoice}/invoices/new`);
      setClientSelectorOpen(false);
    }
  };

  // Filter option labels resolution
  const statusOptions = isOutstandingDrilldown
    ? [
        { id: 'all', label: 'All' },
        { id: 'unpaid', label: 'Unpaid' },
        { id: 'partially_paid', label: 'Partially paid' },
        { id: 'overdue', label: 'Overdue' },
      ]
    : [
        { id: 'all', label: 'All' },
        { id: 'unpaid', label: 'Unpaid' },
        { id: 'partially_paid', label: 'Partially paid' },
        { id: 'overdue', label: 'Overdue' },
        { id: 'paid', label: 'Paid' },
        { id: 'draft', label: 'Draft' },
        { id: 'void', label: 'Void' },
      ];

  const currencyOptions = [
    { id: 'all', label: 'All' },
    ...distinctCurrencies.map((c) => ({ id: c, label: c })),
  ];

  const issueDateOptions = [
    { id: 'all', label: 'All' },
    { id: 'last_7_days', label: 'Last 7 days' },
    { id: 'last_30_days', label: 'Last 30 days' },
    { id: 'last_90_days', label: 'Last 90 days' },
    { id: 'this_year', label: 'This year' },
  ];

  const dueDateOptions = [
    { id: 'all', label: 'All' },
    { id: 'overdue', label: 'Overdue' },
    { id: 'due_7_days', label: 'Due in 7 days' },
    { id: 'due_30_days', label: 'Due in 30 days' },
    { id: 'this_month', label: 'This month' },
  ];

  const selectedStatusLabel = statusOptions.find((o) => o.id === statusFilter)?.label || 'All';
  const selectedCurrencyLabel = currencyOptions.find((o) => o.id === currencyFilter)?.label || 'All';
  const selectedIssueDateLabel = issueDateOptions.find((o) => o.id === issueDateFilter)?.label || 'All';
  const selectedDueDateLabel = dueDateOptions.find((o) => o.id === dueDateFilter)?.label || 'All';

  const hasActiveFilters =
    searchQuery.trim().length > 0 ||
    statusFilter !== (isOverdueDrilldown ? 'overdue' : 'all') ||
    currencyFilter !== (targetCurrency ? targetCurrency.toUpperCase() : 'all') ||
    issueDateFilter !== 'all' ||
    dueDateFilter !== 'all';

  const handleResetFilters = () => {
    setSearchQuery('');
    setStatusFilter(isOverdueDrilldown ? 'overdue' : 'all');
    setCurrencyFilter(targetCurrency ? targetCurrency.toUpperCase() : 'all');
    setIssueDateFilter('all');
    setDueDateFilter('all');
    setCurrentPage(1);
  };

  return (
    <div className="space-y-6 font-sans text-left pb-12">
      {/* Back Link (Scoping breadcrumb) */}
      {isDashboardDrilldown && (
        <Link
          href="/"
          prefetch={false}
          className="inline-flex items-center gap-1.5 text-[13px] font-medium text-gray-500 hover:text-gray-900 dark:text-zinc-400 dark:hover:text-white transition-colors no-underline"
        >
          <ArrowLeft className="h-3.5 w-3.5" strokeWidth={2} /> Back to Dashboard
        </Link>
      )}

      {/* Page Header */}
      <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4">
        <div>
          <h1 className="text-[24px] leading-[32px] font-semibold tracking-tight text-gray-900 dark:text-white">
            {isOutstandingDrilldown && targetCurrency
              ? `${targetCurrency.toUpperCase()} Outstanding Invoices`
              : isOutstandingDrilldown
              ? 'Outstanding Invoices'
              : 'Invoices'}
          </h1>
          <p className="text-[14px] leading-[20px] font-normal text-gray-500 dark:text-zinc-400 mt-1">
            {isOutstandingDrilldown
              ? 'Unpaid, partially paid, and overdue invoices awaiting full payment.'
              : 'Create, send, and track your invoices in one place.'}
          </p>
        </div>

        <div>
          <button
            type="button"
            onClick={handleCreateInvoiceClick}
            className="inline-flex items-center justify-center gap-2 h-10 px-4 rounded-xl bg-blue-600 hover:bg-blue-700 dark:bg-blue-600 dark:hover:bg-blue-500 text-white text-[13px] leading-none font-medium transition-colors tap-target"
          >
            <Plus className="h-4 w-4 shrink-0" strokeWidth={2} />
            <span>Create invoice</span>
          </button>
        </div>
      </div>

      {isLoading ? (
        showSkeleton ? (
          <InvoicesSkeleton />
        ) : (
          <div className="min-h-[400px] opacity-0" aria-busy="true" />
        )
      ) : isConfirmedEmpty === true ? (
        <div className="rounded-2xl border border-gray-200 dark:border-[#27272a] bg-white dark:bg-[#18181b] p-12 text-center space-y-4">
          <div className="mx-auto flex h-14 w-14 items-center justify-center rounded-2xl bg-gray-50 dark:bg-[#121215] border border-gray-200 dark:border-[#27272a] text-gray-500 dark:text-zinc-400">
            <FileText className="h-6 w-6" strokeWidth={2} />
          </div>
          <div className="space-y-1">
            <h3 className="text-lg font-semibold text-gray-900 dark:text-white">
              No invoices generated yet
            </h3>
            <p className="text-sm text-gray-500 dark:text-zinc-400 max-w-sm mx-auto">
              Create your first invoice by navigating to a client profile or adding a new client.
            </p>
          </div>
          <div>
            <button
              type="button"
              onClick={handleCreateInvoiceClick}
              className="inline-flex items-center justify-center gap-2 h-10 px-4 rounded-xl bg-blue-600 hover:bg-blue-700 text-white text-[13px] font-medium transition-colors"
            >
              <Plus className="h-4 w-4" strokeWidth={2} />
              <span>Create invoice</span>
            </button>
          </div>
        </div>
      ) : (
        <>
          {/* Standalone Filter Bar */}
          <div className="flex flex-col lg:flex-row lg:items-center lg:justify-between gap-3">
            {/* Search Input */}
            <div className="relative w-full lg:max-w-[380px]">
              <Search
                className="h-4 w-4 text-gray-400 dark:text-zinc-500 absolute left-3.5 top-1/2 -translate-y-1/2 pointer-events-none"
                strokeWidth={2}
              />
              <input
                type="text"
                value={searchQuery}
                onChange={(e) => setSearchQuery(e.target.value)}
                placeholder="Search by invoice #, client name..."
                className="w-full py-2.5 pl-10 pr-4 rounded-xl border border-gray-200 dark:border-[#27272a] bg-white dark:bg-[#18181b] text-[13px] leading-[18px] text-gray-900 dark:text-white placeholder:text-gray-400 dark:placeholder:text-zinc-500 focus:outline-none focus:border-gray-400 dark:focus:border-zinc-600 transition-colors"
              />
            </div>

            {/* Filter Pills */}
            <div className="flex flex-wrap items-center gap-2.5">
              {/* Status Pill */}
              <DropdownMenu>
                <DropdownMenuTrigger className="inline-flex items-center gap-1.5 px-3 py-2.5 rounded-xl border border-gray-200 dark:border-[#27272a] bg-white dark:bg-[#18181b] hover:bg-gray-50 dark:hover:bg-[#222226] text-[13px] leading-none transition-colors focus:outline-none">
                  <span className="text-[13px] leading-none font-medium text-gray-500 dark:text-zinc-400">
                    Status:{' '}
                    <span className="font-medium text-gray-900 dark:text-white">
                      {selectedStatusLabel}
                    </span>
                  </span>
                  <ChevronDown className="h-3.5 w-3.5 text-gray-500 dark:text-zinc-400" strokeWidth={2} />
                </DropdownMenuTrigger>
                <DropdownMenuContent align="end" className="rounded-xl border border-gray-200 dark:border-[#27272a] bg-white dark:bg-[#18181b] p-1.5 min-w-[160px] max-h-[260px] overflow-y-auto overscroll-contain z-30 shadow-none">
                  {statusOptions.map((opt) => {
                    const isActive = statusFilter === opt.id;
                    return (
                      <DropdownMenuItem
                        key={opt.id}
                        onClick={() => setStatusFilter(opt.id)}
                        className={cn(
                          'flex items-center justify-between gap-3 w-full px-3.5 py-2.5 sm:py-2 rounded-lg text-[13px] leading-none whitespace-nowrap cursor-pointer transition-colors',
                          isActive
                            ? 'font-medium text-gray-900 dark:text-white bg-gray-50 dark:bg-[#222226]'
                            : 'font-normal text-gray-600 dark:text-zinc-400 hover:text-gray-900 dark:hover:text-white hover:bg-gray-50 dark:hover:bg-[#222226]'
                        )}
                      >
                        <span>{opt.label}</span>
                        {isActive && (
                          <Check className="h-[15px] w-[15px] text-gray-900 dark:text-white shrink-0" strokeWidth={2} />
                        )}
                      </DropdownMenuItem>
                    );
                  })}
                </DropdownMenuContent>
              </DropdownMenu>

              {/* Currency Pill */}
              <DropdownMenu>
                <DropdownMenuTrigger className="inline-flex items-center gap-1.5 px-3 py-2.5 rounded-xl border border-gray-200 dark:border-[#27272a] bg-white dark:bg-[#18181b] hover:bg-gray-50 dark:hover:bg-[#222226] text-[13px] leading-none transition-colors focus:outline-none">
                  <span className="text-[13px] leading-none font-medium text-gray-500 dark:text-zinc-400">
                    Currency:{' '}
                    <span className="font-medium text-gray-900 dark:text-white">
                      {selectedCurrencyLabel}
                    </span>
                  </span>
                  <ChevronDown className="h-3.5 w-3.5 text-gray-500 dark:text-zinc-400" strokeWidth={2} />
                </DropdownMenuTrigger>
                <DropdownMenuContent align="end" className="rounded-xl border border-gray-200 dark:border-[#27272a] bg-white dark:bg-[#18181b] p-1.5 min-w-[160px] max-h-[260px] overflow-y-auto overscroll-contain z-30 shadow-none">
                  {currencyOptions.map((opt) => {
                    const isActive = currencyFilter === opt.id;
                    return (
                      <DropdownMenuItem
                        key={opt.id}
                        onClick={() => setCurrencyFilter(opt.id)}
                        className={cn(
                          'flex items-center justify-between gap-3 w-full px-3.5 py-2.5 sm:py-2 rounded-lg text-[13px] leading-none whitespace-nowrap cursor-pointer transition-colors',
                          isActive
                            ? 'font-medium text-gray-900 dark:text-white bg-gray-50 dark:bg-[#222226]'
                            : 'font-normal text-gray-600 dark:text-zinc-400 hover:text-gray-900 dark:hover:text-white hover:bg-gray-50 dark:hover:bg-[#222226]'
                        )}
                      >
                        <span>{opt.label}</span>
                        {isActive && (
                          <Check className="h-[15px] w-[15px] text-gray-900 dark:text-white shrink-0" strokeWidth={2} />
                        )}
                      </DropdownMenuItem>
                    );
                  })}
                </DropdownMenuContent>
              </DropdownMenu>

              {/* Issue Date Pill */}
              <DropdownMenu>
                <DropdownMenuTrigger className="inline-flex items-center gap-1.5 px-3 py-2.5 rounded-xl border border-gray-200 dark:border-[#27272a] bg-white dark:bg-[#18181b] hover:bg-gray-50 dark:hover:bg-[#222226] text-[13px] leading-none transition-colors focus:outline-none">
                  <span className="text-[13px] leading-none font-medium text-gray-500 dark:text-zinc-400">
                    Issue Date:{' '}
                    <span className="font-medium text-gray-900 dark:text-white">
                      {selectedIssueDateLabel}
                    </span>
                  </span>
                  <ChevronDown className="h-3.5 w-3.5 text-gray-500 dark:text-zinc-400" strokeWidth={2} />
                </DropdownMenuTrigger>
                <DropdownMenuContent align="end" className="rounded-xl border border-gray-200 dark:border-[#27272a] bg-white dark:bg-[#18181b] p-1.5 min-w-[160px] max-h-[260px] overflow-y-auto overscroll-contain z-30 shadow-none">
                  {issueDateOptions.map((opt) => {
                    const isActive = issueDateFilter === opt.id;
                    return (
                      <DropdownMenuItem
                        key={opt.id}
                        onClick={() => setIssueDateFilter(opt.id)}
                        className={cn(
                          'flex items-center justify-between gap-3 w-full px-3.5 py-2.5 sm:py-2 rounded-lg text-[13px] leading-none whitespace-nowrap cursor-pointer transition-colors',
                          isActive
                            ? 'font-medium text-gray-900 dark:text-white bg-gray-50 dark:bg-[#222226]'
                            : 'font-normal text-gray-600 dark:text-zinc-400 hover:text-gray-900 dark:hover:text-white hover:bg-gray-50 dark:hover:bg-[#222226]'
                        )}
                      >
                        <span>{opt.label}</span>
                        {isActive && (
                          <Check className="h-[15px] w-[15px] text-gray-900 dark:text-white shrink-0" strokeWidth={2} />
                        )}
                      </DropdownMenuItem>
                    );
                  })}
                </DropdownMenuContent>
              </DropdownMenu>

              {/* Due Date Pill */}
              <DropdownMenu>
                <DropdownMenuTrigger className="inline-flex items-center gap-1.5 px-3 py-2.5 rounded-xl border border-gray-200 dark:border-[#27272a] bg-white dark:bg-[#18181b] hover:bg-gray-50 dark:hover:bg-[#222226] text-[13px] leading-none transition-colors focus:outline-none">
                  <span className="text-[13px] leading-none font-medium text-gray-500 dark:text-zinc-400">
                    Due Date:{' '}
                    <span className="font-medium text-gray-900 dark:text-white">
                      {selectedDueDateLabel}
                    </span>
                  </span>
                  <ChevronDown className="h-3.5 w-3.5 text-gray-500 dark:text-zinc-400" strokeWidth={2} />
                </DropdownMenuTrigger>
                <DropdownMenuContent align="end" className="rounded-xl border border-gray-200 dark:border-[#27272a] bg-white dark:bg-[#18181b] p-1.5 min-w-[160px] max-h-[260px] overflow-y-auto overscroll-contain z-30 shadow-none">
                  {dueDateOptions.map((opt) => {
                    const isActive = dueDateFilter === opt.id;
                    return (
                      <DropdownMenuItem
                        key={opt.id}
                        onClick={() => setDueDateFilter(opt.id)}
                        className={cn(
                          'flex items-center justify-between gap-3 w-full px-3.5 py-2.5 sm:py-2 rounded-lg text-[13px] leading-none whitespace-nowrap cursor-pointer transition-colors',
                          isActive
                            ? 'font-medium text-gray-900 dark:text-white bg-gray-50 dark:bg-[#222226]'
                            : 'font-normal text-gray-600 dark:text-zinc-400 hover:text-gray-900 dark:hover:text-white hover:bg-gray-50 dark:hover:bg-[#222226]'
                        )}
                      >
                        <span>{opt.label}</span>
                        {isActive && (
                          <Check className="h-[15px] w-[15px] text-gray-900 dark:text-white shrink-0" strokeWidth={2} />
                        )}
                      </DropdownMenuItem>
                    );
                  })}
                </DropdownMenuContent>
              </DropdownMenu>

              {hasActiveFilters && (
                <button
                  type="button"
                  onClick={handleResetFilters}
                  className="inline-flex items-center gap-1 px-3 py-2.5 rounded-xl text-xs font-medium text-gray-500 hover:text-gray-900 dark:text-zinc-400 dark:hover:text-white transition-colors"
                >
                  <X className="h-3.5 w-3.5" strokeWidth={2} />
                  <span>Reset</span>
                </button>
              )}
            </div>
          </div>

          {filteredInvoices.length > 0 ? (
            <>
              {/* Desktop 8-Column Table (hidden md:block) */}
              <div className="hidden md:block rounded-2xl border border-gray-200 dark:border-[#27272a] bg-white dark:bg-[#18181b] overflow-hidden">
                <table className="w-full table-auto text-left border-collapse">
                  <thead className="bg-gray-50/80 dark:bg-[#121215] border-b border-gray-200 dark:border-[#27272a]">
                    <tr>
                      <th className="py-3 px-4 text-left">
                        <span className="text-[12px] leading-[16px] font-medium text-gray-400 dark:text-zinc-500">
                          Invoice #
                        </span>
                      </th>
                      <th className="py-3 px-3.5 text-left">
                        <span className="text-[12px] leading-[16px] font-medium text-gray-400 dark:text-zinc-500">
                          Client
                        </span>
                      </th>
                      <th className="py-3 px-3.5 text-left">
                        <span className="text-[12px] leading-[16px] font-medium text-gray-400 dark:text-zinc-500">
                          Amount
                        </span>
                      </th>
                      <th className="py-3 px-3.5 text-left">
                        <span className="text-[12px] leading-[16px] font-medium text-gray-400 dark:text-zinc-500">
                          Currency
                        </span>
                      </th>
                      <th className="py-3 px-3.5 text-left">
                        <span className="text-[12px] leading-[16px] font-medium text-gray-400 dark:text-zinc-500">
                          Issue Date
                        </span>
                      </th>
                      <th className="py-3 px-3.5 text-left">
                        <span className="text-[12px] leading-[16px] font-medium text-gray-400 dark:text-zinc-500">
                          Due Date
                        </span>
                      </th>
                      <th className="py-3 px-3.5 text-left">
                        <span className="text-[12px] leading-[16px] font-medium text-gray-400 dark:text-zinc-500">
                          Status
                        </span>
                      </th>
                      <th className="py-3 px-4 text-right w-16">
                        <span className="text-[12px] leading-[16px] font-medium text-gray-400 dark:text-zinc-500">
                          Action
                        </span>
                      </th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-gray-100 dark:divide-[#27272a] bg-white dark:bg-[#18181b]">
                    {paginatedInvoices.map((inv) => {
                      const client = clientMap[inv.client_id];
                      const badgeStatus = getVisualBadgeStatus(inv);

                      return (
                        <tr
                          key={inv.id}
                          className="hover:bg-gray-50/60 dark:hover:bg-[#1c1c21]/40 transition-colors"
                        >
                          {/* 1. Invoice # */}
                          <td className="py-3.5 px-4 whitespace-nowrap">
                            <Link
                              href={`/invoices/${inv.id}?from=${encodeURIComponent(currentPathWithQuery)}`}
                              prefetch={false}
                              className="text-[14px] leading-[20px] font-medium text-gray-900 dark:text-white tabular-nums no-underline hover:text-blue-600 dark:hover:text-blue-400 transition-colors"
                            >
                              {inv.invoice_number}
                            </Link>
                          </td>

                          {/* 2. Client */}
                          <td className="max-w-[180px] lg:max-w-[220px] xl:max-w-[260px] py-3.5 px-3.5">
                            <div
                              className="text-[14px] leading-[20px] font-medium text-gray-900 dark:text-white truncate"
                              title={inv.client_name || client?.name || 'Client'}
                            >
                              {inv.client_name || client?.name || 'Client'}
                            </div>
                            <div
                              className="text-[12px] leading-[16px] font-normal text-gray-500 dark:text-zinc-400 truncate mt-0.5"
                              title={client?.email || client?.company || ''}
                            >
                              {client?.email || client?.company || '—'}
                            </div>
                          </td>

                          {/* 3. Amount */}
                          <td className="py-3.5 px-3.5 whitespace-nowrap text-left">
                            <Money
                              amountMinor={inv.total_minor}
                              currency={inv.currency}
                              variant="table"
                              tone="default"
                              className="text-[14px] leading-[20px] font-medium text-gray-900 dark:text-white tabular-nums block"
                            />
                            {inv.status === 'sent' && (
                              <div className="text-[12px] leading-[16px] font-normal text-gray-500 dark:text-zinc-400 tabular-nums mt-0.5 whitespace-nowrap">
                                Due: <Money amountMinor={inv.balanceDueMinor} currency={inv.currency} className="inline font-normal text-gray-500 dark:text-zinc-400 tabular-nums" />
                              </div>
                            )}
                          </td>

                          {/* 4. Currency */}
                          <td className="py-3.5 px-3.5 whitespace-nowrap">
                            <span className="text-[13px] leading-[18px] font-normal text-gray-600 dark:text-zinc-400 uppercase tabular-nums">
                              {inv.currency}
                            </span>
                          </td>

                          {/* 5. Issue Date */}
                          <td className="py-3.5 px-3.5 whitespace-nowrap">
                            <span className="text-[14px] leading-[20px] font-medium text-gray-900 dark:text-white tabular-nums">
                              {inv.issue_date ? formatDate(inv.issue_date) : '—'}
                            </span>
                          </td>

                          {/* 6. Due Date */}
                          <td className="py-3.5 px-3.5 whitespace-nowrap">
                            <span className="text-[14px] leading-[20px] font-normal text-gray-600 dark:text-zinc-300 tabular-nums">
                              {inv.due_date ? formatDate(inv.due_date) : '—'}
                            </span>
                          </td>

                          {/* 7. Status */}
                          <td className="py-3.5 px-3.5 whitespace-nowrap">
                            <InvoiceStatusBadge status={badgeStatus} />
                          </td>

                          {/* 8. Action */}
                          <td className="py-3.5 px-4 whitespace-nowrap text-center">
                            <DropdownMenu>
                              <DropdownMenuTrigger
                                className="inline-flex items-center justify-center h-8 w-8 rounded-lg mx-auto text-gray-800 hover:text-gray-900 dark:text-zinc-200 dark:hover:text-white hover:bg-gray-100 dark:hover:bg-[#222226] transition-colors focus:outline-none"
                                aria-label={`Actions for invoice ${inv.invoice_number}`}
                              >
                                <MoreVertical className="h-4 w-4 shrink-0" strokeWidth={2} />
                              </DropdownMenuTrigger>
                              <DropdownMenuContent
                                align="end"
                                className="min-w-[185px] rounded-xl border border-gray-200 dark:border-[#27272a] bg-white dark:bg-[#18181b] p-1.5 shadow-none z-30"
                              >
                                <DropdownMenuItem asChild className="text-[13px] leading-none font-medium text-gray-800 dark:text-zinc-100">
                                  <Link
                                    href={`/invoices/${inv.id}?from=${encodeURIComponent(currentPathWithQuery)}`}
                                    prefetch={false}
                                    className="flex items-center gap-2.5 whitespace-nowrap py-2.5 sm:py-2 px-3.5 sm:px-3 rounded-lg w-full text-left no-underline cursor-pointer hover:bg-gray-100 dark:hover:bg-[#222226]"
                                  >
                                    <Eye className="h-[15px] w-[15px] text-gray-800 dark:text-zinc-100 shrink-0" strokeWidth={2} />
                                    <span className="text-[13px] leading-none font-medium text-gray-800 dark:text-zinc-100">
                                      View invoice
                                    </span>
                                  </Link>
                                </DropdownMenuItem>

                                {inv.status !== 'void' && (
                                  <DropdownMenuItem asChild className="text-[13px] leading-none font-medium text-gray-800 dark:text-zinc-100">
                                    <Link
                                      href={`/invoices/${inv.id}/edit?from=${encodeURIComponent(currentPathWithQuery)}`}
                                      prefetch={false}
                                      className="flex items-center gap-2.5 whitespace-nowrap py-2.5 sm:py-2 px-3.5 sm:px-3 rounded-lg w-full text-left no-underline cursor-pointer hover:bg-gray-100 dark:hover:bg-[#222226]"
                                    >
                                      <Pencil className="h-[15px] w-[15px] text-gray-800 dark:text-zinc-100 shrink-0" strokeWidth={2} />
                                      <span className="text-[13px] leading-none font-medium text-gray-800 dark:text-zinc-100">
                                        Edit invoice
                                      </span>
                                    </Link>
                                  </DropdownMenuItem>
                                )}

                                {inv.status === 'draft' && (
                                  <DropdownMenuItem asChild className="text-[13px] leading-none font-medium text-gray-800 dark:text-zinc-100">
                                    <button
                                      type="button"
                                      onClick={() => handleOpenMarkSent(inv)}
                                      className="flex items-center gap-2.5 whitespace-nowrap py-2.5 sm:py-2 px-3.5 sm:px-3 rounded-lg w-full text-left no-underline cursor-pointer hover:bg-gray-100 dark:hover:bg-[#222226]"
                                    >
                                      <Send className="h-[15px] w-[15px] text-gray-800 dark:text-zinc-100 shrink-0" strokeWidth={2} />
                                      <span className="text-[13px] leading-none font-medium text-gray-800 dark:text-zinc-100">
                                        Mark as sent
                                      </span>
                                    </button>
                                  </DropdownMenuItem>
                                )}

                                {inv.status === 'sent' && inv.balanceDueMinor > 0 && (
                                  <DropdownMenuItem asChild className="text-[13px] leading-none font-medium text-gray-800 dark:text-zinc-100">
                                    <button
                                      type="button"
                                      onClick={() => setRecordPaymentTarget({ clientId: inv.client_id, invoiceId: inv.id })}
                                      className="flex items-center gap-2.5 whitespace-nowrap py-2.5 sm:py-2 px-3.5 sm:px-3 rounded-lg w-full text-left no-underline cursor-pointer hover:bg-gray-100 dark:hover:bg-[#222226]"
                                    >
                                      <CreditCard className="h-[15px] w-[15px] text-gray-800 dark:text-zinc-100 shrink-0" strokeWidth={2} />
                                      <span className="text-[13px] leading-none font-medium text-gray-800 dark:text-zinc-100">
                                        Record payment
                                      </span>
                                    </button>
                                  </DropdownMenuItem>
                                )}

                                <DropdownMenuItem asChild className="text-[13px] leading-none font-medium text-gray-800 dark:text-zinc-100">
                                  <button
                                    type="button"
                                    onClick={() => handleDownloadPDF(inv)}
                                    disabled={generatingPdfInvoiceId === inv.id}
                                    className="flex items-center gap-2.5 whitespace-nowrap py-2.5 sm:py-2 px-3.5 sm:px-3 rounded-lg w-full text-left no-underline cursor-pointer hover:bg-gray-100 dark:hover:bg-[#222226] disabled:opacity-50"
                                  >
                                    {generatingPdfInvoiceId === inv.id ? (
                                      <Loader2 className="h-[15px] w-[15px] animate-spin text-gray-800 dark:text-zinc-100 shrink-0" />
                                    ) : (
                                      <Download className="h-[15px] w-[15px] text-gray-800 dark:text-zinc-100 shrink-0" strokeWidth={2} />
                                    )}
                                    <span className="text-[13px] leading-none font-medium text-gray-800 dark:text-zinc-100">
                                      Download PDF
                                    </span>
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

              {/* Mobile 2-Row Stacked Cards (md:hidden) */}
              <div className="md:hidden space-y-3">
                {paginatedInvoices.map((inv) => {
                  const client = clientMap[inv.client_id];
                  const badgeStatus = getVisualBadgeStatus(inv);

                  return (
                    <div
                      key={inv.id}
                      className="rounded-2xl border border-gray-200 dark:border-[#27272a] bg-white dark:bg-[#18181b] p-4 text-left"
                    >
                      {/* Row 1 (Top) */}
                      <div className="flex items-start justify-between gap-3">
                        <Link
                          href={`/invoices/${inv.id}?from=${encodeURIComponent(currentPathWithQuery)}`}
                          prefetch={false}
                          className="min-w-0 no-underline group block"
                        >
                          <span className="block text-[14px] leading-[20px] font-medium text-gray-900 dark:text-white tabular-nums">
                            {inv.invoice_number}
                          </span>
                          <p className="text-[12px] leading-[16px] font-normal text-gray-500 dark:text-zinc-400 truncate mt-0.5">
                            {inv.client_name || client?.name || 'Client'}
                          </p>
                        </Link>

                        <div className="flex items-center gap-2 shrink-0">
                          <InvoiceStatusBadge status={badgeStatus} />
                          <DropdownMenu>
                            <DropdownMenuTrigger
                              className="inline-flex items-center justify-center h-8 w-8 rounded-lg mx-auto text-gray-800 hover:text-gray-900 dark:text-zinc-200 dark:hover:text-white hover:bg-gray-100 dark:hover:bg-[#222226] transition-colors focus:outline-none"
                              aria-label={`Actions for invoice ${inv.invoice_number}`}
                            >
                              <MoreVertical className="h-4 w-4 shrink-0" strokeWidth={2} />
                            </DropdownMenuTrigger>
                            <DropdownMenuContent
                              align="end"
                              className="min-w-[185px] rounded-xl border border-gray-200 dark:border-[#27272a] bg-white dark:bg-[#18181b] p-1.5 shadow-none z-30"
                            >
                              <DropdownMenuItem asChild className="text-[13px] leading-none font-medium text-gray-800 dark:text-zinc-100">
                                <Link
                                  href={`/invoices/${inv.id}?from=${encodeURIComponent(currentPathWithQuery)}`}
                                  prefetch={false}
                                  className="flex items-center gap-2.5 whitespace-nowrap py-2.5 sm:py-2 px-3.5 sm:px-3 rounded-lg w-full text-left no-underline cursor-pointer hover:bg-gray-100 dark:hover:bg-[#222226]"
                                >
                                  <Eye className="h-[15px] w-[15px] text-gray-800 dark:text-zinc-100 shrink-0" strokeWidth={2} />
                                  <span className="text-[13px] leading-none font-medium text-gray-800 dark:text-zinc-100">
                                    View invoice
                                  </span>
                                </Link>
                              </DropdownMenuItem>

                              {inv.status !== 'void' && (
                                <DropdownMenuItem asChild className="text-[13px] leading-none font-medium text-gray-800 dark:text-zinc-100">
                                  <Link
                                    href={`/invoices/${inv.id}/edit?from=${encodeURIComponent(currentPathWithQuery)}`}
                                    prefetch={false}
                                    className="flex items-center gap-2.5 whitespace-nowrap py-2.5 sm:py-2 px-3.5 sm:px-3 rounded-lg w-full text-left no-underline cursor-pointer hover:bg-gray-100 dark:hover:bg-[#222226]"
                                  >
                                    <Pencil className="h-[15px] w-[15px] text-gray-800 dark:text-zinc-100 shrink-0" strokeWidth={2} />
                                    <span className="text-[13px] leading-none font-medium text-gray-800 dark:text-zinc-100">
                                      Edit invoice
                                    </span>
                                  </Link>
                                </DropdownMenuItem>
                              )}

                              {inv.status === 'draft' && (
                                <DropdownMenuItem asChild className="text-[13px] leading-none font-medium text-gray-800 dark:text-zinc-100">
                                  <button
                                    type="button"
                                    onClick={() => handleOpenMarkSent(inv)}
                                    className="flex items-center gap-2.5 whitespace-nowrap py-2.5 sm:py-2 px-3.5 sm:px-3 rounded-lg w-full text-left no-underline cursor-pointer hover:bg-gray-100 dark:hover:bg-[#222226]"
                                  >
                                    <Send className="h-[15px] w-[15px] text-gray-800 dark:text-zinc-100 shrink-0" strokeWidth={2} />
                                    <span className="text-[13px] leading-none font-medium text-gray-800 dark:text-zinc-100">
                                      Mark as sent
                                    </span>
                                  </button>
                                </DropdownMenuItem>
                              )}

                              {inv.status === 'sent' && inv.balanceDueMinor > 0 && (
                                <DropdownMenuItem asChild className="text-[13px] leading-none font-medium text-gray-800 dark:text-zinc-100">
                                  <button
                                    type="button"
                                    onClick={() => setRecordPaymentTarget({ clientId: inv.client_id, invoiceId: inv.id })}
                                    className="flex items-center gap-2.5 whitespace-nowrap py-2.5 sm:py-2 px-3.5 sm:px-3 rounded-lg w-full text-left no-underline cursor-pointer hover:bg-gray-100 dark:hover:bg-[#222226]"
                                  >
                                    <CreditCard className="h-[15px] w-[15px] text-gray-800 dark:text-zinc-100 shrink-0" strokeWidth={2} />
                                    <span className="text-[13px] leading-none font-medium text-gray-800 dark:text-zinc-100">
                                      Record payment
                                    </span>
                                  </button>
                                </DropdownMenuItem>
                              )}

                              <DropdownMenuItem asChild className="text-[13px] leading-none font-medium text-gray-800 dark:text-zinc-100">
                                <button
                                  type="button"
                                  onClick={() => handleDownloadPDF(inv)}
                                  disabled={generatingPdfInvoiceId === inv.id}
                                  className="flex items-center gap-2.5 whitespace-nowrap py-2.5 sm:py-2 px-3.5 sm:px-3 rounded-lg w-full text-left no-underline cursor-pointer hover:bg-gray-100 dark:hover:bg-[#222226] disabled:opacity-50"
                                >
                                  {generatingPdfInvoiceId === inv.id ? (
                                    <Loader2 className="h-[15px] w-[15px] animate-spin text-gray-800 dark:text-zinc-100 shrink-0" />
                                  ) : (
                                    <Download className="h-[15px] w-[15px] text-gray-800 dark:text-zinc-100 shrink-0" strokeWidth={2} />
                                  )}
                                  <span className="text-[13px] leading-none font-medium text-gray-800 dark:text-zinc-100">
                                    Download PDF
                                  </span>
                                </button>
                              </DropdownMenuItem>
                            </DropdownMenuContent>
                          </DropdownMenu>
                        </div>
                      </div>

                      {/* Row 2 (Bottom) */}
                      <div className="flex items-center justify-between pt-3 mt-3 border-t border-gray-100 dark:border-[#27272a]">
                        <span className="text-[12px] leading-[16px] font-normal text-gray-500 dark:text-zinc-400 tabular-nums">
                          {inv.due_date ? `Due ${formatDate(inv.due_date)}` : 'No due date'}
                        </span>
                        <div className="text-right">
                          <Money
                            amountMinor={inv.total_minor}
                            currency={inv.currency}
                            variant="table"
                            tone="default"
                            className="text-[14px] leading-[20px] font-medium text-gray-900 dark:text-white tabular-nums block"
                          />
                          {inv.status === 'sent' && (
                            <div className="text-[12px] leading-[16px] font-normal text-gray-500 dark:text-zinc-400 tabular-nums mt-0.5 whitespace-nowrap">
                              Due: <Money amountMinor={inv.balanceDueMinor} currency={inv.currency} className="inline font-normal text-gray-500 dark:text-zinc-400 tabular-nums" />
                            </div>
                          )}
                        </div>
                      </div>
                    </div>
                  );
                })}
              </div>

              {/* Pagination Footer Bar */}
              {filteredInvoices.length > 0 && (
                <div className="flex flex-col sm:flex-row items-center justify-between gap-4 pt-2">
                  {/* Left: Show rows per page */}
                  <div className="flex items-center gap-2 text-[13px] text-gray-600 dark:text-zinc-400">
                    <span>Show</span>
                    <DropdownMenu>
                      <DropdownMenuTrigger className="px-2.5 py-1.5 rounded-lg border border-gray-200 dark:border-[#27272a] bg-white dark:bg-[#18181b] text-[13px] font-medium text-gray-900 dark:text-white inline-flex items-center gap-1.5 focus:outline-none transition-colors">
                        <span>{rowsPerPage}</span>
                        <ChevronDown className="h-3 w-3 text-gray-400 dark:text-zinc-500" strokeWidth={2} />
                      </DropdownMenuTrigger>
                      <DropdownMenuContent align="start" className="min-w-[80px] p-1 rounded-xl border border-gray-200 dark:border-[#27272a] bg-white dark:bg-[#18181b] shadow-none z-30">
                        {[10, 20, 50].map((num) => (
                          <DropdownMenuItem
                            key={num}
                            onClick={() => setRowsPerPage(num)}
                            className={cn(
                              'flex items-center justify-between px-2.5 py-1.5 rounded-lg text-[13px] leading-none cursor-pointer',
                              rowsPerPage === num
                                ? 'font-medium text-gray-900 dark:text-white bg-gray-50 dark:bg-[#222226]'
                                : 'font-normal text-gray-600 dark:text-zinc-400 hover:text-gray-900 dark:hover:text-white hover:bg-gray-50 dark:hover:bg-[#222226]'
                            )}
                          >
                            <span>{num}</span>
                            {rowsPerPage === num && <Check className="h-3.5 w-3.5 text-gray-900 dark:text-white shrink-0" strokeWidth={2} />}
                          </DropdownMenuItem>
                        ))}
                      </DropdownMenuContent>
                    </DropdownMenu>
                    <span>rows per page</span>
                  </div>

                  {/* Center: Page numbers */}
                  <div className="flex items-center gap-1">
                    {getPaginationPages(currentPage, totalPages).map((p, idx) => {
                      if (p === 'ellipsis') {
                        return (
                          <span
                            key={`ellipsis-${idx}`}
                            className="h-9 min-w-[36px] px-2.5 flex items-center justify-center text-[13px] text-gray-400 dark:text-zinc-500 select-none"
                          >
                            ...
                          </span>
                        );
                      }
                      const isActive = p === currentPage;
                      return (
                        <button
                          key={p}
                          type="button"
                          onClick={() => setCurrentPage(p)}
                          className={cn(
                            'h-9 min-w-[36px] px-2.5 rounded-lg text-[13px] tabular-nums transition-colors',
                            isActive
                              ? 'border border-gray-200 dark:border-[#27272a] bg-white dark:bg-[#18181b] font-medium text-gray-900 dark:text-white'
                              : 'font-normal text-gray-500 hover:text-gray-900 dark:text-zinc-400 dark:hover:text-white hover:bg-gray-100 dark:hover:bg-[#18181b]'
                          )}
                          aria-current={isActive ? 'page' : undefined}
                        >
                          {p}
                        </button>
                      );
                    })}
                  </div>

                  {/* Right: Previous & Next */}
                  <div className="flex items-center gap-2">
                    <button
                      type="button"
                      onClick={() => setCurrentPage((prev) => Math.max(1, prev - 1))}
                      disabled={currentPage <= 1}
                      className="inline-flex items-center gap-1.5 px-3 py-2 rounded-lg border border-gray-200 dark:border-[#27272a] bg-white dark:bg-[#18181b] text-[13px] font-medium text-gray-700 dark:text-zinc-300 hover:bg-gray-50 dark:hover:bg-[#222226] disabled:opacity-40 disabled:pointer-events-none transition-colors"
                    >
                      <ChevronLeft className="h-3.5 w-3.5" strokeWidth={2} />
                      <span>Previous</span>
                    </button>
                    <button
                      type="button"
                      onClick={() => setCurrentPage((prev) => Math.min(totalPages, prev + 1))}
                      disabled={currentPage >= totalPages}
                      className="inline-flex items-center gap-1.5 px-3 py-2 rounded-lg border border-gray-200 dark:border-[#27272a] bg-white dark:bg-[#18181b] text-[13px] font-medium text-gray-700 dark:text-zinc-300 hover:bg-gray-50 dark:hover:bg-[#222226] disabled:opacity-40 disabled:pointer-events-none transition-colors"
                    >
                      <span>Next</span>
                      <ChevronRight className="h-3.5 w-3.5" strokeWidth={2} />
                    </button>
                  </div>
                </div>
              )}
            </>
          ) : (
            <div className="rounded-2xl border border-gray-200 dark:border-[#27272a] bg-white dark:bg-[#18181b] p-12 text-center space-y-4">
              <div className="mx-auto flex h-14 w-14 items-center justify-center rounded-2xl bg-gray-50 dark:bg-[#121215] border border-gray-200 dark:border-[#27272a] text-gray-500 dark:text-zinc-400">
                <FileText className="h-6 w-6" strokeWidth={2} />
              </div>
              <div className="space-y-1">
                <h3 className="text-lg font-semibold text-gray-900 dark:text-white">
                  No matching invoices found
                </h3>
                <p className="text-sm text-gray-500 dark:text-zinc-400 max-w-sm mx-auto">
                  Try adjusting or clearing your search and filter criteria.
                </p>
              </div>
              <div>
                <button
                  type="button"
                  onClick={handleResetFilters}
                  className="inline-flex items-center justify-center h-10 px-4 rounded-xl border border-gray-200 dark:border-[#27272a] bg-white dark:bg-[#18181b] text-gray-700 dark:text-zinc-300 hover:bg-gray-50 dark:hover:bg-[#222226] text-xs font-medium transition-colors"
                >
                  Clear all filters
                </button>
              </div>
            </div>
          )}
        </>
      )}

      {/* Record Payment Modal */}
      {recordPaymentTarget && (
        <RecordPaymentModal
          clientId={recordPaymentTarget.clientId}
          invoiceId={recordPaymentTarget.invoiceId}
          onClose={() => setRecordPaymentTarget(null)}
        />
      )}

      {/* Mark as Sent Modal */}
      {markSentTarget && (
        <div className="fixed inset-0 bg-black/50 z-50 flex items-center justify-center p-4">
          <div className="rounded-2xl border border-gray-200 dark:border-[#27272a] bg-white dark:bg-[#18181b] p-6 max-w-md w-full space-y-4 text-left">
            <div className="flex items-center justify-between">
              <h3 className="text-lg font-semibold text-gray-900 dark:text-white">
                Mark Invoice {markSentTarget.invoice_number} as Sent
              </h3>
              <button
                type="button"
                onClick={() => setMarkSentTarget(null)}
                className="p-1 rounded-lg text-gray-400 hover:text-gray-700 dark:hover:text-zinc-200 hover:bg-gray-100 dark:hover:bg-[#222226] transition-colors"
              >
                <X className="h-5 w-5" strokeWidth={2} />
              </button>
            </div>

            <form onSubmit={handleMarkSentSubmit} className="space-y-4">
              <div className="space-y-1.5">
                <label className="text-xs font-medium text-gray-700 dark:text-zinc-300">
                  Issue Date
                </label>
                <input
                  type="date"
                  value={markSentIssueDate}
                  onChange={(e) => setMarkSentIssueDate(e.target.value)}
                  className="w-full bg-white dark:bg-[#121215] border border-gray-200 dark:border-[#27272a] text-gray-900 dark:text-white rounded-xl h-10 px-3 text-sm focus:outline-none"
                  required
                />
              </div>

              <div className="space-y-1.5">
                <label className="text-xs font-medium text-gray-700 dark:text-zinc-300">
                  Due Date
                </label>
                <input
                  type="date"
                  value={markSentDueDate}
                  onChange={(e) => setMarkSentDueDate(e.target.value)}
                  className="w-full bg-white dark:bg-[#121215] border border-gray-200 dark:border-[#27272a] text-gray-900 dark:text-white rounded-xl h-10 px-3 text-sm focus:outline-none"
                  required
                />
              </div>

              <div className="pt-2 flex justify-end gap-2.5">
                <button
                  type="button"
                  onClick={() => setMarkSentTarget(null)}
                  className="border border-gray-200 dark:border-[#27272a] bg-white dark:bg-[#121215] text-gray-700 dark:text-zinc-300 rounded-xl h-10 px-4 text-xs font-medium hover:bg-gray-50 dark:hover:bg-[#222226] transition-colors"
                >
                  Cancel
                </button>
                <button
                  type="submit"
                  disabled={isMarkingSent}
                  className="bg-blue-600 hover:bg-blue-700 text-white rounded-xl h-10 px-4 text-xs font-medium transition-colors disabled:opacity-50"
                >
                  {isMarkingSent ? 'Updating...' : 'Confirm & Send'}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* Client Selector Modal for New Invoice */}
      {clientSelectorOpen && clients && clients.length > 0 && (
        <div className="fixed inset-0 bg-black/50 z-50 flex items-center justify-center p-4">
          <div className="rounded-2xl border border-gray-200 dark:border-[#27272a] bg-white dark:bg-[#18181b] p-6 max-w-md w-full space-y-4 text-left">
            <div className="flex items-center justify-between">
              <h3 className="text-lg font-semibold text-gray-900 dark:text-white">
                Select Client for New Invoice
              </h3>
              <button
                type="button"
                onClick={() => setClientSelectorOpen(false)}
                className="p-1 rounded-lg text-gray-400 hover:text-gray-700 dark:hover:text-zinc-200 hover:bg-gray-100 dark:hover:bg-[#222226] transition-colors"
              >
                <X className="h-5 w-5" strokeWidth={2} />
              </button>
            </div>

            <p className="text-xs text-gray-500 dark:text-zinc-400">
              Choose which client to issue this invoice to:
            </p>

            <div className="space-y-1.5">
              <select
                value={selectedClientForNewInvoice}
                onChange={(e) => setSelectedClientForNewInvoice(e.target.value)}
                className="w-full bg-white dark:bg-[#121215] border border-gray-200 dark:border-[#27272a] text-gray-900 dark:text-white rounded-xl h-10 px-3 text-sm focus:outline-none"
              >
                {clients.map((c) => (
                  <option key={c.id} value={c.id}>
                    {c.name} {c.company ? `(${c.company})` : ''}
                  </option>
                ))}
              </select>
            </div>

            <div className="pt-2 flex justify-end gap-2.5">
              <button
                type="button"
                onClick={() => setClientSelectorOpen(false)}
                className="border border-gray-200 dark:border-[#27272a] bg-white dark:bg-[#121215] text-gray-700 dark:text-zinc-300 rounded-xl h-10 px-4 text-xs font-medium hover:bg-gray-50 dark:hover:bg-[#222226] transition-colors"
              >
                Cancel
              </button>
              <button
                type="button"
                onClick={handleClientSelectorConfirm}
                className="bg-blue-600 hover:bg-blue-700 text-white rounded-xl h-10 px-4 text-xs font-medium transition-colors"
              >
                Continue
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}

export default function InvoicesListPage() {
  return (
    <ProtectedRoute>
      <AppShell>
        <Suspense
          fallback={
            <div className="min-h-[400px] opacity-0" aria-busy="true" />
          }
        >
          <InvoicesListContent />
        </Suspense>
      </AppShell>
    </ProtectedRoute>
  );
}
