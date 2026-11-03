import React, { useState, useEffect, useRef } from 'react';
import { useParams, Link, useNavigate } from 'react-router-dom';
import {
  ChevronRight,
  BookOpen,
  ArrowLeft,
  MoveRight,
  Save,
  AlertCircle,
  CheckCircle2,
  Loader2,
  Plus,
  Trash2,
  ExternalLink,
  FileText,
} from 'lucide-react';
import { AppHeader } from '@/components/layout/app-header';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { ResourceBadge } from '@/components/ui/resource-badge';
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogDescription,
  DialogFooter,
} from '@/components/ui/dialog';
import { MoveLessonModal } from './move-lesson-modal';
import { ResourceFormModal } from './resource-form-modal';
import {
  fetchManageableLesson,
  updateLesson,
  fetchManageableResources,
  deleteResource,
} from '../api';
import type { PublisherLessonItem, PublisherResourceItem } from '../types';
import { ApiError } from '@/lib/api';

const ISO_DATE_REGEX = /^\d{4}-\d{2}-\d{2}$/;

function isValidIsoDate(dateStr: string): boolean {
  if (!ISO_DATE_REGEX.test(dateStr)) return false;
  const [year, month, day] = dateStr.split('-').map(Number);
  const date = new Date(year, month - 1, day);
  return (
    date.getFullYear() === year &&
    date.getMonth() === month - 1 &&
    date.getDate() === day
  );
}

