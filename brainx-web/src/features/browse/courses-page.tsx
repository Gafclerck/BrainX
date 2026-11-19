import { useEffect, useState, useCallback } from 'react';
import { Link, useLocation, useNavigate } from 'react-router-dom';
import { AlertCircle, RefreshCw, BookOpen, ChevronLeft, ChevronRight, X } from 'lucide-react';
import { fetchPublishedCourses } from './api';
import type { BrowseContainerItem, BrowseViewState } from './types';
import { ApiError } from '@/lib/api';
import { Button } from '@/components/ui/button';

export function CoursesPage() {
  const location = useLocation();
  const navigate = useNavigate();
  const notice = (location.state as { notice?: string } | null | undefined)?.notice;
  const [noticeDismissed, setNoticeDismissed] = useState(false);

  useEffect(() => {
    setNoticeDismissed(false);
  }, [location.key]);

  const handleDismissNotice = () => {
    setNoticeDismissed(true);
    navigate(`${location.pathname}${location.search}${location.hash}`, {
      replace: true,
      state: {},
    });
  };

  const isNoticeValid = typeof notice === 'string' && notice.trim().length > 0;
  const showNotice = Boolean(isNoticeValid && !noticeDismissed);

  const [viewState, setViewState] = useState<BrowseViewState<BrowseContainerItem>>({
    status: 'loading',
  });
  const [currentPage, setCurrentPage] = useState<number>(1);

  const loadCourses = useCallback(async (page: number, isMountedRef: { current: boolean }) => {
    setViewState({ status: 'loading' });
    try {
      const response = await fetchPublishedCourses(page);
      if (isMountedRef.current) {
        setViewState({ status: 'success', data: response });
      }
    } catch (err: unknown) {
      if (!isMountedRef.current) return;
      const is404 =
        err instanceof ApiError
          ? err.envelope.status === 404
          : (err as { status?: number })?.status === 404;

      const message =
        err instanceof ApiError && err.envelope.detail
          ? err.envelope.detail
          : 'Impossible de récupérer la liste des cours pour le moment.';

      setViewState({
        status: 'error',
        is404: Boolean(is404),
        message,
      });
    }
  }, []);

  useEffect(() => {
    const isMountedRef = { current: true };
    loadCourses(currentPage, isMountedRef);
    return () => {
      isMountedRef.current = false;
    };
  }, [loadCourses, currentPage]);

  const handleRetry = () => {
    loadCourses(currentPage, { current: true });
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

  return (
    <div
      data-testid="courses-page"
      className="w-full min-w-[360px] overflow-x-hidden space-y-6"
    >
      {/* Hidden landmark for backwards compatibility with route guard test assertions */}
      <div data-testid="courses-page-placeholder" className="sr-only" aria-hidden="true" />

      {/* Flash / Publisher Notice Banner */}
      {showNotice && (
        <div
          role="status"
          aria-live="polite"
          data-testid="publisher-notice-banner"
          className="rounded-md border border-info-border bg-info-surface p-4 text-sm text-info flex items-start sm:items-center justify-between gap-3 shadow-sm min-w-0"
        >
          <div className="flex items-start sm:items-center gap-3 min-w-0">
            <AlertCircle className="h-5 w-5 shrink-0 text-info mt-0.5 sm:mt-0" aria-hidden="true" />
            <p className="font-medium text-info break-words">
              {notice}
            </p>
          </div>
          <button
            type="button"
            onClick={handleDismissNotice}
            data-testid="dismiss-notice-button"
            aria-label="Fermer la notification"
            className="shrink-0 rounded p-1.5 text-info hover:text-foreground hover:bg-info-border/30 transition-colors focus:outline-none focus-visible:ring-2 focus-visible:ring-primary min-h-[44px] min-w-[44px] flex items-center justify-center"
          >
            <X className="h-4 w-4" aria-hidden="true" />
          </button>
        </div>
      )}

      {/* Header and Catalog Title */}
      <div className="space-y-1">
        <h1 className="text-2xl font-bold tracking-tight text-foreground">
          Catalogue des Cours
        </h1>
        <p className="text-sm text-foreground-muted">
          Consultez l'ensemble des cours et ressources pédagogiques disponibles.
        </p>
      </div>

      {/* Loading Skeleton State */}
      {viewState.status === 'loading' && (
        <div
          data-testid="courses-loading-skeletons"
          className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4"
          aria-label="Chargement des cours"
        >
          {[1, 2, 3, 4, 5, 6].map((i) => (
            <div
              key={i}
              className="rounded-lg border border-border bg-card p-5 space-y-3"
            >
              <div className="h-5 w-3/4 bg-surface animate-pulse rounded" />
              <div className="h-4 w-1/2 bg-surface animate-pulse rounded" />
              <div className="h-4 w-1/3 bg-surface animate-pulse rounded" />
            </div>
          ))}
        </div>
      )}

      {/* Error State: 404 Not Found or Non-Published */}
      {viewState.status === 'error' && viewState.is404 && (
        <div
          data-testid="courses-error-404"
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
              Le contenu demandé n'est pas disponible actuellement ou a été retiré.
            </p>
          </div>
          <Button
            asChild
            variant="secondary"
            className="min-h-[48px] px-6 text-foreground hover:bg-surface border-border"
          >
            <Link
              to="/courses"
              data-testid="recovery-courses-link"
              onClick={() => {
                setCurrentPage(1);
                loadCourses(1, { current: true });
              }}
            >
              Retour aux cours
            </Link>
          </Button>
        </div>
      )}

      {/* Error State: Network Failure or 500 Server Error */}
      {viewState.status === 'error' && !viewState.is404 && (
        <div
          data-testid="courses-error-network"
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
          {/* Empty List Card */}
          {viewState.data.results.length === 0 ? (
            <div
              data-testid="courses-empty"
              className="rounded-lg border border-border bg-card p-8 text-center space-y-3 max-w-md mx-auto"
            >
              <div className="inline-flex items-center justify-center h-12 w-12 rounded-full bg-surface text-foreground-muted mx-auto border border-border">
                <BookOpen className="h-6 w-6" />
              </div>
              <h2 className="text-base font-semibold text-foreground">
                Aucun cours disponible pour le moment.
              </h2>
              <p className="text-sm text-foreground-muted">
                Les cours publiés apparaîtront ici dès leur mise en ligne.
              </p>
            </div>
          ) : (
            /* Courses Grid */
            <div
              data-testid="courses-grid"
              className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4"
            >
              {viewState.data.results.map((course) => (
                <Link
                  key={course.id}
                  to={`/courses/${course.id}`}
                  data-testid={`course-card-${course.id}`}
                  className="group block rounded-lg border border-border bg-card p-5 hover:border-primary/50 transition-colors focus:outline-none focus-visible:ring-2 focus-visible:ring-primary min-h-[48px]"
                >
                  <div className="flex items-start justify-between gap-3">
                    <div className="space-y-2">
                      <div className="inline-flex items-center justify-center h-8 w-8 rounded bg-surface text-primary border border-border">
                        <BookOpen className="h-4 w-4" />
                      </div>
                      <h2 className="text-base font-semibold text-foreground group-hover:text-primary transition-colors">
                        {course.name}
                      </h2>
                    </div>
                  </div>
                </Link>
              ))}
            </div>
          )}

          {/* DRF Pagination controls if multiple pages exist */}
          {(viewState.data.previous || viewState.data.next) && (
            <div
              data-testid="courses-pagination"
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
                Page {currentPage} ({viewState.data.count} cours au total)
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

export default CoursesPage;
