import { describe, test, expect } from 'vitest';
import {
  addMoney,
  subtractMoney,
  sumMoney,
  multiplyMinor,
  formatMoney,
  parseMoneyInput
} from '../src/lib/money';
import {
  lineTotalMinor,
  invoiceTotalMinor,
  amountPaidMinor,
  balanceDueMinor,
  paymentStatus,
  isOverdue,
  displayStatus,
  deriveInvoice
} from '../src/lib/derive/invoice';
import {
  outstandingByCurrency,
  earningsByCurrency,
  clientOutstandingByCurrency,
  sortCurrencyTotals
} from '../src/lib/derive/aggregates';
import { suggestNextInvoiceNumber } from '../src/lib/derive/numbering';

describe('Money and Derivations Core', () => {

  // Criterion 1 — formatMoney correct for NGN, USD, and JPY (no decimals for JPY)
  test('Criterion 1: formatMoney correctness', () => {
    const usd = formatMoney({ amountMinor: 125050, currency: 'USD' });
    const jpy = formatMoney({ amountMinor: 1250, currency: 'JPY' });
    const ngn = formatMoney({ amountMinor: 125050, currency: 'NGN' });

    // Since Intl.NumberFormat symbols and separators might vary by Node version,
    // we clean up spaces or assert matching parts.
    expect(usd.replace(/\s/g, '')).toBe('$1,250.50');
    expect(jpy.replace(/\s/g, '')).toBe('¥1,250');
    expect(ngn.replace(/\s/g, '')).toBe('₦1,250.50');
  });

  // Criterion 2 — parseMoneyInput('1,250.50', 'USD') returns 125050; 19.99 never yields 1998 or a float artifact
  test('Criterion 2: parseMoneyInput precision', () => {
    const usd1 = parseMoneyInput('1,250.50', 'USD');
    const usd2 = parseMoneyInput('19.99', 'USD');
    const jpy1 = parseMoneyInput('1250', 'JPY');
    const jpy2 = parseMoneyInput('1250.99', 'JPY'); // JPY decimal part is rounded/ignored in parsed output

    expect(usd1.amountMinor).toBe(125050);
    expect(usd2.amountMinor).toBe(1999);
    expect(jpy1.amountMinor).toBe(1250);
    expect(jpy2.amountMinor).toBe(1251); // 1250.99 rounds to 1251
  });

  // Criterion 3 — multiplyMinor(333, 2.5) returns 833 (half-up)
  test('Criterion 3: multiplyMinor rounding', () => {
    const result = multiplyMinor(333, 2.5);
    expect(result).toBe(833);
  });

  // Criterion 4 — Currency mismatch throws in addMoney and sumMoney
  test('Criterion 4: Currency mismatch throws', () => {
    const moneyUSD = { amountMinor: 100, currency: 'USD' };
    const moneyEUR = { amountMinor: 100, currency: 'EUR' };

    // Assert addMoney throws
    expect(() => addMoney(moneyUSD, moneyEUR)).toThrow(
      'Currency mismatch in addMoney: cannot add USD and EUR'
    );

    // Confirm same-currency call in the same test returns correct sum
    const sumAdd = addMoney(moneyUSD, { amountMinor: 200, currency: 'USD' });
    expect(sumAdd.amountMinor).toBe(300);
    expect(sumAdd.currency).toBe('USD');

    // Assert sumMoney throws
    expect(() => sumMoney([moneyUSD, moneyEUR])).toThrow(
      'Currency mismatch in sumMoney: mixed currencies USD and EUR'
    );

    // Confirm same-currency sum
    const sumResult = sumMoney([moneyUSD, { amountMinor: 200, currency: 'USD' }]);
    expect(sumResult.amountMinor).toBe(300);
    expect(sumResult.currency).toBe('USD');
  });

  // Criterion 5 — Total 100000 with payments of 30000 and 20000 gives balance 50000 and status partially_paid
  test('Criterion 5: Partially paid calculations', () => {
    const total = 100000;
    const payments = [
      { amount_minor: 30000, currency: 'USD' },
      { amount_minor: 20000, currency: 'USD' }
    ];
    const paid = amountPaidMinor(payments);
    const balance = balanceDueMinor(total, paid);
    const status = paymentStatus(balance, total, paid);

    expect(balance).toBe(50000);
    expect(status).toBe('partially_paid');
  });

  // Criterion 6 — Payments summing exactly to the total give balance 0 and status paid
  test('Criterion 6: Fully paid status', () => {
    const total = 100000;
    const payments = [
      { amount_minor: 40000, currency: 'USD' },
      { amount_minor: 60000, currency: 'USD' }
    ];
    const paid = amountPaidMinor(payments);
    const balance = balanceDueMinor(total, paid);
    const status = paymentStatus(balance, total, paid);

    expect(balance).toBe(0);
    expect(status).toBe('paid');
  });

  // Criterion 7 — Overpayment gives a negative balance and status paid, with no crash
  test('Criterion 7: Overpayment calculations', () => {
    const total = 100000;
    const payments = [
      { amount_minor: 120000, currency: 'USD' }
    ];
    const paid = amountPaidMinor(payments);
    const balance = balanceDueMinor(total, paid);
    const status = paymentStatus(balance, total, paid);

    expect(balance).toBe(-20000);
    expect(status).toBe('paid');
  });

  // Criterion 8 — A payment of 50000 followed by a reversal of -50000 returns the balance to the full total and status to unpaid
  test('Criterion 8: Payment and reversal', () => {
    const total = 100000;
    const payments = [
      { amount_minor: 50000, currency: 'USD' },
      { amount_minor: -50000, currency: 'USD' }
    ];
    const paid = amountPaidMinor(payments);
    const balance = balanceDueMinor(total, paid);
    const status = paymentStatus(balance, total, paid);

    expect(balance).toBe(total);
    expect(status).toBe('unpaid');
  });

  // Criterion 9 — The same event set in three shuffled orders yields identical balance and status (explicit control assert value)
  test('Criterion 9: Shuffled order ledger sums commutativity', () => {
    const total = 100000;
    
    // 3 events: A (+30000), B (+20000), C (-10000) -> net sum: 40000. Expected balance: 60000, status: partially_paid
    const eventA = { amount_minor: 30000, currency: 'USD' };
    const eventB = { amount_minor: 20000, currency: 'USD' };
    const eventC = { amount_minor: -10000, currency: 'USD' };

    const order1 = [eventA, eventB, eventC];
    const order2 = [eventB, eventC, eventA];
    const order3 = [eventC, eventA, eventB];

    const res1 = deriveInvoice({ status: 'sent', total_minor: total, due_date: '2026-08-01' }, order1, '2026-07-25');
    const res2 = deriveInvoice({ status: 'sent', total_minor: total, due_date: '2026-08-01' }, order2, '2026-07-25');
    const res3 = deriveInvoice({ status: 'sent', total_minor: total, due_date: '2026-08-01' }, order3, '2026-07-25');

    // Assert that the result equals the correct expected values directly, not just that they agree
    expect(res1.balanceDue).toBe(60000);
    expect(res1.paymentStatus).toBe('partially_paid');

    expect(res2.balanceDue).toBe(60000);
    expect(res2.paymentStatus).toBe('partially_paid');

    expect(res3.balanceDue).toBe(60000);
    expect(res3.paymentStatus).toBe('partially_paid');
  });

  // Criterion 10 — A sent invoice past due with balance > 0 is overdue; the same invoice fully paid is not; a draft past due is not; a void invoice never is. All four cases must appear in the same test run.
  test('Criterion 10: Overdue cases matrix', () => {
    const today = '2026-07-25';
    const pastDueDate = '2026-07-20';

    // Case 1: A sent invoice past due with balance > 0 is overdue
    const case1 = deriveInvoice(
      { status: 'sent', total_minor: 100000, due_date: pastDueDate },
      [{ amount_minor: 50000, currency: 'USD' }], // balance due: 50000
      today
    );
    expect(case1.isOverdue).toBe(true);

    // Case 2: The same invoice fully paid is not overdue
    const case2 = deriveInvoice(
      { status: 'sent', total_minor: 100000, due_date: pastDueDate },
      [{ amount_minor: 100000, currency: 'USD' }], // balance due: 0
      today
    );
    expect(case2.isOverdue).toBe(false);

    // Case 3: A draft past due is not overdue
    const case3 = deriveInvoice(
      { status: 'draft', total_minor: 100000, due_date: pastDueDate },
      [], // balance due: 100000
      today
    );
    expect(case3.isOverdue).toBe(false);

    // Case 4: A void invoice never is overdue
    const case4 = deriveInvoice(
      { status: 'void', total_minor: 100000, due_date: pastDueDate },
      [], // balance due: 100000
      today
    );
    expect(case4.isOverdue).toBe(false);
  });

  // Criterion 11 — displayStatus reports paid — not overdue — for a paid-and-past-due invoice
  test('Criterion 11: Paid and past-due displayStatus precedence', () => {
    const today = '2026-07-25';
    const pastDueDate = '2026-07-20';

    const result = deriveInvoice(
      { status: 'sent', total_minor: 100000, due_date: pastDueDate },
      [{ amount_minor: 100000, currency: 'USD' }], // paid
      today
    );

    expect(result.paymentStatus).toBe('paid');
    expect(result.isOverdue).toBe(false);
    expect(result.displayStatus).toBe('paid');
  });

  // Criterion 12 — Invoices in NGN and USD produce two aggregate entries, and no function returns a combined scalar
  test('Criterion 12: Aggregate currency segregation', () => {
    const invoices = [
      { id: '1', client_id: 'client-A', status: 'sent' as const, currency: 'USD', total_minor: 100000, due_date: '2026-08-01' },
      { id: '2', client_id: 'client-A', status: 'sent' as const, currency: 'NGN', total_minor: 5000000, due_date: '2026-08-01' }
    ];
    const payments = [
      { invoice_id: '1', client_id: 'client-A', amount_minor: 20000, currency: 'USD', occurred_at: '2026-07-25' }
    ];

    const outstanding = outstandingByCurrency(invoices, payments, '2026-07-25');
    
    // Explicitly assert we have exactly two separate aggregate entries
    expect(outstanding.length).toBe(2);

    const usdTotal = outstanding.find(o => o.currency === 'USD');
    const ngnTotal = outstanding.find(o => o.currency === 'NGN');

    expect(usdTotal).toBeDefined();
    expect(ngnTotal).toBeDefined();

    expect(usdTotal?.amountMinor).toBe(80000); // 100000 - 20000
    expect(ngnTotal?.amountMinor).toBe(5000000); // no payments in NGN
  });

  // Criterion 13 — earningsByCurrency respects the date window and subtracts reversals
  test('Criterion 13: Earnings date filtering and reversals subtraction', () => {
    const payments = [
      { invoice_id: '1', client_id: 'client-A', amount_minor: 30000, currency: 'USD', occurred_at: '2026-07-10' },
      { invoice_id: '1', client_id: 'client-A', amount_minor: 20000, currency: 'USD', occurred_at: '2026-07-15' },
      { invoice_id: '1', client_id: 'client-A', amount_minor: -10000, currency: 'USD', occurred_at: '2026-07-20' }, // Reversal within window
      { invoice_id: '1', client_id: 'client-A', amount_minor: 50000, currency: 'USD', occurred_at: '2026-07-30' }  // Outside window
    ];

    const earnings = earningsByCurrency(payments, '2026-07-01', '2026-07-25');
    const usdTotal = earnings.find(e => e.currency === 'USD');

    expect(usdTotal?.amountMinor).toBe(40000); // 30000 + 20000 - 10000 = 40000
  });

  // Criterion 14 — sortCurrencyTotals places the default currency first regardless of amount
  test('Criterion 14: sortCurrencyTotals sorting order', () => {
    const totals = [
      { currency: 'EUR', amountMinor: 100000 },
      { currency: 'USD', amountMinor: 5000 }, // USD has lower amount but is default
      { currency: 'NGN', amountMinor: 2000000 }
    ];

    const sorted = sortCurrencyTotals(totals, 'USD');

    expect(sorted[0].currency).toBe('USD');
    expect(sorted[1].currency).toBe('EUR');
    expect(sorted[2].currency).toBe('NGN');
  });

  // Criterion 15 — suggestNextInvoiceNumber(['INV-0007','INV-0002']) returns 'INV-0008'; [] returns 'INV-0001'
  test('Criterion 15: suggestNextInvoiceNumber formats and increments', () => {
    const suggest1 = suggestNextInvoiceNumber(['INV-0007', 'INV-0002']);
    const suggest2 = suggestNextInvoiceNumber([]);
    const suggest3 = suggestNextInvoiceNumber(['F-0010', 'F-0002']); // different prefixes

    expect(suggest1).toBe('INV-0008');
    expect(suggest2).toBe('INV-0001');
    expect(suggest3).toBe('F-0011');
  });

});
