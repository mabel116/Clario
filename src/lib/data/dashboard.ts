import { db } from '../sync/db';
import { createLiveQuery, LiveQuery, CurrencyTotal, PaymentWithContext, CurrencyOutstanding } from './types';
import { outstandingByCurrency as deriveOutstanding, earningsByCurrency as deriveEarnings, sortCurrencyTotals } from '../derive/aggregates';

export const DashboardRepo = {
  outstandingByCurrency(defaultCurrency = 'USD'): LiveQuery<CurrencyOutstanding[]> {
    return createLiveQuery<any, CurrencyOutstanding[]>(
      `SELECT 
         i.id as invoice_id, i.client_id, i.status, i.currency, i.total_minor, i.due_date,
         p.id as payment_id, p.amount_minor, p.reverses_id
       FROM invoices i
       LEFT JOIN payment_events p ON p.invoice_id = i.id
       WHERE i.deleted_at IS NULL AND i.status = 'sent'`,
      [],
      (rows) => {
        // Assemble invoices and payments
        const invoiceMap = new Map<string, any>();
        const payments: any[] = [];

        for (const row of rows) {
          if (!invoiceMap.has(row.invoice_id)) {
            invoiceMap.set(row.invoice_id, {
              id: row.invoice_id,
              client_id: row.client_id,
              status: row.status,
              currency: row.currency,
              total_minor: row.total_minor,
              due_date: row.due_date
            });
          }

          if (row.payment_id) {
            payments.push({
              invoice_id: row.invoice_id,
              client_id: row.client_id,
              amount_minor: row.amount_minor,
              currency: row.currency,
              occurred_at: row.occurred_at || '' // Not selected in this select, but it doesn't matter for outstanding
            });
          }
        }

        const invoicesList = Array.from(invoiceMap.values());
        const today = new Date().toISOString().split('T')[0];
        const outstanding = deriveOutstanding(invoicesList, payments, today);
        return sortCurrencyTotals(outstanding, defaultCurrency);
      }
    );
  },

  recentPayments(limit: number): LiveQuery<PaymentWithContext[]> {
    return createLiveQuery<any, PaymentWithContext[]>(
      `SELECT 
         p.id, p.user_id, p.invoice_id, p.client_id, p.amount_minor, p.currency, p.method, p.note, p.occurred_at, p.reverses_id, p.created_at,
         i.invoice_number,
         c.name as client_name
       FROM payment_events p
       LEFT JOIN invoices i ON i.id = p.invoice_id
       LEFT JOIN clients c ON c.id = p.client_id
       ORDER BY p.occurred_at DESC, p.created_at DESC
       LIMIT ?`,
      [limit],
      (rows) => rows.map((row) => ({
        id: row.id,
        user_id: row.user_id,
        invoice_id: row.invoice_id,
        client_id: row.client_id,
        amount_minor: row.amount_minor,
        currency: row.currency,
        method: row.method,
        note: row.note,
        occurred_at: row.occurred_at,
        reverses_id: row.reverses_id,
        created_at: row.created_at,
        invoice_number: row.invoice_number || '',
        client_name: row.client_name || ''
      }))
    );
  },

  earningsByCurrency(periodDays: number, defaultCurrency = 'USD'): LiveQuery<CurrencyTotal[]> {
    return createLiveQuery<any, CurrencyTotal[]>(
      `SELECT 
         p.id, p.amount_minor, p.currency, p.occurred_at
       FROM payment_events p`,
      [],
      (rows) => {
        const payments = rows.map((row) => ({
          invoice_id: '',
          client_id: '',
          amount_minor: row.amount_minor,
          currency: row.currency,
          occurred_at: row.occurred_at
        }));

        const today = new Date().toISOString().split('T')[0];
        const todayDate = new Date(today);
        const startDate = new Date(todayDate.getTime() - periodDays * 24 * 60 * 60 * 1000)
          .toISOString()
          .split('T')[0];

        const earnings = deriveEarnings(payments, startDate, today);
        return sortCurrencyTotals(earnings, defaultCurrency);
      }
    );
  },

  /**
   * Deterministic one-shot check of SQLite database state to verify if an account is genuinely empty.
   * Runs in ~1ms directly against local SQLite without creating a watch stream.
   */
  async isAccountEmpty(): Promise<boolean> {
    if (!db) {
      throw new Error('Database connection not available');
    }
    const [clientRes, invoiceRes] = await Promise.all([
      db.getAll<{ count: number }>(`SELECT COUNT(*) as count FROM clients WHERE deleted_at IS NULL`),
      db.getAll<{ count: number }>(`SELECT COUNT(*) as count FROM invoices WHERE deleted_at IS NULL`)
    ]);
    const clientCount = (clientRes as any)[0]?.count ?? 0;
    const invoiceCount = (invoiceRes as any)[0]?.count ?? 0;
    return clientCount === 0 && invoiceCount === 0;
  }
};
