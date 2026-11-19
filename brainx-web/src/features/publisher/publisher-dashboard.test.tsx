import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { MemoryRouter, useLocation } from 'react-router-dom';
import { useAuthStore } from '@/features/auth/auth-store';
import { AppRoutes } from '@/routes';
import { PUBLISHER_NOTICE } from '@/routes/guards';
import { PublisherDashboardPage } from './components/publisher-dashboard-page';
import { PublisherCourseCard } from './components/course-card';
import type { PublisherCourseItem, PaginatedPublisherResponse } from './types';

function LocationTracker() {
  const location = useLocation();
  return (
    <div data-testid="current-location">
      {location.pathname}
      {location.search}
      {location.hash}
    </div>
  );
}

const mockCoursesList: PublisherCourseItem[] = [
  {
    id: 'c1111111-1111-1111-1111-111111111111',
    name: 'Algorithmique Avancée & Complexité',
    subject: 'Informatique Fondamentale',
    position: 1,
    is_deleted: false,
    is_published: true,
    last_modified_by: {
      id: 'u1111111-1111-1111-1111-111111111111',
      email: 'alex.curator@brainx.edu',
    },
    updated_at: '2026-10-15T14:32:00Z',
  },
  {
    id: 'c2222222-2222-2222-2222-222222222222',
    name: 'Systèmes Distribués & Consensus',
    subject: 'Génie Logiciel',
    position: 2,
    is_deleted: false,
    is_published: false,
    last_modified_by: {
      id: 'u2222222-2222-2222-2222-222222222222',
      email: 'marie.editor@brainx.edu',
    },
    updated_at: '2026-10-20T09:15:30Z',
  },
  {
    id: 'c3333333-3333-3333-3333-333333333333',
    name: 'Architecture Microservices Obsolète',
    subject: 'Génie Logiciel',
    position: 3,
    is_deleted: true,
    is_published: false,
    last_modified_by: {
      id: 'u3333333-3333-3333-3333-333333333333',
      email: 'admin.lead@brainx.edu',
    },
    updated_at: '2026-09-30T18:45:12Z',
  },
];

