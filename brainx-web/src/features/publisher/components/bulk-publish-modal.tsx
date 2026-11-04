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
  commitModuleBulkPublish,
  commitChapterBulkPublish,
} from '../api';
import type {
  BulkPublishModalProps,
  BulkPublishPreviewResponse,
  BulkPublishCommitPayload,
  BulkPublishCommitResponse,
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
  onSuccess,
}: BulkPublishModalProps) {
  const isPublisher = useAuthStore((state) => state.isPublisher);
  const [preview, setPreview] = useState<BulkPublishPreviewResponse | null>(null);
  const [isLoading, setIsLoading] = useState<boolean>(false);
  const [isCommitting, setIsCommitting] = useState<boolean>(false);
  const [commitSuccess, setCommitSuccess] = useState<BulkPublishCommitResponse | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [conflictError, setConflictError] = useState<string | null>(null);
  const [editingLessonId, setEditingLessonId] = useState<string | null>(null);
  const isMountedRef = useRef<boolean>(true);

  useEffect(() => {
    isMountedRef.current = true;
    return () => {
      isMountedRef.current = false;
    };
  }, []);

  const loadPreview = useCallback(async (preserveConflict = false) => {
    if (!item?.id || !isPublisher) return;
    setIsLoading(true);
    setError(null);
    setCommitSuccess(null);
    if (!preserveConflict) {
      setConflictError(null);
    }

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
      setCommitSuccess(null);
      setConflictError(null);
      loadPreview();
    } else {
      setPreview(null);
      setError(null);
      setConflictError(null);
      setCommitSuccess(null);
      setIsLoading(false);
      setIsCommitting(false);
      setEditingLessonId(null);
    }
  }, [isOpen, item?.id, loadPreview]);

  const handleCommit = async () => {
    if (
      !item?.id ||
      !isPublisher ||
      !preview ||
      isCommitting ||
      isLoading ||
      wouldChange === 0
    ) {
      return;
    }

    setIsCommitting(true);
    setError(null);
    setConflictError(null);

    const payload: BulkPublishCommitPayload = {
      would_change: preview.would_change,
      blocked: (preview.blocked || []).map((b) => ({
        id: b.id,
        missing: b.missing,
      })),
    };

    try {
      let result: BulkPublishCommitResponse;
      if (type === 'module') {
        result = await commitModuleBulkPublish(item.id, payload);
      } else {
        result = await commitChapterBulkPublish(item.id, payload);
      }

      if (isMountedRef.current) {
        setCommitSuccess(result);
        onSuccess?.(result);
      }
    } catch (err: unknown) {
      if (!isMountedRef.current) return;

      const isConflict =
        (err instanceof ApiError && err.envelope?.status === 409) ||
        (err as { status?: number })?.status === 409;

      if (isConflict) {
        const conflictMsg =
          (err instanceof ApiError && err.envelope?.detail) ||
          'Conflit de concurrence : le contenu a été modifié par un autre utilisateur. L’aperçu a été actualisé.';
        setConflictError(conflictMsg);
        await loadPreview(true);
      } else {
        const errorMsg =
          (err instanceof ApiError && err.envelope?.detail) ||
          (err as Error)?.message ||
          'Échec de la publication en masse.';
        setError(errorMsg);
      }
    } finally {
      if (isMountedRef.current) {
        setIsCommitting(false);
      }
    }
  };

  const handleOpenChange = (open: boolean) => {
    if (!open) {
      if (isLoading || isCommitting || !!editingLessonId) return;
      onClose();
    }
  };

  const wouldChange = preview?.would_change ?? 0;
  const blockedCount = preview?.blocked?.length ?? 0;
  const isAllPublished =
    preview !== null && wouldChange === 0 && blockedCount === 0 && !commitSuccess;

  const readySummaryText =
    wouldChange <= 1
      ? `${wouldChange} leçon prête à être publiée`
      : `${wouldChange} leçons prêtes à être publiées`;

  const blockedSummaryText =
    blockedCount === 1
      ? '1 leçon bloquée'
      : `${blockedCount} leçons bloquées`;

  const successSummaryText = commitSuccess
    ? commitSuccess.changed <= 1
      ? `${commitSuccess.changed} leçon publiée avec succès.`
      : `${commitSuccess.changed} leçons publiées avec succès.`
    : '';

  return (
    <Dialog open={isOpen} onOpenChange={handleOpenChange}>
      {item && (
        <DialogContent
          data-testid="bulk-publish-modal"
          className="sm:max-w-xl bg-surface border-border text-foreground max-h-[90vh] overflow-y-auto"
          onPointerDownOutside={(e) => {
            if (isLoading || isCommitting || !!editingLessonId) e.preventDefault();
          }}
          onEscapeKeyDown={(e) => {
            if (isLoading || isCommitting || !!editingLessonId) e.preventDefault();
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

          <div className="py-2 space-y-4 overflow-x-auto">
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

            {conflictError && !isLoading && (
              <div
                role="alert"
                data-testid="bulk-publish-conflict-alert"
                className="rounded-lg border border-warning-border bg-warning-surface p-4 text-sm text-warning space-y-2"
              >
                <div className="flex items-center gap-2">
                  <AlertTriangle className="h-5 w-5 shrink-0 text-warning" />
                  <span>{conflictError}</span>
                </div>
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
                {!preview && (
                  <div>
                    <Button
                      type="button"
                      variant="outline"
                      size="sm"
                      data-testid="bulk-publish-retry-btn"
                      onClick={() => loadPreview()}
                      className="min-h-[44px] min-w-[44px] border-destructive-border text-destructive hover:bg-destructive/10"
                    >
                      Réessayer
                    </Button>
                  </div>
                )}
              </div>
            )}

            {commitSuccess && (
              <div
                role="status"
                data-testid="bulk-publish-success-notice"
                className="flex items-center gap-3 rounded-lg border border-success-border bg-success-surface p-4 text-sm text-success"
              >
                <CheckCircle2 className="h-5 w-5 shrink-0 text-success" />
                <span className="font-semibold">{successSummaryText}</span>
              </div>
            )}

            {preview && !isLoading && (
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
                    {/* Ready Lessons Summary (only when not already committed) */}
                    {!commitSuccess && wouldChange > 0 && (
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
                          isUpdating={isLoading || isCommitting}
                        />
                      </div>
                    )}
                  </div>
                )}
              </>
            )}
          </div>

          <DialogFooter className="flex flex-col-reverse sm:flex-row sm:justify-end gap-2">
            <Button
              type="button"
              variant="outline"
              data-testid="bulk-publish-close-btn"
              onClick={onClose}
              disabled={isLoading || isCommitting || !!editingLessonId}
              className="min-h-[44px] min-w-[44px]"
            >
              Fermer
            </Button>
            <Button
              type="button"
              data-testid="bulk-publish-confirm-btn"
              onClick={handleCommit}
              disabled={
                isLoading ||
                isCommitting ||
                wouldChange === 0 ||
                !!editingLessonId ||
                Boolean(commitSuccess)
              }
              className="min-h-[44px] min-w-[44px]"
            >
              {isCommitting ? (
                <>
                  <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                  <span>Publication en cours...</span>
                </>
              ) : (
                'Confirmer la publication'
              )}
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
