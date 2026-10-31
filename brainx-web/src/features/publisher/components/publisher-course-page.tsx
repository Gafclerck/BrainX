import { useState, useEffect, useCallback, useRef } from 'react';
import { useParams, Link, useNavigate } from 'react-router-dom';
import {
  Plus,
  Pencil,
  Trash2,
  ChevronRight,
  BookOpen,
  Layers,
  FileText,
  AlertCircle,
  RefreshCw,
  FolderPlus,
} from 'lucide-react';
import { AppHeader } from '@/components/layout/app-header';
import { Button } from '@/components/ui/button';
import { ContainerFormModal } from './container-form-modal';
import { RemovalPreviewModal } from './removal-preview-modal';
import {
  fetchManageableCourse,
  fetchManageableModules,
  fetchManageableChapters,
} from '../api';
import type {
  PublisherCourseItem,
  PublisherModuleItem,
  PublisherChapterItem,
  ContainerType,
} from '../types';
import { ApiError } from '@/lib/api';

export function PublisherCoursePage() {
  const { courseId } = useParams<{ courseId: string }>();
  const navigate = useNavigate();
  const mountedRef = useRef(true);

  // Course State
  const [course, setCourse] = useState<PublisherCourseItem | null>(null);
  const [courseStatus, setCourseStatus] = useState<'loading' | 'success' | 'error'>(
    'loading'
  );
  const [courseError, setCourseError] = useState<string | null>(null);

  // Modules State
  const [modules, setModules] = useState<PublisherModuleItem[]>([]);
  const [modulesStatus, setModulesStatus] = useState<'loading' | 'success' | 'error'>(
    'loading'
  );
  const [modulesError, setModulesError] = useState<string | null>(null);

  // Chapters State per Module ID
  const [chaptersByModule, setChaptersByModule] = useState<
    Record<
      string,
      {
        status: 'loading' | 'success' | 'error';
        chapters: PublisherChapterItem[];
        error?: string;
      }
    >
  >({});

  // Modals state
  const [formModal, setFormModal] = useState<{
    isOpen: boolean;
    type: ContainerType;
    mode: 'create' | 'edit';
    parentId?: string;
    initialData?: {
      id?: string;
      name?: string;
      subject?: string;
    };
  }>({
    isOpen: false,
    type: 'module',
    mode: 'create',
  });

  const [removalModal, setRemovalModal] = useState<{
    isOpen: boolean;
    type: ContainerType;
    item: { id: string; name: string } | null;
  }>({
    isOpen: false,
    type: 'course',
    item: null,
  });

  useEffect(() => {
    mountedRef.current = true;
    return () => {
      mountedRef.current = false;
    };
  }, []);

  // Load Course Header Details
  const loadCourse = useCallback(async (id: string) => {
    setCourseStatus('loading');
    setCourseError(null);
    try {
      const data = await fetchManageableCourse(id);
      if (mountedRef.current) {
        setCourse(data);
        setCourseStatus('success');
      }
    } catch (err: unknown) {
      if (!mountedRef.current) return;
      const msg =
        err instanceof ApiError && err.envelope.detail
          ? err.envelope.detail
          : (err as Error)?.message ||
            'Impossible de charger les informations du cours.';
      setCourseError(msg);
      setCourseStatus('error');
    }
  }, []);

  // Load Module Chapters
  const loadChaptersForModule = useCallback(async (moduleId: string) => {
    setChaptersByModule((prev) => ({
      ...prev,
      [moduleId]: {
        status: 'loading',
        chapters: prev[moduleId]?.chapters || [],
      },
    }));

    try {
      const res = await fetchManageableChapters(moduleId);
      if (mountedRef.current) {
        setChaptersByModule((prev) => ({
          ...prev,
          [moduleId]: {
            status: 'success',
            chapters: res.results || [],
          },
        }));
      }
    } catch (err: unknown) {
      if (!mountedRef.current) return;
      const msg =
        err instanceof ApiError && err.envelope.detail
          ? err.envelope.detail
          : (err as Error)?.message ||
            'Impossible de charger les chapitres de ce module.';
      setChaptersByModule((prev) => ({
        ...prev,
        [moduleId]: {
          status: 'error',
          chapters: [],
          error: msg,
        },
      }));
    }
  }, []);

  // Load Modules List
  const loadModules = useCallback(
    async (id: string) => {
      setModulesStatus('loading');
      setModulesError(null);
      try {
        const res = await fetchManageableModules(id);
        if (mountedRef.current) {
          const loadedModules = res.results || [];
          setModules(loadedModules);
          setModulesStatus('success');

          // Preload chapters for all modules
          for (const mod of loadedModules) {
            loadChaptersForModule(mod.id);
          }
        }
      } catch (err: unknown) {
        if (!mountedRef.current) return;
        const msg =
          err instanceof ApiError && err.envelope.detail
            ? err.envelope.detail
            : (err as Error)?.message ||
              'Impossible de charger la liste des modules.';
        setModulesError(msg);
        setModulesStatus('error');
      }
    },
    [loadChaptersForModule]
  );

  useEffect(() => {
    if (courseId) {
      loadCourse(courseId);
      loadModules(courseId);
    }
  }, [courseId, loadCourse, loadModules]);

  // Handlers for Container Modal
  const openCreateModule = () => {
    if (!courseId) return;
    setFormModal({
      isOpen: true,
      type: 'module',
      mode: 'create',
      parentId: courseId,
    });
  };

  const openEditCourse = () => {
    if (!course) return;
    setFormModal({
      isOpen: true,
      type: 'course',
      mode: 'edit',
      initialData: {
        id: course.id,
        name: course.name,
        subject: course.subject,
      },
    });
  };

  const openDeleteCourse = () => {
    if (!course) return;
    setRemovalModal({
      isOpen: true,
      type: 'course',
      item: { id: course.id, name: course.name },
    });
  };

  const openCreateChapter = (moduleId: string) => {
    setFormModal({
      isOpen: true,
      type: 'chapter',
      mode: 'create',
      parentId: moduleId,
    });
  };

  const openEditModule = (mod: PublisherModuleItem) => {
    setFormModal({
      isOpen: true,
      type: 'module',
      mode: 'edit',
      initialData: {
        id: mod.id,
        name: mod.name,
      },
    });
  };

  const openDeleteModule = (mod: PublisherModuleItem) => {
    setRemovalModal({
      isOpen: true,
      type: 'module',
      item: { id: mod.id, name: mod.name },
    });
  };

  const openEditChapter = (chap: PublisherChapterItem) => {
    setFormModal({
      isOpen: true,
      type: 'chapter',
      mode: 'edit',
      initialData: {
        id: chap.id,
        name: chap.name,
      },
    });
  };

  const openDeleteChapter = (chap: PublisherChapterItem) => {
    setRemovalModal({
      isOpen: true,
      type: 'chapter',
      item: { id: chap.id, name: chap.name },
    });
  };

  // Callback on successful form submission
  const handleFormSuccess = (item: unknown) => {
    if (formModal.type === 'course') {
      const updatedCourse = item as PublisherCourseItem;
      setCourse((prev) => (prev ? { ...prev, ...updatedCourse } : updatedCourse));
    } else if (formModal.type === 'module') {
      const mod = item as PublisherModuleItem;
      if (formModal.mode === 'create') {
        setModules((prev) => [...prev, mod]);
        loadChaptersForModule(mod.id);
      } else {
        setModules((prev) =>
          prev.map((m) => (m.id === mod.id ? { ...m, ...mod } : m))
        );
      }
    } else if (formModal.type === 'chapter') {
      const chap = item as PublisherChapterItem;
      const targetModuleId = formModal.parentId;
      if (formModal.mode === 'create' && targetModuleId) {
        setChaptersByModule((prev) => ({
          ...prev,
          [targetModuleId]: {
            status: 'success',
            chapters: [...(prev[targetModuleId]?.chapters || []), chap],
          },
        }));
      } else {
        // Edit mode: find and update chapter in whichever module holds it
        setChaptersByModule((prev) => {
          const next = { ...prev };
          for (const mId in next) {
            next[mId] = {
              ...next[mId],
              chapters: next[mId].chapters.map((c) =>
                c.id === chap.id ? { ...c, ...chap } : c
              ),
            };
          }
          return next;
        });
      }
    }
  };

  // Callback on successful deletion
  const handleRemovalSuccess = (deleted: unknown) => {
    if (removalModal.type === 'course') {
      navigate('/publisher');
    } else if (removalModal.type === 'module') {
      const deletedMod = deleted as PublisherModuleItem;
      setModules((prev) => prev.filter((m) => m.id !== deletedMod.id));
    } else if (removalModal.type === 'chapter') {
      const deletedChap = deleted as PublisherChapterItem;
      setChaptersByModule((prev) => {
        const next = { ...prev };
        for (const mId in next) {
          next[mId] = {
            ...next[mId],
            chapters: next[mId].chapters.filter((c) => c.id !== deletedChap.id),
          };
        }
        return next;
      });
    }
  };

  return (
    <div
      data-testid="publisher-course-page"
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
            data-testid="breadcrumb-current-course"
            className="text-primary truncate max-w-[200px] sm:max-w-xs"
          >
            {course?.name || 'Chargement...'}
          </span>
        </nav>

        {/* Course Header Banner */}
        {courseStatus === 'loading' && (
          <div
            data-testid="course-header-skeleton"
            className="rounded-lg border border-border bg-card p-6 space-y-4 animate-pulse"
          >
            <div className="h-4 w-28 bg-surface rounded" />
            <div className="h-8 w-2/3 bg-surface rounded" />
          </div>
        )}

        {courseStatus === 'error' && (
          <div
            role="alert"
            data-testid="course-header-error"
            className="rounded-lg border border-destructive-border bg-destructive-surface p-6 text-center space-y-3"
          >
            <AlertCircle className="h-6 w-6 text-destructive mx-auto" />
            <p className="text-sm text-foreground">{courseError}</p>
            <Button
              type="button"
              variant="outline"
              size="sm"
              onClick={() => courseId && loadCourse(courseId)}
              className="border-destructive-border"
            >
              Réessayer
            </Button>
          </div>
        )}

        {courseStatus === 'success' && course && (
          <div
            data-testid="course-header"
            className="rounded-lg border border-border bg-card p-6 flex flex-col md:flex-row md:items-center justify-between gap-6 shadow-sm"
          >
            <div className="space-y-2">
              <div className="flex items-center gap-2">
                <BookOpen className="h-4 w-4 text-primary shrink-0" aria-hidden="true" />
                <span
                  data-testid="publisher-course-subject"
                  className="text-xs font-semibold uppercase tracking-wider text-primary"
                >
                  {course.subject}
                </span>
                {course.is_deleted && (
                  <span
                    data-testid="course-deleted-badge"
                    className="px-2 py-0.5 rounded-full text-[11px] font-medium bg-[#251719] text-[#F85149] border border-[#DA3633]"
                  >
                    Supprimé
                  </span>
                )}
              </div>
              <h1
                data-testid="publisher-course-title"
                className="text-2xl sm:text-3xl font-bold tracking-tight text-foreground break-words"
              >
                {course.name}
              </h1>
              <p className="text-xs text-foreground-muted">
                Dernière modification : {course.updated_at?.slice(0, 10)}
              </p>
            </div>

            {/* Course Action Buttons */}
            <div className="flex flex-wrap items-center gap-2.5">
              <Button
                type="button"
                variant="outline"
                data-testid="edit-course-btn"
                onClick={openEditCourse}
                className="min-h-[44px] min-w-[44px] text-xs sm:text-sm font-medium border-border inline-flex items-center gap-2"
              >
                <Pencil className="h-4 w-4" />
                <span>Modifier le cours</span>
              </Button>

              <Button
                type="button"
                variant="outline"
                data-testid="delete-course-btn"
                onClick={openDeleteCourse}
                className="min-h-[44px] min-w-[44px] text-xs sm:text-sm font-medium border-destructive-border text-destructive hover:bg-destructive/10 inline-flex items-center gap-2"
              >
                <Trash2 className="h-4 w-4" />
                <span>Supprimer</span>
              </Button>

              <Button
                type="button"
                variant="default"
                data-testid="create-module-btn"
                onClick={openCreateModule}
                className="min-h-[44px] min-w-[44px] text-xs sm:text-sm font-medium bg-primary text-primary-foreground hover:bg-primary-hover shadow-sm inline-flex items-center gap-2"
              >
                <Plus className="h-4 w-4" />
                <span>Nouveau Module</span>
              </Button>
            </div>
          </div>
        )}

        {/* Modules Section */}
        <div className="space-y-4">
          <div className="flex items-center justify-between pb-2 border-b border-border">
            <div className="flex items-center gap-2">
              <Layers className="h-5 w-5 text-primary" aria-hidden="true" />
              <h2 className="text-lg sm:text-xl font-bold text-foreground">
                Structure du Cours (Modules & Chapitres)
              </h2>
            </div>
            <span
              data-testid="modules-count"
              className="text-xs font-mono text-foreground-muted"
            >
              {modules.length} module{modules.length > 1 ? 's' : ''}
            </span>
          </div>

          {/* Modules Loading Skeleton */}
          {modulesStatus === 'loading' && (
            <div
              data-testid="modules-loading"
              className="space-y-4 animate-pulse"
              aria-label="Chargement des modules"
            >
              {[1, 2].map((i) => (
                <div
                  key={i}
                  className="rounded-lg border border-border bg-card p-5 space-y-3"
                >
                  <div className="h-5 w-48 bg-surface rounded" />
                  <div className="h-4 w-32 bg-surface rounded" />
                </div>
              ))}
            </div>
          )}

          {/* Modules Error State */}
          {modulesStatus === 'error' && (
            <div
              role="alert"
              data-testid="modules-error"
              className="rounded-lg border border-destructive-border bg-destructive-surface p-6 text-center space-y-3"
            >
              <AlertCircle className="h-6 w-6 text-destructive mx-auto" />
              <p className="text-sm text-foreground">{modulesError}</p>
              <Button
                type="button"
                variant="secondary"
                size="sm"
                onClick={() => courseId && loadModules(courseId)}
                className="border-border inline-flex items-center gap-2"
              >
                <RefreshCw className="h-4 w-4" />
                <span>Réessayer</span>
              </Button>
            </div>
          )}

          {/* Modules Empty State */}
          {modulesStatus === 'success' && modules.length === 0 && (
            <div
              data-testid="modules-empty"
              className="rounded-lg border border-dashed border-border bg-card/50 p-8 sm:p-12 text-center space-y-4 max-w-md mx-auto"
            >
              <div className="inline-flex items-center justify-center h-12 w-12 rounded-full bg-surface text-foreground-muted mx-auto border border-border">
                <FolderPlus className="h-6 w-6" />
              </div>
              <div className="space-y-1">
                <h3 className="text-base font-semibold text-foreground">
                  Aucun module pour le moment.
                </h3>
                <p className="text-xs text-foreground-muted">
                  Organisez votre cours en modules thématiques en cliquant sur « Nouveau Module ».
                </p>
              </div>
              <Button
                type="button"
                variant="default"
                data-testid="empty-create-module-btn"
                onClick={openCreateModule}
                className="min-h-[44px] min-w-[44px] text-xs sm:text-sm font-medium bg-primary text-primary-foreground hover:bg-primary-hover shadow-sm inline-flex items-center gap-2"
              >
                <Plus className="h-4 w-4" />
                <span>Nouveau Module</span>
              </Button>
            </div>
          )}

          {/* Modules List */}
          {modulesStatus === 'success' && modules.length > 0 && (
            <div data-testid="modules-list" className="space-y-4">
              {modules.map((mod, index) => {
                const chapterState = chaptersByModule[mod.id];
                const chapters = chapterState?.chapters || [];

                return (
                  <div
                    key={mod.id}
                    data-testid={`publisher-module-card-${mod.id}`}
                    className="rounded-lg border border-border bg-card p-5 space-y-4 shadow-sm"
                  >
                    {/* Module Header Bar */}
                    <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 pb-3 border-b border-border/70">
                      <div className="flex items-center gap-2.5 min-w-0">
                        <span className="flex items-center justify-center h-6 w-6 rounded bg-primary/10 text-primary text-xs font-mono font-bold shrink-0">
                          {index + 1}
                        </span>
                        <h3
                          data-testid={`module-name-${mod.id}`}
                          className="text-base sm:text-lg font-semibold text-foreground truncate"
                        >
                          {mod.name}
                        </h3>
                        {mod.is_deleted && (
                          <span
                            data-testid={`module-deleted-badge-${mod.id}`}
                            className="px-2 py-0.5 rounded-full text-[10px] font-medium bg-[#251719] text-[#F85149] border border-[#DA3633] shrink-0"
                          >
                            Supprimé
                          </span>
                        )}
                      </div>

                      {/* Module Actions */}
                      <div className="flex items-center gap-2 self-start sm:self-auto shrink-0">
                        <Button
                          type="button"
                          variant="outline"
                          size="sm"
                          data-testid={`create-chapter-btn-${mod.id}`}
                          onClick={() => openCreateChapter(mod.id)}
                          className="min-h-[44px] min-w-[44px] text-xs font-medium border-border inline-flex items-center gap-1.5"
                        >
                          <Plus className="h-3.5 w-3.5" />
                          <span>Nouveau Chapitre</span>
                        </Button>

                        <Button
                          type="button"
                          variant="outline"
                          size="sm"
                          data-testid={`edit-module-btn-${mod.id}`}
                          onClick={() => openEditModule(mod)}
                          aria-label={`Modifier le module ${mod.name}`}
                          className="min-h-[44px] min-w-[44px] text-xs font-medium border-border inline-flex items-center gap-1"
                        >
                          <Pencil className="h-3.5 w-3.5" />
                          <span className="sr-only sm:not-sr-only">Modifier</span>
                        </Button>

                        <Button
                          type="button"
                          variant="outline"
                          size="sm"
                          data-testid={`delete-module-btn-${mod.id}`}
                          onClick={() => openDeleteModule(mod)}
                          aria-label={`Supprimer le module ${mod.name}`}
                          className="min-h-[44px] min-w-[44px] text-xs font-medium border-destructive-border text-destructive hover:bg-destructive/10 inline-flex items-center gap-1"
                        >
                          <Trash2 className="h-3.5 w-3.5" />
                          <span className="sr-only sm:not-sr-only">Supprimer</span>
                        </Button>
                      </div>
                    </div>

                    {/* Chapters List inside Module */}
                    <div className="space-y-2 pl-2 sm:pl-4">
                      {chapterState?.status === 'loading' && (
                        <div
                          data-testid={`chapters-loading-${mod.id}`}
                          className="text-xs text-foreground-muted py-2 animate-pulse"
                        >
                          Chargement des chapitres...
                        </div>
                      )}

                      {chapterState?.status === 'error' && (
                        <div
                          role="alert"
                          data-testid={`chapters-error-${mod.id}`}
                          className="flex items-center justify-between text-xs text-destructive py-2 px-3 bg-destructive-surface rounded border border-destructive-border"
                        >
                          <span>{chapterState.error || 'Erreur lors du chargement des chapitres.'}</span>
                          <Button
                            type="button"
                            variant="outline"
                            size="sm"
                            data-testid={`retry-chapters-btn-${mod.id}`}
                            onClick={() => loadChaptersForModule(mod.id)}
                            className="text-xs border-destructive-border"
                          >
                            Réessayer
                          </Button>
                        </div>
                      )}

                      {chapterState?.status === 'success' && chapters.length === 0 && (
                        <div
                          data-testid={`chapters-empty-${mod.id}`}
                          className="text-xs text-foreground-muted py-2 italic"
                        >
                          Aucun chapitre dans ce module. Cliquez sur « Nouveau Chapitre ».
                        </div>
                      )}

                      {chapters.length > 0 && (
                        <div
                          data-testid={`chapters-list-${mod.id}`}
                          className="divide-y divide-border/40 rounded-md border border-border/60 bg-surface/40 overflow-hidden"
                        >
                          {chapters.map((chap, chapIndex) => (
                            <div
                              key={chap.id}
                              data-testid={`publisher-chapter-item-${chap.id}`}
                              className="p-3 flex items-center justify-between gap-3 hover:bg-surface transition-colors"
                            >
                              <div className="flex items-center gap-2 min-w-0">
                                <FileText
                                  className="h-4 w-4 text-foreground-muted shrink-0"
                                  aria-hidden="true"
                                />
                                <span className="text-xs font-mono text-foreground-muted shrink-0">
                                  {index + 1}.{chapIndex + 1}
                                </span>
                                <span
                                  data-testid={`chapter-name-${chap.id}`}
                                  className="text-xs sm:text-sm font-medium text-foreground truncate"
                                >
                                  {chap.name}
                                </span>
                                {chap.is_deleted && (
                                  <span
                                    data-testid={`chapter-deleted-badge-${chap.id}`}
                                    className="px-1.5 py-0.5 rounded text-[10px] font-medium bg-[#251719] text-[#F85149] border border-[#DA3633] shrink-0"
                                  >
                                    Supprimé
                                  </span>
                                )}
                              </div>

                              <div className="flex items-center gap-1.5 shrink-0">
                                <Button
                                  type="button"
                                  variant="ghost"
                                  size="sm"
                                  data-testid={`edit-chapter-btn-${chap.id}`}
                                  onClick={() => openEditChapter(chap)}
                                  aria-label={`Modifier le chapitre ${chap.name}`}
                                  className="min-h-[44px] min-w-[44px] text-xs hover:bg-surface text-foreground-muted hover:text-foreground"
                                >
                                  <Pencil className="h-3.5 w-3.5" />
                                </Button>

                                <Button
                                  type="button"
                                  variant="ghost"
                                  size="sm"
                                  data-testid={`delete-chapter-btn-${chap.id}`}
                                  onClick={() => openDeleteChapter(chap)}
                                  aria-label={`Supprimer le chapitre ${chap.name}`}
                                  className="min-h-[44px] min-w-[44px] text-xs hover:bg-destructive/10 text-destructive"
                                >
                                  <Trash2 className="h-3.5 w-3.5" />
                                </Button>
                              </div>
                            </div>
                          ))}
                        </div>
                      )}
                    </div>
                  </div>
                );
              })}
            </div>
          )}
        </div>
      </main>

      {/* Container Creation / Edition Modal */}
      <ContainerFormModal
        isOpen={formModal.isOpen}
        onClose={() => setFormModal((prev) => ({ ...prev, isOpen: false }))}
        type={formModal.type}
        mode={formModal.mode}
        parentId={formModal.parentId}
        initialData={formModal.initialData}
        onSuccess={handleFormSuccess}
      />

      {/* Cascade Removal Confirmation Modal */}
      <RemovalPreviewModal
        isOpen={removalModal.isOpen}
        onClose={() => setRemovalModal((prev) => ({ ...prev, isOpen: false }))}
        type={removalModal.type}
        item={removalModal.item}
        onSuccess={handleRemovalSuccess}
      />
    </div>
  );
}

export default PublisherCoursePage;
