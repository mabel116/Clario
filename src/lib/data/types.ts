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
      const queryLabel = `[DB QUERY] ${sql.trim().replace(/\s+/g, ' ').substring(0, 60)}...`;
      console.log(`⏱️ [WATCH CREATED] ${queryLabel}`);
      const asyncIterable = db.watch(sql, params);
      iterator = asyncIterable[Symbol.asyncIterator]();
      
      while (active) {
        const startTime = typeof performance !== 'undefined' ? performance.now() : Date.now();
        
        const result = await iterator.next();
        if (result.done) break;
        if (!active) break;
        
        const elapsed = (typeof performance !== 'undefined' ? performance.now() : Date.now()) - startTime;
        const rows = result.value?.rows?._array ?? [];
        console.log(`⚡ ${queryLabel} completed in ${elapsed.toFixed(1)}ms (${rows.length} rows)`);

        const transformed = transform(rows);
        value = transformed;
        
        for (const listener of Array.from(listeners)) {
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

// Generic combinator to merge two LiveQuery streams reactively
export function combineLiveQueries<T1, T2, R>(
  q1: LiveQuery<T1>,
  q2: LiveQuery<T2>,
  combine: (v1: T1, v2: T2) => R
): LiveQuery<R> {
  let value: R | undefined;
  const listeners = new Set<(data: R) => void>();
  let unsub1: (() => void) | null = null;
  let unsub2: (() => void) | null = null;

  const notify = () => {
    const v1 = q1.getValue();
    const v2 = q2.getValue();
    if (v1 !== undefined && v2 !== undefined) {
      value = combine(v1, v2);
      for (const listener of Array.from(listeners)) {
        listener(value);
      }
    }
  };

  return {
    getValue: () => {
      const v1 = q1.getValue();
      const v2 = q2.getValue();
      return v1 !== undefined && v2 !== undefined ? combine(v1, v2) : undefined;
    },
    subscribe: (callback: (data: R) => void) => {
      listeners.add(callback);
      if (listeners.size === 1) {
        unsub1 = q1.subscribe(() => notify());
        unsub2 = q2.subscribe(() => notify());
      }
      const current = q1.getValue() !== undefined && q2.getValue() !== undefined
        ? combine(q1.getValue()!, q2.getValue()!)
        : undefined;
      if (current !== undefined) {
        callback(current);
      }
      return () => {
        listeners.delete(callback);
        if (listeners.size === 0) {
          unsub1?.();
          unsub2?.();
          unsub1 = null;
          unsub2 = null;
        }
      };
    }
  };
}

