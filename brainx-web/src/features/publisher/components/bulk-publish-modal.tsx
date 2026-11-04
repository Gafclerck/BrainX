import { useState, useEffect, useCallback, useRef } from 'react';
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogDescription,
  DialogFooter,
} from '@/components/ui/dialog';
import { Button } from '@/components/ui/button';
import { CheckCircle2, AlertCircle, AlertTriangle, Loader2 } from 'lucide-react';
import {
  fetchModuleBulkPublishPreview,
  fetchChapterBulkPublishPreview,
} from '../api';
import type {
  BulkPublishModalProps,
  BulkPublishPreviewResponse,
} from '../types';
import { ApiError } from '@/lib/api';
import { useAuthStore } from '@/features/auth/auth-store';
import { BlockedLessonsTable } from './blocked-lessons-table';
import { QuickEditLessonDrawer } from './quick-edit-lesson-drawer';

export function BulkPublishModal({
  isOpen,
  onClose,
  type,
  item,
}: BulkPublishModalProps) {
  const isPublisher = useAuthStore((state) => state.isPublisher);
  const [preview, setPreview] = useState<BulkPublishPreviewResponse | null>(null);
  const [isLoading, setIsLoading] = useState<boolean>(false);
  const [error, setError] = useState<string | null>(null);
  const [editingLessonId, setEditingLessonId] = useState<string | null>(null);
  const isMountedRef = useRef<boolean>(true);

  useEffect(() => {
    isMountedRef.current = true;
    return () => {
      isMountedRef.current = false;
    };
  }, []);

  const loadPreview = useCallback(async () => {
    if (!item?.id || !isPublisher) return;
    setIsLoading(true);
    setError(null);

    try {
      let data: BulkPublishPreviewResponse;
      if (type === 'module') {
        data = await fetchModuleBulkPublishPreview(item.id);
      } else {
        data = await fetchChapterBulkPublishPreview(item.id);
      }
      if (isMountedRef.current) {
        setPreview(data);
      }
    } catch (err: unknown) {
      if (!isMountedRef.current) return;
      const msg =
        err instanceof ApiError && err.envelope?.detail
          ? err.envelope.detail
          : (err as Error)?.message ||
            "Impossible de charger l'aperçu de la publication en masse.";
      setError(msg);
    } finally {
      if (isMountedRef.current) {
        setIsLoading(false);
      }
    }
  }, [item?.id, type, isPublisher]);

  useEffect(() => {
    if (isOpen && item?.id) {
      loadPreview();
    } else {
      setPreview(null);
      setError(null);
      setIsLoading(false);
      setEditingLessonId(null);
    }
  }, [isOpen, item?.id, loadPreview]);

  const handleOpenChange = (open: boolean) => {
    if (!open) {
      if (isLoading || !!editingLessonId) return;
      onClose();
    }
  };

  const wouldChange = preview?.would_change ?? 0;
  const blockedCount = preview?.blocked?.length ?? 0;
  const isAllPublished = preview !== null && wouldChange === 0 && blockedCount === 0;

  const readySummaryText =
    wouldChange <= 1
      ? `${wouldChange} leçon prête à être publiée`
      : `${wouldChange} leçons prêtes à être publiées`;

  const blockedSummaryText =
    blockedCount === 1
      ? '1 leçon bloquée'
      : `${blockedCount} leçons bloquées`;

  return (
    <Dialog open={isOpen} onOpenChange={handleOpenChange}>
      {item && (
        <DialogContent
          data-testid="bulk-publish-modal"
          className="sm:max-w-xl bg-surface border-border text-foreground"
          onPointerDownOutside={(e) => {
            if (isLoading || !!editingLessonId) e.preventDefault();
          }}
          onEscapeKeyDown={(e) => {
            if (isLoading || !!editingLessonId) e.preventDefault();
          }}
        >
          <DialogHeader>
            <DialogTitle>
              {type === 'module'
                ? 'Publication en masse du module'
                : 'Publication en masse du chapitre'}
            </DialogTitle>
            <DialogDescription>
              {type === 'module'
                ? `Aperçu de la publication pour le module « ${item?.name ?? ''} »`
                : `Aperçu de la publication pour le chapitre « ${item?.name ?? ''} »`}
            </DialogDescription>
          </DialogHeader>

          <div className="py-2 space-y-4">
            {isLoading && (
              <div
                role="status"
                data-testid="bulk-publish-loading"
                className="flex flex-col items-center justify-center py-8 gap-3 text-foreground-muted"
              >
                <Loader2 className="h-8 w-8 animate-spin text-primary" />
                <span className="text-sm">Chargement de l'aperçu...</span>
              </div>
            )}

            {error && !isLoading && (
              <div
                role="alert"
                data-testid="bulk-publish-error"
                className="rounded-lg border border-destructive-border bg-destructive-surface p-4 text-sm text-destructive space-y-3"
              >
                <div className="flex items-center gap-2">
                  <AlertCircle className="h-5 w-5 shrink-0 text-destructive" />
                  <span>{error}</span>
                </div>
                <div>
                  <Button
                    type="button"
                    variant="outline"
                    size="sm"
                    data-testid="bulk-publish-retry-btn"
                    onClick={loadPreview}
                    className="min-h-[44px] min-w-[44px] border-destructive-border text-destructive hover:bg-destructive/10"
                  >
                    Réessayer
                  </Button>
                </div>
              </div>
            )}

            {preview && !isLoading && !error && (
              <>
                {isAllPublished ? (
                  <div
                    data-testid="bulk-publish-all-published-notice"
                    className="rounded-lg border border-border bg-background/50 p-6 text-center space-y-2"
                  >
                    <CheckCircle2 className="mx-auto h-8 w-8 text-success" />
                    <p className="text-sm font-medium text-foreground">
                      Toutes les leçons sont déjà publiées. Aucune mise à jour n'est requise.
                    </p>
                  </div>
                ) : (
                  <div className="space-y-3">
                    {/* Ready Lessons Summary */}
                    {wouldChange > 0 && (
                      <div
                        data-testid="bulk-publish-ready-summary"
                        className="flex items-center gap-3 rounded-lg border border-success-border bg-success-surface p-3 text-sm text-success"
                      >
                        <CheckCircle2 className="h-5 w-5 shrink-0 text-success" />
                        <span className="font-semibold">{readySummaryText}</span>
                      </div>
                    )}

                    {/* Blocked Lessons Summary & Table */}
                    {blockedCount > 0 && (
                      <div className="space-y-3">
                        <div
                          data-testid="bulk-publish-blocked-summary"
                          className="flex items-center gap-3 rounded-lg border border-warning-border bg-warning-surface p-3 text-sm text-warning"
                        >
                          <AlertTriangle className="h-5 w-5 shrink-0 text-warning" />
                          <span className="font-semibold">{blockedSummaryText}</span>
                        </div>

                        <BlockedLessonsTable
                          blocked={preview.blocked}
                          onEditLesson={(lessonId) => setEditingLessonId(lessonId)}
                          isUpdating={isLoading}
                        />
                      </div>
                    )}
                  </div>
                )}
              </>
            )}
          </div>

          <DialogFooter>
            <Button
              type="button"
              variant="outline"
              data-testid="bulk-publish-close-btn"
              onClick={onClose}
              disabled={isLoading || !!editingLessonId}
              className="min-h-[44px] min-w-[44px]"
            >
              Fermer
            </Button>
          </DialogFooter>
        </DialogContent>
      )}

      {/* Quick Edit Lesson Drawer for fast in-place resolution */}
      <QuickEditLessonDrawer
        isOpen={!!editingLessonId}
        lessonId={editingLessonId}
        onClose={() => setEditingLessonId(null)}
        onSaveSuccess={() => {
          setEditingLessonId(null);
          loadPreview();
        }}
      />
    </Dialog>
  );
}
