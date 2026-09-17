import { useEffect, useState, useMemo } from 'react';
import { LiveQuery } from './types';
import { ClientRepo } from './client';
import { ClientLinkRepo } from './client-link';
import { InvoiceRepo } from './invoice';
import { PaymentRepo } from './payment';
import { DashboardRepo } from './dashboard';
import { ProfileRepo } from './profile';
import { ClientLinkRow, PaymentEventRow, ProfileRow } from '../sync/schema';
import { ClientSummary, ClientDetail, InvoiceSummary, InvoiceDetail, PaymentWithContext, CurrencyTotal, CurrencyOutstanding } from './types';
import { getDashboardSnapshot, saveDashboardSnapshot, clearDashboardSnapshot, DashboardSnapshot } from './snapshot';
import { getAuthSession } from '../auth/client';
import { db } from '../sync/db';

// Generic LiveQuery React subscriber hook
function useLiveQuery<T>(liveQuery: LiveQuery<T> | null | undefined, name?: string): { data: T | undefined; isLoading: boolean } {
  const [data, setData] = useState<T | undefined>(() => (liveQuery ? liveQuery.getValue() : undefined));
  const [isLoading, setIsLoading] = useState<boolean>(() => (liveQuery ? liveQuery.getValue() === undefined : false));
  const [prevQuery, setPrevQuery] = useState(liveQuery);

  // Synchronize state immediately on liveQuery instance changes (storing info from previous renders)
  if (prevQuery !== liveQuery) {
    setPrevQuery(liveQuery);
    const initialVal = liveQuery ? liveQuery.getValue() : undefined;
    setData(initialVal);
    setIsLoading(liveQuery ? initialVal === undefined : false);
  }

  useEffect(() => {
    if (!liveQuery) {
      return;
    }
    let active = true;
    const label = name ? `[HOOK: ${name}]` : '[HOOK]';
    console.log(`🔌 ${label} Subscribing`);
    const unsubscribe = liveQuery.subscribe((newData) => {
      if (!active) return;
      console.log(`🔔 ${label} Data received by hook. Setting isLoading -> false`);
      setData(newData);
      setIsLoading(false);
    });
    return () => {
      active = false;
      console.log(`🔌 ${label} Unsubscribing`);
      unsubscribe();
    };
  }, [liveQuery, name]);

  return { data, isLoading };
}

export function useClients(): { data: ClientSummary[] | undefined; isLoading: boolean } {
  const query = useMemo(() => ClientRepo.list(), []);
  return useLiveQuery(query, 'useClients');
}

export function useClient(id?: string | null): { data: ClientDetail | null | undefined; isLoading: boolean } {
  const query = useMemo(() => (id ? ClientRepo.get(id) : null), [id]);
  return useLiveQuery(query);
}

export function useClientLinks(clientId?: string | null): { data: ClientLinkRow[] | undefined; isLoading: boolean } {
  const query = useMemo(() => (clientId ? ClientLinkRepo.listForClient(clientId) : null), [clientId]);
  return useLiveQuery(query);
}

export function useInvoice(id?: string | null): { data: InvoiceDetail | null | undefined; isLoading: boolean } {
  const cleanId = (id || '').trim().split('?')[0].split('#')[0];
  const query = useMemo(() => (cleanId && cleanId !== '_shell_' ? InvoiceRepo.get(cleanId) : null), [cleanId]);
  return useLiveQuery(query);
}

export function useCanEditFinancials(invoiceId?: string | null): { data: boolean | undefined; isLoading: boolean } {
  const cleanId = (invoiceId || '').trim().split('?')[0].split('#')[0];
  const query = useMemo(() => (cleanId && cleanId !== '_shell_' ? InvoiceRepo.canEditFinancials(cleanId) : null), [cleanId]);
  return useLiveQuery(query);
}

export function useInvoicesForClient(clientId?: string | null): { data: InvoiceSummary[] | undefined; isLoading: boolean } {
  const query = useMemo(() => (clientId ? InvoiceRepo.listForClient(clientId) : null), [clientId]);
  return useLiveQuery(query);
}

export function usePaymentsForInvoice(invoiceId?: string | null): { data: PaymentEventRow[] | undefined; isLoading: boolean } {
  const query = useMemo(() => (invoiceId ? PaymentRepo.listForInvoice(invoiceId) : null), [invoiceId]);
  return useLiveQuery(query);
}

export function usePaymentsForClient(clientId?: string | null): { data: PaymentEventRow[] | undefined; isLoading: boolean } {
  const query = useMemo(() => (clientId ? PaymentRepo.listForClient(clientId) : null), [clientId]);
  return useLiveQuery(query);
}

export function useAllPayments(): { data: PaymentWithContext[] | undefined; isLoading: boolean } {
  const query = useMemo(() => PaymentRepo.listAll(), []);
  return useLiveQuery(query, 'useAllPayments');
}

export function useProfile(): { data: ProfileRow | null | undefined; isLoading: boolean } {
  const query = useMemo(() => ProfileRepo.get(), []);
  return useLiveQuery(query, 'useProfile');
}

