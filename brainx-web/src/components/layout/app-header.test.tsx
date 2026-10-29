import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { render, screen, fireEvent } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { MemoryRouter, useLocation } from 'react-router-dom';
import { AppHeader } from './app-header';
import { useAuthStore } from '@/features/auth/auth-store';

function LocationTracker() {
  const location = useLocation();
  return <div data-testid="location-display">{location.pathname}</div>;
}

describe('Story FE-2.1: AppHeader Component', () => {
  beforeEach(() => {
    vi.restoreAllMocks();
    useAuthStore.getState().clearAuth();
    window.localStorage?.clear();
  });

  afterEach(() => {
    vi.useRealTimers();
  });

  it('renders sticky header with dark-only theme classes and BrainX logo linking to /courses', () => {
    render(
      <MemoryRouter initialEntries={['/courses']}>
        <AppHeader />
      </MemoryRouter>
    );

    const header = screen.getByTestId('app-header');
    expect(header).toBeInTheDocument();
    expect(header.className).toContain('sticky');
    expect(header.className).toContain('bg-surface');
    expect(header.className).toContain('border-border');
    expect(header.className).toContain('text-foreground');
    expect(header.className).not.toContain('light');

    const logo = screen.getByTestId('header-logo');
    expect(logo).toBeInTheDocument();
    expect(logo.getAttribute('href')).toBe('/courses');
    expect(logo).toHaveTextContent('BX');
    expect(logo).toHaveTextContent('BrainX');
  });

  it('renders search trigger bar displaying Cmd+K / Ctrl+K keyboard shortcut', () => {
    render(
      <MemoryRouter>
        <AppHeader />
      </MemoryRouter>
    );

    const searchBtn = screen.getByTestId('search-trigger');
    expect(searchBtn).toBeInTheDocument();
    expect(searchBtn).toHaveTextContent(/Rechercher/i);

    const shortcut = screen.getByTestId('search-shortcut');
    expect(shortcut).toBeInTheDocument();
    expect(shortcut.textContent).toMatch(/Cmd\+K|Ctrl\+K/);
  });

  it('adapts shortcut label for Mac (Cmd+K) and non-Mac (Ctrl+K) based on navigator.platform', () => {
    const originalPlatform = window.navigator.platform;
    try {
      // Test Mac platform
      Object.defineProperty(window.navigator, 'platform', {
        value: 'MacIntel',
        configurable: true,
      });
      const { unmount } = render(
        <MemoryRouter>
          <AppHeader />
        </MemoryRouter>
      );
      expect(screen.getByTestId('search-shortcut')).toHaveTextContent('Cmd+K');
      unmount();

      // Test Windows/Linux non-Mac platform
      Object.defineProperty(window.navigator, 'platform', {
        value: 'Win32',
        configurable: true,
      });
      render(
        <MemoryRouter>
          <AppHeader />
        </MemoryRouter>
      );
      expect(screen.getByTestId('search-shortcut')).toHaveTextContent('Ctrl+K');
    } finally {
      Object.defineProperty(window.navigator, 'platform', {
        value: originalPlatform,
        configurable: true,
      });
    }
  });

  it('fires onSearchTrigger callback on search bar click when provided', async () => {
    const onSearchTrigger = vi.fn();
    render(
      <MemoryRouter>
        <AppHeader onSearchTrigger={onSearchTrigger} />
      </MemoryRouter>
    );

    const searchBtn = screen.getByTestId('search-trigger');
    await userEvent.click(searchBtn);

    expect(onSearchTrigger).toHaveBeenCalledTimes(1);
  });

  it('navigates to /search when clicking search bar without custom callback', async () => {
    render(
      <MemoryRouter initialEntries={['/courses']}>
        <LocationTracker />
        <AppHeader />
      </MemoryRouter>
    );

    const searchBtn = screen.getByTestId('search-trigger');
    await userEvent.click(searchBtn);

    expect(screen.getByTestId('location-display')).toHaveTextContent('/search');
  });

  it('listens globally to Cmd+K / Ctrl+K keydown and triggers search preventing default', () => {
    const onSearchTrigger = vi.fn();
    render(
      <MemoryRouter>
        <AppHeader onSearchTrigger={onSearchTrigger} />
      </MemoryRouter>
    );

    // Meta+K (Cmd+K on Mac)
    const cmdKEvent = new KeyboardEvent('keydown', {
      key: 'k',
      metaKey: true,
      bubbles: true,
      cancelable: true,
    });
    const preventDefaultSpy1 = vi.spyOn(cmdKEvent, 'preventDefault');
    window.dispatchEvent(cmdKEvent);

    expect(preventDefaultSpy1).toHaveBeenCalled();
    expect(onSearchTrigger).toHaveBeenCalledTimes(1);

    // Ctrl+K (Ctrl+K on Windows/Linux)
    const ctrlKEvent = new KeyboardEvent('keydown', {
      key: 'K',
      ctrlKey: true,
      bubbles: true,
      cancelable: true,
    });
    const preventDefaultSpy2 = vi.spyOn(ctrlKEvent, 'preventDefault');
    window.dispatchEvent(ctrlKEvent);

    expect(preventDefaultSpy2).toHaveBeenCalled();
    expect(onSearchTrigger).toHaveBeenCalledTimes(2);

    // Unrelated key (e.g. keydown 'k' alone or 'j' with ctrl) does not trigger
    const regularKeyEvent = new KeyboardEvent('keydown', {
      key: 'k',
      ctrlKey: false,
      metaKey: false,
      bubbles: true,
    });
    window.dispatchEvent(regularKeyEvent);
    expect(onSearchTrigger).toHaveBeenCalledTimes(2);
  });

  it('navigates to /search on Cmd+K / Ctrl+K keydown when onSearchTrigger is omitted', () => {
    render(
      <MemoryRouter initialEntries={['/courses']}>
        <LocationTracker />
        <AppHeader />
      </MemoryRouter>
    );

    fireEvent.keyDown(window, {
      key: 'k',
      metaKey: true,
    });

    expect(screen.getByTestId('location-display')).toHaveTextContent('/search');
  });

  it('ignores shortcut keydown if user is typing in an input/textarea or if shift/alt is pressed', () => {
    const onSearchTrigger = vi.fn();
    render(
      <MemoryRouter>
        <input data-testid="test-input" />
        <AppHeader onSearchTrigger={onSearchTrigger} />
      </MemoryRouter>
    );

    const input = screen.getByTestId('test-input');
    input.focus();

    // Event targeted inside an input
    const inputEvent = new KeyboardEvent('keydown', {
      key: 'k',
      ctrlKey: true,
      bubbles: true,
    });
    input.dispatchEvent(inputEvent);
    expect(onSearchTrigger).not.toHaveBeenCalled();

    // Shift modifier present (e.g. Ctrl+Shift+K)
    const shiftEvent = new KeyboardEvent('keydown', {
      key: 'k',
      ctrlKey: true,
      shiftKey: true,
      bubbles: true,
    });
    window.dispatchEvent(shiftEvent);
    expect(onSearchTrigger).not.toHaveBeenCalled();

    // Alt modifier present (e.g. Ctrl+Alt+K)
    const altEvent = new KeyboardEvent('keydown', {
      key: 'k',
      ctrlKey: true,
      altKey: true,
      bubbles: true,
    });
    window.dispatchEvent(altEvent);
    expect(onSearchTrigger).not.toHaveBeenCalled();
  });

  it('toggles profile menu when profile button is clicked, closes on Escape, and restores focus', async () => {
    useAuthStore.getState().setUser({ email: 'etudiant@univ.edu', is_publisher: false });

    render(
      <MemoryRouter>
        <AppHeader />
      </MemoryRouter>
    );

    expect(screen.queryByTestId('profile-menu')).not.toBeInTheDocument();

    const trigger = screen.getByTestId('profile-menu-trigger');
    expect(trigger).toHaveAttribute('aria-expanded', 'false');

    // Click to open
    await userEvent.click(trigger);
    expect(screen.getByTestId('profile-menu')).toBeInTheDocument();
    expect(trigger).toHaveAttribute('aria-expanded', 'true');
    expect(screen.getByTestId('profile-email')).toHaveTextContent('etudiant@univ.edu');
    expect(screen.getByTestId('student-badge')).toHaveTextContent('Étudiant');
    expect(screen.queryByTestId('publisher-link')).not.toBeInTheDocument();

    // Press Escape to close and verify focus restoration
    fireEvent.keyDown(document, { key: 'Escape' });
    expect(screen.queryByTestId('profile-menu')).not.toBeInTheDocument();
    expect(document.activeElement).toBe(trigger);
  });

  it('displays "Compte invité" if user email is missing', async () => {
    useAuthStore.getState().setUser(null);

    render(
      <MemoryRouter>
        <AppHeader />
      </MemoryRouter>
    );

    const trigger = screen.getByTestId('profile-menu-trigger');
    await userEvent.click(trigger);

    expect(screen.getByTestId('profile-email')).toHaveTextContent('Compte invité');
  });

  it('closes profile menu when clicking outside', async () => {
    render(
      <MemoryRouter>
        <div>
          <div data-testid="outside-element">Extérieur</div>
          <AppHeader />
        </div>
      </MemoryRouter>
    );

    const trigger = screen.getByTestId('profile-menu-trigger');
    await userEvent.click(trigger);
    expect(screen.getByTestId('profile-menu')).toBeInTheDocument();

    // Click outside
    fireEvent.mouseDown(screen.getByTestId('outside-element'));
    expect(screen.queryByTestId('profile-menu')).not.toBeInTheDocument();
  });

  it('displays publisher badge and link to /publisher for publisher users', async () => {
    useAuthStore.getState().setUser({ email: 'prof@univ.edu', is_publisher: true });
    useAuthStore.getState().setIsPublisher(true);

    render(
      <MemoryRouter initialEntries={['/courses']}>
        <LocationTracker />
        <AppHeader />
      </MemoryRouter>
    );

    const trigger = screen.getByTestId('profile-menu-trigger');
    await userEvent.click(trigger);

    expect(screen.getByTestId('profile-menu')).toBeInTheDocument();
    expect(screen.getByTestId('profile-email')).toHaveTextContent('prof@univ.edu');
    expect(screen.getByTestId('publisher-badge')).toHaveTextContent('Éditeur');

    const publisherLink = screen.getByTestId('publisher-link');
    expect(publisherLink).toBeInTheDocument();
    expect(publisherLink).toHaveTextContent('Espace Éditeur');

    // Clicking publisher link closes menu and navigates
    await userEvent.click(publisherLink);
    expect(screen.queryByTestId('profile-menu')).not.toBeInTheDocument();
    expect(screen.getByTestId('location-display')).toHaveTextContent('/publisher');
  });

  it('logs out user and redirects to /login on clicking logout button', async () => {
    useAuthStore.getState().setTokens({ access: 'valid-access', refresh: 'valid-refresh' });
    useAuthStore.getState().setUser({ email: 'student@brainx.io', is_publisher: false });

    render(
      <MemoryRouter initialEntries={['/courses']}>
        <LocationTracker />
        <AppHeader />
      </MemoryRouter>
    );

    const trigger = screen.getByTestId('profile-menu-trigger');
    await userEvent.click(trigger);

    const logoutBtn = screen.getByTestId('logout-button');
    expect(logoutBtn).toBeInTheDocument();
    expect(logoutBtn).toHaveTextContent(/Se déconnecter/i);

    await userEvent.click(logoutBtn);

    // Auth tokens and user state cleared
    expect(useAuthStore.getState().accessToken).toBeNull();
    expect(useAuthStore.getState().user).toBeNull();

    // Navigates to /login
    expect(screen.getByTestId('location-display')).toHaveTextContent('/login');
    expect(screen.queryByTestId('profile-menu')).not.toBeInTheDocument();
  });

  it('renders custom drawer trigger elements in their responsive slots', () => {
    render(
      <MemoryRouter>
        <AppHeader
          leftDrawerTrigger={<button data-testid="custom-left-btn">Sommaire</button>}
          rightDrawerTrigger={<button data-testid="custom-right-btn">TOC</button>}
        />
      </MemoryRouter>
    );

    expect(screen.getByTestId('custom-left-btn')).toBeInTheDocument();
    expect(screen.getByTestId('right-drawer-slot')).toBeInTheDocument();
    expect(screen.getByTestId('custom-right-btn')).toBeInTheDocument();
  });
});
