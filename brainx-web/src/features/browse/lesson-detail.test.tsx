import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { render, screen, waitFor, fireEvent, act } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { MemoryRouter, Routes, Route } from 'react-router-dom';
import { useAuthStore } from '@/features/auth/auth-store';
import { LessonDetailPage, extractHeadings } from './lesson-detail-page';
import { StudentLayout } from '@/components/layout/student-layout';
import { AppRoutes } from '@/routes';
import type { BrowseLessonDetailItem } from './types';

describe('Story FE-2.4: Vue Détaillée d\'une Leçon & Fil d\'Ariane Contextuel', () => {
  const originalFetch = globalThis.fetch;
  let observerCallback: ((entries: Partial<IntersectionObserverEntry>[]) => void) | null = null;
  const observeMock = vi.fn();
  const disconnectMock = vi.fn();

  beforeEach(() => {
    vi.restoreAllMocks();
    useAuthStore.getState().clearAuth();
    useAuthStore.getState().setTokens({
      access: 'valid_student_jwt',
      refresh: 'valid_refresh_jwt',
    });

    observerCallback = null;
    window.HTMLElement.prototype.scrollIntoView = vi.fn();
    class MockIntersectionObserver {
      constructor(callback: (entries: Partial<IntersectionObserverEntry>[]) => void) {
        observerCallback = callback;
      }
      observe = observeMock;
      unobserve = vi.fn();
      disconnect = disconnectMock;
    }
    window.IntersectionObserver = MockIntersectionObserver as unknown as typeof IntersectionObserver;
  });

  afterEach(() => {
    globalThis.fetch = originalFetch;
  });

  const mockLessonDetail: BrowseLessonDetailItem = {
    id: 'lesson-uuid-1',
    title: 'Architecture Django & React',
    course_name: 'Architecture Logicielle',
    module_name: 'Patterns Web Modernes',
    chapter_name: 'Vues et Sérialiseurs',
    teacher: 'Prof. Ada Lovelace',
    course_date: '2026-10-29',
    resources: [
      { id: 'res-1', type: 'document', title: 'Guide d\'architecture' },
      { id: 'res-2', type: 'video', title: 'Présentation vidéo' },
    ],
    description: `# Introduction générale
Bienvenue dans ce cours approfondi.

## 1. Concepts Fondamentaux
Les concepts de base incluent l'isolation des couches.

### 1.1 Modèles et Migrations
Les modèles Django définissent la structure des données.

> Attention : Toujours vérifier la rétro-compatibilité des migrations.

### 1.2 Sérialiseurs et Validation
DRF gère la validation stricte.

\`\`\`python
class LessonSerializer(serializers.ModelSerializer):
    class Meta:
        model = Lesson
        fields = '__all__'
\`\`\`

## 2. Conclusion et Exercices
Pour finir, testez vos connaissances.
`,
  };

  // ---------------------------------------------------------------------------
  // AC-1: Happy Path & Breadcrumbs [Cours] > [Module] > [Chapitre] > [Leçon]
  // ---------------------------------------------------------------------------
  describe('AC-1: Happy Path & Breadcrumbs Navigation', () => {
    it('queries GET /api/v1/browse/lessons/:id/ and displays full breadcrumbs and metadata header', async () => {
      let requestedUrl = '';
      let authHeader = '';

      globalThis.fetch = vi.fn().mockImplementation((url: string, init?: RequestInit) => {
        requestedUrl = url;
        authHeader = (init?.headers as Record<string, string>)?.['Authorization'] || '';
        if (url.includes('/api/v1/browse/lessons/lesson-uuid-1/')) {
          return Promise.resolve({
            ok: true,
            status: 200,
            text: () => Promise.resolve(JSON.stringify(mockLessonDetail)),
            headers: new Headers({ 'content-type': 'application/json' }),
          });
        }
        return Promise.reject(new Error(`Unhandled URL: ${url}`));
      });

      render(
        <MemoryRouter initialEntries={['/lessons/lesson-uuid-1']}>
          <StudentLayout>
            <Routes>
              <Route path="/lessons/:lessonId" element={<LessonDetailPage />} />
            </Routes>
          </StudentLayout>
        </MemoryRouter>
      );

      // Loading skeleton
      expect(screen.getByTestId('lesson-detail-loading')).toBeInTheDocument();

      // Wait for success
      await waitFor(() => {
        expect(screen.getByTestId('lesson-title')).toHaveTextContent('Architecture Django & React');
      });

      // Verify endpoint and JWT auth
      expect(requestedUrl).toContain('/api/v1/browse/lessons/lesson-uuid-1/');
      expect(authHeader).toBe('Bearer valid_student_jwt');

      // Verify Desktop Breadcrumbs: [Cours] > [Module] > [Chapitre] > [Leçon]
      const desktopBreadcrumbs = screen.getByTestId('lesson-breadcrumbs-desktop');
      expect(desktopBreadcrumbs).toBeInTheDocument();
      expect(desktopBreadcrumbs.className).toContain('hidden sm:flex');

      const courseLink = screen.getByTestId('breadcrumb-course-link');
      expect(courseLink).toHaveTextContent('Architecture Logicielle');
      expect(courseLink).toHaveAttribute('href', '/courses');

      expect(screen.getByTestId('breadcrumb-module')).toHaveTextContent('Patterns Web Modernes');
      expect(screen.getByTestId('breadcrumb-chapter')).toHaveTextContent('Vues et Sérialiseurs');
      expect(screen.getByTestId('breadcrumb-current-leaf')).toHaveTextContent('Architecture Django & React');

      // Verify Metadata Header
      expect(screen.getByTestId('lesson-teacher')).toHaveTextContent('Prof. Ada Lovelace');
      const dateEl = screen.getByTestId('lesson-date');
      expect(dateEl).toHaveTextContent('2026-10-29');
      expect(dateEl.className).toContain('font-mono');

      // Verify Resource Micro-Badges
      const badgesContainer = screen.getByTestId('lesson-resource-badges');
      expect(badgesContainer).toBeInTheDocument();
      expect(screen.getByTestId('resource-badge-document')).toBeInTheDocument();
      expect(screen.getByTestId('resource-badge-video')).toBeInTheDocument();
    });

    it('passes search session id via X-Search-Session-Id header when present in URL params', async () => {
      let sessionHeader = '';

      globalThis.fetch = vi.fn().mockImplementation((url: string, init?: RequestInit) => {
        sessionHeader = (init?.headers as Record<string, string>)?.['X-Search-Session-Id'] || '';
        if (url.includes('/api/v1/browse/lessons/lesson-uuid-1/')) {
          return Promise.resolve({
            ok: true,
            status: 200,
            text: () => Promise.resolve(JSON.stringify(mockLessonDetail)),
            headers: new Headers({ 'content-type': 'application/json' }),
          });
        }
        return Promise.reject(new Error(`Unhandled URL: ${url}`));
      });

      render(
        <MemoryRouter initialEntries={['/lessons/lesson-uuid-1?session_id=sess-999']}>
          <Routes>
            <Route path="/lessons/:lessonId" element={<LessonDetailPage />} />
          </Routes>
        </MemoryRouter>
      );

      await waitFor(() => {
        expect(screen.getByTestId('lesson-title')).toBeInTheDocument();
      });

      expect(sessionHeader).toBe('sess-999');
    });
  });

  // ---------------------------------------------------------------------------
  // AC-2: Mobile Viewport (< 640px) Collapsed Breadcrumb
  // ---------------------------------------------------------------------------
  describe('AC-2: Mobile Viewport (< 640px) Breadcrumb Collapse', () => {
    it('collapses breadcrumbs on mobile to ← [Nom du Chapitre] with >= 48px touch target', async () => {
      globalThis.fetch = vi.fn().mockImplementation((url: string) => {
        if (url.includes('/api/v1/browse/lessons/lesson-uuid-1/')) {
          return Promise.resolve({
            ok: true,
            status: 200,
            text: () => Promise.resolve(JSON.stringify(mockLessonDetail)),
            headers: new Headers({ 'content-type': 'application/json' }),
          });
        }
        return Promise.reject(new Error(`Unhandled URL: ${url}`));
      });

      render(
        <MemoryRouter initialEntries={['/courses', '/lessons/lesson-uuid-1']} initialIndex={1}>
          <Routes>
            <Route path="/lessons/:lessonId" element={<LessonDetailPage />} />
            <Route path="/courses" element={<div data-testid="courses-page-view">Catalogue des cours</div>} />
          </Routes>
        </MemoryRouter>
      );

      await waitFor(() => {
        expect(screen.getByTestId('lesson-title')).toBeInTheDocument();
      });

      const mobileBackButton = screen.getByTestId('mobile-back-button');
      expect(mobileBackButton).toBeInTheDocument();
      expect(mobileBackButton).toHaveTextContent('Vues et Sérialiseurs');

      // Verify touch target >= 48px
      expect(mobileBackButton.className).toContain('min-h-[48px]');
      expect(mobileBackButton.className).toContain('min-w-[48px]');

      // Verify clicking triggers navigation back to /courses
      const user = userEvent.setup();
      await user.click(mobileBackButton);

      await waitFor(() => {
        expect(screen.getByTestId('courses-page-view')).toBeInTheDocument();
      });
    });
  });

  // ---------------------------------------------------------------------------
  // AC-3: Markdown Sanitization and Dark Theme Typography
  // ---------------------------------------------------------------------------
  describe('AC-3: Markdown Sanitization and Typography Styling', () => {
    it('renders sanitized markdown with slate-bordered blockquotes, code blocks, and headings', async () => {
      globalThis.fetch = vi.fn().mockImplementation((url: string) => {
        if (url.includes('/api/v1/browse/lessons/lesson-uuid-1/')) {
          return Promise.resolve({
            ok: true,
            status: 200,
            text: () => Promise.resolve(JSON.stringify(mockLessonDetail)),
            headers: new Headers({ 'content-type': 'application/json' }),
          });
        }
        return Promise.reject(new Error(`Unhandled URL: ${url}`));
      });

      render(
        <MemoryRouter initialEntries={['/lessons/lesson-uuid-1']}>
          <Routes>
            <Route path="/lessons/:lessonId" element={<LessonDetailPage />} />
            <Route path="/courses" element={<div>Catalogue des cours</div>} />
          </Routes>
        </MemoryRouter>
      );

      await waitFor(() => {
        expect(screen.getByTestId('lesson-markdown-body')).toBeInTheDocument();
      });

      const body = screen.getByTestId('lesson-markdown-body');

      // Heading 2: has bottom border and semibold
      const h2 = body.querySelector('h2');
      expect(h2).not.toBeNull();
      expect(h2?.className).toContain('border-b');
      expect(h2?.className).toContain('border-border');

      // Blockquote: has left slate border
      const bq = body.querySelector('blockquote');
      expect(bq).not.toBeNull();
      expect(bq?.className).toContain('border-l-4');
      expect(bq?.className).toContain('border-border');
      expect(bq?.className).toContain('italic');

      // Pre/Code container: isolated with overflow-x-auto to protect 360px floor
      const pre = body.querySelector('pre');
      expect(pre).not.toBeNull();
      expect(pre?.className).toContain('overflow-x-auto');
      expect(pre?.className).toContain('min-w-0');
      expect(pre?.className).toContain('max-w-full');

      // CodeBlock integration (FE-2.5): renders slate header, uppercase badge, copy button, line numbers
      const codeBlock = screen.getByTestId('code-block');
      expect(codeBlock).toBeInTheDocument();
      expect(screen.getByTestId('code-header')).toHaveClass('bg-[#161B22]');
      expect(screen.getByTestId('code-language-badge')).toHaveTextContent('PYTHON');
      expect(screen.getByTestId('code-copy-button')).toHaveTextContent('Copier');
      const lineNumbers = screen.getAllByTestId('code-line-number');
      expect(lineNumbers.length).toBeGreaterThanOrEqual(4);
      expect(lineNumbers[0]).toHaveTextContent('1');
    });

    it('sanitizes script tags and unsafe attributes via rehype-sanitize', async () => {
      const maliciousLesson: BrowseLessonDetailItem = {
        ...mockLessonDetail,
        description: `## Section Sécurisée
<script>window.__pwned = true;</script>
<img src="x" onerror="window.__pwned = true;" />
Contenu pédagogique sain.`,
      };

      globalThis.fetch = vi.fn().mockImplementation((url: string) => {
        if (url.includes('/api/v1/browse/lessons/lesson-uuid-1/')) {
          return Promise.resolve({
            ok: true,
            status: 200,
            text: () => Promise.resolve(JSON.stringify(maliciousLesson)),
            headers: new Headers({ 'content-type': 'application/json' }),
          });
        }
        return Promise.reject(new Error(`Unhandled URL: ${url}`));
      });

      render(
        <MemoryRouter initialEntries={['/lessons/lesson-uuid-1']}>
          <Routes>
            <Route path="/lessons/:lessonId" element={<LessonDetailPage />} />
            <Route path="/courses" element={<div>Catalogue des cours</div>} />
          </Routes>
        </MemoryRouter>
      );

      await waitFor(() => {
        expect(screen.getByTestId('lesson-markdown-body')).toBeInTheDocument();
      });

      const body = screen.getByTestId('lesson-markdown-body');

      // Script tag must be stripped completely
      expect(body.querySelector('script')).toBeNull();
      // Onerror attribute must not be present
      const img = body.querySelector('img');
      if (img) {
        expect(img).not.toHaveAttribute('onerror');
      }
      expect((window as unknown as { __pwned?: boolean }).__pwned).toBeUndefined();
    });

    it('renders empty content state when description is empty string', async () => {
      const emptyLesson: BrowseLessonDetailItem = {
        ...mockLessonDetail,
        description: '',
      };

      globalThis.fetch = vi.fn().mockImplementation((url: string) => {
        if (url.includes('/api/v1/browse/lessons/lesson-uuid-1/')) {
          return Promise.resolve({
            ok: true,
            status: 200,
            text: () => Promise.resolve(JSON.stringify(emptyLesson)),
            headers: new Headers({ 'content-type': 'application/json' }),
          });
        }
        return Promise.reject(new Error(`Unhandled URL: ${url}`));
      });

      render(
        <MemoryRouter initialEntries={['/lessons/lesson-uuid-1']}>
          <Routes>
            <Route path="/lessons/:lessonId" element={<LessonDetailPage />} />
            <Route path="/courses" element={<div>Catalogue des cours</div>} />
          </Routes>
        </MemoryRouter>
      );

      await waitFor(() => {
        expect(screen.getByTestId('lesson-title')).toBeInTheDocument();
      });

      expect(screen.getByTestId('lesson-empty-content')).toHaveTextContent(
        'Cette leçon ne contient pas encore de texte.'
      );
    });
  });

  // ---------------------------------------------------------------------------
  // AC-4: Dynamic Table of Contents (TOC) & IntersectionObserver
  // ---------------------------------------------------------------------------
  describe('AC-4: Dynamic Table of Contents (TOC)', () => {
    it('renders TOC anchors from h2 and h3 headings and highlights active section via IntersectionObserver', async () => {
      globalThis.fetch = vi.fn().mockImplementation((url: string) => {
        if (url.includes('/api/v1/browse/lessons/lesson-uuid-1/')) {
          return Promise.resolve({
            ok: true,
            status: 200,
            text: () => Promise.resolve(JSON.stringify(mockLessonDetail)),
            headers: new Headers({ 'content-type': 'application/json' }),
          });
        }
        return Promise.reject(new Error(`Unhandled URL: ${url}`));
      });

      render(
        <MemoryRouter initialEntries={['/lessons/lesson-uuid-1']}>
          <StudentLayout>
            <Routes>
              <Route path="/lessons/:lessonId" element={<LessonDetailPage />} />
            </Routes>
          </StudentLayout>
        </MemoryRouter>
      );

      await waitFor(() => {
        expect(screen.getByTestId('lesson-title')).toBeInTheDocument();
      });

      // Right rail TOC is rendered via StudentLayout dynamic context
      await waitFor(() => {
        const tocs = screen.getAllByTestId('lesson-toc');
        expect(tocs.length).toBeGreaterThan(0);
      });

      const toc = screen.getAllByTestId('lesson-toc')[0];
      expect(toc).toHaveTextContent('Sur cette page');

      // Check headings are present as anchors
      const h2Anchor1 = screen.getAllByTestId('toc-link-1-concepts-fondamentaux')[0];
      const h3Anchor1 = screen.getAllByTestId('toc-link-1-1-modeles-et-migrations')[0];
      const h2Anchor2 = screen.getAllByTestId('toc-link-2-conclusion-et-exercices')[0];

      expect(h2Anchor1).toBeInTheDocument();
      expect(h3Anchor1).toBeInTheDocument();
      expect(h2Anchor2).toBeInTheDocument();

      // Initially, the first TOC item is active
      expect(h2Anchor1.getAttribute('data-active')).toBe('true');
      expect(h2Anchor1.getAttribute('aria-current')).toBe('location');
      expect(h3Anchor1.getAttribute('aria-current')).toBeNull();
      expect(h2Anchor1.className).toContain('border-primary');
      expect(h2Anchor1.className).toContain('min-h-[44px]');

      // Simulate IntersectionObserver detecting section 2 entering viewport
      expect(observerCallback).not.toBeNull();
      act(() => {
        if (observerCallback) {
          observerCallback([
            {
              target: { id: '2-conclusion-et-exercices' } as Element,
              isIntersecting: true,
            },
          ]);
        }
      });

      // Now section 2 is active with 2px primary border
      expect(h2Anchor2.getAttribute('data-active')).toBe('true');
      expect(h2Anchor2.getAttribute('aria-current')).toBe('location');
      expect(h2Anchor1.getAttribute('aria-current')).toBeNull();
      expect(h2Anchor2.className).toContain('border-primary');
    });

    it('clears dynamic TOC when navigating away from /lessons/:lessonId', async () => {
      globalThis.fetch = vi.fn().mockImplementation((url: string) => {
        if (url.includes('/api/v1/browse/lessons/lesson-uuid-1/')) {
          return Promise.resolve({
            ok: true,
            status: 200,
            text: () => Promise.resolve(JSON.stringify(mockLessonDetail)),
            headers: new Headers({ 'content-type': 'application/json' }),
          });
        }
        return Promise.reject(new Error(`Unhandled URL: ${url}`));
      });

      render(
        <MemoryRouter initialEntries={['/lessons/lesson-uuid-1']}>
          <StudentLayout>
            <Routes>
              <Route path="/lessons/:lessonId" element={<LessonDetailPage />} />
              <Route path="/courses" element={<div data-testid="courses-view">Catalogue</div>} />
            </Routes>
          </StudentLayout>
        </MemoryRouter>
      );

      await waitFor(() => {
        expect(screen.getByTestId('lesson-title')).toBeInTheDocument();
      });

      await waitFor(() => {
        expect(screen.getAllByTestId('lesson-toc').length).toBeGreaterThan(0);
      });

      const courseLink = screen.getByTestId('breadcrumb-course-link');
      const user = userEvent.setup();
      await user.click(courseLink);

      await waitFor(() => {
        expect(screen.getByTestId('courses-view')).toBeInTheDocument();
      });

      // Dynamic TOC is cleared and layout reverts to DefaultTocContent
      expect(screen.queryByTestId('lesson-toc')).toBeNull();
      const rightToc = screen.getByTestId('student-right-toc');
      expect(rightToc).toHaveTextContent('Sur cette page');
      expect(rightToc).toHaveTextContent('Introduction');
    });

    it('clicking a TOC link calls scrollIntoView and closes mobile right drawer', async () => {
      globalThis.fetch = vi.fn().mockImplementation((url: string) => {
        if (url.includes('/api/v1/browse/lessons/lesson-uuid-1/')) {
          return Promise.resolve({
            ok: true,
            status: 200,
            text: () => Promise.resolve(JSON.stringify(mockLessonDetail)),
            headers: new Headers({ 'content-type': 'application/json' }),
          });
        }
        return Promise.reject(new Error(`Unhandled URL: ${url}`));
      });

      render(
        <MemoryRouter initialEntries={['/lessons/lesson-uuid-1']}>
          <StudentLayout>
            <Routes>
              <Route path="/lessons/:lessonId" element={<LessonDetailPage />} />
            </Routes>
          </StudentLayout>
        </MemoryRouter>
      );

      await waitFor(() => {
        expect(screen.getByTestId('lesson-title')).toBeInTheDocument();
      });

      // Open mobile right drawer
      const rightDrawerTrigger = screen.getByTestId('right-drawer-trigger');
      fireEvent.click(rightDrawerTrigger);

      await waitFor(() => {
        expect(screen.getByTestId('right-drawer-content')).toBeInTheDocument();
      });

      const drawerContent = screen.getByTestId('right-drawer-content');
      const drawerTocLink = drawerContent.querySelector('a[data-toc-link]');
      expect(drawerTocLink).not.toBeNull();

      if (drawerTocLink) {
        fireEvent.click(drawerTocLink);
      }

      expect(window.HTMLElement.prototype.scrollIntoView).toHaveBeenCalledWith({ behavior: 'smooth' });

      // Mobile right drawer closes automatically
      await waitFor(() => {
        expect(screen.queryByTestId('right-drawer-content')).toBeNull();
      });
    });
  });

  // ---------------------------------------------------------------------------
  // AC-5: 404 & Network / 500 Error States (RFC 9457)
  // ---------------------------------------------------------------------------
  describe('AC-5: Error States & RFC 9457 Handling', () => {
    it('renders 404 card with button returning to /courses when lesson does not exist or is unpublished', async () => {
      globalThis.fetch = vi.fn().mockImplementation(() => {
        return Promise.resolve({
          ok: false,
          status: 404,
          statusText: 'Not Found',
          text: () =>
            Promise.resolve(
              JSON.stringify({
                type: 'about:blank',
                title: 'Not Found',
                status: 404,
                detail: 'Contenu introuvable ou non publié.',
                errors: {},
              })
            ),
          headers: new Headers({ 'content-type': 'application/json' }),
        });
      });

      render(
        <MemoryRouter initialEntries={['/lessons/nonexistent-id']}>
          <Routes>
            <Route path="/lessons/:lessonId" element={<LessonDetailPage />} />
          </Routes>
        </MemoryRouter>
      );

      await waitFor(() => {
        expect(screen.getByTestId('lesson-detail-error-404')).toBeInTheDocument();
      });

      const errorCard = screen.getByTestId('lesson-detail-error-404');
      expect(errorCard).toHaveTextContent('Leçon introuvable ou non publiée.');

      const backBtn = screen.getByTestId('error-back-courses-btn');
      expect(backBtn).toHaveAttribute('href', '/courses');
      expect(backBtn).toHaveTextContent('Retour aux cours');
      expect(backBtn.className).toContain('min-h-[48px]');
    });

    it('renders retryable alert on 500 or network failure and allows retry', async () => {
      let callCount = 0;
      globalThis.fetch = vi.fn().mockImplementation(() => {
        callCount++;
        if (callCount === 1) {
          return Promise.resolve({
            ok: false,
            status: 500,
            statusText: 'Internal Server Error',
            text: () =>
              Promise.resolve(
                JSON.stringify({
                  type: 'about:blank',
                  title: 'Internal Server Error',
                  status: 500,
                  detail: 'Le serveur a rencontré une erreur inattendue.',
                  errors: {},
                })
              ),
            headers: new Headers({ 'content-type': 'application/json' }),
          });
        }
        return Promise.resolve({
          ok: true,
          status: 200,
          text: () => Promise.resolve(JSON.stringify(mockLessonDetail)),
          headers: new Headers({ 'content-type': 'application/json' }),
        });
      });

      render(
        <MemoryRouter initialEntries={['/lessons/lesson-uuid-1']}>
          <Routes>
            <Route path="/lessons/:lessonId" element={<LessonDetailPage />} />
            <Route path="/courses" element={<div>Catalogue des cours</div>} />
          </Routes>
        </MemoryRouter>
      );

      await waitFor(() => {
        expect(screen.getByTestId('lesson-detail-error-network')).toBeInTheDocument();
      });

      const errorAlert = screen.getByTestId('lesson-detail-error-network');
      expect(errorAlert).toHaveTextContent('Une erreur est survenue lors du chargement de la leçon.');
      expect(errorAlert).toHaveTextContent('Le serveur a rencontré une erreur inattendue.');

      // Click retry
      const retryBtn = screen.getByRole('button', { name: /réessayer/i });
      fireEvent.click(retryBtn);

      await waitFor(() => {
        expect(screen.getByTestId('lesson-title')).toBeInTheDocument();
      });

      expect(callCount).toBe(2);
      expect(screen.getByTestId('lesson-title')).toHaveTextContent('Architecture Django & React');
    });

    it('displays custom RFC 9457 dynamic error detail message when returned by API', async () => {
      globalThis.fetch = vi.fn().mockImplementation(() => {
        return Promise.resolve({
          ok: false,
          status: 500,
          statusText: 'Internal Server Error',
          text: () =>
            Promise.resolve(
              JSON.stringify({
                type: 'about:blank',
                title: 'Internal Server Error',
                status: 500,
                detail: 'Service de base de données temporairement indisponible.',
                errors: {},
              })
            ),
          headers: new Headers({ 'content-type': 'application/json' }),
        });
      });

      render(
        <MemoryRouter initialEntries={['/lessons/lesson-uuid-1']}>
          <Routes>
            <Route path="/lessons/:lessonId" element={<LessonDetailPage />} />
          </Routes>
        </MemoryRouter>
      );

      await waitFor(() => {
        expect(screen.getByTestId('lesson-detail-error-network')).toBeInTheDocument();
      });

      expect(
        screen.getByText('Service de base de données temporairement indisponible.')
      ).toBeInTheDocument();
    });

    it('extracts headings while skipping code fences and stripping markdown links', () => {
      const markdown = `
# Title
## 1. Premier chapitre
\`\`\`python
## Ce commentaire ne doit pas être inclus
### Autre commentaire
\`\`\`
~~~bash
## Commentaire tilde ignoré
~~~
### 1.1 Sous-section avec [lien](https://example.com)
`;
      const headings = extractHeadings(markdown);
      expect(headings).toEqual([
        { id: '1-premier-chapitre', text: '1. Premier chapitre', level: 2 },
        { id: '1-1-sous-section-avec-lien', text: '1.1 Sous-section avec lien', level: 3 },
      ]);
    });
  });

  // ---------------------------------------------------------------------------
  // Mobile Floor & Sidebar Continuity Integration
  // ---------------------------------------------------------------------------
  describe('Mobile Floor & Sidebar Continuity', () => {
    it('adheres to strict 360px floor containment without horizontal overflow', async () => {
      globalThis.fetch = vi.fn().mockImplementation((url: string) => {
        if (url.includes('/api/v1/browse/lessons/lesson-uuid-1/')) {
          return Promise.resolve({
            ok: true,
            status: 200,
            text: () => Promise.resolve(JSON.stringify(mockLessonDetail)),
            headers: new Headers({ 'content-type': 'application/json' }),
          });
        }
        return Promise.reject(new Error(`Unhandled URL: ${url}`));
      });

      render(
        <MemoryRouter initialEntries={['/lessons/lesson-uuid-1']}>
          <Routes>
            <Route path="/lessons/:lessonId" element={<LessonDetailPage />} />
            <Route path="/courses" element={<div>Catalogue des cours</div>} />
          </Routes>
        </MemoryRouter>
      );

      await waitFor(() => {
        expect(screen.getByTestId('lesson-detail-page')).toBeInTheDocument();
      });

      const page = screen.getByTestId('lesson-detail-page');
      expect(page.className).toContain('min-w-[360px]');
      expect(page.className).toContain('overflow-x-hidden');
    });

    it('mounts within AppRoutes when authenticated', async () => {
      globalThis.fetch = vi.fn().mockImplementation((url: string) => {
        if (url.includes('/api/v1/browse/lessons/lesson-uuid-1/')) {
          return Promise.resolve({
            ok: true,
            status: 200,
            text: () => Promise.resolve(JSON.stringify(mockLessonDetail)),
            headers: new Headers({ 'content-type': 'application/json' }),
          });
        }
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
        <MemoryRouter initialEntries={['/lessons/lesson-uuid-1']}>
          <AppRoutes />
        </MemoryRouter>
      );

      await waitFor(() => {
        expect(screen.getByTestId('lesson-title')).toBeInTheDocument();
      });

      // Sidebar recognizes active lesson
      const sidebar = screen.getByTestId('browse-tree-sidebar');
      expect(sidebar).toHaveAttribute('data-active-lesson', 'lesson-uuid-1');
    });
  });
});
