import { useState, useEffect, useCallback, useRef } from 'react';
import { useParams, Link, useNavigate } from 'react-router-dom';
import {
  Plus,
  Pencil,
  Trash2,
  ChevronRight,
  ChevronDown,
  BookOpen,
  Layers,
  FileText,
  AlertCircle,
  RefreshCw,
  FolderPlus,
  Globe,
  EyeOff,
  Loader2,
} from 'lucide-react';
import { AppHeader } from '@/components/layout/app-header';
import { Button } from '@/components/ui/button';
import { ContainerFormModal } from './container-form-modal';
import { RemovalPreviewModal } from './removal-preview-modal';
import { BulkPublishModal } from './bulk-publish-modal';
import {
  SortableItem,
  SortableHandle,
  SortableLiveRegion,
  getPickUpAnnouncement,
  getMovementAnnouncement,
  getCommitAnnouncement,
  getCancelAnnouncement,
} from './sortable-item';
import {
  fetchManageableCourse,
  fetchManageableModules,
  fetchManageableChapters,
  fetchManageableLessons,
  reorderModules,
  reorderChapters,
  reorderLessons,
  publishLesson,
  unpublishLesson,
} from '../api';
import type {
  PublisherCourseItem,
  PublisherModuleItem,
  PublisherChapterItem,
  PublisherLessonItem,
  ContainerType,
  BulkPublishCommitResponse,
} from '../types';
import { ApiError } from '@/lib/api';
import { useAuthStore } from '@/features/auth/auth-store';

