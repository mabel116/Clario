'use client';

import React, { useState, useMemo, useCallback, useEffect, useRef, Suspense } from 'react';
import { createPortal } from 'react-dom';
import Link from 'next/link';
import { useRouter, useSearchParams } from 'next/navigation';
import { ProtectedRoute } from '../../components/ProtectedRoute';
import { AppShell } from '../../components/AppShell';
import { 
  useClients, 
  useClient, 
  useClientLinks, 
  useProfile, 
  useInvoices, 
  useInvoicesForClient, 
  usePaymentsForClient 
} from '../../lib/data/hooks';
import { useDataReady, useEntityReady } from '../../lib/data/readiness';
import { RecordPaymentModal } from '../../components/RecordPaymentModal';
import { ClientRepo } from '../../lib/data/client';
import { ClientLinkRepo } from '../../lib/data/client-link';
import { ClientSummary, ClientDetail, InvoiceSummary } from '../../lib/data/types';
import { ClientLinkRow, PaymentEventRow } from '../../lib/sync/schema';
import { Money } from '../../components/ui/money';
import { useToast } from '../../components/Toast';
import { useModalScrollLock } from '../../lib/modal-lock';
import { cn } from '../../lib/utils';
import { 
  Users, Plus, Search, Edit2, Trash2, ExternalLink, X, FileText, 
  MoreVertical, Check, ChevronDown, Lock, AlertTriangle, ArrowUpRight, 
  Phone, Mail, Building, Calendar, DollarSign
} from 'lucide-react';

const SUPPORTED_CURRENCIES = [
  'USD', 'EUR', 'GBP', 'NGN', 'KES', 'GHS', 'ZAR', 'CAD', 'AUD', 'INR', 'JPY', 'KRW'
];

type InvoiceVisualBadge = 'draft' | 'void' | 'paid' | 'overdue' | 'sent' | 'partially_paid' | 'unpaid';

function StatusBadge({ status }: { status: InvoiceVisualBadge }) {
  const configs: Record<InvoiceVisualBadge, { label: string; dot: string; pill: string }> = {
    draft: { label: 'Draft', dot: 'bg-gray-400 dark:bg-zinc-500', pill: 'bg-gray-100 text-gray-700 border-gray-200 dark:bg-zinc-800/60 dark:text-zinc-300 dark:border-zinc-700' },
    void: { label: 'Void', dot: 'bg-gray-400 dark:bg-zinc-500', pill: 'bg-gray-100 text-gray-600 border-gray-200 dark:bg-zinc-800/40 dark:text-zinc-400 dark:border-zinc-700/60' },
    paid: { label: 'Paid', dot: 'bg-emerald-500', pill: 'bg-emerald-50 text-emerald-700 border-emerald-200 dark:bg-emerald-500/10 dark:text-emerald-400 dark:border-emerald-500/20' },
    overdue: { label: 'Overdue', dot: 'bg-rose-500', pill: 'bg-rose-50 text-rose-700 border-rose-200 dark:bg-rose-500/10 dark:text-rose-400 dark:border-rose-500/20' },
    sent: { label: 'Sent', dot: 'bg-blue-500', pill: 'bg-blue-50 text-blue-700 border-blue-200 dark:bg-blue-500/10 dark:text-blue-400 dark:border-blue-500/20' },
    partially_paid: { label: 'Partially paid', dot: 'bg-blue-500', pill: 'bg-blue-50 text-blue-700 border-blue-200 dark:bg-blue-500/10 dark:text-blue-400 dark:border-blue-500/20' },
    unpaid: { label: 'Unpaid', dot: 'bg-amber-500', pill: 'bg-amber-50 text-amber-700 border-amber-200 dark:bg-amber-500/10 dark:text-amber-400 dark:border-amber-500/20' },
  };
  const config = configs[status] || configs.unpaid;
  return (
    <span className={cn('inline-flex items-center gap-1.5 px-2.5 py-1 rounded-full text-[12px] leading-none font-medium border select-none shrink-0', config.pill)}>
      <span className={cn('w-1.5 h-1.5 rounded-full shrink-0', config.dot)} aria-hidden="true" />
      {config.label}
    </span>
  );
}

function getInitials(name: string): string {
  if (!name) return '??';
  const parts = name.trim().split(/\s+/);
  if (parts.length === 1) return parts[0].slice(0, 2).toUpperCase();
  return (parts[0][0] + parts[parts.length - 1][0]).toUpperCase();
}

function formatDisplayDate(dateStr: string | null | undefined): string {
  if (!dateStr) return '—';
  const clean = dateStr.includes('T') ? dateStr.split('T')[0] : dateStr;
  const parts = clean.split('-');
  if (parts.length !== 3) return dateStr;
  const year = parts[0];
  const monthIdx = parseInt(parts[1], 10) - 1;
  const day = parseInt(parts[2], 10);
  const months = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];
  const monthName = months[monthIdx] || parts[1];
  return `${day} ${monthName}, ${year}`;
}

export default function ClientsPage() {
  return (
    <ProtectedRoute>
      <AppShell>
        <Suspense fallback={<ClientsTableSkeleton />}>
          <ClientsDashboard />
        </Suspense>
      </AppShell>
    </ProtectedRoute>
  );
}

