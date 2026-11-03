import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { render, screen, waitFor, fireEvent } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { MemoryRouter } from 'react-router-dom';
import { useAuthStore } from '@/features/auth/auth-store';
import { AppRoutes } from '@/routes';
import {
  PublisherTrashPage,
  RestoreConfirmationModal,
  fetchTrashItems,
  restoreCourse,
  restoreModule,
  restoreChapter,
  restoreLesson,
  restoreResource,
  restoreTrashItem,
} from './index';
import type {
  PublisherCourseItem,
  PublisherModuleItem,
  PublisherChapterItem,
  PublisherLessonItem,
  PublisherResourceItem,
  TrashItem,
  PaginatedPublisherResponse,
} from './types';

// Mock Data
const mockDeletedCourse: PublisherCourseItem = {
  id: 'c1111111-1111-1111-1111-111111111111',
  name: 'Intelligence Artificielle Avancée',
  subject: 'Informatique',
  position: 1,
  is_deleted: true,
  is_published: false,
  last_modified_by: {
    id: 'u1111111-1111-1111-1111-111111111111',
    email: 'alex.curator@brainx.edu',
  },
  updated_at: '2026-10-25T14:00:00Z',
};

const mockActiveCourse: PublisherCourseItem = {
  id: 'c2222222-2222-2222-2222-222222222222',
  name: 'Algorithmique & Structures de Données',
  subject: 'Informatique Fondamentale',
  position: 2,
  is_deleted: false,
  is_published: true,
  last_modified_by: {
    id: 'u2222222-2222-2222-2222-222222222222',
    email: 'marie.editor@brainx.edu',
  },
  updated_at: '2026-10-28T09:00:00Z',
};

const mockDeletedModule: PublisherModuleItem = {
  id: 'm1111111-1111-1111-1111-111111111111',
  name: 'Module Obsolète : Arbres Binaires',
  position: 1,
  is_deleted: true,
  last_modified_by: {
    id: 'u2222222-2222-2222-2222-222222222222',
    email: 'marie.editor@brainx.edu',
  },
  updated_at: '2026-10-26T11:00:00Z',
};

const mockActiveModule: PublisherModuleItem = {
  id: 'm2222222-2222-2222-2222-222222222222',
  name: 'Module Actif : Graphes & Flots',
  position: 2,
  is_deleted: false,
  last_modified_by: {
    id: 'u1111111-1111-1111-1111-111111111111',
    email: 'alex.curator@brainx.edu',
  },
  updated_at: '2026-10-27T10:00:00Z',
};

const mockDeletedChapter: PublisherChapterItem = {
  id: 'ch111111-1111-1111-1111-111111111111',
  name: 'Chapitre Archivé : Algorithme de Dijkstra',
  position: 1,
  is_deleted: true,
  last_modified_by: {
    id: 'u1111111-1111-1111-1111-111111111111',
    email: 'alex.curator@brainx.edu',
  },
  updated_at: '2026-10-27T12:00:00Z',
};

const mockActiveChapter: PublisherChapterItem = {
  id: 'ch222222-2222-2222-2222-222222222222',
  name: 'Chapitre Actif : Algorithme A*',
  position: 2,
  is_deleted: false,
  last_modified_by: {
    id: 'u1111111-1111-1111-1111-111111111111',
    email: 'alex.curator@brainx.edu',
  },
  updated_at: '2026-10-27T13:00:00Z',
};

const mockDeletedLesson: PublisherLessonItem = {
  id: 'l1111111-1111-1111-1111-111111111111',
  title: 'Leçon Supprimée : Complexité Temporelle',
  description: 'Ancienne version du cours de complexité.',
  teacher: 'Prof. Turing',
  course_date: '2026-10-15',
  position: 1,
  is_deleted: true,
  last_modified_by: {
    id: 'u2222222-2222-2222-2222-222222222222',
    email: 'marie.editor@brainx.edu',
  },
  updated_at: '2026-10-29T15:00:00Z',
};

const mockActiveLesson: PublisherLessonItem = {
  id: 'l2222222-2222-2222-2222-222222222222',
  title: 'Leçon Active : Heuristiques Admissibles',
  description: 'Démonstration des heuristiques consistency.',
  teacher: 'Prof. Turing',
  course_date: '2026-10-16',
  position: 2,
  is_deleted: false,
  last_modified_by: {
    id: 'u1111111-1111-1111-1111-111111111111',
    email: 'alex.curator@brainx.edu',
  },
  updated_at: '2026-10-29T16:00:00Z',
};

const mockDeletedResource: PublisherResourceItem = {
  id: 'r1111111-1111-1111-1111-111111111111',
  type: 'document',
  title: 'Polycopié Ancien Format PDF',
  note: 'Document remplacé par la v2.',
  url: null,
  is_deleted: true,
  last_modified_by: {
    id: 'u1111111-1111-1111-1111-111111111111',
    email: 'alex.curator@brainx.edu',
  },
  updated_at: '2026-10-30T17:00:00Z',
};

