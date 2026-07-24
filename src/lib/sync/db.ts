import { PowerSyncDatabase } from '@powersync/web';
import { AppSchema } from './schema';

// Lazy client-side instantiation to prevent Server-Side Rendering (SSR) compilation errors
export const db = typeof window !== 'undefined'
  ? new PowerSyncDatabase({
      schema: AppSchema,
      database: {
        dbFilename: 'clario.db'
      }
    })
  : (null as unknown as PowerSyncDatabase);