function ClientsDashboard() {
  const router = useRouter();
  const searchParams = useSearchParams();
  const { showToast } = useToast();
  const queryClientId = searchParams?.get('id') || searchParams?.get('clientId') || null;

  const [selectedClientId, setSelectedClientId] = useState<string | null>(queryClientId);
  const [searchQuery, setSearchQuery] = useState('');
  const [typeFilter, setTypeFilter] = useState<'all' | 'individual' | 'business'>('all');
  const [statusFilter, setStatusFilter] = useState<'all' | 'outstanding' | 'settled'>('all');

  // Modals
  const [showAddModal, setShowAddModal] = useState(false);
  const [clientToEdit, setClientToEdit] = useState<ClientDetail | null>(null);
  const [clientToDelete, setClientToDelete] = useState<{ id: string; name: string } | null>(null);

  // Queries
  const { data: clients } = useClients();
  const { data: profile } = useProfile();
  const { data: allInvoices } = useInvoices();

  // Readiness gate for master list (ADR 036 & ADR 037)
  const hasClientsData = clients !== undefined && clients.length > 0;
  const { isLoading, isConfirmedEmpty } = useDataReady(hasClientsData, ClientRepo.isEmpty);

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

  // Escape key closes drawer
  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.key === 'Escape') {
        if (!showAddModal && !clientToEdit && !clientToDelete) {
          handleSelectClient(null);
        }
      }
    };
    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, [handleSelectClient, showAddModal, clientToEdit, clientToDelete]);

  // Aggregated client financial metrics map
  const clientFinancials = useMemo(() => {
    const map = new Map<string, {
      totalInvoicedMinor: number;
      outstandingMinor: number;
      lastInvoiceDate: string | null;
      currency: string;
      invoiceCount: number;
    }>();

    if (!allInvoices) return map;

    for (const inv of allInvoices) {
      if (inv.displayStatus === 'void') continue;

      if (!map.has(inv.client_id)) {
        map.set(inv.client_id, {
          totalInvoicedMinor: 0,
          outstandingMinor: 0,
          lastInvoiceDate: null,
          currency: inv.currency,
          invoiceCount: 0,
        });
      }

      const rec = map.get(inv.client_id)!;
      rec.totalInvoicedMinor += inv.total_minor;
      rec.invoiceCount += 1;

      if ((inv.displayStatus === 'sent' || inv.displayStatus === 'overdue') && inv.balanceDueMinor > 0) {
        rec.outstandingMinor += inv.balanceDueMinor;
      }

      const invDate = inv.issue_date || null;
      if (invDate) {
        if (!rec.lastInvoiceDate || invDate.localeCompare(rec.lastInvoiceDate) > 0) {
          rec.lastInvoiceDate = invDate;
        }
      }
    }

    return map;
  }, [allInvoices]);

  // Filtered & sorted clients list
  const filteredClients = useMemo(() => {
    if (!clients) return [];

    const sorted = [...clients].sort((a, b) => a.name.localeCompare(b.name));

    return sorted.filter((c) => {
      // 1. Search Query
      if (searchQuery.trim()) {
        const q = searchQuery.toLowerCase().trim();
        const matchesName = c.name.toLowerCase().includes(q);
        const matchesCompany = Boolean(c.company && c.company.toLowerCase().includes(q));
        const matchesEmail = Boolean(c.email && c.email.toLowerCase().includes(q));
        const matchesPhone = Boolean(c.phone && c.phone.toLowerCase().includes(q));
        if (!matchesName && !matchesCompany && !matchesEmail && !matchesPhone) return false;
      }

      // 2. Type Filter
      const isBusiness = Boolean(c.company && c.company.trim().length > 0);
      if (typeFilter === 'individual' && isBusiness) return false;
      if (typeFilter === 'business' && !isBusiness) return false;

      // 3. Status Filter
      const fin = clientFinancials.get(c.id);
      const hasOutstanding = fin ? fin.outstandingMinor > 0 : false;
      if (statusFilter === 'outstanding' && !hasOutstanding) return false;
      if (statusFilter === 'settled' && hasOutstanding) return false;

      return true;
    });
  }, [clients, searchQuery, typeFilter, statusFilter, clientFinancials]);

  const defaultCurrency = profile?.default_currency || 'USD';
  const isDrawerOpen = Boolean(selectedClientId);

  return (
    <div className="w-full text-left font-sans relative">
      {/* Outer Content Area with Desktop Dynamic Margin Collapse */}
      <div className={cn('transition-all duration-200', isDrawerOpen ? 'sm:pr-[460px]' : '')}>
        {/* Header Row */}
        <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-3 mb-6">
          <div>
            <h1 className="text-[22px] leading-[28px] font-semibold text-gray-900 dark:text-white tracking-tight">
              Clients
            </h1>
            <p className="text-[13px] text-gray-500 dark:text-zinc-400 mt-0.5">
              Manage your client contacts and track their invoices and payments.
            </p>
          </div>
          <button
            type="button"
            onClick={() => setShowAddModal(true)}
            className="h-10 px-4 rounded-xl bg-blue-600 hover:bg-blue-700 text-white text-[13px] font-medium inline-flex items-center justify-center gap-1.5 shadow-sm transition-colors cursor-pointer w-full sm:w-auto shrink-0"
          >
            <Plus className="h-4 w-4" strokeWidth={2.2} />
            <span>Add New Client</span>
          </button>
        </div>

        {/* Search & Filter Bar */}
        <div className="flex flex-col sm:flex-row items-stretch sm:items-center gap-2.5 mb-5">
          {/* Search Input */}
          <div className="relative flex-1 min-w-[200px]">
            <Search className="h-4 w-4 text-gray-400 dark:text-zinc-500 absolute left-3.5 top-1/2 -translate-y-1/2 pointer-events-none" />
            <input
              type="text"
              placeholder="Search by client name, email, company..."
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
              className="w-full h-10 pl-10 pr-3.5 rounded-xl bg-[#F9FAFB] dark:bg-[#121215] border border-gray-200/80 dark:border-[#27272a] text-[13px] font-medium text-gray-900 dark:text-white placeholder:font-normal placeholder:text-gray-400 dark:placeholder:text-zinc-500 focus:outline-none focus:border-blue-600 dark:focus:border-blue-500 focus:ring-2 focus:ring-blue-600/15 dark:focus:ring-blue-500/20 transition-all"
            />
            {searchQuery && (
              <button
                type="button"
                onClick={() => setSearchQuery('')}
                className="absolute right-3 top-1/2 -translate-y-1/2 text-gray-400 hover:text-gray-600 dark:hover:text-zinc-200"
              >
                <X className="h-3.5 w-3.5" />
              </button>
            )}
          </div>

          {/* Type Filter */}
          <TypeFilterDropdown value={typeFilter} onChange={setTypeFilter} />

          {/* Status Filter */}
          <StatusFilterDropdown value={statusFilter} onChange={setStatusFilter} />
        </div>

        {/* Content Body: Loading / Empty / Master Table */}
        {isLoading ? (
          <ClientsTableSkeleton />
        ) : isConfirmedEmpty === true && (!clients || clients.length === 0) ? (
          <div className="rounded-2xl border border-dashed border-gray-200 dark:border-[#27272a] bg-white dark:bg-[#121215] p-12 text-center max-w-md mx-auto my-8 space-y-4">
            <div className="mx-auto flex h-12 w-12 items-center justify-center rounded-2xl bg-blue-50 dark:bg-blue-500/10 text-blue-600 dark:text-blue-400">
              <Users className="h-6 w-6" />
            </div>
            <div className="space-y-1">
              <h3 className="text-[16px] font-semibold text-gray-900 dark:text-white">Add your first client</h3>
              <p className="text-[13px] text-gray-500 dark:text-zinc-400 leading-relaxed">
                Build your client database to quickly issue invoices, track document links, and review outstanding ledgers offline.
              </p>
            </div>
            <button
              type="button"
              onClick={() => setShowAddModal(true)}
              className="h-10 px-4 rounded-xl bg-blue-600 hover:bg-blue-700 text-white text-[13px] font-medium inline-flex items-center justify-center gap-1.5 transition-colors cursor-pointer"
            >
              <Plus className="h-4 w-4" strokeWidth={2} />
              <span>Create Client Profile</span>
            </button>
          </div>
        ) : filteredClients.length === 0 ? (
          <div className="rounded-2xl border border-dashed border-gray-200 dark:border-[#27272a] bg-white dark:bg-[#121215] p-12 text-center max-w-md mx-auto my-8 space-y-3">
            <div className="mx-auto flex h-10 w-10 items-center justify-center rounded-xl bg-gray-100 dark:bg-[#18181b] text-gray-400">
              <Search className="h-5 w-5" />
            </div>
            <div className="space-y-1">
              <h3 className="text-[15px] font-semibold text-gray-900 dark:text-white">No matching clients found</h3>
              <p className="text-[13px] text-gray-500 dark:text-zinc-400">
                No clients match your current search and filter settings.
              </p>
            </div>
            <button
              type="button"
              onClick={() => {
                setSearchQuery('');
                setTypeFilter('all');
                setStatusFilter('all');
              }}
              className="text-[13px] font-medium text-blue-600 dark:text-blue-400 hover:underline inline-flex items-center gap-1"
            >
              Clear filters
            </button>
          </div>
        ) : (
          <>
            {/* Desktop Master Table */}
            <div className="hidden sm:block rounded-2xl border border-gray-200 dark:border-[#27272a] bg-white dark:bg-[#121215] overflow-hidden">
              <table className="w-full text-left border-collapse">
                <thead>
                  <tr className="bg-[#F8FAFC] dark:bg-[#18181b] border-b border-gray-200 dark:border-[#27272a] text-[12px] font-medium text-gray-500 dark:text-zinc-400 tracking-wider uppercase">
                    <th className="py-3 px-4 text-left font-medium w-[30%] min-w-[200px]">Client</th>
                    <th className={cn('py-3 px-4 text-left font-medium w-[24%]', isDrawerOpen ? 'hidden 2xl:table-cell' : 'hidden md:table-cell')}>Contact</th>
                    <th className={cn('py-3 px-4 text-left font-medium w-[14%]', isDrawerOpen ? 'hidden 2xl:table-cell' : 'hidden sm:table-cell')}>Last Invoice</th>
                    <th className="py-3 px-4 text-left font-medium w-[16%]">Total Invoiced</th>
                    <th className="py-3 px-4 text-left font-medium w-[16%]">Outstanding</th>
                    <th className="py-3 px-4 text-center font-medium w-[8%]">Action</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-gray-100 dark:divide-[#27272a]">
                  {filteredClients.map((client) => {
                    const fin = clientFinancials.get(client.id);
                    const currency = client.default_currency || fin?.currency || defaultCurrency;
                    const totalMinor = fin ? fin.totalInvoicedMinor : 0;
                    const outstandingMinor = fin ? fin.outstandingMinor : 0;
                    const lastInvoice = fin?.lastInvoiceDate ? formatDisplayDate(fin.lastInvoiceDate) : '—';
                    const isSelected = selectedClientId === client.id;

                    return (
                      <tr
                        key={client.id}
                        onClick={() => handleSelectClient(client.id)}
                        className={cn(
                          'cursor-pointer transition-colors text-[13px]',
                          isSelected
                            ? 'bg-blue-50/50 dark:bg-blue-900/10'
                            : 'hover:bg-gray-50/70 dark:hover:bg-[#18181b]/50'
                        )}
                      >
                        {/* Client Info */}
                        <td className="py-3.5 px-4">
                          <div className="flex items-center gap-3">
                            <div className="w-8 h-8 rounded-full bg-gray-100 dark:bg-zinc-800 text-[12px] font-semibold text-gray-700 dark:text-zinc-300 flex items-center justify-center shrink-0 select-none">
                              {getInitials(client.name)}
                            </div>
                            <div className="min-w-0">
                              <span className="text-[14px] font-semibold text-gray-900 dark:text-white leading-tight block truncate hover:text-blue-600 dark:hover:text-blue-400 transition-colors">
                                {client.name}
                              </span>
                              {client.company && (
                                <span className="text-[12px] text-gray-400 dark:text-zinc-500 block truncate mt-0.5">
                                  {client.company}
                                </span>
                              )}
                            </div>
                          </div>
                        </td>

                        {/* Contact Column (Dynamically hidden in drawer mode) */}
                        <td className={cn('py-3.5 px-4', isDrawerOpen ? 'hidden 2xl:table-cell' : 'hidden md:table-cell')}>
                          <div className="space-y-0.5">
                            <span className="text-[13px] text-gray-600 dark:text-zinc-300 block truncate">
                              {client.email || '—'}
                            </span>
                            {client.phone && (
                              <span className="text-[12px] text-gray-400 dark:text-zinc-500 block truncate">
                                {client.phone}
                              </span>
                            )}
                          </div>
                        </td>

                        {/* Last Invoice Column (Dynamically hidden in drawer mode) */}
                        <td className={cn('py-3.5 px-4 text-gray-600 dark:text-zinc-300 tabular-nums', isDrawerOpen ? 'hidden 2xl:table-cell' : 'hidden sm:table-cell')}>
                          {lastInvoice}
                        </td>

                        {/* Total Invoiced */}
                        <td className="py-3.5 px-4 font-semibold text-gray-900 dark:text-white tabular-nums">
                          <Money amountMinor={totalMinor} currency={currency} />
                        </td>

                        {/* Outstanding Balance */}
                        <td className="py-3.5 px-4 tabular-nums">
                          {outstandingMinor > 0 ? (
                            <span className="inline-flex items-center gap-1.5 font-semibold text-amber-600 dark:text-amber-400">
                              <Money amountMinor={outstandingMinor} currency={currency} />
                              <span className="w-1.5 h-1.5 rounded-full bg-amber-500 shrink-0" aria-hidden="true" />
                            </span>
                          ) : (
                            <span className="text-gray-400 dark:text-zinc-500 font-normal">
                              $0.00
                            </span>
                          )}
                        </td>

                        {/* Row Actions Dropdown */}
                        <td className="py-3.5 px-4 text-center" onClick={(e) => e.stopPropagation()}>
                          <MoreActionsDropdown
                            onView={() => handleSelectClient(client.id)}
                            createInvoiceHref={`/invoices/new?clientId=${client.id}`}
                            onEdit={() => {
                              ClientRepo.get(client.id).getValue();
                              setClientToEdit({
                                id: client.id,
                                user_id: '',
                                name: client.name,
                                email: client.email || null,
                                phone: client.phone || null,
                                company: client.company || null,
                                notes: null,
                                default_currency: client.default_currency || null,
                                created_at: client.created_at,
                                updated_at: client.created_at,
                                outstandingBalances: [],
                              });
                            }}
                            onDelete={() => setClientToDelete({ id: client.id, name: client.name })}
                          />
                        </td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>

            {/* Mobile Stacked Client Cards */}
            <div className="sm:hidden space-y-2.5">
              {filteredClients.map((client) => {
                const fin = clientFinancials.get(client.id);
                const currency = client.default_currency || fin?.currency || defaultCurrency;
                const totalMinor = fin ? fin.totalInvoicedMinor : 0;
                const outstandingMinor = fin ? fin.outstandingMinor : 0;
                const isSelected = selectedClientId === client.id;

                return (
                  <div
                    key={client.id}
                    onClick={() => handleSelectClient(client.id)}
                    className={cn(
                      'rounded-2xl border p-4 transition-colors cursor-pointer space-y-3 bg-white dark:bg-[#121215]',
                      isSelected
                        ? 'border-blue-600 dark:border-blue-500'
                        : 'border-gray-200 dark:border-[#27272a]'
                    )}
                  >
                    <div className="flex items-start justify-between gap-3">
                      <div className="flex items-center gap-2.5 min-w-0">
                        <div className="w-8 h-8 rounded-full bg-gray-100 dark:bg-zinc-800 text-[12px] font-semibold text-gray-700 dark:text-zinc-300 flex items-center justify-center shrink-0">
                          {getInitials(client.name)}
                        </div>
                        <div className="min-w-0">
                          <span className="text-[14px] font-semibold text-gray-900 dark:text-white block truncate">
                            {client.name}
                          </span>
                          <span className="text-[12px] text-gray-500 dark:text-zinc-400 block truncate">
                            {client.company || client.email || '—'}
                          </span>
                        </div>
                      </div>
                      <div>
                        {outstandingMinor > 0 ? (
                          <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-[11px] font-medium bg-amber-50 text-amber-700 border border-amber-200 dark:bg-amber-500/10 dark:text-amber-400 dark:border-amber-500/20">
                            <span className="w-1.5 h-1.5 rounded-full bg-amber-500" />
                            Outstanding
                          </span>
                        ) : (
                          <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-[11px] font-medium bg-emerald-50 text-emerald-700 border border-emerald-200 dark:bg-emerald-500/10 dark:text-emerald-400 dark:border-emerald-500/20">
                            ✓ Settled
                          </span>
                        )}
                      </div>
                    </div>

                    <div className="flex items-center justify-between text-[12px] pt-1 border-t border-gray-100 dark:border-[#27272a] tabular-nums">
                      <span className="text-gray-500 dark:text-zinc-400">
                        Invoiced: <strong className="text-gray-900 dark:text-white font-semibold"><Money amountMinor={totalMinor} currency={currency} /></strong>
                      </span>
                      <span className="text-gray-500 dark:text-zinc-400">
                        Due: <strong className={cn('font-semibold', outstandingMinor > 0 ? 'text-amber-600 dark:text-amber-400' : 'text-gray-900 dark:text-white')}><Money amountMinor={outstandingMinor} currency={currency} /></strong>
                      </span>
                    </div>
                  </div>
                );
              })}
            </div>
          </>
        )}
      </div>

      {/* Slide-Over Client Details Drawer */}
      {selectedClientId && (
        <ClientDetailsDrawer
          clientId={selectedClientId}
          onClose={() => handleSelectClient(null)}
          onEdit={(detail) => setClientToEdit(detail)}
          onDelete={(id, name) => setClientToDelete({ id, name })}
        />
      )}

      {/* Modals */}
      {showAddModal && (
        <AddClientModal
          defaultCurrency={defaultCurrency}
          onClose={() => setShowAddModal(false)}
          onCreated={(id) => {
            setShowAddModal(false);
            handleSelectClient(id);
            showToast('Client added successfully');
          }}
        />
      )}

      {clientToEdit && (
        <EditClientModal
          client={clientToEdit}
          onClose={() => setClientToEdit(null)}
          onUpdated={() => {
            setClientToEdit(null);
            showToast('Client updated successfully');
          }}
        />
      )}

      {clientToDelete && (
        <DeleteClientModal
          client={clientToDelete}
          onClose={() => setClientToDelete(null)}
          onDeleted={() => {
            setClientToDelete(null);
            if (selectedClientId === clientToDelete.id) {
              handleSelectClient(null);
            }
            showToast('Client deleted successfully');
          }}
        />
      )}
    </div>
  );
}

// --------------------------------------------------------------------------
// Slide-Over Client Details Drawer (Client Details.jpg)
// --------------------------------------------------------------------------
function ClientDetailsDrawer({
  clientId,
  onClose,
  onEdit,
  onDelete,
}: {
  clientId: string;
  onClose: () => void;
  onEdit: (client: ClientDetail) => void;
  onDelete: (id: string, name: string) => void;
}) {
  const { showToast } = useToast();
  const [activeTab, setActiveTab] = useState<'invoices' | 'payments' | 'links' | 'notes'>('invoices');
  const [isNotesSaving, setIsNotesSaving] = useState(false);
  const [notesDraft, setNotesDraft] = useState('');
  const [hasEditedNotes, setHasEditedNotes] = useState(false);

  // Link Modals
  const [showAddLink, setShowAddLink] = useState(false);
  const [linkToEdit, setLinkToEdit] = useState<ClientLinkRow | null>(null);
  const [linkToDelete, setLinkToDelete] = useState<ClientLinkRow | null>(null);

  // Record Payment Modal
  const [showRecordPayment, setShowRecordPayment] = useState(false);
  const [recordPaymentInvoiceId, setRecordPaymentInvoiceId] = useState<string | undefined>(undefined);

  // Drawer menu state
  const [isMenuOpen, setIsMenuOpen] = useState(false);
  const menuRef = useRef<HTMLDivElement>(null);

  // Live Queries
  const { data: client, isLoading: isClientLoading } = useClient(clientId);
  const { data: invoices, isLoading: isInvoicesLoading } = useInvoicesForClient(clientId);
  const { data: payments, isLoading: isPaymentsLoading } = usePaymentsForClient(clientId);
  const { data: links, isLoading: isLinksLoading } = useClientLinks(clientId);
  const { data: profile } = useProfile();

  // Readiness Gate (ADR 036, 038)
  const checkExists = useCallback(() => ClientRepo.exists(clientId), [clientId]);
  const hasClient = client !== null && client !== undefined;
  const { isLoading: isEntityLoading, isNotFound } = useEntityReady(hasClient, checkExists, clientId);

  // Sync notes draft on client load
  useEffect(() => {
    if (client && !hasEditedNotes) {
      setNotesDraft(client.notes || '');
    }
  }, [client, hasEditedNotes]);

  // Click outside listener for drawer 3-dot menu
  useEffect(() => {
    const handleClickOutside = (e: MouseEvent) => {
      if (menuRef.current && !menuRef.current.contains(e.target as Node)) {
        setIsMenuOpen(false);
      }
    };
    if (isMenuOpen) {
      document.addEventListener('mousedown', handleClickOutside);
      return () => document.removeEventListener('mousedown', handleClickOutside);
    }
  }, [isMenuOpen]);

  // Save notes handler
  const handleSaveNotes = async () => {
    try {
      setIsNotesSaving(true);
      await ClientRepo.update(clientId, { notes: notesDraft });
      setHasEditedNotes(false);
      showToast('Notes saved successfully');
    } catch (err: unknown) {
      const msg = err instanceof Error ? err.message : 'Failed to save notes';
      showToast(msg, 'info');
    } finally {
      setIsNotesSaving(false);
    }
  };

  const clientAddress = useMemo(() => {
    if (!client?.notes) return '';
    const lines = client.notes.split('\n');
    const addressLine = lines.find((l) => l.startsWith('Address: '));
    if (addressLine) return addressLine.replace('Address: ', '').trim();
    return '';
  }, [client?.notes]);

  const clientCurrency = client?.default_currency || profile?.default_currency || 'USD';

  // Financial summary calculations
  const { totalInvoicedMinor, totalPaidMinor, balanceDueMinor, lastInvoiceDate, multiCurrencyList } = useMemo(() => {
    let invoiced = 0;
    let paid = 0;
    let balance = 0;
    let latestDate: string | null = null;
    const currencyMap = new Map<string, { invoiced: number; paid: number; balance: number }>();

    if (invoices) {
      for (const inv of invoices) {
        if (inv.displayStatus === 'void') continue;
        invoiced += inv.total_minor;
        paid += inv.amountPaidMinor;
        if (inv.balanceDueMinor > 0) {
          balance += inv.balanceDueMinor;
        }
        if (inv.issue_date) {
          if (!latestDate || inv.issue_date.localeCompare(latestDate) > 0) {
            latestDate = inv.issue_date;
          }
        }

        const curr = inv.currency.toUpperCase();
        if (!currencyMap.has(curr)) {
          currencyMap.set(curr, { invoiced: 0, paid: 0, balance: 0 });
        }
        const c = currencyMap.get(curr)!;
        c.invoiced += inv.total_minor;
        c.paid += inv.amountPaidMinor;
        if (inv.balanceDueMinor > 0) {
          c.balance += inv.balanceDueMinor;
        }
      }
    }

    const multiList = Array.from(currencyMap.entries()).map(([curr, val]) => ({
      currency: curr,
      ...val,
    }));

    return {
      totalInvoicedMinor: invoiced,
      totalPaidMinor: paid,
      balanceDueMinor: balance,
      lastInvoiceDate: latestDate,
      multiCurrencyList: multiList,
    };
  }, [invoices]);

  const isDrawerLoading = isEntityLoading || !client;

  return (
    <>
      {/* Mobile Backdrop */}
      <div
        onClick={onClose}
        className="sm:hidden fixed inset-0 bg-black/40 backdrop-blur-xs z-30"
        aria-hidden="true"
      />

      {/* Drawer Container */}
      <aside className="w-full sm:w-[460px] fixed top-0 right-0 h-screen bg-white dark:bg-[#121215] border-l border-gray-200 dark:border-[#27272a] shadow-2xl z-40 flex flex-col overflow-hidden animate-in slide-in-from-right duration-200 text-left font-sans">
        {/* Top Header Row */}
        <div className="p-5 sm:p-6 border-b border-gray-100 dark:border-[#27272a] shrink-0 space-y-4">
          <div className="flex items-center justify-between">
            <h3 className="text-[15px] font-semibold text-gray-900 dark:text-white">
              Client Details
            </h3>
            <button
              type="button"
              onClick={onClose}
              className="p-1.5 rounded-lg text-gray-400 hover:text-gray-900 dark:hover:text-white hover:bg-gray-100 dark:hover:bg-[#18181b] transition-colors"
              aria-label="Close drawer"
            >
              <X className="h-4 w-4" />
            </button>
          </div>

          {/* Client Title & Subtitle */}
          {isDrawerLoading ? (
            <div className="space-y-2 animate-pulse">
              <div className="h-6 w-48 bg-gray-200 dark:bg-[#27272a] rounded" />
              <div className="h-4 w-32 bg-gray-200 dark:bg-[#27272a] rounded" />
            </div>
          ) : isNotFound ? (
            <div className="text-[14px] text-amber-600 dark:text-amber-400">Client not found</div>
          ) : (
            <div>
              <h2 className="text-[20px] leading-[26px] font-semibold text-gray-900 dark:text-white tracking-tight">
                {client.name}
              </h2>
              <p className="text-[13px] text-gray-500 dark:text-zinc-400 mt-0.5">
                {client.company ? `${client.company} • ` : ''}{client.email || 'No email registered'}
              </p>
            </div>
          )}

          {/* Drawer Quick Actions */}
          {!isDrawerLoading && !isNotFound && client && (
            <div className="flex items-center gap-2 pt-1">
              <Link
                href={`/invoices/new?clientId=${client.id}`}
                prefetch={false}
                className="h-9 px-3 rounded-xl border border-gray-200 dark:border-[#27272a] bg-white dark:bg-[#18181b] hover:bg-gray-50 dark:hover:bg-[#222226] text-[12px] font-medium text-gray-700 dark:text-zinc-300 inline-flex items-center gap-1.5 transition-colors no-underline"
              >
                <FileText className="h-3.5 w-3.5 text-gray-400" />
                <span>Create Invoice</span>
              </Link>

              <button
                type="button"
                onClick={() => onEdit(client)}
                className="h-9 px-3 rounded-xl border border-gray-200 dark:border-[#27272a] bg-white dark:bg-[#18181b] hover:bg-gray-50 dark:hover:bg-[#222226] text-[12px] font-medium text-gray-700 dark:text-zinc-300 inline-flex items-center gap-1.5 transition-colors"
              >
                <Edit2 className="h-3.5 w-3.5 text-gray-400" />
                <span>Edit</span>
              </button>

              <div className="relative ml-auto" ref={menuRef}>
                <button
                  type="button"
                  onClick={() => setIsMenuOpen((prev) => !prev)}
                  className="h-9 w-9 rounded-xl border border-gray-200 dark:border-[#27272a] bg-white dark:bg-[#18181b] hover:bg-gray-50 dark:hover:bg-[#222226] text-gray-700 dark:text-zinc-300 inline-flex items-center justify-center transition-colors"
                  aria-label="More actions"
                >
                  <MoreVertical className="h-4 w-4" />
                </button>

                {isMenuOpen && (
                  <div className="absolute right-0 mt-1 w-44 rounded-xl border border-gray-200 dark:border-[#27272a] bg-white dark:bg-[#18181b] p-1 shadow-lg z-50">
                    <button
                      type="button"
                      onClick={() => {
                        setIsMenuOpen(false);
                        onDelete(client.id, client.name);
                      }}
                      className="w-full px-3 py-2 text-left text-[12px] font-medium text-rose-600 dark:text-rose-400 hover:bg-rose-50 dark:hover:bg-rose-500/10 rounded-lg flex items-center gap-2 transition-colors"
                    >
                      <Trash2 className="h-3.5 w-3.5" />
                      <span>Delete Client</span>
                    </button>
                  </div>
                )}
              </div>
            </div>
          )}
        </div>

        {/* Scrollable Body */}
        <div className="flex-1 overflow-y-auto px-6 py-5 space-y-6">
          {isDrawerLoading ? (
            <div className="space-y-6 animate-pulse">
              <div className="h-32 bg-gray-100 dark:bg-[#18181b] rounded-2xl" />
              <div className="h-32 bg-gray-100 dark:bg-[#18181b] rounded-2xl" />
            </div>
          ) : isNotFound ? (
            <div className="p-8 text-center space-y-3">
              <AlertTriangle className="h-8 w-8 text-amber-500 mx-auto" />
              <h4 className="text-[15px] font-semibold text-gray-900 dark:text-white">Client Not Found</h4>
              <p className="text-[13px] text-gray-500 dark:text-zinc-400">
                This client record may have been deleted or has not synced to this device yet.
              </p>
            </div>
          ) : (
            <>
              {/* CLIENT INFO Block */}
              <div className="space-y-3">
                <h4 className="text-[11px] font-medium text-gray-400 dark:text-zinc-500 uppercase tracking-wider">
                  CLIENT INFO
                </h4>
                <div className="rounded-2xl border border-gray-200 dark:border-[#27272a] bg-[#F9FAFB] dark:bg-[#18181b] p-4 space-y-2 text-[13px] leading-[22px]">
                  <div className="flex items-center justify-between">
                    <span className="text-gray-500 dark:text-zinc-400">Status:</span>
                    {balanceDueMinor > 0 ? (
                      <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-[11px] font-medium bg-amber-50 text-amber-700 border border-amber-200 dark:bg-amber-500/10 dark:text-amber-400 dark:border-amber-500/20">
                        <span className="w-1.5 h-1.5 rounded-full bg-amber-500" />
                        Outstanding Balance
                      </span>
                    ) : (
                      <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-[11px] font-medium bg-emerald-50 text-emerald-700 border border-emerald-200 dark:bg-emerald-500/10 dark:text-emerald-400 dark:border-emerald-500/20">
                        ✓ Settled
                      </span>
                    )}
                  </div>

                  <div className="flex items-center justify-between">
                    <span className="text-gray-500 dark:text-zinc-400">Type:</span>
                    <span className="font-semibold text-gray-900 dark:text-white capitalize">
                      {client.company ? 'Business' : 'Individual'}
                    </span>
                  </div>

                  <div className="flex items-center justify-between">
                    <span className="text-gray-500 dark:text-zinc-400">Phone:</span>
                    {client.phone ? (
                      <a
                        href={`tel:${client.phone}`}
                        className="font-semibold text-gray-900 dark:text-white hover:text-blue-600 dark:hover:text-blue-400 transition-colors no-underline"
                      >
                        {client.phone}
                      </a>
                    ) : (
                      <span className="text-gray-400 dark:text-zinc-500">—</span>
                    )}
                  </div>

                  <div className="flex items-start justify-between gap-4">
                    <span className="text-gray-500 dark:text-zinc-400 shrink-0">Address:</span>
                    <span className="font-semibold text-gray-900 dark:text-white text-right whitespace-pre-line truncate max-w-[220px]">
                      {clientAddress || '—'}
                    </span>
                  </div>

                  <div className="flex items-center justify-between">
                    <span className="text-gray-500 dark:text-zinc-400">Added on:</span>
                    <span className="font-semibold text-gray-900 dark:text-white tabular-nums">
                      {formatDisplayDate(client.created_at)}
                    </span>
                  </div>
                </div>
              </div>

              {/* FINANCIAL SUMMARY Block */}
              <div className="space-y-3">
                <h4 className="text-[11px] font-medium text-gray-400 dark:text-zinc-500 uppercase tracking-wider">
                  FINANCIAL SUMMARY
                </h4>
                <div className="rounded-2xl border border-gray-200 dark:border-[#27272a] bg-[#F9FAFB] dark:bg-[#18181b] p-4 space-y-2 text-[13px] leading-[22px]">
                  <div className="flex items-center justify-between">
                    <span className="text-gray-500 dark:text-zinc-400">Total Invoiced:</span>
                    <span className="font-semibold text-gray-900 dark:text-white tabular-nums">
                      <Money amountMinor={totalInvoicedMinor} currency={clientCurrency} />
                    </span>
                  </div>

                  <div className="flex items-center justify-between">
                    <span className="text-gray-500 dark:text-zinc-400">Total Paid:</span>
                    <span className="font-semibold text-emerald-600 dark:text-emerald-400 tabular-nums">
                      <Money amountMinor={totalPaidMinor} currency={clientCurrency} />
                    </span>
                  </div>

                  <div className="flex items-center justify-between border-t border-gray-200/60 dark:border-[#27272a] pt-2">
                    <span className="text-gray-500 dark:text-zinc-400">Balance Due:</span>
                    <span className={cn('tabular-nums font-semibold', balanceDueMinor > 0 ? 'text-amber-600 dark:text-amber-400 font-bold' : 'text-gray-900 dark:text-white')}>
                      <Money amountMinor={balanceDueMinor} currency={clientCurrency} />
                    </span>
                  </div>

                  <div className="flex items-center justify-between">
                    <span className="text-gray-500 dark:text-zinc-400">Last Invoice Date:</span>
                    <span className="font-semibold text-gray-900 dark:text-white tabular-nums">
                      {formatDisplayDate(lastInvoiceDate)}
                    </span>
                  </div>

                  {/* Multi-currency breakdown if multiple currencies exist */}
                  {multiCurrencyList.length > 1 && (
                    <div className="pt-2 border-t border-gray-200/60 dark:border-[#27272a] space-y-1">
                      <span className="text-[11px] font-medium text-gray-400 dark:text-zinc-500 block">
                        Currency Breakdown:
                      </span>
                      {multiCurrencyList.map((m) => (
                        <div key={m.currency} className="flex items-center justify-between text-[12px] tabular-nums">
                          <span className="text-gray-500 dark:text-zinc-400">{m.currency}:</span>
                          <span>
                            Due: <Money amountMinor={m.balance} currency={m.currency} className={m.balance > 0 ? 'text-amber-600 font-medium' : ''} />
                          </span>
                        </div>
                      ))}
                    </div>
                  )}
                </div>
              </div>

              {/* The 4 Drawer Tabs */}
              <div className="space-y-4 pt-2">
                {/* Tab Navigation */}
                <div className="flex border-b border-gray-200 dark:border-[#27272a] gap-5 text-[13px] font-medium -mx-6 px-6">
                  {(['invoices', 'payments', 'links', 'notes'] as const).map((tab) => {
                    const isActive = activeTab === tab;
                    const labels: Record<string, string> = {
                      invoices: `Invoices (${invoices?.length || 0})`,
                      payments: `Payments (${payments?.length || 0})`,
                      links: `Links (${links?.length || 0})`,
                      notes: 'Notes',
                    };

                    return (
                      <button
                        key={tab}
                        type="button"
                        onClick={() => setActiveTab(tab)}
                        className={cn(
                          'pb-2.5 transition-colors relative cursor-pointer capitalize',
                          isActive
                            ? 'text-blue-600 dark:text-blue-400 font-semibold'
                            : 'text-gray-500 dark:text-zinc-400 hover:text-gray-900 dark:hover:text-white'
                        )}
                      >
                        {labels[tab]}
                        {isActive && (
                          <span className="absolute bottom-0 left-0 right-0 h-0.5 bg-blue-600 dark:bg-blue-400 rounded-full" />
                        )}
                      </button>
                    );
                  })}
                </div>

                {/* Tab 1: Invoices */}
                {activeTab === 'invoices' && (
                  <div className="space-y-3">
                    {!invoices || invoices.length === 0 ? (
                      <div className="p-6 text-center border border-dashed border-gray-200 dark:border-[#27272a] rounded-2xl space-y-2">
                        <FileText className="h-6 w-6 text-gray-400 mx-auto" />
                        <p className="text-[13px] text-gray-500 dark:text-zinc-400">
                          No invoices issued for this client yet.
                        </p>
                        <Link
                          href={`/invoices/new?clientId=${client.id}`}
                          prefetch={false}
                          className="text-[12px] font-medium text-blue-600 dark:text-blue-400 hover:underline inline-flex items-center gap-1"
                        >
                          <Plus className="h-3.5 w-3.5" /> Issue first invoice
                        </Link>
                      </div>
                    ) : (
                      <div className="rounded-xl border border-gray-200 dark:border-[#27272a] bg-white dark:bg-[#18181b] overflow-hidden">
                        <div className="divide-y divide-gray-100 dark:divide-[#27272a]">
                          {invoices.map((inv) => (
                            <Link
                              key={inv.id}
                              href={`/invoices/${inv.id}?from=${encodeURIComponent(`/clients?id=${client.id}`)}`}
                              prefetch={false}
                              className="p-3.5 flex items-center justify-between hover:bg-gray-50 dark:hover:bg-[#222226] transition-colors no-underline block"
                            >
                              <div className="space-y-0.5">
                                <div className="flex items-center gap-2">
                                  <span className="text-[13px] font-semibold text-gray-900 dark:text-white tabular-nums">
                                    {inv.invoice_number}
                                  </span>
                                  <StatusBadge status={inv.displayStatus} />
                                </div>
                                <div className="text-[11px] text-gray-400 dark:text-zinc-500 tabular-nums">
                                  Due: {formatDisplayDate(inv.due_date)}
                                </div>
                              </div>
                              <div className="text-right">
                                <span className="text-[13px] font-semibold text-gray-900 dark:text-white tabular-nums block">
                                  <Money amountMinor={inv.total_minor} currency={inv.currency} />
                                </span>
                                {inv.balanceDueMinor > 0 && (
                                  <span className="text-[11px] font-medium text-amber-600 dark:text-amber-400 tabular-nums block">
                                    Bal: <Money amountMinor={inv.balanceDueMinor} currency={inv.currency} />
                                  </span>
                                )}
                              </div>
                            </Link>
                          ))}
                        </div>
                      </div>
                    )}
                  </div>
                )}

                {/* Tab 2: Payments */}
                {activeTab === 'payments' && (
                  <div className="space-y-3">
                    {!payments || payments.length === 0 ? (
                      <div className="p-6 text-center border border-dashed border-gray-200 dark:border-[#27272a] rounded-2xl space-y-1">
                        <DollarSign className="h-6 w-6 text-gray-400 mx-auto" />
                        <p className="text-[13px] text-gray-500 dark:text-zinc-400">
                          No payments recorded for this client yet.
                        </p>
                      </div>
                    ) : (
                      <div className="rounded-xl border border-gray-200 dark:border-[#27272a] bg-white dark:bg-[#18181b] overflow-hidden divide-y divide-gray-100 dark:divide-[#27272a]">
                        {payments.map((p) => {
                          const isReversed = p.amount_minor < 0 || Boolean(p.reverses_id);
                          return (
                            <div key={p.id} className="p-3.5 flex items-center justify-between text-[13px]">
                              <div className="space-y-0.5">
                                <div className="flex items-center gap-2">
                                  <span className="font-semibold text-gray-900 dark:text-white tabular-nums">
                                    {formatDisplayDate(p.occurred_at || p.created_at)}
                                  </span>
                                  <span className="text-[11px] font-medium px-2 py-0.5 rounded-full bg-gray-100 dark:bg-zinc-800 text-gray-600 dark:text-zinc-400 capitalize">
                                    {p.method?.replace('_', ' ') || 'Payment'}
                                  </span>
                                </div>
                                {p.note && (
                                  <p className="text-[11px] text-gray-400 dark:text-zinc-500">{p.note}</p>
                                )}
                              </div>
                              <span className={cn('font-semibold tabular-nums', isReversed ? 'line-through text-gray-400' : 'text-emerald-600 dark:text-emerald-400')}>
                                +<Money amountMinor={p.amount_minor} currency={p.currency || clientCurrency} />
                              </span>
                            </div>
                          );
                        })}
                      </div>
                    )}
                  </div>
                )}

                {/* Tab 3: Document Links */}
                {activeTab === 'links' && (
                  <div className="space-y-3">
                    <div className="flex items-center justify-between">
                      <span className="text-[12px] font-medium text-gray-500 dark:text-zinc-400">
                        External Links
                      </span>
                      <button
                        type="button"
                        onClick={() => setShowAddLink(true)}
                        className="text-[12px] font-medium text-blue-600 dark:text-blue-400 hover:underline inline-flex items-center gap-1 cursor-pointer"
                      >
                        <Plus className="h-3.5 w-3.5" /> Add Link
                      </button>
                    </div>

                    {!links || links.length === 0 ? (
                      <div className="p-6 text-center border border-dashed border-gray-200 dark:border-[#27272a] rounded-2xl space-y-1">
                        <ExternalLink className="h-6 w-6 text-gray-400 mx-auto" />
                        <p className="text-[13px] text-gray-500 dark:text-zinc-400">
                          No links added yet. Add links to contracts, drive folders, or project boards.
                        </p>
                      </div>
                    ) : (
                      <div className="rounded-xl border border-gray-200 dark:border-[#27272a] bg-white dark:bg-[#18181b] overflow-hidden divide-y divide-gray-100 dark:divide-[#27272a]">
                        {links.map((link) => {
                          let hostname = '';
                          try {
                            hostname = new URL(link.url).hostname.replace('www.', '');
                          } catch {
                            hostname = link.url;
                          }

                          return (
                            <div key={link.id} className="p-3.5 flex items-center justify-between gap-3 text-[13px]">
                              <div className="min-w-0">
                                <a
                                  href={link.url}
                                  target="_blank"
                                  rel="noopener noreferrer"
                                  className="font-medium text-gray-900 dark:text-white hover:text-blue-600 dark:hover:text-blue-400 flex items-center gap-1.5 no-underline truncate"
                                >
                                  <span>{link.label}</span>
                                  <ArrowUpRight className="h-3.5 w-3.5 shrink-0 text-gray-400" />
                                </a>
                                <span className="text-[11px] text-gray-400 dark:text-zinc-500 block truncate">
                                  {hostname}
                                </span>
                              </div>
                              <div className="flex items-center gap-1 shrink-0">
                                <button
                                  type="button"
                                  onClick={() => setLinkToEdit(link)}
                                  className="p-1.5 text-gray-400 hover:text-gray-700 dark:hover:text-zinc-300 rounded-lg hover:bg-gray-100 dark:hover:bg-[#222226]"
                                  title="Edit link"
                                >
                                  <Edit2 className="h-3.5 w-3.5" />
                                </button>
                                <button
                                  type="button"
                                  onClick={() => setLinkToDelete(link)}
                                  className="p-1.5 text-gray-400 hover:text-rose-600 dark:hover:text-rose-400 rounded-lg hover:bg-gray-100 dark:hover:bg-[#222226]"
                                  title="Delete link"
                                >
                                  <Trash2 className="h-3.5 w-3.5" />
                                </button>
                              </div>
                            </div>
                          );
                        })}
                      </div>
                    )}
                  </div>
                )}

                {/* Tab 4: Notes */}
                {activeTab === 'notes' && (
                  <div className="space-y-3">
                    <label className="block text-[12px] font-medium text-gray-500 dark:text-zinc-400">
                      Private Notes & Custom Metadata
                    </label>
                    <textarea
                      rows={5}
                      value={notesDraft}
                      onChange={(e) => {
                        setNotesDraft(e.target.value);
                        setHasEditedNotes(true);
                      }}
                      placeholder="Add private client notes, tax registration numbers, address details..."
                      className="w-full p-3.5 rounded-xl bg-[#F9FAFB] dark:bg-[#18181b] border border-gray-200/80 dark:border-[#27272a] text-[13px] font-medium text-gray-900 dark:text-white placeholder:font-normal placeholder:text-gray-400 dark:placeholder:text-zinc-500 focus:outline-none focus:border-blue-600 dark:focus:border-blue-500 focus:ring-2 focus:ring-blue-600/15"
                    />
                    <div className="flex justify-end">
                      <button
                        type="button"
                        onClick={handleSaveNotes}
                        disabled={isNotesSaving}
                        className="h-9 px-4 rounded-xl bg-blue-600 hover:bg-blue-700 text-white text-[12px] font-medium inline-flex items-center gap-1.5 transition-colors disabled:opacity-50 cursor-pointer"
                      >
                        {isNotesSaving ? 'Saving...' : 'Save Notes'}
                      </button>
                    </div>
                  </div>
                )}
              </div>
            </>
          )}
        </div>
      </aside>

      {/* Nested Link Modals */}
      {showAddLink && (
        <AddLinkModal
          clientId={clientId}
          onClose={() => setShowAddLink(false)}
          onAdded={() => {
            setShowAddLink(false);
            showToast('Link added successfully');
          }}
        />
      )}

      {linkToEdit && (
        <EditLinkModal
          link={linkToEdit}
          onClose={() => setLinkToEdit(null)}
          onUpdated={() => {
            setLinkToEdit(null);
            showToast('Link updated successfully');
          }}
        />
      )}

      {linkToDelete && (
        <DeleteLinkModal
          link={linkToDelete}
          onClose={() => setLinkToDelete(null)}
          onDeleted={() => {
            setLinkToDelete(null);
            showToast('Link removed successfully');
          }}
        />
      )}

      {/* Record Payment Modal */}
      {showRecordPayment && (
        <RecordPaymentModal
          clientId={clientId}
          invoiceId={recordPaymentInvoiceId}
          onClose={() => {
            setShowRecordPayment(false);
            setRecordPaymentInvoiceId(undefined);
          }}
        />
      )}
    </>
  );
}

// --------------------------------------------------------------------------
// Custom Popover Filter Dropdowns (Zero Native Selects)
// --------------------------------------------------------------------------
function TypeFilterDropdown({
  value,
  onChange,
}: {
  value: 'all' | 'individual' | 'business';
  onChange: (v: 'all' | 'individual' | 'business') => void;
}) {
  const [isOpen, setIsOpen] = useState(false);
  const containerRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    const handleOutside = (e: MouseEvent) => {
      if (containerRef.current && !containerRef.current.contains(e.target as Node)) {
        setIsOpen(false);
      }
    };
    if (isOpen) {
      document.addEventListener('mousedown', handleOutside);
      return () => document.removeEventListener('mousedown', handleOutside);
    }
  }, [isOpen]);

  const labels = {
    all: 'All',
    individual: 'Individual',
    business: 'Business',
  };

  return (
    <div className="relative shrink-0" ref={containerRef}>
      <button
        type="button"
        onClick={() => setIsOpen((prev) => !prev)}
        className="h-10 px-3.5 rounded-xl border border-gray-200/80 dark:border-[#27272a] bg-white dark:bg-[#18181b] text-[13px] font-medium text-gray-700 dark:text-zinc-300 inline-flex items-center justify-between gap-2 hover:bg-gray-50 dark:hover:bg-[#222226] transition-colors whitespace-nowrap cursor-pointer w-full sm:w-auto overflow-hidden"
      >
        <span className="truncate min-w-0 flex-1 text-left">Type: <strong className="font-semibold text-gray-900 dark:text-white">{labels[value]}</strong></span>
        <ChevronDown className="h-3.5 w-3.5 text-gray-400 shrink-0" />
      </button>

      {isOpen && (
        <div className="absolute right-0 sm:left-0 sm:right-auto mt-1 w-40 rounded-xl border border-gray-200 dark:border-[#27272a] bg-white dark:bg-[#18181b] p-1 shadow-lg z-50 space-y-0.5">
          {(['all', 'individual', 'business'] as const).map((type) => {
            const isSelected = value === type;
            return (
              <button
                key={type}
                type="button"
                onClick={() => {
                  onChange(type);
                  setIsOpen(false);
                }}
                className={cn(
                  'w-full px-3 py-1.5 text-left text-[12px] font-medium rounded-lg flex items-center justify-between transition-colors',
                  isSelected
                    ? 'bg-gray-100 dark:bg-[#27272a] text-blue-600 dark:text-blue-400'
                    : 'text-gray-700 dark:text-zinc-300 hover:bg-gray-50 dark:hover:bg-[#222226]'
                )}
              >
                <span>{labels[type]}</span>
                {isSelected && <Check className="h-3.5 w-3.5" />}
              </button>
            );
          })}
        </div>
      )}
    </div>
  );
}

function StatusFilterDropdown({
  value,
  onChange,
}: {
  value: 'all' | 'outstanding' | 'settled';
  onChange: (v: 'all' | 'outstanding' | 'settled') => void;
}) {
  const [isOpen, setIsOpen] = useState(false);
  const containerRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    const handleOutside = (e: MouseEvent) => {
      if (containerRef.current && !containerRef.current.contains(e.target as Node)) {
        setIsOpen(false);
      }
    };
    if (isOpen) {
      document.addEventListener('mousedown', handleOutside);
      return () => document.removeEventListener('mousedown', handleOutside);
    }
  }, [isOpen]);

  const labels = {
    all: 'All',
    outstanding: 'Has Balance',
    settled: 'Settled',
  };

  return (
    <div className="relative shrink-0" ref={containerRef}>
      <button
        type="button"
        onClick={() => setIsOpen((prev) => !prev)}
        className="h-10 px-3.5 rounded-xl border border-gray-200/80 dark:border-[#27272a] bg-white dark:bg-[#18181b] text-[13px] font-medium text-gray-700 dark:text-zinc-300 inline-flex items-center justify-between gap-2 hover:bg-gray-50 dark:hover:bg-[#222226] transition-colors whitespace-nowrap cursor-pointer w-full sm:w-auto overflow-hidden"
      >
        <span className="truncate min-w-0 flex-1 text-left">Status: <strong className="font-semibold text-gray-900 dark:text-white">{labels[value]}</strong></span>
        <ChevronDown className="h-3.5 w-3.5 text-gray-400 shrink-0" />
      </button>

      {isOpen && (
        <div className="absolute right-0 mt-1 w-48 rounded-xl border border-gray-200 dark:border-[#27272a] bg-white dark:bg-[#18181b] p-1 shadow-lg z-50 space-y-0.5">
          {(['all', 'outstanding', 'settled'] as const).map((st) => {
            const isSelected = value === st;
            return (
              <button
                key={st}
                type="button"
                onClick={() => {
                  onChange(st);
                  setIsOpen(false);
                }}
                className={cn(
                  'w-full px-3 py-1.5 text-left text-[12px] font-medium rounded-lg flex items-center justify-between transition-colors',
                  isSelected
                    ? 'bg-gray-100 dark:bg-[#27272a] text-blue-600 dark:text-blue-400'
                    : 'text-gray-700 dark:text-zinc-300 hover:bg-gray-50 dark:hover:bg-[#222226]'
                )}
              >
                <span>{labels[st]}</span>
                {isSelected && <Check className="h-3.5 w-3.5" />}
              </button>
            );
          })}
        </div>
      )}
    </div>
  );
}

