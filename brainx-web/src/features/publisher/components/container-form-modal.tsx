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
import { Input } from '@/components/ui/input';
import { AlertCircle, Loader2 } from 'lucide-react';
import {
  createCourse,
  updateCourse,
  createModule,
  updateModule,
  createChapter,
  updateChapter,
} from '../api';
import type {
  ContainerType,
  PublisherCourseItem,
  PublisherModuleItem,
  PublisherChapterItem,
} from '../types';
import { ApiError } from '@/lib/api';

export interface ContainerFormModalProps {
  isOpen: boolean;
  onClose: () => void;
  type: ContainerType; // 'course' | 'module' | 'chapter'
  mode: 'create' | 'edit';
  parentId?: string; // Required for creating module (courseId) or chapter (moduleId)
  initialData?: {
    id?: string;
    name?: string;
    subject?: string;
  };
  onSuccess: (
    item: PublisherCourseItem | PublisherModuleItem | PublisherChapterItem
  ) => void;
}

const TYPE_LABELS: Record<ContainerType, string> = {
  course: 'cours',
  module: 'module',
  chapter: 'chapitre',
};

export function ContainerFormModal({
  isOpen,
  onClose,
  type,
  mode,
  parentId,
  initialData,
  onSuccess,
}: ContainerFormModalProps) {
  const [name, setName] = useState<string>('');
  const [subject, setSubject] = useState<string>('');
  const [fieldErrors, setFieldErrors] = useState<Record<string, string>>({});
  const [generalError, setGeneralError] = useState<string | null>(null);
  const [isSubmitting, setIsSubmitting] = useState<boolean>(false);

  useEffect(() => {
    if (isOpen) {
      setName(initialData?.name || '');
      setSubject(initialData?.subject || '');
      setFieldErrors({});
      setGeneralError(null);
      setIsSubmitting(false);
    }
  }, [isOpen, initialData]);

  const handleOpenChange = (open: boolean) => {
    if (!open && !isSubmitting) {
      onClose();
    }
  };

  const validate = (): boolean => {
    const errors: Record<string, string> = {};

    if (!name.trim()) {
      errors.name = 'Le titre est obligatoire.';
    }

    if (type === 'course' && !subject.trim()) {
      errors.subject = 'La matière est obligatoire.';
    }

    setFieldErrors(errors);
    return Object.keys(errors).length === 0;
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setGeneralError(null);

    if (!validate()) {
      return;
    }

    if (mode === 'edit' && !initialData?.id) {
      setGeneralError('Identifiant manquant pour la modification.');
      return;
    }

    setIsSubmitting(true);
    try {
      let result: PublisherCourseItem | PublisherModuleItem | PublisherChapterItem;

      if (type === 'course') {
        if (mode === 'create') {
          result = await createCourse({
            name: name.trim(),
            subject: subject.trim(),
          });
        } else {
          result = await updateCourse(initialData!.id!, {
            name: name.trim(),
            subject: subject.trim(),
          });
        }
      } else if (type === 'module') {
        if (mode === 'create') {
          if (!parentId) {
            throw new Error('L’identifiant du cours parent est manquant.');
          }
          result = await createModule(parentId, {
            name: name.trim(),
          });
        } else {
          result = await updateModule(initialData!.id!, {
            name: name.trim(),
          });
        }
      } else {
        // chapter
        if (mode === 'create') {
          if (!parentId) {
            throw new Error('L’identifiant du module parent est manquant.');
          }
          result = await createChapter(parentId, {
            name: name.trim(),
          });
        } else {
          result = await updateChapter(initialData!.id!, {
            name: name.trim(),
          });
        }
      }

      onSuccess(result);
      onClose();
    } catch (err: unknown) {
      if (err instanceof ApiError) {
        const errors = err.envelope.errors || {};
        const newFieldErrors: Record<string, string> = {};
        const nonFieldErrors: string[] = [];

        for (const [key, msgs] of Object.entries(errors)) {
          const firstMsg = Array.isArray(msgs) ? msgs[0] : String(msgs);
          if (key === 'name' || key === 'title') {
            newFieldErrors.name = firstMsg;
          } else if (key === 'subject') {
            newFieldErrors.subject = firstMsg;
          } else {
            nonFieldErrors.push(firstMsg);
          }
        }

        setFieldErrors(newFieldErrors);

        if (nonFieldErrors.length > 0) {
          setGeneralError(nonFieldErrors.join(' '));
        } else if (Object.keys(newFieldErrors).length === 0) {
          const fallbackMsg =
            err.envelope.detail ||
            err.envelope.title ||
            'Une erreur est survenue lors de l’enregistrement.';
          setGeneralError(fallbackMsg);
        }
      } else {
        setGeneralError(
          (err as Error)?.message ||
            'Une erreur est survenue lors de l’enregistrement.'
        );
      }
    } finally {
      setIsSubmitting(false);
    }
  };

  const titleText =
    mode === 'create'
      ? `Nouveau ${TYPE_LABELS[type].charAt(0).toUpperCase() + TYPE_LABELS[type].slice(1)}`
      : `Modifier le ${TYPE_LABELS[type]}`;

  const descriptionText =
    mode === 'create'
      ? type === 'course'
        ? 'Renseignez le titre et la matière pour créer un nouveau cours.'
        : `Renseignez le titre pour créer un nouveau ${TYPE_LABELS[type]}.`
      : `Modifiez les informations du ${TYPE_LABELS[type]}.`;

  return (
    <Dialog open={isOpen} onOpenChange={handleOpenChange}>
      <DialogContent
        data-testid="container-form-modal"
        className="bg-card border-border sm:max-w-md w-full"
      >
        <DialogHeader>
          <DialogTitle data-testid="container-form-title">
            {titleText}
          </DialogTitle>
          <DialogDescription data-testid="container-form-description">
            {descriptionText}
          </DialogDescription>
        </DialogHeader>

        <form onSubmit={handleSubmit} className="space-y-4 pt-2">
          {generalError && (
            <div
              role="alert"
              data-testid="container-form-error"
              className="p-3 rounded-md bg-destructive-surface border border-destructive-border text-destructive text-sm flex items-start gap-2"
            >
              <AlertCircle className="h-4 w-4 shrink-0 mt-0.5" />
              <span>{generalError}</span>
            </div>
          )}

          {/* Container Title / Name */}
          <div className="space-y-1.5">
            <label
              htmlFor="container-name"
              className="block text-xs font-medium text-foreground"
            >
              Titre <span className="text-destructive">*</span>
            </label>
            <Input
              id="container-name"
              type="text"
              maxLength={255}
              data-testid="container-name-input"
              value={name}
              onChange={(e) => {
                setName(e.target.value);
                if (fieldErrors.name) {
                  setFieldErrors((prev) => ({ ...prev, name: '' }));
                }
              }}
              placeholder={
                type === 'course'
                  ? 'ex: Systèmes Distribués'
                  : type === 'module'
                  ? 'ex: Consensus Raft'
                  : 'ex: Élection du Leader'
              }
              aria-invalid={Boolean(fieldErrors.name)}
              aria-describedby={
                fieldErrors.name ? 'container-name-error' : undefined
              }
              disabled={isSubmitting}
              className="min-h-[44px] bg-surface border-border text-foreground focus-visible:ring-primary text-sm"
            />
            {fieldErrors.name && (
              <p
                id="container-name-error"
                data-testid="container-name-error"
                role="alert"
                className="text-xs text-destructive"
              >
                {fieldErrors.name}
              </p>
            )}
          </div>

          {/* Subject (Only for Course) */}
          {type === 'course' && (
            <div className="space-y-1.5">
              <label
                htmlFor="container-subject"
                className="block text-xs font-medium text-foreground"
              >
                Matière <span className="text-destructive">*</span>
              </label>
              <Input
                id="container-subject"
                type="text"
                maxLength={255}
                data-testid="container-subject-input"
                value={subject}
                onChange={(e) => {
                  setSubject(e.target.value);
                  if (fieldErrors.subject) {
                    setFieldErrors((prev) => ({ ...prev, subject: '' }));
                  }
                }}
                placeholder="ex: Génie Logiciel"
                aria-invalid={Boolean(fieldErrors.subject)}
                aria-describedby={
                  fieldErrors.subject ? 'container-subject-error' : undefined
                }
                disabled={isSubmitting}
                className="min-h-[44px] bg-surface border-border text-foreground focus-visible:ring-primary text-sm"
              />
              {fieldErrors.subject && (
                <p
                  id="container-subject-error"
                  data-testid="container-subject-error"
                  role="alert"
                  className="text-xs text-destructive"
                >
                  {fieldErrors.subject}
                </p>
              )}
            </div>
          )}

          <DialogFooter className="pt-4 flex flex-col-reverse sm:flex-row sm:justify-end gap-2">
            <Button
              type="button"
              variant="outline"
              data-testid="container-cancel-btn"
              onClick={onClose}
              disabled={isSubmitting}
              className="min-h-[44px] min-w-[44px] text-xs sm:text-sm font-medium border-border"
            >
              Annuler
            </Button>
            <Button
              type="submit"
              variant="default"
              data-testid="container-submit-btn"
              disabled={isSubmitting}
              className="min-h-[44px] min-w-[44px] text-xs sm:text-sm font-medium bg-primary text-primary-foreground hover:bg-primary-hover shadow-sm inline-flex items-center gap-2"
            >
              {isSubmitting && <Loader2 className="h-4 w-4 animate-spin" />}
              <span>
                {isSubmitting
                  ? 'Enregistrement...'
                  : mode === 'create'
                  ? 'Créer'
                  : 'Enregistrer'}
              </span>
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
}

export default ContainerFormModal;
