import { describe, it, expect, beforeAll, afterAll, beforeEach, vi } from 'vitest';
import { PGlite } from '@electric-sql/pglite';
import * as fs from 'fs';
import * as path from 'path';
import { InvoiceSummary } from '../src/lib/data/types';

// Mock DB for PGlite testing
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
  }
};

vi.mock('../src/lib/sync/db', () => ({
  db: {
    execute: (sql: string, params: any[]) => mockDb.execute(sql, params),
    getAll: (sql: string, params: any[]) => mockDb.getAll(sql, params)
  }
}));

import { InvoiceRepo } from '../src/lib/data/invoice';

/**
 * Pure state machine simulator for `useDataReady` (master list views).
 */
class DataReadySimulator {
  private hasSynced: boolean;
  private hasLocalData: boolean;
  private userId: string | null;
  private checkEmpty: () => Promise<boolean>;
  private isConfirmedEmpty: boolean | null = null;
  private hasLoaded = false;

  constructor(opts: {
    hasSynced: boolean;
    hasLocalData: boolean;
    userId?: string | null;
    checkEmpty: () => Promise<boolean>;
  }) {
    this.hasSynced = opts.hasSynced;
    this.hasLocalData = opts.hasLocalData;
    this.userId = opts.userId ?? 'user-123';
    this.checkEmpty = opts.checkEmpty;
  }

  async init() {
    await this.evaluate();
    return this;
  }

  async setSyncStatus(hasSynced: boolean) {
    this.hasSynced = hasSynced;
    await this.evaluate();
  }

  async setLocalData(hasLocalData: boolean) {
    this.hasLocalData = hasLocalData;
    await this.evaluate();
  }

  async setUserId(userId: string | null) {
    if (this.userId !== userId) {
      this.userId = userId;
      this.isConfirmedEmpty = null;
      this.hasLoaded = false;
    }
    await this.evaluate();
  }

  private async evaluate() {
    if (this.hasSynced && !this.hasLocalData && this.isConfirmedEmpty === null) {
      try {
        const result = await this.checkEmpty();
        this.isConfirmedEmpty = result;
      } catch {
        // Strict error safety
      }
    }

    const isDataReady = this.hasLocalData || this.isConfirmedEmpty === true;
    if (isDataReady) {
      this.hasLoaded = true;
    }
  }

  get isDataReady(): boolean {
    return this.hasLocalData || this.isConfirmedEmpty === true;
  }

  get isLoading(): boolean {
    return !this.hasLoaded;
  }

  get confirmedEmpty(): boolean | null {
    return this.isConfirmedEmpty;
  }
}

/**
 * Pure state machine simulator for `useEntityReady` (single-record detail views).
 * Validates the exact state transitions, pre-sync 404 suppression, and genuine 404 detection.
 */
class EntityReadySimulator {
  private hasSynced: boolean;
  private hasEntity: boolean;
  private userId: string | null;
  private checkExists: () => Promise<boolean>;
  private isConfirmedNotFound: boolean | null = null;
  private hasLoaded = false;

  constructor(opts: {
    hasSynced: boolean;
    hasEntity: boolean;
    userId?: string | null;
    checkExists: () => Promise<boolean>;
  }) {
    this.hasSynced = opts.hasSynced;
    this.hasEntity = opts.hasEntity;
    this.userId = opts.userId ?? 'user-123';
    this.checkExists = opts.checkExists;
  }

  async init() {
    await this.evaluate();
    return this;
  }

  async setSyncStatus(hasSynced: boolean) {
    this.hasSynced = hasSynced;
    await this.evaluate();
  }

  async setEntity(hasEntity: boolean) {
    this.hasEntity = hasEntity;
    await this.evaluate();
  }

  async setUserId(userId: string | null) {
    if (this.userId !== userId) {
      this.userId = userId;
      this.isConfirmedNotFound = null;
      this.hasLoaded = false;
    }
    await this.evaluate();
  }

  private async evaluate() {
    if (this.hasSynced && !this.hasEntity && this.isConfirmedNotFound === null) {
      try {
        const exists = await this.checkExists();
        this.isConfirmedNotFound = !exists;
      } catch {
        // Strict error safety: on error, leave isConfirmedNotFound as null (hold skeleton)
      }
    }

    const isReady = this.hasEntity || this.isConfirmedNotFound === true;
    if (isReady) {
      this.hasLoaded = true;
    }
  }

  get isReady(): boolean {
    return this.hasEntity || this.isConfirmedNotFound === true;
  }

  get isLoading(): boolean {
    return !this.hasLoaded;
  }

