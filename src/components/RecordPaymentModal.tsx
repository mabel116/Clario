'use client';

import React, { useState, useEffect, useMemo } from 'react';
import { useInvoicesForClient, useInvoice } from '../lib/data/hooks';
import { PaymentRepo } from '../lib/data/payment';
import { formatMoney, parseMoneyInput, CURRENCIES } from '../lib/money';
import { X, CreditCard, AlertTriangle } from 'lucide-react';

interface RecordPaymentModalProps {
  clientId: string;
  invoiceId?: string;
  onClose: () => void;
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

export function RecordPaymentModal({ clientId, invoiceId, onClose }: RecordPaymentModalProps) {
  // Queries
  const { data: clientInvoices, isLoading: isInvoicesLoading } = useInvoicesForClient(clientId);
  const { data: singleInvoice, isLoading: isSingleInvoiceLoading } = useInvoice(invoiceId || '');

  // States
  const [selectedInvoiceId, setSelectedInvoiceId] = useState<string>('');
  const [amount, setAmount] = useState<string>('');
  const [occurredAt, setOccurredAt] = useState<string>('');
  const [method, setMethod] = useState<string>('cash');
  const [note, setNote] = useState<string>('');
  const [isSubmitting, setIsSubmitting] = useState<boolean>(false);
  const [overpaymentWarning, setOverpaymentWarning] = useState<{ amountMinor: number; formattedDiff: string } | null>(null);

  // Set default occurred_at to today
  useEffect(() => {
    const today = new Date().toISOString().split('T')[0];
    setOccurredAt(today);
  }, []);

  // Filter invoices to active ones (non-draft, non-void)
  const activeInvoices = useMemo(() => {
    if (!clientInvoices) return [];
    return clientInvoices.filter(
      (inv) => inv.displayStatus !== 'draft' && inv.displayStatus !== 'void'
    );
  }, [clientInvoices]);

  // Synchronously derive effective target invoice ID:
  // Explicit invoiceId prop takes precedence; otherwise user-selected ID (if still in active list),
  // defaulting immediately to the first active invoice without mount effect delay.
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
      alert(msg);
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
      alert('Please enter a valid amount greater than zero.');
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
      alert(msg);
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

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-slate-950/80 backdrop-blur-sm animate-fade-in">
      <div className="w-full max-w-lg rounded-3xl border border-slate-900 bg-slate-950 p-6 shadow-2xl space-y-6">
        
        {/* Header */}
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-2">
            <CreditCard className="h-5 w-5 text-indigo-400" />
            <h3 className="text-lg font-bold text-white">Record Manual Payment</h3>
          </div>
          <button onClick={onClose} className="p-1 rounded-lg text-slate-500 hover:text-white transition">
            <X className="h-5 w-5" />
          </button>
        </div>

        {/* Body Content */}
        {modalState === 'loading' ? (
          /* Full-form structured skeleton preventing vertical layout shifts (ADR 036 & ADR 041) */
          <div className="space-y-4 font-sans text-left animate-pulse" aria-busy="true" aria-label="Loading invoice details">
            {/* Invoice Selector Skeleton */}
            <div className="space-y-1.5">
              <div className="h-3.5 w-24 rounded bg-slate-800/60" />
              <div className="h-10 w-full rounded-lg border border-slate-800/60 bg-slate-900/40" />
            </div>

            {/* Financial Summary Panel Skeleton */}
            <div className="rounded-2xl border border-slate-900 bg-slate-900/10 p-4 grid grid-cols-3 gap-2 text-center">
              <div className="space-y-1.5 flex flex-col items-center">
                <div className="h-2.5 w-16 rounded bg-slate-800/60" />
                <div className="h-4 w-20 rounded bg-slate-800/80" />
              </div>
              <div className="space-y-1.5 flex flex-col items-center">
                <div className="h-2.5 w-16 rounded bg-slate-800/60" />
                <div className="h-4 w-20 rounded bg-slate-800/80" />
              </div>
              <div className="space-y-1.5 flex flex-col items-center">
                <div className="h-2.5 w-16 rounded bg-slate-800/60" />
                <div className="h-4 w-20 rounded bg-slate-800/80" />
              </div>
            </div>

            {/* Input Fields Skeleton (Row 1: Amount & Date) */}
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
              <div className="space-y-1.5">
                <div className="h-3.5 w-28 rounded bg-slate-800/60" />
                <div className="h-10 w-full rounded-lg border border-slate-800/60 bg-slate-900/40" />
              </div>
              <div className="space-y-1.5">
                <div className="h-3.5 w-20 rounded bg-slate-800/60" />
                <div className="h-10 w-full rounded-lg border border-slate-800/60 bg-slate-900/40" />
              </div>
            </div>

            {/* Input Fields Skeleton (Row 2: Method & Note) */}
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
              <div className="space-y-1.5">
                <div className="h-3.5 w-24 rounded bg-slate-800/60" />
                <div className="h-10 w-full rounded-lg border border-slate-800/60 bg-slate-900/40" />
              </div>
              <div className="space-y-1.5">
                <div className="h-3.5 w-36 rounded bg-slate-800/60" />
                <div className="h-10 w-full rounded-lg border border-slate-800/60 bg-slate-900/40" />
              </div>
            </div>

            {/* Footer Buttons Skeleton */}
            <div className="pt-4 flex justify-end gap-3 border-t border-slate-900">
              <div className="h-10 w-20 rounded-lg border border-slate-800/60 bg-slate-900/40" />
              <div className="h-10 w-32 rounded-lg bg-indigo-900/40 border border-indigo-500/20" />
            </div>
          </div>
        ) : modalState === 'invoice_not_found' ? (
          /* Explicit missing invoice view */
          <div className="space-y-6 text-center py-4">
            <div className="mx-auto flex h-12 w-12 items-center justify-center rounded-2xl bg-amber-500/10 border border-amber-500/20 text-amber-400">
              <AlertTriangle className="h-6 w-6" />
            </div>
            <div className="space-y-1">
              <h4 className="text-base font-bold text-white">Invoice Record Not Found</h4>
              <p className="text-xs text-slate-400 max-w-sm mx-auto">
                The requested invoice could not be found in local storage. It may have been deleted or not synced yet.
              </p>
            </div>
            <div className="pt-2 flex justify-center border-t border-slate-900">
              <button
                type="button"
                onClick={onClose}
                className="px-4 py-2.5 rounded-lg border border-slate-800 text-sm font-semibold text-slate-300 hover:text-white hover:bg-slate-900 transition"
              >
                Close
              </button>
            </div>
          </div>
        ) : modalState === 'no_active_invoices' ? (
          /* Client has no active invoices */
          <div className="space-y-6 text-center py-4">
            <div className="mx-auto flex h-12 w-12 items-center justify-center rounded-2xl bg-slate-900 border border-slate-800 text-slate-400">
              <CreditCard className="h-6 w-6" />
            </div>
            <div className="space-y-1">
              <h4 className="text-base font-bold text-white">No Active Invoices</h4>
              <p className="text-xs text-slate-400 max-w-sm mx-auto">
                This client has no active (non-draft, non-void) invoices to record payment against. Please create and send an invoice first.
              </p>
            </div>
            <div className="pt-2 flex justify-center border-t border-slate-900">
              <button
                type="button"
                onClick={onClose}
                className="px-4 py-2.5 rounded-lg border border-slate-800 text-sm font-semibold text-slate-300 hover:text-white hover:bg-slate-900 transition"
              >
                Close
              </button>
            </div>
          </div>
        ) : activeInvoice ? (
          /* Live form with guaranteed non-null activeInvoice */
          <form onSubmit={handleSubmit} className="space-y-4 font-sans text-left">
            
            {/* Invoice Selector (if client-triggered) */}
            {!invoiceId && (
              <div className="space-y-1.5">
                <label htmlFor="invoiceSelect" className="text-xs font-semibold text-slate-400">Select Invoice *</label>
                <select
                  id="invoiceSelect"
                  value={effectiveInvoiceId}
                  onChange={(e) => setSelectedInvoiceId(e.target.value)}
                  className="block w-full rounded-lg border border-slate-800 bg-slate-900/40 py-2.5 px-3 text-sm text-white focus:border-indigo-500 focus:outline-none transition"
                >
                  {activeInvoices.map((inv) => (
                    <option key={inv.id} value={inv.id} className="bg-slate-950">
                      {inv.invoice_number} ({formatMoney({ amountMinor: inv.total_minor, currency: inv.currency })})
                    </option>
                  ))}
                </select>
              </div>
            )}

            {/* Context Panel */}
            <div className="rounded-2xl border border-slate-900 bg-slate-900/10 p-4 grid grid-cols-3 gap-2 text-center text-xs">
              <div>
                <span className="block text-slate-500 uppercase font-semibold text-[10px]">Invoice Total</span>
                <span className="block text-white font-extrabold mt-1">
                  {formatMoney({ amountMinor: activeInvoice.total_minor, currency })}
                </span>
              </div>
              <div>
                <span className="block text-slate-500 uppercase font-semibold text-[10px]">Paid to Date</span>
                <span className="block text-green-400 font-extrabold mt-1">
                  {formatMoney({ amountMinor: activeInvoice.amountPaidMinor, currency })}
                </span>
              </div>
              <div>
                <span className="block text-slate-500 uppercase font-semibold text-[10px]">Balance Due</span>
                <span className="block text-white font-extrabold mt-1">
                  {formatMoney({ amountMinor: activeInvoice.balanceDueMinor, currency })}
                </span>
              </div>
            </div>

            {/* Payment Fields */}
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
              {/* Amount Field */}
              <div className="space-y-1.5">
                <label htmlFor="pmtAmount" className="text-xs font-semibold text-slate-400">Payment Amount *</label>
                <div className="relative rounded-lg border border-slate-800 bg-slate-900/40 focus-within:border-indigo-500 transition">
                  <input
                    id="pmtAmount"
                    type="text"
                    required
                    placeholder="0.00"
                    value={amount}
                    onChange={(e) => setAmount(e.target.value)}
                    className="block w-full bg-transparent py-2.5 pl-3 pr-20 text-sm text-white focus:outline-none"
                  />
                  <div className="absolute inset-y-0 right-0 flex items-center pr-2 gap-1.5">
                    <span className="text-xs font-bold text-slate-500 uppercase">{currency}</span>
                    <button
                      type="button"
                      onClick={handlePayFullBalance}
                      className="bg-indigo-600/10 hover:bg-indigo-600/20 text-indigo-400 border border-indigo-500/20 px-1.5 py-0.5 rounded text-[10px] font-bold transition"
                    >
                      Full
                    </button>
                  </div>
                </div>
              </div>

              {/* Date Field */}
              <div className="space-y-1.5">
                <label htmlFor="pmtDate" className="text-xs font-semibold text-slate-400">Payment Date</label>
                <input
                  id="pmtDate"
                  type="date"
                  value={occurredAt}
                  onChange={(e) => setOccurredAt(e.target.value)}
                  className="block w-full rounded-lg border border-slate-800 bg-slate-900/40 py-2 px-3 text-sm text-white focus:border-indigo-500 focus:outline-none transition"
                />
              </div>
            </div>

            <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
              {/* Method Field */}
              <div className="space-y-1.5">
                <label htmlFor="pmtMethod" className="text-xs font-semibold text-slate-400">Payment Method *</label>
                <select
                  id="pmtMethod"
                  value={method}
                  onChange={(e) => setMethod(e.target.value)}
                  className="block w-full rounded-lg border border-slate-800 bg-slate-900/40 py-2.5 px-3 text-sm text-white focus:border-indigo-500 focus:outline-none transition"
                >
                  <option value="cash" className="bg-slate-950">Cash</option>
                  <option value="bank_transfer" className="bg-slate-950">Bank Transfer</option>
                  <option value="card" className="bg-slate-950">Card</option>
                  <option value="mobile_money" className="bg-slate-950">Mobile Money</option>
                  <option value="other" className="bg-slate-950">Other</option>
                </select>
              </div>

              {/* Note Field */}
              <div className="space-y-1.5">
                <label htmlFor="pmtNote" className="text-xs font-semibold text-slate-400">Reference / Note (Optional)</label>
                <input
                  id="pmtNote"
                  type="text"
                  placeholder="e.g. Check #450, Bank reference..."
                  value={note}
                  onChange={(e) => setNote(e.target.value)}
                  className="block w-full rounded-lg border border-slate-800 bg-slate-900/40 py-2.5 px-3 text-sm text-white focus:border-indigo-500 focus:outline-none transition"
                />
              </div>
            </div>

            {/* Footer Buttons */}
            <div className="pt-4 flex justify-end gap-3 border-t border-slate-900">
              <button
                type="button"
                onClick={onClose}
                className="px-4 py-2.5 rounded-lg border border-slate-800 text-sm font-semibold text-slate-400 hover:text-white transition"
              >
                Cancel
              </button>
              <button
                type="submit"
                disabled={isSubmitting}
                className="px-4 py-2.5 rounded-lg bg-indigo-600 hover:bg-indigo-500 disabled:opacity-50 text-sm font-semibold text-white transition shadow-lg shadow-indigo-600/20"
              >
                {isSubmitting ? 'Recording...' : 'Record Payment'}
              </button>
            </div>
          </form>
        ) : null}
      </div>

      {/* Overpayment Warning Dialog Modal */}
      {overpaymentWarning && (
        <div className="fixed inset-0 z-[60] flex items-center justify-center p-4 bg-slate-950/80 backdrop-blur-sm animate-fade-in">
          <div className="w-full max-w-md rounded-3xl border border-slate-900 bg-slate-950 p-6 shadow-2xl space-y-6">
            <div className="flex items-center justify-between">
              <div className="flex items-center gap-2">
                <AlertTriangle className="h-5 w-5 text-yellow-400" />
                <h3 className="text-lg font-bold text-white">Overpayment Warning</h3>
              </div>
              <button
                onClick={() => setOverpaymentWarning(null)}
                className="p-1 rounded-lg text-slate-500 hover:text-white transition"
              >
                <X className="h-5 w-5" />
              </button>
            </div>

            <div className="space-y-4 text-left">
              <div className="rounded-2xl border border-yellow-950/20 bg-yellow-950/5 p-4 text-xs text-slate-400 space-y-2">
                <p>
                  This payment of{' '}
                  <span className="font-extrabold text-white">
                    {formatMoney({ amountMinor: overpaymentWarning.amountMinor, currency })}
                  </span>{' '}
                  exceeds the outstanding balance of this invoice by{' '}
                  <span className="font-extrabold text-yellow-400">
                    {overpaymentWarning.formattedDiff}
                  </span>.
                </p>
                <p>
                  Are you sure you want to record this overpayment? This will result in a negative invoice balance.
                </p>
              </div>

              <div className="pt-2 flex justify-end gap-3 border-t border-slate-900">
                <button
                  type="button"
                  onClick={() => setOverpaymentWarning(null)}
                  className="px-4 py-2.5 rounded-lg border border-slate-800 text-sm font-semibold text-slate-400 hover:text-white transition"
                >
                  Cancel
                </button>
                <button
                  type="button"
                  onClick={handleConfirmOverpayment}
                  disabled={isSubmitting}
                  className="px-4 py-2.5 rounded-lg bg-yellow-600 hover:bg-yellow-500 disabled:opacity-50 text-sm font-semibold text-white transition shadow-lg shadow-yellow-600/20"
                >
                  {isSubmitting ? 'Recording...' : 'Confirm Overpayment'}
                </button>
              </div>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}

// Default export if needed, or keeping it named
export default RecordPaymentModal;
