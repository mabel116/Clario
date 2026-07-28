import { db } from '../sync/db';
import { supabase } from '../supabase';
import { createLiveQuery, LiveQuery, NewPayment, CurrencyMismatchError, isTest } from './types';
import { PaymentEventRow } from '../sync/schema';

export const PaymentRepo = {
  listForInvoice(invoiceId: string): LiveQuery<PaymentEventRow[]> {
    return createLiveQuery<any, PaymentEventRow[]>(
      `SELECT id, user_id, invoice_id, client_id, amount_minor, currency, method, note, occurred_at, reverses_id, created_at
       FROM payment_events
       WHERE invoice_id = ?
       ORDER BY occurred_at DESC, created_at DESC`,
      [invoiceId],
      (rows) => rows
    );
  },

  listForClient(clientId: string): LiveQuery<PaymentEventRow[]> {
    return createLiveQuery<any, PaymentEventRow[]>(
      `SELECT id, user_id, invoice_id, client_id, amount_minor, currency, method, note, occurred_at, reverses_id, created_at
       FROM payment_events
       WHERE client_id = ?
       ORDER BY occurred_at DESC, created_at DESC`,
      [clientId],
      (rows) => rows
    );
  },

  async record(input: NewPayment): Promise<string> {
    if ((typeof window === 'undefined' && !isTest) || !db) {
      throw new Error('Database connection not available');
    }

    if (input.amount_minor <= 0) {
      throw new Error('Payment amount must be greater than zero');
    }

    // Fetch invoice currency to assert alignment
    const result = await db.getAll('SELECT currency FROM invoices WHERE id = ?', [input.invoice_id]);
    const invoice = (result as any)[0];
    if (!invoice) {
      throw new Error('Invoice not found');
    }

    if (invoice.currency.toUpperCase() !== input.currency.toUpperCase()) {
      throw new CurrencyMismatchError(invoice.currency, input.currency);
    }

    const { data: { session } } = await supabase.auth.getSession();
    const userId = session?.user?.id;
    if (!userId) {
      throw new Error('User must be authenticated to record payments');
    }

    const uuid = crypto.randomUUID();
    const occurredAt = input.occurred_at || new Date().toISOString().split('T')[0];
    const now = new Date().toISOString();

    await db.execute(
      `INSERT INTO payment_events (id, user_id, invoice_id, client_id, amount_minor, currency, method, note, occurred_at, created_at)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
      [
        uuid,
        userId,
        input.invoice_id,
        input.client_id,
        input.amount_minor,
        input.currency.toUpperCase(),
        input.method || null,
        input.note || null,
        occurredAt,
        now
      ]
    );

    return uuid;
  },

  async reverse(eventId: string, note?: string): Promise<string> {
    if ((typeof window === 'undefined' && !isTest) || !db) {
      throw new Error('Database connection not available');
    }

    // Fetch original payment event details
    const result = await db.getAll('SELECT * FROM payment_events WHERE id = ?', [eventId]);
    const target = (result as any)[0];
    if (!target) {
      throw new Error('Target payment event not found');
    }

    // Assert target is not itself a reversal
    if (target.reverses_id) {
      throw new Error('Cannot reverse a reversal event');
    }

    // Assert target has not already been reversed
    const checkReversed = await db.getAll('SELECT COUNT(*) as count FROM payment_events WHERE reverses_id = ?', [eventId]);
    const count = (checkReversed as any)[0]?.count ?? 0;
    if (count > 0) {
      throw new Error('Payment event is already reversed');
    }

    const { data: { session } } = await supabase.auth.getSession();
    const userId = session?.user?.id;
    if (!userId) {
      throw new Error('User must be authenticated to reverse payments');
    }

    const uuid = crypto.randomUUID();
    const occurredAt = new Date().toISOString().split('T')[0];
    const now = new Date().toISOString();

    // Mirror entry with negative amount_minor and reverses_id set
    await db.execute(
      `INSERT INTO payment_events (id, user_id, invoice_id, client_id, amount_minor, currency, method, note, occurred_at, reverses_id, created_at)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
      [
        uuid,
        userId,
        target.invoice_id,
        target.client_id,
        -target.amount_minor,
        target.currency.toUpperCase(),
        target.method || null,
        note || `Reversal of payment ${target.id}`,
        occurredAt,
        eventId,
        now
      ]
    );

    return uuid;
  }
};
