'use client';

import React, { useState, useEffect, useMemo, useCallback, useRef } from 'react';
import { createPortal } from 'react-dom';
import Link from 'next/link';
import { useRouter, useSearchParams } from 'next/navigation';
import {
  ChevronLeft,
  ChevronRight,
  ChevronDown,
  ChevronUp,
  Plus,
  Trash2,
  Pencil,
  Download,
  X,
  Check,
  Calendar,
  GripVertical,
} from 'lucide-react';
import { useClients, useProfile, useClient } from '../../../lib/data/hooks';
import { useDataReady } from '../../../lib/data/readiness';
import { ClientRepo } from '../../../lib/data/client';
import { InvoiceRepo } from '../../../lib/data/invoice';
import { parseMoneyInput, multiplyMinor } from '../../../lib/money';
import { Money } from '../../../components/ui/money';
import { useToast } from '../../../components/Toast';
import { ClientDetail, InvoiceDetail } from '../../../lib/data/types';
import { ProfileRow } from '../../../lib/sync/schema';
import { cn } from '../../../lib/utils';
import { DatePickerPopover, formatDateDisplay } from '../../../components/ui/DatePickerPopover';

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

// DatePickerPopover imported from shared ui component
interface LineItemRow {
  id: string;
  description: string;
  quantity: number;
  unitPrice: string;
}

