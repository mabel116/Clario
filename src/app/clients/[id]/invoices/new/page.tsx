import { NewInvoiceClient } from './NewInvoiceClient';

export function generateStaticParams() {
  return [{ id: '_shell_' }];
}

export default function NewInvoicePage() {
  return <NewInvoiceClient />;
}
