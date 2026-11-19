import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { MemoryRouter } from 'react-router-dom';
import { useAuthStore } from '@/features/auth/auth-store';
import { AppRoutes } from '@/routes';
import {
  ContainerFormModal,
  RemovalPreviewModal,
  createCourse,
  updateCourse,
  deleteCourse,
  fetchCourseRemovalPreview,
  createModule,
  updateModule,
  deleteModule,
  fetchModuleRemovalPreview,
  createChapter,
  updateChapter,
  deleteChapter,
  fetchChapterRemovalPreview,
  fetchManageableCourse,
} from './index';
import { ApiError } from '@/lib/api';
import type {
  PublisherCourseItem,
  PublisherModuleItem,
  PublisherChapterItem,
  RemovalPreviewResponse,
} from './types';

const mockCourse: PublisherCourseItem = {
  id: 'c1111111-1111-1111-1111-111111111111',
  name: 'Systèmes Distribués',
  subject: 'Génie Logiciel',
  position: 1,
  is_deleted: false,
  is_published: true,
  last_modified_by: {
    id: 'u1111111-1111-1111-1111-111111111111',
    email: 'publisher@brainx.edu',
  },
  updated_at: '2026-10-31T08:00:00Z',
};

const mockModule: PublisherModuleItem = {
  id: 'm1111111-1111-1111-1111-111111111111',
  name: 'Consensus Raft',
  position: 1,
  is_deleted: false,
  last_modified_by: {
    id: 'u1111111-1111-1111-1111-111111111111',
    email: 'publisher@brainx.edu',
  },
  updated_at: '2026-10-31T08:10:00Z',
};

const mockChapter: PublisherChapterItem = {
  id: 'ch111111-1111-1111-1111-111111111111',
  name: 'Élection du Leader',
  position: 1,
  is_deleted: false,
  last_modified_by: {
    id: 'u1111111-1111-1111-1111-111111111111',
    email: 'publisher@brainx.edu',
  },
  updated_at: '2026-10-31T08:20:00Z',
};

const mockRemovalPreview: RemovalPreviewResponse = {
  would_remove: {
    course: 1,
    module: 2,
    chapter: 4,
    lesson: 8,
    total: 15,
  },
  items: [
    {
      level: 'course',
      id: mockCourse.id,
      name: mockCourse.name,
      position: 1,
    },
    {
      level: 'module',
      id: mockModule.id,
      name: mockModule.name,
      position: 1,
    },
  ],
};

function setupPublisherAuth() {
  useAuthStore.getState().setTokens({
    access: 'valid_publisher_token',
    refresh: 'valid_refresh_token',
  });
  useAuthStore.getState().setUser({
    id: 'u1111111-1111-1111-1111-111111111111',
    email: 'publisher@brainx.edu',
    is_publisher: true,
  });
  useAuthStore.getState().setIsPublisher(true);
}

