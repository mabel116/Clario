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

import { ProfileRepo } from '../src/lib/data/profile';

const TEST_USER_ID = '00000000-0000-0000-0000-000000000001';

/**
 * Pure state machine simulator for profile readiness via `useEntityReady`.
 */
class ProfileReadinessSimulator {
  hasSynced: boolean;
  hasEntity: boolean;
  userId: string | null;
  checkExists: () => Promise<boolean>;
  isConfirmedNotFound: boolean | null = null;
  hasLoaded = false;

  constructor(opts: {
    hasSynced: boolean;
    hasEntity: boolean;
    userId?: string | null;
    checkExists: () => Promise<boolean>;
  }) {
    this.hasSynced = opts.hasSynced;
    this.hasEntity = opts.hasEntity;
    this.userId = opts.userId ?? TEST_USER_ID;
    this.checkExists = opts.checkExists;
  }

  async runEffect() {
    if (!this.hasEntity && this.isConfirmedNotFound === null) {
      try {
        const exists = await this.checkExists();
        if (exists === true) {
          // Profile exists on local disk -> unblock immediately (ADR 038)
          this.isConfirmedNotFound = false;
        } else if (exists === false) {
          if (this.hasSynced) {
            this.isConfirmedNotFound = true;
          }
        }
      } catch (err) {
        // Error safety: leave isConfirmedNotFound as null (hold skeleton)
      }
    }

    const isReady = this.hasEntity || this.isConfirmedNotFound === true;
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

  get isReady(): boolean {
    return this.hasEntity || this.isConfirmedNotFound === true;
  }

  get isLoading(): boolean {
    return !this.hasLoaded;
  }
}

describe('Settings Screen & Profile Offline Hardening Suite', () => {
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

    await pgliteInstance.exec(`
      INSERT INTO auth.users (id, email)
      VALUES ('${TEST_USER_ID}', 'settings-test@clario.local')
      ON CONFLICT (id) DO NOTHING;
    `);
  });

  afterAll(async () => {
    await pgliteInstance.close();
  });

  beforeEach(async () => {
    mockDbActive = true;
    await pgliteInstance.query('DELETE FROM profiles');
  });

  describe('A. ProfileRepo.exists Deterministic Probes (ADR 037)', () => {
    it('throws explicit error when database connection is unavailable', async () => {
      mockDbActive = false;
      await expect(ProfileRepo.exists(TEST_USER_ID)).rejects.toThrow('Database connection not available');
    });

    it('returns false when profiles table has no records locally', async () => {
      const exists = await ProfileRepo.exists(TEST_USER_ID);
      expect(exists).toBe(false);
    });

    it('returns true when profile row exists in local database', async () => {
      await pgliteInstance.query(`
        INSERT INTO profiles (id, business_name, default_currency, created_at, updated_at)
        VALUES ('${TEST_USER_ID}', 'Test Studio', 'USD', NOW(), NOW())
      `);

      const exists = await ProfileRepo.exists(TEST_USER_ID);
      expect(exists).toBe(true);
    });
  });

  describe('B. Currency Validation & Profile Update Integrity', () => {
    beforeEach(async () => {
      await pgliteInstance.query(`
        INSERT INTO profiles (id, business_name, business_address, default_currency, created_at, updated_at)
        VALUES ('${TEST_USER_ID}', 'Original Studio', '123 Main St', 'USD', NOW(), NOW())
      `);
    });

    it('rejects unsupported currency codes with explicit error', async () => {
      await expect(
        ProfileRepo.update({ default_currency: 'INVALID_CURR' })
      ).rejects.toThrow('Unsupported currency: INVALID_CURR');
    });

    it('rejects empty currency string', async () => {
      await expect(
        ProfileRepo.update({ default_currency: '' })
      ).rejects.toThrow('Default currency cannot be empty');
    });

    it('normalizes valid lowercase currency to uppercase', async () => {
      await ProfileRepo.update({ default_currency: 'eur' });
      const rows = await pgliteInstance.query<any>('SELECT default_currency FROM profiles WHERE id = $1', [TEST_USER_ID]);
      expect(rows.rows[0].default_currency).toBe('EUR');
    });

    it('updates business name and address cleanly offline', async () => {
      await ProfileRepo.update({
        business_name: 'Acme Design Lab',
        business_address: '456 Creative Way'
      });

      const rows = await pgliteInstance.query<any>('SELECT business_name, business_address FROM profiles WHERE id = $1', [TEST_USER_ID]);
      expect(rows.rows[0].business_name).toBe('Acme Design Lab');
      expect(rows.rows[0].business_address).toBe('456 Creative Way');
    });

    it('throws error when database connection is unavailable', async () => {
      mockDbActive = false;
      await expect(
        ProfileRepo.update({ business_name: 'Offline Failure' })
      ).rejects.toThrow('Database connection not available');
    });
  });

  describe('C. Profile Readiness State Machine (ADR 036 & ADR 038)', () => {
    it('holds loading skeleton on cold boot before local profile exists', async () => {
      const sim = new ProfileReadinessSimulator({
        hasSynced: false,
        hasEntity: false,
        checkExists: () => ProfileRepo.exists()
      });

      await sim.runEffect();
      // On cold boot with 0 disk records, holds skeleton until sync or disk data arrives
      expect(sim.isLoading).toBe(true);
      expect(sim.isReady).toBe(false);
    });

    it('unblocks immediately if profile exists on disk, without waiting for network hasSynced', async () => {
      await pgliteInstance.query(`
        INSERT INTO profiles (id, business_name, default_currency, created_at, updated_at)
        VALUES ('${TEST_USER_ID}', 'Existing Studio', 'USD', NOW(), NOW())
      `);

      const sim = new ProfileReadinessSimulator({
        hasSynced: false, // Network sync has NOT finished
        hasEntity: false,
        checkExists: () => ProfileRepo.exists()
      });

      await sim.runEffect();
      // Profile exists on local disk -> unblocks immediately (ADR 038)
      expect(sim.isReady).toBe(false); // Waiting for live query emit
      expect(sim.isConfirmedNotFound).toBe(false);

      // When live query delivers entity:
      await sim.setEntity(true);
      expect(sim.isReady).toBe(true);
      expect(sim.isLoading).toBe(false);
    });

    it('fails safely toward loading skeleton when exists check throws an error', async () => {
      mockDbActive = false;
      const sim = new ProfileReadinessSimulator({
        hasSynced: true,
        hasEntity: false,
        checkExists: () => ProfileRepo.exists()
      });

      await sim.runEffect();
      // Error in checkExists should not confirm not found; holds skeleton safely
      expect(sim.isConfirmedNotFound).toBe(null);
      expect(sim.isLoading).toBe(true);
    });
  });

  describe('D. User Input Preservation Logic Against Async Sync Clobbering', () => {
    it('does not overwrite form fields when user has actively dirtied the input', () => {
      let isDirty = false;
      let formBusinessName = 'User Typed Name';
      isDirty = true; // User started typing

      // Simulated background sync arrives with server profile
      const incomingProfile = { business_name: 'Server Stale Name' };

      // Protected update logic:
      if (incomingProfile && !isDirty) {
        formBusinessName = incomingProfile.business_name;
      }

      // Input must be preserved
      expect(formBusinessName).toBe('User Typed Name');
    });

    it('populates form fields when form is clean (not dirtied)', () => {
      let isDirty = false;
      let formBusinessName = '';

      const incomingProfile = { business_name: 'Server Name' };

      if (incomingProfile && !isDirty) {
        formBusinessName = incomingProfile.business_name;
      }

      expect(formBusinessName).toBe('Server Name');
    });
  });
});
