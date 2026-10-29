import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { render, screen, fireEvent, waitFor, act } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { MemoryRouter } from 'react-router-dom';
import { ForgotPasswordPage } from './forgot-password-page';
import { AppRoutes } from '@/routes';

describe('Story FE-1.4: Mot de passe oublié (/forgot-password)', () => {
  const originalFetch = globalThis.fetch;

  beforeEach(() => {
    vi.restoreAllMocks();
  });

  afterEach(() => {
    globalThis.fetch = originalFetch;
  });

  it('Forgot Happy Path: submits email to POST /api/v1/password-reset/ and displays uniform anti-enumeration message', async () => {
    const user = userEvent.setup();
    const mockFetch = vi.fn().mockResolvedValue({
      ok: true,
      status: 200,
      headers: new Headers({ 'Content-Type': 'application/json' }),
      text: async () =>
        JSON.stringify({
          message:
            'If an account with that email exists, a password reset link has been sent.',
        }),
    });
    globalThis.fetch = mockFetch;

    render(
      <MemoryRouter initialEntries={['/forgot-password']}>
        <ForgotPasswordPage />
      </MemoryRouter>
    );

    const emailInput = screen.getByLabelText(/adresse email/i);
    const submitButton = screen.getByRole('button', { name: /envoyer le lien/i });

    expect(emailInput).toHaveAttribute('aria-required', 'true');
    expect(emailInput).not.toHaveAttribute('aria-describedby');

    await user.type(emailInput, 'student@example.com');
    await user.click(submitButton);

    await waitFor(() => {
      expect(mockFetch).toHaveBeenCalledTimes(1);
    });

    const [calledUrl, calledInit] = mockFetch.mock.calls[0];
    expect(calledUrl).toBe('/api/v1/password-reset/');
    expect(calledInit.method).toBe('POST');
    expect(JSON.parse(calledInit.body)).toEqual({
      email: 'student@example.com',
    });

    // Verifies uniform anti-enumeration confirmation verbatim
    const successCard = await screen.findByTestId('forgot-password-success-card');
    expect(successCard).toBeInTheDocument();
    expect(
      screen.getByText(
        'Si un compte existe avec cet email, un lien de réinitialisation a été envoyé.'
      )
    ).toBeInTheDocument();

    // Verifies submit button and input are locked
    expect(submitButton).toBeDisabled();
    expect(emailInput).toBeDisabled();

    // Back to login link is present
    const loginLink = screen.getByTestId('back-to-login-link');
    expect(loginLink).toBeInTheDocument();
    expect(loginLink).toHaveAttribute('href', '/login');
  });

  it('preserves uniform anti-enumeration privacy for non-registered email', async () => {
    const user = userEvent.setup();
    // Server returns identical 200 response
    globalThis.fetch = vi.fn().mockResolvedValue({
      ok: true,
      status: 200,
      headers: new Headers({ 'Content-Type': 'application/json' }),
      text: async () =>
        JSON.stringify({
          message:
            'If an account with that email exists, a password reset link has been sent.',
        }),
    });

    render(
      <MemoryRouter initialEntries={['/forgot-password']}>
        <ForgotPasswordPage />
      </MemoryRouter>
    );

    const emailInput = screen.getByLabelText(/adresse email/i);
    const submitButton = screen.getByRole('button', { name: /envoyer le lien/i });

    await user.type(emailInput, 'unknown@example.com');
    await user.click(submitButton);

    const successCard = await screen.findByTestId('forgot-password-success-card');
    expect(successCard).toBeInTheDocument();
    expect(
      screen.getByText(
        'Si un compte existe avec cet email, un lien de réinitialisation a été envoyé.'
      )
    ).toBeInTheDocument();
  });

  it('handles copy-pasted email with leading and trailing whitespace by trimming before submission', async () => {
    const user = userEvent.setup();
    const mockFetch = vi.fn().mockResolvedValue({
      ok: true,
      status: 200,
      headers: new Headers({ 'Content-Type': 'application/json' }),
      text: async () =>
        JSON.stringify({
          message:
            'If an account with that email exists, a password reset link has been sent.',
        }),
    });
    globalThis.fetch = mockFetch;

    render(
      <MemoryRouter initialEntries={['/forgot-password']}>
        <ForgotPasswordPage />
      </MemoryRouter>
    );

    const emailInput = screen.getByLabelText(/adresse email/i);
    const submitButton = screen.getByRole('button', { name: /envoyer le lien/i });

    await user.type(emailInput, '   copy_pasted@example.com   ');
    await user.click(submitButton);

    await waitFor(() => {
      expect(mockFetch).toHaveBeenCalledTimes(1);
    });

    const [, calledInit] = mockFetch.mock.calls[0];
    expect(JSON.parse(calledInit.body)).toEqual({
      email: 'copy_pasted@example.com',
    });
  });

  it('Forgot Invalid Email: validates client-side email format and sets error', async () => {
    const user = userEvent.setup();
    const mockFetch = vi.fn();
    globalThis.fetch = mockFetch;

    render(
      <MemoryRouter initialEntries={['/forgot-password']}>
        <ForgotPasswordPage />
      </MemoryRouter>
    );

    const emailInput = screen.getByLabelText(/adresse email/i);
    const submitButton = screen.getByRole('button', { name: /envoyer le lien/i });

    // Submit empty email
    await user.click(submitButton);

    const emptyError = await screen.findByTestId('email-error');
    expect(emptyError).toHaveTextContent("L'adresse email est requise.");
    expect(emailInput).toHaveAttribute('aria-invalid', 'true');
    expect(emailInput).toHaveAttribute('aria-describedby', 'email-error');
    expect(mockFetch).not.toHaveBeenCalled();

    // Submit invalid format
    await user.type(emailInput, 'notanemail');
    await user.click(submitButton);

    const formatError = await screen.findByTestId('email-error');
    expect(formatError).toHaveTextContent('Veuillez entrer une adresse email valide.');
    expect(mockFetch).not.toHaveBeenCalled();
  });

  it('Forgot Invalid Email: maps RFC 9457 400 Bad Request error from server directly under email field', async () => {
    const user = userEvent.setup();
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
          detail: 'Enter a valid email address.',
          errors: {
            email: ['Enter a valid email address.'],
          },
        }),
    });

    render(
      <MemoryRouter initialEntries={['/forgot-password']}>
        <ForgotPasswordPage />
      </MemoryRouter>
    );

    const emailInput = screen.getByLabelText(/adresse email/i);
    const submitButton = screen.getByRole('button', { name: /envoyer le lien/i });

    await user.type(emailInput, 'bad@domain.com');
    await user.click(submitButton);

    const emailError = await screen.findByTestId('email-error');
    expect(emailError).toHaveTextContent('Enter a valid email address.');
    expect(emailInput).toHaveAttribute('aria-invalid', 'true');
    expect(emailInput.className).toContain('border-destructive');
  });

  it('Forgot: displays top-level alert for RFC 9457 non-field errors', async () => {
    const user = userEvent.setup();
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
          detail: 'Compte désactivé.',
          errors: {
            non_field_errors: ['Compte désactivé temporairement.'],
          },
        }),
    });

    render(
      <MemoryRouter initialEntries={['/forgot-password']}>
        <ForgotPasswordPage />
      </MemoryRouter>
    );

    const emailInput = screen.getByLabelText(/adresse email/i);
    const submitButton = screen.getByRole('button', { name: /envoyer le lien/i });

    await user.type(emailInput, 'student@example.com');
    await user.click(submitButton);

    const nonFieldError = await screen.findByTestId('forgot-password-non-field-errors');
    expect(nonFieldError).toHaveTextContent('Compte désactivé temporairement.');
  });

  it('Forgot: displays top-level alert on HTTP 500 server error and preserves input', async () => {
    const user = userEvent.setup();
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
          detail: 'Erreur interne du serveur.',
          errors: {},
        }),
    });

    render(
      <MemoryRouter initialEntries={['/forgot-password']}>
        <ForgotPasswordPage />
      </MemoryRouter>
    );

    const emailInput = screen.getByLabelText(/adresse email/i);
    const submitButton = screen.getByRole('button', { name: /envoyer le lien/i });

    await user.type(emailInput, 'student@example.com');
    await user.click(submitButton);

    const alert = await screen.findByTestId('forgot-password-non-field-errors');
    expect(alert).toHaveTextContent('Erreur interne du serveur.');
    expect(emailInput).toHaveValue('student@example.com');
    expect(submitButton).not.toBeDisabled();
  });

  it('Forgot Throttled: displays ThrottledBanner on HTTP 429 and locks submit button', async () => {
    vi.useFakeTimers();
    globalThis.fetch = vi.fn().mockResolvedValue({
      ok: false,
      status: 429,
      statusText: 'Too Many Requests',
      headers: new Headers({
        'Content-Type': 'application/json',
        'Retry-After': '60',
      }),
      text: async () =>
        JSON.stringify({
          type: 'throttled',
          title: 'Too Many Requests',
          status: 429,
          detail: 'Demande limitée. Veuillez patienter.',
          errors: {},
        }),
    });

    render(
      <MemoryRouter initialEntries={['/forgot-password']}>
        <ForgotPasswordPage />
      </MemoryRouter>
    );

    const emailInput = screen.getByLabelText(/adresse email/i);
    const submitButton = screen.getByRole('button', { name: /envoyer le lien/i });

    fireEvent.change(emailInput, { target: { value: 'throttled@example.com' } });
    fireEvent.click(submitButton);

    await act(async () => {
      await Promise.resolve();
    });

    const banner = screen.getByTestId('throttled-banner');
    expect(banner).toBeInTheDocument();
    expect(screen.getByTestId('countdown-timer')).toHaveTextContent('60s restantes');
    expect(submitButton).toBeDisabled();
    expect(emailInput).toBeDisabled();

    // Advance 60 seconds
    act(() => {
      vi.advanceTimersByTime(60000);
    });

    expect(screen.queryByTestId('throttled-banner')).not.toBeInTheDocument();
    expect(submitButton).not.toBeDisabled();
    expect(emailInput).not.toBeDisabled();

    vi.useRealTimers();
  });

  it('Forgot Throttled: displays ThrottledBanner on HTTP 503 with Retry-After header', async () => {
    vi.useFakeTimers();
    globalThis.fetch = vi.fn().mockResolvedValue({
      ok: false,
      status: 503,
      statusText: 'Service Unavailable',
      headers: new Headers({
        'Content-Type': 'application/json',
        'Retry-After': '45',
      }),
      text: async () =>
        JSON.stringify({
          type: 'service_unavailable',
          title: 'Service Unavailable',
          status: 503,
          detail: 'Service temporairement indisponible.',
          errors: {},
        }),
    });

    render(
      <MemoryRouter initialEntries={['/forgot-password']}>
        <ForgotPasswordPage />
      </MemoryRouter>
    );

    const emailInput = screen.getByLabelText(/adresse email/i);
    const submitButton = screen.getByRole('button', { name: /envoyer le lien/i });

    fireEvent.change(emailInput, { target: { value: 'service_down@example.com' } });
    fireEvent.click(submitButton);

    await act(async () => {
      await Promise.resolve();
    });

    const banner = screen.getByTestId('throttled-banner');
    expect(banner).toBeInTheDocument();
    expect(screen.getByTestId('countdown-timer')).toHaveTextContent('45s restantes');
    expect(screen.getByText('Service temporairement indisponible.')).toBeInTheDocument();
    expect(submitButton).toBeDisabled();

    vi.useRealTimers();
  });

  it('Forgot: handles network failure gracefully and allows retry without clearing email', async () => {
    const user = userEvent.setup();
    globalThis.fetch = vi.fn().mockRejectedValue(new Error('Network error'));

    render(
      <MemoryRouter initialEntries={['/forgot-password']}>
        <ForgotPasswordPage />
      </MemoryRouter>
    );

    const emailInput = screen.getByLabelText(/adresse email/i);
    const submitButton = screen.getByRole('button', { name: /envoyer le lien/i });

    await user.type(emailInput, 'student@example.com');
    await user.click(submitButton);

    const alert = await screen.findByTestId('forgot-password-non-field-errors');
    expect(alert).toHaveTextContent(/erreur inattendue/i);
    expect(emailInput).toHaveValue('student@example.com');
    expect(submitButton).not.toBeDisabled();
  });

  it('enforces 360px mobile viewport floor, dark theme, and min 44px touch targets', () => {
    render(
      <MemoryRouter initialEntries={['/forgot-password']}>
        <ForgotPasswordPage />
      </MemoryRouter>
    );

    const pageRoot = screen.getByTestId('forgot-password-page-root');
    expect(pageRoot.className).toContain('min-w-[360px]');
    expect(pageRoot.className).toContain('overflow-x-hidden');
    expect(pageRoot.className).toContain('bg-background');

    const card = screen.getByTestId('forgot-password-card');
    expect(card.parentElement?.className).toContain('max-w-md');
    expect(card.parentElement?.className).toContain('w-full');
    expect(card.parentElement?.className).toContain('mx-auto');

    const emailInput = screen.getByLabelText(/adresse email/i);
    expect(emailInput.className).toContain('min-h-[44px]');

    const submitButton = screen.getByRole('button', { name: /envoyer le lien/i });
    expect(submitButton.className).toContain('min-h-[44px]');

    const loginLink = screen.getByTestId('back-to-login-link');
    expect(loginLink.className).toContain('min-h-[44px]');
  });

  it('integrates with AppRoutes and navigates from login page "Mot de passe oublié ?" link', async () => {
    const user = userEvent.setup();
    render(
      <MemoryRouter initialEntries={['/login']}>
        <AppRoutes />
      </MemoryRouter>
    );

    expect(screen.getByTestId('login-page-placeholder')).toBeInTheDocument();

    const forgotLink = screen.getByRole('link', { name: /mot de passe oublié \?/i });
    expect(forgotLink).toHaveAttribute('href', '/forgot-password');

    await user.click(forgotLink);

    expect(await screen.findByText('Mot de passe oublié')).toBeInTheDocument();
  });

  it('integrates with AppRoutes and provides navigation to /login', async () => {
    const user = userEvent.setup();
    render(
      <MemoryRouter initialEntries={['/forgot-password']}>
        <AppRoutes />
      </MemoryRouter>
    );

    expect(screen.getByText('Mot de passe oublié')).toBeInTheDocument();

    const loginLink = screen.getByTestId('back-to-login-link');
    await user.click(loginLink);

    const loginPlaceholder = await screen.findByTestId('login-page-placeholder');
    expect(loginPlaceholder).toBeInTheDocument();
  });
});
