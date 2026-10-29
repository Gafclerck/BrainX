import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { render, screen, fireEvent, waitFor, act } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { MemoryRouter } from 'react-router-dom';
import { RegisterPage } from './register-page';
import { AppRoutes } from '@/routes';
import { ThrottledBanner } from '@/components/ui/throttled-banner';
import { applyApiErrorsToForm, apiClient, ApiError } from '@/lib/api';

describe('Story FE-1.2: Inscription Étudiante & Gestion des Erreurs RFC 9457', () => {
  const originalFetch = globalThis.fetch;

  beforeEach(() => {
    vi.restoreAllMocks();
  });

  afterEach(() => {
    globalThis.fetch = originalFetch;
  });

  it('AC-1: emits POST /api/v1/register/ with email and password when form is submitted', async () => {
    const user = userEvent.setup();
    const mockFetch = vi.fn().mockResolvedValue({
      ok: true,
      status: 201,
      headers: new Headers({ 'Content-Type': 'application/json' }),
      text: async () => JSON.stringify({ message: 'Check your email for a verification link.' }),
    });
    globalThis.fetch = mockFetch;

    render(
      <MemoryRouter initialEntries={['/register']}>
        <RegisterPage />
      </MemoryRouter>
    );

    const emailInput = screen.getByLabelText(/adresse email/i);
    const passwordInput = screen.getByLabelText(/mot de passe/i);
    const submitButton = screen.getByRole('button', { name: /s'inscrire/i });

    // Check aria-required attributes
    expect(emailInput).toHaveAttribute('aria-required', 'true');
    expect(passwordInput).toHaveAttribute('aria-required', 'true');

    await user.type(emailInput, 'student@example.com');
    await user.type(passwordInput, 'Secret123!');
    await user.click(submitButton);

    await waitFor(() => {
      expect(mockFetch).toHaveBeenCalledTimes(1);
    });

    const [calledUrl, calledInit] = mockFetch.mock.calls[0];
    expect(calledUrl).toBe('/api/v1/register/');
    expect(calledInit.method).toBe('POST');
    expect(JSON.parse(calledInit.body)).toEqual({
      email: 'student@example.com',
      password: 'Secret123!',
    });
  });

  it('AC-2: displays success confirmation, clears plaintext password, and disables submit button on 201 Created', async () => {
    const user = userEvent.setup();
    globalThis.fetch = vi.fn().mockResolvedValue({
      ok: true,
      status: 201,
      headers: new Headers({ 'Content-Type': 'application/json' }),
      text: async () => JSON.stringify({ message: 'Check your email for a verification link.' }),
    });

    render(
      <MemoryRouter initialEntries={['/register']}>
        <RegisterPage />
      </MemoryRouter>
    );

    const emailInput = screen.getByLabelText(/adresse email/i);
    const passwordInput = screen.getByLabelText(/mot de passe/i);
    const submitButton = screen.getByRole('button', { name: /s'inscrire/i });

    await user.type(emailInput, 'student@example.com');
    await user.type(passwordInput, 'Secret123!');
    await user.click(submitButton);

    // Verifies success message verbatim
    const successCard = await screen.findByTestId('register-success-card');
    expect(successCard).toBeInTheDocument();
    expect(screen.getByText('Vérifiez vos emails pour activer votre compte.')).toBeInTheDocument();

    // Verifies password was cleared while email is preserved
    expect(emailInput).toHaveValue('student@example.com');
    expect(passwordInput).toHaveValue('');

    // Verifies submit button and inputs are disabled to prevent spamming
    expect(submitButton).toBeDisabled();
    expect(emailInput).toBeDisabled();
    expect(passwordInput).toBeDisabled();
  });

  it('AC-3: maps RFC 9457 400 Bad Request field errors to email input with destructive highlight and preserves values', async () => {
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
      <MemoryRouter initialEntries={['/register']}>
        <RegisterPage />
      </MemoryRouter>
    );

    const emailInput = screen.getByLabelText(/adresse email/i);
    const passwordInput = screen.getByLabelText(/mot de passe/i);
    const submitButton = screen.getByRole('button', { name: /s'inscrire/i });

    await user.type(emailInput, 'invalid-email');
    await user.type(passwordInput, 'Short');
    await user.click(submitButton);

    // Error message appears under field
    const emailError = await screen.findByTestId('email-error');
    expect(emailError).toBeInTheDocument();
    expect(emailError).toHaveTextContent('Enter a valid email address.');

    // Destructive highlight and accessibility attributes
    expect(emailInput.className).toContain('border-destructive');
    expect(emailInput).toHaveAttribute('aria-invalid', 'true');
    expect(emailInput).toHaveAttribute('aria-describedby', 'email-error');

    // Entered value must be PRESERVED (never wiped prematurely)
    expect(emailInput).toHaveValue('invalid-email');
    expect(passwordInput).toHaveValue('Short');
  });

  it('presents password field errors with destructive red highlight and accessibility attributes', async () => {
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
          detail: 'This password is too short.',
          errors: {
            password: ['This password is too short. It must contain at least 8 characters.'],
          },
        }),
    });

    render(
      <MemoryRouter initialEntries={['/register']}>
        <RegisterPage />
      </MemoryRouter>
    );

    const emailInput = screen.getByLabelText(/adresse email/i);
    const passwordInput = screen.getByLabelText(/mot de passe/i);
    const submitButton = screen.getByRole('button', { name: /s'inscrire/i });

    await user.type(emailInput, 'student@example.com');
    await user.type(passwordInput, '123');
    await user.click(submitButton);

    const passwordError = await screen.findByTestId('password-error');
    expect(passwordError).toBeInTheDocument();
    expect(passwordError).toHaveTextContent('This password is too short.');

    expect(passwordInput.className).toContain('border-destructive');
    expect(passwordInput).toHaveAttribute('aria-invalid', 'true');
    expect(passwordInput).toHaveAttribute('aria-describedby', 'password-error');
  });

  it('handles RFC 9457 400 Bad Request non-field errors with top-level alert', async () => {
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
          detail: 'Account cannot be registered.',
          errors: {
            non_field_errors: ['Account cannot be registered.'],
          },
        }),
    });

    render(
      <MemoryRouter initialEntries={['/register']}>
        <RegisterPage />
      </MemoryRouter>
    );

    const emailInput = screen.getByLabelText(/adresse email/i);
    const passwordInput = screen.getByLabelText(/mot de passe/i);
    const submitButton = screen.getByRole('button', { name: /s'inscrire/i });

    await user.type(emailInput, 'student@example.com');
    await user.type(passwordInput, 'ValidPassword123!');
    await user.click(submitButton);

    const nonFieldAlert = await screen.findByTestId('register-non-field-errors');
    expect(nonFieldAlert).toBeInTheDocument();
    expect(nonFieldAlert).toHaveTextContent('Account cannot be registered.');
    expect(nonFieldAlert.className).toContain('border-destructive-border');
    expect(nonFieldAlert.className).toContain('bg-destructive-surface');
  });

  it('handles network connection failures and displays top-level error alert', async () => {
    const user = userEvent.setup();
    globalThis.fetch = vi.fn().mockRejectedValue(new Error('Network error: Failed to fetch'));

    render(
      <MemoryRouter initialEntries={['/register']}>
        <RegisterPage />
      </MemoryRouter>
    );

    const emailInput = screen.getByLabelText(/adresse email/i);
    const passwordInput = screen.getByLabelText(/mot de passe/i);
    const submitButton = screen.getByRole('button', { name: /s'inscrire/i });

    await user.type(emailInput, 'student@example.com');
    await user.type(passwordInput, 'ValidPassword123!');
    await user.click(submitButton);

    const alert = await screen.findByTestId('register-non-field-errors');
    expect(alert).toBeInTheDocument();
    expect(alert).toHaveTextContent(
      'Une erreur inattendue est survenue. Veuillez vérifier votre connexion.'
    );
  });

  it('AC-4: mounts ThrottledBanner on HTTP 429 with Retry-After and disables submit button during countdown', async () => {
    vi.useFakeTimers();

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
          title: 'Too many requests',
          status: 429,
          detail: 'Request was throttled. Expected available in 30 seconds.',
          errors: {},
        }),
    });

    render(
      <MemoryRouter initialEntries={['/register']}>
        <RegisterPage />
      </MemoryRouter>
    );

    const emailInput = screen.getByLabelText(/adresse email/i);
    const passwordInput = screen.getByLabelText(/mot de passe/i);
    const submitButton = screen.getByRole('button', { name: /s'inscrire/i });

    fireEvent.change(emailInput, { target: { value: 'student@example.com' } });
    fireEvent.change(passwordInput, { target: { value: 'Secret123!' } });
    fireEvent.click(submitButton);

    await act(async () => {
      await Promise.resolve();
    });

    // ThrottledBanner should mount with 30s restantes
    const banner = screen.getByTestId('throttled-banner');
    expect(banner).toBeInTheDocument();
    expect(banner.className).toContain('bg-warning-surface');
    expect(banner.className).toContain('border-warning-border');
    expect(banner.className).toContain('text-warning');

    const timerText = screen.getByTestId('countdown-timer');
    expect(timerText).toHaveTextContent('30s restantes');
    expect(timerText).toHaveAttribute('aria-hidden', 'true');

    // Submit button must be disabled
    expect(submitButton).toBeDisabled();

    // Advance 1 second
    act(() => {
      vi.advanceTimersByTime(1000);
    });
    expect(screen.getByTestId('countdown-timer')).toHaveTextContent('29s restantes');
    expect(submitButton).toBeDisabled();

    // Advance remaining 29 seconds
    act(() => {
      vi.advanceTimersByTime(29000);
    });

    // Countdown reached 0: banner unmounts and button is re-enabled
    expect(screen.queryByTestId('throttled-banner')).not.toBeInTheDocument();
    expect(submitButton).not.toBeDisabled();

    vi.useRealTimers();
  });

  it('handles HTTP 503 Service Unavailable throttling with Retry-After header', async () => {
    vi.useFakeTimers();

    globalThis.fetch = vi.fn().mockResolvedValue({
      ok: false,
      status: 503,
      statusText: 'Service Unavailable',
      headers: new Headers({
        'Content-Type': 'application/json',
        'Retry-After': '60',
      }),
      text: async () =>
        JSON.stringify({
          type: 'service_unavailable',
          title: 'Service unavailable',
          status: 503,
          detail: 'The verification email service is temporarily unavailable.',
          errors: {},
        }),
    });

    render(
      <MemoryRouter initialEntries={['/register']}>
        <RegisterPage />
      </MemoryRouter>
    );

    const emailInput = screen.getByLabelText(/adresse email/i);
    const passwordInput = screen.getByLabelText(/mot de passe/i);
    const submitButton = screen.getByRole('button', { name: /s'inscrire/i });

    fireEvent.change(emailInput, { target: { value: 'student@example.com' } });
    fireEvent.change(passwordInput, { target: { value: 'Secret123!' } });
    fireEvent.click(submitButton);

    await act(async () => {
      await Promise.resolve();
    });

    const banner = screen.getByTestId('throttled-banner');
    expect(banner).toBeInTheDocument();
    expect(screen.getByTestId('countdown-timer')).toHaveTextContent('60s restantes');
    expect(submitButton).toBeDisabled();

    vi.useRealTimers();
  });

  it('ThrottledBanner unit test: counts down with wall-clock delta and calls onExpire callback when 0 is reached', () => {
    vi.useFakeTimers();
    const handleExpire = vi.fn();

    render(<ThrottledBanner seconds={3} onExpire={handleExpire} />);

    expect(screen.getByTestId('countdown-timer')).toHaveTextContent('3s restantes');

    act(() => {
      vi.advanceTimersByTime(1000);
    });
    expect(screen.getByTestId('countdown-timer')).toHaveTextContent('2s restantes');

    act(() => {
      vi.advanceTimersByTime(1000);
    });
    expect(screen.getByTestId('countdown-timer')).toHaveTextContent('1s restantes');

    act(() => {
      vi.advanceTimersByTime(1000);
    });
    expect(handleExpire).toHaveBeenCalledTimes(1);
    expect(screen.queryByTestId('throttled-banner')).not.toBeInTheDocument();

    vi.useRealTimers();
  });

  it('enforces 360px mobile viewport floor and responsive constraints', () => {
    render(
      <MemoryRouter initialEntries={['/register']}>
        <RegisterPage />
      </MemoryRouter>
    );

    const pageRoot = screen.getByTestId('register-page-root');
    expect(pageRoot.className).toContain('min-w-[360px]');
    expect(pageRoot.className).toContain('overflow-x-hidden');

    const card = screen.getByTestId('register-card');
    expect(card.parentElement?.className).toContain('max-w-md');
    expect(card.parentElement?.className).toContain('w-full');
    expect(card.parentElement?.className).toContain('mx-auto');

    const emailInput = screen.getByLabelText(/adresse email/i);
    expect(emailInput.className).toContain('min-h-[44px]');

    const submitButton = screen.getByRole('button', { name: /s'inscrire/i });
    expect(submitButton.className).toContain('min-h-[44px]');
  });

  it('provides navigation link between landing page and register page and login route placeholder', async () => {
    const user = userEvent.setup();
    render(
      <MemoryRouter initialEntries={['/']}>
        <AppRoutes />
      </MemoryRouter>
    );

    // On landing page, verify register link is present
    const registerLink = screen.getByTestId('nav-register-link');
    expect(registerLink).toBeInTheDocument();

    await user.click(registerLink);

    // Navigates to /register
    const registerTitle = await screen.findByText('Inscription Étudiante');
    expect(registerTitle).toBeInTheDocument();

    // Login link is present on /register and navigates to /login
    const loginLink = screen.getByRole('link', { name: /se connecter/i });
    expect(loginLink).toBeInTheDocument();
    expect(loginLink).toHaveAttribute('href', '/login');

    await user.click(loginLink);
    const loginPlaceholder = await screen.findByTestId('login-page-placeholder');
    expect(loginPlaceholder).toBeInTheDocument();
  });

  it('helper applyApiErrorsToForm routes unmapped server field errors to nonFieldErrors when knownFields is provided', () => {
    const setError = vi.fn();
    const serverErrors = {
      email: ['Email already exists.'],
      password: ['Password is too common.'],
      extra_unmapped_field: ['Something went wrong on extra field.'],
      non_field_errors: ['Cannot register at this time.'],
    };

    const nonField = applyApiErrorsToForm(serverErrors, setError, ['email', 'password']);

    expect(setError).toHaveBeenCalledWith('email', {
      type: 'server',
      message: 'Email already exists.',
    });
    expect(setError).toHaveBeenCalledWith('password', {
      type: 'server',
      message: 'Password is too common.',
    });
    expect(nonField).toEqual([
      'Something went wrong on extra field.',
      'Cannot register at this time.',
    ]);
  });

  it('apiClient parses successful JSON responses, handles 204 No Content, and handles empty body', async () => {
    globalThis.fetch = vi.fn().mockResolvedValue({
      ok: true,
      status: 200,
      headers: new Headers({ 'Content-Type': 'application/json' }),
      text: async () => JSON.stringify({ status: 'ok' }),
    });

    const data = await apiClient('/api/v1/test/');
    expect(data).toEqual({ status: 'ok' });

    // 204 No Content
    globalThis.fetch = vi.fn().mockResolvedValue({
      ok: true,
      status: 204,
      headers: new Headers(),
      text: async () => '',
    });

    const emptyData = await apiClient('/api/v1/test-empty/');
    expect(emptyData).toEqual({});

    // 200 OK with empty body
    globalThis.fetch = vi.fn().mockResolvedValue({
      ok: true,
      status: 200,
      headers: new Headers(),
      text: async () => '  ',
    });

    const emptyOkData = await apiClient('/api/v1/test-empty-ok/');
    expect(emptyOkData).toEqual({});
  });

  it('apiClient normalizes RFC 9457 errors and extracts Retry-After seconds or HTTP-date', async () => {
    globalThis.fetch = vi.fn().mockResolvedValue({
      ok: false,
      status: 429,
      statusText: 'Too Many Requests',
      headers: new Headers({
        'Content-Type': 'application/json',
        'Retry-After': '45',
      }),
      text: async () =>
        JSON.stringify({
          type: 'throttled',
          title: 'Too many requests',
          status: 429,
          detail: 'Quota exceeded',
          errors: {},
        }),
    });

    let caughtError: unknown;
    try {
      await apiClient('/api/v1/throttled/');
    } catch (err) {
      caughtError = err;
    }

    expect(caughtError).toBeInstanceOf(ApiError);
    const apiErr = caughtError as ApiError;
    expect(apiErr.envelope.status).toBe(429);
    expect(apiErr.envelope.title).toBe('Too many requests');
    expect(apiErr.retryAfter).toBe(45);

    // HTTP-date Retry-After
    const futureDate = new Date(Date.now() + 60000).toUTCString();
    globalThis.fetch = vi.fn().mockResolvedValue({
      ok: false,
      status: 503,
      statusText: 'Service Unavailable',
      headers: new Headers({
        'Content-Type': 'application/json',
        'Retry-After': futureDate,
      }),
      text: async () =>
        JSON.stringify({
          type: 'service_unavailable',
          title: 'Service unavailable',
          status: 503,
          detail: 'Please retry',
          errors: {},
        }),
    });

    let caughtDateError: unknown;
    try {
      await apiClient('/api/v1/unavailable/');
    } catch (err) {
      caughtDateError = err;
    }

    expect(caughtDateError).toBeInstanceOf(ApiError);
    const dateApiErr = caughtDateError as ApiError;
    expect(dateApiErr.retryAfter).toBeGreaterThanOrEqual(55);
    expect(dateApiErr.retryAfter).toBeLessThanOrEqual(65);
  });
});