export function PublisherCoursePage() {
  const { courseId } = useParams<{ courseId: string }>();
  const navigate = useNavigate();
  const mountedRef = useRef(true);

  // Global announcements and error for reordering
  const [liveAnnouncement, setLiveAnnouncement] = useState<string | null>(null);
  const [reorderError, setReorderError] = useState<string | null>(null);

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

  // Module Reorder State
  const [grabbedModuleId, setGrabbedModuleId] = useState<string | null>(null);
  const [overModuleIndex, setOverModuleIndex] = useState<number | null>(null);
  const modulesSnapshotRef = useRef<PublisherModuleItem[] | null>(null);
  const draggedModuleIdRef = useRef<string | null>(null);

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

  // Chapter Reorder State
  const [grabbedChapterId, setGrabbedChapterId] = useState<string | null>(null);
  const [overChapterState, setOverChapterState] = useState<{
    moduleId: string;
    index: number;
  } | null>(null);
  const chaptersSnapshotRef = useRef<Record<string, PublisherChapterItem[]>>({});
  const draggedChapterIdRef = useRef<string | null>(null);

  // Lessons State per Chapter ID
  const [expandedChapters, setExpandedChapters] = useState<Record<string, boolean>>({});
  const [lessonsByChapter, setLessonsByChapter] = useState<
    Record<
      string,
      {
        status: 'loading' | 'success' | 'error';
        lessons: PublisherLessonItem[];
        error?: string;
      }
    >
  >({});

  // Lesson Reorder State
  const [grabbedLessonId, setGrabbedLessonId] = useState<string | null>(null);
  const [overLessonState, setOverLessonState] = useState<{
    chapterId: string;
    index: number;
  } | null>(null);
  const lessonsSnapshotRef = useRef<Record<string, PublisherLessonItem[]>>({});
  const draggedLessonIdRef = useRef<string | null>(null);

  // Lesson Publication State & Auth
  const isPublisher = useAuthStore((state) => state.isPublisher);
  const [publishingLessonId, setPublishingLessonId] = useState<string | null>(null);

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

  const [bulkPublishTarget, setBulkPublishTarget] = useState<{
    type: 'module' | 'chapter';
    item: { id: string; name: string };
  } | null>(null);

  useEffect(() => {
    mountedRef.current = true;
    return () => {
      mountedRef.current = false;
    };
  }, []);

  const focusHandle = (testId: string) => {
    setTimeout(() => {
      if (!mountedRef.current) return;
      const el = document.querySelector(
        `[data-testid="${testId}"]`
      ) as HTMLElement | null;
      el?.focus();
    }, 0);
  };

  const extractErrorMessage = (err: unknown, defaultMsg: string): string => {
    if (err instanceof ApiError) {
      if (err.envelope?.errors?.order?.[0]) {
        return err.envelope.errors.order[0];
      }
      if (err.envelope?.detail) {
        return err.envelope.detail;
      }
    }
    return (err as Error)?.message || defaultMsg;
  };

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

  // Load Lessons for a Chapter
  const loadLessonsForChapter = useCallback(async (chapterId: string) => {
    setLessonsByChapter((prev) => ({
      ...prev,
      [chapterId]: {
        status: 'loading',
        lessons: prev[chapterId]?.lessons || [],
      },
    }));

    try {
      const res = await fetchManageableLessons(chapterId);
      if (mountedRef.current) {
        setLessonsByChapter((prev) => ({
          ...prev,
          [chapterId]: {
            status: 'success',
            lessons: res.results || [],
          },
        }));
      }
    } catch (err: unknown) {
      if (!mountedRef.current) return;
      const msg =
        err instanceof ApiError && err.envelope.detail
          ? err.envelope.detail
          : (err as Error)?.message ||
            'Impossible de charger les leçons de ce chapitre.';
      setLessonsByChapter((prev) => ({
        ...prev,
        [chapterId]: {
          status: 'error',
          lessons: [],
          error: msg,
        },
      }));
    }
  }, []);

  const toggleChapterExpand = (chapterId: string) => {
    const isCurrentlyExpanded = !!expandedChapters[chapterId];
    const willBeExpanded = !isCurrentlyExpanded;

    setExpandedChapters((prev) => ({
      ...prev,
      [chapterId]: willBeExpanded,
    }));

    // Side-effect executed outside functional updater
    if (willBeExpanded && !lessonsByChapter[chapterId]) {
      loadLessonsForChapter(chapterId);
    }
  };

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

  // ================= MODULES REORDERING =================

  const handleModulePickUp = (mod: PublisherModuleItem, _index: number) => {
    modulesSnapshotRef.current = [...modules];
    setGrabbedModuleId(mod.id);
    setLiveAnnouncement(getPickUpAnnouncement(mod.name));
  };

  const handleModuleMove = (currentIndex: number, direction: 'up' | 'down') => {
    const targetIndex = direction === 'up' ? currentIndex - 1 : currentIndex + 1;
    if (targetIndex < 0) {
      setLiveAnnouncement('Premier élément atteint.');
      return;
    }
    if (targetIndex >= modules.length) {
      setLiveAnnouncement('Dernier élément atteint.');
      return;
    }

    const movingMod = modules[currentIndex];
    setModules((prev) => {
      const copy = [...prev];
      const temp = copy[currentIndex];
      copy[currentIndex] = copy[targetIndex];
      copy[targetIndex] = temp;
      return copy;
    });

    setLiveAnnouncement(getMovementAnnouncement(targetIndex + 1, modules.length));
    focusHandle(`drag-handle-${movingMod.id}`);
  };

  const handleModuleCommit = async (mod: PublisherModuleItem) => {
    setGrabbedModuleId(null);
    const initial = modulesSnapshotRef.current;
    modulesSnapshotRef.current = null;
    if (!courseId || !initial) return;

    const initialIds = initial
      .filter((m) => !m.is_deleted)
      .map((m) => m.id)
      .join(',');
    const currentIds = modules
      .filter((m) => !m.is_deleted)
      .map((m) => m.id)
      .join(',');

    if (initialIds !== currentIds) {
      if (mountedRef.current) {
        setLiveAnnouncement(getCommitAnnouncement(mod.name));
      }
      try {
        const payloadOrder = modules.filter((m) => !m.is_deleted).map((m) => m.id);
        const updated = await reorderModules(courseId, payloadOrder);
        if (mountedRef.current) {
          const updatedMap = new Map(updated.map((m) => [m.id, m]));
          setModules((prev) => prev.map((m) => updatedMap.get(m.id) || m));
        }
      } catch (err: unknown) {
        if (mountedRef.current) {
          setModules(initial);
          const msg = extractErrorMessage(
            err,
            'Échec du réordonnancement des modules.'
          );
          setReorderError(msg);
          setLiveAnnouncement(`Erreur : ${msg}`);
        }
      }
    }
  };

  const handleModuleCancel = () => {
    if (modulesSnapshotRef.current) {
      setModules(modulesSnapshotRef.current);
      modulesSnapshotRef.current = null;
    }
    setGrabbedModuleId(null);
    setLiveAnnouncement(getCancelAnnouncement());
  };

  const handleModuleDragStart = (
    mod: PublisherModuleItem,
    _index: number,
    e?: React.DragEvent
  ) => {
    modulesSnapshotRef.current = [...modules];
    draggedModuleIdRef.current = mod.id;
    if (e?.dataTransfer) {
      e.dataTransfer.setData('text/plain', mod.id);
    }
  };

  const handleModuleDragOver = (targetIndex: number) => {
    setOverModuleIndex(targetIndex);
  };

  const handleModuleDrop = async (
    targetIndex: number,
    _targetMod: PublisherModuleItem,
    e?: React.DragEvent
  ) => {
    setOverModuleIndex(null);
    const sourceId =
      e?.dataTransfer?.getData('text/plain') || draggedModuleIdRef.current;
    draggedModuleIdRef.current = null;
    const initial = modulesSnapshotRef.current || modules;
    modulesSnapshotRef.current = null;
    if (!courseId || !sourceId) return;

    const sourceIndex = initial.findIndex((m) => m.id === sourceId);
    if (sourceIndex === -1 || sourceIndex === targetIndex) return;

    const nextModules = [...initial];
    const [moved] = nextModules.splice(sourceIndex, 1);
    nextModules.splice(targetIndex, 0, moved);
    setModules(nextModules);

    const initialIds = initial
      .filter((m) => !m.is_deleted)
      .map((m) => m.id)
      .join(',');
    const currentIds = nextModules
      .filter((m) => !m.is_deleted)
      .map((m) => m.id)
      .join(',');

    if (initialIds !== currentIds) {
      if (mountedRef.current) {
        setLiveAnnouncement(getCommitAnnouncement(moved.name));
      }
      try {
        const payloadOrder = nextModules
          .filter((m) => !m.is_deleted)
          .map((m) => m.id);
        const updated = await reorderModules(courseId, payloadOrder);
        if (mountedRef.current) {
          const updatedMap = new Map(updated.map((m) => [m.id, m]));
          setModules(nextModules.map((m) => updatedMap.get(m.id) || m));
        }
      } catch (err: unknown) {
        if (mountedRef.current) {
          setModules(initial);
          const msg = extractErrorMessage(
            err,
            'Échec du réordonnancement des modules.'
          );
          setReorderError(msg);
          setLiveAnnouncement(`Erreur : ${msg}`);
        }
      }
    }
  };

  const handleModuleDragEnd = () => {
    setOverModuleIndex(null);
    draggedModuleIdRef.current = null;
  };

  // ================= CHAPTERS REORDERING =================

  const handleChapterPickUp = (
    moduleId: string,
    chap: PublisherChapterItem,
    _index: number
  ) => {
    const chapters = chaptersByModule[moduleId]?.chapters || [];
    chaptersSnapshotRef.current[moduleId] = [...chapters];
    setGrabbedChapterId(chap.id);
    setLiveAnnouncement(getPickUpAnnouncement(chap.name));
  };

  const handleChapterMove = (
    moduleId: string,
    currentIndex: number,
    direction: 'up' | 'down'
  ) => {
    const chapters = chaptersByModule[moduleId]?.chapters || [];
    const targetIndex = direction === 'up' ? currentIndex - 1 : currentIndex + 1;
    if (targetIndex < 0) {
      setLiveAnnouncement('Premier élément atteint.');
      return;
    }
    if (targetIndex >= chapters.length) {
      setLiveAnnouncement('Dernier élément atteint.');
      return;
    }

    const movingChap = chapters[currentIndex];
    setChaptersByModule((prev) => {
      const list = prev[moduleId]?.chapters || [];
      const copy = [...list];
      const temp = copy[currentIndex];
      copy[currentIndex] = copy[targetIndex];
      copy[targetIndex] = temp;
      return {
        ...prev,
        [moduleId]: {
          ...prev[moduleId],
          chapters: copy,
        },
      };
    });

    setLiveAnnouncement(getMovementAnnouncement(targetIndex + 1, chapters.length));
    focusHandle(`drag-handle-${movingChap.id}`);
  };

  const handleChapterCommit = async (
    moduleId: string,
    chap: PublisherChapterItem
  ) => {
    setGrabbedChapterId(null);
    const initial = chaptersSnapshotRef.current[moduleId];
    delete chaptersSnapshotRef.current[moduleId];
    if (!initial) return;

    const chapters = chaptersByModule[moduleId]?.chapters || [];
    const initialIds = initial
      .filter((c) => !c.is_deleted)
      .map((c) => c.id)
      .join(',');
    const currentIds = chapters
      .filter((c) => !c.is_deleted)
      .map((c) => c.id)
      .join(',');

    if (initialIds !== currentIds) {
      if (mountedRef.current) {
        setLiveAnnouncement(getCommitAnnouncement(chap.name));
      }
      try {
        const payloadOrder = chapters
          .filter((c) => !c.is_deleted)
          .map((c) => c.id);
        const updated = await reorderChapters(moduleId, payloadOrder);
        if (mountedRef.current) {
          const updatedMap = new Map(updated.map((c) => [c.id, c]));
          setChaptersByModule((prev) => ({
            ...prev,
            [moduleId]: {
              ...prev[moduleId],
              chapters: (prev[moduleId]?.chapters || []).map(
                (c) => updatedMap.get(c.id) || c
              ),
            },
          }));
        }
      } catch (err: unknown) {
        if (mountedRef.current) {
          setChaptersByModule((prev) => ({
            ...prev,
            [moduleId]: {
              ...prev[moduleId],
              chapters: initial,
            },
          }));
          const msg = extractErrorMessage(
            err,
            'Échec du réordonnancement des chapitres.'
          );
          setReorderError(msg);
          setLiveAnnouncement(`Erreur : ${msg}`);
        }
      }
    }
  };

  const handleChapterCancel = (moduleId: string) => {
    if (chaptersSnapshotRef.current[moduleId]) {
      const initial = chaptersSnapshotRef.current[moduleId];
      delete chaptersSnapshotRef.current[moduleId];
      setChaptersByModule((prev) => ({
        ...prev,
        [moduleId]: {
          ...prev[moduleId],
          chapters: initial,
        },
      }));
    }
    setGrabbedChapterId(null);
    setLiveAnnouncement(getCancelAnnouncement());
  };

  const handleChapterDragStart = (
    moduleId: string,
    chap: PublisherChapterItem,
    _index: number,
    e?: React.DragEvent
  ) => {
    const chapters = chaptersByModule[moduleId]?.chapters || [];
    chaptersSnapshotRef.current[moduleId] = [...chapters];
    draggedChapterIdRef.current = chap.id;
    if (e?.dataTransfer) {
      e.dataTransfer.setData('text/plain', chap.id);
    }
  };

  const handleChapterDragOver = (moduleId: string, targetIndex: number) => {
    setOverChapterState({ moduleId, index: targetIndex });
  };

  const handleChapterDrop = async (
    moduleId: string,
    targetIndex: number,
    _targetChap: PublisherChapterItem,
    e?: React.DragEvent
  ) => {
    setOverChapterState(null);
    const sourceId =
      e?.dataTransfer?.getData('text/plain') || draggedChapterIdRef.current;
    draggedChapterIdRef.current = null;
    const initial =
      chaptersSnapshotRef.current[moduleId] ||
      chaptersByModule[moduleId]?.chapters ||
      [];
    delete chaptersSnapshotRef.current[moduleId];
    if (!sourceId) return;

    const sourceIndex = initial.findIndex((c) => c.id === sourceId);
    if (sourceIndex === -1 || sourceIndex === targetIndex) return;

    const nextChapters = [...initial];
    const [moved] = nextChapters.splice(sourceIndex, 1);
    nextChapters.splice(targetIndex, 0, moved);

    setChaptersByModule((prev) => ({
      ...prev,
      [moduleId]: {
        ...prev[moduleId],
        chapters: nextChapters,
      },
    }));

    const initialIds = initial
      .filter((c) => !c.is_deleted)
      .map((c) => c.id)
      .join(',');
    const currentIds = nextChapters
      .filter((c) => !c.is_deleted)
      .map((c) => c.id)
      .join(',');

    if (initialIds !== currentIds) {
      if (mountedRef.current) {
        setLiveAnnouncement(getCommitAnnouncement(moved.name));
      }
      try {
        const payloadOrder = nextChapters
          .filter((c) => !c.is_deleted)
          .map((c) => c.id);
        const updated = await reorderChapters(moduleId, payloadOrder);
        if (mountedRef.current) {
          const updatedMap = new Map(updated.map((c) => [c.id, c]));
          setChaptersByModule((prev) => ({
            ...prev,
            [moduleId]: {
              ...prev[moduleId],
              chapters: nextChapters.map((c) => updatedMap.get(c.id) || c),
            },
          }));
        }
      } catch (err: unknown) {
        if (mountedRef.current) {
          setChaptersByModule((prev) => ({
            ...prev,
            [moduleId]: {
              ...prev[moduleId],
              chapters: initial,
            },
          }));
          const msg = extractErrorMessage(
            err,
            'Échec du réordonnancement des chapitres.'
          );
          setReorderError(msg);
          setLiveAnnouncement(`Erreur : ${msg}`);
        }
      }
    }
  };

  const handleChapterDragEnd = () => {
    setOverChapterState(null);
    draggedChapterIdRef.current = null;
  };

  // ================= LESSONS REORDERING =================

  const handleLessonPickUp = (
    chapterId: string,
    lesson: PublisherLessonItem,
    _index: number
  ) => {
    const lessons = lessonsByChapter[chapterId]?.lessons || [];
    lessonsSnapshotRef.current[chapterId] = [...lessons];
    setGrabbedLessonId(lesson.id);
    setLiveAnnouncement(getPickUpAnnouncement(lesson.title));
  };

  const handleLessonMove = (
    chapterId: string,
    currentIndex: number,
    direction: 'up' | 'down'
  ) => {
    const lessons = lessonsByChapter[chapterId]?.lessons || [];
    const targetIndex = direction === 'up' ? currentIndex - 1 : currentIndex + 1;
    if (targetIndex < 0) {
      setLiveAnnouncement('Premier élément atteint.');
      return;
    }
    if (targetIndex >= lessons.length) {
      setLiveAnnouncement('Dernier élément atteint.');
      return;
    }

    const movingLesson = lessons[currentIndex];
    setLessonsByChapter((prev) => {
      const list = prev[chapterId]?.lessons || [];
      const copy = [...list];
      const temp = copy[currentIndex];
      copy[currentIndex] = copy[targetIndex];
      copy[targetIndex] = temp;
      return {
        ...prev,
        [chapterId]: {
          ...prev[chapterId],
          lessons: copy,
        },
      };
    });

    setLiveAnnouncement(getMovementAnnouncement(targetIndex + 1, lessons.length));
    focusHandle(`drag-handle-${movingLesson.id}`);
  };

  const handleLessonCommit = async (
    chapterId: string,
    lesson: PublisherLessonItem
  ) => {
    setGrabbedLessonId(null);
    const initial = lessonsSnapshotRef.current[chapterId];
    delete lessonsSnapshotRef.current[chapterId];
    if (!initial) return;

    const lessons = lessonsByChapter[chapterId]?.lessons || [];
    const initialIds = initial
      .filter((l) => !l.is_deleted)
      .map((l) => l.id)
      .join(',');
    const currentIds = lessons
      .filter((l) => !l.is_deleted)
      .map((l) => l.id)
      .join(',');

    if (initialIds !== currentIds) {
      if (mountedRef.current) {
        setLiveAnnouncement(getCommitAnnouncement(lesson.title));
      }
      try {
        const payloadOrder = lessons
          .filter((l) => !l.is_deleted)
          .map((l) => l.id);
        const updated = await reorderLessons(chapterId, payloadOrder);
        if (mountedRef.current) {
          const updatedMap = new Map(updated.map((l) => [l.id, l]));
          setLessonsByChapter((prev) => ({
            ...prev,
            [chapterId]: {
              ...prev[chapterId],
              lessons: (prev[chapterId]?.lessons || []).map(
                (l) => updatedMap.get(l.id) || l
              ),
            },
          }));
        }
      } catch (err: unknown) {
        if (mountedRef.current) {
          setLessonsByChapter((prev) => ({
            ...prev,
            [chapterId]: {
              ...prev[chapterId],
              lessons: initial,
            },
          }));
          const msg = extractErrorMessage(
            err,
            'Échec du réordonnancement des leçons.'
          );
          setReorderError(msg);
          setLiveAnnouncement(`Erreur : ${msg}`);
        }
      }
    }
  };

  const handleLessonCancel = (chapterId: string) => {
    if (lessonsSnapshotRef.current[chapterId]) {
      const initial = lessonsSnapshotRef.current[chapterId];
      delete lessonsSnapshotRef.current[chapterId];
      setLessonsByChapter((prev) => ({
        ...prev,
        [chapterId]: {
          ...prev[chapterId],
          lessons: initial,
        },
      }));
    }
    setGrabbedLessonId(null);
    setLiveAnnouncement(getCancelAnnouncement());
  };

  const handleLessonDragStart = (
    chapterId: string,
    lesson: PublisherLessonItem,
    _index: number,
    e?: React.DragEvent
  ) => {
    const lessons = lessonsByChapter[chapterId]?.lessons || [];
    lessonsSnapshotRef.current[chapterId] = [...lessons];
    draggedLessonIdRef.current = lesson.id;
    if (e?.dataTransfer) {
      e.dataTransfer.setData('text/plain', lesson.id);
    }
  };

  const handleLessonDragOver = (chapterId: string, targetIndex: number) => {
    setOverLessonState({ chapterId, index: targetIndex });
  };

  const handleLessonDrop = async (
    chapterId: string,
    targetIndex: number,
    _targetLesson: PublisherLessonItem,
    e?: React.DragEvent
  ) => {
    setOverLessonState(null);
    const sourceId =
      e?.dataTransfer?.getData('text/plain') || draggedLessonIdRef.current;
    draggedLessonIdRef.current = null;
    const initial =
      lessonsSnapshotRef.current[chapterId] ||
      lessonsByChapter[chapterId]?.lessons ||
      [];
    delete lessonsSnapshotRef.current[chapterId];
    if (!sourceId) return;

    const sourceIndex = initial.findIndex((l) => l.id === sourceId);
    if (sourceIndex === -1 || sourceIndex === targetIndex) return;

    const nextLessons = [...initial];
    const [moved] = nextLessons.splice(sourceIndex, 1);
    nextLessons.splice(targetIndex, 0, moved);

    setLessonsByChapter((prev) => ({
      ...prev,
      [chapterId]: {
        ...prev[chapterId],
        lessons: nextLessons,
      },
    }));

    const initialIds = initial
      .filter((l) => !l.is_deleted)
      .map((l) => l.id)
      .join(',');
    const currentIds = nextLessons
      .filter((l) => !l.is_deleted)
      .map((l) => l.id)
      .join(',');

    if (initialIds !== currentIds) {
      if (mountedRef.current) {
        setLiveAnnouncement(getCommitAnnouncement(moved.title));
      }
      try {
        const payloadOrder = nextLessons
          .filter((l) => !l.is_deleted)
          .map((l) => l.id);
        const updated = await reorderLessons(chapterId, payloadOrder);
        if (mountedRef.current) {
          const updatedMap = new Map(updated.map((l) => [l.id, l]));
          setLessonsByChapter((prev) => ({
            ...prev,
            [chapterId]: {
              ...prev[chapterId],
              lessons: nextLessons.map((l) => updatedMap.get(l.id) || l),
            },
          }));
        }
      } catch (err: unknown) {
        if (mountedRef.current) {
          setLessonsByChapter((prev) => ({
            ...prev,
            [chapterId]: {
              ...prev[chapterId],
              lessons: initial,
            },
          }));
          const msg = extractErrorMessage(
            err,
            'Échec du réordonnancement des leçons.'
          );
          setReorderError(msg);
          setLiveAnnouncement(`Erreur : ${msg}`);
        }
      }
    }
  };

  const handleLessonDragEnd = () => {
    setOverLessonState(null);
    draggedLessonIdRef.current = null;
  };

  // ================= LESSON PUBLISH / UNPUBLISH =================

  const handlePublishLesson = async (lesson: PublisherLessonItem) => {
    if (!isPublisher || publishingLessonId) return;
    setPublishingLessonId(lesson.id);
    setCourseError(null);
    try {
      const updated = await publishLesson(lesson.id);
      if (!mountedRef.current) return;
      setLessonsByChapter((prev) => {
        const next = { ...prev };
        for (const [chapId, state] of Object.entries(next)) {
          if (state.lessons.some((l) => l.id === lesson.id)) {
            next[chapId] = {
              ...state,
              lessons: state.lessons.map((l) =>
                l.id === lesson.id ? updated : l
              ),
            };
            break;
          }
        }
        return next;
      });
      setLiveAnnouncement(`La leçon "${lesson.title}" a été publiée avec succès.`);
    } catch (err: unknown) {
      if (!mountedRef.current) return;
      if (err instanceof ApiError) {
        if (err.envelope?.errors && Object.keys(err.envelope.errors).length > 0) {
          const FIELD_LABELS: Record<string, string> = {
            title: 'Titre',
            description: 'Description',
            teacher: 'Enseignant',
            course_date: 'Date du cours',
          };
          const missing = Object.keys(err.envelope.errors)
            .map((k) => FIELD_LABELS[k] || k)
            .join(', ');
          setCourseError(
            `Impossible de publier la leçon "${lesson.title}" : les champs suivants sont obligatoires : ${missing}.`
          );
        } else {
          setCourseError(
            err.envelope?.detail ||
              `Erreur lors de la publication de la leçon "${lesson.title}".`
          );
        }
      } else if (err instanceof Error) {
        setCourseError(err.message);
      } else {
        setCourseError(`Erreur inattendue lors de la publication de la leçon.`);
      }
    } finally {
      if (mountedRef.current) {
        setPublishingLessonId(null);
      }
    }
  };

  const handleUnpublishLesson = async (lesson: PublisherLessonItem) => {
    if (!isPublisher || publishingLessonId) return;
    setPublishingLessonId(lesson.id);
    setCourseError(null);
    try {
      const updated = await unpublishLesson(lesson.id);
      if (!mountedRef.current) return;
      setLessonsByChapter((prev) => {
        const next = { ...prev };
        for (const [chapId, state] of Object.entries(next)) {
          if (state.lessons.some((l) => l.id === lesson.id)) {
            next[chapId] = {
              ...state,
              lessons: state.lessons.map((l) =>
                l.id === lesson.id ? updated : l
              ),
            };
            break;
          }
        }
        return next;
      });
      setLiveAnnouncement(`La leçon "${lesson.title}" a été dépubliée avec succès.`);
    } catch (err: unknown) {
      if (!mountedRef.current) return;
      if (err instanceof ApiError) {
        setCourseError(
          err.envelope?.detail ||
            `Erreur lors de la dépublication de la leçon "${lesson.title}".`
        );
      } else if (err instanceof Error) {
        setCourseError(err.message);
      } else {
        setCourseError(`Erreur inattendue lors de la dépublication de la leçon.`);
      }
    } finally {
      if (mountedRef.current) {
        setPublishingLessonId(null);
      }
    }
  };

  // ================= MODAL HANDLERS =================

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
      setLessonsByChapter((prev) => {
        const next = { ...prev };
        delete next[deletedChap.id];
        return next;
      });
    }
  };

  // Callback on successful bulk publication commit
  const handleBulkPublishSuccess = useCallback(
    (_result: BulkPublishCommitResponse) => {
      if (!bulkPublishTarget) return;
      if (bulkPublishTarget.type === 'chapter') {
        loadLessonsForChapter(bulkPublishTarget.item.id);
      } else if (bulkPublishTarget.type === 'module') {
        const chapters = chaptersByModule[bulkPublishTarget.item.id]?.chapters || [];
        for (const chap of chapters) {
          loadLessonsForChapter(chap.id);
        }
      }
    },
    [bulkPublishTarget, chaptersByModule, loadLessonsForChapter]
  );

  return (
    <div
      data-testid="publisher-course-page"
      className="min-h-screen bg-background text-foreground flex flex-col min-w-[360px] w-full selection:bg-primary selection:text-primary-foreground"
    >
      <AppHeader />

      {/* Screen reader live region */}
      <SortableLiveRegion message={liveAnnouncement} />

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

        {/* Global Reorder Error Alert */}
        {reorderError && (
          <div
            role="alert"
            data-testid="reorder-error-alert"
            className="rounded-lg border border-destructive-border bg-destructive-surface p-4 flex items-center justify-between gap-3 text-destructive text-sm"
          >
            <div className="flex items-center gap-2">
              <AlertCircle className="h-4 w-4 shrink-0" aria-hidden="true" />
              <span data-testid="reorder-error-message">{reorderError}</span>
            </div>
            <Button
              type="button"
              variant="ghost"
              size="sm"
              onClick={() => setReorderError(null)}
              aria-label="Fermer l'alerte d'erreur"
              className="text-xs text-destructive hover:bg-destructive/10"
            >
              Fermer
            </Button>
          </div>
        )}

        {/* Course Error Alert */}
        {courseError && courseStatus === 'success' && (
          <div
            role="alert"
            data-testid="course-error-alert"
            className="rounded-lg border border-destructive-border bg-destructive-surface p-4 flex items-center justify-between gap-3 text-destructive text-sm"
          >
            <div className="flex items-center gap-2">
              <AlertCircle className="h-4 w-4 shrink-0" aria-hidden="true" />
              <span data-testid="course-error-message">{courseError}</span>
            </div>
            <Button
              type="button"
              variant="ghost"
              size="sm"
              onClick={() => setCourseError(null)}
              aria-label="Fermer l'alerte d'erreur"
              className="text-xs text-destructive hover:bg-destructive/10"
            >
              Fermer
            </Button>
          </div>
        )}

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
                  <SortableItem
                    key={mod.id}
                    id={mod.id}
                    name={mod.name}
                    index={index}
                    total={modules.length}
                    disabled={mod.is_deleted}
                    isGrabbed={grabbedModuleId === mod.id}
                    isOver={overModuleIndex === index}
                    onPickUp={() => handleModulePickUp(mod, index)}
                    onCommit={() => handleModuleCommit(mod)}
                    onCancel={handleModuleCancel}
                    onMoveUp={() => handleModuleMove(index, 'up')}
                    onMoveDown={() => handleModuleMove(index, 'down')}
                    onDragStart={(e) => handleModuleDragStart(mod, index, e)}
                    onDragOver={() => handleModuleDragOver(index)}
                    onDrop={(e) => handleModuleDrop(index, mod, e)}
                    onDragEnd={handleModuleDragEnd}
                    data-testid={`publisher-module-card-${mod.id}`}
                    className="rounded-lg border border-border bg-card p-5 space-y-4 shadow-sm"
                  >
                    {/* Module Header Bar */}
                    <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 pb-3 border-b border-border/70">
                      <div className="flex items-center gap-2.5 min-w-0">
                        <SortableHandle testId={`drag-handle-${mod.id}`} />
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
                          data-testid={`bulk-publish-module-btn-${mod.id}`}
                          disabled={!isPublisher || Boolean(mod.is_deleted)}
                          onClick={() => {
                            if (!isPublisher || mod.is_deleted) return;
                            setBulkPublishTarget({
                              type: 'module',
                              item: { id: mod.id, name: mod.name },
                            });
                          }}
                          aria-label={`Publier le module en masse ${mod.name}`}
                          className="min-h-[44px] min-w-[44px] text-xs font-medium border-border inline-flex items-center gap-1.5"
                        >
                          <Globe className="h-3.5 w-3.5" />
                          <span className="sr-only sm:not-sr-only">Publier en masse</span>
                        </Button>

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
                          {chapters.map((chap, chapIndex) => {
                            const isExpanded = !!expandedChapters[chap.id];
                            const lessonState = lessonsByChapter[chap.id];
                            const lessons = lessonState?.lessons || [];

                            return (
                              <SortableItem
                                key={chap.id}
                                id={chap.id}
                                name={chap.name}
                                index={chapIndex}
                                total={chapters.length}
                                disabled={chap.is_deleted}
                                isGrabbed={grabbedChapterId === chap.id}
                                isOver={
                                  overChapterState?.moduleId === mod.id &&
                                  overChapterState.index === chapIndex
                                }
                                onPickUp={() =>
                                  handleChapterPickUp(mod.id, chap, chapIndex)
                                }
                                onCommit={() => handleChapterCommit(mod.id, chap)}
                                onCancel={() => handleChapterCancel(mod.id)}
                                onMoveUp={() =>
                                  handleChapterMove(mod.id, chapIndex, 'up')
                                }
                                onMoveDown={() =>
                                  handleChapterMove(mod.id, chapIndex, 'down')
                                }
                                onDragStart={(e) =>
                                  handleChapterDragStart(mod.id, chap, chapIndex, e)
                                }
                                onDragOver={() =>
                                  handleChapterDragOver(mod.id, chapIndex)
                                }
                                onDrop={(e) =>
                                  handleChapterDrop(mod.id, chapIndex, chap, e)
                                }
                                onDragEnd={handleChapterDragEnd}
                                data-testid={`publisher-chapter-item-${chap.id}`}
                                className="p-3 flex flex-col gap-2 hover:bg-surface/50 transition-colors"
                              >
                                <div className="flex items-center justify-between gap-3 w-full">
                                  <div className="flex items-center gap-2 min-w-0">
                                    <SortableHandle testId={`drag-handle-${chap.id}`} />
                                    <Button
                                      type="button"
                                      variant="ghost"
                                      size="sm"
                                      data-testid={`expand-chapter-btn-${chap.id}`}
                                      onClick={() => toggleChapterExpand(chap.id)}
                                      aria-expanded={isExpanded}
                                      aria-label={
                                        isExpanded
                                          ? `Masquer les leçons de ${chap.name}`
                                          : `Afficher les leçons de ${chap.name}`
                                      }
                                      className="p-1 h-7 w-7 text-foreground-muted hover:text-foreground inline-flex items-center justify-center shrink-0"
                                    >
                                      {isExpanded ? (
                                        <ChevronDown className="h-4 w-4" />
                                      ) : (
                                        <ChevronRight className="h-4 w-4" />
                                      )}
                                    </Button>
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
                                      data-testid={`bulk-publish-chapter-btn-${chap.id}`}
                                      disabled={!isPublisher || Boolean(chap.is_deleted)}
                                      onClick={(e) => {
                                        e.stopPropagation();
                                        if (!isPublisher || chap.is_deleted) return;
                                        setBulkPublishTarget({
                                          type: 'chapter',
                                          item: { id: chap.id, name: chap.name },
                                        });
                                      }}
                                      aria-label={`Publier le chapitre en masse ${chap.name}`}
                                      className="min-h-[44px] min-w-[44px] text-xs hover:bg-surface text-foreground-muted hover:text-foreground inline-flex items-center gap-1"
                                    >
                                      <Globe className="h-3.5 w-3.5" />
                                      <span className="sr-only sm:not-sr-only">Publier en masse</span>
                                    </Button>

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

                                {/* Expandable Lessons section */}
                                {isExpanded && (
                                  <div className="pl-6 pt-2 pb-1 space-y-2 border-t border-border/40">
                                    {lessonState?.status === 'loading' && (
                                      <div
                                        data-testid={`lessons-loading-${chap.id}`}
                                        className="text-xs text-foreground-muted py-2 animate-pulse"
                                      >
                                        Chargement des leçons...
                                      </div>
                                    )}

                                    {lessonState?.status === 'error' && (
                                      <div
                                        role="alert"
                                        data-testid={`lessons-error-${chap.id}`}
                                        className="flex items-center justify-between text-xs text-destructive py-2 px-3 bg-destructive-surface rounded border border-destructive-border"
                                      >
                                        <span>
                                          {lessonState.error ||
                                            'Erreur lors du chargement des leçons.'}
                                        </span>
                                        <Button
                                          type="button"
                                          variant="outline"
                                          size="sm"
                                          data-testid={`retry-lessons-btn-${chap.id}`}
                                          onClick={() => loadLessonsForChapter(chap.id)}
                                          className="text-xs border-destructive-border"
                                        >
                                          Réessayer
                                        </Button>
                                      </div>
                                    )}

                                    {lessonState?.status === 'success' &&
                                      lessons.length === 0 && (
                                        <div
                                          data-testid={`lessons-empty-${chap.id}`}
                                          className="text-xs text-foreground-muted py-2 italic"
                                        >
                                          Aucune leçon dans ce chapitre.
                                        </div>
                                      )}

                                    {lessonState?.status === 'success' &&
                                      lessons.length > 0 && (
                                        <div
                                          data-testid={`lessons-list-${chap.id}`}
                                          className="divide-y divide-border/30 rounded-md border border-border/40 bg-surface/30 overflow-hidden"
                                        >
                                          {lessons.map((lesson, lessonIndex) => (
                                            <SortableItem
                                              key={lesson.id}
                                              id={lesson.id}
                                              name={lesson.title}
                                              index={lessonIndex}
                                              total={lessons.length}
                                              disabled={lesson.is_deleted}
                                              isGrabbed={grabbedLessonId === lesson.id}
                                              isOver={
                                                overLessonState?.chapterId === chap.id &&
                                                overLessonState.index === lessonIndex
                                              }
                                              onPickUp={() =>
                                                handleLessonPickUp(
                                                  chap.id,
                                                  lesson,
                                                  lessonIndex
                                                )
                                              }
                                              onCommit={() =>
                                                handleLessonCommit(chap.id, lesson)
                                              }
                                              onCancel={() =>
                                                handleLessonCancel(chap.id)
                                              }
                                              onMoveUp={() =>
                                                handleLessonMove(
                                                  chap.id,
                                                  lessonIndex,
                                                  'up'
                                                )
                                              }
                                              onMoveDown={() =>
                                                handleLessonMove(
                                                  chap.id,
                                                  lessonIndex,
                                                  'down'
                                                )
                                              }
                                              onDragStart={(e) =>
                                                handleLessonDragStart(
                                                  chap.id,
                                                  lesson,
                                                  lessonIndex,
                                                  e
                                                )
                                              }
                                              onDragOver={() =>
                                                handleLessonDragOver(
                                                  chap.id,
                                                  lessonIndex
                                                )
                                              }
                                              onDrop={(e) =>
                                                handleLessonDrop(
                                                  chap.id,
                                                  lessonIndex,
                                                  lesson,
                                                  e
                                                )
                                              }
                                              onDragEnd={handleLessonDragEnd}
                                              data-testid={`publisher-lesson-item-${lesson.id}`}
                                              className="p-2.5 flex items-center justify-between gap-3 hover:bg-surface transition-colors"
                                            >
                                              <div className="flex items-center gap-2 min-w-0">
                                                <SortableHandle
                                                  testId={`drag-handle-${lesson.id}`}
                                                />
                                                <BookOpen
                                                  className="h-3.5 w-3.5 text-foreground-muted shrink-0"
                                                  aria-hidden="true"
                                                />
                                                <span className="text-xs font-mono text-foreground-muted shrink-0">
                                                  {index + 1}.{chapIndex + 1}.
                                                  {lessonIndex + 1}
                                                </span>
                                                <span
                                                  data-testid={`lesson-title-${lesson.id}`}
                                                  className="text-xs sm:text-sm font-medium text-foreground truncate"
                                                >
                                                  {lesson.title}
                                                </span>
                                                {lesson.is_deleted && (
                                                  <span
                                                    data-testid={`lesson-deleted-badge-${lesson.id}`}
                                                    className="px-1.5 py-0.5 rounded text-[10px] font-medium bg-[#251719] text-[#F85149] border border-[#DA3633] shrink-0"
                                                  >
                                                    Supprimé
                                                  </span>
                                                )}
                                                {lesson.is_published ? (
                                                  <span
                                                    data-testid={`lesson-published-badge-${lesson.id}`}
                                                    className="px-1.5 py-0.5 rounded text-[10px] font-medium bg-[#1F3A24] text-[#3FB950] border border-[#238636] shrink-0"
                                                  >
                                                    Publié
                                                  </span>
                                                ) : (
                                                  <span
                                                    data-testid={`lesson-draft-badge-${lesson.id}`}
                                                    className="px-1.5 py-0.5 rounded text-[10px] font-medium bg-[#2C1F03] text-[#D29922] border border-[#9E6A03] shrink-0"
                                                  >
                                                    Brouillon
                                                  </span>
                                                )}
                                              </div>
                                              <div className="flex items-center gap-2 shrink-0">
                                                <div className="text-[11px] text-foreground-muted font-mono shrink-0">
                                                  {lesson.teacher}
                                                </div>
                                                {lesson.is_published ? (
                                                  <Button
                                                    type="button"
                                                    variant="ghost"
                                                    size="sm"
                                                    data-testid={`unpublish-lesson-btn-${lesson.id}`}
                                                    disabled={Boolean(publishingLessonId) || !isPublisher}
                                                    onClick={(e) => {
                                                      e.stopPropagation();
                                                      handleUnpublishLesson(lesson);
                                                    }}
                                                    aria-label={`Dépublier la leçon ${lesson.title}`}
                                                    className="min-h-[44px] min-w-[44px] text-xs hover:bg-surface text-amber-500 hover:text-amber-400 inline-flex items-center justify-center"
                                                  >
                                                    {publishingLessonId === lesson.id ? (
                                                      <Loader2 className="h-3.5 w-3.5 animate-spin" />
                                                    ) : (
                                                      <EyeOff className="h-3.5 w-3.5" />
                                                    )}
                                                  </Button>
                                                ) : (
                                                  <Button
                                                    type="button"
                                                    variant="ghost"
                                                    size="sm"
                                                    data-testid={`publish-lesson-btn-${lesson.id}`}
                                                    disabled={Boolean(publishingLessonId) || !isPublisher}
                                                    onClick={(e) => {
                                                      e.stopPropagation();
                                                      handlePublishLesson(lesson);
                                                    }}
                                                    aria-label={`Publier la leçon ${lesson.title}`}
                                                    className="min-h-[44px] min-w-[44px] text-xs hover:bg-surface text-[#3FB950] hover:text-[#2ea043] inline-flex items-center justify-center"
                                                  >
                                                    {publishingLessonId === lesson.id ? (
                                                      <Loader2 className="h-3.5 w-3.5 animate-spin" />
                                                    ) : (
                                                      <Globe className="h-3.5 w-3.5" />
                                                    )}
                                                  </Button>
                                                )}
                                                <Button
                                                  type="button"
                                                  variant="ghost"
                                                  size="sm"
                                                  data-testid={`edit-lesson-btn-${lesson.id}`}
                                                  onClick={(e) => {
                                                    e.stopPropagation();
                                                    navigate(`/publisher/lessons/${lesson.id}`);
                                                  }}
                                                  aria-label={`Modifier la leçon ${lesson.title}`}
                                                  className="min-h-[44px] min-w-[44px] text-xs hover:bg-surface text-foreground-muted hover:text-foreground inline-flex items-center justify-center"
                                                >
                                                  <Pencil className="h-3.5 w-3.5" />
                                                </Button>
                                              </div>
                                            </SortableItem>
                                          ))}
                                        </div>
                                      )}
                                  </div>
                                )}
                              </SortableItem>
                            );
                          })}
                        </div>
                      )}
                    </div>
                  </SortableItem>
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

      {/* Bulk Publish Inspection Modal */}
      <BulkPublishModal
        isOpen={Boolean(bulkPublishTarget)}
        onClose={() => setBulkPublishTarget(null)}
        type={bulkPublishTarget?.type ?? 'module'}
        item={bulkPublishTarget?.item ?? null}
        onSuccess={handleBulkPublishSuccess}
      />
    </div>
  );
}

export default PublisherCoursePage;
