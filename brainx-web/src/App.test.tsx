import { describe, it, expect, beforeEach, vi } from 'vitest';
import { render, screen, waitFor } from '@testing-library/react';
import App from './App';
import { useAuthStore } from '@/features/auth/auth-store';
import * as configModule from '@/features/config';

describe('BrainX Frontend UI Foundation (FE-1.1)', () => {
  beforeEach(() => {
    useAuthStore.getState().clearAuth();
  });

  it('renders root view with dark-only theme classes and no light theme', () => {
    render(<App />);
    const rootElement = screen.getByTestId('app-root');

    expect(rootElement).toBeInTheDocument();
    expect(rootElement.className).toContain('bg-background');
    expect(rootElement.className).toContain('text-foreground');
    expect(rootElement.className).toContain('font-sans');
    expect(rootElement.className).not.toContain('light');
    expect(document.querySelector('.light')).toBeNull();
  });

  it('enforces 360px mobile viewport floor with overflow-x containment', () => {
    render(<App />);
    const rootElement = screen.getByTestId('app-root');

    // Root container must enforce 360px floor and hidden horizontal document overflow
    expect(rootElement.className).toContain('min-w-[360px]');
    expect(rootElement.className).toContain('overflow-x-hidden');
  });

  it('renders UI primitive: Card containers with dark surface and border tokens', () => {
    render(<App />);
    const cardMulticlass = screen.getByTestId('card-feature-multiclass');

    expect(cardMulticlass).toBeInTheDocument();
    expect(cardMulticlass.className).toContain('bg-card');
    expect(cardMulticlass.className).toContain('border-border');
    expect(cardMulticlass.className).toContain('rounded-lg');
  });

  it('renders upcoming roadmap sections (multi-classes, interactions, blogs, formations, emails, quiz)', () => {
    render(<App />);

    expect(screen.getByTestId('section-upcoming-features')).toBeInTheDocument();
    expect(screen.getByTestId('card-feature-multiclass')).toHaveTextContent(/multi-classe/i);
    expect(screen.getByTestId('card-feature-interactions')).toHaveTextContent(/interactions/i);
    expect(screen.getByTestId('card-feature-blogs')).toHaveTextContent(/blogs/i);
    expect(screen.getByTestId('card-feature-formations')).toHaveTextContent(/formations/i);
    expect(screen.getByTestId('card-feature-emails')).toHaveTextContent(/emails/i);
    expect(screen.getByTestId('card-feature-evaluations')).toHaveTextContent(/quiz/i);
  });

  it('renders navigation action buttons with accessible dark styling', () => {
    render(<App />);
    const loginLink = screen.getByTestId('nav-login-link');
    const registerLink = screen.getByTestId('nav-register-link');

    expect(loginLink).toBeInTheDocument();
    expect(loginLink).toHaveAttribute('href', '/login');
    expect(registerLink).toBeInTheDocument();
    expect(registerLink).toHaveAttribute('href', '/register');
  });

  it('binds Inter and JetBrains Mono typography families', () => {
    render(<App />);
    const rootElement = screen.getByTestId('app-root');
    expect(rootElement.className).toContain('font-sans');

    const versionBadge = screen.getByTestId('version-badge');
    expect(versionBadge.className).toContain('font-mono');
  });

  it('redirects authenticated user to /courses when visiting landing page', async () => {
    useAuthStore.getState().setTokens({
      access: 'valid-test-access-token',
      refresh: 'valid-test-refresh-token',
    });

    render(<App />);

    await waitFor(() => {
      expect(screen.queryByTestId('app-root')).not.toBeInTheDocument();
      expect(screen.getByTestId('student-layout')).toBeInTheDocument();
    });
  });

  it('invokes fetchPublicConfig on mount to dynamically synchronize runtime configuration', () => {
    const fetchSpy = vi.spyOn(configModule, 'fetchPublicConfig');
    render(<App />);
    expect(fetchSpy).toHaveBeenCalled();
    fetchSpy.mockRestore();
  });
});
