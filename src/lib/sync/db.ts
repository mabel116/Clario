import { PowerSyncDatabase } from '@powersync/web';
import { createConsoleLogger, LogLevels } from '@powersync/common';
import { AppSchema } from './schema';

// Lazy client-side instantiation to prevent Server-Side Rendering (SSR) compilation errors
export const db = typeof window !== 'undefined'
  ? new PowerSyncDatabase({
      schema: AppSchema,
      database: {
        dbFilename: 'clario.db',
        worker: '/@powersync/worker.js'
      },
      sync: {
        worker: '/@powersync/worker.js',
        logLevel: LogLevels.trace
      },
      broadcastLogs: true,
      logger: createConsoleLogger({ prefix: 'PowerSync-SDK', minLevel: LogLevels.trace })
    })
  : (null as unknown as PowerSyncDatabase);

