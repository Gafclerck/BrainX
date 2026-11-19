import { useState, useEffect } from 'react';
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogDescription,
  DialogFooter,
} from '@/components/ui/dialog';
import { Button } from '@/components/ui/button';
import { AlertCircle, Loader2, RotateCcw } from 'lucide-react';
import { restoreTrashItem } from '../api';
import type { TrashItem, TrashItemType } from '../types';
import { ApiError } from '@/lib/api';
import { cn } from '@/lib/utils';

export interface RestoreConfirmationModalProps {
  isOpen: boolean;
  onClose: () => void;
  item: TrashItem | null;
  onSuccess: (restoredItem: unknown) => void;
}

export const TRASH_TYPE_LABELS: Record<TrashItemType, string> = {
  course: 'Cours',
  module: 'Module',
  chapter: 'Chapitre',
  lesson: 'Leçon',
  resource: 'Ressource',
};

export const TRASH_TYPE_BADGE_CLASSES: Record<TrashItemType, string> = {
  course: 'bg-blue-900/40 text-blue-300 border-blue-700/50',
  module: 'bg-purple-900/40 text-purple-300 border-purple-700/50',
  chapter: 'bg-indigo-900/40 text-indigo-300 border-indigo-700/50',
  lesson: 'bg-emerald-900/40 text-emerald-300 border-emerald-700/50',
  resource: 'bg-amber-900/40 text-amber-300 border-amber-700/50',
};

export function formatTrashDate(dateStr: string): string {
  if (!dateStr || typeof dateStr !== 'string') return '';
  return dateStr.slice(0, 10);
}

export function RestoreConfirmationModal({
  isOpen,
  onClose,
  item,
  onSuccess,
}: RestoreConfirmationModalProps) {
  const [isRestoring, setIsRestoring] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (isOpen) {
      setError(null);
      setIsRestoring(false);
    }
  }, [isOpen]);

  const handleOpenChange = (open: boolean) => {
    if (!open && !isRestoring) {
      onClose();
    }
  };

  const handleConfirm = async () => {
    if (!item) return;
    setIsRestoring(true);
    setError(null);

    try {
      const restored = await restoreTrashItem(item);
      onSuccess(restored);
      onClose();
    } catch (err: unknown) {
      const message =
        err instanceof ApiError && err.envelope.detail
          ? err.envelope.detail
          : (err as Error)?.message ||
            'Une erreur est survenue lors de la restauration de l’élément.';
      setError(message);
    } finally {
      setIsRestoring(false);
    }
  };

  if (!item) return null;

  const typeLabel = TRASH_TYPE_LABELS[item.type] || item.type;
  const badgeClass = TRASH_TYPE_BADGE_CLASSES[item.type] || 'bg-gray-800 text-gray-200 border-gray-700';

  return (
    <Dialog open={isOpen} onOpenChange={handleOpenChange}>
      <DialogContent
        data-testid="restore-confirm-modal"
        className="bg-[#161B22] border border-[#30363D] text-[#E6EDF3] sm:max-w-md w-full"
      >
        <DialogHeader>
          <div className="flex items-center gap-2">
            <div className="p-2 rounded-full bg-primary/10 text-primary">
              <RotateCcw className="h-5 w-5" aria-hidden="true" />
            </div>
            <DialogTitle className="text-lg font-bold text-foreground">
              Confirmer la restauration
            </DialogTitle>
          </div>
          <DialogDescription className="text-sm text-foreground-muted">
            Voulez-vous vraiment restaurer cet élément ? Il redeviendra visible dans son conteneur d'origine.
          </DialogDescription>
        </DialogHeader>

        {/* Item Summary Card */}
        <div className="p-3.5 rounded-lg border border-[#30363D] bg-[#0D1117] space-y-2.5">
          <div className="flex items-center justify-between gap-2">
            <span className="font-semibold text-foreground truncate text-sm sm:text-base">
              {item.name}
            </span>
            <span
              data-testid="restore-modal-type-badge"
              className={cn(
                'inline-flex items-center px-2 py-0.5 rounded-full text-xs font-medium border select-none shrink-0',
                badgeClass
              )}
            >
              {typeLabel}
            </span>
          </div>

          {item.parent_path && (
            <p className="text-xs text-foreground-muted truncate">
              <span className="font-medium text-foreground-muted/80">Emplacement :</span> {item.parent_path}
            </p>
          )}

          <div className="text-xs text-foreground-muted flex flex-wrap items-center justify-between gap-2 pt-2 border-t border-[#30363D]/60">
            <span>
              Auteur : {item.last_modified_by?.email || 'Non renseigné'}
            </span>
            <span>
              Supprimé le : {formatTrashDate(item.deleted_at)}
            </span>
          </div>
        </div>

        {/* Error notification banner */}
        {error && (
          <div
            role="alert"
            data-testid="restore-modal-error"
            className="p-3 rounded bg-red-900/30 border border-red-800 text-red-200 text-xs sm:text-sm flex items-start gap-2"
          >
            <AlertCircle className="w-4 h-4 mt-0.5 shrink-0 text-red-400" aria-hidden="true" />
            <div className="flex-1">
              <span className="font-medium">Erreur de restauration : </span>
              <span>{error}</span>
            </div>
          </div>
        )}

        <DialogFooter className="flex flex-col-reverse sm:flex-row gap-2 pt-2">
          <Button
            type="button"
            variant="outline"
            data-testid="restore-cancel-btn"
            onClick={onClose}
            disabled={isRestoring}
            className="min-h-[44px] min-w-[44px] text-xs sm:text-sm"
          >
            Annuler
          </Button>
          <Button
            type="button"
            variant="default"
            data-testid="restore-confirm-btn"
            onClick={handleConfirm}
            disabled={isRestoring}
            className="min-h-[44px] min-w-[44px] text-xs sm:text-sm bg-primary text-primary-foreground hover:bg-primary/90"
          >
            {isRestoring ? (
              <>
                <Loader2 className="w-4 h-4 mr-2 animate-spin" aria-hidden="true" />
                <span>Restauration en cours...</span>
              </>
            ) : (
              <>
                <RotateCcw className="w-4 h-4 mr-2" aria-hidden="true" />
                <span>Restaurer</span>
              </>
            )}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

export default RestoreConfirmationModal;
