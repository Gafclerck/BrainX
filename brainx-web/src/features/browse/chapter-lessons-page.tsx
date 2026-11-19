import { useEffect, useState, useCallback, useRef, type FormEvent } from 'react';
import { useParams, Link } from 'react-router-dom';
import {
  AlertCircle,
  RefreshCw,
  BookOpen,
  Calendar,
  User,
  ChevronLeft,
  ChevronRight,
} from 'lucide-react';
import { fetchChapterLessons } from './api';
import type {
  BrowseLessonItem,
  BrowseLessonFilterParams,
  BrowseViewState,
} from './types';
import { ApiError } from '@/lib/api';
import { Button } from '@/components/ui/button';
import { ResourceBadge } from '@/components/ui/resource-badge';

export function ChapterLessonsPage() {
  const { chapterId } = useParams<{ chapterId: string }>();

  const [viewState, setViewState] = useState<BrowseViewState<BrowseLessonItem>>({
    status: 'loading',
  });

  // Filter input states (form state)
  const [dateFrom, setDateFrom] = useState<string>('');
  const [dateTo, setDateTo] = useState<string>('');

  // Applied filter state for API query
  const [appliedFilters, setAppliedFilters] = useState<BrowseLessonFilterParams>({});
  const [currentPage, setCurrentPage] = useState<number>(1);

  const prevChapterIdRef = useRef<string | undefined>(chapterId);

  const loadLessons = useCallback(
    async (
      cid: string,
      filters: BrowseLessonFilterParams,
      page: number,
      checkCancelled?: () => boolean
    ) => {
      setViewState({ status: 'loading' });
      try {
        const response = await fetchChapterLessons(cid, filters, page);
        if (!checkCancelled || !checkCancelled()) {
          setViewState({ status: 'success', data: response });
        }
      } catch (err: unknown) {
        if (checkCancelled && checkCancelled()) return;

        const isApiError = err instanceof ApiError;
        const status = isApiError
          ? err.envelope.status
          : (err as { status?: number })?.status;

        const is404 = status === 404;
        const is400 = status === 400;
        const fieldErrors =
          isApiError && err.envelope.errors ? err.envelope.errors : undefined;

        let message = 'Impossible de récupérer la liste des leçons pour le moment.';
        if (isApiError && err.envelope.detail) {
          message = err.envelope.detail;
        } else if (is404) {
          message = 'Contenu introuvable ou non publié.';
        } else if (is400) {
          message =
            isApiError && err.envelope.detail
              ? err.envelope.detail
              : 'Paramètres de filtrage invalides.';
        }

        setViewState({
          status: 'error',
          is404: Boolean(is404),
          is400: Boolean(is400),
          fieldErrors,
          message,
        });
      }
    },
    []
  );

  useEffect(() => {
    let isCancelled = false;

    if (!chapterId) {
      setViewState({
        status: 'error',
        is404: true,
        message: 'Contenu introuvable ou non publié.',
      });
      return () => {
        isCancelled = true;
      };
    }

    let targetFilters = appliedFilters;
    let targetPage = currentPage;

    if (prevChapterIdRef.current !== chapterId) {
      prevChapterIdRef.current = chapterId;
      setDateFrom('');
      setDateTo('');
      setAppliedFilters({});
      setCurrentPage(1);
      targetFilters = {};
      targetPage = 1;
    }

    loadLessons(chapterId, targetFilters, targetPage, () => isCancelled);

    return () => {
      isCancelled = true;
    };
  }, [chapterId, appliedFilters, currentPage, loadLessons]);

  const handleFilterSubmit = (e: FormEvent<HTMLFormElement>) => {
    e.preventDefault();
    const cleanFrom = dateFrom.trim();
    const cleanTo = dateTo.trim();

    setAppliedFilters({
      course_date_from: cleanFrom || undefined,
      course_date_to: cleanTo || undefined,
    });
    setCurrentPage(1);
  };

  const handleResetFilter = () => {
    setDateFrom('');
    setDateTo('');
    setAppliedFilters({});
    setCurrentPage(1);
  };

  const handleRetry = () => {
    if (chapterId) {
      loadLessons(chapterId, appliedFilters, currentPage);
    }
  };

  const handleNextPage = () => {
    if (viewState.status === 'success' && viewState.data.next) {
      setCurrentPage((prev) => prev + 1);
    }
  };

  const handlePrevPage = () => {
    if (viewState.status === 'success' && viewState.data.previous) {
      setCurrentPage((prev) => Math.max(1, prev - 1));
    }
  };

  const isFilterActive = Boolean(
    appliedFilters.course_date_from ||
    appliedFilters.course_date_to ||
    dateFrom ||
    dateTo
  );

  const is404 = viewState.status === 'error' && viewState.is404;

  const firstLesson =
    viewState.status === 'success' && viewState.data.results.length > 0
      ? viewState.data.results[0]
      : null;

  return (
    <div
      data-testid="chapter-lessons-page"
      className="w-full min-w-[360px] overflow-x-hidden space-y-6"
    >
      {/* Breadcrumb Navigation linking back to courses */}
      <nav aria-label="Fil d'Ariane">
        <Link
          to="/courses"
          data-testid="back-to-courses-link"
          className="inline-flex items-center text-sm text-foreground-muted hover:text-foreground min-h-[48px] py-2 transition-colors focus:outline-none focus-visible:ring-2 focus-visible:ring-primary rounded"
        >
          <span aria-hidden="true" className="mr-2">←</span>
          Retour aux cours
        </Link>
      </nav>

      {/* Header */}
      <div className="space-y-1">
        <h1 className="text-2xl font-bold tracking-tight text-foreground">
          Leçons du Chapitre
        </h1>
        <p className="text-sm text-foreground-muted">
          {firstLesson
            ? `${firstLesson.chapter_name} (${firstLesson.course_name} — ${firstLesson.module_name})`
            : 'Consultez les leçons publiées de ce chapitre.'}
        </p>
      </div>

      {/* Date Range Filter Bar - only rendered when chapter is found / not 404 */}
      {!is404 && (
        <form
          onSubmit={handleFilterSubmit}
          data-testid="chapter-lessons-filter-form"
          className="rounded-lg border border-border bg-card p-4 space-y-3 sm:space-y-0 sm:flex sm:items-end sm:gap-4"
        >
          <div className="flex-1 space-y-1">
            <label
              htmlFor="filter-date-from"
              className="text-xs font-medium text-foreground-muted block"
            >
              Date de début
            </label>
            <input
              type="date"
              id="filter-date-from"
              name="course_date_from"
              value={dateFrom}
              onChange={(e) => setDateFrom(e.target.value)}
              data-testid="filter-date-from"
              className="w-full min-h-[48px] bg-surface border border-border text-foreground rounded-md px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-primary transition-colors"
            />
          </div>

          <div className="flex-1 space-y-1">
            <label
              htmlFor="filter-date-to"
              className="text-xs font-medium text-foreground-muted block"
            >
              Date de fin
            </label>
            <input
              type="date"
              id="filter-date-to"
              name="course_date_to"
              value={dateTo}
              onChange={(e) => setDateTo(e.target.value)}
              data-testid="filter-date-to"
              className="w-full min-h-[48px] bg-surface border border-border text-foreground rounded-md px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-primary transition-colors"
            />
          </div>

          <div className="flex items-center gap-2 pt-1 sm:pt-0">
            <Button
              type="submit"
              data-testid="filter-submit-btn"
              className="min-h-[48px] px-5 flex-1 sm:flex-none"
            >
              Filtrer
            </Button>

            {isFilterActive && (
              <Button
                type="button"
                variant="secondary"
                onClick={handleResetFilter}
                data-testid="filter-reset-btn"
                className="min-h-[48px] px-4 border-border flex-1 sm:flex-none"
              >
                Réinitialiser
              </Button>
            )}
          </div>
        </form>
      )}

      {/* Loading Skeleton State */}
      {viewState.status === 'loading' && (
        <div
          data-testid="lessons-loading-skeletons"
          role="status"
          aria-busy="true"
          className="space-y-3"
          aria-label="Chargement des leçons"
        >
          {[1, 2, 3].map((i) => (
            <div
              key={i}
              className="rounded-lg border border-border bg-card p-5 space-y-3 min-h-[48px]"
            >
              <div className="h-5 w-1/2 bg-surface animate-pulse rounded" />
              <div className="flex items-center gap-4">
                <div className="h-4 w-1/4 bg-surface animate-pulse rounded" />
                <div className="h-4 w-1/4 bg-surface animate-pulse rounded" />
              </div>
            </div>
          ))}
        </div>
      )}

      {/* Error State: 404 Not Found or Non-Published Chapter */}
      {viewState.status === 'error' && viewState.is404 && (
        <div
          data-testid="chapter-lessons-error-404"
          className="rounded-lg border border-border bg-card p-6 text-center space-y-4 max-w-lg mx-auto"
        >
          <div className="inline-flex items-center justify-center h-12 w-12 rounded-full bg-destructive-surface text-destructive border border-destructive-border mx-auto">
            <AlertCircle className="h-6 w-6" />
          </div>
          <div className="space-y-2">
            <h2 className="text-lg font-semibold text-foreground">
              Contenu introuvable ou non publié.
            </h2>
            <p className="text-sm text-foreground-muted">
              Ce chapitre n'existe pas ou ne contient aucun contenu publié.
            </p>
          </div>
          <Button
            asChild
            variant="secondary"
            className="min-h-[48px] px-6 text-foreground hover:bg-surface border-border"
          >
            <Link to="/courses" data-testid="recovery-courses-link">
              Retour aux cours
            </Link>
          </Button>
        </div>
      )}

      {/* Error State: 400 Bad Request (RFC 9457 Validation Errors) */}
      {viewState.status === 'error' && viewState.is400 && (
        <div
          data-testid="chapter-lessons-error-400"
          role="alert"
          className="rounded-lg border border-destructive-border bg-destructive-surface p-5 text-left space-y-3 max-w-lg mx-auto"
        >
          <div className="flex items-center gap-2 text-destructive">
            <AlertCircle className="h-5 w-5 shrink-0" />
            <h2 className="text-sm font-semibold">
              {viewState.message || 'Paramètre de date invalide.'}
            </h2>
          </div>

          {viewState.fieldErrors && Object.keys(viewState.fieldErrors).length > 0 && (
            <ul
              data-testid="field-errors-list"
              className="text-xs text-foreground-muted list-disc list-inside space-y-1"
            >
              {Object.entries(viewState.fieldErrors).map(([field, rawMessages]) => {
                const messages = Array.isArray(rawMessages)
                  ? rawMessages
                  : [String(rawMessages)];
                return (
                  <li key={field}>
                    <span className="font-mono text-foreground font-semibold">
                      {field}
                    </span>
                    : {messages.join(' ')}
                  </li>
                );
              })}
            </ul>
          )}

          <div className="pt-1">
            <Button
              type="button"
              variant="secondary"
              onClick={handleResetFilter}
              data-testid="error-reset-filter-btn"
              className="min-h-[48px] px-4 text-xs border-border"
            >
              Réinitialiser les filtres
            </Button>
          </div>
        </div>
      )}

      {/* Error State: Network Failure or 500 */}
      {viewState.status === 'error' && !viewState.is404 && !viewState.is400 && (
        <div
          data-testid="chapter-lessons-error-network"
          role="alert"
          className="rounded-lg border border-destructive-border bg-destructive-surface p-6 text-center space-y-4 max-w-lg mx-auto"
        >
          <div className="inline-flex items-center justify-center h-12 w-12 rounded-full bg-destructive/10 text-destructive mx-auto">
            <AlertCircle className="h-6 w-6" />
          </div>
          <div className="space-y-2">
            <h2 className="text-lg font-semibold text-foreground">
              Une erreur est survenue lors du chargement.
            </h2>
            <p className="text-sm text-foreground-muted">
              {viewState.message}
            </p>
          </div>
          <Button
            type="button"
            onClick={handleRetry}
            variant="secondary"
            className="min-h-[48px] min-w-[48px] px-6 inline-flex items-center gap-2 border-border"
          >
            <RefreshCw className="h-4 w-4" />
            Réessayer
          </Button>
        </div>
      )}

      {/* Success State */}
      {viewState.status === 'success' && (
        <>
          {/* Empty Chapter: No lessons published */}
          {viewState.data.results.length === 0 && !appliedFilters.course_date_from && !appliedFilters.course_date_to ? (
            <div
              data-testid="chapter-lessons-empty"
              className="rounded-lg border border-border bg-card p-8 text-center space-y-3 max-w-md mx-auto"
            >
              <div className="inline-flex items-center justify-center h-12 w-12 rounded-full bg-surface text-foreground-muted mx-auto border border-border">
                <BookOpen className="h-6 w-6" />
              </div>
              <h2 className="text-base font-semibold text-foreground">
                Ce chapitre ne contient aucune leçon publiée.
              </h2>
              <p className="text-sm text-foreground-muted">
                Les leçons publiées apparaîtront ici dès leur mise en ligne par l'enseignant.
              </p>
            </div>
          ) : viewState.data.results.length === 0 ? (
            /* Empty Filter Results: Date range filter yielded no lessons */
            <div
              data-testid="chapter-lessons-filter-empty"
              className="rounded-lg border border-border bg-card p-8 text-center space-y-3 max-w-md mx-auto"
            >
              <div className="inline-flex items-center justify-center h-12 w-12 rounded-full bg-surface text-foreground-muted mx-auto border border-border">
                <Calendar className="h-6 w-6" />
              </div>
              <h2 className="text-base font-semibold text-foreground">
                Aucune leçon ne correspond à cette plage de dates.
              </h2>
              <p className="text-sm text-foreground-muted">
                Modifiez ou réinitialisez vos filtres pour afficher l'ensemble des leçons de ce chapitre.
              </p>
              <Button
                type="button"
                variant="secondary"
                onClick={handleResetFilter}
                data-testid="empty-reset-filter-btn"
                className="min-h-[48px] px-6 text-foreground hover:bg-surface border-border"
              >
                Réinitialiser les filtres
              </Button>
            </div>
          ) : (
            /* Lesson Cards List */
            <div
              data-testid="chapter-lessons-list"
              className="space-y-3"
            >
              {viewState.data.results.map((lesson) => (
                <Link
                  key={lesson.id}
                  to={`/lessons/${lesson.id}`}
                  data-testid={`lesson-card-${lesson.id}`}
                  className="group block rounded-lg border border-border bg-card p-5 hover:border-primary/50 transition-colors focus:outline-none focus-visible:ring-2 focus-visible:ring-primary min-h-[48px]"
                >
                  <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-3">
                    <div className="space-y-1.5 flex-1 min-w-0">
                      <h2 className="text-base font-semibold text-foreground group-hover:text-primary transition-colors truncate">
                        {lesson.title}
                      </h2>
                      <div className="flex flex-wrap items-center gap-x-4 gap-y-1 text-xs text-foreground-muted">
                        <span className="flex items-center gap-1">
                          <User className="h-3.5 w-3.5 shrink-0 text-foreground-muted" aria-hidden="true" />
                          <span>{lesson.teacher}</span>
                        </span>
                        <span className="font-mono text-xs text-foreground-muted flex items-center gap-1">
                          <Calendar className="h-3.5 w-3.5 shrink-0 text-foreground-muted" aria-hidden="true" />
                          <span>{lesson.course_date}</span>
                        </span>
                      </div>
                    </div>

                    {/* Micro-badges for attached resources */}
                    {lesson.resources && lesson.resources.length > 0 && (
                      <div
                        data-testid={`lesson-resources-${lesson.id}`}
                        className="flex flex-wrap items-center gap-1.5 shrink-0 pt-1 sm:pt-0"
                      >
                        {lesson.resources.map((res, idx) => (
                          <ResourceBadge
                            key={res.id ? `${res.id}-${idx}` : `${lesson.id}-${res.type}-${idx}`}
                            type={res.type}
                          />
                        ))}
                      </div>
                    )}
                  </div>
                </Link>
              ))}
            </div>
          )}

          {/* DRF Pagination */}
          {(viewState.data.previous || viewState.data.next) && (
            <div
              data-testid="lessons-pagination"
              className="flex items-center justify-between pt-4 border-t border-border"
            >
              <Button
                type="button"
                variant="secondary"
                onClick={handlePrevPage}
                disabled={!viewState.data.previous}
                className="min-h-[48px] px-4 inline-flex items-center gap-1 disabled:opacity-40"
                aria-label="Page précédente"
              >
                <ChevronLeft className="h-4 w-4" />
                Précédent
              </Button>
              <span className="text-xs text-foreground-muted">
                Page {currentPage} ({viewState.data.count} leçons au total)
              </span>
              <Button
                type="button"
                variant="secondary"
                onClick={handleNextPage}
                disabled={!viewState.data.next}
                className="min-h-[48px] px-4 inline-flex items-center gap-1 disabled:opacity-40"
                aria-label="Page suivante"
              >
                Suivant
                <ChevronRight className="h-4 w-4" />
              </Button>
            </div>
          )}
        </>
      )}
    </div>
  );
}

export default ChapterLessonsPage;
