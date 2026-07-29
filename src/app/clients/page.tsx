'use client';
 
import React, { useState, useMemo } from 'react';
import { useRouter } from 'next/navigation';
import { ProtectedRoute } from '../../components/ProtectedRoute';
import { AppShell } from '../../components/AppShell';
import { useClients, useClient, useClientLinks, useProfile, useInvoicesForClient } from '../../lib/data/hooks';
import { ClientRepo } from '../../lib/data/client';
import { ClientLinkRepo } from '../../lib/data/client-link';
import { formatMoney } from '../../lib/money';
import { ClientSummary, ClientDetail } from '../../lib/data/types';
import { ClientLinkRow } from '../../lib/sync/schema';
import { 
  Users, Mail, Building, Phone, Plus, Search, Edit2, Trash2, 
  ExternalLink, X, Landmark, FileText, ChevronRight, MessageSquare 
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
        <ClientsDashboard />
      </AppShell>
    </ProtectedRoute>
  );
}

function ClientsDashboard() {
  const router = useRouter();
  const { data: clients, isLoading: isClientsLoading } = useClients();
  const { data: profile } = useProfile();

  // Search and selection states
  const [searchQuery, setSearchQuery] = useState('');
  const [selectedClientId, setSelectedClientId] = useState<string | null>(null);

  // Modals visibility states
  const [showAddClient, setShowAddClient] = useState(false);
  const [showEditClient, setShowEditClient] = useState<ClientDetail | null>(null); // holds client object to edit
  const [showAddLink, setShowAddLink] = useState(false);
  const [showEditLink, setShowEditLink] = useState<ClientLinkRow | null>(null); // holds link object to edit

  // Live queries for selected client details
  const { data: selectedClientDetail } = useClient(selectedClientId || '');
  const { data: selectedClientLinks } = useClientLinks(selectedClientId || '');
  const { data: selectedClientInvoices } = useInvoicesForClient(selectedClientId || '');

  // Sort unpaid and overdue first, then date descending
  const sortedInvoices = useMemo(() => {
    if (!selectedClientInvoices) return [];
    return [...selectedClientInvoices].sort((a, b) => {
      const isUnpaidOrOverdue = (status: string) => status === 'sent' || status === 'overdue' || status === 'partially_paid';
      const aUnpaid = isUnpaidOrOverdue(a.displayStatus);
      const bUnpaid = isUnpaidOrOverdue(b.displayStatus);

      if (aUnpaid && !bUnpaid) return -1;
      if (!aUnpaid && bUnpaid) return 1;

      // Handle issue_date sorting (nullable)
      const dateA = a.issue_date || '';
      const dateB = b.issue_date || '';
      return dateB.localeCompare(dateA);
    });
  }, [selectedClientInvoices]);

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
      setSelectedClientId(id); // auto-select new client
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
        setSelectedClientId(null);
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
        {isClientsLoading ? (
          <div className="flex-1 space-y-4">
            <div className="rounded-2xl border border-slate-900 bg-slate-900/10 p-6 animate-pulse h-24"></div>
            <div className="rounded-2xl border border-slate-900 bg-slate-900/10 p-6 animate-pulse h-24"></div>
          </div>
        ) : filteredClients.length > 0 ? (
          <div className="flex-1 overflow-y-auto space-y-3 pr-2 scrollbar-thin scrollbar-thumb-slate-800 scrollbar-track-transparent">
            {filteredClients.map((client) => (
              <div
                key={client.id}
                onClick={() => setSelectedClientId(client.id)}
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
        )}
      </div>

      {/* Client Details Section (Right Detail Panel / Mobile Slide-over) */}
      {selectedClientId && selectedClientDetail && (
        <div className="w-full md:w-[26rem] lg:w-[32rem] shrink-0 border border-slate-900 bg-slate-950/30 rounded-3xl flex flex-col overflow-hidden backdrop-blur-2xl absolute md:relative inset-0 md:inset-auto z-10 animate-slide-in">
          {/* Details Header */}
          <div className="p-6 border-b border-slate-900/60 flex items-center justify-between">
            <button
              onClick={() => setSelectedClientId(null)}
              className="inline-flex items-center gap-1 text-xs text-slate-400 hover:text-white transition md:hidden"
            >
              <X className="h-4 w-4" /> Back to Clients
            </button>
            <span className="hidden md:inline text-xs font-semibold text-indigo-400">Client Profile Details</span>

            <div className="flex items-center gap-3">
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
              <button
                onClick={() => setSelectedClientId(null)}
                className="hidden md:block p-2 rounded-lg bg-slate-900 border border-slate-800 text-slate-400 hover:text-white transition"
              >
                <X className="h-4 w-4" />
              </button>
            </div>
          </div>

          <div className="flex-1 overflow-y-auto p-6 space-y-6 scrollbar-thin scrollbar-thumb-slate-800 scrollbar-track-transparent">
            {/* Base Contact Card */}
            <div className="space-y-4">
              <h2 className="text-2xl font-extrabold text-white leading-tight">{selectedClientDetail.name}</h2>
              
              {selectedClientDetail.company && (
                <div className="flex items-center gap-2.5 text-sm text-slate-400">
                  <Building className="h-4.5 w-4.5 text-slate-600" />
                  <span>{selectedClientDetail.company}</span>
                </div>
              )}
              {selectedClientDetail.email && (
                <div className="flex items-center gap-2.5 text-sm text-slate-400">
                  <Mail className="h-4.5 w-4.5 text-slate-600" />
                  <a href={`mailto:${selectedClientDetail.email}`} className="hover:underline hover:text-indigo-400 transition">{selectedClientDetail.email}</a>
                </div>
              )}
              {selectedClientDetail.phone && (
                <div className="flex items-center gap-2.5 text-sm text-slate-400">
                  <Phone className="h-4.5 w-4.5 text-slate-600" />
                  <span>{selectedClientDetail.phone}</span>
                </div>
              )}
            </div>

            {/* Notes Section */}
            {selectedClientDetail.notes && (
              <div className="rounded-2xl border border-slate-900 bg-slate-950/30 p-4 space-y-2">
                <span className="text-[10px] font-extrabold text-slate-500 uppercase tracking-widest flex items-center gap-1.5">
                  <MessageSquare className="h-3 w-3" />
                  Internal Notes
                </span>
                <p className="text-sm text-slate-400 whitespace-pre-line leading-relaxed">{selectedClientDetail.notes}</p>
              </div>
            )}

            {/* Outstanding Balance (Separated per currency) */}
            <div className="rounded-2xl border border-slate-900 bg-gradient-to-br from-slate-900/40 to-slate-950/40 p-5 space-y-3">
              <h4 className="text-xs font-bold text-slate-500 uppercase tracking-widest flex items-center gap-1.5">
                <Landmark className="h-4 w-4 text-indigo-400" />
                Outstanding Balance
              </h4>
              <div className="space-y-2">
                {selectedClientDetail.outstandingBalances && selectedClientDetail.outstandingBalances.length > 0 ? (
                  selectedClientDetail.outstandingBalances.map((bal) => (
                    <div key={bal.currency} className="flex justify-between items-baseline border-b border-slate-900/30 pb-2 last:border-0 last:pb-0">
                      <span className="text-sm text-slate-400 font-semibold">{bal.currency}</span>
                      <span className="text-lg font-extrabold text-white">
                        {formatMoney({ amountMinor: bal.amountMinor, currency: bal.currency })}
                      </span>
                    </div>
                  ))
                ) : (
                  <p className="text-xs text-slate-500 italic">No outstanding ledger balances</p>
                )}
              </div>
            </div>
 
            {/* Invoices Section */}
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

              {selectedClientInvoices && selectedClientInvoices.length > 0 ? (
                <div className="space-y-2.5">
                  {sortedInvoices.map((inv) => {
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
                        className="rounded-xl border border-slate-900/60 bg-slate-950/20 p-3.5 flex items-center justify-between group hover:border-slate-800 transition cursor-pointer"
                      >
                        <div className="min-w-0 pr-3 space-y-1">
                          <div className="flex items-center gap-2">
                            <span className="font-bold text-sm text-white group-hover:text-indigo-400 transition truncate">
                              {inv.invoice_number}
                            </span>
                            <span className={`inline-flex rounded px-1.5 py-0.5 text-[9px] font-bold border ${statusColors[inv.displayStatus]}`}>
                              {badgeText[inv.displayStatus]}
                            </span>
                          </div>
                          <div className="text-[10px] text-slate-500">
                            {inv.issue_date ? `Issued: ${inv.issue_date}` : 'Draft'}
                            {inv.due_date ? ` · Due: ${inv.due_date}` : ''}
                          </div>
                        </div>

                        <div className="text-right shrink-0">
                          <div className="text-sm font-extrabold text-white">
                            {formatMoney({ amountMinor: inv.total_minor, currency: inv.currency })}
                          </div>
                          {inv.balanceDueMinor > 0 && inv.displayStatus !== 'void' && (
                            <div className="text-[10px] text-slate-400">
                              Due: {formatMoney({ amountMinor: inv.balanceDueMinor, currency: inv.currency })}
                            </div>
                          )}
                        </div>
                      </div>
                    );
                  })}
                </div>
              ) : (
                <div className="rounded-xl border border-dashed border-slate-900 p-6 text-center space-y-2">
                  <p className="text-xs text-slate-500">No invoices generated for this client.</p>
                  <button
                    onClick={() => router.push(`/clients/${selectedClientId}/invoices/new`)}
                    className="text-[10px] text-indigo-400 hover:underline"
                  >
                    Create first invoice
                  </button>
                </div>
              )}
            </div>

            {/* Payment History Section (Prompt 8 Shell) */}
            <div className="space-y-4">
              <h4 className="text-xs font-bold text-slate-500 uppercase tracking-widest flex items-center gap-1.5">
                <Landmark className="h-4 w-4 text-indigo-400" />
                Payment History
              </h4>
              <div className="rounded-xl border border-dashed border-slate-900 p-6 text-center">
                <p className="text-xs text-slate-500">No payment history recorded.</p>
              </div>
            </div>

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
