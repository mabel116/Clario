import { describe, it, expect, beforeAll, afterAll, beforeEach } from 'vitest';
import { PGlite } from '@electric-sql/pglite';
import * as fs from 'fs';
import * as path from 'path';
import { vi } from 'vitest';

let pgliteInstance: PGlite;

const mockDb = {
  execute: async (sql: string, params: any[]) => {
    let pgSql = sql;
    let index = 1;
    while (pgSql.includes('?')) {
      pgSql = pgSql.replace('?', `$${index}`);
      index++;
    }
    await pgliteInstance.query(pgSql, params);
  },
  getAll: async (sql: string, params: any[]) => {
    let pgSql = sql;
    let index = 1;
    while (pgSql.includes('?')) {
      pgSql = pgSql.replace('?', `$${index}`);
      index++;
    }
    const res = await pgliteInstance.query<any>(pgSql, params);
    return res.rows;
  },
  writeTransaction: async (cb: (tx: any) => Promise<any>) => {
    const tx = {
      execute: async (sql: string, params: any[]) => {
        let pgSql = sql;
        let index = 1;
        while (pgSql.includes('?')) {
          pgSql = pgSql.replace('?', `$${index}`);
          index++;
        }
        await pgliteInstance.query(pgSql, params);
      }
    };
    await pgliteInstance.query('BEGIN');
    try {
      const res = await cb(tx);
      await pgliteInstance.query('COMMIT');
      return res;
    } catch (err) {
      await pgliteInstance.query('ROLLBACK');
      throw err;
    }
  },
  watch: (sql: string, params: any[]) => {
    let pgSql = sql;
    let index = 1;
    while (pgSql.includes('?')) {
      pgSql = pgSql.replace('?', `$${index}`);
      index++;
    }
    return {
      [Symbol.asyncIterator]() {
        let count = 0;
        return {
          async next() {
            if (count > 0) {
              return { done: true, value: undefined };
            }
            count++;
            const res = await pgliteInstance.query<any>(pgSql, params);
            return {
              done: false,
              value: {
                rows: {
                  _array: res.rows
                }
              }
            };
          },
          async return() {
            return { done: true, value: undefined };
          }
        };
      }
    };
  },
  getCredentials: async () => {
    return {
      data: {
        session: {
          user: {
            id: '00000000-0000-0000-0000-000000000000'
          }
        }
      }
    };
  },
  disconnectAndClear: async () => {
    const tables = ['payment_events', 'invoice_line_items', 'invoices', 'client_links', 'clients', 'profiles'];
    for (const table of tables) {
      await pgliteInstance.query(`TRUNCATE TABLE ${table} CASCADE`);
    }
  }
};

vi.mock('../src/lib/sync/db', () => {
  return {
    db: {
      execute: vi.fn((sql, params) => mockDb.execute(sql, params)),
      getAll: vi.fn((sql, params) => mockDb.getAll(sql, params)),
      writeTransaction: vi.fn((cb) => mockDb.writeTransaction(cb)),
      watch: vi.fn((sql, params) => mockDb.watch(sql, params)),
      getCredentials: vi.fn(() => mockDb.getCredentials()),
      disconnectAndClear: vi.fn(() => mockDb.disconnectAndClear())
    }
  };
});

vi.mock('../src/lib/supabase', () => {
  return {
    supabase: {
      auth: {
        getSession: vi.fn(async () => ({
          data: {
            session: {
              user: {
                id: '00000000-0000-0000-0000-000000000000'
              }
            }
          }
        }))
      }
    }
  };
});

import { ClientRepo } from '../src/lib/data/client';
import { InvoiceRepo } from '../src/lib/data/invoice';
import { PaymentRepo } from '../src/lib/data/payment';
import { ProfileRepo } from '../src/lib/data/profile';
import { InvoiceLockedError } from '../src/lib/data/types';

const sleep = (ms: number) => new Promise((resolve) => setTimeout(resolve, ms));

