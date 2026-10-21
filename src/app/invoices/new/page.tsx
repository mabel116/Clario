import { Suspense } from 'react';
import { ProtectedRoute } from '../../../components/ProtectedRoute';
import { AppShell } from '../../../components/AppShell';
import { CreateInvoiceClient } from './CreateInvoiceClient';

export const metadata = {
  title: 'Create Invoice — Clario',
  description: 'Create, preview, and issue invoices offline-first.',
};

export default function NewInvoicePage() {
  return (
    <ProtectedRoute>
      <AppShell>
        <Suspense fallback={<div className="min-h-[400px] opacity-0" aria-busy="true" />}>
          <CreateInvoiceClient />
        </Suspense>
      </AppShell>
    </ProtectedRoute>
  );
}
