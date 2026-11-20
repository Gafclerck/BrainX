import React from 'react';
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { render, screen, act, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { MemoryRouter, useLocation } from 'react-router-dom';
import { useAuthStore } from '@/features/auth/auth-store';
import { useConfigStore } from '@/features/config/config-store';
import { AppRoutes, CoursesPagePlaceholder, PublisherPagePlaceholder } from './index';
import {
  AuthGuard,
  sanitizeReturnUrl,
  PUBLISHER_NOTICE,
} from './guards';
import { ThrottledBanner } from '@/components/ui/throttled-banner';

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

describe('Story FE-1.6: Gardes de Routage & Bannière de Temporisation Retry-After', () => {
  const originalFetch = globalThis.fetch;

  beforeEach(() => {
    vi.restoreAllMocks();
    vi.stubEnv('VITE_PUBLIC_BROWSING', 'false');
    useConfigStore.getState().setPublicBrowsing(false);
    useAuthStore.getState().clearAuth();
    window.localStorage?.clear();
  });

  afterEach(() => {
    vi.unstubAllEnvs();
    globalThis.fetch = originalFetch;
    useConfigStore.getState().setPublicBrowsing(false);
  });

  afterEach(() => {
    vi.useRealTimers();
  });

  // ---------------------------------------------------------------------------
  // 1. Centralized sanitizeReturnUrl helper
  // ---------------------------------------------------------------------------
  describe('sanitizeReturnUrl', () => {
    it('returns /courses for null, undefined, empty, or whitespace-only inputs', () => {
      expect(sanitizeReturnUrl(null)).toBe('/courses');
      expect(sanitizeReturnUrl(undefined)).toBe('/courses');
      expect(sanitizeReturnUrl('')).toBe('/courses');
      expect(sanitizeReturnUrl('   ')).toBe('/courses');
    });

    it('allows valid relative paths starting with /', () => {
      expect(sanitizeReturnUrl('/courses')).toBe('/courses');
      expect(sanitizeReturnUrl('/courses/module-1')).toBe('/courses/module-1');
      expect(sanitizeReturnUrl('/publisher/dashboard')).toBe('/publisher/dashboard');
      expect(sanitizeReturnUrl('/profile?tab=settings')).toBe('/profile?tab=settings');
    });

    it('sanitizes and rejects open redirect attempts to external protocols or schemes', () => {
      expect(sanitizeReturnUrl('https://evil.com')).toBe('/courses');
      expect(sanitizeReturnUrl('http://attacker.org/phish')).toBe('/courses');
      expect(sanitizeReturnUrl('javascript:alert(1)')).toBe('/courses');
      expect(sanitizeReturnUrl('data:text/html,<script>alert(1)</script>')).toBe('/courses');
    });

    it('sanitizes and rejects protocol-relative URLs and Windows backslash bypasses', () => {
      expect(sanitizeReturnUrl('//evil.com')).toBe('/courses');
      expect(sanitizeReturnUrl('//evil.com/path')).toBe('/courses');
      expect(sanitizeReturnUrl('/\\evil.com')).toBe('/courses');
      expect(sanitizeReturnUrl('/\\evil.com/test')).toBe('/courses');
      expect(sanitizeReturnUrl('/foo\\bar')).toBe('/courses');
    });

    it('prevents infinite redirect loops targeting /login', () => {
      expect(sanitizeReturnUrl('/login')).toBe('/courses');
      expect(sanitizeReturnUrl('/login/')).toBe('/courses');
      expect(sanitizeReturnUrl('/login?returnUrl=/courses')).toBe('/courses');
      expect(sanitizeReturnUrl('/login/?returnUrl=/courses')).toBe('/courses');
      expect(sanitizeReturnUrl('/login?next=/courses')).toBe('/courses');
      expect(sanitizeReturnUrl('/login#section')).toBe('/courses');
    });

    it('prevents redirect loops for all guest auth routes including trailing slashes', () => {
      expect(sanitizeReturnUrl('/register')).toBe('/courses');
      expect(sanitizeReturnUrl('/register/')).toBe('/courses');
      expect(sanitizeReturnUrl('/register?ref=123')).toBe('/courses');
      expect(sanitizeReturnUrl('/register/?ref=123')).toBe('/courses');
      expect(sanitizeReturnUrl('/forgot-password')).toBe('/courses');
      expect(sanitizeReturnUrl('/forgot-password/')).toBe('/courses');
      expect(sanitizeReturnUrl('/forgot-password/?step=1')).toBe('/courses');
      expect(sanitizeReturnUrl('/reset-password')).toBe('/courses');
      expect(sanitizeReturnUrl('/reset-password/')).toBe('/courses');
      expect(sanitizeReturnUrl('/reset-password?token=abc')).toBe('/courses');
    });

    it('permits queries containing :// while rejecting :// in path', () => {
      expect(sanitizeReturnUrl('/courses?redirect=https://example.com')).toBe(
        '/courses?redirect=https://example.com'
      );
      expect(sanitizeReturnUrl('/courses/view?source=http://localhost:3000')).toBe(
        '/courses/view?source=http://localhost:3000'
      );
      expect(sanitizeReturnUrl('/https://evil.com')).toBe('/courses');
    });

    it('handles percent-encoded inputs safely', () => {
      expect(sanitizeReturnUrl('%2Fcourses')).toBe('/courses');
      expect(sanitizeReturnUrl('%2Fpublisher%2Fdashboard')).toBe('/publisher/dashboard');
      expect(sanitizeReturnUrl('%2F%2Fevil.com')).toBe('/courses');
      expect(sanitizeReturnUrl('%2F%5Cevil.com')).toBe('/courses');
    });
  });

  // ---------------------------------------------------------------------------
  // 2. AuthGuard tests
  // ---------------------------------------------------------------------------
  describe('AuthGuard (Student Route Protection)', () => {
    it('redirects unauthenticated visitor from /courses to /login with encoded returnUrl', () => {
      render(
        <MemoryRouter initialEntries={['/courses']}>
          <LocationTracker />
          <AppRoutes />
        </MemoryRouter>
      );

      // Verify redirect target includes returnUrl=%2Fcourses
      expect(screen.getByTestId('current-location')).toHaveTextContent(
        '/login?returnUrl=%2Fcourses'
      );
      expect(screen.getByTestId('login-page-root')).toBeInTheDocument();
      expect(
        screen.queryByTestId('courses-page-placeholder')
      ).not.toBeInTheDocument();
      expect(
        screen.queryByTestId('student-layout')
      ).not.toBeInTheDocument();
    });

    it('preserves query parameters and hash fragments in the returnUrl', () => {
      render(
        <MemoryRouter initialEntries={['/courses?category=math#module-3']}>
          <LocationTracker />
          <AppRoutes />
        </MemoryRouter>
      );

      const expectedReturnUrl = encodeURIComponent('/courses?category=math#module-3');
      expect(screen.getByTestId('current-location')).toHaveTextContent(
        `/login?returnUrl=${expectedReturnUrl}`
      );
    });

    it('allows unauthenticated visitor when allowGuest or public browsing is active', () => {
      vi.stubEnv('VITE_PUBLIC_BROWSING', 'true');
      useConfigStore.getState().setPublicBrowsing(true);
      act(() => {
        render(
          <MemoryRouter initialEntries={['/courses']}>
            <LocationTracker />
            <AuthGuard allowGuest={true}>
              <div data-testid="public-courses-content">Contenu Public</div>
            </AuthGuard>
          </MemoryRouter>
        );
      });

      expect(screen.getByTestId('public-courses-content')).toBeInTheDocument();
      expect(screen.getByTestId('current-location')).toHaveTextContent('/courses');
    });

    it('redirects unauthenticated visitor across all curriculum levels to /login when public browsing is inactive', () => {
      const studentRoutes = [
        '/courses',
        '/courses/c-123',
        '/modules/m-456',
        '/chapters/ch-789',
        '/lessons/l-012',
      ];

      for (const route of studentRoutes) {
        const { unmount } = render(
          <MemoryRouter initialEntries={[route]}>
            <LocationTracker />
            <AppRoutes />
          </MemoryRouter>
        );

        const expectedReturnUrl = encodeURIComponent(route);
        expect(screen.getByTestId('current-location')).toHaveTextContent(
          `/login?returnUrl=${expectedReturnUrl}`
        );
        expect(screen.getByTestId('login-page-root')).toBeInTheDocument();
        expect(screen.queryByTestId('student-layout')).not.toBeInTheDocument();

        unmount();
      }
    });

    it('grants unauthenticated visitor access across all curriculum levels when public browsing is active', async () => {
      vi.stubEnv('VITE_PUBLIC_BROWSING', 'true');
      useConfigStore.getState().setPublicBrowsing(true);

      const mockData = {
        id: 'test-id',
        name: 'Item Test',
        title: 'Item Test',
        count: 0,
        next: null,
        previous: null,
        results: [],
        resources: [],
      };

      globalThis.fetch = vi.fn().mockImplementation(() =>
        Promise.resolve({
          ok: true,
          status: 200,
          text: () => Promise.resolve(JSON.stringify(mockData)),
          headers: new Headers({ 'content-type': 'application/json' }),
        })
      );

      const studentRoutes = [
        '/courses',
        '/courses/c-123',
        '/modules/m-456',
        '/chapters/ch-789',
        '/lessons/l-012',
      ];

      for (const route of studentRoutes) {
        let unmountFn!: () => void;
        await act(async () => {
          const { unmount } = render(
            <MemoryRouter initialEntries={[route]}>
              <LocationTracker />
              <AppRoutes />
            </MemoryRouter>
          );
          unmountFn = unmount;
        });

        expect(screen.getByTestId('current-location')).toHaveTextContent(route);
        expect(screen.getByTestId('student-layout')).toBeInTheDocument();
        expect(screen.queryByTestId('login-page-root')).not.toBeInTheDocument();

        // AppHeader displays guest actions, not authenticated profile menu
        expect(screen.getByTestId('header-catalogue-link')).toBeInTheDocument();
        expect(screen.getByTestId('header-auth-cta')).toBeInTheDocument();
        expect(screen.queryByTestId('profile-menu-trigger')).not.toBeInTheDocument();

        unmountFn();
      }
    });

    it('honors dynamic config store update from /api/v1/config/ without env restart', async () => {
      // VITE_PUBLIC_BROWSING remains 'false'
      vi.stubEnv('VITE_PUBLIC_BROWSING', 'false');
      useConfigStore.getState().setPublicBrowsing(false);

      globalThis.fetch = vi.fn().mockImplementation((url: string) => {
        if (url.includes('/api/v1/config/')) {
          return Promise.resolve({
            ok: true,
            status: 200,
            text: () => Promise.resolve(JSON.stringify({ public_browsing: true })),
            headers: new Headers({ 'content-type': 'application/json' }),
          });
        }
        return Promise.resolve({
          ok: true,
          status: 200,
          text: () => Promise.resolve(JSON.stringify({ count: 0, results: [] })),
          headers: new Headers({ 'content-type': 'application/json' }),
        });
      });

      // Synchronize dynamic config from API
      await act(async () => {
        await useConfigStore.getState().fetchPublicConfig();
      });
      expect(useConfigStore.getState().publicBrowsing).toBe(true);

      await act(async () => {
        render(
          <MemoryRouter initialEntries={['/courses']}>
            <LocationTracker />
            <AppRoutes />
          </MemoryRouter>
        );
      });

      expect(screen.getByTestId('current-location')).toHaveTextContent('/courses');
      expect(screen.getByTestId('student-layout')).toBeInTheDocument();
    });

    it('renders child content when user is authenticated with a valid accessToken', () => {
      useAuthStore.getState().setTokens({
        access: 'valid_student_jwt',
        refresh: 'valid_refresh_jwt',
      });

      render(
        <MemoryRouter initialEntries={['/courses']}>
          <LocationTracker />
          <AppRoutes />
        </MemoryRouter>
      );

      expect(screen.getByTestId('current-location')).toHaveTextContent('/courses');
      // Confirm StudentLayout and guarded courses placeholder are rendered
      expect(screen.getByTestId('student-layout')).toBeInTheDocument();
      expect(screen.getByTestId('student-left-sidebar')).toBeInTheDocument();
      expect(screen.getByTestId('student-main-content')).toBeInTheDocument();
      expect(screen.getByTestId('student-right-toc')).toBeInTheDocument();
      expect(
        screen.getByTestId('courses-page-placeholder')
      ).toBeInTheDocument();
      expect(
        screen.getByText('Catalogue des Cours')
      ).toBeInTheDocument();
    });
  });

  // ---------------------------------------------------------------------------
  // 3. PublisherGuard tests
  // ---------------------------------------------------------------------------
  describe('PublisherGuard (Publisher Workspace Protection)', () => {
    it('redirects unauthenticated visitor from /publisher/dashboard to /login?returnUrl=...', () => {
      render(
        <MemoryRouter initialEntries={['/publisher/dashboard']}>
          <LocationTracker />
          <AppRoutes />
        </MemoryRouter>
      );

      expect(screen.getByTestId('current-location')).toHaveTextContent(
        '/login?returnUrl=%2Fpublisher%2Fdashboard'
      );
      expect(screen.getByTestId('login-page-root')).toBeInTheDocument();
      expect(
        screen.queryByTestId('publisher-page-placeholder')
      ).not.toBeInTheDocument();
    });

    it('blocks unauthenticated visitor from /publisher/* even when public browsing is active', () => {
      vi.stubEnv('VITE_PUBLIC_BROWSING', 'true');
      useConfigStore.getState().setPublicBrowsing(true);

      const publisherRoutes = [
        '/publisher',
        '/publisher/dashboard',
        '/publisher/trash',
        '/publisher/search-analytics',
        '/publisher/courses/course-uuid',
        '/publisher/lessons/lesson-uuid',
      ];

      for (const route of publisherRoutes) {
        const { unmount } = render(
          <MemoryRouter initialEntries={[route]}>
            <LocationTracker />
            <AppRoutes />
          </MemoryRouter>
        );

        const expectedReturnUrl = encodeURIComponent(route);
        expect(screen.getByTestId('current-location')).toHaveTextContent(
          `/login?returnUrl=${expectedReturnUrl}`
        );
        expect(screen.getByTestId('login-page-root')).toBeInTheDocument();
        expect(screen.queryByTestId('publisher-page-placeholder')).not.toBeInTheDocument();

        unmount();
      }
    });

    it('redirects authenticated non-publisher (student) to /courses and displays informative banner without altering tokens', async () => {
      const user = userEvent.setup();

      // Set user as authenticated student (isPublisher: false)
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

      render(
        <MemoryRouter initialEntries={['/publisher/dashboard']}>
          <LocationTracker />
          <AppRoutes />
        </MemoryRouter>
      );

      // Verify redirected to /courses
      expect(screen.getByTestId('current-location')).toHaveTextContent('/courses');

      // Verify informative banner is surfaced with verbatim spec message
      const banner = screen.getByTestId('publisher-notice-banner');
      expect(banner).toBeInTheDocument();
      expect(banner).toHaveAttribute('role', 'status');
      expect(banner).toHaveTextContent(PUBLISHER_NOTICE);

      // Verify user auth tokens were NOT cleared or altered
      const currentStore = useAuthStore.getState();
      expect(currentStore.accessToken).toBe('valid_student_jwt');
      expect(currentStore.refreshToken).toBe('valid_refresh_jwt');
      expect(currentStore.isPublisher).toBe(false);

      // Dismiss banner via close button (verifying >= 44px touch target)
      const dismissBtn = screen.getByTestId('dismiss-notice-button');
      expect(dismissBtn.className).toContain('min-h-[44px]');
      expect(dismissBtn.className).toContain('min-w-[44px]');
      await user.click(dismissBtn);

      // Banner should disappear
      expect(
        screen.queryByTestId('publisher-notice-banner')
      ).not.toBeInTheDocument();
    });

    it('preserves query parameters and hash fragments when dismissing publisher notice on LandingPage', async () => {
      const user = userEvent.setup();

      render(
        <MemoryRouter
          initialEntries={[
            {
              pathname: '/',
              search: '?ref=promo',
              hash: '#faq',
              state: { notice: PUBLISHER_NOTICE },
            },
          ]}
        >
          <LocationTracker />
          <AppRoutes />
        </MemoryRouter>
      );

      expect(screen.getByTestId('current-location')).toHaveTextContent(
        '/?ref=promo#faq'
      );
      expect(screen.getByTestId('publisher-notice-banner')).toBeInTheDocument();

      const dismissBtn = screen.getByTestId('dismiss-notice-button');
      await user.click(dismissBtn);

      expect(
        screen.queryByTestId('publisher-notice-banner')
      ).not.toBeInTheDocument();
      expect(screen.getByTestId('current-location')).toHaveTextContent(
        '/?ref=promo#faq'
      );
    });

    it('does not crash or display banner when notice in location state is not a non-empty string', () => {
      render(
        <MemoryRouter
          initialEntries={[
            {
              pathname: '/',
              state: { notice: 42 as unknown as string },
            },
          ]}
        >
          <AppRoutes />
        </MemoryRouter>
      );

      expect(
        screen.queryByTestId('publisher-notice-banner')
      ).not.toBeInTheDocument();
    });

    it('renders Espace Éditeur link with href="/publisher/dashboard" for authenticated publisher on LandingPage', () => {
      useAuthStore.getState().setTokens({
        access: 'valid_publisher_jwt',
        refresh: 'valid_refresh_jwt',
      });
      useAuthStore.getState().setIsPublisher(true);

      render(
        <MemoryRouter initialEntries={['/']}>
          <AppRoutes />
        </MemoryRouter>
      );

      const publisherLink = screen.getByTestId('nav-publisher-link');
      expect(publisherLink).toBeInTheDocument();
      expect(publisherLink).toHaveAttribute('href', '/publisher/dashboard');
    });

    it('grants access to authenticated publisher (isPublisher: true) without redirection', async () => {
      globalThis.fetch = vi.fn().mockImplementation(() =>
        Promise.resolve({
          ok: true,
          status: 200,
          text: () =>
            Promise.resolve(
              JSON.stringify({ count: 0, next: null, previous: null, results: [] })
            ),
          headers: new Headers({ 'content-type': 'application/json' }),
        })
      );

      useAuthStore.getState().setTokens({
        access: 'valid_publisher_jwt',
        refresh: 'valid_refresh_jwt',
      });
      useAuthStore.getState().setUser({
        id: 'pub-uuid',
        email: 'publisher@example.com',
        is_publisher: true,
      });
      useAuthStore.getState().setIsPublisher(true);

      await act(async () => {
        render(
          <MemoryRouter initialEntries={['/publisher/dashboard']}>
            <LocationTracker />
            <AppRoutes />
          </MemoryRouter>
        );
      });

      await waitFor(() => {
        expect(screen.getByTestId('current-location')).toHaveTextContent(
          '/publisher/dashboard'
        );
      });
      expect(
        screen.getByTestId('publisher-page-placeholder')
      ).toBeInTheDocument();
      expect(screen.getByText('Espace Éditeur')).toBeInTheDocument();
      expect(
        screen.queryByTestId('publisher-notice-banner')
      ).not.toBeInTheDocument();
    });
  });

  // ---------------------------------------------------------------------------
  // 4. GuestGuard tests
  // ---------------------------------------------------------------------------
  describe('GuestGuard (Guest-only Auth Routes)', () => {
    it('allows unauthenticated visitor to access /login, /register, /forgot-password, /reset-password', () => {
      // 1. /login
      const { unmount: unmount1 } = render(
        <MemoryRouter initialEntries={['/login']}>
          <AppRoutes />
        </MemoryRouter>
      );
      expect(screen.getByTestId('login-page-root')).toBeInTheDocument();
      unmount1();

      // 2. /register
      const { unmount: unmount2 } = render(
        <MemoryRouter initialEntries={['/register']}>
          <AppRoutes />
        </MemoryRouter>
      );
      expect(screen.getByTestId('register-page-root')).toBeInTheDocument();
      unmount2();

      // 3. /forgot-password
      const { unmount: unmount3 } = render(
        <MemoryRouter initialEntries={['/forgot-password']}>
          <AppRoutes />
        </MemoryRouter>
      );
      expect(screen.getByTestId('forgot-password-card')).toBeInTheDocument();
      unmount3();

      // 4. /reset-password
      const { unmount: unmount4 } = render(
        <MemoryRouter initialEntries={['/reset-password']}>
          <AppRoutes />
        </MemoryRouter>
      );
      expect(screen.getByTestId('reset-password-page-root')).toBeInTheDocument();
      unmount4();
    });

    it('redirects authenticated user visiting /login to fallback /courses', () => {
      useAuthStore.getState().setTokens({
        access: 'user_jwt',
        refresh: 'user_refresh',
      });

      render(
        <MemoryRouter initialEntries={['/login']}>
          <LocationTracker />
          <AppRoutes />
        </MemoryRouter>
      );

      expect(screen.getByTestId('current-location')).toHaveTextContent('/courses');
      expect(
        screen.getByTestId('courses-page-placeholder')
      ).toBeInTheDocument();
      expect(screen.queryByTestId('login-page-root')).not.toBeInTheDocument();
    });

    it('redirects authenticated user visiting /register to /courses', () => {
      useAuthStore.getState().setTokens({
        access: 'user_jwt',
        refresh: 'user_refresh',
      });

      render(
        <MemoryRouter initialEntries={['/register']}>
          <LocationTracker />
          <AppRoutes />
        </MemoryRouter>
      );

      expect(screen.getByTestId('current-location')).toHaveTextContent('/courses');
      expect(
        screen.getByTestId('courses-page-placeholder')
      ).toBeInTheDocument();
    });

    it('redirects authenticated user visiting /login with safe returnUrl to that destination', async () => {
      globalThis.fetch = vi.fn().mockImplementation(() =>
        Promise.resolve({
          ok: true,
          status: 200,
          text: () =>
            Promise.resolve(
              JSON.stringify({ count: 0, next: null, previous: null, results: [] })
            ),
          headers: new Headers({ 'content-type': 'application/json' }),
        })
      );

      useAuthStore.getState().setTokens({
        access: 'publisher_jwt',
        refresh: 'publisher_refresh',
      });
      useAuthStore.getState().setIsPublisher(true);

      await act(async () => {
        render(
          <MemoryRouter
            initialEntries={['/login?returnUrl=%2Fpublisher%2Fdashboard']}
          >
            <LocationTracker />
            <AppRoutes />
          </MemoryRouter>
        );
      });

      await waitFor(() => {
        expect(screen.getByTestId('current-location')).toHaveTextContent(
          '/publisher/dashboard'
        );
      });
      expect(
        screen.getByTestId('publisher-page-placeholder')
      ).toBeInTheDocument();
    });

    it('sanitizes malicious open redirect returnUrl and falls back to /courses', () => {
      useAuthStore.getState().setTokens({
        access: 'user_jwt',
        refresh: 'user_refresh',
      });

      render(
        <MemoryRouter
          initialEntries={['/login?returnUrl=https%3A%2F%2Fevil.com%2Fsteal']}
        >
          <LocationTracker />
          <AppRoutes />
        </MemoryRouter>
      );

      expect(screen.getByTestId('current-location')).toHaveTextContent('/courses');
      expect(
        screen.getByTestId('courses-page-placeholder')
      ).toBeInTheDocument();
    });

    it('sanitizes protocol-relative //evil.com returnUrl and falls back to /courses', () => {
      useAuthStore.getState().setTokens({
        access: 'user_jwt',
        refresh: 'user_refresh',
      });

      render(
        <MemoryRouter
          initialEntries={['/login?returnUrl=%2F%2Fevil.com']}
        >
          <LocationTracker />
          <AppRoutes />
        </MemoryRouter>
      );

      expect(screen.getByTestId('current-location')).toHaveTextContent('/courses');
    });

    it('prevents redirect loop if returnUrl is /login and falls back to /courses', () => {
      useAuthStore.getState().setTokens({
        access: 'user_jwt',
        refresh: 'user_refresh',
      });

      render(
        <MemoryRouter
          initialEntries={['/login?returnUrl=%2Flogin']}
        >
          <LocationTracker />
          <AppRoutes />
        </MemoryRouter>
      );

      expect(screen.getByTestId('current-location')).toHaveTextContent('/courses');
    });

    it('prevents redirect loop if returnUrl has trailing slash /login/?returnUrl=... and falls back to /courses', () => {
      useAuthStore.getState().setTokens({
        access: 'user_jwt',
        refresh: 'user_refresh',
      });

      render(
        <MemoryRouter
          initialEntries={['/login?returnUrl=%2Flogin%2F%3FreturnUrl%3D%2Fcourses']}
        >
          <LocationTracker />
          <AppRoutes />
        </MemoryRouter>
      );

      expect(screen.getByTestId('current-location')).toHaveTextContent('/courses');
    });

    it('prevents redirect loop if returnUrl is another guest route (/register/ or /forgot-password) and falls back to /courses', () => {
      useAuthStore.getState().setTokens({
        access: 'user_jwt',
        refresh: 'user_refresh',
      });

      render(
        <MemoryRouter
          initialEntries={['/login?returnUrl=%2Fregister%2F']}
        >
          <LocationTracker />
          <AppRoutes />
        </MemoryRouter>
      );

      expect(screen.getByTestId('current-location')).toHaveTextContent('/courses');
    });
  });

  // ---------------------------------------------------------------------------
  // 5. ThrottledBanner component & dynamic countdown verification
  // ---------------------------------------------------------------------------
  describe('ThrottledBanner (HTTP 429 / 503 Retry-After)', () => {
    it('renders with accessible role="alert", aria-live="polite", and remaining seconds', () => {
      render(
        <ThrottledBanner
          seconds={45}
          detail="Trop de requêtes. Veuillez patienter avant de réessayer."
        />
      );

      const banner = screen.getByTestId('throttled-banner');
      expect(banner).toBeInTheDocument();
      expect(banner).toHaveAttribute('role', 'alert');

      const liveMessage = screen.getByText(
        'Trop de requêtes. Veuillez patienter avant de réessayer.'
      );
      expect(liveMessage).toHaveAttribute('aria-live', 'polite');

      const countdown = screen.getByTestId('countdown-timer');
      expect(countdown).toHaveTextContent('45s restantes');
    });

    it('decrements countdown over time and calls onExpire when reaching 0', async () => {
      vi.useFakeTimers();
      const onExpireMock = vi.fn();

      render(
        <ThrottledBanner
          seconds={3}
          detail="Trop de requêtes."
          onExpire={onExpireMock}
        />
      );

      expect(screen.getByTestId('countdown-timer')).toHaveTextContent('3s restantes');

      // Advance by 1.1s
      act(() => {
        vi.advanceTimersByTime(1100);
      });
      expect(screen.getByTestId('countdown-timer')).toHaveTextContent('2s restantes');

      // Advance by 2.1s to reach 0
      act(() => {
        vi.advanceTimersByTime(2100);
      });

      expect(onExpireMock).toHaveBeenCalledTimes(1);
      // Banner removes itself once expired
      expect(screen.queryByTestId('throttled-banner')).not.toBeInTheDocument();
    });

    it('disables form submit buttons during cooldown', async () => {
      function TestFormWithThrottledBanner({ cooldown }: { cooldown: number | null }) {
        const [remaining, setRemaining] = React.useState<number | null>(cooldown);
        React.useEffect(() => {
          setRemaining(cooldown);
        }, [cooldown]);

        const isBlocked = remaining !== null && remaining > 0;

        return (
          <form>
            {remaining !== null && remaining > 0 && (
              <ThrottledBanner
                seconds={remaining}
                onExpire={() => setRemaining(null)}
              />
            )}
            <button
              type="submit"
              disabled={isBlocked}
              data-testid="test-submit-button"
            >
              Envoyer
            </button>
          </form>
        );
      }

      const { rerender } = render(<TestFormWithThrottledBanner cooldown={30} />);
      const btn = screen.getByTestId('test-submit-button');
      expect(btn).toBeDisabled();

      // Simulating expiration
      rerender(<TestFormWithThrottledBanner cooldown={null} />);
      expect(btn).not.toBeDisabled();
    });
  });

  // ---------------------------------------------------------------------------
  // 6. Responsive floor 360px & Dark-Only substrate compliance
  // ---------------------------------------------------------------------------
  describe('Visual Substrate & Responsive Floor (360px)', () => {
    it('guarded views enforce min-w-[360px] floor and overflow-x containment', () => {
      const { container: coursesContainer } = render(
        <CoursesPagePlaceholder />
      );
      const coursesRoot = coursesContainer.firstChild as HTMLElement;
      expect(coursesRoot.className).toContain('min-w-[360px]');
      expect(coursesRoot.className).toContain('bg-background');
      expect(coursesRoot.className).toContain('text-foreground');

      const { container: publisherContainer } = render(
        <PublisherPagePlaceholder />
      );
      const publisherRoot = publisherContainer.firstChild as HTMLElement;
      expect(publisherRoot.className).toContain('min-w-[360px]');
      expect(publisherRoot.className).toContain('bg-background');
      expect(publisherRoot.className).toContain('text-foreground');
    });

    it('informative publisher banner uses semantic info palette (#13233A surface, #1F4273 border, #58A6FF text)', () => {
      // Simulate landing page rendered with location.state.notice
      render(
        <MemoryRouter
          initialEntries={[
            {
              pathname: '/',
              state: { notice: PUBLISHER_NOTICE },
            },
          ]}
        >
          <AppRoutes />
        </MemoryRouter>
      );

      const banner = screen.getByTestId('publisher-notice-banner');
      expect(banner.className).toContain('bg-info-surface');
      expect(banner.className).toContain('border-info-border');
      expect(banner.className).toContain('text-info');
    });
  });
});
