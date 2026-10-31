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
import { AlertCircle, AlertTriangle, Loader2, Trash2 } from 'lucide-react';
import {
  fetchCourseRemovalPreview,
  fetchModuleRemovalPreview,
  fetchChapterRemovalPreview,
  deleteCourse,
  deleteModule,
  deleteChapter,
} from '../api';
import type {
  ContainerType,
  RemovalPreviewResponse,
  PublisherCourseItem,
  PublisherModuleItem,
  PublisherChapterItem,
} from '../types';
import { ApiError } from '@/lib/api';

export interface RemovalPreviewModalProps {
  isOpen: boolean;
  onClose: () => void;
  type: ContainerType; // 'course' | 'module' | 'chapter'
  item: {
    id: string;
    name: string;
  } | null;
  onSuccess: (
    deletedItem: PublisherCourseItem | PublisherModuleItem | PublisherChapterItem
  ) => void;
}

const TYPE_NAMES: Record<ContainerType, string> = {
  course: 'le cours',
  module: 'le module',
  chapter: 'le chapitre',
};

export function RemovalPreviewModal({
  isOpen,
  onClose,
  type,
  item,
  onSuccess,
}: RemovalPreviewModalProps) {
  const [preview, setPreview] = useState<RemovalPreviewResponse | null>(null);
  const [isLoadingPreview, setIsLoadingPreview] = useState<boolean>(false);
  const [previewError, setPreviewError] = useState<string | null>(null);
  const [isDeleting, setIsDeleting] = useState<boolean>(false);
  const [deleteError, setDeleteError] = useState<string | null>(null);
  const isMountedRef = useRef(true);

  useEffect(() => {
    isMountedRef.current = true;
    return () => {
      isMountedRef.current = false;
    };
  }, []);

  const loadPreview = useCallback(async () => {
    if (!item?.id) return;
    setIsLoadingPreview(true);
    setPreviewError(null);
    setPreview(null);
    setDeleteError(null);

    try {
      let data: RemovalPreviewResponse;
      if (type === 'course') {
        data = await fetchCourseRemovalPreview(item.id);
      } else if (type === 'module') {
        data = await fetchModuleRemovalPreview(item.id);
      } else {
        data = await fetchChapterRemovalPreview(item.id);
      }
      if (isMountedRef.current) {
        setPreview(data);
      }
    } catch (err: unknown) {
      if (!isMountedRef.current) return;
      const msg =
        err instanceof ApiError && err.envelope.detail
          ? err.envelope.detail
          : (err as Error)?.message ||
            'Impossible de charger l’aperçu de la suppression.';
      setPreviewError(msg);
    } finally {
      if (isMountedRef.current) {
        setIsLoadingPreview(false);
      }
    }
  }, [item?.id, type]);

  useEffect(() => {
    let active = true;

    if (isOpen && item?.id) {
      loadPreview();
    } else {
      setPreview(null);
      setPreviewError(null);
      setDeleteError(null);
      setIsDeleting(false);
    }

    return () => {
      active = false;
    };
  }, [isOpen, item?.id, loadPreview]);

  const handleOpenChange = (open: boolean) => {
    if (!open && !isDeleting) {
      onClose();
    }
  };

  const handleConfirmDelete = async () => {
    if (!item?.id) return;
    setIsDeleting(true);
    setDeleteError(null);

    try {
      let deleted: PublisherCourseItem | PublisherModuleItem | PublisherChapterItem;
      if (type === 'course') {
        deleted = await deleteCourse(item.id);
      } else if (type === 'module') {
        deleted = await deleteModule(item.id);
      } else {
        deleted = await deleteChapter(item.id);
      }

      onSuccess(deleted);
      onClose();
    } catch (err: unknown) {
      const msg =
        err instanceof ApiError && err.envelope.detail
          ? err.envelope.detail
          : (err as Error)?.message ||
            'Une erreur est survenue lors de la suppression.';
      setDeleteError(msg);
    } finally {
      setIsDeleting(false);
    }
  };

  if (!item) return null;

  const counts = preview?.would_remove;

  return (
    <Dialog open={isOpen} onOpenChange={handleOpenChange}>
      <DialogContent
        data-testid="removal-preview-modal"
        className="bg-card border-border sm:max-w-lg w-full"
      >
        <DialogHeader>
          <div className="flex items-center gap-2 text-destructive">
            <AlertTriangle className="h-5 w-5 shrink-0" aria-hidden="true" />
            <DialogTitle data-testid="removal-preview-title">
              Supprimer {TYPE_NAMES[type]} « {item.name} » ?
            </DialogTitle>
          </div>
          <DialogDescription data-testid="removal-preview-description">
            Veuillez vérifier l’impact de cette action avant de confirmer la suppression douce.
          </DialogDescription>
        </DialogHeader>

        <div className="space-y-4 py-2">
          {/* Loading preview state */}
          {isLoadingPreview && (
            <div
              data-testid="removal-preview-loading"
              className="py-8 flex flex-col items-center justify-center gap-2 text-foreground-muted"
            >
              <Loader2 className="h-6 w-6 animate-spin text-primary" />
              <span className="text-sm">Calcul de l’impact en cascade...</span>
            </div>
          )}

          {/* Preview Fetch Error */}
          {previewError && (
            <div
              role="alert"
              data-testid="removal-preview-error"
              className="p-3 rounded-md bg-destructive-surface border border-destructive-border text-destructive text-sm flex flex-col gap-2"
            >
              <div className="flex items-start gap-2">
                <AlertCircle className="h-4 w-4 shrink-0 mt-0.5" />
                <span>{previewError}</span>
              </div>
              <Button
                type="button"
                variant="outline"
                size="sm"
                data-testid="removal-preview-retry-btn"
                onClick={loadPreview}
                className="self-start text-xs border-destructive-border hover:bg-destructive/10"
              >
                Réessayer
              </Button>
            </div>
          )}

          {/* Delete Action Error */}
          {deleteError && (
            <div
              role="alert"
              data-testid="removal-delete-error"
              className="p-3 rounded-md bg-destructive-surface border border-destructive-border text-destructive text-sm flex items-start gap-2"
            >
              <AlertCircle className="h-4 w-4 shrink-0 mt-0.5" />
              <span>{deleteError}</span>
            </div>
          )}

          {/* Impact preview counts */}
          {!isLoadingPreview && counts && (
            <div className="space-y-3">
              <div className="text-xs font-semibold uppercase tracking-wider text-foreground-muted">
                Impact sur les contenus :
              </div>

              {/* Badge Grid */}
              <div
                data-testid="removal-preview-counts"
                className="grid grid-cols-2 sm:grid-cols-4 gap-2"
              >
                {counts.course !== undefined && counts.course > 0 && (
                  <div
                    data-testid="badge-count-course"
                    className="p-2.5 rounded-md border border-[#DA3633] bg-[#251719] text-center"
                  >
                    <div className="text-lg font-bold text-[#F85149]">
                      {counts.course}
                    </div>
                    <div className="text-[11px] font-medium text-[#F85149]/80 uppercase">
                      Cours
                    </div>
                  </div>
                )}
                {counts.module !== undefined && counts.module > 0 && (
                  <div
                    data-testid="badge-count-module"
                    className="p-2.5 rounded-md border border-[#9E6A03] bg-[#2E2211] text-center"
                  >
                    <div className="text-lg font-bold text-[#D29922]">
                      {counts.module}
                    </div>
                    <div className="text-[11px] font-medium text-[#D29922]/80 uppercase">
                      Module(s)
                    </div>
                  </div>
                )}
                {counts.chapter !== undefined && counts.chapter > 0 && (
                  <div
                    data-testid="badge-count-chapter"
                    className="p-2.5 rounded-md border border-[#9E6A03] bg-[#2E2211] text-center"
                  >
                    <div className="text-lg font-bold text-[#D29922]">
                      {counts.chapter}
                    </div>
                    <div className="text-[11px] font-medium text-[#D29922]/80 uppercase">
                      Chapitre(s)
                    </div>
                  </div>
                )}
                {counts.lesson !== undefined && counts.lesson > 0 && (
                  <div
                    data-testid="badge-count-lesson"
                    className="p-2.5 rounded-md border border-[#9E6A03] bg-[#2E2211] text-center"
                  >
                    <div className="text-lg font-bold text-[#D29922]">
                      {counts.lesson}
                    </div>
                    <div className="text-[11px] font-medium text-[#D29922]/80 uppercase">
                      Leçon(s)
                    </div>
                  </div>
                )}
              </div>

              {/* Total Summary */}
              <div
                data-testid="removal-total-summary"
                className="text-xs text-foreground font-medium"
              >
                Au total :{' '}
                <span data-testid="removal-total-count" className="font-bold text-[#F85149]">
                  {counts.total}
                </span>{' '}
                élément(s) seront masqués pour les étudiants.
              </div>

              {/* Soft Delete Clarification Notice */}
              <div
                data-testid="removal-soft-delete-notice"
                className="rounded-md border border-border bg-surface p-3 text-xs text-foreground-muted space-y-1"
              >
                <div className="font-semibold text-foreground">
                  Suppression douce réversible
                </div>
                <p>
                  Les contenus ne sont pas définitivement détruits. Ils sont déplacés dans la{' '}
                  <span className="font-medium text-foreground">Corbeille</span> et restent
                  restaurables par un éditeur à tout moment.
                </p>
              </div>
            </div>
          )}
        </div>

        <DialogFooter className="pt-4 flex flex-col-reverse sm:flex-row sm:justify-end gap-2">
          <Button
            type="button"
            variant="outline"
            data-testid="removal-cancel-btn"
            onClick={onClose}
            disabled={isDeleting}
            className="min-h-[44px] min-w-[44px] text-xs sm:text-sm font-medium border-border"
          >
            Annuler
          </Button>
          <Button
            type="button"
            variant="default"
            data-testid="removal-confirm-btn"
            onClick={handleConfirmDelete}
            disabled={isDeleting || isLoadingPreview || !preview || Boolean(previewError)}
            className="min-h-[44px] min-w-[44px] text-xs sm:text-sm font-medium bg-[#DA3633] text-white hover:bg-[#DA3633]/90 shadow-sm inline-flex items-center gap-2"
          >
            {isDeleting ? (
              <Loader2 className="h-4 w-4 animate-spin" />
            ) : (
              <Trash2 className="h-4 w-4" />
            )}
            <span>
              {isDeleting ? 'Suppression en cours...' : 'Confirmer la suppression'}
            </span>
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

export default RemovalPreviewModal;
