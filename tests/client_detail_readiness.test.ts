import { describe, it, expect, beforeAll, afterAll, beforeEach, vi } from 'vitest';
import { PGlite } from '@electric-sql/pglite';
import * as fs from 'fs';
import * as path from 'path';

// ----------------------------------------------------------------------------
// DB & Repository Mocks
// ----------------------------------------------------------------------------
let pgliteInstance: PGlite;
let mockDbActive = true;

const mockDb = {
  execute: async (sql: string, params: any[]) => {
    if (!mockDbActive) throw new Error('Database connection not available');
    let pgSql = sql;
    let index = 1;
    while (pgSql.includes('?')) {
      pgSql = pgSql.replace('?', `$${index}`);
      index++;
    }
    await pgliteInstance.query(pgSql, params);
  },
  getAll: async (sql: string, params: any[]) => {
    if (!mockDbActive) throw new Error('Database connection not available');
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

import { ClientRepo } from '../src/lib/data/client';

const TEST_USER_ID = '00000000-0000-0000-0000-000000000000';
const CLIENT_101 = '00000000-0000-0000-0000-000000000101';
const CLIENT_DELETED = '00000000-0000-0000-0000-000000000002';
const CLIENT_COLD = '00000000-0000-0000-0000-000000000003';
const CLIENT_OFFLINE = '00000000-0000-0000-0000-000000000004';
const CLIENT_RECOVERED = '00000000-0000-0000-0000-000000000005';
const CLIENT_MISSING = '00000000-0000-0000-0000-000000000999';

/**
 * Pure state machine simulator for `useEntityReady` (single-record detail views).
 * Validates the exact decoupled disk-first logic (ADR 038), error-throwing safety (ADR 037),
 * and pre-sync 404 suppression / genuine 404 resolution.
 */
class ClientEntityReadySimulator {
  hasSynced: boolean;
  hasEntity: boolean;
  userId: string | null;
  checkExists: () => Promise<boolean>;
  entityId?: string | null;
  isConfirmedNotFound: boolean | null = null;
  hasLoaded = false;
  active = true;

  constructor(opts: {
    hasSynced: boolean;
    hasEntity: boolean;
    userId?: string | null;
    checkExists: () => Promise<boolean>;
    entityId?: string | null;
  }) {
    this.hasSynced = opts.hasSynced;
    this.hasEntity = opts.hasEntity;
    this.userId = opts.userId ?? TEST_USER_ID;
    this.checkExists = opts.checkExists;
    this.entityId = opts.entityId;
  }

  async runEffect() {
    const isNoEntity = this.entityId !== undefined && (this.entityId === null || this.entityId === '');
    if (!isNoEntity && !this.hasEntity && this.isConfirmedNotFound === null) {
      try {
        const exists = await this.checkExists();
        if (!this.active) return;
        if (exists === true) {
          // Entity confirmed on local disk! Decoupled disk-first unblock (ADR 038)
          this.isConfirmedNotFound = false;
        } else if (exists === false) {
          // Entity not on local disk. If sync is done, genuine 404. If sync in flight, hold skeleton.
          if (this.hasSynced) {
            this.isConfirmedNotFound = true;
          }
        }
      } catch (err) {
        // Strict error safety (ADR 037): leave isConfirmedNotFound as null
      }
    }

    const isReady = !isNoEntity && (this.hasEntity || this.isConfirmedNotFound === true);
    if (isReady) {
      this.hasLoaded = true;
    }
  }

  async setSyncStatus(hasSynced: boolean) {
    this.hasSynced = hasSynced;
    await this.runEffect();
  }

  async setEntity(hasEntity: boolean) {
    this.hasEntity = hasEntity;
    await this.runEffect();
  }

  async setEntityId(entityId: string | null) {
    if (this.entityId !== entityId) {
      this.entityId = entityId;
      this.isConfirmedNotFound = null;
      this.hasLoaded = false;
    }
    await this.runEffect();
  }

  async setUserId(userId: string | null) {
    if (this.userId !== userId) {
      this.userId = userId;
      this.isConfirmedNotFound = null;
      this.hasLoaded = false;
    }
    await this.runEffect();
  }

  get isReady(): boolean {
    const isNoEntity = this.entityId !== undefined && (this.entityId === null || this.entityId === '');
    return !isNoEntity && (this.hasEntity || this.isConfirmedNotFound === true);
  }

  get isLoading(): boolean {
    const isNoEntity = this.entityId !== undefined && (this.entityId === null || this.entityId === '');
    return isNoEntity ? false : !this.hasLoaded;
  }

  get isNotFound(): boolean {
    const isNoEntity = this.entityId !== undefined && (this.entityId === null || this.entityId === '');
    return !isNoEntity && this.isConfirmedNotFound === true && !this.hasEntity;
  }
}

describe('Client Detail Offline Hardening & Readiness Suite (ADR 036, 037, 038)', () => {
  beforeAll(async () => {
    pgliteInstance = new PGlite();
    await pgliteInstance.exec(`
      CREATE SCHEMA IF NOT EXISTS auth;
      CREATE TABLE IF NOT EXISTS auth.users (
        id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
        email text UNIQUE
      );
      CREATE OR REPLACE FUNCTION auth.uid() RETURNS uuid AS $$
        SELECT '${TEST_USER_ID}'::uuid;
      $$ LANGUAGE sql STABLE;
    `);

    const migrationPath = path.join(process.cwd(), 'supabase', 'migrations', '20260722000000_initial_schema.sql');
    if (fs.existsSync(migrationPath)) {
      const migrationSql = fs.readFileSync(migrationPath, 'utf8');
      await pgliteInstance.exec(migrationSql);
    }

    // Insert test user for foreign keys
    await pgliteInstance.exec(`
      INSERT INTO auth.users (id, email)
      VALUES ('${TEST_USER_ID}', 'test@clario.local')
      ON CONFLICT (id) DO NOTHING;
    `);
  });

  afterAll(async () => {
    await pgliteInstance.close();
  });

  beforeEach(async () => {
    mockDbActive = true;
    await pgliteInstance.exec(`
      DELETE FROM payment_events;
      DELETE FROM invoice_line_items;
      DELETE FROM invoices;
      DELETE FROM client_links;
      DELETE FROM clients;
    `);
    vi.clearAllMocks();
  });

  describe('1. ClientRepo.exists(id) Deterministic Invariants (ADR 037)', () => {
    it('returns true when active client exists in local SQLite', async () => {
      await pgliteInstance.query(`
        INSERT INTO clients (id, user_id, name, created_at, updated_at)
        VALUES ('${CLIENT_101}', '${TEST_USER_ID}', 'Acme Corp', '2026-09-01T00:00:00Z', '2026-09-01T00:00:00Z');
      `);

      const exists = await ClientRepo.exists(CLIENT_101);
      expect(exists).toBe(true);
    });

    it('returns false when client ID does not exist in local SQLite', async () => {
      const exists = await ClientRepo.exists(CLIENT_MISSING);
      expect(exists).toBe(false);
    });

    it('returns false when client is soft-deleted (deleted_at IS NOT NULL)', async () => {
      await pgliteInstance.query(`
        INSERT INTO clients (id, user_id, name, created_at, updated_at, deleted_at)
        VALUES ('${CLIENT_DELETED}', '${TEST_USER_ID}', 'Deleted Client', '2026-09-01T00:00:00Z', '2026-09-01T00:00:00Z', '2026-09-02T00:00:00Z');
      `);

      const exists = await ClientRepo.exists(CLIENT_DELETED);
      expect(exists).toBe(false);
    });

    it('returns false immediately when id is empty string', async () => {
      const exists = await ClientRepo.exists('');
      expect(exists).toBe(false);
    });

    it('throws explicit error when database connection is unavailable (ADR 037 Error Semantics)', async () => {
      mockDbActive = false;
      await expect(ClientRepo.exists(CLIENT_101)).rejects.toThrow('Database connection not available');
    });
  });

  describe('2. Client Detail useEntityReady Cold-Boot Gate (ADR 036, 038)', () => {
    it('Negative Control: suppresses false 404 while initial sync is in-flight on cold boot', async () => {
      // Scenario: User deep links to /clients?id=... on fresh device with 0 local rows.
      // Sync is in-flight (hasSynced: false).
      const sim = new ClientEntityReadySimulator({
        hasSynced: false,
        hasEntity: false,
        checkExists: () => ClientRepo.exists(CLIENT_COLD)
      });

      await sim.runEffect();

      // Invariant: Skeleton must hold. Must NOT flash "Client record not found"!
      expect(sim.isLoading).toBe(true);
      expect(sim.isNotFound).toBe(false);
      expect(sim.isReady).toBe(false);

      // Now server replication finishes and inserts the client
      await pgliteInstance.query(`
        INSERT INTO clients (id, user_id, name, created_at, updated_at)
        VALUES ('${CLIENT_COLD}', '${TEST_USER_ID}', 'Beta Tech', '2026-09-01T00:00:00Z', '2026-09-01T00:00:00Z');
      `);
      await sim.setSyncStatus(true);
      await sim.setEntity(true); // Live query emits row

      // Invariant: Transitions cleanly to ready with zero false 404 flash
      expect(sim.isLoading).toBe(false);
      expect(sim.isNotFound).toBe(false);
      expect(sim.isReady).toBe(true);
    });

    it('Positive Control (ADR 038): unblocks immediately from local disk without waiting for network hasSynced', async () => {
      // Scenario: User opens client drawer while offline, but client already exists on local disk
      await pgliteInstance.query(`
        INSERT INTO clients (id, user_id, name, created_at, updated_at)
        VALUES ('${CLIENT_OFFLINE}', '${TEST_USER_ID}', 'Offline Client', '2026-09-01T00:00:00Z', '2026-09-01T00:00:00Z');
      `);

      const sim = new ClientEntityReadySimulator({
        hasSynced: false, // Network offline!
        hasEntity: false,
        checkExists: () => ClientRepo.exists(CLIENT_OFFLINE)
      });

      await sim.runEffect();

      // Local disk check confirms exists === true -> isConfirmedNotFound is false
      expect(sim.isConfirmedNotFound).toBe(false);
      expect(sim.isNotFound).toBe(false);

      // Live query emits local data
      await sim.setEntity(true);
      expect(sim.isLoading).toBe(false);
      expect(sim.isReady).toBe(true);
      expect(sim.isNotFound).toBe(false);
    });

    it('Genuine 404 Resolution: unblocks to clean 404 state once sync confirms record is missing', async () => {
      // Scenario: User navigates to /clients?id=missing. Sync finishes. Record does not exist.
      const sim = new ClientEntityReadySimulator({
        hasSynced: true, // Sync complete
        hasEntity: false,
        checkExists: () => ClientRepo.exists(CLIENT_MISSING)
      });

      await sim.runEffect();

      // Invariant: Unblocks cleanly to genuine 404 without infinite skeleton hang
      expect(sim.isLoading).toBe(false);
      expect(sim.isNotFound).toBe(true);
      expect(sim.isReady).toBe(true);
    });

    it('ADR 037 Safety: transient database error holds skeleton and recovers on retry without lockup', async () => {
      let failDatabase = true;
      const sim = new ClientEntityReadySimulator({
        hasSynced: true,
        hasEntity: false,
        checkExists: async () => {
          if (failDatabase) {
            throw new Error('Database connection not available');
          }
          return ClientRepo.exists(CLIENT_RECOVERED);
        }
      });

      await sim.runEffect();

      // On error, isConfirmedNotFound stays null (holding skeleton) rather than false-confirming
      expect(sim.isConfirmedNotFound).toBe(null);
      expect(sim.isLoading).toBe(true);
      expect(sim.isNotFound).toBe(false);

      // Transient error resolves and client exists
      await pgliteInstance.query(`
        INSERT INTO clients (id, user_id, name, created_at, updated_at)
        VALUES ('${CLIENT_RECOVERED}', '${TEST_USER_ID}', 'Recovered Co', '2026-09-01T00:00:00Z', '2026-09-01T00:00:00Z');
      `);
      failDatabase = false;
      await sim.runEffect();

      expect(sim.isConfirmedNotFound).toBe(false);
      await sim.setEntity(true);
      expect(sim.isLoading).toBe(false);
      expect(sim.isReady).toBe(true);
      expect(sim.isNotFound).toBe(false);
    });

    it('Session Isolation: resets confirmation state when authenticated user changes', async () => {
      const sim = new ClientEntityReadySimulator({
        hasSynced: true,
        hasEntity: false,
        userId: '00000000-0000-0000-0000-000000000001',
        checkExists: () => ClientRepo.exists(CLIENT_MISSING)
      });

      await sim.runEffect();
      expect(sim.isNotFound).toBe(true);
      expect(sim.isLoading).toBe(false);

      // Switch to another user in same tab (where new user's sync is in-flight)
      await sim.setSyncStatus(false);
      await sim.setUserId('00000000-0000-0000-0000-000000000002');

      // State is reset to pending, skeleton holds
      expect(sim.isConfirmedNotFound).toBe(null);
      expect(sim.isLoading).toBe(true);
      expect(sim.isNotFound).toBe(false);
    });

    it('Mount Isolation: initial null entityId does NOT latch confirmed not found or block subsequent selection', async () => {
      // Scenario: App mounts on /clients. selectedClientId is null. hasSynced is true.
      const sim = new ClientEntityReadySimulator({
        hasSynced: true,
        hasEntity: false,
        entityId: null,
        checkExists: () => ClientRepo.exists('')
      });

      await sim.runEffect();

      // Invariant: Must NOT confirm not-found on null entity ID!
      expect(sim.isConfirmedNotFound).toBe(null);
      expect(sim.isNotFound).toBe(false);
      expect(sim.isLoading).toBe(false);

      // Now user clicks on an active client
      await pgliteInstance.query(`
        INSERT INTO clients (id, user_id, name, created_at, updated_at)
        VALUES ('${CLIENT_101}', '${TEST_USER_ID}', 'Selected Corp', '2026-09-01T00:00:00Z', '2026-09-01T00:00:00Z');
      `);

      sim.checkExists = () => ClientRepo.exists(CLIENT_101);
      await sim.setEntityId(CLIENT_101);

      // Invariant: Loading skeleton arms immediately. Must NOT flash 404!
      expect(sim.isLoading).toBe(true);
      expect(sim.isNotFound).toBe(false);

      // Live query emits row
      await sim.setEntity(true);
      expect(sim.isLoading).toBe(false);
      expect(sim.isNotFound).toBe(false);
      expect(sim.isReady).toBe(true);
    });

    it('Drawer Precedence Ladder: holds skeleton while live query is in flight and never flashes 404', async () => {
      // Evaluation ladder simulation from src/app/clients/page.tsx:
      // 1. Loading: isDetailLoading || (!isDetailNotFound && !selectedClientDetail) -> Skeleton
      // 2. Not Found: isDetailNotFound -> "Client Record Not Found"
      // 3. Live Data: selectedClientDetail -> Profile view

      const renderDrawer = (isDetailLoading: boolean, isDetailNotFound: boolean, clientDetail: any) => {
        if (isDetailLoading || (!isDetailNotFound && !clientDetail)) {
          return 'SKELETON';
        }
        if (isDetailNotFound) {
          return 'NOT_FOUND_SCREEN';
        }
        if (clientDetail) {
          return 'LIVE_PROFILE';
        }
        return 'NONE';
      };

      // Frame 1: User just clicked card. Existence check started, live query in flight (clientDetail is undefined)
      expect(renderDrawer(true, false, undefined)).toBe('SKELETON');

      // Frame 2: Existence check finished (exists: true -> isDetailNotFound: false), but live query still in flight
      expect(renderDrawer(false, false, undefined)).toBe('SKELETON');

      // Frame 3: Live query emits real client data
      expect(renderDrawer(false, false, { id: CLIENT_101, name: 'Live Client' })).toBe('LIVE_PROFILE');

      // Frame 4: Genuine 404 (existence check confirmed record missing, not loading)
      expect(renderDrawer(false, true, undefined)).toBe('NOT_FOUND_SCREEN');
    });

    it('Atomic Drawer Readiness: holds skeleton until both parent client AND child invoices resolve (ADR 036)', async () => {
      // Evaluation ladder with child query coordination from src/app/clients/page.tsx:
      const evaluateDrawer = (
        isDetailLoading: boolean,
        isDetailNotFound: boolean,
        clientDetail: any,
        isInvoicesLoading: boolean,
        clientInvoices: any[] | undefined
      ) => {
        const isDrawerLoading = !isDetailNotFound && (
          isDetailLoading ||
          isInvoicesLoading ||
          clientInvoices === undefined ||
          !clientDetail
        );

        if (isDrawerLoading) {
          return 'SKELETON';
        }
        if (isDetailNotFound) {
          return 'NOT_FOUND_SCREEN';
        }
        if (clientDetail) {
          return 'LIVE_PROFILE';
        }
        return 'NONE';
      };

      // Frame 1: User clicks client. Parent probe in flight, invoices in flight
      expect(evaluateDrawer(true, false, undefined, true, undefined)).toBe('SKELETON');

      // Frame 2: Parent client detail emitted, but invoices still executing in SQLite/WASM
      // Critical invariant: SKELETON must hold! Must NOT prematurely drop to live view with 0 balance!
      expect(evaluateDrawer(false, false, { id: CLIENT_101, name: 'Acme Corp' }, true, undefined)).toBe('SKELETON');

      // Frame 3: Invoices query finished and emitted real records
      expect(
        evaluateDrawer(
          false,
          false,
          { id: CLIENT_101, name: 'Acme Corp' },
          false,
          [{ id: 'inv-1', balanceDueMinor: 5000, currency: 'USD', displayStatus: 'sent' }]
        )
      ).toBe('LIVE_PROFILE');

      // Frame 4: Confirmed 404 takes precedence over loading
      expect(evaluateDrawer(false, true, undefined, false, undefined)).toBe('NOT_FOUND_SCREEN');
    });

    it('Balance Section Guard: never renders "Settled — No Outstanding Balance" while invoices are in-flight', async () => {
      // Balance section evaluation simulation from src/app/clients/page.tsx:
      const evaluateBalanceSection = (
        isInvoicesLoading: boolean,
        clientInvoices: any[] | undefined,
        financialSummary: { outstandingMinor: number }[]
      ) => {
        if (isInvoicesLoading || !clientInvoices) {
          return 'BALANCE_SKELETON';
        }
        const activeBalances = financialSummary.filter((s) => s.outstandingMinor > 0);
        if (activeBalances.length > 0) {
          return 'ACTIVE_OUTSTANDING_BALANCE';
        }
        return 'SETTLED_NO_OUTSTANDING_BALANCE';
      };

      // In-flight state: invoices are loading or undefined
      expect(evaluateBalanceSection(true, undefined, [])).toBe('BALANCE_SKELETON');
      expect(evaluateBalanceSection(false, undefined, [])).toBe('BALANCE_SKELETON');

      // Invoices loaded: with active outstanding balance
      expect(evaluateBalanceSection(false, [{ id: 'inv-1' }], [{ outstandingMinor: 5000 }])).toBe(
        'ACTIVE_OUTSTANDING_BALANCE'
      );

      // Invoices loaded: confirmed genuine 0 outstanding balance
      expect(evaluateBalanceSection(false, [], [])).toBe('SETTLED_NO_OUTSTANDING_BALANCE');
      expect(evaluateBalanceSection(false, [{ id: 'inv-1' }], [{ outstandingMinor: 0 }])).toBe(
        'SETTLED_NO_OUTSTANDING_BALANCE'
      );
    });
  });
});