function MoreActionsDropdown({
  onView,
  createInvoiceHref,
  onEdit,
  onDelete,
}: {
  onView: () => void;
  createInvoiceHref: string;
  onEdit: () => void;
  onDelete: () => void;
}) {
  const [isOpen, setIsOpen] = useState(false);
  const containerRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    const handleOutside = (e: MouseEvent) => {
      if (containerRef.current && !containerRef.current.contains(e.target as Node)) {
        setIsOpen(false);
      }
    };
    if (isOpen) {
      document.addEventListener('mousedown', handleOutside);
      return () => document.removeEventListener('mousedown', handleOutside);
    }
  }, [isOpen]);

  return (
    <div className="relative inline-block text-left" ref={containerRef}>
      <button
        type="button"
        onClick={() => setIsOpen((prev) => !prev)}
        className="p-1.5 rounded-lg text-gray-400 hover:text-gray-900 dark:hover:text-white hover:bg-gray-100 dark:hover:bg-[#222226] transition-colors"
        aria-label="Actions"
      >
        <MoreVertical className="h-4 w-4" />
      </button>

      {isOpen && (
        <div className="absolute right-0 mt-1 w-44 rounded-xl border border-gray-200 dark:border-[#27272a] bg-white dark:bg-[#18181b] p-1 shadow-xl z-50 space-y-0.5 text-left">
          <button
            type="button"
            onClick={() => {
              setIsOpen(false);
              onView();
            }}
            className="w-full px-3 py-1.5 text-left text-[13px] font-medium leading-none text-gray-800 dark:text-zinc-200 hover:bg-gray-50 dark:hover:bg-[#222226] rounded-lg transition-colors flex items-center gap-2.5 cursor-pointer"
          >
            <Users className="h-[15px] w-[15px] text-gray-800 dark:text-zinc-200 shrink-0" strokeWidth={2} />
            <span>View Client</span>
          </button>

          <Link
            href={createInvoiceHref}
            prefetch={false}
            onClick={() => setIsOpen(false)}
            className="w-full px-3 py-1.5 text-left text-[13px] font-medium leading-none text-gray-800 dark:text-zinc-200 hover:bg-gray-50 dark:hover:bg-[#222226] rounded-lg transition-colors flex items-center gap-2.5 no-underline cursor-pointer"
          >
            <FileText className="h-[15px] w-[15px] text-gray-800 dark:text-zinc-200 shrink-0" strokeWidth={2} />
            <span>Create Invoice</span>
          </Link>

          <button
            type="button"
            onClick={() => {
              setIsOpen(false);
              onEdit();
            }}
            className="w-full px-3 py-1.5 text-left text-[13px] font-medium leading-none text-gray-800 dark:text-zinc-200 hover:bg-gray-50 dark:hover:bg-[#222226] rounded-lg transition-colors flex items-center gap-2.5 cursor-pointer"
          >
            <Edit2 className="h-[15px] w-[15px] text-gray-800 dark:text-zinc-200 shrink-0" strokeWidth={2} />
            <span>Edit Client</span>
          </button>

          <div className="border-t border-gray-100 dark:border-[#27272a] my-0.5" />

          <button
            type="button"
            onClick={() => {
              setIsOpen(false);
              onDelete();
            }}
            className="w-full px-3 py-1.5 text-left text-[13px] font-medium leading-none text-rose-600 dark:text-rose-400 hover:bg-rose-50 dark:hover:bg-rose-500/10 rounded-lg transition-colors flex items-center gap-2.5 cursor-pointer"
          >
            <Trash2 className="h-[15px] w-[15px] text-rose-500 shrink-0" strokeWidth={2} />
            <span>Delete Client</span>
          </button>
        </div>
      )}
    </div>
  );
}

