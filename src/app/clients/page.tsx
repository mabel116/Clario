'use client';
 
import React, { useState, useMemo, useCallback, useEffect, Suspense } from 'react';
import { useRouter, useSearchParams } from 'next/navigation';
import { ProtectedRoute } from '../../components/ProtectedRoute';
import { AppShell } from '../../components/AppShell';
import { useClients, useClient, useClientLinks, useProfile, useInvoicesForClient, usePaymentsForClient } from '../../lib/data/hooks';
import { useDataReady, useEntityReady } from '../../lib/data/readiness';
import { RecordPaymentModal } from '../../components/RecordPaymentModal';
import { ClientRepo } from '../../lib/data/client';
import { ClientLinkRepo } from '../../lib/data/client-link';
import { formatMoney } from '../../lib/money';
import { ClientSummary, ClientDetail } from '../../lib/data/types';
import { ClientLinkRow } from '../../lib/sync/schema';
import { 
  Users, Mail, Building, Phone, Plus, Search, Edit2, Trash2, 
  ExternalLink, X, Landmark, FileText, ChevronRight, MessageSquare, Loader2 
} from 'lucide-react';

const SUPPORTED_CURRENCIES = ['USD', 'EUR', 'GBP', 'NGN', 'KES', 'GHS', 'ZAR', 'CAD', 'AUD', 'INR', 'JPY', 'KRW'];

interface ClientFormFields {
  name: string;
  email: string | null;
  phone: string | null;
  company: string | null;
  notes: string | null;
  default_currency: string;
}

interface LinkFormFields {
  label: string;
  url: string;
}

export default function ClientsPage() {
  return (
    <ProtectedRoute>
      <AppShell>
        <Suspense fallback={
          <div className="py-20 flex flex-col items-center justify-center text-slate-500 gap-3">
            <Loader2 className="h-8 w-8 animate-spin text-indigo-500" />
            <p className="text-sm font-semibold">Initializing clients view...</p>
          </div>
        }>
          <ClientsDashboard />
        </Suspense>
      </AppShell>
    </ProtectedRoute>
  );
}

