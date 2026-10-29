import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { render, screen, waitFor, act } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { MemoryRouter, Routes, Route, useLocation } from 'react-router-dom';
import { VerifyEmailPage } from './verify-email-page';
import { useAuthStore } from './auth-store';
import { AppRoutes } from '@/routes';

function LocationTracker() {
  const location = useLocation();
  return <div data-testid="current-location">{location.pathname}{location.search}{location.hash}</div>;
}

describe('Story FE-1.3: Activation de Compte par Fragment Hash sans fuite Referer', () => {
  const originalFetch = globalThis.fetch;

  beforeEach(() => {
    vi.restoreAllMocks();
    useAuthStore.getState().clearAuth();
    window.localStorage?.clear();
  });

  afterEach(() => {
    globalThis.fetch = originalFetch;
    window.location.hash = '';
  });

  it('AC-1 & AC-2: extracts token strictly from window.location.hash and immediately purges fragment and query string via replaceState', async () => {
    // Arrange URL with hash fragment and query parameters
    window.history.replaceState(null, '', '/verify-email?source=email#token=secret_activation_token_123');
    expect(window.location.hash).toBe('#token=secret_activation_token_123');

    const replaceStateSpy = vi.spyOn(window.history, 'replaceState');

    const mockFetch = vi.fn().mockResolvedValue({
      ok: true,
      status: 200,
      headers: new Headers({ 'Content-Type': 'application/json' }),
      text: async () => JSON.stringify({ access: 'access_jwt_1', refresh: 'refresh_jwt_1' }),
    });
    globalThis.fetch = mockFetch;

    render(
      <MemoryRouter initialEntries={['/verify-email?source=email']}>
        <Routes>
          <Route path="/verify-email" element={<VerifyEmailPage />} />
          <Route path="/courses" element={<div data-testid="courses-view">Courses Page</div>} />
        </Routes>
      </MemoryRouter>
    );

    // AC-2: replaceState called immediately to strip hash and query parameters to pathname only
    expect(replaceStateSpy).toHaveBeenCalledWith(null, '', '/verify-email');
    expect(window.location.hash).toBe('');

    // AC-3: verify endpoint called with token payload
    await waitFor(() => {
      expect(mockFetch).toHaveBeenCalledTimes(1);
    });

    const [calledUrl, calledInit] = mockFetch.mock.calls[0];
    expect(calledUrl).toBe('/api/v1/verify-email/');
    expect(calledInit.method).toBe('POST');
    expect(JSON.parse(calledInit.body)).toEqual({
      token: 'secret_activation_token_123',
    });
  });

  it('Never accepts verification token from query parameters (?token=...)', async () => {
    // URL with query parameter instead of hash
    window.history.replaceState(null, '', '/verify-email?token=leaked_query_token');
    window.location.hash = '';

    const mockFetch = vi.fn();
    globalThis.fetch = mockFetch;

    render(
      <MemoryRouter initialEntries={['/verify-email?token=leaked_query_token']}>
        <VerifyEmailPage />
      </MemoryRouter>
    );

    // No API call should be made
    expect(mockFetch).not.toHaveBeenCalled();

    // Renders missing token warning
    const missingAlert = await screen.findByTestId('verify-missing-token');
    expect(missingAlert).toBeInTheDocument();
    expect(screen.getByText(/Le lien d'activation utilisé ne contient pas de jeton valide/i)).toBeInTheDocument();
  });

  it('Edge case: handles missing or empty hash fragment with inline warning and registration/login actions', async () => {
    window.history.replaceState(null, '', '/verify-email');
    window.location.hash = '';

    const mockFetch = vi.fn();
    globalThis.fetch = mockFetch;

    render(
      <MemoryRouter initialEntries={['/verify-email']}>
        <VerifyEmailPage />
      </MemoryRouter>
    );

    expect(mockFetch).not.toHaveBeenCalled();

    const missingAlert = await screen.findByTestId('verify-missing-token');
    expect(missingAlert).toBeInTheDocument();
    expect(screen.getByRole('link', { name: /s'inscrire/i })).toHaveAttribute('href', '/register');
    expect(screen.getByRole('link', { name: /se connecter/i })).toHaveAttribute('href', '/login');
  });

  it('AC-4: saves JWT pair to useAuthStore and navigates to /courses on 200 OK', async () => {
    window.history.replaceState(null, '', '/verify-email#token=valid_token_xyz');

    globalThis.fetch = vi.fn().mockResolvedValue({
      ok: true,
      status: 200,
      headers: new Headers({ 'Content-Type': 'application/json' }),
      text: async () => JSON.stringify({
        access: 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.access',
        refresh: 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.refresh',
      }),
    });

    render(
      <MemoryRouter initialEntries={['/verify-email']}>
        <LocationTracker />
        <Routes>
          <Route path="/verify-email" element={<VerifyEmailPage />} />
          <Route path="/courses" element={<div data-testid="courses-page-placeholder">Mes Cours</div>} />
        </Routes>
      </MemoryRouter>
    );

    // Redirects to /courses
    await waitFor(() => {
      expect(screen.getByTestId('courses-page-placeholder')).toBeInTheDocument();
    });

    expect(screen.getByTestId('current-location').textContent).toBe('/courses');

    // Tokens saved in auth store
    const authState = useAuthStore.getState();
    expect(authState.accessToken).toBe('eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.access');
    expect(authState.refreshToken).toBe('eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.refresh');
  });

  it('Guards against malformed server response lacking access/refresh tokens', async () => {
    window.history.replaceState(null, '', '/verify-email#token=malformed_response_token');

    globalThis.fetch = vi.fn().mockResolvedValue({
      ok: true,
      status: 200,
      headers: new Headers({ 'Content-Type': 'application/json' }),
      text: async () => JSON.stringify({
        access: '',
        refresh: null,
      }),
    });

    render(
      <MemoryRouter initialEntries={['/verify-email']}>
        <VerifyEmailPage />
      </MemoryRouter>
    );

    const errorCard = await screen.findByTestId('verify-error-card');
    expect(errorCard).toBeInTheDocument();
    expect(screen.getByText('Les identifiants reçus sont invalides ou incomplets.')).toBeInTheDocument();
    expect(useAuthStore.getState().accessToken).toBeNull();
  });

  it('AC-5: renders error card proposing to register when 400 Bad Request with array errors.token is returned', async () => {
    window.history.replaceState(null, '', '/verify-email#token=expired_token_abc');

    globalThis.fetch = vi.fn().mockResolvedValue({
      ok: false,
      status: 400,
      headers: new Headers({ 'Content-Type': 'application/problem+json' }),
      text: async () => JSON.stringify({
        type: 'https://brainx.local/errors/invalid-token',
        title: 'Bad Request',
        status: 400,
        detail: 'The token is not valid.',
        errors: {
          token: ['The token is not valid.'],
        },
      }),
    });

    render(
      <MemoryRouter initialEntries={['/verify-email']}>
        <Routes>
          <Route path="/verify-email" element={<VerifyEmailPage />} />
          <Route path="/courses" element={<div data-testid="courses-view">Courses Page</div>} />
        </Routes>
      </MemoryRouter>
    );

    const errorCard = await screen.findByTestId('verify-error-card');
    expect(errorCard).toBeInTheDocument();
    expect(screen.getByText('The token is not valid.')).toBeInTheDocument();

    // Verify action buttons
    const newLinkButton = screen.getByRole('link', { name: /demander un nouveau lien/i });
    expect(newLinkButton).toBeInTheDocument();
    expect(newLinkButton).toHaveAttribute('href', '/register');

    const homeButton = screen.getByRole('link', { name: /^retour à l'accueil$/i });
    expect(homeButton).toBeInTheDocument();
    expect(homeButton).toHaveAttribute('href', '/');

    // Verify no tokens were saved and user was NOT redirected to /courses
    expect(screen.queryByTestId('courses-view')).not.toBeInTheDocument();
    expect(useAuthStore.getState().accessToken).toBeNull();
  });

  it('AC-5: safely handles string formatting for errors.token', async () => {
    window.history.replaceState(null, '', '/verify-email#token=string_err_token');

    globalThis.fetch = vi.fn().mockResolvedValue({
      ok: false,
      status: 400,
      headers: new Headers({ 'Content-Type': 'application/problem+json' }),
      text: async () => JSON.stringify({
        type: 'https://brainx.local/errors/invalid-token',
        title: 'Bad Request',
        status: 400,
        errors: {
          token: 'Jeton expiré ou déjà utilisé.',
        },
      }),
    });

    render(
      <MemoryRouter initialEntries={['/verify-email']}>
        <VerifyEmailPage />
      </MemoryRouter>
    );

    const errorCard = await screen.findByTestId('verify-error-card');
    expect(errorCard).toBeInTheDocument();
    expect(screen.getByText('Jeton expiré ou déjà utilisé.')).toBeInTheDocument();
  });

  it('Edge case: handles 429 Too Many Requests with Retry-After header and active countdown banner', async () => {
    window.history.replaceState(null, '', '/verify-email#token=throttled_token');

    globalThis.fetch = vi.fn().mockResolvedValue({
      ok: false,
      status: 429,
      headers: new Headers({
        'Content-Type': 'application/problem+json',
        'Retry-After': '30',
      }),
      text: async () => JSON.stringify({
        type: 'https://brainx.local/errors/rate-limit',
        title: 'Too Many Requests',
        status: 429,
        detail: 'Too many requests for this destination address or source.',
        errors: {},
      }),
    });

    render(
      <MemoryRouter initialEntries={['/verify-email']}>
        <VerifyEmailPage />
      </MemoryRouter>
    );

    const throttledBanner = await screen.findByTestId('throttled-banner');
    expect(throttledBanner).toBeInTheDocument();
    expect(screen.getByText('Too many requests for this destination address or source.')).toBeInTheDocument();

    const retryButton = screen.getByTestId('retry-button');
    expect(retryButton).toBeDisabled();
  });

  it('Edge case: handles 5xx Server Error without Retry-After and provides retry action', async () => {
    const user = userEvent.setup();
    window.history.replaceState(null, '', '/verify-email#token=server_500_token');

    let callCount = 0;
    globalThis.fetch = vi.fn().mockImplementation(async () => {
      callCount++;
      if (callCount === 1) {
        return {
          ok: false,
          status: 500,
          headers: new Headers({ 'Content-Type': 'application/problem+json' }),
          text: async () => JSON.stringify({
            type: 'https://brainx.local/errors/internal-server-error',
            title: 'Internal Server Error',
            status: 500,
            detail: 'Database connection failed.',
            errors: {},
          }),
        };
      }
      return {
        ok: true,
        status: 200,
        headers: new Headers({ 'Content-Type': 'application/json' }),
        text: async () => JSON.stringify({
          access: 'recovered_access_token',
          refresh: 'recovered_refresh_token',
        }),
      };
    });

    render(
      <MemoryRouter initialEntries={['/verify-email']}>
        <Routes>
          <Route path="/verify-email" element={<VerifyEmailPage />} />
          <Route path="/courses" element={<div data-testid="courses-view">Courses View</div>} />
        </Routes>
      </MemoryRouter>
    );

    const errorAlert = await screen.findByTestId('verify-network-error');
    expect(errorAlert).toBeInTheDocument();
    expect(screen.getByText('Database connection failed.')).toBeInTheDocument();

    const retryBtn = screen.getByTestId('retry-button');
    expect(retryBtn).not.toBeDisabled();

    await user.click(retryBtn);

    await waitFor(() => {
      expect(screen.getByTestId('courses-view')).toBeInTheDocument();
    });

    expect(useAuthStore.getState().accessToken).toBe('recovered_access_token');
  });

  it('Edge case: handles Network Connection Failure with retry button that re-executes verification', async () => {
    const user = userEvent.setup();
    window.history.replaceState(null, '', '/verify-email#token=network_test_token');

    let callCount = 0;
    globalThis.fetch = vi.fn().mockImplementation(async () => {
      callCount++;
      if (callCount === 1) {
        throw new TypeError('Failed to fetch');
      }
      return {
        ok: true,
        status: 200,
        headers: new Headers({ 'Content-Type': 'application/json' }),
        text: async () => JSON.stringify({
          access: 'retry_access_token',
          refresh: 'retry_refresh_token',
        }),
      };
    });

    render(
      <MemoryRouter initialEntries={['/verify-email']}>
        <Routes>
          <Route path="/verify-email" element={<VerifyEmailPage />} />
          <Route path="/courses" element={<div data-testid="courses-view">Courses View</div>} />
        </Routes>
      </MemoryRouter>
    );

    // Initial attempt fails with network error
    const networkErrorAlert = await screen.findByTestId('verify-network-error');
    expect(networkErrorAlert).toBeInTheDocument();
    expect(screen.getByText(/Une erreur réseau est survenue lors de la vérification/i)).toBeInTheDocument();

    const retryBtn = screen.getByTestId('retry-button');
    expect(retryBtn).not.toBeDisabled();

    // Click retry button
    await user.click(retryBtn);

    // Should succeed on second attempt and navigate to /courses
    await waitFor(() => {
      expect(screen.getByTestId('courses-view')).toBeInTheDocument();
    });

    expect(useAuthStore.getState().accessToken).toBe('retry_access_token');
  });

  it('Verifies loading card has accessible role="status" and aria-live="polite"', async () => {
    window.history.replaceState(null, '', '/verify-email#token=pending_token');

    // Never resolves during this check to keep in loading state
    globalThis.fetch = vi.fn().mockReturnValue(new Promise(() => {}));

    render(
      <MemoryRouter initialEntries={['/verify-email']}>
        <VerifyEmailPage />
      </MemoryRouter>
    );

    const loadingCard = screen.getByTestId('verify-loading');
    expect(loadingCard).toHaveAttribute('role', 'status');
    expect(loadingCard).toHaveAttribute('aria-live', 'polite');
  });

  it('Mobile floor and dark layout: enforces 360px minimum width and overflow-x containment', () => {
    window.history.replaceState(null, '', '/verify-email');
    window.location.hash = '';

    render(
      <MemoryRouter initialEntries={['/verify-email']}>
        <VerifyEmailPage />
      </MemoryRouter>
    );

    const root = screen.getByTestId('verify-email-page-root');
    expect(root.className).toContain('min-w-[360px]');
    expect(root.className).toContain('overflow-x-hidden');
    expect(root.className).toContain('bg-background');
    expect(root.className).toContain('text-foreground');
  });

  describe('useAuthStore', () => {
    it('manages tokens and logout correctly with localStorage sync under brainx_auth_tokens and omits isPublisher', () => {
      const store = useAuthStore.getState();
      expect(store.accessToken).toBeNull();
      expect(store.refreshToken).toBeNull();
      expect(store.isPublisher).toBe(false);

      act(() => {
        store.setTokens({ access: 'acc_123', refresh: 'ref_456' });
        store.setUser({ id: 'user-uuid-1', email: 'student@example.com', is_publisher: true });
      });

      expect(useAuthStore.getState().accessToken).toBe('acc_123');
      expect(useAuthStore.getState().refreshToken).toBe('ref_456');
      expect(useAuthStore.getState().user?.email).toBe('student@example.com');
      expect(useAuthStore.getState().isPublisher).toBe(true);

      // Verify localStorage synchronization under brainx_auth_tokens
      const rawStored = window.localStorage?.getItem('brainx_auth_tokens');
      expect(rawStored).toBeTruthy();
      const parsedStored = JSON.parse(rawStored!);
      expect(parsedStored.state.accessToken).toBe('acc_123');
      expect(parsedStored.state.refreshToken).toBe('ref_456');
      expect(parsedStored.state.user.email).toBe('student@example.com');
      // partialize omits isPublisher
      expect(parsedStored.state.isPublisher).toBeUndefined();

      act(() => {
        store.logout();
      });

      expect(useAuthStore.getState().accessToken).toBeNull();
      expect(useAuthStore.getState().refreshToken).toBeNull();
      expect(useAuthStore.getState().user).toBeNull();
      expect(useAuthStore.getState().isPublisher).toBe(false);

      // Verify localStorage cleared after logout
      const rawAfterLogout = window.localStorage?.getItem('brainx_auth_tokens');
      expect(rawAfterLogout).toBeTruthy();
      const parsedAfterLogout = JSON.parse(rawAfterLogout!);
      expect(parsedAfterLogout.state.accessToken).toBeNull();
      expect(parsedAfterLogout.state.refreshToken).toBeNull();
      expect(parsedAfterLogout.state.user).toBeNull();
    });
  });

  describe('AppRoutes integration', () => {
    it('mounts /verify-email and renders VerifyEmailPage', async () => {
      window.history.replaceState(null, '', '/verify-email');

      render(
        <MemoryRouter initialEntries={['/verify-email']}>
          <AppRoutes />
        </MemoryRouter>
      );

      expect(screen.getByTestId('verify-email-page-root')).toBeInTheDocument();
      expect(screen.getByTestId('verify-card')).toBeInTheDocument();
    });

    it('mounts /courses placeholder', async () => {
      window.history.replaceState(null, '', '/courses');

      render(
        <MemoryRouter initialEntries={['/courses']}>
          <AppRoutes />
        </MemoryRouter>
      );

      expect(screen.getByTestId('courses-page-placeholder')).toBeInTheDocument();
      expect(screen.getByText('Catalogue des Cours')).toBeInTheDocument();
    });
  });
});
