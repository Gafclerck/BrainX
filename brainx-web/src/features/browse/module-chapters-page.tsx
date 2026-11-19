import { useEffect, useState, useCallback, useRef } from 'react';
import { useParams, Link } from 'react-router-dom';
import { AlertCircle, RefreshCw, Bookmark, ChevronLeft, ChevronRight } from 'lucide-react';
import { fetchModuleChapters } from './api';
import type { BrowseContainerItem, BrowseViewState } from './types';
import { ApiError } from '@/lib/api';
import { Button } from '@/components/ui/button';

export function ModuleChaptersPage() {
  const { moduleId } = useParams<{ moduleId: string }>();
  const [viewState, setViewState] = useState<BrowseViewState<BrowseContainerItem>>({
    status: 'loading',
  });
  const [currentPage, setCurrentPage] = useState<number>(1);
  const prevModuleIdRef = useRef<string | undefined>(moduleId);

  // Reset page to 1 when moduleId changes
  useEffect(() => {
    if (prevModuleIdRef.current !== moduleId) {
      prevModuleIdRef.current = moduleId;
      setCurrentPage(1);
    }
  }, [moduleId]);

  const loadChapters = useCallback(
    async (mid: string, page: number, isMountedRef: { current: boolean }) => {
      setViewState({ status: 'loading' });
      try {
        const response = await fetchModuleChapters(mid, page);
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
            : 'Impossible de récupérer la liste des chapitres pour le moment.';

        setViewState({
          status: 'error',
          is404: Boolean(is404),
          message,
        });
      }
    },
    []
  );

  useEffect(() => {
    const isMountedRef = { current: true };
    if (moduleId) {
      loadChapters(moduleId, currentPage, isMountedRef);
    }
    return () => {
      isMountedRef.current = false;
    };
  }, [moduleId, currentPage, loadChapters]);

  const handleRetry = () => {
    if (moduleId) {
      loadChapters(moduleId, currentPage, { current: true });
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

  return (
    <div
      data-testid="module-chapters-page"
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
          Chapitres du module
        </h1>
        <p className="text-sm text-foreground-muted">
          Consultez les chapitres composant ce module d'apprentissage.
        </p>
      </div>

      {/* Loading Skeleton State */}
      {viewState.status === 'loading' && (
        <div
          data-testid="chapters-loading-skeletons"
          className="space-y-3"
          aria-label="Chargement des chapitres"
        >
          {[1, 2, 3, 4].map((i) => (
            <div
              key={i}
              className="rounded-lg border border-border bg-card p-5 space-y-2"
            >
              <div className="h-5 w-2/3 bg-surface animate-pulse rounded" />
              <div className="h-4 w-1/3 bg-surface animate-pulse rounded" />
            </div>
          ))}
        </div>
      )}

      {/* Error State: 404 Not Found or Non-Published Module */}
      {viewState.status === 'error' && viewState.is404 && (
        <div
          data-testid="module-chapters-error-404"
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
              Ce module n'existe pas ou ne contient aucun contenu publié.
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

      {/* Error State: Network Failure or 500 */}
      {viewState.status === 'error' && !viewState.is404 && (
        <div
          data-testid="module-chapters-error-network"
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
          {/* Empty Chapters Card */}
          {viewState.data.results.length === 0 ? (
            <div
              data-testid="module-chapters-empty"
              className="rounded-lg border border-border bg-card p-8 text-center space-y-3 max-w-md mx-auto"
            >
              <div className="inline-flex items-center justify-center h-12 w-12 rounded-full bg-surface text-foreground-muted mx-auto border border-border">
                <Bookmark className="h-6 w-6" />
              </div>
              <h2 className="text-base font-semibold text-foreground">
                Ce module ne contient aucun chapitre publié.
              </h2>
              <p className="text-sm text-foreground-muted">
                Les chapitres publiés apparaîtront ici dès leur mise en ligne.
              </p>
            </div>
          ) : (
            /* Chapter Cards List */
            <div
              data-testid="module-chapters-list"
              className="space-y-3"
            >
              {viewState.data.results.map((chapter) => (
                <Link
                  key={chapter.id}
                  to={`/chapters/${chapter.id}`}
                  data-testid={`chapter-card-${chapter.id}`}
                  className="group flex items-center justify-between rounded-lg border border-border bg-card p-5 hover:border-primary/50 transition-colors focus:outline-none focus-visible:ring-2 focus-visible:ring-primary min-h-[48px]"
                >
                  <div className="flex items-center gap-3">
                    <div className="inline-flex items-center justify-center h-8 w-8 rounded bg-surface text-primary border border-border shrink-0">
                      <Bookmark className="h-4 w-4" />
                    </div>
                    <h2 className="text-base font-semibold text-foreground group-hover:text-primary transition-colors">
                      {chapter.name}
                    </h2>
                  </div>
                  <span className="text-sm text-foreground-muted group-hover:text-foreground transition-colors shrink-0">
                    Voir les leçons →
                  </span>
                </Link>
              ))}
            </div>
          )}

          {/* DRF Pagination */}
          {(viewState.data.previous || viewState.data.next) && (
            <div
              data-testid="chapters-pagination"
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
                Page {currentPage} ({viewState.data.count} chapitres au total)
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

export default ModuleChaptersPage;