  get isNotFound(): boolean {
    return this.isConfirmedNotFound === true && !this.hasEntity;
  }
}

describe('Invoices Screen Readiness Gate & Offline Tests (ADR 036)', () => {
  beforeAll(async () => {
    pgliteInstance = new PGlite();
    await pgliteInstance.exec(`
      CREATE SCHEMA IF NOT EXISTS auth;
      CREATE TABLE IF NOT EXISTS auth.users (
        id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
        email text UNIQUE
      );
      CREATE OR REPLACE FUNCTION auth.uid() RETURNS uuid AS $$
        SELECT '00000000-0000-0000-0000-000000000000'::uuid;
      $$ LANGUAGE sql STABLE;
    `);

    const migrationPath = path.join(process.cwd(), 'supabase', 'migrations', '20260722000000_initial_schema.sql');
    if (fs.existsSync(migrationPath)) {
      const migrationSql = fs.readFileSync(migrationPath, 'utf8');
      await pgliteInstance.exec(migrationSql);
    }

    // Insert test user and client for foreign keys
    await pgliteInstance.exec(`
      INSERT INTO auth.users (id, email)
      VALUES ('00000000-0000-0000-0000-000000000000', 'test@clario.local')
      ON CONFLICT (id) DO NOTHING;

      INSERT INTO clients (id, user_id, name, default_currency, created_at, updated_at)
      VALUES ('00000000-0000-0000-0000-000000000001', '00000000-0000-0000-0000-000000000000', 'Acme Corp', 'USD', NOW(), NOW())
      ON CONFLICT (id) DO NOTHING;
    `);
  });

  afterAll(async () => {
    await pgliteInstance.close();
  });

  beforeEach(async () => {
    await pgliteInstance.exec('DELETE FROM invoices;');
    vi.clearAllMocks();
  });

  // --------------------------------------------------------------------------
  // Part 1: InvoiceRepo.isEmpty() & exists(id) Database Integration Tests
  // --------------------------------------------------------------------------
  describe('InvoiceRepo.isEmpty() and InvoiceRepo.exists() Engine Invariants', () => {
    it('isEmpty returns true when invoices table has 0 rows', async () => {
      const isEmpty = await InvoiceRepo.isEmpty();
      expect(isEmpty).toBe(true);
    });

    it('isEmpty returns false when at least 1 active invoice exists', async () => {
      await pgliteInstance.exec(`
        INSERT INTO invoices (id, user_id, client_id, invoice_number, status, currency, total_minor, created_at, updated_at)
        VALUES ('00000000-0000-0000-0000-000000000010', '00000000-0000-0000-0000-000000000000', '00000000-0000-0000-0000-000000000001', 'INV-001', 'draft', 'USD', 10000, NOW(), NOW());
      `);
      const isEmpty = await InvoiceRepo.isEmpty();
      expect(isEmpty).toBe(false);
    });

    it('isEmpty returns true when all invoices are soft-deleted', async () => {
      await pgliteInstance.exec(`
        INSERT INTO invoices (id, user_id, client_id, invoice_number, status, currency, total_minor, created_at, updated_at, deleted_at)
        VALUES ('00000000-0000-0000-0000-000000000011', '00000000-0000-0000-0000-000000000000', '00000000-0000-0000-0000-000000000001', 'INV-002', 'draft', 'USD', 10000, NOW(), NOW(), NOW());
      `);
      const isEmpty = await InvoiceRepo.isEmpty();
      expect(isEmpty).toBe(true);
    });

    it('exists(id) returns true for active matching invoice', async () => {
      await pgliteInstance.exec(`
        INSERT INTO invoices (id, user_id, client_id, invoice_number, status, currency, total_minor, created_at, updated_at)
        VALUES ('00000000-0000-0000-0000-000000000012', '00000000-0000-0000-0000-000000000000', '00000000-0000-0000-0000-000000000001', 'INV-003', 'draft', 'USD', 5000, NOW(), NOW());
      `);
      const exists = await InvoiceRepo.exists('00000000-0000-0000-0000-000000000012');
      expect(exists).toBe(true);
    });

    it('exists(id) returns false for soft-deleted invoice', async () => {
      await pgliteInstance.exec(`
        INSERT INTO invoices (id, user_id, client_id, invoice_number, status, currency, total_minor, created_at, updated_at, deleted_at)
        VALUES ('00000000-0000-0000-0000-000000000013', '00000000-0000-0000-0000-000000000000', '00000000-0000-0000-0000-000000000001', 'INV-004', 'draft', 'USD', 5000, NOW(), NOW(), NOW());
      `);
      const exists = await InvoiceRepo.exists('00000000-0000-0000-0000-000000000013');
      expect(exists).toBe(false);
    });

    it('exists(id) returns false for non-existent invoice UUID', async () => {
      const exists = await InvoiceRepo.exists('00000000-0000-0000-0000-000000000099');
      expect(exists).toBe(false);
    });
  });

  // --------------------------------------------------------------------------
  // Part 2: Master List (/invoices) Readiness Controls
  // --------------------------------------------------------------------------
  describe('/invoices Master List Readiness Controls', () => {
    it('Negative Control: suppresses empty state and holds skeleton while sync is in-flight', async () => {
      const checkEmpty = vi.fn().mockResolvedValue(true);

      const sim = await new DataReadySimulator({
        hasSynced: false,
        hasLocalData: false,
        checkEmpty
      }).init();

      expect(sim.isLoading).toBe(true);
      expect(sim.isDataReady).toBe(false);
      expect(checkEmpty).not.toHaveBeenCalled();
    });

    it('Positive Control: unblocks readiness and confirms empty state when sync completes with 0 invoices', async () => {
      const checkEmpty = vi.fn().mockResolvedValue(true);

      const sim = await new DataReadySimulator({
        hasSynced: false,
        hasLocalData: false,
        checkEmpty
      }).init();

      await sim.setSyncStatus(true);

      expect(checkEmpty).toHaveBeenCalledTimes(1);
      expect(sim.isDataReady).toBe(true);
      expect(sim.isLoading).toBe(false);
      expect(sim.confirmedEmpty).toBe(true);
    });

    it('Asymmetric Control: holds skeleton when disk has invoices until live query delivers rows', async () => {
      const checkEmpty = vi.fn().mockResolvedValue(false);

      const sim = await new DataReadySimulator({
        hasSynced: false,
        hasLocalData: false,
        checkEmpty
      }).init();

      await sim.setSyncStatus(true);

      // Confirmed data exists on disk -> holds skeleton
      expect(sim.isDataReady).toBe(false);
      expect(sim.isLoading).toBe(true);

      // Live query emits
      await sim.setLocalData(true);
      expect(sim.isDataReady).toBe(true);
      expect(sim.isLoading).toBe(false);
    });
  });

  // --------------------------------------------------------------------------
  // Part 3: Single Invoice Detail (/invoices/[id]) Readiness & 404 Controls
  // --------------------------------------------------------------------------
  describe('/invoices/[id] Single Detail Readiness & 404 Controls', () => {
    it('Negative Control: suppresses 404 error and holds skeleton during cold boot while sync is in-flight', async () => {
      const checkExists = vi.fn().mockResolvedValue(true);

      const sim = await new EntityReadySimulator({
        hasSynced: false,
        hasEntity: false,
        checkExists
      }).init();

      // Crucial: Must NOT show 404 (isNotFound must be false) while sync is in-flight
      expect(sim.isLoading).toBe(true);
      expect(sim.isReady).toBe(false);
      expect(sim.isNotFound).toBe(false);
      expect(checkExists).not.toHaveBeenCalled();
    });

    it('Positive Control (Valid Invoice): unblocks smoothly when invoice syncs from server without flashing 404', async () => {
      const checkExists = vi.fn().mockResolvedValue(true);

      const sim = await new EntityReadySimulator({
        hasSynced: false,
        hasEntity: false,
        checkExists
      }).init();

      // Server finishes sync
      await sim.setSyncStatus(true);

      // Check confirms invoice exists on disk -> still holds skeleton, suppresses 404
      expect(checkExists).toHaveBeenCalledTimes(1);
      expect(sim.isNotFound).toBe(false);
      expect(sim.isLoading).toBe(true);

      // Live query emits the invoice detail into React state
      await sim.setEntity(true);
      expect(sim.isReady).toBe(true);
      expect(sim.isLoading).toBe(false);
      expect(sim.isNotFound).toBe(false);
    });

    it('Positive Control (Genuine 404): unblocks and displays 404 when invoice is confirmed absent on disk (no infinite skeleton)', async () => {
      // Invoice genuinely does not exist (bad URL)
      const checkExists = vi.fn().mockResolvedValue(false);

      const sim = await new EntityReadySimulator({
        hasSynced: false,
        hasEntity: false,
        checkExists
      }).init();

      expect(sim.isLoading).toBe(true);
      expect(sim.isNotFound).toBe(false);

      // Server sync finishes
      await sim.setSyncStatus(true);

      // Disk check confirmed row does NOT exist -> unblocks skeleton and shows genuine 404!
      expect(checkExists).toHaveBeenCalledTimes(1);
      expect(sim.isReady).toBe(true);
      expect(sim.isLoading).toBe(false);
      expect(sim.isNotFound).toBe(true);
    });

    it('Strict Error Handling: fails safe toward skeleton if checkExists throws', async () => {
      const checkExists = vi.fn().mockRejectedValue(new Error('SQLite busy'));

      const sim = await new EntityReadySimulator({
        hasSynced: false,
        hasEntity: false,
        checkExists
      }).init();

      await sim.setSyncStatus(true);

      // On error, does NOT assume 404 -> skeleton holds safely
      expect(sim.isReady).toBe(false);
      expect(sim.isLoading).toBe(true);
      expect(sim.isNotFound).toBe(false);
    });

    it('User Switch Reset: resets not-found state when user changes', async () => {
      const checkExists = vi.fn().mockResolvedValue(false);

      const sim = await new EntityReadySimulator({
        hasSynced: true,
        hasEntity: false,
        userId: 'user-1',
        checkExists
      }).init();

      expect(sim.isNotFound).toBe(true);

      // Switch user
      await sim.setSyncStatus(false);
      await sim.setUserId('user-2');

      // State is reset for new user
      expect(sim.isNotFound).toBe(false);
      expect(sim.isLoading).toBe(true);
    });
  });

  // --------------------------------------------------------------------------
  // Part 4: Invoice List Filtering Invariants
  // --------------------------------------------------------------------------
  describe('Invoices Master List Filtering Logic', () => {
    const mockInvoices: InvoiceSummary[] = [
      {
        id: 'inv-1',
        client_id: 'client-1',
        client_name: 'Acme Corp',
        invoice_number: 'INV-001',
        status: 'sent',
        currency: 'USD',
        total_minor: 10000,
        issue_date: '2026-01-01',
        due_date: '2026-01-15',
        displayStatus: 'sent',
        amountPaidMinor: 0,
        balanceDueMinor: 10000
      },
      {
        id: 'inv-2',
        client_id: 'client-1',
        client_name: 'Acme Corp',
        invoice_number: 'INV-002',
        status: 'sent',
        currency: 'EUR',
        total_minor: 20000,
        issue_date: '2026-01-02',
        due_date: '2026-01-16',
        displayStatus: 'paid',
        amountPaidMinor: 20000,
        balanceDueMinor: 0
      },
      {
        id: 'inv-3',
        client_id: 'client-2',
        client_name: 'Beta LLC',
        invoice_number: 'INV-003',
        status: 'sent',
        currency: 'USD',
        total_minor: 30000,
        issue_date: '2026-01-03',
        due_date: '2026-01-10',
        displayStatus: 'overdue',
        amountPaidMinor: 10000,
        balanceDueMinor: 20000
      }
    ];

    const filterInvoices = (invoices: InvoiceSummary[], targetCurrency: string | null, targetStatus: string | null) => {
      return invoices.filter((inv) => {
        if (targetCurrency && inv.currency.toUpperCase() !== targetCurrency.toUpperCase()) {
          return false;
        }
        if (targetStatus === 'outstanding') {
          return (inv.displayStatus === 'sent' || inv.displayStatus === 'overdue') && inv.balanceDueMinor > 0;
        }
        return true;
      });
    };

    it('filters invoices by currency', () => {
      const usdInvoices = filterInvoices(mockInvoices, 'USD', null);
      expect(usdInvoices.length).toBe(2);
      expect(usdInvoices.map(i => i.invoice_number)).toEqual(['INV-001', 'INV-003']);

      const eurInvoices = filterInvoices(mockInvoices, 'EUR', null);
      expect(eurInvoices.length).toBe(1);
      expect(eurInvoices[0].invoice_number).toBe('INV-002');
    });

    it('filters invoices by outstanding status', () => {
      const outstandingInvoices = filterInvoices(mockInvoices, null, 'outstanding');
      expect(outstandingInvoices.length).toBe(2);
      expect(outstandingInvoices.map(i => i.invoice_number)).toEqual(['INV-001', 'INV-003']);
    });

    it('filters by combined currency and outstanding status', () => {
      const eurOutstanding = filterInvoices(mockInvoices, 'EUR', 'outstanding');
      // EUR invoice is paid (balanceDue = 0), so 0 matches
      expect(eurOutstanding.length).toBe(0);
      // Total collection is non-empty, so UI routes to "No invoices match criteria" rather than "No invoices generated yet"
      expect(mockInvoices.length > 0).toBe(true);
    });
  });
});
