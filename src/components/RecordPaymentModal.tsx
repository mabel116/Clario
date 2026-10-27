'use client';

import React, { useState, useEffect, useMemo, useRef, useCallback } from 'react';
import { createPortal } from 'react-dom';
import { useInvoicesForClient, useInvoice } from '../lib/data/hooks';
import { PaymentRepo } from '../lib/data/payment';
import { formatMoney, parseMoneyInput, CURRENCIES } from '../lib/money';
import { DatePickerPopover } from './ui/DatePickerPopover';
import { Money } from './ui/money';
import { X, AlertTriangle, ChevronDown, Check } from 'lucide-react';
import { useToast } from './Toast';
import { cn } from '../lib/utils';

export interface RecordPaymentModalProps {
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

const PAYMENT_METHODS = [
  { value: 'cash', label: 'Cash' },
  { value: 'bank_transfer', label: 'Bank Transfer' },
  { value: 'card', label: 'Card' },
  { value: 'mobile_money', label: 'Mobile Money' },
  { value: 'other', label: 'Other' }
];

export function RecordPaymentModal({ clientId, invoiceId, onClose, onSuccess }: RecordPaymentModalProps) {
  const { showToast } = useToast();
  const [isMounted, setIsMounted] = useState(false);

  // Drag-to-dismiss state on mobile
  const dragStartY = useRef<number | null>(null);
  const [dragOffsetY, setDragOffsetY] = useState(0);

  // Form states
  const [selectedInvoiceId, setSelectedInvoiceId] = useState<string>('');
  const [amount, setAmount] = useState('');
  const [occurredAt, setOccurredAt] = useState(() => {
    const now = new Date();
    return `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, '0')}-${String(now.getDate()).padStart(2, '0')}`;
  });
  const [method, setMethod] = useState<string>('cash');
  const [note, setNote] = useState('');
  const [isSubmitting, setIsSubmitting] = useState(false);

  // Overpayment Warning state
  const [overpaymentWarning, setOverpaymentWarning] = useState<{
    amountMinor: number;
    formattedDiff: string;
  } | null>(null);

  // Dropdown states & refs
  const [isInvoiceDropdownOpen, setIsInvoiceDropdownOpen] = useState(false);
  const [isMethodDropdownOpen, setIsMethodDropdownOpen] = useState(false);
  const invoiceTriggerRef = useRef<HTMLButtonElement>(null);
  const invoicePopoverRef = useRef<HTMLDivElement>(null);
  const methodTriggerRef = useRef<HTMLButtonElement>(null);
  const methodPopoverRef = useRef<HTMLDivElement>(null);

  const [invoiceCoords, setInvoiceCoords] = useState<{ top: number; bottom: number; left: number; width: number; openUpward: boolean } | null>(null);
  const [methodCoords, setMethodCoords] = useState<{ top: number; bottom: number; left: number; width: number; openUpward: boolean } | null>(null);

  // Client invoices (when opened without specific invoiceId)
  const { data: clientInvoices, isLoading: isInvoicesLoading } = useInvoicesForClient(clientId);

  // Specific single invoice (when opened with invoiceId)
  const { data: singleInvoice, isLoading: isSingleInvoiceLoading } = useInvoice(invoiceId || '');

  useEffect(() => {
    setIsMounted(true);
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

  // Update invoice dropdown position
  const updateInvoiceCoords = useCallback(() => {
    if (!invoiceTriggerRef.current) return;
    const rect = invoiceTriggerRef.current.getBoundingClientRect();
    const estHeight = 200;
    const spaceBelow = window.innerHeight - rect.bottom;
    const spaceAbove = rect.top;
    const openUpward = spaceBelow < estHeight && spaceAbove > spaceBelow;
    setInvoiceCoords({
      top: rect.top,
      bottom: rect.bottom,
      left: rect.left,
      width: rect.width,
      openUpward,
    });
  }, []);

  // Update method dropdown position
  const updateMethodCoords = useCallback(() => {
    if (!methodTriggerRef.current) return;
    const rect = methodTriggerRef.current.getBoundingClientRect();
    const estHeight = 220;
    const spaceBelow = window.innerHeight - rect.bottom;
    const spaceAbove = rect.top;
    const openUpward = spaceBelow < estHeight && spaceAbove > spaceBelow;
    setMethodCoords({
      top: rect.top,
      bottom: rect.bottom,
      left: rect.left,
      width: rect.width,
      openUpward,
    });
  }, []);

  useEffect(() => {
    if (isInvoiceDropdownOpen) {
      updateInvoiceCoords();
      const handleReposition = () => updateInvoiceCoords();
      window.addEventListener('resize', handleReposition);
      window.addEventListener('scroll', handleReposition, true);
      return () => {
        window.removeEventListener('resize', handleReposition);
        window.removeEventListener('scroll', handleReposition, true);
      };
    }
  }, [isInvoiceDropdownOpen, updateInvoiceCoords]);

  useEffect(() => {
    if (isMethodDropdownOpen) {
      updateMethodCoords();
      const handleReposition = () => updateMethodCoords();
      window.addEventListener('resize', handleReposition);
      window.addEventListener('scroll', handleReposition, true);
      return () => {
        window.removeEventListener('resize', handleReposition);
        window.removeEventListener('scroll', handleReposition, true);
      };
    }
  }, [isMethodDropdownOpen, updateMethodCoords]);

  // Click outside listener for portaled dropdowns
  useEffect(() => {
    function handleClickOutside(event: MouseEvent) {
      const target = event.target as Node;
      if (
        isInvoiceDropdownOpen &&
        invoiceTriggerRef.current &&
        !invoiceTriggerRef.current.contains(target) &&
        invoicePopoverRef.current &&
        !invoicePopoverRef.current.contains(target)
      ) {
        setIsInvoiceDropdownOpen(false);
      }
      if (
        isMethodDropdownOpen &&
        methodTriggerRef.current &&
        !methodTriggerRef.current.contains(target) &&
        methodPopoverRef.current &&
        !methodPopoverRef.current.contains(target)
      ) {
        setIsMethodDropdownOpen(false);
      }
    }
    document.addEventListener('mousedown', handleClickOutside);
    return () => document.removeEventListener('mousedown', handleClickOutside);
  }, [isInvoiceDropdownOpen, isMethodDropdownOpen]);

  const handlePayFullBalance = () => {
    if (!activeInvoice) return;
    const balanceDue = activeInvoice.balanceDueMinor;
    setAmount(formatFullBalance(balanceDue, currency));
  };

  const executeRecordPayment = async (amountMinor: number) => {
    if (!activeInvoice) return;
    await PaymentRepo.record({
      invoice_id: activeInvoice.id,
      client_id: activeInvoice.client_id,
      amount_minor: amountMinor,
      currency,
      method: method || 'cash',
      note: note ? note.trim() : null,
      occurred_at: occurredAt || undefined,
    });
    if (onSuccess) {
      onSuccess();
    } else {
      showToast('Payment recorded successfully');
    }
    onClose();
  };

  const handleConfirmOverpayment = async () => {
    if (!overpaymentWarning || !activeInvoice) return;
    setIsSubmitting(true);
    try {
      await executeRecordPayment(overpaymentWarning.amountMinor);
      setOverpaymentWarning(null);
    } catch (err: unknown) {
      const msg = err instanceof Error ? err.message : 'Failed to record payment.';
      showToast(msg, 'info');
    } finally {
      setIsSubmitting(false);
    }
  };

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

      // Check for overpayment warning
      if (parsedMoney.amountMinor > activeInvoice.balanceDueMinor && !overpaymentWarning) {
        const diffMinor = parsedMoney.amountMinor - activeInvoice.balanceDueMinor;
        const formattedDiff = formatMoney({ amountMinor: diffMinor, currency });
        setOverpaymentWarning({
          amountMinor: parsedMoney.amountMinor,
          formattedDiff,
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
    <div
      onClick={onClose}
      className="fixed -inset-y-12 inset-x-0 z-[100] w-screen min-h-[100dvh] pt-12 pb-0 sm:py-12 bg-black/60 backdrop-blur-xs flex items-end sm:items-center justify-center px-0 sm:px-4"
    >
      <div
        onClick={(e) => e.stopPropagation()}
        style={dragOffsetY > 0 ? { transform: `translateY(${dragOffsetY}px)`, transition: 'none' } : undefined}
        className="w-full sm:max-w-[480px] max-h-[92dvh] sm:max-h-[85dvh] rounded-t-2xl sm:rounded-2xl border-t sm:border border-gray-200 dark:border-[#27272a] bg-white dark:bg-[#18181b] flex flex-col shadow-2xl overflow-hidden animate-in slide-in-from-bottom sm:zoom-in-95 duration-200"
      >
        {/* Mobile Drag Handle */}
        <div
          onTouchStart={(e) => {
            dragStartY.current = e.touches[0].clientY;
          }}
          onTouchMove={(e) => {
            if (dragStartY.current !== null) {
              const delta = Math.max(0, e.touches[0].clientY - dragStartY.current);
              setDragOffsetY(delta);
            }
          }}
          onTouchEnd={() => {
            if (dragOffsetY > 70) {
              onClose();
            }
            setDragOffsetY(0);
            dragStartY.current = null;
          }}
          className="sm:hidden pt-2.5 pb-1 cursor-grab active:cursor-grabbing shrink-0"
        >
          <div className="w-10 h-1 rounded-full bg-gray-300 dark:bg-zinc-700 mx-auto" />
        </div>

        {/* Clean Modal Header (No Leading Icon + Soft Boxed Close Button) */}
        <div
          onTouchStart={(e) => {
            dragStartY.current = e.touches[0].clientY;
          }}
          onTouchMove={(e) => {
            if (dragStartY.current !== null) {
              const delta = Math.max(0, e.touches[0].clientY - dragStartY.current);
              setDragOffsetY(delta);
            }
          }}
          onTouchEnd={() => {
            if (dragOffsetY > 70) {
              onClose();
            }
            setDragOffsetY(0);
            dragStartY.current = null;
          }}
          className="px-5 pt-2 pb-3.5 sm:px-6 sm:pt-5 sm:pb-4 border-b border-gray-100 dark:border-[#27272a] shrink-0"
        >
          <div className="flex items-start justify-between gap-3">
            <div>
              <h3 className="text-[17px] leading-[22px] font-semibold text-gray-900 dark:text-white">
                Record Manual Payment
              </h3>
              <p className="text-[13px] text-gray-500 dark:text-zinc-400 mt-0.5">
                Record a payment against this invoice.
              </p>
            </div>
            <button
              type="button"
              onClick={onClose}
              aria-label="Close modal"
              className="w-8 h-8 rounded-lg bg-gray-100 hover:bg-gray-200/80 dark:bg-[#222226] dark:hover:bg-[#2e2e34] text-gray-500 dark:text-zinc-400 flex items-center justify-center transition-colors shrink-0 cursor-pointer"
            >
              <X className="h-4 w-4" strokeWidth={2} />
            </button>
          </div>
        </div>

        {/* Modal Content */}
        {modalState === 'loading' ? (
          <div className="p-5 sm:p-6 space-y-4 font-sans text-left animate-pulse" aria-busy="true" aria-label="Loading invoice details">
            <div className="space-y-1.5">
              <div className="h-3.5 w-24 rounded bg-gray-200 dark:bg-[#27272a]" />
              <div className="h-10 w-full rounded-xl bg-gray-100 dark:bg-[#121215]" />
            </div>

            <div className="rounded-xl border border-gray-100 dark:border-[#27272a] bg-gray-50 dark:bg-[#121215] p-3.5 space-y-2">
              <div className="h-5 bg-gray-200 dark:bg-[#27272a] rounded" />
              <div className="h-5 bg-gray-200 dark:bg-[#27272a] rounded" />
              <div className="h-6 bg-gray-200 dark:bg-[#27272a] rounded" />
            </div>

            <div className="space-y-4">
              <div className="h-10 rounded-xl bg-gray-100 dark:bg-[#121215]" />
              <div className="h-10 rounded-xl bg-gray-100 dark:bg-[#121215]" />
            </div>

            <div className="pt-3 flex justify-end gap-2.5 border-t border-gray-100 dark:border-[#27272a]">
              <div className="h-10 w-20 rounded-xl bg-gray-200 dark:bg-[#27272a]" />
              <div className="h-10 w-32 rounded-xl bg-gray-200 dark:bg-[#27272a]" />
            </div>
          </div>
        ) : modalState === 'invoice_not_found' ? (
          <div className="p-6 space-y-4 text-center">
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
                className="h-10 px-4 rounded-xl border border-gray-200 dark:border-[#27272a] text-[13px] font-medium text-gray-700 dark:text-zinc-300 hover:bg-gray-50 dark:hover:bg-[#222226] transition-colors cursor-pointer"
              >
                Close
              </button>
            </div>
          </div>
        ) : modalState === 'no_active_invoices' ? (
          <div className="p-6 space-y-4 text-center">
            <div className="mx-auto flex h-12 w-12 items-center justify-center rounded-2xl bg-gray-100 dark:bg-[#222226] text-gray-400 dark:text-zinc-500">
              <AlertTriangle className="h-6 w-6" />
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
                className="h-10 px-4 rounded-xl border border-gray-200 dark:border-[#27272a] text-[13px] font-medium text-gray-700 dark:text-zinc-300 hover:bg-gray-50 dark:hover:bg-[#222226] transition-colors cursor-pointer"
              >
                Close
              </button>
            </div>
          </div>
        ) : activeInvoice ? (
          <form onSubmit={handleSubmit} className="flex flex-col flex-1 min-h-0 font-sans text-left">
            {/* Scrollable Form Body - Strictly Single-Column Stack (space-y-4) */}
            <div className="flex-1 overflow-y-auto overflow-x-hidden px-5 py-4 sm:px-6 sm:py-5 space-y-4">
              {/* 1. Invoice Selector (if client-triggered, not locked) */}
              {!invoiceId && (
                <div className="space-y-1.5">
                  <label htmlFor="invoiceSelect" className="block text-[12px] font-medium text-gray-700 dark:text-zinc-300">
                    Select Invoice *
                  </label>
                  <div className="relative">
                    <button
                      ref={invoiceTriggerRef}
                      id="invoiceSelect"
                      type="button"
                      onClick={() => setIsInvoiceDropdownOpen((prev) => !prev)}
                      className={cn(
                        'w-full h-10 px-3.5 rounded-xl bg-[#F9FAFB] dark:bg-[#121215] border text-[13px] font-medium text-gray-900 dark:text-white flex items-center justify-between gap-2 overflow-hidden text-left transition-colors cursor-pointer',
                        'focus:outline-none focus:border-blue-600 dark:focus:border-blue-500 focus:ring-2 focus:ring-blue-600/15 dark:focus:ring-blue-500/20',
                        isInvoiceDropdownOpen
                          ? 'border-gray-300 dark:border-zinc-700'
                          : 'border-gray-200/80 dark:border-[#27272a]'
                      )}
                    >
                      <span className="truncate min-w-0 flex-1 text-left">
                        {activeInvoice
                          ? `${activeInvoice.invoice_number} (${formatMoney({ amountMinor: activeInvoice.total_minor, currency: activeInvoice.currency })})`
                          : 'Select Invoice'}
                      </span>
                      <ChevronDown className="h-4 w-4 text-gray-400 shrink-0" />
                    </button>

                    {/* Portaled Invoice Dropdown */}
                    {isInvoiceDropdownOpen && invoiceCoords && typeof document !== 'undefined' && createPortal(
                      <div
                        ref={invoicePopoverRef}
                        data-popover="true"
                        style={{
                          position: 'fixed',
                          zIndex: 160,
                          width: `${invoiceCoords.width}px`,
                          minWidth: '250px',
                          left: `${Math.max(8, Math.min(invoiceCoords.left, window.innerWidth - invoiceCoords.width - 8))}px`,
                          ...(invoiceCoords.openUpward
                            ? { bottom: `${window.innerHeight - invoiceCoords.top + 6}px` }
                            : { top: `${invoiceCoords.bottom + 6}px` }),
                        }}
                        className="rounded-xl border border-gray-200 dark:border-[#27272a] bg-white dark:bg-[#18181b] p-1.5 shadow-2xl max-h-[220px] overflow-y-auto space-y-0.5 animate-in fade-in duration-100"
                      >
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
                                'w-full px-3 py-2 rounded-lg text-left text-[13px] flex items-center justify-between gap-2 transition-colors cursor-pointer',
                                isSelected
                                  ? 'bg-gray-100 dark:bg-[#222226] text-gray-900 dark:text-white font-medium'
                                  : 'text-gray-700 dark:text-zinc-300 hover:bg-gray-50 dark:hover:bg-[#222226]'
                              )}
                            >
                              <span className="truncate min-w-0 flex-1">
                                {inv.invoice_number} ({formatMoney({ amountMinor: inv.total_minor, currency: inv.currency })})
                              </span>
                              {isSelected && (
                                <Check className="h-4 w-4 text-blue-600 dark:text-blue-400 shrink-0" />
                              )}
                            </button>
                          );
                        })}
                      </div>,
                      document.body
                    )}
                  </div>
                </div>
              )}

              {/* 2. Responsive Financial Summary Box */}
              {/* Desktop/Web (hidden sm:grid sm:grid-cols-3) */}
              <div className="hidden sm:grid sm:grid-cols-3 sm:gap-3 rounded-xl bg-[#F9FAFB] dark:bg-[#121215] border border-gray-200/80 dark:border-[#27272a] p-3.5 text-center">
                <div>
                  <div className="text-[11px] font-medium uppercase tracking-wider text-gray-500 dark:text-zinc-400">
                    Invoice Total
                  </div>
                  <div className="mt-1 text-[15px] font-semibold text-gray-900 dark:text-white tabular-nums">
                    <Money amountMinor={activeInvoice.total_minor} currency={currency} />
                  </div>
                </div>
                <div>
                  <div className="text-[11px] font-medium uppercase tracking-wider text-gray-500 dark:text-zinc-400">
                    Paid to Date
                  </div>
                  <div className="mt-1 text-[15px] font-semibold text-emerald-600 dark:text-emerald-400 tabular-nums">
                    <Money amountMinor={activeInvoice.amountPaidMinor} currency={currency} />
                  </div>
                </div>
                <div>
                  <div className="text-[11px] font-medium uppercase tracking-wider text-gray-500 dark:text-zinc-400">
                    Balance Due
                  </div>
                  <div className="mt-1 text-[15px] font-bold text-gray-900 dark:text-white tabular-nums">
                    <Money amountMinor={activeInvoice.balanceDueMinor} currency={currency} />
                  </div>
                </div>
              </div>

              {/* Mobile (< sm:) 3-Row Horizontal Stacked Receipt */}
              <div className="sm:hidden rounded-xl bg-[#F9FAFB] dark:bg-[#121215] border border-gray-200/80 dark:border-[#27272a] p-3.5 space-y-2 text-left">
                <div className="flex items-center justify-between text-[12px]">
                  <span className="text-gray-500 dark:text-zinc-400">Invoice Total</span>
                  <Money amountMinor={activeInvoice.total_minor} className="font-semibold text-gray-900 dark:text-white tabular-nums" currency={currency} />
                </div>
                <div className="flex items-center justify-between text-[12px]">
                  <span className="text-gray-500 dark:text-zinc-400">Paid to Date</span>
                  <span className="font-semibold text-emerald-600 dark:text-emerald-400 tabular-nums">
                    -<Money amountMinor={activeInvoice.amountPaidMinor} currency={currency} />
                  </span>
                </div>
                <div className="border-t border-gray-200/80 dark:border-[#27272a] pt-2 flex items-center justify-between text-[13px]">
                  <span className="font-semibold text-gray-900 dark:text-white">Balance Due</span>
                  <Money amountMinor={activeInvoice.balanceDueMinor} className="font-bold text-gray-900 dark:text-white tabular-nums" currency={currency} />
                </div>
              </div>

              {/* 3. Payment Amount Field (100% full width) */}
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
                      className="bg-blue-50 hover:bg-blue-100 text-blue-600 dark:bg-blue-500/10 dark:hover:bg-blue-500/20 dark:text-blue-400 border border-blue-200 dark:border-blue-500/20 px-2 py-0.5 rounded-lg text-[11px] font-medium transition-colors cursor-pointer"
                    >
                      Full
                    </button>
                  </div>
                </div>
              </div>

              {/* 4. Payment Date Field (100% full width with DatePickerPopover) */}
              <div className="space-y-1.5">
                <label htmlFor="pmtDate" className="block text-[12px] font-medium text-gray-700 dark:text-zinc-300">
                  Payment Date
                </label>
                <DatePickerPopover
                  id="pmtDate"
                  value={occurredAt}
                  onChange={(d) => setOccurredAt(d)}
                  placement="auto"
                />
              </div>

              {/* 5. Payment Method Field (100% full width, Portaled, Zero Scrollbar on 5 methods) */}
              <div className="space-y-1.5">
                <label htmlFor="pmtMethod" className="block text-[12px] font-medium text-gray-700 dark:text-zinc-300">
                  Payment Method *
                </label>
                <div className="relative">
                  <button
                    ref={methodTriggerRef}
                    id="pmtMethod"
                    type="button"
                    onClick={() => setIsMethodDropdownOpen((prev) => !prev)}
                    className={cn(
                      'w-full h-10 px-3.5 rounded-xl bg-[#F9FAFB] dark:bg-[#121215] border text-[13px] font-medium text-gray-900 dark:text-white flex items-center justify-between gap-2 overflow-hidden text-left transition-colors cursor-pointer',
                      'focus:outline-none focus:border-blue-600 dark:focus:border-blue-500 focus:ring-2 focus:ring-blue-600/15 dark:focus:ring-blue-500/20',
                      isMethodDropdownOpen
                        ? 'border-gray-300 dark:border-zinc-700'
                        : 'border-gray-200/80 dark:border-[#27272a]'
                    )}
                  >
                    <span className="truncate min-w-0 flex-1 text-left">
                      {PAYMENT_METHODS.find((m) => m.value === method)?.label || 'Cash'}
                    </span>
                    <ChevronDown className="h-4 w-4 text-gray-400 shrink-0" />
                  </button>

                  {/* Portaled Method Dropdown (Zero internal scrollbar for 5 items) */}
                  {isMethodDropdownOpen && methodCoords && typeof document !== 'undefined' && createPortal(
                    <div
                      ref={methodPopoverRef}
                      data-popover="true"
                      style={{
                        position: 'fixed',
                        zIndex: 160,
                        width: `${methodCoords.width}px`,
                        minWidth: '250px',
                        left: `${Math.max(8, Math.min(methodCoords.left, window.innerWidth - methodCoords.width - 8))}px`,
                        ...(methodCoords.openUpward
                          ? { bottom: `${window.innerHeight - methodCoords.top + 6}px` }
                          : { top: `${methodCoords.bottom + 6}px` }),
                      }}
                      className="rounded-xl border border-gray-200 dark:border-[#27272a] bg-white dark:bg-[#18181b] p-1.5 shadow-2xl space-y-0.5 animate-in fade-in duration-100"
                    >
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
                              'w-full px-3 py-2 rounded-lg text-left text-[13px] flex items-center justify-between gap-2 transition-colors cursor-pointer',
                              isSelected
                                ? 'bg-gray-100 dark:bg-[#222226] text-gray-900 dark:text-white font-medium'
                                : 'text-gray-700 dark:text-zinc-300 hover:bg-gray-50 dark:hover:bg-[#222226]'
                            )}
                          >
                            <span className="truncate min-w-0 flex-1">{m.label}</span>
                            {isSelected && (
                              <Check className="h-4 w-4 text-blue-600 dark:text-blue-400 shrink-0" />
                            )}
                          </button>
                        );
                      })}
                    </div>,
                    document.body
                  )}
                </div>
              </div>

              {/* 6. Reference / Note (Optional, 100% full width) */}
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

            {/* Pinned Safe-Area Footer (Equal 50/50 on mobile, h-11 sm:h-10) */}
            <div className="shrink-0 px-5 pt-3.5 pb-[calc(1.25rem+env(safe-area-inset-bottom,0px))] sm:px-6 sm:py-4 border-t border-gray-100 dark:border-[#27272a] bg-white dark:bg-[#18181b] grid grid-cols-2 sm:flex sm:items-center sm:justify-end gap-3">
              <button
                type="button"
                onClick={onClose}
                className="h-11 sm:h-10 w-full sm:w-auto px-4 rounded-xl border border-gray-200 dark:border-[#27272a] bg-white dark:bg-[#18181b] text-[13px] font-medium text-gray-700 dark:text-zinc-300 hover:bg-gray-50 dark:hover:bg-[#222226] transition-colors cursor-pointer inline-flex items-center justify-center"
              >
                Cancel
              </button>
              <button
                type="submit"
                disabled={isSubmitting}
                className="h-11 sm:h-10 w-full sm:w-auto px-5 rounded-xl bg-blue-600 hover:bg-blue-700 text-white text-[13px] font-medium transition-colors disabled:opacity-50 cursor-pointer inline-flex items-center justify-center"
              >
                {isSubmitting ? 'Recording...' : 'Record Payment'}
              </button>
            </div>
          </form>
        ) : null}
      </div>

      {/* Overpayment Warning Dialog Modal */}
      {overpaymentWarning && createPortal(
        <div
          onClick={() => setOverpaymentWarning(null)}
          className="fixed -inset-y-12 inset-x-0 z-[110] w-screen min-h-[100dvh] pt-12 pb-0 sm:py-12 bg-black/60 backdrop-blur-xs flex items-end sm:items-center justify-center px-0 sm:px-4"
        >
          <div
            onClick={(e) => e.stopPropagation()}
            className="w-full sm:max-w-md max-h-[92dvh] sm:max-h-[85dvh] rounded-t-2xl sm:rounded-2xl border-t sm:border border-gray-200 dark:border-[#27272a] bg-white dark:bg-[#18181b] flex flex-col shadow-2xl overflow-hidden animate-in slide-in-from-bottom sm:zoom-in-95 duration-200"
          >
            <div className="px-5 pt-4 pb-3 sm:px-6 sm:pt-5 sm:pb-4 border-b border-gray-100 dark:border-[#27272a] flex items-start justify-between gap-3 shrink-0">
              <div className="flex items-center gap-2">
                <AlertTriangle className="h-5 w-5 text-amber-500 shrink-0" />
                <h4 className="text-[17px] leading-[22px] font-semibold text-gray-900 dark:text-white">
                  Overpayment Detected
                </h4>
              </div>
              <button
                type="button"
                onClick={() => setOverpaymentWarning(null)}
                className="w-8 h-8 rounded-lg bg-gray-100 hover:bg-gray-200/80 dark:bg-[#222226] dark:hover:bg-[#2e2e34] text-gray-500 dark:text-zinc-400 flex items-center justify-center transition-colors shrink-0 cursor-pointer"
                aria-label="Close"
              >
                <X className="h-4 w-4" strokeWidth={2} />
              </button>
            </div>

            <div className="flex-1 overflow-y-auto px-5 py-4 sm:px-6 sm:py-5 space-y-3 font-sans text-left">
              <p className="text-[13px] text-gray-600 dark:text-zinc-300 leading-relaxed">
                The entered amount exceeds the current outstanding balance on this invoice by{' '}
                <strong className="text-gray-900 dark:text-white font-semibold">
                  {overpaymentWarning.formattedDiff}
                </strong>.
              </p>
              <div className="rounded-xl border border-amber-200 dark:border-amber-500/20 bg-amber-50 dark:bg-amber-500/10 p-3 text-[12px] text-amber-800 dark:text-amber-300">
                Are you sure you want to record this overpayment?
              </div>
            </div>

            <div className="shrink-0 px-5 pt-3.5 pb-[calc(1.25rem+env(safe-area-inset-bottom,0px))] sm:px-6 sm:py-4 border-t border-gray-100 dark:border-[#27272a] bg-white dark:bg-[#18181b] grid grid-cols-2 sm:flex sm:items-center sm:justify-end gap-3">
              <button
                type="button"
                onClick={() => setOverpaymentWarning(null)}
                className="h-11 sm:h-10 w-full sm:w-auto px-4 rounded-xl border border-gray-200 dark:border-[#27272a] bg-white dark:bg-[#18181b] text-[13px] font-medium text-gray-700 dark:text-zinc-300 hover:bg-gray-50 dark:hover:bg-[#222226] transition-colors cursor-pointer inline-flex items-center justify-center"
              >
                Cancel
              </button>
              <button
                type="button"
                onClick={handleConfirmOverpayment}
                disabled={isSubmitting}
                className="h-11 sm:h-10 w-full sm:w-auto px-5 rounded-xl bg-amber-600 hover:bg-amber-700 text-white text-[13px] font-medium transition-colors disabled:opacity-50 cursor-pointer inline-flex items-center justify-center"
              >
                {isSubmitting ? 'Recording...' : 'Confirm Overpayment'}
              </button>
            </div>
          </div>
        </div>,
        document.body
      )}
    </div>,
    document.body
  );
}
