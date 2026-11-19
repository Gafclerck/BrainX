import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import { render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { MemoryRouter, Routes, Route } from 'react-router-dom';
import { useAuthStore } from '@/features/auth/auth-store';
import {
  BulkPublishModal,
  fetchModuleBulkPublishPreview,
  fetchChapterBulkPublishPreview,
  PublisherCoursePage,
} from './index';
import type {
  PublisherCourseItem,
  PublisherModuleItem,
  PublisherChapterItem,
  BulkPublishPreviewResponse,
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

function setupStudentAuth() {
  useAuthStore.getState().setTokens({
    access: 'student_token',
    refresh: 'student_refresh_token',
  });
  useAuthStore.getState().setUser({
    id: 'u2222222-2222-2222-2222-222222222222',
    email: 'student@brainx.edu',
    is_publisher: false,
  });
  useAuthStore.getState().setIsPublisher(false);
}

describe('Story FE-5.2: Modale d’Inspection de Publication en Masse (bulk-publish/preview/)', () => {
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
  // 1. Client API Service Methods (fetchModuleBulkPublishPreview & fetchChapterBulkPublishPreview)
  // =========================================================================
  describe('Client API Services (api.ts)', () => {
    it('fetchModuleBulkPublishPreview dispatches GET /api/v1/modules/:id/bulk-publish/preview/ with bearer token', async () => {
      const mockPreview: BulkPublishPreviewResponse = {
        would_change: 3,
        blocked: [],
      };

      const fetchSpy = vi.fn().mockResolvedValue({
        ok: true,
        status: 200,
        text: () => Promise.resolve(JSON.stringify(mockPreview)),
      });
      globalThis.fetch = fetchSpy;

      const res = await fetchModuleBulkPublishPreview(mockModule.id);

      expect(fetchSpy).toHaveBeenCalledWith(
        expect.stringMatching(
          new RegExp(`/api/v1/modules/${mockModule.id}/bulk-publish/preview/\\??`)
        ),
        expect.objectContaining({
          headers: expect.objectContaining({
            Authorization: 'Bearer valid_publisher_token',
          }),
        })
      );
      expect(res).toEqual(mockPreview);
    });

    it('fetchChapterBulkPublishPreview dispatches GET /api/v1/chapters/:id/bulk-publish/preview/ with bearer token', async () => {
      const mockPreview: BulkPublishPreviewResponse = {
        would_change: 1,
        blocked: [{ id: 'l-blocked', missing: ['teacher'] }],
      };

      const fetchSpy = vi.fn().mockResolvedValue({
        ok: true,
        status: 200,
        text: () => Promise.resolve(JSON.stringify(mockPreview)),
      });
      globalThis.fetch = fetchSpy;

      const res = await fetchChapterBulkPublishPreview(mockChapter.id);

      expect(fetchSpy).toHaveBeenCalledWith(
        expect.stringMatching(
          new RegExp(`/api/v1/chapters/${mockChapter.id}/bulk-publish/preview/\\??`)
        ),
        expect.objectContaining({
          headers: expect.objectContaining({
            Authorization: 'Bearer valid_publisher_token',
          }),
        })
      );
      expect(res).toEqual(mockPreview);
    });

    it('throws ApiError on RFC 9457 error response from server', async () => {
      const rfcError = {
        type: 'https://brainx.edu/errors/server-error',
        title: 'Erreur interne du serveur',
        status: 500,
        detail: 'Impossible de calculer l’aperçu de publication.',
      };

      const fetchSpy = vi.fn().mockResolvedValue({
        ok: false,
        status: 500,
        text: () => Promise.resolve(JSON.stringify(rfcError)),
      });
      globalThis.fetch = fetchSpy;

      await expect(
        fetchModuleBulkPublishPreview(mockModule.id)
      ).rejects.toThrow();
    });
  });

  // =========================================================================
  // 2. BulkPublishModal Component States & Edge Cases
  // =========================================================================
  describe('BulkPublishModal Component', () => {
    it('displays loading state with role="status" while preview query is in flight', async () => {
      let resolvePromise: (value: unknown) => void;
      const hangingPromise = new Promise((resolve) => {
        resolvePromise = resolve;
      });

      globalThis.fetch = vi.fn().mockReturnValue(hangingPromise);

      const { unmount } = render(
        <BulkPublishModal
          isOpen={true}
          onClose={vi.fn()}
          type="module"
          item={{ id: mockModule.id, name: mockModule.name }}
        />
      );

      const loadingIndicator = screen.getByRole('status');
      expect(loadingIndicator).toBeInTheDocument();
      expect(screen.getByTestId('bulk-publish-loading')).toBeInTheDocument();
      expect(screen.getByTestId('bulk-publish-close-btn')).toBeDisabled();

      unmount();
      resolvePromise!({
        ok: true,
        status: 200,
        text: () => Promise.resolve(JSON.stringify({ would_change: 0, blocked: [] })),
      });
    });

    it('AC-2: renders plural summary "3 leçons prêtes à être publiées" when would_change > 1', async () => {
      const previewData: BulkPublishPreviewResponse = {
        would_change: 3,
        blocked: [],
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
          type="module"
          item={{ id: mockModule.id, name: mockModule.name }}
        />
      );

      await waitFor(() => {
        expect(screen.queryByRole('status')).not.toBeInTheDocument();
      });

      expect(
        screen.getByTestId('bulk-publish-ready-summary')
      ).toHaveTextContent('3 leçons prêtes à être publiées');
      expect(screen.queryByTestId('bulk-publish-blocked-summary')).not.toBeInTheDocument();
      expect(screen.queryByTestId('bulk-publish-all-published-notice')).not.toBeInTheDocument();
    });

    it('AC-2: renders singular summary "1 leçon prête à être publiée" when would_change === 1', async () => {
      const previewData: BulkPublishPreviewResponse = {
        would_change: 1,
        blocked: [],
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

      await waitFor(() => {
        expect(screen.queryByRole('status')).not.toBeInTheDocument();
      });

      expect(
        screen.getByTestId('bulk-publish-ready-summary')
      ).toHaveTextContent('1 leçon prête à être publiée');
    });

    it('AC-3: displays informative notice when all lessons are already published (would_change === 0 && blocked === [])', async () => {
      const previewData: BulkPublishPreviewResponse = {
        would_change: 0,
        blocked: [],
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
          type="module"
          item={{ id: mockModule.id, name: mockModule.name }}
        />
      );

      await waitFor(() => {
        expect(screen.queryByRole('status')).not.toBeInTheDocument();
      });

      const notice = screen.getByTestId('bulk-publish-all-published-notice');
      expect(notice).toHaveTextContent(
        "Toutes les leçons sont déjà publiées. Aucune mise à jour n'est requise."
      );
      expect(screen.queryByTestId('bulk-publish-ready-summary')).not.toBeInTheDocument();
      expect(screen.queryByTestId('bulk-publish-blocked-summary')).not.toBeInTheDocument();
    });

    it('renders mixed counts: ready lessons and single blocked lesson (would_change: 2, blocked: 1)', async () => {
      const previewData: BulkPublishPreviewResponse = {
        would_change: 2,
        blocked: [{ id: 'l1', missing: ['description'] }],
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
          type="module"
          item={{ id: mockModule.id, name: mockModule.name }}
        />
      );

      await waitFor(() => {
        expect(screen.queryByRole('status')).not.toBeInTheDocument();
      });

      expect(
        screen.getByTestId('bulk-publish-ready-summary')
      ).toHaveTextContent('2 leçons prêtes à être publiées');
      expect(
        screen.getByTestId('bulk-publish-blocked-summary')
      ).toHaveTextContent('1 leçon bloquée');
    });

    it('renders incomplete lessons only (would_change: 0, blocked: 2)', async () => {
      const previewData: BulkPublishPreviewResponse = {
        would_change: 0,
        blocked: [
          { id: 'l1', missing: ['teacher'] },
          { id: 'l2', missing: ['course_date', 'description'] },
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

      await waitFor(() => {
        expect(screen.queryByRole('status')).not.toBeInTheDocument();
      });

      expect(screen.queryByTestId('bulk-publish-ready-summary')).not.toBeInTheDocument();
      expect(
        screen.getByTestId('bulk-publish-blocked-summary')
      ).toHaveTextContent('2 leçons bloquées');
    });

    it('surfaces RFC 9457 error with role="alert" and allows retry via "Réessayer"', async () => {
      const user = userEvent.setup();

      // First call fails with 500
      let callCount = 0;
      globalThis.fetch = vi.fn().mockImplementation(() => {
        callCount++;
        if (callCount === 1) {
          return Promise.resolve({
            ok: false,
            status: 500,
            text: () =>
              Promise.resolve(
                JSON.stringify({
                  type: 'https://brainx.edu/errors/server-error',
                  title: 'Erreur interne du serveur',
                  status: 500,
                  detail: 'Le service de calcul d’aperçu est indisponible.',
                })
              ),
          });
        }
        return Promise.resolve({
          ok: true,
          status: 200,
          text: () =>
            Promise.resolve(
              JSON.stringify({
                would_change: 4,
                blocked: [],
              })
            ),
        });
      });

      render(
        <BulkPublishModal
          isOpen={true}
          onClose={vi.fn()}
          type="module"
          item={{ id: mockModule.id, name: mockModule.name }}
        />
      );

      // Loading is replaced by error alert
      await waitFor(() => {
        expect(screen.getByRole('alert')).toBeInTheDocument();
      });

      expect(screen.getByRole('alert')).toHaveTextContent(
        'Le service de calcul d’aperçu est indisponible.'
      );
      const retryBtn = screen.getByRole('button', { name: 'Réessayer' });
      expect(retryBtn).toBeInTheDocument();

      // Click retry
      await user.click(retryBtn);

      await waitFor(() => {
        expect(screen.queryByRole('alert')).not.toBeInTheDocument();
        expect(screen.getByTestId('bulk-publish-ready-summary')).toHaveTextContent(
          '4 leçons prêtes à être publiées'
        );
      });

      expect(callCount).toBe(2);
    });

    it('complies with accessible dialog standards (title, description, min 44px close target, escape)', async () => {
      const user = userEvent.setup();
      const onCloseMock = vi.fn();

      globalThis.fetch = vi.fn().mockResolvedValue({
        ok: true,
        status: 200,
        text: () => Promise.resolve(JSON.stringify({ would_change: 0, blocked: [] })),
      });

      render(
        <BulkPublishModal
          isOpen={true}
          onClose={onCloseMock}
          type="module"
          item={{ id: mockModule.id, name: mockModule.name }}
        />
      );

      await waitFor(() => {
        expect(screen.getByRole('dialog')).toBeInTheDocument();
      });

      // Dialog accessibility
      expect(screen.getByText('Publication en masse du module')).toBeInTheDocument();
      expect(
        screen.getByText(`Aperçu de la publication pour le module « ${mockModule.name} »`)
      ).toBeInTheDocument();

      // Close button min touch target 44px
      const closeBtn = screen.getByTestId('bulk-publish-close-btn');
      expect(closeBtn).toHaveClass('min-h-[44px]');
      expect(closeBtn).toHaveClass('min-w-[44px]');

      // Press Escape key to dismiss dialog
      await user.keyboard('{Escape}');
      expect(onCloseMock).toHaveBeenCalledTimes(1);

      // Also verify clicking close button calls onClose
      onCloseMock.mockClear();
      await user.click(closeBtn);
      expect(onCloseMock).toHaveBeenCalledTimes(1);
    });

    it('does not dispatch network request if isPublisher is false', async () => {
      setupStudentAuth();
      const fetchSpy = vi.fn();
      globalThis.fetch = fetchSpy;

      render(
        <BulkPublishModal
          isOpen={true}
          onClose={vi.fn()}
          type="module"
          item={{ id: mockModule.id, name: mockModule.name }}
        />
      );

      expect(fetchSpy).not.toHaveBeenCalled();
    });
  });

  // =========================================================================
  // 3. PublisherCoursePage Integration & Triggers
  // =========================================================================
  describe('PublisherCoursePage Integration (/publisher/courses/:id)', () => {
    function setupCourseHierarchyFetch(
      bulkPreviewModuleResponse?: BulkPublishPreviewResponse,
      bulkPreviewChapterResponse?: BulkPublishPreviewResponse
    ) {
      return vi.fn().mockImplementation((url: string) => {
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
        if (url.includes(`/api/v1/chapters/${mockChapter.id}/lessons/`)) {
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
        if (url.includes(`/api/v1/modules/${mockModule.id}/bulk-publish/preview/`)) {
          return Promise.resolve({
            ok: true,
            status: 200,
            text: () =>
              Promise.resolve(
                JSON.stringify(
                  bulkPreviewModuleResponse || {
                    would_change: 5,
                    blocked: [],
                  }
                )
              ),
          });
        }
        if (url.includes(`/api/v1/chapters/${mockChapter.id}/bulk-publish/preview/`)) {
          return Promise.resolve({
            ok: true,
            status: 200,
            text: () =>
              Promise.resolve(
                JSON.stringify(
                  bulkPreviewChapterResponse || {
                    would_change: 1,
                    blocked: [],
                  }
                )
              ),
          });
        }
        return Promise.resolve({
          ok: true,
          status: 200,
          text: () => Promise.resolve(JSON.stringify({})),
        });
      });
    }

    it('AC-1: launches BulkPublishModal when clicking "Publier le module en masse" on a module', async () => {
      const user = userEvent.setup();
      globalThis.fetch = setupCourseHierarchyFetch({
        would_change: 3,
        blocked: [],
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

      // Wait for module to render
      await waitFor(() => {
        expect(
          screen.getByTestId(`module-name-${mockModule.id}`)
        ).toHaveTextContent('Microservices & Patterns');
      });

      const moduleBulkBtn = screen.getByTestId(
        `bulk-publish-module-btn-${mockModule.id}`
      );
      expect(moduleBulkBtn).toBeInTheDocument();
      expect(moduleBulkBtn).toHaveClass('min-h-[44px]');
      expect(moduleBulkBtn).toHaveClass('min-w-[44px]');

      // Click "Publier le module en masse"
      await user.click(moduleBulkBtn);

      // Modal opens and loads preview
      await waitFor(() => {
        expect(screen.getByTestId('bulk-publish-modal')).toBeInTheDocument();
        expect(
          screen.getByTestId('bulk-publish-ready-summary')
        ).toHaveTextContent('3 leçons prêtes à être publiées');
      });

      // Close modal
      const closeBtn = screen.getByTestId('bulk-publish-close-btn');
      await user.click(closeBtn);

      await waitFor(() => {
        expect(screen.queryByTestId('bulk-publish-modal')).not.toBeInTheDocument();
      });
    });

    it('AC-1: launches BulkPublishModal when clicking "Publier le chapitre en masse" on a chapter', async () => {
      const user = userEvent.setup();
      globalThis.fetch = setupCourseHierarchyFetch(
        undefined,
        {
          would_change: 1,
          blocked: [],
        }
      );

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

      // Wait for chapter to render
      await waitFor(() => {
        expect(
          screen.getByTestId(`chapter-name-${mockChapter.id}`)
        ).toHaveTextContent('Domain-Driven Design');
      });

      const chapterBulkBtn = screen.getByTestId(
        `bulk-publish-chapter-btn-${mockChapter.id}`
      );
      expect(chapterBulkBtn).toBeInTheDocument();
      expect(chapterBulkBtn).toHaveClass('min-h-[44px]');
      expect(chapterBulkBtn).toHaveClass('min-w-[44px]');

      // Click "Publier le chapitre en masse"
      await user.click(chapterBulkBtn);

      // Modal opens and loads preview
      await waitFor(() => {
        expect(screen.getByTestId('bulk-publish-modal')).toBeInTheDocument();
        expect(
          screen.getByTestId('bulk-publish-ready-summary')
        ).toHaveTextContent('1 leçon prête à être publiée');
      });
    });

    it('disables bulk publish buttons when isPublisher is false', async () => {
      setupStudentAuth();
      globalThis.fetch = setupCourseHierarchyFetch();

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

      await waitFor(() => {
        expect(
          screen.getByTestId(`module-name-${mockModule.id}`)
        ).toBeInTheDocument();
      });

      const moduleBulkBtn = screen.getByTestId(
        `bulk-publish-module-btn-${mockModule.id}`
      );
      const chapterBulkBtn = screen.getByTestId(
        `bulk-publish-chapter-btn-${mockChapter.id}`
      );

      expect(moduleBulkBtn).toBeDisabled();
      expect(chapterBulkBtn).toBeDisabled();
    });

    it('disables bulk publish buttons for soft-deleted modules and chapters', async () => {
      const deletedModule: PublisherModuleItem = {
        ...mockModule,
        id: 'm-del',
        is_deleted: true,
      };
      const deletedChapter: PublisherChapterItem = {
        ...mockChapter,
        id: 'ch-del',
        is_deleted: true,
      };

      globalThis.fetch = vi.fn().mockImplementation((url: string) => {
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
                  results: [deletedModule],
                })
              ),
          });
        }
        if (url.includes(`/api/v1/modules/${deletedModule.id}/chapters/`)) {
          return Promise.resolve({
            ok: true,
            status: 200,
            text: () =>
              Promise.resolve(
                JSON.stringify({
                  count: 1,
                  next: null,
                  previous: null,
                  results: [deletedChapter],
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

      await waitFor(() => {
        expect(screen.getByTestId(`module-name-${deletedModule.id}`)).toBeInTheDocument();
      });

      expect(screen.getByTestId(`bulk-publish-module-btn-${deletedModule.id}`)).toBeDisabled();
      expect(screen.getByTestId(`bulk-publish-chapter-btn-${deletedChapter.id}`)).toBeDisabled();
    });
  });
});
