import { useState, useEffect, useCallback, useMemo, useRef } from 'react';
import { Link } from 'react-router-dom';
import {
  Trash2,
  ChevronLeft,
  Search,
  RotateCcw,
  AlertCircle,
  RefreshCw,
  CheckCircle2,
  X,
  BookOpen,
  Layers,
  FolderTree,
  FileText,
  Paperclip,
} from 'lucide-react';
import { AppHeader } from '@/components/layout/app-header';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { fetchTrashItems } from '../api';
import {
  RestoreConfirmationModal,
  TRASH_TYPE_LABELS,
  TRASH_TYPE_BADGE_CLASSES,
  formatTrashDate,
} from './restore-confirmation-modal';
import type { TrashItem, TrashFilterType, TrashItemType } from '../types';
import { ApiError } from '@/lib/api';
import { cn } from '@/lib/utils';

export type TrashViewState =
  | { status: 'loading' }
  | { status: 'success'; items: TrashItem[] }
  | { status: 'error'; message: string };

const FILTER_TABS: { key: TrashFilterType; label: string; icon: React.ComponentType<{ className?: string }> }[] = [
  { key: 'all', label: 'Tous', icon: Trash2 },
  { key: 'course', label: 'Cours', icon: BookOpen },
  { key: 'module', label: 'Modules', icon: Layers },
  { key: 'chapter', label: 'Chapitres', icon: FolderTree },
  { key: 'lesson', label: 'Leçons', icon: FileText },
  { key: 'resource', label: 'Ressources', icon: Paperclip },
];

