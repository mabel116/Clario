export interface Money {
  amountMinor: number;
  currency: string;
}

export interface CurrencyInfo {
  code: string;
  symbol: string;
  name: string;
  exponent: number;
}

export const CURRENCIES: Record<string, CurrencyInfo> = {
  NGN: { code: 'NGN', symbol: '₦', name: 'Nigerian Naira', exponent: 2 },
  USD: { code: 'USD', symbol: '$', name: 'US Dollar', exponent: 2 },
  EUR: { code: 'EUR', symbol: '€', name: 'Euro', exponent: 2 },
  GBP: { code: 'GBP', symbol: '£', name: 'British Pound', exponent: 2 },
  KES: { code: 'KES', symbol: 'KSh', name: 'Kenyan Shilling', exponent: 2 },
  GHS: { code: 'GHS', symbol: 'GH₵', name: 'Ghanaian Cedi', exponent: 2 },
  ZAR: { code: 'ZAR', symbol: 'R', name: 'South African Rand', exponent: 2 },
  CAD: { code: 'CAD', symbol: 'CA$', name: 'Canadian Dollar', exponent: 2 },
  AUD: { code: 'AUD', symbol: 'A$', name: 'Australian Dollar', exponent: 2 },
  INR: { code: 'INR', symbol: '₹', name: 'Indian Rupee', exponent: 2 },
  JPY: { code: 'JPY', symbol: '¥', name: 'Japanese Yen', exponent: 0 },
  KRW: { code: 'KRW', symbol: '₩', name: 'South Korean Won', exponent: 0 }
};

export function addMoney(a: Money, b: Money): Money {
  if (a.currency.toUpperCase() !== b.currency.toUpperCase()) {
    throw new Error(`Currency mismatch in addMoney: cannot add ${a.currency} and ${b.currency}`);
  }
  return {
    amountMinor: a.amountMinor + b.amountMinor,
    currency: a.currency.toUpperCase()
  };
}

export function subtractMoney(a: Money, b: Money): Money {
  if (a.currency.toUpperCase() !== b.currency.toUpperCase()) {
    throw new Error(`Currency mismatch in subtractMoney: cannot subtract ${b.currency} from ${a.currency}`);
  }
  return {
    amountMinor: a.amountMinor - b.amountMinor,
    currency: a.currency.toUpperCase()
  };
}

export function sumMoney(amounts: Money[], defaultCurrency = 'USD'): Money {
  if (amounts.length === 0) {
    return { amountMinor: 0, currency: defaultCurrency.toUpperCase() };
  }
  const currency = amounts[0].currency.toUpperCase();
  let total = 0;
  for (const m of amounts) {
    if (m.currency.toUpperCase() !== currency) {
      throw new Error(`Currency mismatch in sumMoney: mixed currencies ${currency} and ${m.currency}`);
    }
    total += m.amountMinor;
  }
  return { amountMinor: total, currency };
}

export function multiplyMinor(amountMinor: number, quantity: number): number {
  const val = amountMinor * quantity;
  // Fix minor float representation issues (e.g. 832.5000000000001 or similar)
  const normalized = Math.round(val * 1e10) / 1e10;
  return Math.round(normalized);
}

export function formatMoney(money: Money): string {
  const currencyCode = money.currency.toUpperCase();
  const info = CURRENCIES[currencyCode];
  if (!info) {
    throw new Error(`Unsupported currency: ${money.currency}`);
  }
  const divisor = Math.pow(10, info.exponent);
  const majorAmount = money.amountMinor / divisor;

  const formatter = new Intl.NumberFormat('en-US', {
    style: 'currency',
    currency: currencyCode,
    minimumFractionDigits: info.exponent,
    maximumFractionDigits: info.exponent
  });
  let result = formatter.format(majorAmount);

  // Fallback for Node test environment locale formatting gaps (e.g. NGN -> ₦ symbol translation)
  if (result.includes(currencyCode)) {
    result = result.replace(currencyCode, info.symbol);
  }
  return result;
}

export function parseMoneyInput(text: string, currency: string): Money {
  const currencyCode = currency.toUpperCase();
  const info = CURRENCIES[currencyCode];
  if (!info) {
    throw new Error(`Unsupported currency: ${currency}`);
  }

  let clean = text.replace(/,/g, '').trim();
  if (!clean) {
    return { amountMinor: 0, currency: currencyCode };
  }

  let sign = 1;
  if (clean.startsWith('-')) {
    sign = -1;
    clean = clean.substring(1);
  } else if (clean.startsWith('+')) {
    clean = clean.substring(1);
  }

  // Support inputs like "12", "12.5", ".5", "12."
  if (!/^(?:\d+\.?\d*|\.\d+)$/.test(clean)) {
    throw new Error('Invalid money format: contains non-numeric characters');
  }

  const parsedFloat = parseFloat(clean);
  if (isNaN(parsedFloat)) {
    throw new Error('Invalid money format');
  }

  const exponent = info.exponent;
  const rawVal = parsedFloat * Math.pow(10, exponent);
  // Two-stage rounding to prevent floating-point drift inaccuracies
  const precisionNormalized = Math.round(rawVal * 1e10) / 1e10;
  const finalAmount = sign * Math.round(precisionNormalized);

  return { amountMinor: finalAmount, currency: currencyCode };
}