const mockActiveResource: PublisherResourceItem = {
  id: 'r2222222-2222-2222-2222-222222222222',
  type: 'video',
  title: 'Enregistrement Vidéo Séminaire',
  note: 'Vidéo officielle.',
  url: 'https://video.example.com/a-star',
  is_deleted: false,
  last_modified_by: {
    id: 'u1111111-1111-1111-1111-111111111111',
    email: 'alex.curator@brainx.edu',
  },
  updated_at: '2026-10-30T18:00:00Z',
};

function setupPublisherAuth() {
  useAuthStore.getState().setTokens({
    access: 'valid-publisher-token',
    refresh: 'valid-refresh-token',
  });
  useAuthStore.getState().setUser({
    id: 'u1111111-1111-1111-1111-111111111111',
    email: 'alex.curator@brainx.edu',
    is_publisher: true,
  });
  useAuthStore.getState().setIsPublisher(true);
}

function setupStudentAuth() {
  useAuthStore.getState().setTokens({
    access: 'valid-student-token',
    refresh: 'valid-refresh-token',
  });
  useAuthStore.getState().setUser({
    id: 'u9999999-9999-9999-9999-999999999999',
    email: 'student@brainx.edu',
    is_publisher: false,
  });
  useAuthStore.getState().setIsPublisher(false);
}