describe('Epic 4 — Payments Ledger & Reversals Acceptance Criteria Tests', () => {
  beforeAll(async () => {
    pgliteInstance = new PGlite();

    await pgliteInstance.exec(`
      CREATE SCHEMA IF NOT EXISTS auth;
      CREATE TABLE IF NOT EXISTS auth.users (
        id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
        email text UNIQUE
      );

      CREATE OR REPLACE FUNCTION auth.uid() RETURNS uuid AS $$
        SELECT COALESCE(
          NULLIF(current_setting('request.jwt.claim.sub', true), ''),
          '00000000-0000-0000-0000-000000000000'
        )::uuid;
      $$ LANGUAGE sql STABLE;

      DO $$
      BEGIN
        IF NOT EXISTS (SELECT 1 FROM pg_roles WHERE rolname = 'authenticated') THEN
          CREATE ROLE authenticated NOLOGIN;
        END IF;
      END
      $$;
    `);

    const migrationPath = path.join(process.cwd(), 'supabase', 'migrations', '20260722000000_initial_schema.sql');
    const migrationSql = fs.readFileSync(migrationPath, 'utf8');
    await pgliteInstance.exec(migrationSql);

    await pgliteInstance.exec(`
      GRANT USAGE ON SCHEMA public TO authenticated;
      GRANT ALL ON ALL TABLES IN SCHEMA public TO authenticated;
      GRANT ALL ON ALL SEQUENCES IN SCHEMA public TO authenticated;
    `);
  });

  afterAll(async () => {
    if (pgliteInstance) {
      await pgliteInstance.close();
    }
  });

  beforeEach(async () => {
    await pgliteInstance.exec(`
      TRUNCATE TABLE client_links CASCADE;
      TRUNCATE TABLE payment_events CASCADE;
      TRUNCATE TABLE invoice_line_items CASCADE;
      TRUNCATE TABLE invoices CASCADE;
      TRUNCATE TABLE clients CASCADE;
      TRUNCATE TABLE profiles CASCADE;
      TRUNCATE TABLE auth.users CASCADE;
    `);

    // Insert user into auth.users first to satisfy foreign key constraints
    await pgliteInstance.query(
      `INSERT INTO auth.users (id, email) VALUES ($1, $2)`,
      ['00000000-0000-0000-0000-000000000000', 'mockuser@clario.com']
    );

    // Update trigger-seeded profile details
    await pgliteInstance.query(
      `UPDATE profiles SET business_name = $1, default_currency = $2 WHERE id = $3`,
      ['Freelancer Co', 'USD', '00000000-0000-0000-0000-000000000000']
    );
  });

  it('Criterion 1 & 2: Partial payment and full settling driving derived invoice statuses reactively', async () => {
    const clientId = await ClientRepo.create({ name: 'Acme Corp' });
    const invoiceId = await InvoiceRepo.create({
      client_id: clientId,
      currency: 'USD',
      due_date: '2026-08-01'
    });

    await InvoiceRepo.setLineItems(invoiceId, [
      { description: 'Consulting', quantity: 1, unit_price_minor: 1000 } // $10.00
    ]);

    await InvoiceRepo.markSent(invoiceId, '2026-07-30', '2026-08-15');

    // Initially outstanding is $10.00, status is 'sent'
    let invoice: any = null;
    const unsub1 = InvoiceRepo.get(invoiceId).subscribe(data => { invoice = data; });
    await sleep(20);

    expect(invoice.balanceDueMinor).toBe(1000);
    expect(invoice.displayStatus).toBe('sent');

    // 1. Partial payment of $6.00
    await PaymentRepo.record({
      invoice_id: invoiceId,
      client_id: clientId,
      amount_minor: 600,
      currency: 'USD',
      method: 'cash',
      note: 'Deposit'
    });

    // Re-fetch reactive updates
    const unsub2 = InvoiceRepo.get(invoiceId).subscribe(data => { invoice = data; });
    await sleep(20);
    expect(invoice.amountPaidMinor).toBe(600);
    expect(invoice.balanceDueMinor).toBe(400);
    expect(invoice.displayStatus).toBe('sent');
    console.log('--- Criterion 1 Verified ---');
    console.log(`Recorded Partial Payment: $6.00. Balance Due: $${invoice.balanceDueMinor / 100}. Status: ${invoice.displayStatus}`);

    // 2. Remainder settling of $4.00
    await PaymentRepo.record({
      invoice_id: invoiceId,
      client_id: clientId,
      amount_minor: 400,
      currency: 'USD',
      method: 'bank_transfer',
      note: 'Settlement'
    });

    // Re-fetch reactive updates
    const unsub3 = InvoiceRepo.get(invoiceId).subscribe(data => { invoice = data; });
    await sleep(20);
    expect(invoice.amountPaidMinor).toBe(1000);
    expect(invoice.balanceDueMinor).toBe(0);
    expect(invoice.displayStatus).toBe('paid');
    console.log('--- Criterion 2 Verified ---');
    console.log(`Recorded Remaining Payment: $4.00. Balance Due: $${invoice.balanceDueMinor / 100}. Status: ${invoice.displayStatus}`);

    // Clean up subscriptions
    unsub1();
    unsub2();
    unsub3();
  });

  it('Criterion 4: Reversing a payment creates a negative entry, restores the balance, and leaves the original DB row byte-identical', async () => {
    const clientId = await ClientRepo.create({ name: 'Acme Corp' });
    const invoiceId = await InvoiceRepo.create({ client_id: clientId, currency: 'USD' });
    await InvoiceRepo.setLineItems(invoiceId, [{ description: 'Development', quantity: 1, unit_price_minor: 1500 }]);
    await InvoiceRepo.markSent(invoiceId, '2026-07-30', '2026-08-15');

    const paymentId = await PaymentRepo.record({
      invoice_id: invoiceId,
      client_id: clientId,
      amount_minor: 1000,
      currency: 'USD',
      method: 'card',
      note: 'Initial payment'
    });

    // Query original row directly before reversal
    const origBefore = await pgliteInstance.query<any>(
      'SELECT id, invoice_id, client_id, amount_minor, currency, occurred_at, method, note, reverses_id, user_id FROM payment_events WHERE id = $1',
      [paymentId]
    );

    expect(origBefore.rows.length).toBe(1);
    const rowBefore = origBefore.rows[0];

    // Trigger reversal
    const revId = await PaymentRepo.reverse(paymentId, 'Error in original entry');

    // Query original row directly after reversal
    const origAfter = await pgliteInstance.query<any>(
      'SELECT id, invoice_id, client_id, amount_minor, currency, occurred_at, method, note, reverses_id, user_id FROM payment_events WHERE id = $1',
      [paymentId]
    );
    const rowAfter = origAfter.rows[0];

    // Assert original row remains byte-identical (compare properties)
    expect(rowBefore.id).toBe(rowAfter.id);
    expect(rowBefore.amount_minor).toBe(rowAfter.amount_minor);
    expect(rowBefore.currency).toBe(rowAfter.currency);
    expect(String(rowBefore.occurred_at)).toBe(String(rowAfter.occurred_at));
    expect(rowBefore.method).toBe(rowAfter.method);
    expect(rowBefore.note).toBe(rowAfter.note);
    expect(rowBefore.reverses_id).toBe(rowAfter.reverses_id);
    expect(rowBefore.user_id).toBe(rowAfter.user_id);

    // Query negative mirror entry
    const revRow = await pgliteInstance.query<any>(
      'SELECT * FROM payment_events WHERE id = $1',
      [revId]
    );
    expect(revRow.rows[0].amount_minor).toBe(-1000);
    expect(revRow.rows[0].reverses_id).toBe(paymentId);
    expect(revRow.rows[0].note).toBe('Error in original entry');

    // Verify balance due reactively goes back up
    let invoice: any = null;
    const unsub = InvoiceRepo.get(invoiceId).subscribe(data => { invoice = data; });
    await sleep(20);

    expect(invoice.amountPaidMinor).toBe(0);
    expect(invoice.balanceDueMinor).toBe(1500);
    unsub();

    console.log('--- Criterion 4 Verified ---');
    console.log('Original Row Before Reversal:', JSON.stringify(rowBefore));
    console.log('Original Row After Reversal: ', JSON.stringify(rowAfter));
    console.log('Mirror Reversal Event Row:   ', JSON.stringify(revRow.rows[0]));
    console.log(`Original payment ID: ${rowBefore.id} remains unchanged and byte-identical.`);
  });

  it('Criterion 5: Immutable database policies prevent UPDATE/DELETE on payment_events, positive edit locks', async () => {
    const clientId = await ClientRepo.create({ name: 'Acme Corp' });
    const invoiceId = await InvoiceRepo.create({ client_id: clientId, currency: 'USD' });
    await InvoiceRepo.setLineItems(invoiceId, [{ description: 'App design', quantity: 1, unit_price_minor: 2000 }]);
    await InvoiceRepo.markSent(invoiceId, '2026-07-30', '2026-08-15');

    const paymentId = await PaymentRepo.record({
      invoice_id: invoiceId,
      client_id: clientId,
      amount_minor: 1000,
      currency: 'USD'
    });

    // 1. UPDATE/DELETE payment_events must affect 0 rows (since policies block them under RLS)
    await pgliteInstance.exec("SET ROLE authenticated;");
    await pgliteInstance.exec("SET request.jwt.claim.sub = '00000000-0000-0000-0000-000000000000';");

    const updateRes = await pgliteInstance.query('UPDATE payment_events SET amount_minor = 500 WHERE id = $1', [paymentId]);
    expect(updateRes.affectedRows ?? 0).toBe(0);

    const deleteRes = await pgliteInstance.query('DELETE FROM payment_events WHERE id = $1', [paymentId]);
    expect(deleteRes.affectedRows ?? 0).toBe(0);

    // Positive Control: Updates on client or invoices succeeds
    const clientUpdateRes = await pgliteInstance.query('UPDATE clients SET name = \'Acme Corp New\' WHERE id = $1', [clientId]);
    expect(clientUpdateRes.affectedRows).toBe(1);

    await pgliteInstance.exec("SET ROLE postgres;");

    // Negative lock check: Editing line items of invoice with payment throws InvoiceLockedError
    await expect(
      InvoiceRepo.setLineItems(invoiceId, [{ description: 'New Line', quantity: 1, unit_price_minor: 3000 }])
    ).rejects.toThrow(InvoiceLockedError);

    console.log('--- Criterion 5 Verified ---');
    console.log('UPDATE and DELETE queries directly blocked on payment_events.');
    console.log('Positive Control UPDATE succeeded on clients table.');
    console.log('Line items lock triggered on paid invoice: setLineItems rejected with InvoiceLockedError.');
  });

  it('Criterion 6: Reversals safety constraints block double reversals and self-reversals', async () => {
    const clientId = await ClientRepo.create({ name: 'Acme Corp' });
    const invoiceId = await InvoiceRepo.create({ client_id: clientId, currency: 'USD' });
    await InvoiceRepo.setLineItems(invoiceId, [{ description: 'Support', quantity: 1, unit_price_minor: 500 }]);
    await InvoiceRepo.markSent(invoiceId, '2026-07-30', '2026-08-15');

    const paymentId = await PaymentRepo.record({
      invoice_id: invoiceId,
      client_id: clientId,
      amount_minor: 500,
      currency: 'USD'
    });

    // First reversal succeeds
    const revId = await PaymentRepo.reverse(paymentId);
    expect(revId).toBeDefined();

    // Re-reversing the original payment fails
    await expect(
      PaymentRepo.reverse(paymentId)
    ).rejects.toThrow('Payment event is already reversed');

    // Reversing the reversal event itself fails
    await expect(
      PaymentRepo.reverse(revId)
    ).rejects.toThrow('Cannot reverse a reversal event');

    console.log('--- Criterion 6 Verified ---');
    console.log('Double reversals blocked correctly; self-reversals of reversal events blocked correctly.');
  });

  it('Criterion 7: Overpayments are allowed and show negative balances', async () => {
    const clientId = await ClientRepo.create({ name: 'Acme Corp' });
    const invoiceId = await InvoiceRepo.create({ client_id: clientId, currency: 'USD' });
    await InvoiceRepo.setLineItems(invoiceId, [{ description: 'Consulting', quantity: 1, unit_price_minor: 1000 }]);
    await InvoiceRepo.markSent(invoiceId, '2026-07-30', '2026-08-15');

    // Record $15.00 payment on $10.00 invoice
    await PaymentRepo.record({
      invoice_id: invoiceId,
      client_id: clientId,
      amount_minor: 1500,
      currency: 'USD'
    });

    let invoice: any = null;
    InvoiceRepo.get(invoiceId).subscribe(data => { invoice = data; });
    await sleep(20);

    expect(invoice.balanceDueMinor).toBe(-500); // Negative balance due
    expect(invoice.displayStatus).toBe('paid');  // Settled remains Paid

    console.log('--- Criterion 7 Verified ---');
    console.log(`Overpayment Recorded. Paid: $15.00 on $10.00 invoice. Balance Due: $${invoice.balanceDueMinor / 100}. Status: ${invoice.displayStatus}`);
  });


  it('Criterion 11: Client payment history correctly attributes events to respective invoices', async () => {
    const clientId = await ClientRepo.create({ name: 'Multi Invoice Client' });
    const invA = await InvoiceRepo.create({ client_id: clientId, currency: 'USD' });
    const invB = await InvoiceRepo.create({ client_id: clientId, currency: 'USD' });

    await InvoiceRepo.setLineItems(invA, [{ description: 'Consulting', quantity: 1, unit_price_minor: 1000 }]);
    await InvoiceRepo.setLineItems(invB, [{ description: 'Design', quantity: 1, unit_price_minor: 1500 }]);

    await InvoiceRepo.markSent(invA, '2026-07-30', '2026-08-15');
    await InvoiceRepo.markSent(invB, '2026-07-30', '2026-08-15');

    const pmtA = await PaymentRepo.record({ invoice_id: invA, client_id: clientId, amount_minor: 500, currency: 'USD' });
    const pmtB = await PaymentRepo.record({ invoice_id: invB, client_id: clientId, amount_minor: 800, currency: 'USD' });

    // Fetch payments list for this client
    let history: any[] = [];
    PaymentRepo.listForClient(clientId).subscribe(data => { history = data; });
    await sleep(20);

    expect(history.length).toBe(2);
    const eventA = history.find(e => e.id === pmtA);
    const eventB = history.find(e => e.id === pmtB);

    expect(eventA.invoice_id).toBe(invA);
    expect(eventB.invoice_id).toBe(invB);

    console.log('--- Criterion 11 Verified ---');
    console.log(`Payment Event ${pmtA} attributes to Invoice ${eventA.invoice_id}`);
    console.log(`Payment Event ${pmtB} attributes to Invoice ${eventB.invoice_id}`);
  });
});
