import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import { render, screen, waitFor, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { useAuthStore } from '@/features/auth/auth-store';
import {
  BlockedLessonsTable,
  QuickEditLessonDrawer,
  BulkPublishModal,
  isValidIsoDate,
} from './index';
import type {
  BlockedLessonPreviewItem,
  BulkPublishPreviewResponse,
  PublisherLessonItem,
} from './types';

const mockLessonFull: PublisherLessonItem = {
  id: 'l1111111-1111-1111-1111-111111111111',
  title: 'Introduction aux Microservices',
  description: 'Présentation des principes fondamentaux des architectures distribuées.',
  teacher: 'Prof. Alan Turing',
  course_date: '2026-11-10',
  position: 1,
  is_deleted: false,
  is_published: false,
  last_modified_by: { id: 'u1', email: 'publisher@brainx.edu' },
  updated_at: '2026-11-04T10:00:00Z',
};

const mockLessonIncomplete: PublisherLessonItem = {
  id: 'l2222222-2222-2222-2222-222222222222',
  title: 'Architecture Événementielle',
  description: '',
  teacher: '',
  course_date: '',
  position: 2,
  is_deleted: false,
  is_published: false,
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

describe('Story FE-5.3: Tableau Interactif des Leçons Bloquées (errors.blocked) & Résolution Rapide', () => {
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
  // 1. Date Validation Helper Tests
  // =========================================================================
  describe('ISO Date Validation Helper (isValidIsoDate)', () => {
    it('accepts strictly valid YYYY-MM-DD calendar dates', () => {
      expect(isValidIsoDate('2026-11-04')).toBe(true);
      expect(isValidIsoDate('2024-02-29')).toBe(true); // leap year
      expect(isValidIsoDate('2000-01-01')).toBe(true);
    });

    it('rejects invalid formatting and impossible calendar dates', () => {
      expect(isValidIsoDate('2026/11/04')).toBe(false);
      expect(isValidIsoDate('04-11-2026')).toBe(false);
      expect(isValidIsoDate('2026-02-29')).toBe(false); // non-leap year
      expect(isValidIsoDate('2026-13-01')).toBe(false);
      expect(isValidIsoDate('2026-00-10')).toBe(false);
      expect(isValidIsoDate('2026-04-31')).toBe(false);
      expect(isValidIsoDate('random-string')).toBe(false);
      expect(isValidIsoDate('')).toBe(false);
    });
  });

  // =========================================================================
  // 2. BlockedLessonsTable Component Unit Tests (AC-1, AC-2)
  // =========================================================================
  describe('BlockedLessonsTable Component', () => {
    it('AC-1: displays amber alert section listing blocked lessons by name when title is populated', () => {
      const blockedItems: BlockedLessonPreviewItem[] = [
        {
          id: '1',
          title: 'Introduction',
          missing: ['description', 'teacher'],
        },
      ];

      render(
        <BlockedLessonsTable
          blocked={blockedItems}
          onEditLesson={vi.fn()}
        />
      );

      const tableContainer = screen.getByTestId('blocked-lessons-table');
      expect(tableContainer).toBeInTheDocument();
      expect(tableContainer).toHaveClass('border-warning-border', 'bg-warning-surface');

      const row = screen.getByTestId('blocked-lesson-row-1');
      expect(row).toBeInTheDocument();
      expect(within(row).getByTestId('blocked-lesson-title-1')).toHaveTextContent('Introduction');
    });

    it('AC-1: gracefully falls back to "Leçon sans titre" when title is missing in metadata', () => {
      const blockedItems: BlockedLessonPreviewItem[] = [
        {
          id: '2',
          missing: ['title', 'description', 'teacher', 'course_date'],
        },
      ];

      render(
        <BlockedLessonsTable
          blocked={blockedItems}
          onEditLesson={vi.fn()}
        />
      );

      const row = screen.getByTestId('blocked-lesson-row-2');
      expect(within(row).getByTestId('blocked-lesson-title-2')).toHaveTextContent('Leçon sans titre');
    });

    it('AC-1: resolves title via fetchManageableLesson(id) when title is not provided in preview and not missing', async () => {
      globalThis.fetch = vi.fn().mockResolvedValue({
        ok: true,
        status: 200,
        text: () =>
          Promise.resolve(
            JSON.stringify({
              id: '3',
              title: 'Patrons de Conception Distribués',
              missing: ['teacher'],
            })
          ),
      });

      const blockedItems: BlockedLessonPreviewItem[] = [
        {
          id: '3',
          missing: ['teacher'],
        },
      ];

      render(
        <BlockedLessonsTable
          blocked={blockedItems}
          onEditLesson={vi.fn()}
        />
      );

      await waitFor(() => {
        expect(
          screen.getByTestId('blocked-lesson-title-3')
        ).toHaveTextContent('Patrons de Conception Distribués');
      });
    });

    it('falls back to "Leçon sans titre" when fetchManageableLesson rejects', async () => {
      globalThis.fetch = vi.fn().mockRejectedValue(new Error('Network error on title fetch'));

      const blockedItems: BlockedLessonPreviewItem[] = [
        {
          id: '3-err',
          missing: ['teacher'],
        },
      ];

      render(
        <BlockedLessonsTable
          blocked={blockedItems}
          onEditLesson={vi.fn()}
        />
      );

      await waitFor(() => {
        expect(
          screen.getByTestId('blocked-lesson-title-3-err')
        ).toHaveTextContent('Leçon sans titre');
      });
    });

    it('disables edit button when isUpdating is true', () => {
      const blockedItems: BlockedLessonPreviewItem[] = [
        {
          id: 'upd-1',
          title: 'Algorithmes Distribués',
          missing: ['description'],
        },
      ];

      render(
        <BlockedLessonsTable
          blocked={blockedItems}
          onEditLesson={vi.fn()}
          isUpdating={true}
        />
      );

      const editBtn = screen.getByTestId('edit-blocked-lesson-btn-upd-1');
      expect(editBtn).toBeDisabled();
    });

    it('AC-2: displays all 4 missing fields in canonical order with French labels and red badge pills', () => {
      const blockedItems: BlockedLessonPreviewItem[] = [
        {
          id: '4',
          missing: ['course_date', 'title', 'teacher', 'description'], // unordered
        },
      ];

      render(
        <BlockedLessonsTable
          blocked={blockedItems}
          onEditLesson={vi.fn()}
        />
      );

      const row = screen.getByTestId('blocked-lesson-row-4');
      const badges = within(row).getAllByTestId(/^missing-field-badge-/);
      expect(badges).toHaveLength(4);

      // Verify canonical order: Titre -> Description -> Enseignant -> Date
      expect(badges[0]).toHaveTextContent('Titre');
      expect(badges[1]).toHaveTextContent('Description');
      expect(badges[2]).toHaveTextContent('Enseignant');
      expect(badges[3]).toHaveTextContent('Date');

      // Verify destructive red styling
      badges.forEach((badge) => {
        expect(badge).toHaveClass(
          'border-destructive-border',
          'bg-destructive-surface',
          'text-destructive'
        );
      });
    });

    it('AC-3: renders accessible "Modifier la leçon" button with minimum 44x44px touch target', async () => {
      const user = userEvent.setup();
      const onEditMock = vi.fn();
      const blockedItems: BlockedLessonPreviewItem[] = [
        {
          id: '5',
          title: 'Sécurité et Chiffrement',
          missing: ['teacher'],
        },
      ];

      render(
        <BlockedLessonsTable
          blocked={blockedItems}
          onEditLesson={onEditMock}
        />
      );

      const editBtn = screen.getByTestId('edit-blocked-lesson-btn-5');
      expect(editBtn).toBeInTheDocument();
      expect(editBtn).toHaveTextContent('Modifier la leçon');
      expect(editBtn).toHaveClass('min-h-[44px]', 'min-w-[44px]');

      await user.click(editBtn);
      expect(onEditMock).toHaveBeenCalledTimes(1);
      expect(onEditMock).toHaveBeenCalledWith('5');
    });

    it('preserves 360px mobile viewport floor with overflow-x-auto container', () => {
      const blockedItems: BlockedLessonPreviewItem[] = [
        {
          id: '6',
          title: 'Test Mobile Viewport',
          missing: ['description'],
        },
      ];

      const { container } = render(
        <BlockedLessonsTable
          blocked={blockedItems}
          onEditLesson={vi.fn()}
        />
      );

      const scrollContainer = container.querySelector('.overflow-x-auto');
      expect(scrollContainer).toBeInTheDocument();
    });

    it('does not render for non-publisher users or when blocked list is empty', () => {
      setupStudentAuth();
      const { container: studentContainer, unmount } = render(
        <BlockedLessonsTable
          blocked={[{ id: '1', title: 'Leçon 1', missing: ['teacher'] }]}
          onEditLesson={vi.fn()}
        />
      );
      expect(studentContainer).toBeEmptyDOMElement();
      unmount();

      setupPublisherAuth();
      const { container: emptyContainer } = render(
        <BlockedLessonsTable
          blocked={[]}
          onEditLesson={vi.fn()}
        />
      );
      expect(emptyContainer).toBeEmptyDOMElement();
    });
  });

  // =========================================================================
  // 3. QuickEditLessonDrawer Component Unit Tests
  // =========================================================================
  describe('QuickEditLessonDrawer Component', () => {
    it('preloads existing lesson metadata and focuses the first missing field', async () => {
      globalThis.fetch = vi.fn().mockResolvedValue({
        ok: true,
        status: 200,
        text: () => Promise.resolve(JSON.stringify(mockLessonIncomplete)),
      });

      render(
        <QuickEditLessonDrawer
          isOpen={true}
          lessonId={mockLessonIncomplete.id}
          onClose={vi.fn()}
          onSaveSuccess={vi.fn()}
        />
      );

      expect(screen.getByTestId('quick-edit-loading')).toBeInTheDocument();

      await waitFor(() => {
        expect(screen.getByTestId('quick-edit-title-input')).toHaveValue(
          'Architecture Événementielle'
        );
      });

      expect(screen.getByTestId('quick-edit-description-input')).toHaveValue('');
      expect(screen.getByTestId('quick-edit-teacher-input')).toHaveValue('');
      expect(screen.getByTestId('quick-edit-date-input')).toHaveValue('');

      // Title is present, description is empty -> description must receive focus
      await waitFor(() => {
        expect(screen.getByTestId('quick-edit-description-input')).toHaveFocus();
      });
    });

    it('displays load error alert and offers retry when fetching lesson data fails', async () => {
      const user = userEvent.setup();
      const fetchSpy = vi.fn().mockRejectedValueOnce(new Error('Network error on lesson fetch'));

      globalThis.fetch = fetchSpy;

      render(
        <QuickEditLessonDrawer
          isOpen={true}
          lessonId="err-lesson"
          onClose={vi.fn()}
          onSaveSuccess={vi.fn()}
        />
      );

      await waitFor(() => {
        expect(screen.getByTestId('quick-edit-load-error')).toBeInTheDocument();
        expect(screen.getByTestId('quick-edit-load-error')).toHaveTextContent(
          'Network error on lesson fetch'
        );
      });

      // Retry mechanism
      fetchSpy.mockResolvedValueOnce({
        ok: true,
        status: 200,
        text: () => Promise.resolve(JSON.stringify(mockLessonFull)),
      });

      await user.click(screen.getByTestId('quick-edit-retry-btn'));

      await waitFor(() => {
        expect(screen.getByTestId('quick-edit-title-input')).toHaveValue(
          'Introduction aux Microservices'
        );
      });
    });

    it('blocks submission with whitespace-only or empty fields and displays inline validation errors', async () => {
      const user = userEvent.setup();
      globalThis.fetch = vi.fn().mockResolvedValue({
        ok: true,
        status: 200,
        text: () => Promise.resolve(JSON.stringify(mockLessonIncomplete)),
      });

      render(
        <QuickEditLessonDrawer
          isOpen={true}
          lessonId={mockLessonIncomplete.id}
          onClose={vi.fn()}
          onSaveSuccess={vi.fn()}
        />
      );

      await waitFor(() => {
        expect(screen.getByTestId('quick-edit-title-input')).toBeInTheDocument();
      });

      // Clear title with whitespace
      await user.clear(screen.getByTestId('quick-edit-title-input'));
      await user.type(screen.getByTestId('quick-edit-title-input'), '   ');

      // Click save
      await user.click(screen.getByTestId('quick-edit-save-btn'));

      // Validate all inline errors
      expect(screen.getByTestId('quick-edit-title-error')).toHaveTextContent(
        'Le titre est obligatoire.'
      );
      expect(screen.getByTestId('quick-edit-description-error')).toHaveTextContent(
        'La description est obligatoire.'
      );
      expect(screen.getByTestId('quick-edit-teacher-error')).toHaveTextContent(
        "L'enseignant est obligatoire."
      );
      expect(screen.getByTestId('quick-edit-date-error')).toHaveTextContent(
        'La date du cours est obligatoire.'
      );

      // Verify no PATCH call was made
      expect(
        vi.mocked(globalThis.fetch).mock.calls.some(
          ([url, opts]) =>
            String(url).includes('/api/v1/lessons/') && opts?.method === 'PATCH'
        )
      ).toBe(false);
    });

    it('blocks submission with invalid ISO date and announces error', async () => {
      const user = userEvent.setup();
      globalThis.fetch = vi.fn().mockResolvedValue({
        ok: true,
        status: 200,
        text: () => Promise.resolve(JSON.stringify(mockLessonFull)),
      });

      render(
        <QuickEditLessonDrawer
          isOpen={true}
          lessonId={mockLessonFull.id}
          onClose={vi.fn()}
          onSaveSuccess={vi.fn()}
        />
      );

      await waitFor(() => {
        expect(screen.getByTestId('quick-edit-date-input')).toHaveValue('2026-11-10');
      });

      // Type invalid date (format incorrect or impossible date)
      await user.clear(screen.getByTestId('quick-edit-date-input'));
      await user.type(screen.getByTestId('quick-edit-date-input'), '2026-02-30');

      await user.click(screen.getByTestId('quick-edit-save-btn'));

      expect(screen.getByTestId('quick-edit-date-error')).toHaveTextContent(
        'Format de date invalide (AAAA-MM-JJ requis).'
      );
    });

    it('submits valid updates via PATCH /api/v1/lessons/:id/ and invokes onSaveSuccess', async () => {
      const user = userEvent.setup();
      const onSaveSuccessMock = vi.fn();
      const onCloseMock = vi.fn();

      const fetchSpy = vi.fn().mockImplementation((url: string, opts?: RequestInit) => {
        if (opts?.method === 'PATCH') {
          return Promise.resolve({
            ok: true,
            status: 200,
            text: () => Promise.resolve(JSON.stringify(mockLessonFull)),
          });
        }
        return Promise.resolve({
          ok: true,
          status: 200,
          text: () => Promise.resolve(JSON.stringify(mockLessonIncomplete)),
        });
      });
      globalThis.fetch = fetchSpy;

      render(
        <QuickEditLessonDrawer
          isOpen={true}
          lessonId={mockLessonIncomplete.id}
          onClose={onCloseMock}
          onSaveSuccess={onSaveSuccessMock}
        />
      );

      await waitFor(() => {
        expect(screen.getByTestId('quick-edit-title-input')).toBeInTheDocument();
      });

      // Fill missing fields
      await user.type(
        screen.getByTestId('quick-edit-description-input'),
        'Découverte des architectures orientées événements et bus Kafka.'
      );
      await user.type(
        screen.getByTestId('quick-edit-teacher-input'),
        'Prof. Grace Hopper'
      );
      await user.type(
        screen.getByTestId('quick-edit-date-input'),
        '2026-12-01'
      );

      await user.click(screen.getByTestId('quick-edit-save-btn'));

      await waitFor(() => {
        expect(onSaveSuccessMock).toHaveBeenCalledTimes(1);
        expect(onCloseMock).toHaveBeenCalledTimes(1);
      });

      // Verify PATCH call payload
      const patchCall = fetchSpy.mock.calls.find(
        ([url, opts]) =>
          String(url).includes(`/api/v1/lessons/${mockLessonIncomplete.id}/`) &&
          opts?.method === 'PATCH'
      );
      expect(patchCall).toBeDefined();
      const patchBody = JSON.parse(String(patchCall?.[1]?.body));
      expect(patchBody).toEqual({
        title: 'Architecture Événementielle',
        description: 'Découverte des architectures orientées événements et bus Kafka.',
        teacher: 'Prof. Grace Hopper',
        course_date: '2026-12-01',
      });
    });

    it('displays server RFC 9457 error alert when PATCH request fails and keeps drawer open', async () => {
      const user = userEvent.setup();

      const fetchSpy = vi.fn().mockImplementation((url: string, opts?: RequestInit) => {
        if (opts?.method === 'PATCH') {
          return Promise.resolve({
            ok: false,
            status: 400,
            text: () =>
              Promise.resolve(
                JSON.stringify({
                  type: 'https://brainx.edu/errors/validation',
                  title: 'Validation Error',
                  status: 400,
                  detail: 'La date du cours est dans le passé non autorisé.',
                  errors: {},
                })
              ),
          });
        }
        return Promise.resolve({
          ok: true,
          status: 200,
          text: () => Promise.resolve(JSON.stringify(mockLessonFull)),
        });
      });
      globalThis.fetch = fetchSpy;

      render(
        <QuickEditLessonDrawer
          isOpen={true}
          lessonId={mockLessonFull.id}
          onClose={vi.fn()}
          onSaveSuccess={vi.fn()}
        />
      );

      await waitFor(() => {
        expect(screen.getByTestId('quick-edit-save-btn')).toBeInTheDocument();
      });

      await user.click(screen.getByTestId('quick-edit-save-btn'));

      await waitFor(() => {
        expect(screen.getByTestId('quick-edit-server-error')).toBeInTheDocument();
        expect(screen.getByTestId('quick-edit-server-error')).toHaveTextContent(
          'La date du cours est dans le passé non autorisé.'
        );
      });

      // Form is still open
      expect(screen.getByTestId('quick-edit-lesson-drawer')).toBeInTheDocument();
    });

    it('maps backend RFC 9457 field errors to inline field alerts', async () => {
      const user = userEvent.setup();

      const fetchSpy = vi.fn().mockImplementation((url: string, opts?: RequestInit) => {
        if (opts?.method === 'PATCH') {
          return Promise.resolve({
            ok: false,
            status: 400,
            text: () =>
              Promise.resolve(
                JSON.stringify({
                  type: 'https://brainx.edu/errors/validation',
                  title: 'Validation Error',
                  status: 400,
                  detail: 'Données invalides.',
                  errors: {
                    title: ['Ce titre est déjà utilisé.'],
                    teacher: ["L'enseignant n'est pas accrédité."],
                  },
                })
              ),
          });
        }
        return Promise.resolve({
          ok: true,
          status: 200,
          text: () => Promise.resolve(JSON.stringify(mockLessonFull)),
        });
      });
      globalThis.fetch = fetchSpy;

      render(
        <QuickEditLessonDrawer
          isOpen={true}
          lessonId={mockLessonFull.id}
          onClose={vi.fn()}
          onSaveSuccess={vi.fn()}
        />
      );

      await waitFor(() => {
        expect(screen.getByTestId('quick-edit-save-btn')).toBeInTheDocument();
      });

      await user.click(screen.getByTestId('quick-edit-save-btn'));

      await waitFor(() => {
        expect(screen.getByTestId('quick-edit-title-error')).toHaveTextContent(
          'Ce titre est déjà utilisé.'
        );
        expect(screen.getByTestId('quick-edit-teacher-error')).toHaveTextContent(
          "L'enseignant n'est pas accrédité."
        );
      });
    });

    it('closes when clicking Annuler button', async () => {
      const user = userEvent.setup();
      const onCloseMock = vi.fn();

      globalThis.fetch = vi.fn().mockResolvedValue({
        ok: true,
        status: 200,
        text: () => Promise.resolve(JSON.stringify(mockLessonFull)),
      });

      render(
        <QuickEditLessonDrawer
          isOpen={true}
          lessonId={mockLessonFull.id}
          onClose={onCloseMock}
          onSaveSuccess={vi.fn()}
        />
      );

      await waitFor(() => {
        expect(screen.getByTestId('quick-edit-cancel-btn')).toBeInTheDocument();
      });

      await user.click(screen.getByTestId('quick-edit-cancel-btn'));
      expect(onCloseMock).toHaveBeenCalledTimes(1);
    });
  });

  // =========================================================================
  // 4. Integrated BulkPublishModal End-to-End Workflow Tests (AC-3 Live Transition)
  // =========================================================================
  describe('BulkPublishModal Live Blocked Lesson Resolution Workflow', () => {
    it('seamlessly transitions blocked lesson to ready state upon save and refetches preview live', async () => {
      const user = userEvent.setup();

      let previewIteration = 0;
      const initialPreview: BulkPublishPreviewResponse = {
        would_change: 0,
        blocked: [
          {
            id: mockLessonIncomplete.id,
            title: mockLessonIncomplete.title,
            missing: ['description', 'teacher', 'course_date'],
          },
        ],
      };

      const resolvedPreview: BulkPublishPreviewResponse = {
        would_change: 1,
        blocked: [],
      };

      const fetchSpy = vi.fn().mockImplementation((url: string, opts?: RequestInit) => {
        if (String(url).includes('/bulk-publish/preview/')) {
          if (previewIteration === 0) {
            previewIteration++;
            return Promise.resolve({
              ok: true,
              status: 200,
              text: () => Promise.resolve(JSON.stringify(initialPreview)),
            });
          }
          return Promise.resolve({
            ok: true,
            status: 200,
            text: () => Promise.resolve(JSON.stringify(resolvedPreview)),
          });
        }

        if (opts?.method === 'PATCH') {
          return Promise.resolve({
            ok: true,
            status: 200,
            text: () => Promise.resolve(JSON.stringify(mockLessonFull)),
          });
        }

        if (String(url).includes(`/api/v1/lessons/${mockLessonIncomplete.id}/`)) {
          return Promise.resolve({
            ok: true,
            status: 200,
            text: () => Promise.resolve(JSON.stringify(mockLessonIncomplete)),
          });
        }

        return Promise.reject(new Error(`Unhandled URL: ${url}`));
      });
      globalThis.fetch = fetchSpy;

      render(
        <BulkPublishModal
          isOpen={true}
          onClose={vi.fn()}
          type="module"
          item={{ id: 'm1', name: 'Module Architecture' }}
        />
      );

      // 1. Initial State: 1 blocked lesson
      await waitFor(() => {
        expect(screen.getByTestId('bulk-publish-blocked-summary')).toHaveTextContent(
          '1 leçon bloquée'
        );
        expect(screen.getByTestId('blocked-lessons-table')).toBeInTheDocument();
      });

      const row = screen.getByTestId(`blocked-lesson-row-${mockLessonIncomplete.id}`);
      expect(within(row).getByTestId(`blocked-lesson-title-${mockLessonIncomplete.id}`)).toHaveTextContent(
        'Architecture Événementielle'
      );

      // Missing badges: Description, Enseignant, Date
      expect(within(row).getByTestId('missing-field-badge-description')).toHaveTextContent(
        'Description'
      );
      expect(within(row).getByTestId('missing-field-badge-teacher')).toHaveTextContent(
        'Enseignant'
      );
      expect(within(row).getByTestId('missing-field-badge-course_date')).toHaveTextContent(
        'Date'
      );

      // 2. Click "Modifier la leçon"
      const editBtn = screen.getByTestId(`edit-blocked-lesson-btn-${mockLessonIncomplete.id}`);
      await user.click(editBtn);

      // 3. Quick Edit Drawer opens
      await waitFor(() => {
        expect(screen.getByTestId('quick-edit-lesson-drawer')).toBeInTheDocument();
      });

      // 4. Fill in the missing fields
      await user.type(
        screen.getByTestId('quick-edit-description-input'),
        'Description complète de la leçon'
      );
      await user.type(
        screen.getByTestId('quick-edit-teacher-input'),
        'Prof. Edsger Dijkstra'
      );
      await user.type(
        screen.getByTestId('quick-edit-date-input'),
        '2026-11-20'
      );

      // 5. Submit the drawer form
      await user.click(screen.getByTestId('quick-edit-save-btn'));

      // 6. Live transition: drawer closes, preview refetched, blocked disappears, ready summary appears
      await waitFor(() => {
        expect(screen.queryByTestId('quick-edit-lesson-drawer')).not.toBeInTheDocument();
        expect(screen.queryByTestId('blocked-lessons-table')).not.toBeInTheDocument();
        expect(screen.getByTestId('bulk-publish-ready-summary')).toHaveTextContent(
          '1 leçon prête à être publiée'
        );
      });
    });

    it('shields parent modal from dismissal while quick edit drawer is active', async () => {
      const user = userEvent.setup();
      const onCloseModalMock = vi.fn();

      const previewData: BulkPublishPreviewResponse = {
        would_change: 0,
        blocked: [
          {
            id: mockLessonIncomplete.id,
            title: mockLessonIncomplete.title,
            missing: ['description'],
          },
        ],
      };

      globalThis.fetch = vi.fn().mockImplementation((url: string) => {
        if (String(url).includes('/bulk-publish/preview/')) {
          return Promise.resolve({
            ok: true,
            status: 200,
            text: () => Promise.resolve(JSON.stringify(previewData)),
          });
        }
        if (String(url).includes(`/api/v1/lessons/${mockLessonIncomplete.id}/`)) {
          return Promise.resolve({
            ok: true,
            status: 200,
            text: () => Promise.resolve(JSON.stringify(mockLessonIncomplete)),
          });
        }
        return Promise.reject(new Error(`Unhandled URL: ${url}`));
      });

      render(
        <BulkPublishModal
          isOpen={true}
          onClose={onCloseModalMock}
          type="module"
          item={{ id: 'm1', name: 'Module Architecture' }}
        />
      );

      await waitFor(() => {
        expect(screen.getByTestId('blocked-lessons-table')).toBeInTheDocument();
      });

      // Open Quick Edit Drawer
      const editBtn = screen.getByTestId(`edit-blocked-lesson-btn-${mockLessonIncomplete.id}`);
      await user.click(editBtn);

      await waitFor(() => {
        expect(screen.getByTestId('quick-edit-lesson-drawer')).toBeInTheDocument();
      });

      // Press Escape: Radix closes the top dialog (drawer), NOT the parent modal
      await user.keyboard('{Escape}');

      await waitFor(() => {
        expect(screen.queryByTestId('quick-edit-lesson-drawer')).not.toBeInTheDocument();
      });

      // Parent modal must NOT have called onClose
      expect(onCloseModalMock).not.toHaveBeenCalled();
      expect(screen.getByTestId('bulk-publish-modal')).toBeInTheDocument();
    });
  });
});