export function PublisherTrashPage() {
  const [viewState, setViewState] = useState<TrashViewState>({ status: 'loading' });
  const [trashItems, setTrashItems] = useState<TrashItem[]>([]);
  const [filterType, setFilterType] = useState<TrashFilterType>('all');
  const [searchQuery, setSearchQuery] = useState<string>('');
  const [restoreTarget, setRestoreTarget] = useState<TrashItem | null>(null);
  const [successMessage, setSuccessMessage] = useState<string | null>(null);
  const isMountedRef = useRef(true);

  useEffect(() => {
    isMountedRef.current = true;
    return () => {
      isMountedRef.current = false;
    };
  }, []);

  const loadTrash = useCallback(async () => {
    setViewState({ status: 'loading' });
    setSuccessMessage(null);
    try {
      const items = await fetchTrashItems();
      if (isMountedRef.current) {
        setTrashItems(items);
        setViewState({ status: 'success', items });
      }
    } catch (err: unknown) {
      if (!isMountedRef.current) return;
      const message =
        err instanceof ApiError && err.envelope.detail
          ? err.envelope.detail
          : (err as Error)?.message ||
            'Impossible de charger le contenu de la corbeille pour le moment.';
      setViewState({ status: 'error', message });
    }
  }, []);

  useEffect(() => {
    loadTrash();
  }, [loadTrash]);

  const headingRef = useRef<HTMLHeadingElement>(null);

  // Handle successful item restoration
  const handleRestoreSuccess = () => {
    if (!restoreTarget) return;
    const restoredId = restoreTarget.id;
    setTrashItems((prev) => prev.filter((item) => item.id !== restoredId));
    setSuccessMessage('Élément restauré avec succès');
    setRestoreTarget(null);
    headingRef.current?.focus();
  };

  // Filter items according to tab and search query with diacritic normalization
  const filteredItems = useMemo(() => {
    const normalizeSearch = (str: string) =>
      str.normalize('NFD').replace(/[\u0300-\u036f]/g, '').toLowerCase().trim();

    return trashItems.filter((item) => {
      if (filterType !== 'all' && item.type !== filterType) {
        return false;
      }
      if (searchQuery.trim().length > 0) {
        const query = normalizeSearch(searchQuery);
        const matchesName = item.name ? normalizeSearch(item.name).includes(query) : false;
        const matchesParent = item.parent_path ? normalizeSearch(item.parent_path).includes(query) : false;
        const matchesAuthor = item.last_modified_by?.email ? normalizeSearch(item.last_modified_by.email).includes(query) : false;
        return matchesName || matchesParent || matchesAuthor;
      }
      return true;
    });
  }, [trashItems, filterType, searchQuery]);

  return (
    <div
      data-testid="publisher-trash-page"
      className="min-h-screen bg-background text-foreground flex flex-col min-w-[360px] w-full overflow-x-hidden selection:bg-primary selection:text-primary-foreground"
    >
      {/* Top Application Header */}
      <AppHeader />

      <main className="flex-1 max-w-page-max mx-auto w-full px-4 sm:px-6 lg:px-8 py-6 sm:py-8 space-y-6">
        {/* Breadcrumb & Header Bar */}
        <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4 pb-4 border-b border-border">
          <div className="space-y-1">
            <div className="flex items-center gap-2 text-xs font-mono text-primary uppercase tracking-wider">
              <Link to="/publisher" className="hover:underline">
                Espace Éditeur
              </Link>
              <span>/</span>
              <span className="text-foreground-muted">Corbeille</span>
            </div>
            <div className="flex items-center gap-3">
              <h1
                ref={headingRef}
                tabIndex={-1}
                className="text-2xl sm:text-3xl font-bold tracking-tight text-foreground outline-none"
              >
                Corbeille
              </h1>
              <span
                data-testid="trash-count-badge"
                aria-live="polite"
                aria-atomic="true"
                className="inline-flex items-center px-2.5 py-0.5 rounded-full text-xs font-medium bg-[#30363D] text-[#E6EDF3] border border-[#30363D]"
              >
                {trashItems.length} {trashItems.length <= 1 ? 'élément' : 'éléments'}
              </span>
            </div>
            <p className="text-sm text-foreground-muted">
              Consultez et restaurez les cours, modules, chapitres, leçons et ressources supprimés.
            </p>
          </div>

          <div className="flex items-center gap-2">
            <Button
              asChild
              variant="outline"
              className="min-h-[44px] min-w-[44px] text-xs sm:text-sm font-medium"
            >
              <Link
                to="/publisher"
                data-testid="back-to-dashboard-link"
                className="inline-flex items-center gap-2"
              >
                <ChevronLeft className="h-4 w-4 shrink-0" aria-hidden="true" />
                <span>Retour au tableau de bord</span>
              </Link>
            </Button>
          </div>
        </div>

        {/* Success Alert Banner */}
        {successMessage && (
          <div
            role="status"
            data-testid="trash-success-alert"
            className="p-4 rounded-md bg-[#122416] border border-[#238636] text-[#3FB950] flex items-center justify-between shadow-sm animate-in fade-in"
          >
            <div className="flex items-center gap-2">
              <CheckCircle2 className="h-5 w-5 shrink-0" aria-hidden="true" />
              <span className="text-sm font-medium">{successMessage}</span>
            </div>
            <button
              type="button"
              onClick={() => setSuccessMessage(null)}
              data-testid="trash-dismiss-success-btn"
              className="text-[#3FB950] hover:text-white min-h-[44px] min-w-[44px] p-2 flex items-center justify-center transition-colors"
              aria-label="Fermer l'alerte"
            >
              <X className="h-4 w-4" aria-hidden="true" />
            </button>
          </div>
        )}

        {/* Global Loading View */}
        {viewState.status === 'loading' && (
          <div
            data-testid="trash-loading-state"
            className="rounded-lg border border-border bg-card p-12 text-center flex flex-col items-center justify-center space-y-4"
          >
            <RefreshCw className="h-8 w-8 text-primary animate-spin" aria-hidden="true" />
            <p className="text-sm text-foreground-muted">
              Chargement des éléments de la corbeille...
            </p>
          </div>
        )}

        {/* Global Error View */}
        {viewState.status === 'error' && (
          <div
            role="alert"
            data-testid="trash-error-banner"
            className="rounded-lg border border-destructive/40 bg-destructive/10 p-6 text-center flex flex-col items-center justify-center space-y-3"
          >
            <AlertCircle className="h-8 w-8 text-destructive" aria-hidden="true" />
            <div className="space-y-1">
              <h2 className="text-base font-semibold text-foreground">
                Erreur lors du chargement de la corbeille
              </h2>
              <p className="text-sm text-foreground-muted max-w-md">
                {viewState.message}
              </p>
            </div>
            <Button
              type="button"
              variant="outline"
              data-testid="trash-retry-btn"
              onClick={loadTrash}
              className="min-h-[44px] min-w-[44px] text-xs sm:text-sm font-medium mt-2"
            >
              <RefreshCw className="h-4 w-4 mr-2" aria-hidden="true" />
              Réessayer
            </Button>
          </div>
        )}

        {/* Ready / Success View */}
        {viewState.status === 'success' && (
          <>
            {/* Filter Tabs and Search Bar */}
            <div className="flex flex-col md:flex-row md:items-center justify-between gap-4">
              {/* Type Filter Tabs */}
              <div
                role="tablist"
                aria-label="Filtrer par type d'élément"
                className="flex flex-wrap items-center gap-1.5 p-1 rounded-lg border border-border bg-[#161B22]"
              >
                {FILTER_TABS.map((tab) => {
                  const isActive = filterType === tab.key;
                  const Icon = tab.icon;
                  return (
                    <button
                      key={tab.key}
                      type="button"
                      role="tab"
                      aria-selected={isActive}
                      data-testid={`trash-filter-${tab.key}`}
                      onClick={() => setFilterType(tab.key)}
                      className={cn(
                        'min-h-[44px] px-3.5 py-2 rounded-md text-xs sm:text-sm font-medium transition-colors inline-flex items-center gap-2 select-none',
                        isActive
                          ? 'bg-primary text-primary-foreground shadow-sm'
                          : 'text-foreground-muted hover:text-foreground hover:bg-[#30363D]/40'
                      )}
                    >
                      <Icon className="h-4 w-4 shrink-0" aria-hidden="true" />
                      <span>{tab.label}</span>
                    </button>
                  );
                })}
              </div>

              {/* Search Bar */}
              <div className="relative w-full md:w-80">
                <Search
                  className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-foreground-muted pointer-events-none"
                  aria-hidden="true"
                />
                <Input
                  type="text"
                  placeholder="Rechercher par nom ou titre..."
                  value={searchQuery}
                  onChange={(e) => setSearchQuery(e.target.value)}
                  data-testid="trash-search-input"
                  className="min-h-[44px] pl-9 pr-8 text-xs sm:text-sm bg-card border-border"
                />
                {searchQuery && (
                  <button
                    type="button"
                    onClick={() => setSearchQuery('')}
                    data-testid="trash-clear-search-btn"
                    className="absolute right-2 top-1/2 -translate-y-1/2 text-foreground-muted hover:text-foreground p-1 min-h-[32px] min-w-[32px] flex items-center justify-center"
                    aria-label="Effacer la recherche"
                  >
                    <X className="h-3.5 w-3.5" aria-hidden="true" />
                  </button>
                )}
              </div>
            </div>

            {/* List Content */}
            {trashItems.length === 0 ? (
              /* Entirely Empty Trash */
              <div
                data-testid="trash-empty-state"
                className="rounded-lg border border-border bg-card p-12 text-center flex flex-col items-center justify-center space-y-4"
              >
                <div className="p-4 rounded-full bg-[#30363D]/30 text-foreground-muted">
                  <Trash2 className="h-10 w-10" aria-hidden="true" />
                </div>
                <div className="space-y-1">
                  <h2 className="text-lg font-bold text-foreground">
                    La corbeille est vide
                  </h2>
                  <p className="text-sm text-foreground-muted max-w-md">
                    Aucun élément n'a été placé dans la corbeille. Les éléments supprimés apparaîtront ici et pourront être restaurés.
                  </p>
                </div>
                <Button
                  asChild
                  variant="outline"
                  className="min-h-[44px] min-w-[44px] text-xs sm:text-sm font-medium mt-2"
                >
                  <Link to="/publisher" data-testid="empty-trash-back-link">
                    Retour au tableau de bord
                  </Link>
                </Button>
              </div>
            ) : filteredItems.length === 0 ? (
              /* No matching items after filter or search */
              <div
                data-testid="trash-no-results"
                className="rounded-lg border border-border bg-card p-12 text-center flex flex-col items-center justify-center space-y-3"
              >
                <div className="p-3 rounded-full bg-[#30363D]/20 text-foreground-muted">
                  <Search className="h-8 w-8" aria-hidden="true" />
                </div>
                <h2 className="text-base font-semibold text-foreground">
                  {searchQuery.trim().length > 0
                    ? 'Aucun résultat trouvé'
                    : 'Aucun élément de ce type dans la corbeille'}
                </h2>
                <p className="text-sm text-foreground-muted max-w-md">
                  {searchQuery.trim().length > 0
                    ? `Aucun élément supprimé ne correspond à "${searchQuery}".`
                    : `Il n'y a aucun élément de catégorie "${TRASH_TYPE_LABELS[filterType as TrashItemType] || filterType}" dans la corbeille.`}
                </p>
                <Button
                  type="button"
                  variant="outline"
                  onClick={() => {
                    setFilterType('all');
                    setSearchQuery('');
                  }}
                  className="min-h-[44px] min-w-[44px] text-xs sm:text-sm font-medium mt-1"
                >
                  Réinitialiser les filtres
                </Button>
              </div>
            ) : (
              /* Trash Items List */
              <div
                className="space-y-3"
                data-testid="trash-items-list"
                aria-live="polite"
                aria-atomic="true"
              >
                {filteredItems.map((item) => {
                  const typeLabel = TRASH_TYPE_LABELS[item.type] || item.type;
                  const badgeClass =
                    TRASH_TYPE_BADGE_CLASSES[item.type] ||
                    'bg-gray-800 text-gray-200 border-gray-700';

                  return (
                    <div
                      key={`${item.type}-${item.id}`}
                      data-testid={`trash-item-${item.id}`}
                      className="p-4 sm:p-5 rounded-lg border border-border bg-card flex flex-col sm:flex-row sm:items-center justify-between gap-4 transition-colors hover:border-[#30363D]"
                    >
                      <div className="space-y-1.5 min-w-0 flex-1">
                        <div className="flex flex-wrap items-center gap-2">
                          <span
                            data-testid={`trash-item-badge-${item.id}`}
                            className={cn(
                              'inline-flex items-center px-2 py-0.5 rounded-full text-xs font-medium border select-none shrink-0',
                              badgeClass
                            )}
                          >
                            {typeLabel}
                          </span>
                          <h2 className="text-base font-semibold text-foreground truncate">
                            {item.name}
                          </h2>
                        </div>

                        {item.parent_path && (
                          <p className="text-xs text-foreground-muted truncate">
                            <span className="font-medium text-foreground-muted/70">
                              Emplacement :
                            </span>{' '}
                            {item.parent_path}
                          </p>
                        )}

                        <div className="flex flex-wrap items-center gap-x-4 gap-y-1 text-xs text-foreground-muted pt-0.5">
                          <span>
                            Supprimé le : {formatTrashDate(item.deleted_at)}
                          </span>
                          {item.last_modified_by?.email && (
                            <span>
                              Auteur : {item.last_modified_by.email}
                            </span>
                          )}
                        </div>
                      </div>

                      <div className="shrink-0 flex items-center">
                        <Button
                          type="button"
                          variant="outline"
                          data-testid={`restore-btn-${item.id}`}
                          onClick={() => setRestoreTarget(item)}
                          className="min-h-[44px] min-w-[44px] text-xs sm:text-sm font-medium inline-flex items-center gap-2 hover:bg-primary hover:text-primary-foreground border-border transition-colors"
                        >
                          <RotateCcw className="w-4 h-4 shrink-0" aria-hidden="true" />
                          <span>Restaurer</span>
                        </Button>
                      </div>
                    </div>
                  );
                })}
              </div>
            )}
          </>
        )}
      </main>

      {/* Confirmation Modal */}
      <RestoreConfirmationModal
        isOpen={Boolean(restoreTarget)}
        onClose={() => setRestoreTarget(null)}
        item={restoreTarget}
        onSuccess={handleRestoreSuccess}
      />
    </div>
  );
}

export default PublisherTrashPage;
