'use client';

import React, { useState, useEffect, useMemo, useRef } from 'react';
import { createPortal } from 'react-dom';
import { useInvoicesForClient, useInvoice } from '../lib/data/hooks';
import { PaymentRepo } from '../lib/data/payment';
import { formatMoney, parseMoneyInput, CURRENCIES } from '../lib/money';
import { X, CreditCard, AlertTriangle, ChevronDown, Check, Calendar, ChevronLeft, ChevronRight } from 'lucide-react';
import { useToast } from './Toast';
import { cn } from '../lib/utils';

interface RecordPaymentModalProps {
  clientId: string;
  invoiceId?: string;
  onClose: () => void;
  onSuccess?: () => void;
}

/**
 * Pure helper to derive the active invoice ID synchronously during render.
 * Prevents Frame-1 mount pop-ins when opening without a pre-selected invoice ID.
 */
export function deriveEffectiveInvoiceId({
  invoiceId,
  selectedInvoiceId,
  activeInvoices
}: {
  invoiceId?: string;
  selectedInvoiceId: string;
  activeInvoices: Array<{ id: string }>;
}): string {
  if (invoiceId) return invoiceId;
  if (selectedInvoiceId && activeInvoices.some((inv) => inv.id === selectedInvoiceId)) {
    return selectedInvoiceId;
  }
  return activeInvoices.length > 0 ? activeInvoices[0].id : '';
}

/**
 * Formats a major-unit balance due string using canonical currency metadata.
 * Prevents floating-point precision drift and trailing zeroes loss.
 */
export function formatFullBalance(balanceDueMinor: number, currency: string): string {
  const exponent = CURRENCIES[currency]?.exponent ?? 2;
  const divisor = Math.pow(10, exponent);
  const balanceMajor = Math.max(0, balanceDueMinor) / divisor;
  return balanceMajor.toFixed(exponent);
}

/**
 * Resolves the deterministic readiness and view state of the RecordPaymentModal.
 * Enforces ADR 036 readiness precedence: loading -> not found -> empty -> form.
 */
export function resolvePaymentModalState({
  isLoading,
  invoiceId,
  hasSingleInvoice,
  activeInvoicesCount
}: {
  isLoading: boolean;
  invoiceId?: string;
  hasSingleInvoice: boolean;
  activeInvoicesCount: number;
}): 'loading' | 'invoice_not_found' | 'no_active_invoices' | 'ready' {
  if (isLoading) return 'loading';
  if (invoiceId && !hasSingleInvoice) return 'invoice_not_found';
  if (!invoiceId && activeInvoicesCount === 0) return 'no_active_invoices';
  return 'ready';
}

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

