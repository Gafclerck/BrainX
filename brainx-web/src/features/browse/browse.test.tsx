import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { render, screen, waitFor, within, act } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { MemoryRouter, Routes, Route, useNavigate } from 'react-router-dom';
import { useAuthStore } from '@/features/auth/auth-store';
import { CoursesPage } from './courses-page';
import { CourseModulesPage } from './course-modules-page';
import { ModuleChaptersPage } from './module-chapters-page';
import { BrowseTreeSidebar } from './browse-tree-sidebar';
import { AppRoutes } from '@/routes';

describe('Story FE-2.2: Exploration de l\'Arborescence Publiée (Cours → Modules → Chapitres)', () => {
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

  // ---------------------------------------------------------------------------
  // AC-1: Catalogue des Cours (/courses)
  // ---------------------------------------------------------------------------
  describe('AC-1: Courses Catalog (/courses)', () => {
    it('calls GET /api/v1/browse/courses/ and renders catalog heading with course cards linking to /courses/:id', async () => {
      const mockCourses = {
        count: 2,
        next: null,
        previous: null,
        results: [
          { id: 'c1111111-1111-1111-1111-111111111111', name: 'Architecture Django & React' },
          { id: 'c2222222-2222-2222-2222-222222222222', name: 'Bases de Données Relationnelles' },
        ],
      };

      const fetchSpy = vi.fn().mockImplementation((url: string) => {
        if (url.includes('/api/v1/browse/courses/')) {
          return Promise.resolve({
            ok: true,
            status: 200,
            text: () => Promise.resolve(JSON.stringify(mockCourses)),
            headers: new Headers({ 'content-type': 'application/json' }),
          });
        }
        return Promise.reject(new Error(`Unhandled URL: ${url}`));
      });
      globalThis.fetch = fetchSpy;

      render(
        <MemoryRouter initialEntries={['/courses']}>
          <Routes>
            <Route path="/courses" element={<CoursesPage />} />
          </Routes>
        </MemoryRouter>
      );

      // Skeletons are visible initially
      expect(screen.getByTestId('courses-loading-skeletons')).toBeInTheDocument();

      // Heading is present immediately
      expect(screen.getByRole('heading', { level: 1, name: 'Catalogue des Cours' })).toBeInTheDocument();

      // Wait for courses to be rendered
      await waitFor(() => {
        expect(screen.getByText('Architecture Django & React')).toBeInTheDocument();
      });

      expect(screen.getByText('Bases de Données Relationnelles')).toBeInTheDocument();

      // Assert links
      const course1Link = screen.getByRole('link', { name: /Architecture Django & React/i });
      expect(course1Link).toHaveAttribute('href', '/courses/c1111111-1111-1111-1111-111111111111');

      const course2Link = screen.getByRole('link', { name: /Bases de Données Relationnelles/i });
      expect(course2Link).toHaveAttribute('href', '/courses/c2222222-2222-2222-2222-222222222222');

      // Assert API was called with student browse route
      expect(fetchSpy).toHaveBeenCalledWith(
        expect.stringContaining('/api/v1/browse/courses/'),
        expect.objectContaining({
          headers: expect.objectContaining({
            Authorization: 'Bearer valid_student_jwt',
          }),
        })
      );
    });

    it('displays sober empty state card when published courses list is empty', async () => {
      globalThis.fetch = vi.fn().mockResolvedValue({
        ok: true,
        status: 200,
        text: () => Promise.resolve(JSON.stringify({ count: 0, next: null, previous: null, results: [] })),
        headers: new Headers({ 'content-type': 'application/json' }),
      });

      render(
        <MemoryRouter initialEntries={['/courses']}>
          <CoursesPage />
        </MemoryRouter>
      );

      await waitFor(() => {
        expect(
          screen.getByText('Aucun cours disponible pour le moment.')
        ).toBeInTheDocument();
      });

      expect(screen.getByTestId('courses-empty')).toBeInTheDocument();
    });
  });

  // ---------------------------------------------------------------------------
  // AC-2: Modules du Cours (/courses/:courseId)
  // ---------------------------------------------------------------------------
  describe('AC-2: Course Modules Drilldown (/courses/:courseId)', () => {
    it('calls GET /api/v1/browse/courses/:id/modules/ and displays breadcrumb and module cards linking to /modules/:id', async () => {
      const courseId = 'c1111111-1111-1111-1111-111111111111';
      const mockModules = {
        count: 2,
        next: null,
        previous: null,
        results: [
          { id: 'm1111111-1111-1111-1111-111111111111', name: 'Module 1: Fondations de Django' },
          { id: 'm2222222-2222-2222-2222-222222222222', name: 'Module 2: Authentification & JWT' },
        ],
      };

      const fetchSpy = vi.fn().mockImplementation((url: string) => {
        if (url.includes(`/api/v1/browse/courses/${courseId}/modules/`)) {
          return Promise.resolve({
            ok: true,
            status: 200,
            text: () => Promise.resolve(JSON.stringify(mockModules)),
            headers: new Headers({ 'content-type': 'application/json' }),
          });
        }
        return Promise.reject(new Error(`Unhandled URL: ${url}`));
      });
      globalThis.fetch = fetchSpy;

      render(
        <MemoryRouter initialEntries={[`/courses/${courseId}`]}>
          <Routes>
            <Route path="/courses/:courseId" element={<CourseModulesPage />} />
          </Routes>
        </MemoryRouter>
      );

      // Breadcrumb is displayed immediately
      const backLink = screen.getByTestId('back-to-courses-link');
      expect(backLink).toBeInTheDocument();
      expect(backLink).toHaveTextContent(/Retour aux cours/i);
      expect(backLink).toHaveAttribute('href', '/courses');

      // Wait for module items
      await waitFor(() => {
        expect(screen.getByText('Module 1: Fondations de Django')).toBeInTheDocument();
      });
      expect(screen.getByText('Module 2: Authentification & JWT')).toBeInTheDocument();

      const module1Link = screen.getByTestId('module-card-m1111111-1111-1111-1111-111111111111');
      expect(module1Link).toHaveAttribute('href', '/modules/m1111111-1111-1111-1111-111111111111');

      const module2Link = screen.getByTestId('module-card-m2222222-2222-2222-2222-222222222222');
      expect(module2Link).toHaveAttribute('href', '/modules/m2222222-2222-2222-2222-222222222222');

      expect(fetchSpy).toHaveBeenCalledWith(
        expect.stringContaining(`/api/v1/browse/courses/${courseId}/modules/`),
        expect.any(Object)
      );
    });

    it('renders breadcrumb and empty state message when course has no published modules', async () => {
      const courseId = 'c1111111-1111-1111-1111-111111111111';
      globalThis.fetch = vi.fn().mockResolvedValue({
        ok: true,
        status: 200,
        text: () => Promise.resolve(JSON.stringify({ count: 0, next: null, previous: null, results: [] })),
        headers: new Headers({ 'content-type': 'application/json' }),
      });

      render(
        <MemoryRouter initialEntries={[`/courses/${courseId}`]}>
          <Routes>
            <Route path="/courses/:courseId" element={<CourseModulesPage />} />
          </Routes>
        </MemoryRouter>
      );

      await waitFor(() => {
        expect(
          screen.getByText('Ce cours ne contient aucun module publié.')
        ).toBeInTheDocument();
      });

      expect(screen.getByTestId('back-to-courses-link')).toHaveAttribute('href', '/courses');
      expect(screen.getByTestId('course-modules-empty')).toBeInTheDocument();
    });

    it('resets currentPage to 1 when courseId parameter changes', async () => {
      const calls: string[] = [];
      globalThis.fetch = vi.fn().mockImplementation((url: string) => {
        calls.push(url);
        return Promise.resolve({
          ok: true,
          status: 200,
          text: () =>
            Promise.resolve(
              JSON.stringify({
                count: 30,
                next: '/api/v1/browse/courses/c1/modules/?page=2',
                previous: null,
                results: [{ id: 'm1', name: 'Module Course 1' }],
              })
            ),
          headers: new Headers({ 'content-type': 'application/json' }),
        });
      });

      let navigateFn!: (to: string) => void;
      function NavigationHelper() {
        navigateFn = useNavigate();
        return null;
      }

      render(
        <MemoryRouter initialEntries={['/courses/c1']}>
          <NavigationHelper />
          <Routes>
            <Route path="/courses/:courseId" element={<CourseModulesPage />} />
          </Routes>
        </MemoryRouter>
      );

      await waitFor(() => {
        expect(screen.getByText('Module Course 1')).toBeInTheDocument();
      });

      // Change route to /courses/c2 via router navigation
      act(() => {
        navigateFn('/courses/c2');
      });

      await waitFor(() => {
        const lastCall = calls[calls.length - 1];
        expect(lastCall).toContain('/courses/c2/modules/');
        expect(lastCall).not.toContain('page=2');
      });
    });
  });

  // ---------------------------------------------------------------------------
  // AC-3: Chapitres du Module (/modules/:moduleId)
  // ---------------------------------------------------------------------------
  describe('AC-3: Module Chapters Drilldown (/modules/:moduleId)', () => {
    it('calls GET /api/v1/browse/modules/:id/chapters/ and displays breadcrumb and chapter cards linking to /chapters/:id', async () => {
      const moduleId = 'm1111111-1111-1111-1111-111111111111';
      const mockChapters = {
        count: 2,
        next: null,
        previous: null,
        results: [
          { id: 'ch111111-1111-1111-1111-111111111111', name: 'Chapitre 1: Architecture MVT' },
          { id: 'ch222222-2222-2222-2222-222222222222', name: 'Chapitre 2: ORM & Migrations' },
        ],
      };

      const fetchSpy = vi.fn().mockImplementation((url: string) => {
        if (url.includes(`/api/v1/browse/modules/${moduleId}/chapters/`)) {
          return Promise.resolve({
            ok: true,
            status: 200,
            text: () => Promise.resolve(JSON.stringify(mockChapters)),
            headers: new Headers({ 'content-type': 'application/json' }),
          });
        }
        return Promise.reject(new Error(`Unhandled URL: ${url}`));
      });
      globalThis.fetch = fetchSpy;

      render(
        <MemoryRouter initialEntries={[`/modules/${moduleId}`]}>
          <Routes>
            <Route path="/modules/:moduleId" element={<ModuleChaptersPage />} />
          </Routes>
        </MemoryRouter>
      );

      // Breadcrumb linking back to courses
      const backLink = screen.getByTestId('back-to-courses-link');
      expect(backLink).toBeInTheDocument();
      expect(backLink).toHaveTextContent(/Retour aux cours/i);
      expect(backLink).toHaveAttribute('href', '/courses');

      // Wait for chapter items
      await waitFor(() => {
        expect(screen.getByText('Chapitre 1: Architecture MVT')).toBeInTheDocument();
      });
      expect(screen.getByText('Chapitre 2: ORM & Migrations')).toBeInTheDocument();

      const chapter1Link = screen.getByTestId('chapter-card-ch111111-1111-1111-1111-111111111111');
      expect(chapter1Link).toHaveAttribute('href', '/chapters/ch111111-1111-1111-1111-111111111111');

      const chapter2Link = screen.getByTestId('chapter-card-ch222222-2222-2222-2222-222222222222');
      expect(chapter2Link).toHaveAttribute('href', '/chapters/ch222222-2222-2222-2222-222222222222');

      expect(fetchSpy).toHaveBeenCalledWith(
        expect.stringContaining(`/api/v1/browse/modules/${moduleId}/chapters/`),
        expect.any(Object)
      );
    });

    it('renders breadcrumb and empty state message when module has no published chapters', async () => {
      const moduleId = 'm1111111-1111-1111-1111-111111111111';
      globalThis.fetch = vi.fn().mockResolvedValue({
        ok: true,
        status: 200,
        text: () => Promise.resolve(JSON.stringify({ count: 0, next: null, previous: null, results: [] })),
        headers: new Headers({ 'content-type': 'application/json' }),
      });

      render(
        <MemoryRouter initialEntries={[`/modules/${moduleId}`]}>
          <Routes>
            <Route path="/modules/:moduleId" element={<ModuleChaptersPage />} />
          </Routes>
        </MemoryRouter>
      );

      await waitFor(() => {
        expect(
          screen.getByText('Ce module ne contient aucun chapitre publié.')
        ).toBeInTheDocument();
      });

      expect(screen.getByTestId('back-to-courses-link')).toHaveAttribute('href', '/courses');
      expect(screen.getByTestId('module-chapters-empty')).toBeInTheDocument();
    });
  });

  // ---------------------------------------------------------------------------
  // AC-4: Error Handling (404 Not Found & Network Failures)
  // ---------------------------------------------------------------------------
  describe('AC-4: Error Handling & Recovery (404 and Network Errors)', () => {
    it('displays 404 error card on nonexistent or hidden course with recovery button to /courses', async () => {
      globalThis.fetch = vi.fn().mockResolvedValue({
        ok: false,
        status: 404,
        statusText: 'Not Found',
        text: () =>
          Promise.resolve(
            JSON.stringify({
              type: 'https://brainx.api/errors/not-found',
              title: 'Not Found',
              status: 404,
              detail: 'Conteneur introuvable ou non publié.',
            })
          ),
        headers: new Headers({ 'content-type': 'application/json' }),
      });

      render(
        <MemoryRouter initialEntries={['/courses/nonexistent-id']}>
          <Routes>
            <Route path="/courses/:courseId" element={<CourseModulesPage />} />
          </Routes>
        </MemoryRouter>
      );

      await waitFor(() => {
        expect(
          screen.getByText('Contenu introuvable ou non publié.')
        ).toBeInTheDocument();
      });

      expect(screen.getByTestId('course-modules-error-404')).toBeInTheDocument();
      const recoveryLink = within(screen.getByTestId('course-modules-error-404')).getByRole('link', {
        name: /Retour aux cours/i,
      });
      expect(recoveryLink).toHaveAttribute('href', '/courses');
    });

    it('displays 404 error card on nonexistent or hidden module with recovery button to /courses', async () => {
      globalThis.fetch = vi.fn().mockResolvedValue({
        ok: false,
        status: 404,
        statusText: 'Not Found',
        text: () =>
          Promise.resolve(
            JSON.stringify({
              type: 'https://brainx.api/errors/not-found',
              title: 'Not Found',
              status: 404,
              detail: 'Conteneur introuvable.',
            })
          ),
        headers: new Headers({ 'content-type': 'application/json' }),
      });

      render(
        <MemoryRouter initialEntries={['/modules/nonexistent-id']}>
          <Routes>
            <Route path="/modules/:moduleId" element={<ModuleChaptersPage />} />
          </Routes>
        </MemoryRouter>
      );

      await waitFor(() => {
        expect(
          screen.getByText('Contenu introuvable ou non publié.')
        ).toBeInTheDocument();
      });

      expect(screen.getByTestId('module-chapters-error-404')).toBeInTheDocument();
      const recoveryLink = within(screen.getByTestId('module-chapters-error-404')).getByRole('link', {
        name: /Retour aux cours/i,
      });
      expect(recoveryLink).toHaveAttribute('href', '/courses');
    });

    it('displays retryable error alert on network failure or 500 server error and recovers upon retry', async () => {
      const mockSuccessCourses = {
        count: 1,
        next: null,
        previous: null,
        results: [{ id: 'c-recovered', name: 'Cours Récupéré' }],
      };

      let attempt = 0;
      globalThis.fetch = vi.fn().mockImplementation(() => {
        attempt++;
        if (attempt === 1) {
          return Promise.reject(new TypeError('Failed to fetch'));
        }
        return Promise.resolve({
          ok: true,
          status: 200,
          text: () => Promise.resolve(JSON.stringify(mockSuccessCourses)),
          headers: new Headers({ 'content-type': 'application/json' }),
        });
      });

      render(
        <MemoryRouter initialEntries={['/courses']}>
          <CoursesPage />
        </MemoryRouter>
      );

      await waitFor(() => {
        expect(
          screen.getByText('Une erreur est survenue lors du chargement.')
        ).toBeInTheDocument();
      });

      const retryBtn = screen.getByRole('button', { name: /Réessayer/i });
      expect(retryBtn).toBeInTheDocument();

      // Click retry
      await userEvent.click(retryBtn);

      await waitFor(() => {
        expect(screen.getByText('Cours Récupéré')).toBeInTheDocument();
      });

      expect(screen.queryByText('Une erreur est survenue lors du chargement.')).not.toBeInTheDocument();
    });
  });

  // ---------------------------------------------------------------------------
  // DRF Pagination Controls
  // ---------------------------------------------------------------------------
  describe('DRF Pagination Controls', () => {
    it('handles paginated responses and allows forward and backwards page switching', async () => {
      const page1 = {
        count: 35,
        next: '/api/v1/browse/courses/?page=2',
        previous: null,
        results: [{ id: 'c-p1', name: 'Cours Page 1' }],
      };
      const page2 = {
        count: 35,
        next: null,
        previous: '/api/v1/browse/courses/?page=1',
        results: [{ id: 'c-p2', name: 'Cours Page 2' }],
      };

      globalThis.fetch = vi.fn().mockImplementation((url: string) => {
        if (url.includes('page=2')) {
          return Promise.resolve({
            ok: true,
            status: 200,
            text: () => Promise.resolve(JSON.stringify(page2)),
            headers: new Headers({ 'content-type': 'application/json' }),
          });
        }
        return Promise.resolve({
          ok: true,
          status: 200,
          text: () => Promise.resolve(JSON.stringify(page1)),
          headers: new Headers({ 'content-type': 'application/json' }),
        });
      });

      render(
        <MemoryRouter initialEntries={['/courses']}>
          <CoursesPage />
        </MemoryRouter>
      );

      await waitFor(() => {
        expect(screen.getByText('Cours Page 1')).toBeInTheDocument();
      });

      const nextBtn = screen.getByRole('button', { name: /Suivant/i });
      expect(nextBtn).toBeEnabled();

      const prevBtn = screen.getByRole('button', { name: /Précédent/i });
      expect(prevBtn).toBeDisabled();

      // Click Suivant
      await userEvent.click(nextBtn);

      await waitFor(() => {
        expect(screen.getByText('Cours Page 2')).toBeInTheDocument();
      });

      expect(screen.getByRole('button', { name: /Précédent/i })).toBeEnabled();
      expect(screen.getByRole('button', { name: /Suivant/i })).toBeDisabled();

      // Click Précédent to verify return to page 1
      await userEvent.click(screen.getByRole('button', { name: /Précédent/i }));

      await waitFor(() => {
        expect(screen.getByText('Cours Page 1')).toBeInTheDocument();
      });

      expect(screen.getByRole('button', { name: /Précédent/i })).toBeDisabled();
      expect(screen.getByRole('button', { name: /Suivant/i })).toBeEnabled();
    });
  });

  // ---------------------------------------------------------------------------
  // BrowseTreeSidebar Component
  // ---------------------------------------------------------------------------
  describe('BrowseTreeSidebar Component', () => {
    it('fetches courses, asserts active route styling classes, and expands active course modules', async () => {
      const mockCourses = {
        count: 2,
        next: null,
        previous: null,
        results: [
          { id: 'c-active', name: 'Cours Actif' },
          { id: 'c-other', name: 'Autre Cours' },
        ],
      };

      const mockModules = {
        count: 1,
        next: null,
        previous: null,
        results: [{ id: 'm-sub', name: 'Module Sous-jacent' }],
      };

      globalThis.fetch = vi.fn().mockImplementation((url: string) => {
        if (url.includes('/api/v1/browse/courses/c-active/modules/')) {
          return Promise.resolve({
            ok: true,
            status: 200,
            text: () => Promise.resolve(JSON.stringify(mockModules)),
            headers: new Headers({ 'content-type': 'application/json' }),
          });
        }
        if (url.includes('/api/v1/browse/courses/')) {
          return Promise.resolve({
            ok: true,
            status: 200,
            text: () => Promise.resolve(JSON.stringify(mockCourses)),
            headers: new Headers({ 'content-type': 'application/json' }),
          });
        }
        return Promise.reject(new Error(`Unhandled URL: ${url}`));
      });

      render(
        <MemoryRouter initialEntries={['/courses/c-active']}>
          <BrowseTreeSidebar />
        </MemoryRouter>
      );

      await waitFor(() => {
        expect(screen.getByText('Cours Actif')).toBeInTheDocument();
      });

      expect(screen.getByText('Autre Cours')).toBeInTheDocument();

      // Assert active course styling classes
      const activeCourseLink = screen.getByTestId('sidebar-course-c-active');
      const activeContainer = activeCourseLink.parentElement;
      expect(activeContainer?.className).toContain('bg-surface');
      expect(activeContainer?.className).toContain('text-primary');
      expect(activeContainer?.className).toContain('font-medium');

      // Module under active course should load and display
      await waitFor(() => {
        expect(screen.getByText('Module Sous-jacent')).toBeInTheDocument();
      });

      const catalogLink = screen.getByTestId('sidebar-link-catalog');
      expect(catalogLink).toHaveAttribute('href', '/courses');
      expect(catalogLink.className).toContain('min-h-[48px]');

      const activeModuleLink = screen.getByTestId('sidebar-module-m-sub');
      expect(activeModuleLink.className).toContain('min-h-[48px]');
    });

    it('expands course modules on-demand when clicking the chevron toggle button', async () => {
      const mockCourses = {
        count: 1,
        next: null,
        previous: null,
        results: [{ id: 'c-toggle', name: 'Cours Toggle' }],
      };

      const mockModules = {
        count: 1,
        next: null,
        previous: null,
        results: [{ id: 'm-lazy', name: 'Module A la demande' }],
      };

      const fetchSpy = vi.fn().mockImplementation((url: string) => {
        if (url.includes('/api/v1/browse/courses/c-toggle/modules/')) {
          return Promise.resolve({
            ok: true,
            status: 200,
            text: () => Promise.resolve(JSON.stringify(mockModules)),
            headers: new Headers({ 'content-type': 'application/json' }),
          });
        }
        if (url.includes('/api/v1/browse/courses/')) {
          return Promise.resolve({
            ok: true,
            status: 200,
            text: () => Promise.resolve(JSON.stringify(mockCourses)),
            headers: new Headers({ 'content-type': 'application/json' }),
          });
        }
        return Promise.reject(new Error(`Unhandled URL: ${url}`));
      });
      globalThis.fetch = fetchSpy;

      render(
        <MemoryRouter initialEntries={['/courses']}>
          <BrowseTreeSidebar />
        </MemoryRouter>
      );

      await waitFor(() => {
        expect(screen.getByText('Cours Toggle')).toBeInTheDocument();
      });

      // Initially modules are not displayed
      expect(screen.queryByText('Module A la demande')).not.toBeInTheDocument();

      const toggleButton = screen.getByTestId('sidebar-toggle-c-toggle');
      expect(toggleButton).toHaveAttribute('aria-expanded', 'false');
      expect(toggleButton).toHaveAttribute('aria-label', 'Développer Cours Toggle');
      expect(toggleButton.className).toContain('min-h-[48px]');
      expect(toggleButton.className).toContain('min-w-[48px]');

      // Click toggle button to expand
      await userEvent.click(toggleButton);

      await waitFor(() => {
        expect(screen.getByText('Module A la demande')).toBeInTheDocument();
      });

      expect(toggleButton).toHaveAttribute('aria-expanded', 'true');
      expect(toggleButton).toHaveAttribute('aria-label', 'Réduire Cours Toggle');
      expect(fetchSpy).toHaveBeenCalledWith(
        expect.stringContaining('/api/v1/browse/courses/c-toggle/modules/'),
        expect.any(Object)
      );
    });
  });

  // ---------------------------------------------------------------------------
  // AppRoutes Integration (Full Student Navigation Tree)
  // ---------------------------------------------------------------------------
  describe('AppRoutes Full Integration', () => {
    it('allows student navigation from /courses -> /courses/:id -> /modules/:id -> /chapters/:id', async () => {
      const mockCourses = {
        count: 1,
        next: null,
        previous: null,
        results: [{ id: 'c1', name: 'Cours 1' }],
      };
      const mockModules = {
        count: 1,
        next: null,
        previous: null,
        results: [{ id: 'm1', name: 'Module 1' }],
      };
      const mockChapters = {
        count: 1,
        next: null,
        previous: null,
        results: [{ id: 'ch1', name: 'Chapitre 1' }],
      };

      globalThis.fetch = vi.fn().mockImplementation((url: string) => {
        if (url.includes('/api/v1/browse/modules/m1/chapters/')) {
          return Promise.resolve({
            ok: true,
            status: 200,
            text: () => Promise.resolve(JSON.stringify(mockChapters)),
            headers: new Headers({ 'content-type': 'application/json' }),
          });
        }
        if (url.includes('/api/v1/browse/courses/c1/modules/')) {
          return Promise.resolve({
            ok: true,
            status: 200,
            text: () => Promise.resolve(JSON.stringify(mockModules)),
            headers: new Headers({ 'content-type': 'application/json' }),
          });
        }
        if (url.includes('/api/v1/browse/courses/')) {
          return Promise.resolve({
            ok: true,
            status: 200,
            text: () => Promise.resolve(JSON.stringify(mockCourses)),
            headers: new Headers({ 'content-type': 'application/json' }),
          });
        }
        return Promise.reject(new Error(`Unhandled URL: ${url}`));
      });

      render(
        <MemoryRouter initialEntries={['/courses']}>
          <AppRoutes />
        </MemoryRouter>
      );

      // Step 1: Courses Catalog
      await waitFor(() => {
        expect(screen.getByRole('heading', { level: 1, name: 'Catalogue des Cours' })).toBeInTheDocument();
      });
      const courseCard = await screen.findByTestId('course-card-c1');
      await userEvent.click(courseCard);

      // Step 2: Course Modules
      await waitFor(() => {
        expect(screen.getByRole('heading', { level: 1, name: 'Modules du cours' })).toBeInTheDocument();
      });
      const moduleCard = await screen.findByTestId('module-card-m1');
      await userEvent.click(moduleCard);

      // Step 3: Module Chapters
      await waitFor(() => {
        expect(screen.getByRole('heading', { level: 1, name: 'Chapitres du module' })).toBeInTheDocument();
      });
      const chapterCard = await screen.findByTestId('chapter-card-ch1');
      await userEvent.click(chapterCard);

      // Step 4: Chapter Placeholder with back link
      await waitFor(() => {
        expect(screen.getByRole('heading', { level: 1, name: 'Leçons du Chapitre' })).toBeInTheDocument();
      });
      expect(screen.getByTestId('chapter-page-placeholder')).toBeInTheDocument();
      const chapterBackLink = screen.getByTestId('back-to-courses-link');
      expect(chapterBackLink).toHaveTextContent(/Retour aux cours/i);
      expect(chapterBackLink).toHaveAttribute('href', '/courses');
    });
  });

  // ---------------------------------------------------------------------------
  // Mobile 360px Viewport Compliance & Security Boundaries
  // ---------------------------------------------------------------------------
  describe('Mobile 360px Viewport & Security Boundaries', () => {
    it('enforces 360px viewport containment, dark theme tokens, and minimum 48px touch targets', async () => {
      globalThis.fetch = vi.fn().mockResolvedValue({
        ok: true,
        status: 200,
        text: () =>
          Promise.resolve(
            JSON.stringify({
              count: 1,
              next: null,
              previous: null,
              results: [{ id: 'c-test', name: 'Test Mobile Course' }],
            })
          ),
        headers: new Headers({ 'content-type': 'application/json' }),
      });

      render(
        <MemoryRouter initialEntries={['/courses']}>
          <CoursesPage />
        </MemoryRouter>
      );

      const root = screen.getByTestId('courses-page');
      expect(root.className).toContain('min-w-[360px]');
      expect(root.className).toContain('overflow-x-hidden');
      expect(root.className).not.toContain('light');
      expect(document.querySelector('.light')).toBeNull();

      const card = await screen.findByTestId('course-card-c-test');
      expect(card.className).toContain('bg-card');
      expect(card.className).toContain('border-border');
      expect(card.className).toContain('min-h-[48px]');
    });

    it('never calls publisher management endpoints from student browse views', async () => {
      const fetchSpy = vi.fn().mockResolvedValue({
        ok: true,
        status: 200,
        text: () =>
          Promise.resolve(
            JSON.stringify({ count: 1, next: null, previous: null, results: [{ id: 'c1', name: 'C1' }] })
          ),
        headers: new Headers({ 'content-type': 'application/json' }),
      });
      globalThis.fetch = fetchSpy;

      render(
        <MemoryRouter initialEntries={['/courses']}>
          <CoursesPage />
        </MemoryRouter>
      );

      await waitFor(() => {
        expect(screen.getByText('C1')).toBeInTheDocument();
      });

      // Verify fetch URLs
      const calledUrls = fetchSpy.mock.calls.map((call) => call[0] as string);
      for (const url of calledUrls) {
        expect(url).toContain('/api/v1/browse/');
        // Never call publisher management routes:
        expect(url).not.toMatch(/\/api\/v1\/courses\/(?!.*browse)/);
        expect(url).not.toMatch(/\/api\/v1\/modules\/(?!.*browse)/);
        expect(url).not.toMatch(/\/api\/v1\/chapters\/(?!.*browse)/);
      }
    });
  });
});
