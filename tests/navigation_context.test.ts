import { describe, it, expect } from 'vitest';
import {
  resolveInvoiceBackLink,
  resolveInvoicesListNavigation,
  buildClientDrawerInvoiceHref,
  resolveActiveNav
} from '../src/lib/navigation';

describe('Contextual Breadcrumb Navigation & Drawer Retention', () => {
  describe('resolveInvoiceBackLink', () => {
    it('restores client drawer with client name when from starts with /clients?id=', () => {
      const result = resolveInvoiceBackLink('/clients?id=client-abc-123', 'Acme Studios');
      expect(result).toEqual({
        backLinkHref: '/clients?id=client-abc-123',
        backLinkLabel: '← Back to Acme Studios'
      });
    });

    it('restores client drawer with fallback label when client name is unavailable', () => {
      const result = resolveInvoiceBackLink('/clients?id=client-abc-123', null);
      expect(result).toEqual({
        backLinkHref: '/clients?id=client-abc-123',
        backLinkLabel: '← Back to Client'
      });
    });

    it('returns to clients list when from is /clients without id', () => {
      const result = resolveInvoiceBackLink('/clients', 'Acme Studios');
      expect(result).toEqual({
        backLinkHref: '/clients',
        backLinkLabel: '← Back to Clients'
      });
    });

    it('generates dynamic currency and status label when from has both currency and outstanding status', () => {
      const result = resolveInvoiceBackLink('/invoices?status=outstanding&currency=USD');
      expect(result).toEqual({
        backLinkHref: '/invoices?status=outstanding&currency=USD',
        backLinkLabel: '← Back to USD Outstanding Invoices'
      });
    });

    it('generates dynamic currency label when from has only currency', () => {
      const result = resolveInvoiceBackLink('/invoices?currency=EUR');
      expect(result).toEqual({
        backLinkHref: '/invoices?currency=EUR',
        backLinkLabel: '← Back to EUR Invoices'
      });
    });

    it('generates dynamic status label when from has only outstanding status', () => {
      const result = resolveInvoiceBackLink('/invoices?status=outstanding');
      expect(result).toEqual({
        backLinkHref: '/invoices?status=outstanding',
        backLinkLabel: '← Back to Outstanding Invoices'
      });
    });

    it('returns to plain invoices list when from is /invoices without filters', () => {
      const result = resolveInvoiceBackLink('/invoices');
      expect(result).toEqual({
        backLinkHref: '/invoices',
        backLinkLabel: '← Back to Invoices'
      });
    });

    it('returns to dashboard when from is /', () => {
      const result = resolveInvoiceBackLink('/');
      expect(result).toEqual({
        backLinkHref: '/',
        backLinkLabel: '← Back to Dashboard'
      });
    });

    it('falls back to /invoices when from is null, undefined, or cold boot direct link', () => {
      expect(resolveInvoiceBackLink(null)).toEqual({
        backLinkHref: '/invoices',
        backLinkLabel: '← Back to Invoices'
      });
      expect(resolveInvoiceBackLink(undefined)).toEqual({
        backLinkHref: '/invoices',
        backLinkLabel: '← Back to Invoices'
      });
      expect(resolveInvoiceBackLink('')).toEqual({
        backLinkHref: '/invoices',
        backLinkLabel: '← Back to Invoices'
      });
      expect(resolveInvoiceBackLink('/settings')).toEqual({
        backLinkHref: '/invoices',
        backLinkLabel: '← Back to Invoices'
      });
    });
  });

  describe('resolveInvoicesListNavigation', () => {
    it('omits back button and uses /invoices when navigating directly without filter query params', () => {
      const { hasFilterParams, currentPathWithQuery } = resolveInvoicesListNavigation('', null, null);
      expect(hasFilterParams).toBe(false);
      expect(currentPathWithQuery).toBe('/invoices');
    });

    it('renders back button and preserves query when currency filter is present', () => {
      const { hasFilterParams, currentPathWithQuery } = resolveInvoicesListNavigation('currency=EUR', 'EUR', null);
      expect(hasFilterParams).toBe(true);
      expect(currentPathWithQuery).toBe('/invoices?currency=EUR');
    });

    it('renders back button and preserves query when status filter is present', () => {
      const { hasFilterParams, currentPathWithQuery } = resolveInvoicesListNavigation('status=outstanding', null, 'outstanding');
      expect(hasFilterParams).toBe(true);
      expect(currentPathWithQuery).toBe('/invoices?status=outstanding');
    });

    it('renders back button and preserves multi-filter queries', () => {
      const qs = 'status=outstanding&currency=GBP';
      const { hasFilterParams, currentPathWithQuery } = resolveInvoicesListNavigation(qs, 'GBP', 'outstanding');
      expect(hasFilterParams).toBe(true);
      expect(currentPathWithQuery).toBe('/invoices?status=outstanding&currency=GBP');
    });
  });

  describe('buildClientDrawerInvoiceHref', () => {
    it('encodes the client drawer return path in the invoice URL', () => {
      const href = buildClientDrawerInvoiceHref('inv-999', 'client-777');
      expect(href).toBe('/invoices/inv-999?from=%2Fclients%3Fid%3Dclient-777');

      // Verify that decoding the from parameter yields the exact drawer path
      const url = new URL(`http://localhost${href}`);
      const fromParam = url.searchParams.get('from');
      expect(fromParam).toBe('/clients?id=client-777');

      // Verify that resolveInvoiceBackLink with this decoded param restores the drawer
      const backLink = resolveInvoiceBackLink(fromParam, 'Globex Corp');
      expect(backLink).toEqual({
        backLinkHref: '/clients?id=client-777',
        backLinkLabel: '← Back to Globex Corp'
      });
    });
  });

  describe('resolveActiveNav (Context-Aware Sidebar Selection)', () => {
    it('returns dashboard for root route', () => {
      expect(resolveActiveNav('/', '')).toBe('dashboard');
    });

    it('returns settings for /settings and subroutes', () => {
      expect(resolveActiveNav('/settings', '')).toBe('settings');
      expect(resolveActiveNav('/settings/profile', '')).toBe('settings');
    });

    it('returns clients for /clients and subroutes', () => {
      expect(resolveActiveNav('/clients', '')).toBe('clients');
      expect(resolveActiveNav('/clients', 'id=client-123')).toBe('clients');
      expect(resolveActiveNav('/clients/new', '')).toBe('clients');
    });

    it('returns invoices for /invoices when no filter query params are present', () => {
      expect(resolveActiveNav('/invoices', '')).toBe('invoices');
    });

    it('returns dashboard for /invoices when arriving via currency drill-down', () => {
      expect(resolveActiveNav('/invoices', 'currency=USD')).toBe('dashboard');
    });

    it('returns dashboard for /invoices when arriving via status drill-down', () => {
      expect(resolveActiveNav('/invoices', 'status=outstanding')).toBe('dashboard');
    });

    it('returns dashboard for /invoices when arriving via combined drill-down (?status=outstanding&currency=USD)', () => {
      expect(resolveActiveNav('/invoices', 'status=outstanding&currency=USD')).toBe('dashboard');
    });

    it('returns clients when viewing invoice detail originating from clients drawer', () => {
      const sp = 'from=%2Fclients%3Fid%3Dclient-123';
      expect(resolveActiveNav('/invoices/inv-123', sp)).toBe('clients');
    });

    it('returns dashboard when viewing invoice detail originating from dashboard (from=/)', () => {
      const sp = 'from=%2F';
      expect(resolveActiveNav('/invoices/inv-123', sp)).toBe('dashboard');
    });

    it('returns dashboard when viewing invoice detail originating from dashboard drill-down', () => {
      const sp = 'from=%2Finvoices%3Fstatus%3Doutstanding%26currency%3DUSD';
      expect(resolveActiveNav('/invoices/inv-123', sp)).toBe('dashboard');
    });

    it('returns invoices when viewing invoice detail originating from general invoices list', () => {
      const sp = 'from=%2Finvoices';
      expect(resolveActiveNav('/invoices/inv-123', sp)).toBe('invoices');
    });

    it('returns invoices when viewing invoice detail directly without from parameter (cold boot)', () => {
      expect(resolveActiveNav('/invoices/inv-123', '')).toBe('invoices');
    });
  });
});
