import { CurrencyOutstanding, CurrencyTotal, PaymentWithContext, InvoiceSummary } from './types';

export interface DashboardSnapshot {
  userId: string;
  periodDays: number;
  timestamp: number;
  defaultCurrency: string;
  outstanding: CurrencyOutstanding[];
  earnings: CurrencyTotal[];
  recentPayments: PaymentWithContext[];
  invoices: InvoiceSummary[];
  needsAttentionCount: number;
  currencies: string[];
}

const DB_NAME = 'clario_cache';
const DB_VERSION = 1;
const STORE_NAME = 'dashboard_snapshots';

function openDatabase(): Promise<IDBDatabase> {
  return new Promise((resolve, reject) => {
    if (typeof window === 'undefined' || !window.indexedDB) {
      return reject(new Error('IndexedDB not supported'));
    }

    const request = window.indexedDB.open(DB_NAME, DB_VERSION);

    request.onupgradeneeded = (event) => {
      const db = (event.target as IDBOpenDBRequest).result;
      if (!db.objectStoreNames.contains(STORE_NAME)) {
        db.createObjectStore(STORE_NAME, { keyPath: 'key' });
      }
    };

    request.onsuccess = () => resolve(request.result);
    request.onerror = () => reject(request.error);
  });
}

function getSnapshotKey(userId: string, periodDays: number): string {
  return `${userId}_${periodDays}`;
}

export async function getDashboardSnapshot(
  userId: string,
  periodDays: number
): Promise<DashboardSnapshot | null> {
  try {
    if (typeof window === 'undefined' || !userId) return null;
    const db = await openDatabase();
    return await new Promise<DashboardSnapshot | null>((resolve) => {
      const tx = db.transaction(STORE_NAME, 'readonly');
      const store = tx.objectStore(STORE_NAME);
      const req = store.get(getSnapshotKey(userId, periodDays));
      req.onsuccess = () => {
        if (req.result && req.result.data) {
          resolve(req.result.data as DashboardSnapshot);
        } else {
          resolve(null);
        }
      };
      req.onerror = () => resolve(null);
    });
  } catch (err) {
    // Non-blocking silent fallback
    return null;
  }
}

export async function saveDashboardSnapshot(snapshot: DashboardSnapshot): Promise<void> {
  try {
    if (typeof window === 'undefined' || !snapshot.userId) return;
    const db = await openDatabase();
    await new Promise<void>((resolve) => {
      const tx = db.transaction(STORE_NAME, 'readwrite');
      const store = tx.objectStore(STORE_NAME);
      const req = store.put({
        key: getSnapshotKey(snapshot.userId, snapshot.periodDays),
        data: snapshot
      });
      req.onsuccess = () => resolve();
      req.onerror = () => resolve();
    });
  } catch (err) {
    // Non-blocking silent fallback
  }
}

export async function clearDashboardSnapshot(userId: string): Promise<void> {
  try {
    if (typeof window === 'undefined' || !userId) return;
    const db = await openDatabase();
    await new Promise<void>((resolve) => {
      const tx = db.transaction(STORE_NAME, 'readwrite');
      const store = tx.objectStore(STORE_NAME);
      const req = store.openCursor();
      req.onsuccess = (event) => {
        const cursor = (event.target as IDBRequest<IDBCursorWithValue>).result;
        if (cursor) {
          const key = cursor.key.toString();
          if (key.startsWith(`${userId}_`)) {
            cursor.delete();
          }
          cursor.continue();
        }
      };
      tx.oncomplete = () => resolve();
      tx.onerror = () => resolve();
    });
  } catch (err) {
    // Non-blocking silent fallback
  }
}
