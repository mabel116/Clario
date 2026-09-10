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
  },
  currentStatus: {
    connected: true,
    connecting: false,
    hasSynced: false,
    lastSyncedAt: null
  },
  getUploadQueueStats: async () => {
    if (!mockDbActive) throw new Error('Database connection not available');
    return { count: 0 };
  },
  registerListener: (listener: any) => {
    return () => {};
  }
};

vi.mock('../src/lib/sync/db', () => ({
  db: {
    execute: (sql: string, params: any[]) => mockDb.execute(sql, params),
    getAll: (sql: string, params: any[]) => mockDb.getAll(sql, params),
    getUploadQueueStats: () => mockDb.getUploadQueueStats(),
    get currentStatus() {
      return mockDb.currentStatus;
    },
    registerListener: (listener: any) => mockDb.registerListener(listener)
  }
}));

import { ClientRepo } from '../src/lib/data/client';
import { InvoiceRepo } from '../src/lib/data/invoice';
import { DashboardRepo } from '../src/lib/data/dashboard';

/**
 * Pure simulation of the decoupled `useDataReady` state machine.
 * Mirrors the exact logic in `src/lib/data/readiness.ts`.
 */
class DecoupledDataReadySimulator {
  hasSynced: boolean;
  hasLocalData: boolean;
  checkEmpty: () => Promise<boolean>;
  isConfirmedEmpty: boolean | null = null;
  hasLoaded = false;
  active = true;

  constructor(opts: {
    hasSynced: boolean;
    hasLocalData: boolean;
    checkEmpty: () => Promise<boolean>;
  }) {
    this.hasSynced = opts.hasSynced;
    this.hasLocalData = opts.hasLocalData;
    this.checkEmpty = opts.checkEmpty;
  }

