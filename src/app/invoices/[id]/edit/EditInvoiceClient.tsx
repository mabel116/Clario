'use client';

import React, { useState, useEffect, useMemo, useCallback, useRef, Suspense } from 'react';
import { createPortal } from 'react-dom';
import Link from 'next/link';
import { useRouter, useParams, usePathname, useSearchParams } from 'next/navigation';
import { ProtectedRoute } from '../../../../components/ProtectedRoute';
import { AppShell } from '../../../../components/AppShell';
import { useInvoice, useCanEditFinancials, useClients, useProfile, useClient } from '../../../../lib/data/hooks';
import { ClientDetail } from '../../../../lib/data/types';
import { useEntityReady } from '../../../../lib/data/readiness';
import { InvoiceRepo } from '../../../../lib/data/invoice';
import { ClientRepo } from '../../../../lib/data/client';
import { parseMoneyInput, multiplyMinor } from '../../../../lib/money';
import { Money } from '../../../../components/ui/money';
import { resolveRouteParam } from '../../../../lib/navigation';
import { 
  ChevronLeft, ChevronRight, ChevronDown, ChevronUp, Plus, Trash2, 
  Pencil, Download, X, Check, Calendar, GripVertical, Lock, AlertTriangle
} from 'lucide-react';
import { useToast } from '../../../../components/Toast';
import { cn } from '../../../../lib/utils';

interface CurrencyItem {
  code: string;
  name: string;
  label: string;
}

const CURRENCIES_LIST: CurrencyItem[] = [
  { code: 'USD', name: 'US Dollar', label: 'USD - US Dollar' },
  { code: 'EUR', name: 'Euro', label: 'EUR - Euro' },
  { code: 'GBP', name: 'British Pound', label: 'GBP - British Pound' },
  { code: 'NGN', name: 'Nigerian Naira', label: 'NGN - Nigerian Naira' },
  { code: 'CAD', name: 'Canadian Dollar', label: 'CAD - Canadian Dollar' },
  { code: 'AUD', name: 'Australian Dollar', label: 'AUD - Australian Dollar' },
  { code: 'ZAR', name: 'South African Rand', label: 'ZAR - South African Rand' },
  { code: 'GHS', name: 'Ghanaian Cedi', label: 'GHS - Ghanaian Cedi' },
  { code: 'KES', name: 'Kenyan Shilling', label: 'KES - Kenyan Shilling' },
  { code: 'INR', name: 'Indian Rupee', label: 'INR - Indian Rupee' },
  { code: 'JPY', name: 'Japanese Yen', label: 'JPY - Japanese Yen' },
  { code: 'KRW', name: 'South Korean Won', label: 'KRW - South Korean Won' },
];

type ViewMode = 'form' | 'preview';
type TermsType = 'due_on_receipt' | 'net_7' | 'net_14' | 'net_30' | 'custom';

const TERMS_OPTIONS: Array<{ value: TermsType; label: string }> = [
  { value: 'due_on_receipt', label: 'Due on receipt' },
  { value: 'net_7', label: 'Net 7' },
  { value: 'net_14', label: 'Net 14' },
  { value: 'net_30', label: 'Net 30' },
  { value: 'custom', label: 'Custom' },
];

const MONTH_NAMES = [
  'January', 'February', 'March', 'April', 'May', 'June',
  'July', 'August', 'September', 'October', 'November', 'December'
];

const SHORT_MONTH_NAMES = [
  'Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun',
  'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'
];

const YEARS = Array.from({ length: 16 }, (_, i) => 2020 + i);

function formatDateDisplay(dateStr: string | null | undefined): string {
  if (!dateStr) return '';
  const clean = dateStr.includes('T') ? dateStr.split('T')[0] : dateStr;
  const parts = clean.split('-');
  if (parts.length !== 3) return dateStr;
  const year = parts[0];
  const monthIdx = parseInt(parts[1], 10) - 1;
  const day = parseInt(parts[2], 10);
  if (monthIdx >= 0 && monthIdx < 12 && !isNaN(day)) {
    return `${day} ${MONTH_NAMES[monthIdx]}, ${year}`;
  }
  return dateStr;
}

function calculateDueDate(issueDateStr: string, terms: TermsType, currentDueDate: string): string {
  if (terms === 'due_on_receipt') return issueDateStr;
  if (terms === 'custom') return currentDueDate || issueDateStr;
  const parts = issueDateStr.split('-');
  if (parts.length !== 3) return currentDueDate || issueDateStr;
  const year = parseInt(parts[0], 10);
  const month = parseInt(parts[1], 10) - 1;
  const day = parseInt(parts[2], 10);
  const date = new Date(year, month, day);
  if (isNaN(date.getTime())) return currentDueDate || issueDateStr;

  let addDays = 0;
  if (terms === 'net_7') addDays = 7;
  else if (terms === 'net_14') addDays = 14;
  else if (terms === 'net_30') addDays = 30;

  date.setDate(date.getDate() + addDays);
  const y = date.getFullYear();
  const m = String(date.getMonth() + 1).padStart(2, '0');
  const d = String(date.getDate()).padStart(2, '0');
  return `${y}-${m}-${d}`;
}

function inferTermsFromDates(issueDateStr: string, dueDateStr: string): TermsType {
  if (!issueDateStr || !dueDateStr) return 'custom';
  const cleanIssue = issueDateStr.includes('T') ? issueDateStr.split('T')[0] : issueDateStr;
  const cleanDue = dueDateStr.includes('T') ? dueDateStr.split('T')[0] : dueDateStr;
  const partsIssue = cleanIssue.split('-');
  const partsDue = cleanDue.split('-');
  if (partsIssue.length !== 3 || partsDue.length !== 3) return 'custom';
  const iy = parseInt(partsIssue[0], 10);
  const im = parseInt(partsIssue[1], 10) - 1;
  const id = parseInt(partsIssue[2], 10);
  const dy = parseInt(partsDue[0], 10);
  const dm = parseInt(partsDue[1], 10) - 1;
  const dd = parseInt(partsDue[2], 10);
  if (isNaN(iy) || isNaN(im) || isNaN(id) || isNaN(dy) || isNaN(dm) || isNaN(dd)) {
    return 'custom';
  }
  const issue = new Date(iy, im - 1, id);
  const due = new Date(dy, dm - 1, dd);
  const diffDays = Math.round((due.getTime() - issue.getTime()) / 86400000);
  if (diffDays === 0) return 'due_on_receipt';
  if (diffDays === 7) return 'net_7';
  if (diffDays === 14) return 'net_14';
  if (diffDays === 30) return 'net_30';
  return 'custom';
}

