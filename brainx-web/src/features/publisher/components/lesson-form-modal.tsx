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
import { createLesson } from '../api';
import type { PublisherLessonItem } from '../types';
import { ApiError } from '@/lib/api';

export interface LessonFormModalProps {
  isOpen: boolean;
  onClose: () => void;
  chapterId: string;
  chapterName?: string;
  onSuccess: (lesson: PublisherLessonItem) => void;
}

const ISO_DATE_REGEX = /^\d{4}-\d{2}-\d{2}$/;

function getTodayIsoDate(): string {
  const now = new Date();
  const year = now.getFullYear();
  const month = String(now.getMonth() + 1).padStart(2, '0');
  const day = String(now.getDate()).padStart(2, '0');
  return `${year}-${month}-${day}`;
}

export function LessonFormModal({
  isOpen,
  onClose,
  chapterId,
  chapterName,
  onSuccess,
}: LessonFormModalProps) {
  const [title, setTitle] = useState<string>('');
  const [teacher, setTeacher] = useState<string>('');
  const [courseDate, setCourseDate] = useState<string>(getTodayIsoDate());
  const [description, setDescription] = useState<string>('');
  const [keywords, setKeywords] = useState<string>('');

  const [fieldErrors, setFieldErrors] = useState<Record<string, string>>({});
  const [generalError, setGeneralError] = useState<string | null>(null);
  const [isSubmitting, setIsSubmitting] = useState<boolean>(false);

  useEffect(() => {
    if (isOpen) {
      setTitle('');
      setTeacher('');
      setCourseDate(getTodayIsoDate());
      setDescription('');
      setKeywords('');
      setFieldErrors({});
      setGeneralError(null);
      setIsSubmitting(false);
    }
  }, [isOpen]);

  const handleOpenChange = (open: boolean) => {
    if (!open && !isSubmitting) {
      onClose();
    }
  };

  const validate = (): boolean => {
    const errors: Record<string, string> = {};

    if (!title.trim()) {
      errors.title = 'Le titre est obligatoire.';
    }

    if (!teacher.trim()) {
      errors.teacher = "Le nom de l'enseignant est obligatoire.";
    }

    if (!courseDate.trim()) {
      errors.course_date = 'La date du cours est obligatoire.';
    } else if (!ISO_DATE_REGEX.test(courseDate.trim())) {
      errors.course_date = 'Format de date invalide (AAAA-MM-JJ requis).';
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

    if (!chapterId) {
      setGeneralError('Identifiant du chapitre manquant.');
      return;
    }

    setIsSubmitting(true);
    try {
      const createdLesson = await createLesson(chapterId, {
        title: title.trim(),
        teacher: teacher.trim(),
        course_date: courseDate.trim(),
        description: description.trim() || undefined,
        keywords: keywords.trim() || undefined,
      });

      onSuccess(createdLesson);
      onClose();
    } catch (err: unknown) {
      if (err instanceof ApiError) {
        if (err.envelope?.errors && typeof err.envelope.errors === 'object') {
          const mapped: Record<string, string> = {};
          for (const [k, v] of Object.entries(err.envelope.errors)) {
            mapped[k] = Array.isArray(v) ? v[0] : String(v);
          }
          setFieldErrors(mapped);
          if (err.envelope.detail) {
            setGeneralError(err.envelope.detail);
          }
        } else if (err.envelope?.detail) {
          setGeneralError(err.envelope.detail);
        } else {
          setGeneralError('Erreur lors de la création de la leçon.');
        }
      } else if (err instanceof Error) {
        setGeneralError(err.message);
      } else {
        setGeneralError('Une erreur inattendue est survenue.');
      }
    } finally {
      setIsSubmitting(false);
    }
  };

  return (
    <Dialog open={isOpen} onOpenChange={handleOpenChange}>
      <DialogContent
        data-testid="lesson-form-modal"
        className="bg-card border-border sm:max-w-md w-full"
      >
        <DialogHeader>
          <DialogTitle data-testid="lesson-form-title">
            Nouvelle Leçon
          </DialogTitle>
          <DialogDescription data-testid="lesson-form-description">
            {chapterName
              ? `Ajouter une nouvelle leçon dans le chapitre "${chapterName}".`
              : 'Renseignez les détails pour créer une nouvelle leçon.'}
          </DialogDescription>
        </DialogHeader>

        <form onSubmit={handleSubmit} className="space-y-4 pt-2">
          {generalError && (
            <div
              role="alert"
              data-testid="lesson-form-error"
              className="p-3 rounded-md bg-destructive-surface border border-destructive-border text-destructive text-sm flex items-start gap-2"
            >
              <AlertCircle className="h-4 w-4 shrink-0 mt-0.5" />
              <span>{generalError}</span>
            </div>
          )}

          {/* Lesson Title */}
          <div className="space-y-1.5">
            <label
              htmlFor="lesson-title"
              className="block text-xs font-medium text-foreground"
            >
              Titre <span className="text-destructive">*</span>
            </label>
            <Input
              id="lesson-title"
              type="text"
              maxLength={255}
              data-testid="lesson-title-input"
              value={title}
              onChange={(e) => {
                setTitle(e.target.value);
                if (fieldErrors.title) {
                  setFieldErrors((prev) => ({ ...prev, title: '' }));
                }
              }}
              placeholder="ex: Architecture JVM et Compilation Bytecode"
              aria-invalid={Boolean(fieldErrors.title)}
              aria-describedby={fieldErrors.title ? 'lesson-title-error' : undefined}
              disabled={isSubmitting}
              className="min-h-[44px] bg-surface border-border text-foreground focus-visible:ring-primary text-sm"
            />
            {fieldErrors.title && (
              <p
                id="lesson-title-error"
                data-testid="lesson-title-error"
                role="alert"
                className="text-xs text-destructive"
              >
                {fieldErrors.title}
              </p>
            )}
          </div>

          {/* Teacher */}
          <div className="space-y-1.5">
            <label
              htmlFor="lesson-teacher"
              className="block text-xs font-medium text-foreground"
            >
              Enseignant <span className="text-destructive">*</span>
            </label>
            <Input
              id="lesson-teacher"
              type="text"
              maxLength={255}
              data-testid="lesson-teacher-input"
              value={teacher}
              onChange={(e) => {
                setTeacher(e.target.value);
                if (fieldErrors.teacher) {
                  setFieldErrors((prev) => ({ ...prev, teacher: '' }));
                }
              }}
              placeholder="ex: Professeur Baila Wane"
              aria-invalid={Boolean(fieldErrors.teacher)}
              aria-describedby={fieldErrors.teacher ? 'lesson-teacher-error' : undefined}
              disabled={isSubmitting}
              className="min-h-[44px] bg-surface border-border text-foreground focus-visible:ring-primary text-sm"
            />
            {fieldErrors.teacher && (
              <p
                id="lesson-teacher-error"
                data-testid="lesson-teacher-error"
                role="alert"
                className="text-xs text-destructive"
              >
                {fieldErrors.teacher}
              </p>
            )}
          </div>

          {/* Course Date */}
          <div className="space-y-1.5">
            <label
              htmlFor="lesson-course-date"
              className="block text-xs font-medium text-foreground"
            >
              Date du cours <span className="text-destructive">*</span>
            </label>
            <Input
              id="lesson-course-date"
              type="date"
              data-testid="lesson-course-date-input"
              value={courseDate}
              onChange={(e) => {
                setCourseDate(e.target.value);
                if (fieldErrors.course_date) {
                  setFieldErrors((prev) => ({ ...prev, course_date: '' }));
                }
              }}
              aria-invalid={Boolean(fieldErrors.course_date)}
              aria-describedby={
                fieldErrors.course_date ? 'lesson-course-date-error' : undefined
              }
              disabled={isSubmitting}
              className="min-h-[44px] bg-surface border-border text-foreground focus-visible:ring-primary text-sm"
            />
            {fieldErrors.course_date && (
              <p
                id="lesson-course-date-error"
                data-testid="lesson-course-date-error"
                role="alert"
                className="text-xs text-destructive"
              >
                {fieldErrors.course_date}
              </p>
            )}
          </div>

          {/* Keywords / Tags */}
          <div className="space-y-1.5">
            <label
              htmlFor="lesson-keywords"
              className="block text-xs font-medium text-foreground"
            >
              Mots-clés (optionnel)
            </label>
            <Input
              id="lesson-keywords"
              type="text"
              data-testid="lesson-keywords-input"
              value={keywords}
              onChange={(e) => setKeywords(e.target.value)}
              placeholder="ex: Java, JVM, Bytecode, Maven"
              disabled={isSubmitting}
              className="min-h-[44px] bg-surface border-border text-foreground focus-visible:ring-primary text-sm"
            />
          </div>

          {/* Description / Introduction */}
          <div className="space-y-1.5">
            <label
              htmlFor="lesson-description"
              className="block text-xs font-medium text-foreground"
            >
              Description / Introduction (optionnel)
            </label>
            <textarea
              id="lesson-description"
              rows={3}
              data-testid="lesson-description-input"
              value={description}
              onChange={(e) => setDescription(e.target.value)}
              placeholder="Résumé de la leçon ou contenu Markdown introductif..."
              disabled={isSubmitting}
              className="w-full rounded-md bg-surface border border-border p-2.5 text-foreground placeholder:text-foreground-muted focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary text-sm resize-y"
            />
          </div>

          <DialogFooter className="pt-2 flex flex-col-reverse sm:flex-row sm:justify-end gap-2">
            <Button
              type="button"
              variant="outline"
              data-testid="lesson-form-cancel-btn"
              onClick={onClose}
              disabled={isSubmitting}
              className="min-h-[44px] border-border text-foreground"
            >
              Annuler
            </Button>
            <Button
              type="submit"
              variant="default"
              data-testid="lesson-form-submit-btn"
              disabled={isSubmitting}
              className="min-h-[44px] bg-primary text-primary-foreground hover:bg-primary-hover font-medium inline-flex items-center gap-2"
            >
              {isSubmitting ? (
                <>
                  <Loader2 className="h-4 w-4 animate-spin" />
                  <span>Création en cours...</span>
                </>
              ) : (
                <span>Créer la leçon</span>
              )}
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
}