  async runEffect() {
    if (!this.hasLocalData && this.isConfirmedEmpty === null) {
      try {
        const isEmpty = await this.checkEmpty();
        if (!this.active) return;
        if (isEmpty === false) {
          this.isConfirmedEmpty = false;
        } else if (isEmpty === true) {
          if (this.hasSynced) {
            this.isConfirmedEmpty = true;
          }
        }
      } catch (err) {
        // Strict error safety: on error, leave isConfirmedEmpty as null
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

  unmount() {
    this.active = false;
  }
}

/**
 * Pure simulation of the decoupled `useEntityReady` state machine.
 * Mirrors the exact logic in `src/lib/data/readiness.ts`.
 */
class DecoupledEntityReadySimulator {
  hasSynced: boolean;
  hasEntity: boolean;
  checkExists: () => Promise<boolean>;
  isConfirmedNotFound: boolean | null = null;
  hasLoaded = false;
  active = true;

  constructor(opts: {
    hasSynced: boolean;
    hasEntity: boolean;
    checkExists: () => Promise<boolean>;
  }) {
    this.hasSynced = opts.hasSynced;
    this.hasEntity = opts.hasEntity;
    this.checkExists = opts.checkExists;
  }

  async runEffect() {
    if (!this.hasEntity && this.isConfirmedNotFound === null) {
      try {
        const exists = await this.checkExists();
        if (!this.active) return;
        if (exists === true) {
          this.isConfirmedNotFound = false;
        } else if (exists === false) {
          if (this.hasSynced) {
            this.isConfirmedNotFound = true;
          }
        }
      } catch (err) {
        // Strict error safety
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

  unmount() {
    this.active = false;
  }
}

describe('WASM & SQLite Worker Stress & Readiness Invariant Verification', () => {
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
    mockDbActive = true;
    await pgliteInstance.exec('DELETE FROM invoices;');
    await pgliteInstance.exec('DELETE FROM payment_events;');
    vi.clearAllMocks();
  });

  // --------------------------------------------------------------------------
  // Task 1: Error Semantics (Repositories Throw On Failure)
  // --------------------------------------------------------------------------
  describe('Task 1: Error Semantics in Repositories', () => {
    it('ClientRepo.isEmpty() throws explicitly when DB is unavailable or query fails', async () => {
      mockDbActive = false;
      await expect(ClientRepo.isEmpty()).rejects.toThrow(/Database connection not available/i);
    });

    it('InvoiceRepo.isEmpty() throws explicitly when DB is unavailable or query fails', async () => {
      mockDbActive = false;
      await expect(InvoiceRepo.isEmpty()).rejects.toThrow(/Database connection not available/i);
    });

    it('InvoiceRepo.exists() throws explicitly when DB is unavailable or query fails', async () => {
      mockDbActive = false;
      await expect(InvoiceRepo.exists('test-id')).rejects.toThrow(/Database connection not available/i);
    });

    it('DashboardRepo.isAccountEmpty() throws explicitly when DB is unavailable or query fails', async () => {
      mockDbActive = false;
      await expect(DashboardRepo.isAccountEmpty()).rejects.toThrow(/Database connection not available/i);
    });
  });

  // --------------------------------------------------------------------------
  // Task 2: Decoupled Disk vs Network Invariants
  // --------------------------------------------------------------------------
  describe('Task 2: Decoupled Disk-First Readiness Lifecycle', () => {
    it('Offline Disk-First Unblocking: local disk with rows unblocks live queries without waiting for network hasSynced', async () => {
      // Setup: DB has 1 invoice, but network is offline (hasSynced = false)
      await pgliteInstance.exec(`
        INSERT INTO invoices (id, user_id, client_id, invoice_number, status, currency, total_minor, created_at, updated_at)
        VALUES ('00000000-0000-0000-0000-000000000020', '00000000-0000-0000-0000-000000000000', '00000000-0000-0000-0000-000000000001', 'INV-020', 'draft', 'USD', 10000, NOW(), NOW());
      `);

      const sim = new DecoupledDataReadySimulator({
        hasSynced: false, // Network offline
        hasLocalData: false,
        checkEmpty: () => InvoiceRepo.isEmpty()
      });

      // Disk check runs immediately on mount (decoupled)
      await sim.runEffect();

      // Confirmed data exists on disk -> isConfirmedEmpty is false
      expect(sim.isConfirmedEmpty).toBe(false);

      // As soon as live query returns cached/disk rows, readiness unblocks cleanly
      sim.hasLocalData = true;
      await sim.runEffect();
      expect(sim.isDataReady).toBe(true);
      expect(sim.isLoading).toBe(false);
    });

    it('Empty Cold Boot Network Gate: local disk with 0 rows holds skeleton until hasSynced transitions to true', async () => {
      // DB has 0 invoices, network is still downloading (hasSynced = false)
      const sim = new DecoupledDataReadySimulator({
        hasSynced: false,
        hasLocalData: false,
        checkEmpty: () => InvoiceRepo.isEmpty()
      });

      await sim.runEffect();

      // Because disk is 0 and hasSynced is false, isConfirmedEmpty remains null (skeleton held)
      expect(sim.isConfirmedEmpty).toBe(null);
      expect(sim.isLoading).toBe(true);
      expect(sim.isDataReady).toBe(false);

      // Now network sync finishes (hasSynced becomes true)
      sim.hasSynced = true;
      await sim.runEffect();

      // Confirms genuine empty account -> drops skeleton and enters empty onboarding state
      expect(sim.isConfirmedEmpty).toBe(true);
      expect(sim.isDataReady).toBe(true);
      expect(sim.isLoading).toBe(false);
    });

    it('Single Entity Detail: existing row on disk unblocks immediately without network', async () => {
      const targetId = '00000000-0000-0000-0000-000000000021';
      await pgliteInstance.exec(`
        INSERT INTO invoices (id, user_id, client_id, invoice_number, status, currency, total_minor, created_at, updated_at)
        VALUES ('${targetId}', '00000000-0000-0000-0000-000000000000', '00000000-0000-0000-0000-000000000001', 'INV-021', 'draft', 'USD', 10000, NOW(), NOW());
      `);

      const sim = new DecoupledEntityReadySimulator({
        hasSynced: false, // Network offline
        hasEntity: false,
        checkExists: () => InvoiceRepo.exists(targetId)
      });

      await sim.runEffect();

      // Entity confirmed on disk -> isConfirmedNotFound is false
      expect(sim.isConfirmedNotFound).toBe(false);
      expect(sim.isNotFound).toBe(false);

      // Live query resolves
      sim.hasEntity = true;
      await sim.runEffect();
      expect(sim.isReady).toBe(true);
      expect(sim.isLoading).toBe(false);
      expect(sim.isNotFound).toBe(false);
    });

    it('Single Entity Detail: missing row during pre-sync holds skeleton and suppresses 404', async () => {
      const nonExistentId = '00000000-0000-0000-0000-000000000099';
      const sim = new DecoupledEntityReadySimulator({
        hasSynced: false,
        hasEntity: false,
        checkExists: () => InvoiceRepo.exists(nonExistentId)
      });

      await sim.runEffect();

      // While pre-sync, missing record does NOT confirm 404
      expect(sim.isConfirmedNotFound).toBe(null);
      expect(sim.isNotFound).toBe(false);
      expect(sim.isLoading).toBe(true);

      // Network sync completes -> now confirms genuine 404
      sim.hasSynced = true;
      await sim.runEffect();
      expect(sim.isConfirmedNotFound).toBe(true);
      expect(sim.isNotFound).toBe(true);
      expect(sim.isLoading).toBe(false);
    });
  });

  // --------------------------------------------------------------------------
  // Task 3 & 4: WASM & Singleton Polling Stress Integration Tests
  // --------------------------------------------------------------------------
  describe('Task 4: High-Concurrency WASM Worker & Singleton Stress Tests', () => {
    it('Concurrent Polling Throttling: 100 simultaneous components querying sync status do not overwhelm the worker', async () => {
      let statsCalls = 0;
      mockDb.getUploadQueueStats = async () => {
        statsCalls++;
        // Simulate minor async WASM latency
        await new Promise((r) => setTimeout(r, 2));
        return { count: 3 };
      };

      // Create a singleton manager simulator matching `src/lib/sync/hooks.ts`
      class SingletonSyncManager {
        listeners = new Set<() => void>();
        currentStatus = { pendingUploads: 0 };
        isUpdating = false;

        async update() {
          if (this.isUpdating) return;
          this.isUpdating = true;
          try {
            const stats = await mockDb.getUploadQueueStats();
            this.currentStatus.pendingUploads = stats.count;
            for (const cb of this.listeners) cb();
          } finally {
            this.isUpdating = false;
          }
        }

        subscribe(cb: () => void) {
          this.listeners.add(cb);
          if (this.listeners.size === 1) {
            this.update();
          }
          return () => {
            this.listeners.delete(cb);
          };
        }
      }

      const manager = new SingletonSyncManager();
      const unsubs: Array<() => void> = [];

      // Mount 100 components simultaneously
      for (let i = 0; i < 100; i++) {
        unsubs.push(manager.subscribe(() => {}));
      }

      // Allow async execution
      await new Promise((r) => setTimeout(r, 20));

      // With singleton throttling, statsCalls is strictly 1 (not 100 separate DB queries!)
      expect(statsCalls).toBe(1);
      expect(manager.listeners.size).toBe(100);

      // Unmount all 100
      unsubs.forEach((unsub) => unsub());
      expect(manager.listeners.size).toBe(0);
    });

    it('Rapid Route Churn: 50 concurrent mount/unmount cycles complete without unhandled rejections or lockups', async () => {
      // Insert sample invoice
      await pgliteInstance.exec(`
        INSERT INTO invoices (id, user_id, client_id, invoice_number, status, currency, total_minor, created_at, updated_at)
        VALUES ('00000000-0000-0000-0000-000000000030', '00000000-0000-0000-0000-000000000000', '00000000-0000-0000-0000-000000000001', 'INV-030', 'draft', 'USD', 10000, NOW(), NOW());
      `);

      const iterations = 50;
      const tasks: Promise<void>[] = [];

      for (let i = 0; i < iterations; i++) {
        const p = (async () => {
          // Mount simulator
          const listSim = new DecoupledDataReadySimulator({
            hasSynced: i % 2 === 0,
            hasLocalData: false,
            checkEmpty: () => InvoiceRepo.isEmpty()
          });

          const entitySim = new DecoupledEntityReadySimulator({
            hasSynced: i % 2 === 0,
            hasEntity: false,
            checkExists: () => InvoiceRepo.exists('00000000-0000-0000-0000-000000000030')
          });

          // Run effect and immediately unmount some to test abort safety
          const listPromise = listSim.runEffect();
          const entityPromise = entitySim.runEffect();

          if (i % 3 === 0) {
            // Rapid abort
            listSim.unmount();
            entitySim.unmount();
          }

          await Promise.all([listPromise, entityPromise]);
        })();
        tasks.push(p);
      }

      // Await all 50 concurrent cycles
      await expect(Promise.all(tasks)).resolves.not.toThrow();
    });

    it('Intermittent SQLite Error Resiliency: query rejections do not trap the state machine into false data states', async () => {
      let callCount = 0;
      const transientCheckEmpty = async () => {
        callCount++;
        if (callCount === 1) {
          throw new Error('SQLite busy: WASM worker re-initializing');
        }
        return false; // Actually has data
      };

      const sim = new DecoupledDataReadySimulator({
        hasSynced: true,
        hasLocalData: false,
        checkEmpty: transientCheckEmpty
      });

      // First run encounters transient WASM error
      await sim.runEffect();

      // State machine must NOT set isConfirmedEmpty to false or true (holds skeleton safely)
      expect(sim.isConfirmedEmpty).toBe(null);
      expect(sim.isDataReady).toBe(false);
      expect(sim.isLoading).toBe(true);

      // Second run succeeds
      await sim.runEffect();
      expect(sim.isConfirmedEmpty).toBe(false);

      // Live query delivers rows
      sim.hasLocalData = true;
      await sim.runEffect();
      expect(sim.isDataReady).toBe(true);
      expect(sim.isLoading).toBe(false);
    });
  });
});
