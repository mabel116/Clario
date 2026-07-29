import { db } from '../sync/db';
import { getAuthUserId } from '../auth/client';
import { createLiveQuery, LiveQuery, ValidationError, isTest } from './types';
import { ClientLinkRow } from '../sync/schema';

function validateUrl(url: string): void {
  if (!url || !url.trim()) {
    throw new ValidationError('URL is required');
  }
  try {
    const parsed = new URL(url.trim());
    if (parsed.protocol !== 'http:' && parsed.protocol !== 'https:') {
      throw new ValidationError('URL must be an absolute http:// or https:// URL');
    }
  } catch (err) {
    throw new ValidationError('Invalid absolute URL format');
  }
}

export const ClientLinkRepo = {
  listForClient(clientId: string): LiveQuery<ClientLinkRow[]> {
    return createLiveQuery<any, ClientLinkRow[]>(
      `SELECT id, user_id, client_id, label, url, created_at, updated_at, deleted_at
       FROM client_links
       WHERE client_id = ? AND deleted_at IS NULL
       ORDER BY created_at DESC`,
      [clientId],
      (rows) => rows
    );
  },

  async add(clientId: string, label: string, url: string): Promise<string> {
    if ((typeof window === 'undefined' && !isTest) || !db) {
      throw new Error('Database connection not available');
    }

    if (!label || !label.trim()) {
      throw new ValidationError('Label is required');
    }

    validateUrl(url);

    // Get current authenticated user
    const userId = await getAuthUserId();
    if (!userId) {
      throw new Error('User must be authenticated to add links');
    }

    const uuid = crypto.randomUUID();
    const now = new Date().toISOString();

    await db.execute(
      `INSERT INTO client_links (id, user_id, client_id, label, url, created_at, updated_at)
       VALUES (?, ?, ?, ?, ?, ?, ?)`,
      [
        uuid,
        userId,
        clientId,
        label.trim(),
        url.trim(),
        now,
        now
      ]
    );

    return uuid;
  },

  async update(id: string, patch: { label?: string; url?: string }): Promise<void> {
    if ((typeof window === 'undefined' && !isTest) || !db) {
      throw new Error('Database connection not available');
    }

    const fields: string[] = [];
    const params: any[] = [];

    if (patch.label !== undefined) {
      if (!patch.label || !patch.label.trim()) {
        throw new ValidationError('Label cannot be empty');
      }
      fields.push('label = ?');
      params.push(patch.label.trim());
    }

    if (patch.url !== undefined) {
      validateUrl(patch.url);
      fields.push('url = ?');
      params.push(patch.url.trim());
    }

    if (fields.length === 0) return;

    const now = new Date().toISOString();
    fields.push('updated_at = ?');
    params.push(now);

    params.push(id);

    await db.execute(
      `UPDATE client_links SET ${fields.join(', ')} WHERE id = ?`,
      params
    );
  },

  async softDelete(id: string): Promise<void> {
    if ((typeof window === 'undefined' && !isTest) || !db) {
      throw new Error('Database connection not available');
    }

    const now = new Date().toISOString();
    await db.execute(
      `UPDATE client_links SET deleted_at = ?, updated_at = ? WHERE id = ?`,
      [now, now, id]
    );
  }
};
