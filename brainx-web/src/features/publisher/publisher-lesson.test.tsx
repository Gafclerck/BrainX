import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { MemoryRouter } from 'react-router-dom';
import { useAuthStore } from '@/features/auth/auth-store';
import { AppRoutes } from '@/routes';
import {
  PublisherLessonPage,
  MoveLessonModal,
  fetchManageableLesson,
  updateLesson,
  moveLesson,
  fetchAllManageableChapters,
} from './index';
import { ApiError } from '@/lib/api';
import type {
  PublisherLessonItem,
  ChapterOptionItem,
  PublisherCourseItem,
  PublisherModuleItem,
  PublisherChapterItem,
} from './types';

const mockLesson: PublisherLessonItem = {
  id: 'l1111111-1111-1111-1111-111111111111',
  chapter_id: 'ch111111-1111-1111-1111-111111111111',
  title: 'Introduction aux Architectures Distribuées',
  description: 'Une vue d’ensemble complète des modèles de consistance et du consensus.',
  teacher: 'Prof. Ada Lovelace',
  course_date: '2026-10-31',
  keywords: 'distribué, raft, paxos, consensus',
  position: 1,
  is_deleted: false,
  is_published: true,
  last_modified_by: {
    id: 'u1111111-1111-1111-1111-111111111111',
    email: 'publisher@brainx.edu',
  },
  updated_at: '2026-10-31T09:00:00Z',
};

const mockDraftLesson: PublisherLessonItem = {
  ...mockLesson,
  id: 'l2222222-2222-2222-2222-222222222222',
  title: 'Leçon en Brouillon',
  description: '',
  is_published: false,
};

const mockChaptersList: ChapterOptionItem[] = [
  {
    id: 'ch111111-1111-1111-1111-111111111111',
    name: 'Élection du Leader',
    course_name: 'Systèmes Distribués',
    module_name: 'Consensus Raft',
    courseName: 'Systèmes Distribués',
    moduleName: 'Consensus Raft',
  },
  {
    id: 'ch222222-2222-2222-2222-222222222222',
    name: 'Réplication de Journal',
    course_name: 'Systèmes Distribués',
    module_name: 'Consensus Raft',
    courseName: 'Systèmes Distribués',
    moduleName: 'Consensus Raft',
  },
  {
    id: 'ch333333-3333-3333-3333-333333333333',
    name: 'Sécurité et Quorum',
    course_name: 'Algorithmique Avancée',
    module_name: 'Tolérance aux pannes',
    courseName: 'Algorithmique Avancée',
    moduleName: 'Tolérance aux pannes',
  },
];

function setupPublisherAuth() {
  useAuthStore.getState().setTokens({
    access: 'mock-access-token',
    refresh: 'mock-refresh-token',
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
    access: 'mock-access-token',
    refresh: 'mock-refresh-token',
  });
  useAuthStore.getState().setUser({
    id: 'u9999999-9999-9999-9999-999999999999',
    email: 'student@brainx.edu',
    is_publisher: false,
  });
  useAuthStore.getState().setIsPublisher(false);
}

