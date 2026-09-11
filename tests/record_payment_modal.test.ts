import { describe, it, expect } from 'vitest';
import {
  deriveEffectiveInvoiceId,
  formatFullBalance,
  resolvePaymentModalState
} from '../src/components/RecordPaymentModal';

describe('RecordPaymentModal Hardening Invariants', () => {
  describe('A. Synchronous Active Invoice Derivation', () => {
    it('returns explicit invoiceId prop immediately when provided', () => {
      const result = deriveEffectiveInvoiceId({
        invoiceId: 'inv-target-123',
        selectedInvoiceId: '',
        activeInvoices: [{ id: 'inv-other-456' }, { id: 'inv-other-789' }]
      });
      expect(result).toBe('inv-target-123');
    });

    it('defaults immediately and synchronously to the first active invoice on mount (Frame 1)', () => {
      const result = deriveEffectiveInvoiceId({
        invoiceId: undefined,
        selectedInvoiceId: '',
        activeInvoices: [{ id: 'inv-first-111' }, { id: 'inv-second-222' }]
      });
      expect(result).toBe('inv-first-111');
    });

    it('preserves user selection if selectedInvoiceId is present in active invoices', () => {
      const result = deriveEffectiveInvoiceId({
        invoiceId: undefined,
        selectedInvoiceId: 'inv-second-222',
        activeInvoices: [{ id: 'inv-first-111' }, { id: 'inv-second-222' }]
      });
      expect(result).toBe('inv-second-222');
    });

    it('falls back to the first active invoice if selectedInvoiceId is no longer in active invoices', () => {
      const result = deriveEffectiveInvoiceId({
        invoiceId: undefined,
        selectedInvoiceId: 'inv-stale-999',
        activeInvoices: [{ id: 'inv-first-111' }, { id: 'inv-second-222' }]
      });
      expect(result).toBe('inv-first-111');
    });

    it('returns an empty string when there are no active invoices and no invoiceId prop', () => {
      const result = deriveEffectiveInvoiceId({
        invoiceId: undefined,
        selectedInvoiceId: '',
        activeInvoices: []
      });
      expect(result).toBe('');
    });
  });

  describe('B. Missing Entity and Empty State Resolution (ADR 036 & ADR 027)', () => {
    it('returns loading state strictly when isLoading is true', () => {
      expect(
        resolvePaymentModalState({
          isLoading: true,
          invoiceId: 'inv-1',
          hasSingleInvoice: false,
          activeInvoicesCount: 0
        })
      ).toBe('loading');

      expect(
        resolvePaymentModalState({
          isLoading: true,
          invoiceId: undefined,
          hasSingleInvoice: false,
          activeInvoicesCount: 5
        })
      ).toBe('loading');
    });

    it('resolves to invoice_not_found when explicit invoiceId is provided but not found locally', () => {
      const state = resolvePaymentModalState({
        isLoading: false,
        invoiceId: 'inv-missing-999',
        hasSingleInvoice: false,
        activeInvoicesCount: 2
      });
      expect(state).toBe('invoice_not_found');
    });

    it('resolves to no_active_invoices when opened from client view with zero eligible invoices', () => {
      const state = resolvePaymentModalState({
        isLoading: false,
        invoiceId: undefined,
        hasSingleInvoice: false,
        activeInvoicesCount: 0
      });
      expect(state).toBe('no_active_invoices');
    });

    it('resolves to ready when explicit invoiceId exists and loaded', () => {
      const state = resolvePaymentModalState({
        isLoading: false,
        invoiceId: 'inv-valid-1',
        hasSingleInvoice: true,
        activeInvoicesCount: 0
      });
      expect(state).toBe('ready');
    });

    it('resolves to ready when client has active invoices to select from', () => {
      const state = resolvePaymentModalState({
        isLoading: false,
        invoiceId: undefined,
        hasSingleInvoice: false,
        activeInvoicesCount: 3
      });
      expect(state).toBe('ready');
    });
  });

  describe('C. Canonical Exponent Formatting for Pay Full Balance (ADR 001 & ADR 015)', () => {
    it('formats 2-decimal currencies (USD, EUR, GBP, NGN) with fixed precision and no float drift', () => {
      // 1250.50 USD
      expect(formatFullBalance(125050, 'USD')).toBe('1250.50');
      // 10.00 USD (preserves trailing zero)
      expect(formatFullBalance(1000, 'USD')).toBe('10.00');
      // 29.99 USD
      expect(formatFullBalance(2999, 'USD')).toBe('29.99');
      // 700.01 EUR (avoids float drift like 700.0100000000001)
      expect(formatFullBalance(70001, 'EUR')).toBe('700.01');
      // 2500.00 NGN
      expect(formatFullBalance(250000, 'NGN')).toBe('2500.00');
      // 100.10 GBP
      expect(formatFullBalance(10010, 'GBP')).toBe('100.10');
    });

    it('formats 0-decimal currencies (JPY, KRW) without decimal places', () => {
      // 1250 JPY
      expect(formatFullBalance(1250, 'JPY')).toBe('1250');
      // 50000 KRW
      expect(formatFullBalance(50000, 'KRW')).toBe('50000');
    });

    it('clamps negative balance due (overpaid invoices) safely to zero with proper decimals', () => {
      expect(formatFullBalance(-5000, 'USD')).toBe('0.00');
      expect(formatFullBalance(-200, 'JPY')).toBe('0');
      expect(formatFullBalance(0, 'EUR')).toBe('0.00');
    });

    it('safely falls back to exponent 2 for unrecognized currencies', () => {
      expect(formatFullBalance(12345, 'XYZ')).toBe('123.45');
    });
  });
});
