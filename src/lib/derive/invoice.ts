import { multiplyMinor } from '../money';

export interface LineItem {
  id?: string;
  quantity: number;
  unit_price_minor: number;
}

export interface PaymentEvent {
  id?: string;
  amount_minor: number;
  currency: string;
  reverses_id?: string | null;
}

export interface InvoiceDerivations {
  amountTotal: number;
  amountPaid: number;
  balanceDue: number;
  paymentStatus: 'paid' | 'partially_paid' | 'unpaid';
  isOverdue: boolean;
  displayStatus: 'draft' | 'void' | 'paid' | 'overdue' | 'sent';
}

export function lineTotalMinor(quantity: number, unitPriceMinor: number): number {
  return multiplyMinor(unitPriceMinor, quantity);
}

export function invoiceTotalMinor(lineItems: LineItem[]): number {
  return lineItems.reduce((sum, item) => sum + lineTotalMinor(item.quantity, item.unit_price_minor), 0);
}

export function amountPaidMinor(payments: PaymentEvent[]): number {
  return payments.reduce((sum, payment) => sum + payment.amount_minor, 0);
}

export function balanceDueMinor(invoiceTotal: number, amountPaid: number): number {
  return invoiceTotal - amountPaid;
}

export function paymentStatus(balanceDue: number, invoiceTotal: number, amountPaid: number): 'paid' | 'partially_paid' | 'unpaid' {
  if (balanceDue <= 0 && invoiceTotal > 0) {
    return 'paid';
  }
  if (amountPaid > 0 && amountPaid < invoiceTotal) {
    return 'partially_paid';
  }
  return 'unpaid';
}

export function isOverdue(status: 'draft' | 'sent' | 'void', balanceDue: number, dueDate: string | null, today: string): boolean {
  if (status !== 'sent') return false;
  if (balanceDue <= 0) return false;
  if (!dueDate) return false;
  return dueDate < today;
}

export function displayStatus(
  status: 'draft' | 'sent' | 'void',
  payStatus: 'paid' | 'partially_paid' | 'unpaid',
  overdue: boolean
): 'draft' | 'void' | 'paid' | 'overdue' | 'sent' {
  if (status === 'draft') return 'draft';
  if (status === 'void') return 'void';
  if (status === 'sent') {
    if (payStatus === 'paid') return 'paid';
    if (overdue) return 'overdue';
    return 'sent';
  }
  return 'sent';
}

export function deriveInvoice(
  invoice: { status: 'draft' | 'sent' | 'void'; total_minor: number; due_date: string | null },
  payments: PaymentEvent[],
  today: string
): InvoiceDerivations {
  const amountTotal = invoice.total_minor;
  const amountPaid = amountPaidMinor(payments);
  const balanceDue = balanceDueMinor(amountTotal, amountPaid);
  const payStatus = paymentStatus(balanceDue, amountTotal, amountPaid);
  const overdue = isOverdue(invoice.status, balanceDue, invoice.due_date, today);
  const dispStatus = displayStatus(invoice.status, payStatus, overdue);

  return {
    amountTotal,
    amountPaid,
    balanceDue,
    paymentStatus: payStatus,
    isOverdue: overdue,
    displayStatus: dispStatus
  };
}
