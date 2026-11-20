import { useState } from 'react';
import { MessageSquarePlus } from 'lucide-react';
import { FeedbackModal } from './feedback-modal';
import { cn } from '@/lib/utils';

export interface FeedbackWidgetProps {
  className?: string;
}

export function FeedbackWidget({ className }: FeedbackWidgetProps) {
  const [isOpen, setIsOpen] = useState(false);

  return (
    <>
      <div
        data-testid="feedback-widget-container"
        className={cn('fixed bottom-5 right-5 z-40 select-none print:hidden', className)}
      >
        <button
          type="button"
          data-testid="feedback-widget-trigger"
          onClick={() => setIsOpen(true)}
          aria-label="Ouvrir la boîte à suggestions"
          className={cn(
            'group relative flex items-center justify-center gap-2',
            'h-12 px-3.5 sm:px-4 rounded-full',
            'bg-primary text-primary-foreground shadow-lg hover:shadow-xl',
            'transition-all duration-200 transform hover:scale-105 active:scale-95',
            'focus:outline-none focus-visible:ring-2 focus-visible:ring-primary focus-visible:ring-offset-2'
          )}
        >
          <MessageSquarePlus className="h-5 w-5 shrink-0 transition-transform group-hover:rotate-6" />
          <span className="hidden sm:inline-block text-xs font-semibold tracking-wide">
            Suggestions
          </span>

          {/* Tooltip for mobile or icon-only */}
          <span
            role="tooltip"
            className="sm:hidden pointer-events-none absolute bottom-full mb-2 right-0 hidden group-hover:block whitespace-nowrap rounded-md bg-popover px-2.5 py-1 text-xs text-foreground shadow-md border border-border"
          >
            Donnez votre avis
          </span>
        </button>
      </div>

      <FeedbackModal isOpen={isOpen} onClose={() => setIsOpen(false)} />
    </>
  );
}
