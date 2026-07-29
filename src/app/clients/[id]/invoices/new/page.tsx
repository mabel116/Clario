'use client';

import React, { useState, useEffect, useMemo } from 'react';
import { useRouter, useParams } from 'next/navigation';
import { ProtectedRoute } from '../../../../../components/ProtectedRoute';
import { AppShell } from '../../../../../components/AppShell';
import { useClient, useProfile } from '../../../../../lib/data/hooks';
import { InvoiceRepo } from '../../../../../lib/data/invoice';
import { formatMoney, parseMoneyInput, multiplyMinor } from '../../../../../lib/money';
import { ArrowUp, ArrowDown, Trash2, Plus, ArrowLeft } from 'lucide-react';

export default function NewInvoicePage() {
  const params = useParams();
  const clientId = params?.id as string;

  return (
    <ProtectedRoute>
      <AppShell>
        <NewInvoiceForm clientId={clientId} />
      </AppShell>
    </ProtectedRoute>
  );
}

function NewInvoiceForm({ clientId }: { clientId: string }) {
  const router = useRouter();

  // Queries
  const { data: client, isLoading: isClientLoading } = useClient(clientId);
  const { data: profile } = useProfile();

  // Form states
  const [invoiceNumber, setInvoiceNumber] = useState('');
  const [issueDate, setIssueDate] = useState('');
  const [dueDate, setDueDate] = useState('');
  const [notes, setNotes] = useState('');
  const [internalNote, setInternalNote] = useState('');
  const [lineItems, setLineItems] = useState<Array<{
    id: string;
    description: string;
    quantity: number;
    unitPrice: string; // major unit text input
  }>>([
    { id: crypto.randomUUID(), description: '', quantity: 1, unitPrice: '' }
  ]);

  // Loading suggestion on mount
  useEffect(() => {
    InvoiceRepo.suggestNextNumber()
      .then((num) => setInvoiceNumber(num))
      .catch((err) => console.error('Failed to suggest invoice number:', err));

    // Default dates
    const today = new Date();
    const todayStr = today.toISOString().split('T')[0];
    setIssueDate(todayStr);

    const twoWeeksLater = new Date(today.getTime() + 14 * 24 * 60 * 60 * 1000);
    setDueDate(twoWeeksLater.toISOString().split('T')[0]);
  }, []);

  // Set default due date when issue date shifts
  const handleIssueDateChange = (val: string) => {
    setIssueDate(val);
    if (val) {
      const baseDate = new Date(val);
      if (!isNaN(baseDate.getTime())) {
        const nextDueDate = new Date(baseDate.getTime() + 14 * 24 * 60 * 60 * 1000);
        setDueDate(nextDueDate.toISOString().split('T')[0]);
      }
    }
  };

  // Fixed currency resolution
  const currency = useMemo(() => {
    if (client?.default_currency) return client.default_currency.toUpperCase();
    if (profile?.default_currency) return profile.default_currency.toUpperCase();
    return 'USD';
  }, [client, profile]);

  // Computes invoice totals in real-time
  const totals = useMemo(() => {
    let subtotalMinor = 0;
    const computedItems = lineItems.map((item) => {
      let unitPriceMinor = 0;
      try {
        if (item.unitPrice.trim()) {
          unitPriceMinor = parseMoneyInput(item.unitPrice, currency).amountMinor;
        }
      } catch (e) {
        // invalid float format is ignored for real-time aggregation
      }
      const lineTotal = multiplyMinor(unitPriceMinor, item.quantity);
      subtotalMinor += lineTotal;
      return {
        id: item.id,
        lineTotal
      };
    });

    return {
      subtotalMinor,
      items: computedItems
    };
  }, [lineItems, currency]);

  // Line item handlers
  const handleAddLineItem = () => {
    setLineItems([
      ...lineItems,
      { id: crypto.randomUUID(), description: '', quantity: 1, unitPrice: '' }
    ]);
  };

  const handleRemoveLineItem = (id: string) => {
    if (lineItems.length === 1) {
      alert('An invoice must have at least one line item.');
      return;
    }
    setLineItems(lineItems.filter(item => item.id !== id));
  };

  const handleUpdateLineItem = (id: string, field: 'description' | 'quantity' | 'unitPrice', value: any) => {
    setLineItems(lineItems.map((item) => {
      if (item.id !== id) return item;
      return {
        ...item,
        [field]: value
      };
    }));
  };

  const handleMoveLineItem = (index: number, direction: 'up' | 'down') => {
    const nextIndex = direction === 'up' ? index - 1 : index + 1;
    if (nextIndex < 0 || nextIndex >= lineItems.length) return;

    const copy = [...lineItems];
    const current = copy[index];
    copy[index] = copy[nextIndex];
    copy[nextIndex] = current;
    setLineItems(copy);
  };

  // Submit form handler
  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();

    if (!invoiceNumber.trim()) {
      alert('Invoice number is required.');
      return;
    }

    // Validate line items
    for (let i = 0; i < lineItems.length; i++) {
      const item = lineItems[i];
      if (!item.description.trim()) {
        alert(`Line item #${i + 1} must have a description.`);
        return;
      }
      if (item.quantity <= 0) {
        alert(`Line item #${i + 1} quantity must be greater than zero.`);
        return;
      }
      if (!item.unitPrice.trim() || isNaN(parseFloat(item.unitPrice))) {
        alert(`Line item #${i + 1} must have a valid unit price.`);
        return;
      }
    }

    try {
      // Soft duplicate number warning
      const isDup = await InvoiceRepo.isNumberDuplicate(invoiceNumber);
      if (isDup) {
        const proceed = confirm(`Warning: An invoice with number "${invoiceNumber.trim()}" already exists. Do you want to use it anyway?`);
        if (!proceed) return;
      }

      // 1. Create invoice header
      const newInvoiceId = await InvoiceRepo.create({
        client_id: clientId,
        currency,
        invoice_number: invoiceNumber,
        notes: notes || null,
        internal_note: internalNote || null,
        due_date: dueDate || null
      });

      // 2. Set line items
      const itemsPayload = lineItems.map((item) => {
        const parsedPrice = parseMoneyInput(item.unitPrice, currency);
        return {
          description: item.description.trim(),
          quantity: item.quantity,
          unit_price_minor: parsedPrice.amountMinor
        };
      });

      await InvoiceRepo.setLineItems(newInvoiceId, itemsPayload);

      // 3. Redirect back to clients list
      router.push('/clients');
    } catch (err: unknown) {
      const message = err instanceof Error ? err.message : 'Failed to create invoice.';
      alert(message);
    }
  };

  if (isClientLoading) {
    return (
      <div className="flex items-center justify-center min-h-[300px]">
        <div className="animate-pulse text-slate-400">Loading client profile details...</div>
      </div>
    );
  }

  if (!client) {
    return (
      <div className="flex flex-col items-center justify-center min-h-[300px] text-center space-y-4">
        <div className="text-red-400 font-semibold">Client profile not found.</div>
        <button onClick={() => router.push('/clients')} className="text-sm text-indigo-400 hover:underline">
          Back to Clients
        </button>
      </div>
    );
  }

  return (
    <div className="space-y-6">
      {/* Header breadcrumb */}
      <div className="flex items-center justify-between">
        <button
          onClick={() => router.push('/clients')}
          className="inline-flex items-center gap-1 text-slate-400 hover:text-white transition text-sm"
        >
          <ArrowLeft className="h-4 w-4" /> Back to Clients
        </button>
        <div className="text-right">
          <span className="text-xs text-slate-500 font-bold uppercase tracking-widest block">Client Profile</span>
          <span className="text-sm font-bold text-white block truncate max-w-[200px]">{client.name}</span>
        </div>
      </div>

      <div>
        <h1 className="text-3xl font-extrabold text-white tracking-tight">New Invoice</h1>
        <p className="text-sm text-slate-400 mt-1">Generate a draft billing statement for client work</p>
      </div>

      <form onSubmit={handleSubmit} className="space-y-8 max-w-4xl font-sans">
        {/* Header fields cards */}
        <div className="rounded-3xl border border-slate-900 bg-slate-950/20 p-6 space-y-4 backdrop-blur-xl">
          <h3 className="text-sm font-bold uppercase tracking-widest text-indigo-400">Invoice Info</h3>
          
          <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
            <div className="space-y-2">
              <label htmlFor="invoiceNum" className="text-xs font-semibold text-slate-400">Invoice Number *</label>
              <input
                id="invoiceNum"
                type="text"
                required
                value={invoiceNumber}
                onChange={(e) => setInvoiceNumber(e.target.value)}
                className="block w-full rounded-lg border border-slate-800 bg-slate-900/40 py-2.5 px-3.5 text-sm text-white focus:border-indigo-500 focus:outline-none transition font-mono"
              />
            </div>
            
            <div className="space-y-2">
              <label className="text-xs font-semibold text-slate-400">Currency (Locked)</label>
              <div className="block w-full rounded-lg border border-slate-900 bg-slate-950 px-3.5 py-2.5 text-sm text-slate-500 uppercase font-bold">
                {currency}
              </div>
            </div>

            <div className="grid grid-cols-2 gap-4">
              <div className="space-y-2">
                <label htmlFor="issueDt" className="text-xs font-semibold text-slate-400">Issue Date</label>
                <input
                  id="issueDt"
                  type="date"
                  value={issueDate}
                  onChange={(e) => handleIssueDateChange(e.target.value)}
                  className="block w-full rounded-lg border border-slate-800 bg-slate-900/40 py-2 px-2.5 text-sm text-white focus:border-indigo-500 focus:outline-none transition"
                />
              </div>

              <div className="space-y-2">
                <label htmlFor="dueDt" className="text-xs font-semibold text-slate-400">Due Date</label>
                <input
                  id="dueDt"
                  type="date"
                  value={dueDate}
                  onChange={(e) => setDueDate(e.target.value)}
                  className="block w-full rounded-lg border border-slate-800 bg-slate-900/40 py-2 px-2.5 text-sm text-white focus:border-indigo-500 focus:outline-none transition"
                />
              </div>
            </div>
          </div>
        </div>

        {/* Line Items Editor Section */}
        <div className="space-y-4">
          <div className="flex items-center justify-between">
            <h3 className="text-sm font-bold uppercase tracking-widest text-indigo-400">Line Items</h3>
            <button
              type="button"
              onClick={handleAddLineItem}
              className="inline-flex items-center gap-1 rounded-lg bg-indigo-600 px-3 py-2 text-xs font-semibold text-white hover:bg-indigo-500 transition shadow"
            >
              <Plus className="h-3.5 w-3.5" /> Add Item
            </button>
          </div>

          <div className="space-y-3">
            {lineItems.map((item, index) => {
              const itemTotalMinor = totals.items[index]?.lineTotal ?? 0;

              return (
                <div
                  key={item.id}
                  className="rounded-2xl border border-slate-900 bg-slate-950/30 p-4 flex flex-col md:flex-row gap-4 items-start md:items-center relative group"
                >
                  <div className="text-slate-600 font-mono text-xs select-none md:pr-1">
                    #{index + 1}
                  </div>

                  <div className="flex-1 w-full space-y-1.5">
                    <label className="text-[10px] font-bold text-slate-500 uppercase md:hidden">Description</label>
                    <input
                      type="text"
                      placeholder="Line item description..."
                      value={item.description}
                      onChange={(e) => handleUpdateLineItem(item.id, 'description', e.target.value)}
                      className="block w-full rounded-lg border border-slate-800 bg-slate-900/20 py-2 px-3 text-sm text-white focus:border-indigo-500 focus:outline-none transition"
                    />
                  </div>

                  <div className="grid grid-cols-2 md:grid-cols-3 gap-4 w-full md:w-auto shrink-0">
                    <div className="space-y-1.5">
                      <label className="text-[10px] font-bold text-slate-500 uppercase md:hidden font-semibold">Qty</label>
                      <input
                        type="number"
                        step="0.001"
                        min="0.001"
                        placeholder="1"
                        value={item.quantity}
                        onChange={(e) => handleUpdateLineItem(item.id, 'quantity', parseFloat(e.target.value) || 0)}
                        className="block w-full md:w-20 rounded-lg border border-slate-800 bg-slate-900/20 py-2 px-3 text-sm text-white focus:border-indigo-500 focus:outline-none transition"
                      />
                    </div>

                    <div className="space-y-1.5">
                      <label className="text-[10px] font-bold text-slate-500 uppercase md:hidden">Unit Price</label>
                      <div className="relative">
                        <input
                          type="text"
                          placeholder="0.00"
                          value={item.unitPrice}
                          onChange={(e) => handleUpdateLineItem(item.id, 'unitPrice', e.target.value)}
                          className="block w-full md:w-28 rounded-lg border border-slate-800 bg-slate-900/20 py-2 px-3 text-sm text-white focus:border-indigo-500 focus:outline-none transition"
                        />
                      </div>
                    </div>

                    <div className="col-span-2 md:col-span-1 space-y-1.5 flex flex-col justify-center items-end md:items-start">
                      <span className="text-[10px] font-bold text-slate-500 uppercase md:hidden">Total</span>
                      <span className="text-sm font-bold text-slate-300 md:w-24 md:truncate">
                        {formatMoney({ amountMinor: itemTotalMinor, currency })}
                      </span>
                    </div>
                  </div>

                  {/* Actions (Reorder/Delete) */}
                  <div className="flex items-center gap-2 w-full md:w-auto justify-end border-t border-slate-900 md:border-t-0 pt-3 md:pt-0">
                    <button
                      type="button"
                      disabled={index === 0}
                      onClick={() => handleMoveLineItem(index, 'up')}
                      className="p-1.5 rounded hover:bg-slate-900 border border-slate-800 disabled:opacity-30 disabled:hover:bg-transparent text-slate-400 hover:text-white transition"
                    >
                      <ArrowUp className="h-3.5 w-3.5" />
                    </button>
                    <button
                      type="button"
                      disabled={index === lineItems.length - 1}
                      onClick={() => handleMoveLineItem(index, 'down')}
                      className="p-1.5 rounded hover:bg-slate-900 border border-slate-800 disabled:opacity-30 disabled:hover:bg-transparent text-slate-400 hover:text-white transition"
                    >
                      <ArrowDown className="h-3.5 w-3.5" />
                    </button>
                    <button
                      type="button"
                      onClick={() => handleRemoveLineItem(item.id)}
                      className="p-1.5 rounded bg-red-950/20 border border-red-900/40 text-red-400 hover:text-red-300 hover:border-red-800 transition"
                    >
                      <Trash2 className="h-3.5 w-3.5" />
                    </button>
                  </div>
                </div>
              );
            })}
          </div>
        </div>

        {/* Aggregate calculations card */}
        <div className="rounded-3xl border border-slate-900 bg-slate-950/40 p-6 flex justify-between items-center max-w-md ml-auto">
          <span className="text-sm text-slate-400 font-semibold">Invoice Total:</span>
          <span className="text-2xl font-extrabold text-white">
            {formatMoney({ amountMinor: totals.subtotalMinor, currency })}
          </span>
        </div>

        {/* Public/Private notes cards */}
        <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
          <div className="rounded-3xl border border-slate-900 bg-slate-950/20 p-6 space-y-3 backdrop-blur-xl">
            <label htmlFor="publicNotes" className="text-xs font-bold uppercase tracking-widest text-slate-400 block">
              Public Notes
            </label>
            <p className="text-[10px] text-slate-500">Rendered on PDF (payment details, thank you notes, terms)</p>
            <textarea
              id="publicNotes"
              rows={4}
              value={notes}
              onChange={(e) => setNotes(e.target.value)}
              placeholder="e.g. Bank details: Acct #1234, Sort Code: 5678. Thank you for your business!"
              className="block w-full rounded-lg border border-slate-800 bg-slate-900/40 py-2.5 px-3.5 text-sm text-white focus:border-indigo-500 focus:outline-none transition resize-none font-sans"
            />
          </div>

          <div className="rounded-3xl border border-slate-900 bg-slate-950/20 p-6 space-y-3 backdrop-blur-xl">
            <label htmlFor="privateNote" className="text-xs font-bold uppercase tracking-widest text-slate-400 block flex items-center gap-1.5">
              <span>Private Notes</span>
              <span className="inline-flex rounded bg-slate-900 border border-slate-800 px-1 py-0.2 text-[8px] font-bold text-slate-500 uppercase tracking-normal">Private</span>
            </label>
            <p className="text-[10px] text-slate-500">Internal notes about client negotiations or payment details (never printed on PDF)</p>
            <textarea
              id="privateNote"
              rows={4}
              value={internalNote}
              onChange={(e) => setInternalNote(e.target.value)}
              placeholder="e.g. Discussed a 10% discount if paid early. Client pays via card."
              className="block w-full rounded-lg border border-slate-800 bg-slate-900/40 py-2.5 px-3.5 text-sm text-white focus:border-indigo-500 focus:outline-none transition resize-none font-sans"
            />
          </div>
        </div>

        {/* Buttons actions */}
        <div className="flex justify-end gap-4 border-t border-slate-900 pt-6">
          <button
            type="button"
            onClick={() => router.push('/clients')}
            className="px-5 py-3 rounded-lg border border-slate-800 text-sm font-semibold text-slate-400 hover:text-white transition"
          >
            Cancel
          </button>
          <button
            type="submit"
            className="px-5 py-3 rounded-lg bg-indigo-600 text-sm font-semibold text-white hover:bg-indigo-500 transition shadow-lg shadow-indigo-600/20"
          >
            Create Invoice Draft
          </button>
        </div>
      </form>
    </div>
  );
}
