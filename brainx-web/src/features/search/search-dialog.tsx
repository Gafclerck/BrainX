import React from 'react';
import { useNavigate } from 'react-router-dom';
import * as DialogPrimitive from '@radix-ui/react-dialog';
import { Search, Loader2, X } from 'lucide-react';
import { useSearchStore } from './search-store';
import { cn } from '@/lib/utils';

export function SearchDialog() {
  const navigate = useNavigate();
  const inputRef = React.useRef<HTMLInputElement>(null);
  const triggerRef = React.useRef<HTMLElement | null>(null);

  const isOpen = useSearchStore((s) => s.isOpen);
  const query = useSearchStore((s) => s.query);
  const results = useSearchStore((s) => s.results);
  const count = useSearchStore((s) => s.count);
  const isLoading = useSearchStore((s) => s.isLoading);
  const isDebouncing = useSearchStore((s) => s.isDebouncing);
  const hasSearched = useSearchStore((s) => s.hasSearched);
  const lastSearchedQuery = useSearchStore((s) => s.lastSearchedQuery);
  const error = useSearchStore((s) => s.error);
  const validationError = useSearchStore((s) => s.validationError);

  const closeSearch = useSearchStore((s) => s.closeSearch);
  const setQuery = useSearchStore((s) => s.setQuery);
  const search = useSearchStore((s) => s.search);

  // Capture the triggering active element when opened to ensure focus restoration
  React.useEffect(() => {
    if (isOpen) {
      triggerRef.current =
        (document.activeElement as HTMLElement) ??
        document.querySelector<HTMLElement>('[data-testid="search-trigger"]');
      const timer = setTimeout(() => {
        inputRef.current?.focus();
      }, 0);
      return () => clearTimeout(timer);
    }
  }, [isOpen]);

  const handleOpenChange = (open: boolean) => {
    if (!open) {
      closeSearch();
    }
  };

  const handleSelectLesson = (lessonId: string) => {
    closeSearch();
    navigate(`/lessons/${lessonId}`);
  };

  const handleKeyDown = (e: React.KeyboardEvent<HTMLInputElement>) => {
    if (e.key === 'Enter') {
      e.preventDefault();
      const trimmed = query.trim();
      if (trimmed.length >= 3 && trimmed.length <= 200) {
        search(trimmed);
      }
    }
  };

  const trimmedQuery = query.trim();
  const hasNoResults =
    !isLoading &&
    !isDebouncing &&
    !error &&
    !validationError &&
    trimmedQuery.length >= 3 &&
    hasSearched &&
    lastSearchedQuery === trimmedQuery &&
    results.length === 0;

  return (
    <DialogPrimitive.Root open={isOpen} onOpenChange={handleOpenChange}>
      <DialogPrimitive.Portal>
        <DialogPrimitive.Overlay
          data-testid="search-dialog-backdrop"
          className="fixed inset-0 z-50 bg-black/70 backdrop-blur-sm data-[state=open]:animate-in data-[state=closed]:animate-out data-[state=closed]:fade-out-0 data-[state=open]:fade-in-0"
        />
        <DialogPrimitive.Content
          data-testid="search-dialog-content"
          aria-label="Palette de recherche globale"
          onOpenAutoFocus={(e) => {
            e.preventDefault();
            inputRef.current?.focus();
          }}
          onCloseAutoFocus={(e) => {
            const trigger =
              triggerRef.current ??
              document.querySelector<HTMLElement>('[data-testid="search-trigger"]');
            if (trigger && trigger.isConnected && typeof trigger.focus === 'function') {
              e.preventDefault();
              trigger.focus();
            }
          }}
          className={cn(
            // Mobile full screen (< 768px), maintaining 360px viewport floor
            'fixed inset-0 z-50 flex flex-col w-full h-full max-w-none max-h-none rounded-none bg-surface min-w-[360px] text-foreground focus:outline-none overflow-hidden duration-200',
            // Desktop centered modal (≥ 768px)
            'md:inset-auto md:left-1/2 md:top-[10vh] md:-translate-x-1/2 md:w-full md:max-w-2xl md:h-auto md:max-h-[80vh] md:rounded-lg md:border md:border-border md:shadow-2xl'
          )}
        >
          <DialogPrimitive.Title className="sr-only">
            Recherche globale
          </DialogPrimitive.Title>
          <DialogPrimitive.Description className="sr-only">
            Rechercher des leçons dans l'ensemble des cours
          </DialogPrimitive.Description>

          {/* Search Input Bar */}
          <div className="flex items-center gap-2 border-b border-border px-3 sm:px-4 py-2 sm:py-3 shrink-0 bg-surface">
            <Search className="h-5 w-5 text-foreground-muted shrink-0" aria-hidden="true" />
            <input
              ref={inputRef}
              data-testid="search-dialog-input"
              type="text"
              value={query}
              onChange={(e) => setQuery(e.target.value)}
              onKeyDown={handleKeyDown}
              placeholder="Rechercher des leçons, cours..."
              aria-label="Rechercher"
              autoFocus
              className="flex-1 bg-transparent text-foreground placeholder:text-foreground-muted focus:outline-none text-base sm:text-sm h-10 min-w-0"
            />
            {isLoading && (
              <div
                data-testid="search-loading-indicator"
                className="shrink-0 flex items-center justify-center h-8 w-8 text-primary"
              >
                <Loader2 className="h-4 w-4 animate-spin" />
                <span className="sr-only">Chargement...</span>
              </div>
            )}
            {query.length > 0 && (
              <button
                type="button"
                data-testid="search-clear-button"
                aria-label="Effacer la recherche"
                onClick={() => setQuery('')}
                className="inline-flex items-center justify-center h-8 w-8 text-foreground-muted hover:text-foreground rounded focus:outline-none focus:ring-2 focus:ring-border-focus"
              >
                <X className="h-4 w-4" />
              </button>
            )}
            <DialogPrimitive.Close
              data-testid="search-dialog-close"
              aria-label="Fermer"
              className="inline-flex h-12 w-12 min-h-[48px] min-w-[48px] items-center justify-center rounded-md text-foreground-muted hover:text-foreground hover:bg-surface border border-transparent hover:border-border focus:outline-none focus:ring-2 focus:ring-border-focus"
            >
              <X className="h-5 w-5" />
              <span className="sr-only">Fermer</span>
            </DialogPrimitive.Close>
          </div>

          {/* Search Body Content */}
          <div className="flex-1 overflow-y-auto p-4 space-y-4">
            {/* Validation Error (> 200 chars) */}
            {validationError && trimmedQuery.length > 200 && (
              <div
                data-testid="search-validation-error"
                className="p-4 rounded-md bg-destructive/10 border border-destructive/20 text-destructive text-sm"
                role="alert"
              >
                {validationError}
              </div>
            )}

            {/* Guidance Message (< 3 chars) */}
            {validationError && trimmedQuery.length > 0 && trimmedQuery.length < 3 && (
              <div
                data-testid="search-guidance-message"
                className="p-4 rounded-md bg-surface text-foreground-muted text-sm text-center border border-border"
              >
                {validationError}
              </div>
            )}

            {/* Neutral Initial Prompt (empty query) */}
            {trimmedQuery.length === 0 && (
              <div
                data-testid="search-neutral-prompt"
                className="py-12 text-center text-foreground-muted text-sm space-y-2"
              >
                <p className="font-medium text-foreground">Recherche globale</p>
                <p>Saisissez des mots-clés pour rechercher des leçons dans l'ensemble des cours.</p>
              </div>
            )}

            {/* API Error Notice */}
            {error && !isLoading && (
              <div
                data-testid="search-error-notice"
                className="p-4 rounded-md bg-destructive/10 border border-destructive/20 text-destructive text-sm space-y-1"
                role="alert"
              >
                <p className="font-semibold">Erreur de recherche</p>
                <p>{error}</p>
              </div>
            )}

            {/* Empty Results State */}
            {hasNoResults && (
              <div
                data-testid="search-empty-results"
                className="py-12 text-center text-foreground-muted text-sm space-y-1"
              >
                <p className="font-medium text-foreground">Aucun résultat</p>
                <p>
                  Aucune leçon trouvée pour "{query}". Essayez un mot-clé plus court ou un nom d'enseignant.
                </p>
              </div>
            )}

            {/* Results List */}
            {trimmedQuery.length >= 3 && results.length > 0 && !isLoading && !error && (
              <div
                data-testid="search-results-list"
                className="space-y-2"
                role="listbox"
                aria-label="Résultats de recherche"
              >
                {results.map((lesson) => (
                  <button
                    key={lesson.id}
                    type="button"
                    data-testid={`search-result-item-${lesson.id}`}
                    onClick={() => handleSelectLesson(lesson.id)}
                    className="w-full text-left p-3 rounded-md bg-background/50 hover:bg-surface border border-border hover:border-border-focus transition-colors flex flex-col gap-1 focus:outline-none focus:ring-2 focus:ring-border-focus"
                    role="option"
                    aria-selected="false"
                  >
                    <div className="flex items-center justify-between gap-2">
                      <span className="font-medium text-foreground text-sm line-clamp-1">
                        {lesson.title}
                      </span>
                      {lesson.course_date && (
                        <span className="text-xs text-foreground-muted shrink-0 font-mono">
                          {lesson.course_date}
                        </span>
                      )}
                    </div>
                    <div className="flex items-center gap-1.5 text-xs text-foreground-muted truncate">
                      <span>{lesson.course_name}</span>
                      <span>›</span>
                      <span>{lesson.module_name}</span>
                      <span>›</span>
                      <span>{lesson.chapter_name}</span>
                    </div>
                    {lesson.teacher && (
                      <div className="text-xs text-foreground-subtle">
                        Enseignant : {lesson.teacher}
                      </div>
                    )}
                  </button>
                ))}
              </div>
            )}
          </div>

          {/* Desktop Palette Footer */}
          <div className="hidden md:flex items-center justify-between border-t border-border px-4 py-2.5 bg-surface/50 text-xs text-foreground-muted shrink-0">
            <div className="flex items-center gap-4">
              <span className="flex items-center gap-1.5">
                <kbd className="px-1.5 py-0.5 rounded bg-surface border border-border font-mono text-[10px]">
                  Échap
                </kbd>
                <span>Fermer</span>
              </span>
            </div>
            {count > 0 && (
              <span>
                {count} {count === 1 ? 'résultat' : 'résultats'}
              </span>
            )}
          </div>
        </DialogPrimitive.Content>
      </DialogPrimitive.Portal>
    </DialogPrimitive.Root>
  );
}
