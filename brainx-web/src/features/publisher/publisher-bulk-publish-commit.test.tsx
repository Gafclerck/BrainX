import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import { render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { MemoryRouter, Routes, Route } from 'react-router-dom';
import { useAuthStore } from '@/features/auth/auth-store';
import {
  BulkPublishModal,
  commitModuleBulkPublish,
  commitChapterBulkPublish,
  PublisherCoursePage,
} from './index';
import type {
  PublisherCourseItem,
  PublisherModuleItem,
  PublisherChapterItem,
  BulkPublishPreviewResponse,
  BulkPublishCommitPayload,
  BulkPublishCommitResponse,
} from './types';

const mockCourse: PublisherCourseItem = {
  id: 'c1111111-1111-1111-1111-111111111111',
  name: 'Architecture Logicielle',
  subject: 'Informatique',
  position: 1,
  is_deleted: false,
  last_modified_by: { id: 'u1', email: 'publisher@brainx.edu' },
  updated_at: '2026-11-04T10:00:00Z',
};

const mockModule: PublisherModuleItem = {
  id: 'm1111111-1111-1111-1111-111111111111',
  name: 'Microservices & Patterns',
  position: 1,
  is_deleted: false,
  last_modified_by: { id: 'u1', email: 'publisher@brainx.edu' },
  updated_at: '2026-11-04T10:00:00Z',
};

const mockChapter: PublisherChapterItem = {
  id: 'ch111111-1111-1111-1111-111111111111',
  name: 'Domain-Driven Design',
  position: 1,
  is_deleted: false,
  last_modified_by: { id: 'u1', email: 'publisher@brainx.edu' },
  updated_at: '2026-11-04T10:00:00Z',
};

const mockChapter2: PublisherChapterItem = {
  id: 'ch222222-2222-2222-2222-222222222222',
  name: 'Clean Architecture',
  position: 2,
  is_deleted: false,
  last_modified_by: { id: 'u1', email: 'publisher@brainx.edu' },
  updated_at: '2026-11-04T10:00:00Z',
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

describe('Story FE-5.4: Confirmation de Publication en Masse sous Verrou de Conteneur', () => {
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
  // 1. Client API Service Methods (commitModuleBulkPublish & commitChapterBulkPublish)
  // =========================================================================
  describe('Client API Services (api.ts)', () => {
    it('commitModuleBulkPublish dispatches POST /api/v1/modules/:id/bulk-publish/ with echoed payload and auth token', async () => {
      const payload: BulkPublishCommitPayload = {
        would_change: 2,
        blocked: [{ id: 'l1', missing: ['teacher'] }],
      };

      const mockResponse: BulkPublishCommitResponse = {
        changed: 2,
        errors: {
          blocked: [{ id: 'l1', missing: ['teacher'] }],
        },
      };

      const fetchSpy = vi.fn().mockResolvedValue({
        ok: true,
        status: 200,
        text: () => Promise.resolve(JSON.stringify(mockResponse)),
      });
      globalThis.fetch = fetchSpy;

      const res = await commitModuleBulkPublish(mockModule.id, payload);

      expect(fetchSpy).toHaveBeenCalledWith(
        expect.stringMatching(
          new RegExp(`/api/v1/modules/${mockModule.id}/bulk-publish/\\??`)
        ),
        expect.objectContaining({
          method: 'POST',
          headers: expect.objectContaining({
            Authorization: 'Bearer valid_publisher_token',
            'Content-Type': 'application/json',
          }),
          body: JSON.stringify(payload),
        })
      );
      expect(res).toEqual(mockResponse);
    });

    it('commitChapterBulkPublish dispatches POST /api/v1/chapters/:id/bulk-publish/ with echoed payload and auth token', async () => {
      const payload: BulkPublishCommitPayload = {
        would_change: 3,
        blocked: [],
      };

      const mockResponse: BulkPublishCommitResponse = {
        changed: 3,
        errors: {
          blocked: [],
        },
      };

      const fetchSpy = vi.fn().mockResolvedValue({
        ok: true,
        status: 200,
        text: () => Promise.resolve(JSON.stringify(mockResponse)),
      });
      globalThis.fetch = fetchSpy;

      const res = await commitChapterBulkPublish(mockChapter.id, payload);

      expect(fetchSpy).toHaveBeenCalledWith(
        expect.stringMatching(
          new RegExp(`/api/v1/chapters/${mockChapter.id}/bulk-publish/\\??`)
        ),
        expect.objectContaining({
          method: 'POST',
          headers: expect.objectContaining({
            Authorization: 'Bearer valid_publisher_token',
            'Content-Type': 'application/json',
          }),
          body: JSON.stringify(payload),
        })
      );
      expect(res).toEqual(mockResponse);
    });

    it('throws ApiError with status 409 on concurrency conflict', async () => {
      const conflictError = {
        type: 'https://brainx.edu/errors/conflict',
        title: 'Conflit de concurrence',
        status: 409,
        detail: 'Le contenu a changé depuis la prévisualisation.',
        errors: {},
      };

      const fetchSpy = vi.fn().mockResolvedValue({
        ok: false,
        status: 409,
        text: () => Promise.resolve(JSON.stringify(conflictError)),
      });
      globalThis.fetch = fetchSpy;

      const payload: BulkPublishCommitPayload = {
        would_change: 1,
        blocked: [],
      };

      await expect(
        commitModuleBulkPublish(mockModule.id, payload)
      ).rejects.toMatchObject({
        name: 'ApiError',
        envelope: expect.objectContaining({ status: 409 }),
      });
    });
  });

  // =========================================================================
  // 2. AC-1: Confirmation Action & Preview Echoing in BulkPublishModal
  // =========================================================================
  describe('AC-1: Confirmation action & preview echoing', () => {
    it('dispatches commit request echoing preview enumeration with stripped candidate shapes', async () => {
      const user = userEvent.setup();
      const previewData: BulkPublishPreviewResponse = {
        would_change: 2,
        blocked: [
          {
            id: 'l-blocked-1',
            missing: ['description', 'teacher'],
            title: 'Leçon bloquée',
            teacher: '',
          },
        ],
      };

      const commitResponse: BulkPublishCommitResponse = {
        changed: 2,
        errors: {
          blocked: [{ id: 'l-blocked-1', missing: ['description', 'teacher'] }],
        },
      };

      const fetchSpy = vi.fn().mockImplementation((url: string, options?: RequestInit) => {
        if (url.includes('/preview/')) {
          return Promise.resolve({
            ok: true,
            status: 200,
            text: () => Promise.resolve(JSON.stringify(previewData)),
          });
        }
        if (options?.method === 'POST') {
          return Promise.resolve({
            ok: true,
            status: 200,
            text: () => Promise.resolve(JSON.stringify(commitResponse)),
          });
        }
        return Promise.reject(new Error(`Unhandled: ${url}`));
      });
      globalThis.fetch = fetchSpy;

      render(
        <BulkPublishModal
          isOpen={true}
          onClose={vi.fn()}
          type="module"
          item={{ id: mockModule.id, name: mockModule.name }}
        />
      );

      // Wait for preview load
      const confirmBtn = await screen.findByTestId('bulk-publish-confirm-btn');
      expect(confirmBtn).toBeEnabled();
      expect(confirmBtn).toHaveTextContent('Confirmer la publication');

      // Click Confirm
      await user.click(confirmBtn);

      // Verify POST call echoing preview enumeration
      expect(fetchSpy).toHaveBeenCalledWith(
        expect.stringMatching(
          new RegExp(`/api/v1/modules/${mockModule.id}/bulk-publish/\\??`)
        ),
        expect.objectContaining({
          method: 'POST',
          body: JSON.stringify({
            would_change: 2,
            blocked: [{ id: 'l-blocked-1', missing: ['description', 'teacher'] }],
          }),
        })
      );
    });

    it('disables confirm button when would_change === 0', async () => {
      const previewData: BulkPublishPreviewResponse = {
        would_change: 0,
        blocked: [
          {
            id: 'l-blocked-only',
            missing: ['course_date'],
            title: 'Leçon sans date',
          },
        ],
      };

      globalThis.fetch = vi.fn().mockResolvedValue({
        ok: true,
        status: 200,
        text: () => Promise.resolve(JSON.stringify(previewData)),
      });

      render(
        <BulkPublishModal
          isOpen={true}
          onClose={vi.fn()}
          type="chapter"
          item={{ id: mockChapter.id, name: mockChapter.name }}
        />
      );

      const confirmBtn = await screen.findByTestId('bulk-publish-confirm-btn');
      expect(confirmBtn).toBeDisabled();
    });
  });

  // =========================================================================
  // 3. In-flight Mutation State & Buttons Locking
  // =========================================================================
  describe('In-flight mutation state', () => {
    it('disables confirm button, close button, and edit triggers while commit is pending', async () => {
      const user = userEvent.setup();
      const previewData: BulkPublishPreviewResponse = {
        would_change: 1,
        blocked: [
          {
            id: 'l-blocked',
            missing: ['teacher'],
            title: 'Leçon en attente',
          },
        ],
      };

      let resolveCommit: (value: unknown) => void;
      const commitPromise = new Promise((resolve) => {
        resolveCommit = resolve;
      });

      globalThis.fetch = vi.fn().mockImplementation((url: string, options?: RequestInit) => {
        if (url.includes('/preview/')) {
          return Promise.resolve({
            ok: true,
            status: 200,
            text: () => Promise.resolve(JSON.stringify(previewData)),
          });
        }
        if (options?.method === 'POST') {
          return commitPromise;
        }
        return Promise.reject(new Error(`Unhandled: ${url}`));
      });

      const onCloseMock = vi.fn();
      render(
        <BulkPublishModal
          isOpen={true}
          onClose={onCloseMock}
          type="module"
          item={{ id: mockModule.id, name: mockModule.name }}
        />
      );

      const confirmBtn = await screen.findByTestId('bulk-publish-confirm-btn');
      const closeBtn = screen.getByTestId('bulk-publish-close-btn');

      // Click Confirm
      await user.click(confirmBtn);

      // Verify in-flight pending state
      expect(confirmBtn).toBeDisabled();
      expect(confirmBtn).toHaveTextContent('Publication en cours...');
      expect(closeBtn).toBeDisabled();

      // Blocked table edit button should also be disabled
      const editBtn = screen.getByTestId('edit-blocked-lesson-btn-l-blocked');
      expect(editBtn).toBeDisabled();

      // Resolve commit
      resolveCommit!({
        ok: true,
        status: 200,
        text: () =>
          Promise.resolve(
            JSON.stringify({
              changed: 1,
              errors: { blocked: [{ id: 'l-blocked', missing: ['teacher'] }] },
            })
          ),
      });

      await waitFor(() => {
        expect(screen.getByTestId('bulk-publish-success-notice')).toBeInTheDocument();
      });

      // Close button is re-enabled after completion
      expect(closeBtn).toBeEnabled();
    });
  });

  // =========================================================================
  // 4. AC-2: Container Lock Execution & Success Summary (HTTP 200)
  // =========================================================================
  describe('AC-2: Success state & parent synchronization', () => {
    it('displays plural success notice, preserves blocked drafts untouched, and triggers onSuccess', async () => {
      const user = userEvent.setup();
      const previewData: BulkPublishPreviewResponse = {
        would_change: 3,
        blocked: [
          {
            id: 'l-draft-1',
            missing: ['teacher'],
            title: 'Leçon Restant en Brouillon',
          },
        ],
      };

      const commitResponse: BulkPublishCommitResponse = {
        changed: 3,
        errors: {
          blocked: [{ id: 'l-draft-1', missing: ['teacher'] }],
        },
      };

      globalThis.fetch = vi.fn().mockImplementation((url: string, options?: RequestInit) => {
        if (url.includes('/preview/')) {
          return Promise.resolve({
            ok: true,
            status: 200,
            text: () => Promise.resolve(JSON.stringify(previewData)),
          });
        }
        if (options?.method === 'POST') {
          return Promise.resolve({
            ok: true,
            status: 200,
            text: () => Promise.resolve(JSON.stringify(commitResponse)),
          });
        }
        return Promise.reject(new Error(`Unhandled: ${url}`));
      });

      const onSuccessMock = vi.fn();
      render(
        <BulkPublishModal
          isOpen={true}
          onClose={vi.fn()}
          type="chapter"
          item={{ id: mockChapter.id, name: mockChapter.name }}
          onSuccess={onSuccessMock}
        />
      );

      const confirmBtn = await screen.findByTestId('bulk-publish-confirm-btn');
      await user.click(confirmBtn);

      // Verify success notice with plural changed count
      const successNotice = await screen.findByTestId('bulk-publish-success-notice');
      expect(successNotice).toBeInTheDocument();
      expect(successNotice).toHaveTextContent('3 leçons publiées avec succès.');

      // Blocked lesson table remains visible with untouched draft
      expect(screen.getByTestId('bulk-publish-blocked-summary')).toBeInTheDocument();
      expect(screen.getByText('Leçon Restant en Brouillon')).toBeInTheDocument();

      // Confirm button is disabled after successful commit
      expect(confirmBtn).toBeDisabled();

      // Parent callback was notified
      expect(onSuccessMock).toHaveBeenCalledTimes(1);
      expect(onSuccessMock).toHaveBeenCalledWith(commitResponse);
    });

    it('displays singular success notice when changed === 1', async () => {
      const user = userEvent.setup();
      const previewData: BulkPublishPreviewResponse = {
        would_change: 1,
        blocked: [],
      };

      const commitResponse: BulkPublishCommitResponse = {
        changed: 1,
        errors: { blocked: [] },
      };

      globalThis.fetch = vi.fn().mockImplementation((url: string, options?: RequestInit) => {
        if (url.includes('/preview/')) {
          return Promise.resolve({
            ok: true,
            status: 200,
            text: () => Promise.resolve(JSON.stringify(previewData)),
          });
        }
        if (options?.method === 'POST') {
          return Promise.resolve({
            ok: true,
            status: 200,
            text: () => Promise.resolve(JSON.stringify(commitResponse)),
          });
        }
        return Promise.reject(new Error(`Unhandled: ${url}`));
      });

      render(
        <BulkPublishModal
          isOpen={true}
          onClose={vi.fn()}
          type="chapter"
          item={{ id: mockChapter.id, name: mockChapter.name }}
        />
      );

      const confirmBtn = await screen.findByTestId('bulk-publish-confirm-btn');
      await user.click(confirmBtn);

      const successNotice = await screen.findByTestId('bulk-publish-success-notice');
      expect(successNotice).toHaveTextContent('1 leçon publiée avec succès.');
    });

    it('resets commitSuccess when loadPreview runs after quick-editing a blocked lesson', async () => {
      const user = userEvent.setup();
      let previewCallCount = 0;
      const initialPreview: BulkPublishPreviewResponse = {
        would_change: 1,
        blocked: [
          {
            id: 'l-blocked-resolved',
            missing: ['teacher'],
            title: 'Leçon bloquée',
          },
        ],
      };
      const refreshedPreview: BulkPublishPreviewResponse = {
        would_change: 2,
        blocked: [],
      };

      const mockLesson = {
        id: 'l-blocked-resolved',
        title: 'Leçon bloquée',
        description: 'Description valide',
        teacher: '',
        course_date: '2026-11-20',
        position: 1,
        is_deleted: false,
        is_published: false,
        last_modified_by: null,
        updated_at: '2026-11-04T10:00:00Z',
      };

      globalThis.fetch = vi.fn().mockImplementation((url: string, options?: RequestInit) => {
        if (url.includes('/preview/')) {
          previewCallCount++;
          return Promise.resolve({
            ok: true,
            status: 200,
            text: () =>
              Promise.resolve(
                JSON.stringify(previewCallCount === 1 ? initialPreview : refreshedPreview)
              ),
          });
        }
        if (options?.method === 'POST') {
          return Promise.resolve({
            ok: true,
            status: 200,
            text: () =>
              Promise.resolve(
                JSON.stringify({
                  changed: 1,
                  errors: { blocked: [{ id: 'l-blocked-resolved', missing: ['teacher'] }] },
                })
              ),
          });
        }
        if (url.includes('/api/v1/lessons/l-blocked-resolved/')) {
          if (options?.method === 'PATCH') {
            return Promise.resolve({
              ok: true,
              status: 200,
              text: () =>
                Promise.resolve(
                  JSON.stringify({ ...mockLesson, teacher: 'Professeur Test' })
                ),
            });
          }
          return Promise.resolve({
            ok: true,
            status: 200,
            text: () => Promise.resolve(JSON.stringify(mockLesson)),
          });
        }
        return Promise.reject(new Error(`Unhandled: ${url}`));
      });

      render(
        <BulkPublishModal
          isOpen={true}
          onClose={vi.fn()}
          type="module"
          item={{ id: mockModule.id, name: mockModule.name }}
        />
      );

      const confirmBtn = await screen.findByTestId('bulk-publish-confirm-btn');
      await user.click(confirmBtn);

      // Verify commit succeeded and confirm button is disabled
      await waitFor(() => {
        expect(screen.getByTestId('bulk-publish-success-notice')).toBeInTheDocument();
      });
      expect(confirmBtn).toBeDisabled();

      // Open quick edit drawer for the blocked lesson
      const editBtn = screen.getByTestId('edit-blocked-lesson-btn-l-blocked-resolved');
      await user.click(editBtn);

      // Drawer is open, fill teacher field and submit
      const teacherInput = await screen.findByTestId('quick-edit-teacher-input');
      await user.type(teacherInput, 'Professeur Test');
      await user.click(screen.getByTestId('quick-edit-save-btn'));

      // Once saved, loadPreview() is invoked: commitSuccess is cleared, ready summary shows 2 lessons, confirm re-enabled
      await waitFor(() => {
        expect(screen.queryByTestId('bulk-publish-success-notice')).not.toBeInTheDocument();
        expect(screen.getByTestId('bulk-publish-ready-summary')).toHaveTextContent(
          '2 leçons prêtes à être publiées'
        );
      });
      expect(confirmBtn).toBeEnabled();
    });
  });

  // =========================================================================
  // 5. AC-3: Concurrency Conflict (HTTP 409 Conflict) Auto-Refresh
  // =========================================================================
  describe('AC-3: Concurrency conflict (HTTP 409) handling & auto-refresh', () => {
    it('catches 409 Conflict, displays conflict alert, and immediately re-fetches preview live', async () => {
      const user = userEvent.setup();

      // Initial preview (stale)
      const stalePreview: BulkPublishPreviewResponse = {
        would_change: 2,
        blocked: [],
      };

      // Updated preview after concurrent modification by another user
      const freshPreview: BulkPublishPreviewResponse = {
        would_change: 1,
        blocked: [
          {
            id: 'l-newly-blocked',
            missing: ['course_date'],
            title: 'Leçon altérée par un tiers',
          },
        ],
      };

      let previewFetchCount = 0;
      const fetchSpy = vi.fn().mockImplementation((url: string, options?: RequestInit) => {
        if (url.includes('/preview/')) {
          previewFetchCount++;
          const data = previewFetchCount === 1 ? stalePreview : freshPreview;
          return Promise.resolve({
            ok: true,
            status: 200,
            text: () => Promise.resolve(JSON.stringify(data)),
          });
        }
        if (options?.method === 'POST') {
          // Backend answers 409 Conflict
          return Promise.resolve({
            ok: false,
            status: 409,
            text: () =>
              Promise.resolve(
                JSON.stringify({
                  type: 'https://brainx.edu/errors/conflict',
                  title: 'Conflit de concurrence',
                  status: 409,
                  detail: 'Le contenu du conteneur a été modifié par un autre utilisateur.',
                  errors: {},
                })
              ),
          });
        }
        return Promise.reject(new Error(`Unhandled: ${url}`));
      });
      globalThis.fetch = fetchSpy;

      render(
        <BulkPublishModal
          isOpen={true}
          onClose={vi.fn()}
          type="module"
          item={{ id: mockModule.id, name: mockModule.name }}
        />
      );

      // Verify initial preview
      expect(
        await screen.findByText('2 leçons prêtes à être publiées')
      ).toBeInTheDocument();
      expect(previewFetchCount).toBe(1);

      // Click Confirm
      const confirmBtn = screen.getByTestId('bulk-publish-confirm-btn');
      await user.click(confirmBtn);

      // Conflict alert must be displayed
      const conflictAlert = await screen.findByTestId('bulk-publish-conflict-alert');
      expect(conflictAlert).toBeInTheDocument();
      expect(conflictAlert).toHaveTextContent(
        'Le contenu du conteneur a été modifié par un autre utilisateur.'
      );

      // Auto-refresh should have triggered a second preview call
      expect(previewFetchCount).toBe(2);

      // Modal remains open and shows the freshly updated counts and table
      await waitFor(() => {
        expect(
          screen.getByText('1 leçon prête à être publiée')
        ).toBeInTheDocument();
        expect(
          screen.getByText('Leçon altérée par un tiers')
        ).toBeInTheDocument();
      });
    });
  });

  // =========================================================================
  // 6. Non-409 Error Handling (500 Server Error)
  // =========================================================================
  describe('General Error Handling (5xx / Network Error)', () => {
    it('surfaces RFC 9457 error alert on 500 server failure without closing modal', async () => {
      const user = userEvent.setup();
      const previewData: BulkPublishPreviewResponse = {
        would_change: 1,
        blocked: [],
      };

      globalThis.fetch = vi.fn().mockImplementation((url: string, options?: RequestInit) => {
        if (url.includes('/preview/')) {
          return Promise.resolve({
            ok: true,
            status: 200,
            text: () => Promise.resolve(JSON.stringify(previewData)),
          });
        }
        if (options?.method === 'POST') {
          return Promise.resolve({
            ok: false,
            status: 500,
            text: () =>
              Promise.resolve(
                JSON.stringify({
                  type: 'https://brainx.edu/errors/server-error',
                  title: 'Erreur interne du serveur',
                  status: 500,
                  detail: 'Échec inattendu du verrou de base de données.',
                  errors: {},
                })
              ),
          });
        }
        return Promise.reject(new Error(`Unhandled: ${url}`));
      });

      render(
        <BulkPublishModal
          isOpen={true}
          onClose={vi.fn()}
          type="module"
          item={{ id: mockModule.id, name: mockModule.name }}
        />
      );

      const confirmBtn = await screen.findByTestId('bulk-publish-confirm-btn');
      await user.click(confirmBtn);

      const errorAlert = await screen.findByTestId('bulk-publish-error');
      expect(errorAlert).toBeInTheDocument();
      expect(errorAlert).toHaveTextContent('Échec inattendu du verrou de base de données.');
      expect(screen.getByTestId('bulk-publish-modal')).toBeInTheDocument();
    });
  });

  // =========================================================================
  // 7. PublisherCoursePage Integration: onSuccess Callback
  // =========================================================================
  describe('PublisherCoursePage Integration (/publisher/courses/:id)', () => {
    it('synchronizes lessons list when bulk publish commit completes successfully', async () => {
      const user = userEvent.setup();

      const previewData: BulkPublishPreviewResponse = {
        would_change: 1,
        blocked: [],
      };

      const commitResponse: BulkPublishCommitResponse = {
        changed: 1,
        errors: { blocked: [] },
      };

      let lessonFetchCount = 0;
      globalThis.fetch = vi.fn().mockImplementation((url: string, options?: RequestInit) => {
        if (
          options?.method === 'POST' &&
          url.includes(`/api/v1/chapters/${mockChapter.id}/bulk-publish/`)
        ) {
          return Promise.resolve({
            ok: true,
            status: 200,
            text: () => Promise.resolve(JSON.stringify(commitResponse)),
          });
        }
        if (url.includes(`/api/v1/chapters/${mockChapter.id}/bulk-publish/preview/`)) {
          return Promise.resolve({
            ok: true,
            status: 200,
            text: () => Promise.resolve(JSON.stringify(previewData)),
          });
        }
        if (url.includes(`/api/v1/chapters/${mockChapter.id}/lessons/`)) {
          lessonFetchCount++;
          return Promise.resolve({
            ok: true,
            status: 200,
            text: () =>
              Promise.resolve(
                JSON.stringify({
                  count: 1,
                  next: null,
                  previous: null,
                  results: [
                    {
                      id: 'l1',
                      title: 'Introduction',
                      teacher: 'Ms Ada',
                      course_date: '2026-09-01',
                      position: 1,
                      is_deleted: false,
                      is_published: lessonFetchCount > 1, // Becomes published after bulk publish
                      last_modified_by: null,
                      updated_at: '2026-11-04T10:00:00Z',
                    },
                  ],
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

      render(
        <MemoryRouter initialEntries={[`/publisher/courses/${mockCourse.id}`]}>
          <Routes>
            <Route
              path="/publisher/courses/:courseId"
              element={<PublisherCoursePage />}
            />
          </Routes>
        </MemoryRouter>
      );

      // Wait for chapter to render in module
      await waitFor(() => {
        expect(
          screen.getByTestId(`chapter-name-${mockChapter.id}`)
        ).toHaveTextContent('Domain-Driven Design');
      });

      // Open chapter to expand and load lessons
      const expandBtn = screen.getByTestId(
        `expand-chapter-btn-${mockChapter.id}`
      );
      await user.click(expandBtn);

      // Initial lesson shows Brouillon
      expect(await screen.findByText('Brouillon')).toBeInTheDocument();
      expect(lessonFetchCount).toBe(1);

      // Click "Publier le chapitre en masse"
      const bulkPublishBtn = screen.getByTestId(
        `bulk-publish-chapter-btn-${mockChapter.id}`
      );
      await user.click(bulkPublishBtn);

      // Modal opens and loads preview
      const confirmBtn = await screen.findByTestId('bulk-publish-confirm-btn');
      expect(confirmBtn).toBeEnabled();

      // Click confirm
      await user.click(confirmBtn);

      // Success notice is displayed
      expect(
        await screen.findByTestId('bulk-publish-success-notice')
      ).toBeInTheDocument();

      // Parent was notified and re-fetched lessons
      await waitFor(() => {
        expect(lessonFetchCount).toBeGreaterThanOrEqual(2);
      });
    });

    it('synchronizes lessons for all descendant chapters when module bulk publish completes successfully', async () => {
      const user = userEvent.setup();

      const previewData: BulkPublishPreviewResponse = {
        would_change: 2,
        blocked: [],
      };

      const commitResponse: BulkPublishCommitResponse = {
        changed: 2,
        errors: { blocked: [] },
      };

      let chapter1LessonFetchCount = 0;
      let chapter2LessonFetchCount = 0;

      globalThis.fetch = vi.fn().mockImplementation((url: string, options?: RequestInit) => {
        if (
          options?.method === 'POST' &&
          url.includes(`/api/v1/modules/${mockModule.id}/bulk-publish/`)
        ) {
          return Promise.resolve({
            ok: true,
            status: 200,
            text: () => Promise.resolve(JSON.stringify(commitResponse)),
          });
        }
        if (url.includes(`/api/v1/modules/${mockModule.id}/bulk-publish/preview/`)) {
          return Promise.resolve({
            ok: true,
            status: 200,
            text: () => Promise.resolve(JSON.stringify(previewData)),
          });
        }
        if (url.includes(`/api/v1/chapters/${mockChapter.id}/lessons/`)) {
          chapter1LessonFetchCount++;
          return Promise.resolve({
            ok: true,
            status: 200,
            text: () =>
              Promise.resolve(
                JSON.stringify({
                  count: 1,
                  next: null,
                  previous: null,
                  results: [
                    {
                      id: 'l1',
                      title: 'Introduction DDD',
                      teacher: 'Ms Ada',
                      course_date: '2026-09-01',
                      position: 1,
                      is_deleted: false,
                      is_published: chapter1LessonFetchCount > 1,
                      last_modified_by: null,
                      updated_at: '2026-11-04T10:00:00Z',
                    },
                  ],
                })
              ),
          });
        }
        if (url.includes(`/api/v1/chapters/${mockChapter2.id}/lessons/`)) {
          chapter2LessonFetchCount++;
          return Promise.resolve({
            ok: true,
            status: 200,
            text: () =>
              Promise.resolve(
                JSON.stringify({
                  count: 1,
                  next: null,
                  previous: null,
                  results: [
                    {
                      id: 'l2',
                      title: 'Introduction Clean Arch',
                      teacher: 'Mr Bob',
                      course_date: '2026-09-02',
                      position: 1,
                      is_deleted: false,
                      is_published: chapter2LessonFetchCount > 1,
                      last_modified_by: null,
                      updated_at: '2026-11-04T10:00:00Z',
                    },
                  ],
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
                  count: 2,
                  next: null,
                  previous: null,
                  results: [mockChapter, mockChapter2],
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

      render(
        <MemoryRouter initialEntries={[`/publisher/courses/${mockCourse.id}`]}>
          <Routes>
            <Route
              path="/publisher/courses/:courseId"
              element={<PublisherCoursePage />}
            />
          </Routes>
        </MemoryRouter>
      );

      // Wait for chapter to render in module
      await waitFor(() => {
        expect(
          screen.getByTestId(`chapter-name-${mockChapter.id}`)
        ).toHaveTextContent('Domain-Driven Design');
      });

      // Expand Chapter 1 lessons
      const expandBtn = screen.getByTestId(
        `expand-chapter-btn-${mockChapter.id}`
      );
      await user.click(expandBtn);

      // Initial lesson in Chapter 1 shows Brouillon
      expect(await screen.findByText('Brouillon')).toBeInTheDocument();
      expect(chapter1LessonFetchCount).toBe(1);

      // Click "Publier le module en masse" on the module card
      const moduleBulkPublishBtn = screen.getByTestId(
        `bulk-publish-module-btn-${mockModule.id}`
      );
      await user.click(moduleBulkPublishBtn);

      // Modal opens and loads module preview
      const confirmBtn = await screen.findByTestId('bulk-publish-confirm-btn');
      expect(confirmBtn).toBeEnabled();

      // Click confirm
      await user.click(confirmBtn);

      // Success notice is displayed
      expect(
        await screen.findByTestId('bulk-publish-success-notice')
      ).toBeInTheDocument();

      // Descendant chapter lessons were re-fetched
      await waitFor(() => {
        expect(chapter1LessonFetchCount).toBeGreaterThanOrEqual(2);
        expect(chapter2LessonFetchCount).toBeGreaterThanOrEqual(1);
      });

      // Chapter 1's lesson now updates to "Publié"
      await waitFor(() => {
        expect(screen.getByText('Publié')).toBeInTheDocument();
      });
    });
  });
});
