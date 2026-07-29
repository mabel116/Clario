'use client';

import React from 'react';
import { ProtectedRoute } from '../../components/ProtectedRoute';
import { AppShell } from '../../components/AppShell';
import { useClients } from '../../lib/data/hooks';
import { Users, Mail, Building, Plus, ArrowRight } from 'lucide-react';

export default function ClientsPage() {
  return (
    <ProtectedRoute>
      <AppShell>
        <ClientsView />
      </AppShell>
    </ProtectedRoute>
  );
}

function ClientsView() {
  const { data: clients, isLoading } = useClients();

  return (
    <div className="space-y-8 animate-fade-in">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-3xl font-bold tracking-tight text-white flex items-center gap-3">
            <Users className="h-8 w-8 text-indigo-500" />
            Clients
          </h1>
          <p className="text-sm text-slate-400 mt-1">Manage client records and contact information</p>
        </div>
        <button
          disabled
          className="inline-flex justify-center items-center gap-1.5 rounded-lg bg-slate-900 border border-slate-800 px-4 py-2.5 text-xs font-semibold text-slate-400 cursor-not-allowed opacity-60"
        >
          <Plus className="h-4 w-4" /> Add Client
        </button>
      </div>

      {isLoading ? (
        <div className="space-y-4">
          <div className="rounded-xl border border-slate-900 bg-slate-900/10 p-5 animate-pulse h-20"></div>
          <div className="rounded-xl border border-slate-900 bg-slate-900/10 p-5 animate-pulse h-20"></div>
        </div>
      ) : (
        <div className="space-y-6">
          {clients && clients.length > 0 ? (
            <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
              {clients.map((client) => (
                <div
                  key={client.id}
                  className="rounded-xl border border-slate-900 bg-slate-900/20 p-5 backdrop-blur-md flex flex-col justify-between hover:border-slate-800 transition group cursor-pointer"
                >
                  <div className="space-y-3">
                    <div className="flex justify-between items-start">
                      <h3 className="font-bold text-white text-base group-hover:text-indigo-400 transition">{client.name}</h3>
                      <span className="text-[10px] text-slate-500 font-bold uppercase tracking-wider tabular-nums">
                        {client.default_currency || 'USD'}
                      </span>
                    </div>
                    
                    <div className="space-y-1 text-sm text-slate-400">
                      {client.company && (
                        <div className="flex items-center gap-2">
                          <Building className="h-4 w-4 text-slate-600" />
                          <span>{client.company}</span>
                        </div>
                      )}
                      {client.email && (
                        <div className="flex items-center gap-2">
                          <Mail className="h-4 w-4 text-slate-600" />
                          <span>{client.email}</span>
                        </div>
                      )}
                    </div>
                  </div>

                  <div className="pt-4 flex justify-end">
                    <span className="inline-flex items-center gap-1 text-xs font-bold text-slate-500 group-hover:text-indigo-400 transition">
                      View details <ArrowRight className="h-3.5 w-3.5" />
                    </span>
                  </div>
                </div>
              ))}
            </div>
          ) : (
            <div className="rounded-xl border border-dashed border-slate-800 p-12 text-center max-w-md mx-auto space-y-4">
              <div className="mx-auto flex h-12 w-12 items-center justify-center rounded-full bg-slate-900/60 text-slate-500">
                <Users className="h-6 w-6" />
              </div>
              <div>
                <h3 className="text-sm font-bold text-white">No clients found</h3>
                <p className="text-xs text-slate-500 mt-1 leading-relaxed">
                  Active clients registered in local database will appear here. Adding clients is available in Client Portal.
                </p>
              </div>
            </div>
          )}
        </div>
      )}
    </div>
  );
}