// --------------------------------------------------------------------------
// Unified Modal Dialogs (createPortal, Zero Native Selects, Mobile Stacked)
// --------------------------------------------------------------------------
function AddClientModal({
  defaultCurrency,
  onClose,
  onCreated,
}: {
  defaultCurrency: string;
  onClose: () => void;
  onCreated: (id: string) => void;
}) {
  const { showToast } = useToast();
  useModalScrollLock(true);
  const dragStartY = useRef<number | null>(null);
  const [dragOffsetY, setDragOffsetY] = useState(0);
  const [name, setName] = useState('');
  const [company, setCompany] = useState('');
  const [email, setEmail] = useState('');
  const [phone, setPhone] = useState('');
  const [address, setAddress] = useState('');
  const [notes, setNotes] = useState('');
  const [currency, setCurrency] = useState(defaultCurrency);
  const [isSubmitting, setIsSubmitting] = useState(false);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!name.trim()) {
      showToast('Client name is required', 'info');
      return;
    }

    try {
      setIsSubmitting(true);
      const combinedNotes = [
        address.trim() ? `Address: ${address.trim()}` : null,
        notes.trim() ? notes.trim() : null,
      ].filter(Boolean).join('\n\n');

      const id = await ClientRepo.create({
        name: name.trim(),
        company: company.trim() || null,
        email: email.trim() || null,
        phone: phone.trim() || null,
        notes: combinedNotes || null,
        default_currency: currency.toUpperCase(),
      });

      onCreated(id);
    } catch (err: unknown) {
      const msg = err instanceof Error ? err.message : 'Failed to add client';
      showToast(msg, 'info');
    } finally {
      setIsSubmitting(false);
    }
  };

  return createPortal(
    <div
      onClick={onClose}
      className="fixed inset-0 z-[100] w-screen h-dvh bg-black/60 backdrop-blur-xs flex items-end sm:items-center justify-center p-0 sm:p-4 touch-none"
    >
      <div
        onClick={(e) => e.stopPropagation()}
        style={dragOffsetY > 0 ? { transform: `translateY(${dragOffsetY}px)`, transition: 'none' } : undefined}
        className="w-full sm:max-w-[460px] h-[85dvh] sm:h-auto sm:max-h-[90dvh] rounded-t-2xl sm:rounded-2xl border-t sm:border border-gray-200 dark:border-[#27272a] bg-white dark:bg-[#18181b] flex flex-col shadow-2xl overflow-hidden touch-auto animate-in slide-in-from-bottom sm:zoom-in-95 duration-200 text-left font-sans"
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

        {/* Pinned Header */}
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
                Add New Client
              </h3>
              <p className="text-[13px] text-gray-500 dark:text-zinc-400 mt-0.5">
                Create a new client profile.
              </p>
            </div>
            <button
              type="button"
              onClick={onClose}
              aria-label="Close modal"
              className="w-8 h-8 rounded-lg bg-gray-100 hover:bg-gray-200 dark:bg-[#222226] text-gray-800 dark:text-zinc-200 flex items-center justify-center transition-colors shrink-0 cursor-pointer"
            >
              <X className="h-4 w-4 text-gray-800 dark:text-zinc-200" strokeWidth={2.25} />
            </button>
          </div>
        </div>

        <form onSubmit={handleSubmit} className="flex flex-col flex-1 min-h-0">
          <div className="flex-1 overflow-y-auto overscroll-contain px-5 py-4 sm:px-6 sm:py-5 space-y-4">
            <div>
              <label className="block text-[12px] font-medium text-gray-700 dark:text-zinc-300 mb-1">
                Client Name <span className="text-rose-500">*</span>
              </label>
              <input
                type="text"
                required
                placeholder="e.g. Acme Corp or Jane Doe"
                value={name}
                onChange={(e) => setName(e.target.value)}
                className="w-full h-10 px-3.5 rounded-xl bg-[#F9FAFB] dark:bg-[#121215] border border-gray-200/80 dark:border-[#27272a] text-[13px] font-medium text-gray-900 dark:text-white placeholder:font-normal placeholder:text-gray-400 dark:placeholder:text-zinc-500 focus:outline-none focus:border-blue-600 focus:ring-2 focus:ring-blue-600/15"
              />
            </div>

            <div>
              <label className="block text-[12px] font-medium text-gray-700 dark:text-zinc-300 mb-1">
                Company (Optional)
              </label>
              <input
                type="text"
                placeholder="e.g. Acme Industries Ltd"
                value={company}
                onChange={(e) => setCompany(e.target.value)}
                className="w-full h-10 px-3.5 rounded-xl bg-[#F9FAFB] dark:bg-[#121215] border border-gray-200/80 dark:border-[#27272a] text-[13px] font-medium text-gray-900 dark:text-white placeholder:font-normal placeholder:text-gray-400 dark:placeholder:text-zinc-500 focus:outline-none focus:border-blue-600 focus:ring-2 focus:ring-blue-600/15"
              />
            </div>

            <div className="grid grid-cols-1 sm:grid-cols-2 gap-3.5">
              <div>
                <label className="block text-[12px] font-medium text-gray-700 dark:text-zinc-300 mb-1">
                  Email
                </label>
                <input
                  type="email"
                  placeholder="billing@acme.com"
                  value={email}
                  onChange={(e) => setEmail(e.target.value)}
                  className="w-full h-10 px-3.5 rounded-xl bg-[#F9FAFB] dark:bg-[#121215] border border-gray-200/80 dark:border-[#27272a] text-[13px] font-medium text-gray-900 dark:text-white placeholder:font-normal placeholder:text-gray-400 dark:placeholder:text-zinc-500 focus:outline-none focus:border-blue-600 focus:ring-2 focus:ring-blue-600/15"
                />
              </div>

              <div>
                <label className="block text-[12px] font-medium text-gray-700 dark:text-zinc-300 mb-1">
                  Phone
                </label>
                <input
                  type="tel"
                  placeholder="+1 (555) 012-3456"
                  value={phone}
                  onChange={(e) => setPhone(e.target.value)}
                  className="w-full h-10 px-3.5 rounded-xl bg-[#F9FAFB] dark:bg-[#121215] border border-gray-200/80 dark:border-[#27272a] text-[13px] font-medium text-gray-900 dark:text-white placeholder:font-normal placeholder:text-gray-400 dark:placeholder:text-zinc-500 focus:outline-none focus:border-blue-600 focus:ring-2 focus:ring-blue-600/15"
                />
              </div>
            </div>

            <div>
              <label className="block text-[12px] font-medium text-gray-700 dark:text-zinc-300 mb-1">
                Default Currency
              </label>
              <div className="grid grid-cols-4 gap-2">
                {['USD', 'EUR', 'GBP', 'CAD'].map((curr) => (
                  <button
                    key={curr}
                    type="button"
                    onClick={() => setCurrency(curr)}
                    className={cn(
                      'h-9 rounded-xl text-[12px] font-semibold border transition-all cursor-pointer',
                      currency === curr
                        ? 'bg-blue-50 dark:bg-blue-500/10 text-blue-600 dark:text-blue-400 border-blue-200 dark:border-blue-500/20'
                        : 'border-gray-200/80 dark:border-[#27272a] text-gray-600 dark:text-zinc-400 hover:bg-gray-50 dark:hover:bg-[#222226]'
                    )}
                  >
                    {curr}
                  </button>
                ))}
              </div>
            </div>

            <div>
              <label className="block text-[12px] font-medium text-gray-700 dark:text-zinc-300 mb-1">
                Physical / Billing Address
              </label>
              <textarea
                rows={2}
                placeholder="123 Business Way, Suite 400..."
                value={address}
                onChange={(e) => setAddress(e.target.value)}
                className="w-full px-3.5 py-2.5 rounded-xl bg-[#F9FAFB] dark:bg-[#121215] border border-gray-200/80 dark:border-[#27272a] text-[13px] font-medium text-gray-900 dark:text-white placeholder:font-normal placeholder:text-gray-400 dark:placeholder:text-zinc-500 focus:outline-none focus:border-blue-600 focus:ring-2 focus:ring-blue-600/15 resize-none"
              />
            </div>

            <div>
              <label className="block text-[12px] font-medium text-gray-700 dark:text-zinc-300 mb-1">
                Internal Notes
              </label>
              <textarea
                rows={2}
                placeholder="Private client context, billing instructions, or preferred payment methods..."
                value={notes}
                onChange={(e) => setNotes(e.target.value)}
                className="w-full px-3.5 py-2.5 rounded-xl bg-[#F9FAFB] dark:bg-[#121215] border border-gray-200/80 dark:border-[#27272a] text-[13px] font-medium text-gray-900 dark:text-white placeholder:font-normal placeholder:text-gray-400 dark:placeholder:text-zinc-500 focus:outline-none focus:border-blue-600 focus:ring-2 focus:ring-blue-600/15 resize-none"
              />
            </div>
          </div>

          {/* Pinned Footer */}
          <div className="shrink-0 px-5 pt-3.5 pb-[calc(1.5rem+env(safe-area-inset-bottom,12px))] sm:px-6 sm:py-4 border-t border-gray-100 dark:border-[#27272a] bg-white dark:bg-[#18181b] grid grid-cols-2 sm:flex sm:items-center sm:justify-end gap-3">
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
              {isSubmitting ? 'Creating...' : 'Create Client'}
            </button>
          </div>
        </form>
      </div>
    </div>,
    document.body
  );
}

