import React from 'react';
import { useParams, useSearchParams } from 'react-router-dom';
import { X } from 'lucide-react';
import { useSearchSessionStore } from './search-session-store';
import { Button } from '@/components/ui/button';
import { cn } from '@/lib/utils';

export interface SearchFeedbackPromptProps {
  lessonId?: string;
  searchSessionId?: string;
  className?: string;
}

/**
 * Non-intrusive floating feedback banner asking students:
 * "Avez-vous trouvé ce que vous cherchiez ?"
 * Rendered at the bottom of the lesson detail view when reached from search (Story FE-3.4).
 */
export function SearchFeedbackPrompt({
  lessonId: propLessonId,
  searchSessionId: propSessionId,
  className,
}: SearchFeedbackPromptProps) {
  const { lessonId: paramLessonId } = useParams<{ lessonId: string }>();
  const [searchParams] = useSearchParams();

  const currentLessonId = propLessonId || paramLessonId;
  const querySessionId =
    searchParams.get('session_id') ||
    searchParams.get('search_session_id') ||
    undefined;

  const storeSessionId = useSearchSessionStore((s) => s.sessionId);
  const storeStatus = useSearchSessionStore((s) => s.status);
  const lastOpenedLessonId = useSearchSessionStore((s) => s.lastOpenedLessonId);
  // Subscribe to feedbackDoneSessionIds for reactive re-render when feedback state changes
  useSearchSessionStore((s) => s.feedbackDoneSessionIds);
  const isFeedbackDone = useSearchSessionStore((s) => s.isFeedbackDone);
  const answerSession = useSearchSessionStore((s) => s.answerSession);
  const dismissFeedback = useSearchSessionStore((s) => s.dismissFeedback);
  const clearLastOpenedLessonId = useSearchSessionStore((s) => s.clearLastOpenedLessonId);

  // Eligible only when lesson was opened from a search session (status: 'closed' or 'active' with matching lessonId),
  // or explicit searchSessionId passed via props or query params
  const isStoreEligible =
    Boolean(storeSessionId) &&
    (storeStatus === 'closed' || storeStatus === 'active') &&
    lastOpenedLessonId === currentLessonId;

  const activeSessionId =
    propSessionId ||
    (isStoreEligible ? storeSessionId : null) ||
    querySessionId ||
    null;

  const [isDismissed, setIsDismissed] = React.useState(false);
  const submittingRef = React.useRef(false);

  // Reset local dismissal and submitting ref if activeSessionId changes on a mounted prompt
  React.useEffect(() => {
    setIsDismissed(false);
    submittingRef.current = false;
  }, [activeSessionId]);

  // Clear lastOpenedLessonId on unmount to avoid resurrecting the prompt on direct navigation
  React.useEffect(() => {
    return () => {
      clearLastOpenedLessonId();
    };
  }, [clearLastOpenedLessonId]);

  // Guard: Never display if no eligible lesson/session, if already dismissed in component state,
  // or if already answered/dismissed in store or sessionStorage
  if (
    !currentLessonId ||
    !activeSessionId ||
    isDismissed ||
    isFeedbackDone(activeSessionId)
  ) {
    return null;
  }

  const handleAnswer = async (found: boolean) => {
    if (submittingRef.current || isDismissed) {
      return;
    }
    submittingRef.current = true;
    setIsDismissed(true);
    await answerSession(found, activeSessionId);
  };

  const handleDismiss = () => {
    if (submittingRef.current || isDismissed) {
      return;
    }
    submittingRef.current = true;
    setIsDismissed(true);
    dismissFeedback(activeSessionId);
  };

  return (
    <aside
      role="region"
      aria-label="Retour sur la recherche"
      aria-live="polite"
      data-testid="search-feedback-prompt"
      className={cn(
        'fixed bottom-4 left-1/2 -translate-x-1/2 z-40 w-[calc(100%-2rem)] max-w-lg pointer-events-auto',
        'bg-info-surface border border-info-border rounded-lg shadow-lg',
        'p-3 sm:px-4 sm:py-3',
        'flex items-center justify-between gap-3 flex-wrap sm:flex-nowrap',
        'text-foreground select-none',
        className
      )}
    >
      <p
        data-testid="search-feedback-question"
        className="text-xs sm:text-sm font-medium text-foreground flex-1 min-w-[200px]"
      >
        Avez-vous trouvé ce que vous cherchiez ?
      </p>

      <div className="flex items-center gap-2 shrink-0">
        <Button
          type="button"
          variant="secondary"
          onClick={() => handleAnswer(true)}
          data-testid="search-feedback-yes"
          aria-label="Oui, j'ai trouvé ce que je cherchais"
          className="min-h-[44px] min-w-[44px] px-3.5 text-xs sm:text-sm font-medium"
        >
          Oui
        </Button>
        <Button
          type="button"
          variant="secondary"
          onClick={() => handleAnswer(false)}
          data-testid="search-feedback-no"
          aria-label="Non, je n'ai pas trouvé ce que je cherchais"
          className="min-h-[44px] min-w-[44px] px-3.5 text-xs sm:text-sm font-medium"
        >
          Non
        </Button>
        <Button
          type="button"
          variant="ghost"
          size="icon"
          onClick={handleDismiss}
          data-testid="search-feedback-close"
          aria-label="Fermer le bandeau de retour"
          className="min-h-[44px] min-w-[44px] text-foreground-muted hover:text-foreground shrink-0"
        >
          <X className="h-4 w-4" aria-hidden="true" />
        </Button>
      </div>
    </aside>
  );
}
