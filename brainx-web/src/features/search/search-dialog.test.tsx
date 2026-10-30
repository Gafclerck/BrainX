import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { render, screen, fireEvent, waitFor, act } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { MemoryRouter, useLocation } from 'react-router-dom';
import { useAuthStore } from '@/features/auth/auth-store';
import { useSearchStore } from './search-store';
import { SearchDialog } from './search-dialog';
import { StudentLayout } from '@/components/layout/student-layout';
import type { SearchLessonItem } from './types';

function LocationTracker() {
  const location = useLocation();
  return <div data-testid="location-display">{location.pathname}</div>;
}

const mockSearchResults = {
  count: 2,
  next: null,
  previous: null,
  results: [
    {
      id: 'l1111111-1111-1111-1111-111111111111',
      title: 'Introduction aux Vues Génériques Django',
      course_name: 'Architecture Django',
      module_name: 'Vues et Routage',
      chapter_name: 'Vues Basées sur les Classes',
      teacher: 'Prof. Ada Lovelace',
      course_date: '2026-10-28',
      resources: [
        {
          id: 'r1',
          type: 'document' as const,
          title: 'Guide PDF',
        },
      ],
    },
    {
      id: 'l2222222-2222-2222-2222-222222222222',
      title: 'Authentification JWT et Sécurité',
      course_name: 'Architecture Django',
      module_name: 'Vues et Routage',
      chapter_name: 'Vues Basées sur les Classes',
      teacher: 'Prof. Alan Turing',
      course_date: '2026-10-25',
    },
  ],
  search_session_id: 's9999999-9999-9999-9999-999999999999',
};

function createJsonResponse(data: unknown, status = 200, headers: Record<string, string> = {}) {
  return new Response(JSON.stringify(data), {
    status,
    headers: {
      'Content-Type': 'application/json',
      ...headers,
    },
  });
}

