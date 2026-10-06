import * as React from 'react';
import { cn } from '../../lib/utils';

export interface InputProps extends React.InputHTMLAttributes<HTMLInputElement> {
  leadingIcon?: React.ReactNode;
  trailingIcon?: React.ReactNode;
}

const Input = React.forwardRef<HTMLInputElement, InputProps>(
  ({ className, type, leadingIcon, trailingIcon, disabled, ...props }, ref) => {
    if (leadingIcon || trailingIcon) {
      return (
        <div className="relative flex items-center w-full">
          {leadingIcon && (
            <div className="pointer-events-none absolute left-3 flex items-center justify-center text-gray-400 dark:text-zinc-500">
              {leadingIcon}
            </div>
          )}
          <input
            type={type}
            className={cn(
              'flex h-10 w-full rounded-lg border border-gray-200 dark:border-[#27272a] bg-white dark:bg-[#121215] px-3 py-2 text-base sm:text-sm text-gray-900 dark:text-white placeholder:text-gray-400 dark:placeholder:text-zinc-500 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-blue-500 disabled:cursor-not-allowed disabled:opacity-50 transition-colors',
              leadingIcon && 'pl-10',
              trailingIcon && 'pr-10',
              className
            )}
            ref={ref}
            disabled={disabled}
            {...props}
          />
          {trailingIcon && (
            <div className="absolute right-3 flex items-center justify-center text-gray-400 dark:text-zinc-500">
              {trailingIcon}
            </div>
          )}
        </div>
      );
    }

    return (
      <input
        type={type}
        className={cn(
          'flex h-10 w-full rounded-lg border border-gray-200 dark:border-[#27272a] bg-white dark:bg-[#121215] px-3 py-2 text-base sm:text-sm text-gray-900 dark:text-white placeholder:text-gray-400 dark:placeholder:text-zinc-500 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-blue-500 disabled:cursor-not-allowed disabled:opacity-50 transition-colors',
          className
        )}
        ref={ref}
        disabled={disabled}
        {...props}
      />
    );
  }
);
Input.displayName = 'Input';

export { Input };
