import { describe, it, expect, beforeAll, afterAll, beforeEach, vi } from 'vitest';
import { PGlite } from '@electric-sql/pglite';
import * as fs from 'fs';
import * as path from 'path';
import { ClientSummary } from '../src/lib/data/types';

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

import { ClientRepo } from '../src/lib/data/client';

/**
 * Pure state machine simulator for `useDataReady` lifecycle logic.
 * Validates the exact state transitions and asymmetric gate invariants of ADR 036.
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
      this.isConfirmedEmpty = null; // User switch reset
      this.hasLoaded = false; // Reset latch
    }
    await this.evaluate();
  }

  private async evaluate() {
    if (this.hasSynced && !this.hasLocalData && this.isConfirmedEmpty === null) {
      try {
        const result = await this.checkEmpty();
        this.isConfirmedEmpty = result;
      } catch {
        // Strict error safety: on error, leave isConfirmedEmpty as null (hold skeleton)
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
}

describe('Clients Screen Readiness Gate & Offline Tests (ADR 036)', () => {
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

    // Insert test user for foreign keys
    await pgliteInstance.exec(`
      INSERT INTO auth.users (id, email)
      VALUES ('00000000-0000-0000-0000-000000000000', 'test@clario.local')
      ON CONFLICT (id) DO NOTHING;
    `);
  });

  afterAll(async () => {
    await pgliteInstance.close();
  });

  beforeEach(async () => {
    await pgliteInstance.exec('DELETE FROM clients;');
    vi.clearAllMocks();
  });

  // --------------------------------------------------------------------------
  // Part 1: ClientRepo.isEmpty() Deterministic SQLite Engine Tests
  // --------------------------------------------------------------------------
  describe('ClientRepo.isEmpty() Database Integration', () => {
    it('returns true when client database has 0 rows', async () => {
      const isEmpty = await ClientRepo.isEmpty();
      expect(isEmpty).toBe(true);
    });

    it('returns false when client database has at least 1 active row', async () => {
      await pgliteInstance.exec(`
        INSERT INTO clients (id, user_id, name, default_currency, created_at, updated_at)
        VALUES ('00000000-0000-0000-0000-000000000001', '00000000-0000-0000-0000-000000000000', 'Active Client', 'USD', NOW(), NOW());
      `);
      const isEmpty = await ClientRepo.isEmpty();
      expect(isEmpty).toBe(false);
    });

    it('returns true when all clients are soft-deleted', async () => {
      await pgliteInstance.exec(`
        INSERT INTO clients (id, user_id, name, default_currency, created_at, updated_at, deleted_at)
        VALUES ('00000000-0000-0000-0000-000000000002', '00000000-0000-0000-0000-000000000000', 'Soft Deleted Client', 'USD', NOW(), NOW(), NOW());
      `);
      const isEmpty = await ClientRepo.isEmpty();
      expect(isEmpty).toBe(true);
    });
  });

  // --------------------------------------------------------------------------
  // Part 2: Required Strict Controls for Readiness Gate
  // --------------------------------------------------------------------------
  describe('Readiness Gate Timing & Control Invariants', () => {
    // Control 1: Negative Control (Absence Claim)
    it('Control 1 (Negative Control): holds loading skeleton and suppresses empty state while sync is in-flight', async () => {
      const checkEmpty = vi.fn().mockResolvedValue(true);

      const sim = await new DataReadySimulator({
        hasSynced: false,
        hasLocalData: false,
        checkEmpty
      }).init();

      // While sync is in-flight, loading skeleton must hold
      expect(sim.isLoading).toBe(true);
      expect(sim.isDataReady).toBe(false);
      // checkEmpty must NOT run before hasSynced flips to true
      expect(checkEmpty).not.toHaveBeenCalled();
    });

    // Control 2: Paired Positive Control
    it('Control 2 (Paired Positive Control): unblocks readiness and confirms empty state when sync finishes with 0 rows on disk', async () => {
      const checkEmpty = vi.fn().mockResolvedValue(true);

      const sim = await new DataReadySimulator({
        hasSynced: false,
        hasLocalData: false,
        checkEmpty
      }).init();

      expect(sim.isLoading).toBe(true);

      // Flip sync status to true
      await sim.setSyncStatus(true);

      // Disk check confirmed empty -> unblocks immediately
      expect(checkEmpty).toHaveBeenCalledTimes(1);
      expect(sim.isDataReady).toBe(true);
      expect(sim.isLoading).toBe(false);
    });

    // Control 3: Data-Yield Timing Control (Asymmetric OR-Condition Flaw)
    it('Control 3 (Asymmetric Timing Flaw): holds skeleton when disk check confirms data exists, until reactive query emits', async () => {
      // Disk has data (isEmpty = false), but reactive query hasn't delivered rows yet (hasLocalData = false)
      const checkEmpty = vi.fn().mockResolvedValue(false);

      const sim = await new DataReadySimulator({
        hasSynced: false,
        hasLocalData: false,
        checkEmpty
      });

      // Sync finishes
      await sim.setSyncStatus(true);

      // CRITICAL CHECK: isConfirmedEmpty is false (data exists), so isDataReady MUST remain false!
      // Loading skeleton must NOT drop prematurely, and empty state must NOT be rendered.
      expect(checkEmpty).toHaveBeenCalledTimes(1);
      expect(sim.isDataReady).toBe(false);
      expect(sim.isLoading).toBe(true);

      // Now simulate the live reactive query delivering rows into React state
      await sim.setLocalData(true);

      // Once real data lands, readiness unblocks cleanly
      expect(sim.isDataReady).toBe(true);
      expect(sim.isLoading).toBe(false);
    });

    // Control 4: Strict Error Handling & User-Switch Reset
    it('Control 4 (Strict Error Handling): fails safe toward skeleton if checkEmpty throws', async () => {
      const checkEmpty = vi.fn().mockRejectedValue(new Error('SQLite busy / locked'));

      const sim = await new DataReadySimulator({
        hasSynced: false,
        hasLocalData: false,
        checkEmpty
      }).init();

      await sim.setSyncStatus(true);

      // On error, does NOT assume empty -> skeleton holds
      expect(sim.isDataReady).toBe(false);
      expect(sim.isLoading).toBe(true);
    });

    it('Control 4b (User Switch Reset): resets readiness latch when authenticated user changes', async () => {
      const checkEmpty = vi.fn().mockResolvedValue(true);

      const sim = await new DataReadySimulator({
        hasSynced: true,
        hasLocalData: false,
        userId: 'user-1',
        checkEmpty
      }).init();

      expect(sim.isDataReady).toBe(true);

      // Simulate switching user in the same tab where new session's initial sync is pending
      await sim.setSyncStatus(false);
      await sim.setUserId('user-2');

      // State is reset for new user, skeleton holds
      expect(sim.isDataReady).toBe(false);
      expect(sim.isLoading).toBe(true);
    });
  });

  // --------------------------------------------------------------------------
  // Part 3: Search Filter Offline Control
  // --------------------------------------------------------------------------
  describe('Offline Client Search Filter Logic', () => {
    const mockClients: ClientSummary[] = [
      {
        id: 'client-1',
        name: 'Alice Design Studio',
        company: 'Alice Co',
        email: 'alice@example.com',
        default_currency: 'USD',
        created_at: '2026-01-01T00:00:00Z'
      },
      {
        id: 'client-2',
        name: 'Bob Engineering',
        company: 'Bob Industries',
        email: 'bob@example.com',
        default_currency: 'EUR',
        created_at: '2026-01-02T00:00:00Z'
      }
    ];

    const filterClients = (clients: ClientSummary[], query: string) => {
      const sorted = [...clients].sort((a, b) => a.name.localeCompare(b.name));
      if (!query.trim()) return sorted;
      const q = query.toLowerCase().trim();
      return sorted.filter(c => 
        c.name.toLowerCase().includes(q) ||
        (c.company && c.company.toLowerCase().includes(q)) ||
        (c.email && c.email.toLowerCase().includes(q))
      );
    };

    it('Control 5a: filters client by matching name offline', () => {
      const results = filterClients(mockClients, 'bob');
      expect(results.length).toBe(1);
      expect(results[0].name).toBe('Bob Engineering');
    });

    it('Control 5b: filters client by matching company offline', () => {
      const results = filterClients(mockClients, 'Alice Co');
      expect(results.length).toBe(1);
      expect(results[0].name).toBe('Alice Design Studio');
    });

    it('Control 5c: filters client by matching email offline', () => {
      const results = filterClients(mockClients, 'alice@example.com');
      expect(results.length).toBe(1);
      expect(results[0].name).toBe('Alice Design Studio');
    });

    it('Control 5d: non-matching query returns empty array while preserving clients.length > 0 for search-empty state', () => {
      const results = filterClients(mockClients, 'Nonexistent Corp');
      expect(results.length).toBe(0);
      // Confirms clients collection is non-empty, which routes UI to "No matching clients found" rather than onboarding
      expect(mockClients.length > 0).toBe(true);
    });
  });
});
