import * as React from 'react';
import { AlertTriangle } from 'lucide-react';
import { cn } from '@/lib/utils';

export interface ThrottledBannerProps extends React.HTMLAttributes<HTMLDivElement> {
  seconds: number;
  onExpire?: () => void;
  detail?: string;
}

export function ThrottledBanner({
  seconds,
  onExpire,
  detail,
  className,
  ...props
}: ThrottledBannerProps) {
  const [remaining, setRemaining] = React.useState<number>(Math.max(0, seconds));
  const onExpireRef = React.useRef(onExpire);
  onExpireRef.current = onExpire;

  React.useEffect(() => {
    const initialSeconds = Math.max(0, seconds);
    setRemaining(initialSeconds);

    if (initialSeconds <= 0) {
      onExpireRef.current?.();
      return;
    }

    const targetTime = Date.now() + initialSeconds * 1000;

    const timer = setInterval(() => {
      const diffMs = targetTime - Date.now();
      const nextRemaining = Math.max(0, Math.ceil(diffMs / 1000));
      setRemaining(nextRemaining);

      if (nextRemaining <= 0) {
        clearInterval(timer);
        onExpireRef.current?.();
      }
    }, 250);

    return () => clearInterval(timer);
  }, [seconds]);

  if (remaining <= 0) {
    return null;
  }

  return (
    <div
      role="alert"
      data-testid="throttled-banner"
      className={cn(
        'flex items-start gap-3 rounded-md border border-warning-border bg-warning-surface p-4 text-sm text-warning',
        className
      )}
      {...props}
    >
      <AlertTriangle className="h-5 w-5 shrink-0 mt-0.5 text-warning" />
      <div className="flex-1 space-y-1">
        <p className="font-medium text-warning" aria-live="polite">
          {detail || 'Trop de requêtes. Veuillez patienter avant de réessayer.'}
        </p>
        <p className="font-mono text-xs">
          <span data-testid="countdown-timer" aria-hidden="true">
            {remaining}s restantes
          </span>
        </p>
      </div>
    </div>
  );
}