export function PublisherLessonPage() {
  const { lessonId } = useParams<{ lessonId: string }>();
  const navigate = useNavigate();
  const isMountedRef = useRef(true);

  // Lesson State
  const [lesson, setLesson] = useState<PublisherLessonItem | null>(null);
  const [status, setStatus] = useState<'loading' | 'success' | 'error'>('loading');
  const [loadError, setLoadError] = useState<string | null>(null);

  // Form Fields
  const [title, setTitle] = useState<string>('');
  const [teacher, setTeacher] = useState<string>('');
  const [courseDate, setCourseDate] = useState<string>('');
  const [description, setDescription] = useState<string>('');
  const [keywords, setKeywords] = useState<string>('');

  // Field Errors & Status Messages
  const [fieldErrors, setFieldErrors] = useState<Record<string, string>>({});
  const [generalError, setGeneralError] = useState<string | null>(null);
  const [successMessage, setSuccessMessage] = useState<string | null>(null);
  const [isSaving, setIsSaving] = useState<boolean>(false);

  // Move Modal State
  const [isMoveModalOpen, setIsMoveModalOpen] = useState<boolean>(false);
  const [moveSuccessMessage, setMoveSuccessMessage] = useState<string | null>(null);

  // Pedagogical Resources State
  const [resources, setResources] = useState<PublisherResourceItem[]>([]);
  const [resourcesStatus, setResourcesStatus] = useState<'loading' | 'success' | 'error'>('loading');
  const [resourcesError, setResourcesError] = useState<string | null>(null);
  const [isResourceModalOpen, setIsResourceModalOpen] = useState<boolean>(false);
  const [resourceSuccessMessage, setResourceSuccessMessage] = useState<string | null>(null);

  const currentLessonIdRef = useRef<string | undefined>(lessonId);

  // Delete Resource Modal State
  const [resourceToDelete, setResourceToDelete] = useState<PublisherResourceItem | null>(null);
  const [isDeleteModalOpen, setIsDeleteModalOpen] = useState<boolean>(false);
  const [isDeletingResource, setIsDeletingResource] = useState<boolean>(false);
  const [deleteResourceError, setDeleteResourceError] = useState<string | null>(null);

  // Field element refs for focus on error
  const titleInputRef = useRef<HTMLInputElement>(null);
  const teacherInputRef = useRef<HTMLInputElement>(null);
  const dateInputRef = useRef<HTMLInputElement>(null);
  const descInputRef = useRef<HTMLTextAreaElement>(null);

  useEffect(() => {
    isMountedRef.current = true;
    return () => {
      isMountedRef.current = false;
    };
  }, []);

  const loadLessonData = async (id: string) => {
    setStatus('loading');
    setLoadError(null);
    try {
      const data = await fetchManageableLesson(id);
      if (!isMountedRef.current) return;
      setLesson(data);
      setTitle(data.title || '');
      setTeacher(data.teacher || '');
      setCourseDate(data.course_date || '');
      setDescription(data.description || '');
      setKeywords(data.keywords || '');
      setStatus('success');
    } catch (err: unknown) {
      if (!isMountedRef.current) return;
      if (err instanceof ApiError && err.envelope.status === 404) {
        setLoadError('Leçon introuvable. Elle a peut-être été supprimée.');
      } else if (err instanceof Error) {
        setLoadError(err.message);
      } else {
        setLoadError('Erreur lors du chargement de la leçon.');
      }
      setStatus('error');
    }
  };

  const loadResourcesData = async (id: string) => {
    setResourcesStatus('loading');
    setResourcesError(null);
    try {
      const items = await fetchManageableResources(id);
      if (!isMountedRef.current || id !== lessonId || currentLessonIdRef.current !== id) return;
      setResources(items.filter((r) => !r.is_deleted));
      setResourcesStatus('success');
    } catch (err: unknown) {
      if (!isMountedRef.current || id !== lessonId || currentLessonIdRef.current !== id) return;
      if (err instanceof ApiError) {
        setResourcesError(
          err.envelope.detail ||
            'Erreur lors de la récupération des ressources pédagogiques.'
        );
      } else if (err instanceof Error) {
        setResourcesError(err.message);
      } else {
        setResourcesError('Erreur lors de la récupération des ressources.');
      }
      setResourcesStatus('error');
    }
  };

  useEffect(() => {
    currentLessonIdRef.current = lessonId;
    if (lessonId) {
      loadLessonData(lessonId);
      loadResourcesData(lessonId);
    }
  }, [lessonId]);

  const handleConfirmDelete = async () => {
    if (!resourceToDelete) return;
    setIsDeletingResource(true);
    setDeleteResourceError(null);
    try {
      await deleteResource(resourceToDelete.id);
      if (!isMountedRef.current) return;
      setResources((prev) => prev.filter((r) => r.id !== resourceToDelete.id));
      setIsDeleteModalOpen(false);
      setResourceToDelete(null);
      setResourceSuccessMessage('Ressource supprimée avec succès.');
    } catch (err: unknown) {
      if (!isMountedRef.current) return;
      if (err instanceof ApiError) {
        setDeleteResourceError(
          err.envelope.detail ||
            'Erreur lors de la suppression de la ressource.'
        );
      } else if (err instanceof Error) {
        setDeleteResourceError(err.message);
      } else {
        setDeleteResourceError('Erreur inattendue lors de la suppression.');
      }
    } finally {
      if (isMountedRef.current) {
        setIsDeletingResource(false);
      }
    }
  };

  const validateForm = (): boolean => {
    const errors: Record<string, string> = {};

    if (!title.trim()) {
      errors.title = 'Le titre est obligatoire.';
    } else if (title.trim().length > 255) {
      errors.title = 'Le titre ne doit pas dépasser 255 caractères.';
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

    if (lesson?.is_published && !description.trim()) {
      errors.description =
        'La description est obligatoire pour une leçon publiée.';
    }

    setFieldErrors(errors);

    if (Object.keys(errors).length > 0) {
      if (errors.title) {
        titleInputRef.current?.focus();
      } else if (errors.teacher) {
        teacherInputRef.current?.focus();
      } else if (errors.course_date) {
        dateInputRef.current?.focus();
      } else if (errors.description) {
        descInputRef.current?.focus();
      }
      return false;
    }

    return true;
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setSuccessMessage(null);
    setGeneralError(null);
    setMoveSuccessMessage(null);

    if (!validateForm()) {
      return;
    }

    if (!lessonId) return;

    setIsSaving(true);
    try {
      const updated = await updateLesson(lessonId, {
        title: title.trim(),
        teacher: teacher.trim(),
        course_date: courseDate.trim(),
        description: description.trim(),
        keywords: keywords.trim(),
      });

      if (!isMountedRef.current) return;
      setLesson(updated);
      setTitle(updated.title || '');
      setTeacher(updated.teacher || '');
      setCourseDate(updated.course_date || '');
      setDescription(updated.description || '');
      setKeywords(updated.keywords || '');
      setFieldErrors({});
      setSuccessMessage('Modifications enregistrées avec succès.');
    } catch (err: unknown) {
      if (!isMountedRef.current) return;
      if (err instanceof ApiError) {
        const errors = err.envelope.errors || {};
        const newFieldErrors: Record<string, string> = {};
        const nonFieldErrors: string[] = [];

        for (const [key, msgs] of Object.entries(errors)) {
          const firstMsg = Array.isArray(msgs) ? msgs[0] : String(msgs);
          if (key === 'title') {
            newFieldErrors.title = firstMsg;
          } else if (key === 'teacher') {
            newFieldErrors.teacher = firstMsg;
          } else if (key === 'course_date') {
            newFieldErrors.course_date = firstMsg;
          } else if (key === 'description') {
            newFieldErrors.description = firstMsg;
          } else if (key === 'keywords') {
            newFieldErrors.keywords = firstMsg;
          } else {
            nonFieldErrors.push(`${key}: ${firstMsg}`);
          }
        }

        setFieldErrors(newFieldErrors);

        if (nonFieldErrors.length > 0) {
          setGeneralError(nonFieldErrors.join(' '));
        } else if (Object.keys(newFieldErrors).length === 0) {
          setGeneralError(
            err.envelope.detail ||
              'Une erreur de validation est survenue sur le serveur.'
          );
        }

        if (newFieldErrors.title) {
          titleInputRef.current?.focus();
        } else if (newFieldErrors.teacher) {
          teacherInputRef.current?.focus();
        } else if (newFieldErrors.course_date) {
          dateInputRef.current?.focus();
        } else if (newFieldErrors.description) {
          descInputRef.current?.focus();
        }
      } else if (err instanceof Error) {
        setGeneralError(err.message);
      } else {
        setGeneralError('Erreur inattendue lors de la sauvegarde.');
      }
    } finally {
      if (isMountedRef.current) {
        setIsSaving(false);
      }
    }
  };

  const handleMoveSuccess = (movedLesson: PublisherLessonItem) => {
    setLesson(movedLesson);
    setMoveSuccessMessage(
      'La leçon a été déplacée avec succès vers le chapitre sélectionné.'
    );
    setSuccessMessage(null);
  };

  return (
    <div
      data-testid="publisher-lesson-page"
      className="min-h-screen bg-background text-foreground flex flex-col min-w-[360px] w-full selection:bg-primary selection:text-primary-foreground"
    >
      <AppHeader />

      <main className="flex-1 max-w-page-max mx-auto w-full px-4 sm:px-6 lg:px-8 py-6 sm:py-8 space-y-6 sm:space-y-8">
        {/* Navigation Breadcrumbs */}
        <nav
          aria-label="Fil d'Ariane"
          className="flex items-center gap-2 text-xs font-mono uppercase tracking-wider text-foreground-muted"
        >
          <Link
            to="/publisher"
            data-testid="breadcrumb-dashboard-link"
            className="hover:text-primary transition-colors focus:outline-none focus-visible:ring-1 focus-visible:ring-primary rounded"
          >
            Tableau de Bord
          </Link>
          <ChevronRight className="h-3.5 w-3.5 text-border" aria-hidden="true" />
          <span
            data-testid="breadcrumb-lesson-title"
            className="text-primary truncate max-w-[200px] sm:max-w-xs"
          >
            {lesson?.title || 'Chargement...'}
          </span>
        </nav>

        {/* Loading State */}
        {status === 'loading' && (
          <div
            data-testid="lesson-loading"
            className="rounded-lg border border-border bg-card p-8 space-y-6 animate-pulse"
          >
            <div className="h-8 w-1/3 bg-surface rounded" />
            <div className="h-4 w-1/4 bg-surface rounded" />
            <div className="space-y-4 pt-4">
              <div className="h-10 w-full bg-surface rounded" />
              <div className="h-10 w-full bg-surface rounded" />
              <div className="h-24 w-full bg-surface rounded" />
            </div>
          </div>
        )}

        {/* Error State */}
        {status === 'error' && (
          <div
            role="alert"
            data-testid="lesson-error"
            className="rounded-lg border border-destructive-border bg-destructive-surface p-8 text-center space-y-4 max-w-lg mx-auto"
          >
            <AlertCircle className="h-8 w-8 text-destructive mx-auto" />
            <div className="space-y-1">
              <h2 className="text-lg font-bold text-foreground">
                Impossible de charger la leçon
              </h2>
              <p className="text-sm text-foreground-muted">
                {loadError || 'Une erreur est survenue lors de la récupération de la leçon.'}
              </p>
            </div>
            <div className="flex items-center justify-center gap-3 pt-2">
              <Button
                type="button"
                variant="outline"
                size="sm"
                onClick={() => navigate('/publisher')}
                className="min-h-[44px] min-w-[44px] border-border inline-flex items-center gap-2"
              >
                <ArrowLeft className="h-4 w-4" />
                <span>Retour au tableau de bord</span>
              </Button>
              {lessonId && (
                <Button
                  type="button"
                  variant="default"
                  size="sm"
                  onClick={() => loadLessonData(lessonId)}
                  className="min-h-[44px] min-w-[44px] bg-primary text-primary-foreground"
                >
                  Réessayer
                </Button>
              )}
            </div>
          </div>
        )}

        {/* Loaded Lesson Editor View */}
        {status === 'success' && lesson && (
          <div className="space-y-6">
            {/* Header Card */}
            <div
              data-testid="lesson-header"
              className="rounded-lg border border-border bg-card p-6 flex flex-col md:flex-row md:items-center justify-between gap-6 shadow-sm"
            >
              <div className="space-y-2">
                <div className="flex items-center gap-2.5">
                  <BookOpen className="h-4 w-4 text-primary shrink-0" aria-hidden="true" />
                  <span className="text-xs font-semibold uppercase tracking-wider text-primary">
                    Éditeur de Leçon
                  </span>
                  {lesson.is_published ? (
                    <span
                      data-testid="lesson-published-badge"
                      className="px-2 py-0.5 rounded-full text-[11px] font-medium bg-[#1F3A24] text-[#3FB950] border border-[#238636]"
                    >
                      Publié
                    </span>
                  ) : (
                    <span
                      data-testid="lesson-draft-badge"
                      className="px-2 py-0.5 rounded-full text-[11px] font-medium bg-[#2C1F03] text-[#D29922] border border-[#9E6A03]"
                    >
                      Brouillon
                    </span>
                  )}
                  {lesson.is_deleted && (
                    <span
                      data-testid="lesson-deleted-badge"
                      className="px-2 py-0.5 rounded-full text-[11px] font-medium bg-[#251719] text-[#F85149] border border-[#DA3633]"
                    >
                      Supprimé
                    </span>
                  )}
                </div>

                <h1
                  data-testid="lesson-title-heading"
                  className="text-2xl sm:text-3xl font-bold tracking-tight text-foreground break-words"
                >
                  {lesson.title}
                </h1>

                <div className="flex flex-wrap items-center gap-4 text-xs text-foreground-muted">
                  <span>Enseignant : {lesson.teacher}</span>
                  <span>•</span>
                  <span>Date : {lesson.course_date}</span>
                  {lesson.updated_at && (
                    <>
                      <span>•</span>
                      <span>Modifié le : {lesson.updated_at.slice(0, 10)}</span>
                    </>
                  )}
                </div>
              </div>

              {/* Actions Header Bar */}
              <div className="flex flex-wrap items-center gap-2.5">
                <Button
                  type="button"
                  variant="outline"
                  data-testid="move-lesson-btn"
                  onClick={() => setIsMoveModalOpen(true)}
                  className="min-h-[44px] min-w-[44px] text-xs sm:text-sm font-medium border-border inline-flex items-center gap-2 hover:bg-surface"
                >
                  <MoveRight className="h-4 w-4 text-primary" />
                  <span>Déplacer la leçon</span>
                </Button>
              </div>
            </div>

            {/* Notification Banners */}
            {successMessage && (
              <div
                role="status"
                data-testid="lesson-save-success"
                className="rounded-lg border border-[#238636] bg-[#1F3A24]/40 p-4 flex items-center justify-between gap-3 text-[#3FB950] text-sm"
              >
                <div className="flex items-center gap-2.5">
                  <CheckCircle2 className="h-5 w-5 shrink-0" />
                  <span>{successMessage}</span>
                </div>
                <Button
                  type="button"
                  variant="ghost"
                  size="sm"
                  onClick={() => setSuccessMessage(null)}
                  className="text-xs text-[#3FB950] hover:bg-[#238636]/20"
                >
                  Fermer
                </Button>
              </div>
            )}

            {moveSuccessMessage && (
              <div
                role="status"
                data-testid="move-success-alert"
                className="rounded-lg border border-[#238636] bg-[#1F3A24]/40 p-4 flex items-center justify-between gap-3 text-[#3FB950] text-sm"
              >
                <div className="flex items-center gap-2.5">
                  <CheckCircle2 className="h-5 w-5 shrink-0" />
                  <span>{moveSuccessMessage}</span>
                </div>
                <Button
                  type="button"
                  variant="ghost"
                  size="sm"
                  onClick={() => setMoveSuccessMessage(null)}
                  className="text-xs text-[#3FB950] hover:bg-[#238636]/20"
                >
                  Fermer
                </Button>
              </div>
            )}

            {generalError && (
              <div
                role="alert"
                data-testid="form-error-alert"
                className="rounded-lg border border-destructive-border bg-destructive-surface p-4 flex items-center justify-between gap-3 text-destructive text-sm"
              >
                <div className="flex items-center gap-2.5">
                  <AlertCircle className="h-5 w-5 shrink-0" />
                  <span>{generalError}</span>
                </div>
                <Button
                  type="button"
                  variant="ghost"
                  size="sm"
                  onClick={() => setGeneralError(null)}
                  className="text-xs text-destructive hover:bg-destructive/10"
                >
                  Fermer
                </Button>
              </div>
            )}

            {/* Metadata Form Card */}
            <div className="rounded-lg border border-border bg-card p-6 shadow-sm space-y-6">
              <div className="border-b border-border/70 pb-3">
                <h2 className="text-base sm:text-lg font-bold text-foreground">
                  Métadonnées Pédagogiques
                </h2>
                <p className="text-xs text-foreground-muted">
                  Renseignez les métadonnées obligatoires requises pour l'indexation et la publication de la leçon.
                </p>
              </div>

              <form onSubmit={handleSubmit} className="space-y-5" noValidate>
                {/* Title field */}
                <div className="space-y-1.5">
                  <label
                    htmlFor="lesson-title"
                    className="block text-xs font-semibold text-foreground uppercase tracking-wider"
                  >
                    Titre de la leçon <span className="text-destructive">*</span>
                  </label>
                  <div className="relative">
                    <Input
                      id="lesson-title"
                      ref={titleInputRef}
                      data-testid="lesson-title-input"
                      value={title}
                      onChange={(e) => {
                        setTitle(e.target.value);
                        if (fieldErrors.title) {
                          setFieldErrors((prev) => {
                            const next = { ...prev };
                            delete next.title;
                            return next;
                          });
                        }
                      }}
                      disabled={isSaving}
                      placeholder="Ex: Introduction aux architectures distribuées"
                      aria-invalid={!!fieldErrors.title}
                      aria-describedby={fieldErrors.title ? 'title-error' : undefined}
                      className={`min-h-[44px] text-sm bg-surface ${
                        fieldErrors.title ? 'border-destructive focus:ring-destructive' : ''
                      }`}
                    />
                  </div>
                  {fieldErrors.title && (
                    <p
                      id="title-error"
                      data-testid="title-error"
                      role="alert"
                      className="text-xs text-destructive font-medium flex items-center gap-1 mt-1"
                    >
                      <AlertCircle className="h-3.5 w-3.5 shrink-0" />
                      <span>{fieldErrors.title}</span>
                    </p>
                  )}
                </div>

                {/* Teacher & Date Grid */}
                <div className="grid grid-cols-1 md:grid-cols-2 gap-5">
                  {/* Teacher field */}
                  <div className="space-y-1.5">
                    <label
                      htmlFor="lesson-teacher"
                      className="block text-xs font-semibold text-foreground uppercase tracking-wider"
                    >
                      Enseignant / Intervenant <span className="text-destructive">*</span>
                    </label>
                    <div className="relative">
                      <Input
                        id="lesson-teacher"
                        ref={teacherInputRef}
                        data-testid="lesson-teacher-input"
                        value={teacher}
                        onChange={(e) => {
                          setTeacher(e.target.value);
                          if (fieldErrors.teacher) {
                            setFieldErrors((prev) => {
                              const next = { ...prev };
                              delete next.teacher;
                              return next;
                            });
                          }
                        }}
                        disabled={isSaving}
                        placeholder="Ex: Prof. Ada Lovelace"
                        aria-invalid={!!fieldErrors.teacher}
                        aria-describedby={fieldErrors.teacher ? 'teacher-error' : undefined}
                        className={`min-h-[44px] text-sm bg-surface ${
                          fieldErrors.teacher ? 'border-destructive focus:ring-destructive' : ''
                        }`}
                      />
                    </div>
                    {fieldErrors.teacher && (
                      <p
                        id="teacher-error"
                        data-testid="teacher-error"
                        role="alert"
                        className="text-xs text-destructive font-medium flex items-center gap-1 mt-1"
                      >
                        <AlertCircle className="h-3.5 w-3.5 shrink-0" />
                        <span>{fieldErrors.teacher}</span>
                      </p>
                    )}
                  </div>

                  {/* Course Date field */}
                  <div className="space-y-1.5">
                    <label
                      htmlFor="lesson-date"
                      className="block text-xs font-semibold text-foreground uppercase tracking-wider"
                    >
                      Date du cours (AAAA-MM-JJ) <span className="text-destructive">*</span>
                    </label>
                    <div className="relative">
                      <Input
                        id="lesson-date"
                        ref={dateInputRef}
                        type="text"
                        data-testid="lesson-date-input"
                        value={courseDate}
                        onChange={(e) => {
                          setCourseDate(e.target.value);
                          if (fieldErrors.course_date) {
                            setFieldErrors((prev) => {
                              const next = { ...prev };
                              delete next.course_date;
                              return next;
                            });
                          }
                        }}
                        disabled={isSaving}
                        placeholder="2026-10-31"
                        aria-invalid={!!fieldErrors.course_date}
                        aria-describedby={fieldErrors.course_date ? 'course-date-error' : undefined}
                        className={`min-h-[44px] text-sm bg-surface font-mono ${
                          fieldErrors.course_date ? 'border-destructive focus:ring-destructive' : ''
                        }`}
                      />
                    </div>
                    {fieldErrors.course_date && (
                      <p
                        id="course-date-error"
                        data-testid="course-date-error"
                        role="alert"
                        className="text-xs text-destructive font-medium flex items-center gap-1 mt-1"
                      >
                        <AlertCircle className="h-3.5 w-3.5 shrink-0" />
                        <span>{fieldErrors.course_date}</span>
                      </p>
                    )}
                  </div>
                </div>

                {/* Description field */}
                <div className="space-y-1.5">
                  <div className="flex items-center justify-between">
                    <label
                      htmlFor="lesson-description"
                      className="block text-xs font-semibold text-foreground uppercase tracking-wider"
                    >
                      Description pédagogique{' '}
                      {lesson.is_published ? (
                        <span className="text-destructive">*</span>
                      ) : (
                        <span className="text-foreground-muted font-normal text-[10px] lowercase">
                          (optionnelle en brouillon)
                        </span>
                      )}
                    </label>
                  </div>
                  <textarea
                    id="lesson-description"
                    ref={descInputRef}
                    data-testid="lesson-description-input"
                    value={description}
                    onChange={(e) => {
                      setDescription(e.target.value);
                      if (fieldErrors.description) {
                        setFieldErrors((prev) => {
                          const next = { ...prev };
                          delete next.description;
                          return next;
                        });
                      }
                    }}
                    disabled={isSaving}
                    rows={4}
                    placeholder="Résumez les objectifs pédagogiques, prérequis et points clés abordés..."
                    aria-invalid={!!fieldErrors.description}
                    aria-describedby={fieldErrors.description ? 'description-error' : undefined}
                    className={`w-full min-h-[96px] p-3 rounded-md text-sm bg-surface border text-foreground placeholder:text-foreground-muted focus:outline-none focus:ring-2 focus:border-transparent transition-colors ${
                      fieldErrors.description
                        ? 'border-destructive focus:ring-destructive'
                        : 'border-border focus:ring-border-focus'
                    }`}
                  />
                  {fieldErrors.description && (
                    <p
                      id="description-error"
                      data-testid="description-error"
                      role="alert"
                      className="text-xs text-destructive font-medium flex items-center gap-1 mt-1"
                    >
                      <AlertCircle className="h-3.5 w-3.5 shrink-0" />
                      <span>{fieldErrors.description}</span>
                    </p>
                  )}
                </div>

                {/* Keywords field */}
                <div className="space-y-1.5">
                  <label
                    htmlFor="lesson-keywords"
                    className="block text-xs font-semibold text-foreground uppercase tracking-wider"
                  >
                    Mots-clés de recherche{' '}
                    <span className="text-foreground-muted font-normal text-[10px] lowercase">
                      (optionnel)
                    </span>
                  </label>
                  <Input
                    id="lesson-keywords"
                    data-testid="lesson-keywords-input"
                    value={keywords}
                    onChange={(e) => {
                      setKeywords(e.target.value);
                      if (fieldErrors.keywords) {
                        setFieldErrors((prev) => {
                          const next = { ...prev };
                          delete next.keywords;
                          return next;
                        });
                      }
                    }}
                    disabled={isSaving}
                    placeholder="Ex: consensus, raft, quorum, paxos"
                    aria-invalid={!!fieldErrors.keywords}
                    aria-describedby={fieldErrors.keywords ? 'keywords-error' : undefined}
                    className={`min-h-[44px] text-sm bg-surface ${
                      fieldErrors.keywords ? 'border-destructive focus:ring-destructive' : ''
                    }`}
                  />
                  {fieldErrors.keywords && (
                    <p
                      id="keywords-error"
                      data-testid="keywords-error"
                      role="alert"
                      className="text-xs text-destructive font-medium flex items-center gap-1 mt-1"
                    >
                      <AlertCircle className="h-3.5 w-3.5 shrink-0" />
                      <span>{fieldErrors.keywords}</span>
                    </p>
                  )}
                </div>

                {/* Submit Actions */}
                <div className="flex flex-col-reverse sm:flex-row sm:items-center sm:justify-end gap-3 pt-4 border-t border-border/70">
                  <Button
                    type="submit"
                    variant="default"
                    data-testid="save-lesson-btn"
                    disabled={isSaving}
                    className="min-h-[44px] min-w-[44px] text-xs sm:text-sm font-medium bg-primary text-primary-foreground hover:bg-primary-hover shadow-sm inline-flex items-center justify-center gap-2"
                  >
                    {isSaving ? (
                      <>
                        <Loader2 className="h-4 w-4 animate-spin" />
                        <span>Enregistrement...</span>
                      </>
                    ) : (
                      <>
                        <Save className="h-4 w-4" />
                        <span>Enregistrer les modifications</span>
                      </>
                    )}
                  </Button>
                </div>
              </form>
            </div>

            {/* Pedagogical Resources Section (Story FE-4.5) */}
            <div
              data-testid="lesson-resources-section"
              className="rounded-lg border border-border bg-card p-6 shadow-sm space-y-6"
            >
              <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4 border-b border-border/70 pb-4">
                <div className="space-y-1">
                  <div className="flex items-center gap-2">
                    <FileText className="h-4 w-4 text-primary" aria-hidden="true" />
                    <h2
                      data-testid="resources-section-heading"
                      className="text-base sm:text-lg font-bold text-foreground"
                    >
                      Ressources Pédagogiques
                    </h2>
                  </div>
                  <p className="text-xs text-foreground-muted">
                    Gérez les documents, supports, vidéos et liens externes attachés à cette leçon.
                  </p>
                </div>

                <Button
                  type="button"
                  variant="default"
                  data-testid="add-resource-btn"
                  onClick={() => setIsResourceModalOpen(true)}
                  className="min-h-[44px] min-w-[44px] text-xs sm:text-sm font-medium bg-primary text-primary-foreground hover:bg-primary-hover inline-flex items-center gap-2 shrink-0 shadow-sm"
                >
                  <Plus className="h-4 w-4" />
                  <span>Ajouter une ressource</span>
                </Button>
              </div>

              {/* Resource Success Banner */}
              {resourceSuccessMessage && (
                <div
                  role="status"
                  data-testid="resource-action-success"
                  className="rounded-lg border border-[#238636] bg-[#1F3A24]/40 p-4 flex items-center justify-between gap-3 text-[#3FB950] text-sm"
                >
                  <div className="flex items-center gap-2.5">
                    <CheckCircle2 className="h-5 w-5 shrink-0" />
                    <span>{resourceSuccessMessage}</span>
                  </div>
                  <Button
                    type="button"
                    variant="ghost"
                    size="sm"
                    onClick={() => setResourceSuccessMessage(null)}
                    className="text-xs text-[#3FB950] hover:bg-[#238636]/20"
                  >
                    Fermer
                  </Button>
                </div>
              )}

              {/* Resource Fetch Error Banner */}
              {resourcesStatus === 'error' && (
                <div
                  role="alert"
                  data-testid="resources-error-banner"
                  className="rounded-lg border border-destructive-border bg-destructive-surface p-4 flex flex-col sm:flex-row sm:items-center justify-between gap-3 text-destructive text-sm"
                >
                  <div className="flex items-center gap-2.5">
                    <AlertCircle className="h-5 w-5 shrink-0" />
                    <span>
                      {resourcesError || 'Impossible de charger les ressources pédagogiques.'}
                    </span>
                  </div>
                  {lessonId && (
                    <Button
                      type="button"
                      variant="outline"
                      size="sm"
                      data-testid="retry-resources-btn"
                      onClick={() => loadResourcesData(lessonId)}
                      className="text-xs border-destructive-border hover:bg-destructive/10 shrink-0"
                    >
                      Réessayer
                    </Button>
                  )}
                </div>
              )}

              {/* Loading State */}
              {resourcesStatus === 'loading' && (
                <div
                  data-testid="resources-loading"
                  className="p-8 text-center space-y-3 animate-pulse"
                >
                  <Loader2 className="h-6 w-6 animate-spin text-primary mx-auto" />
                  <p className="text-xs text-foreground-muted">
                    Chargement des ressources pédagogiques...
                  </p>
                </div>
              )}

              {/* Loaded Resources State */}
              {resourcesStatus === 'success' && (
                <>
                  {resources.length === 0 ? (
                    <div
                      data-testid="resources-empty-state"
                      className="rounded-md border border-dashed border-border p-8 text-center space-y-2 bg-surface/30"
                    >
                      <p className="text-sm font-medium text-foreground">
                        Aucune ressource pédagogique attachée à cette leçon.
                      </p>
                      <p className="text-xs text-foreground-muted">
                        Cliquez sur &quot;Ajouter une ressource&quot; pour attacher un document PDF, une image ou une adresse web.
                      </p>
                    </div>
                  ) : (
                    <div data-testid="resources-list" className="space-y-3">
                      {resources.map((res) => (
                        <div
                          key={res.id}
                          data-testid={`resource-card-${res.id}`}
                          className="rounded-lg border border-border bg-surface p-4 flex flex-col sm:flex-row sm:items-center justify-between gap-4 transition-colors hover:border-border-focus"
                        >
                          <div
                            data-testid={`resource-item-${res.id}`}
                            className="space-y-1.5 min-w-0 flex-1"
                          >
                            <div className="flex flex-wrap items-center gap-2">
                              <ResourceBadge type={res.type} />
                              <h3
                                data-testid={`resource-title-${res.id}`}
                                className="text-sm font-bold text-foreground break-words"
                              >
                                {res.title}
                              </h3>
                            </div>

                            {res.note && (
                              <p
                                data-testid={`resource-note-${res.id}`}
                                className="text-xs text-foreground-muted break-words line-clamp-2"
                              >
                                {res.note}
                              </p>
                            )}

                            {res.url && /^https?:\/\//i.test(res.url) && (
                              <div className="pt-0.5">
                                <a
                                  href={res.url}
                                  target="_blank"
                                  rel="noreferrer noopener"
                                  data-testid={`resource-link-${res.id}`}
                                  className="inline-flex items-center gap-1.5 text-xs text-primary hover:underline font-mono break-all focus:outline-none focus-visible:ring-1 focus-visible:ring-primary rounded"
                                >
                                  <span>{res.url}</span>
                                  <ExternalLink className="h-3 w-3 shrink-0" aria-hidden="true" />
                                </a>
                              </div>
                            )}

                            {(res.type === 'document' || res.type === 'image') && !res.url && (
                              <div
                                data-testid={`resource-file-indicator-${res.id}`}
                                className="text-[11px] text-foreground-muted flex items-center gap-1 font-mono pt-0.5"
                              >
                                <span>Fichier joint ({res.type === 'document' ? 'PDF' : 'Image'})</span>
                              </div>
                            )}
                          </div>

                          <div className="flex items-center sm:self-center shrink-0">
                            <Button
                              type="button"
                              variant="ghost"
                              size="sm"
                              data-testid={`delete-resource-btn-${res.id}`}
                              onClick={() => {
                                setResourceToDelete(res);
                                setDeleteResourceError(null);
                                setIsDeleteModalOpen(true);
                              }}
                              className="min-h-[44px] min-w-[44px] text-xs font-medium text-destructive hover:bg-destructive/10 hover:text-destructive inline-flex items-center gap-1.5"
                            >
                              <Trash2 className="h-4 w-4" />
                              <span>Supprimer</span>
                            </Button>
                          </div>
                        </div>
                      ))}
                    </div>
                  )}
                </>
              )}
            </div>
          </div>
        )}
      </main>

      {/* Move Lesson Modal Dialog */}
      {lesson && (
        <MoveLessonModal
          isOpen={isMoveModalOpen}
          onClose={() => setIsMoveModalOpen(false)}
          lessonId={lesson.id}
          currentChapterId={lesson.chapter_id}
          onSuccess={handleMoveSuccess}
        />
      )}

      {/* Resource Form Modal (Story FE-4.5) */}
      {lesson && (
        <ResourceFormModal
          isOpen={isResourceModalOpen}
          onClose={() => setIsResourceModalOpen(false)}
          lessonId={lesson.id}
          onSuccess={(newResource) => {
            setResources((prev) => [...prev, newResource]);
            setResourcesStatus('success');
            setResourcesError(null);
            setResourceSuccessMessage('Ressource ajoutée avec succès.');
          }}
        />
      )}

      {/* Delete Resource Confirmation Dialog (Story FE-4.5) */}
      <Dialog
        open={isDeleteModalOpen}
        onOpenChange={(open) => {
          if (!isDeletingResource) {
            setIsDeleteModalOpen(open);
            if (!open) {
              setResourceToDelete(null);
              setDeleteResourceError(null);
            }
          }
        }}
      >
        <DialogContent
          data-testid="delete-resource-modal"
          className="w-[calc(100%-2rem)] sm:max-w-md bg-card border-border text-foreground p-6 rounded-lg shadow-xl"
        >
          <DialogHeader className="space-y-2">
            <DialogTitle
              data-testid="delete-resource-modal-title"
              className="text-lg sm:text-xl font-bold text-foreground flex items-center gap-2"
            >
              <Trash2 className="h-5 w-5 text-destructive" aria-hidden="true" />
              <span>Supprimer la ressource</span>
            </DialogTitle>
            <DialogDescription className="text-xs sm:text-sm text-foreground-muted">
              Êtes-vous sûr de vouloir supprimer la ressource{' '}
              <span className="font-semibold text-foreground">
                &quot;{resourceToDelete?.title}&quot;
              </span>{' '}
              ? Cette action retirera la ressource de la leçon.
            </DialogDescription>
          </DialogHeader>

          {deleteResourceError && (
            <div
              role="alert"
              data-testid="resource-delete-error"
              className="rounded-lg border border-destructive-border bg-destructive-surface p-3 flex items-start gap-2.5 text-xs text-destructive my-2"
            >
              <AlertCircle className="h-4 w-4 shrink-0 mt-0.5" aria-hidden="true" />
              <span className="flex-1 leading-relaxed">{deleteResourceError}</span>
            </div>
          )}

          <DialogFooter className="flex flex-col-reverse sm:flex-row sm:items-center sm:justify-end gap-2.5 pt-4 border-t border-border">
            <Button
              type="button"
              variant="outline"
              data-testid="cancel-delete-resource-btn"
              onClick={() => {
                setIsDeleteModalOpen(false);
                setResourceToDelete(null);
                setDeleteResourceError(null);
              }}
              disabled={isDeletingResource}
              className="min-h-[44px] min-w-[44px] border-border text-xs sm:text-sm"
            >
              Annuler
            </Button>
            <Button
              type="button"
              variant="destructive"
              data-testid="confirm-delete-resource-btn"
              onClick={handleConfirmDelete}
              disabled={isDeletingResource}
              className="min-h-[44px] min-w-[44px] text-xs sm:text-sm font-medium inline-flex items-center justify-center gap-2"
            >
              {isDeletingResource ? (
                <>
                  <Loader2 className="h-4 w-4 animate-spin" />
                  <span>Suppression...</span>
                </>
              ) : (
                <span>Supprimer</span>
              )}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}