function ClientsDashboard() {
  const router = useRouter();
  const searchParams = useSearchParams();
  const queryClientId = searchParams?.get('id') || searchParams?.get('clientId') || null;

  const { data: clients } = useClients();
  const { data: profile } = useProfile();

  // Unified readiness gate for master list (ADR 036)
  const hasClientsData = clients !== undefined && clients.length > 0;
  const { isLoading, isConfirmedEmpty } = useDataReady(hasClientsData, ClientRepo.isEmpty);

  // Search and selection states
  const [searchQuery, setSearchQuery] = useState('');
  const [selectedClientId, setSelectedClientId] = useState<string | null>(queryClientId);

  // Synchronize selection state if URL search params change externally
  useEffect(() => {
    if (queryClientId !== selectedClientId) {
      setSelectedClientId(queryClientId);
    }
  }, [queryClientId]);

  // Synchronize selection state with URL query parameters
  const handleSelectClient = useCallback((id: string | null) => {
    setSelectedClientId(id);
    if (id) {
      router.replace(`/clients?id=${encodeURIComponent(id)}`, { scroll: false });
    } else {
      router.replace('/clients', { scroll: false });
    }
  }, [router]);

  // Modals visibility states
  const [showAddClient, setShowAddClient] = useState(false);
  const [showEditClient, setShowEditClient] = useState<ClientDetail | null>(null); // holds client object to edit
  const [showAddLink, setShowAddLink] = useState(false);
  const [showEditLink, setShowEditLink] = useState<ClientLinkRow | null>(null); // holds link object to edit

  // Live queries for selected client details
  const { data: selectedClientDetail } = useClient(selectedClientId);
  const { data: selectedClientLinks } = useClientLinks(selectedClientId);
  const { data: selectedClientInvoices, isLoading: isInvoicesLoading } = useInvoicesForClient(selectedClientId);
  const { data: selectedClientPayments, isLoading: isPaymentsLoading } = usePaymentsForClient(selectedClientId);

  // Readiness gate for selected client detail (ADR 036, 037, 038)
  const checkClientExists = useCallback(
    () => (selectedClientId ? ClientRepo.exists(selectedClientId) : Promise.resolve(false)),
    [selectedClientId]
  );
  const hasSelectedClient = selectedClientDetail !== null && selectedClientDetail !== undefined;
  const { isLoading: isDetailLoading, isNotFound: isDetailNotFound } = useEntityReady(
    hasSelectedClient,
    checkClientExists,
    selectedClientId
  );

  // Atomic drawer readiness: hold skeleton until both client detail and invoices have resolved (ADR 036)
  const isDrawerLoading = !isDetailNotFound && (
    isDetailLoading ||
    isInvoicesLoading ||
    selectedClientInvoices === undefined ||
    !selectedClientDetail
  );

  const [showRecordPayment, setShowRecordPayment] = useState(false);
  const [quickRecordInvoiceId, setQuickRecordInvoiceId] = useState<string | null>(null);
  const [invoiceFilter, setInvoiceFilter] = useState<'all' | 'outstanding' | 'overdue' | 'paid' | 'draft'>('all');
  const [showAllPayments, setShowAllPayments] = useState(false);

  // Compute multi-currency summary dynamically with default currency sorting
  const financialSummary = useMemo(() => {
    if (!selectedClientInvoices) return [];
    
    const summaryMap = new Map<string, {
      currency: string;
      outstandingMinor: number;
      overdueMinor: number;
      paidMinor: number;
      outstandingCount: number;
      overdueCount: number;
    }>();

    for (const inv of selectedClientInvoices) {
      if (inv.displayStatus === 'void') continue;

      const curr = inv.currency.toUpperCase();
      if (!summaryMap.has(curr)) {
        summaryMap.set(curr, {
          currency: curr,
          outstandingMinor: 0,
          overdueMinor: 0,
          paidMinor: 0,
          outstandingCount: 0,
          overdueCount: 0
        });
      }

      const val = summaryMap.get(curr)!;
      val.paidMinor += inv.amountPaidMinor;

      if (inv.balanceDueMinor > 0) {
        val.outstandingMinor += inv.balanceDueMinor;
        val.outstandingCount += 1;

        if (inv.displayStatus === 'overdue') {
          val.overdueMinor += inv.balanceDueMinor;
          val.overdueCount += 1;
        }
      }
    }

    const list = Array.from(summaryMap.values());

    const defaultCurrency = (profile?.default_currency || 'USD').toUpperCase();
    list.sort((a, b) => {
      if (a.currency === defaultCurrency && b.currency !== defaultCurrency) return -1;
      if (a.currency !== defaultCurrency && b.currency === defaultCurrency) return 1;
      return b.outstandingMinor - a.outstandingMinor;
    });

    return list;
  }, [selectedClientInvoices, profile?.default_currency]);

  // Compute filter counts
  const filterCounts = useMemo(() => {
    const counts = { all: 0, outstanding: 0, overdue: 0, paid: 0, draft: 0 };
    if (!selectedClientInvoices) return counts;
    
    for (const inv of selectedClientInvoices) {
      counts.all += 1;
      if ((inv.displayStatus === 'sent' || inv.displayStatus === 'overdue') && inv.balanceDueMinor > 0) {
        counts.outstanding += 1;
      }
      if (inv.displayStatus === 'overdue' && inv.balanceDueMinor > 0) {
        counts.overdue += 1;
      }
      if (inv.displayStatus === 'paid') {
        counts.paid += 1;
      }
      if (inv.displayStatus === 'draft') {
        counts.draft += 1;
      }
    }
    return counts;
  }, [selectedClientInvoices]);

  // Filter and sort invoices
  const filteredAndSortedInvoices = useMemo(() => {
    if (!selectedClientInvoices) return [];
    
    const filtered = selectedClientInvoices.filter((inv) => {
      switch (invoiceFilter) {
        case 'outstanding':
          return (inv.displayStatus === 'sent' || inv.displayStatus === 'overdue') && inv.balanceDueMinor > 0;
        case 'overdue':
          return inv.displayStatus === 'overdue' && inv.balanceDueMinor > 0;
        case 'paid':
          return inv.displayStatus === 'paid';
        case 'draft':
          return inv.displayStatus === 'draft';
        case 'all':
        default:
          return true;
      }
    });

    return [...filtered].sort((a, b) => {
      const isUnpaidOrOverdue = (inv: typeof a) => {
        return (inv.displayStatus === 'sent' || inv.displayStatus === 'overdue') && inv.balanceDueMinor > 0;
      };
      const aUnpaid = isUnpaidOrOverdue(a);
      const bUnpaid = isUnpaidOrOverdue(b);

      if (aUnpaid && !bUnpaid) return -1;
      if (!aUnpaid && bUnpaid) return 1;

      const dateA = a.issue_date || '';
      const dateB = b.issue_date || '';
      if (dateA === dateB) {
        return b.invoice_number.localeCompare(a.invoice_number);
      }
      return dateB.localeCompare(dateA);
    });
  }, [selectedClientInvoices, invoiceFilter]);

  // Slice payments list to show first 10 unless showAllPayments is true
  const displayedPayments = useMemo(() => {
    if (!selectedClientPayments) return [];
    if (showAllPayments) return selectedClientPayments;
    return selectedClientPayments.slice(0, 10);
  }, [selectedClientPayments, showAllPayments]);

  const handleQuickRecordPayment = (e: React.MouseEvent, invoiceId: string) => {
    e.stopPropagation();
    setQuickRecordInvoiceId(invoiceId);
    setShowRecordPayment(true);
  };

  // Alphabetically sorted and filtered clients
  const filteredClients = useMemo(() => {
    if (!clients) return [];
    
    // Sort alphabetically
    const sorted = [...clients].sort((a, b) => a.name.localeCompare(b.name));
    
    if (!searchQuery.trim()) return sorted;
    
    const query = searchQuery.toLowerCase().trim();
    return sorted.filter(c => 
      c.name.toLowerCase().includes(query) ||
      (c.company && c.company.toLowerCase().includes(query)) ||
      (c.email && c.email.toLowerCase().includes(query))
    );
  }, [clients, searchQuery]);

  // Client CRUD Handlers
  const handleCreateClient = async (fields: ClientFormFields) => {
    try {
      const id = await ClientRepo.create({
        name: fields.name,
        email: fields.email || null,
        phone: fields.phone || null,
        company: fields.company || null,
        notes: fields.notes || null,
        default_currency: fields.default_currency || profile?.default_currency || 'USD'
      });
      setShowAddClient(false);
      handleSelectClient(id); // auto-select new client
    } catch (err: unknown) {
      const message = err instanceof Error ? err.message : 'Failed to create client.';
      alert(message);
    }
  };

  const handleUpdateClient = async (id: string, fields: ClientFormFields) => {
    try {
      await ClientRepo.update(id, {
        name: fields.name,
        email: fields.email || null,
        phone: fields.phone || null,
        company: fields.company || null,
        notes: fields.notes || null,
        default_currency: fields.default_currency || null
      });
      setShowEditClient(null);
    } catch (err: unknown) {
      const message = err instanceof Error ? err.message : 'Failed to update client.';
      alert(message);
    }
  };

  const handleDeleteClient = async (id: string) => {
    if (!confirm('Are you sure you want to delete this client? Invoices and ledger records will be preserved.')) {
      return;
    }
    try {
      await ClientRepo.softDelete(id);
      if (selectedClientId === id) {
        handleSelectClient(null);
      }
    } catch (err: unknown) {
      const message = err instanceof Error ? err.message : 'Failed to delete client.';
      alert(message);
    }
  };

  // Document Link CRUD Handlers
  const handleAddLink = async (fields: LinkFormFields) => {
    if (!selectedClientId) return;
    try {
      await ClientLinkRepo.add(selectedClientId, fields.label, fields.url);
      setShowAddLink(false);
    } catch (err: unknown) {
      const message = err instanceof Error ? err.message : 'Failed to add link.';
      alert(message);
    }
  };

  const handleUpdateLink = async (id: string, fields: LinkFormFields) => {
    try {
      await ClientLinkRepo.update(id, {
        label: fields.label,
        url: fields.url
      });
      setShowEditLink(null);
    } catch (err: unknown) {
      const message = err instanceof Error ? err.message : 'Failed to update link.';
      alert(message);
    }
  };

  const handleDeleteLink = async (id: string) => {
    if (!confirm('Remove this document link?')) return;
    try {
      await ClientLinkRepo.softDelete(id);
    } catch (err: unknown) {
      const message = err instanceof Error ? err.message : 'Failed to delete link.';
      alert(message);
    }
  };

  return (
    <div className="h-[calc(100vh-6.5rem)] flex flex-col md:flex-row gap-6 relative">
      {/* Client List Section (Left Master Panel) */}
      <div className={`flex-1 flex flex-col min-w-0 transition-all duration-300 ${selectedClientId ? 'hidden md:flex' : 'flex'}`}>
        <div className="flex items-center justify-between mb-6">
          <div>
            <h1 className="text-3xl font-bold tracking-tight text-white flex items-center gap-3">
              <Users className="h-8 w-8 text-indigo-500" />
              Clients
            </h1>
            <p className="text-sm text-slate-400 mt-1">Manage client profiles and document links</p>
          </div>
          <button
            onClick={() => setShowAddClient(true)}
            className="inline-flex justify-center items-center gap-1.5 rounded-lg bg-indigo-600 px-4 py-2.5 text-xs font-semibold text-white hover:bg-indigo-500 transition shadow-lg shadow-indigo-600/20"
          >
            <Plus className="h-4 w-4" /> Add Client
          </button>
        </div>

        {/* Search Input */}
        <div className="relative mb-6">
          <span className="absolute inset-y-0 left-0 pl-3.5 flex items-center pointer-events-none text-slate-500">
            <Search className="h-4.5 w-4.5" />
          </span>
          <input
            type="text"
            placeholder="Search by name, company or email..."
            value={searchQuery}
            onChange={(e) => setSearchQuery(e.target.value)}
            className="block w-full rounded-xl border border-slate-800 bg-slate-950/40 py-3 pl-11 pr-4 text-sm text-white placeholder-slate-600 focus:border-indigo-500 focus:ring-1 focus:ring-indigo-500 focus:outline-none transition backdrop-blur-xl"
          />
        </div>

        {/* Clients Grid/List */}
        {isLoading ? (
          <div className="flex-1 space-y-4">
            <div className="rounded-2xl border border-slate-900 bg-slate-900/10 p-6 animate-pulse h-24"></div>
            <div className="rounded-2xl border border-slate-900 bg-slate-900/10 p-6 animate-pulse h-24"></div>
          </div>
        ) : isConfirmedEmpty === true ? (
          <div className="flex-1 flex flex-col items-center justify-center border border-dashed border-slate-800 rounded-3xl p-12 text-center max-w-md mx-auto space-y-5">
            <div className="flex h-14 w-14 items-center justify-center rounded-2xl bg-indigo-950/40 text-indigo-400">
              <Users className="h-7 w-7" />
            </div>
            <div>
              <h3 className="text-lg font-bold text-white">Add your first client</h3>
              <p className="text-sm text-slate-400 mt-2 leading-relaxed">
                Build your client database to quickly issue invoices, track custom drive folders, and review outstanding ledgers.
              </p>
            </div>
            <button
              onClick={() => setShowAddClient(true)}
              className="inline-flex justify-center items-center gap-1.5 rounded-lg bg-indigo-600 px-5 py-3 text-xs font-semibold text-white hover:bg-indigo-500 transition shadow-lg shadow-indigo-600/20"
            >
              <Plus className="h-4 w-4" /> Create Client Profile
            </button>
          </div>
        ) : filteredClients.length > 0 ? (
          <div className="flex-1 overflow-y-auto space-y-3 pr-2 scrollbar-thin scrollbar-thumb-slate-800 scrollbar-track-transparent">
            {filteredClients.map((client) => (
              <div
                key={client.id}
                onClick={() => handleSelectClient(client.id)}
                className={`rounded-2xl border p-5 transition flex items-center justify-between group cursor-pointer ${
                  selectedClientId === client.id 
                    ? 'border-indigo-500/80 bg-indigo-950/10 shadow-lg shadow-indigo-500/5' 
                    : 'border-slate-900 bg-slate-950/20 hover:border-slate-800'
                }`}
              >
                <div className="min-w-0 space-y-2.5">
                  <div className="flex items-center gap-3">
                    <h3 className="font-bold text-white text-base truncate group-hover:text-indigo-400 transition">{client.name}</h3>
                    {client.default_currency && (
                      <span className="inline-flex rounded bg-slate-900 border border-slate-800 px-1.5 py-0.5 text-[10px] font-bold text-slate-400 uppercase">
                        {client.default_currency}
                      </span>
                    )}
                  </div>

                  <div className="flex flex-wrap gap-x-4 gap-y-1.5 text-xs text-slate-500">
                    {client.company && (
                      <span className="flex items-center gap-1.5">
                        <Building className="h-3.5 w-3.5" />
                        {client.company}
                      </span>
                    )}
                    {client.email && (
                      <span className="flex items-center gap-1.5">
                        <Mail className="h-3.5 w-3.5" />
                        {client.email}
                      </span>
                    )}
                  </div>
                </div>

                <ChevronRight className="h-5 w-5 text-slate-600 group-hover:text-slate-400 group-hover:translate-x-0.5 transition" />
              </div>
            ))}
          </div>
        ) : (
          <div className="flex-1 flex flex-col items-center justify-center border border-dashed border-slate-800 rounded-3xl p-12 text-center max-w-md mx-auto space-y-4">
            <div className="flex h-12 w-12 items-center justify-center rounded-2xl bg-slate-900 border border-slate-800 text-slate-400">
              <Search className="h-6 w-6" />
            </div>
            <div>
              <h3 className="text-base font-bold text-white">No matching clients found</h3>
              <p className="text-xs text-slate-400 mt-1 leading-relaxed">
                No client records match your search for &quot;<span className="text-white font-medium">{searchQuery}</span>&quot;.
              </p>
            </div>
            <button
              onClick={() => setSearchQuery('')}
              className="inline-flex items-center gap-1.5 text-xs font-semibold text-indigo-400 hover:text-indigo-300 transition"
            >
              Clear Search Query
            </button>
          </div>
        )}
      </div>

      {/* Client Details Section (Right Detail Panel / Mobile Slide-over) */}
      {selectedClientId && (
        <div className="w-full md:w-[26rem] lg:w-[32rem] shrink-0 border border-slate-900 bg-slate-950/30 rounded-3xl flex flex-col overflow-hidden backdrop-blur-2xl absolute md:relative inset-0 md:inset-auto z-10 animate-slide-in">
          {/* Details Header */}
          <div className="p-6 border-b border-slate-900/60 flex items-center justify-between">
            <button
              onClick={() => handleSelectClient(null)}
              className="inline-flex items-center gap-1 text-xs text-slate-400 hover:text-white transition md:hidden"
            >
              <X className="h-4 w-4" /> Back to Clients
            </button>
            <span className="hidden md:inline text-xs font-semibold text-indigo-400">Client Profile Details</span>

            <div className="flex items-center gap-3">
              {selectedClientDetail && (
                <>
                  <button
                    onClick={() => setShowEditClient(selectedClientDetail)}
                    className="p-2 rounded-lg bg-slate-900 border border-slate-800 text-slate-400 hover:text-white hover:border-slate-700 transition"
                    title="Edit Client"
                  >
                    <Edit2 className="h-4 w-4" />
                  </button>
                  <button
                    onClick={() => handleDeleteClient(selectedClientDetail.id)}
                    className="p-2 rounded-lg bg-red-950/20 border border-red-900/40 text-red-400 hover:text-red-300 hover:border-red-800 transition"
                    title="Delete Client"
                  >
                    <Trash2 className="h-4 w-4" />
                  </button>
                </>
              )}
              <button
                onClick={() => handleSelectClient(null)}
                className="hidden md:block p-2 rounded-lg bg-slate-900 border border-slate-800 text-slate-400 hover:text-white transition"
              >
                <X className="h-4 w-4" />
              </button>
            </div>
          </div>

          {isDrawerLoading ? (
            <div className="flex-1 overflow-y-auto p-6 space-y-6 animate-pulse text-left">
              {/* Header skeleton */}
              <div className="space-y-2">
                <div className="h-7 bg-slate-800/60 rounded-lg w-3/4" />
                <div className="h-4 bg-slate-900 rounded w-1/2" />
              </div>
              {/* Financial summary card skeleton */}
              <div className="rounded-2xl border border-slate-900 bg-slate-950/40 p-5 space-y-3">
                <div className="h-3 bg-slate-800/50 rounded w-1/3" />
                <div className="h-8 bg-slate-800/80 rounded w-1/2" />
                <div className="h-3 bg-slate-900 rounded w-2/3" />
              </div>
              {/* Invoices list skeleton */}
              <div className="space-y-3">
                <div className="h-4 bg-slate-900 rounded w-1/4" />
                <div className="h-16 bg-slate-900/40 rounded-xl border border-slate-900/50" />
                <div className="h-16 bg-slate-900/40 rounded-xl border border-slate-900/50" />
              </div>
            </div>
          ) : isDetailNotFound ? (
            <div className="flex-1 flex flex-col items-center justify-center p-8 text-center space-y-4">
              <div className="w-12 h-12 rounded-2xl bg-red-950/40 border border-red-900/50 flex items-center justify-center text-red-400 mb-1">
                <Users className="h-6 w-6" />
              </div>
              <h3 className="text-lg font-bold text-white">Client Record Not Found</h3>
              <p className="text-xs text-slate-400 max-w-xs">
                This client could not be found locally. It may have been deleted or the identifier is invalid.
              </p>
              <button
                onClick={() => handleSelectClient(null)}
                className="px-4 py-2 rounded-xl bg-slate-900 border border-slate-800 text-xs font-semibold text-indigo-400 hover:text-indigo-300 hover:border-slate-700 transition"
              >
                Back to Clients List
              </button>
            </div>
          ) : selectedClientDetail ? (
            <div className="flex-1 overflow-y-auto p-6 space-y-6 scrollbar-thin scrollbar-thumb-slate-800 scrollbar-track-transparent text-left">
            {/* 1. Header & Outstanding balances (Prominent) */}
            <div className="space-y-4">
              <div>
                <h2 className="text-2xl font-extrabold text-white leading-tight">{selectedClientDetail.name}</h2>
                {selectedClientDetail.company && (
                  <p className="text-sm font-semibold text-slate-400 mt-1">{selectedClientDetail.company}</p>
                )}
              </div>

              {/* Outstanding per currency summary */}
              <div className="space-y-3">
                {(() => {
                  if (isInvoicesLoading || !selectedClientInvoices) {
                    return (
                      <div className="rounded-2xl border border-slate-900 bg-slate-950/40 p-5 space-y-3 animate-pulse">
                        <div className="h-3 bg-slate-800/50 rounded w-1/3" />
                        <div className="h-8 bg-slate-800/80 rounded w-1/2" />
                      </div>
                    );
                  }
                  const activeBalances = financialSummary.filter(s => s.outstandingMinor > 0);
                  if (activeBalances.length > 0) {
                    return activeBalances.map((sum) => {
                      const overdueText = sum.overdueCount > 0 
                        ? ` · ${sum.overdueCount} overdue` 
                        : '';
                      return (
                        <div key={sum.currency} className="rounded-2xl border border-slate-900 bg-gradient-to-br from-indigo-950/20 to-slate-950/20 p-5 space-y-1 hover:border-slate-800 transition">
                          <span className="text-[10px] font-extrabold text-indigo-400 uppercase tracking-widest block">
                            Outstanding Balance ({sum.currency})
                          </span>
                          <div className="flex justify-between items-baseline">
                            <span className="text-3xl font-black text-white tracking-tight">
                              {formatMoney({ amountMinor: sum.outstandingMinor, currency: sum.currency })}
                            </span>
                            <span className="text-xs text-slate-400 font-semibold">
                              {sum.outstandingCount} {sum.outstandingCount === 1 ? 'invoice' : 'invoices'}{overdueText}
                            </span>
                          </div>
                          <div className="pt-2 border-t border-slate-900/40 text-[10px] text-slate-500 font-semibold">
                            Total paid to date: {formatMoney({ amountMinor: sum.paidMinor, currency: sum.currency })}
                          </div>
                        </div>
                      );
                    });
                  } else {
                    return (
                      <div className="rounded-2xl border border-green-950/20 bg-green-950/5 p-4 flex items-center gap-3 text-green-400">
                        <div className="h-2 w-2 rounded-full bg-green-500 animate-pulse" />
                        <span className="text-xs font-bold uppercase tracking-wider">Settled — No Outstanding Balance</span>
                      </div>
                    );
                  }
                })()}
              </div>
            </div>

            {/* 2. Invoices Section with Filters */}
            <div className="space-y-4">
              <div className="flex items-center justify-between">
                <h4 className="text-xs font-bold text-slate-500 uppercase tracking-widest flex items-center gap-1.5">
                  <FileText className="h-4 w-4 text-indigo-400" />
                  Invoices
                </h4>
                <button
                  onClick={() => router.push(`/clients/${selectedClientId}/invoices/new`)}
                  className="inline-flex items-center gap-1 rounded bg-slate-900 border border-slate-800 hover:border-slate-700 px-2.5 py-1.5 text-xs font-semibold text-slate-300 transition"
                >
                  <Plus className="h-3 w-3" /> New Invoice
                </button>
              </div>

              {/* Filter Tabs */}
              <div className="flex flex-wrap gap-1.5 border-b border-slate-900 pb-2">
                {(['all', 'outstanding', 'overdue', 'paid', 'draft'] as const).map((tab) => {
                  const count = filterCounts[tab];
                  const label = tab.charAt(0).toUpperCase() + tab.slice(1);
                  const isActive = invoiceFilter === tab;
                  return (
                    <button
                      key={tab}
                      onClick={() => setInvoiceFilter(tab)}
                      className={`px-2.5 py-1 rounded-lg text-xs font-bold transition flex items-center gap-1.5 ${
                        isActive
                          ? 'bg-indigo-600/10 border border-indigo-500/30 text-indigo-400'
                          : 'bg-transparent text-slate-500 border border-transparent hover:text-slate-300'
                      }`}
                    >
                      {label}
                      <span className={`px-1 rounded text-[10px] font-extrabold ${isActive ? 'bg-indigo-500/20 text-indigo-400' : 'bg-slate-900 text-slate-500'}`}>
                        {count}
                      </span>
                    </button>
                  );
                })}
              </div>

              {isInvoicesLoading || !selectedClientInvoices ? (
                <div className="space-y-3 animate-pulse">
                  <div className="h-16 bg-slate-900/40 rounded-xl border border-slate-900/50" />
                  <div className="h-16 bg-slate-900/40 rounded-xl border border-slate-900/50" />
                </div>
              ) : filteredAndSortedInvoices.length > 0 ? (
                <div className="space-y-2.5">
                  {filteredAndSortedInvoices.map((inv) => {
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
                        className="p-4 rounded-2xl border border-slate-900 bg-slate-950/30 hover:border-slate-800 transition cursor-pointer flex items-center justify-between gap-4 group text-left"
                      >
                        <div className="space-y-1 min-w-0">
                          <div className="flex items-center gap-2">
                            <span className="text-xs font-bold text-white group-hover:text-indigo-400 transition truncate">
                              {inv.invoice_number}
                            </span>
                            <span
                              className={`px-2 py-0.5 rounded-full text-[10px] font-extrabold uppercase border ${statusColors[inv.displayStatus]}`}
                              aria-label={`Status: ${badgeText[inv.displayStatus]}`}
                            >
                              {badgeText[inv.displayStatus]}
                            </span>
                          </div>
                          <div className="text-[10px] text-slate-500 font-semibold">
                            {inv.issue_date ? `Issued: ${inv.issue_date}` : 'Draft'}
                            {inv.due_date ? ` · Due: ${inv.due_date}` : ''}
                          </div>
                        </div>

                        <div className="flex items-center gap-3.5 shrink-0">
                          <div className="text-right">
                            <div className="text-sm font-extrabold text-white">
                              {formatMoney({ amountMinor: inv.total_minor, currency: inv.currency })}
                            </div>
                            {inv.balanceDueMinor > 0 && inv.displayStatus !== 'void' && (
                              <div className="text-[10px] text-slate-400">
                                Due: {formatMoney({ amountMinor: inv.balanceDueMinor, currency: inv.currency })}
                              </div>
                            )}
                          </div>

                          {/* Quick Record Payment Action Button */}
                          {inv.balanceDueMinor > 0 && (inv.displayStatus === 'sent' || inv.displayStatus === 'overdue') && (
                            <button
                              onClick={(e) => handleQuickRecordPayment(e, inv.id)}
                              className="p-1.5 rounded-lg bg-indigo-600/10 border border-indigo-500/20 text-indigo-400 hover:bg-indigo-600 hover:text-white hover:border-indigo-500 transition shadow-sm"
                              title="Record payment for this invoice"
                              aria-label={`Record payment for invoice ${inv.invoice_number}`}
                            >
                              <Plus className="h-3.5 w-3.5" />
                            </button>
                          )}
                        </div>
                      </div>
                    );
                  })}
                </div>
              ) : (
                <div className="rounded-xl border border-dashed border-slate-900 p-6 text-center">
                  <p className="text-xs text-slate-500">No invoices match this filter.</p>
                </div>
              )}
            </div>

            {/* 3. Payment History Section */}
            <div className="space-y-4 font-sans text-left">
              <div className="flex items-center justify-between">
                <h4 className="text-xs font-bold text-slate-500 uppercase tracking-widest flex items-center gap-1.5">
                  <Landmark className="h-4 w-4 text-indigo-400" />
                  Payment History
                </h4>
                {selectedClientInvoices && selectedClientInvoices.some(inv => inv.displayStatus !== 'draft' && inv.displayStatus !== 'void') && (
                  <button
                    onClick={() => setShowRecordPayment(true)}
                    className="inline-flex items-center gap-1 rounded bg-slate-900 border border-slate-800 hover:border-slate-700 px-2.5 py-1.5 text-xs font-semibold text-slate-300 transition"
                  >
                    <Plus className="h-3 w-3" /> Record Payment
                  </button>
                )}
              </div>

              {selectedClientPayments && selectedClientPayments.length > 0 ? (
                <div className="space-y-2.5">
                  {displayedPayments.map((pmt) => {
                    const isReversal = !!pmt.reverses_id || pmt.amount_minor < 0;
                    const invRef = selectedClientInvoices?.find(i => i.id === pmt.invoice_id);

                    return (
                      <div
                        key={pmt.id}
                        className={`rounded-xl border p-3.5 flex items-center justify-between transition ${
                          isReversal
                            ? 'border-red-950/40 bg-red-950/5'
                            : 'border-slate-900/60 bg-slate-950/20'
                        }`}
                      >
                        <div className="min-w-0 pr-3 space-y-1">
                          <div className="flex items-center gap-2">
                            <span className={`font-extrabold text-sm ${isReversal ? 'text-red-400' : 'text-white'}`}>
                              {isReversal ? '-' : ''}
                              {formatMoney({ amountMinor: Math.abs(pmt.amount_minor), currency: pmt.currency })}
                            </span>
                            {isReversal && (
                              <span className="inline-flex rounded bg-red-950 border border-red-900/50 px-1 py-0.2 text-[8px] font-bold text-red-400 uppercase">
                                Reversal
                              </span>
                            )}
                            {invRef && (
                              <button
                                onClick={() => router.push(`/invoices/${pmt.invoice_id}`)}
                                className="inline-flex items-center gap-0.5 text-[10px] text-indigo-400 font-mono border-b border-indigo-400/20 hover:border-indigo-400 hover:text-indigo-300 transition"
                                title="View invoice details"
                              >
                                {invRef.invoice_number}
                                <ExternalLink className="h-2.5 w-2.5 opacity-60" />
                              </button>
                            )}
                          </div>
                          <div className="text-[10px] text-slate-500">
                            {pmt.occurred_at} · {pmt.method ? pmt.method.replace('_', ' ') : 'other'}
                            {pmt.note ? ` · ${pmt.note}` : ''}
                          </div>
                        </div>
                      </div>
                    );
                  })}

                  {selectedClientPayments.length > 10 && (
                    <button
                      onClick={() => setShowAllPayments(!showAllPayments)}
                      className="w-full text-center py-2 text-xs font-semibold text-indigo-400 hover:text-indigo-300 transition"
                    >
                      {showAllPayments ? 'Show less' : `Show all (${selectedClientPayments.length})`}
                    </button>
                  )}
                </div>
              ) : (
                <div className="rounded-xl border border-dashed border-slate-900 p-6 text-center">
                  <p className="text-xs text-slate-500">No payment history recorded.</p>
                </div>
              )}
            </div>

            {/* 4. Supporting Context Section (Visually Quieter) */}
            <div className="border-t border-slate-900 pt-6 space-y-6">
              <h4 className="text-xs font-bold text-slate-600 uppercase tracking-widest">
                Supporting Context
              </h4>

              {/* Contact Details Grid */}
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-4 text-xs text-slate-500">
                {selectedClientDetail.email && (
                  <a
                    href={`mailto:${selectedClientDetail.email}`}
                    className="flex items-center gap-2 bg-slate-950/10 border border-slate-900/50 hover:border-slate-800 hover:text-indigo-400 p-3 rounded-xl transition"
                  >
                    <Mail className="h-4 w-4 text-slate-600 shrink-0" />
                    <span className="truncate">{selectedClientDetail.email}</span>
                  </a>
                )}
                {selectedClientDetail.phone && (
                  <a
                    href={`tel:${selectedClientDetail.phone}`}
                    className="flex items-center gap-2 bg-slate-950/10 border border-slate-900/50 hover:border-slate-800 hover:text-indigo-400 p-3 rounded-xl transition"
                  >
                    <Phone className="h-4 w-4 text-slate-600 shrink-0" />
                    <span>{selectedClientDetail.phone}</span>
                  </a>
                )}
              </div>

              {/* Notes */}
              {selectedClientDetail.notes && (
                <div className="rounded-xl border border-slate-900 bg-slate-950/10 p-3.5 space-y-1.5 text-left">
                  <span className="text-[9px] font-extrabold text-slate-500 uppercase tracking-widest flex items-center gap-1">
                    <MessageSquare className="h-3 w-3" />
                    Internal Notes
                  </span>
                  <p className="text-xs text-slate-400 whitespace-pre-line leading-relaxed">{selectedClientDetail.notes}</p>
                </div>
              )}

              {/* Document Links Section */}
              <div className="space-y-4">
                <div className="flex items-center justify-between">
                  <h4 className="text-xs font-bold text-slate-500 uppercase tracking-widest flex items-center gap-1.5">
                    <FileText className="h-4 w-4 text-indigo-400" />
                    Document Links
                  </h4>
                  <button
                    onClick={() => setShowAddLink(true)}
                    className="inline-flex items-center gap-1 rounded bg-slate-900 border border-slate-800 hover:border-slate-700 px-2.5 py-1.5 text-xs font-semibold text-slate-300 transition"
                  >
                    <Plus className="h-3 w-3" /> Add Link
                  </button>
                </div>

                {/* Links Grid */}
                {selectedClientLinks && selectedClientLinks.length > 0 ? (
                  <div className="space-y-2.5">
                    {selectedClientLinks.map((link) => (
                      <div
                        key={link.id}
                        className="rounded-xl border border-slate-900/60 bg-slate-950/20 p-3.5 flex items-center justify-between group hover:border-slate-800 transition"
                      >
                        <div className="min-w-0 pr-3">
                          <span className="block font-bold text-sm text-white truncate">{link.label}</span>
                          <a
                            href={link.url}
                            target="_blank"
                            rel="noopener noreferrer"
                            className="inline-flex items-center gap-1.5 text-xs text-slate-500 hover:text-indigo-400 hover:underline transition truncate max-w-full mt-1.5"
                          >
                            {link.url}
                            <ExternalLink className="h-3 w-3" />
                          </a>
                        </div>

                        <div className="flex items-center gap-2 opacity-0 group-hover:opacity-100 transition-opacity">
                          <button
                            onClick={() => setShowEditLink(link)}
                            className="p-1.5 rounded hover:bg-slate-900 text-slate-500 hover:text-white transition"
                          >
                            <Edit2 className="h-3.5 w-3.5" />
                          </button>
                          <button
                            onClick={() => handleDeleteLink(link.id)}
                            className="p-1.5 rounded hover:bg-red-950/20 text-slate-500 hover:text-red-400 transition"
                          >
                            <Trash2 className="h-3.5 w-3.5" />
                          </button>
                        </div>
                      </div>
                    ))}
                  </div>
                ) : (
                  <div className="rounded-xl border border-dashed border-slate-900 p-6 text-center space-y-2">
                    <p className="text-xs text-slate-500">No document links attached to this client.</p>
                    <p className="text-[10px] text-slate-600">Link shared Google Drive folders, specifications, or agreements.</p>
                  </div>
                )}
              </div>
            </div>
          </div>
        ) : null}
      </div>
    )}

      {/* Add Client Dialog Modal */}
      {showAddClient && (
        <ClientFormModal
          title="Create Client"
          defaultCurrency={profile?.default_currency || 'USD'}
          onClose={() => setShowAddClient(false)}
          onSubmit={handleCreateClient}
        />
      )}

      {/* Edit Client Dialog Modal */}
      {showEditClient && (
        <ClientFormModal
          title="Edit Client"
          client={showEditClient}
          onClose={() => setShowEditClient(null)}
          onSubmit={(fields: ClientFormFields) => handleUpdateClient(showEditClient.id, fields)}
        />
      )}

      {/* Add Link Dialog Modal */}
      {showAddLink && (
        <LinkFormModal
          title="Add Document Link"
          onClose={() => setShowAddLink(false)}
          onSubmit={handleAddLink}
        />
      )}

      {/* Edit Link Dialog Modal */}
      {showEditLink && (
        <LinkFormModal
          title="Edit Document Link"
          link={showEditLink}
          onClose={() => setShowEditLink(null)}
          onSubmit={(fields: LinkFormFields) => handleUpdateLink(showEditLink.id, fields)}
        />
      )}

      {showRecordPayment && (
        <RecordPaymentModal
          clientId={selectedClientId || ''}
          invoiceId={quickRecordInvoiceId || undefined}
          onClose={() => {
            setShowRecordPayment(false);
            setQuickRecordInvoiceId(null);
          }}
        />
      )}
    </div>
  );
}