describe('Story FE-3.1: Palette de Commande de Recherche Globale (Cmd+K)', () => {
  const originalFetch = globalThis.fetch;

  beforeEach(() => {
    vi.restoreAllMocks();
    useAuthStore.getState().clearAuth();
    useAuthStore.getState().setTokens({
      access: 'valid_access_token',
      refresh: 'valid_refresh_token',
    });
    useSearchStore.getState().reset();
  });

  afterEach(() => {
    globalThis.fetch = originalFetch;
    vi.useRealTimers();
  });

  describe('AC-1: Trigger & Autofocus Modal Command Palette', () => {
    it('opens search palette when user clicks the search bar in AppHeader and focuses search input', async () => {
      render(
        <MemoryRouter initialEntries={['/courses']}>
          <StudentLayout>
            <div>Page Content</div>
          </StudentLayout>
        </MemoryRouter>
      );

      // Search dialog should initially be closed
      expect(screen.queryByTestId('search-dialog-content')).not.toBeInTheDocument();

      const searchTrigger = screen.getByTestId('search-trigger');
      searchTrigger.focus();
      expect(searchTrigger).toHaveFocus();

      await userEvent.click(searchTrigger);

      // Search dialog opens
      expect(screen.getByTestId('search-dialog-content')).toBeInTheDocument();
      expect(screen.getByTestId('search-dialog-backdrop')).toBeInTheDocument();

      const input = screen.getByTestId('search-dialog-input');
      expect(input).toBeInTheDocument();
      expect(input).toHaveFocus();
    });

    it('opens search palette globally on Cmd+K (Mac) keydown and automatically focuses input', async () => {
      render(
        <MemoryRouter initialEntries={['/courses']}>
          <StudentLayout>
            <div>Page Content</div>
          </StudentLayout>
        </MemoryRouter>
      );

      // Trigger Cmd+K
      const cmdKEvent = new KeyboardEvent('keydown', {
        key: 'k',
        metaKey: true,
        bubbles: true,
        cancelable: true,
      });
      act(() => {
        window.dispatchEvent(cmdKEvent);
      });

      await waitFor(() => {
        expect(screen.getByTestId('search-dialog-content')).toBeInTheDocument();
      });

      const input = screen.getByTestId('search-dialog-input');
      expect(input).toBeInTheDocument();
      await waitFor(() => {
        expect(input).toHaveFocus();
      });
    });

    it('opens search palette globally on Ctrl+K (Windows/Linux) keydown and automatically focuses input', async () => {
      render(
        <MemoryRouter initialEntries={['/courses']}>
          <StudentLayout>
            <div>Page Content</div>
          </StudentLayout>
        </MemoryRouter>
      );

      // Trigger Ctrl+K
      const ctrlKEvent = new KeyboardEvent('keydown', {
        key: 'k',
        ctrlKey: true,
        bubbles: true,
        cancelable: true,
      });
      act(() => {
        window.dispatchEvent(ctrlKEvent);
      });

      await waitFor(() => {
        expect(screen.getByTestId('search-dialog-content')).toBeInTheDocument();
      });

      const input = screen.getByTestId('search-dialog-input');
      expect(input).toBeInTheDocument();
      await waitFor(() => {
        expect(input).toHaveFocus();
      });
    });
  });

  describe('AC-2: Mobile Viewport (< 768px) Full-screen & 360px Floor & Touch Targets', () => {
    it('renders with responsive full-screen classes on mobile and centered modal on desktop', () => {
      render(
        <MemoryRouter>
          <SearchDialog />
        </MemoryRouter>
      );

      act(() => {
        useSearchStore.getState().openSearch();
      });

      const content = screen.getByTestId('search-dialog-content');
      expect(content).toBeInTheDocument();

      // Mobile styling classes: full-screen, 360px floor, dark background
      expect(content.className).toContain('fixed');
      expect(content.className).toContain('inset-0');
      expect(content.className).toContain('w-full');
      expect(content.className).toContain('h-full');
      expect(content.className).toContain('min-w-[360px]');
      expect(content.className).toContain('bg-surface');

      // Desktop breakpoint overrides (md:)
      expect(content.className).toContain('md:max-w-2xl');
      expect(content.className).toContain('md:rounded-lg');
      expect(content.className).toContain('md:border-border');

      // Close button has minimum 48x48px touch target
      const closeBtn = screen.getByTestId('search-dialog-close');
      expect(closeBtn).toBeInTheDocument();
      expect(closeBtn.className).toContain('min-h-[48px]');
      expect(closeBtn.className).toContain('min-w-[48px]');
      expect(closeBtn.className).toContain('h-12');
      expect(closeBtn.className).toContain('w-12');
      expect(closeBtn).toHaveAttribute('aria-label', 'Fermer');
    });
  });

  describe('AC-3: 300ms Debounce, In-Flight Cancellation, Enter Key & Stale Results', () => {
    it('debounces API requests by 300ms before dispatching GET /api/v1/search/lessons/?query=...', async () => {
      vi.useFakeTimers();

      const fetchMock = vi.fn().mockImplementation(async () =>
        createJsonResponse(mockSearchResults)
      );
      globalThis.fetch = fetchMock;

      render(
        <MemoryRouter>
          <SearchDialog />
        </MemoryRouter>
      );

      act(() => {
        useSearchStore.getState().openSearch();
      });

      const input = screen.getByTestId('search-dialog-input');

      // Type "django"
      act(() => {
        fireEvent.change(input, { target: { value: 'django' } });
      });

      // At 0ms, fetch should NOT have been called, and no flash of empty results
      expect(fetchMock).not.toHaveBeenCalled();
      expect(screen.queryByTestId('search-empty-results')).not.toBeInTheDocument();

      // Advance by 200ms -> Still no call, no empty results flash
      act(() => {
        vi.advanceTimersByTime(200);
      });
      expect(fetchMock).not.toHaveBeenCalled();
      expect(screen.queryByTestId('search-empty-results')).not.toBeInTheDocument();

      // Advance remaining 100ms (total 300ms) -> fetch is dispatched
      await act(async () => {
        vi.advanceTimersByTime(100);
      });

      expect(fetchMock).toHaveBeenCalledTimes(1);
      const calledUrl = fetchMock.mock.calls[0][0];
      expect(calledUrl).toContain('/api/v1/search/lessons/?query=django');

      // Results rendered
      expect(screen.getByTestId('search-results-list')).toBeInTheDocument();
      expect(
        screen.getByText('Introduction aux Vues Génériques Django')
      ).toBeInTheDocument();
      expect(screen.getByText('Authentification JWT et Sécurité')).toBeInTheDocument();
    });

    it('clears stale results immediately when typing a new query during the debounce interval', async () => {
      vi.useFakeTimers();

      const fetchMock = vi.fn().mockImplementation(async () =>
        createJsonResponse(mockSearchResults)
      );
      globalThis.fetch = fetchMock;

      render(
        <MemoryRouter>
          <SearchDialog />
        </MemoryRouter>
      );

      act(() => {
        useSearchStore.getState().openSearch();
      });

      const input = screen.getByTestId('search-dialog-input');

      // Initial search resolves
      act(() => {
        fireEvent.change(input, { target: { value: 'django' } });
      });
      await act(async () => {
        vi.advanceTimersByTime(300);
      });
      expect(screen.getByTestId('search-results-list')).toBeInTheDocument();

      // User types new query "python" -> old results should immediately be cleared, no flash of empty results
      act(() => {
        fireEvent.change(input, { target: { value: 'python' } });
      });

      expect(screen.queryByTestId('search-results-list')).not.toBeInTheDocument();
      expect(screen.queryByTestId('search-empty-results')).not.toBeInTheDocument();

      // Wait 300ms -> new search executes
      await act(async () => {
        vi.advanceTimersByTime(300);
      });
      expect(screen.getByTestId('search-results-list')).toBeInTheDocument();
    });

    it('immediately triggers search when pressing Enter in search input without waiting for 300ms debounce', async () => {
      vi.useFakeTimers();

      const fetchMock = vi.fn().mockImplementation(async () =>
        createJsonResponse(mockSearchResults)
      );
      globalThis.fetch = fetchMock;

      render(
        <MemoryRouter>
          <SearchDialog />
        </MemoryRouter>
      );

      act(() => {
        useSearchStore.getState().openSearch();
      });

      const input = screen.getByTestId('search-dialog-input');

      act(() => {
        fireEvent.change(input, { target: { value: 'fast-search' } });
      });

      expect(fetchMock).not.toHaveBeenCalled();

      // Press Enter immediately
      await act(async () => {
        fireEvent.keyDown(input, { key: 'Enter', code: 'Enter' });
      });

      // Dispatched immediately!
      expect(fetchMock).toHaveBeenCalledTimes(1);
      expect(fetchMock.mock.calls[0][0]).toContain('query=fast-search');
      expect(screen.getByTestId('search-results-list')).toBeInTheDocument();
    });

    it('cancels intermediate timers on rapid keystrokes within 300ms and makes only 1 call', async () => {
      vi.useFakeTimers();

      const fetchMock = vi.fn().mockImplementation(async () =>
        createJsonResponse(mockSearchResults)
      );
      globalThis.fetch = fetchMock;

      render(
        <MemoryRouter>
          <SearchDialog />
        </MemoryRouter>
      );

      act(() => {
        useSearchStore.getState().openSearch();
      });

      const input = screen.getByTestId('search-dialog-input');

      // Rapid keystrokes: dja -> djang -> django
      act(() => {
        fireEvent.change(input, { target: { value: 'dja' } });
      });
      act(() => {
        vi.advanceTimersByTime(100);
      });
      expect(fetchMock).not.toHaveBeenCalled();

      act(() => {
        fireEvent.change(input, { target: { value: 'djang' } });
      });
      act(() => {
        vi.advanceTimersByTime(100);
      });
      expect(fetchMock).not.toHaveBeenCalled();

      act(() => {
        fireEvent.change(input, { target: { value: 'django' } });
      });
      act(() => {
        vi.advanceTimersByTime(100);
      });
      expect(fetchMock).not.toHaveBeenCalled();

      // Now wait the full 300ms after the last keystroke
      await act(async () => {
        vi.advanceTimersByTime(200);
      });

      // Exactly 1 call was made for the final query
      expect(fetchMock).toHaveBeenCalledTimes(1);
      expect(fetchMock.mock.calls[0][0]).toContain('query=django');
    });

    it('displays loading spinner during active API request', async () => {
      let resolvePromise: (val: any) => void;
      const delayedPromise = new Promise((resolve) => {
        resolvePromise = resolve;
      });

      const fetchMock = vi.fn().mockReturnValue(delayedPromise);
      globalThis.fetch = fetchMock;

      render(
        <MemoryRouter>
          <SearchDialog />
        </MemoryRouter>
      );

      act(() => {
        useSearchStore.getState().openSearch();
      });

      // Trigger search
      act(() => {
        useSearchStore.getState().search('django');
      });

      // Loading indicator should appear
      expect(screen.getByTestId('search-loading-indicator')).toBeInTheDocument();

      // Resolve the fetch
      await act(async () => {
        resolvePromise!(createJsonResponse(mockSearchResults));
      });

      // Loading indicator disappears and results appear
      expect(screen.queryByTestId('search-loading-indicator')).not.toBeInTheDocument();
      expect(screen.getByTestId('search-results-list')).toBeInTheDocument();
    });
  });

  describe('AC-4: Dismissal & Focus Restoration', () => {
    it('closes modal on Escape keydown and restores focus to triggering element', async () => {
      render(
        <MemoryRouter initialEntries={['/courses']}>
          <StudentLayout>
            <div>Contenu</div>
          </StudentLayout>
        </MemoryRouter>
      );

      const trigger = screen.getByTestId('search-trigger');
      trigger.focus();
      expect(trigger).toHaveFocus();

      // Click to open
      await userEvent.click(trigger);
      expect(screen.getByTestId('search-dialog-content')).toBeInTheDocument();

      // Press Escape
      fireEvent.keyDown(screen.getByTestId('search-dialog-content'), {
        key: 'Escape',
        code: 'Escape',
      });

      await waitFor(() => {
        expect(screen.queryByTestId('search-dialog-content')).not.toBeInTheDocument();
      });

      // Focus returned to trigger
      expect(document.activeElement).toBe(trigger);
    });

    it('closes modal when clicking close button and restores focus to trigger', async () => {
      render(
        <MemoryRouter initialEntries={['/courses']}>
          <StudentLayout>
            <div>Contenu</div>
          </StudentLayout>
        </MemoryRouter>
      );

      const trigger = screen.getByTestId('search-trigger');
      trigger.focus();

      await userEvent.click(trigger);
      expect(screen.getByTestId('search-dialog-content')).toBeInTheDocument();

      const closeBtn = screen.getByTestId('search-dialog-close');
      await userEvent.click(closeBtn);

      await waitFor(() => {
        expect(screen.queryByTestId('search-dialog-content')).not.toBeInTheDocument();
      });

      expect(document.activeElement).toBe(trigger);
    });

    it('does not attempt to focus trigger if trigger is detached from DOM', async () => {
      render(
        <MemoryRouter initialEntries={['/courses']}>
          <SearchDialog />
        </MemoryRouter>
      );

      const detachedBtn = document.createElement('button');
      // detachedBtn is not appended to document.body, so isConnected is false
      expect(detachedBtn.isConnected).toBe(false);

      const focusSpy = vi.spyOn(detachedBtn, 'focus');

      act(() => {
        useSearchStore.getState().openSearch();
      });

      expect(screen.getByTestId('search-dialog-content')).toBeInTheDocument();

      // Close search dialog
      act(() => {
        useSearchStore.getState().closeSearch();
      });

      await waitFor(() => {
        expect(screen.queryByTestId('search-dialog-content')).not.toBeInTheDocument();
      });

      expect(focusSpy).not.toHaveBeenCalled();
    });
  });

  describe('Edge Cases, Validation & Navigation', () => {
    it('displays guidance message without calling API for queries shorter than 3 characters', async () => {
      const fetchMock = vi.fn();
      globalThis.fetch = fetchMock;

      render(
        <MemoryRouter>
          <SearchDialog />
        </MemoryRouter>
      );

      act(() => {
        useSearchStore.getState().openSearch();
      });

      const input = screen.getByTestId('search-dialog-input');

      // Type 2 characters
      act(() => {
        fireEvent.change(input, { target: { value: 'py' } });
      });

      expect(fetchMock).not.toHaveBeenCalled();
      expect(screen.getByTestId('search-guidance-message')).toHaveTextContent(
        'Saisissez au moins 3 caractères pour lancer la recherche'
      );

      // Type query with spaces trimming to < 3 chars e.g. " a "
      act(() => {
        fireEvent.change(input, { target: { value: ' a ' } });
      });

      expect(fetchMock).not.toHaveBeenCalled();
      expect(screen.getByTestId('search-guidance-message')).toHaveTextContent(
        'Saisissez au moins 3 caractères pour lancer la recherche'
      );
    });

    it('rejects queries exceeding 200 characters without calling API or silent truncation', async () => {
      const fetchMock = vi.fn();
      globalThis.fetch = fetchMock;

      render(
        <MemoryRouter>
          <SearchDialog />
        </MemoryRouter>
      );

      act(() => {
        useSearchStore.getState().openSearch();
      });

      const longQuery = 'a'.repeat(201);
      const input = screen.getByTestId('search-dialog-input');

      act(() => {
        fireEvent.change(input, { target: { value: longQuery } });
      });

      expect(fetchMock).not.toHaveBeenCalled();
      expect(screen.getByTestId('search-validation-error')).toHaveTextContent(
        'La requête ne peut pas dépasser 200 caractères.'
      );
      // Query is preserved, not truncated silently
      expect(input).toHaveValue(longQuery);
    });

    it('clears results and displays neutral prompt when query is cleared or empty', async () => {
      const fetchMock = vi.fn().mockImplementation(async () =>
        createJsonResponse(mockSearchResults)
      );
      globalThis.fetch = fetchMock;

      render(
        <MemoryRouter>
          <SearchDialog />
        </MemoryRouter>
      );

      act(() => {
        useSearchStore.getState().openSearch();
      });

      const input = screen.getByTestId('search-dialog-input');

      // Initially empty -> neutral prompt
      expect(screen.getByTestId('search-neutral-prompt')).toBeInTheDocument();

      // Search valid query
      await act(async () => {
        await useSearchStore.getState().search('django');
      });

      expect(screen.getByTestId('search-results-list')).toBeInTheDocument();

      // User clears input
      act(() => {
        fireEvent.change(input, { target: { value: '' } });
      });

      expect(screen.queryByTestId('search-results-list')).not.toBeInTheDocument();
      expect(screen.getByTestId('search-neutral-prompt')).toBeInTheDocument();
    });

    it('displays clear button and resets input when clicked', async () => {
      render(
        <MemoryRouter>
          <SearchDialog />
        </MemoryRouter>
      );

      act(() => {
        useSearchStore.getState().openSearch();
      });

      const input = screen.getByTestId('search-dialog-input');
      expect(screen.queryByTestId('search-clear-button')).not.toBeInTheDocument();

      act(() => {
        fireEvent.change(input, { target: { value: 'python' } });
      });

      const clearBtn = screen.getByTestId('search-clear-button');
      expect(clearBtn).toBeInTheDocument();

      await userEvent.click(clearBtn);

      expect(input).toHaveValue('');
      expect(screen.getByTestId('search-neutral-prompt')).toBeInTheDocument();
    });

    it('displays empty state with full contextual copy when query yields zero results', async () => {
      const fetchMock = vi.fn().mockImplementation(async () =>
        createJsonResponse({
          count: 0,
          next: null,
          previous: null,
          results: [],
        })
      );
      globalThis.fetch = fetchMock;

      render(
        <MemoryRouter>
          <SearchDialog />
        </MemoryRouter>
      );

      act(() => {
        useSearchStore.getState().openSearch();
      });

      await act(async () => {
        await useSearchStore.getState().search('inexistant');
      });

      expect(screen.getByTestId('search-empty-results')).toBeInTheDocument();
      expect(screen.getByText('Aucun résultat')).toBeInTheDocument();
      expect(
        screen.getByText(
          'Aucune leçon trouvée pour "inexistant". Essayez un mot-clé plus court ou un nom d\'enseignant.'
        )
      ).toBeInTheDocument();
    });

    it('displays discrete error notice and resets count and results to 0/empty when API returns RFC 9457 error', async () => {
      const fetchMock = vi.fn().mockImplementation(async () =>
        createJsonResponse(
          {
            type: 'about:blank',
            title: 'Bad Request',
            status: 400,
            detail: 'Paramètre de recherche invalide.',
            errors: { query: ['Paramètre de recherche invalide.'] },
          },
          400
        )
      );
      globalThis.fetch = fetchMock;

      render(
        <MemoryRouter>
          <SearchDialog />
        </MemoryRouter>
      );

      act(() => {
        useSearchStore.getState().openSearch();
      });

      await act(async () => {
        await useSearchStore.getState().search('erreur');
      });

      expect(screen.getByTestId('search-error-notice')).toBeInTheDocument();
      expect(screen.getByText('Paramètre de recherche invalide.')).toBeInTheDocument();
      // Ensure store results and count are cleared on error
      expect(useSearchStore.getState().results).toEqual([]);
      expect(useSearchStore.getState().count).toBe(0);
    });

    it('navigates to /lessons/:id and closes dialog when student clicks a result', async () => {
      const fetchMock = vi.fn().mockImplementation(async () =>
        createJsonResponse(mockSearchResults)
      );
      globalThis.fetch = fetchMock;

      render(
        <MemoryRouter initialEntries={['/courses']}>
          <LocationTracker />
          <StudentLayout>
            <div>Page</div>
          </StudentLayout>
        </MemoryRouter>
      );

      act(() => {
        useSearchStore.getState().openSearch();
      });

      await act(async () => {
        await useSearchStore.getState().search('django');
      });

      const lessonBtn = screen.getByTestId(
        `search-result-item-${mockSearchResults.results[0].id}`
      );
      expect(lessonBtn).toBeInTheDocument();

      await userEvent.click(lessonBtn);

      // Dialog closed
      await waitFor(() => {
        expect(screen.queryByTestId('search-dialog-content')).not.toBeInTheDocument();
      });

      // Navigated to lesson detail
      expect(screen.getByTestId('location-display')).toHaveTextContent(
        `/lessons/${mockSearchResults.results[0].id}`
      );
    });

    it('supports optional resources field on SearchLessonItem', () => {
      const item: SearchLessonItem = {
        id: '1',
        title: 'Leçon avec ressources',
        course_name: 'C',
        module_name: 'M',
        chapter_name: 'CH',
        resources: [
          {
            id: 'r-1',
            type: 'video',
            title: 'Vidéo',
          },
        ],
      };
      expect(item.resources).toHaveLength(1);
      expect(item.resources![0].type).toBe('video');
    });
  });
});
