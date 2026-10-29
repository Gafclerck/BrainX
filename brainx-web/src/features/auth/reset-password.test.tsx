import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { render, screen, fireEvent, waitFor, act } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { MemoryRouter } from 'react-router-dom';
import { ResetPasswordPage } from './reset-password-page';
import { AppRoutes } from '@/routes';

describe('Story FE-1.4: Réinitialisation de Mot de Passe (/reset-password)', () => {
  const originalFetch = globalThis.fetch;

  beforeEach(() => {
    vi.restoreAllMocks();
  });

  afterEach(() => {
    globalThis.fetch = originalFetch;
    window.location.hash = '';
  });

  it('Reset Happy Path: extracts hash token, purges URL immediately via replaceState, dispatches POST on matching passwords, and displays success card', async () => {
    const user = userEvent.setup();
    window.history.replaceState(null, '', '/reset-password#token=valid_reset_token_xyz');
    expect(window.location.hash).toBe('#token=valid_reset_token_xyz');

    const replaceStateSpy = vi.spyOn(window.history, 'replaceState');

    const mockFetch = vi.fn().mockResolvedValue({
      ok: true,
      status: 200,
      headers: new Headers({ 'Content-Type': 'application/json' }),
      text: async () =>
        JSON.stringify({
          message: 'Password has been reset successfully.',
        }),
    });
    globalThis.fetch = mockFetch;

    render(
      <MemoryRouter initialEntries={['/reset-password']}>
        <ResetPasswordPage />
      </MemoryRouter>
    );

    // Fragment purged synchronously before paint/media
    expect(replaceStateSpy).toHaveBeenCalledWith(null, '', '/reset-password');
    expect(window.location.hash).toBe('');

    // Reset form is ready
    const passwordInput = screen.getByLabelText(/^nouveau mot de passe$/i);
    const confirmInput = screen.getByLabelText(/^confirmer le mot de passe$/i);
    const submitButton = screen.getByRole('button', { name: /réinitialiser le mot de passe/i });

    expect(passwordInput).toHaveAttribute('aria-required', 'true');
    expect(confirmInput).toHaveAttribute('aria-required', 'true');

    await user.type(passwordInput, 'NewSecretPassword123!');
    await user.type(confirmInput, 'NewSecretPassword123!');
    await user.click(submitButton);

    await waitFor(() => {
      expect(mockFetch).toHaveBeenCalledTimes(1);
    });

    const [calledUrl, calledInit] = mockFetch.mock.calls[0];
    expect(calledUrl).toBe('/api/v1/reset-password/');
    expect(calledInit.method).toBe('POST');
    expect(JSON.parse(calledInit.body)).toEqual({
      token: 'valid_reset_token_xyz',
      password: 'NewSecretPassword123!',
    });

    // 200 OK displays success card and login link
    const successCard = await screen.findByTestId('reset-success-card');
    expect(successCard).toBeInTheDocument();
    expect(screen.getByText('Mot de passe mis à jour !')).toBeInTheDocument();
    const loginLink = screen.getByRole('link', { name: /se connecter/i });
    expect(loginLink).toBeInTheDocument();
    expect(loginLink).toHaveAttribute('href', '/login');
  });

  it('purges window.location.search and window.location.hash immediately via replaceState on ?token=... and displays missing token warning card', async () => {
    window.history.replaceState(null, '', '/reset-password?token=leaked_query_token');
    expect(window.location.search).toBe('?token=leaked_query_token');

    const replaceStateSpy = vi.spyOn(window.history, 'replaceState');
    const mockFetch = vi.fn();
    globalThis.fetch = mockFetch;

    render(
      <MemoryRouter initialEntries={['/reset-password?token=leaked_query_token']}>
        <ResetPasswordPage />
      </MemoryRouter>
    );

    // Query string is purged immediately to pathname
    expect(replaceStateSpy).toHaveBeenCalledWith(null, '', '/reset-password');
    expect(window.location.search).toBe('');

    // No API call
    expect(mockFetch).not.toHaveBeenCalled();

    // Renders warning card
    const warningCard = await screen.findByTestId('reset-missing-token-card');
    expect(warningCard).toBeInTheDocument();
    expect(screen.getByTestId('reset-missing-token')).toBeInTheDocument();

    // Reset form is hidden
    expect(screen.queryByTestId('reset-password-form')).not.toBeInTheDocument();

    // Action link to /forgot-password
    const requestLink = screen.getByRole('link', { name: /demander un nouveau lien/i });
    expect(requestLink).toHaveAttribute('href', '/forgot-password');
  });

  it('Reset Missing Hash: renders warning card with link to /forgot-password when URL has no hash fragment', async () => {
    window.history.replaceState(null, '', '/reset-password');
    window.location.hash = '';

    const mockFetch = vi.fn();
    globalThis.fetch = mockFetch;

    render(
      <MemoryRouter initialEntries={['/reset-password']}>
        <ResetPasswordPage />
      </MemoryRouter>
    );

    expect(mockFetch).not.toHaveBeenCalled();

    const warningCard = await screen.findByTestId('reset-missing-token-card');
    expect(warningCard).toBeInTheDocument();
    expect(screen.getByText(/Aucun jeton de réinitialisation n'a été détecté dans le lien/i)).toBeInTheDocument();

    expect(screen.queryByTestId('reset-password-form')).not.toBeInTheDocument();
  });

  it('Reset Password Mismatch: validates matching passwords on client and blocks API request', async () => {
    const user = userEvent.setup();
    window.history.replaceState(null, '', '/reset-password#token=test_token_123');

    const mockFetch = vi.fn();
    globalThis.fetch = mockFetch;

    render(
      <MemoryRouter initialEntries={['/reset-password']}>
        <ResetPasswordPage />
      </MemoryRouter>
    );

    const passwordInput = screen.getByLabelText(/^nouveau mot de passe$/i);
    const confirmInput = screen.getByLabelText(/^confirmer le mot de passe$/i);
    const submitButton = screen.getByRole('button', { name: /réinitialiser le mot de passe/i });

    await user.type(passwordInput, 'Password123!');
    await user.type(confirmInput, 'DifferentPassword456!');
    await user.click(submitButton);

    // Mismatch error displayed under confirm field
    const mismatchError = await screen.findByTestId('confirm-password-error');
    expect(mismatchError).toHaveTextContent('Les mots de passe ne correspondent pas.');
    expect(confirmInput).toHaveAttribute('aria-invalid', 'true');
    expect(confirmInput).toHaveAttribute('aria-describedby', 'confirm-password-error');

    // API request was NOT dispatched
    expect(mockFetch).not.toHaveBeenCalled();
  });

  it('Reset Empty Passwords: shows required validation errors on empty submission', async () => {
    const user = userEvent.setup();
    window.history.replaceState(null, '', '/reset-password#token=test_token_123');

    const mockFetch = vi.fn();
    globalThis.fetch = mockFetch;

    render(
      <MemoryRouter initialEntries={['/reset-password']}>
        <ResetPasswordPage />
      </MemoryRouter>
    );

    const submitButton = screen.getByRole('button', { name: /réinitialiser le mot de passe/i });
    await user.click(submitButton);

    const passwordError = await screen.findByTestId('password-error');
    expect(passwordError).toHaveTextContent('Le mot de passe est requis.');

    const confirmError = await screen.findByTestId('confirm-password-error');
    expect(confirmError).toHaveTextContent('La confirmation du mot de passe est requise.');

    expect(mockFetch).not.toHaveBeenCalled();
  });

  it('Reset Rejected Token: displays error card with action to request new link and purges form state when API returns 400 errors.token', async () => {
    const user = userEvent.setup();
    window.history.replaceState(null, '', '/reset-password#token=expired_token_bad');

    globalThis.fetch = vi.fn().mockResolvedValue({
      ok: false,
      status: 400,
      statusText: 'Bad Request',
      headers: new Headers({ 'Content-Type': 'application/json' }),
      text: async () =>
        JSON.stringify({
          type: 'validation_error',
          title: 'Validation error',
          status: 400,
          detail: 'The token is not valid.',
          errors: {
            token: ['The token is not valid.'],
          },
        }),
    });

    render(
      <MemoryRouter initialEntries={['/reset-password']}>
        <ResetPasswordPage />
      </MemoryRouter>
    );

    const passwordInput = screen.getByLabelText(/^nouveau mot de passe$/i);
    const confirmInput = screen.getByLabelText(/^confirmer le mot de passe$/i);
    const submitButton = screen.getByRole('button', { name: /réinitialiser le mot de passe/i });

    await user.type(passwordInput, 'ValidPassword123!');
    await user.type(confirmInput, 'ValidPassword123!');
    await user.click(submitButton);

    // Displays token rejection error card
    const errorCard = await screen.findByTestId('reset-token-rejected-card');
    expect(errorCard).toBeInTheDocument();
    expect(screen.getByTestId('reset-error-card')).toHaveTextContent('The token is not valid.');

    // Proposes link to /forgot-password
    const requestLink = screen.getByRole('link', { name: /demander un nouveau lien/i });
    expect(requestLink).toHaveAttribute('href', '/forgot-password');

    // Reset form is replaced/hidden
    expect(screen.queryByTestId('reset-password-form')).not.toBeInTheDocument();
  });

  it('Reset Weak Password: maps password policy errors from 400 errors.password directly under password input including multiple messages', async () => {
    const user = userEvent.setup();
    window.history.replaceState(null, '', '/reset-password#token=valid_token');

    globalThis.fetch = vi.fn().mockResolvedValue({
      ok: false,
      status: 400,
      statusText: 'Bad Request',
      headers: new Headers({ 'Content-Type': 'application/json' }),
      text: async () =>
        JSON.stringify({
          type: 'validation_error',
          title: 'Validation error',
          status: 400,
          detail: 'Ce mot de passe est trop court.',
          errors: {
            password: [
              'Ce mot de passe est trop court.',
              'Il doit contenir au moins 8 caractères.',
            ],
          },
        }),
    });

    render(
      <MemoryRouter initialEntries={['/reset-password']}>
        <ResetPasswordPage />
      </MemoryRouter>
    );

    const passwordInput = screen.getByLabelText(/^nouveau mot de passe$/i);
    const confirmInput = screen.getByLabelText(/^confirmer le mot de passe$/i);
    const submitButton = screen.getByRole('button', { name: /réinitialiser le mot de passe/i });

    await user.type(passwordInput, 'short');
    await user.type(confirmInput, 'short');
    await user.click(submitButton);

    const passwordError = await screen.findByTestId('password-error');
    expect(passwordError).toHaveTextContent(
      'Ce mot de passe est trop court. Il doit contenir au moins 8 caractères.'
    );
    expect(passwordInput).toHaveAttribute('aria-invalid', 'true');
    expect(passwordInput.className).toContain('border-destructive');

    // Form remains visible and values are preserved
    expect(screen.getByTestId('reset-password-form')).toBeInTheDocument();
    expect(passwordInput).toHaveValue('short');
    expect(confirmInput).toHaveValue('short');
  });

  it('Reset Throttled: displays ThrottledBanner on HTTP 429 and locks submit button', async () => {
    vi.useFakeTimers();
    window.history.replaceState(null, '', '/reset-password#token=valid_token');

    globalThis.fetch = vi.fn().mockResolvedValue({
      ok: false,
      status: 429,
      statusText: 'Too Many Requests',
      headers: new Headers({
        'Content-Type': 'application/json',
        'Retry-After': '30',
      }),
      text: async () =>
        JSON.stringify({
          type: 'throttled',
          title: 'Too Many Requests',
          status: 429,
          detail: 'Limite de tentatives atteinte.',
          errors: {},
        }),
    });

    render(
      <MemoryRouter initialEntries={['/reset-password']}>
        <ResetPasswordPage />
      </MemoryRouter>
    );

    const passwordInput = screen.getByLabelText(/^nouveau mot de passe$/i);
    const confirmInput = screen.getByLabelText(/^confirmer le mot de passe$/i);
    const submitButton = screen.getByRole('button', { name: /réinitialiser le mot de passe/i });

    fireEvent.change(passwordInput, { target: { value: 'ValidPassword123!' } });
    fireEvent.change(confirmInput, { target: { value: 'ValidPassword123!' } });
    fireEvent.click(submitButton);

    await act(async () => {
      await Promise.resolve();
    });

    const banner = screen.getByTestId('throttled-banner');
    expect(banner).toBeInTheDocument();
    expect(screen.getByTestId('countdown-timer')).toHaveTextContent('30s restantes');
    expect(submitButton).toBeDisabled();

    // Advance 30 seconds
    act(() => {
      vi.advanceTimersByTime(30000);
    });

    expect(screen.queryByTestId('throttled-banner')).not.toBeInTheDocument();
    expect(submitButton).not.toBeDisabled();

    vi.useRealTimers();
  });

  it('Reset Server Error: displays retryable alert without clearing entered input on 500 error', async () => {
    const user = userEvent.setup();
    window.history.replaceState(null, '', '/reset-password#token=valid_token');

    globalThis.fetch = vi.fn().mockResolvedValue({
      ok: false,
      status: 500,
      statusText: 'Internal Server Error',
      headers: new Headers({ 'Content-Type': 'application/json' }),
      text: async () =>
        JSON.stringify({
          type: 'server_error',
          title: 'Internal Server Error',
          status: 500,
          detail: 'Une erreur interne est survenue sur le serveur.',
          errors: {},
        }),
    });

    render(
      <MemoryRouter initialEntries={['/reset-password']}>
        <ResetPasswordPage />
      </MemoryRouter>
    );

    const passwordInput = screen.getByLabelText(/^nouveau mot de passe$/i);
    const confirmInput = screen.getByLabelText(/^confirmer le mot de passe$/i);
    const submitButton = screen.getByRole('button', { name: /réinitialiser le mot de passe/i });

    await user.type(passwordInput, 'MyPassword123!');
    await user.type(confirmInput, 'MyPassword123!');
    await user.click(submitButton);

    const alert = await screen.findByTestId('reset-non-field-errors');
    expect(alert).toHaveTextContent('Une erreur interne est survenue sur le serveur.');

    // Inputs are NOT cleared, user can retry
    expect(passwordInput).toHaveValue('MyPassword123!');
    expect(confirmInput).toHaveValue('MyPassword123!');
    expect(submitButton).not.toBeDisabled();
  });

  it('Reset Network Error: displays retryable alert without clearing entered input on rejected fetch promise', async () => {
    const user = userEvent.setup();
    window.history.replaceState(null, '', '/reset-password#token=valid_token');

    globalThis.fetch = vi.fn().mockRejectedValue(new Error('Network disconnected'));

    render(
      <MemoryRouter initialEntries={['/reset-password']}>
        <ResetPasswordPage />
      </MemoryRouter>
    );

    const passwordInput = screen.getByLabelText(/^nouveau mot de passe$/i);
    const confirmInput = screen.getByLabelText(/^confirmer le mot de passe$/i);
    const submitButton = screen.getByRole('button', { name: /réinitialiser le mot de passe/i });

    await user.type(passwordInput, 'MyPassword123!');
    await user.type(confirmInput, 'MyPassword123!');
    await user.click(submitButton);

    const alert = await screen.findByTestId('reset-non-field-errors');
    expect(alert).toHaveTextContent(/erreur réseau/i);

    // Inputs are preserved, user can retry
    expect(passwordInput).toHaveValue('MyPassword123!');
    expect(confirmInput).toHaveValue('MyPassword123!');
    expect(submitButton).not.toBeDisabled();
  });

  it('enforces 360px mobile viewport floor, dark theme, and min 44px touch targets', () => {
    window.history.replaceState(null, '', '/reset-password#token=valid_token');

    render(
      <MemoryRouter initialEntries={['/reset-password']}>
        <ResetPasswordPage />
      </MemoryRouter>
    );

    const pageRoot = screen.getByTestId('reset-password-page-root');
    expect(pageRoot.className).toContain('min-w-[360px]');
    expect(pageRoot.className).toContain('overflow-x-hidden');
    expect(pageRoot.className).toContain('bg-background');

    const card = screen.getByTestId('reset-password-card');
    expect(card.parentElement?.className).toContain('max-w-md');
    expect(card.parentElement?.className).toContain('w-full');
    expect(card.parentElement?.className).toContain('mx-auto');

    const passwordInput = screen.getByLabelText(/^nouveau mot de passe$/i);
    expect(passwordInput.className).toContain('min-h-[44px]');

    const confirmInput = screen.getByLabelText(/^confirmer le mot de passe$/i);
    expect(confirmInput.className).toContain('min-h-[44px]');

    const submitButton = screen.getByRole('button', { name: /réinitialiser le mot de passe/i });
    expect(submitButton.className).toContain('min-h-[44px]');
  });

  it('integrates with AppRoutes and navigates to /login on success confirmation click', async () => {
    const user = userEvent.setup();
    window.history.replaceState(null, '', '/reset-password#token=token_xyz');

    globalThis.fetch = vi.fn().mockResolvedValue({
      ok: true,
      status: 200,
      headers: new Headers({ 'Content-Type': 'application/json' }),
      text: async () =>
        JSON.stringify({
          message: 'Password has been reset successfully.',
        }),
    });

    render(
      <MemoryRouter initialEntries={['/reset-password']}>
        <AppRoutes />
      </MemoryRouter>
    );

    const passwordInput = screen.getByLabelText(/^nouveau mot de passe$/i);
    const confirmInput = screen.getByLabelText(/^confirmer le mot de passe$/i);
    const submitButton = screen.getByRole('button', { name: /réinitialiser le mot de passe/i });

    await user.type(passwordInput, 'NewPass123!');
    await user.type(confirmInput, 'NewPass123!');
    await user.click(submitButton);

    const loginButton = await screen.findByRole('link', { name: /se connecter/i });
    await user.click(loginButton);

    const loginPlaceholder = await screen.findByTestId('login-page-placeholder');
    expect(loginPlaceholder).toBeInTheDocument();
  });
});