function EditClientModal({
  client,
  onClose,
  onUpdated,
}: {
  client: ClientDetail;
  onClose: () => void;
  onUpdated: () => void;
}) {
  const { showToast } = useToast();
  useModalScrollLock(true);
  const dragStartY = useRef<number | null>(null);
  const [dragOffsetY, setDragOffsetY] = useState(0);
  const [name, setName] = useState(client.name);
  const [company, setCompany] = useState(client.company || '');
  const [email, setEmail] = useState(client.email || '');
  const [phone, setPhone] = useState(client.phone || '');

  const { initialAddress, initialNotes } = useMemo(() => {
    if (!client.notes) return { initialAddress: '', initialNotes: '' };
    const lines = client.notes.split('\n');
    const addrLine = lines.find((l) => l.startsWith('Address: '));
    const rest = lines.filter((l) => !l.startsWith('Address: ')).join('\n').trim();
    return {
      initialAddress: addrLine ? addrLine.replace('Address: ', '').trim() : '',
      initialNotes: rest,
    };
  }, [client.notes]);

  const [address, setAddress] = useState(initialAddress);
  const [notes, setNotes] = useState(initialNotes);
  const [isSubmitting, setIsSubmitting] = useState(false);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!name.trim()) {
      showToast('Client name is required', 'info');
      return;
    }

    try {
      setIsSubmitting(true);
      const combinedNotes = [
        address.trim() ? `Address: ${address.trim()}` : null,
        notes.trim() ? notes.trim() : null,
      ].filter(Boolean).join('\n\n');

      await ClientRepo.update(client.id, {
        name: name.trim(),
        company: company.trim() || null,
        email: email.trim() || null,
        phone: phone.trim() || null,
        notes: combinedNotes || null,
      });

      onUpdated();
    } catch (err: unknown) {
      const msg = err instanceof Error ? err.message : 'Failed to update client';
      showToast(msg, 'info');
    } finally {
      setIsSubmitting(false);
    }
  };

  return createPortal(
    <div
      onClick={onClose}
      className="fixed inset-0 z-[100] w-screen h-dvh bg-black/60 backdrop-blur-xs flex items-end sm:items-center justify-center p-0 sm:p-4 touch-none"
    >
      <div
        onClick={(e) => e.stopPropagation()}
        style={dragOffsetY > 0 ? { transform: `translateY(${dragOffsetY}px)`, transition: 'none' } : undefined}
        className="w-full sm:max-w-[460px] h-[85dvh] sm:h-auto sm:max-h-[90dvh] rounded-t-2xl sm:rounded-2xl border-t sm:border border-gray-200 dark:border-[#27272a] bg-white dark:bg-[#18181b] flex flex-col shadow-2xl overflow-hidden touch-auto animate-in slide-in-from-bottom sm:zoom-in-95 duration-200 text-left font-sans"
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

        {/* Pinned Header */}
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
                Edit Client
              </h3>
              <p className="text-[13px] text-gray-500 dark:text-zinc-400 mt-0.5">
                Update client profile information.
              </p>
            </div>
            <button
              type="button"
              onClick={onClose}
              aria-label="Close modal"
              className="w-8 h-8 rounded-lg bg-gray-100 hover:bg-gray-200 dark:bg-[#222226] text-gray-800 dark:text-zinc-200 flex items-center justify-center transition-colors shrink-0 cursor-pointer"
            >
              <X className="h-4 w-4 text-gray-800 dark:text-zinc-200" strokeWidth={2.25} />
            </button>
          </div>
        </div>

        <form onSubmit={handleSubmit} className="flex flex-col flex-1 min-h-0">
          <div className="flex-1 overflow-y-auto overscroll-contain px-5 py-4 sm:px-6 sm:py-5 space-y-4">
            <div>
              <label className="block text-[12px] font-medium text-gray-700 dark:text-zinc-300 mb-1">
                Client Name <span className="text-rose-500">*</span>
              </label>
              <input
                type="text"
                required
                value={name}
                onChange={(e) => setName(e.target.value)}
                className="w-full h-10 px-3.5 rounded-xl bg-[#F9FAFB] dark:bg-[#121215] border border-gray-200/80 dark:border-[#27272a] text-[13px] font-medium text-gray-900 dark:text-white placeholder:font-normal placeholder:text-gray-400 dark:placeholder:text-zinc-500 focus:outline-none focus:border-blue-600 focus:ring-2 focus:ring-blue-600/15"
              />
            </div>

            <div>
              <label className="block text-[12px] font-medium text-gray-700 dark:text-zinc-300 mb-1">
                Company (Optional)
              </label>
              <input
                type="text"
                value={company}
                onChange={(e) => setCompany(e.target.value)}
                className="w-full h-10 px-3.5 rounded-xl bg-[#F9FAFB] dark:bg-[#121215] border border-gray-200/80 dark:border-[#27272a] text-[13px] font-medium text-gray-900 dark:text-white placeholder:font-normal placeholder:text-gray-400 dark:placeholder:text-zinc-500 focus:outline-none focus:border-blue-600 focus:ring-2 focus:ring-blue-600/15"
              />
            </div>

            <div className="grid grid-cols-1 sm:grid-cols-2 gap-3.5">
              <div>
                <label className="block text-[12px] font-medium text-gray-700 dark:text-zinc-300 mb-1">
                  Email
                </label>
                <input
                  type="email"
                  value={email}
                  onChange={(e) => setEmail(e.target.value)}
                  className="w-full h-10 px-3.5 rounded-xl bg-[#F9FAFB] dark:bg-[#121215] border border-gray-200/80 dark:border-[#27272a] text-[13px] font-medium text-gray-900 dark:text-white placeholder:font-normal placeholder:text-gray-400 dark:placeholder:text-zinc-500 focus:outline-none focus:border-blue-600 focus:ring-2 focus:ring-blue-600/15"
                />
              </div>

              <div>
                <label className="block text-[12px] font-medium text-gray-700 dark:text-zinc-300 mb-1">
                  Phone
                </label>
                <input
                  type="tel"
                  value={phone}
                  onChange={(e) => setPhone(e.target.value)}
                  className="w-full h-10 px-3.5 rounded-xl bg-[#F9FAFB] dark:bg-[#121215] border border-gray-200/80 dark:border-[#27272a] text-[13px] font-medium text-gray-900 dark:text-white placeholder:font-normal placeholder:text-gray-400 dark:placeholder:text-zinc-500 focus:outline-none focus:border-blue-600 focus:ring-2 focus:ring-blue-600/15"
                />
              </div>
            </div>

            <div>
              <label className="block text-[12px] font-medium text-gray-700 dark:text-zinc-300 mb-1">
                Physical / Billing Address
              </label>
              <textarea
                rows={2}
                value={address}
                onChange={(e) => setAddress(e.target.value)}
                className="w-full px-3.5 py-2.5 rounded-xl bg-[#F9FAFB] dark:bg-[#121215] border border-gray-200/80 dark:border-[#27272a] text-[13px] font-medium text-gray-900 dark:text-white placeholder:font-normal placeholder:text-gray-400 dark:placeholder:text-zinc-500 focus:outline-none focus:border-blue-600 focus:ring-2 focus:ring-blue-600/15 resize-none"
              />
            </div>

            <div>
              <label className="block text-[12px] font-medium text-gray-700 dark:text-zinc-300 mb-1">
                Internal Notes
              </label>
              <textarea
                rows={2}
                value={notes}
                onChange={(e) => setNotes(e.target.value)}
                className="w-full px-3.5 py-2.5 rounded-xl bg-[#F9FAFB] dark:bg-[#121215] border border-gray-200/80 dark:border-[#27272a] text-[13px] font-medium text-gray-900 dark:text-white placeholder:font-normal placeholder:text-gray-400 dark:placeholder:text-zinc-500 focus:outline-none focus:border-blue-600 focus:ring-2 focus:ring-blue-600/15 resize-none"
              />
            </div>
          </div>

          <div className="shrink-0 px-5 pt-3.5 pb-[calc(1.5rem+env(safe-area-inset-bottom,12px))] sm:px-6 sm:py-4 border-t border-gray-100 dark:border-[#27272a] bg-white dark:bg-[#18181b] grid grid-cols-2 sm:flex sm:items-center sm:justify-end gap-3">
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
              {isSubmitting ? 'Saving...' : 'Save Changes'}
            </button>
          </div>
        </form>
      </div>
    </div>,
    document.body
  );
}

