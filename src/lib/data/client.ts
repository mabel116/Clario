import { db } from '../sync/db';
import { supabase } from '../supabase';
import { createLiveQuery, LiveQuery, ClientSummary, ClientDetail, NewClient, ClientPatch, isTest } from './types';
import { deriveInvoice } from '../derive/invoice';

export const ClientRepo = {
  list(): LiveQuery<ClientSummary[]> {
    return createLiveQuery<any, ClientSummary[]>(
      `SELECT id, name, email, company, default_currency, created_at
       FROM clients
       WHERE deleted_at IS NULL
       ORDER BY created_at DESC`,
      [],
      (rows) => rows.map((r) => ({
        id: r.id,
        name: r.name,
        email: r.email,
        company: r.company,
        default_currency: r.default_currency,
        created_at: r.created_at
      }))
    );
  },

  get(id: string): LiveQuery<ClientDetail | null> {
    // Single query joining clients, invoices, and payments to watch all tables
    // and fetch all data needed to compute outstanding balances dynamically.
    return createLiveQuery<any, ClientDetail | null>(
      `SELECT 
         c.id as client_id, c.user_id, c.name, c.email, c.phone, c.company, c.notes, c.default_currency, c.created_at, c.updated_at,
         i.id as invoice_id, i.total_minor, i.currency, i.due_date, i.status,
         p.id as payment_id, p.amount_minor, p.reverses_id
       FROM clients c
       LEFT JOIN invoices i ON i.client_id = c.id AND i.status = 'sent' AND i.deleted_at IS NULL
       LEFT JOIN payment_events p ON p.invoice_id = i.id
       WHERE c.id = ? AND c.deleted_at IS NULL`,
      [id],
      (rows) => {
        if (rows.length === 0) return null;

        const first = rows[0];
        const clientRow = {
          id: first.client_id,
          user_id: first.user_id,
          name: first.name,
          email: first.email,
          phone: first.phone,
          company: first.company,
          notes: first.notes,
          default_currency: first.default_currency,
          created_at: first.created_at,
          updated_at: first.updated_at
        };

        // Extract invoices and their corresponding payment events
        const invoiceMap = new Map<string, { total_minor: number; currency: string; due_date: string | null; status: 'draft' | 'sent' | 'void'; payments: any[] }>();

        for (const row of rows) {
          if (!row.invoice_id) continue;
          
          if (!invoiceMap.has(row.invoice_id)) {
            invoiceMap.set(row.invoice_id, {
              total_minor: row.total_minor,
              currency: row.currency,
              due_date: row.due_date,
              status: row.status,
              payments: []
            });
          }

          if (row.payment_id) {
            invoiceMap.get(row.invoice_id)!.payments.push({
              amount_minor: row.amount_minor,
              currency: row.currency,
              reverses_id: row.reverses_id
            });
          }
        }

        // Compute outstanding balances per currency
        const today = new Date().toISOString().split('T')[0];
        const balancesMap = new Map<string, { amountMinor: number; overdueCount: number }>();

        for (const [_, inv] of invoiceMap.entries()) {
          const derived = deriveInvoice(
            { status: inv.status, total_minor: inv.total_minor, due_date: inv.due_date },
            inv.payments,
            today
          );

          if (derived.balanceDue > 0) {
            const curr = inv.currency.toUpperCase();
            if (!balancesMap.has(curr)) {
              balancesMap.set(curr, { amountMinor: 0, overdueCount: 0 });
            }
            const record = balancesMap.get(curr)!;
            record.amountMinor += derived.balanceDue;
            if (derived.isOverdue) {
              record.overdueCount += 1;
            }
          }
        }

        const outstandingBalances = Array.from(balancesMap.entries()).map(([currency, data]) => ({
          currency,
          amountMinor: data.amountMinor,
          overdueCount: data.overdueCount
        }));

        return {
          ...clientRow,
          outstandingBalances
        };
      }
    );
  },

  async create(input: NewClient): Promise<string> {
    if ((typeof window === 'undefined' && !isTest) || !db) {
      throw new Error('Database connection not available');
    }

    // Required field validation
    if (!input.name || !input.name.trim()) {
      throw new Error('Client name is required');
    }

    // Email format validation
    if (input.email && !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(input.email)) {
      throw new Error('Invalid email format');
    }

    // Get current authenticated user
    const { data: { session } } = await supabase.auth.getSession();
    const userId = session?.user?.id;
    if (!userId) {
      throw new Error('User must be authenticated to create clients');
    }

    const uuid = crypto.randomUUID();
    const now = new Date().toISOString();

    await db.execute(
      `INSERT INTO clients (id, user_id, name, email, phone, company, notes, default_currency, created_at, updated_at)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
      [
        uuid,
        userId,
        input.name.trim(),
        input.email || null,
        input.phone || null,
        input.company || null,
        input.notes || null,
        input.default_currency || null,
        now,
        now
      ]
    );

    return uuid;
  },

  async update(id: string, patch: ClientPatch): Promise<void> {
    if ((typeof window === 'undefined' && !isTest) || !db) {
      throw new Error('Database connection not available');
    }

    // Validate email format if provided
    if (patch.email && !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(patch.email)) {
      throw new Error('Invalid email format');
    }

    const fields: string[] = [];
    const params: any[] = [];

    if (patch.name !== undefined) {
      if (!patch.name || !patch.name.trim()) {
        throw new Error('Client name cannot be empty');
      }
      fields.push('name = ?');
      params.push(patch.name.trim());
    }
    if (patch.email !== undefined) {
      fields.push('email = ?');
      params.push(patch.email || null);
    }
    if (patch.phone !== undefined) {
      fields.push('phone = ?');
      params.push(patch.phone || null);
    }
    if (patch.company !== undefined) {
      fields.push('company = ?');
      params.push(patch.company || null);
    }
    if (patch.notes !== undefined) {
      fields.push('notes = ?');
      params.push(patch.notes || null);
    }
    if (patch.default_currency !== undefined) {
      fields.push('default_currency = ?');
      params.push(patch.default_currency || null);
    }

    if (fields.length === 0) return;

    const now = new Date().toISOString();
    fields.push('updated_at = ?');
    params.push(now);

    params.push(id);

    await db.execute(
      `UPDATE clients SET ${fields.join(', ')} WHERE id = ?`,
      params
    );
  },

  async softDelete(id: string): Promise<void> {
    if ((typeof window === 'undefined' && !isTest) || !db) {
      throw new Error('Database connection not available');
    }

    const now = new Date().toISOString();
    await db.execute(
      `UPDATE clients SET deleted_at = ?, updated_at = ? WHERE id = ?`,
      [now, now, id]
    );
  }
};
