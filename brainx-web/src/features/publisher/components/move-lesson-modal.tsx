import React, { useState, useEffect } from 'react';
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogDescription,
  DialogFooter,
} from '@/components/ui/dialog';
import { Button } from '@/components/ui/button';
import { AlertCircle, Loader2 } from 'lucide-react';
import { fetchAllManageableChapters, moveLesson } from '../api';
import type { ChapterOptionItem, PublisherLessonItem } from '../types';
import { ApiError } from '@/lib/api';

export interface MoveLessonModalProps {
  isOpen: boolean;
  onClose: () => void;
  lessonId: string;
  currentChapterId?: string;
  onSuccess: (movedLesson: PublisherLessonItem) => void;
}

export function MoveLessonModal({
  isOpen,
  onClose,
  lessonId,
  currentChapterId,
  onSuccess,
}: MoveLessonModalProps) {
  const [chapters, setChapters] = useState<ChapterOptionItem[]>([]);
  const [selectedChapterId, setSelectedChapterId] = useState<string>('');
  const [isLoadingChapters, setIsLoadingChapters] = useState<boolean>(false);
  const [isSubmitting, setIsSubmitting] = useState<boolean>(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (!isOpen) {
      setSelectedChapterId('');
      setError(null);
      setIsSubmitting(false);
      return;
    }

    let isMounted = true;
    setIsLoadingChapters(true);
    setError(null);

    fetchAllManageableChapters()
      .then((items) => {
        if (!isMounted) return;
        setChapters(items);
        setIsLoadingChapters(false);
      })
      .catch((err: unknown) => {
        if (!isMounted) return;
        const msg =
          err instanceof Error
            ? err.message
            : 'Erreur lors du chargement des chapitres.';
        setError(msg);
        setIsLoadingChapters(false);
      });

    return () => {
      isMounted = false;
    };
  }, [isOpen]);

  const handleOpenChange = (open: boolean) => {
    if (!open && !isSubmitting) {
      onClose();
    }
  };

  const handleConfirm = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!selectedChapterId) {
      setError('Veuillez sélectionner un chapitre de destination.');
      return;
    }

    if (currentChapterId && selectedChapterId === currentChapterId) {
      setError('Le chapitre de destination doit être différent du chapitre actuel.');
      return;
    }

    setIsSubmitting(true);
    setError(null);

    try {
      const moved = await moveLesson(lessonId, selectedChapterId);
      onSuccess(moved);
      onClose();
    } catch (err: unknown) {
      if (err instanceof ApiError) {
        const errors = err.envelope.errors;
        let msg = '';
        if (errors) {
          if (errors.chapter) {
            msg = Array.isArray(errors.chapter) ? errors.chapter[0] : String(errors.chapter);
          } else if (errors.new_chapter_id) {
            msg = Array.isArray(errors.new_chapter_id) ? errors.new_chapter_id[0] : String(errors.new_chapter_id);
          } else {
            const first = Object.values(errors)[0];
            msg = Array.isArray(first) ? first[0] : String(first);
          }
        }
        setError(msg || err.envelope.detail || 'Erreur lors du déplacement de la leçon.');
      } else if (err instanceof Error) {
        setError(err.message);
      } else {
        setError('Une erreur inattendue est survenue.');
      }
    } finally {
      setIsSubmitting(false);
    }
  };

  const isCurrentSelected = Boolean(
    currentChapterId && selectedChapterId === currentChapterId
  );

  return (
    <Dialog open={isOpen} onOpenChange={handleOpenChange}>
      <DialogContent
        data-testid="move-lesson-modal"
        className="w-[calc(100%-2rem)] sm:max-w-md bg-card border-border text-foreground p-6 rounded-lg shadow-xl"
      >
        <DialogHeader className="space-y-2">
          <DialogTitle
            data-testid="move-lesson-modal-title"
            className="text-lg sm:text-xl font-bold text-foreground"
          >
            Déplacer la leçon
          </DialogTitle>
          <DialogDescription className="text-xs sm:text-sm text-foreground-muted">
            Sélectionnez le nouveau chapitre d'accueil pour cette leçon. La leçon sera ajoutée à la fin du chapitre choisi.
          </DialogDescription>
        </DialogHeader>

        {error && (
          <div
            role="alert"
            data-testid="move-error-alert"
            className="rounded-lg border border-destructive-border bg-destructive-surface p-3 flex items-start gap-2.5 text-xs text-destructive"
          >
            <AlertCircle className="h-4 w-4 shrink-0 mt-0.5" aria-hidden="true" />
            <span className="flex-1 leading-relaxed">{error}</span>
          </div>
        )}

        <form onSubmit={handleConfirm} className="space-y-4 pt-2">
          <div className="space-y-1.5">
            <label
              htmlFor="target-chapter-select"
              className="block text-xs font-semibold text-foreground uppercase tracking-wider"
            >
              Chapitre de destination <span className="text-destructive">*</span>
            </label>

            {isLoadingChapters ? (
              <div
                data-testid="chapters-loading-indicator"
                className="flex items-center gap-2 p-3 text-xs text-foreground-muted border border-border rounded-md bg-surface/50 animate-pulse"
              >
                <Loader2 className="h-4 w-4 animate-spin text-primary" />
                <span>Chargement de l'arborescence des chapitres...</span>
              </div>
            ) : (
              <select
                id="target-chapter-select"
                data-testid="target-chapter-select"
                value={selectedChapterId}
                onChange={(e) => {
                  setSelectedChapterId(e.target.value);
                  setError(null);
                }}
                disabled={isSubmitting}
                className="w-full min-h-[44px] px-3 py-2 bg-surface border border-border rounded-md text-foreground text-sm focus:outline-none focus:ring-2 focus:ring-border-focus focus:border-transparent transition-colors"
              >
                <option value="">-- Choisir un chapitre --</option>
                {chapters.map((chap) => {
                  const isCurrent = chap.id === currentChapterId;
                  const courseName = chap.course_name || chap.courseName || '';
                  const moduleName = chap.module_name || chap.moduleName || '';
                  const label = `${courseName} > ${moduleName} > ${chap.name}${
                    isCurrent ? ' (Actuel)' : ''
                  }`;

                  return (
                    <option
                      key={chap.id}
                      value={chap.id}
                      disabled={isCurrent}
                      className={isCurrent ? 'text-foreground-muted italic' : ''}
                    >
                      {label}
                    </option>
                  );
                })}
              </select>
            )}
            {isCurrentSelected && (
              <p
                data-testid="same-chapter-warning"
                className="text-xs text-amber-500 font-medium"
              >
                La leçon se trouve déjà dans ce chapitre.
              </p>
            )}
          </div>

          <DialogFooter className="flex flex-col-reverse sm:flex-row sm:justify-end gap-2 pt-4 border-t border-border/70">
            <Button
              type="button"
              variant="outline"
              data-testid="cancel-move-btn"
              onClick={onClose}
              disabled={isSubmitting}
              className="min-h-[44px] min-w-[44px] text-xs font-medium border-border"
            >
              Annuler
            </Button>
            <Button
              type="submit"
              variant="default"
              data-testid="confirm-move-btn"
              disabled={
                isSubmitting ||
                isLoadingChapters ||
                !selectedChapterId ||
                isCurrentSelected
              }
              className="min-h-[44px] min-w-[44px] text-xs font-medium bg-primary text-primary-foreground hover:bg-primary-hover shadow-sm inline-flex items-center justify-center gap-2"
            >
              {isSubmitting ? (
                <>
                  <Loader2 className="h-4 w-4 animate-spin" />
                  <span>Déplacement...</span>
                </>
              ) : (
                <span>Déplacer</span>
              )}
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
}
