import { useState, useEffect, useRef, useCallback } from 'react';
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
import { AlertCircle, Loader2, Save } from 'lucide-react';
import { fetchManageableLesson, updateLesson } from '../api';
import type { QuickEditLessonDrawerProps, UpdateLessonPayload } from '../types';
import { ApiError } from '@/lib/api';
import { useAuthStore } from '@/features/auth/auth-store';

const ISO_DATE_REGEX = /^\d{4}-\d{2}-\d{2}$/;

export function isValidIsoDate(dateStr: string): boolean {
  if (!ISO_DATE_REGEX.test(dateStr)) return false;
  const [year, month, day] = dateStr.split('-').map(Number);
  const utcDate = new Date(Date.UTC(year, month - 1, day));
  return (
    utcDate.getUTCFullYear() === year &&
    utcDate.getUTCMonth() === month - 1 &&
    utcDate.getUTCDate() === day
  );
}

export function QuickEditLessonDrawer({
  isOpen,
  onClose,
  lessonId,
  onSaveSuccess,
}: QuickEditLessonDrawerProps) {
  const isPublisher = useAuthStore((state) => state.isPublisher);

  const [title, setTitle] = useState<string>('');
  const [description, setDescription] = useState<string>('');
  const [teacher, setTeacher] = useState<string>('');
  const [courseDate, setCourseDate] = useState<string>('');

  const [isLoading, setIsLoading] = useState<boolean>(false);
  const [loadError, setLoadError] = useState<string | null>(null);
  const [serverError, setServerError] = useState<string | null>(null);
  const [fieldErrors, setFieldErrors] = useState<Record<string, string>>({});
  const [isSubmitting, setIsSubmitting] = useState<boolean>(false);

  const titleInputRef = useRef<HTMLInputElement>(null);
  const descInputRef = useRef<HTMLTextAreaElement>(null);
  const teacherInputRef = useRef<HTMLInputElement>(null);
  const dateInputRef = useRef<HTMLInputElement>(null);

  const isMountedRef = useRef<boolean>(true);
  const currentLessonIdRef = useRef<string | null>(null);

  useEffect(() => {
    isMountedRef.current = true;
    return () => {
      isMountedRef.current = false;
    };
  }, []);

  const focusFirstMissingField = useCallback(
    (t: string, d: string, tech: string, dt: string) => {
      // Defer focus until after render
      setTimeout(() => {
        if (!isMountedRef.current) return;
        if (!t?.trim()) {
          titleInputRef.current?.focus();
        } else if (!d?.trim()) {
          descInputRef.current?.focus();
        } else if (!tech?.trim()) {
          teacherInputRef.current?.focus();
        } else if (!dt?.trim()) {
          dateInputRef.current?.focus();
        } else {
          titleInputRef.current?.focus();
        }
      }, 50);
    },
    []
  );

  const loadLessonData = useCallback(async () => {
    if (!lessonId || !isPublisher) return;

    currentLessonIdRef.current = lessonId;
    const requestedId = lessonId;

    setIsLoading(true);
    setLoadError(null);
    setServerError(null);
    setFieldErrors({});

    try {
      const data = await fetchManageableLesson(requestedId);
      if (!isMountedRef.current || currentLessonIdRef.current !== requestedId) return;

      const loadedTitle = data.title || '';
      const loadedDesc = data.description || '';
      const loadedTeacher = data.teacher || '';
      const loadedDate = data.course_date || '';

      setTitle(loadedTitle);
      setDescription(loadedDesc);
      setTeacher(loadedTeacher);
      setCourseDate(loadedDate);

      focusFirstMissingField(
        loadedTitle,
        loadedDesc,
        loadedTeacher,
        loadedDate
      );
    } catch (err: unknown) {
      if (!isMountedRef.current || currentLessonIdRef.current !== requestedId) return;
      const msg =
        err instanceof ApiError && err.envelope?.detail
          ? err.envelope.detail
          : (err as Error)?.message ||
            'Impossible de charger les données de la leçon.';
      setLoadError(msg);
    } finally {
      if (isMountedRef.current && currentLessonIdRef.current === requestedId) {
        setIsLoading(false);
      }
    }
  }, [lessonId, isPublisher, focusFirstMissingField]);

  useEffect(() => {
    if (isOpen && lessonId) {
      loadLessonData();
    } else {
      currentLessonIdRef.current = null;
      setTitle('');
      setDescription('');
      setTeacher('');
      setCourseDate('');
      setFieldErrors({});
      setLoadError(null);
      setServerError(null);
      setIsLoading(false);
      setIsSubmitting(false);
    }
  }, [isOpen, lessonId, loadLessonData]);

  if (!isPublisher) {
    return null;
  }

  const validateForm = (): boolean => {
    const errors: Record<string, string> = {};

    if (!title.trim()) {
      errors.title = 'Le titre est obligatoire.';
    } else if (title.trim().length > 255) {
      errors.title = 'Le titre ne doit pas dépasser 255 caractères.';
    }

    if (!description.trim()) {
      errors.description = 'La description est obligatoire.';
    }

    if (!teacher.trim()) {
      errors.teacher = "L'enseignant est obligatoire.";
    } else if (teacher.trim().length > 255) {
      errors.teacher = "Le nom de l'enseignant ne doit pas dépasser 255 caractères.";
    }

    if (!courseDate.trim()) {
      errors.course_date = 'La date du cours est obligatoire.';
    } else if (!isValidIsoDate(courseDate.trim())) {
      errors.course_date = 'Format de date invalide (AAAA-MM-JJ requis).';
    }

    setFieldErrors(errors);

    if (Object.keys(errors).length > 0) {
      if (errors.title) {
        titleInputRef.current?.focus();
      } else if (errors.description) {
        descInputRef.current?.focus();
      } else if (errors.teacher) {
        teacherInputRef.current?.focus();
      } else if (errors.course_date) {
        dateInputRef.current?.focus();
      }
      return false;
    }

    return true;
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!lessonId || isSubmitting) return;

    setServerError(null);

    if (!validateForm()) {
      return;
    }

    setIsSubmitting(true);

    const payload: UpdateLessonPayload = {
      title: title.trim(),
      description: description.trim(),
      teacher: teacher.trim(),
      course_date: courseDate.trim(),
    };

    try {
      await updateLesson(lessonId, payload);
      if (!isMountedRef.current) return;
      onSaveSuccess();
      onClose();
    } catch (err: unknown) {
      if (!isMountedRef.current) return;
      if (err instanceof ApiError && err.envelope) {
        if (err.envelope.errors && typeof err.envelope.errors === 'object') {
          const backendFieldErrors: Record<string, string> = {};
          for (const [key, val] of Object.entries(err.envelope.errors)) {
            if (Array.isArray(val) && val.length > 0) {
              backendFieldErrors[key] = String(val[0]);
            } else if (typeof val === 'string') {
              backendFieldErrors[key] = val;
            }
          }
          if (Object.keys(backendFieldErrors).length > 0) {
            setFieldErrors(backendFieldErrors);
          }
        }
        const nonFieldError =
          err.envelope.errors?.non_field_errors &&
          (Array.isArray(err.envelope.errors.non_field_errors)
            ? String(err.envelope.errors.non_field_errors[0])
            : String(err.envelope.errors.non_field_errors));

        const msg =
          err.envelope.detail ||
          nonFieldError ||
          err.envelope.title ||
          "Une erreur est survenue lors de l'enregistrement de la leçon.";
        setServerError(msg);
      } else {
        setServerError(
          (err as Error)?.message ||
            "Une erreur est survenue lors de l'enregistrement de la leçon."
        );
      }
    } finally {
      if (isMountedRef.current) {
        setIsSubmitting(false);
      }
    }
  };

  const handleOpenChange = (open: boolean) => {
    if (!open) {
      if (isSubmitting) return;
      onClose();
    }
  };

  const clearFieldError = (field: string) => {
    if (fieldErrors[field]) {
      setFieldErrors((prev) => {
        const next = { ...prev };
        delete next[field];
        return next;
      });
    }
  };

  return (
    <Dialog open={isOpen} onOpenChange={handleOpenChange}>
      <DialogContent
        data-testid="quick-edit-lesson-drawer"
        className="sm:max-w-xl bg-surface border-border text-foreground overflow-y-auto max-h-[calc(100dvh-2rem)]"
        onCloseAutoFocus={(e) => e.preventDefault()}
        onPointerDownOutside={(e) => {
          if (isSubmitting || isLoading) e.preventDefault();
        }}
        onEscapeKeyDown={(e) => {
          if (isSubmitting || isLoading) e.preventDefault();
        }}
      >
        <DialogHeader>
          <DialogTitle>Modifier la leçon</DialogTitle>
          <DialogDescription>
            Complétez les métadonnées requises pour lever le blocage de publication de cette leçon.
          </DialogDescription>
        </DialogHeader>

        <div className="py-2 space-y-4">
          {isLoading && (
            <div
              role="status"
              data-testid="quick-edit-loading"
              className="flex flex-col items-center justify-center py-8 gap-3 text-foreground-muted"
            >
              <Loader2 className="h-8 w-8 animate-spin text-primary" />
              <span className="text-sm">Chargement de la leçon...</span>
            </div>
          )}

          {loadError && !isLoading && (
            <div
              role="alert"
              data-testid="quick-edit-load-error"
              className="rounded-lg border border-destructive-border bg-destructive-surface p-4 text-sm text-destructive space-y-3"
            >
              <div className="flex items-center gap-2">
                <AlertCircle className="h-5 w-5 shrink-0 text-destructive" />
                <span>{loadError}</span>
              </div>
              <div>
                <Button
                  type="button"
                  variant="outline"
                  size="sm"
                  data-testid="quick-edit-retry-btn"
                  onClick={loadLessonData}
                  className="min-h-[44px] min-w-[44px] border-destructive-border text-destructive hover:bg-destructive/10"
                >
                  Réessayer
                </Button>
              </div>
            </div>
          )}

          {!isLoading && !loadError && (
            <form onSubmit={handleSubmit} className="space-y-4" noValidate>
              {serverError && (
                <div
                  role="alert"
                  data-testid="quick-edit-server-error"
                  className="rounded-lg border border-destructive-border bg-destructive-surface p-3 text-sm text-destructive flex items-center gap-2"
                >
                  <AlertCircle className="h-4 w-4 shrink-0 text-destructive" />
                  <span>{serverError}</span>
                </div>
              )}

              {/* Titre */}
              <div className="space-y-1.5">
                <label
                  htmlFor="quick-edit-title"
                  className="block text-sm font-medium text-foreground"
                >
                  Titre <span className="text-destructive">*</span>
                </label>
                <Input
                  ref={titleInputRef}
                  id="quick-edit-title"
                  data-testid="quick-edit-title-input"
                  value={title}
                  disabled={isSubmitting}
                  onChange={(e) => {
                    setTitle(e.target.value);
                    clearFieldError('title');
                  }}
                  placeholder="ex. Introduction aux algorithmes"
                  aria-invalid={!!fieldErrors.title}
                  aria-describedby={fieldErrors.title ? 'quick-edit-title-error' : undefined}
                  className={`min-h-[44px] ${
                    fieldErrors.title
                      ? 'border-destructive focus:ring-destructive'
                      : ''
                  }`}
                />
                {fieldErrors.title && (
                  <p
                    id="quick-edit-title-error"
                    data-testid="quick-edit-title-error"
                    role="alert"
                    className="text-xs text-destructive font-medium flex items-center gap-1 mt-1"
                  >
                    <AlertCircle className="h-3.5 w-3.5 shrink-0" />
                    <span>{fieldErrors.title}</span>
                  </p>
                )}
              </div>

              {/* Description */}
              <div className="space-y-1.5">
                <label
                  htmlFor="quick-edit-description"
                  className="block text-sm font-medium text-foreground"
                >
                  Description <span className="text-destructive">*</span>
                </label>
                <textarea
                  ref={descInputRef}
                  id="quick-edit-description"
                  data-testid="quick-edit-description-input"
                  rows={4}
                  value={description}
                  disabled={isSubmitting}
                  onChange={(e) => {
                    setDescription(e.target.value);
                    clearFieldError('description');
                  }}
                  placeholder="Résumez les objectifs pédagogiques et points clés..."
                  aria-invalid={!!fieldErrors.description}
                  aria-describedby={
                    fieldErrors.description
                      ? 'quick-edit-description-error'
                      : undefined
                  }
                  className={`w-full min-h-[96px] p-3 rounded-md text-sm bg-surface border text-foreground placeholder:text-foreground-muted focus:outline-none focus:ring-2 focus:border-transparent transition-colors ${
                    fieldErrors.description
                      ? 'border-destructive focus:ring-destructive'
                      : 'border-border focus:ring-border-focus'
                  }`}
                />
                {fieldErrors.description && (
                  <p
                    id="quick-edit-description-error"
                    data-testid="quick-edit-description-error"
                    role="alert"
                    className="text-xs text-destructive font-medium flex items-center gap-1 mt-1"
                  >
                    <AlertCircle className="h-3.5 w-3.5 shrink-0" />
                    <span>{fieldErrors.description}</span>
                  </p>
                )}
              </div>

              {/* Enseignant */}
              <div className="space-y-1.5">
                <label
                  htmlFor="quick-edit-teacher"
                  className="block text-sm font-medium text-foreground"
                >
                  Enseignant <span className="text-destructive">*</span>
                </label>
                <Input
                  ref={teacherInputRef}
                  id="quick-edit-teacher"
                  data-testid="quick-edit-teacher-input"
                  value={teacher}
                  disabled={isSubmitting}
                  onChange={(e) => {
                    setTeacher(e.target.value);
                    clearFieldError('teacher');
                  }}
                  placeholder="ex. Prof. Alan Turing"
                  aria-invalid={!!fieldErrors.teacher}
                  aria-describedby={
                    fieldErrors.teacher ? 'quick-edit-teacher-error' : undefined
                  }
                  className={`min-h-[44px] ${
                    fieldErrors.teacher
                      ? 'border-destructive focus:ring-destructive'
                      : ''
                  }`}
                />
                {fieldErrors.teacher && (
                  <p
                    id="quick-edit-teacher-error"
                    data-testid="quick-edit-teacher-error"
                    role="alert"
                    className="text-xs text-destructive font-medium flex items-center gap-1 mt-1"
                  >
                    <AlertCircle className="h-3.5 w-3.5 shrink-0" />
                    <span>{fieldErrors.teacher}</span>
                  </p>
                )}
              </div>

              {/* Date du cours */}
              <div className="space-y-1.5">
                <label
                  htmlFor="quick-edit-date"
                  className="block text-sm font-medium text-foreground"
                >
                  Date du cours <span className="text-destructive">*</span>
                </label>
                <Input
                  ref={dateInputRef}
                  id="quick-edit-date"
                  data-testid="quick-edit-date-input"
                  placeholder="AAAA-MM-JJ"
                  value={courseDate}
                  disabled={isSubmitting}
                  onChange={(e) => {
                    setCourseDate(e.target.value);
                    clearFieldError('course_date');
                  }}
                  aria-invalid={!!fieldErrors.course_date}
                  aria-describedby={
                    fieldErrors.course_date
                      ? 'quick-edit-date-error'
                      : undefined
                  }
                  className={`min-h-[44px] ${
                    fieldErrors.course_date
                      ? 'border-destructive focus:ring-destructive'
                      : ''
                  }`}
                />
                {fieldErrors.course_date && (
                  <p
                    id="quick-edit-date-error"
                    data-testid="quick-edit-date-error"
                    role="alert"
                    className="text-xs text-destructive font-medium flex items-center gap-1 mt-1"
                  >
                    <AlertCircle className="h-3.5 w-3.5 shrink-0" />
                    <span>{fieldErrors.course_date}</span>
                  </p>
                )}
              </div>

              <DialogFooter className="gap-2 sm:gap-0 pt-2">
                <Button
                  type="button"
                  variant="outline"
                  data-testid="quick-edit-cancel-btn"
                  onClick={onClose}
                  disabled={isSubmitting}
                  className="min-h-[44px] min-w-[44px]"
                >
                  Annuler
                </Button>
                <Button
                  type="submit"
                  data-testid="quick-edit-save-btn"
                  disabled={isSubmitting || isLoading}
                  className="min-h-[44px] min-w-[44px]"
                >
                  {isSubmitting ? (
                    <>
                      <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                      Enregistrement...
                    </>
                  ) : (
                    <>
                      <Save className="mr-2 h-4 w-4" />
                      Enregistrer
                    </>
                  )}
                </Button>
              </DialogFooter>
            </form>
          )}
        </div>
      </DialogContent>
    </Dialog>
  );
}
