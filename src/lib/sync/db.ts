import { PowerSyncDatabase } from '@powersync/web';
import { AppSchema } from './schema';

class ThrottledLogger {
  private lastLoggedError: string | null = null;
  private lastLoggedTime = 0;
  private repeatCount = 0;

  log(record: { level: number; message: string; error?: any }) {
    const isError = record.level >= 40; // warn or error
    if (isError && (record.error || record.message)) {
      const errMsg = String(record.error?.message || record.message || '');
      const isConnectionError = 
        errMsg.includes('Failed to fetch') || 
        errMsg.includes('NetworkError') || 
        errMsg.includes('connection') || 
        errMsg.includes('Load failed') ||
        errMsg.includes('fetch');
      
      if (isConnectionError) {
        const now = Date.now();
        // Log once every 30 seconds
        if (this.lastLoggedError === errMsg && now - this.lastLoggedTime < 30000) {
          this.repeatCount++;
          return; // Suppress repeat logs
        }
        if (this.repeatCount > 0) {
          console.warn(`[PowerSync] Still retrying sync stream connection (${this.repeatCount} duplicate logs suppressed)...`);
        }
        this.lastLoggedError = errMsg;
        this.lastLoggedTime = now;
        this.repeatCount = 0;
      }
    }
    
    // Default console log delegation based on level
    if (record.level >= 50) {
      console.error(`[PowerSync]`, record.message, record.error || '');
    } else if (record.level >= 40) {
      console.warn(`[PowerSync]`, record.message);
    } else if (record.level >= 30) {
      console.info(`[PowerSync]`, record.message);
    } else {
      console.debug(`[PowerSync]`, record.message);
    }
  }
}

// Lazy client-side instantiation to prevent Server-Side Rendering (SSR) compilation errors
export const db = typeof window !== 'undefined'
  ? new PowerSyncDatabase({
      schema: AppSchema,
      database: {
        dbFilename: 'clario.db',
        worker: '/@powersync/worker.js'
      },
      sync: {
        worker: '/@powersync/worker.js'
      },
      logger: new ThrottledLogger()
    })
  : (null as unknown as PowerSyncDatabase);
