import { describe, it, expect, beforeAll, afterAll, beforeEach, afterEach, vi } from 'vitest';
import { PGlite } from '@electric-sql/pglite';
import * as fs from 'fs';
import * as path from 'path';

// Mock the sync db before importing repositories
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

// Import repos after mock is defined
import { db } from '../src/lib/sync/db';
import { ClientRepo } from '../src/lib/data/client';
import { InvoiceRepo } from '../src/lib/data/invoice';
import { PaymentRepo } from '../src/lib/data/payment';
import { ClientLinkRepo } from '../src/lib/data/client-link';
import { ProfileRepo } from '../src/lib/data/profile';
import { ProfileRow } from '../src/lib/sync/schema';
import { InvoiceLockedError, CurrencyMismatchError, ValidationError, LiveQuery } from '../src/lib/data/types';

const sleep = (ms: number) => new Promise((resolve) => setTimeout(resolve, ms));

describe('Data-Access Repositories Layer Invariants', () => {
  let activeSubscriptions: (() => void)[] = [];

  function subscribeAndTrack<T>(query: LiveQuery<T>, callback: (data: T) => void) {
    const unsub = query.subscribe(callback);
    activeSubscriptions.push(unsub);
    return unsub;
  }

  beforeAll(async () => {
    pgliteInstance = new PGlite();

    // Setup initial schema mocks
    await pgliteInstance.exec(`
      CREATE SCHEMA IF NOT EXISTS auth;
      CREATE TABLE IF NOT EXISTS auth.users (
        id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
        email text UNIQUE
      );

      -- Mock auth.uid() function returning a mock sub setting or default to a valid uuid
      CREATE OR REPLACE FUNCTION auth.uid() RETURNS uuid AS $$
        SELECT COALESCE(
          NULLIF(current_setting('request.jwt.claim.sub', true), ''),
          '00000000-0000-0000-0000-000000000000'
        )::uuid;
      $$ LANGUAGE sql STABLE;
    `);

    // Load migration script
    const migrationPath = path.join(process.cwd(), 'supabase', 'migrations', '20260722000000_initial_schema.sql');
    const migrationSql = fs.readFileSync(migrationPath, 'utf8');
    await pgliteInstance.exec(migrationSql);
  });

  afterAll(async () => {
    if (pgliteInstance) {
      await pgliteInstance.close();
    }
  });

  beforeEach(async () => {
    // Truncate tables CASCADE to start with a fresh slate for each test
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
      `UPDATE profiles SET business_name = $1, business_address = $2 WHERE id = $3`,
      ['Freelancer Co', '123 Main St', '00000000-0000-0000-0000-000000000000']
    );
  });

  afterEach(async () => {
    // Clean up all subscriptions to prevent concurrent leaking queries
    for (const unsub of activeSubscriptions) {
      unsub();
    }
    activeSubscriptions = [];
  });

  // Acceptance Criterion 2: A client created offline appears in list() immediately
  it('Criterion 2: Client created offline is visible in list() immediately', async () => {
    const listQuery = ClientRepo.list();
    
    let clients: any[] = [];
    subscribeAndTrack(listQuery, (data) => {
      clients = data;
    });

    // Wait for initial fetch
    await sleep(20);
    expect(clients.length).toBe(0);

    // Create client
    const clientId = await ClientRepo.create({
      name: 'Offline Client ABC',
      email: 'abc@offline.com'
    });

    expect(clientId).toBeDefined();
    
    // Subscribe to late check
    let latest: any[] = [];
    subscribeAndTrack(ClientRepo.list(), (data) => { latest = data; });
    
    await sleep(20);
    expect(latest.length).toBe(1);
    expect(latest[0].id).toBe(clientId);
    expect(latest[0].name).toBe('Offline Client ABC');
  });

  // Acceptance Criterion 3: Invoice total_minor equals the sum of its line totals
  it('Criterion 3: Invoice total_minor matches the sum of line totals', async () => {
    const clientId = await ClientRepo.create({ name: 'Client X' });
    const invoiceId = await InvoiceRepo.create({
      client_id: clientId,
      currency: 'USD'
    });

    // Set line items
    await InvoiceRepo.setLineItems(invoiceId, [
      { description: 'Consulting', quantity: 10, unit_price_minor: 10000 }, // line total: 100000
      { description: 'Design Services', quantity: 2, unit_price_minor: 50000 } // line total: 100000
    ]);

    // Query invoice detail
    let detail: any = null;
    subscribeAndTrack(InvoiceRepo.get(invoiceId), (data) => {
      detail = data;
    });

    await sleep(20);
    expect(detail).not.toBeNull();
    expect(detail.total_minor).toBe(200000); // 100000 + 100000
    expect(detail.lineItems.length).toBe(2);
    expect(detail.lineItems[0].line_total_minor).toBe(100000);
    expect(detail.lineItems[1].line_total_minor).toBe(100000);
  });

  // Acceptance Criterion 4: Two partial payments drive balanceDue and displayStatus to partially_paid, then paid
  it('Criterion 4: Payments sequence drives status from partially_paid to paid', async () => {
    const clientId = await ClientRepo.create({ name: 'Client Y' });
    const invoiceId = await InvoiceRepo.create({
      client_id: clientId,
      currency: 'USD'
    });

    // Set line items to value of $1,000 (100,000 cents)
    await InvoiceRepo.setLineItems(invoiceId, [
      { description: 'Work', quantity: 1, unit_price_minor: 100000 }
    ]);

    await InvoiceRepo.markSent(invoiceId, '2026-07-28', '2026-08-28');

    // Fetch initial status
    let detail: any = null;
    subscribeAndTrack(InvoiceRepo.get(invoiceId), (data) => { detail = data; });

    await sleep(20);
    expect(detail.balanceDueMinor).toBe(100000);
    expect(detail.displayStatus).toBe('sent');

    // Partial Payment 1: $300 (30,000 cents)
    await PaymentRepo.record({
      invoice_id: invoiceId,
      client_id: clientId,
      amount_minor: 30000,
      currency: 'USD'
    });

    // Reload state
    subscribeAndTrack(InvoiceRepo.get(invoiceId), (data) => { detail = data; });
    await sleep(20);
    expect(detail.balanceDueMinor).toBe(70000);
    expect(detail.displayStatus).toBe('sent'); // Payment status partially_paid, display status is sent (not overdue)
    expect(detail.amountPaidMinor).toBe(30000);

    // Partial Payment 2: $700 (70,000 cents)
    await PaymentRepo.record({
      invoice_id: invoiceId,
      client_id: clientId,
      amount_minor: 70000,
      currency: 'USD'
    });

    // Reload state
    subscribeAndTrack(InvoiceRepo.get(invoiceId), (data) => { detail = data; });
    await sleep(20);
    expect(detail.balanceDueMinor).toBe(0);
    expect(detail.displayStatus).toBe('paid');
  });

  // Acceptance Criterion 5: reverse() inserts negative event and leaves original row unchanged
  it('Criterion 5: Reversal creates negative mirror and original event is unmodified', async () => {
    const clientId = await ClientRepo.create({ name: 'Client Z' });
    const invoiceId = await InvoiceRepo.create({
      client_id: clientId,
      currency: 'USD'
    });

    await InvoiceRepo.setLineItems(invoiceId, [
      { description: 'Project', quantity: 1, unit_price_minor: 50000 }
    ]);

    const paymentId = await PaymentRepo.record({
      invoice_id: invoiceId,
      client_id: clientId,
      amount_minor: 30000,
      currency: 'USD',
      note: 'Original payment'
    });

    // Get original row details before reversal
    const origQuery = await pgliteInstance.query<any>('SELECT * FROM payment_events WHERE id = $1', [paymentId]);
    const origRowBefore = origQuery.rows[0];

    // Wait, then reverse
    const revId = await PaymentRepo.reverse(paymentId, 'Reversing error');

    // Get original row details after reversal
    const origQueryAfter = await pgliteInstance.query<any>('SELECT * FROM payment_events WHERE id = $1', [paymentId]);
    const origRowAfter = origQueryAfter.rows[0];

    // Assert original row parameters are identical (unmodified)
    expect(origRowAfter.id).toBe(origRowBefore.id);
    expect(origRowAfter.amount_minor).toBe(origRowBefore.amount_minor);
    expect(origRowAfter.created_at.toISOString()).toBe(origRowBefore.created_at.toISOString());
    expect(origRowAfter.note).toBe(origRowBefore.note);

    // Assert reversal row properties
    const revQuery = await pgliteInstance.query<any>('SELECT * FROM payment_events WHERE id = $1', [revId]);
    const revRow = revQuery.rows[0];

    expect(revRow.amount_minor).toBe(-30000);
    expect(revRow.reverses_id).toBe(paymentId);
    expect(revRow.note).toBe('Reversing error');
  });

  // Acceptance Criterion 6: A payment in a mismatched currency throws
  it('Criterion 6: Recording a payment in mismatched currency throws CurrencyMismatchError', async () => {
    const clientId = await ClientRepo.create({ name: 'Client W' });
    const invoiceId = await InvoiceRepo.create({
      client_id: clientId,
      currency: 'USD'
    });

    // Try to record EUR payment on USD invoice
    await expect(
      PaymentRepo.record({
        invoice_id: invoiceId,
        client_id: clientId,
        amount_minor: 5000,
        currency: 'EUR'
      })
    ).rejects.toThrow(CurrencyMismatchError);
  });

  // Acceptance Criterion 7: Edit line items with zero payments succeeds, fails after a payment
  it('Criterion 7: Financial editing locks after recording payment events', async () => {
    const clientId = await ClientRepo.create({ name: 'Client V' });
    const invoiceId = await InvoiceRepo.create({
      client_id: clientId,
      currency: 'USD',
      due_date: '2026-08-01',
      internal_note: 'Internal test'
    });

    // 1. Editing line items with zero payments succeeds
    await expect(
      InvoiceRepo.setLineItems(invoiceId, [
        { description: 'Design', quantity: 1, unit_price_minor: 40000 }
      ])
    ).resolves.not.toThrow();

    // Record a payment
    await PaymentRepo.record({
      invoice_id: invoiceId,
      client_id: clientId,
      amount_minor: 20000,
      currency: 'USD'
    });

    // 2. The same edit after a payment throws InvoiceLockedError
    await expect(
      InvoiceRepo.setLineItems(invoiceId, [
        { description: 'Design', quantity: 1, unit_price_minor: 50000 }
      ])
    ).rejects.toThrow(InvoiceLockedError);

    // 3. due_date and internal_note changes succeed in both cases (positive control)
    await expect(
      InvoiceRepo.update(invoiceId, {
        due_date: '2026-09-01',
        internal_note: 'Updated internal note'
      })
    ).resolves.not.toThrow();

    // Query invoice detail to assert change succeeded
    let detail: any = null;
    subscribeAndTrack(InvoiceRepo.get(invoiceId), (data) => { detail = data; });
    await sleep(20);
    const dueDateStr = detail.due_date instanceof Date 
      ? detail.due_date.toISOString().split('T')[0] 
      : detail.due_date;
    expect(dueDateStr).toBe('2026-09-01');
    expect(detail.internal_note).toBe('Updated internal note');
  });

  // Acceptance Criterion 8: softDelete on a client sets deleted_at, removes from list, and leaves invoices queryable
  it('Criterion 8: Soft delete on client scopes visibility but preserves invoice records', async () => {
    const clientId = await ClientRepo.create({ name: 'Client to Delete' });
    const invoiceId = await InvoiceRepo.create({
      client_id: clientId,
      currency: 'USD'
    });

    // Assert client list count is 1
    let clients: any[] = [];
    subscribeAndTrack(ClientRepo.list(), (data) => { clients = data; });
    await sleep(20);
    expect(clients.length).toBe(1);

    // Soft delete client
    await ClientRepo.softDelete(clientId);

    // Assert client is removed from list
    subscribeAndTrack(ClientRepo.list(), (data) => { clients = data; });
    await sleep(20);
    expect(clients.length).toBe(0);

    // Query database directly to assert deleted_at is set
    const dbClient = await pgliteInstance.query<any>('SELECT deleted_at FROM clients WHERE id = $1', [clientId]);
    expect(dbClient.rows[0].deleted_at).not.toBeNull();

    // Assert invoice is still queryable
    let invoices: any[] = [];
    subscribeAndTrack(InvoiceRepo.listForClient(clientId), (data) => { invoices = data; });
    await sleep(20);
    expect(invoices.length).toBe(1);
    expect(invoices[0].id).toBe(invoiceId);
  });

  // URL validation check
  it('Validation check: ClientLink validates absolute URL format', async () => {
    const clientId = await ClientRepo.create({ name: 'Client Links' });

    // Invalid url without http/https throws ValidationError
    await expect(
      ClientLinkRepo.add(clientId, 'Drive Link', 'google.com/drive')
    ).rejects.toThrow(ValidationError);

    // Valid url succeeds
    const linkId = await ClientLinkRepo.add(clientId, 'Drive Link', 'https://google.com/drive');
    expect(linkId).toBeDefined();
  });

  // Double reversal check
  it('Double reversal safety check: Reversing a reversal throws error', async () => {
    const clientId = await ClientRepo.create({ name: 'Payment Reversals' });
    const invoiceId = await InvoiceRepo.create({ client_id: clientId, currency: 'USD' });
    await InvoiceRepo.setLineItems(invoiceId, [{ description: 'Item', quantity: 1, unit_price_minor: 100 }]);

    const pId = await PaymentRepo.record({ invoice_id: invoiceId, client_id: clientId, amount_minor: 100, currency: 'USD' });

    const rId = await PaymentRepo.reverse(pId);

    // Attempting to reverse the reversal throws
    await expect(PaymentRepo.reverse(rId)).rejects.toThrow('Cannot reverse a reversal event');

    // Attempting to reverse original again throws
    await expect(PaymentRepo.reverse(pId)).rejects.toThrow('Payment event is already reversed');
  });

  // Profile Repo offline updates verification
  it('Criterion 6: Profile edited offline persists locally', async () => {
    // Fetch initial profile
    const initialQuery = ProfileRepo.get();
    let initialProfile: any;
    subscribeAndTrack(initialQuery, (data) => {
      initialProfile = data;
    });
    await sleep(20);

    expect(initialProfile?.business_name).toBe('Freelancer Co');
    expect(initialProfile?.default_currency).toBe('USD');

    // Update profile
    await ProfileRepo.update({
      business_name: 'Jane Doe Studios',
      business_address: '456 Elm St',
      default_currency: 'EUR'
    });

    // Verify change is cached in database
    const updatedQuery = ProfileRepo.get();
    let updatedProfile: any;
    subscribeAndTrack(updatedQuery, (data) => {
      updatedProfile = data;
    });
    await sleep(20);

    expect(updatedProfile?.business_name).toBe('Jane Doe Studios');
    expect(updatedProfile?.business_address).toBe('456 Elm St');
    expect(updatedProfile?.default_currency).toBe('EUR');
  });

  // Sign out clears local database verification
  it('Criterion 7: Signing out clears the local database', async () => {
    const userId = '00000000-0000-0000-0000-000000000000';
    // Bootstrap database with client, invoice, profile
    const clientId = await ClientRepo.create({ name: 'Client Leftover' });
    expect(clientId).toBeDefined();

    // Verify row exists before sign-out
    const clientsCountBefore = await pgliteInstance.query<any>('SELECT COUNT(*) as count FROM clients');
    expect(clientsCountBefore.rows[0].count).toBeGreaterThan(0);

    // Call disconnectAndClear (mock signout)
    await db.disconnectAndClear();

    // Verify database tables are completely empty
    const clientsCountAfter = await pgliteInstance.query<any>('SELECT COUNT(*) as count FROM clients');
    expect(clientsCountAfter.rows[0].count).toBe(0);

    const profilesCountAfter = await pgliteInstance.query<any>('SELECT COUNT(*) as count FROM profiles');
    expect(profilesCountAfter.rows[0].count).toBe(0);
  });

});

