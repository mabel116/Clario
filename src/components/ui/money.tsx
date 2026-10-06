import * as React from 'react';
import { cn } from '../../lib/utils';
import { CURRENCIES } from '../../lib/money';

export type MoneyVariant = 'metric' | 'table' | 'inline';
export type MoneyTone = 'default' | 'muted' | 'attention' | 'overdue' | 'positive';

export interface MoneyProps extends React.HTMLAttributes<HTMLSpanElement> {
  value?: number; // major units (e.g. 1182.50)
  amountMinor?: number; // minor units (e.g. 118250)
  currency: string;
  variant?: MoneyVariant;
  tone?: MoneyTone;
}

const toneClass: Record<MoneyTone, string> = {
  default: 'text-gray-900 dark:text-white',
  muted: 'text-gray-500 dark:text-zinc-400',
  attention: 'text-amber-600 dark:text-amber-400',
  overdue: 'text-rose-600 dark:text-rose-400',
  positive: 'text-emerald-600 dark:text-emerald-400',
};

const variantClass: Record<MoneyVariant, string> = {
  metric: 'text-2xl sm:text-3xl font-bold tracking-tight',
  table: 'text-sm font-medium',
  inline: 'text-inherit font-medium',
};

const formatters = new Map<string, Intl.NumberFormat>();

function getFormatter(currency: string, whole: boolean) {
  const code = currency.toUpperCase();
  const key = `${code}:${whole}`;
  let f = formatters.get(key);
  if (!f) {
    const info = CURRENCIES[code];
    const exponent = info ? info.exponent : 2;
    f = new Intl.NumberFormat('en-US', {
      style: 'currency',
      currency: code,
      currencyDisplay: 'narrowSymbol',
      minimumFractionDigits: whole ? 0 : exponent,
      maximumFractionDigits: whole ? 0 : exponent,
    });
    formatters.set(key, f);
  }
  return f;
}

export function Money({
  value,
  amountMinor,
  currency,
  variant = 'table',
  tone = 'default',
  className,
  ...props
}: MoneyProps) {
  const code = (currency || 'USD').toUpperCase();
  const info = CURRENCIES[code];
  const exponent = info ? info.exponent : 2;

  let majorAmount: number;
  if (typeof value === 'number') {
    majorAmount = value;
  } else if (typeof amountMinor === 'number') {
    majorAmount = amountMinor / Math.pow(10, exponent);
  } else {
    majorAmount = 0;
  }

  const isWhole = variant === 'metric' && Number.isInteger(majorAmount);
  const formatter = getFormatter(code, isWhole);

  let parts: Intl.NumberFormatPart[] = [];
  try {
    parts = formatter.formatToParts(majorAmount);
  } catch {
    parts = [{ type: 'literal', value: `${code} ${majorAmount.toFixed(exponent)}` }];
  }

  return (
    <span
      className={cn(
        'tabular-nums inline-flex items-baseline',
        toneClass[tone],
        variantClass[variant],
        className
      )}
      {...props}
    >
      {parts.map((p, i) => {
        let displayVal = p.value;
        if (p.type === 'currency' && info?.symbol) {
          if (displayVal === code || displayVal.includes(code)) {
            displayVal = displayVal.replace(code, info.symbol);
          }
        }

        if (p.type === 'currency' && variant === 'metric') {
          return (
            <span
              key={i}
              className="text-gray-500 dark:text-zinc-400 font-normal mr-0.5 text-[0.8em]"
            >
              {displayVal}
            </span>
          );
        }

        return <span key={i}>{displayVal}</span>;
      })}
    </span>
  );
}
