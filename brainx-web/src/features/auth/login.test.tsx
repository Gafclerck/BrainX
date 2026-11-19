import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { MemoryRouter, Routes, Route, useLocation } from 'react-router-dom';
import { LoginPage, sanitizeReturnUrl } from './login-page';
import { useAuthStore } from './auth-store';
import { LandingPage } from '@/features/landing/landing-page';
import { apiClient, ApiError } from '@/lib/api';

function LocationTracker() {
  const location = useLocation();
  return (
    <div data-testid="current-location">
      {location.pathname}
      {location.search}
    </div>
  );
}

describe('Story FE-1.5: Connexion par Identifiants & Sonde Silencieuse (Login & Silent Probe)', () => {
  const originalFetch = globalThis.fetch;
  const originalLocation = window.location;

  beforeEach(() => {
    vi.restoreAllMocks();
    useAuthStore.getState().clearAuth();
    window.localStorage?.clear();
  });

  afterEach(() => {
    globalThis.fetch = originalFetch;
  });

  it('sanitizeReturnUrl discards malicious external and protocol-relative URLs and allows valid relative paths', () => {
    expect(sanitizeReturnUrl(null)).toBe('/courses');
    expect(sanitizeReturnUrl('')).toBe('/courses');
    expect(sanitizeReturnUrl('   ')).toBe('/courses');
    expect(sanitizeReturnUrl('/publisher/dashboard')).toBe('/publisher/dashboard');
    expect(sanitizeReturnUrl('/courses/123')).toBe('/courses/123');
    expect(sanitizeReturnUrl('https://evil.com')).toBe('/courses');
    expect(sanitizeReturnUrl('http://evil.com')).toBe('/courses');
    expect(sanitizeReturnUrl('//evil.com')).toBe('/courses');
    expect(sanitizeReturnUrl('/\\evil.com')).toBe('/courses');
    expect(sanitizeReturnUrl('javascript:alert(1)')).toBe('/courses');
  });

  it('sanitizeReturnUrl guards against redirect loop for /login targets', () => {
    expect(sanitizeReturnUrl('/login')).toBe('/courses');
    expect(sanitizeReturnUrl('/login/')).toBe('/courses');
    expect(sanitizeReturnUrl('/login?returnUrl=/courses')).toBe('/courses');
    expect(sanitizeReturnUrl('/login?foo=bar')).toBe('/courses');
  });

  it('Login: Student Success -> acquires tokens, fetches profile, probe sets isPublisher=false, redirects to /courses', async () => {
    const user = userEvent.setup();

    const mockFetch = vi.fn().mockImplementation(async (url: string) => {
      const urlStr = String(url);
      if (urlStr.includes('/api/v1/login/')) {
        return {
          ok: true,
          status: 200,
          headers: new Headers({ 'Content-Type': 'application/json' }),
          text: async () =>
            JSON.stringify({
              access: 'student_access_jwt',
              refresh: 'student_refresh_jwt',
            }),
        };
      }
      if (urlStr.includes('/api/v1/me/')) {
        return {
          ok: true,
          status: 200,
          headers: new Headers({ 'Content-Type': 'application/json' }),
          text: async () =>
            JSON.stringify({
              id: 'student-uuid-1',
              email: 'student@example.com',
              is_email_verified: true,
            }),
        };
      }
      if (urlStr.includes('/api/v1/courses/')) {
        // Probe returns 403 for student
        return {
          ok: false,
          status: 403,
          headers: new Headers({ 'Content-Type': 'application/json' }),
          text: async () =>
            JSON.stringify({
              type: 'about:blank',
              title: 'Permission denied',
              status: 403,
              detail: 'You do not have permission to perform this action.',
              errors: {},
            }),
        };
      }
      return {
        ok: false,
        status: 404,
        headers: new Headers(),
        text: async () => '',
      };
    });
    globalThis.fetch = mockFetch;

    render(
      <MemoryRouter initialEntries={['/login']}>
        <Routes>
          <Route path="/login" element={<LoginPage />} />
          <Route
            path="/courses"
            element={
              <div>
                <LocationTracker />
                <div data-testid="courses-view">Catalogue des Cours</div>
              </div>
            }
          />
        </Routes>
      </MemoryRouter>
    );

    const emailInput = screen.getByTestId('login-email-input');
    const passwordInput = screen.getByTestId('login-password-input');
    const submitButton = screen.getByTestId('login-submit-button');

    // Type with mixed case and whitespace to test normalization
    await user.type(emailInput, '   Student@Example.COM   ');
    await user.type(passwordInput, 'secret-student-pass');
    await user.click(submitButton);

    await waitFor(() => {
      expect(screen.getByTestId('courses-view')).toBeInTheDocument();
    });

    // Check login request sent normalized email
    const loginCall = mockFetch.mock.calls.find((c) => String(c[0]).includes('/api/v1/login/'));
    expect(loginCall).toBeDefined();
    expect(JSON.parse(loginCall![1].body)).toEqual({
      email: 'student@example.com',
      password: 'secret-student-pass',
    });

    // Verify token injection in store
    const store = useAuthStore.getState();
    expect(store.accessToken).toBe('student_access_jwt');
    expect(store.refreshToken).toBe('student_refresh_jwt');
    expect(store.isPublisher).toBe(false);
    expect(store.user?.email).toBe('student@example.com');
  });

  it('Login: Publisher Success -> probe returns 200, sets isPublisher=true, shows Espace Éditeur in nav', async () => {
    const user = userEvent.setup();

    const mockFetch = vi.fn().mockImplementation(async (url: string) => {
      const urlStr = String(url);
      if (urlStr.includes('/api/v1/login/')) {
        return {
          ok: true,
          status: 200,
          headers: new Headers({ 'Content-Type': 'application/json' }),
          text: async () =>
            JSON.stringify({
              access: 'publisher_access_jwt',
              refresh: 'publisher_refresh_jwt',
            }),
        };
      }
      if (urlStr.includes('/api/v1/me/')) {
        return {
          ok: true,
          status: 200,
          headers: new Headers({ 'Content-Type': 'application/json' }),
          text: async () =>
            JSON.stringify({
              id: 'publisher-uuid-1',
              email: 'publisher@example.com',
              is_email_verified: true,
            }),
        };
      }
      if (urlStr.includes('/api/v1/courses/')) {
        // Probe returns 200 for publisher
        return {
          ok: true,
          status: 200,
          headers: new Headers({ 'Content-Type': 'application/json' }),
          text: async () =>
            JSON.stringify({
              count: 1,
              results: [{ id: 'course-1', title: 'Intro Python' }],
            }),
        };
      }
      return {
        ok: false,
        status: 404,
        headers: new Headers(),
        text: async () => '',
      };
    });
    globalThis.fetch = mockFetch;

    render(
      <MemoryRouter initialEntries={['/login']}>
        <Routes>
          <Route path="/login" element={<LoginPage />} />
          <Route
            path="/courses"
            element={
              <div>
                <LandingPage />
                <div data-testid="courses-view">Catalogue des Cours</div>
              </div>
            }
          />
        </Routes>
      </MemoryRouter>
    );

    await user.type(screen.getByTestId('login-email-input'), 'publisher@example.com');
    await user.type(screen.getByTestId('login-password-input'), 'publisher-pass');
    await user.click(screen.getByTestId('login-submit-button'));

    await waitFor(() => {
      expect(screen.getByTestId('courses-view')).toBeInTheDocument();
    });

    const store = useAuthStore.getState();
    expect(store.accessToken).toBe('publisher_access_jwt');
    expect(store.isPublisher).toBe(true);

    // Espace Éditeur button should now be visible in navigation
    const publisherLink = screen.getByTestId('nav-publisher-link');
    expect(publisherLink).toBeInTheDocument();
    expect(publisherLink).toHaveTextContent(/espace éditeur/i);
  });

  it('Login: ReturnUrl Redirect -> redirects to valid returnUrl', async () => {
    const user = userEvent.setup();

    const mockFetch = vi.fn().mockImplementation(async (url: string) => {
      const urlStr = String(url);
      if (urlStr.includes('/api/v1/login/')) {
        return {
          ok: true,
          status: 200,
          headers: new Headers({ 'Content-Type': 'application/json' }),
          text: async () =>
            JSON.stringify({ access: 'acc_1', refresh: 'ref_1' }),
        };
      }
      return {
        ok: true,
        status: 200,
        headers: new Headers({ 'Content-Type': 'application/json' }),
        text: async () => JSON.stringify({}),
      };
    });
    globalThis.fetch = mockFetch;

    render(
      <MemoryRouter initialEntries={['/login?returnUrl=/publisher/dashboard']}>
        <Routes>
          <Route path="/login" element={<LoginPage />} />
          <Route
            path="/publisher/dashboard"
            element={
              <div>
                <LocationTracker />
                <div data-testid="publisher-dashboard">Dashboard</div>
              </div>
            }
          />
        </Routes>
      </MemoryRouter>
    );

    await user.type(screen.getByTestId('login-email-input'), 'user@example.com');
    await user.type(screen.getByTestId('login-password-input'), 'pass');
    await user.click(screen.getByTestId('login-submit-button'));

    await waitFor(() => {
      expect(screen.getByTestId('publisher-dashboard')).toBeInTheDocument();
    });
  });

  it('Login: Malicious ReturnUrl -> sanitizes and falls back to /courses', async () => {
    const user = userEvent.setup();

    const mockFetch = vi.fn().mockImplementation(async (url: string) => {
      const urlStr = String(url);
      if (urlStr.includes('/api/v1/login/')) {
        return {
          ok: true,
          status: 200,
          headers: new Headers({ 'Content-Type': 'application/json' }),
          text: async () =>
            JSON.stringify({ access: 'acc_1', refresh: 'ref_1' }),
        };
      }
      return {
        ok: true,
        status: 200,
        headers: new Headers({ 'Content-Type': 'application/json' }),
        text: async () => JSON.stringify({}),
      };
    });
    globalThis.fetch = mockFetch;

    render(
      <MemoryRouter initialEntries={['/login?returnUrl=https://evil.com/phishing']}>
        <Routes>
          <Route path="/login" element={<LoginPage />} />
          <Route
            path="/courses"
            element={<div data-testid="courses-view">Catalogue des Cours</div>}
          />
        </Routes>
      </MemoryRouter>
    );

    await user.type(screen.getByTestId('login-email-input'), 'user@example.com');
    await user.type(screen.getByTestId('login-password-input'), 'pass');
    await user.click(screen.getByTestId('login-submit-button'));

    await waitFor(() => {
      expect(screen.getByTestId('courses-view')).toBeInTheDocument();
    });
  });

  it('Login: Invalid Credentials -> 401 shows error alert, preserves email, form remains editable', async () => {
    const user = userEvent.setup();

    const mockFetch = vi.fn().mockResolvedValue({
      ok: false,
      status: 401,
      headers: new Headers({ 'Content-Type': 'application/json' }),
      text: async () =>
        JSON.stringify({
          type: 'about:blank',
          title: 'Unauthenticated',
          status: 401,
          detail: 'No active account found with the given credentials',
          errors: {},
        }),
    });
    globalThis.fetch = mockFetch;

    render(
      <MemoryRouter initialEntries={['/login']}>
        <LoginPage />
      </MemoryRouter>
    );

    const emailInput = screen.getByTestId('login-email-input');
    const passwordInput = screen.getByTestId('login-password-input');
    const submitBtn = screen.getByTestId('login-submit-button');

    await user.type(emailInput, 'student@example.com');
    await user.type(passwordInput, 'wrong-password');
    await user.click(submitBtn);

    const errorAlert = await screen.findByTestId('login-non-field-errors');
    expect(errorAlert).toBeInTheDocument();
    expect(errorAlert).toHaveTextContent(/email ou mot de passe incorrect/i);

    // Form inputs remain accessible and email is preserved
    expect(emailInput).toHaveValue('student@example.com');
    expect(submitBtn).not.toBeDisabled();
  });

  it('Login: unverified account (403 on /me/) displays verification pending notification', async () => {
    const user = userEvent.setup();

    const mockFetch = vi.fn().mockImplementation(async (url: string) => {
      const urlStr = String(url);
      if (urlStr.includes('/api/v1/login/')) {
        return {
          ok: true,
          status: 200,
          headers: new Headers({ 'Content-Type': 'application/json' }),
          text: async () => JSON.stringify({ access: 'unverified_jwt', refresh: 'ref' }),
        };
      }
      if (urlStr.includes('/api/v1/me/')) {
        return {
          ok: false,
          status: 403,
          headers: new Headers({ 'Content-Type': 'application/json' }),
          text: async () =>
            JSON.stringify({
              type: 'about:blank',
              title: 'Permission denied',
              status: 403,
              detail: 'Email is not verified.',
              errors: {},
            }),
        };
      }
      return { ok: false, status: 404, headers: new Headers(), text: async () => '' };
    });
    globalThis.fetch = mockFetch;

    render(
      <MemoryRouter initialEntries={['/login']}>
        <LoginPage />
      </MemoryRouter>
    );

    await user.type(screen.getByTestId('login-email-input'), 'unverified@example.com');
    await user.type(screen.getByTestId('login-password-input'), 'secret');
    await user.click(screen.getByTestId('login-submit-button'));

    const errorAlert = await screen.findByTestId('login-non-field-errors');
    expect(errorAlert).toHaveTextContent(/votre adresse email n’est pas encore vérifiée/i);
  });

  it('Login: Client Validation -> blank email or password displays validation errors without calling API', async () => {
    const user = userEvent.setup();
    const mockFetch = vi.fn();
    globalThis.fetch = mockFetch;

    render(
      <MemoryRouter initialEntries={['/login']}>
        <LoginPage />
      </MemoryRouter>
    );

    await user.click(screen.getByTestId('login-submit-button'));

    expect(await screen.findByTestId('login-email-error')).toHaveTextContent(
      /adresse email est requise/i
    );
    expect(await screen.findByTestId('login-password-error')).toHaveTextContent(
      /mot de passe est requis/i
    );
    expect(mockFetch).not.toHaveBeenCalled();
  });

  it('Login: Throttled 429 -> displays ThrottledBanner with countdown and disables submit button', async () => {
    const user = userEvent.setup();

    const mockFetch = vi.fn().mockResolvedValue({
      ok: false,
      status: 429,
      headers: new Headers({
        'Content-Type': 'application/json',
        'Retry-After': '60',
      }),
      text: async () =>
        JSON.stringify({
          type: 'about:blank',
          title: 'Too many requests',
          status: 429,
          detail: 'Trop de requêtes. Veuillez patienter.',
          errors: {},
        }),
    });
    globalThis.fetch = mockFetch;

    render(
      <MemoryRouter initialEntries={['/login']}>
        <LoginPage />
      </MemoryRouter>
    );

    await user.type(screen.getByTestId('login-email-input'), 'student@example.com');
    await user.type(screen.getByTestId('login-password-input'), 'pass');
    await user.click(screen.getByTestId('login-submit-button'));

    const banner = await screen.findByTestId('throttled-banner');
    expect(banner).toBeInTheDocument();
    expect(banner).toHaveTextContent(/trop de requêtes/i);

    // Submit button is disabled while throttled
    expect(screen.getByTestId('login-submit-button')).toBeDisabled();
  });

  it('Login: Network or 500 error displays retryable alert without clearing entered email', async () => {
    const user = userEvent.setup();

    const mockFetch = vi.fn().mockRejectedValue(new Error('Network error'));
    globalThis.fetch = mockFetch;

    render(
      <MemoryRouter initialEntries={['/login']}>
        <LoginPage />
      </MemoryRouter>
    );

    const emailInput = screen.getByTestId('login-email-input');
    await user.type(emailInput, 'student@example.com');
    await user.type(screen.getByTestId('login-password-input'), 'pass');
    await user.click(screen.getByTestId('login-submit-button'));

    const errorAlert = await screen.findByTestId('login-non-field-errors');
    expect(errorAlert).toBeInTheDocument();
    expect(errorAlert).toHaveTextContent(/erreur inattendue/i);
    expect(emailInput).toHaveValue('student@example.com');
  });

  it('apiClient injects Authorization: Bearer <accessToken> header when user is authenticated', async () => {
    useAuthStore.getState().setTokens({ access: 'my_access_token_123', refresh: 'ref' });

    const mockFetch = vi.fn().mockResolvedValue({
      ok: true,
      status: 200,
      headers: new Headers({ 'Content-Type': 'application/json' }),
      text: async () => JSON.stringify({ ok: true }),
    });
    globalThis.fetch = mockFetch;

    await apiClient('/api/v1/me/');

    expect(mockFetch).toHaveBeenCalledTimes(1);
    const [, options] = mockFetch.mock.calls[0];
    expect(options.headers).toMatchObject({
      Authorization: 'Bearer my_access_token_123',
    });
  });

  it('LandingPage navigation: shows Cours and Se déconnecter when authenticated, and logout resets auth session', async () => {
    useAuthStore.getState().setTokens({ access: 'valid_access_token', refresh: 'valid_refresh' });
    useAuthStore.getState().setIsPublisher(true);

    const user = userEvent.setup();

    render(
      <MemoryRouter initialEntries={['/']}>
        <LandingPage />
      </MemoryRouter>
    );

    expect(screen.getByTestId('nav-courses-link')).toHaveTextContent(/cours/i);
    expect(screen.getByTestId('nav-publisher-link')).toHaveTextContent(/espace éditeur/i);
    const logoutBtn = screen.getByTestId('nav-logout-btn');
    expect(logoutBtn).toHaveTextContent(/se déconnecter/i);

    await user.click(logoutBtn);

    expect(useAuthStore.getState().accessToken).toBeNull();
    expect(useAuthStore.getState().isPublisher).toBe(false);

    expect(screen.getByTestId('nav-login-link')).toHaveTextContent(/se connecter/i);
  });

  it('LandingPage navigation: shows Se connecter and S\'inscrire when unauthenticated, and nav-login-link links to /login', () => {
    useAuthStore.getState().clearAuth();

    render(
      <MemoryRouter initialEntries={['/']}>
        <LandingPage />
      </MemoryRouter>
    );

    const loginLink = screen.getByTestId('nav-login-link');
    expect(loginLink).toBeInTheDocument();
    expect(loginLink).toHaveAttribute('href', '/login');
    expect(loginLink).toHaveTextContent(/se connecter/i);

    const registerLink = screen.getByTestId('nav-register-link');
    expect(registerLink).toBeInTheDocument();
    expect(registerLink).toHaveAttribute('href', '/register');
  });

  it('apiClient 401 Interceptor: clears store session and triggers redirect for expired token on authenticated calls', async () => {
    // Populate store with existing token
    useAuthStore.getState().setTokens({ access: 'expired_jwt', refresh: 'ref' });
    useAuthStore.getState().setIsPublisher(true);

    const assignMock = vi.fn();
    // In JSDOM, window.location.assign can be mocked
    Object.defineProperty(window, 'location', {
      writable: true,
      value: {
        pathname: '/courses',
        search: '?page=2',
        hash: '',
        assign: assignMock,
        href: 'http://localhost/courses?page=2',
      },
    });

    globalThis.fetch = vi.fn().mockResolvedValue({
      ok: false,
      status: 401,
      headers: new Headers({ 'Content-Type': 'application/json' }),
      text: async () =>
        JSON.stringify({
          type: 'about:blank',
          title: 'Unauthenticated',
          status: 401,
          detail: 'Given token not valid for any token type',
          errors: {},
        }),
    });

    await expect(apiClient('/api/v1/me/')).rejects.toThrow(ApiError);

    // Verify session was cleared
    expect(useAuthStore.getState().accessToken).toBeNull();
    expect(useAuthStore.getState().isPublisher).toBe(false);

    // Verify redirect to /login with returnUrl
    expect(assignMock).toHaveBeenCalledWith(
      '/login?returnUrl=' + encodeURIComponent('/courses?page=2')
    );

    // Restore original window.location
    Object.defineProperty(window, 'location', {
      writable: true,
      value: originalLocation,
    });
  });

  it('apiClient 401 Interceptor: does NOT trigger redirect loop when login endpoint itself fails with 401', async () => {
    const assignMock = vi.fn();
    Object.defineProperty(window, 'location', {
      writable: true,
      value: {
        pathname: '/login',
        search: '',
        hash: '',
        assign: assignMock,
        href: 'http://localhost/login',
      },
    });

    globalThis.fetch = vi.fn().mockResolvedValue({
      ok: false,
      status: 401,
      headers: new Headers({ 'Content-Type': 'application/json' }),
      text: async () =>
        JSON.stringify({
          type: 'about:blank',
          title: 'Unauthenticated',
          status: 401,
          detail: 'No active account found with the given credentials',
          errors: {},
        }),
    });

    await expect(
      apiClient('/api/v1/login/', { method: 'POST', data: { email: 'x', password: 'y' } })
    ).rejects.toThrow(ApiError);

    // Redirect must NOT be called for login endpoint
    expect(assignMock).not.toHaveBeenCalled();

    Object.defineProperty(window, 'location', {
      writable: true,
      value: originalLocation,
    });
  });

  it('Layout Floor 360px & accessible touch targets >= 44px', () => {
    render(
      <MemoryRouter initialEntries={['/login']}>
        <LoginPage />
      </MemoryRouter>
    );

    const root = screen.getByTestId('login-page-root');
    expect(root).toHaveClass('min-w-[360px]');
    expect(root).toHaveClass('overflow-x-hidden');

    const submitBtn = screen.getByTestId('login-submit-button');
    expect(submitBtn).toHaveClass('min-h-[44px]');
  });
});
