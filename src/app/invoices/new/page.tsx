import { Suspense } from 'react';
import { ProtectedRoute } from '../../../components/ProtectedRoute';
import { AppShell } from '../../../components/AppShell';
import { CreateInvoiceClient, CreateInvoiceSkeleton } from './CreateInvoiceClient';

export const metadata = {
  title: 'Create Invoice — Clario',
  description: 'Create, preview, and issue invoices offline-first.',
};

export default function NewInvoicePage() {
  return (
    <ProtectedRoute>
      <AppShell>
        <Suspense fallback={<CreateInvoiceSkeleton />}>
          <CreateInvoiceClient />
        </Suspense>
      </AppShell>
    </ProtectedRoute>
  );
}