describe('Story FE-4.2: Création, Modification & Suppression Douce de Conteneurs', () => {
  const originalFetch = globalThis.fetch;

  beforeEach(() => {
    vi.restoreAllMocks();
    useAuthStore.getState().clearAuth();
    window.localStorage?.clear();
    setupPublisherAuth();
  });

  afterEach(() => {
    globalThis.fetch = originalFetch;
  });

  // =========================================================================
  // 1. Client API Service Methods Verification
  // =========================================================================
  describe('Client API Services (api.ts)', () => {
    it('createCourse calls POST /api/v1/courses/ with payload', async () => {
      const fetchSpy = vi.fn().mockResolvedValue({
        ok: true,
        status: 201,
        text: () => Promise.resolve(JSON.stringify(mockCourse)),
      });
      globalThis.fetch = fetchSpy;

      const result = await createCourse({
        name: 'Systèmes Distribués',
        subject: 'Génie Logiciel',
      });

      expect(fetchSpy).toHaveBeenCalledWith(
        expect.stringMatching(/\/api\/v1\/courses\/$/),
        expect.objectContaining({
          method: 'POST',
          body: JSON.stringify({
            name: 'Systèmes Distribués',
            subject: 'Génie Logiciel',
          }),
        })
      );
      expect(result.id).toBe(mockCourse.id);
    });

    it('updateCourse calls PATCH /api/v1/courses/:id/ with partial payload', async () => {
      const fetchSpy = vi.fn().mockResolvedValue({
        ok: true,
        status: 200,
        text: () => Promise.resolve(JSON.stringify(mockCourse)),
      });
      globalThis.fetch = fetchSpy;

      await updateCourse(mockCourse.id, { name: 'Nouveau Nom' });

      expect(fetchSpy).toHaveBeenCalledWith(
        expect.stringMatching(new RegExp(`/api/v1/courses/${mockCourse.id}/$`)),
        expect.objectContaining({
          method: 'PATCH',
          body: JSON.stringify({ name: 'Nouveau Nom' }),
        })
      );
    });

    it('deleteCourse calls DELETE /api/v1/courses/:id/', async () => {
      const fetchSpy = vi.fn().mockResolvedValue({
        ok: true,
        status: 200,
        text: () => Promise.resolve(JSON.stringify({ ...mockCourse, is_deleted: true })),
      });
      globalThis.fetch = fetchSpy;

      const res = await deleteCourse(mockCourse.id);

      expect(fetchSpy).toHaveBeenCalledWith(
        expect.stringMatching(new RegExp(`/api/v1/courses/${mockCourse.id}/$`)),
        expect.objectContaining({ method: 'DELETE' })
      );
      expect(res.is_deleted).toBe(true);
    });

    it('fetchCourseRemovalPreview calls GET /api/v1/courses/:id/removal-preview/', async () => {
      const fetchSpy = vi.fn().mockResolvedValue({
        ok: true,
        status: 200,
        text: () => Promise.resolve(JSON.stringify(mockRemovalPreview)),
      });
      globalThis.fetch = fetchSpy;

      const res = await fetchCourseRemovalPreview(mockCourse.id);

      expect(fetchSpy).toHaveBeenCalledWith(
        expect.stringMatching(new RegExp(`/api/v1/courses/${mockCourse.id}/removal-preview/$`)),
        expect.anything()
      );
      expect(res.would_remove.total).toBe(15);
    });

    it('createModule calls POST /api/v1/courses/:courseId/modules/', async () => {
      const fetchSpy = vi.fn().mockResolvedValue({
        ok: true,
        status: 201,
        text: () => Promise.resolve(JSON.stringify(mockModule)),
      });
      globalThis.fetch = fetchSpy;

      const res = await createModule(mockCourse.id, { name: 'Consensus Raft' });

      expect(fetchSpy).toHaveBeenCalledWith(
        expect.stringMatching(new RegExp(`/api/v1/courses/${mockCourse.id}/modules/$`)),
        expect.objectContaining({
          method: 'POST',
          body: JSON.stringify({ name: 'Consensus Raft' }),
        })
      );
      expect(res.id).toBe(mockModule.id);
    });

    it('updateModule calls PATCH /api/v1/modules/:id/', async () => {
      const fetchSpy = vi.fn().mockResolvedValue({
        ok: true,
        status: 200,
        text: () => Promise.resolve(JSON.stringify(mockModule)),
      });
      globalThis.fetch = fetchSpy;

      await updateModule(mockModule.id, { name: 'Paxos & Raft' });

      expect(fetchSpy).toHaveBeenCalledWith(
        expect.stringMatching(new RegExp(`/api/v1/modules/${mockModule.id}/$`)),
        expect.objectContaining({
          method: 'PATCH',
          body: JSON.stringify({ name: 'Paxos & Raft' }),
        })
      );
    });

    it('deleteModule calls DELETE /api/v1/modules/:id/', async () => {
      const fetchSpy = vi.fn().mockResolvedValue({
        ok: true,
        status: 200,
        text: () => Promise.resolve(JSON.stringify({ ...mockModule, is_deleted: true })),
      });
      globalThis.fetch = fetchSpy;

      await deleteModule(mockModule.id);

      expect(fetchSpy).toHaveBeenCalledWith(
        expect.stringMatching(new RegExp(`/api/v1/modules/${mockModule.id}/$`)),
        expect.objectContaining({ method: 'DELETE' })
      );
    });

    it('fetchModuleRemovalPreview calls GET /api/v1/modules/:id/removal-preview/', async () => {
      const fetchSpy = vi.fn().mockResolvedValue({
        ok: true,
        status: 200,
        text: () => Promise.resolve(JSON.stringify(mockRemovalPreview)),
      });
      globalThis.fetch = fetchSpy;

      await fetchModuleRemovalPreview(mockModule.id);

      expect(fetchSpy).toHaveBeenCalledWith(
        expect.stringMatching(new RegExp(`/api/v1/modules/${mockModule.id}/removal-preview/$`)),
        expect.anything()
      );
    });

    it('createChapter calls POST /api/v1/modules/:moduleId/chapters/', async () => {
      const fetchSpy = vi.fn().mockResolvedValue({
        ok: true,
        status: 201,
        text: () => Promise.resolve(JSON.stringify(mockChapter)),
      });
      globalThis.fetch = fetchSpy;

      const res = await createChapter(mockModule.id, { name: 'Élection du Leader' });

      expect(fetchSpy).toHaveBeenCalledWith(
        expect.stringMatching(new RegExp(`/api/v1/modules/${mockModule.id}/chapters/$`)),
        expect.objectContaining({
          method: 'POST',
          body: JSON.stringify({ name: 'Élection du Leader' }),
        })
      );
      expect(res.id).toBe(mockChapter.id);
    });

    it('updateChapter calls PATCH /api/v1/chapters/:id/', async () => {
      const fetchSpy = vi.fn().mockResolvedValue({
        ok: true,
        status: 200,
        text: () => Promise.resolve(JSON.stringify(mockChapter)),
      });
      globalThis.fetch = fetchSpy;

      await updateChapter(mockChapter.id, { name: 'Heartbeats & Timers' });

      expect(fetchSpy).toHaveBeenCalledWith(
        expect.stringMatching(new RegExp(`/api/v1/chapters/${mockChapter.id}/$`)),
        expect.objectContaining({
          method: 'PATCH',
          body: JSON.stringify({ name: 'Heartbeats & Timers' }),
        })
      );
    });

    it('deleteChapter calls DELETE /api/v1/chapters/:id/', async () => {
      const fetchSpy = vi.fn().mockResolvedValue({
        ok: true,
        status: 200,
        text: () => Promise.resolve(JSON.stringify({ ...mockChapter, is_deleted: true })),
      });
      globalThis.fetch = fetchSpy;

      await deleteChapter(mockChapter.id);

      expect(fetchSpy).toHaveBeenCalledWith(
        expect.stringMatching(new RegExp(`/api/v1/chapters/${mockChapter.id}/$`)),
        expect.objectContaining({ method: 'DELETE' })
      );
    });

    it('fetchChapterRemovalPreview calls GET /api/v1/chapters/:id/removal-preview/', async () => {
      const fetchSpy = vi.fn().mockResolvedValue({
        ok: true,
        status: 200,
        text: () => Promise.resolve(JSON.stringify(mockRemovalPreview)),
      });
      globalThis.fetch = fetchSpy;

      await fetchChapterRemovalPreview(mockChapter.id);

      expect(fetchSpy).toHaveBeenCalledWith(
        expect.stringMatching(new RegExp(`/api/v1/chapters/${mockChapter.id}/removal-preview/$`)),
        expect.anything()
      );
    });

    describe('fetchManageableCourse and 405 fallback behavior', () => {
      it('fetches course directly via GET /api/v1/courses/:id/ when supported', async () => {
        const fetchSpy = vi.fn().mockResolvedValue({
          ok: true,
          status: 200,
          text: () => Promise.resolve(JSON.stringify(mockCourse)),
          headers: new Headers({ 'content-type': 'application/json' }),
        });
        globalThis.fetch = fetchSpy;

        const res = await fetchManageableCourse(mockCourse.id);
        expect(res.id).toBe(mockCourse.id);
        expect(fetchSpy).toHaveBeenCalledTimes(1);
      });

      it('falls back to iterating through paginated list when direct GET returns 405', async () => {
        const targetCourse: PublisherCourseItem = {
          ...mockCourse,
          id: 'c-page2-id',
          name: 'Cours sur Page 2',
        };

        const fetchSpy = vi.fn().mockImplementation((url: string) => {
          if (url.includes(`/api/v1/courses/${targetCourse.id}/`)) {
            return Promise.resolve({
              ok: false,
              status: 405,
              text: () =>
                Promise.resolve(
                  JSON.stringify({
                    type: 'about:blank',
                    title: 'Method Not Allowed',
                    status: 405,
                    detail: 'Method "GET" not allowed.',
                  })
                ),
              headers: new Headers({ 'content-type': 'application/json' }),
            });
          }
          if (url.includes('page=2')) {
            return Promise.resolve({
              ok: true,
              status: 200,
              text: () =>
                Promise.resolve(
                  JSON.stringify({
                    count: 2,
                    next: null,
                    previous: 'http://test/?page=1',
                    results: [targetCourse],
                  })
                ),
              headers: new Headers({ 'content-type': 'application/json' }),
            });
          }
          // page 1
          return Promise.resolve({
            ok: true,
            status: 200,
            text: () =>
              Promise.resolve(
                JSON.stringify({
                  count: 2,
                  next: 'http://test/?page=2',
                  previous: null,
                  results: [mockCourse],
                })
              ),
            headers: new Headers({ 'content-type': 'application/json' }),
          });
        });
        globalThis.fetch = fetchSpy;

        const res = await fetchManageableCourse(targetCourse.id);
        expect(res.id).toBe(targetCourse.id);
        expect(res.name).toBe('Cours sur Page 2');
        expect(fetchSpy).toHaveBeenCalledTimes(3); // direct GET 405, page 1, page 2
      });

      it('rethrows 401/403 errors directly without attempting list fallback', async () => {
        const fetchSpy = vi.fn().mockResolvedValue({
          ok: false,
          status: 403,
          text: () =>
            Promise.resolve(
              JSON.stringify({
                type: 'about:blank',
                title: 'Forbidden',
                status: 403,
                detail: 'Vous ne possédez pas les autorisations nécessaires.',
              })
            ),
          headers: new Headers({ 'content-type': 'application/json' }),
        });
        globalThis.fetch = fetchSpy;

        await expect(fetchManageableCourse('forbidden-id')).rejects.toThrow(ApiError);
        expect(fetchSpy).toHaveBeenCalledTimes(1);
      });
    });
  });

  // =========================================================================
  // 2. ContainerFormModal Component
  // =========================================================================
  describe('ContainerFormModal Component', () => {
    it('validates mandatory fields and blocks submission when empty', async () => {
      const user = userEvent.setup();
      const onSuccess = vi.fn();
      const onClose = vi.fn();

      render(
        <ContainerFormModal
          isOpen={true}
          onClose={onClose}
          type="course"
          mode="create"
          onSuccess={onSuccess}
        />
      );

      const submitBtn = screen.getByTestId('container-submit-btn');
      await user.click(submitBtn);

      expect(screen.getByTestId('container-name-error')).toHaveTextContent(
        /Le titre est obligatoire/i
      );
      expect(screen.getByTestId('container-subject-error')).toHaveTextContent(
        /La matière est obligatoire/i
      );
      expect(onSuccess).not.toHaveBeenCalled();
    });

    it('submits valid Course form, triggers createCourse, and invokes onSuccess', async () => {
      const user = userEvent.setup();
      const onSuccess = vi.fn();
      const onClose = vi.fn();

      globalThis.fetch = vi.fn().mockResolvedValue({
        ok: true,
        status: 201,
        text: () => Promise.resolve(JSON.stringify(mockCourse)),
      });

      render(
        <ContainerFormModal
          isOpen={true}
          onClose={onClose}
          type="course"
          mode="create"
          onSuccess={onSuccess}
        />
      );

      await user.type(screen.getByTestId('container-name-input'), 'Systèmes Distribués');
      await user.type(screen.getByTestId('container-subject-input'), 'Génie Logiciel');
      await user.click(screen.getByTestId('container-submit-btn'));

      await waitFor(() => {
        expect(onSuccess).toHaveBeenCalledWith(
          expect.objectContaining({ name: 'Systèmes Distribués' })
        );
        expect(onClose).toHaveBeenCalled();
      });
    });

    it('maps RFC 9457 400 validation errors to form fields', async () => {
      const user = userEvent.setup();
      const onSuccess = vi.fn();

      globalThis.fetch = vi.fn().mockResolvedValue({
        ok: false,
        status: 400,
        text: () =>
          Promise.resolve(
            JSON.stringify({
              type: 'https://brainx.edu/errors/validation',
              title: 'Validation Failed',
              status: 400,
              detail: 'Données invalides',
              errors: {
                name: ['Ce nom de cours existe déjà.'],
              },
            })
          ),
      });

      render(
        <ContainerFormModal
          isOpen={true}
          onClose={vi.fn()}
          type="course"
          mode="create"
          onSuccess={onSuccess}
        />
      );

      await user.type(screen.getByTestId('container-name-input'), 'Systèmes Distribués');
      await user.type(screen.getByTestId('container-subject-input'), 'Génie Logiciel');
      await user.click(screen.getByTestId('container-submit-btn'));

      await waitFor(() => {
        expect(screen.getByTestId('container-name-error')).toHaveTextContent(
          'Ce nom de cours existe déjà.'
        );
      });
      expect(onSuccess).not.toHaveBeenCalled();
    });

    it('submits Module in create mode with parent courseId', async () => {
      const user = userEvent.setup();
      const onSuccess = vi.fn();
      const onClose = vi.fn();

      globalThis.fetch = vi.fn().mockResolvedValue({
        ok: true,
        status: 201,
        text: () => Promise.resolve(JSON.stringify(mockModule)),
      });

      render(
        <ContainerFormModal
          isOpen={true}
          onClose={onClose}
          type="module"
          mode="create"
          parentId={mockCourse.id}
          onSuccess={onSuccess}
        />
      );

      // Subject field must NOT be rendered for modules
      expect(screen.queryByTestId('container-subject-input')).not.toBeInTheDocument();

      await user.type(screen.getByTestId('container-name-input'), 'Consensus Raft');
      await user.click(screen.getByTestId('container-submit-btn'));

      await waitFor(() => {
        expect(onSuccess).toHaveBeenCalledWith(
          expect.objectContaining({ name: 'Consensus Raft' })
        );
        expect(onClose).toHaveBeenCalled();
      });
    });

    it('submits Chapter in edit mode, triggers updateChapter', async () => {
      const user = userEvent.setup();
      const onSuccess = vi.fn();
      const onClose = vi.fn();

      globalThis.fetch = vi.fn().mockResolvedValue({
        ok: true,
        status: 200,
        text: () => Promise.resolve(JSON.stringify({ ...mockChapter, name: 'Leader Election v2' })),
      });

      render(
        <ContainerFormModal
          isOpen={true}
          onClose={onClose}
          type="chapter"
          mode="edit"
          initialData={{ id: mockChapter.id, name: mockChapter.name }}
          onSuccess={onSuccess}
        />
      );

      const input = screen.getByTestId('container-name-input');
      expect(input).toHaveValue('Élection du Leader');

      await user.clear(input);
      await user.type(input, 'Leader Election v2');
      await user.click(screen.getByTestId('container-submit-btn'));

      await waitFor(() => {
        expect(onSuccess).toHaveBeenCalledWith(
          expect.objectContaining({ name: 'Leader Election v2' })
        );
        expect(onClose).toHaveBeenCalled();
      });
    });
  });

  // =========================================================================
  // 3. RemovalPreviewModal Component
  // =========================================================================
  describe('RemovalPreviewModal Component', () => {
    it('fetches and displays exact cascade counts in badge grid', async () => {
      globalThis.fetch = vi.fn().mockResolvedValue({
        ok: true,
        status: 200,
        text: () => Promise.resolve(JSON.stringify(mockRemovalPreview)),
      });

      render(
        <RemovalPreviewModal
          isOpen={true}
          onClose={vi.fn()}
          type="course"
          item={{ id: mockCourse.id, name: mockCourse.name }}
          onSuccess={vi.fn()}
        />
      );

      expect(screen.getByTestId('removal-preview-loading')).toBeInTheDocument();

      await waitFor(() => {
        expect(screen.getByTestId('removal-preview-counts')).toBeInTheDocument();
      });

      expect(screen.getByTestId('badge-count-course')).toHaveTextContent('1');
      expect(screen.getByTestId('badge-count-module')).toHaveTextContent('2');
      expect(screen.getByTestId('badge-count-chapter')).toHaveTextContent('4');
      expect(screen.getByTestId('badge-count-lesson')).toHaveTextContent('8');
      expect(screen.getByTestId('removal-total-count')).toHaveTextContent('15');
      expect(screen.getByTestId('removal-soft-delete-notice')).toBeInTheDocument();
    });

    it('renders error alert with retry button when preview fails to load', async () => {
      const user = userEvent.setup();
      let callCount = 0;

      globalThis.fetch = vi.fn().mockImplementation(() => {
        callCount++;
        if (callCount === 1) {
          return Promise.resolve({
            ok: false,
            status: 500,
            text: () => Promise.resolve(JSON.stringify({ detail: 'Erreur serveur aperçu' })),
          });
        }
        return Promise.resolve({
          ok: true,
          status: 200,
          text: () => Promise.resolve(JSON.stringify(mockRemovalPreview)),
        });
      });

      render(
        <RemovalPreviewModal
          isOpen={true}
          onClose={vi.fn()}
          type="course"
          item={{ id: mockCourse.id, name: mockCourse.name }}
          onSuccess={vi.fn()}
        />
      );

      await waitFor(() => {
        expect(screen.getByTestId('removal-preview-error')).toHaveTextContent(
          'Erreur serveur aperçu'
        );
      });

      // Confirm button is disabled on preview error
      expect(screen.getByTestId('removal-confirm-btn')).toBeDisabled();

      // Click retry
      await user.click(screen.getByTestId('removal-preview-retry-btn'));

      await waitFor(() => {
        expect(screen.getByTestId('removal-preview-counts')).toBeInTheDocument();
      });
      expect(screen.getByTestId('removal-confirm-btn')).not.toBeDisabled();
    });

    it('cancels deletion and closes modal without calling DELETE on Cancel click', async () => {
      const user = userEvent.setup();
      const onClose = vi.fn();
      const fetchSpy = vi.fn().mockResolvedValue({
        ok: true,
        status: 200,
        text: () => Promise.resolve(JSON.stringify(mockRemovalPreview)),
      });
      globalThis.fetch = fetchSpy;

      render(
        <RemovalPreviewModal
          isOpen={true}
          onClose={onClose}
          type="module"
          item={{ id: mockModule.id, name: mockModule.name }}
          onSuccess={vi.fn()}
        />
      );

      await waitFor(() => {
        expect(screen.getByTestId('removal-cancel-btn')).toBeInTheDocument();
      });

      await user.click(screen.getByTestId('removal-cancel-btn'));

      expect(onClose).toHaveBeenCalled();
      // Ensure no DELETE request was dispatched
      expect(fetchSpy).not.toHaveBeenCalledWith(
        expect.anything(),
        expect.objectContaining({ method: 'DELETE' })
      );
    });

    it('confirms deletion, issues DELETE, and triggers onSuccess', async () => {
      const user = userEvent.setup();
      const onSuccess = vi.fn();
      const onClose = vi.fn();

      const fetchSpy = vi.fn().mockImplementation((_url: string, opts?: RequestInit) => {
        if (opts?.method === 'DELETE') {
          return Promise.resolve({
            ok: true,
            status: 200,
            text: () => Promise.resolve(JSON.stringify({ ...mockCourse, is_deleted: true })),
          });
        }
        return Promise.resolve({
          ok: true,
          status: 200,
          text: () => Promise.resolve(JSON.stringify(mockRemovalPreview)),
        });
      });
      globalThis.fetch = fetchSpy;

      render(
        <RemovalPreviewModal
          isOpen={true}
          onClose={onClose}
          type="course"
          item={{ id: mockCourse.id, name: mockCourse.name }}
          onSuccess={onSuccess}
        />
      );

      await waitFor(() => {
        expect(screen.getByTestId('removal-confirm-btn')).toBeInTheDocument();
      });

      await user.click(screen.getByTestId('removal-confirm-btn'));

      await waitFor(() => {
        expect(fetchSpy).toHaveBeenCalledWith(
          expect.stringMatching(new RegExp(`/api/v1/courses/${mockCourse.id}/$`)),
          expect.objectContaining({ method: 'DELETE' })
        );
        expect(onSuccess).toHaveBeenCalled();
        expect(onClose).toHaveBeenCalled();
      });
    });

    it('keeps modal open and displays error when DELETE request fails', async () => {
      const user = userEvent.setup();
      const onSuccess = vi.fn();
      const onClose = vi.fn();

      globalThis.fetch = vi.fn().mockImplementation((_url: string, opts?: RequestInit) => {
        if (opts?.method === 'DELETE') {
          return Promise.resolve({
            ok: false,
            status: 403,
            text: () =>
              Promise.resolve(
                JSON.stringify({
                  detail: 'Action interdite : vous n’avez pas les droits de suppression.',
                })
              ),
          });
        }
        return Promise.resolve({
          ok: true,
          status: 200,
          text: () => Promise.resolve(JSON.stringify(mockRemovalPreview)),
        });
      });

      render(
        <RemovalPreviewModal
          isOpen={true}
          onClose={onClose}
          type="course"
          item={{ id: mockCourse.id, name: mockCourse.name }}
          onSuccess={onSuccess}
        />
      );

      await waitFor(() => {
        expect(screen.getByTestId('removal-confirm-btn')).toBeInTheDocument();
      });

      await user.click(screen.getByTestId('removal-confirm-btn'));

      await waitFor(() => {
        expect(screen.getByTestId('removal-delete-error')).toHaveTextContent(
          'Action interdite : vous n’avez pas les droits de suppression.'
        );
      });

      expect(onClose).not.toHaveBeenCalled();
      expect(onSuccess).not.toHaveBeenCalled();
    });
  });

  // =========================================================================
  // 4. PublisherCoursePage View & Nested Container Management
  // =========================================================================
  describe('PublisherCoursePage Integration (/publisher/courses/:courseId)', () => {
    it('fetches course, modules, and chapters, and renders complete hierarchy', async () => {
      const fetchSpy = vi.fn().mockImplementation((url: string) => {
        if (url.includes(`/api/v1/courses/${mockCourse.id}/modules/`)) {
          return Promise.resolve({
            ok: true,
            status: 200,
            text: () =>
              Promise.resolve(
                JSON.stringify({
                  count: 1,
                  next: null,
                  previous: null,
                  results: [mockModule],
                })
              ),
          });
        }
        if (url.includes(`/api/v1/modules/${mockModule.id}/chapters/`)) {
          return Promise.resolve({
            ok: true,
            status: 200,
            text: () =>
              Promise.resolve(
                JSON.stringify({
                  count: 1,
                  next: null,
                  previous: null,
                  results: [mockChapter],
                })
              ),
          });
        }
        if (url.includes(`/api/v1/courses/${mockCourse.id}/`)) {
          return Promise.resolve({
            ok: true,
            status: 200,
            text: () => Promise.resolve(JSON.stringify(mockCourse)),
          });
        }
        return Promise.resolve({
          ok: true,
          status: 200,
          text: () => Promise.resolve(JSON.stringify({})),
        });
      });
      globalThis.fetch = fetchSpy;

      render(
        <MemoryRouter initialEntries={[`/publisher/courses/${mockCourse.id}`]}>
          <AppRoutes />
        </MemoryRouter>
      );

      await waitFor(() => {
        expect(screen.getByTestId('publisher-course-title')).toHaveTextContent(
          'Systèmes Distribués'
        );
        expect(screen.getByTestId('publisher-course-subject')).toHaveTextContent(
          'Génie Logiciel'
        );
      });

      expect(screen.getByTestId(`module-name-${mockModule.id}`)).toHaveTextContent(
        'Consensus Raft'
      );
      await waitFor(() => {
        expect(screen.getByTestId(`chapter-name-${mockChapter.id}`)).toHaveTextContent(
          'Élection du Leader'
        );
      });
    });

    it('creates a new Module via "Nouveau Module" modal and adds it to hierarchy', async () => {
      const user = userEvent.setup();
      const newModule: PublisherModuleItem = {
        id: 'm2222222-2222-2222-2222-222222222222',
        name: 'Modèle Gossip & Détection de Panne',
        position: 2,
        is_deleted: false,
        last_modified_by: {
          id: 'u1111111-1111-1111-1111-111111111111',
          email: 'publisher@brainx.edu',
        },
        updated_at: '2026-10-31T09:00:00Z',
      };

      globalThis.fetch = vi.fn().mockImplementation((url: string, opts?: RequestInit) => {
        if (opts?.method === 'POST' && url.includes(`/api/v1/courses/${mockCourse.id}/modules/`)) {
          return Promise.resolve({
            ok: true,
            status: 201,
            text: () => Promise.resolve(JSON.stringify(newModule)),
          });
        }
        if (url.includes(`/api/v1/courses/${mockCourse.id}/modules/`)) {
          return Promise.resolve({
            ok: true,
            status: 200,
            text: () =>
              Promise.resolve(
                JSON.stringify({
                  count: 1,
                  next: null,
                  previous: null,
                  results: [mockModule],
                })
              ),
          });
        }
        if (url.includes('/chapters/')) {
          return Promise.resolve({
            ok: true,
            status: 200,
            text: () =>
              Promise.resolve(
                JSON.stringify({
                  count: 0,
                  next: null,
                  previous: null,
                  results: [],
                })
              ),
          });
        }
        return Promise.resolve({
          ok: true,
          status: 200,
          text: () => Promise.resolve(JSON.stringify(mockCourse)),
        });
      });

      render(
        <MemoryRouter initialEntries={[`/publisher/courses/${mockCourse.id}`]}>
          <AppRoutes />
        </MemoryRouter>
      );

      await waitFor(() => {
        expect(screen.getByTestId('create-module-btn')).toBeInTheDocument();
      });

      await user.click(screen.getByTestId('create-module-btn'));

      expect(screen.getByTestId('container-form-modal')).toBeInTheDocument();

      await user.type(
        screen.getByTestId('container-name-input'),
        'Modèle Gossip & Détection de Panne'
      );
      await user.click(screen.getByTestId('container-submit-btn'));

      await waitFor(() => {
        expect(
          screen.getByTestId(`module-name-${newModule.id}`)
        ).toHaveTextContent('Modèle Gossip & Détection de Panne');
      });
    });

    it('creates a new Chapter under a Module and displays it', async () => {
      const user = userEvent.setup();
      const newChapter: PublisherChapterItem = {
        id: 'ch222222-2222-2222-2222-222222222222',
        name: 'Protocole SWIM',
        position: 2,
        is_deleted: false,
        last_modified_by: {
          id: 'u1111111-1111-1111-1111-111111111111',
          email: 'publisher@brainx.edu',
        },
        updated_at: '2026-10-31T09:15:00Z',
      };

      globalThis.fetch = vi.fn().mockImplementation((url: string, opts?: RequestInit) => {
        if (
          opts?.method === 'POST' &&
          url.includes(`/api/v1/modules/${mockModule.id}/chapters/`)
        ) {
          return Promise.resolve({
            ok: true,
            status: 201,
            text: () => Promise.resolve(JSON.stringify(newChapter)),
          });
        }
        if (url.includes(`/api/v1/courses/${mockCourse.id}/modules/`)) {
          return Promise.resolve({
            ok: true,
            status: 200,
            text: () =>
              Promise.resolve(
                JSON.stringify({
                  count: 1,
                  next: null,
                  previous: null,
                  results: [mockModule],
                })
              ),
          });
        }
        if (url.includes(`/api/v1/modules/${mockModule.id}/chapters/`)) {
          return Promise.resolve({
            ok: true,
            status: 200,
            text: () =>
              Promise.resolve(
                JSON.stringify({
                  count: 1,
                  next: null,
                  previous: null,
                  results: [mockChapter],
                })
              ),
          });
        }
        return Promise.resolve({
          ok: true,
          status: 200,
          text: () => Promise.resolve(JSON.stringify(mockCourse)),
        });
      });

      render(
        <MemoryRouter initialEntries={[`/publisher/courses/${mockCourse.id}`]}>
          <AppRoutes />
        </MemoryRouter>
      );

      await waitFor(() => {
        expect(
          screen.getByTestId(`create-chapter-btn-${mockModule.id}`)
        ).toBeInTheDocument();
      });

      await user.click(screen.getByTestId(`create-chapter-btn-${mockModule.id}`));

      expect(screen.getByTestId('container-form-modal')).toBeInTheDocument();

      await user.type(screen.getByTestId('container-name-input'), 'Protocole SWIM');
      await user.click(screen.getByTestId('container-submit-btn'));

      await waitFor(() => {
        expect(
          screen.getByTestId(`chapter-name-${newChapter.id}`)
        ).toHaveTextContent('Protocole SWIM');
      });
    });

    it('edits container in place and updates UI immediately', async () => {
      const user = userEvent.setup();

      globalThis.fetch = vi.fn().mockImplementation((url: string, opts?: RequestInit) => {
        if (opts?.method === 'PATCH' && url.includes(`/api/v1/modules/${mockModule.id}/`)) {
          return Promise.resolve({
            ok: true,
            status: 200,
            text: () =>
              Promise.resolve(
                JSON.stringify({ ...mockModule, name: 'Consensus Raft & Paxos' })
              ),
          });
        }
        if (url.includes(`/api/v1/courses/${mockCourse.id}/modules/`)) {
          return Promise.resolve({
            ok: true,
            status: 200,
            text: () =>
              Promise.resolve(
                JSON.stringify({
                  count: 1,
                  next: null,
                  previous: null,
                  results: [mockModule],
                })
              ),
          });
        }
        if (url.includes('/chapters/')) {
          return Promise.resolve({
            ok: true,
            status: 200,
            text: () =>
              Promise.resolve(
                JSON.stringify({
                  count: 0,
                  next: null,
                  previous: null,
                  results: [],
                })
              ),
          });
        }
        return Promise.resolve({
          ok: true,
          status: 200,
          text: () => Promise.resolve(JSON.stringify(mockCourse)),
        });
      });

      render(
        <MemoryRouter initialEntries={[`/publisher/courses/${mockCourse.id}`]}>
          <AppRoutes />
        </MemoryRouter>
      );

      await waitFor(() => {
        expect(screen.getByTestId(`edit-module-btn-${mockModule.id}`)).toBeInTheDocument();
      });

      await user.click(screen.getByTestId(`edit-module-btn-${mockModule.id}`));

      const input = screen.getByTestId('container-name-input');
      expect(input).toHaveValue('Consensus Raft');

      await user.clear(input);
      await user.type(input, 'Consensus Raft & Paxos');
      await user.click(screen.getByTestId('container-submit-btn'));

      await waitFor(() => {
        expect(
          screen.getByTestId(`module-name-${mockModule.id}`)
        ).toHaveTextContent('Consensus Raft & Paxos');
      });
    });

    it('deletes a Module via removal preview modal and removes it from view', async () => {
      const user = userEvent.setup();

      globalThis.fetch = vi.fn().mockImplementation((url: string, opts?: RequestInit) => {
        if (opts?.method === 'DELETE' && url.includes(`/api/v1/modules/${mockModule.id}/`)) {
          return Promise.resolve({
            ok: true,
            status: 200,
            text: () => Promise.resolve(JSON.stringify({ ...mockModule, is_deleted: true })),
          });
        }
        if (url.includes('/removal-preview/')) {
          return Promise.resolve({
            ok: true,
            status: 200,
            text: () =>
              Promise.resolve(
                JSON.stringify({
                  would_remove: { module: 1, chapter: 2, lesson: 4, total: 7 },
                  items: [],
                })
              ),
          });
        }
        if (url.includes(`/api/v1/courses/${mockCourse.id}/modules/`)) {
          return Promise.resolve({
            ok: true,
            status: 200,
            text: () =>
              Promise.resolve(
                JSON.stringify({
                  count: 1,
                  next: null,
                  previous: null,
                  results: [mockModule],
                })
              ),
          });
        }
        if (url.includes('/chapters/')) {
          return Promise.resolve({
            ok: true,
            status: 200,
            text: () =>
              Promise.resolve(
                JSON.stringify({
                  count: 0,
                  next: null,
                  previous: null,
                  results: [],
                })
              ),
          });
        }
        return Promise.resolve({
          ok: true,
          status: 200,
          text: () => Promise.resolve(JSON.stringify(mockCourse)),
        });
      });

      render(
        <MemoryRouter initialEntries={[`/publisher/courses/${mockCourse.id}`]}>
          <AppRoutes />
        </MemoryRouter>
      );

      await waitFor(() => {
        expect(screen.getByTestId(`delete-module-btn-${mockModule.id}`)).toBeInTheDocument();
      });

      await user.click(screen.getByTestId(`delete-module-btn-${mockModule.id}`));

      // Removal preview modal displays impact counts
      await waitFor(() => {
        expect(screen.getByTestId('removal-total-count')).toHaveTextContent('7');
      });

      await user.click(screen.getByTestId('removal-confirm-btn'));

      await waitFor(() => {
        expect(screen.queryByTestId(`publisher-module-card-${mockModule.id}`)).not.toBeInTheDocument();
      });
    });

    it('deletes course and navigates back to publisher dashboard', async () => {
      const user = userEvent.setup();

      globalThis.fetch = vi.fn().mockImplementation((url: string, opts?: RequestInit) => {
        if (opts?.method === 'DELETE' && url.includes(`/api/v1/courses/${mockCourse.id}/`)) {
          return Promise.resolve({
            ok: true,
            status: 200,
            text: () => Promise.resolve(JSON.stringify({ ...mockCourse, is_deleted: true })),
          });
        }
        if (url.includes('/removal-preview/')) {
          return Promise.resolve({
            ok: true,
            status: 200,
            text: () => Promise.resolve(JSON.stringify(mockRemovalPreview)),
          });
        }
        if (url.includes('/modules/')) {
          return Promise.resolve({
            ok: true,
            status: 200,
            text: () =>
              Promise.resolve(
                JSON.stringify({
                  count: 0,
                  next: null,
                  previous: null,
                  results: [],
                })
              ),
          });
        }
        if (url.includes(`/api/v1/courses/${mockCourse.id}/`)) {
          return Promise.resolve({
            ok: true,
            status: 200,
            text: () => Promise.resolve(JSON.stringify(mockCourse)),
          });
        }
        if (url.includes('/courses/')) {
          return Promise.resolve({
            ok: true,
            status: 200,
            text: () =>
              Promise.resolve(
                JSON.stringify({
                  count: 0,
                  next: null,
                  previous: null,
                  results: [],
                })
              ),
          });
        }
      });

      render(
        <MemoryRouter initialEntries={[`/publisher/courses/${mockCourse.id}`]}>
          <AppRoutes />
        </MemoryRouter>
      );

      await waitFor(() => {
        expect(screen.getByTestId('delete-course-btn')).toBeInTheDocument();
      });

      await user.click(screen.getByTestId('delete-course-btn'));

      await waitFor(() => {
        expect(screen.getByTestId('removal-confirm-btn')).toBeInTheDocument();
      });

      await user.click(screen.getByTestId('removal-confirm-btn'));

      await waitFor(() => {
        expect(screen.getByTestId('publisher-dashboard-page')).toBeInTheDocument();
      });
    });

    it('edits course via header edit button, updates title/subject and retains metadata', async () => {
      const user = userEvent.setup();
      let patchCalled = false;
      const updatedCourse: PublisherCourseItem = {
        ...mockCourse,
        name: 'Systèmes Distribués Avancés',
        subject: 'Informatique Théorique',
        updated_at: '2026-10-31T09:45:00Z',
      };

      globalThis.fetch = vi.fn().mockImplementation((url: string, opts?: RequestInit) => {
        if (opts?.method === 'PATCH' && url.includes(`/api/v1/courses/${mockCourse.id}/`)) {
          patchCalled = true;
          return Promise.resolve({
            ok: true,
            status: 200,
            text: () => Promise.resolve(JSON.stringify(updatedCourse)),
            headers: new Headers({ 'content-type': 'application/json' }),
          });
        }
        if (url.includes(`/api/v1/courses/${mockCourse.id}/modules/`)) {
          return Promise.resolve({
            ok: true,
            status: 200,
            text: () =>
              Promise.resolve(
                JSON.stringify({
                  count: 0,
                  next: null,
                  previous: null,
                  results: [],
                })
              ),
            headers: new Headers({ 'content-type': 'application/json' }),
          });
        }
        if (url.includes(`/api/v1/courses/${mockCourse.id}/`)) {
          return Promise.resolve({
            ok: true,
            status: 200,
            text: () => Promise.resolve(JSON.stringify(mockCourse)),
            headers: new Headers({ 'content-type': 'application/json' }),
          });
        }
        return Promise.resolve({
          ok: true,
          status: 200,
          text: () => Promise.resolve(JSON.stringify({ results: [] })),
          headers: new Headers({ 'content-type': 'application/json' }),
        });
      });

      render(
        <MemoryRouter initialEntries={[`/publisher/courses/${mockCourse.id}`]}>
          <AppRoutes />
        </MemoryRouter>
      );

      await waitFor(() => {
        expect(screen.getByTestId('edit-course-btn')).toBeInTheDocument();
      });

      await user.click(screen.getByTestId('edit-course-btn'));

      await waitFor(() => {
        expect(screen.getByTestId('container-form-modal')).toBeInTheDocument();
      });

      const nameInput = screen.getByTestId('container-name-input');
      const subjectInput = screen.getByTestId('container-subject-input');

      expect(nameInput).toHaveValue(mockCourse.name);
      expect(subjectInput).toHaveValue(mockCourse.subject);

      await user.clear(nameInput);
      await user.type(nameInput, 'Systèmes Distribués Avancés');
      await user.clear(subjectInput);
      await user.type(subjectInput, 'Informatique Théorique');
      await user.click(screen.getByTestId('container-submit-btn'));

      await waitFor(() => {
        expect(patchCalled).toBe(true);
      });

      await waitFor(() => {
        expect(screen.getByTestId('publisher-course-title')).toHaveTextContent(
          'Systèmes Distribués Avancés'
        );
        expect(screen.getByTestId('publisher-course-subject')).toHaveTextContent(
          'Informatique Théorique'
        );
      });
    });

    it('deletes a chapter via removal preview modal and removes it from module chapter list', async () => {
      const user = userEvent.setup();
      let deleteCalled = false;

      globalThis.fetch = vi.fn().mockImplementation((url: string, opts?: RequestInit) => {
        if (url.includes(`/api/v1/chapters/${mockChapter.id}/removal-preview/`)) {
          return Promise.resolve({
            ok: true,
            status: 200,
            text: () =>
              Promise.resolve(
                JSON.stringify({
                  would_remove: { chapter: 1, lesson: 2, total: 3 },
                  items: [{ level: 'chapter', id: mockChapter.id, name: mockChapter.name, position: 1 }],
                })
              ),
            headers: new Headers({ 'content-type': 'application/json' }),
          });
        }
        if (opts?.method === 'DELETE' && url.includes(`/api/v1/chapters/${mockChapter.id}/`)) {
          deleteCalled = true;
          return Promise.resolve({
            ok: true,
            status: 200,
            text: () => Promise.resolve(JSON.stringify({ ...mockChapter, is_deleted: true })),
            headers: new Headers({ 'content-type': 'application/json' }),
          });
        }
        if (url.includes(`/api/v1/modules/${mockModule.id}/chapters/`)) {
          return Promise.resolve({
            ok: true,
            status: 200,
            text: () =>
              Promise.resolve(
                JSON.stringify({
                  count: 1,
                  next: null,
                  previous: null,
                  results: [mockChapter],
                })
              ),
            headers: new Headers({ 'content-type': 'application/json' }),
          });
        }
        if (url.includes(`/api/v1/courses/${mockCourse.id}/modules/`)) {
          return Promise.resolve({
            ok: true,
            status: 200,
            text: () =>
              Promise.resolve(
                JSON.stringify({
                  count: 1,
                  next: null,
                  previous: null,
                  results: [mockModule],
                })
              ),
            headers: new Headers({ 'content-type': 'application/json' }),
          });
        }
        if (url.includes(`/api/v1/courses/${mockCourse.id}/`)) {
          return Promise.resolve({
            ok: true,
            status: 200,
            text: () => Promise.resolve(JSON.stringify(mockCourse)),
            headers: new Headers({ 'content-type': 'application/json' }),
          });
        }
        return Promise.resolve({
          ok: true,
          status: 200,
          text: () => Promise.resolve(JSON.stringify({ results: [] })),
          headers: new Headers({ 'content-type': 'application/json' }),
        });
      });

      render(
        <MemoryRouter initialEntries={[`/publisher/courses/${mockCourse.id}`]}>
          <AppRoutes />
        </MemoryRouter>
      );

      await waitFor(() => {
        expect(
          screen.getByTestId(`publisher-chapter-item-${mockChapter.id}`)
        ).toBeInTheDocument();
      });

      const deleteChapterBtn = screen.getByTestId(`delete-chapter-btn-${mockChapter.id}`);
      await user.click(deleteChapterBtn);

      await waitFor(() => {
        expect(screen.getByTestId('removal-preview-modal')).toBeInTheDocument();
      });

      await waitFor(() => {
        expect(screen.getByTestId('removal-confirm-btn')).not.toBeDisabled();
      });

      await user.click(screen.getByTestId('removal-confirm-btn'));

      await waitFor(() => {
        expect(deleteCalled).toBe(true);
      });

      await waitFor(() => {
        expect(
          screen.queryByTestId(`publisher-chapter-item-${mockChapter.id}`)
        ).not.toBeInTheDocument();
      });
    });

    it('displays error state UI with retry button when fetching chapters fails', async () => {
      const user = userEvent.setup();
      let failChapters = true;

      globalThis.fetch = vi.fn().mockImplementation((url: string) => {
        if (url.includes(`/api/v1/modules/${mockModule.id}/chapters/`)) {
          if (failChapters) {
            return Promise.resolve({
              ok: false,
              status: 500,
              text: () =>
                Promise.resolve(
                  JSON.stringify({
                    type: 'about:blank',
                    title: 'Internal Server Error',
                    status: 500,
                    detail: 'Erreur serveur lors du chargement des chapitres.',
                  })
                ),
              headers: new Headers({ 'content-type': 'application/json' }),
            });
          }
          return Promise.resolve({
            ok: true,
            status: 200,
            text: () =>
              Promise.resolve(
                JSON.stringify({
                  count: 1,
                  next: null,
                  previous: null,
                  results: [mockChapter],
                })
              ),
            headers: new Headers({ 'content-type': 'application/json' }),
          });
        }
        if (url.includes(`/api/v1/courses/${mockCourse.id}/modules/`)) {
          return Promise.resolve({
            ok: true,
            status: 200,
            text: () =>
              Promise.resolve(
                JSON.stringify({
                  count: 1,
                  next: null,
                  previous: null,
                  results: [mockModule],
                })
              ),
            headers: new Headers({ 'content-type': 'application/json' }),
          });
        }
        if (url.includes(`/api/v1/courses/${mockCourse.id}/`)) {
          return Promise.resolve({
            ok: true,
            status: 200,
            text: () => Promise.resolve(JSON.stringify(mockCourse)),
            headers: new Headers({ 'content-type': 'application/json' }),
          });
        }
        return Promise.resolve({
          ok: true,
          status: 200,
          text: () => Promise.resolve(JSON.stringify({ results: [] })),
          headers: new Headers({ 'content-type': 'application/json' }),
        });
      });

      render(
        <MemoryRouter initialEntries={[`/publisher/courses/${mockCourse.id}`]}>
          <AppRoutes />
        </MemoryRouter>
      );

      await waitFor(() => {
        expect(screen.getByTestId(`chapters-error-${mockModule.id}`)).toBeInTheDocument();
      });

      expect(
        screen.getByText('Erreur serveur lors du chargement des chapitres.')
      ).toBeInTheDocument();

      const retryBtn = screen.getByTestId(`retry-chapters-btn-${mockModule.id}`);
      expect(retryBtn).toBeInTheDocument();

      failChapters = false;
      await user.click(retryBtn);

      await waitFor(() => {
        expect(
          screen.getByTestId(`publisher-chapter-item-${mockChapter.id}`)
        ).toBeInTheDocument();
      });
      expect(screen.queryByTestId(`chapters-error-${mockModule.id}`)).not.toBeInTheDocument();
    });
  });
});
