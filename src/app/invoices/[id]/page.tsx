import { InvoiceDetailsClient } from './InvoiceDetailsClient';

export function generateStaticParams() {
  return [{ id: '_shell_' }];
}

export default function InvoiceDetailsPage() {
  return <InvoiceDetailsClient />;
}