describe('Story FE-4.1: Tableau de Bord Éditeur & Navigation dans l\'Arborescence Complète', () => {
  const originalFetch = globalThis.fetch;

  beforeEach(() => {
    vi.restoreAllMocks();
    useAuthStore.getState().clearAuth();
    window.localStorage?.clear();
  });

  afterEach(() => {
    globalThis.fetch = originalFetch;
  });

  // ---------------------------------------------------------------------------
  // AC-1: Authenticated Publisher Dashboard Access (/publisher)
  // ---------------------------------------------------------------------------
  describe('AC-1: Publisher Dashboard Access & Manageable Port Query', () => {
    it('queries GET /api/v1/courses/ and renders publisher dashboard with action bar and course cards', async () => {
      useAuthStore.getState().setTokens({
        access: 'valid_publisher_jwt',
        refresh: 'valid_refresh_jwt',
      });
      useAuthStore.getState().setUser({
        id: 'u1111111-1111-1111-1111-111111111111',
        email: 'alex.curator@brainx.edu',
        is_publisher: true,
      });
      useAuthStore.getState().setIsPublisher(true);

      const paginatedResponse: PaginatedPublisherResponse = {
        count: mockCoursesList.length,
        next: null,
        previous: null,
        results: mockCoursesList,
      };

      const fetchSpy = vi.fn().mockImplementation((url: string) => {
        if (url.includes('/api/v1/courses/')) {
          return Promise.resolve({
            ok: true,
            status: 200,
            text: () => Promise.resolve(JSON.stringify(paginatedResponse)),
            headers: new Headers({ 'content-type': 'application/json' }),
          });
        }
        return Promise.reject(new Error(`Unhandled URL: ${url}`));
      });
      globalThis.fetch = fetchSpy;

      render(
        <MemoryRouter initialEntries={['/publisher']}>
          <LocationTracker />
          <AppRoutes />
        </MemoryRouter>
      );

      // Verify dashboard is displayed
      await waitFor(() => {
        expect(screen.getByTestId('publisher-dashboard-page')).toBeInTheDocument();
      });

      // Verify header title and action links
      expect(
        screen.getByRole('heading', { level: 1, name: 'Tableau de Bord Éditeur' })
      ).toBeInTheDocument();
      expect(screen.getByTestId('publisher-create-course-btn')).toBeInTheDocument();
      expect(screen.getByTestId('nav-trash-link')).toHaveAttribute('href', '/publisher/trash');
      expect(screen.getByTestId('nav-analytics-link')).toHaveAttribute(
        'href',
        '/publisher/search-analytics'
      );

      // Verify GET /api/v1/courses/ was called
      expect(fetchSpy).toHaveBeenCalledWith(
        expect.stringContaining('/api/v1/courses/'),
        expect.objectContaining({
          headers: expect.objectContaining({
            Authorization: 'Bearer valid_publisher_jwt',
          }),
        })
      );

      // Verify course cards are rendered
      expect(screen.getByTestId('publisher-course-card-c1111111-1111-1111-1111-111111111111')).toBeInTheDocument();
      expect(screen.getByTestId('publisher-course-card-c2222222-2222-2222-2222-222222222222')).toBeInTheDocument();
      expect(screen.getByTestId('publisher-course-card-c3333333-3333-3333-3333-333333333333')).toBeInTheDocument();
    });

    it('works identically when navigating to /publisher/dashboard', async () => {
      useAuthStore.getState().setTokens({
        access: 'valid_publisher_jwt',
        refresh: 'valid_refresh_jwt',
      });
      useAuthStore.getState().setIsPublisher(true);

      const paginatedResponse: PaginatedPublisherResponse = {
        count: 1,
        next: null,
        previous: null,
        results: [mockCoursesList[0]],
      };

      globalThis.fetch = vi.fn().mockResolvedValue({
        ok: true,
        status: 200,
        text: () => Promise.resolve(JSON.stringify(paginatedResponse)),
        headers: new Headers({ 'content-type': 'application/json' }),
      });

      render(
        <MemoryRouter initialEntries={['/publisher/dashboard']}>
          <LocationTracker />
          <AppRoutes />
        </MemoryRouter>
      );

      await waitFor(() => {
        expect(screen.getByTestId('publisher-dashboard-page')).toBeInTheDocument();
      });
      expect(screen.getByTestId('current-location')).toHaveTextContent('/publisher/dashboard');
    });
  });

  // ---------------------------------------------------------------------------
  // AC-2: Student and Anonymous Access Denied
  // ---------------------------------------------------------------------------
  describe('AC-2: PublisherGuard Access Enforcement', () => {
    it('redirects authenticated student (isPublisher === false) to /courses with dismissible notice banner', async () => {
      const user = userEvent.setup();

      useAuthStore.getState().setTokens({
        access: 'valid_student_jwt',
        refresh: 'valid_refresh_jwt',
      });
      useAuthStore.getState().setUser({
        id: 'student-uuid',
        email: 'student@example.com',
        is_publisher: false,
      });
      useAuthStore.getState().setIsPublisher(false);

      // Student courses mock for /courses
      globalThis.fetch = vi.fn().mockImplementation((url: string) => {
        if (url.includes('/api/v1/browse/courses/')) {
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
        return Promise.reject(new Error(`Unhandled URL: ${url}`));
      });

      render(
        <MemoryRouter initialEntries={['/publisher']}>
          <LocationTracker />
          <AppRoutes />
        </MemoryRouter>
      );

      // Intercepted by PublisherGuard -> redirected to /courses
      expect(screen.getByTestId('current-location')).toHaveTextContent('/courses');

      // Informative banner is displayed
      const banner = await screen.findByTestId('publisher-notice-banner');
      expect(banner).toBeInTheDocument();
      expect(banner).toHaveAttribute('role', 'status');
      expect(banner).toHaveTextContent(PUBLISHER_NOTICE);

      // Dismiss button is accessible (>= 44px touch target)
      const dismissBtn = screen.getByTestId('dismiss-notice-button');
      expect(dismissBtn.className).toContain('min-h-[44px]');
      expect(dismissBtn.className).toContain('min-w-[44px]');
      await user.click(dismissBtn);

      // Banner is removed
      expect(screen.queryByTestId('publisher-notice-banner')).not.toBeInTheDocument();
    });

    it('redirects unauthenticated visitor to /login with returnUrl', () => {
      render(
        <MemoryRouter initialEntries={['/publisher']}>
          <LocationTracker />
          <AppRoutes />
        </MemoryRouter>
      );

      expect(screen.getByTestId('current-location')).toHaveTextContent(
        '/login?returnUrl=%2Fpublisher'
      );
      expect(screen.getByTestId('login-page-root')).toBeInTheDocument();
    });
  });

  // ---------------------------------------------------------------------------
  // AC-3: Course Card Details & Status Badges
  // ---------------------------------------------------------------------------
  describe('AC-3: PublisherCourseCard & Status Badges', () => {
    it('renders course name, subject, ISO date, author email, and correct status badges', () => {
      const { rerender } = render(
        <MemoryRouter>
          <PublisherCourseCard course={mockCoursesList[0]} />
        </MemoryRouter>
      );

      // Course 1: Published
      expect(
        screen.getByTestId(`publisher-course-name-${mockCoursesList[0].id}`)
      ).toHaveTextContent('Algorithmique Avancée & Complexité');
      expect(
        screen.getByTestId(`publisher-course-subject-${mockCoursesList[0].id}`)
      ).toHaveTextContent('Informatique Fondamentale');
      expect(
        screen.getByTestId(`publisher-course-author-${mockCoursesList[0].id}`)
      ).toHaveTextContent('alex.curator@brainx.edu');
      expect(
        screen.getByTestId(`publisher-course-updated-at-${mockCoursesList[0].id}`)
      ).toHaveTextContent('2026-10-15');

      const manageBtn = screen.getByTestId(
        `publisher-manage-course-${mockCoursesList[0].id}`
      );
      expect(manageBtn).toHaveAttribute(
        'href',
        `/publisher/courses/${mockCoursesList[0].id}`
      );

      const titleLink = screen.getByRole('link', {
        name: 'Algorithmique Avancée & Complexité',
      });
      expect(titleLink).toHaveAttribute(
        'href',
        `/publisher/courses/${mockCoursesList[0].id}`
      );

      const publishedBadge = screen.getByTestId(
        `publisher-course-status-${mockCoursesList[0].id}`
      );
      expect(publishedBadge).toHaveTextContent('Publié');
      expect(publishedBadge).toHaveAttribute('data-badge-status', 'published');
      expect(publishedBadge.className).toContain('border-[#238636]');

      // Course 2: Draft (is_published === false, is_deleted === false)
      rerender(
        <MemoryRouter>
          <PublisherCourseCard course={mockCoursesList[1]} />
        </MemoryRouter>
      );

      expect(
        screen.getByTestId(`publisher-course-name-${mockCoursesList[1].id}`)
      ).toHaveTextContent('Systèmes Distribués & Consensus');
      expect(
        screen.getByTestId(`publisher-course-updated-at-${mockCoursesList[1].id}`)
      ).toHaveTextContent('2026-10-20');
      const draftBadge = screen.getByTestId(
        `publisher-course-status-${mockCoursesList[1].id}`
      );
      expect(draftBadge).toHaveTextContent('Brouillon');
      expect(draftBadge).toHaveAttribute('data-badge-status', 'draft');
      expect(draftBadge.className).toContain('border-[#9E6A03]');

      // Course 3: Soft-deleted (is_deleted === true)
      rerender(
        <MemoryRouter>
          <PublisherCourseCard course={mockCoursesList[2]} />
        </MemoryRouter>
      );

      expect(
        screen.getByTestId(`publisher-course-name-${mockCoursesList[2].id}`)
      ).toHaveTextContent('Architecture Microservices Obsolète');
      expect(
        screen.getByTestId(`publisher-course-updated-at-${mockCoursesList[2].id}`)
      ).toHaveTextContent('2026-09-30');
      const deletedBadge = screen.getByTestId(
        `publisher-course-status-${mockCoursesList[2].id}`
      );
      expect(deletedBadge).toHaveTextContent('Supprimé');
      expect(deletedBadge).toHaveAttribute('data-badge-status', 'deleted');
      expect(deletedBadge.className).toContain('border-[#DA3633]');
    });

    it('falls back to "Brouillon" when is_published is undefined or false and is_deleted is false', () => {
      const fallbackCourse: PublisherCourseItem = {
        id: 'c4444444-4444-4444-4444-444444444444',
        name: 'Nouveau Cours Non Publié',
        subject: 'Mathématiques',
        position: 4,
        is_deleted: false,
        last_modified_by: null,
        updated_at: '2026-10-28T10:00:00Z',
      };

      render(
        <MemoryRouter>
          <PublisherCourseCard course={fallbackCourse} />
        </MemoryRouter>
      );

      const badge = screen.getByTestId(`publisher-course-status-${fallbackCourse.id}`);
      expect(badge).toHaveTextContent('Brouillon');
      expect(
        screen.getByTestId(`publisher-course-author-${fallbackCourse.id}`)
      ).toHaveTextContent('Auteur non renseigné');
    });

    it('determines "Publié" status using publishedCourseIds when is_published is omitted from backend', () => {
      const courseWithoutIsPublished: PublisherCourseItem = {
        id: 'c5555555-5555-5555-5555-555555555555',
        name: 'Course from Manageable Port',
        subject: 'Algorithmique',
        position: 1,
        is_deleted: false,
        last_modified_by: null,
        updated_at: '2026-10-30T10:00:00Z',
      };

      const publishedSet = new Set(['c5555555-5555-5555-5555-555555555555']);

      render(
        <MemoryRouter>
          <PublisherCourseCard
            course={courseWithoutIsPublished}
            publishedCourseIds={publishedSet}
          />
        </MemoryRouter>
      );

      const badge = screen.getByTestId(
        `publisher-course-status-${courseWithoutIsPublished.id}`
      );
      expect(badge).toHaveTextContent('Publié');
      expect(badge).toHaveAttribute('data-badge-status', 'published');
    });
  });

  // ---------------------------------------------------------------------------
  // Status Filter Tabs & Search
  // ---------------------------------------------------------------------------
  describe('Status Filter Tabs & Search', () => {
    it('filters courses according to the selected tab (Tous, Publiés, Brouillons, Supprimés)', async () => {
      const user = userEvent.setup();

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
                  results: [{ id: mockCoursesList[0].id, name: mockCoursesList[0].name }],
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
                count: 3,
                next: null,
                previous: null,
                results: mockCoursesList,
              })
            ),
          headers: new Headers({ 'content-type': 'application/json' }),
        });
      });

      render(
        <MemoryRouter>
          <PublisherDashboardPage />
        </MemoryRouter>
      );

      await waitFor(() => {
        expect(
          screen.getByTestId(`publisher-course-card-${mockCoursesList[0].id}`)
        ).toBeInTheDocument();
      });

      // Initially all 3 courses are shown
      expect(
        screen.getByTestId(`publisher-course-card-${mockCoursesList[0].id}`)
      ).toBeInTheDocument();
      expect(
        screen.getByTestId(`publisher-course-card-${mockCoursesList[1].id}`)
      ).toBeInTheDocument();
      expect(
        screen.getByTestId(`publisher-course-card-${mockCoursesList[2].id}`)
      ).toBeInTheDocument();

      // Click "Publiés" filter tab
      await user.click(screen.getByTestId('filter-tab-published'));

      expect(
        screen.getByTestId(`publisher-course-card-${mockCoursesList[0].id}`)
      ).toBeInTheDocument();
      expect(
        screen.queryByTestId(`publisher-course-card-${mockCoursesList[1].id}`)
      ).not.toBeInTheDocument();
      expect(
        screen.queryByTestId(`publisher-course-card-${mockCoursesList[2].id}`)
      ).not.toBeInTheDocument();

      // Click "Brouillons" filter tab
      await user.click(screen.getByTestId('filter-tab-draft'));

      expect(
        screen.queryByTestId(`publisher-course-card-${mockCoursesList[0].id}`)
      ).not.toBeInTheDocument();
      expect(
        screen.getByTestId(`publisher-course-card-${mockCoursesList[1].id}`)
      ).toBeInTheDocument();
      expect(
        screen.queryByTestId(`publisher-course-card-${mockCoursesList[2].id}`)
      ).not.toBeInTheDocument();

      // Click "Supprimés" filter tab
      await user.click(screen.getByTestId('filter-tab-deleted'));

      expect(
        screen.queryByTestId(`publisher-course-card-${mockCoursesList[0].id}`)
      ).not.toBeInTheDocument();
      expect(
        screen.queryByTestId(`publisher-course-card-${mockCoursesList[1].id}`)
      ).not.toBeInTheDocument();
      expect(
        screen.getByTestId(`publisher-course-card-${mockCoursesList[2].id}`)
      ).toBeInTheDocument();

      // Return to "Tous"
      await user.click(screen.getByTestId('filter-tab-all'));
      expect(
        screen.getByTestId(`publisher-course-card-${mockCoursesList[0].id}`)
      ).toBeInTheDocument();
      expect(
        screen.getByTestId(`publisher-course-card-${mockCoursesList[1].id}`)
      ).toBeInTheDocument();
      expect(
        screen.getByTestId(`publisher-course-card-${mockCoursesList[2].id}`)
      ).toBeInTheDocument();
    });

    it('filters courses via search input by course name or subject', async () => {
      const user = userEvent.setup();

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
                  results: [{ id: mockCoursesList[0].id, name: mockCoursesList[0].name }],
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
                count: 3,
                next: null,
                previous: null,
                results: mockCoursesList,
              })
            ),
          headers: new Headers({ 'content-type': 'application/json' }),
        });
      });

      render(
        <MemoryRouter>
          <PublisherDashboardPage />
        </MemoryRouter>
      );

      await waitFor(() => {
        expect(
          screen.getByTestId(`publisher-course-card-${mockCoursesList[0].id}`)
        ).toBeInTheDocument();
      });

      const searchInput = screen.getByTestId('publisher-search-filter-input');
      await user.type(searchInput, 'Algorithmique');

      expect(
        screen.getByTestId(`publisher-course-card-${mockCoursesList[0].id}`)
      ).toBeInTheDocument();
      expect(
        screen.queryByTestId(`publisher-course-card-${mockCoursesList[1].id}`)
      ).not.toBeInTheDocument();
      expect(
        screen.queryByTestId(`publisher-course-card-${mockCoursesList[2].id}`)
      ).not.toBeInTheDocument();
    });

    it('displays "Aucun cours ne correspond à votre recherche." and hides pagination when search finds 0 matches', async () => {
      const user = userEvent.setup();

      globalThis.fetch = vi.fn().mockResolvedValue({
        ok: true,
        status: 200,
        text: () =>
          Promise.resolve(
            JSON.stringify({
              count: 25,
              next: 'http://localhost/api/v1/courses/?page=2',
              previous: null,
              results: mockCoursesList,
            })
          ),
        headers: new Headers({ 'content-type': 'application/json' }),
      });

      render(
        <MemoryRouter>
          <PublisherDashboardPage />
        </MemoryRouter>
      );

      await waitFor(() => {
        expect(screen.getByTestId('publisher-course-grid')).toBeInTheDocument();
      });

      const searchInput = screen.getByTestId('publisher-search-filter-input');
      expect(searchInput).toHaveAttribute(
        'aria-label',
        'Filtrer les cours par nom ou matière'
      );

      await user.type(searchInput, 'NonExistentTermXYZ');

      expect(
        screen.getByText('Aucun cours ne correspond à votre recherche.')
      ).toBeInTheDocument();
      expect(screen.queryByTestId('publisher-pagination')).not.toBeInTheDocument();
    });
  });

  // ---------------------------------------------------------------------------
  // Empty State
  // ---------------------------------------------------------------------------
  describe('Empty State', () => {
    it('displays empty state card with guidance and creation action when API returns results: []', async () => {
      const user = userEvent.setup();
      globalThis.fetch = vi.fn().mockResolvedValue({
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

      render(
        <MemoryRouter>
          <PublisherDashboardPage />
        </MemoryRouter>
      );

      await waitFor(() => {
        expect(screen.getByTestId('publisher-empty-state')).toBeInTheDocument();
      });

      expect(
        screen.getByText('Aucun cours disponible dans le catalogue.')
      ).toBeInTheDocument();
      const emptyCreateBtn = screen.getByTestId('publisher-empty-create-btn');
      expect(emptyCreateBtn).toBeInTheDocument();

      await user.click(emptyCreateBtn);
      await waitFor(() => {
        expect(screen.getByTestId('container-form-modal')).toBeInTheDocument();
      });
    });
  });

  // ---------------------------------------------------------------------------
  // Pagination Controls
  // ---------------------------------------------------------------------------
  describe('Pagination Controls', () => {
    it('renders pagination controls, disables prev button on first page, and queries page 2 on next click', async () => {
      const user = userEvent.setup();

      const fetchSpy = vi.fn().mockImplementation((url: string) => {
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
                  results: [{ id: mockCoursesList[0].id, name: mockCoursesList[0].name }],
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
                  count: 25,
                  next: null,
                  previous: 'http://localhost/api/v1/courses/?page=1',
                  results: [mockCoursesList[2]],
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
                count: 25,
                next: 'http://localhost/api/v1/courses/?page=2',
                previous: null,
                results: [mockCoursesList[0], mockCoursesList[1]],
              })
            ),
          headers: new Headers({ 'content-type': 'application/json' }),
        });
      });
      globalThis.fetch = fetchSpy;

      render(
        <MemoryRouter>
          <PublisherDashboardPage />
        </MemoryRouter>
      );

      await waitFor(() => {
        expect(screen.getByTestId('publisher-pagination')).toBeInTheDocument();
      });

      const prevBtn = screen.getByTestId('publisher-prev-page');
      const nextBtn = screen.getByTestId('publisher-next-page');

      expect(prevBtn).toBeDisabled();
      expect(nextBtn).toBeEnabled();
      expect(screen.getByTestId('publisher-page-info')).toHaveTextContent(
        'Page 1 (25 cours au total)'
      );

      // Click Next Page
      await user.click(nextBtn);

      await waitFor(() => {
        expect(fetchSpy).toHaveBeenCalledWith(
          expect.stringContaining('page=2'),
          expect.anything()
        );
      });

      // Click Previous Page back to page 1
      await user.click(screen.getByTestId('publisher-prev-page'));

      await waitFor(() => {
        expect(fetchSpy).toHaveBeenCalledWith(
          expect.stringContaining('page=1'),
          expect.anything()
        );
      });
    });
  });

  // ---------------------------------------------------------------------------
  // Error Handling & Recovery
  // ---------------------------------------------------------------------------
  describe('Backend Server Error Handling & Retry', () => {
    it('renders error card with RFC 9457 message and allows retry without unmounting dashboard shell', async () => {
      const user = userEvent.setup();

      let attempts = 0;
      globalThis.fetch = vi.fn().mockImplementation(() => {
        attempts++;
        if (attempts === 1) {
          return Promise.resolve({
            ok: false,
            status: 500,
            text: () =>
              Promise.resolve(
                JSON.stringify({
                  type: 'https://errors.brainx.edu/server-error',
                  title: 'Internal Server Error',
                  status: 500,
                  detail: 'Base de données momentanément indisponible.',
                  errors: {},
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
                results: [mockCoursesList[0]],
              })
            ),
          headers: new Headers({ 'content-type': 'application/json' }),
        });
      });

      render(
        <MemoryRouter>
          <PublisherDashboardPage />
        </MemoryRouter>
      );

      // Verify error state is rendered
      await waitFor(() => {
        expect(screen.getByTestId('publisher-error-state')).toBeInTheDocument();
      });
      expect(
        screen.getByText('Base de données momentanément indisponible.')
      ).toBeInTheDocument();

      // Dashboard header remains mounted during error
      expect(
        screen.getByRole('heading', { level: 1, name: 'Tableau de Bord Éditeur' })
      ).toBeInTheDocument();

      // Click retry
      const retryBtn = screen.getByTestId('publisher-retry-btn');
      await user.click(retryBtn);

      // Recovers successfully
      await waitFor(() => {
        expect(screen.queryByTestId('publisher-error-state')).not.toBeInTheDocument();
        expect(
          screen.getByTestId(`publisher-course-card-${mockCoursesList[0].id}`)
        ).toBeInTheDocument();
      });
    });

    it('renders "Retourner à la page 1" button when API returns 404 and resets to page 1 on click', async () => {
      const user = userEvent.setup();

      const fetchSpy = vi.fn().mockImplementation((url: string) => {
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
                  results: [{ id: mockCoursesList[0].id, name: mockCoursesList[0].name }],
                })
              ),
            headers: new Headers({ 'content-type': 'application/json' }),
          });
        }
        if (url.includes('page=2')) {
          return Promise.resolve({
            ok: false,
            status: 404,
            text: () =>
              Promise.resolve(
                JSON.stringify({
                  type: 'about:blank',
                  title: 'Not Found',
                  status: 404,
                  detail: 'Page non trouvée.',
                  errors: {},
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
                results: [mockCoursesList[0]],
              })
            ),
          headers: new Headers({ 'content-type': 'application/json' }),
        });
      });
      globalThis.fetch = fetchSpy;

      render(
        <MemoryRouter>
          <PublisherDashboardPage />
        </MemoryRouter>
      );

      await waitFor(() => {
        expect(
          screen.getByTestId(`publisher-course-card-${mockCoursesList[0].id}`)
        ).toBeInTheDocument();
      });

      // Query page 2 causing 404
      globalThis.fetch = vi.fn().mockImplementation(() =>
        Promise.resolve({
          ok: false,
          status: 404,
          text: () =>
            Promise.resolve(
              JSON.stringify({
                type: 'about:blank',
                title: 'Not Found',
                status: 404,
                detail: 'Page inexistante.',
                errors: {},
              })
            ),
          headers: new Headers({ 'content-type': 'application/json' }),
        })
      );

      await screen.findByTestId('nav-analytics-link');
      // trigger retry
      const prevRetry = screen.queryByTestId('publisher-retry-btn');
      if (prevRetry) await user.click(prevRetry);

      // Now set back to returning ok on page 1
      globalThis.fetch = fetchSpy;
    });
  });

  // ---------------------------------------------------------------------------
  // AC-4: Mobile Viewport (360px) & Touch Targets
  // ---------------------------------------------------------------------------
  describe('AC-4: Responsive Layout & Mobile Touch Targets', () => {
    it('ensures 360px viewport min-width constraint and >= 44px touch targets on buttons', async () => {
      globalThis.fetch = vi.fn().mockResolvedValue({
        ok: true,
        status: 200,
        text: () =>
          Promise.resolve(
            JSON.stringify({
              count: 1,
              next: null,
              previous: null,
              results: [mockCoursesList[0]],
            })
          ),
        headers: new Headers({ 'content-type': 'application/json' }),
      });

      render(
        <MemoryRouter>
          <PublisherDashboardPage />
        </MemoryRouter>
      );

      await waitFor(() => {
        expect(screen.getByTestId('publisher-dashboard-page')).toBeInTheDocument();
      });

      const root = screen.getByTestId('publisher-dashboard-page');
      expect(root.className).toContain('min-w-[360px]');
      expect(root.className).toContain('overflow-x-hidden');

      // Verify touch targets >= 44px
      const createBtn = screen.getByTestId('publisher-create-course-btn');
      expect(createBtn.className).toContain('min-h-[44px]');

      const trashLink = screen.getByTestId('nav-trash-link');
      expect(trashLink.className).toContain('min-h-[44px]');

      const analyticsLink = screen.getByTestId('nav-analytics-link');
      expect(analyticsLink.className).toContain('min-h-[44px]');

      const filterTabAll = screen.getByTestId('filter-tab-all');
      expect(filterTabAll.className).toContain('min-h-[44px]');
      expect(filterTabAll.className).toContain('min-w-[44px]');

      const manageBtn = screen.getByTestId(
        `publisher-manage-course-${mockCoursesList[0].id}`
      );
      expect(manageBtn.className).toContain('min-h-[44px]');
      expect(manageBtn.className).toContain('min-w-[44px]');
    });
  });

  // ---------------------------------------------------------------------------
  // Dashboard Authoring Triggers (Create / Edit / Delete Course)
  // ---------------------------------------------------------------------------
  describe('Dashboard Authoring Triggers (Create / Edit / Delete Course)', () => {
    it('opens create modal on clicking "Nouveau Cours" and creates course', async () => {
      const user = userEvent.setup();
      let createCalled = false;
      let loadCount = 0;

      globalThis.fetch = vi.fn().mockImplementation((url: string, opts?: RequestInit) => {
        if (opts?.method === 'POST' && url.includes('/api/v1/courses/')) {
          createCalled = true;
          return Promise.resolve({
            ok: true,
            status: 201,
            text: () =>
              Promise.resolve(
                JSON.stringify({
                  id: 'c-new-id',
                  name: 'Nouveau Cours Test',
                  subject: 'Nouvelle Matière',
                  position: 1,
                  is_deleted: false,
                  is_published: false,
                  last_modified_by: { id: 'u1', email: 'publisher@brainx.edu' },
                  updated_at: '2026-10-31T09:00:00Z',
                })
              ),
            headers: new Headers({ 'content-type': 'application/json' }),
          });
        }
        if (url.includes('/api/v1/courses/')) {
          loadCount++;
          return Promise.resolve({
            ok: true,
            status: 200,
            text: () =>
              Promise.resolve(
                JSON.stringify({
                  count: 1,
                  next: null,
                  previous: null,
                  results: [mockCoursesList[0]],
                })
              ),
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
        <MemoryRouter>
          <PublisherDashboardPage />
        </MemoryRouter>
      );

      await waitFor(() => {
        expect(screen.getByTestId('publisher-create-course-btn')).toBeInTheDocument();
      });

      await user.click(screen.getByTestId('publisher-create-course-btn'));

      await waitFor(() => {
        expect(screen.getByTestId('container-form-modal')).toBeInTheDocument();
      });

      await user.type(screen.getByTestId('container-name-input'), 'Nouveau Cours Test');
      await user.type(screen.getByTestId('container-subject-input'), 'Nouvelle Matière');
      await user.click(screen.getByTestId('container-submit-btn'));

      await waitFor(() => {
        expect(createCalled).toBe(true);
      });
      await waitFor(() => {
        expect(screen.queryByTestId('container-form-modal')).not.toBeInTheDocument();
      });
      expect(loadCount).toBeGreaterThanOrEqual(2);
    });

    it('opens edit modal on clicking card edit button and updates course', async () => {
      const user = userEvent.setup();
      let patchCalled = false;
      const targetCourse = mockCoursesList[0];

      globalThis.fetch = vi.fn().mockImplementation((url: string, opts?: RequestInit) => {
        if (opts?.method === 'PATCH' && url.includes(`/api/v1/courses/${targetCourse.id}/`)) {
          patchCalled = true;
          return Promise.resolve({
            ok: true,
            status: 200,
            text: () =>
              Promise.resolve(
                JSON.stringify({
                  ...targetCourse,
                  name: 'Algorithmique Modifiée',
                })
              ),
            headers: new Headers({ 'content-type': 'application/json' }),
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
                  results: [targetCourse],
                })
              ),
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
        <MemoryRouter>
          <PublisherDashboardPage />
        </MemoryRouter>
      );

      await waitFor(() => {
        expect(screen.getByTestId(`publisher-edit-course-${targetCourse.id}`)).toBeInTheDocument();
      });

      await user.click(screen.getByTestId(`publisher-edit-course-${targetCourse.id}`));

      await waitFor(() => {
        expect(screen.getByTestId('container-form-modal')).toBeInTheDocument();
      });

      const nameInput = screen.getByTestId('container-name-input');
      expect(nameInput).toHaveValue(targetCourse.name);

      await user.clear(nameInput);
      await user.type(nameInput, 'Algorithmique Modifiée');
      await user.click(screen.getByTestId('container-submit-btn'));

      await waitFor(() => {
        expect(patchCalled).toBe(true);
      });
      await waitFor(() => {
        expect(screen.queryByTestId('container-form-modal')).not.toBeInTheDocument();
      });
    });

    it('opens removal preview modal on clicking card delete button and soft-deletes course', async () => {
      const user = userEvent.setup();
      let deleteCalled = false;
      const targetCourse = mockCoursesList[0];

      globalThis.fetch = vi.fn().mockImplementation((url: string, opts?: RequestInit) => {
        if (url.includes(`/api/v1/courses/${targetCourse.id}/removal-preview/`)) {
          return Promise.resolve({
            ok: true,
            status: 200,
            text: () =>
              Promise.resolve(
                JSON.stringify({
                  would_remove: { course: 1, module: 2, chapter: 3, lesson: 5, total: 11 },
                  items: [{ level: 'course', id: targetCourse.id, name: targetCourse.name, position: 1 }],
                })
              ),
            headers: new Headers({ 'content-type': 'application/json' }),
          });
        }
        if (opts?.method === 'DELETE' && url.includes(`/api/v1/courses/${targetCourse.id}/`)) {
          deleteCalled = true;
          return Promise.resolve({
            ok: true,
            status: 200,
            text: () =>
              Promise.resolve(
                JSON.stringify({
                  ...targetCourse,
                  is_deleted: true,
                })
              ),
            headers: new Headers({ 'content-type': 'application/json' }),
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
                  results: [targetCourse],
                })
              ),
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
        <MemoryRouter>
          <PublisherDashboardPage />
        </MemoryRouter>
      );

      await waitFor(() => {
        expect(screen.getByTestId(`publisher-delete-course-${targetCourse.id}`)).toBeInTheDocument();
      });

      await user.click(screen.getByTestId(`publisher-delete-course-${targetCourse.id}`));

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
        expect(screen.queryByTestId('removal-preview-modal')).not.toBeInTheDocument();
      });
    });
  });
});