function DeleteClientModal({
  client,
  onClose,
  onDeleted,
}: {
  client: { id: string; name: string };
  onClose: () => void;
  onDeleted: () => void;
}) {
  const { showToast } = useToast();
  useModalScrollLock(true);
  const dragStartY = useRef<number | null>(null);
  const [dragOffsetY, setDragOffsetY] = useState(0);
  const [isDeleting, setIsDeleting] = useState(false);

  const handleDelete = async () => {
    try {
      setIsDeleting(true);
      await ClientRepo.softDelete(client.id);
      onDeleted();
    } catch (err: unknown) {
      const msg = err instanceof Error ? err.message : 'Failed to delete client';
      showToast(msg, 'info');
    } finally {
      setIsDeleting(false);
    }
  };

  return createPortal(
    <div
      onClick={onClose}
      className="fixed inset-0 z-[100] w-screen h-dvh bg-black/60 backdrop-blur-xs flex items-end sm:items-center justify-center p-0 sm:p-4 touch-none"
    >
      <div
        onClick={(e) => e.stopPropagation()}
        style={dragOffsetY > 0 ? { transform: `translateY(${dragOffsetY}px)`, transition: 'none' } : undefined}
        className="w-full sm:max-w-[460px] h-[85dvh] sm:h-auto sm:max-h-[90dvh] rounded-t-2xl sm:rounded-2xl border-t sm:border border-gray-200 dark:border-[#27272a] bg-white dark:bg-[#18181b] flex flex-col shadow-2xl overflow-hidden touch-auto animate-in slide-in-from-bottom sm:zoom-in-95 duration-200 text-left font-sans"
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

        {/* Pinned Header */}
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
                Delete Client
              </h3>
              <p className="text-[13px] text-gray-500 dark:text-zinc-400 mt-0.5">
                Soft-delete this profile.
              </p>
            </div>
            <button
              type="button"
              onClick={onClose}
              aria-label="Close modal"
              className="w-8 h-8 rounded-lg bg-gray-100 hover:bg-gray-200 dark:bg-[#222226] text-gray-800 dark:text-zinc-200 flex items-center justify-center transition-colors shrink-0 cursor-pointer"
            >
              <X className="h-4 w-4 text-gray-800 dark:text-zinc-200" strokeWidth={2.25} />
            </button>
          </div>
        </div>

        <div className="flex-1 overflow-y-auto overscroll-contain px-5 py-4 sm:px-6 sm:py-5 space-y-3">
          <p className="text-[13px] text-gray-600 dark:text-zinc-300 leading-relaxed">
            Are you sure you want to delete <strong className="text-gray-900 dark:text-white">{client.name}</strong>?
            All past invoices, recorded payments, and ledger events will remain intact in your financial reports.
          </p>
        </div>

        <div className="shrink-0 px-5 pt-3.5 pb-[calc(1.5rem+env(safe-area-inset-bottom,12px))] sm:px-6 sm:py-4 border-t border-gray-100 dark:border-[#27272a] bg-white dark:bg-[#18181b] grid grid-cols-2 sm:flex sm:items-center sm:justify-end gap-3">
          <button
            type="button"
            onClick={onClose}
            className="h-11 sm:h-10 w-full sm:w-auto px-4 rounded-xl border border-gray-200 dark:border-[#27272a] bg-white dark:bg-[#18181b] text-[13px] font-medium text-gray-700 dark:text-zinc-300 hover:bg-gray-50 dark:hover:bg-[#222226] transition-colors cursor-pointer inline-flex items-center justify-center"
          >
            Cancel
          </button>
          <button
            type="button"
            onClick={handleDelete}
            disabled={isDeleting}
            className="h-11 sm:h-10 w-full sm:w-auto px-5 rounded-xl bg-rose-600 hover:bg-rose-700 text-white text-[13px] font-medium transition-colors disabled:opacity-50 cursor-pointer inline-flex items-center justify-center"
          >
            {isDeleting ? 'Deleting...' : 'Delete Client'}
          </button>
        </div>
      </div>
    </div>,
    document.body
  );
}

