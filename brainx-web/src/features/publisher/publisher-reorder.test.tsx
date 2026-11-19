import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { render, screen, waitFor, fireEvent } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { MemoryRouter } from 'react-router-dom';
import { useAuthStore } from '@/features/auth/auth-store';
import { AppRoutes } from '@/routes';
import {
  SortableItem,
  SortableLiveRegion,
  reorderModules,
  reorderChapters,
  reorderLessons,
  fetchManageableLessons,
} from './index';
import type {
  PublisherCourseItem,
  PublisherModuleItem,
  PublisherChapterItem,
  PublisherLessonItem,
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

const mockModules: PublisherModuleItem[] = [
  {
    id: 'm1111111-1111-1111-1111-111111111111',
    name: 'Module 1 : Raft',
    position: 1,
    is_deleted: false,
    last_modified_by: null,
    updated_at: '2026-10-31T08:00:00Z',
  },
  {
    id: 'm2222222-2222-2222-2222-222222222222',
    name: 'Module 2 : Paxos',
    position: 2,
    is_deleted: false,
    last_modified_by: null,
    updated_at: '2026-10-31T08:05:00Z',
  },
];

const mockChaptersModule1: PublisherChapterItem[] = [
  {
    id: 'ch111111-1111-1111-1111-111111111111',
    name: 'Chapitre 1 : Élection',
    position: 1,
    is_deleted: false,
    last_modified_by: null,
    updated_at: '2026-10-31T08:10:00Z',
  },
  {
    id: 'ch222222-2222-2222-2222-222222222222',
    name: 'Chapitre 2 : Réplication de Journal',
    position: 2,
    is_deleted: false,
    last_modified_by: null,
    updated_at: '2026-10-31T08:15:00Z',
  },
];

const mockLessonsChapter1: PublisherLessonItem[] = [
  {
    id: 'l1111111-1111-1111-1111-111111111111',
    title: 'Leçon 1 : Heartbeats et Timeouts',
    description: 'Introduction aux mécanismes de heartbeat dans Raft',
    keywords: 'raft, heartbeat',
    teacher: 'Prof. Turing',
    course_date: '2026-11-01',
    position: 1,
    is_deleted: false,
    is_published: true,
    last_modified_by: null,
    updated_at: '2026-10-31T08:20:00Z',
  },
  {
    id: 'l2222222-2222-2222-2222-222222222222',
    title: 'Leçon 2 : Vote Majoritaire',
    description: 'Algorithme de consensus pour le vote du leader',
    keywords: 'raft, vote',
    teacher: 'Prof. Turing',
    course_date: '2026-11-02',
    position: 2,
    is_deleted: false,
    is_published: true,
    last_modified_by: null,
    updated_at: '2026-10-31T08:25:00Z',
  },
];

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

describe('Story FE-4.3: Réordonnancement Interactif des Éléments (Drag-and-Drop & Clavier Accessible)', () => {
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
  // 1. API Service Endpoints Contract
  // =========================================================================
  describe('API Services (api.ts)', () => {
    it('reorderModules calls PUT /api/v1/courses/:courseId/modules/order/ with exact permutation', async () => {
      const fetchSpy = vi.fn().mockResolvedValue({
        ok: true,
        status: 200,
        text: () => Promise.resolve(JSON.stringify(mockModules.slice().reverse())),
      });
      globalThis.fetch = fetchSpy;

      const order = [mockModules[1].id, mockModules[0].id];
      const result = await reorderModules(mockCourse.id, order);

      expect(fetchSpy).toHaveBeenCalledWith(
        expect.stringMatching(
          new RegExp(`/api/v1/courses/${mockCourse.id}/modules/order/`)
        ),
        expect.objectContaining({
          method: 'PUT',
          body: JSON.stringify({ order }),
        })
      );
      expect(result).toHaveLength(2);
    });

    it('reorderChapters calls PUT /api/v1/modules/:moduleId/chapters/order/ with exact permutation', async () => {
      const fetchSpy = vi.fn().mockResolvedValue({
        ok: true,
        status: 200,
        text: () =>
          Promise.resolve(JSON.stringify(mockChaptersModule1.slice().reverse())),
      });
      globalThis.fetch = fetchSpy;

      const order = [mockChaptersModule1[1].id, mockChaptersModule1[0].id];
      const result = await reorderChapters(mockModules[0].id, order);

      expect(fetchSpy).toHaveBeenCalledWith(
        expect.stringMatching(
          new RegExp(`/api/v1/modules/${mockModules[0].id}/chapters/order/`)
        ),
        expect.objectContaining({
          method: 'PUT',
          body: JSON.stringify({ order }),
        })
      );
      expect(result).toHaveLength(2);
    });

    it('reorderLessons calls PUT /api/v1/chapters/:chapterId/lessons/order/ with exact permutation', async () => {
      const fetchSpy = vi.fn().mockResolvedValue({
        ok: true,
        status: 200,
        text: () =>
          Promise.resolve(JSON.stringify(mockLessonsChapter1.slice().reverse())),
      });
      globalThis.fetch = fetchSpy;

      const order = [mockLessonsChapter1[1].id, mockLessonsChapter1[0].id];
      const result = await reorderLessons(mockChaptersModule1[0].id, order);

      expect(fetchSpy).toHaveBeenCalledWith(
        expect.stringMatching(
          new RegExp(`/api/v1/chapters/${mockChaptersModule1[0].id}/lessons/order/`)
        ),
        expect.objectContaining({
          method: 'PUT',
          body: JSON.stringify({ order }),
        })
      );
      expect(result).toHaveLength(2);
    });

    it('fetchManageableLessons calls GET /api/v1/chapters/:chapterId/lessons/', async () => {
      const fetchSpy = vi.fn().mockResolvedValue({
        ok: true,
        status: 200,
        text: () =>
          Promise.resolve(
            JSON.stringify({
              count: 2,
              next: null,
              previous: null,
              results: mockLessonsChapter1,
            })
          ),
      });
      globalThis.fetch = fetchSpy;

      const result = await fetchManageableLessons(mockChaptersModule1[0].id);

      expect(fetchSpy).toHaveBeenCalledWith(
        expect.stringMatching(
          new RegExp(`/api/v1/chapters/${mockChaptersModule1[0].id}/lessons/`)
        ),
        expect.anything()
      );
      expect(result.results).toHaveLength(2);
    });
  });

  // =========================================================================
  // 2. SortableItem Accessible Component Contract
  // =========================================================================
  describe('SortableItem Component & Accessibility Attributes', () => {
    it('renders accessible grip handle with role="button", aria-roledescription and tabIndex=0 when interactive', () => {
      render(
        <SortableItem
          id="item-1"
          name="Module Test"
          index={0}
          total={3}
          showDefaultHandle={true}
        >
          <div>Contenu</div>
        </SortableItem>
      );

      const handle = screen.getByRole('button', { name: /réordonner module test/i });
      expect(handle).toBeInTheDocument();
      expect(handle).toHaveAttribute('tabIndex', '0');
      expect(handle).toHaveAttribute('aria-roledescription', 'élément réordonnable');
      expect(handle).toHaveAttribute('aria-grabbed', 'false');
      expect(handle).toHaveAttribute('draggable', 'true');
      expect(handle).not.toBeDisabled();
    });

    it('disables handle and sets tabIndex=-1 when single child list (total = 1)', () => {
      render(
        <SortableItem
          id="item-single"
          name="Module Unique"
          index={0}
          total={1}
          showDefaultHandle={true}
        >
          <div>Contenu Seul</div>
        </SortableItem>
      );

      const handle = screen.getByTestId('drag-handle-item-single');
      expect(handle).toBeDisabled();
      expect(handle).toHaveAttribute('tabIndex', '-1');
      expect(handle).toHaveAttribute('aria-disabled', 'true');
      expect(handle).toHaveAttribute('draggable', 'false');
    });

    it('triggers onPickUp on Space/Enter, moves on Arrow keys, and commits on second Space', async () => {
      const onPickUp = vi.fn();
      const onMoveDown = vi.fn();
      const onMoveUp = vi.fn();
      const onCommit = vi.fn();
      const onCancel = vi.fn();

      const { rerender } = render(
        <SortableItem
          id="item-k"
          name="Module Clavier"
          index={0}
          total={2}
          isGrabbed={false}
          onPickUp={onPickUp}
          onCommit={onCommit}
          onCancel={onCancel}
          onMoveUp={onMoveUp}
          onMoveDown={onMoveDown}
          showDefaultHandle={true}
        >
          <div>Contenu</div>
        </SortableItem>
      );

      const handle = screen.getByTestId('drag-handle-item-k');
      handle.focus();

      // Press Space to pick up
      fireEvent.keyDown(handle, { key: ' ' });
      expect(onPickUp).toHaveBeenCalledTimes(1);

      // Re-render as grabbed
      rerender(
        <SortableItem
          id="item-k"
          name="Module Clavier"
          index={0}
          total={2}
          isGrabbed={true}
          onPickUp={onPickUp}
          onCommit={onCommit}
          onCancel={onCancel}
          onMoveUp={onMoveUp}
          onMoveDown={onMoveDown}
          showDefaultHandle={true}
        >
          <div>Contenu</div>
        </SortableItem>
      );

      expect(handle).toHaveAttribute('aria-grabbed', 'true');

      // Press ArrowDown
      fireEvent.keyDown(handle, { key: 'ArrowDown' });
      expect(onMoveDown).toHaveBeenCalledTimes(1);

      // Press ArrowUp
      fireEvent.keyDown(handle, { key: 'ArrowUp' });
      expect(onMoveUp).toHaveBeenCalledTimes(1);

      // Press Space to commit
      fireEvent.keyDown(handle, { key: ' ' });
      expect(onCommit).toHaveBeenCalledTimes(1);
    });

    it('triggers onCancel when Escape is pressed while grabbed', () => {
      const onCancel = vi.fn();

      render(
        <SortableItem
          id="item-esc"
          name="Module Echap"
          index={0}
          total={2}
          isGrabbed={true}
          onCancel={onCancel}
          showDefaultHandle={true}
        >
          <div>Contenu</div>
        </SortableItem>
      );

      const handle = screen.getByTestId('drag-handle-item-esc');
      fireEvent.keyDown(handle, { key: 'Escape' });
      expect(onCancel).toHaveBeenCalledTimes(1);
    });

    it('cancels grab state when handle loses focus (onBlur)', () => {
      const onCancel = vi.fn();

      render(
        <SortableItem
          id="item-blur"
          name="Module Blur"
          index={0}
          total={2}
          isGrabbed={true}
          onCancel={onCancel}
          showDefaultHandle={true}
        >
          <div>Contenu</div>
        </SortableItem>
      );

      const handle = screen.getByTestId('drag-handle-item-blur');
      fireEvent.blur(handle);
      expect(onCancel).toHaveBeenCalledTimes(1);
    });

    it('provides pre-grab shortcut guidance in aria-label', () => {
      const { rerender } = render(
        <SortableItem
          id="item-aria"
          name="Module Guide"
          index={0}
          total={2}
          isGrabbed={false}
          showDefaultHandle={true}
        >
          <div>Contenu</div>
        </SortableItem>
      );

      const handle = screen.getByTestId('drag-handle-item-aria');
      expect(handle).toHaveAttribute(
        'aria-label',
        'Réordonner Module Guide (appuyez sur Espace pour saisir)'
      );

      rerender(
        <SortableItem
          id="item-aria"
          name="Module Guide"
          index={0}
          total={2}
          isGrabbed={true}
          showDefaultHandle={true}
        >
          <div>Contenu</div>
        </SortableItem>
      );
      expect(handle).toHaveAttribute('aria-label', 'Réordonner Module Guide');
    });

    it('triggers onBoundaryReached when attempting to move past first or last position', () => {
      const onBoundaryReached = vi.fn();

      const { rerender } = render(
        <SortableItem
          id="item-b1"
          name="Module B1"
          index={0}
          total={2}
          isGrabbed={true}
          onBoundaryReached={onBoundaryReached}
          showDefaultHandle={true}
        >
          <div>Contenu</div>
        </SortableItem>
      );

      const handle1 = screen.getByTestId('drag-handle-item-b1');
      fireEvent.keyDown(handle1, { key: 'ArrowUp' });
      expect(onBoundaryReached).toHaveBeenCalledWith('first');

      rerender(
        <SortableItem
          id="item-b2"
          name="Module B2"
          index={1}
          total={2}
          isGrabbed={true}
          onBoundaryReached={onBoundaryReached}
          showDefaultHandle={true}
        >
          <div>Contenu</div>
        </SortableItem>
      );

      const handle2 = screen.getByTestId('drag-handle-item-b2');
      fireEvent.keyDown(handle2, { key: 'ArrowDown' });
      expect(onBoundaryReached).toHaveBeenCalledWith('last');
    });
  });

  // =========================================================================
  // 3. Live Region Announcements
  // =========================================================================
  describe('ARIA Live Region (SortableLiveRegion)', () => {
    it('renders polite live region announcing state changes', () => {
      const { rerender } = render(<SortableLiveRegion message="Message initial" />);

      const live = screen.getByTestId('reorder-live-region');
      expect(live).toHaveAttribute('role', 'status');
      expect(live).toHaveAttribute('aria-live', 'polite');
      expect(live).toHaveAttribute('aria-atomic', 'true');
      expect(live).toHaveTextContent('Message initial');

      rerender(<SortableLiveRegion message="Position 2 sur 2." />);
      expect(live).toHaveTextContent('Position 2 sur 2.');
    });
  });

  // =========================================================================
  // 4. PublisherCoursePage Integration: Module Reordering
  // =========================================================================
  describe('PublisherCoursePage Integration: Module Reordering', () => {
    const setupFetchMock = (options?: { reorderFails?: boolean }) => {
      return vi.fn().mockImplementation((url: string) => {
        if (url.includes(`/api/v1/courses/${mockCourse.id}/modules/order/`)) {
          if (options?.reorderFails) {
            return Promise.resolve({
              ok: false,
              status: 400,
              text: () =>
                Promise.resolve(
                  JSON.stringify({
                    detail: 'Erreur de permutation : les modules ne correspondent pas.',
                  })
                ),
            });
          }
          return Promise.resolve({
            ok: true,
            status: 200,
            text: () => Promise.resolve(JSON.stringify(mockModules.slice().reverse())),
          });
        }
        if (url.includes(`/api/v1/courses/${mockCourse.id}/modules/`)) {
          return Promise.resolve({
            ok: true,
            status: 200,
            text: () =>
              Promise.resolve(
                JSON.stringify({
                  count: 2,
                  next: null,
                  previous: null,
                  results: mockModules,
                })
              ),
          });
        }
        if (url.includes(`/api/v1/modules/${mockModules[0].id}/chapters/`)) {
          return Promise.resolve({
            ok: true,
            status: 200,
            text: () =>
              Promise.resolve(
                JSON.stringify({
                  count: 2,
                  next: null,
                  previous: null,
                  results: mockChaptersModule1,
                })
              ),
          });
        }
        if (url.includes(`/api/v1/modules/${mockModules[1].id}/chapters/`)) {
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
        return Promise.resolve({
          ok: true,
          status: 200,
          text: () => Promise.resolve(JSON.stringify({})),
        });
      });
    };

    it('reorders modules via accessible keyboard navigation (Tab -> Space -> ArrowDown -> Space)', async () => {
      const fetchSpy = setupFetchMock();
      globalThis.fetch = fetchSpy;

      render(
        <MemoryRouter initialEntries={[`/publisher/courses/${mockCourse.id}`]}>
          <AppRoutes />
        </MemoryRouter>
      );

      await waitFor(() => {
        expect(screen.getByTestId(`module-name-${mockModules[0].id}`)).toHaveTextContent(
          'Module 1 : Raft'
        );
      });

      const handle1 = screen.getByTestId(`drag-handle-${mockModules[0].id}`);
      handle1.focus();

      // 1. Pick up module 1 with Space
      fireEvent.keyDown(handle1, { key: ' ' });

      const liveRegion = screen.getByTestId('reorder-live-region');
      expect(liveRegion).toHaveTextContent(
        'Élément Module 1 : Raft sélectionné. Utilisez les flèches Haut et Bas pour réordonner, Espace pour confirmer, Échap pour annuler.'
      );
      expect(handle1).toHaveAttribute('aria-grabbed', 'true');

      // 2. Move down with ArrowDown
      fireEvent.keyDown(handle1, { key: 'ArrowDown' });
      expect(liveRegion).toHaveTextContent('Position 2 sur 2.');

      // 3. Confirm and save with Space
      fireEvent.keyDown(handle1, { key: ' ' });

      await waitFor(() => {
        expect(fetchSpy).toHaveBeenCalledWith(
          expect.stringMatching(
            new RegExp(`/api/v1/courses/${mockCourse.id}/modules/order/`)
          ),
          expect.objectContaining({
            method: 'PUT',
            body: JSON.stringify({
              order: [mockModules[1].id, mockModules[0].id],
            }),
          })
        );
      });

      expect(liveRegion).toHaveTextContent('Nouvel ordre enregistré pour Module 1 : Raft.');
    });

    it('cancels keyboard reordering when Escape is pressed without making an API call', async () => {
      const fetchSpy = setupFetchMock();
      globalThis.fetch = fetchSpy;

      render(
        <MemoryRouter initialEntries={[`/publisher/courses/${mockCourse.id}`]}>
          <AppRoutes />
        </MemoryRouter>
      );

      await waitFor(() => {
        expect(screen.getByTestId(`module-name-${mockModules[0].id}`)).toBeInTheDocument();
      });

      const handle1 = screen.getByTestId(`drag-handle-${mockModules[0].id}`);
      handle1.focus();

      // Pick up and move down
      fireEvent.keyDown(handle1, { key: ' ' });
      fireEvent.keyDown(handle1, { key: 'ArrowDown' });

      // Press Escape to cancel
      fireEvent.keyDown(handle1, { key: 'Escape' });

      const liveRegion = screen.getByTestId('reorder-live-region');
      expect(liveRegion).toHaveTextContent('Réordonnancement annulé.');

      // Verify no PUT .../order/ request was sent
      expect(fetchSpy).not.toHaveBeenCalledWith(
        expect.stringMatching(/\/order\/$/),
        expect.anything()
      );
    });

    it('reorders modules via mouse drag-and-drop', async () => {
      const fetchSpy = setupFetchMock();
      globalThis.fetch = fetchSpy;

      render(
        <MemoryRouter initialEntries={[`/publisher/courses/${mockCourse.id}`]}>
          <AppRoutes />
        </MemoryRouter>
      );

      await waitFor(() => {
        expect(screen.getByTestId(`module-name-${mockModules[0].id}`)).toBeInTheDocument();
      });

      const handle1 = screen.getByTestId(`drag-handle-${mockModules[0].id}`);
      const card2 = screen.getByTestId(`publisher-module-card-${mockModules[1].id}`);

      // Simulate mouse drag from Module 1 onto Module 2
      fireEvent.dragStart(handle1, {
        dataTransfer: {
          setData: vi.fn(),
          effectAllowed: 'move',
        },
      });

      fireEvent.dragOver(card2, {
        dataTransfer: {
          dropEffect: 'move',
        },
      });

      fireEvent.drop(card2);

      await waitFor(() => {
        expect(fetchSpy).toHaveBeenCalledWith(
          expect.stringMatching(
            new RegExp(`/api/v1/courses/${mockCourse.id}/modules/order/`)
          ),
          expect.objectContaining({
            method: 'PUT',
            body: JSON.stringify({
              order: [mockModules[1].id, mockModules[0].id],
            }),
          })
        );
      });
    });

    it('rolls back list order and displays error alert when reorder API fails', async () => {
      const fetchSpy = setupFetchMock({ reorderFails: true });
      globalThis.fetch = fetchSpy;

      render(
        <MemoryRouter initialEntries={[`/publisher/courses/${mockCourse.id}`]}>
          <AppRoutes />
        </MemoryRouter>
      );

      await waitFor(() => {
        expect(screen.getByTestId(`module-name-${mockModules[0].id}`)).toBeInTheDocument();
      });

      const handle1 = screen.getByTestId(`drag-handle-${mockModules[0].id}`);
      handle1.focus();

      // Pick up, move, and commit
      fireEvent.keyDown(handle1, { key: ' ' });
      fireEvent.keyDown(handle1, { key: 'ArrowDown' });
      fireEvent.keyDown(handle1, { key: ' ' });

      // Verify error alert appears
      await waitFor(() => {
        expect(screen.getByTestId('reorder-error-alert')).toBeInTheDocument();
        expect(screen.getByTestId('reorder-error-message')).toHaveTextContent(
          'Erreur de permutation : les modules ne correspondent pas.'
        );
      });

      // Verify list rolled back: Module 1 is first again
      const moduleCards = screen.getAllByTestId(/^publisher-module-card-/);
      expect(moduleCards[0]).toHaveAttribute(
        'data-testid',
        `publisher-module-card-${mockModules[0].id}`
      );
    });

    it('excludes soft-deleted items from order payload and disables their handles', async () => {
      const mockModulesWithDeleted: PublisherModuleItem[] = [
        {
          id: 'm1111111-1111-1111-1111-111111111111',
          name: 'Module 1 : Actif',
          position: 1,
          is_deleted: false,
          last_modified_by: null,
          updated_at: '2026-10-31T08:00:00Z',
        },
        {
          id: 'm-del-2222-2222-2222-222222222222',
          name: 'Module 2 : Supprimé',
          position: 2,
          is_deleted: true,
          last_modified_by: null,
          updated_at: '2026-10-31T08:02:00Z',
        },
        {
          id: 'm3333333-3333-3333-3333-333333333333',
          name: 'Module 3 : Actif',
          position: 3,
          is_deleted: false,
          last_modified_by: null,
          updated_at: '2026-10-31T08:05:00Z',
        },
      ];

      const fetchSpy = vi.fn().mockImplementation((url: string) => {
        if (url.includes(`/api/v1/courses/${mockCourse.id}/modules/order/`)) {
          return Promise.resolve({
            ok: true,
            status: 200,
            text: () =>
              Promise.resolve(
                JSON.stringify([
                  mockModulesWithDeleted[2],
                  mockModulesWithDeleted[0],
                ])
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
                  count: 3,
                  next: null,
                  previous: null,
                  results: mockModulesWithDeleted,
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
        expect(
          screen.getByTestId(`module-name-${mockModulesWithDeleted[0].id}`)
        ).toBeInTheDocument();
      });

      // Verify soft-deleted module has disabled handle
      const deletedHandle = screen.getByTestId(
        `drag-handle-${mockModulesWithDeleted[1].id}`
      );
      expect(deletedHandle).toBeDisabled();
      expect(deletedHandle).toHaveAttribute('aria-disabled', 'true');
      expect(deletedHandle).toHaveAttribute('tabIndex', '-1');

      // Reorder module 1 down past deleted module 2 and module 3
      const handle1 = screen.getByTestId(
        `drag-handle-${mockModulesWithDeleted[0].id}`
      );
      handle1.focus();
      fireEvent.keyDown(handle1, { key: ' ' });
      fireEvent.keyDown(handle1, { key: 'ArrowDown' });
      fireEvent.keyDown(handle1, { key: 'ArrowDown' });
      fireEvent.keyDown(handle1, { key: ' ' });

      await waitFor(() => {
        expect(fetchSpy).toHaveBeenCalledWith(
          expect.stringMatching(
            new RegExp(`/api/v1/courses/${mockCourse.id}/modules/order/`)
          ),
          expect.objectContaining({
            method: 'PUT',
            // Order payload MUST exclude the soft-deleted module ID
            body: JSON.stringify({
              order: [
                mockModulesWithDeleted[2].id,
                mockModulesWithDeleted[0].id,
              ],
            }),
          })
        );
      });
    });
  });

  // =========================================================================
  // 5. PublisherCoursePage Integration: Chapter Reordering
  // =========================================================================
  describe('PublisherCoursePage Integration: Chapter Reordering', () => {
    const setupFetchMock = (options?: { reorderFails?: boolean }) => {
      return vi.fn().mockImplementation((url: string) => {
        if (url.includes(`/api/v1/modules/${mockModules[0].id}/chapters/order/`)) {
          if (options?.reorderFails) {
            return Promise.resolve({
              ok: false,
              status: 500,
              text: () =>
                Promise.resolve(
                  JSON.stringify({
                    detail: 'Erreur serveur lors du réordonnancement des chapitres.',
                  })
                ),
            });
          }
          return Promise.resolve({
            ok: true,
            status: 200,
            text: () =>
              Promise.resolve(JSON.stringify(mockChaptersModule1.slice().reverse())),
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
                  results: [mockModules[0]],
                })
              ),
          });
        }
        if (url.includes(`/api/v1/modules/${mockModules[0].id}/chapters/`)) {
          return Promise.resolve({
            ok: true,
            status: 200,
            text: () =>
              Promise.resolve(
                JSON.stringify({
                  count: 2,
                  next: null,
                  previous: null,
                  results: mockChaptersModule1,
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
    };

    it('reorders chapters via keyboard navigation (Space -> ArrowDown -> Space)', async () => {
      const fetchSpy = setupFetchMock();
      globalThis.fetch = fetchSpy;

      render(
        <MemoryRouter initialEntries={[`/publisher/courses/${mockCourse.id}`]}>
          <AppRoutes />
        </MemoryRouter>
      );

      await waitFor(() => {
        expect(
          screen.getByTestId(`chapter-name-${mockChaptersModule1[0].id}`)
        ).toHaveTextContent('Chapitre 1 : Élection');
      });

      const chapterHandle1 = screen.getByTestId(
        `drag-handle-${mockChaptersModule1[0].id}`
      );
      chapterHandle1.focus();

      // Pick up chapter 1
      fireEvent.keyDown(chapterHandle1, { key: ' ' });

      const liveRegion = screen.getByTestId('reorder-live-region');
      expect(liveRegion).toHaveTextContent(
        'Élément Chapitre 1 : Élection sélectionné. Utilisez les flèches Haut et Bas pour réordonner, Espace pour confirmer, Échap pour annuler.'
      );

      // Move down
      fireEvent.keyDown(chapterHandle1, { key: 'ArrowDown' });
      expect(liveRegion).toHaveTextContent('Position 2 sur 2.');

      // Commit
      fireEvent.keyDown(chapterHandle1, { key: ' ' });

      await waitFor(() => {
        expect(fetchSpy).toHaveBeenCalledWith(
          expect.stringMatching(
            new RegExp(`/api/v1/modules/${mockModules[0].id}/chapters/order/`)
          ),
          expect.objectContaining({
            method: 'PUT',
            body: JSON.stringify({
              order: [mockChaptersModule1[1].id, mockChaptersModule1[0].id],
            }),
          })
        );
      });

      expect(liveRegion).toHaveTextContent(
        'Nouvel ordre enregistré pour Chapitre 1 : Élection.'
      );
    });

    it('reverts chapters on API failure and displays error alert', async () => {
      const fetchSpy = setupFetchMock({ reorderFails: true });
      globalThis.fetch = fetchSpy;

      render(
        <MemoryRouter initialEntries={[`/publisher/courses/${mockCourse.id}`]}>
          <AppRoutes />
        </MemoryRouter>
      );

      await waitFor(() => {
        expect(
          screen.getByTestId(`chapter-name-${mockChaptersModule1[0].id}`)
        ).toBeInTheDocument();
      });

      const chapterHandle1 = screen.getByTestId(
        `drag-handle-${mockChaptersModule1[0].id}`
      );
      chapterHandle1.focus();

      // Pick up, move, and commit
      fireEvent.keyDown(chapterHandle1, { key: ' ' });
      fireEvent.keyDown(chapterHandle1, { key: 'ArrowDown' });
      fireEvent.keyDown(chapterHandle1, { key: ' ' });

      await waitFor(() => {
        expect(screen.getByTestId('reorder-error-alert')).toBeInTheDocument();
      });

      // Verify Chapter 1 is still first
      const chapterItems = screen.getAllByTestId(/^publisher-chapter-item-/);
      expect(chapterItems[0]).toHaveAttribute(
        'data-testid',
        `publisher-chapter-item-${mockChaptersModule1[0].id}`
      );
    });

    it('reorders chapters via mouse drag-and-drop', async () => {
      const fetchSpy = setupFetchMock();
      globalThis.fetch = fetchSpy;

      render(
        <MemoryRouter initialEntries={[`/publisher/courses/${mockCourse.id}`]}>
          <AppRoutes />
        </MemoryRouter>
      );

      await waitFor(() => {
        expect(
          screen.getByTestId(`chapter-name-${mockChaptersModule1[0].id}`)
        ).toBeInTheDocument();
      });

      const handle1 = screen.getByTestId(
        `drag-handle-${mockChaptersModule1[0].id}`
      );
      const card2 = screen.getByTestId(
        `publisher-chapter-item-${mockChaptersModule1[1].id}`
      );

      // Simulate mouse drag from Chapter 1 onto Chapter 2
      fireEvent.dragStart(handle1, {
        dataTransfer: {
          setData: vi.fn(),
          effectAllowed: 'move',
        },
      });

      fireEvent.dragOver(card2, {
        dataTransfer: {
          dropEffect: 'move',
        },
      });

      fireEvent.drop(card2);

      await waitFor(() => {
        expect(fetchSpy).toHaveBeenCalledWith(
          expect.stringMatching(
            new RegExp(`/api/v1/modules/${mockModules[0].id}/chapters/order/`)
          ),
          expect.objectContaining({
            method: 'PUT',
            body: JSON.stringify({
              order: [mockChaptersModule1[1].id, mockChaptersModule1[0].id],
            }),
          })
        );
      });
    });
  });

  // =========================================================================
  // 6. Chapter Expansion & Lesson Reordering Integration
  // =========================================================================
  describe('PublisherCoursePage Integration: Lesson Reordering & Expansion', () => {
    const setupFetchMock = (options?: { reorderFails?: boolean }) => {
      return vi.fn().mockImplementation((url: string) => {
        if (
          url.includes(`/api/v1/chapters/${mockChaptersModule1[0].id}/lessons/order/`)
        ) {
          if (options?.reorderFails) {
            return Promise.resolve({
              ok: false,
              status: 400,
              text: () =>
                Promise.resolve(
                  JSON.stringify({
                    detail: 'Erreur : ordre des leçons invalide.',
                  })
                ),
            });
          }
          return Promise.resolve({
            ok: true,
            status: 200,
            text: () =>
              Promise.resolve(JSON.stringify(mockLessonsChapter1.slice().reverse())),
          });
        }
        if (
          url.includes(`/api/v1/chapters/${mockChaptersModule1[0].id}/lessons/`)
        ) {
          return Promise.resolve({
            ok: true,
            status: 200,
            text: () =>
              Promise.resolve(
                JSON.stringify({
                  count: 2,
                  next: null,
                  previous: null,
                  results: mockLessonsChapter1,
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
                  results: [mockModules[0]],
                })
              ),
          });
        }
        if (url.includes(`/api/v1/modules/${mockModules[0].id}/chapters/`)) {
          return Promise.resolve({
            ok: true,
            status: 200,
            text: () =>
              Promise.resolve(
                JSON.stringify({
                  count: 1,
                  next: null,
                  previous: null,
                  results: [mockChaptersModule1[0]],
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
    };

    it('expands chapter lessons and reorders lessons via keyboard', async () => {
      const user = userEvent.setup();
      const fetchSpy = setupFetchMock();
      globalThis.fetch = fetchSpy;

      render(
        <MemoryRouter initialEntries={[`/publisher/courses/${mockCourse.id}`]}>
          <AppRoutes />
        </MemoryRouter>
      );

      await waitFor(() => {
        expect(
          screen.getByTestId(`chapter-name-${mockChaptersModule1[0].id}`)
        ).toBeInTheDocument();
      });

      // Expand Chapter 1 lessons
      const expandBtn = screen.getByTestId(
        `expand-chapter-btn-${mockChaptersModule1[0].id}`
      );
      await user.click(expandBtn);

      // Verify lessons loaded
      await waitFor(() => {
        expect(
          screen.getByTestId(`lesson-title-${mockLessonsChapter1[0].id}`)
        ).toHaveTextContent('Leçon 1 : Heartbeats et Timeouts');
        expect(
          screen.getByTestId(`lesson-title-${mockLessonsChapter1[1].id}`)
        ).toHaveTextContent('Leçon 2 : Vote Majoritaire');
      });

      const lessonHandle1 = screen.getByTestId(
        `drag-handle-${mockLessonsChapter1[0].id}`
      );
      lessonHandle1.focus();

      // Pick up Lesson 1
      fireEvent.keyDown(lessonHandle1, { key: ' ' });

      const liveRegion = screen.getByTestId('reorder-live-region');
      expect(liveRegion).toHaveTextContent(
        'Élément Leçon 1 : Heartbeats et Timeouts sélectionné. Utilisez les flèches Haut et Bas pour réordonner, Espace pour confirmer, Échap pour annuler.'
      );

      // Move down
      fireEvent.keyDown(lessonHandle1, { key: 'ArrowDown' });
      expect(liveRegion).toHaveTextContent('Position 2 sur 2.');

      // Commit
      fireEvent.keyDown(lessonHandle1, { key: ' ' });

      await waitFor(() => {
        expect(fetchSpy).toHaveBeenCalledWith(
          expect.stringMatching(
            new RegExp(`/api/v1/chapters/${mockChaptersModule1[0].id}/lessons/order/`)
          ),
          expect.objectContaining({
            method: 'PUT',
            body: JSON.stringify({
              order: [mockLessonsChapter1[1].id, mockLessonsChapter1[0].id],
            }),
          })
        );
      });

      expect(liveRegion).toHaveTextContent(
        'Nouvel ordre enregistré pour Leçon 1 : Heartbeats et Timeouts.'
      );
    });

    it('cancels lesson reordering with Escape without dispatching API call', async () => {
      const user = userEvent.setup();
      const fetchSpy = setupFetchMock();
      globalThis.fetch = fetchSpy;

      render(
        <MemoryRouter initialEntries={[`/publisher/courses/${mockCourse.id}`]}>
          <AppRoutes />
        </MemoryRouter>
      );

      await waitFor(() => {
        expect(
          screen.getByTestId(`expand-chapter-btn-${mockChaptersModule1[0].id}`)
        ).toBeInTheDocument();
      });

      await user.click(
        screen.getByTestId(`expand-chapter-btn-${mockChaptersModule1[0].id}`)
      );

      await waitFor(() => {
        expect(
          screen.getByTestId(`lesson-title-${mockLessonsChapter1[0].id}`)
        ).toBeInTheDocument();
      });

      const lessonHandle1 = screen.getByTestId(
        `drag-handle-${mockLessonsChapter1[0].id}`
      );
      lessonHandle1.focus();

      // Pick up and move down
      fireEvent.keyDown(lessonHandle1, { key: ' ' });
      fireEvent.keyDown(lessonHandle1, { key: 'ArrowDown' });

      // Cancel with Escape
      fireEvent.keyDown(lessonHandle1, { key: 'Escape' });

      expect(screen.getByTestId('reorder-live-region')).toHaveTextContent(
        'Réordonnancement annulé.'
      );

      expect(fetchSpy).not.toHaveBeenCalledWith(
        expect.stringMatching(/\/lessons\/order\/$/),
        expect.anything()
      );
    });

    it('rolls back lesson order on API rejection and displays error alert', async () => {
      const user = userEvent.setup();
      const fetchSpy = setupFetchMock({ reorderFails: true });
      globalThis.fetch = fetchSpy;

      render(
        <MemoryRouter initialEntries={[`/publisher/courses/${mockCourse.id}`]}>
          <AppRoutes />
        </MemoryRouter>
      );

      await waitFor(() => {
        expect(
          screen.getByTestId(`expand-chapter-btn-${mockChaptersModule1[0].id}`)
        ).toBeInTheDocument();
      });

      await user.click(
        screen.getByTestId(`expand-chapter-btn-${mockChaptersModule1[0].id}`)
      );

      await waitFor(() => {
        expect(
          screen.getByTestId(`lesson-title-${mockLessonsChapter1[0].id}`)
        ).toBeInTheDocument();
      });

      const lessonHandle1 = screen.getByTestId(
        `drag-handle-${mockLessonsChapter1[0].id}`
      );
      lessonHandle1.focus();

      // Pick up, move, and commit
      fireEvent.keyDown(lessonHandle1, { key: ' ' });
      fireEvent.keyDown(lessonHandle1, { key: 'ArrowDown' });
      fireEvent.keyDown(lessonHandle1, { key: ' ' });

      await waitFor(() => {
        expect(screen.getByTestId('reorder-error-alert')).toBeInTheDocument();
        expect(screen.getByTestId('reorder-error-message')).toHaveTextContent(
          'Erreur : ordre des leçons invalide.'
        );
      });

      // Verify Lesson 1 is back at position 1
      const lessonItems = screen.getAllByTestId(/^publisher-lesson-item-/);
      expect(lessonItems[0]).toHaveAttribute(
        'data-testid',
        `publisher-lesson-item-${mockLessonsChapter1[0].id}`
      );
    });

    it('reorders lessons via mouse drag-and-drop', async () => {
      const user = userEvent.setup();
      const fetchSpy = setupFetchMock();
      globalThis.fetch = fetchSpy;

      render(
        <MemoryRouter initialEntries={[`/publisher/courses/${mockCourse.id}`]}>
          <AppRoutes />
        </MemoryRouter>
      );

      await waitFor(() => {
        expect(
          screen.getByTestId(`expand-chapter-btn-${mockChaptersModule1[0].id}`)
        ).toBeInTheDocument();
      });

      await user.click(
        screen.getByTestId(`expand-chapter-btn-${mockChaptersModule1[0].id}`)
      );

      await waitFor(() => {
        expect(
          screen.getByTestId(`lesson-title-${mockLessonsChapter1[0].id}`)
        ).toBeInTheDocument();
      });

      const handle1 = screen.getByTestId(
        `drag-handle-${mockLessonsChapter1[0].id}`
      );
      const card2 = screen.getByTestId(
        `publisher-lesson-item-${mockLessonsChapter1[1].id}`
      );

      // Simulate mouse drag from Lesson 1 onto Lesson 2
      fireEvent.dragStart(handle1, {
        dataTransfer: {
          setData: vi.fn(),
          effectAllowed: 'move',
        },
      });

      fireEvent.dragOver(card2, {
        dataTransfer: {
          dropEffect: 'move',
        },
      });

      fireEvent.drop(card2);

      await waitFor(() => {
        expect(fetchSpy).toHaveBeenCalledWith(
          expect.stringMatching(
            new RegExp(`/api/v1/chapters/${mockChaptersModule1[0].id}/lessons/order/`)
          ),
          expect.objectContaining({
            method: 'PUT',
            body: JSON.stringify({
              order: [mockLessonsChapter1[1].id, mockLessonsChapter1[0].id],
            }),
          })
        );
      });
    });

    it('displays error alert and retry button when chapter lessons fail to load, and loads lessons on retry', async () => {
      let attempts = 0;
      const fetchSpy = vi.fn().mockImplementation((url: string) => {
        if (
          url.includes(`/api/v1/chapters/${mockChaptersModule1[0].id}/lessons/`)
        ) {
          attempts++;
          if (attempts === 1) {
            return Promise.resolve({
              ok: false,
              status: 500,
              text: () =>
                Promise.resolve(
                  JSON.stringify({
                    detail: 'Erreur réseau lors du chargement des leçons.',
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
                  count: 2,
                  next: null,
                  previous: null,
                  results: mockLessonsChapter1,
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
                  results: [mockModules[0]],
                })
              ),
          });
        }
        if (url.includes(`/api/v1/modules/${mockModules[0].id}/chapters/`)) {
          return Promise.resolve({
            ok: true,
            status: 200,
            text: () =>
              Promise.resolve(
                JSON.stringify({
                  count: 1,
                  next: null,
                  previous: null,
                  results: [mockChaptersModule1[0]],
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

      const user = userEvent.setup();

      render(
        <MemoryRouter initialEntries={[`/publisher/courses/${mockCourse.id}`]}>
          <AppRoutes />
        </MemoryRouter>
      );

      await waitFor(() => {
        expect(
          screen.getByTestId(`expand-chapter-btn-${mockChaptersModule1[0].id}`)
        ).toBeInTheDocument();
      });

      // Expand Chapter
      await user.click(
        screen.getByTestId(`expand-chapter-btn-${mockChaptersModule1[0].id}`)
      );

      // Verify error alert & retry button appear
      await waitFor(() => {
        expect(
          screen.getByTestId(`lessons-error-${mockChaptersModule1[0].id}`)
        ).toBeInTheDocument();
        expect(
          screen.getByTestId(`lessons-error-${mockChaptersModule1[0].id}`)
        ).toHaveTextContent('Erreur réseau lors du chargement des leçons.');
        expect(
          screen.getByTestId(`retry-lessons-btn-${mockChaptersModule1[0].id}`)
        ).toBeInTheDocument();
      });

      // Click retry button
      await user.click(
        screen.getByTestId(`retry-lessons-btn-${mockChaptersModule1[0].id}`)
      );

      // Verify lessons load successfully on retry
      await waitFor(() => {
        expect(
          screen.getByTestId(`lesson-title-${mockLessonsChapter1[0].id}`)
        ).toBeInTheDocument();
        expect(
          screen.getByTestId(`lesson-title-${mockLessonsChapter1[1].id}`)
        ).toBeInTheDocument();
      });
    });
  });
});