export function useDashboard(periodDays = 30, defaultCurrency = 'USD'): {
  data: {
    outstanding: CurrencyOutstanding[];
    earnings: CurrencyTotal[];
    recentPayments: PaymentWithContext[];
    invoices: InvoiceSummary[];
    defaultCurrency: string;
  } | undefined;
  isLoading: boolean;
  isCached: boolean;
  cachedAt?: number;
} {
  const [cachedSnapshot, setCachedSnapshot] = useState<DashboardSnapshot | null>(null);

  useEffect(() => {
    let active = true;
    getAuthSession().then((session) => {
      const userId = session?.user?.id;
      if (userId && active) {
        getDashboardSnapshot(userId, periodDays).then((snap) => {
          if (active && snap) {
            setCachedSnapshot(snap);
          }
        });
      }
    });
    return () => {
      active = false;
    };
  }, [periodDays]);

  const outstandingQuery = useMemo(() => DashboardRepo.outstandingByCurrency(defaultCurrency), [defaultCurrency]);
  const earningsQuery = useMemo(() => DashboardRepo.earningsByCurrency(periodDays, defaultCurrency), [periodDays, defaultCurrency]);
  const recentPaymentsQuery = useMemo(() => DashboardRepo.recentPayments(10), []);
  const invoicesQuery = useMemo(() => InvoiceRepo.listAll(), []);

  const outstanding = useLiveQuery(outstandingQuery, 'Dashboard.outstanding');
  const earnings = useLiveQuery(earningsQuery, 'Dashboard.earnings');
  const recentPayments = useLiveQuery(recentPaymentsQuery, 'Dashboard.recentPayments');
  const invoices = useLiveQuery(invoicesQuery, 'Dashboard.invoices');

  const isLiveLoading = outstanding.isLoading || earnings.isLoading || recentPayments.isLoading || invoices.isLoading;

  const liveData = useMemo(() => {
    if (isLiveLoading) return undefined;
    return {
      outstanding: outstanding.data || [],
      earnings: earnings.data || [],
      recentPayments: recentPayments.data || [],
      invoices: invoices.data || [],
      defaultCurrency: defaultCurrency.toUpperCase()
    };
  }, [isLiveLoading, outstanding.data, earnings.data, recentPayments.data, invoices.data, defaultCurrency]);

  // Persist snapshot on live update only when account has real business data; clear if empty
  useEffect(() => {
    if (liveData) {
      getAuthSession().then((session) => {
        const userId = session?.user?.id;
        if (userId) {
          const hasData =
            liveData.invoices.length > 0 ||
            liveData.outstanding.some((o) => o.amountMinor > 0) ||
            liveData.earnings.length > 0 ||
            liveData.recentPayments.length > 0;

          if (hasData) {
            const effectiveTime = db?.currentStatus?.lastSyncedAt
              ? db.currentStatus.lastSyncedAt.getTime()
              : Date.now();
            const snapshotData: DashboardSnapshot = {
              userId,
              periodDays,
              timestamp: effectiveTime,
              defaultCurrency: liveData.defaultCurrency,
              outstanding: liveData.outstanding,
              earnings: liveData.earnings,
              recentPayments: liveData.recentPayments,
              invoices: liveData.invoices,
              needsAttentionCount: liveData.invoices.filter((inv) => inv.displayStatus === 'overdue' && inv.balanceDueMinor > 0).length,
              currencies: Array.from(
                new Set([
                  ...liveData.outstanding.filter((o) => o.amountMinor > 0).map((o) => o.currency.toUpperCase()),
                  ...liveData.earnings.map((e) => e.currency.toUpperCase()),
                  ...liveData.recentPayments.map((p) => p.currency.toUpperCase())
                ])
              )
            };
            saveDashboardSnapshot(snapshotData);
            setCachedSnapshot(snapshotData);
          } else {
            clearDashboardSnapshot(userId);
            setCachedSnapshot(null);
          }
        }
      });
    }
  }, [liveData, periodDays]);

  const isCached = isLiveLoading && cachedSnapshot !== null;
  const isLoading = isLiveLoading && cachedSnapshot === null;

  const data = liveData ?? (cachedSnapshot ? {
    outstanding: cachedSnapshot.outstanding,
    earnings: cachedSnapshot.earnings,
    recentPayments: cachedSnapshot.recentPayments,
    invoices: cachedSnapshot.invoices || [],
    defaultCurrency: cachedSnapshot.defaultCurrency || defaultCurrency.toUpperCase()
  } : undefined);

  const effectiveCachedAt = db?.currentStatus?.lastSyncedAt
    ? db.currentStatus.lastSyncedAt.getTime()
    : cachedSnapshot?.timestamp;

  return {
    data,
    isLoading,
    isCached,
    cachedAt: effectiveCachedAt
  };
}

export function useInvoices(): { data: InvoiceSummary[] | undefined; isLoading: boolean } {
  const query = useMemo(() => InvoiceRepo.listAll(), []);
  return useLiveQuery(query, 'useInvoices (listAll)');
}