interface ClientFormModalProps {
  title: string;
  client?: ClientSummary | ClientDetail;
  defaultCurrency?: string;
  onClose: () => void;
  onSubmit: (fields: ClientFormFields) => void;
}

// Client Form Modal Component
function ClientFormModal({ title, client, defaultCurrency, onClose, onSubmit }: ClientFormModalProps) {
  const [name, setName] = useState(client?.name || '');
  const [email, setEmail] = useState(client?.email || '');
  const [phone, setPhone] = useState(('phone' in (client || {})) ? (client as ClientDetail).phone || '' : '');
  const [company, setCompany] = useState(client?.company || '');
  const [notes, setNotes] = useState(('notes' in (client || {})) ? (client as ClientDetail).notes || '' : '');
  const [currency, setCurrency] = useState(client?.default_currency || defaultCurrency || 'USD');

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    if (!name.trim()) return;
    onSubmit({ name, email, phone, company, notes, default_currency: currency });
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-slate-950/80 backdrop-blur-sm animate-fade-in">
      <div className="w-full max-w-lg rounded-3xl border border-slate-900 bg-slate-950 p-6 shadow-2xl relative space-y-6">
        <div className="flex items-center justify-between">
          <h3 className="text-xl font-bold text-white">{title}</h3>
          <button onClick={onClose} className="p-1 rounded-lg text-slate-500 hover:text-white transition">
            <X className="h-5 w-5" />
          </button>
        </div>

        <form onSubmit={handleSubmit} className="space-y-4">
          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
            <div className="space-y-2">
              <label htmlFor="modalName" className="text-xs font-semibold text-slate-400">Client Name *</label>
              <input
                id="modalName"
                type="text"
                required
                value={name}
                onChange={(e) => setName(e.target.value)}
                placeholder="e.g. John Doe"
                className="block w-full rounded-lg border border-slate-800 bg-slate-900/40 py-2.5 px-3.5 text-sm text-white focus:border-indigo-500 focus:outline-none transition"
              />
            </div>
            <div className="space-y-2">
              <label htmlFor="modalCompany" className="text-xs font-semibold text-slate-400">Company</label>
              <input
                id="modalCompany"
                type="text"
                value={company}
                onChange={(e) => setCompany(e.target.value)}
                placeholder="e.g. Acme Corp"
                className="block w-full rounded-lg border border-slate-800 bg-slate-900/40 py-2.5 px-3.5 text-sm text-white focus:border-indigo-500 focus:outline-none transition"
              />
            </div>
          </div>

          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
            <div className="space-y-2">
              <label htmlFor="modalEmail" className="text-xs font-semibold text-slate-400">Email Address</label>
              <input
                id="modalEmail"
                type="email"
                value={email}
                onChange={(e) => setEmail(e.target.value)}
                placeholder="john@example.com"
                className="block w-full rounded-lg border border-slate-800 bg-slate-900/40 py-2.5 px-3.5 text-sm text-white focus:border-indigo-500 focus:outline-none transition"
              />
            </div>
            <div className="space-y-2">
              <label htmlFor="modalPhone" className="text-xs font-semibold text-slate-400">Phone Number</label>
              <input
                id="modalPhone"
                type="text"
                value={phone}
                onChange={(e) => setPhone(e.target.value)}
                placeholder="+1 555-0199"
                className="block w-full rounded-lg border border-slate-800 bg-slate-900/40 py-2.5 px-3.5 text-sm text-white focus:border-indigo-500 focus:outline-none transition"
              />
            </div>
          </div>

          <div className="space-y-2">
            <label htmlFor="modalCurrency" className="text-xs font-semibold text-slate-400">Default Currency</label>
            <div className="relative">
              <select
                id="modalCurrency"
                value={currency}
                onChange={(e) => setCurrency(e.target.value)}
                className="block w-full rounded-lg border border-slate-800 bg-slate-900/40 py-2.5 px-3.5 text-sm text-white focus:border-indigo-500 focus:outline-none transition appearance-none"
              >
                {SUPPORTED_CURRENCIES.map(code => (
                  <option key={code} value={code} className="bg-slate-950 text-white">{code}</option>
                ))}
              </select>
              <div className="pointer-events-none absolute inset-y-0 right-0 flex items-center pr-3.5 text-slate-500">
                <svg className="h-4 w-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M19 9l-7 7-7-7" />
                </svg>
              </div>
            </div>
          </div>

          <div className="space-y-2">
            <label htmlFor="modalNotes" className="text-xs font-semibold text-slate-400">Client Notes</label>
            <textarea
              id="modalNotes"
              rows={3}
              value={notes}
              onChange={(e) => setNotes(e.target.value)}
              placeholder="Enter client billing coordinates or project context..."
              className="block w-full rounded-lg border border-slate-800 bg-slate-900/40 py-2.5 px-3.5 text-sm text-white focus:border-indigo-500 focus:outline-none transition resize-none"
            />
          </div>

          <div className="pt-2 flex justify-end gap-3">
            <button
              type="button"
              onClick={onClose}
              className="px-4 py-2.5 rounded-lg border border-slate-800 text-sm font-semibold text-slate-400 hover:text-white transition"
            >
              Cancel
            </button>
            <button
              type="submit"
              className="px-4 py-2.5 rounded-lg bg-indigo-600 text-sm font-semibold text-white hover:bg-indigo-500 transition"
            >
              Save Client
            </button>
          </div>
        </form>
      </div>
    </div>
  );
}

