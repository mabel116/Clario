import * as React from 'react';
import { cva, type VariantProps } from 'class-variance-authority';
import { cn } from '../../lib/utils';
import { Loader2 } from 'lucide-react';

const buttonVariants = cva(
  'inline-flex items-center justify-center gap-2 whitespace-nowrap rounded-lg font-medium transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-blue-500 disabled:pointer-events-none disabled:opacity-50 tap-target select-none',
  {
    variants: {
      variant: {
        primary:
          'bg-blue-600 hover:bg-blue-700 text-white font-semibold shadow-sm dark:bg-blue-500 dark:hover:bg-blue-400 dark:shadow-blue-500/20',
        secondary:
          'bg-white hover:bg-gray-50 text-gray-700 border border-gray-200 dark:bg-[#121215] dark:hover:bg-[#1c1c21] dark:text-zinc-300 dark:border-[#27272a]',
        destructive:
          'bg-rose-50 hover:bg-rose-100 text-rose-700 border border-rose-200 dark:bg-rose-500/10 dark:hover:bg-rose-500/20 dark:text-rose-400 dark:border-rose-500/20',
        ghost:
          'hover:bg-gray-100 text-gray-500 hover:text-gray-900 dark:hover:bg-[#1c1c21] dark:text-zinc-400 dark:hover:text-white',
      },
      size: {
        md: 'h-10 px-4 text-sm font-semibold',
        sm: 'h-8 px-2.5 text-xs font-medium',
        icon: 'h-9 w-9 p-0',
      },
    },
    defaultVariants: {
      variant: 'primary',
      size: 'md',
    },
  }
);

export interface ButtonProps
  extends React.ButtonHTMLAttributes<HTMLButtonElement>,
    VariantProps<typeof buttonVariants> {
  isLoading?: boolean;
}

const Button = React.forwardRef<HTMLButtonElement, ButtonProps>(
  ({ className, variant, size, isLoading, children, disabled, ...props }, ref) => {
    return (
      <button
        className={cn(buttonVariants({ variant, size, className }))}
        ref={ref}
        disabled={disabled || isLoading}
        {...props}
      >
        {isLoading ? (
          <>
            <Loader2 className="h-4 w-4 animate-spin shrink-0" aria-hidden="true" />
            <span>{children}</span>
          </>
        ) : (
          children
        )}
      </button>
    );
  }
);
Button.displayName = 'Button';

export { Button, buttonVariants };