function ModalDatePicker({
  value,
  onChange,
  id
}: {
  value: string;
  onChange: (d: string) => void;
  id?: string;
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
        id={id}
        type="button"
        onClick={() => setIsOpen((prev) => !prev)}
        className={cn(
          'w-full h-10 px-3.5 rounded-xl bg-[#F9FAFB] dark:bg-[#121215] border text-[13px] font-medium text-gray-900 dark:text-white flex items-center justify-between text-left transition-colors',
          'focus:outline-none focus:border-blue-600 dark:focus:border-blue-500 focus:ring-2 focus:ring-blue-600/15 dark:focus:ring-blue-500/20',
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

      {isOpen && (
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

const PAYMENT_METHODS = [
  { value: 'cash', label: 'Cash' },
  { value: 'bank_transfer', label: 'Bank Transfer' },
  { value: 'card', label: 'Card' },
  { value: 'mobile_money', label: 'Mobile Money' },
  { value: 'other', label: 'Other' },
];

export function RecordPaymentModal({ clientId, invoiceId, onClose, onSuccess }: RecordPaymentModalProps) {
  const { showToast } = useToast();
  const [isMounted, setIsMounted] = useState(false);

  useEffect(() => {
    setIsMounted(true);
  }, []);

  // Queries
  const { data: clientInvoices, isLoading: isInvoicesLoading } = useInvoicesForClient(clientId);
  const { data: singleInvoice, isLoading: isSingleInvoiceLoading } = useInvoice(invoiceId || '');

  // States
  const [selectedInvoiceId, setSelectedInvoiceId] = useState<string>('');
  const [amount, setAmount] = useState<string>('');
  const [occurredAt, setOccurredAt] = useState<string>(() => new Date().toISOString().split('T')[0]);
  const [method, setMethod] = useState<string>('cash');
  const [note, setNote] = useState<string>('');
  const [isSubmitting, setIsSubmitting] = useState<boolean>(false);
  const [overpaymentWarning, setOverpaymentWarning] = useState<{ amountMinor: number; formattedDiff: string } | null>(null);

  // Popover open states
  const [isInvoiceDropdownOpen, setIsInvoiceDropdownOpen] = useState(false);
  const [isMethodDropdownOpen, setIsMethodDropdownOpen] = useState(false);
  const invoiceDropdownRef = useRef<HTMLDivElement>(null);
  const methodDropdownRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    function handleClickOutside(event: MouseEvent) {
      if (invoiceDropdownRef.current && !invoiceDropdownRef.current.contains(event.target as Node)) {
        setIsInvoiceDropdownOpen(false);
      }
      if (methodDropdownRef.current && !methodDropdownRef.current.contains(event.target as Node)) {
        setIsMethodDropdownOpen(false);
      }
    }
    document.addEventListener('mousedown', handleClickOutside);
    return () => document.removeEventListener('mousedown', handleClickOutside);
  }, []);

  // Filter invoices to active ones (non-draft, non-void)
  const activeInvoices = useMemo(() => {
    if (!clientInvoices) return [];
    return clientInvoices.filter(
      (inv) => inv.displayStatus !== 'draft' && inv.displayStatus !== 'void'
    );
  }, [clientInvoices]);

  // Synchronously derive effective target invoice ID
  const effectiveInvoiceId = useMemo(() => {
    return deriveEffectiveInvoiceId({ invoiceId, selectedInvoiceId, activeInvoices });
  }, [invoiceId, selectedInvoiceId, activeInvoices]);

  // Resolve currently active target invoice (from hook or dropdown)
  const activeInvoice = useMemo(() => {
    if (invoiceId) {
      return singleInvoice || null;
    }
    return activeInvoices.find((inv) => inv.id === effectiveInvoiceId) || null;
  }, [invoiceId, singleInvoice, activeInvoices, effectiveInvoiceId]);

  const currency = useMemo(() => {
    return activeInvoice?.currency?.toUpperCase() || 'USD';
  }, [activeInvoice]);

  // Handler for setting full outstanding balance using canonical currency exponent
  const handlePayFullBalance = () => {
    if (!activeInvoice) return;
    setAmount(formatFullBalance(activeInvoice.balanceDueMinor, currency));
  };

  const executeRecordPayment = async (amountMinor: number) => {
    if (!activeInvoice) return;
    await PaymentRepo.record({
      invoice_id: activeInvoice.id,
      client_id: clientId,
      amount_minor: amountMinor,
      currency,
      method: method || 'cash',
      note: note.trim() || null,
      occurred_at: occurredAt || undefined
    });
    if (onSuccess) {
      onSuccess();
    } else {
      showToast('Payment recorded successfully');
    }
    onClose();
  };

  const handleConfirmOverpayment = async () => {
    if (!overpaymentWarning) return;
    try {
      setIsSubmitting(true);
      await executeRecordPayment(overpaymentWarning.amountMinor);
      setOverpaymentWarning(null);
    } catch (err: unknown) {
      const msg = err instanceof Error ? err.message : 'Failed to record payment.';
      showToast(msg, 'info');
    } finally {
      setIsSubmitting(false);
    }
  };

  // Submit payment event handler
  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!activeInvoice) return;
    if (isSubmitting) return;

    if (!amount.trim() || isNaN(parseFloat(amount)) || parseFloat(amount) <= 0) {
      showToast('Please enter a valid amount greater than zero.', 'info');
      return;
    }

    try {
      setIsSubmitting(true);
      const parsedMoney = parseMoneyInput(amount, currency);
      
      // Warn on overpayment
      if (parsedMoney.amountMinor > activeInvoice.balanceDueMinor) {
        const formattedDiff = formatMoney({
          amountMinor: parsedMoney.amountMinor - activeInvoice.balanceDueMinor,
          currency
        });

        setOverpaymentWarning({
          amountMinor: parsedMoney.amountMinor,
          formattedDiff
        });
        setIsSubmitting(false);
        return;
      }

      await executeRecordPayment(parsedMoney.amountMinor);
    } catch (err: unknown) {
      const msg = err instanceof Error ? err.message : 'Failed to record payment.';
      showToast(msg, 'info');
      setIsSubmitting(false);
    }
  };

  const isLoading = invoiceId ? isSingleInvoiceLoading : isInvoicesLoading;
  const modalState = resolvePaymentModalState({
    isLoading,
    invoiceId,
    hasSingleInvoice: Boolean(singleInvoice),
    activeInvoicesCount: activeInvoices.length
  });

  if (!isMounted) return null;

  return createPortal(
    <div className="fixed inset-0 z-50 w-full h-full m-0 flex items-center justify-center p-4 bg-black/50 backdrop-blur-xs overflow-y-auto">
      <div className="rounded-2xl border border-gray-200 dark:border-[#27272a] bg-white dark:bg-[#18181b] p-5 sm:p-6 max-w-[480px] w-full space-y-4 my-auto overflow-hidden text-left shadow-none">
        
        {/* Header */}
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-2">
            <CreditCard className="h-4.5 w-4.5 text-blue-600 dark:text-blue-400 shrink-0" />
            <h3 className="text-[17px] leading-[22px] font-semibold text-gray-900 dark:text-white">
              Record Manual Payment
            </h3>
          </div>
          <button
            type="button"
            onClick={onClose}
            className="text-gray-400 hover:text-gray-600 dark:hover:text-zinc-200 p-1 rounded-lg transition-colors"
            aria-label="Close"
          >
            <X className="h-5 w-5" strokeWidth={2} />
          </button>
        </div>

        {/* Body Content */}
        {modalState === 'loading' ? (
          <div className="space-y-4 font-sans text-left animate-pulse" aria-busy="true" aria-label="Loading invoice details">
            <div className="space-y-1.5">
              <div className="h-3.5 w-24 rounded bg-gray-200 dark:bg-[#27272a]" />
              <div className="h-10 w-full rounded-xl bg-gray-100 dark:bg-[#121215]" />
            </div>

            <div className="rounded-xl border border-gray-100 dark:border-[#27272a] bg-gray-50 dark:bg-[#121215] p-3.5 grid grid-cols-3 gap-2">
              <div className="h-8 bg-gray-200 dark:bg-[#27272a] rounded" />
              <div className="h-8 bg-gray-200 dark:bg-[#27272a] rounded" />
              <div className="h-8 bg-gray-200 dark:bg-[#27272a] rounded" />
            </div>

            <div className="grid grid-cols-1 sm:grid-cols-2 gap-3.5">
              <div className="h-10 rounded-xl bg-gray-100 dark:bg-[#121215]" />
              <div className="h-10 rounded-xl bg-gray-100 dark:bg-[#121215]" />
            </div>

            <div className="grid grid-cols-1 sm:grid-cols-2 gap-3.5">
              <div className="h-10 rounded-xl bg-gray-100 dark:bg-[#121215]" />
              <div className="h-10 rounded-xl bg-gray-100 dark:bg-[#121215]" />
            </div>

            <div className="pt-3 flex justify-end gap-2.5 border-t border-gray-100 dark:border-[#27272a]">
              <div className="h-10 w-20 rounded-xl bg-gray-200 dark:bg-[#27272a]" />
              <div className="h-10 w-32 rounded-xl bg-gray-200 dark:bg-[#27272a]" />
            </div>
          </div>
        ) : modalState === 'invoice_not_found' ? (
          <div className="space-y-4 text-center py-4">
            <div className="mx-auto flex h-12 w-12 items-center justify-center rounded-2xl bg-amber-500/10 border border-amber-500/20 text-amber-500">
              <AlertTriangle className="h-6 w-6" />
            </div>
            <div className="space-y-1">
              <h4 className="text-[15px] font-semibold text-gray-900 dark:text-white">Invoice Record Not Found</h4>
              <p className="text-[12px] text-gray-500 dark:text-zinc-400 max-w-sm mx-auto">
                The requested invoice could not be found in local storage. It may have been deleted or not synced yet.
              </p>
            </div>
            <div className="pt-2 flex justify-center border-t border-gray-100 dark:border-[#27272a]">
              <button
                type="button"
                onClick={onClose}
                className="h-10 px-4 rounded-xl border border-gray-200 dark:border-[#27272a] text-[13px] font-medium text-gray-700 dark:text-zinc-300 hover:bg-gray-50 dark:hover:bg-[#222226] transition-colors"
              >
                Close
              </button>
            </div>
          </div>
        ) : modalState === 'no_active_invoices' ? (
          <div className="space-y-4 text-center py-4">
            <div className="mx-auto flex h-12 w-12 items-center justify-center rounded-2xl bg-gray-100 dark:bg-[#222226] text-gray-400 dark:text-zinc-500">
              <CreditCard className="h-6 w-6" />
            </div>
            <div className="space-y-1">
              <h4 className="text-[15px] font-semibold text-gray-900 dark:text-white">No Active Invoices</h4>
              <p className="text-[12px] text-gray-500 dark:text-zinc-400 max-w-sm mx-auto">
                This client has no active (non-draft, non-void) invoices to record payment against. Please create and send an invoice first.
              </p>
            </div>
            <div className="pt-2 flex justify-center border-t border-gray-100 dark:border-[#27272a]">
              <button
                type="button"
                onClick={onClose}
                className="h-10 px-4 rounded-xl border border-gray-200 dark:border-[#27272a] text-[13px] font-medium text-gray-700 dark:text-zinc-300 hover:bg-gray-50 dark:hover:bg-[#222226] transition-colors"
              >
                Close
              </button>
            </div>
          </div>
        ) : activeInvoice ? (
          <form onSubmit={handleSubmit} className="space-y-4 font-sans text-left">
            {/* Invoice Selector (if client-triggered) */}
            {!invoiceId && (
              <div className="space-y-1.5" ref={invoiceDropdownRef}>
                <label htmlFor="invoiceSelect" className="block text-[12px] font-medium text-gray-700 dark:text-zinc-300">
                  Select Invoice *
                </label>
                <div className="relative">
                  <button
                    id="invoiceSelect"
                    type="button"
                    onClick={() => setIsInvoiceDropdownOpen((prev) => !prev)}
                    className={cn(
                      'w-full h-10 px-3.5 rounded-xl bg-[#F9FAFB] dark:bg-[#121215] border text-[13px] font-medium text-gray-900 dark:text-white flex items-center justify-between text-left transition-colors',
                      'focus:outline-none focus:border-blue-600 dark:focus:border-blue-500 focus:ring-2 focus:ring-blue-600/15 dark:focus:ring-blue-500/20',
                      isInvoiceDropdownOpen
                        ? 'border-gray-300 dark:border-zinc-700'
                        : 'border-gray-200/80 dark:border-[#27272a]'
                    )}
                  >
                    <span className="truncate">
                      {activeInvoice
                        ? `${activeInvoice.invoice_number} (${formatMoney({ amountMinor: activeInvoice.total_minor, currency: activeInvoice.currency })})`
                        : 'Select Invoice'}
                    </span>
                    <ChevronDown className="h-4 w-4 text-gray-400 shrink-0 ml-2" />
                  </button>

                  {isInvoiceDropdownOpen && (
                    <div data-popover="true" className="absolute z-30 left-0 right-0 mt-1 rounded-xl border border-gray-200 dark:border-[#27272a] bg-white dark:bg-[#18181b] p-1.5 shadow-none max-h-[180px] overflow-y-auto space-y-0.5">
                      {activeInvoices.map((inv) => {
                        const isSelected = inv.id === effectiveInvoiceId;
                        return (
                          <button
                            key={inv.id}
                            type="button"
                            onClick={() => {
                              setSelectedInvoiceId(inv.id);
                              setIsInvoiceDropdownOpen(false);
                            }}
                            className={cn(
                              'w-full px-3 py-2 rounded-lg text-left text-[13px] flex items-center justify-between transition-colors',
                              isSelected
                                ? 'bg-gray-100 dark:bg-[#222226] text-gray-900 dark:text-white font-medium'
                                : 'text-gray-700 dark:text-zinc-300 hover:bg-gray-50 dark:hover:bg-[#222226]'
                            )}
                          >
                            <span className="truncate">
                              {inv.invoice_number} ({formatMoney({ amountMinor: inv.total_minor, currency: inv.currency })})
                            </span>
                            {isSelected && (
                              <Check className="h-4 w-4 text-blue-600 dark:text-blue-400 shrink-0 ml-2" />
                            )}
                          </button>
                        );
                      })}
                    </div>
                  )}
                </div>
              </div>
            )}

            {/* Context Panel */}
            <div className="rounded-xl border border-gray-200/80 dark:border-[#27272a] bg-[#F9FAFB] dark:bg-[#121215] p-3.5 grid grid-cols-3 gap-2 text-center text-xs">
              <div>
                <span className="block text-gray-500 dark:text-zinc-400 uppercase font-semibold text-[10px]">Invoice Total</span>
                <span className="block text-gray-900 dark:text-white font-semibold mt-0.5 tabular-nums">
                  {formatMoney({ amountMinor: activeInvoice.total_minor, currency })}
                </span>
              </div>
              <div>
                <span className="block text-gray-500 dark:text-zinc-400 uppercase font-semibold text-[10px]">Paid to Date</span>
                <span className="block text-emerald-600 dark:text-emerald-400 font-semibold mt-0.5 tabular-nums">
                  {formatMoney({ amountMinor: activeInvoice.amountPaidMinor, currency })}
                </span>
              </div>
              <div>
                <span className="block text-gray-500 dark:text-zinc-400 uppercase font-semibold text-[10px]">Balance Due</span>
                <span className="block text-gray-900 dark:text-white font-semibold mt-0.5 tabular-nums">
                  {formatMoney({ amountMinor: activeInvoice.balanceDueMinor, currency })}
                </span>
              </div>
            </div>

            {/* Payment Fields: Single column on mobile, 2 columns on sm+ */}
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-3.5">
              {/* Amount Field */}
              <div className="space-y-1.5">
                <label htmlFor="pmtAmount" className="block text-[12px] font-medium text-gray-700 dark:text-zinc-300">
                  Payment Amount *
                </label>
                <div className="relative">
                  <input
                    id="pmtAmount"
                    type="text"
                    required
                    placeholder="0.00"
                    value={amount}
                    onChange={(e) => setAmount(e.target.value)}
                    className="w-full h-10 pl-3.5 pr-20 rounded-xl bg-[#F9FAFB] dark:bg-[#121215] border border-gray-200/80 dark:border-[#27272a] text-[13px] font-medium text-gray-900 dark:text-white placeholder:font-normal placeholder:text-gray-400 dark:placeholder:text-zinc-500 focus:outline-none focus:border-blue-600 dark:focus:border-blue-500 focus:ring-2 focus:ring-blue-600/15 dark:focus:ring-blue-500/20 transition-colors"
                  />
                  <div className="absolute inset-y-0 right-0 flex items-center pr-2 gap-1.5">
                    <span className="text-[11px] font-semibold text-gray-500 dark:text-zinc-400 uppercase">{currency}</span>
                    <button
                      type="button"
                      onClick={handlePayFullBalance}
                      className="bg-blue-50 hover:bg-blue-100 text-blue-600 dark:bg-blue-500/10 dark:hover:bg-blue-500/20 dark:text-blue-400 border border-blue-200 dark:border-blue-500/20 px-2 py-0.5 rounded-lg text-[11px] font-medium transition-colors"
                    >
                      Full
                    </button>
                  </div>
                </div>
              </div>

              {/* Date Field with Custom DatePicker */}
              <div className="space-y-1.5">
                <label htmlFor="pmtDate" className="block text-[12px] font-medium text-gray-700 dark:text-zinc-300">
                  Payment Date
                </label>
                <ModalDatePicker
                  id="pmtDate"
                  value={occurredAt}
                  onChange={(d) => setOccurredAt(d)}
                />
              </div>
            </div>

            <div className="grid grid-cols-1 sm:grid-cols-2 gap-3.5">
              {/* Method Field */}
              <div className="space-y-1.5" ref={methodDropdownRef}>
                <label htmlFor="pmtMethod" className="block text-[12px] font-medium text-gray-700 dark:text-zinc-300">
                  Payment Method *
                </label>
                <div className="relative">
                  <button
                    id="pmtMethod"
                    type="button"
                    onClick={() => setIsMethodDropdownOpen((prev) => !prev)}
                    className={cn(
                      'w-full h-10 px-3.5 rounded-xl bg-[#F9FAFB] dark:bg-[#121215] border text-[13px] font-medium text-gray-900 dark:text-white flex items-center justify-between text-left transition-colors',
                      'focus:outline-none focus:border-blue-600 dark:focus:border-blue-500 focus:ring-2 focus:ring-blue-600/15 dark:focus:ring-blue-500/20',
                      isMethodDropdownOpen
                        ? 'border-gray-300 dark:border-zinc-700'
                        : 'border-gray-200/80 dark:border-[#27272a]'
                    )}
                  >
                    <span>{PAYMENT_METHODS.find((m) => m.value === method)?.label || 'Cash'}</span>
                    <ChevronDown className="h-4 w-4 text-gray-400 shrink-0" />
                  </button>

                  {isMethodDropdownOpen && (
                    <div data-popover="true" className="absolute z-30 left-0 right-0 mt-1 rounded-xl border border-gray-200 dark:border-[#27272a] bg-white dark:bg-[#18181b] p-1.5 shadow-none max-h-[180px] overflow-y-auto space-y-0.5">
                      {PAYMENT_METHODS.map((m) => {
                        const isSelected = m.value === method;
                        return (
                          <button
                            key={m.value}
                            type="button"
                            onClick={() => {
                              setMethod(m.value);
                              setIsMethodDropdownOpen(false);
                            }}
                            className={cn(
                              'w-full px-3 py-2 rounded-lg text-left text-[13px] flex items-center justify-between transition-colors',
                              isSelected
                                ? 'bg-gray-100 dark:bg-[#222226] text-gray-900 dark:text-white font-medium'
                                : 'text-gray-700 dark:text-zinc-300 hover:bg-gray-50 dark:hover:bg-[#222226]'
                            )}
                          >
                            <span>{m.label}</span>
                            {isSelected && (
                              <Check className="h-4 w-4 text-blue-600 dark:text-blue-400 shrink-0" />
                            )}
                          </button>
                        );
                      })}
                    </div>
                  )}
                </div>
              </div>

              {/* Note Field */}
              <div className="space-y-1.5">
                <label htmlFor="pmtNote" className="block text-[12px] font-medium text-gray-700 dark:text-zinc-300">
                  Reference / Note (Optional)
                </label>
                <input
                  id="pmtNote"
                  type="text"
                  placeholder="e.g. Check #450, Bank ref..."
                  value={note}
                  onChange={(e) => setNote(e.target.value)}
                  className="w-full h-10 px-3.5 rounded-xl bg-[#F9FAFB] dark:bg-[#121215] border border-gray-200/80 dark:border-[#27272a] text-[13px] font-medium text-gray-900 dark:text-white placeholder:font-normal placeholder:text-gray-400 dark:placeholder:text-zinc-500 focus:outline-none focus:border-blue-600 dark:focus:border-blue-500 focus:ring-2 focus:ring-blue-600/15 dark:focus:ring-blue-500/20 transition-colors"
                />
              </div>
            </div>

            {/* Footer Buttons */}
            <div className="pt-3 flex items-center justify-end gap-2.5 border-t border-gray-100 dark:border-[#27272a]">
              <button
                type="button"
                onClick={onClose}
                className="h-10 px-4 rounded-xl border border-gray-200 dark:border-[#27272a] bg-white dark:bg-[#18181b] text-[13px] font-medium text-gray-700 dark:text-zinc-300 hover:bg-gray-50 dark:hover:bg-[#222226] transition-colors"
              >
                Cancel
              </button>
              <button
                type="submit"
                disabled={isSubmitting}
                className="h-10 px-5 rounded-xl bg-blue-600 hover:bg-blue-700 text-white text-[13px] font-medium transition-colors disabled:opacity-50"
              >
                {isSubmitting ? 'Recording...' : 'Record Payment'}
              </button>
            </div>
          </form>
        ) : null}
      </div>

      {/* Overpayment Warning Dialog Modal */}
      {overpaymentWarning && createPortal(
        <div className="fixed inset-0 z-[60] w-full h-full m-0 flex items-center justify-center p-4 bg-black/50 backdrop-blur-xs overflow-y-auto">
          <div className="w-full max-w-md rounded-2xl border border-gray-200 dark:border-[#27272a] bg-white dark:bg-[#18181b] p-5 sm:p-6 space-y-4 my-auto overflow-hidden text-left shadow-none">
            <div className="flex items-center justify-between">
              <div className="flex items-center gap-2">
                <AlertTriangle className="h-4.5 w-4.5 text-amber-500 shrink-0" />
                <h3 className="text-[17px] leading-[22px] font-semibold text-gray-900 dark:text-white">
                  Overpayment Warning
                </h3>
              </div>
              <button
                type="button"
                onClick={() => setOverpaymentWarning(null)}
                className="text-gray-400 hover:text-gray-600 dark:hover:text-zinc-200 p-1 rounded-lg transition-colors"
                aria-label="Close"
              >
                <X className="h-5 w-5" strokeWidth={2} />
              </button>
            </div>

            <div className="space-y-4 text-left">
              <div className="rounded-xl border border-amber-200 dark:border-amber-500/20 bg-amber-50 dark:bg-amber-500/10 p-4 text-[13px] text-gray-700 dark:text-zinc-300 space-y-2">
                <p>
                  This payment of{' '}
                  <span className="font-semibold text-gray-900 dark:text-white">
                    {formatMoney({ amountMinor: overpaymentWarning.amountMinor, currency })}
                  </span>{' '}
                  exceeds the outstanding balance of this invoice by{' '}
                  <span className="font-semibold text-amber-600 dark:text-amber-400">
                    {overpaymentWarning.formattedDiff}
                  </span>.
                </p>
                <p>
                  Are you sure you want to record this overpayment? This will result in a negative invoice balance.
                </p>
              </div>

              <div className="pt-2 flex items-center justify-end gap-2.5 border-t border-gray-100 dark:border-[#27272a]">
                <button
                  type="button"
                  onClick={() => setOverpaymentWarning(null)}
                  className="h-10 px-4 rounded-xl border border-gray-200 dark:border-[#27272a] bg-white dark:bg-[#18181b] text-[13px] font-medium text-gray-700 dark:text-zinc-300 hover:bg-gray-50 dark:hover:bg-[#222226] transition-colors"
                >
                  Cancel
                </button>
                <button
                  type="button"
                  onClick={handleConfirmOverpayment}
                  disabled={isSubmitting}
                  className="h-10 px-5 rounded-xl bg-amber-600 hover:bg-amber-700 text-white text-[13px] font-medium transition-colors disabled:opacity-50"
                >
                  {isSubmitting ? 'Recording...' : 'Confirm Overpayment'}
                </button>
              </div>
            </div>
          </div>
        </div>,
        document.body
      )}
    </div>,
    document.body
  );
}

export default RecordPaymentModal;
