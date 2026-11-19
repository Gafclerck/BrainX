import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { render, screen, waitFor, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { MemoryRouter, Routes, Route, Link } from 'react-router-dom';
import { useAuthStore } from '@/features/auth/auth-store';
import { ChapterLessonsPage } from './chapter-lessons-page';
import { ResourceBadge } from '@/components/ui/resource-badge';
import { AppRoutes } from '@/routes';

describe('Story FE-2.3: Liste des Leçons d\'un Chapitre & Filtre par Plage de Dates', () => {
  const originalFetch = globalThis.fetch;

  beforeEach(() => {
    vi.restoreAllMocks();
    useAuthStore.getState().clearAuth();
    useAuthStore.getState().setTokens({
      access: 'valid_student_jwt',
      refresh: 'valid_refresh_jwt',
    });
  });

  afterEach(() => {
    globalThis.fetch = originalFetch;
  });

  const mockLessonsResponse = {
    count: 3,
    next: null,
    previous: null,
    results: [
      {
        id: 'l1111111-1111-1111-1111-111111111111',
        title: 'Introduction aux Vues Génériques Django',
        course_name: 'Architecture Django',
        module_name: 'Vues et Routage',
        chapter_name: 'Vues Basées sur les Classes',
        teacher: 'Prof. Ada Lovelace',
        course_date: '2026-10-28',
        resources: [
          { id: 'r1', type: 'document' as const, title: 'Support PDF' },
          { id: 'r2', type: 'video' as const, title: 'Vidéo explicative' },
        ],
      },
      {
        id: 'l2222222-2222-2222-2222-222222222222',
        title: 'Authentification JWT et Sécurité',
        course_name: 'Architecture Django',
        module_name: 'Vues et Routage',
        chapter_name: 'Vues Basées sur les Classes',
        teacher: 'Prof. Alan Turing',
        course_date: '2026-10-25',
        resources: [
          { id: 'r3', type: 'image' as const, title: 'Diagramme de flux' },
          { id: 'r4', type: 'external_link' as const, title: 'RFC 7519' },
        ],
      },
      {
        id: 'l3333333-3333-3333-3333-333333333333',
        title: 'Permissions DRF et Politiques d\'Accès',
        course_name: 'Architecture Django',
        module_name: 'Vues et Routage',
        chapter_name: 'Vues Basées sur les Classes',
        teacher: 'Prof. Ada Lovelace',
        course_date: '2026-10-20',
        resources: [],
      },
    ],
  };

  // ---------------------------------------------------------------------------
  // AC-1: Happy Path & Lesson Cards Rendering
  // ---------------------------------------------------------------------------
  describe('AC-1: Happy Path & Lessons Rendering', () => {
    it('calls GET /api/v1/browse/chapters/:chapterId/lessons/ and renders lesson cards with title, teacher, and date', async () => {
      const fetchSpy = vi.fn().mockImplementation((url: string) => {
        if (url.includes('/api/v1/browse/chapters/chap-123/lessons/')) {
          return Promise.resolve({
            ok: true,
            status: 200,
            text: () => Promise.resolve(JSON.stringify(mockLessonsResponse)),
            headers: new Headers({ 'content-type': 'application/json' }),
          });
        }
        return Promise.reject(new Error(`Unhandled URL: ${url}`));
      });
      globalThis.fetch = fetchSpy;

      render(
        <MemoryRouter initialEntries={['/chapters/chap-123']}>
          <Routes>
            <Route path="/chapters/:chapterId" element={<ChapterLessonsPage />} />
          </Routes>
        </MemoryRouter>
      );

      // Loading skeleton is visible initially
      expect(screen.getByTestId('lessons-loading-skeletons')).toBeInTheDocument();

      // Heading and breadcrumbs are present
      expect(screen.getByTestId('back-to-courses-link')).toHaveAttribute('href', '/courses');

      // Wait for lessons to be rendered
      await waitFor(() => {
        expect(
          screen.getByText('Introduction aux Vues Génériques Django')
        ).toBeInTheDocument();
      });

      // Assert chapter title in heading from first lesson
      expect(
        screen.getByRole('heading', { level: 1, name: 'Leçons du Chapitre' })
      ).toBeInTheDocument();
      expect(screen.getByText(/Vues Basées sur les Classes/)).toBeInTheDocument();

      // Assert teacher names
      expect(screen.getAllByText('Prof. Ada Lovelace').length).toBe(2);
      expect(screen.getByText('Prof. Alan Turing')).toBeInTheDocument();

      // Assert dates in JetBrains Mono font-mono
      const date1 = screen.getByText('2026-10-28');
      expect(date1).toBeInTheDocument();
      expect(date1.parentElement?.className).toContain('font-mono');

      const date2 = screen.getByText('2026-10-25');
      expect(date2).toBeInTheDocument();
      expect(date2.parentElement?.className).toContain('font-mono');

      // Assert lesson card links
      const lesson1Card = screen.getByTestId('lesson-card-l1111111-1111-1111-1111-111111111111');
      expect(lesson1Card).toHaveAttribute('href', '/lessons/l1111111-1111-1111-1111-111111111111');

      // Assert micro-badges rendered for attached resources
      expect(screen.getByTestId('resource-badge-document')).toBeInTheDocument();
      expect(screen.getByTestId('resource-badge-video')).toBeInTheDocument();
      expect(screen.getByTestId('resource-badge-image')).toBeInTheDocument();
      expect(screen.getByTestId('resource-badge-external_link')).toBeInTheDocument();

      // Assert API was called with Bearer token
      expect(fetchSpy).toHaveBeenCalledWith(
        expect.stringContaining('/api/v1/browse/chapters/chap-123/lessons/'),
        expect.objectContaining({
          headers: expect.objectContaining({
            Authorization: 'Bearer valid_student_jwt',
          }),
        })
      );
    });

    it('enforces minimum touch targets of 48px on all interactive elements', async () => {
      globalThis.fetch = vi.fn().mockResolvedValue({
        ok: true,
        status: 200,
        text: () => Promise.resolve(JSON.stringify(mockLessonsResponse)),
        headers: new Headers({ 'content-type': 'application/json' }),
      });

      render(
        <MemoryRouter initialEntries={['/chapters/chap-123']}>
          <Routes>
            <Route path="/chapters/:chapterId" element={<ChapterLessonsPage />} />
          </Routes>
        </MemoryRouter>
      );

      await waitFor(() => {
        expect(
          screen.getByText('Introduction aux Vues Génériques Django')
        ).toBeInTheDocument();
      });

      const backLink = screen.getByTestId('back-to-courses-link');
      expect(backLink.className).toContain('min-h-[48px]');

      const filterSubmitBtn = screen.getByTestId('filter-submit-btn');
      expect(filterSubmitBtn.className).toContain('min-h-[48px]');

      const inputFrom = screen.getByTestId('filter-date-from');
      expect(inputFrom.className).toContain('min-h-[48px]');

      const inputTo = screen.getByTestId('filter-date-to');
      expect(inputTo.className).toContain('min-h-[48px]');

      const lessonCard = screen.getByTestId('lesson-card-l1111111-1111-1111-1111-111111111111');
      expect(lessonCard.className).toContain('min-h-[48px]');
    });
  });

  // ---------------------------------------------------------------------------
  // AC-2: Date Range Filtering & Query Parameters
  // ---------------------------------------------------------------------------
  describe('AC-2: Date Range Filtering', () => {
    it('submits date range filters and triggers API query with course_date_from and course_date_to', async () => {
      const user = userEvent.setup();
      const filteredResponse = {
        count: 1,
        next: null,
        previous: null,
        results: [mockLessonsResponse.results[0]],
      };

      const fetchSpy = vi.fn().mockImplementation((url: string) => {
        if (
          url.includes('/api/v1/browse/chapters/chap-123/lessons/') &&
          url.includes('course_date_from=2026-10-26') &&
          url.includes('course_date_to=2026-10-30')
        ) {
          return Promise.resolve({
            ok: true,
            status: 200,
            text: () => Promise.resolve(JSON.stringify(filteredResponse)),
            headers: new Headers({ 'content-type': 'application/json' }),
          });
        }
        if (url.includes('/api/v1/browse/chapters/chap-123/lessons/')) {
          return Promise.resolve({
            ok: true,
            status: 200,
            text: () => Promise.resolve(JSON.stringify(mockLessonsResponse)),
            headers: new Headers({ 'content-type': 'application/json' }),
          });
        }
        return Promise.reject(new Error(`Unhandled URL: ${url}`));
      });
      globalThis.fetch = fetchSpy;

      render(
        <MemoryRouter initialEntries={['/chapters/chap-123']}>
          <Routes>
            <Route path="/chapters/:chapterId" element={<ChapterLessonsPage />} />
          </Routes>
        </MemoryRouter>
      );

      await waitFor(() => {
        expect(
          screen.getByText('Introduction aux Vues Génériques Django')
        ).toBeInTheDocument();
      });

      expect(screen.getByText('Authentification JWT et Sécurité')).toBeInTheDocument();

      // Enter start and end dates
      const inputFrom = screen.getByTestId('filter-date-from');
      const inputTo = screen.getByTestId('filter-date-to');
      const submitBtn = screen.getByTestId('filter-submit-btn');

      await user.type(inputFrom, '2026-10-26');
      await user.type(inputTo, '2026-10-30');
      await user.click(submitBtn);

      await waitFor(() => {
        expect(fetchSpy).toHaveBeenCalledWith(
          expect.stringMatching(/course_date_from=2026-10-26.*course_date_to=2026-10-30/),
          expect.anything()
        );
      });

      // Filtered view renders only the 1 matching lesson
      expect(
        screen.getByText('Introduction aux Vues Génériques Django')
      ).toBeInTheDocument();
      expect(
        screen.queryByText('Authentification JWT et Sécurité')
      ).not.toBeInTheDocument();

      // Reset button is visible now that filters are active
      expect(screen.getByTestId('filter-reset-btn')).toBeInTheDocument();
    });

    it('clears date filter and re-queries unfiltered lessons when clicking Réinitialiser', async () => {
      const user = userEvent.setup();
      const fetchSpy = vi.fn().mockImplementation((_url: string) => {
        return Promise.resolve({
          ok: true,
          status: 200,
          text: () => Promise.resolve(JSON.stringify(mockLessonsResponse)),
          headers: new Headers({ 'content-type': 'application/json' }),
        });
      });
      globalThis.fetch = fetchSpy;

      render(
        <MemoryRouter initialEntries={['/chapters/chap-123']}>
          <Routes>
            <Route path="/chapters/:chapterId" element={<ChapterLessonsPage />} />
          </Routes>
        </MemoryRouter>
      );

      await waitFor(() => {
        expect(
          screen.getByText('Introduction aux Vues Génériques Django')
        ).toBeInTheDocument();
      });

      const inputFrom = screen.getByTestId('filter-date-from');
      await user.type(inputFrom, '2026-10-26');
      await user.click(screen.getByTestId('filter-submit-btn'));

      await waitFor(() => {
        expect(screen.getByTestId('filter-reset-btn')).toBeInTheDocument();
      });

      // Click Réinitialiser
      await user.click(screen.getByTestId('filter-reset-btn'));

      // Inputs are reset
      expect(screen.getByTestId('filter-date-from')).toHaveValue('');
      expect(screen.getByTestId('filter-date-to')).toHaveValue('');

      // API was called without course_date query parameters
      await waitFor(() => {
        const lastCallUrl = fetchSpy.mock.calls[fetchSpy.mock.calls.length - 1][0] as string;
        expect(lastCallUrl).not.toContain('course_date_from');
      });
    });

    it('supports single-bound course_date_from filter without course_date_to', async () => {
      const user = userEvent.setup();
      const fetchSpy = vi.fn().mockImplementation((_url: string) => {
        return Promise.resolve({
          ok: true,
          status: 200,
          text: () => Promise.resolve(JSON.stringify(mockLessonsResponse)),
          headers: new Headers({ 'content-type': 'application/json' }),
        });
      });
      globalThis.fetch = fetchSpy;

      render(
        <MemoryRouter initialEntries={['/chapters/chap-123']}>
          <Routes>
            <Route path="/chapters/:chapterId" element={<ChapterLessonsPage />} />
          </Routes>
        </MemoryRouter>
      );

      await waitFor(() => {
        expect(screen.getByText('Introduction aux Vues Génériques Django')).toBeInTheDocument();
      });

      await user.type(screen.getByTestId('filter-date-from'), '2026-10-26');
      await user.click(screen.getByTestId('filter-submit-btn'));

      await waitFor(() => {
        const lastCall = fetchSpy.mock.calls[fetchSpy.mock.calls.length - 1][0] as string;
        expect(lastCall).toContain('course_date_from=2026-10-26');
        expect(lastCall).not.toContain('course_date_to');
      });
    });

    it('supports single-bound course_date_to filter without course_date_from', async () => {
      const user = userEvent.setup();
      const fetchSpy = vi.fn().mockImplementation((_url: string) => {
        return Promise.resolve({
          ok: true,
          status: 200,
          text: () => Promise.resolve(JSON.stringify(mockLessonsResponse)),
          headers: new Headers({ 'content-type': 'application/json' }),
        });
      });
      globalThis.fetch = fetchSpy;

      render(
        <MemoryRouter initialEntries={['/chapters/chap-123']}>
          <Routes>
            <Route path="/chapters/:chapterId" element={<ChapterLessonsPage />} />
          </Routes>
        </MemoryRouter>
      );

      await waitFor(() => {
        expect(screen.getByText('Introduction aux Vues Génériques Django')).toBeInTheDocument();
      });

      await user.type(screen.getByTestId('filter-date-to'), '2026-10-25');
      await user.click(screen.getByTestId('filter-submit-btn'));

      await waitFor(() => {
        const lastCall = fetchSpy.mock.calls[fetchSpy.mock.calls.length - 1][0] as string;
        expect(lastCall).toContain('course_date_to=2026-10-25');
        expect(lastCall).not.toContain('course_date_from');
      });
    });

    it('resets currentPage to 1 when a filter is submitted from page > 1', async () => {
      const user = userEvent.setup();
      const page1Response = {
        count: 25,
        next: 'http://test/api/v1/browse/chapters/chap-123/lessons/?page=2',
        previous: null,
        results: mockLessonsResponse.results,
      };
      const page2Response = {
        count: 25,
        next: null,
        previous: 'http://test/api/v1/browse/chapters/chap-123/lessons/?page=1',
        results: mockLessonsResponse.results,
      };

      const fetchSpy = vi.fn().mockImplementation((url: string) => {
        if (url.includes('page=2')) {
          return Promise.resolve({
            ok: true,
            status: 200,
            text: () => Promise.resolve(JSON.stringify(page2Response)),
            headers: new Headers({ 'content-type': 'application/json' }),
          });
        }
        return Promise.resolve({
          ok: true,
          status: 200,
          text: () => Promise.resolve(JSON.stringify(page1Response)),
          headers: new Headers({ 'content-type': 'application/json' }),
        });
      });
      globalThis.fetch = fetchSpy;

      render(
        <MemoryRouter initialEntries={['/chapters/chap-123']}>
          <Routes>
            <Route path="/chapters/:chapterId" element={<ChapterLessonsPage />} />
          </Routes>
        </MemoryRouter>
      );

      await waitFor(() => {
        expect(screen.getByTestId('lessons-pagination')).toBeInTheDocument();
      });

      // Advance to page 2
      await user.click(screen.getByRole('button', { name: 'Page suivante' }));
      await waitFor(() => {
        const pagination = screen.getByTestId('lessons-pagination');
        expect(within(pagination).getByText(/Page 2/)).toBeInTheDocument();
      });

      // Now submit a date filter while on page 2
      await user.type(screen.getByTestId('filter-date-from'), '2026-10-20');
      await user.click(screen.getByTestId('filter-submit-btn'));

      await waitFor(() => {
        const lastCall = fetchSpy.mock.calls[fetchSpy.mock.calls.length - 1][0] as string;
        expect(lastCall).toContain('course_date_from=2026-10-20');
        expect(lastCall).not.toContain('page=2');
      });

      // Verify page indicator reset to 1
      const pagination = screen.getByTestId('lessons-pagination');
      expect(within(pagination).getByText(/Page 1/)).toBeInTheDocument();
    });
  });

  // ---------------------------------------------------------------------------
  // Empty States
  // ---------------------------------------------------------------------------
  describe('Empty States', () => {
    it('displays sober empty state when chapter has no published lessons', async () => {
      globalThis.fetch = vi.fn().mockResolvedValue({
        ok: true,
        status: 200,
        text: () =>
          Promise.resolve(
            JSON.stringify({ count: 0, next: null, previous: null, results: [] })
          ),
        headers: new Headers({ 'content-type': 'application/json' }),
      });

      render(
        <MemoryRouter initialEntries={['/chapters/empty-chap']}>
          <Routes>
            <Route path="/chapters/:chapterId" element={<ChapterLessonsPage />} />
          </Routes>
        </MemoryRouter>
      );

      await waitFor(() => {
        expect(
          screen.getByText('Ce chapitre ne contient aucune leçon publiée.')
        ).toBeInTheDocument();
      });

      expect(screen.getByTestId('chapter-lessons-empty')).toBeInTheDocument();
      expect(
        screen.getByText(/Les leçons publiées apparaîtront ici dès leur mise en ligne/)
      ).toBeInTheDocument();
    });

    it('displays empty filter state with reset button when date range yields no results', async () => {
      const user = userEvent.setup();
      const fetchSpy = vi.fn().mockImplementation((url: string) => {
        if (url.includes('course_date_from=2026-01-01')) {
          return Promise.resolve({
            ok: true,
            status: 200,
            text: () =>
              Promise.resolve(
                JSON.stringify({ count: 0, next: null, previous: null, results: [] })
              ),
            headers: new Headers({ 'content-type': 'application/json' }),
          });
        }
        return Promise.resolve({
          ok: true,
          status: 200,
          text: () => Promise.resolve(JSON.stringify(mockLessonsResponse)),
          headers: new Headers({ 'content-type': 'application/json' }),
        });
      });
      globalThis.fetch = fetchSpy;

      render(
        <MemoryRouter initialEntries={['/chapters/chap-123']}>
          <Routes>
            <Route path="/chapters/:chapterId" element={<ChapterLessonsPage />} />
          </Routes>
        </MemoryRouter>
      );

      await waitFor(() => {
        expect(
          screen.getByText('Introduction aux Vues Génériques Django')
        ).toBeInTheDocument();
      });

      // Filter by old date
      await user.type(screen.getByTestId('filter-date-from'), '2026-01-01');
      await user.click(screen.getByTestId('filter-submit-btn'));

      await waitFor(() => {
        expect(
          screen.getByText('Aucune leçon ne correspond à cette plage de dates.')
        ).toBeInTheDocument();
      });

      expect(screen.getByTestId('chapter-lessons-filter-empty')).toBeInTheDocument();

      // Reset action button inside empty card
      const resetBtn = screen.getByTestId('empty-reset-filter-btn');
      expect(resetBtn.className).toContain('min-h-[48px]');

      await user.click(resetBtn);

      await waitFor(() => {
        expect(
          screen.getByText('Introduction aux Vues Génériques Django')
        ).toBeInTheDocument();
      });
    });
  });

  // ---------------------------------------------------------------------------
  // Error States: 404, 400, 500
  // ---------------------------------------------------------------------------
  describe('Error States & RFC 9457 Handling', () => {
    it('displays 404 card when chapter is not found or unpublished without crashing', async () => {
      globalThis.fetch = vi.fn().mockResolvedValue({
        ok: false,
        status: 404,
        statusText: 'Not Found',
        text: () =>
          Promise.resolve(
            JSON.stringify({
              type: 'https://errors.brainx.edu/not-found',
              title: 'Not Found',
              status: 404,
              detail: 'Contenu introuvable ou non publié.',
              errors: {},
            })
          ),
        headers: new Headers({ 'content-type': 'application/problem+json' }),
      });

      render(
        <MemoryRouter initialEntries={['/chapters/nonexistent-id']}>
          <Routes>
            <Route path="/chapters/:chapterId" element={<ChapterLessonsPage />} />
          </Routes>
        </MemoryRouter>
      );

      await waitFor(() => {
        expect(screen.getByTestId('chapter-lessons-error-404')).toBeInTheDocument();
      });

      expect(
        screen.getByRole('heading', { name: 'Contenu introuvable ou non publié.' })
      ).toBeInTheDocument();

      const recoveryLink = screen.getByTestId('recovery-courses-link');
      expect(recoveryLink).toHaveAttribute('href', '/courses');
      expect(recoveryLink.className).toContain('min-h-[48px]');
    });

    it('displays RFC 9457 400 validation error naming invalid fields', async () => {
      const user = userEvent.setup();
      const fetchSpy = vi.fn().mockImplementation((url: string) => {
        if (url.includes('course_date_from=2026-11-30')) {
          return Promise.resolve({
            ok: false,
            status: 400,
            statusText: 'Bad Request',
            text: () =>
              Promise.resolve(
                JSON.stringify({
                  type: 'https://errors.brainx.edu/validation-error',
                  title: 'Validation Error',
                  status: 400,
                  detail: 'Le paramètre de date est malformé.',
                  errors: {
                    course_date_from: ['Entrez une date valide au format YYYY-MM-DD.'],
                  },
                })
              ),
            headers: new Headers({ 'content-type': 'application/problem+json' }),
          });
        }
        return Promise.resolve({
          ok: true,
          status: 200,
          text: () => Promise.resolve(JSON.stringify(mockLessonsResponse)),
          headers: new Headers({ 'content-type': 'application/json' }),
        });
      });
      globalThis.fetch = fetchSpy;

      render(
        <MemoryRouter initialEntries={['/chapters/chap-123']}>
          <Routes>
            <Route path="/chapters/:chapterId" element={<ChapterLessonsPage />} />
          </Routes>
        </MemoryRouter>
      );

      await waitFor(() => {
        expect(
          screen.getByText('Introduction aux Vues Génériques Django')
        ).toBeInTheDocument();
      });

      // Submit date that triggers 400 validation error from backend
      await user.type(screen.getByTestId('filter-date-from'), '2026-11-30');
      await user.click(screen.getByTestId('filter-submit-btn'));

      await waitFor(() => {
        expect(screen.getByTestId('chapter-lessons-error-400')).toBeInTheDocument();
      });

      expect(screen.getByText('Le paramètre de date est malformé.')).toBeInTheDocument();
      expect(screen.getByText(/course_date_from/)).toBeInTheDocument();
      expect(
        screen.getByText(/Entrez une date valide au format YYYY-MM-DD/)
      ).toBeInTheDocument();
    });

    it('displays retryable error alert on 500 server error and preserves filter parameters on retry', async () => {
      const user = userEvent.setup();
      let callCount = 0;
      const fetchSpy = vi.fn().mockImplementation((_url: string) => {
        callCount++;
        if (callCount === 1) {
          return Promise.resolve({
            ok: false,
            status: 500,
            statusText: 'Internal Server Error',
            text: () =>
              Promise.resolve(
                JSON.stringify({
                  type: 'https://errors.brainx.edu/server-error',
                  title: 'Internal Server Error',
                  status: 500,
                  detail: 'Erreur interne du serveur.',
                  errors: {},
                })
              ),
            headers: new Headers({ 'content-type': 'application/problem+json' }),
          });
        }
        return Promise.resolve({
          ok: true,
          status: 200,
          text: () => Promise.resolve(JSON.stringify(mockLessonsResponse)),
          headers: new Headers({ 'content-type': 'application/json' }),
        });
      });
      globalThis.fetch = fetchSpy;

      render(
        <MemoryRouter initialEntries={['/chapters/chap-123']}>
          <Routes>
            <Route path="/chapters/:chapterId" element={<ChapterLessonsPage />} />
          </Routes>
        </MemoryRouter>
      );

      await waitFor(() => {
        expect(screen.getByTestId('chapter-lessons-error-network')).toBeInTheDocument();
      });

      expect(
        screen.getByRole('heading', { name: 'Une erreur est survenue lors du chargement.' })
      ).toBeInTheDocument();

      // Click Réessayer
      const retryBtn = screen.getByRole('button', { name: /Réessayer/i });
      expect(retryBtn.className).toContain('min-h-[48px]');
      await user.click(retryBtn);

      await waitFor(() => {
        expect(
          screen.getByText('Introduction aux Vues Génériques Django')
        ).toBeInTheDocument();
      });
    });

    it('provides role="status" and aria-busy="true" on loading skeletons', () => {
      globalThis.fetch = vi.fn().mockReturnValue(new Promise(() => {}));

      render(
        <MemoryRouter initialEntries={['/chapters/chap-123']}>
          <Routes>
            <Route path="/chapters/:chapterId" element={<ChapterLessonsPage />} />
          </Routes>
        </MemoryRouter>
      );

      const skeletons = screen.getByTestId('lessons-loading-skeletons');
      expect(skeletons).toHaveAttribute('role', 'status');
      expect(skeletons).toHaveAttribute('aria-busy', 'true');
    });

    it('hides the date filter bar when chapter is 404', async () => {
      globalThis.fetch = vi.fn().mockResolvedValue({
        ok: false,
        status: 404,
        statusText: 'Not Found',
        text: () =>
          Promise.resolve(
            JSON.stringify({
              type: 'https://errors.brainx.edu/not-found',
              title: 'Not Found',
              status: 404,
              detail: 'Contenu introuvable ou non publié.',
              errors: {},
            })
          ),
        headers: new Headers({ 'content-type': 'application/problem+json' }),
      });

      render(
        <MemoryRouter initialEntries={['/chapters/nonexistent-id']}>
          <Routes>
            <Route path="/chapters/:chapterId" element={<ChapterLessonsPage />} />
          </Routes>
        </MemoryRouter>
      );

      await waitFor(() => {
        expect(screen.getByTestId('chapter-lessons-error-404')).toBeInTheDocument();
      });

      expect(screen.queryByTestId('chapter-lessons-filter-form')).not.toBeInTheDocument();
    });

    it('displays 404 error when chapterId is missing without hanging in loading state', async () => {
      render(
        <MemoryRouter initialEntries={['/chapters/']}>
          <Routes>
            <Route path="/chapters/" element={<ChapterLessonsPage />} />
          </Routes>
        </MemoryRouter>
      );

      await waitFor(() => {
        expect(screen.getByTestId('chapter-lessons-error-404')).toBeInTheDocument();
      });

      expect(screen.queryByTestId('lessons-loading-skeletons')).not.toBeInTheDocument();
      expect(screen.queryByTestId('chapter-lessons-filter-form')).not.toBeInTheDocument();
    });

    it('synchronizes filter reset and fetches new chapter cleanly without stale filters on chapterId change', async () => {
      const user = userEvent.setup();
      const fetchSpy = vi.fn().mockImplementation((_url: string) => {
        return Promise.resolve({
          ok: true,
          status: 200,
          text: () => Promise.resolve(JSON.stringify(mockLessonsResponse)),
          headers: new Headers({ 'content-type': 'application/json' }),
        });
      });
      globalThis.fetch = fetchSpy;

      function TestApp() {
        return (
          <>
            <Link to="/chapters/chap-2" data-testid="nav-to-chap-2">Go to chap-2</Link>
            <Routes>
              <Route path="/chapters/:chapterId" element={<ChapterLessonsPage />} />
            </Routes>
          </>
        );
      }

      render(
        <MemoryRouter initialEntries={['/chapters/chap-1']}>
          <TestApp />
        </MemoryRouter>
      );

      await waitFor(() => {
        expect(screen.getByText('Introduction aux Vues Génériques Django')).toBeInTheDocument();
      });

      // Apply a filter in chapter 1
      await user.type(screen.getByTestId('filter-date-from'), '2026-10-26');
      await user.click(screen.getByTestId('filter-submit-btn'));

      await waitFor(() => {
        const lastCall = fetchSpy.mock.calls[fetchSpy.mock.calls.length - 1][0] as string;
        expect(lastCall).toContain('/chapters/chap-1/lessons/');
        expect(lastCall).toContain('course_date_from=2026-10-26');
      });

      // Navigate to chapter 2
      await user.click(screen.getByTestId('nav-to-chap-2'));

      await waitFor(() => {
        const lastCall = fetchSpy.mock.calls[fetchSpy.mock.calls.length - 1][0] as string;
        expect(lastCall).toContain('/chapters/chap-2/lessons/');
        // Asserts old filter from chapter 1 is NOT applied to chapter 2
        expect(lastCall).not.toContain('course_date_from');
      });

      // Inputs are reset in chapter 2
      expect(screen.getByTestId('filter-date-from')).toHaveValue('');
    });
  });

  // ---------------------------------------------------------------------------
  // DRF Pagination
  // ---------------------------------------------------------------------------
  describe('DRF Pagination', () => {
    it('handles pagination navigation and updates page query', async () => {
      const user = userEvent.setup();
      const page1Response = {
        count: 25,
        next: 'http://test/api/v1/browse/chapters/chap-123/lessons/?page=2',
        previous: null,
        results: mockLessonsResponse.results,
      };

      const page2Response = {
        count: 25,
        next: null,
        previous: 'http://test/api/v1/browse/chapters/chap-123/lessons/?page=1',
        results: [
          {
            id: 'l4444444-4444-4444-4444-444444444444',
            title: 'Leçon Avancée Page Deux',
            course_name: 'Architecture Django',
            module_name: 'Vues et Routage',
            chapter_name: 'Vues Basées sur les Classes',
            teacher: 'Prof. Turing',
            course_date: '2026-10-10',
            resources: [],
          },
        ],
      };

      const fetchSpy = vi.fn().mockImplementation((url: string) => {
        if (url.includes('page=2')) {
          return Promise.resolve({
            ok: true,
            status: 200,
            text: () => Promise.resolve(JSON.stringify(page2Response)),
            headers: new Headers({ 'content-type': 'application/json' }),
          });
        }
        return Promise.resolve({
          ok: true,
          status: 200,
          text: () => Promise.resolve(JSON.stringify(page1Response)),
          headers: new Headers({ 'content-type': 'application/json' }),
        });
      });
      globalThis.fetch = fetchSpy;

      render(
        <MemoryRouter initialEntries={['/chapters/chap-123']}>
          <Routes>
            <Route path="/chapters/:chapterId" element={<ChapterLessonsPage />} />
          </Routes>
        </MemoryRouter>
      );

      await waitFor(() => {
        expect(screen.getByTestId('lessons-pagination')).toBeInTheDocument();
      });

      expect(screen.getByText(/Page 1/)).toBeInTheDocument();

      const nextBtn = screen.getByRole('button', { name: 'Page suivante' });
      const prevBtn = screen.getByRole('button', { name: 'Page précédente' });

      expect(prevBtn).toBeDisabled();
      expect(nextBtn).not.toBeDisabled();

      await user.click(nextBtn);

      await waitFor(() => {
        expect(screen.getByText('Leçon Avancée Page Deux')).toBeInTheDocument();
      });

      const pagination = screen.getByTestId('lessons-pagination');
      expect(within(pagination).getByText(/Page 2/)).toBeInTheDocument();
    });

    it('handles backwards pagination navigation via prevBtn', async () => {
      const user = userEvent.setup();
      const page1Response = {
        count: 25,
        next: 'http://test/api/v1/browse/chapters/chap-123/lessons/?page=2',
        previous: null,
        results: [
          {
            ...mockLessonsResponse.results[0],
            title: 'Leçon Page Une',
          },
        ],
      };

      const page2Response = {
        count: 25,
        next: null,
        previous: 'http://test/api/v1/browse/chapters/chap-123/lessons/?page=1',
        results: [
          {
            ...mockLessonsResponse.results[0],
            title: 'Leçon Page Deux',
          },
        ],
      };

      const fetchSpy = vi.fn().mockImplementation((url: string) => {
        if (url.includes('page=2')) {
          return Promise.resolve({
            ok: true,
            status: 200,
            text: () => Promise.resolve(JSON.stringify(page2Response)),
            headers: new Headers({ 'content-type': 'application/json' }),
          });
        }
        return Promise.resolve({
          ok: true,
          status: 200,
          text: () => Promise.resolve(JSON.stringify(page1Response)),
          headers: new Headers({ 'content-type': 'application/json' }),
        });
      });
      globalThis.fetch = fetchSpy;

      render(
        <MemoryRouter initialEntries={['/chapters/chap-123']}>
          <Routes>
            <Route path="/chapters/:chapterId" element={<ChapterLessonsPage />} />
          </Routes>
        </MemoryRouter>
      );

      await waitFor(() => {
        expect(screen.getByText('Leçon Page Une')).toBeInTheDocument();
      });

      // Forward to page 2
      await user.click(screen.getByRole('button', { name: 'Page suivante' }));
      await waitFor(() => {
        expect(screen.getByText('Leçon Page Deux')).toBeInTheDocument();
      });

      const prevBtn = screen.getByRole('button', { name: 'Page précédente' });
      expect(prevBtn).not.toBeDisabled();

      // Backwards to page 1
      await user.click(prevBtn);

      await waitFor(() => {
        expect(screen.getByText('Leçon Page Une')).toBeInTheDocument();
      });

      expect(screen.getByRole('button', { name: 'Page précédente' })).toBeDisabled();
      const pagination = screen.getByTestId('lessons-pagination');
      expect(within(pagination).getByText(/Page 1/)).toBeInTheDocument();
    });
  });

  // ---------------------------------------------------------------------------
  // ResourceBadge Micro-badges
  // ---------------------------------------------------------------------------
  describe('ResourceBadge Component', () => {
    it('renders the 4 immutable resource types with verbatim tokens from DESIGN.md', () => {
      const { rerender } = render(<ResourceBadge type="document" />);
      const docBadge = screen.getByTestId('resource-badge-document');
      expect(docBadge).toHaveTextContent('document');
      expect(docBadge.className).toContain('text-[#58A6FF]');
      expect(docBadge.className).toContain('bg-[#13233A]');
      expect(docBadge.className).toContain('border-[#1F4273]');

      rerender(<ResourceBadge type="image" />);
      const imgBadge = screen.getByTestId('resource-badge-image');
      expect(imgBadge).toHaveTextContent('image');
      expect(imgBadge.className).toContain('text-[#BC8CFF]');
      expect(imgBadge.className).toContain('bg-[#211838]');
      expect(imgBadge.className).toContain('border-[#42296B]');

      rerender(<ResourceBadge type="video" />);
      const vidBadge = screen.getByTestId('resource-badge-video');
      expect(vidBadge).toHaveTextContent('video');
      expect(vidBadge.className).toContain('text-[#F0883E]');
      expect(vidBadge.className).toContain('bg-[#2E1B13]');
      expect(vidBadge.className).toContain('border-[#663319]');

      rerender(<ResourceBadge type="external_link" />);
      const linkBadge = screen.getByTestId('resource-badge-external_link');
      expect(linkBadge).toHaveTextContent('external_link');
      expect(linkBadge.className).toContain('text-[#39D353]');
      expect(linkBadge.className).toContain('bg-[#132B25]');
      expect(linkBadge.className).toContain('border-[#1D5233]');
    });

    it('contains no forbidden generic terms', () => {
      const types = ['document', 'image', 'video', 'external_link'] as const;
      for (const type of types) {
        const { unmount } = render(<ResourceBadge type={type} />);
        expect(screen.queryByText(/fichiers?/i)).not.toBeInTheDocument();
        expect(screen.queryByText(/attachments?/i)).not.toBeInTheDocument();
        expect(screen.queryByText(/médias?/i)).not.toBeInTheDocument();
        unmount();
      }
    });
  });

  // ---------------------------------------------------------------------------
  // Mobile 360px & AppRoutes Integration
  // ---------------------------------------------------------------------------
  describe('Mobile 360px & AppRoutes Integration', () => {
    it('renders with 360px protection class and mounts ChapterLessonsPage in AppRoutes', async () => {
      globalThis.fetch = vi.fn().mockImplementation((url: string) => {
        if (url.includes('/api/v1/browse/courses/')) {
          return Promise.resolve({
            ok: true,
            status: 200,
            text: () =>
              Promise.resolve(
                JSON.stringify({
                  count: 1,
                  next: null,
                  previous: null,
                  results: [{ id: 'c1', name: 'Cours Test' }],
                })
              ),
            headers: new Headers({ 'content-type': 'application/json' }),
          });
        }
        if (url.includes('/api/v1/browse/chapters/chap-123/lessons/')) {
          return Promise.resolve({
            ok: true,
            status: 200,
            text: () => Promise.resolve(JSON.stringify(mockLessonsResponse)),
            headers: new Headers({ 'content-type': 'application/json' }),
          });
        }
        return Promise.reject(new Error(`Unhandled URL: ${url}`));
      });

      render(
        <MemoryRouter initialEntries={['/chapters/chap-123']}>
          <AppRoutes />
        </MemoryRouter>
      );

      // Verify page mounted inside authenticated student layout
      await waitFor(() => {
        expect(screen.getByTestId('chapter-lessons-page')).toBeInTheDocument();
      });

      const pageContainer = screen.getByTestId('chapter-lessons-page');
      expect(pageContainer.className).toContain('min-w-[360px]');
      expect(pageContainer.className).toContain('overflow-x-hidden');

      // Verify lessons loaded
      await waitFor(() => {
        expect(
          screen.getByText('Introduction aux Vues Génériques Django')
        ).toBeInTheDocument();
      });

      // Verify sidebar recognizes active chapter route without breaking
      const sidebar = screen.getByTestId('browse-tree-sidebar');
      expect(sidebar).toBeInTheDocument();
      expect(sidebar).toHaveAttribute('data-active-chapter', 'chap-123');
    });
  });
});
