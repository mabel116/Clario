import { EditInvoiceClient } from './EditInvoiceClient';

export function generateStaticParams() {
  return [{ id: '_shell_' }];
}

export default function EditInvoicePage() {
  return <EditInvoiceClient />;
}
