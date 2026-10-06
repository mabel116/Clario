import * as React from 'react';
import { cn } from '../../lib/utils';

export type BadgeStatus =
  | 'paid'
  | 'completed'
  | 'received'
  | 'active'
  | 'unpaid'
  | 'sent'
  | 'pending'
  | 'overdue'
  | 'reversal'
  | 'reversed'
  | 'failed'
  | 'draft'
  | 'inactive'
  | 'void';

interface BadgeConfig {
  pillClass: string;
  dotClass: string;
  defaultLabel: string;
}

const statusMap: Record<string, BadgeConfig> = {
  // Emerald tone (Paid / Received / Active / Completed)
  paid: {
    pillClass:
      'bg-emerald-50 text-emerald-700 border-emerald-200 dark:bg-emerald-500/10 dark:text-emerald-400 dark:border-emerald-500/20',
    dotClass: 'bg-emerald-500',
    defaultLabel: 'Paid',
  },
  completed: {
    pillClass:
      'bg-emerald-50 text-emerald-700 border-emerald-200 dark:bg-emerald-500/10 dark:text-emerald-400 dark:border-emerald-500/20',
    dotClass: 'bg-emerald-500',
    defaultLabel: 'Completed',
  },
  received: {
    pillClass:
      'bg-emerald-50 text-emerald-700 border-emerald-200 dark:bg-emerald-500/10 dark:text-emerald-400 dark:border-emerald-500/20',
    dotClass: 'bg-emerald-500',
    defaultLabel: 'Received',
  },
  active: {
    pillClass:
      'bg-emerald-50 text-emerald-700 border-emerald-200 dark:bg-emerald-500/10 dark:text-emerald-400 dark:border-emerald-500/20',
    dotClass: 'bg-emerald-500',
    defaultLabel: 'Active',
  },

  // Amber tone (Unpaid / Sent / Pending)
  unpaid: {
    pillClass:
      'bg-amber-50 text-amber-700 border-amber-200 dark:bg-amber-500/10 dark:text-amber-400 dark:border-amber-500/20',
    dotClass: 'bg-amber-500',
    defaultLabel: 'Unpaid',
  },
  sent: {
    pillClass:
      'bg-amber-50 text-amber-700 border-amber-200 dark:bg-amber-500/10 dark:text-amber-400 dark:border-amber-500/20',
    dotClass: 'bg-amber-500',
    defaultLabel: 'Sent',
  },
  pending: {
    pillClass:
      'bg-amber-50 text-amber-700 border-amber-200 dark:bg-amber-500/10 dark:text-amber-400 dark:border-amber-500/20',
    dotClass: 'bg-amber-500',
    defaultLabel: 'Pending',
  },

  // Rose tone (Overdue / Reversal / Reversed / Failed)
  overdue: {
    pillClass:
      'bg-rose-50 text-rose-700 border-rose-200 dark:bg-rose-500/10 dark:text-rose-400 dark:border-rose-500/20',
    dotClass: 'bg-rose-500',
    defaultLabel: 'Overdue',
  },
  reversal: {
    pillClass:
      'bg-rose-50 text-rose-700 border-rose-200 dark:bg-rose-500/10 dark:text-rose-400 dark:border-rose-500/20',
    dotClass: 'bg-rose-500',
    defaultLabel: 'Reversal',
  },
  reversed: {
    pillClass:
      'bg-rose-50 text-rose-700 border-rose-200 dark:bg-rose-500/10 dark:text-rose-400 dark:border-rose-500/20',
    dotClass: 'bg-rose-500',
    defaultLabel: 'Reversed',
  },
  failed: {
    pillClass:
      'bg-rose-50 text-rose-700 border-rose-200 dark:bg-rose-500/10 dark:text-rose-400 dark:border-rose-500/20',
    dotClass: 'bg-rose-500',
    defaultLabel: 'Failed',
  },

  // Neutral tone (Draft / Inactive / Void)
  draft: {
    pillClass:
      'bg-gray-100 text-gray-700 border-gray-200 dark:bg-zinc-800/60 dark:text-zinc-300 dark:border-zinc-700',
    dotClass: 'bg-gray-400 dark:bg-zinc-500',
    defaultLabel: 'Draft',
  },
  inactive: {
    pillClass:
      'bg-gray-100 text-gray-700 border-gray-200 dark:bg-zinc-800/60 dark:text-zinc-300 dark:border-zinc-700',
    dotClass: 'bg-gray-400 dark:bg-zinc-500',
    defaultLabel: 'Inactive',
  },
  void: {
    pillClass:
      'bg-gray-100 text-gray-700 border-gray-200 dark:bg-zinc-800/60 dark:text-zinc-300 dark:border-zinc-700',
    dotClass: 'bg-gray-400 dark:bg-zinc-500',
    defaultLabel: 'Void',
  },
};

export interface BadgeProps extends React.HTMLAttributes<HTMLSpanElement> {
  status: BadgeStatus | string;
  showDot?: boolean;
}

export function Badge({
  status,
  showDot = true,
  children,
  className,
  ...props
}: BadgeProps) {
  const normalizedKey = (status || '').toLowerCase().trim();
  const config = statusMap[normalizedKey] || statusMap.draft;

  return (
    <span
      className={cn(
        'inline-flex items-center gap-1.5 rounded-full px-2.5 py-0.5 text-xs font-medium border select-none',
        config.pillClass,
        className
      )}
      {...props}
    >
      {showDot && (
        <span
          className={cn('h-1.5 w-1.5 rounded-full shrink-0', config.dotClass)}
          aria-hidden="true"
        />
      )}
      <span>{children || config.defaultLabel}</span>
    </span>
  );
}

export { Badge as StatusBadge };