function DatePickerPopover({
  value,
  onChange,
  disabled
}: {
  value: string;
  onChange: (dateStr: string) => void;
  disabled?: boolean;
}) {
  const [isOpen, setIsOpen] = useState(false);
  const [pickerView, setPickerView] = useState<'calendar' | 'months' | 'years'>('calendar');
  const containerRef = useRef<HTMLDivElement>(null);

  const parsed = useMemo(() => {
    if (value) {
      const parts = value.split('-');
      if (parts.length === 3) {
        const y = parseInt(parts[0], 10);
        const m = parseInt(parts[1], 10) - 1;
        const d = parseInt(parts[2], 10);
        if (!isNaN(y) && !isNaN(m) && !isNaN(d)) {
          return { year: y, month: m, day: d };
        }
      }
    }
    const now = new Date();
    return { year: now.getFullYear(), month: now.getMonth(), day: now.getDate() };
  }, [value]);

  const [viewYear, setViewYear] = useState(parsed.year);
  const [viewMonth, setViewMonth] = useState(parsed.month);

  useEffect(() => {
    if (!isOpen) {
      setViewYear(parsed.year);
      setViewMonth(parsed.month);
      setPickerView('calendar');
    }
  }, [parsed, isOpen]);

  useEffect(() => {
    if (!isOpen) return;
    function handleClickOutside(event: MouseEvent) {
      if (containerRef.current && !containerRef.current.contains(event.target as Node)) {
        setIsOpen(false);
      }
    }
    function handleKeyDown(event: KeyboardEvent) {
      if (event.key === 'Escape') setIsOpen(false);
    }
    document.addEventListener('mousedown', handleClickOutside);
    window.addEventListener('keydown', handleKeyDown);
    return () => {
      document.removeEventListener('mousedown', handleClickOutside);
      window.removeEventListener('keydown', handleKeyDown);
    };
  }, [isOpen]);

  const handlePrevMonth = () => {
    if (pickerView === 'years') {
      setViewYear((y) => Math.max(2020, y - 1));
      return;
    }
    if (viewMonth === 0) {
      setViewMonth(11);
      setViewYear((y) => y - 1);
    } else {
      setViewMonth((m) => m - 1);
    }
  };

  const handleNextMonth = () => {
    if (pickerView === 'years') {
      setViewYear((y) => Math.min(2035, y + 1));
      return;
    }
    if (viewMonth === 11) {
      setViewMonth(0);
      setViewYear((y) => y + 1);
    } else {
      setViewMonth((m) => m + 1);
    }
  };

  const calendarDays = useMemo(() => {
    const firstDayIndex = (new Date(viewYear, viewMonth, 1).getDay() + 6) % 7;
    const daysInCurrent = new Date(viewYear, viewMonth + 1, 0).getDate();
    const daysInPrev = new Date(viewYear, viewMonth, 0).getDate();
    const days: Array<{
      dateStr: string;
      dayNumber: number;
      isCurrentMonth: boolean;
      isSelected: boolean;
      isToday: boolean;
    }> = [];

    const now = new Date();
    const todayStr = `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, '0')}-${String(now.getDate()).padStart(2, '0')}`;

    for (let i = firstDayIndex - 1; i >= 0; i--) {
      const d = daysInPrev - i;
      const prevM = viewMonth === 0 ? 12 : viewMonth;
      const prevY = viewMonth === 0 ? viewYear - 1 : viewYear;
      const dateStr = `${prevY}-${String(prevM).padStart(2, '0')}-${String(d).padStart(2, '0')}`;
      days.push({
        dateStr,
        dayNumber: d,
        isCurrentMonth: false,
        isSelected: dateStr === value,
        isToday: dateStr === todayStr,
      });
    }

    for (let d = 1; d <= daysInCurrent; d++) {
      const dateStr = `${viewYear}-${String(viewMonth + 1).padStart(2, '0')}-${String(d).padStart(2, '0')}`;
      days.push({
        dateStr,
        dayNumber: d,
        isCurrentMonth: true,
        isSelected: dateStr === value,
        isToday: dateStr === todayStr,
      });
    }

    const totalCells = days.length <= 35 ? 35 : 42;
    const remaining = totalCells - days.length;
    for (let d = 1; d <= remaining; d++) {
      const nextM = viewMonth === 11 ? 1 : viewMonth + 2;
      const nextY = viewMonth === 11 ? viewYear + 1 : viewYear;
      const dateStr = `${nextY}-${String(nextM).padStart(2, '0')}-${String(d).padStart(2, '0')}`;
      days.push({
        dateStr,
        dayNumber: d,
        isCurrentMonth: false,
        isSelected: dateStr === value,
        isToday: dateStr === todayStr,
      });
    }

    return days;
  }, [viewYear, viewMonth, value]);

  return (
    <div className="relative" ref={containerRef}>
      <button
        type="button"
        disabled={disabled}
        onClick={() => !disabled && setIsOpen((prev) => !prev)}
        className={cn(
          'w-full h-10 px-3.5 rounded-xl bg-[#F9FAFB] dark:bg-[#121215] border text-[13px] font-medium text-gray-900 dark:text-white flex items-center justify-between text-left transition-colors',
          disabled
            ? 'opacity-60 cursor-not-allowed border-gray-200/80 dark:border-[#27272a]'
            : 'focus:outline-none focus:border-blue-600 dark:focus:border-blue-500 focus:ring-2 focus:ring-blue-600/15 dark:focus:ring-blue-500/20',
          isOpen
            ? 'border-gray-300 dark:border-zinc-700'
            : 'border-gray-200/80 dark:border-[#27272a]'
        )}
      >
        <span className={value ? 'text-gray-900 dark:text-white' : 'text-gray-400'}>
          {formatDateDisplay(value) || 'Select date'}
        </span>
        <Calendar className="h-4 w-4 text-gray-400 shrink-0" />
      </button>

      {isOpen && !disabled && (
        <div
          data-popover="true"
          className="absolute z-50 left-0 sm:left-auto sm:right-0 mt-1.5 w-[280px] rounded-2xl border border-gray-200 dark:border-[#27272a] bg-white dark:bg-[#18181b] p-3 shadow-xl select-none"
        >
          <div className="flex items-center justify-between pb-2 mb-2 border-b border-gray-100 dark:border-[#27272a]">
            <button
              type="button"
              onClick={handlePrevMonth}
              className="p-1 rounded-lg text-gray-400 hover:text-gray-700 dark:hover:text-zinc-200 transition-colors"
              aria-label="Previous"
            >
              <ChevronLeft className="h-4 w-4" strokeWidth={2} />
            </button>
            <div className="flex items-center gap-1 text-[13px] font-semibold text-gray-900 dark:text-white">
              <button
                type="button"
                onClick={() => setPickerView(pickerView === 'months' ? 'calendar' : 'months')}
                className="px-1.5 py-0.5 rounded hover:bg-gray-100 dark:hover:bg-[#222226] transition-colors"
              >
                {MONTH_NAMES[viewMonth]}
              </button>
              <button
                type="button"
                onClick={() => setPickerView(pickerView === 'years' ? 'calendar' : 'years')}
                className="px-1.5 py-0.5 rounded hover:bg-gray-100 dark:hover:bg-[#222226] transition-colors"
              >
                {viewYear}
              </button>
            </div>
            <button
              type="button"
              onClick={handleNextMonth}
              className="p-1 rounded-lg text-gray-400 hover:text-gray-700 dark:hover:text-zinc-200 transition-colors"
              aria-label="Next"
            >
              <ChevronRight className="h-4 w-4" strokeWidth={2} />
            </button>
          </div>

          {pickerView === 'months' && (
            <div className="grid grid-cols-3 gap-1.5 py-1">
              {SHORT_MONTH_NAMES.map((name, idx) => (
                <button
                  key={name}
                  type="button"
                  onClick={() => {
                    setViewMonth(idx);
                    setPickerView('calendar');
                  }}
                  className={cn(
                    'py-2 rounded-lg text-[12px] font-medium transition-colors',
                    viewMonth === idx
                      ? 'bg-blue-600 text-white'
                      : 'text-gray-700 dark:text-zinc-300 hover:bg-gray-100 dark:hover:bg-[#222226]'
                  )}
                >
                  {name}
                </button>
              ))}
            </div>
          )}

          {pickerView === 'years' && (
            <div className="grid grid-cols-4 gap-1.5 py-1 max-h-[180px] overflow-y-auto">
              {YEARS.map((y) => (
                <button
                  key={y}
                  type="button"
                  onClick={() => {
                    setViewYear(y);
                    setPickerView('calendar');
                  }}
                  className={cn(
                    'py-2 rounded-lg text-[12px] font-medium transition-colors',
                    viewYear === y
                      ? 'bg-blue-600 text-white'
                      : 'text-gray-700 dark:text-zinc-300 hover:bg-gray-100 dark:hover:bg-[#222226]'
                  )}
                >
                  {y}
                </button>
              ))}
            </div>
          )}

          {pickerView === 'calendar' && (
            <div>
              <div className="grid grid-cols-7 gap-1 text-center text-[11px] font-medium text-gray-400 dark:text-zinc-500 mb-1">
                <span>Mo</span><span>Tu</span><span>We</span><span>Th</span><span>Fr</span><span>Sa</span><span>Su</span>
              </div>
              <div className="grid grid-cols-7 gap-1">
                {calendarDays.map((d) => (
                  <button
                    key={d.dateStr}
                    type="button"
                    onClick={() => {
                      onChange(d.dateStr);
                      setIsOpen(false);
                    }}
                    className={cn(
                      'h-8 rounded-lg text-[12px] font-medium flex items-center justify-center transition-colors',
                      d.isSelected
                        ? 'bg-blue-600 text-white font-semibold'
                        : d.isToday
                        ? 'border border-blue-600 text-blue-600 dark:text-blue-400 font-semibold'
                        : d.isCurrentMonth
                        ? 'text-gray-900 dark:text-white hover:bg-gray-100 dark:hover:bg-[#222226]'
                        : 'text-gray-300 dark:text-zinc-600 hover:bg-gray-50 dark:hover:bg-[#222226]'
                    )}
                  >
                    {d.dayNumber}
                  </button>
                ))}
              </div>
            </div>
          )}
        </div>
      )}
    </div>
  );
}

export function EditInvoiceSkeleton() {
  return (
    <div className="w-full pb-12 animate-pulse text-left font-sans">
      <div className="sticky top-0 z-30 w-full px-4 sm:px-6 lg:px-8 pt-5 pb-3.5 bg-white dark:bg-[#09090b] border-b border-gray-200 dark:border-[#27272a]">
        <div className="w-full">
          <div className="h-7 w-20 bg-gray-200 dark:bg-[#27272a] rounded-lg" />
          <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-3 mt-2.5">
            <div className="space-y-1.5">
              <div className="h-7 w-48 bg-gray-200 dark:bg-[#27272a] rounded" />
              <div className="h-4 w-72 bg-gray-200 dark:bg-[#27272a] rounded" />
            </div>
            <div className="hidden sm:flex items-center gap-2.5">
              <div className="h-10 w-20 bg-gray-200 dark:bg-[#27272a] rounded-xl" />
              <div className="h-10 w-28 bg-gray-200 dark:bg-[#27272a] rounded-xl" />
              <div className="h-10 w-32 bg-gray-200 dark:bg-[#27272a] rounded-xl" />
            </div>
            <div className="grid grid-cols-2 gap-2.5 sm:hidden w-full mt-1">
              <div className="h-10 w-full bg-gray-200 dark:bg-[#27272a] rounded-xl" />
              <div className="h-10 w-full bg-gray-200 dark:bg-[#27272a] rounded-xl" />
            </div>
          </div>
        </div>
      </div>

      <div className="px-4 sm:px-6 lg:px-8 py-6 space-y-6 max-w-[760px]">
        <div className="rounded-2xl border border-gray-200 dark:border-[#27272a] bg-white dark:bg-[#18181b] p-6 space-y-4">
          <div className="h-5 w-28 bg-gray-200 dark:bg-[#27272a] rounded" />
          <div className="h-10 bg-gray-100 dark:bg-[#121215] rounded-xl" />
          <div className="h-10 bg-gray-100 dark:bg-[#121215] rounded-xl" />
        </div>
        <div className="rounded-2xl border border-gray-200 dark:border-[#27272a] bg-white dark:bg-[#18181b] p-6 space-y-4">
          <div className="h-5 w-36 bg-gray-200 dark:bg-[#27272a] rounded" />
          <div className="h-24 bg-gray-100 dark:bg-[#121215] rounded-xl" />
        </div>
      </div>
    </div>
  );
}

export function EditInvoiceClient() {
  const params = useParams();
  const pathname = usePathname();
  const invoiceId = resolveRouteParam(params?.id as string | undefined, 'invoices', pathname);

  return (
    <ProtectedRoute>
      <AppShell>
        <Suspense fallback={<EditInvoiceSkeleton />}>
          <EditInvoiceForm invoiceId={invoiceId} />
        </Suspense>
      </AppShell>
    </ProtectedRoute>
  );
}