function AddLinkModal({
  clientId,
  onClose,
  onAdded,
}: {
  clientId: string;
  onClose: () => void;
  onAdded: () => void;
}) {
  const { showToast } = useToast();
  useModalScrollLock(true);
  const dragStartY = useRef<number | null>(null);
  const [dragOffsetY, setDragOffsetY] = useState(0);
  const [label, setLabel] = useState('');
  const [url, setUrl] = useState('');
  const [isSubmitting, setIsSubmitting] = useState(false);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!label.trim() || !url.trim()) {
      showToast('Label and URL are required', 'info');
      return;
    }

    try {
      setIsSubmitting(true);
      await ClientLinkRepo.add(clientId, label.trim(), url.trim());
      onAdded();
    } catch (err: unknown) {
      const msg = err instanceof Error ? err.message : 'Failed to add link';
      showToast(msg, 'info');
    } finally {
      setIsSubmitting(false);
    }
  };

  return createPortal(
    <div
      onClick={onClose}
      className="fixed inset-0 z-[100] w-screen h-dvh bg-black/60 backdrop-blur-xs flex items-end sm:items-center justify-center p-0 sm:p-4 touch-none"
    >
      <div
        onClick={(e) => e.stopPropagation()}
        style={dragOffsetY > 0 ? { transform: `translateY(${dragOffsetY}px)`, transition: 'none' } : undefined}
        className="w-full sm:max-w-[460px] h-[85dvh] sm:h-auto sm:max-h-[90dvh] rounded-t-2xl sm:rounded-2xl border-t sm:border border-gray-200 dark:border-[#27272a] bg-white dark:bg-[#18181b] flex flex-col shadow-2xl overflow-hidden touch-auto animate-in slide-in-from-bottom sm:zoom-in-95 duration-200 text-left font-sans"
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

        {/* Pinned Header */}
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
                Add Document Link
              </h3>
              <p className="text-[13px] text-gray-500 dark:text-zinc-400 mt-0.5">
                Attach a link or asset URL to this client.
              </p>
            </div>
            <button
              type="button"
              onClick={onClose}
              aria-label="Close modal"
              className="w-8 h-8 rounded-lg bg-gray-100 hover:bg-gray-200 dark:bg-[#222226] text-gray-800 dark:text-zinc-200 flex items-center justify-center transition-colors shrink-0 cursor-pointer"
            >
              <X className="h-4 w-4 text-gray-800 dark:text-zinc-200" strokeWidth={2.25} />
            </button>
          </div>
        </div>

        <form onSubmit={handleSubmit} className="flex flex-col flex-1 min-h-0">
          <div className="flex-1 overflow-y-auto overscroll-contain px-5 py-4 sm:px-6 sm:py-5 space-y-3.5">
            <div>
              <label className="block text-[12px] font-medium text-gray-700 dark:text-zinc-300 mb-1">
                Link Label
              </label>
              <input
                type="text"
                required
                placeholder="e.g. Google Drive Assets, Figma Board..."
                value={label}
                onChange={(e) => setLabel(e.target.value)}
                className="w-full h-10 px-3.5 rounded-xl bg-[#F9FAFB] dark:bg-[#121215] border border-gray-200/80 dark:border-[#27272a] text-[13px] font-medium text-gray-900 dark:text-white placeholder:font-normal placeholder:text-gray-400 dark:placeholder:text-zinc-500 focus:outline-none focus:border-blue-600 focus:ring-2 focus:ring-blue-600/15"
              />
            </div>

            <div>
              <label className="block text-[12px] font-medium text-gray-700 dark:text-zinc-300 mb-1">
                URL
              </label>
              <input
                type="url"
                required
                placeholder="https://..."
                value={url}
                onChange={(e) => setUrl(e.target.value)}
                className="w-full h-10 px-3.5 rounded-xl bg-[#F9FAFB] dark:bg-[#121215] border border-gray-200/80 dark:border-[#27272a] text-[13px] font-medium text-gray-900 dark:text-white placeholder:font-normal placeholder:text-gray-400 dark:placeholder:text-zinc-500 focus:outline-none focus:border-blue-600 focus:ring-2 focus:ring-blue-600/15"
              />
            </div>
          </div>

          <div className="shrink-0 px-5 pt-3.5 pb-[calc(1.5rem+env(safe-area-inset-bottom,12px))] sm:px-6 sm:py-4 border-t border-gray-100 dark:border-[#27272a] bg-white dark:bg-[#18181b] grid grid-cols-2 sm:flex sm:items-center sm:justify-end gap-3">
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
              {isSubmitting ? 'Adding...' : 'Add Link'}
            </button>
          </div>
        </form>
      </div>
    </div>,
    document.body
  );
}

