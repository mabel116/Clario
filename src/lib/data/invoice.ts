import { db } from '../sync/db';
import {
  createLiveQuery,
  LiveQuery,
  InvoiceSummary,
  InvoiceDetail,
  NewInvoice,
  InvoicePatch,
  LineItemInput,
  InvoiceLockedError,
  isTest
} from './types';
import { deriveInvoice, lineTotalMinor } from '../derive/invoice';
import { suggestNextInvoiceNumber } from '../derive/numbering';
import { supabase } from '../supabase';

async function assertNotLocked(invoiceId: string): Promise<void> {
  const result = await db.getAll(
    `SELECT COUNT(*) as count FROM payment_events WHERE invoice_id = ?`,
    [invoiceId]
  );
  const count = (result as any)[0]?.count ?? 0;
  if (count > 0) {
    throw new InvoiceLockedError(invoiceId);
  }
}

export const InvoiceRepo = {
  listForClient(clientId: string): LiveQuery<InvoiceSummary[]> {
    return createLiveQuery<any, InvoiceSummary[]>(
      `SELECT 
         i.id as invoice_id, i.client_id, i.invoice_number, i.status, i.currency, i.total_minor, i.issue_date, i.due_date,
         c.name as client_name,
         p.id as payment_id, p.amount_minor, p.reverses_id
       FROM invoices i
       LEFT JOIN clients c ON c.id = i.client_id
       LEFT JOIN payment_events p ON p.invoice_id = i.id
       WHERE i.client_id = ? AND i.deleted_at IS NULL`,
      [clientId],
      (rows) => {
        // Group by invoice_id to assemble payments
        const invoiceMap = new Map<string, {
          id: string;
          client_id: string;
          invoice_number: string;
          status: 'draft' | 'sent' | 'void';
          currency: string;
          total_minor: number;
          issue_date: string | null;
          due_date: string | null;
          client_name: string;
          payments: any[];
        }>();

        for (const row of rows) {
          const id = row.invoice_id;
          if (!invoiceMap.has(id)) {
            invoiceMap.set(id, {
              id,
              client_id: row.client_id,
              invoice_number: row.invoice_number,
              status: row.status,
              currency: row.currency,
              total_minor: row.total_minor,
              issue_date: row.issue_date,
              due_date: row.due_date,
              client_name: row.client_name || '',
              payments: []
            });
          }

          if (row.payment_id) {
            invoiceMap.get(id)!.payments.push({
              amount_minor: row.amount_minor,
              currency: row.currency,
              reverses_id: row.reverses_id
            });
          }
        }

        const today = new Date().toISOString().split('T')[0];
        return Array.from(invoiceMap.values()).map((inv) => {
          const derived = deriveInvoice(
            { status: inv.status, total_minor: inv.total_minor, due_date: inv.due_date },
            inv.payments,
            today
          );

          return {
            id: inv.id,
            client_id: inv.client_id,
            invoice_number: inv.invoice_number,
            status: inv.status,
            currency: inv.currency,
            total_minor: inv.total_minor,
            issue_date: inv.issue_date,
            due_date: inv.due_date,
            displayStatus: derived.displayStatus,
            amountPaidMinor: derived.amountPaid,
            balanceDueMinor: derived.balanceDue,
            client_name: inv.client_name
          };
        }).sort((a, b) => b.invoice_number.localeCompare(a.invoice_number));
      }
    );
  },

  get(id: string): LiveQuery<InvoiceDetail | null> {
    return createLiveQuery<any, InvoiceDetail | null>(
      `SELECT 
         i.id as invoice_id, i.user_id, i.client_id, i.invoice_number, i.status, i.currency, i.total_minor, i.issue_date, i.due_date, i.notes, i.internal_note, i.created_at, i.updated_at,
         c.name as client_name,
         li.id as line_item_id, li.description as line_item_description, li.quantity as line_item_quantity, li.unit_price_minor as line_item_unit_price, li.line_total_minor as line_item_line_total, li.position as line_item_position,
         p.id as payment_id, p.amount_minor as payment_amount, p.reverses_id as payment_reverses
       FROM invoices i
       LEFT JOIN clients c ON c.id = i.client_id
       LEFT JOIN invoice_line_items li ON li.invoice_id = i.id AND li.deleted_at IS NULL
       LEFT JOIN payment_events p ON p.invoice_id = i.id
       WHERE i.id = ? AND i.deleted_at IS NULL`,
      [id],
      (rows) => {
        if (rows.length === 0) return null;

        const first = rows[0];
        const invoiceRow = {
          id: first.invoice_id,
          user_id: first.user_id,
          client_id: first.client_id,
          invoice_number: first.invoice_number,
          status: first.status as 'draft' | 'sent' | 'void',
          currency: first.currency,
          total_minor: first.total_minor,
          issue_date: first.issue_date,
          due_date: first.due_date,
          notes: first.notes,
          internal_note: first.internal_note,
          created_at: first.created_at,
          updated_at: first.updated_at
        };

        const lineItemsMap = new Map<string, any>();
        const paymentsMap = new Map<string, any>();

        for (const row of rows) {
          if (row.line_item_id && !lineItemsMap.has(row.line_item_id)) {
            lineItemsMap.set(row.line_item_id, {
              id: row.line_item_id,
              user_id: row.user_id,
              invoice_id: row.invoice_id,
              description: row.line_item_description,
              quantity: row.line_item_quantity,
              unit_price_minor: row.line_item_unit_price,
              line_total_minor: row.line_item_line_total,
              position: row.line_item_position
            });
          }

          if (row.payment_id && !paymentsMap.has(row.payment_id)) {
            paymentsMap.set(row.payment_id, {
              amount_minor: row.payment_amount,
              currency: row.currency,
              reverses_id: row.payment_reverses
            });
          }
        }

        const lineItems = Array.from(lineItemsMap.values()).sort((a, b) => a.position - b.position);
        const payments = Array.from(paymentsMap.values());

        const today = new Date().toISOString().split('T')[0];
        const derived = deriveInvoice(
          { status: invoiceRow.status, total_minor: invoiceRow.total_minor, due_date: invoiceRow.due_date },
          payments,
          today
        );

        return {
          ...invoiceRow,
          lineItems,
          displayStatus: derived.displayStatus,
          amountPaidMinor: derived.amountPaid,
          balanceDueMinor: derived.balanceDue,
          client_name: first.client_name || ''
        };
      }
    );
  },

  async suggestNextNumber(): Promise<string> {
    if ((typeof window === 'undefined' && !isTest) || !db) {
      throw new Error('Database connection not available');
    }
    const { data: { session } } = await supabase.auth.getSession();
    const userId = session?.user?.id;
    if (!userId) {
      throw new Error('User must be authenticated to suggest invoice numbers');
    }
    const result = await db.getAll('SELECT invoice_number FROM invoices WHERE user_id = ? AND deleted_at IS NULL', [userId]);
    const existing = (result as any[]).map((r) => r.invoice_number);
    return suggestNextInvoiceNumber(existing);
  },

  async create(input: NewInvoice): Promise<string> {
    if ((typeof window === 'undefined' && !isTest) || !db) {
      throw new Error('Database connection not available');
    }

    const { data: { session } } = await supabase.auth.getSession();
    const userId = session?.user?.id;
    if (!userId) {
      throw new Error('User must be authenticated to create invoices');
    }

    const invoiceNumber = input.invoice_number || await this.suggestNextNumber();
    const uuid = crypto.randomUUID();
    const now = new Date().toISOString();

    await db.execute(
      `INSERT INTO invoices (id, user_id, client_id, invoice_number, status, currency, total_minor, due_date, notes, internal_note, created_at, updated_at)
       VALUES (?, ?, ?, ?, 'draft', ?, 0, ?, ?, ?, ?, ?)`,
      [
        uuid,
        userId,
        input.client_id,
        invoiceNumber,
        input.currency.toUpperCase(),
        input.due_date || null,
        input.notes || null,
        input.internal_note || null,
        now,
        now
      ]
    );

    return uuid;
  },

  async update(id: string, patch: InvoicePatch): Promise<void> {
    if ((typeof window === 'undefined' && !isTest) || !db) {
      throw new Error('Database connection not available');
    }

    // Gated locking for invoice number and issue date
    if (patch.invoice_number !== undefined || patch.issue_date !== undefined) {
      await assertNotLocked(id);
    }

    const fields: string[] = [];
    const params: any[] = [];

    if (patch.invoice_number !== undefined) {
      if (!patch.invoice_number || !patch.invoice_number.trim()) {
        throw new Error('Invoice number cannot be empty');
      }
      fields.push('invoice_number = ?');
      params.push(patch.invoice_number.trim());
    }

    if (patch.notes !== undefined) {
      fields.push('notes = ?');
      params.push(patch.notes || null);
    }

    if (patch.internal_note !== undefined) {
      fields.push('internal_note = ?');
      params.push(patch.internal_note || null);
    }

    if (patch.due_date !== undefined) {
      fields.push('due_date = ?');
      params.push(patch.due_date || null);
    }

    if (patch.issue_date !== undefined) {
      fields.push('issue_date = ?');
      params.push(patch.issue_date || null);
    }

    if (fields.length === 0) return;

    const now = new Date().toISOString();
    fields.push('updated_at = ?');
    params.push(now);

    params.push(id);

    await db.execute(
      `UPDATE invoices SET ${fields.join(', ')} WHERE id = ?`,
      params
    );
  },

  async setLineItems(id: string, items: LineItemInput[]): Promise<void> {
    if ((typeof window === 'undefined' && !isTest) || !db) {
      throw new Error('Database connection not available');
    }

    // Edit line items lock check
    await assertNotLocked(id);

    let totalMinor = 0;
    const lineItemsToInsert = items.map((item, index) => {
      const lineTotal = lineTotalMinor(item.quantity, item.unit_price_minor);
      totalMinor += lineTotal;
      return {
        id: crypto.randomUUID(),
        description: item.description,
        quantity: item.quantity,
        unit_price_minor: item.unit_price_minor,
        line_total_minor: lineTotal,
        position: index
      };
    });

    await db.writeTransaction(async (tx) => {
      await tx.execute('DELETE FROM invoice_line_items WHERE invoice_id = ?', [id]);
      
      const { data: { session } } = await supabase.auth.getSession();
      const userId = session?.user?.id;
      const now = new Date().toISOString();

      for (const item of lineItemsToInsert) {
        await tx.execute(
          `INSERT INTO invoice_line_items (id, user_id, invoice_id, description, quantity, unit_price_minor, line_total_minor, position, created_at, updated_at)
           VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
          [item.id, userId, id, item.description, item.quantity, item.unit_price_minor, item.line_total_minor, item.position, now, now]
        );
      }

      await tx.execute(
        `UPDATE invoices SET total_minor = ?, updated_at = ? WHERE id = ?`,
        [totalMinor, now, id]
      );
    });
  },

  async markSent(id: string, issueDate: string, dueDate: string): Promise<void> {
    if ((typeof window === 'undefined' && !isTest) || !db) {
      throw new Error('Database connection not available');
    }

    await assertNotLocked(id);
    const now = new Date().toISOString();

    await db.execute(
      `UPDATE invoices SET status = 'sent', issue_date = ?, due_date = ?, updated_at = ? WHERE id = ?`,
      [issueDate, dueDate, now, id]
    );
  },

  async void(id: string): Promise<void> {
    if ((typeof window === 'undefined' && !isTest) || !db) {
      throw new Error('Database connection not available');
    }

    const now = new Date().toISOString();
    await db.execute(
      `UPDATE invoices SET status = 'void', updated_at = ? WHERE id = ?`,
      [now, id]
    );
  },

  async softDelete(id: string): Promise<void> {
    if ((typeof window === 'undefined' && !isTest) || !db) {
      throw new Error('Database connection not available');
    }

    const result = await db.getAll('SELECT status FROM invoices WHERE id = ?', [id]);
    const status = (result as any)[0]?.status;
    if (status !== 'draft') {
      throw new Error('Only draft invoices can be soft deleted.');
    }

    const now = new Date().toISOString();
    await db.execute(
      `UPDATE invoices SET deleted_at = ?, updated_at = ? WHERE id = ?`,
      [now, now, id]
    );
  },

  canEditFinancials(invoiceId: string): LiveQuery<boolean> {
    return createLiveQuery<any, boolean>(
      `SELECT COUNT(*) as count FROM payment_events WHERE invoice_id = ?`,
      [invoiceId],
      (rows) => {
        const count = rows[0]?.count ?? 0;
        return count === 0;
      }
    );
  }
};
