import { balanceDueMinor, amountPaidMinor, isOverdue } from './invoice';

export interface InvoiceInput {
  id: string;
  client_id: string;
  status: 'draft' | 'sent' | 'void';
  currency: string;
  total_minor: number;
  due_date: string | null;
}

export interface PaymentInput {
  invoice_id: string;
  client_id: string;
  amount_minor: number;
  currency: string;
  occurred_at: string;
}

export interface CurrencyOutstanding {
  currency: string;
  amountMinor: number;
  overdueCount: number;
}

export interface CurrencyTotal {
  currency: string;
  amountMinor: number;
}

export function outstandingByCurrency(
  invoices: InvoiceInput[],
  payments: PaymentInput[],
  today: string
): CurrencyOutstanding[] {
  const outstandingMap: Record<string, { amountMinor: number; overdueCount: number }> = {};

  for (const inv of invoices) {
    if (inv.status !== 'sent') continue;

    const invPayments = payments.filter(p => p.invoice_id === inv.id);
    const paid = amountPaidMinor(invPayments);
    const balance = balanceDueMinor(inv.total_minor, paid);

    if (balance > 0) {
      const currency = inv.currency.toUpperCase();
      if (!outstandingMap[currency]) {
        outstandingMap[currency] = { amountMinor: 0, overdueCount: 0 };
      }
      outstandingMap[currency].amountMinor += balance;

      const overdue = isOverdue(inv.status, balance, inv.due_date, today);
      if (overdue) {
        outstandingMap[currency].overdueCount += 1;
      }
    }
  }

  return Object.entries(outstandingMap).map(([currency, data]) => ({
    currency,
    amountMinor: data.amountMinor,
    overdueCount: data.overdueCount
  }));
}

export function earningsByCurrency(
  payments: PaymentInput[],
  startDate: string,
  endDate: string
): CurrencyTotal[] {
  const earningsMap: Record<string, number> = {};

  for (const p of payments) {
    if (p.occurred_at >= startDate && p.occurred_at <= endDate) {
      const currency = p.currency.toUpperCase();
      earningsMap[currency] = (earningsMap[currency] || 0) + p.amount_minor;
    }
  }

  return Object.entries(earningsMap).map(([currency, amountMinor]) => ({
    currency,
    amountMinor
  }));
}

export function clientOutstandingByCurrency(
  clientId: string,
  invoices: InvoiceInput[],
  payments: PaymentInput[],
  today: string
): CurrencyOutstanding[] {
  const clientInvoices = invoices.filter(inv => inv.client_id === clientId);
  return outstandingByCurrency(clientInvoices, payments, today);
}

export function sortCurrencyTotals<T extends { currency: string }>(
  totals: T[],
  defaultCurrency: string
): T[] {
  const def = defaultCurrency.toUpperCase();
  return [...totals].sort((a, b) => {
    const currA = a.currency.toUpperCase();
    const currB = b.currency.toUpperCase();
    if (currA === def && currB !== def) return -1;
    if (currB === def && currA !== def) return 1;
    return currA.localeCompare(currB);
  });
}