describe('Story FE-4.6: Espace Corbeille & Restauration de Contenu (/publisher/trash)', () => {
  const originalFetch = globalThis.fetch;

  beforeEach(() => {
    vi.restoreAllMocks();
    useAuthStore.getState().clearAuth();
    window.localStorage?.clear();
  });

  afterEach(() => {
    globalThis.fetch = originalFetch;
  });

  // ===========================================================================
  // 1. API Restore Functions & Traversal Aggregator Unit Tests
  // ===========================================================================
  describe('API Restore Functions & Hierarchy Aggregator', () => {
    it('restoreCourse calls POST /api/v1/courses/:id/restore/', async () => {
      const mockFetch = vi.fn().mockResolvedValue({
        ok: true,
        status: 200,
        headers: new Headers({ 'content-type': 'application/json' }),
        text: async () => JSON.stringify({ ...mockDeletedCourse, is_deleted: false }),
      });
      globalThis.fetch = mockFetch;

      const res = await restoreCourse(mockDeletedCourse.id);
      expect(res.id).toBe(mockDeletedCourse.id);
      expect(mockFetch).toHaveBeenCalledWith(
        expect.stringContaining(`/api/v1/courses/${mockDeletedCourse.id}/restore/`),
        expect.objectContaining({ method: 'POST' })
      );
    });

    it('restoreModule calls POST /api/v1/modules/:id/restore/', async () => {
      const mockFetch = vi.fn().mockResolvedValue({
        ok: true,
        status: 200,
        headers: new Headers({ 'content-type': 'application/json' }),
        text: async () => JSON.stringify({ ...mockDeletedModule, is_deleted: false }),
      });
      globalThis.fetch = mockFetch;

      const res = await restoreModule(mockDeletedModule.id);
      expect(res.id).toBe(mockDeletedModule.id);
      expect(mockFetch).toHaveBeenCalledWith(
        expect.stringContaining(`/api/v1/modules/${mockDeletedModule.id}/restore/`),
        expect.objectContaining({ method: 'POST' })
      );
    });

    it('restoreChapter calls POST /api/v1/chapters/:id/restore/', async () => {
      const mockFetch = vi.fn().mockResolvedValue({
        ok: true,
        status: 200,
        headers: new Headers({ 'content-type': 'application/json' }),
        text: async () => JSON.stringify({ ...mockDeletedChapter, is_deleted: false }),
      });
      globalThis.fetch = mockFetch;

      const res = await restoreChapter(mockDeletedChapter.id);
      expect(res.id).toBe(mockDeletedChapter.id);
      expect(mockFetch).toHaveBeenCalledWith(
        expect.stringContaining(`/api/v1/chapters/${mockDeletedChapter.id}/restore/`),
        expect.objectContaining({ method: 'POST' })
      );
    });

    it('restoreLesson calls POST /api/v1/lessons/:id/restore/', async () => {
      const mockFetch = vi.fn().mockResolvedValue({
        ok: true,
        status: 200,
        headers: new Headers({ 'content-type': 'application/json' }),
        text: async () => JSON.stringify({ ...mockDeletedLesson, is_deleted: false }),
      });
      globalThis.fetch = mockFetch;

      const res = await restoreLesson(mockDeletedLesson.id);
      expect(res.id).toBe(mockDeletedLesson.id);
      expect(mockFetch).toHaveBeenCalledWith(
        expect.stringContaining(`/api/v1/lessons/${mockDeletedLesson.id}/restore/`),
        expect.objectContaining({ method: 'POST' })
      );
    });

    it('restoreResource calls POST /api/v1/resources/:id/restore/', async () => {
      const mockFetch = vi.fn().mockResolvedValue({
        ok: true,
        status: 200,
        headers: new Headers({ 'content-type': 'application/json' }),
        text: async () => JSON.stringify({ ...mockDeletedResource, is_deleted: false }),
      });
      globalThis.fetch = mockFetch;

      const res = await restoreResource(mockDeletedResource.id);
      expect(res.id).toBe(mockDeletedResource.id);
      expect(mockFetch).toHaveBeenCalledWith(
        expect.stringContaining(`/api/v1/resources/${mockDeletedResource.id}/restore/`),
        expect.objectContaining({ method: 'POST' })
      );
    });

    it('restoreTrashItem dispatches according to TrashItem.type', async () => {
      const mockFetch = vi.fn().mockResolvedValue({
        ok: true,
        status: 200,
        headers: new Headers({ 'content-type': 'application/json' }),
        text: async () => JSON.stringify({ success: true }),
      });
      globalThis.fetch = mockFetch;

      const trashCourse: TrashItem = {
        id: 'c1',
        type: 'course',
        name: 'Course',
        deleted_at: '2026-10-01',
        last_modified_by: null,
      };
      await restoreTrashItem(trashCourse);
      expect(mockFetch).toHaveBeenCalledWith(
        expect.stringContaining('/api/v1/courses/c1/restore/'),
        expect.anything()
      );

      const trashLesson: TrashItem = {
        id: 'l1',
        type: 'lesson',
        name: 'Lesson',
        deleted_at: '2026-10-01',
        last_modified_by: null,
      };
      await restoreTrashItem(trashLesson);
      expect(mockFetch).toHaveBeenCalledWith(
        expect.stringContaining('/api/v1/lessons/l1/restore/'),
        expect.anything()
      );

      const trashModule: TrashItem = {
        id: 'm1',
        type: 'module',
        name: 'Module',
        deleted_at: '2026-10-01',
        last_modified_by: null,
      };
      await restoreTrashItem(trashModule);
      expect(mockFetch).toHaveBeenCalledWith(
        expect.stringContaining('/api/v1/modules/m1/restore/'),
        expect.anything()
      );

      const trashChapter: TrashItem = {
        id: 'ch1',
        type: 'chapter',
        name: 'Chapter',
        deleted_at: '2026-10-01',
        last_modified_by: null,
      };
      await restoreTrashItem(trashChapter);
      expect(mockFetch).toHaveBeenCalledWith(
        expect.stringContaining('/api/v1/chapters/ch1/restore/'),
        expect.anything()
      );

      const trashResource: TrashItem = {
        id: 'r1',
        type: 'resource',
        name: 'Resource',
        deleted_at: '2026-10-01',
        last_modified_by: null,
      };
      await restoreTrashItem(trashResource);
      expect(mockFetch).toHaveBeenCalledWith(
        expect.stringContaining('/api/v1/resources/r1/restore/'),
        expect.anything()
      );

      // Throws error on invalid/null item
      await expect(restoreTrashItem(null as any)).rejects.toThrow(
        'Élément invalide pour la restauration'
      );
    });

    it('fetchTrashItems aggregates all soft-deleted items across hierarchy and sorts descending by date', async () => {
      const mockFetch = vi.fn().mockImplementation((url: string) => {
        // Courses
        if (url.includes('/api/v1/courses/')) {
          if (url.includes('/modules/')) {
            // Course 1 (deleted course) has no modules
            if (url.includes(mockDeletedCourse.id)) {
              return Promise.resolve({
                ok: true,
                status: 200,
                headers: new Headers({ 'content-type': 'application/json' }),
                text: async () => JSON.stringify({ count: 0, next: null, previous: null, results: [] }),
              });
            }
            // Course 2 has mockDeletedModule and mockActiveModule
            return Promise.resolve({
              ok: true,
              status: 200,
              headers: new Headers({ 'content-type': 'application/json' }),
              text: async () =>
                JSON.stringify({
                  count: 2,
                  next: null,
                  previous: null,
                  results: [mockDeletedModule, mockActiveModule],
                }),
            });
          }
          // Courses list
          return Promise.resolve({
            ok: true,
            status: 200,
            headers: new Headers({ 'content-type': 'application/json' }),
            text: async () =>
              JSON.stringify({
                count: 2,
                next: null,
                previous: null,
                results: [mockDeletedCourse, mockActiveCourse],
              }),
          });
        }

        // Modules -> Chapters
        if (url.includes('/api/v1/modules/')) {
          if (url.includes(mockActiveModule.id)) {
            return Promise.resolve({
              ok: true,
              status: 200,
              headers: new Headers({ 'content-type': 'application/json' }),
              text: async () =>
                JSON.stringify({
                  count: 2,
                  next: null,
                  previous: null,
                  results: [mockDeletedChapter, mockActiveChapter],
                }),
            });
          }
          return Promise.resolve({
            ok: true,
            status: 200,
            headers: new Headers({ 'content-type': 'application/json' }),
            text: async () => JSON.stringify({ count: 0, next: null, previous: null, results: [] }),
          });
        }

        // Chapters -> Lessons
        if (url.includes('/api/v1/chapters/')) {
          if (url.includes(mockActiveChapter.id)) {
            return Promise.resolve({
              ok: true,
              status: 200,
              headers: new Headers({ 'content-type': 'application/json' }),
              text: async () =>
                JSON.stringify({
                  count: 2,
                  next: null,
                  previous: null,
                  results: [mockDeletedLesson, mockActiveLesson],
                }),
            });
          }
          return Promise.resolve({
            ok: true,
            status: 200,
            headers: new Headers({ 'content-type': 'application/json' }),
            text: async () => JSON.stringify({ count: 0, next: null, previous: null, results: [] }),
          });
        }

        // Lessons -> Resources
        if (url.includes('/api/v1/lessons/')) {
          if (url.includes(mockActiveLesson.id)) {
            return Promise.resolve({
              ok: true,
              status: 200,
              headers: new Headers({ 'content-type': 'application/json' }),
              text: async () =>
                JSON.stringify({
                  count: 2,
                  next: null,
                  previous: null,
                  results: [mockDeletedResource, mockActiveResource],
                }),
            });
          }
          return Promise.resolve({
            ok: true,
            status: 200,
            headers: new Headers({ 'content-type': 'application/json' }),
            text: async () => JSON.stringify({ count: 0, next: null, previous: null, results: [] }),
          });
        }

        return Promise.reject(new Error(`Unhandled URL: ${url}`));
      });
      globalThis.fetch = mockFetch;

      const trashItems = await fetchTrashItems();

      // We expect 5 soft-deleted items: course, module, chapter, lesson, resource
      expect(trashItems).toHaveLength(5);
      const types = trashItems.map((i) => i.type);
      expect(types).toContain('course');
      expect(types).toContain('module');
      expect(types).toContain('chapter');
      expect(types).toContain('lesson');
      expect(types).toContain('resource');

      // Check sorting: descending by deleted_at (resource is 2026-10-30, lesson is 2026-10-29, etc.)
      expect(trashItems[0].type).toBe('resource');
      expect(trashItems[1].type).toBe('lesson');
      expect(trashItems[2].type).toBe('chapter');
      expect(trashItems[3].type).toBe('module');
      expect(trashItems[4].type).toBe('course');

      // Check parent paths
      const moduleItem = trashItems.find((i) => i.type === 'module');
      expect(moduleItem?.parent_path).toBe(`[Cours] ${mockActiveCourse.name}`);

      const chapterItem = trashItems.find((i) => i.type === 'chapter');
      expect(chapterItem?.parent_path).toBe(
        `[Cours] ${mockActiveCourse.name} > [Module] ${mockActiveModule.name}`
      );

      const lessonItem = trashItems.find((i) => i.type === 'lesson');
      expect(lessonItem?.parent_path).toBe(
        `[Cours] ${mockActiveCourse.name} > [Module] ${mockActiveModule.name} > [Chapitre] ${mockActiveChapter.name}`
      );

      const resourceItem = trashItems.find((i) => i.type === 'resource');
      expect(resourceItem?.parent_path).toBe(
        `[Cours] ${mockActiveCourse.name} > [Module] ${mockActiveModule.name} > [Chapitre] ${mockActiveChapter.name} > [Leçon] ${mockActiveLesson.title}`
      );
    });
  });

  // ===========================================================================
  // 2. Access Control & Route Guarding
  // ===========================================================================
  describe('Access Control & PublisherGuard Protection', () => {
    it('redirects unauthenticated visitor to /login?returnUrl=...', async () => {
      render(
        <MemoryRouter initialEntries={['/publisher/trash']}>
          <AppRoutes />
        </MemoryRouter>
      );

      await waitFor(() => {
        expect(screen.queryByTestId('publisher-trash-page')).not.toBeInTheDocument();
      });
      expect(screen.getByTestId('login-form')).toBeInTheDocument();
    });

    it('redirects authenticated non-publisher (student) to /courses', async () => {
      setupStudentAuth();

      render(
        <MemoryRouter initialEntries={['/publisher/trash']}>
          <AppRoutes />
        </MemoryRouter>
      );

      await waitFor(() => {
        expect(screen.queryByTestId('publisher-trash-page')).not.toBeInTheDocument();
      });
      // Should redirect to /courses
      expect(screen.getByTestId('courses-page')).toBeInTheDocument();
    });

    it('allows access to authenticated publisher', async () => {
      setupPublisherAuth();

      const mockFetch = vi.fn().mockResolvedValue({
        ok: true,
        status: 200,
        headers: new Headers({ 'content-type': 'application/json' }),
        text: async () => JSON.stringify({ count: 0, next: null, previous: null, results: [] }),
      });
      globalThis.fetch = mockFetch;

      render(
        <MemoryRouter initialEntries={['/publisher/trash']}>
          <AppRoutes />
        </MemoryRouter>
      );

      await waitFor(() => {
        expect(screen.getByTestId('publisher-trash-page')).toBeInTheDocument();
      });
    });
  });

  // ===========================================================================
  // 3. Trash Listing, Counts, and Empty State
  // ===========================================================================
  describe('Trash Listing & Empty State', () => {
    it('displays empty state illustration and link to dashboard when trash is empty', async () => {
      setupPublisherAuth();

      const mockFetch = vi.fn().mockImplementation((url: string) => {
        return Promise.resolve({
          ok: true,
          status: 200,
          headers: new Headers({ 'content-type': 'application/json' }),
          text: async () =>
            JSON.stringify({
              count: 1,
              next: null,
              previous: null,
              results: [mockActiveCourse], // No deleted items
            }),
        });
      });
      globalThis.fetch = mockFetch;

      render(
        <MemoryRouter initialEntries={['/publisher/trash']}>
          <AppRoutes />
        </MemoryRouter>
      );

      await waitFor(() => {
        expect(screen.getByTestId('trash-empty-state')).toBeInTheDocument();
      });

      expect(screen.getByText('La corbeille est vide')).toBeInTheDocument();
      expect(screen.getByTestId('empty-trash-back-link')).toBeInTheDocument();
      expect(screen.getByTestId('trash-count-badge')).toHaveTextContent('0 élément');
    });

    it('displays error banner with retry button if fetch fails', async () => {
      setupPublisherAuth();

      let attempts = 0;
      const mockFetch = vi.fn().mockImplementation(() => {
        attempts++;
        if (attempts === 1) {
          return Promise.resolve({
            ok: false,
            status: 500,
            headers: new Headers({ 'content-type': 'application/json' }),
            text: async () =>
              JSON.stringify({
                type: 'urn:brainx:error:internal',
                title: 'Erreur interne',
                status: 500,
                detail: 'Service momentanément indisponible',
                errors: {},
              }),
          });
        }
        // Second attempt succeeds with empty list
        return Promise.resolve({
          ok: true,
          status: 200,
          headers: new Headers({ 'content-type': 'application/json' }),
          text: async () => JSON.stringify({ count: 0, next: null, previous: null, results: [] }),
        });
      });
      globalThis.fetch = mockFetch;

      render(
        <MemoryRouter initialEntries={['/publisher/trash']}>
          <AppRoutes />
        </MemoryRouter>
      );

      // Check error banner
      await waitFor(() => {
        expect(screen.getByTestId('trash-error-banner')).toBeInTheDocument();
      });
      expect(screen.getByText('Service momentanément indisponible')).toBeInTheDocument();

      // Click retry
      const retryBtn = screen.getByTestId('trash-retry-btn');
      fireEvent.click(retryBtn);

      await waitFor(() => {
        expect(screen.getByTestId('trash-empty-state')).toBeInTheDocument();
      });
      expect(attempts).toBeGreaterThanOrEqual(2);
    });

    it('displays soft-deleted items with names, badges, dates, and authors', async () => {
      setupPublisherAuth();

      const mockFetch = vi.fn().mockImplementation((url: string) => {
        if (url.includes('/modules/')) {
          return Promise.resolve({
            ok: true,
            status: 200,
            headers: new Headers({ 'content-type': 'application/json' }),
            text: async () => JSON.stringify({ count: 0, next: null, previous: null, results: [] }),
          });
        }
        if (url.includes('/api/v1/courses/')) {
          return Promise.resolve({
            ok: true,
            status: 200,
            headers: new Headers({ 'content-type': 'application/json' }),
            text: async () =>
              JSON.stringify({
                count: 1,
                next: null,
                previous: null,
                results: [mockDeletedCourse],
              }),
          });
        }
        return Promise.resolve({
          ok: true,
          status: 200,
          headers: new Headers({ 'content-type': 'application/json' }),
          text: async () => JSON.stringify({ count: 0, next: null, previous: null, results: [] }),
        });
      });
      globalThis.fetch = mockFetch;

      render(
        <MemoryRouter initialEntries={['/publisher/trash']}>
          <AppRoutes />
        </MemoryRouter>
      );

      await waitFor(() => {
        expect(screen.getByTestId(`trash-item-${mockDeletedCourse.id}`)).toBeInTheDocument();
      });

      expect(screen.getByText(mockDeletedCourse.name)).toBeInTheDocument();
      expect(screen.getByTestId(`trash-item-badge-${mockDeletedCourse.id}`)).toHaveTextContent('Cours');
      expect(screen.getByText(/2026-10-25/)).toBeInTheDocument();
      expect(screen.getByText(new RegExp(mockDeletedCourse.last_modified_by!.email))).toBeInTheDocument();
      expect(screen.getByTestId(`restore-btn-${mockDeletedCourse.id}`)).toBeInTheDocument();
      expect(screen.getByTestId('trash-count-badge')).toHaveTextContent('1 élément');
    });
  });

  // ===========================================================================
  // 4. Filtering and Search
  // ===========================================================================
  describe('Filtering and Search Interactions', () => {
    function setupHierarchicalTrashMock() {
      const mockFetch = vi.fn().mockImplementation((url: string) => {
        if (url.includes('/api/v1/courses/')) {
          if (url.includes('/modules/')) {
            if (url.includes(mockActiveCourse.id)) {
              return Promise.resolve({
                ok: true,
                status: 200,
                headers: new Headers({ 'content-type': 'application/json' }),
                text: async () =>
                  JSON.stringify({
                    count: 1,
                    next: null,
                    previous: null,
                    results: [mockDeletedModule],
                  }),
              });
            }
            return Promise.resolve({
              ok: true,
              status: 200,
              headers: new Headers({ 'content-type': 'application/json' }),
              text: async () => JSON.stringify({ count: 0, next: null, previous: null, results: [] }),
            });
          }
          return Promise.resolve({
            ok: true,
            status: 200,
            headers: new Headers({ 'content-type': 'application/json' }),
            text: async () =>
              JSON.stringify({
                count: 2,
                next: null,
                previous: null,
                results: [mockDeletedCourse, mockActiveCourse],
              }),
          });
        }
        return Promise.resolve({
          ok: true,
          status: 200,
          headers: new Headers({ 'content-type': 'application/json' }),
          text: async () => JSON.stringify({ count: 0, next: null, previous: null, results: [] }),
        });
      });
      globalThis.fetch = mockFetch;
      return mockFetch;
    }

    it('filters items by type tabs and shows no-results when none match', async () => {
      setupPublisherAuth();
      setupHierarchicalTrashMock();

      render(
        <MemoryRouter initialEntries={['/publisher/trash']}>
          <AppRoutes />
        </MemoryRouter>
      );

      // Initially both course and module are shown
      await waitFor(() => {
        expect(screen.getByTestId(`trash-item-${mockDeletedCourse.id}`)).toBeInTheDocument();
        expect(screen.getByTestId(`trash-item-${mockDeletedModule.id}`)).toBeInTheDocument();
      });

      // Filter by "Cours"
      fireEvent.click(screen.getByTestId('trash-filter-course'));
      expect(screen.getByTestId(`trash-item-${mockDeletedCourse.id}`)).toBeInTheDocument();
      expect(screen.queryByTestId(`trash-item-${mockDeletedModule.id}`)).not.toBeInTheDocument();

      // Filter by "Modules"
      fireEvent.click(screen.getByTestId('trash-filter-module'));
      expect(screen.queryByTestId(`trash-item-${mockDeletedCourse.id}`)).not.toBeInTheDocument();
      expect(screen.getByTestId(`trash-item-${mockDeletedModule.id}`)).toBeInTheDocument();

      // Filter by "Leçons" (0 items)
      fireEvent.click(screen.getByTestId('trash-filter-lesson'));
      expect(screen.queryByTestId(`trash-item-${mockDeletedCourse.id}`)).not.toBeInTheDocument();
      expect(screen.queryByTestId(`trash-item-${mockDeletedModule.id}`)).not.toBeInTheDocument();
      expect(screen.getByTestId('trash-no-results')).toBeInTheDocument();
      expect(screen.getByText('Aucun élément de ce type dans la corbeille')).toBeInTheDocument();

      // Back to "Tous"
      fireEvent.click(screen.getByTestId('trash-filter-all'));
      expect(screen.getByTestId(`trash-item-${mockDeletedCourse.id}`)).toBeInTheDocument();
      expect(screen.getByTestId(`trash-item-${mockDeletedModule.id}`)).toBeInTheDocument();
    });

    it('matches search query with diacritic and accent insensitivity', async () => {
      setupPublisherAuth();
      const mockFetch = vi.fn().mockImplementation((url: string) => {
        if (url.includes('/api/v1/courses/')) {
          if (url.includes('/modules/')) {
            return Promise.resolve({
              ok: true,
              status: 200,
              headers: new Headers({ 'content-type': 'application/json' }),
              text: async () => JSON.stringify({ count: 0, next: null, previous: null, results: [] }),
            });
          }
          return Promise.resolve({
            ok: true,
            status: 200,
            headers: new Headers({ 'content-type': 'application/json' }),
            text: async () =>
              JSON.stringify({
                count: 1,
                next: null,
                previous: null,
                results: [{ ...mockDeletedCourse, name: 'Algèbre Avancée' }],
              }),
          });
        }
        return Promise.resolve({
          ok: true,
          status: 200,
          headers: new Headers({ 'content-type': 'application/json' }),
          text: async () => JSON.stringify({ count: 0, next: null, previous: null, results: [] }),
        });
      });
      globalThis.fetch = mockFetch;

      const user = userEvent.setup();
      render(
        <MemoryRouter initialEntries={['/publisher/trash']}>
          <AppRoutes />
        </MemoryRouter>
      );

      await waitFor(() => {
        expect(screen.getByText('Algèbre Avancée')).toBeInTheDocument();
      });

      const searchInput = screen.getByTestId('trash-search-input');
      // Type unaccented 'algebre'
      await user.type(searchInput, 'algebre');

      expect(screen.getByText('Algèbre Avancée')).toBeInTheDocument();
    });

    it('filters items in real-time by search query matching name', async () => {
      setupPublisherAuth();
      setupHierarchicalTrashMock();

      const user = userEvent.setup();
      render(
        <MemoryRouter initialEntries={['/publisher/trash']}>
          <AppRoutes />
        </MemoryRouter>
      );

      await waitFor(() => {
        expect(screen.getByTestId(`trash-item-${mockDeletedCourse.id}`)).toBeInTheDocument();
      });

      const searchInput = screen.getByTestId('trash-search-input');
      await user.type(searchInput, 'Intelligence');

      expect(screen.getByTestId(`trash-item-${mockDeletedCourse.id}`)).toBeInTheDocument();
      expect(screen.queryByTestId(`trash-item-${mockDeletedModule.id}`)).not.toBeInTheDocument();

      // Search matching nothing
      await user.clear(searchInput);
      await user.type(searchInput, 'NonExistentZzzz');

      expect(screen.getByTestId('trash-no-results')).toBeInTheDocument();
      expect(screen.getByText('Aucun résultat trouvé')).toBeInTheDocument();

      // Clear search via clear button
      const clearBtn = screen.getByTestId('trash-clear-search-btn');
      fireEvent.click(clearBtn);

      expect(screen.getByTestId(`trash-item-${mockDeletedCourse.id}`)).toBeInTheDocument();
      expect(screen.getByTestId(`trash-item-${mockDeletedModule.id}`)).toBeInTheDocument();
    });
  });

  // ===========================================================================
  // 5. Restore Modal, Confirmation & Error Handling
  // ===========================================================================
  describe('Restore Confirmation & Execution', () => {
    it('opens confirmation modal on clicking Restaurer and cancels without network request', async () => {
      setupPublisherAuth();

      const mockFetch = vi.fn().mockImplementation((url: string) => {
        if (url.includes('/modules/')) {
          return Promise.resolve({
            ok: true,
            status: 200,
            headers: new Headers({ 'content-type': 'application/json' }),
            text: async () => JSON.stringify({ count: 0, next: null, previous: null, results: [] }),
          });
        }
        if (url.includes('/api/v1/courses/')) {
          return Promise.resolve({
            ok: true,
            status: 200,
            headers: new Headers({ 'content-type': 'application/json' }),
            text: async () =>
              JSON.stringify({
                count: 1,
                next: null,
                previous: null,
                results: [mockDeletedCourse],
              }),
          });
        }
        return Promise.resolve({
          ok: true,
          status: 200,
          headers: new Headers({ 'content-type': 'application/json' }),
          text: async () => JSON.stringify({ count: 0, next: null, previous: null, results: [] }),
        });
      });
      globalThis.fetch = mockFetch;

      render(
        <MemoryRouter initialEntries={['/publisher/trash']}>
          <AppRoutes />
        </MemoryRouter>
      );

      await waitFor(() => {
        expect(screen.getByTestId(`restore-btn-${mockDeletedCourse.id}`)).toBeInTheDocument();
      });

      // Click restore button to open confirmation modal
      fireEvent.click(screen.getByTestId(`restore-btn-${mockDeletedCourse.id}`));

      expect(screen.getByTestId('restore-confirm-modal')).toBeInTheDocument();
      expect(screen.getByText('Confirmer la restauration')).toBeInTheDocument();
      expect(screen.getByTestId('restore-modal-type-badge')).toHaveTextContent('Cours');

      // Click cancel
      fireEvent.click(screen.getByTestId('restore-cancel-btn'));

      await waitFor(() => {
        expect(screen.queryByTestId('restore-confirm-modal')).not.toBeInTheDocument();
      });

      // Verify no restore POST request was made
      const restoreCalls = mockFetch.mock.calls.filter((call) =>
        call[0].includes('/restore/')
      );
      expect(restoreCalls).toHaveLength(0);

      // Item is still present
      expect(screen.getByTestId(`trash-item-${mockDeletedCourse.id}`)).toBeInTheDocument();
    });

    it('confirms restoration, calls POST .../restore/, removes item, and shows success alert', async () => {
      setupPublisherAuth();

      const mockFetch = vi.fn().mockImplementation((url: string, options?: RequestInit) => {
        if (url.includes(`/api/v1/courses/${mockDeletedCourse.id}/restore/`)) {
          expect(options?.method).toBe('POST');
          return Promise.resolve({
            ok: true,
            status: 200,
            headers: new Headers({ 'content-type': 'application/json' }),
            text: async () =>
              JSON.stringify({
                ...mockDeletedCourse,
                is_deleted: false,
              }),
          });
        }
        if (url.includes('/modules/')) {
          return Promise.resolve({
            ok: true,
            status: 200,
            headers: new Headers({ 'content-type': 'application/json' }),
            text: async () => JSON.stringify({ count: 0, next: null, previous: null, results: [] }),
          });
        }
        if (url.includes('/api/v1/courses/')) {
          return Promise.resolve({
            ok: true,
            status: 200,
            headers: new Headers({ 'content-type': 'application/json' }),
            text: async () =>
              JSON.stringify({
                count: 1,
                next: null,
                previous: null,
                results: [mockDeletedCourse],
              }),
          });
        }
        return Promise.resolve({
          ok: true,
          status: 200,
          headers: new Headers({ 'content-type': 'application/json' }),
          text: async () => JSON.stringify({ count: 0, next: null, previous: null, results: [] }),
        });
      });
      globalThis.fetch = mockFetch;

      render(
        <MemoryRouter initialEntries={['/publisher/trash']}>
          <AppRoutes />
        </MemoryRouter>
      );

      await waitFor(() => {
        expect(screen.getByTestId(`restore-btn-${mockDeletedCourse.id}`)).toBeInTheDocument();
      });

      // Open restore modal
      fireEvent.click(screen.getByTestId(`restore-btn-${mockDeletedCourse.id}`));
      expect(screen.getByTestId('restore-confirm-modal')).toBeInTheDocument();

      // Confirm restore
      fireEvent.click(screen.getByTestId('restore-confirm-btn'));

      // Modal closes, item is removed from view, success alert displayed
      await waitFor(() => {
        expect(screen.queryByTestId('restore-confirm-modal')).not.toBeInTheDocument();
      });

      expect(screen.getByTestId('trash-success-alert')).toBeInTheDocument();
      expect(screen.getByText('Élément restauré avec succès')).toBeInTheDocument();
      expect(screen.queryByTestId(`trash-item-${mockDeletedCourse.id}`)).not.toBeInTheDocument();

      // Trash is now empty
      expect(screen.getByTestId('trash-empty-state')).toBeInTheDocument();
      expect(screen.getByTestId('trash-count-badge')).toHaveTextContent('0 élément');

      // Dismiss success alert
      fireEvent.click(screen.getByTestId('trash-dismiss-success-btn'));
      expect(screen.queryByTestId('trash-success-alert')).not.toBeInTheDocument();
    });

    it('displays error in modal if restore API call fails and retains item', async () => {
      setupPublisherAuth();

      const mockFetch = vi.fn().mockImplementation((url: string) => {
        if (url.includes('/restore/')) {
          return Promise.resolve({
            ok: false,
            status: 409,
            headers: new Headers({ 'content-type': 'application/json' }),
            text: async () =>
              JSON.stringify({
                type: 'urn:brainx:error:conflict',
                title: 'Conflit de restauration',
                status: 409,
                detail: 'Impossible de restaurer un élément dont le conteneur parent est supprimé.',
                errors: {},
              }),
          });
        }
        if (url.includes('/modules/')) {
          return Promise.resolve({
            ok: true,
            status: 200,
            headers: new Headers({ 'content-type': 'application/json' }),
            text: async () => JSON.stringify({ count: 0, next: null, previous: null, results: [] }),
          });
        }
        if (url.includes('/api/v1/courses/')) {
          return Promise.resolve({
            ok: true,
            status: 200,
            headers: new Headers({ 'content-type': 'application/json' }),
            text: async () =>
              JSON.stringify({
                count: 1,
                next: null,
                previous: null,
                results: [mockDeletedCourse],
              }),
          });
        }
        return Promise.resolve({
          ok: true,
          status: 200,
          headers: new Headers({ 'content-type': 'application/json' }),
          text: async () => JSON.stringify({ count: 0, next: null, previous: null, results: [] }),
        });
      });
      globalThis.fetch = mockFetch;

      render(
        <MemoryRouter initialEntries={['/publisher/trash']}>
          <AppRoutes />
        </MemoryRouter>
      );

      await waitFor(() => {
        expect(screen.getByTestId(`restore-btn-${mockDeletedCourse.id}`)).toBeInTheDocument();
      });

      // Open modal & confirm
      fireEvent.click(screen.getByTestId(`restore-btn-${mockDeletedCourse.id}`));
      fireEvent.click(screen.getByTestId('restore-confirm-btn'));

      // Modal stays open and displays RFC 9457 error detail
      await waitFor(() => {
        expect(screen.getByTestId('restore-modal-error')).toBeInTheDocument();
      });
      expect(
        screen.getByText('Impossible de restaurer un élément dont le conteneur parent est supprimé.')
      ).toBeInTheDocument();

      // Close modal
      fireEvent.click(screen.getByTestId('restore-cancel-btn'));
      await waitFor(() => {
        expect(screen.queryByTestId('restore-confirm-modal')).not.toBeInTheDocument();
      });

      // Item remains in trash list
      expect(screen.getByTestId(`trash-item-${mockDeletedCourse.id}`)).toBeInTheDocument();
    });
  });

  // ===========================================================================
  // 6. Direct RestoreConfirmationModal Unit Tests
  // ===========================================================================
  describe('RestoreConfirmationModal Unit Component', () => {
    it('renders null when item is null', () => {
      const { container } = render(
        <RestoreConfirmationModal
          isOpen={true}
          onClose={vi.fn()}
          item={null}
          onSuccess={vi.fn()}
        />
      );
      expect(container.firstChild).toBeNull();
    });

    it('renders nothing when isOpen is false', () => {
      const trashItem: TrashItem = {
        id: '123',
        type: 'lesson',
        name: 'Lesson Title',
        deleted_at: '2026-10-20',
        last_modified_by: { id: 'u1', email: 'test@example.com' },
      };
      render(
        <RestoreConfirmationModal
          isOpen={false}
          onClose={vi.fn()}
          item={trashItem}
          onSuccess={vi.fn()}
        />
      );
      expect(screen.queryByTestId('restore-confirm-modal')).not.toBeInTheDocument();
    });
  });
});