function EditLinkModal({
  link,
  onClose,
  onUpdated,
}: {
  link: ClientLinkRow;
  onClose: () => void;
  onUpdated: () => void;
}) {
  const { showToast } = useToast();
  useModalScrollLock(true);
  const dragStartY = useRef<number | null>(null);
  const [dragOffsetY, setDragOffsetY] = useState(0);
  const [label, setLabel] = useState(link.label);
  const [url, setUrl] = useState(link.url);
  const [isSubmitting, setIsSubmitting] = useState(false);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!label.trim() || !url.trim()) {
      showToast('Label and URL are required', 'info');
      return;
    }

    try {
      setIsSubmitting(true);
      await ClientLinkRepo.update(link.id, { label: label.trim(), url: url.trim() });
      onUpdated();
    } catch (err: unknown) {
      const msg = err instanceof Error ? err.message : 'Failed to update link';
      showToast(msg, 'info');
    } finally {
      setIsSubmitting(false);
    }
  };

  return createPortal(
    <div
      onClick={onClose}
      className="fixed inset-0 z-[100] w-screen h-dvh bg-black/60 backdrop-blur-xs flex items-end sm:items-center justify-center p-0 sm:p-4 touch-none"
    >
      <div
        onClick={(e) => e.stopPropagation()}
        style={dragOffsetY > 0 ? { transform: `translateY(${dragOffsetY}px)`, transition: 'none' } : undefined}
        className="w-full sm:max-w-[460px] h-[85dvh] sm:h-auto sm:max-h-[90dvh] rounded-t-2xl sm:rounded-2xl border-t sm:border border-gray-200 dark:border-[#27272a] bg-white dark:bg-[#18181b] flex flex-col shadow-2xl overflow-hidden touch-auto animate-in slide-in-from-bottom sm:zoom-in-95 duration-200 text-left font-sans"
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

        {/* Pinned Header */}
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
                Edit Document Link
              </h3>
              <p className="text-[13px] text-gray-500 dark:text-zinc-400 mt-0.5">
                Update document link details.
              </p>
            </div>
            <button
              type="button"
              onClick={onClose}
              aria-label="Close modal"
              className="w-8 h-8 rounded-lg bg-gray-100 hover:bg-gray-200 dark:bg-[#222226] text-gray-800 dark:text-zinc-200 flex items-center justify-center transition-colors shrink-0 cursor-pointer"
            >
              <X className="h-4 w-4 text-gray-800 dark:text-zinc-200" strokeWidth={2.25} />
            </button>
          </div>
        </div>

        <form onSubmit={handleSubmit} className="flex flex-col flex-1 min-h-0">
          <div className="flex-1 overflow-y-auto overscroll-contain px-5 py-4 sm:px-6 sm:py-5 space-y-3.5">
            <div>
              <label className="block text-[12px] font-medium text-gray-700 dark:text-zinc-300 mb-1">
                Link Label
              </label>
              <input
                type="text"
                required
                value={label}
                onChange={(e) => setLabel(e.target.value)}
                className="w-full h-10 px-3.5 rounded-xl bg-[#F9FAFB] dark:bg-[#121215] border border-gray-200/80 dark:border-[#27272a] text-[13px] font-medium text-gray-900 dark:text-white placeholder:font-normal placeholder:text-gray-400 dark:placeholder:text-zinc-500 focus:outline-none focus:border-blue-600 focus:ring-2 focus:ring-blue-600/15"
              />
            </div>

            <div>
              <label className="block text-[12px] font-medium text-gray-700 dark:text-zinc-300 mb-1">
                URL
              </label>
              <input
                type="url"
                required
                value={url}
                onChange={(e) => setUrl(e.target.value)}
                className="w-full h-10 px-3.5 rounded-xl bg-[#F9FAFB] dark:bg-[#121215] border border-gray-200/80 dark:border-[#27272a] text-[13px] font-medium text-gray-900 dark:text-white placeholder:font-normal placeholder:text-gray-400 dark:placeholder:text-zinc-500 focus:outline-none focus:border-blue-600 focus:ring-2 focus:ring-blue-600/15"
              />
            </div>
          </div>

          <div className="shrink-0 px-5 pt-3.5 pb-[calc(1.5rem+env(safe-area-inset-bottom,12px))] sm:px-6 sm:py-4 border-t border-gray-100 dark:border-[#27272a] bg-white dark:bg-[#18181b] grid grid-cols-2 sm:flex sm:items-center sm:justify-end gap-3">
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
              {isSubmitting ? 'Saving...' : 'Save Changes'}
            </button>
          </div>
        </form>
      </div>
    </div>,
    document.body
  );
}

function DeleteLinkModal({
  link,
  onClose,
  onDeleted,
}: {
  link: ClientLinkRow;
  onClose: () => void;
  onDeleted: () => void;
}) {
  const { showToast } = useToast();
  useModalScrollLock(true);
  const dragStartY = useRef<number | null>(null);
  const [dragOffsetY, setDragOffsetY] = useState(0);
  const [isDeleting, setIsDeleting] = useState(false);

  const handleDelete = async () => {
    try {
      setIsDeleting(true);
      await ClientLinkRepo.softDelete(link.id);
      onDeleted();
    } catch (err: unknown) {
      const msg = err instanceof Error ? err.message : 'Failed to delete link';
      showToast(msg, 'info');
    } finally {
      setIsDeleting(false);
    }
  };

  return createPortal(
    <div
      onClick={onClose}
      className="fixed inset-0 z-[100] w-screen h-dvh bg-black/60 backdrop-blur-xs flex items-end sm:items-center justify-center p-0 sm:p-4 touch-none"
    >
      <div
        onClick={(e) => e.stopPropagation()}
        style={dragOffsetY > 0 ? { transform: `translateY(${dragOffsetY}px)`, transition: 'none' } : undefined}
        className="w-full sm:max-w-[460px] h-[85dvh] sm:h-auto sm:max-h-[90dvh] rounded-t-2xl sm:rounded-2xl border-t sm:border border-gray-200 dark:border-[#27272a] bg-white dark:bg-[#18181b] flex flex-col shadow-2xl overflow-hidden touch-auto animate-in slide-in-from-bottom sm:zoom-in-95 duration-200 text-left font-sans"
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

        {/* Pinned Header */}
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
                Remove Document Link
              </h3>
              <p className="text-[13px] text-gray-500 dark:text-zinc-400 mt-0.5">
                Remove this link from client profile.
              </p>
            </div>
            <button
              type="button"
              onClick={onClose}
              aria-label="Close modal"
              className="w-8 h-8 rounded-lg bg-gray-100 hover:bg-gray-200 dark:bg-[#222226] text-gray-800 dark:text-zinc-200 flex items-center justify-center transition-colors shrink-0 cursor-pointer"
            >
              <X className="h-4 w-4 text-gray-800 dark:text-zinc-200" strokeWidth={2.25} />
            </button>
          </div>
        </div>

        <div className="flex-1 overflow-y-auto overscroll-contain px-5 py-4 sm:px-6 sm:py-5 space-y-3">
          <p className="text-[13px] text-gray-600 dark:text-zinc-300 leading-relaxed">
            Are you sure you want to remove the link <strong className="text-gray-900 dark:text-white">{link.label}</strong>?
          </p>
        </div>

        <div className="shrink-0 px-5 pt-3.5 pb-[calc(1.5rem+env(safe-area-inset-bottom,12px))] sm:px-6 sm:py-4 border-t border-gray-100 dark:border-[#27272a] bg-white dark:bg-[#18181b] grid grid-cols-2 sm:flex sm:items-center sm:justify-end gap-3">
          <button
            type="button"
            onClick={onClose}
            className="h-11 sm:h-10 w-full sm:w-auto px-4 rounded-xl border border-gray-200 dark:border-[#27272a] bg-white dark:bg-[#18181b] text-[13px] font-medium text-gray-700 dark:text-zinc-300 hover:bg-gray-50 dark:hover:bg-[#222226] transition-colors cursor-pointer inline-flex items-center justify-center"
          >
            Cancel
          </button>
          <button
            type="button"
            onClick={handleDelete}
            disabled={isDeleting}
            className="h-11 sm:h-10 w-full sm:w-auto px-5 rounded-xl bg-rose-600 hover:bg-rose-700 text-white text-[13px] font-medium transition-colors disabled:opacity-50 cursor-pointer inline-flex items-center justify-center"
          >
            {isDeleting ? 'Removing...' : 'Remove Link'}
          </button>
        </div>
      </div>
    </div>,
    document.body
  );
}

// Skeleton Placeholder for Clients Master Table
// --------------------------------------------------------------------------
function ClientsTableSkeleton() {
  return (
    <div className="w-full space-y-3 animate-pulse text-left font-sans">
      <div className="rounded-2xl border border-gray-200 dark:border-[#27272a] bg-white dark:bg-[#121215] overflow-hidden p-4 space-y-4">
        <div className="h-5 w-40 bg-gray-200 dark:bg-[#27272a] rounded" />
        <div className="space-y-2.5">
          {[1, 2, 3, 4, 5].map((i) => (
            <div key={i} className="h-12 bg-gray-100 dark:bg-[#18181b] rounded-xl" />
          ))}
        </div>
      </div>
    </div>
  );
}
