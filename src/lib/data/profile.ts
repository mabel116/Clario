import { db } from '../sync/db';
import { createLiveQuery, LiveQuery, isTest } from './types';
import { ProfileRow } from '../sync/schema';
import { CURRENCIES } from '../money';

export const ProfileRepo = {
  async exists(_userId?: string): Promise<boolean> {
    if ((typeof window === 'undefined' && !isTest) || !db) {
      throw new Error('Database connection not available');
    }
    const result = await db.getAll('SELECT id FROM profiles LIMIT 1');
    return (result as any).length > 0;
  },

  get(): LiveQuery<ProfileRow | null> {
    return createLiveQuery<any, ProfileRow | null>(
      `SELECT id, business_name, business_address, default_currency, created_at, updated_at
       FROM profiles
       LIMIT 1`,
      [],
      (rows) => rows[0] || null
    );
  },

  async update(patch: { business_name?: string | null; business_address?: string | null; default_currency?: string }): Promise<void> {
    if ((typeof window === 'undefined' && !isTest) || !db) {
      throw new Error('Database connection not available');
    }

    const result = await db.getAll('SELECT id FROM profiles LIMIT 1');
    const profile = (result as any)[0];
    if (!profile) {
      throw new Error('Profile not found');
    }

    const fields: string[] = [];
    const params: any[] = [];

    if (patch.business_name !== undefined) {
      fields.push('business_name = ?');
      params.push(patch.business_name || null);
    }

    if (patch.business_address !== undefined) {
      fields.push('business_address = ?');
      params.push(patch.business_address || null);
    }

    if (patch.default_currency !== undefined) {
      const code = patch.default_currency?.trim().toUpperCase();
      if (!code) {
        throw new Error('Default currency cannot be empty');
      }
      if (!CURRENCIES[code]) {
        throw new Error(`Unsupported currency: ${patch.default_currency}`);
      }
      fields.push('default_currency = ?');
      params.push(code);
    }

    if (fields.length === 0) return;

    const now = new Date().toISOString();
    fields.push('updated_at = ?');
    params.push(now);

    params.push(profile.id);

    await db.execute(
      `UPDATE profiles SET ${fields.join(', ')} WHERE id = ?`,
      params
    );
  }
};
