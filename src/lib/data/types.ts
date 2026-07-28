import { db } from '../sync/db';
import {
  ClientRow,
  ClientLinkRow,
  InvoiceRow,
  InvoiceLineItemRow,
  PaymentEventRow,
  ProfileRow
} from '../sync/schema';

// Summary structures
export interface ClientSummary {
  id: string;
  name: string;
  email?: string | null;
  company?: string | null;
  default_currency?: string | null;
  created_at: string;
}

export interface ClientDetail extends ClientRow {
  outstandingBalances: { currency: string; amountMinor: number; overdueCount: number }[];
}

export interface InvoiceSummary {
  id: string;
  client_id: string;
  invoice_number: string;
  status: 'draft' | 'sent' | 'void';
  currency: string;
  total_minor: number;
  issue_date?: string | null;
  due_date?: string | null;
  displayStatus: 'draft' | 'void' | 'paid' | 'overdue' | 'sent';
  amountPaidMinor: number;
  balanceDueMinor: number;
  client_name?: string;
}

export interface InvoiceDetail extends InvoiceRow {
  lineItems: InvoiceLineItemRow[];
  displayStatus: 'draft' | 'void' | 'paid' | 'overdue' | 'sent';
  amountPaidMinor: number;
  balanceDueMinor: number;
  client_name?: string;
}

// Input models
export interface NewClient {
  name: string;
  email?: string | null;
  phone?: string | null;
  company?: string | null;
  notes?: string | null;
  default_currency?: string | null;
}

export interface ClientPatch {
  name?: string;
  email?: string | null;
  phone?: string | null;
  company?: string | null;
  notes?: string | null;
  default_currency?: string | null;
}

export interface NewInvoice {
  client_id: string;
  currency: string;
  invoice_number?: string;
  notes?: string | null;
  internal_note?: string | null;
  due_date?: string | null;
}

export interface InvoicePatch {
  invoice_number?: string;
  notes?: string | null;
  internal_note?: string | null;
  due_date?: string | null;
  issue_date?: string | null;
}

export interface LineItemInput {
  description: string;
  quantity: number;
  unit_price_minor: number;
}

export interface NewPayment {
  invoice_id: string;
  client_id: string;
  amount_minor: number;
  currency: string;
  occurred_at?: string;
  method?: string | null;
  note?: string | null;
}

export interface PaymentWithContext extends PaymentEventRow {
  invoice_number: string;
  client_name: string;
}

export interface CurrencyTotal {
  currency: string;
  amountMinor: number;
}

export interface CurrencyOutstanding {
  currency: string;
  amountMinor: number;
  overdueCount: number;
}

// LiveQuery contract
export interface LiveQuery<T> {
  subscribe: (callback: (data: T) => void) => () => void;
  getValue: () => T | undefined;
}

// Typed Exception Definitions
export class InvoiceLockedError extends Error {
  constructor(invoiceId: string) {
    super(`Invoice ${invoiceId} is locked because payment events have already been recorded.`);
    this.name = 'InvoiceLockedError';
  }
}

export class CurrencyMismatchError extends Error {
  constructor(expected: string, got: string) {
    super(`Currency mismatch: expected invoice currency ${expected}, got payment currency ${got}.`);
    this.name = 'CurrencyMismatchError';
  }
}

export class ValidationError extends Error {
  constructor(message: string) {
    super(message);
    this.name = 'ValidationError';
  }
}

export const isTest = typeof process !== 'undefined' && (process.env.NODE_ENV === 'test' || process.env.VITEST === 'true');

// Helper to construct a LiveQuery
export function createLiveQuery<Row, T>(
  sql: string,
  params: any[],
  transform: (rows: Row[]) => T
): LiveQuery<T> {
  let value: T | undefined;
  const listeners = new Set<(data: T) => void>();
  let active = false;
  let iterator: any = null;

  const startWatching = async () => {
    if ((typeof window === 'undefined' && !isTest) || !db) return;
    try {
      const asyncIterable = db.watch(sql, params);
      iterator = asyncIterable[Symbol.asyncIterator]();
      
      while (active) {
        const result = await iterator.next();
        if (result.done) break;
        if (!active) break;
        
        const rows = result.value?.rows?._array ?? [];
        const transformed = transform(rows);
        value = transformed;
        
        for (const listener of listeners) {
          listener(transformed);
        }
      }
    } catch (err) {
      console.error('Error in watch query stream:', err);
    }
  };

  return {
    getValue: () => value,
    subscribe: (callback: (data: T) => void) => {
      listeners.add(callback);
      if (value !== undefined) {
        callback(value);
      } else {
        if (db && (typeof window !== 'undefined' || isTest)) {
          db.getAll(sql, params).then((rows) => {
            const transformed = transform(rows as any);
            value = transformed;
            if (listeners.has(callback)) {
              callback(value);
            }
          }).catch(err => {
            console.error('Error in initial LiveQuery load:', err);
          });
        }
      }

      if (!active) {
        active = true;
        startWatching();
      }

      return () => {
        listeners.delete(callback);
        if (listeners.size === 0 && active) {
          active = false;
          if (iterator && iterator.return) {
            iterator.return();
          }
        }
      };
    }
  };
}
