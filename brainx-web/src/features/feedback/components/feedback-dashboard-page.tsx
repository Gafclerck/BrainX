import { useState, useEffect, useCallback } from 'react';
import {
  Inbox,
  Lightbulb,
  Bug,
  Sparkles,
  HelpCircle,
  Eye,
  CheckCheck,
  Trash2,
  Search,
  ExternalLink,
  MessageSquare,
  Clock,
  RefreshCw,
  FileText,
} from 'lucide-react';
import { PublisherSubNav } from '@/features/publisher/components/publisher-sub-nav';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Card } from '@/components/ui/card';
import {
  getFeedbackList,
  getFeedbackStats,
  updateFeedback,
  deleteFeedback,
} from '../api';
import type { Feedback, FeedbackStats, FeedbackCategory, FeedbackStatus } from '../types';
import { cn } from '@/lib/utils';

export function FeedbackDashboardPage() {
  const [feedbacks, setFeedbacks] = useState<Feedback[]>([]);
  const [stats, setStats] = useState<FeedbackStats>({
    total: 0,
    new: 0,
    read: 0,
    processed: 0,
  });
  const [totalCount, setTotalCount] = useState(0);
  const [isLoading, setIsLoading] = useState(true);
  const [selectedStatus, setSelectedStatus] = useState<string>('all');
  const [selectedCategory, setSelectedCategory] = useState<string>('all');
  const [searchQuery, setSearchQuery] = useState('');
  const [page, setPage] = useState(1);
  const [editingNotesId, setEditingNotesId] = useState<string | null>(null);
  const [noteText, setNoteText] = useState('');
  const [isUpdating, setIsUpdating] = useState<string | null>(null);

  const loadData = useCallback(async () => {
    setIsLoading(true);
    try {
      const [listRes, statsRes] = await Promise.all([
        getFeedbackList({
          status: selectedStatus,
          category: selectedCategory,
          search: searchQuery,
          page,
        }),
        getFeedbackStats(),
      ]);

      setFeedbacks(listRes.results);
      setTotalCount(listRes.count);
      setStats(statsRes);
    } catch (err) {
      console.error('Failed to load feedback data', err);
    } finally {
      setIsLoading(false);
    }
  }, [selectedStatus, selectedCategory, searchQuery, page]);

  useEffect(() => {
    loadData();
  }, [loadData]);

  const handleStatusChange = async (id: string, newStatus: FeedbackStatus) => {
    setIsUpdating(id);
    try {
      const updated = await updateFeedback(id, { status: newStatus });
      setFeedbacks((prev) => prev.map((f) => (f.id === id ? updated : f)));
      // Refresh stats
      const statsRes = await getFeedbackStats();
      setStats(statsRes);
    } catch (err) {
      console.error('Failed to update feedback status', err);
    } finally {
      setIsUpdating(null);
    }
  };

  const handleSaveNotes = async (id: string) => {
    setIsUpdating(id);
    try {
      const updated = await updateFeedback(id, { admin_notes: noteText.trim() });
      setFeedbacks((prev) => prev.map((f) => (f.id === id ? updated : f)));
      setEditingNotesId(null);
    } catch (err) {
      console.error('Failed to update feedback notes', err);
    } finally {
      setIsUpdating(null);
    }
  };

  const handleDelete = async (id: string) => {
    if (!window.confirm('Voulez-vous vraiment supprimer ce message ?')) {
      return;
    }
    setIsUpdating(id);
    try {
      await deleteFeedback(id);
      setFeedbacks((prev) => prev.filter((f) => f.id !== id));
      setTotalCount((prev) => Math.max(0, prev - 1));
      const statsRes = await getFeedbackStats();
      setStats(statsRes);
    } catch (err) {
      console.error('Failed to delete feedback', err);
    } finally {
      setIsUpdating(null);
    }
  };

  const getCategoryBadge = (category: FeedbackCategory) => {
    switch (category) {
      case 'bug':
        return (
          <span className="inline-flex items-center gap-1 px-2.5 py-0.5 rounded-full text-xs font-semibold bg-red-500/10 text-red-500 border border-red-500/20">
            <Bug className="h-3 w-3" />
            Bug
          </span>
        );
      case 'suggestion':
        return (
          <span className="inline-flex items-center gap-1 px-2.5 py-0.5 rounded-full text-xs font-semibold bg-blue-500/10 text-blue-500 border border-blue-500/20">
            <Lightbulb className="h-3 w-3" />
            Suggestion
          </span>
        );
      case 'recommendation':
        return (
          <span className="inline-flex items-center gap-1 px-2.5 py-0.5 rounded-full text-xs font-semibold bg-purple-500/10 text-purple-500 border border-purple-500/20">
            <Sparkles className="h-3 w-3" />
            Recommandation
          </span>
        );
      case 'other':
      default:
        return (
          <span className="inline-flex items-center gap-1 px-2.5 py-0.5 rounded-full text-xs font-semibold bg-gray-500/10 text-gray-400 border border-gray-500/20">
            <HelpCircle className="h-3 w-3" />
            Autre
          </span>
        );
    }
  };

  const getStatusBadge = (status: FeedbackStatus) => {
    switch (status) {
      case 'new':
        return (
          <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-xs font-bold bg-amber-500/15 text-amber-500 border border-amber-500/30 animate-pulse">
            Nouveau
          </span>
        );
      case 'read':
        return (
          <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-xs font-semibold bg-sky-500/10 text-sky-400 border border-sky-500/20">
            Lu
          </span>
        );
      case 'processed':
        return (
          <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-xs font-semibold bg-emerald-500/10 text-emerald-400 border border-emerald-500/20">
            Traité
          </span>
        );
      case 'archived':
      default:
        return (
          <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-xs font-semibold bg-gray-500/10 text-gray-400 border border-gray-500/20">
            Archivé
          </span>
        );
    }
  };

  const formatDate = (isoString: string) => {
    try {
      const d = new Date(isoString);
      return d.toLocaleDateString('fr-FR', {
        day: '2-digit',
        month: 'short',
        year: 'numeric',
        hour: '2-digit',
        minute: '2-digit',
      });
    } catch {
      return isoString;
    }
  };

  return (
    <div
      data-testid="feedback-dashboard-page"
      className="min-h-screen bg-background text-foreground flex flex-col min-w-[360px]"
    >
      <div className="max-w-page-max mx-auto w-full px-4 sm:px-6 lg:px-8 py-6 space-y-6">
        {/* Navigation Subnav */}
        <PublisherSubNav />

        {/* Page Header */}
        <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4">
          <div>
            <h1 className="text-2xl font-bold tracking-tight flex items-center gap-2.5">
              <Inbox className="h-6 w-6 text-primary" />
              <span>Boîte à suggestions & retours anonymes</span>
            </h1>
            <p className="text-sm text-foreground-muted mt-1">
              Consultez tous les avis, idées d’améliorations et signalements de bugs reçus.
            </p>
          </div>
          <Button
            variant="outline"
            size="sm"
            onClick={() => loadData()}
            disabled={isLoading}
            className="gap-2 shrink-0 self-start sm:self-auto"
          >
            <RefreshCw className={cn('h-4 w-4', isLoading && 'animate-spin')} />
            <span>Actualiser</span>
          </Button>
        </div>

        {/* Summary Stat Cards */}
        <div className="grid grid-cols-2 lg:grid-cols-4 gap-3 sm:gap-4">
          <Card className="p-4 bg-surface border-border flex items-center gap-3">
            <div className="h-10 w-10 rounded-lg bg-surface-subtle text-foreground flex items-center justify-center shrink-0">
              <MessageSquare className="h-5 w-5" />
            </div>
            <div>
              <p className="text-xs text-foreground-muted font-medium">Total reçu</p>
              <p className="text-xl sm:text-2xl font-bold">{stats.total}</p>
            </div>
          </Card>

          <Card className="p-4 bg-surface border-border flex items-center gap-3">
            <div className="h-10 w-10 rounded-lg bg-amber-500/10 text-amber-500 flex items-center justify-center shrink-0">
              <Clock className="h-5 w-5" />
            </div>
            <div>
              <p className="text-xs text-foreground-muted font-medium">Nouveaux (non lus)</p>
              <p className="text-xl sm:text-2xl font-bold text-amber-500">{stats.new}</p>
            </div>
          </Card>

          <Card className="p-4 bg-surface border-border flex items-center gap-3">
            <div className="h-10 w-10 rounded-lg bg-sky-500/10 text-sky-400 flex items-center justify-center shrink-0">
              <Eye className="h-5 w-5" />
            </div>
            <div>
              <p className="text-xs text-foreground-muted font-medium">Lus</p>
              <p className="text-xl sm:text-2xl font-bold text-sky-400">{stats.read}</p>
            </div>
          </Card>

          <Card className="p-4 bg-surface border-border flex items-center gap-3">
            <div className="h-10 w-10 rounded-lg bg-emerald-500/10 text-emerald-400 flex items-center justify-center shrink-0">
              <CheckCheck className="h-5 w-5" />
            </div>
            <div>
              <p className="text-xs text-foreground-muted font-medium">Traités</p>
              <p className="text-xl sm:text-2xl font-bold text-emerald-400">{stats.processed}</p>
            </div>
          </Card>
        </div>

        {/* Filter Toolbar */}
        <div className="flex flex-col md:flex-row md:items-center justify-between gap-3 p-3 rounded-lg bg-surface border border-border">
          {/* Status Tabs */}
          <div className="flex items-center gap-1 overflow-x-auto pb-1 md:pb-0">
            {[
              { id: 'all', label: 'Tous' },
              { id: 'new', label: `Nouveaux (${stats.new})` },
              { id: 'read', label: `Lus (${stats.read})` },
              { id: 'processed', label: `Traités (${stats.processed})` },
            ].map((tab) => (
              <button
                key={tab.id}
                type="button"
                data-testid={`filter-status-${tab.id}`}
                onClick={() => {
                  setSelectedStatus(tab.id);
                  setPage(1);
                }}
                className={cn(
                  'px-3 py-1.5 rounded-md text-xs font-medium whitespace-nowrap transition-colors focus:outline-none focus-visible:ring-2 focus-visible:ring-primary',
                  selectedStatus === tab.id
                    ? 'bg-primary text-primary-foreground font-semibold shadow-sm'
                    : 'text-foreground-muted hover:text-foreground hover:bg-surface-hover'
                )}
              >
                {tab.label}
              </button>
            ))}
          </div>

          <div className="flex flex-col sm:flex-row items-stretch sm:items-center gap-2">
            {/* Category Filter */}
            <select
              value={selectedCategory}
              onChange={(e) => {
                setSelectedCategory(e.target.value);
                setPage(1);
              }}
              data-testid="filter-category-select"
              className="h-9 px-2.5 rounded-md border border-border bg-background text-xs text-foreground focus:outline-none focus:ring-2 focus:ring-primary"
            >
              <option value="all">Toutes catégories</option>
              <option value="bug">Bugs</option>
              <option value="suggestion">Suggestions</option>
              <option value="recommendation">Recommandations</option>
              <option value="other">Autres</option>
            </select>

            {/* Search Input */}
            <div className="relative w-full sm:w-60">
              <Search className="absolute left-2.5 top-2.5 h-4 w-4 text-foreground-muted" />
              <Input
                placeholder="Rechercher..."
                value={searchQuery}
                onChange={(e) => {
                  setSearchQuery(e.target.value);
                  setPage(1);
                }}
                className="h-9 pl-8 text-xs bg-background"
              />
            </div>
          </div>
        </div>

        {/* Feedback List */}
        {isLoading ? (
          <div className="py-16 text-center text-foreground-muted text-sm flex flex-col items-center justify-center gap-2">
            <RefreshCw className="h-6 w-6 animate-spin text-primary" />
            <span>Chargement des messages...</span>
          </div>
        ) : feedbacks.length === 0 ? (
          <div
            data-testid="empty-feedback-message"
            className="py-16 text-center rounded-lg border border-dashed border-border bg-surface/30 p-8 space-y-2"
          >
            <Inbox className="h-10 w-10 text-foreground-muted mx-auto opacity-50" />
            <h3 className="text-base font-medium text-foreground">Aucun message trouvé</h3>
            <p className="text-xs text-foreground-muted max-w-sm mx-auto">
              Aucun retour utilisateur ne correspond à vos filtres actuels.
            </p>
          </div>
        ) : (
          <div className="space-y-3" data-testid="feedback-list-container">
            {feedbacks.map((item) => {
              const isItemUpdating = isUpdating === item.id;
              const isEditingNotes = editingNotesId === item.id;

              return (
                <Card
                  key={item.id}
                  data-testid={`feedback-card-${item.id}`}
                  className={cn(
                    'p-4 sm:p-5 bg-surface border-border transition-all space-y-3',
                    item.status === 'new' && 'border-amber-500/40 bg-amber-500/[0.02]'
                  )}
                >
                  {/* Card Header */}
                  <div className="flex flex-wrap items-center justify-between gap-2 border-b border-border/60 pb-2.5">
                    <div className="flex flex-wrap items-center gap-2">
                      {getCategoryBadge(item.category)}
                      {getStatusBadge(item.status)}
                      {item.subject && (
                        <h2 className="text-sm sm:text-base font-semibold text-foreground">
                          {item.subject}
                        </h2>
                      )}
                    </div>
                    <span className="text-xs text-foreground-muted font-mono">
                      {formatDate(item.created_at)}
                    </span>
                  </div>

                  {/* Message Body */}
                  <div className="text-sm text-foreground whitespace-pre-wrap leading-relaxed">
                    {item.message}
                  </div>

                  {/* Metadata & Page Origin */}
                  {item.page_url && (
                    <div className="flex items-center gap-1.5 text-xs text-foreground-muted">
                      <ExternalLink className="h-3 w-3 shrink-0" />
                      <span>Page d'origine :</span>
                      <code className="px-1.5 py-0.5 rounded bg-background font-mono text-[11px] text-primary">
                        {item.page_url}
                      </code>
                    </div>
                  )}

                  {/* Admin Notes Section */}
                  <div className="pt-2 border-t border-border/50">
                    {isEditingNotes ? (
                      <div className="space-y-2">
                        <textarea
                          rows={2}
                          placeholder="Ajouter une note de suivi (visible uniquement par les administrateurs)..."
                          value={noteText}
                          onChange={(e) => setNoteText(e.target.value)}
                          className="w-full text-xs p-2 rounded border border-border bg-background text-foreground resize-none focus:outline-none focus:ring-1 focus:ring-primary"
                        />
                        <div className="flex gap-2 justify-end">
                          <Button
                            size="sm"
                            variant="ghost"
                            onClick={() => setEditingNotesId(null)}
                            disabled={isItemUpdating}
                          >
                            Annuler
                          </Button>
                          <Button
                            size="sm"
                            onClick={() => handleSaveNotes(item.id)}
                            disabled={isItemUpdating}
                          >
                            Enregistrer la note
                          </Button>
                        </div>
                      </div>
                    ) : (
                      <div className="flex items-center justify-between text-xs text-foreground-muted">
                        <div className="flex items-center gap-1.5">
                          <FileText className="h-3.5 w-3.5" />
                          {item.admin_notes ? (
                            <span className="text-foreground italic">
                              Note admin : {item.admin_notes}
                            </span>
                          ) : (
                            <span className="italic">Aucune note de traitement</span>
                          )}
                        </div>
                        <button
                          type="button"
                          onClick={() => {
                            setEditingNotesId(item.id);
                            setNoteText(item.admin_notes || '');
                          }}
                          className="text-primary hover:underline font-medium text-xs ml-2"
                        >
                          {item.admin_notes ? 'Modifier' : '+ Ajouter une note'}
                        </button>
                      </div>
                    )}
                  </div>

                  {/* Action Buttons */}
                  <div className="flex flex-wrap items-center justify-end gap-2 pt-1">
                    {item.status !== 'read' && item.status !== 'processed' && (
                      <Button
                        size="sm"
                        variant="outline"
                        data-testid={`action-mark-read-${item.id}`}
                        onClick={() => handleStatusChange(item.id, 'read')}
                        disabled={isItemUpdating}
                        className="gap-1.5 text-xs h-8"
                      >
                        <Eye className="h-3.5 w-3.5 text-sky-400" />
                        <span>Marquer comme lu</span>
                      </Button>
                    )}

                    {item.status !== 'processed' && (
                      <Button
                        size="sm"
                        variant="default"
                        data-testid={`action-mark-processed-${item.id}`}
                        onClick={() => handleStatusChange(item.id, 'processed')}
                        disabled={isItemUpdating}
                        className="gap-1.5 text-xs h-8 bg-emerald-600 hover:bg-emerald-700 text-white"
                      >
                        <CheckCheck className="h-3.5 w-3.5" />
                        <span>Marquer comme traité</span>
                      </Button>
                    )}

                    {item.status === 'processed' && (
                      <Button
                        size="sm"
                        variant="outline"
                        data-testid={`action-reopen-${item.id}`}
                        onClick={() => handleStatusChange(item.id, 'read')}
                        disabled={isItemUpdating}
                        className="gap-1.5 text-xs h-8"
                      >
                        <Clock className="h-3.5 w-3.5 text-amber-500" />
                        <span>Remettre en attente</span>
                      </Button>
                    )}

                    <Button
                      size="sm"
                      variant="ghost"
                      data-testid={`action-delete-${item.id}`}
                      onClick={() => handleDelete(item.id)}
                      disabled={isItemUpdating}
                      className="gap-1 text-xs h-8 text-destructive hover:bg-destructive/10"
                    >
                      <Trash2 className="h-3.5 w-3.5" />
                      <span>Supprimer</span>
                    </Button>
                  </div>
                </Card>
              );
            })}
          </div>
        )}

        {/* Pagination controls if more than 20 items */}
        {totalCount > 20 && (
          <div className="flex items-center justify-between border-t border-border pt-4">
            <span className="text-xs text-foreground-muted">
              Page {page} sur {Math.ceil(totalCount / 20)} ({totalCount} retours au total)
            </span>
            <div className="flex gap-2">
              <Button
                size="sm"
                variant="outline"
                onClick={() => setPage((p) => Math.max(1, p - 1))}
                disabled={page <= 1 || isLoading}
              >
                Précédent
              </Button>
              <Button
                size="sm"
                variant="outline"
                onClick={() => setPage((p) => p + 1)}
                disabled={page >= Math.ceil(totalCount / 20) || isLoading}
              >
                Suivant
              </Button>
            </div>
          </div>
        )}
      </div>
    </div>
  );
}