function calculateDueDate(
  issueDateStr: string,
  terms: TermsType,
  currentDueDate?: string
): string {
  if (!issueDateStr) return currentDueDate || '';
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

export function CreateInvoiceSkeleton() {
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
            {/* Desktop action buttons */}
            <div className="hidden sm:flex items-center gap-2.5">
              <div className="h-10 w-20 bg-gray-200 dark:bg-[#27272a] rounded-xl" />
              <div className="h-10 w-28 bg-gray-200 dark:bg-[#27272a] rounded-xl" />
              <div className="h-10 w-32 bg-gray-200 dark:bg-[#27272a] rounded-xl" />
            </div>
            {/* Mobile 2-column grid */}
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

export function CreateInvoiceClient() {
  const router = useRouter();
  const searchParams = useSearchParams();
  const { showToast } = useToast();

  const fromUrl = searchParams?.get('from') || '/invoices';
  const paramClientId = searchParams?.get('clientId') || '';

  // Form State
  const [clientId, setClientId] = useState<string>(paramClientId);
  const [currency, setCurrency] = useState<string>('USD');
  const [invoiceNumber, setInvoiceNumber] = useState<string>('');
  const [issueDate, setIssueDate] = useState<string>(() => new Date().toISOString().split('T')[0]);
  const [terms, setTerms] = useState<TermsType>('due_on_receipt');
  const [dueDate, setDueDate] = useState<string>(() => new Date().toISOString().split('T')[0]);
  const [customerNotes, setCustomerNotes] = useState<string>('');
  const [privateNotes, setPrivateNotes] = useState<string>('');
  const [lineItems, setLineItems] = useState<LineItemRow[]>([
    { id: crypto.randomUUID(), description: '', quantity: 1, unitPrice: '' },
  ]);

  // Drag and Drop state
  const [draggedIndex, setDraggedIndex] = useState<number | null>(null);

  // Validation highlights
  const [clientError, setClientError] = useState(false);

  // Data queries
  const { data: clients } = useClients();
  const { data: profile } = useProfile();
  const { data: selectedClientDetail } = useClient(clientId);

  const hasClientsData = clients !== undefined;
  const checkEmpty = useCallback(() => ClientRepo.isEmpty(), []);
  const { isLoading: isDataLoading } = useDataReady(hasClientsData, checkEmpty);

  // 75ms Skeleton Deferral (ADR 036 Zero-CLS)
  const [showSkeleton, setShowSkeleton] = useState(false);
  useEffect(() => {
    if (!isDataLoading) {
      setShowSkeleton(false);
      return;
    }
    const timer = setTimeout(() => {
      setShowSkeleton(true);
    }, 75);
    return () => clearTimeout(timer);
  }, [isDataLoading]);

  // Views & Modals
  const [viewMode, setViewMode] = useState<ViewMode>('form');
  const [isAddClientOpen, setIsAddClientOpen] = useState(false);
  const [isMounted, setIsMounted] = useState(false);
  const clientDragStartY = useRef<number | null>(null);
  const [clientDragOffsetY, setClientDragOffsetY] = useState(0);

  useEffect(() => {
    setIsMounted(true);
  }, []);

  // Broadcast preview mode to AppShell
  useEffect(() => {
    window.dispatchEvent(
      new CustomEvent('clario:preview-mode', { detail: viewMode === 'preview' })
    );
    return () => {
      window.dispatchEvent(
        new CustomEvent('clario:preview-mode', { detail: false })
      );
    };
  }, [viewMode]);

  // Immediate scroll reset when switching between 'form' and 'preview'
  useEffect(() => {
    const mainEl = document.querySelector('main');
    if (mainEl) mainEl.scrollTo({ top: 0, behavior: 'instant' as ScrollBehavior });
    window.scrollTo({ top: 0, behavior: 'instant' as ScrollBehavior });
  }, [viewMode]);

  // Listen for breadcrumb click in preview mode to switch back to form
  useEffect(() => {
    const handleSwitchToForm = () => setViewMode('form');
    window.addEventListener('clario:switch-to-form', handleSwitchToForm);
    return () => window.removeEventListener('clario:switch-to-form', handleSwitchToForm);
  }, []);

  // Lock body scroll when Add Client Modal is open
  useEffect(() => {
    if (isAddClientOpen) {
      const originalOverflow = document.body.style.overflow;
      document.body.style.overflow = 'hidden';
      return () => {
        document.body.style.overflow = originalOverflow;
      };
    }
  }, [isAddClientOpen]);

  // Custom Popover States
  const [isClientDropdownOpen, setIsClientDropdownOpen] = useState(false);
  const [clientSearchQuery, setClientSearchQuery] = useState('');
  const clientDropdownRef = useRef<HTMLDivElement>(null);

  const [isCurrencyDropdownOpen, setIsCurrencyDropdownOpen] = useState(false);
  const [currencySearchQuery, setCurrencySearchQuery] = useState('');
  const currencyDropdownRef = useRef<HTMLDivElement>(null);

  const [isTermsDropdownOpen, setIsTermsDropdownOpen] = useState(false);
  const termsDropdownRef = useRef<HTMLDivElement>(null);

  const [isModalCurrencyDropdownOpen, setIsModalCurrencyDropdownOpen] = useState(false);
  const modalCurrencyDropdownRef = useRef<HTMLDivElement>(null);

  const [isSubmitting, setIsSubmitting] = useState(false);
  const [isDownloadingPdf, setIsDownloadingPdf] = useState(false);

  // Modal Add Client form state
  const [modalClientType, setModalClientType] = useState<'individual' | 'business'>('individual');
  const [modalFirstName, setModalFirstName] = useState('');
  const [modalLastName, setModalLastName] = useState('');
  const [modalBusinessName, setModalBusinessName] = useState('');
  const [modalEmail, setModalEmail] = useState('');
  const [modalPhone, setModalPhone] = useState('');
  const [modalAddress, setModalAddress] = useState('');
  const [modalCurrency, setModalCurrency] = useState('USD');
  const [modalNote, setModalNote] = useState('');
  const [isSavingClient, setIsSavingClient] = useState(false);

  // Click outside & Escape dismissal for custom popovers
  useEffect(() => {
    function handleClickOutside(event: MouseEvent) {
      const target = event.target as Node;
      if (clientDropdownRef.current && !clientDropdownRef.current.contains(target)) {
        setIsClientDropdownOpen(false);
      }
      if (currencyDropdownRef.current && !currencyDropdownRef.current.contains(target)) {
        setIsCurrencyDropdownOpen(false);
      }
      if (termsDropdownRef.current && !termsDropdownRef.current.contains(target)) {
        setIsTermsDropdownOpen(false);
      }
      if (modalCurrencyDropdownRef.current && !modalCurrencyDropdownRef.current.contains(target)) {
        setIsModalCurrencyDropdownOpen(false);
      }
    }

    function handleKeyDown(e: KeyboardEvent) {
      if (e.key === 'Escape') {
        setIsClientDropdownOpen(false);
        setIsCurrencyDropdownOpen(false);
        setIsTermsDropdownOpen(false);
        setIsModalCurrencyDropdownOpen(false);
      }
    }

    document.addEventListener('mousedown', handleClickOutside);
    window.addEventListener('keydown', handleKeyDown);
    return () => {
      document.removeEventListener('mousedown', handleClickOutside);
      window.removeEventListener('keydown', handleKeyDown);
    };
  }, []);

  // Auto-suggest next invoice number on mount
  useEffect(() => {
    InvoiceRepo.suggestNextNumber()
      .then((num) => {
        setInvoiceNumber((prev) => prev || num);
      })
      .catch((err) => {
        console.error('Failed to suggest invoice number:', err);
      });
  }, []);

  // Set default currency from profile if available
  useEffect(() => {
    if (profile?.default_currency) {
      setCurrency((prev) => (prev === 'USD' ? profile.default_currency!.toUpperCase() : prev));
      setModalCurrency((prev) => (prev === 'USD' ? profile.default_currency!.toUpperCase() : prev));
    }
  }, [profile?.default_currency]);

  // Client resolution & auto-select
  useEffect(() => {
    if (!clients || clients.length === 0) return;

    if (!clientId) {
      if (paramClientId && clients.some((c) => c.id === paramClientId)) {
        setClientId(paramClientId);
      } else if (clients.length === 1) {
        setClientId(clients[0].id);
      }
    }
  }, [clients, clientId, paramClientId]);

  // Update currency when client changes if client has preferred currency
  const handleClientChange = (selectedId: string) => {
    setClientId(selectedId);
    setClientError(false);
    const chosen = clients?.find((c) => c.id === selectedId);
    if (chosen?.default_currency) {
      setCurrency(chosen.default_currency.toUpperCase());
    }
  };

  // Issue Date & Terms synchronization
  const handleIssueDateChange = (newDate: string) => {
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
    setTerms(newTerms);
    setIsTermsDropdownOpen(false);
    if (newTerms !== 'custom') {
      setDueDate(calculateDueDate(issueDate, newTerms, dueDate));
    }
  };

  // Line item handlers
  const handleAddLineItem = () => {
    setLineItems((prev) => [
      ...prev,
      { id: crypto.randomUUID(), description: '', quantity: 1, unitPrice: '' },
    ]);
  };

  const handleRemoveLineItem = (id: string) => {
    if (lineItems.length === 1) {
      setLineItems([{ id: crypto.randomUUID(), description: '', quantity: 1, unitPrice: '' }]);
      return;
    }
    setLineItems((prev) => prev.filter((item) => item.id !== id));
  };

  const handleUpdateLineItem = (
    id: string,
    field: 'description' | 'quantity' | 'unitPrice',
    val: any
  ) => {
    setLineItems((prev) =>
      prev.map((item) => (item.id === id ? { ...item, [field]: val } : item))
    );
  };

  // Drag and Drop handlers
  const handleDragStart = (index: number) => {
    setDraggedIndex(index);
  };

  const handleDragOver = (e: React.DragEvent, index: number) => {
    e.preventDefault();
    e.dataTransfer.dropEffect = 'move';
  };

  const handleDrop = (dropIndex: number) => {
    if (draggedIndex === null || draggedIndex === dropIndex) return;
    setLineItems((prev) => {
      const updated = [...prev];
      const [removed] = updated.splice(draggedIndex, 1);
      updated.splice(dropIndex, 0, removed);
      return updated;
    });
    setDraggedIndex(null);
  };

  const handleDragEnd = () => {
    setDraggedIndex(null);
  };

  const moveLineItem = (index: number, direction: 'up' | 'down') => {
    const targetIndex = direction === 'up' ? index - 1 : index + 1;
    if (targetIndex < 0 || targetIndex >= lineItems.length) return;
    setLineItems((prev) => {
      const updated = [...prev];
      const temp = updated[index];
      updated[index] = updated[targetIndex];
      updated[targetIndex] = temp;
      return updated;
    });
  };

  // Minor Unit financial calculation (Integer BigInt math)
  const lineItemTotals = useMemo(() => {
    let subtotal = 0n;
    const items = lineItems.map((item) => {
      let unitMinor = 0n;
      try {
        if (item.unitPrice.trim()) {
          unitMinor = BigInt(parseMoneyInput(item.unitPrice, currency).amountMinor);
        }
      } catch {}
      const qty = BigInt(Math.max(0, Math.floor(Number(item.quantity) || 0)));
      const lineTotal = unitMinor * qty;
      subtotal += lineTotal;
      return {
        id: item.id,
        unitPriceMinor: Number(unitMinor),
        lineTotalMinor: Number(lineTotal),
      };
    });
    return {
      subtotalMinor: Number(subtotal),
      items,
    };
  }, [lineItems, currency]);

  const totalMinor = lineItemTotals.subtotalMinor;

  // Selected client details lookup
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

  // Filtered clients list for searchable dropdown
  const filteredClientsList = useMemo(() => {
    if (!clients) return [];
    if (!clientSearchQuery.trim()) return clients;
    const q = clientSearchQuery.toLowerCase().trim();
    return clients.filter(
      (c) =>
        c.name.toLowerCase().includes(q) ||
        (c.email && c.email.toLowerCase().includes(q)) ||
        (c.company && c.company.toLowerCase().includes(q))
    );
  }, [clients, clientSearchQuery]);

  // Filtered currencies list
  const filteredCurrenciesList = useMemo(() => {
    if (!currencySearchQuery.trim()) return CURRENCIES_LIST;
    const q = currencySearchQuery.toLowerCase().trim();
    return CURRENCIES_LIST.filter(
      (c) => c.code.toLowerCase().includes(q) || c.name.toLowerCase().includes(q)
    );
  }, [currencySearchQuery]);

  // Form Validation (Zero window.alert)
  const validateForm = (): boolean => {
    if (!clientId) {
      setClientError(true);
      showToast('Please select or add a client', 'info');
      return false;
    }
    const validItems = lineItems.filter(
      (item) => item.description.trim().length > 0
    );
    if (validItems.length === 0 || totalMinor <= 0) {
      showToast('Please add at least one line item with a price', 'info');
      return false;
    }
    return true;
  };

  // Preview Switch
  const handlePreview = () => {
    if (!validateForm()) return;
    setViewMode('preview');
  };

  // Save handler (draft or sent)
  const handleSaveInvoice = async (targetStatus: 'draft' | 'sent', redirectToDetails = false) => {
    if (!validateForm()) return;
    if (isSubmitting) return;

    setIsSubmitting(true);
    try {
      const numToUse = invoiceNumber.trim() || (await InvoiceRepo.suggestNextNumber());

      // Soft duplicate check
      const isDup = await InvoiceRepo.isNumberDuplicate(numToUse);
      if (isDup) {
        showToast(`Notice: Invoice number "${numToUse}" is already in use`, 'info');
      }

      // 1. Create header
      const newInvoiceId = await InvoiceRepo.create({
        client_id: clientId,
        currency: currency.toUpperCase(),
        invoice_number: numToUse,
        notes: customerNotes.trim() || null,
        internal_note: privateNotes.trim() || null,
        due_date: dueDate || null,
      });

      // 2. Insert line items
      const validItems = lineItems.filter((i) => i.description.trim().length > 0);
      const itemsPayload = validItems.map((item) => {
        let unitMinor = 0;
        try {
          if (item.unitPrice.trim()) {
            unitMinor = parseMoneyInput(item.unitPrice, currency).amountMinor;
          }
        } catch {}
        return {
          description: item.description.trim(),
          quantity: Math.max(1, Math.floor(Number(item.quantity) || 1)),
          unit_price_minor: unitMinor,
        };
      });

      await InvoiceRepo.setLineItems(newInvoiceId, itemsPayload);

      // 3. Status handling
      if (targetStatus === 'draft') {
        if (issueDate) {
          await InvoiceRepo.update(newInvoiceId, {
            issue_date: issueDate,
            due_date: dueDate || null,
          });
        }
        showToast('Invoice saved as draft');
      } else {
        await InvoiceRepo.markAsSent(newInvoiceId, issueDate, dueDate);
        showToast('Invoice created and marked as sent');
      }

      if (redirectToDetails) {
        router.push(`/invoices/${newInvoiceId}?from=${encodeURIComponent(fromUrl)}`);
      } else {
        router.push(fromUrl);
      }
    } catch (err: unknown) {
      const msg = err instanceof Error ? err.message : 'Failed to save invoice';
      showToast(msg, 'info');
    } finally {
      setIsSubmitting(false);
    }
  };

  // Download PDF handler for preview mode
  const handleDownloadPDF = async () => {
    if (isDownloadingPdf) return;
    if (!selectedClient) {
      showToast('Please select a client first', 'info');
      return;
    }

    setIsDownloadingPdf(true);
    try {
      const { generateInvoicePDF } = await import('../../../lib/pdf/generator');

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

      const validItems = lineItems.filter((i) => i.description.trim().length > 0);
      const itemsToRender = validItems.length > 0 ? validItems : lineItems;
      const lineItemDetails = itemsToRender.map((item, idx) => {
        let unitMinor = 0;
        try {
          if (item.unitPrice.trim()) {
            unitMinor = parseMoneyInput(item.unitPrice, currency).amountMinor;
          }
        } catch {}
        const qty = Math.max(1, Math.floor(Number(item.quantity) || 1));
        return {
          id: item.id,
          user_id: '',
          invoice_id: 'preview',
          description: item.description || 'Line item',
          quantity: qty,
          unit_price_minor: unitMinor,
          line_total_minor: unitMinor * qty,
          position: idx,
          created_at: new Date().toISOString(),
          updated_at: new Date().toISOString(),
          deleted_at: null,
        };
      });

      const invoiceDetail: InvoiceDetail = {
        id: 'preview',
        user_id: '',
        client_id: selectedClient.id,
        invoice_number: invoiceNumber || 'DRAFT',
        status: 'draft',
        currency: currency.toUpperCase(),
        total_minor: totalMinor,
        issue_date: issueDate || null,
        due_date: dueDate || null,
        notes: customerNotes || null,
        internal_note: privateNotes || null,
        created_at: new Date().toISOString(),
        updated_at: new Date().toISOString(),
        displayStatus: 'draft',
        amountPaidMinor: 0,
        balanceDueMinor: totalMinor,
        client_name: selectedClient.name,
        payments: [],
        lineItems: lineItemDetails,
      };

      const profileRow: ProfileRow = {
        id: profile?.id || 'profile',
        business_name: profile?.business_name || null,
        business_address: profile?.business_address || null,
        default_currency: profile?.default_currency || currency,
        created_at: profile?.created_at || new Date().toISOString(),
        updated_at: profile?.updated_at || new Date().toISOString(),
      };

      await generateInvoicePDF({
        invoice: invoiceDetail,
        client: clientDetail,
        profile: profileRow,
        mode: 'download',
      });

      showToast('Invoice PDF downloaded');
    } catch (err: unknown) {
      const msg = err instanceof Error ? err.message : 'Failed to generate PDF document';
      showToast(msg, 'info');
    } finally {
      setIsDownloadingPdf(false);
    }
  };

  // Add Client Modal submission (Zero window.alert)
  const handleModalSaveClient = async (e: React.FormEvent) => {
    e.preventDefault();
    const name =
      modalClientType === 'individual'
        ? `${modalFirstName.trim()} ${modalLastName.trim()}`.trim()
        : modalBusinessName.trim();

    if (!name) {
      showToast('Please enter client name', 'info');
      return;
    }

    if (modalEmail.trim() && !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(modalEmail.trim())) {
      showToast('Please enter a valid email address', 'info');
      return;
    }

    setIsSavingClient(true);
    try {
      const combinedNotes = [
        modalAddress.trim() ? `Address: ${modalAddress.trim()}` : '',
        modalNote.trim(),
      ]
        .filter(Boolean)
        .join('\n');

      const newId = await ClientRepo.create({
        name,
        company: modalClientType === 'business' ? modalBusinessName.trim() : null,
        email: modalEmail.trim() || null,
        phone: modalPhone.trim() || null,
        notes: combinedNotes || null,
        default_currency: modalCurrency || null,
      });

      setClientId(newId);
      if (modalCurrency) {
        setCurrency(modalCurrency.toUpperCase());
      }
      setClientError(false);
      setIsAddClientOpen(false);
      showToast('Client added successfully');

      // Reset modal inputs
      setModalFirstName('');
      setModalLastName('');
      setModalBusinessName('');
      setModalEmail('');
      setModalPhone('');
      setModalAddress('');
      setModalNote('');
    } catch (err: unknown) {
      const msg = err instanceof Error ? err.message : 'Failed to create client';
      showToast(msg, 'info');
    } finally {
      setIsSavingClient(false);
    }
  };

  // Render Skeleton while data query is resolving (ADR 036 Zero-CLS)
  if (isDataLoading) {
    if (showSkeleton) {
      return <CreateInvoiceSkeleton />;
    }
    return <div className="min-h-[400px] opacity-0" aria-busy="true" />;
  }

  // -------------------------------------------------------------
  // Mode 2: Preview Screen (Matching Preview Invoice.jpg 1:1)
  // -------------------------------------------------------------
  if (viewMode === 'preview') {
    return (
      <div className="w-full pb-12 text-left font-sans">
        {/* 100% Solid Opaque Sticky Header at top-0 */}
        <div className="sticky top-0 z-30 w-full px-4 sm:px-6 lg:px-8 pt-5 pb-3.5 bg-white dark:bg-[#09090b] border-b border-gray-200 dark:border-[#27272a]">
          <div className="w-full">
            {/* Desktop Header Layout */}
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
                    Create, send, and track your invoices in one place.
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
                    onClick={() => handleSaveInvoice('draft', true)}
                    disabled={isSubmitting}
                    className="h-10 px-4 rounded-xl bg-blue-600 hover:bg-blue-700 text-white text-[13px] font-medium inline-flex items-center justify-center gap-1.5 whitespace-nowrap transition-colors disabled:opacity-50"
                  >
                    <span>{isSubmitting ? 'Saving...' : 'Save Invoice'}</span>
                  </button>
                </div>
              </div>
            </div>

            {/* Mobile Header Layout */}
            <div className="sm:hidden w-full">
              {/* Row 1: Back */}
              <div className="flex items-center justify-between">
                <button
                  type="button"
                  onClick={() => setViewMode('form')}
                  className="inline-flex items-center gap-1 px-2.5 py-1.5 rounded-lg bg-gray-100 hover:bg-gray-200/80 dark:bg-[#18181b] dark:hover:bg-[#222226] text-[12px] leading-none font-medium text-gray-700 dark:text-zinc-300 transition-colors"
                >
                  <ChevronLeft className="h-3.5 w-3.5" strokeWidth={2} /> Back
                </button>
              </div>
              {/* Row 2: Title + Subtitle */}
              <div className="mt-2.5">
                <h1 className="text-[22px] leading-[28px] font-semibold text-gray-900 dark:text-white tracking-tight">
                  Preview Invoice
                </h1>
                <p className="text-[13px] leading-[18px] text-gray-500 dark:text-zinc-400 mt-0.5">
                  Create, send, and track your invoices in one place.
                </p>
              </div>
              {/* Row 3: Action Buttons */}
              <div className="w-full space-y-2 mt-3">
                <div className="grid grid-cols-2 gap-2.5">
                  <button
                    type="button"
                    onClick={() => setViewMode('form')}
                    className="h-10 w-full rounded-xl border border-gray-200 dark:border-[#27272a] bg-white dark:bg-[#18181b] text-[13px] font-medium text-gray-700 dark:text-zinc-300 inline-flex items-center justify-center gap-1.5"
                  >
                    <Pencil className="h-4 w-4 shrink-0 text-gray-500 dark:text-zinc-400" strokeWidth={2} />
                    <span>Edit Invoice</span>
                  </button>
                  <button
                    type="button"
                    onClick={handleDownloadPDF}
                    disabled={isDownloadingPdf}
                    className="h-10 w-full rounded-xl border border-gray-200 dark:border-[#27272a] bg-white dark:bg-[#18181b] text-[13px] font-medium text-gray-700 dark:text-zinc-300 inline-flex items-center justify-center gap-1.5 disabled:opacity-50"
                  >
                    <Download className="h-4 w-4 shrink-0 text-gray-500 dark:text-zinc-400" strokeWidth={2} />
                    <span>{isDownloadingPdf ? 'Downloading...' : 'Download PDF'}</span>
                  </button>
                </div>
                <button
                  type="button"
                  onClick={() => handleSaveInvoice('draft', true)}
                  disabled={isSubmitting}
                  className="h-10 w-full rounded-xl bg-blue-600 hover:bg-blue-700 text-white text-[13px] font-medium inline-flex items-center justify-center disabled:opacity-50"
                >
                  <span>{isSubmitting ? 'Saving...' : 'Save Invoice'}</span>
                </button>
              </div>
            </div>
          </div>
        </div>

        {/* Preview Content Container */}
        <div className="px-4 sm:px-6 lg:px-8 py-6">
          <div className="max-w-[780px] mx-auto rounded-[28px] bg-[#F8FAFC] dark:bg-[#121215] border border-gray-100 dark:border-[#27272a]/70 p-4 sm:p-7">
          <div className="rounded-2xl bg-white dark:bg-[#18181b] border border-gray-200/70 dark:border-[#27272a] p-6 sm:p-10 space-y-8">
            {/* Top Section — Option B Mobile Letterhead vs Desktop Side-by-Side */}
            {/* Mobile Letterhead (sm:hidden) */}
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

            {/* Desktop Side-by-Side (hidden sm:flex) */}
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

              {/* INVOICE Title + Invoice Number */}
              <div className="sm:text-right">
                <span className="text-[24px] font-semibold tracking-tight text-gray-900 dark:text-white block uppercase">
                  INVOICE
                </span>
                <span className="text-[13px] font-normal text-gray-500 dark:text-zinc-400 mt-1 block tabular-nums">
                  Invoice Number: {invoiceNumber || 'INV-0001'}
                </span>
              </div>
            </div>

            {/* Middle Section: Billed To & Dates */}
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

            {/* Line Items: Desktop Table + Mobile Stacked Rows (Zero horizontal scroll) */}
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

            {/* Mobile Stacked Items (sm:hidden) */}
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

            {/* Right-Aligned Total (Single Total Amount row, matching image_374a9c.png) */}
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

            {/* Customer Notes with Full-Width Horizontal Divider */}
            {customerNotes && customerNotes.trim() && (
              <div className="border-t border-gray-100 dark:border-[#27272a] pt-6 space-y-1">
                <span className="text-[12px] font-semibold text-gray-600 dark:text-zinc-400 block">
                  Notes:
                </span>
                <p className="text-[12px] text-gray-500 dark:text-zinc-400 whitespace-pre-line leading-relaxed">
                  {customerNotes}
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
  // Mode 1: The Form Screen (Matching Create invoice.jpg 1:1)
  // -------------------------------------------------------------
  return (
    <div className="w-full pb-12 text-left font-sans">
      <div className="sticky top-0 z-30 w-full px-4 sm:px-6 lg:px-8 pt-5 pb-3.5 bg-white dark:bg-[#09090b] border-b border-gray-200 dark:border-[#27272a]">
        <div className="w-full">
          {/* Desktop Header Layout */}
          <div className="hidden sm:block">
            <Link
              className="inline-flex items-center gap-1 px-2.5 py-1.5 rounded-lg bg-gray-100 hover:bg-gray-200/80 dark:bg-[#18181b] dark:hover:bg-[#222226] text-[12px] leading-none font-medium text-gray-700 dark:text-zinc-300 transition-colors no-underline w-fit"
              href={fromUrl}
              prefetch={false}
            >
              <ChevronLeft className="h-3.5 w-3.5" strokeWidth={2} /> Back
            </Link>
            <div className="flex items-center justify-between gap-3 mt-2.5">
              <div>
                <h1 className="text-[22px] leading-[28px] font-semibold text-gray-900 dark:text-white tracking-tight">
                  Create Invoice
                </h1>
                <p className="text-[13px] leading-[18px] text-gray-500 dark:text-zinc-400 mt-0.5">
                  Create, send, and track your invoices in one place.
                </p>
              </div>
              <div className="flex items-center gap-2.5 shrink-0">
                <Link
                  href={fromUrl}
                  prefetch={false}
                  className="h-10 px-4 rounded-xl border border-gray-200 dark:border-[#27272a] bg-white dark:bg-[#18181b] text-[13px] font-medium text-gray-700 dark:text-zinc-300 hover:bg-gray-50 dark:hover:bg-[#222226] inline-flex items-center justify-center no-underline transition-colors"
                >
                  Cancel
                </Link>

                <button
                  type="button"
                  onClick={() => handleSaveInvoice('draft')}
                  disabled={isSubmitting}
                  className="h-10 px-4 rounded-xl border border-gray-200 dark:border-[#27272a] bg-white dark:bg-[#18181b] text-[13px] font-medium text-gray-700 dark:text-zinc-300 hover:bg-gray-50 dark:hover:bg-[#222226] inline-flex items-center justify-center whitespace-nowrap transition-colors disabled:opacity-50"
                >
                  {isSubmitting ? 'Saving...' : 'Save as Draft'}
                </button>

                <button
                  type="button"
                  onClick={handlePreview}
                  className="h-10 px-4 rounded-xl bg-blue-600 hover:bg-blue-700 text-white text-[13px] font-medium inline-flex items-center justify-center whitespace-nowrap transition-colors"
                >
                  Preview Invoice
                </button>
              </div>
            </div>
          </div>

          {/* Mobile Header Layout */}
          <div className="sm:hidden w-full">
            {/* Row 1: Back + Cancel */}
            <div className="flex items-center justify-between">
              <Link
                className="inline-flex items-center gap-1 px-2.5 py-1.5 rounded-lg bg-gray-100 hover:bg-gray-200/80 dark:bg-[#18181b] dark:hover:bg-[#222226] text-[12px] leading-none font-medium text-gray-700 dark:text-zinc-300 transition-colors no-underline"
                href={fromUrl}
                prefetch={false}
              >
                <ChevronLeft className="h-3.5 w-3.5" strokeWidth={2} /> Back
              </Link>
              <Link
                href={fromUrl}
                prefetch={false}
                className="text-[13px] font-medium text-gray-500 hover:text-gray-900 dark:text-zinc-400 dark:hover:text-white no-underline"
              >
                Cancel
              </Link>
            </div>
            {/* Row 2: Title + Subtitle */}
            <div className="mt-2.5">
              <h1 className="text-[22px] leading-[28px] font-semibold text-gray-900 dark:text-white tracking-tight">
                Create Invoice
              </h1>
              <p className="text-[13px] leading-[18px] text-gray-500 dark:text-zinc-400 mt-0.5">
                Create, send, and track your invoices in one place.
              </p>
            </div>
            {/* Row 3: Action Buttons */}
            <div className="grid grid-cols-2 gap-2.5 w-full mt-3">
              <button
                type="button"
                onClick={() => handleSaveInvoice('draft')}
                disabled={isSubmitting}
                className="h-10 w-full rounded-xl border border-gray-200 dark:border-[#27272a] bg-white dark:bg-[#18181b] text-[13px] font-medium text-gray-700 dark:text-zinc-300 inline-flex items-center justify-center transition-colors disabled:opacity-50"
              >
                {isSubmitting ? 'Saving...' : 'Save as Draft'}
              </button>
              <button
                type="button"
                onClick={handlePreview}
                className="h-10 w-full rounded-xl bg-blue-600 hover:bg-blue-700 text-white text-[13px] font-medium inline-flex items-center justify-center transition-colors"
              >
                Preview Invoice
              </button>
            </div>
          </div>
        </div>
      </div>

      {/* Form Content Column with its own padding */}
      <div className="px-4 sm:px-6 lg:px-8 py-6 space-y-6 max-w-[760px]">
        {/* Card 1: Invoice Details with Edge-to-Edge Divider */}
        <div className="rounded-2xl border border-gray-200 dark:border-[#27272a] bg-white dark:bg-[#18181b] p-5 sm:p-6 space-y-5">
          <div className="-mx-5 sm:-mx-6 px-5 sm:px-6 pb-4 mb-5 border-b border-gray-100 dark:border-[#27272a]">
            <h2 className="text-[16px] leading-[22px] font-semibold text-gray-900 dark:text-white">
              Invoice Details
            </h2>
          </div>

          <div className="space-y-4">
            {/* Field 1: Client (Full Width + Custom Searchable Popover) */}
            <div className="space-y-1.5" ref={clientDropdownRef}>
              <label className="block text-[12px] font-medium text-gray-700 dark:text-zinc-300 mb-1.5">
                Client
              </label>

              <div className="relative">
                <button
                  type="button"
                  onClick={() => setIsClientDropdownOpen((prev) => !prev)}
                  className={cn(
                    'w-full h-10 px-3.5 rounded-xl bg-[#F9FAFB] dark:bg-[#121215] border text-[13px] flex items-center justify-between gap-2 overflow-hidden text-left transition-colors',
                    'focus:outline-none focus:border-blue-600 dark:focus:border-blue-500 focus:ring-2 focus:ring-blue-600/15 dark:focus:ring-blue-500/20',
                    isClientDropdownOpen
                      ? 'border-gray-300 dark:border-zinc-700 bg-[#F9FAFB] dark:bg-[#121215]'
                      : clientError
                      ? 'border-rose-400 dark:border-rose-500/50'
                      : 'border-gray-200/80 dark:border-[#27272a]'
                  )}
                >
                  <span
                    className={cn(
                      'truncate min-w-0 flex-1 text-left',
                      clientId
                        ? 'font-medium text-gray-900 dark:text-white'
                        : 'font-normal text-gray-400 dark:text-zinc-500'
                    )}
                  >
                    {selectedClient
                      ? `${selectedClient.name}${selectedClient.company ? ` (${selectedClient.company})` : ''}`
                      : 'Select client'}
                  </span>
                  <ChevronDown className="h-4 w-4 text-gray-400 shrink-0" />
                </button>

                {isClientDropdownOpen && (
                  <div data-popover="true" className="absolute z-20 left-0 right-0 mt-1 rounded-xl border border-gray-200 dark:border-[#27272a] bg-white dark:bg-[#18181b] p-1.5 shadow-none">
                    <div className="p-1.5 border-b border-gray-100 dark:border-[#27272a] mb-1">
                      <input
                        type="text"
                        value={clientSearchQuery}
                        onChange={(e) => setClientSearchQuery(e.target.value)}
                        placeholder="Search client by name or email..."
                        autoFocus
                        className="w-full h-8 px-2.5 rounded-lg bg-[#F9FAFB] dark:bg-[#121215] border border-gray-200/80 dark:border-[#27272a] text-[12px] font-medium text-gray-900 dark:text-white placeholder:font-normal placeholder:text-gray-400 focus:outline-none focus:border-blue-600 dark:focus:border-blue-500 focus:ring-2 focus:ring-blue-600/15"
                      />
                    </div>
                    <div className="max-h-[220px] overflow-y-auto space-y-0.5">
                      {filteredClientsList.length === 0 ? (
                        <div className="px-3 py-2 text-[12px] text-gray-400 dark:text-zinc-500">
                          No clients found
                        </div>
                      ) : (
                        filteredClientsList.map((c) => {
                          const isSelected = c.id === clientId;
                          return (
                            <button
                              key={c.id}
                              type="button"
                              onClick={() => {
                                handleClientChange(c.id);
                                setIsClientDropdownOpen(false);
                                setClientSearchQuery('');
                              }}
                              className={cn(
                                'w-full px-3 py-2 rounded-lg text-left text-[13px] flex items-center justify-between transition-colors',
                                isSelected
                                  ? 'bg-gray-100 dark:bg-[#222226] text-gray-900 dark:text-white font-medium'
                                  : 'text-gray-700 dark:text-zinc-300 hover:bg-gray-50 dark:hover:bg-[#222226]'
                              )}
                            >
                              <div className="min-w-0 flex-1 pr-2">
                                <div className="font-medium text-gray-900 dark:text-white line-clamp-2 break-words text-[13px]">{c.name}</div>
                                {(c.company || c.email) && (
                                  <div className="text-[11px] text-gray-400 dark:text-zinc-500 line-clamp-1 break-words mt-0.5">
                                    {[c.company, c.email].filter(Boolean).join(' • ')}
                                  </div>
                                )}
                              </div>
                              {isSelected && (
                                <Check className="h-4 w-4 text-blue-600 dark:text-blue-400 shrink-0" />
                              )}
                            </button>
                          );
                        })
                      )}
                    </div>
                  </div>
                )}
              </div>

              <div>
                <button
                  type="button"
                  onClick={() => setIsAddClientOpen(true)}
                  className="inline-flex items-center gap-1.5 text-[12px] font-medium text-blue-600 hover:text-blue-700 dark:text-blue-400 mt-2 transition-colors"
                >
                  <Plus className="h-3.5 w-3.5" strokeWidth={2} /> Add Client
                </button>
              </div>
            </div>

            {/* Field 2: Invoice Number (Full Width Row) */}
            <div className="space-y-1.5">
              <label className="block text-[12px] font-medium text-gray-700 dark:text-zinc-300 mb-1.5">
                Invoice Number
              </label>
              <input
                type="text"
                value={invoiceNumber}
                onChange={(e) => setInvoiceNumber(e.target.value)}
                placeholder="INV-0001"
                className="w-full h-10 px-3.5 rounded-xl bg-[#F9FAFB] dark:bg-[#121215] border border-gray-200/80 dark:border-[#27272a] text-[13px] font-medium text-gray-900 dark:text-white placeholder:font-normal placeholder:text-gray-400 dark:placeholder:text-zinc-500 tabular-nums focus:outline-none focus:border-blue-600 dark:focus:border-blue-500 focus:ring-2 focus:ring-blue-600/15 dark:focus:ring-blue-500/20 transition-colors"
              />
            </div>

            {/* Field 3: Currency (Full Width Row + Custom Popover) */}
            <div className="space-y-1.5" ref={currencyDropdownRef}>
              <label className="block text-[12px] font-medium text-gray-700 dark:text-zinc-300 mb-1.5">
                Currency
              </label>

              <div className="relative">
                <button
                  type="button"
                  onClick={() => setIsCurrencyDropdownOpen((prev) => !prev)}
                  className={cn(
                    'w-full h-10 px-3.5 rounded-xl bg-[#F9FAFB] dark:bg-[#121215] border text-[13px] font-medium text-gray-900 dark:text-white flex items-center justify-between gap-2 overflow-hidden text-left transition-colors',
                    'focus:outline-none focus:border-blue-600 dark:focus:border-blue-500 focus:ring-2 focus:ring-blue-600/15 dark:focus:ring-blue-500/20',
                    isCurrencyDropdownOpen
                      ? 'border-gray-300 dark:border-zinc-700 bg-[#F9FAFB] dark:bg-[#121215]'
                      : 'border-gray-200/80 dark:border-[#27272a]'
                  )}
                >
                  <span>
                    {CURRENCIES_LIST.find((c) => c.code === currency)?.label || `${currency} - ${currency}`}
                  </span>
                  <ChevronDown className="h-4 w-4 text-gray-400 shrink-0" />
                </button>

                {isCurrencyDropdownOpen && (
                  <div data-popover="true" className="absolute z-20 left-0 right-0 mt-1 rounded-xl border border-gray-200 dark:border-[#27272a] bg-white dark:bg-[#18181b] p-1.5 shadow-none">
                    <div className="p-1.5 border-b border-gray-100 dark:border-[#27272a] mb-1">
                      <input
                        type="text"
                        value={currencySearchQuery}
                        onChange={(e) => setCurrencySearchQuery(e.target.value)}
                        placeholder="Search currency..."
                        autoFocus
                        className="w-full h-8 px-2.5 rounded-lg bg-[#F9FAFB] dark:bg-[#121215] border border-gray-200/80 dark:border-[#27272a] text-[12px] font-medium text-gray-900 dark:text-white placeholder:font-normal placeholder:text-gray-400 focus:outline-none focus:border-blue-600 dark:focus:border-blue-500 focus:ring-2 focus:ring-blue-600/15"
                      />
                    </div>
                    <div className="max-h-[220px] overflow-y-auto space-y-0.5">
                      {filteredCurrenciesList.map((c) => {
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
                              'w-full px-3 py-2 rounded-lg text-left text-[13px] flex items-center justify-between transition-colors',
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
            </div>

            {/* Field 4: Issue Date (Custom Clario DatePickerPopover) */}
            <div className="space-y-1.5">
              <label className="block text-[12px] font-medium text-gray-700 dark:text-zinc-300 mb-1.5">
                Issue Date
              </label>
              <DatePickerPopover
                value={issueDate}
                onChange={handleIssueDateChange}
              />
            </div>

            {/* Field 5: Terms & Due Date (2-Column Grid) */}
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
              {/* Terms Popover */}
              <div className="space-y-1.5" ref={termsDropdownRef}>
                <label className="block text-[12px] font-medium text-gray-700 dark:text-zinc-300 mb-1.5">
                  Terms
                </label>
                <div className="relative">
                  <button
                    type="button"
                    onClick={() => setIsTermsDropdownOpen((prev) => !prev)}
                    className={cn(
                      'w-full h-11 px-3.5 rounded-xl bg-[#F9FAFB] dark:bg-[#121215] border text-[13px] font-medium text-gray-900 dark:text-white flex items-center justify-between text-left transition-colors',
                      'focus:outline-none focus:border-blue-600 dark:focus:border-blue-500 focus:ring-2 focus:ring-blue-600/15 dark:focus:ring-blue-500/20',
                      isTermsDropdownOpen
                        ? 'border-gray-300 dark:border-zinc-700 bg-[#F9FAFB] dark:bg-[#121215]'
                        : 'border-gray-200/80 dark:border-[#27272a]'
                    )}
                  >
                    <span>{TERMS_OPTIONS.find((t) => t.value === terms)?.label || 'Due on receipt'}</span>
                    <ChevronDown className="h-4 w-4 text-gray-400 shrink-0" />
                  </button>

                  {isTermsDropdownOpen && (
                    <div data-popover="true" className="absolute z-20 left-0 right-0 mt-1 rounded-xl border border-gray-200 dark:border-[#27272a] bg-white dark:bg-[#18181b] p-1.5 shadow-none">
                      {TERMS_OPTIONS.map((t) => {
                        const isSelected = t.value === terms;
                        return (
                          <button
                            key={t.value}
                            type="button"
                            onClick={() => handleTermsChange(t.value)}
                            className={cn(
                              'w-full px-3 py-2 rounded-lg text-left text-[13px] flex items-center justify-between transition-colors',
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
              </div>

              {/* Due Date with Custom Clario DatePickerPopover */}
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

        {/* Card 2: Product/Service Details with Edge-to-Edge Divider & Full-Bleed Rectangular Header Shelf */}
        <div className="rounded-2xl border border-gray-200 dark:border-[#27272a] bg-white dark:bg-[#18181b] p-5 sm:p-6 space-y-4">
          <div className="-mx-5 sm:-mx-6 px-5 sm:px-6 pb-4 mb-4 border-b border-gray-100 dark:border-[#27272a]">
            <h2 className="text-[16px] leading-[22px] font-semibold text-gray-900 dark:text-white">
              Product/Service Details
            </h2>
          </div>

          {/* Desktop Table View — Full-Bleed Rectangular Shelf */}
          <div className="hidden sm:block space-y-3">
            {/* Column Header Strip: Full-Bleed Rectangular Gray Shelf */}
            <div className="hidden sm:flex items-center gap-2 -mx-5 sm:-mx-6 px-5 sm:px-6 py-2.5 bg-[#F9FAFB] dark:bg-[#121215] border-y border-gray-100 dark:border-[#27272a] text-[12px] font-medium text-gray-500 dark:text-zinc-400 mb-3">
              <div className="w-5 shrink-0" aria-hidden="true" />
              <div className="flex-1 flex items-center gap-3">
                <span className="flex-1">Item Description</span>
                <span className="w-20 text-left">Quantity</span>
                <span className="w-28 text-left">Unit Price</span>
                <span className="w-28 text-left">Total</span>
              </div>
              <div className="w-8 shrink-0" aria-hidden="true" />
            </div>

            {/* Line Item Rows Matching Column Alignment */}
            <div className="space-y-2">
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
                    draggable
                    onDragStart={() => handleDragStart(index)}
                    onDragOver={(e) => handleDragOver(e, index)}
                    onDrop={() => handleDrop(index)}
                    onDragEnd={handleDragEnd}
                    className={`hidden sm:flex items-center gap-2 py-1 transition-colors ${draggedIndex === index ? 'opacity-50' : ''}`}
                  >
                    <div className="w-5 shrink-0 flex items-center justify-center cursor-grab active:cursor-grabbing">
                      <GripVertical
                        className="h-4 w-4 text-gray-300 dark:text-zinc-600 hover:text-gray-500"
                        strokeWidth={2}
                      />
                    </div>
                    <div className="flex-1 flex items-center gap-3">
                      <input
                        type="text"
                        value={item.description}
                        onChange={(e) =>
                          handleUpdateLineItem(item.id, 'description', e.target.value)
                        }
                        placeholder="Enter description"
                        className="flex-1 h-10 px-3.5 rounded-xl bg-[#F9FAFB] dark:bg-[#121215] border border-gray-200/80 dark:border-[#27272a] text-[13px] font-medium text-gray-900 dark:text-white placeholder:font-normal placeholder:text-gray-400 focus:outline-none focus:border-blue-600 dark:focus:border-blue-500 focus:ring-2 focus:ring-blue-600/15"
                      />
                      <input
                        type="number"
                        min="1"
                        step="1"
                        value={item.quantity}
                        onChange={(e) =>
                          handleUpdateLineItem(
                            item.id,
                            'quantity',
                            Math.max(1, parseInt(e.target.value, 10) || 1)
                          )
                        }
                        className="w-20 h-10 px-3 rounded-xl bg-[#F9FAFB] dark:bg-[#121215] border border-gray-200/80 dark:border-[#27272a] text-[13px] font-medium text-gray-900 dark:text-white text-left tabular-nums focus:outline-none focus:border-blue-600 dark:focus:border-blue-500 focus:ring-2 focus:ring-blue-600/15"
                      />
                      <input
                        type="text"
                        value={item.unitPrice}
                        onChange={(e) =>
                          handleUpdateLineItem(item.id, 'unitPrice', e.target.value)
                        }
                        placeholder="0.00"
                        className="w-28 h-10 px-3.5 rounded-xl bg-[#F9FAFB] dark:bg-[#121215] border border-gray-200/80 dark:border-[#27272a] text-[13px] font-medium text-gray-900 dark:text-white text-left tabular-nums focus:outline-none focus:border-blue-600 dark:focus:border-blue-500 focus:ring-2 focus:ring-blue-600/15"
                      />
                      <div className="w-28 h-10 px-3.5 rounded-xl bg-[#F9FAFB] dark:bg-[#121215] border border-gray-200/60 dark:border-[#27272a] flex items-center text-[13px] font-medium text-gray-700 dark:text-zinc-300 tabular-nums overflow-hidden select-none">
                        <Money amountMinor={lineTotalMinor} currency={currency} />
                      </div>
                    </div>
                    <button
                      type="button"
                      onClick={() => handleRemoveLineItem(item.id)}
                      className="w-8 h-8 shrink-0 inline-flex items-center justify-center rounded-lg text-gray-400 hover:text-rose-600 transition-colors"
                      aria-label="Remove item"
                    >
                      <Trash2 className="h-4 w-4" strokeWidth={2} />
                    </button>
                  </div>
                );
              })}
            </div>
          </div>

          {/* Mobile Stacked View with Up/Down Touch Controls */}
          <div className="sm:hidden space-y-4">
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
                    <span className="text-[12px] font-semibold text-gray-500 dark:text-zinc-400 uppercase tracking-wider">
                      Item #{index + 1}
                    </span>
                    <div className="flex items-center gap-1">
                      <button
                        type="button"
                        onClick={() => moveLineItem(index, 'up')}
                        disabled={index === 0}
                        aria-label="Move line item up"
                        className="h-7 w-7 flex items-center justify-center text-gray-400 hover:text-gray-700 dark:hover:text-zinc-200 rounded-lg hover:bg-gray-100 dark:hover:bg-[#222226] disabled:opacity-30 disabled:pointer-events-none transition-colors"
                      >
                        <ChevronUp className="h-4 w-4" strokeWidth={2} />
                      </button>
                      <button
                        type="button"
                        onClick={() => moveLineItem(index, 'down')}
                        disabled={index === lineItems.length - 1}
                        aria-label="Move line item down"
                        className="h-7 w-7 flex items-center justify-center text-gray-400 hover:text-gray-700 dark:hover:text-zinc-200 rounded-lg hover:bg-gray-100 dark:hover:bg-[#222226] disabled:opacity-30 disabled:pointer-events-none transition-colors"
                      >
                        <ChevronDown className="h-4 w-4" strokeWidth={2} />
                      </button>
                      <button
                        type="button"
                        onClick={() => handleRemoveLineItem(item.id)}
                        aria-label="Delete line item"
                        className="h-7 w-7 flex items-center justify-center text-gray-400 hover:text-rose-600 dark:hover:text-rose-400 rounded-lg hover:bg-gray-100 dark:hover:bg-[#222226] transition-colors"
                      >
                        <Trash2 className="h-4 w-4" strokeWidth={2} />
                      </button>
                    </div>
                  </div>

                  <div className="space-y-1">
                    <label className="text-[11px] font-medium text-gray-600 dark:text-zinc-400">
                      Description
                    </label>
                    <input
                      type="text"
                      value={item.description}
                      onChange={(e) =>
                        handleUpdateLineItem(item.id, 'description', e.target.value)
                      }
                      placeholder="Enter description"
                      className="w-full h-10 px-3 rounded-xl bg-white dark:bg-[#18181b] border border-gray-200 dark:border-[#27272a] text-[13px] font-medium text-gray-900 dark:text-white placeholder:font-normal placeholder:text-gray-400 dark:placeholder:text-zinc-500 focus:outline-none focus:border-blue-600 dark:focus:border-blue-500 focus:ring-2 focus:ring-blue-600/15"
                    />
                  </div>

                  <div className="grid grid-cols-2 gap-3">
                    <div className="space-y-1">
                      <label className="text-[11px] font-medium text-gray-600 dark:text-zinc-400">
                        Quantity
                      </label>
                      <input
                        type="number"
                        min="1"
                        step="1"
                        value={item.quantity}
                        onChange={(e) =>
                          handleUpdateLineItem(
                            item.id,
                            'quantity',
                            Math.max(1, parseInt(e.target.value, 10) || 1)
                          )
                        }
                        className="w-full h-10 px-3 text-left rounded-xl bg-white dark:bg-[#18181b] border border-gray-200 dark:border-[#27272a] text-[13px] font-medium text-gray-900 dark:text-white tabular-nums focus:outline-none focus:border-blue-600 dark:focus:border-blue-500 focus:ring-2 focus:ring-blue-600/15"
                      />
                    </div>

                    <div className="space-y-1">
                      <label className="text-[11px] font-medium text-gray-600 dark:text-zinc-400">
                        Unit Price
                      </label>
                      <input
                        type="text"
                        inputMode="decimal"
                        value={item.unitPrice}
                        onChange={(e) =>
                          handleUpdateLineItem(item.id, 'unitPrice', e.target.value)
                        }
                        placeholder="0.00"
                        className="w-full h-10 px-3 text-left rounded-xl bg-white dark:bg-[#18181b] border border-gray-200 dark:border-[#27272a] text-[13px] font-medium text-gray-900 dark:text-white tabular-nums placeholder:font-normal placeholder:text-gray-400 dark:placeholder:text-zinc-500 focus:outline-none focus:border-blue-600 dark:focus:border-blue-500 focus:ring-2 focus:ring-blue-600/15"
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
          <button
            type="button"
            onClick={handleAddLineItem}
            className="inline-flex items-center gap-1.5 text-[13px] font-medium text-gray-800 hover:text-gray-950 dark:text-zinc-200 dark:hover:text-white pt-1 transition-colors"
          >
            <Plus className="h-4 w-4" strokeWidth={2} /> Add Item
          </button>
        </div>

        {/* Card 3: Full-Width Total Card (Matching image_366d40.png — Only Total Amount) */}
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

        {/* Side-by-Side Notes Row Directly Below Total Card */}
        <div className="grid grid-cols-1 sm:grid-cols-2 gap-5">
          <div className="space-y-1.5">
            <label className="block text-[12px] font-medium text-gray-700 dark:text-zinc-300 mb-1.5">
              Note to Customer (Optional)
            </label>
            <textarea
              rows={4}
              value={customerNotes}
              onChange={(e) => setCustomerNotes(e.target.value)}
              placeholder="Enter payment instructions, bank details, or terms printed on PDF..."
              className="w-full min-h-[110px] p-3.5 rounded-xl bg-[#F9FAFB] dark:bg-[#121215] border border-gray-200/80 dark:border-[#27272a] text-[13px] font-medium text-gray-900 dark:text-white placeholder:font-normal placeholder:text-gray-400 dark:placeholder:text-zinc-500 focus:outline-none focus:border-blue-600 dark:focus:border-blue-500 focus:ring-2 focus:ring-blue-600/15 dark:focus:ring-blue-500/20 transition-colors resize-none"
            />
          </div>

          <div className="space-y-1.5">
            <label className="block text-[12px] font-medium text-gray-700 dark:text-zinc-300 mb-1.5">
              Internal Note (Private — Optional)
            </label>
            <textarea
              rows={4}
              value={privateNotes}
              onChange={(e) => setPrivateNotes(e.target.value)}
              placeholder="Private notes visible only to you (not printed on PDF)..."
              className="w-full min-h-[110px] p-3.5 rounded-xl bg-[#F9FAFB] dark:bg-[#121215] border border-gray-200/80 dark:border-[#27272a] text-[13px] font-medium text-gray-900 dark:text-white placeholder:font-normal placeholder:text-gray-400 dark:placeholder:text-zinc-500 focus:outline-none focus:border-blue-600 dark:focus:border-blue-500 focus:ring-2 focus:ring-blue-600/15 dark:focus:ring-blue-500/20 transition-colors resize-none"
            />
          </div>
        </div>
      </div>

      {/* Portal Add New Client Modal (Matching Add Clients_2.jpg 1:1, strictly max-w-[480px]) */}
      {isAddClientOpen && isMounted && createPortal(
        <div
          onClick={() => setIsAddClientOpen(false)}
          className="fixed -inset-y-12 inset-x-0 z-[100] w-screen min-h-[100dvh] pt-12 pb-0 sm:py-12 bg-black/60 backdrop-blur-xs flex items-end sm:items-center justify-center px-0 sm:px-4"
        >
          <div
            onClick={(e) => e.stopPropagation()}
            style={clientDragOffsetY > 0 ? { transform: `translateY(${clientDragOffsetY}px)`, transition: 'none' } : undefined}
            data-popover="true"
            className="w-full sm:max-w-[480px] max-h-[92dvh] sm:max-h-[85dvh] rounded-t-2xl sm:rounded-2xl border-t sm:border border-gray-200 dark:border-[#27272a] bg-white dark:bg-[#18181b] flex flex-col shadow-2xl overflow-hidden animate-in slide-in-from-bottom sm:zoom-in-95 duration-200"
          >
            {/* Mobile Drag Handle */}
            <div
              onTouchStart={(e) => {
                clientDragStartY.current = e.touches[0].clientY;
              }}
              onTouchMove={(e) => {
                if (clientDragStartY.current !== null) {
                  const delta = Math.max(0, e.touches[0].clientY - clientDragStartY.current);
                  setClientDragOffsetY(delta);
                }
              }}
              onTouchEnd={() => {
                if (clientDragOffsetY > 70) {
                  setIsAddClientOpen(false);
                }
                setClientDragOffsetY(0);
                clientDragStartY.current = null;
              }}
              className="sm:hidden pt-2.5 pb-1 cursor-grab active:cursor-grabbing shrink-0"
            >
              <div className="w-10 h-1 rounded-full bg-gray-300 dark:bg-zinc-700 mx-auto" />
            </div>
            <div
              onTouchStart={(e) => {
                clientDragStartY.current = e.touches[0].clientY;
              }}
              onTouchMove={(e) => {
                if (clientDragStartY.current !== null) {
                  const delta = Math.max(0, e.touches[0].clientY - clientDragStartY.current);
                  setClientDragOffsetY(delta);
                }
              }}
              onTouchEnd={() => {
                if (clientDragOffsetY > 70) {
                  setIsAddClientOpen(false);
                }
                setClientDragOffsetY(0);
                clientDragStartY.current = null;
              }}
              className="px-5 pt-2 pb-3.5 sm:px-6 sm:pt-5 sm:pb-4 border-b border-gray-100 dark:border-[#27272a] flex items-start justify-between gap-3 shrink-0"
            >
              <div>
                <h3 className="text-[17px] leading-[22px] font-semibold text-gray-900 dark:text-white">
                  Add New Client
                </h3>
                <p className="text-[13px] text-gray-500 dark:text-zinc-400 mt-0.5">
                  Enter client contact and currency details.
                </p>
              </div>
              <button
                type="button"
                onClick={() => setIsAddClientOpen(false)}
                className="w-8 h-8 rounded-lg bg-gray-100 hover:bg-gray-200/80 dark:bg-[#222226] dark:hover:bg-[#2e2e34] text-gray-500 dark:text-zinc-400 flex items-center justify-center transition-colors shrink-0 cursor-pointer"
                aria-label="Close"
              >
                <X className="h-4 w-4" strokeWidth={2} />
              </button>
            </div>

            <form onSubmit={handleModalSaveClient} className="flex flex-col flex-1 min-h-0 font-sans text-left">
              <div className="flex-1 overflow-y-auto px-5 py-4 sm:px-6 sm:py-5 space-y-4">
              {/* Client Type Radio Toggle */}
              <div className="space-y-1">
                <div className="flex items-center gap-6 pt-1">
                  <label className="inline-flex items-center gap-2 cursor-pointer text-[13px] font-medium text-gray-800 dark:text-zinc-200">
                    <input
                      type="radio"
                      name="modalClientType"
                      value="individual"
                      checked={modalClientType === 'individual'}
                      onChange={() => setModalClientType('individual')}
                      className="text-blue-600 border-blue-600 focus:ring-blue-500 h-4 w-4"
                    />
                    Individual
                  </label>
                  <label className="inline-flex items-center gap-2 cursor-pointer text-[13px] font-medium text-gray-800 dark:text-zinc-200">
                    <input
                      type="radio"
                      name="modalClientType"
                      value="business"
                      checked={modalClientType === 'business'}
                      onChange={() => setModalClientType('business')}
                      className="text-blue-600 border-blue-600 focus:ring-blue-500 h-4 w-4"
                    />
                    Business
                  </label>
                </div>
              </div>

              {/* Row 1: Names (NO asterisk!) */}
              {modalClientType === 'individual' ? (
                <div className="grid grid-cols-1 sm:grid-cols-2 gap-3.5">
                  <div>
                    <label className="block text-[12px] font-medium text-gray-700 dark:text-zinc-300 mb-1">
                      First Name
                    </label>
                    <input
                      type="text"
                      value={modalFirstName}
                      onChange={(e) => setModalFirstName(e.target.value)}
                      placeholder="Lisa"
                      className="w-full h-10 px-3.5 rounded-xl bg-[#F9FAFB] dark:bg-[#121215] border border-gray-200/80 dark:border-[#27272a] text-[13px] font-medium text-gray-900 dark:text-white placeholder:font-normal placeholder:text-gray-400 dark:placeholder:text-zinc-500 focus:outline-none focus:border-blue-600 dark:focus:border-blue-500 focus:ring-2 focus:ring-blue-600/15 dark:focus:ring-blue-500/20 transition-colors"
                    />
                  </div>
                  <div>
                    <label className="block text-[12px] font-medium text-gray-700 dark:text-zinc-300 mb-1">
                      Last Name
                    </label>
                    <input
                      type="text"
                      value={modalLastName}
                      onChange={(e) => setModalLastName(e.target.value)}
                      placeholder="Simpson"
                      className="w-full h-10 px-3.5 rounded-xl bg-[#F9FAFB] dark:bg-[#121215] border border-gray-200/80 dark:border-[#27272a] text-[13px] font-medium text-gray-900 dark:text-white placeholder:font-normal placeholder:text-gray-400 dark:placeholder:text-zinc-500 focus:outline-none focus:border-blue-600 dark:focus:border-blue-500 focus:ring-2 focus:ring-blue-600/15 dark:focus:ring-blue-500/20 transition-colors"
                    />
                  </div>
                </div>
              ) : (
                <div>
                  <label className="block text-[12px] font-medium text-gray-700 dark:text-zinc-300 mb-1">
                    Business Name
                  </label>
                  <input
                    type="text"
                    value={modalBusinessName}
                    onChange={(e) => setModalBusinessName(e.target.value)}
                    placeholder="Acme Corp"
                    className="w-full h-10 px-3.5 rounded-xl bg-[#F9FAFB] dark:bg-[#121215] border border-gray-200/80 dark:border-[#27272a] text-[13px] font-medium text-gray-900 dark:text-white placeholder:font-normal placeholder:text-gray-400 dark:placeholder:text-zinc-500 focus:outline-none focus:border-blue-600 dark:focus:border-blue-500 focus:ring-2 focus:ring-blue-600/15 dark:focus:ring-blue-500/20 transition-colors"
                  />
                </div>
              )}

              {/* Row 2: Contact (Side-by-Side 2-Column Grid on sm, stacked on mobile) */}
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-3.5">
                <div>
                  <label className="block text-[12px] font-medium text-gray-700 dark:text-zinc-300 mb-1">
                    Email Address
                  </label>
                  <input
                    type="email"
                    value={modalEmail}
                    onChange={(e) => setModalEmail(e.target.value)}
                    placeholder="lisa.simpson@gmail.com"
                    className="w-full h-10 px-3.5 rounded-xl bg-[#F9FAFB] dark:bg-[#121215] border border-gray-200/80 dark:border-[#27272a] text-[13px] font-medium text-gray-900 dark:text-white placeholder:font-normal placeholder:text-gray-400 dark:placeholder:text-zinc-500 focus:outline-none focus:border-blue-600 dark:focus:border-blue-500 focus:ring-2 focus:ring-blue-600/15 dark:focus:ring-blue-500/20 transition-colors"
                  />
                </div>
                <div>
                  <label className="block text-[12px] font-medium text-gray-700 dark:text-zinc-300 mb-1">
                    Phone Number
                  </label>
                  <input
                    type="tel"
                    value={modalPhone}
                    onChange={(e) => setModalPhone(e.target.value)}
                    placeholder="+234 000 000 0000"
                    className="w-full h-10 px-3.5 rounded-xl bg-[#F9FAFB] dark:bg-[#121215] border border-gray-200/80 dark:border-[#27272a] text-[13px] font-medium text-gray-900 dark:text-white placeholder:font-normal placeholder:text-gray-400 dark:placeholder:text-zinc-500 focus:outline-none focus:border-blue-600 dark:focus:border-blue-500 focus:ring-2 focus:ring-blue-600/15 dark:focus:ring-blue-500/20 transition-colors"
                  />
                </div>
              </div>

              {/* Row 3: Address */}
              <div>
                <label className="block text-[12px] font-medium text-gray-700 dark:text-zinc-300 mb-1">
                  Address
                </label>
                <input
                  type="text"
                  value={modalAddress}
                  onChange={(e) => setModalAddress(e.target.value)}
                  placeholder="e.g. TRX-00182"
                  className="w-full h-10 px-3.5 rounded-xl bg-[#F9FAFB] dark:bg-[#121215] border border-gray-200/80 dark:border-[#27272a] text-[13px] font-medium text-gray-900 dark:text-white placeholder:font-normal placeholder:text-gray-400 dark:placeholder:text-zinc-500 focus:outline-none focus:border-blue-600 dark:focus:border-blue-500 focus:ring-2 focus:ring-blue-600/15 dark:focus:ring-blue-500/20 transition-colors"
                />
              </div>

              {/* Row 4: Preferred Currency (Optional) Custom Popover */}
              <div className="space-y-1" ref={modalCurrencyDropdownRef}>
                <label className="block text-[12px] font-medium text-gray-700 dark:text-zinc-300 mb-1">
                  Preferred Currency (Optional)
                </label>
                <div className="relative">
                  <button
                    type="button"
                    onClick={() => setIsModalCurrencyDropdownOpen((prev) => !prev)}
                    className={cn(
                      'w-full h-10 px-3.5 rounded-xl bg-[#F9FAFB] dark:bg-[#121215] border text-[13px] font-medium text-gray-900 dark:text-white flex items-center justify-between text-left transition-colors',
                      'focus:outline-none focus:border-blue-600 dark:focus:border-blue-500 focus:ring-2 focus:ring-blue-600/15 dark:focus:ring-blue-500/20',
                      isModalCurrencyDropdownOpen
                        ? 'border-gray-300 dark:border-zinc-700 bg-[#F9FAFB] dark:bg-[#121215]'
                        : 'border-gray-200/80 dark:border-[#27272a]'
                    )}
                  >
                    <span className={modalCurrency ? 'text-gray-900 dark:text-white' : 'text-gray-400'}>
                      {modalCurrency
                        ? CURRENCIES_LIST.find((c) => c.code === modalCurrency)?.label || modalCurrency
                        : 'Select currency'}
                    </span>
                    <ChevronDown className="h-4 w-4 text-gray-400 shrink-0" />
                  </button>

                  {isModalCurrencyDropdownOpen && (
                    <div data-popover="true" className="absolute z-30 left-0 right-0 mt-1 rounded-xl border border-gray-200 dark:border-[#27272a] bg-white dark:bg-[#18181b] p-1.5 shadow-none max-h-[180px] overflow-y-auto space-y-0.5">
                      {CURRENCIES_LIST.map((c) => {
                        const isSelected = c.code === modalCurrency;
                        return (
                          <button
                            key={c.code}
                            type="button"
                            onClick={() => {
                              setModalCurrency(c.code);
                              setIsModalCurrencyDropdownOpen(false);
                            }}
                            className={cn(
                              'w-full px-3 py-2 rounded-lg text-left text-[13px] flex items-center justify-between transition-colors',
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
                  )}
                </div>
              </div>

              {/* Row 5: Note (Optional) */}
              <div>
                <label className="block text-[12px] font-medium text-gray-700 dark:text-zinc-300 mb-1">
                  Note (Optional)
                </label>
                <textarea
                  rows={2}
                  value={modalNote}
                  onChange={(e) => setModalNote(e.target.value)}
                  placeholder="Add a note..."
                  className="w-full min-h-[58px] p-2.5 rounded-xl bg-[#F9FAFB] dark:bg-[#121215] border border-gray-200/80 dark:border-[#27272a] text-[13px] font-medium text-gray-900 dark:text-white placeholder:font-normal placeholder:text-gray-400 dark:placeholder:text-zinc-500 focus:outline-none focus:border-blue-600 dark:focus:border-blue-500 focus:ring-2 focus:ring-blue-600/15 dark:focus:ring-blue-500/20 transition-colors resize-none"
                />
              </div>

              </div>
              {/* Pinned Safe-Area Footer */}
              <div className="shrink-0 px-5 pt-3.5 pb-[calc(1.25rem+env(safe-area-inset-bottom,0px))] sm:px-6 sm:py-4 border-t border-gray-100 dark:border-[#27272a] bg-white dark:bg-[#18181b] grid grid-cols-2 sm:flex sm:items-center sm:justify-end gap-3">
                <button
                  type="button"
                  onClick={() => setIsAddClientOpen(false)}
                  className="h-11 sm:h-10 w-full sm:w-auto px-4 rounded-xl border border-gray-200 dark:border-[#27272a] bg-white dark:bg-[#18181b] text-[13px] font-medium text-gray-700 dark:text-zinc-300 hover:bg-gray-50 dark:hover:bg-[#222226] transition-colors cursor-pointer inline-flex items-center justify-center"
                >
                  Cancel
                </button>
                <button
                  type="submit"
                  disabled={isSavingClient}
                  className="h-11 sm:h-10 w-full sm:w-auto px-5 rounded-xl bg-blue-600 hover:bg-blue-700 text-white text-[13px] font-medium transition-colors disabled:opacity-50 cursor-pointer inline-flex items-center justify-center"
                >
                  {isSavingClient ? 'Adding...' : 'Add New Client'}
                </button>
              </div>
            </form>
          </div>
        </div>,
        document.body
      )}
    </div>
  );
}
