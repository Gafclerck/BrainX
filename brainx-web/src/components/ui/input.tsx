import * as React from 'react';
import { cn } from '@/lib/utils';

export interface InputProps extends React.InputHTMLAttributes<HTMLInputElement> {
  error?: boolean;
}

const Input = React.forwardRef<HTMLInputElement, InputProps>(
  ({ className, type = 'text', error, ...props }, ref) => {
    const isInvalid = Boolean(
      error ||
      props['aria-invalid'] === true ||
      props['aria-invalid'] === 'true'
    );

    return (
      <input
        type={type}
        ref={ref}
        {...props}
        className={cn(
          'flex h-10 w-full min-h-[44px] rounded-md border bg-surface px-3 py-2 text-sm text-foreground',
          'placeholder:text-foreground-subtle transition-colors',
          'focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-offset-2 focus-visible:ring-offset-background',
          'disabled:cursor-not-allowed disabled:opacity-50 select-text',
          isInvalid
            ? 'border-destructive focus-visible:ring-destructive'
            : 'border-border focus-visible:ring-primary',
          className
        )}
        aria-invalid={isInvalid ? 'true' : undefined}
      />
    );
  }
);
Input.displayName = 'Input';

export { Input };
