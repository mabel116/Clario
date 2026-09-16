/**
 * Navigation helpers for contextual breadcrumbs, drawer retention, and sidebar highlighting.
 */

export interface InvoiceBackLink {
  backLinkHref: string;
  backLinkLabel: string;
}

export type NavItem = 'dashboard' | 'invoices' | 'clients' | 'payments' | 'settings';

/**
 * Resolves the destination URL and display label for the back button on `/invoices/[id]`.
 */
export function resolveInvoiceBackLink(
  fromParam: string | null | undefined,
  clientName?: string | null
): InvoiceBackLink {
  if (fromParam) {
    if (fromParam.startsWith('/clients?id=')) {
      return {
        backLinkHref: fromParam,
        backLinkLabel: clientName ? `← Back to ${clientName}` : '← Back to Client'
      };
    }
    if (fromParam.startsWith('/clients')) {
      return {
        backLinkHref: fromParam,
        backLinkLabel: '← Back to Clients'
      };
    }
    if (fromParam.startsWith('/payments')) {
      return {
        backLinkHref: fromParam,
        backLinkLabel: '← Back to Payments'
      };
    }
    if (fromParam.startsWith('/invoices')) {
      const qIndex = fromParam.indexOf('?');
      if (qIndex !== -1) {
        const query = fromParam.slice(qIndex + 1);
        const sp = new URLSearchParams(query);
        const currency = sp.get('currency')?.trim().toUpperCase();
        const status = sp.get('status')?.trim().toLowerCase();

        if (status === 'outstanding' && currency) {
          return {
            backLinkHref: fromParam,
            backLinkLabel: `← Back to ${currency} Outstanding Invoices`
          };
        }
        if (currency) {
          return {
            backLinkHref: fromParam,
            backLinkLabel: `← Back to ${currency} Invoices`
          };
        }
        if (status === 'outstanding') {
          return {
            backLinkHref: fromParam,
            backLinkLabel: '← Back to Outstanding Invoices'
          };
        }
      }
      return {
        backLinkHref: fromParam,
        backLinkLabel: '← Back to Invoices'
      };
    }
    if (fromParam === '/') {
      return {
        backLinkHref: '/',
        backLinkLabel: '← Back to Dashboard'
      };
    }
  }
  return {
    backLinkHref: '/invoices',
    backLinkLabel: '← Back to Invoices'
  };
}

/**
 * Determines whether contextual back button should render and derives current path with query.
 */
export function resolveInvoicesListNavigation(
  queryString: string,
  targetCurrency?: string | null,
  targetStatus?: string | null
): {
  hasFilterParams: boolean;
  currentPathWithQuery: string;
} {
  const hasFilterParams = Boolean(targetCurrency || targetStatus);
  const currentPathWithQuery = queryString ? `/invoices?${queryString}` : '/invoices';
  return { hasFilterParams, currentPathWithQuery };
}

/**
 * Constructs invoice link from client drawer, preserving selected client state.
 */
export function buildClientDrawerInvoiceHref(invoiceId: string, selectedClientId: string): string {
  return `/invoices/${invoiceId}?from=${encodeURIComponent(`/clients?id=${selectedClientId}`)}`;
}

/**
 * Resolves which sidebar navigation item is active based on pathname and search params.
 */
export function resolveActiveNav(pathname: string, searchParamsString: string): NavItem {
  if (pathname === '/') return 'dashboard';
  if (pathname.startsWith('/settings')) return 'settings';
  if (pathname.startsWith('/clients')) return 'clients';
  if (pathname.startsWith('/payments')) return 'payments';

  const cleanQuery = searchParamsString.startsWith('?') ? searchParamsString.slice(1) : searchParamsString;
  const sp = new URLSearchParams(cleanQuery);

  if (pathname === '/invoices') {
    if (sp.has('currency') || sp.has('status')) {
      return 'dashboard';
    }
    return 'invoices';
  }

  if (pathname.startsWith('/invoices/')) {
    const from = sp.get('from') || '';
    if (from.startsWith('/payments')) {
      return 'payments';
    }
    if (from.startsWith('/clients')) {
      return 'clients';
    }
    if (from === '/' || from.includes('status=') || from.includes('currency=')) {
      return 'dashboard';
    }
    return 'invoices';
  }

  return 'dashboard';
}

/**
 * Resolves an entity ID from Next.js route params or falls back to window.location.pathname
 * when the page was loaded offline via a static shell (e.g. /clients/_shell_/invoices/new).
 */
export function resolveRouteParam(
  rawParam: string | string[] | undefined,
  segment: 'clients' | 'invoices',
  customPathname?: string
): string {
  const paramVal = Array.isArray(rawParam) ? rawParam[0] : rawParam;
  if (paramVal && paramVal !== '_shell_') {
    return paramVal;
  }
  const pathname = customPathname ?? (typeof window !== 'undefined' ? window.location.pathname : '');
  if (pathname) {
    const parts = pathname.split('/').filter(Boolean);
    const idx = parts.indexOf(segment);
    if (idx !== -1 && parts[idx + 1] && parts[idx + 1] !== '_shell_') {
      return parts[idx + 1];
    }
  }
  return paramVal || '';
}