describe('Story FE-4.4: Éditeur de Leçon : Métadonnées Obligatoires & Déplacement de Chapitre', () => {
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
  // 1. Client API Service Functions (api.ts)
  // =========================================================================
  describe('Client API Services (api.ts)', () => {
    it('fetchManageableLesson calls GET /api/v1/lessons/:id/', async () => {
      const fetchSpy = vi.fn().mockResolvedValue({
        ok: true,
        status: 200,
        text: () => Promise.resolve(JSON.stringify(mockLesson)),
      });
      globalThis.fetch = fetchSpy;

      const result = await fetchManageableLesson(mockLesson.id);

      expect(fetchSpy).toHaveBeenCalledWith(
        expect.stringMatching(new RegExp(`/api/v1/lessons/${mockLesson.id}/$`)),
        expect.objectContaining({
          headers: expect.objectContaining({
            Authorization: 'Bearer mock-access-token',
          }),
        })
      );
      expect(result.id).toBe(mockLesson.id);
      expect(result.title).toBe(mockLesson.title);
    });

    it('updateLesson calls PATCH /api/v1/lessons/:id/ with updated payload', async () => {
      const updatedMock = { ...mockLesson, title: 'Nouveau Titre' };
      const fetchSpy = vi.fn().mockResolvedValue({
        ok: true,
        status: 200,
        text: () => Promise.resolve(JSON.stringify(updatedMock)),
      });
      globalThis.fetch = fetchSpy;

      const result = await updateLesson(mockLesson.id, {
        title: 'Nouveau Titre',
        teacher: 'Dr. Turing',
        course_date: '2026-11-01',
      });

      expect(fetchSpy).toHaveBeenCalledWith(
        expect.stringMatching(new RegExp(`/api/v1/lessons/${mockLesson.id}/$`)),
        expect.objectContaining({
          method: 'PATCH',
          body: JSON.stringify({
            title: 'Nouveau Titre',
            teacher: 'Dr. Turing',
            course_date: '2026-11-01',
          }),
        })
      );
      expect(result.title).toBe('Nouveau Titre');
    });

    it('moveLesson sends POST /api/v1/lessons/:id/move/ with { new_chapter_id }', async () => {
      const movedMock = {
        ...mockLesson,
        chapter_id: 'ch222222-2222-2222-2222-222222222222',
      };
      const fetchSpy = vi.fn().mockResolvedValue({
        ok: true,
        status: 200,
        text: () => Promise.resolve(JSON.stringify(movedMock)),
      });
      globalThis.fetch = fetchSpy;

      const result = await moveLesson(
        mockLesson.id,
        'ch222222-2222-2222-2222-222222222222'
      );

      expect(fetchSpy).toHaveBeenCalledWith(
        expect.stringMatching(
          new RegExp(`/api/v1/lessons/${mockLesson.id}/move/`)
        ),
        expect.objectContaining({
          method: 'POST',
          body: JSON.stringify({
            new_chapter_id: 'ch222222-2222-2222-2222-222222222222',
          }),
        })
      );
      expect(result.chapter_id).toBe('ch222222-2222-2222-2222-222222222222');
    });

    it('fetchAllManageableChapters traverses courses, modules and chapters', async () => {
      const mockCoursesPage = {
        count: 1,
        next: null,
        previous: null,
        results: [
          {
            id: 'c1',
            name: 'Cours 1',
            subject: 'Informatique',
            is_deleted: false,
          },
        ],
      };
      const mockModulesPage = {
        count: 1,
        next: null,
        previous: null,
        results: [{ id: 'm1', name: 'Module 1', is_deleted: false }],
      };
      const mockChaptersPage = {
        count: 1,
        next: null,
        previous: null,
        results: [{ id: 'ch1', name: 'Chapitre 1', is_deleted: false }],
      };

      const fetchSpy = vi.fn().mockImplementation((url: string) => {
        if (url.includes('/chapters/')) {
          return Promise.resolve({
            ok: true,
            status: 200,
            text: () => Promise.resolve(JSON.stringify(mockChaptersPage)),
          });
        }
        if (url.includes('/modules/')) {
          return Promise.resolve({
            ok: true,
            status: 200,
            text: () => Promise.resolve(JSON.stringify(mockModulesPage)),
          });
        }
        if (url.includes('/courses/')) {
          return Promise.resolve({
            ok: true,
            status: 200,
            text: () => Promise.resolve(JSON.stringify(mockCoursesPage)),
          });
        }
        return Promise.reject(new Error(`Unexpected url: ${url}`));
      });
      globalThis.fetch = fetchSpy;

      const items = await fetchAllManageableChapters();
      expect(items).toHaveLength(1);
      expect(items[0].id).toBe('ch1');
      expect(items[0].name).toBe('Chapitre 1');
      expect(items[0].course_name).toBe('Cours 1');
      expect(items[0].module_name).toBe('Module 1');
    });
  });

  // =========================================================================
  // 2. MoveLessonModal Unit Tests
  // =========================================================================
  describe('MoveLessonModal Component', () => {
    it('renders modal with hierarchical options and excludes current chapter', async () => {
      const fetchSpy = vi.fn().mockImplementation((url: string) => {
        if (url.includes('/api/v1/courses/')) {
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
                      id: 'c1',
                      name: 'Systèmes Distribués',
                      is_deleted: false,
                    },
                  ],
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
                  count: 2,
                  next: null,
                  previous: null,
                  results: [
                    {
                      id: 'ch111111-1111-1111-1111-111111111111',
                      name: 'Élection du Leader',
                      is_deleted: false,
                    },
                    {
                      id: 'ch222222-2222-2222-2222-222222222222',
                      name: 'Réplication de Journal',
                      is_deleted: false,
                    },
                  ],
                })
              ),
          });
        }
        if (url.includes('/modules/')) {
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
                    { id: 'm1', name: 'Consensus Raft', is_deleted: false },
                  ],
                })
              ),
          });
        }
        return Promise.reject(new Error(`Unexpected ${url}`));
      });
      globalThis.fetch = fetchSpy;

      render(
        <MoveLessonModal
          isOpen={true}
          onClose={vi.fn()}
          lessonId={mockLesson.id}
          currentChapterId="ch111111-1111-1111-1111-111111111111"
          onSuccess={vi.fn()}
        />
      );

      expect(screen.getByTestId('move-lesson-modal')).toBeInTheDocument();
      expect(screen.getByTestId('move-lesson-modal-title')).toHaveTextContent(
        'Déplacer la leçon'
      );

      await waitFor(() => {
        expect(
          screen.getByTestId('target-chapter-select')
        ).toBeInTheDocument();
      });

      const select = screen.getByTestId(
        'target-chapter-select'
      ) as HTMLSelectElement;
      expect(select).toBeInTheDocument();

      // Current chapter option is disabled
      const currentOption = screen.getByRole('option', {
        name: /Élection du Leader.*\(Actuel\)/,
      });
      expect(currentOption).toBeDisabled();

      // Target chapter option is enabled
      const targetOption = screen.getByRole('option', {
        name: /Réplication de Journal/,
      });
      expect(targetOption).not.toBeDisabled();
    });

    it('submits move request with new_chapter_id and calls onSuccess', async () => {
      const user = userEvent.setup();
      const onSuccessSpy = vi.fn();
      const onCloseSpy = vi.fn();

      const fetchSpy = vi.fn().mockImplementation((url: string, opts?: any) => {
        if (opts?.method === 'POST') {
          return Promise.resolve({
            ok: true,
            status: 200,
            text: () =>
              Promise.resolve(
                JSON.stringify({
                  ...mockLesson,
                  chapter_id: 'ch222222-2222-2222-2222-222222222222',
                })
              ),
          });
        }
        if (url.includes('/api/v1/courses/')) {
          return Promise.resolve({
            ok: true,
            status: 200,
            text: () =>
              Promise.resolve(
                JSON.stringify({
                  count: 1,
                  next: null,
                  previous: null,
                  results: [{ id: 'c1', name: 'Cours 1', is_deleted: false }],
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
                  count: 2,
                  next: null,
                  previous: null,
                  results: [
                    {
                      id: 'ch111111-1111-1111-1111-111111111111',
                      name: 'Chapitre 1',
                      is_deleted: false,
                    },
                    {
                      id: 'ch222222-2222-2222-2222-222222222222',
                      name: 'Chapitre 2',
                      is_deleted: false,
                    },
                  ],
                })
              ),
          });
        }
        if (url.includes('/modules/')) {
          return Promise.resolve({
            ok: true,
            status: 200,
            text: () =>
              Promise.resolve(
                JSON.stringify({
                  count: 1,
                  next: null,
                  previous: null,
                  results: [{ id: 'm1', name: 'Module 1', is_deleted: false }],
                })
              ),
          });
        }
        return Promise.reject(new Error(`Unexpected ${url}`));
      });
      globalThis.fetch = fetchSpy;

      render(
        <MoveLessonModal
          isOpen={true}
          onClose={onCloseSpy}
          lessonId={mockLesson.id}
          currentChapterId="ch111111-1111-1111-1111-111111111111"
          onSuccess={onSuccessSpy}
        />
      );

      await waitFor(() => {
        expect(
          screen.getByTestId('target-chapter-select')
        ).toBeInTheDocument();
      });

      const select = screen.getByTestId('target-chapter-select');
      await user.selectOptions(select, 'ch222222-2222-2222-2222-222222222222');

      const submitBtn = screen.getByTestId('confirm-move-btn');
      expect(submitBtn).toBeEnabled();
      await user.click(submitBtn);

      await waitFor(() => {
        expect(fetchSpy).toHaveBeenCalledWith(
          expect.stringMatching(
            new RegExp(`/api/v1/lessons/${mockLesson.id}/move/`)
          ),
          expect.objectContaining({
            method: 'POST',
            body: JSON.stringify({
              new_chapter_id: 'ch222222-2222-2222-2222-222222222222',
            }),
          })
        );
        expect(onSuccessSpy).toHaveBeenCalledWith(
          expect.objectContaining({
            chapter_id: 'ch222222-2222-2222-2222-222222222222',
          })
        );
        expect(onCloseSpy).toHaveBeenCalled();
      });
    });

    it('displays error alert inside modal when server rejects move', async () => {
      const user = userEvent.setup();

      const fetchSpy = vi.fn().mockImplementation((url: string, opts?: any) => {
        if (opts?.method === 'POST') {
          return Promise.resolve({
            ok: false,
            status: 400,
            text: () =>
              Promise.resolve(
                JSON.stringify({
                  type: 'validation_error',
                  title: 'Validation Error',
                  status: 400,
                  detail: 'Invalid destination chapter.',
                  errors: {
                    chapter: ['must name a different Chapter'],
                  },
                })
              ),
          });
        }
        if (url.includes('/api/v1/courses/')) {
          return Promise.resolve({
            ok: true,
            status: 200,
            text: () =>
              Promise.resolve(
                JSON.stringify({
                  count: 1,
                  next: null,
                  previous: null,
                  results: [{ id: 'c1', name: 'Cours 1', is_deleted: false }],
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
                  count: 2,
                  next: null,
                  previous: null,
                  results: [
                    {
                      id: 'ch1',
                      name: 'Chapitre 1',
                      is_deleted: false,
                    },
                    {
                      id: 'ch2',
                      name: 'Chapitre 2',
                      is_deleted: false,
                    },
                  ],
                })
              ),
          });
        }
        if (url.includes('/modules/')) {
          return Promise.resolve({
            ok: true,
            status: 200,
            text: () =>
              Promise.resolve(
                JSON.stringify({
                  count: 1,
                  next: null,
                  previous: null,
                  results: [{ id: 'm1', name: 'Module 1', is_deleted: false }],
                })
              ),
          });
        }
        return Promise.reject(new Error(`Unexpected ${url}`));
      });
      globalThis.fetch = fetchSpy;

      render(
        <MoveLessonModal
          isOpen={true}
          onClose={vi.fn()}
          lessonId={mockLesson.id}
          currentChapterId="ch1"
          onSuccess={vi.fn()}
        />
      );

      await waitFor(() => {
        expect(
          screen.getByTestId('target-chapter-select')
        ).toBeInTheDocument();
      });

      await user.selectOptions(screen.getByTestId('target-chapter-select'), 'ch2');
      await user.click(screen.getByTestId('confirm-move-btn'));

      await waitFor(() => {
        expect(screen.getByTestId('move-error-alert')).toBeInTheDocument();
        expect(screen.getByTestId('move-error-alert')).toHaveTextContent(
          'must name a different Chapter'
        );
      });
    });

    it('cancels modal on cancel button click without submitting', async () => {
      const user = userEvent.setup();
      const onCloseSpy = vi.fn();

      const fetchSpy = vi.fn().mockImplementation((url: string) => {
        if (url.includes('/api/v1/courses/')) {
          return Promise.resolve({
            ok: true,
            status: 200,
            text: () =>
              Promise.resolve(
                JSON.stringify({ count: 0, next: null, results: [] })
              ),
          });
        }
        return Promise.reject(new Error(`Unexpected ${url}`));
      });
      globalThis.fetch = fetchSpy;

      render(
        <MoveLessonModal
          isOpen={true}
          onClose={onCloseSpy}
          lessonId={mockLesson.id}
          onSuccess={vi.fn()}
        />
      );

      await user.click(screen.getByTestId('cancel-move-btn'));
      expect(onCloseSpy).toHaveBeenCalled();
    });
  });

  // =========================================================================
  // 3. PublisherLessonPage Integration Tests
  // =========================================================================
  describe('PublisherLessonPage Integration', () => {
    it('loads lesson and prepopulates metadata fields and publication badge', async () => {
      const fetchSpy = vi.fn().mockResolvedValue({
        ok: true,
        status: 200,
        text: () => Promise.resolve(JSON.stringify(mockLesson)),
      });
      globalThis.fetch = fetchSpy;

      render(
        <MemoryRouter initialEntries={[`/publisher/lessons/${mockLesson.id}`]}>
          <AppRoutes />
        </MemoryRouter>
      );

      expect(screen.getByTestId('lesson-loading')).toBeInTheDocument();

      await waitFor(() => {
        expect(screen.getByTestId('lesson-title-heading')).toHaveTextContent(
          mockLesson.title
        );
      });

      expect(
        screen.getByTestId('breadcrumb-lesson-title')
      ).toHaveTextContent(mockLesson.title);
      expect(
        screen.getByTestId('lesson-published-badge')
      ).toHaveTextContent('Publié');

      expect(screen.getByTestId('lesson-title-input')).toHaveValue(
        mockLesson.title
      );
      expect(screen.getByTestId('lesson-teacher-input')).toHaveValue(
        mockLesson.teacher
      );
      expect(screen.getByTestId('lesson-date-input')).toHaveValue(
        mockLesson.course_date
      );
      expect(screen.getByTestId('lesson-description-input')).toHaveValue(
        mockLesson.description!
      );
      expect(screen.getByTestId('lesson-keywords-input')).toHaveValue(
        mockLesson.keywords!
      );
    });

    it('client validation blocks submission and focuses field when required fields are empty', async () => {
      const user = userEvent.setup();
      const fetchSpy = vi.fn().mockResolvedValue({
        ok: true,
        status: 200,
        text: () => Promise.resolve(JSON.stringify(mockLesson)),
      });
      globalThis.fetch = fetchSpy;

      render(
        <MemoryRouter initialEntries={[`/publisher/lessons/${mockLesson.id}`]}>
          <AppRoutes />
        </MemoryRouter>
      );

      await waitFor(() => {
        expect(screen.getByTestId('lesson-title-input')).toBeInTheDocument();
      });

      // Clear title
      const titleInput = screen.getByTestId('lesson-title-input');
      await user.clear(titleInput);

      // Submit form
      await user.click(screen.getByTestId('save-lesson-btn'));

      await waitFor(() => {
        expect(screen.getByTestId('title-error')).toBeInTheDocument();
        expect(screen.getByTestId('title-error')).toHaveTextContent(
          'Le titre est obligatoire.'
        );
      });
      expect(titleInput).toHaveFocus();

      // Ensure no PATCH request was sent
      expect(
        fetchSpy.mock.calls.some((c: any[]) => c[1]?.method === 'PATCH')
      ).toBe(false);
    });

    it('client validation rejects empty description on published lesson', async () => {
      const user = userEvent.setup();
      const fetchSpy = vi.fn().mockResolvedValue({
        ok: true,
        status: 200,
        text: () => Promise.resolve(JSON.stringify(mockLesson)), // is_published: true
      });
      globalThis.fetch = fetchSpy;

      render(
        <MemoryRouter initialEntries={[`/publisher/lessons/${mockLesson.id}`]}>
          <AppRoutes />
        </MemoryRouter>
      );

      await waitFor(() => {
        expect(
          screen.getByTestId('lesson-description-input')
        ).toBeInTheDocument();
      });

      const descInput = screen.getByTestId('lesson-description-input');
      await user.clear(descInput);

      await user.click(screen.getByTestId('save-lesson-btn'));

      await waitFor(() => {
        expect(screen.getByTestId('description-error')).toBeInTheDocument();
        expect(screen.getByTestId('description-error')).toHaveTextContent(
          'La description est obligatoire pour une leçon publiée.'
        );
      });
      expect(descInput).toHaveFocus();
    });

    it('client validation rejects invalid date format', async () => {
      const user = userEvent.setup();
      const fetchSpy = vi.fn().mockResolvedValue({
        ok: true,
        status: 200,
        text: () => Promise.resolve(JSON.stringify(mockLesson)),
      });
      globalThis.fetch = fetchSpy;

      render(
        <MemoryRouter initialEntries={[`/publisher/lessons/${mockLesson.id}`]}>
          <AppRoutes />
        </MemoryRouter>
      );

      await waitFor(() => {
        expect(screen.getByTestId('lesson-date-input')).toBeInTheDocument();
      });

      const dateInput = screen.getByTestId('lesson-date-input');
      await user.clear(dateInput);
      await user.type(dateInput, '2026/13/45');

      await user.click(screen.getByTestId('save-lesson-btn'));

      await waitFor(() => {
        expect(screen.getByTestId('course-date-error')).toBeInTheDocument();
        expect(screen.getByTestId('course-date-error')).toHaveTextContent(
          'Format de date invalide'
        );
      });
    });

    it('saves valid metadata changes, updates state and displays success banner', async () => {
      const user = userEvent.setup();
      const updatedResponse = {
        ...mockLesson,
        title: 'Titre Modifié avec Succès',
        teacher: 'Dr. Katherine Johnson',
      };

      const fetchSpy = vi.fn().mockImplementation((_url: string, opts?: any) => {
        if (opts?.method === 'PATCH') {
          return Promise.resolve({
            ok: true,
            status: 200,
            text: () => Promise.resolve(JSON.stringify(updatedResponse)),
          });
        }
        return Promise.resolve({
          ok: true,
          status: 200,
          text: () => Promise.resolve(JSON.stringify(mockLesson)),
        });
      });
      globalThis.fetch = fetchSpy;

      render(
        <MemoryRouter initialEntries={[`/publisher/lessons/${mockLesson.id}`]}>
          <AppRoutes />
        </MemoryRouter>
      );

      await waitFor(() => {
        expect(screen.getByTestId('lesson-title-input')).toBeInTheDocument();
      });

      const titleInput = screen.getByTestId('lesson-title-input');
      await user.clear(titleInput);
      await user.type(titleInput, 'Titre Modifié avec Succès');

      const teacherInput = screen.getByTestId('lesson-teacher-input');
      await user.clear(teacherInput);
      await user.type(teacherInput, 'Dr. Katherine Johnson');

      await user.click(screen.getByTestId('save-lesson-btn'));

      await waitFor(() => {
        expect(screen.getByTestId('lesson-save-success')).toBeInTheDocument();
        expect(screen.getByTestId('lesson-save-success')).toHaveTextContent(
          'Modifications enregistrées avec succès.'
        );
      });

      expect(screen.getByTestId('lesson-title-heading')).toHaveTextContent(
        'Titre Modifié avec Succès'
      );
    });

    it('saves draft lesson with empty description and empty keywords without submitting null', async () => {
      const user = userEvent.setup();
      let capturedPayload: any = null;

      const fetchSpy = vi.fn().mockImplementation((_url: string, opts?: any) => {
        if (opts?.method === 'PATCH') {
          capturedPayload = JSON.parse(opts.body);
          return Promise.resolve({
            ok: true,
            status: 200,
            text: () => Promise.resolve(JSON.stringify({ ...mockDraftLesson, ...capturedPayload })),
          });
        }
        return Promise.resolve({
          ok: true,
          status: 200,
          text: () => Promise.resolve(JSON.stringify(mockDraftLesson)),
        });
      });
      globalThis.fetch = fetchSpy;

      render(
        <MemoryRouter initialEntries={[`/publisher/lessons/${mockDraftLesson.id}`]}>
          <AppRoutes />
        </MemoryRouter>
      );

      await waitFor(() => {
        expect(screen.getByTestId('lesson-title-input')).toBeInTheDocument();
      });

      const keywordsInput = screen.getByTestId('lesson-keywords-input');
      await user.clear(keywordsInput);

      await user.click(screen.getByTestId('save-lesson-btn'));

      await waitFor(() => {
        expect(screen.getByTestId('lesson-save-success')).toBeInTheDocument();
      });

      expect(capturedPayload).not.toBeNull();
      expect(capturedPayload.description).toBe('');
      expect(capturedPayload.keywords).toBe('');
      expect(capturedPayload.description).not.toBeNull();
      expect(capturedPayload.keywords).not.toBeNull();
    });

    it('maps server RFC 9457 400 validation errors to corresponding fields', async () => {
      const user = userEvent.setup();

      const fetchSpy = vi.fn().mockImplementation((_url: string, opts?: any) => {
        if (opts?.method === 'PATCH') {
          return Promise.resolve({
            ok: false,
            status: 400,
            text: () =>
              Promise.resolve(
                JSON.stringify({
                  type: 'validation_error',
                  title: 'Validation Error',
                  status: 400,
                  detail: 'Les champs fournis sont invalides.',
                  errors: {
                    title: ['Ce titre est déjà utilisé.'],
                    teacher: ['Nom d’enseignant invalide.'],
                  },
                })
              ),
          });
        }
        return Promise.resolve({
          ok: true,
          status: 200,
          text: () => Promise.resolve(JSON.stringify(mockLesson)),
        });
      });
      globalThis.fetch = fetchSpy;

      render(
        <MemoryRouter initialEntries={[`/publisher/lessons/${mockLesson.id}`]}>
          <AppRoutes />
        </MemoryRouter>
      );

      await waitFor(() => {
        expect(screen.getByTestId('save-lesson-btn')).toBeInTheDocument();
      });

      await user.click(screen.getByTestId('save-lesson-btn'));

      await waitFor(() => {
        expect(screen.getByTestId('title-error')).toHaveTextContent(
          'Ce titre est déjà utilisé.'
        );
        expect(screen.getByTestId('teacher-error')).toHaveTextContent(
          'Nom d’enseignant invalide.'
        );
      });

      // Inputs remain editable
      expect(screen.getByTestId('lesson-title-input')).not.toBeDisabled();
    });

    it('displays error 404 state when lesson is not found', async () => {
      const fetchSpy = vi.fn().mockResolvedValue({
        ok: false,
        status: 404,
        text: () =>
          Promise.resolve(
            JSON.stringify({
              type: 'not_found',
              title: 'Not Found',
              status: 404,
              detail: 'Leçon introuvable.',
            })
          ),
      });
      globalThis.fetch = fetchSpy;

      render(
        <MemoryRouter initialEntries={['/publisher/lessons/unknown-id']}>
          <AppRoutes />
        </MemoryRouter>
      );

      await waitFor(() => {
        expect(screen.getByTestId('lesson-error')).toBeInTheDocument();
        expect(screen.getByTestId('lesson-error')).toHaveTextContent(
          'Leçon introuvable'
        );
      });
    });

    it('opens MoveLessonModal on button click, moves lesson, and announces confirmation', async () => {
      const user = userEvent.setup();

      const fetchSpy = vi.fn().mockImplementation((url: string, opts?: any) => {
        if (opts?.method === 'POST' && url.includes('/move/')) {
          return Promise.resolve({
            ok: true,
            status: 200,
            text: () =>
              Promise.resolve(
                JSON.stringify({
                  ...mockLesson,
                  chapter_id: 'ch222222-2222-2222-2222-222222222222',
                })
              ),
          });
        }
        if (url.includes('/api/v1/courses/')) {
          return Promise.resolve({
            ok: true,
            status: 200,
            text: () =>
              Promise.resolve(
                JSON.stringify({
                  count: 1,
                  next: null,
                  previous: null,
                  results: [{ id: 'c1', name: 'Cours 1', is_deleted: false }],
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
                  count: 2,
                  next: null,
                  previous: null,
                  results: [
                    {
                      id: 'ch111111-1111-1111-1111-111111111111',
                      name: 'Chapitre 1',
                      is_deleted: false,
                    },
                    {
                      id: 'ch222222-2222-2222-2222-222222222222',
                      name: 'Chapitre 2',
                      is_deleted: false,
                    },
                  ],
                })
              ),
          });
        }
        if (url.includes('/modules/')) {
          return Promise.resolve({
            ok: true,
            status: 200,
            text: () =>
              Promise.resolve(
                JSON.stringify({
                  count: 1,
                  next: null,
                  previous: null,
                  results: [{ id: 'm1', name: 'Module 1', is_deleted: false }],
                })
              ),
          });
        }
        return Promise.resolve({
          ok: true,
          status: 200,
          text: () => Promise.resolve(JSON.stringify(mockLesson)),
        });
      });
      globalThis.fetch = fetchSpy;

      render(
        <MemoryRouter initialEntries={[`/publisher/lessons/${mockLesson.id}`]}>
          <AppRoutes />
        </MemoryRouter>
      );

      await waitFor(() => {
        expect(screen.getByTestId('move-lesson-btn')).toBeInTheDocument();
      });

      await user.click(screen.getByTestId('move-lesson-btn'));

      await waitFor(() => {
        expect(screen.getByTestId('move-lesson-modal')).toBeInTheDocument();
      });

      await waitFor(() => {
        expect(
          screen.getByTestId('target-chapter-select')
        ).toBeInTheDocument();
      });

      await user.selectOptions(
        screen.getByTestId('target-chapter-select'),
        'ch222222-2222-2222-2222-222222222222'
      );
      await user.click(screen.getByTestId('confirm-move-btn'));

      await waitFor(() => {
        expect(screen.getByTestId('move-success-alert')).toBeInTheDocument();
        expect(screen.getByTestId('move-success-alert')).toHaveTextContent(
          'La leçon a été déplacée avec succès'
        );
      });
    });
  });

  // =========================================================================
  // 4. Role Guarding & PublisherCoursePage Navigation Trigger
  // =========================================================================
  describe('PublisherGuard & Navigation Trigger', () => {
    it('redirects non-publisher students away from /publisher/lessons/:id', async () => {
      setupStudentAuth();

      render(
        <MemoryRouter initialEntries={[`/publisher/lessons/${mockLesson.id}`]}>
          <AppRoutes />
        </MemoryRouter>
      );

      // Should be redirected to /courses or catalogue placeholder
      await waitFor(() => {
        expect(
          screen.queryByTestId('publisher-lesson-page')
        ).not.toBeInTheDocument();
      });
    });

    it('renders edit lesson button in PublisherCoursePage linking to /publisher/lessons/:id', async () => {
      const mockCourseItem: PublisherCourseItem = {
        id: 'c1',
        name: 'Systèmes Distribués',
        subject: 'Informatique',
        position: 1,
        is_deleted: false,
        last_modified_by: null,
        updated_at: '2026-10-31T08:00:00Z',
      };
      const mockModItem: PublisherModuleItem = {
        id: 'm1',
        name: 'Module Raft',
        position: 1,
        is_deleted: false,
        last_modified_by: null,
        updated_at: '2026-10-31T08:00:00Z',
      };
      const mockChapItem: PublisherChapterItem = {
        id: 'ch1',
        name: 'Chapitre 1',
        position: 1,
        is_deleted: false,
        last_modified_by: null,
        updated_at: '2026-10-31T08:00:00Z',
      };

      const fetchSpy = vi.fn().mockImplementation((url: string) => {
        if (url.includes('/api/v1/courses/c1/modules/')) {
          return Promise.resolve({
            ok: true,
            status: 200,
            text: () =>
              Promise.resolve(
                JSON.stringify({
                  count: 1,
                  next: null,
                  previous: null,
                  results: [mockModItem],
                })
              ),
          });
        }
        if (url.includes('/modules/m1/chapters/')) {
          return Promise.resolve({
            ok: true,
            status: 200,
            text: () =>
              Promise.resolve(
                JSON.stringify({
                  count: 1,
                  next: null,
                  previous: null,
                  results: [mockChapItem],
                })
              ),
          });
        }
        if (url.includes('/chapters/ch1/lessons/')) {
          return Promise.resolve({
            ok: true,
            status: 200,
            text: () =>
              Promise.resolve(
                JSON.stringify({
                  count: 1,
                  next: null,
                  previous: null,
                  results: [mockLesson],
                })
              ),
          });
        }
        if (url.includes('/api/v1/courses/c1/')) {
          return Promise.resolve({
            ok: true,
            status: 200,
            text: () => Promise.resolve(JSON.stringify(mockCourseItem)),
          });
        }
        return Promise.reject(new Error(`Unexpected ${url}`));
      });
      globalThis.fetch = fetchSpy;

      render(
        <MemoryRouter initialEntries={['/publisher/courses/c1']}>
          <AppRoutes />
        </MemoryRouter>
      );

      // Expand chapter
      await waitFor(() => {
        expect(
          screen.getByTestId('expand-chapter-btn-ch1')
        ).toBeInTheDocument();
      });

      const user = userEvent.setup();
      await user.click(screen.getByTestId('expand-chapter-btn-ch1'));

      await waitFor(() => {
        expect(
          screen.getByTestId(`edit-lesson-btn-${mockLesson.id}`)
        ).toBeInTheDocument();
      });

      const editBtn = screen.getByTestId(`edit-lesson-btn-${mockLesson.id}`);
      expect(editBtn).toHaveAttribute(
        'aria-label',
        `Modifier la leçon ${mockLesson.title}`
      );

      await user.click(editBtn);

      await waitFor(() => {
        expect(screen.getByTestId('publisher-lesson-page')).toBeInTheDocument();
      });
    });
  });

  // =========================================================================
  // 5. Accessibility & Responsive 360px Floor
  // =========================================================================
  describe('Accessibility & Responsive Minimum Floor (360px)', () => {
    it('all interactive buttons have min-h-[44px] touch target and aria labels', async () => {
      const fetchSpy = vi.fn().mockResolvedValue({
        ok: true,
        status: 200,
        text: () => Promise.resolve(JSON.stringify(mockLesson)),
      });
      globalThis.fetch = fetchSpy;

      render(
        <MemoryRouter initialEntries={[`/publisher/lessons/${mockLesson.id}`]}>
          <AppRoutes />
        </MemoryRouter>
      );

      await waitFor(() => {
        expect(screen.getByTestId('save-lesson-btn')).toBeInTheDocument();
      });

      expect(screen.getByTestId('save-lesson-btn')).toHaveClass('min-h-[44px]');
      expect(screen.getByTestId('move-lesson-btn')).toHaveClass('min-h-[44px]');
      expect(screen.getByTestId('publisher-lesson-page')).toHaveClass(
        'min-w-[360px]'
      );
    });
  });
});
