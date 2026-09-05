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

// Generic LiveQuery React subscriber hook
function useLiveQuery<T>(liveQuery: LiveQuery<T>, name?: string): { data: T | undefined; isLoading: boolean } {
  const [data, setData] = useState<T | undefined>(() => liveQuery.getValue());
  const [isLoading, setIsLoading] = useState<boolean>(() => liveQuery.getValue() === undefined);

  useEffect(() => {
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

export function useClient(id: string): { data: ClientDetail | null | undefined; isLoading: boolean } {
  const query = useMemo(() => ClientRepo.get(id), [id]);
  return useLiveQuery(query);
}

export function useClientLinks(clientId: string): { data: ClientLinkRow[] | undefined; isLoading: boolean } {
  const query = useMemo(() => ClientLinkRepo.listForClient(clientId), [clientId]);
  return useLiveQuery(query);
}

export function useInvoice(id: string): { data: InvoiceDetail | null | undefined; isLoading: boolean } {
  const query = useMemo(() => InvoiceRepo.get(id), [id]);
  return useLiveQuery(query);
}

export function useCanEditFinancials(invoiceId: string): { data: boolean | undefined; isLoading: boolean } {
  const query = useMemo(() => InvoiceRepo.canEditFinancials(invoiceId), [invoiceId]);
  return useLiveQuery(query);
}

export function useInvoicesForClient(clientId: string): { data: InvoiceSummary[] | undefined; isLoading: boolean } {
  const query = useMemo(() => InvoiceRepo.listForClient(clientId), [clientId]);
  return useLiveQuery(query);
}

export function usePaymentsForInvoice(invoiceId: string): { data: PaymentEventRow[] | undefined; isLoading: boolean } {
  const query = useMemo(() => PaymentRepo.listForInvoice(invoiceId), [invoiceId]);
  return useLiveQuery(query);
}

export function usePaymentsForClient(clientId: string): { data: PaymentEventRow[] | undefined; isLoading: boolean } {
  const query = useMemo(() => PaymentRepo.listForClient(clientId), [clientId]);
  return useLiveQuery(query);
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
            saveDashboardSnapshot({
              userId,
              periodDays,
              timestamp: Date.now(),
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
            });
          } else {
            clearDashboardSnapshot(userId);
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

  return {
    data,
    isLoading,
    isCached,
    cachedAt: cachedSnapshot?.timestamp
  };
}

export function useInvoices(): { data: InvoiceSummary[] | undefined; isLoading: boolean } {
  const query = useMemo(() => InvoiceRepo.listAll(), []);
  return useLiveQuery(query, 'useInvoices (listAll)');
}