function EditInvoiceForm({ invoiceId: propInvoiceId }: { invoiceId: string }) {
  const router = useRouter();
  const { showToast } = useToast();
  const params = useParams();
  const pathname = usePathname();
  const searchParams = useSearchParams();
  const fromParam = searchParams?.get('from') || null;
  const invoiceId = propInvoiceId || resolveRouteParam(params?.id as string | undefined, 'invoices', pathname);

  const backUrl = fromParam
    ? `/invoices/${invoiceId}?from=${encodeURIComponent(fromParam)}`
    : `/invoices/${invoiceId}`;

  // Queries
  const { data: invoice, isLoading: isInvoiceLoading } = useInvoice(invoiceId);
  const checkInvoiceExists = useCallback(() => InvoiceRepo.exists(invoiceId), [invoiceId]);
  const hasInvoice = invoice !== null && invoice !== undefined;
  const { isLoading: isEntityLoading, isNotFound } = useEntityReady(hasInvoice, checkInvoiceExists, invoiceId);
  const { data: canEditFinancials, isLoading: isLockLoading } = useCanEditFinancials(invoiceId);
  const { data: clients } = useClients();
  const { data: profile } = useProfile();

  // Form states
  const [clientId, setClientId] = useState('');
  const [currency, setCurrency] = useState('USD');
  const [invoiceNumber, setInvoiceNumber] = useState('');
  const [issueDate, setIssueDate] = useState('');
  const [terms, setTerms] = useState<TermsType>('due_on_receipt');
  const [dueDate, setDueDate] = useState('');
  const [notes, setNotes] = useState('');
  const [internalNote, setInternalNote] = useState('');
  const [lineItems, setLineItems] = useState<Array<{
    id: string;
    description: string;
    quantity: number;
    unitPrice: string;
  }>>([]);

  const [viewMode, setViewMode] = useState<ViewMode>('form');
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [isDownloadingPdf, setIsDownloadingPdf] = useState(false);
  const [isAddClientOpen, setIsAddClientOpen] = useState(false);
  const [isMounted, setIsMounted] = useState(false);

  // Popovers
  const [isClientDropdownOpen, setIsClientDropdownOpen] = useState(false);
  const [clientSearchQuery, setClientSearchQuery] = useState('');
  const clientDropdownRef = useRef<HTMLDivElement>(null);

  const [isCurrencyDropdownOpen, setIsCurrencyDropdownOpen] = useState(false);
  const [currencySearchQuery, setCurrencySearchQuery] = useState('');
  const currencyDropdownRef = useRef<HTMLDivElement>(null);

  const [isTermsDropdownOpen, setIsTermsDropdownOpen] = useState(false);
  const termsDropdownRef = useRef<HTMLDivElement>(null);

  const [draggedIndex, setDraggedIndex] = useState<number | null>(null);

  useEffect(() => {
    setIsMounted(true);
  }, []);

  // Immediate scroll reset when switching between 'form' and 'preview'
  useEffect(() => {
    const mainEl = document.querySelector('main');
    if (mainEl) mainEl.scrollTo({ top: 0, behavior: 'instant' as ScrollBehavior });
    window.scrollTo({ top: 0, behavior: 'instant' as ScrollBehavior });
  }, [viewMode]);

  // Click outside listener for popovers
  useEffect(() => {
    function handleClickOutside(event: MouseEvent) {
      if (clientDropdownRef.current && !clientDropdownRef.current.contains(event.target as Node)) {
        setIsClientDropdownOpen(false);
      }
      if (currencyDropdownRef.current && !currencyDropdownRef.current.contains(event.target as Node)) {
        setIsCurrencyDropdownOpen(false);
      }
      if (termsDropdownRef.current && !termsDropdownRef.current.contains(event.target as Node)) {
        setIsTermsDropdownOpen(false);
      }
    }
    document.addEventListener('mousedown', handleClickOutside);
    return () => document.removeEventListener('mousedown', handleClickOutside);
  }, []);

  // Populate form states once invoice loads
  useEffect(() => {
    if (invoice) {
      setClientId(invoice.client_id || '');
      setCurrency(invoice.currency?.toUpperCase() || 'USD');
      setInvoiceNumber(invoice.invoice_number || '');
      setIssueDate(invoice.issue_date || '');
      setDueDate(invoice.due_date || '');
      setNotes(invoice.notes || '');
      setInternalNote(invoice.internal_note || '');
      setTerms(inferTermsFromDates(invoice.issue_date || '', invoice.due_date || ''));

      if (invoice.lineItems && invoice.lineItems.length > 0) {
        const c = invoice.currency?.toUpperCase() || 'USD';
        const exponent = c === 'JPY' || c === 'KRW' ? 0 : 2;
        const divisor = Math.pow(10, exponent);

        setLineItems(
          invoice.lineItems.map((item) => ({
            id: item.id,
            description: item.description,
            quantity: item.quantity,
            unitPrice: (item.unit_price_minor / divisor).toString(),
          }))
        );
      } else {
        setLineItems([{ id: crypto.randomUUID(), description: '', quantity: 1, unitPrice: '' }]);
      }
    }
  }, [invoice]);

  const { data: selectedClientDetail } = useClient(clientId);
  const selectedClient = useMemo(() => {
    if (selectedClientDetail) return selectedClientDetail;
    const summary = clients?.find((c) => c.id === clientId);
    if (!summary) return null;
    return {
      ...summary,
      phone: null as string | null,
      notes: null as string | null,
    };
  }, [selectedClientDetail, clients, clientId]);

  const filteredClients = useMemo(() => {
    if (!clients) return [];
    if (!clientSearchQuery.trim()) return clients;
    const q = clientSearchQuery.toLowerCase();
    return clients.filter(
      (c) =>
        c.name.toLowerCase().includes(q) ||
        (c.company && c.company.toLowerCase().includes(q))
    );
  }, [clients, clientSearchQuery]);

  const filteredCurrencies = useMemo(() => {
    if (!currencySearchQuery.trim()) return CURRENCIES_LIST;
    const q = currencySearchQuery.toLowerCase();
    return CURRENCIES_LIST.filter(
      (c) =>
        c.code.toLowerCase().includes(q) ||
        c.name.toLowerCase().includes(q) ||
        c.label.toLowerCase().includes(q)
    );
  }, [currencySearchQuery]);

  // Synchronously derive financial editability with secondary fallback
  const isLocked = useMemo(() => {
    if (invoice?.payments && invoice.payments.length > 0) return true;
    if (invoice?.status === 'void') return true;
    if (canEditFinancials === false) return true;
    return false;
  }, [invoice?.payments, invoice?.status, canEditFinancials]);

  // Issue Date & Terms synchronization
  const handleIssueDateChange = (newDate: string) => {
    if (isLocked) return;
    setIssueDate(newDate);
    if (terms !== 'custom') {
      setDueDate(calculateDueDate(newDate, terms, dueDate));
    }
  };

  const handleDueDateChange = (newDueDate: string) => {
    setDueDate(newDueDate);
    setTerms(inferTermsFromDates(issueDate, newDueDate));
  };

  const handleTermsChange = (newTerms: TermsType) => {
    if (isLocked) return;
    setTerms(newTerms);
    setIsTermsDropdownOpen(false);
    if (newTerms !== 'custom') {
      setDueDate(calculateDueDate(issueDate, newTerms, dueDate));
    }
  };

  // Line item handlers
  const handleAddLineItem = () => {
    if (isLocked) return;
    setLineItems((prev) => [
      ...prev,
      { id: crypto.randomUUID(), description: '', quantity: 1, unitPrice: '' },
    ]);
  };

  const handleRemoveLineItem = (id: string) => {
    if (isLocked) return;
    if (lineItems.length === 1) {
      setLineItems([{ id: crypto.randomUUID(), description: '', quantity: 1, unitPrice: '' }]);
      return;
    }
    setLineItems((prev) => prev.filter((item) => item.id !== id));
  };

  const handleUpdateLineItem = (
    id: string,
    field: 'description' | 'quantity' | 'unitPrice',
    val: string | number
  ) => {
    if (isLocked) return;
    setLineItems((prev) =>
      prev.map((item) => (item.id === id ? { ...item, [field]: val } : item))
    );
  };

  const handleMoveLineItem = (index: number, direction: 'up' | 'down') => {
    if (isLocked) return;
    const targetIdx = direction === 'up' ? index - 1 : index + 1;
    if (targetIdx < 0 || targetIdx >= lineItems.length) return;
    const copy = [...lineItems];
    const temp = copy[index];
    copy[index] = copy[targetIdx];
    copy[targetIdx] = temp;
    setLineItems(copy);
  };

  // Drag and Drop
  const handleDragStart = (index: number) => {
    if (isLocked) return;
    setDraggedIndex(index);
  };

  const handleDragOver = (e: React.DragEvent, index: number) => {
    if (isLocked) return;
    e.preventDefault();
    if (draggedIndex === null || draggedIndex === index) return;
    const items = [...lineItems];
    const draggedItem = items[draggedIndex];
    items.splice(draggedIndex, 1);
    items.splice(index, 0, draggedItem);
    setDraggedIndex(index);
    setLineItems(items);
  };

  const handleDragEnd = () => {
    setDraggedIndex(null);
  };

  // Computes subtotal in minor units
  const totalMinor = useMemo(() => {
    return lineItems.reduce((acc, item) => {
      let unitMinor = 0;
      try {
        if (item.unitPrice.trim()) {
          unitMinor = parseMoneyInput(item.unitPrice, currency).amountMinor;
        }
      } catch {}
      return acc + multiplyMinor(unitMinor, item.quantity || 0);
    }, 0);
  }, [lineItems, currency]);

  // Download PDF
  const handleDownloadPDF = async () => {
    if (isDownloadingPdf || !profile || !selectedClient) {
      showToast('Client details are required to generate PDF.', 'info');
      return;
    }
    setIsDownloadingPdf(true);
    try {
      const itemsPayload = lineItems.map((item, index) => {
        let unitMinor = 0;
        try {
          if (item.unitPrice.trim()) {
            unitMinor = parseMoneyInput(item.unitPrice, currency).amountMinor;
          }
        } catch {}
        return {
          id: item.id || `item-${index}`,
          invoice_id: invoiceId,
          description: item.description,
          quantity: item.quantity,
          unit_price_minor: unitMinor,
          created_at: new Date().toISOString(),
          updated_at: new Date().toISOString(),
          deleted_at: null,
        };
      });

      const tempInvoice: any = {
        id: invoiceId,
        invoice_number: invoiceNumber || 'INV-0001',
        issue_date: issueDate,
        due_date: dueDate,
        currency,
        notes: notes || null,
        internal_note: internalNote || null,
        status: invoice?.status || 'draft',
        total_minor: totalMinor,
        client_name: selectedClient?.name || '',
        lineItems: itemsPayload,
      };

      const clientDetail: ClientDetail = {
        id: selectedClient.id,
        user_id: '',
        name: selectedClient.name,
        email: selectedClient.email || null,
        phone: selectedClient.phone || null,
        company: selectedClient.company || null,
        notes: selectedClient.notes || null,
        default_currency: selectedClient.default_currency || currency,
        created_at: selectedClient.created_at || new Date().toISOString(),
        updated_at: new Date().toISOString(),
        outstandingBalances: [],
      };

      const { generateInvoicePDF } = await import('../../../../lib/pdf/generator');
      await generateInvoicePDF({
        invoice: tempInvoice,
        profile,
        client: clientDetail,
        mode: 'download',
      });
      showToast('PDF downloaded successfully');
    } catch (err: unknown) {
      const msg = err instanceof Error ? err.message : 'Failed to generate PDF';
      showToast(msg, 'info');
    } finally {
      setIsDownloadingPdf(false);
    }
  };

  // Submit form handler
  const handleSave = async () => {
    if (!invoice) return;

    if (!invoiceNumber.trim()) {
      showToast('Invoice number is required.', 'info');
      return;
    }

    if (!isLocked) {
      for (let i = 0; i < lineItems.length; i++) {
        const item = lineItems[i];
        if (!item.description.trim()) {
          showToast(`Line item #${i + 1} must have a description.`, 'info');
          return;
        }
        if (item.quantity <= 0) {
          showToast(`Line item #${i + 1} quantity must be greater than zero.`, 'info');
          return;
        }
        if (!item.unitPrice.trim() || isNaN(parseFloat(item.unitPrice))) {
          showToast(`Line item #${i + 1} must have a valid unit price.`, 'info');
          return;
        }
      }
    }

    try {
      setIsSubmitting(true);

      const patchPayload: any = {
        internal_note: internalNote || null,
        notes: notes || null,
        due_date: dueDate || null,
      };

      if (!isLocked) {
        patchPayload.client_id = clientId;
        patchPayload.currency = currency;
        patchPayload.invoice_number = invoiceNumber;
        patchPayload.issue_date = issueDate || null;
      }

      await InvoiceRepo.update(invoiceId, patchPayload);

      if (!isLocked) {
        const itemsPayload = lineItems.map((item) => {
          const parsedPrice = parseMoneyInput(item.unitPrice, currency);
          return {
            description: item.description.trim(),
            quantity: item.quantity,
            unit_price_minor: parsedPrice.amountMinor,
          };
        });

        await InvoiceRepo.setLineItems(invoiceId, itemsPayload);
      }

      showToast('Invoice updated successfully');
      router.push(backUrl);
    } catch (err: unknown) {
      const message = err instanceof Error ? err.message : 'Failed to update invoice.';
      showToast(message, 'info');
    } finally {
      setIsSubmitting(false);
    }
  };

  const isFormLoading = !isNotFound && (
    !invoiceId ||
    invoiceId === '_shell_' ||
    isEntityLoading ||
    isInvoiceLoading ||
    isLockLoading ||
    !invoice ||
    canEditFinancials === undefined
  );

  const [showSkeleton, setShowSkeleton] = useState(false);

  useEffect(() => {
    if (!isFormLoading) {
      setShowSkeleton(false);
      return;
    }
    const timer = setTimeout(() => {
      setShowSkeleton(true);
    }, 75);
    return () => clearTimeout(timer);
  }, [isFormLoading]);

  if (isFormLoading) {
    if (!showSkeleton) {
      return <div className="min-h-[600px] opacity-0" aria-busy="true" />;
    }
    return <EditInvoiceSkeleton />;
  }

  if (isNotFound || !invoice) {
    return (
      <div className="px-4 sm:px-6 lg:px-8 py-12 max-w-[760px] text-center font-sans space-y-4">
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

  // -------------------------------------------------------------
  // Mode 2: Preview Screen
  // -------------------------------------------------------------
  if (viewMode === 'preview') {
    return (
      <div className="w-full pb-12 text-left font-sans">
        {/* Sticky Header in Preview Mode */}
        <div className="sticky top-0 z-30 w-full px-4 sm:px-6 lg:px-8 pt-5 pb-3.5 bg-white dark:bg-[#09090b] border-b border-gray-200 dark:border-[#27272a]">
          <div className="w-full">
            {/* Desktop Layout */}
            <div className="hidden sm:block">
              <button
                type="button"
                onClick={() => setViewMode('form')}
                className="inline-flex items-center gap-1 px-2.5 py-1.5 rounded-lg bg-gray-100 hover:bg-gray-200/80 dark:bg-[#18181b] dark:hover:bg-[#222226] text-[12px] leading-none font-medium text-gray-700 dark:text-zinc-300 transition-colors no-underline w-fit"
              >
                <ChevronLeft className="h-3.5 w-3.5" strokeWidth={2} /> Back
              </button>
              <div className="flex items-center justify-between gap-3 mt-2.5">
                <div>
                  <h1 className="text-[22px] leading-[28px] font-semibold text-gray-900 dark:text-white tracking-tight">
                    Preview Invoice
                  </h1>
                  <p className="text-[13px] leading-[18px] text-gray-500 dark:text-zinc-400 mt-0.5">
                    Preview how this invoice appears before saving changes.
                  </p>
                </div>
                <div className="flex items-center gap-2.5 shrink-0">
                  <button
                    type="button"
                    onClick={() => setViewMode('form')}
                    className="h-10 px-4 rounded-xl border border-gray-200 dark:border-[#27272a] bg-white dark:bg-[#18181b] text-[13px] font-medium text-gray-700 dark:text-zinc-300 hover:bg-gray-50 dark:hover:bg-[#222226] inline-flex items-center justify-center gap-1.5 whitespace-nowrap transition-colors"
                  >
                    <Pencil className="h-4 w-4 shrink-0 text-gray-500 dark:text-zinc-400" strokeWidth={2} />
                    <span>Edit Invoice</span>
                  </button>

                  <button
                    type="button"
                    onClick={handleDownloadPDF}
                    disabled={isDownloadingPdf}
                    className="h-10 px-4 rounded-xl border border-gray-200 dark:border-[#27272a] bg-white dark:bg-[#18181b] text-[13px] font-medium text-gray-700 dark:text-zinc-300 hover:bg-gray-50 dark:hover:bg-[#222226] inline-flex items-center justify-center gap-1.5 whitespace-nowrap transition-colors disabled:opacity-50"
                  >
                    <Download className="h-4 w-4 shrink-0 text-gray-500 dark:text-zinc-400" strokeWidth={2} />
                    <span>{isDownloadingPdf ? 'Downloading...' : 'Download PDF'}</span>
                  </button>

                  <button
                    type="button"
                    onClick={handleSave}
                    disabled={isSubmitting}
                    className="h-10 px-4 rounded-xl bg-blue-600 hover:bg-blue-700 text-white text-[13px] font-medium inline-flex items-center justify-center gap-1.5 whitespace-nowrap transition-colors disabled:opacity-50"
                  >
                    <span>{isSubmitting ? 'Saving...' : 'Save Changes'}</span>
                  </button>
                </div>
              </div>
            </div>

            {/* Mobile Layout */}
            <div className="sm:hidden w-full">
              <div className="flex items-center justify-between">
                <button
                  type="button"
                  onClick={() => setViewMode('form')}
                  className="inline-flex items-center gap-1 px-2.5 py-1.5 rounded-lg bg-gray-100 hover:bg-gray-200/80 dark:bg-[#18181b] dark:hover:bg-[#222226] text-[12px] leading-none font-medium text-gray-700 dark:text-zinc-300 transition-colors"
                >
                  <ChevronLeft className="h-3.5 w-3.5" strokeWidth={2} /> Back
                </button>
              </div>
              <div className="mt-2.5">
                <h1 className="text-[22px] leading-[28px] font-semibold text-gray-900 dark:text-white tracking-tight">
                  Preview Invoice
                </h1>
                <p className="text-[13px] leading-[18px] text-gray-500 dark:text-zinc-400 mt-0.5">
                  Preview how this invoice appears before saving changes.
                </p>
              </div>
              <div className="w-full space-y-2 mt-3">
                <div className="grid grid-cols-2 gap-2.5">
                  <button
                    type="button"
                    onClick={() => setViewMode('form')}
                    className="h-10 w-full rounded-xl border border-gray-200 dark:border-[#27272a] bg-white dark:bg-[#18181b] text-[13px] font-medium text-gray-700 dark:text-zinc-300 inline-flex items-center justify-center gap-1.5"
                  >
                    <Pencil className="h-4 w-4 shrink-0 text-gray-500 dark:text-zinc-400" strokeWidth={2} />
                    <span>Edit</span>
                  </button>
                  <button
                    type="button"
                    onClick={handleDownloadPDF}
                    disabled={isDownloadingPdf}
                    className="h-10 w-full rounded-xl border border-gray-200 dark:border-[#27272a] bg-white dark:bg-[#18181b] text-[13px] font-medium text-gray-700 dark:text-zinc-300 inline-flex items-center justify-center gap-1.5 disabled:opacity-50"
                  >
                    <Download className="h-4 w-4 shrink-0 text-gray-500 dark:text-zinc-400" strokeWidth={2} />
                    <span>PDF</span>
                  </button>
                </div>
                <button
                  type="button"
                  onClick={handleSave}
                  disabled={isSubmitting}
                  className="h-10 w-full rounded-xl bg-blue-600 hover:bg-blue-700 text-white text-[13px] font-medium inline-flex items-center justify-center disabled:opacity-50"
                >
                  <span>{isSubmitting ? 'Saving...' : 'Save Changes'}</span>
                </button>
              </div>
            </div>
          </div>
        </div>

        {/* Preview Content Container */}
        <div className="px-4 sm:px-6 lg:px-8 py-6">
          <div className="max-w-[780px] mx-auto rounded-[28px] bg-[#F8FAFC] dark:bg-[#121215] border border-gray-100 dark:border-[#27272a]/70 p-4 sm:p-7">
            <div className="rounded-2xl bg-white dark:bg-[#18181b] border border-gray-200/70 dark:border-[#27272a] p-6 sm:p-10 space-y-8">
              {/* Option B Mobile Letterhead vs Desktop Side-by-Side */}
              <div className="sm:hidden space-y-4">
                <div>
                  <span className="text-[22px] leading-[28px] font-bold text-gray-900 dark:text-white tracking-tight uppercase block">
                    INVOICE
                  </span>
                  <span className="text-[13px] text-gray-500 dark:text-zinc-400 mt-1 block tabular-nums">
                    Invoice Number: {invoiceNumber || '—'}
                  </span>
                </div>
                <div className="border-b border-gray-100 dark:border-[#27272a] pb-4 mb-4">
                  <p className="text-[12px] font-normal text-gray-400 dark:text-zinc-500 mb-1">
                    From:
                  </p>
                  <h3 className="text-[14px] font-semibold text-gray-900 dark:text-white">
                    {profile?.business_name || 'Studio'}
                  </h3>
                  {profile?.business_address && (
                    <p className="text-[13px] leading-[20px] text-gray-500 dark:text-zinc-400 whitespace-pre-line mt-1">
                      {profile.business_address}
                    </p>
                  )}
                </div>
              </div>

              <div className="hidden sm:flex sm:items-start sm:justify-between sm:gap-6 pb-2">
                <div className="space-y-1">
                  <h3 className="text-[16px] font-semibold text-gray-900 dark:text-white">
                    {profile?.business_name || 'Studio'}
                  </h3>
                  {profile?.business_address && (
                    <p className="text-[13px] leading-[20px] text-gray-500 dark:text-zinc-400 whitespace-pre-line">
                      {profile.business_address}
                    </p>
                  )}
                </div>
                <div className="sm:text-right">
                  <span className="text-[24px] font-semibold tracking-tight text-gray-900 dark:text-white block uppercase">
                    INVOICE
                  </span>
                  <span className="text-[13px] font-normal text-gray-500 dark:text-zinc-400 mt-1 block tabular-nums">
                    Invoice Number: {invoiceNumber || 'INV-0001'}
                  </span>
                </div>
              </div>

              {/* Billed To & Dates */}
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-6">
                <div className="space-y-1">
                  <span className="text-[12px] font-semibold text-gray-500 dark:text-zinc-400 block">
                    Billed To:
                  </span>
                  <p className="text-[14px] font-semibold text-gray-900 dark:text-white">
                    {selectedClient?.name || 'Selected Client'}
                  </p>
                  {selectedClient?.company && (
                    <p className="text-[12px] text-gray-600 dark:text-zinc-400">
                      {selectedClient.company}
                    </p>
                  )}
                  {selectedClient?.email && (
                    <p className="text-[12px] text-gray-500 dark:text-zinc-500">
                      {selectedClient.email}
                    </p>
                  )}
                  {selectedClient?.phone && (
                    <p className="text-[12px] text-gray-500 dark:text-zinc-500">
                      {selectedClient.phone}
                    </p>
                  )}
                </div>

                <div className="sm:text-right space-y-1.5">
                  <p className="text-[13px] text-gray-600 dark:text-zinc-300">
                    <span className="font-medium text-gray-500 dark:text-zinc-400">Issue Date: </span>
                    <span className="tabular-nums font-medium text-gray-900 dark:text-white">
                      {formatDateDisplay(issueDate)}
                    </span>
                  </p>
                  <p className="text-[13px] text-gray-600 dark:text-zinc-300">
                    <span className="font-medium text-gray-500 dark:text-zinc-400">Due Date: </span>
                    <span className="tabular-nums font-medium text-gray-900 dark:text-white">
                      {formatDateDisplay(dueDate)}
                    </span>
                  </p>
                </div>
              </div>

              {/* Line Items */}
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
                    {lineItems.map((item) => {
                      let unitMinor = 0;
                      try {
                        if (item.unitPrice.trim()) {
                          unitMinor = parseMoneyInput(item.unitPrice, currency).amountMinor;
                        }
                      } catch {}
                      const lineTotalMinor = multiplyMinor(unitMinor, item.quantity || 0);
                      return (
                        <tr key={item.id} className="text-[13px] font-semibold text-gray-900 dark:text-white">
                          <td className="py-4 px-4 font-normal text-gray-800 dark:text-zinc-200">{item.description || '—'}</td>
                          <td className="py-4 px-4 tabular-nums text-left">{item.quantity}</td>
                          <td className="py-4 px-4 tabular-nums text-left">
                            <Money amountMinor={unitMinor} currency={currency} />
                          </td>
                          <td className="py-4 px-4 tabular-nums text-left">
                            <Money amountMinor={lineTotalMinor} currency={currency} />
                          </td>
                        </tr>
                      );
                    })}
                  </tbody>
                </table>
              </div>

              {/* Mobile Stacked Items */}
              <div className="sm:hidden divide-y divide-gray-100 dark:divide-[#27272a] border-y border-gray-200 dark:border-[#27272a] my-4">
                {lineItems.map((item) => {
                  let unitMinor = 0;
                  try {
                    if (item.unitPrice.trim()) {
                      unitMinor = parseMoneyInput(item.unitPrice, currency).amountMinor;
                    }
                  } catch {}
                  const lineTotalMinor = multiplyMinor(unitMinor, item.quantity || 0);
                  return (
                    <div key={item.id} className="py-3.5 space-y-1">
                      <div className="text-[13px] font-semibold text-gray-900 dark:text-white">
                        {item.description || '—'}
                      </div>
                      <div className="flex items-center justify-between text-[12px] text-gray-500 dark:text-zinc-400 tabular-nums">
                        <span>
                          Qty: {item.quantity} × <Money amountMinor={unitMinor} currency={currency} />
                        </span>
                        <span className="text-[13px] font-semibold text-gray-900 dark:text-white">
                          <Money amountMinor={lineTotalMinor} currency={currency} />
                        </span>
                      </div>
                    </div>
                  );
                })}
              </div>

              {/* Right-Aligned Total */}
              <div className="flex justify-end pt-2">
                <div className="w-full sm:w-[320px] py-3 flex items-center justify-between">
                  <span className="text-[15px] font-semibold text-gray-900 dark:text-white">
                    Total Amount
                  </span>
                  <Money
                    amountMinor={totalMinor}
                    currency={currency}
                    className="text-[22px] font-semibold text-gray-900 dark:text-white tabular-nums"
                  />
                </div>
              </div>

              {/* Customer Notes */}
              {notes && notes.trim() && (
                <div className="border-t border-gray-100 dark:border-[#27272a] pt-6 space-y-1">
                  <span className="text-[12px] font-semibold text-gray-600 dark:text-zinc-400 block">
                    Notes:
                  </span>
                  <p className="text-[12px] text-gray-500 dark:text-zinc-400 whitespace-pre-line leading-relaxed">
                    {notes}
                  </p>
                </div>
              )}
            </div>
          </div>
        </div>
      </div>
    );
  }

  // -------------------------------------------------------------
  // Mode 1: The Form Screen
  // -------------------------------------------------------------
  return (
    <div className="w-full pb-12 text-left font-sans">
      {/* Sticky Header in Form Mode */}
      <div className="sticky top-0 z-30 w-full px-4 sm:px-6 lg:px-8 pt-5 pb-3.5 bg-white dark:bg-[#09090b] border-b border-gray-200 dark:border-[#27272a]">
        <div className="w-full">
          {/* Desktop Header Layout */}
          <div className="hidden sm:block">
            <Link
              className="inline-flex items-center gap-1 px-2.5 py-1.5 rounded-lg bg-gray-100 hover:bg-gray-200/80 dark:bg-[#18181b] dark:hover:bg-[#222226] text-[12px] leading-none font-medium text-gray-700 dark:text-zinc-300 transition-colors no-underline w-fit"
              href={backUrl}
              prefetch={false}
            >
              <ChevronLeft className="h-3.5 w-3.5" strokeWidth={2} /> Back
            </Link>
            <div className="flex items-center justify-between gap-3 mt-2.5">
              <div>
                <h1 className="text-[22px] leading-[28px] font-semibold text-gray-900 dark:text-white tracking-tight">
                  Edit Invoice
                </h1>
                <p className="text-[13px] leading-[18px] text-gray-500 dark:text-zinc-400 mt-0.5">
                  Update invoice details, line items, and payment terms.
                </p>
              </div>
              <div className="flex items-center gap-2.5 shrink-0">
                <Link
                  href={backUrl}
                  prefetch={false}
                  className="h-10 px-4 rounded-xl border border-gray-200 dark:border-[#27272a] bg-white dark:bg-[#18181b] text-[13px] font-medium text-gray-700 dark:text-zinc-300 hover:bg-gray-50 dark:hover:bg-[#222226] inline-flex items-center justify-center no-underline transition-colors"
                >
                  Cancel
                </Link>

                <button
                  type="button"
                  onClick={() => setViewMode('preview')}
                  className="h-10 px-4 rounded-xl border border-gray-200 dark:border-[#27272a] bg-white dark:bg-[#18181b] text-[13px] font-medium text-gray-700 dark:text-zinc-300 hover:bg-gray-50 dark:hover:bg-[#222226] inline-flex items-center justify-center whitespace-nowrap transition-colors"
                >
                  Preview Invoice
                </button>

                <button
                  type="button"
                  onClick={handleSave}
                  disabled={isSubmitting}
                  className="h-10 px-4 rounded-xl bg-blue-600 hover:bg-blue-700 text-white text-[13px] font-medium inline-flex items-center justify-center whitespace-nowrap transition-colors disabled:opacity-50"
                >
                  {isSubmitting ? 'Saving...' : 'Save Changes'}
                </button>
              </div>
            </div>
          </div>

          {/* Mobile Header Layout */}
          <div className="sm:hidden w-full">
            <div className="flex items-center justify-between">
              <Link
                className="inline-flex items-center gap-1 px-2.5 py-1.5 rounded-lg bg-gray-100 hover:bg-gray-200/80 dark:bg-[#18181b] dark:hover:bg-[#222226] text-[12px] leading-none font-medium text-gray-700 dark:text-zinc-300 transition-colors no-underline"
                href={backUrl}
                prefetch={false}
              >
                <ChevronLeft className="h-3.5 w-3.5" strokeWidth={2} /> Back
              </Link>
              <Link
                href={backUrl}
                prefetch={false}
                className="text-[13px] font-medium text-gray-500 hover:text-gray-900 dark:text-zinc-400 dark:hover:text-white no-underline"
              >
                Cancel
              </Link>
            </div>
            <div className="mt-2.5">
              <h1 className="text-[22px] leading-[28px] font-semibold text-gray-900 dark:text-white tracking-tight">
                Edit Invoice
              </h1>
              <p className="text-[13px] leading-[18px] text-gray-500 dark:text-zinc-400 mt-0.5">
                Update invoice details, line items, and payment terms.
              </p>
            </div>
            <div className="grid grid-cols-2 gap-2.5 w-full mt-3">
              <button
                type="button"
                onClick={() => setViewMode('preview')}
                className="h-10 w-full rounded-xl border border-gray-200 dark:border-[#27272a] bg-white dark:bg-[#18181b] text-[13px] font-medium text-gray-700 dark:text-zinc-300 inline-flex items-center justify-center transition-colors"
              >
                Preview Invoice
              </button>
              <button
                type="button"
                onClick={handleSave}
                disabled={isSubmitting}
                className="h-10 w-full rounded-xl bg-blue-600 hover:bg-blue-700 text-white text-[13px] font-medium inline-flex items-center justify-center transition-colors disabled:opacity-50"
              >
                {isSubmitting ? 'Saving...' : 'Save Changes'}
              </button>
            </div>
          </div>
        </div>
      </div>

      {/* Form Content Column */}
      <div className="px-4 sm:px-6 lg:px-8 py-6 space-y-6 max-w-[760px]">
        {/* Financial Lock Notice Banner */}
        {isLocked && (
          <div className="rounded-2xl border border-amber-200 dark:border-amber-500/20 bg-amber-50 dark:bg-amber-500/10 p-4 flex items-start gap-3 text-[13px] text-amber-800 dark:text-amber-300">
            <Lock className="h-4.5 w-4.5 shrink-0 text-amber-600 dark:text-amber-400 mt-0.5" />
            <div className="space-y-0.5">
              <p className="font-semibold text-amber-900 dark:text-amber-200">Financial Fields Locked</p>
              <p className="text-[12px] text-amber-700 dark:text-amber-300/90 leading-relaxed">
                Payments have been recorded against this invoice. Line items, client, currency, and issue date cannot be modified, but you can still update the due date and notes.
              </p>
            </div>
          </div>
        )}

        {/* Card 1: Invoice Details */}
        <div className="rounded-2xl border border-gray-200 dark:border-[#27272a] bg-white dark:bg-[#18181b] p-5 sm:p-6 space-y-5">
          <div className="-mx-5 sm:-mx-6 px-5 sm:px-6 pb-4 mb-5 border-b border-gray-100 dark:border-[#27272a]">
            <h2 className="text-[16px] leading-[22px] font-semibold text-gray-900 dark:text-white">
              Invoice Details
            </h2>
          </div>

          <div className="space-y-4">
            {/* Field 1: Client */}
            <div className="space-y-1.5" ref={clientDropdownRef}>
              <label className="block text-[12px] font-medium text-gray-700 dark:text-zinc-300 mb-1.5">
                Client
              </label>

              {isLocked ? (
                <div className="w-full h-10 px-3.5 rounded-xl bg-gray-50 dark:bg-[#121215] border border-gray-200/80 dark:border-[#27272a] text-[13px] font-medium text-gray-500 dark:text-zinc-400 flex items-center justify-between cursor-not-allowed">
                  <span>{selectedClient?.name || invoice.client_name || 'Selected Client'}</span>
                  <Lock className="h-3.5 w-3.5 text-gray-400" />
                </div>
              ) : (
                <div className="relative">
                  <button
                    type="button"
                    onClick={() => setIsClientDropdownOpen((prev) => !prev)}
                    className={cn(
                      'w-full h-10 px-3.5 rounded-xl bg-[#F9FAFB] dark:bg-[#121215] border text-[13px] flex items-center justify-between text-left transition-colors',
                      'focus:outline-none focus:border-blue-600 dark:focus:border-blue-500 focus:ring-2 focus:ring-blue-600/15 dark:focus:ring-blue-500/20',
                      isClientDropdownOpen
                        ? 'border-gray-300 dark:border-zinc-700'
                        : 'border-gray-200/80 dark:border-[#27272a]'
                    )}
                  >
                    <span className={clientId ? 'text-gray-900 dark:text-white font-medium' : 'text-gray-400 font-normal'}>
                      {selectedClient ? selectedClient.name : 'Select Client'}
                    </span>
                    <ChevronDown className="h-4 w-4 text-gray-400 shrink-0" />
                  </button>

                  {isClientDropdownOpen && (
                    <div data-popover="true" className="absolute z-30 left-0 right-0 mt-1 rounded-2xl border border-gray-200 dark:border-[#27272a] bg-white dark:bg-[#18181b] p-2 shadow-none space-y-2">
                      <input
                        type="text"
                        placeholder="Search clients..."
                        value={clientSearchQuery}
                        onChange={(e) => setClientSearchQuery(e.target.value)}
                        className="w-full h-9 px-3 rounded-lg bg-[#F9FAFB] dark:bg-[#121215] border border-gray-200/80 dark:border-[#27272a] text-[13px] font-medium text-gray-900 dark:text-white placeholder:font-normal placeholder:text-gray-400 dark:placeholder:text-zinc-500 focus:outline-none focus:border-blue-600 dark:focus:border-blue-500"
                        autoFocus
                      />
                      <div className="max-h-[200px] overflow-y-auto space-y-0.5">
                        {filteredClients.map((c) => {
                          const isSelected = c.id === clientId;
                          return (
                            <button
                              key={c.id}
                              type="button"
                              onClick={() => {
                                setClientId(c.id);
                                setIsClientDropdownOpen(false);
                                setClientSearchQuery('');
                              }}
                              className={cn(
                                'w-full px-3 py-2 rounded-xl text-left text-[13px] flex items-center justify-between transition-colors',
                                isSelected
                                  ? 'bg-gray-100 dark:bg-[#222226] text-gray-900 dark:text-white font-medium'
                                  : 'text-gray-700 dark:text-zinc-300 hover:bg-gray-50 dark:hover:bg-[#222226]'
                              )}
                            >
                              <div className="truncate">
                                <span className="block font-medium">{c.name}</span>
                                {c.company && (
                                  <span className="block text-[11px] text-gray-400 dark:text-zinc-500 truncate">
                                    {c.company}
                                  </span>
                                )}
                              </div>
                              {isSelected && (
                                <Check className="h-4 w-4 text-blue-600 dark:text-blue-400 shrink-0 ml-2" />
                              )}
                            </button>
                          );
                        })}
                      </div>
                    </div>
                  )}
                </div>
              )}
            </div>

            {/* Field 2 & 3: Currency & Invoice Number */}
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
              {/* Currency */}
              <div className="space-y-1.5" ref={currencyDropdownRef}>
                <label className="block text-[12px] font-medium text-gray-700 dark:text-zinc-300 mb-1.5">
                  Currency
                </label>
                {isLocked ? (
                  <div className="w-full h-10 px-3.5 rounded-xl bg-gray-50 dark:bg-[#121215] border border-gray-200/80 dark:border-[#27272a] text-[13px] font-medium text-gray-500 dark:text-zinc-400 flex items-center justify-between cursor-not-allowed">
                    <span>{currency}</span>
                    <Lock className="h-3.5 w-3.5 text-gray-400" />
                  </div>
                ) : (
                  <div className="relative">
                    <button
                      type="button"
                      onClick={() => setIsCurrencyDropdownOpen((prev) => !prev)}
                      className={cn(
                        'w-full h-10 px-3.5 rounded-xl bg-[#F9FAFB] dark:bg-[#121215] border text-[13px] font-medium text-gray-900 dark:text-white flex items-center justify-between text-left transition-colors',
                        'focus:outline-none focus:border-blue-600 dark:focus:border-blue-500 focus:ring-2 focus:ring-blue-600/15 dark:focus:ring-blue-500/20',
                        isCurrencyDropdownOpen
                          ? 'border-gray-300 dark:border-zinc-700'
                          : 'border-gray-200/80 dark:border-[#27272a]'
                      )}
                    >
                      <span>
                        {CURRENCIES_LIST.find((c) => c.code === currency)?.label || currency}
                      </span>
                      <ChevronDown className="h-4 w-4 text-gray-400 shrink-0" />
                    </button>

                    {isCurrencyDropdownOpen && (
                      <div data-popover="true" className="absolute z-30 left-0 right-0 mt-1 rounded-2xl border border-gray-200 dark:border-[#27272a] bg-white dark:bg-[#18181b] p-2 shadow-none space-y-2">
                        <input
                          type="text"
                          placeholder="Search currency..."
                          value={currencySearchQuery}
                          onChange={(e) => setCurrencySearchQuery(e.target.value)}
                          className="w-full h-9 px-3 rounded-lg bg-[#F9FAFB] dark:bg-[#121215] border border-gray-200/80 dark:border-[#27272a] text-[13px] font-medium text-gray-900 dark:text-white placeholder:font-normal placeholder:text-gray-400 dark:placeholder:text-zinc-500 focus:outline-none focus:border-blue-600 dark:focus:border-blue-500"
                          autoFocus
                        />
                        <div className="max-h-[180px] overflow-y-auto space-y-0.5">
                          {filteredCurrencies.map((c) => {
                            const isSelected = c.code === currency;
                            return (
                              <button
                                key={c.code}
                                type="button"
                                onClick={() => {
                                  setCurrency(c.code);
                                  setIsCurrencyDropdownOpen(false);
                                  setCurrencySearchQuery('');
                                }}
                                className={cn(
                                  'w-full px-3 py-2 rounded-xl text-left text-[13px] flex items-center justify-between transition-colors',
                                  isSelected
                                    ? 'bg-gray-100 dark:bg-[#222226] text-gray-900 dark:text-white font-medium'
                                    : 'text-gray-700 dark:text-zinc-300 hover:bg-gray-50 dark:hover:bg-[#222226]'
                                )}
                              >
                                <span>{c.label}</span>
                                {isSelected && (
                                  <Check className="h-4 w-4 text-blue-600 dark:text-blue-400 shrink-0" />
                                )}
                              </button>
                            );
                          })}
                        </div>
                      </div>
                    )}
                  </div>
                )}
              </div>

              {/* Invoice Number */}
              <div className="space-y-1.5">
                <label className="block text-[12px] font-medium text-gray-700 dark:text-zinc-300 mb-1.5">
                  Invoice Number
                </label>
                <input
                  type="text"
                  disabled={isLocked}
                  value={invoiceNumber}
                  onChange={(e) => setInvoiceNumber(e.target.value)}
                  className={cn(
                    'w-full h-10 px-3.5 rounded-xl border text-[13px] font-medium transition-colors',
                    isLocked
                      ? 'bg-gray-50 dark:bg-[#121215] text-gray-500 dark:text-zinc-400 border-gray-200/80 dark:border-[#27272a] cursor-not-allowed'
                      : 'bg-[#F9FAFB] dark:bg-[#121215] text-gray-900 dark:text-white border-gray-200/80 dark:border-[#27272a] focus:outline-none focus:border-blue-600 dark:focus:border-blue-500 focus:ring-2 focus:ring-blue-600/15'
                  )}
                />
              </div>
            </div>

            {/* Field 4, 5, 6: Issue Date, Terms, Due Date */}
            <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
              {/* Issue Date */}
              <div className="space-y-1.5">
                <label className="block text-[12px] font-medium text-gray-700 dark:text-zinc-300 mb-1.5">
                  Issue Date
                </label>
                <DatePickerPopover
                  value={issueDate}
                  onChange={handleIssueDateChange}
                  disabled={isLocked}
                />
              </div>

              {/* Terms */}
              <div className="space-y-1.5" ref={termsDropdownRef}>
                <label className="block text-[12px] font-medium text-gray-700 dark:text-zinc-300 mb-1.5">
                  Terms
                </label>
                {isLocked ? (
                  <div className="w-full h-10 px-3.5 rounded-xl bg-gray-50 dark:bg-[#121215] border border-gray-200/80 dark:border-[#27272a] text-[13px] font-medium text-gray-500 dark:text-zinc-400 flex items-center justify-between cursor-not-allowed">
                    <span>{TERMS_OPTIONS.find((t) => t.value === terms)?.label || 'Custom'}</span>
                    <Lock className="h-3.5 w-3.5 text-gray-400" />
                  </div>
                ) : (
                  <div className="relative">
                    <button
                      type="button"
                      onClick={() => setIsTermsDropdownOpen((prev) => !prev)}
                      className={cn(
                        'w-full h-10 px-3.5 rounded-xl bg-[#F9FAFB] dark:bg-[#121215] border text-[13px] font-medium text-gray-900 dark:text-white flex items-center justify-between text-left transition-colors',
                        'focus:outline-none focus:border-blue-600 dark:focus:border-blue-500 focus:ring-2 focus:ring-blue-600/15 dark:focus:ring-blue-500/20',
                        isTermsDropdownOpen
                          ? 'border-gray-300 dark:border-zinc-700'
                          : 'border-gray-200/80 dark:border-[#27272a]'
                      )}
                    >
                      <span>
                        {TERMS_OPTIONS.find((t) => t.value === terms)?.label || 'Custom'}
                      </span>
                      <ChevronDown className="h-4 w-4 text-gray-400 shrink-0" />
                    </button>

                    {isTermsDropdownOpen && (
                      <div data-popover="true" className="absolute z-30 left-0 right-0 mt-1 rounded-2xl border border-gray-200 dark:border-[#27272a] bg-white dark:bg-[#18181b] p-1.5 shadow-none space-y-0.5">
                        {TERMS_OPTIONS.map((t) => {
                          const isSelected = t.value === terms;
                          return (
                            <button
                              key={t.value}
                              type="button"
                              onClick={() => handleTermsChange(t.value)}
                              className={cn(
                                'w-full px-3 py-2 rounded-xl text-left text-[13px] flex items-center justify-between transition-colors',
                                isSelected
                                  ? 'bg-gray-100 dark:bg-[#222226] text-gray-900 dark:text-white font-medium'
                                  : 'text-gray-700 dark:text-zinc-300 hover:bg-gray-50 dark:hover:bg-[#222226]'
                              )}
                            >
                              <span>{t.label}</span>
                              {isSelected && (
                                <Check className="h-4 w-4 text-blue-600 dark:text-blue-400 shrink-0" />
                              )}
                            </button>
                          );
                        })}
                      </div>
                    )}
                  </div>
                )}
              </div>

              {/* Due Date (Always editable!) */}
              <div className="space-y-1.5">
                <label className="block text-[12px] font-medium text-gray-700 dark:text-zinc-300 mb-1.5">
                  Due Date
                </label>
                <DatePickerPopover
                  value={dueDate}
                  onChange={handleDueDateChange}
                />
              </div>
            </div>
          </div>
        </div>

        {/* Card 2: Product/Service Details */}
        <div className="rounded-2xl border border-gray-200 dark:border-[#27272a] bg-white dark:bg-[#18181b] p-5 sm:p-6 space-y-4">
          <div className="-mx-5 sm:-mx-6 px-5 sm:px-6 pb-4 mb-4 border-b border-gray-100 dark:border-[#27272a]">
            <h2 className="text-[16px] leading-[22px] font-semibold text-gray-900 dark:text-white">
              Product/Service Details
            </h2>
          </div>

          {/* Desktop Table View */}
          <div className="hidden sm:block space-y-3">
            <div className="-mx-5 sm:-mx-6 px-5 sm:px-6 py-2.5 bg-[#F8FAFC] dark:bg-[#121215] border-y border-gray-200/80 dark:border-[#27272a] flex items-center text-[12px] font-medium text-gray-500 dark:text-zinc-400">
              <span className="w-8 shrink-0" />
              <span className="flex-1 px-3">Item Description</span>
              <span className="w-20 px-3 text-left">Qty</span>
              <span className="w-32 px-3 text-left">Unit Price</span>
              <span className="w-28 px-3 text-left">Total</span>
              <span className="w-10 shrink-0" />
            </div>

            <div className="space-y-3">
              {lineItems.map((item, index) => {
                let unitMinor = 0;
                try {
                  if (item.unitPrice.trim()) {
                    unitMinor = parseMoneyInput(item.unitPrice, currency).amountMinor;
                  }
                } catch {}
                const lineTotalMinor = multiplyMinor(unitMinor, item.quantity || 0);

                return (
                  <div
                    key={item.id}
                    draggable={!isLocked}
                    onDragStart={() => handleDragStart(index)}
                    onDragOver={(e) => handleDragOver(e, index)}
                    onDragEnd={handleDragEnd}
                    className={cn(
                      'flex items-center gap-2 group transition-opacity',
                      draggedIndex === index ? 'opacity-40' : 'opacity-100'
                    )}
                  >
                    <div
                      className={cn(
                        'w-8 flex items-center justify-center text-gray-300 dark:text-zinc-600',
                        isLocked ? 'cursor-not-allowed' : 'cursor-grab active:cursor-grabbing hover:text-gray-500 dark:hover:text-zinc-400'
                      )}
                    >
                      <GripVertical className="h-4 w-4" />
                    </div>

                    <div className="flex-1">
                      <input
                        type="text"
                        disabled={isLocked}
                        value={item.description}
                        onChange={(e) => handleUpdateLineItem(item.id, 'description', e.target.value)}
                        placeholder="Description..."
                        className={cn(
                          'w-full h-10 px-3.5 rounded-xl border text-[13px] font-medium transition-colors',
                          isLocked
                            ? 'bg-gray-50 dark:bg-[#121215] text-gray-500 dark:text-zinc-400 border-gray-200/80 dark:border-[#27272a] cursor-not-allowed'
                            : 'bg-[#F9FAFB] dark:bg-[#121215] text-gray-900 dark:text-white border-gray-200/80 dark:border-[#27272a] focus:outline-none focus:border-blue-600 dark:focus:border-blue-500 focus:ring-2 focus:ring-blue-600/15'
                        )}
                      />
                    </div>

                    <div className="w-20">
                      <input
                        type="number"
                        min="1"
                        disabled={isLocked}
                        value={item.quantity}
                        onChange={(e) => handleUpdateLineItem(item.id, 'quantity', Math.max(1, parseInt(e.target.value, 10) || 1))}
                        className={cn(
                          'w-full h-10 px-2 text-left rounded-xl border text-[13px] font-medium tabular-nums transition-colors',
                          isLocked
                            ? 'bg-gray-50 dark:bg-[#121215] text-gray-500 dark:text-zinc-400 border-gray-200/80 dark:border-[#27272a] cursor-not-allowed'
                            : 'bg-[#F9FAFB] dark:bg-[#121215] text-gray-900 dark:text-white border-gray-200/80 dark:border-[#27272a] focus:outline-none focus:border-blue-600 dark:focus:border-blue-500 focus:ring-2 focus:ring-blue-600/15'
                        )}
                      />
                    </div>

                    <div className="w-32">
                      <input
                        type="text"
                        inputMode="decimal"
                        disabled={isLocked}
                        value={item.unitPrice}
                        onChange={(e) => handleUpdateLineItem(item.id, 'unitPrice', e.target.value)}
                        placeholder="0.00"
                        className={cn(
                          'w-full h-10 px-3 text-left rounded-xl border text-[13px] font-medium tabular-nums transition-colors',
                          isLocked
                            ? 'bg-gray-50 dark:bg-[#121215] text-gray-500 dark:text-zinc-400 border-gray-200/80 dark:border-[#27272a] cursor-not-allowed'
                            : 'bg-[#F9FAFB] dark:bg-[#121215] text-gray-900 dark:text-white border-gray-200/80 dark:border-[#27272a] focus:outline-none focus:border-blue-600 dark:focus:border-blue-500 focus:ring-2 focus:ring-blue-600/15'
                        )}
                      />
                    </div>

                    <div className="w-28 px-3 text-left font-semibold text-[13px] text-gray-900 dark:text-white tabular-nums">
                      <Money amountMinor={lineTotalMinor} currency={currency} />
                    </div>

                    {!isLocked && (
                      <div className="w-10 flex items-center justify-center">
                        <button
                          type="button"
                          onClick={() => handleRemoveLineItem(item.id)}
                          className="text-gray-400 hover:text-rose-600 dark:hover:text-rose-400 p-1 rounded-lg transition-colors"
                          aria-label="Delete line item"
                        >
                          <Trash2 className="h-4 w-4" strokeWidth={2} />
                        </button>
                      </div>
                    )}
                  </div>
                );
              })}
            </div>
          </div>

          {/* Mobile Card Stack */}
          <div className="sm:hidden space-y-3">
            {lineItems.map((item, index) => {
              let unitMinor = 0;
              try {
                if (item.unitPrice.trim()) {
                  unitMinor = parseMoneyInput(item.unitPrice, currency).amountMinor;
                }
              } catch {}
              const lineTotalMinor = multiplyMinor(unitMinor, item.quantity || 0);

              return (
                <div
                  key={item.id}
                  className="rounded-xl border border-gray-200 dark:border-[#27272a] bg-[#F9FAFB] dark:bg-[#121215] p-3.5 space-y-3"
                >
                  <div className="flex items-center justify-between">
                    <span className="text-[12px] font-semibold text-gray-700 dark:text-zinc-300">
                      Item #{index + 1}
                    </span>
                    {!isLocked && (
                      <div className="flex items-center gap-1">
                        <button
                          type="button"
                          onClick={() => handleMoveLineItem(index, 'up')}
                          disabled={index === 0}
                          className="p-1 text-gray-400 hover:text-gray-700 dark:hover:text-zinc-200 disabled:opacity-30"
                        >
                          <ChevronUp className="h-4 w-4" />
                        </button>
                        <button
                          type="button"
                          onClick={() => handleMoveLineItem(index, 'down')}
                          disabled={index === lineItems.length - 1}
                          className="p-1 text-gray-400 hover:text-gray-700 dark:hover:text-zinc-200 disabled:opacity-30"
                        >
                          <ChevronDown className="h-4 w-4" />
                        </button>
                        <button
                          type="button"
                          onClick={() => handleRemoveLineItem(item.id)}
                          className="p-1 text-gray-400 hover:text-rose-600 ml-1"
                        >
                          <Trash2 className="h-4 w-4" />
                        </button>
                      </div>
                    )}
                  </div>

                  <div>
                    <input
                      type="text"
                      disabled={isLocked}
                      value={item.description}
                      onChange={(e) => handleUpdateLineItem(item.id, 'description', e.target.value)}
                      placeholder="Description..."
                      className={cn(
                        'w-full h-10 px-3 rounded-xl border text-[13px] font-medium transition-colors',
                        isLocked
                          ? 'bg-gray-50 dark:bg-[#18181b] text-gray-500 border-gray-200 dark:border-[#27272a] cursor-not-allowed'
                          : 'bg-white dark:bg-[#18181b] text-gray-900 dark:text-white border-gray-200 dark:border-[#27272a] focus:outline-none focus:border-blue-600'
                      )}
                    />
                  </div>

                  <div className="grid grid-cols-2 gap-2">
                    <div className="space-y-1">
                      <label className="text-[11px] font-medium text-gray-600 dark:text-zinc-400">Quantity</label>
                      <input
                        type="number"
                        min="1"
                        disabled={isLocked}
                        value={item.quantity}
                        onChange={(e) => handleUpdateLineItem(item.id, 'quantity', Math.max(1, parseInt(e.target.value, 10) || 1))}
                        className={cn(
                          'w-full h-10 px-3 rounded-xl border text-[13px] font-medium tabular-nums transition-colors',
                          isLocked
                            ? 'bg-gray-50 dark:bg-[#18181b] text-gray-500 border-gray-200 dark:border-[#27272a] cursor-not-allowed'
                            : 'bg-white dark:bg-[#18181b] text-gray-900 dark:text-white border-gray-200 dark:border-[#27272a] focus:outline-none focus:border-blue-600'
                        )}
                      />
                    </div>
                    <div className="space-y-1">
                      <label className="text-[11px] font-medium text-gray-600 dark:text-zinc-400">Unit Price</label>
                      <input
                        type="text"
                        inputMode="decimal"
                        disabled={isLocked}
                        value={item.unitPrice}
                        onChange={(e) => handleUpdateLineItem(item.id, 'unitPrice', e.target.value)}
                        placeholder="0.00"
                        className={cn(
                          'w-full h-10 px-3 rounded-xl border text-[13px] font-medium tabular-nums transition-colors',
                          isLocked
                            ? 'bg-gray-50 dark:bg-[#18181b] text-gray-500 border-gray-200 dark:border-[#27272a] cursor-not-allowed'
                            : 'bg-white dark:bg-[#18181b] text-gray-900 dark:text-white border-gray-200 dark:border-[#27272a] focus:outline-none focus:border-blue-600'
                        )}
                      />
                    </div>
                  </div>

                  <div className="pt-2 border-t border-gray-200 dark:border-[#27272a] flex items-center justify-between text-[13px]">
                    <span className="text-gray-500 dark:text-zinc-400">Total:</span>
                    <Money amountMinor={lineTotalMinor} currency={currency} className="font-semibold text-gray-900 dark:text-white tabular-nums" />
                  </div>
                </div>
              );
            })}
          </div>

          {/* Add Item CTA */}
          {!isLocked && (
            <button
              type="button"
              onClick={handleAddLineItem}
              className="inline-flex items-center gap-1.5 text-[13px] font-medium text-gray-800 hover:text-gray-950 dark:text-zinc-200 dark:hover:text-white pt-1 transition-colors"
            >
              <Plus className="h-4 w-4" strokeWidth={2} /> Add Item
            </button>
          )}
        </div>

        {/* Card 3: Total Card */}
        <div className="rounded-2xl border border-gray-200 dark:border-[#27272a] bg-white dark:bg-[#18181b] p-5 sm:p-6">
          <div className="-mx-5 sm:-mx-6 px-5 sm:px-6 pb-4 mb-4 border-b border-gray-100 dark:border-[#27272a]">
            <h2 className="text-[16px] leading-[22px] font-semibold text-gray-900 dark:text-white">
              Total
            </h2>
          </div>
          <div className="flex items-center justify-between pt-1">
            <span className="text-[15px] font-semibold text-gray-900 dark:text-white">
              Total Amount
            </span>
            <Money
              amountMinor={totalMinor}
              className="text-[22px] leading-[28px] font-semibold text-gray-900 dark:text-white tabular-nums"
              currency={currency}
            />
          </div>
        </div>

        {/* Notes Section */}
        <div className="grid grid-cols-1 sm:grid-cols-2 gap-5">
          <div className="space-y-1.5">
            <label className="block text-[12px] font-medium text-gray-700 dark:text-zinc-300 mb-1.5">
              Note to Customer (Optional)
            </label>
            <textarea
              rows={4}
              value={notes}
              onChange={(e) => setNotes(e.target.value)}
              placeholder="Payment terms, delivery details, thank you notes..."
              className="w-full min-h-[110px] p-3.5 rounded-xl bg-[#F9FAFB] dark:bg-[#121215] border border-gray-200/80 dark:border-[#27272a] text-[13px] font-medium text-gray-900 dark:text-white placeholder:font-normal placeholder:text-gray-400 dark:placeholder:text-zinc-500 focus:outline-none focus:border-blue-600 dark:focus:border-blue-500 focus:ring-2 focus:ring-blue-600/15 dark:focus:ring-blue-500/20 transition-colors resize-none"
            />
          </div>
          <div className="space-y-1.5">
            <label className="block text-[12px] font-medium text-gray-700 dark:text-zinc-300 mb-1.5">
              Internal Note (Private)
            </label>
            <textarea
              rows={4}
              value={internalNote}
              onChange={(e) => setInternalNote(e.target.value)}
              placeholder="Private notes visible only to you (not printed on PDF)..."
              className="w-full min-h-[110px] p-3.5 rounded-xl bg-[#F9FAFB] dark:bg-[#121215] border border-gray-200/80 dark:border-[#27272a] text-[13px] font-medium text-gray-900 dark:text-white placeholder:font-normal placeholder:text-gray-400 dark:placeholder:text-zinc-500 focus:outline-none focus:border-blue-600 dark:focus:border-blue-500 focus:ring-2 focus:ring-blue-600/15 dark:focus:ring-blue-500/20 transition-colors resize-none"
            />
          </div>
        </div>
      </div>
    </div>
  );
}

export default EditInvoiceClient;
