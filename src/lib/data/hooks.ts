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

// Generic LiveQuery React subscriber hook
function useLiveQuery<T>(liveQuery: LiveQuery<T>): { data: T | undefined; isLoading: boolean } {
  const [data, setData] = useState<T | undefined>(liveQuery.getValue());
  const [isLoading, setIsLoading] = useState<boolean>(data === undefined);

  useEffect(() => {
    let active = true;
    const unsubscribe = liveQuery.subscribe((newData) => {
      if (!active) return;
      setData(newData);
      setIsLoading(false);
    });
    return () => {
      active = false;
      unsubscribe();
    };
  }, [liveQuery]);

  return { data, isLoading };
}

export function useClients(): { data: ClientSummary[] | undefined; isLoading: boolean } {
  const query = useMemo(() => ClientRepo.list(), []);
  return useLiveQuery(query);
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
  return useLiveQuery(query);
}

export function useDashboard(periodDays = 30): {
  data: {
    outstanding: CurrencyOutstanding[];
    earnings: CurrencyTotal[];
    recentPayments: PaymentWithContext[];
  } | undefined;
  isLoading: boolean;
} {
  const outstandingQuery = useMemo(() => DashboardRepo.outstandingByCurrency(), []);
  const earningsQuery = useMemo(() => DashboardRepo.earningsByCurrency(periodDays), [periodDays]);
  const recentPaymentsQuery = useMemo(() => DashboardRepo.recentPayments(10), []);

  const outstanding = useLiveQuery(outstandingQuery);
  const earnings = useLiveQuery(earningsQuery);
  const recentPayments = useLiveQuery(recentPaymentsQuery);

  const isLoading = outstanding.isLoading || earnings.isLoading || recentPayments.isLoading;

  const data = useMemo(() => {
    if (isLoading) return undefined;
    return {
      outstanding: outstanding.data || [],
      earnings: earnings.data || [],
      recentPayments: recentPayments.data || []
    };
  }, [isLoading, outstanding.data, earnings.data, recentPayments.data]);

  return { data, isLoading };
}