interface LinkFormModalProps {
  title: string;
  link?: ClientLinkRow | null;
  onClose: () => void;
  onSubmit: (fields: LinkFormFields) => void;
}

// Link Form Modal Component
function LinkFormModal({ title, link, onClose, onSubmit }: LinkFormModalProps) {
  const [label, setLabel] = useState(link?.label || '');
  const [url, setUrl] = useState(link?.url || '');

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    if (!label.trim() || !url.trim()) return;

    // Direct absolute URL format client validation check
    if (!/^https?:\/\//i.test(url.trim())) {
      alert('URL must start with http:// or https://');
      return;
    }

    onSubmit({ label, url });
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-slate-950/80 backdrop-blur-sm animate-fade-in">
      <div className="w-full max-w-md rounded-3xl border border-slate-900 bg-slate-950 p-6 shadow-2xl relative space-y-6">
        <div className="flex items-center justify-between">
          <h3 className="text-lg font-bold text-white">{title}</h3>
          <button onClick={onClose} className="p-1 rounded-lg text-slate-500 hover:text-white transition">
            <X className="h-5 w-5" />
          </button>
        </div>

        <form onSubmit={handleSubmit} className="space-y-4">
          <div className="space-y-2">
            <label htmlFor="linkLabel" className="text-xs font-semibold text-slate-400">Link Label *</label>
            <input
              id="linkLabel"
              type="text"
              required
              value={label}
              onChange={(e) => setLabel(e.target.value)}
              placeholder="e.g. Shared Google Drive Folder or Project Spec"
              className="block w-full rounded-lg border border-slate-800 bg-slate-900/40 py-2.5 px-3.5 text-sm text-white focus:border-indigo-500 focus:outline-none transition"
            />
          </div>

          <div className="space-y-2">
            <label htmlFor="linkUrl" className="text-xs font-semibold text-slate-400">Absolute URL *</label>
            <input
              id="linkUrl"
              type="text"
              required
              value={url}
              onChange={(e) => setUrl(e.target.value)}
              placeholder="https://drive.google.com/..."
              className="block w-full rounded-lg border border-slate-800 bg-slate-900/40 py-2.5 px-3.5 text-sm text-white focus:border-indigo-500 focus:outline-none transition"
            />
            <p className="text-[10px] text-slate-500">Must start with http:// or https://</p>
          </div>

          <div className="pt-2 flex justify-end gap-3">
            <button
              type="button"
              onClick={onClose}
              className="px-4 py-2.5 rounded-lg border border-slate-800 text-sm font-semibold text-slate-400 hover:text-white transition"
            >
              Cancel
            </button>
            <button
              type="submit"
              className="px-4 py-2.5 rounded-lg bg-indigo-600 text-sm font-semibold text-white hover:bg-indigo-500 transition"
            >
              Save Link
            </button>
          </div>
        </form>
      </div>
    </div>
  );
}
