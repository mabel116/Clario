import { PowerSyncBackendConnector, CrudTransaction } from '@powersync/web';
import { supabase } from '../supabase';

export class SupabaseConnector implements PowerSyncBackendConnector {
  constructor() {}

  // Returns credentials for client sync authentication
  async fetchCredentials() {
    const { data, error } = await supabase.auth.getSession();
    if (error || !data.session) {
      // Return null rather than throw when there's no active session
      return null;
    }
    return {
      endpoint: process.env.NEXT_PUBLIC_POWERSYNC_URL || '',
      token: data.session.access_token
    };
  }

  // Translates local offline mutations into remote Supabase database writes
  /* eslint-disable-next-line @typescript-eslint/no-explicit-any */
  async uploadData(database: any): Promise<void> {
    console.log('[DIAGNOSTIC] uploadData invoked!');
    const transaction: CrudTransaction = await database.getNextUploadTransaction();
    if (!transaction) {
      console.log('[DIAGNOSTIC] uploadData: no transactions returned from getNextUploadTransaction');
      return;
    }

    try {
      for (const op of transaction.crud) {
        const table = op.table;
        const id = op.id;
        const row = op.opData;

        // Defensive constraint check: Reject PATCH and DELETE on payment_events
        if (table === 'payment_events') {
          if (op.op === 'PATCH' || op.op === 'DELETE') {
            throw new Error(`Modifications or deletions of ledger entries are forbidden on payment_events (ID: ${id})`);
          }
        }

        switch (op.op) {
          case 'PUT': {
            // Perform Supabase upsert
            const { error } = await supabase
              .from(table)
              .upsert({ id, ...row });
            if (error) throw error;
            break;
          }
          case 'PATCH': {
            // Perform Supabase update
            const { error } = await supabase
              .from(table)
              .update(row || {})
              .eq('id', id);
            if (error) throw error;
            break;
          }
          case 'DELETE': {
            // Executing hard delete if queued (soft deletes are PATCH ops setting deleted_at)
            const { error } = await supabase
              .from(table)
              .delete()
              .eq('id', id);
            if (error) throw error;
            break;
          }
        }
      }

      // Mark local transaction batch as successfully processed
      await transaction.complete();
    } catch (err: unknown) {
      const error = err as {
        status?: number;
        message?: string;
        code?: string;
      };
      console.error('PowerSync uploadData error:', error);

      // Determine error severity/permanence
      const isAuthError = error.status === 401 || error.message?.includes('JWT') || error.code === 'PGRST301';
      const isPermissionError = error.status === 403 || error.code === '42501'; // Postgres RLS block
      const isValidationError = error.status === 400 || error.code?.startsWith('23'); // Constraint check violations
      const isLedgerForbidden = error.message?.includes('ledger entries are forbidden');

      if (isAuthError || isPermissionError || isValidationError || isLedgerForbidden) {
        console.warn('Permanent error encountered. Completing transaction to clear sync queue deadlock.', error);
        
        // Complete the transaction anyway to drop the bad payload and prevent queue lockups
        await transaction.complete();

        // If it is an auth error, we can optionally sign out the user to trigger re-auth
        if (isAuthError) {
          supabase.auth.signOut();
        }
      } else {
        // Rethrow transient network / timeout errors to let PowerSync queue retry
        throw err;
      }
    }
  }
}
