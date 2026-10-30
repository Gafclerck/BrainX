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
        screen.getByRole('heading', {
          level: 3,
          name: /Introduction aux Vues Génériques Django/i,
        })
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

  describe('Story FE-3.2: Carte de Résultat de Recherche & Affichage des 5 Champs Contextuels', () => {
    it('AC-1: displays all 5 mandatory context fields for each card in the palette', async () => {
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

      await act(async () => {
        await useSearchStore.getState().search('django');
      });

      // 1. Heading h3
      expect(
        screen.getByRole('heading', {
          level: 3,
          name: /Introduction aux Vues Génériques Django/i,
        })
      ).toBeInTheDocument();

      // 2. Ancestry
      const ancestry = screen.getByTestId(
        `search-result-ancestry-${mockSearchResults.results[0].id}`
      );
      expect(ancestry).toHaveTextContent(/Architecture Django.*Vues et Routage.*Vues Basées sur les Classes/);

      // 3. Teacher
      expect(
        screen.getByTestId(`search-result-teacher-${mockSearchResults.results[0].id}`)
      ).toHaveTextContent('Enseignant : Prof. Ada Lovelace');

      // 4. ISO Date
      expect(
        screen.getByTestId(`search-result-date-${mockSearchResults.results[0].id}`)
      ).toHaveTextContent('2026-10-28');

      // 5. Resource badge for first result and fallback for second
      expect(
        screen.getByTestId(`search-result-resources-${mockSearchResults.results[0].id}`)
      ).toBeInTheDocument();
      expect(
        screen.getByTestId(`search-result-no-resources-${mockSearchResults.results[1].id}`)
      ).toHaveTextContent('Aucune ressource');
    });

    it('AC-2: enforces strict client-side descending date order (AD-7)', async () => {
      const unsortedData = {
        count: 3,
        results: [
          {
            id: 'lesson-sep',
            title: 'Leçon de Septembre',
            course_name: 'C1',
            module_name: 'M1',
            chapter_name: 'CH1',
            course_date: '2026-09-01',
          },
          {
            id: 'lesson-late-oct',
            title: 'Leçon de Fin Octobre',
            course_name: 'C1',
            module_name: 'M1',
            chapter_name: 'CH1',
            course_date: '2026-10-28',
          },
          {
            id: 'lesson-mid-oct',
            title: 'Leçon de Mi Octobre',
            course_name: 'C1',
            module_name: 'M1',
            chapter_name: 'CH1',
            course_date: '2026-10-15',
          },
        ],
      };

      const fetchMock = vi.fn().mockImplementation(async () =>
        createJsonResponse(unsortedData)
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
        await useSearchStore.getState().search('leçon');
      });

      const cardElements = screen.getAllByRole('option');
      expect(cardElements).toHaveLength(3);
      // Order should strictly be: 2026-10-28, then 2026-10-15, then 2026-09-01
      expect(cardElements[0]).toHaveAttribute('id', 'search-result-item-lesson-late-oct');
      expect(cardElements[1]).toHaveAttribute('id', 'search-result-item-lesson-mid-oct');
      expect(cardElements[2]).toHaveAttribute('id', 'search-result-item-lesson-sep');
    });

    it('AC-2b: enforces stable tie-breaking for identical dates and undated items', async () => {
      const tieBreakData = {
        count: 4,
        results: [
          {
            id: 'lesson-undated-b',
            title: 'Z Undated Lesson',
            course_name: 'C1',
            module_name: 'M1',
            chapter_name: 'CH1',
            course_date: undefined,
          },
          {
            id: 'lesson-same-date-b',
            title: 'Beta Same Date',
            course_name: 'C1',
            module_name: 'M1',
            chapter_name: 'CH1',
            course_date: '2026-10-15',
          },
          {
            id: 'lesson-same-date-a',
            title: 'Alpha Same Date',
            course_name: 'C1',
            module_name: 'M1',
            chapter_name: 'CH1',
            course_date: '2026-10-15',
          },
          {
            id: 'lesson-undated-a',
            title: 'A Undated Lesson',
            course_name: 'C1',
            module_name: 'M1',
            chapter_name: 'CH1',
            course_date: undefined,
          },
        ],
      };

      const fetchMock = vi.fn().mockImplementation(async () =>
        createJsonResponse(tieBreakData)
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
        await useSearchStore.getState().search('lesson');
      });

      const cardElements = screen.getAllByRole('option');
      expect(cardElements).toHaveLength(4);
      // Dated items first, tie-broken alphabetically by title: "Alpha Same Date" then "Beta Same Date"
      // Undated items last, tie-broken alphabetically by title: "A Undated Lesson" then "Z Undated Lesson"
      expect(cardElements[0]).toHaveAttribute('id', 'search-result-item-lesson-same-date-a');
      expect(cardElements[1]).toHaveAttribute('id', 'search-result-item-lesson-same-date-b');
      expect(cardElements[2]).toHaveAttribute('id', 'search-result-item-lesson-undated-a');
      expect(cardElements[3]).toHaveAttribute('id', 'search-result-item-lesson-undated-b');
    });

    it('AC-3: highlights matched query terms with technical amber text-highlight and bg-highlight/15', async () => {
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

      await act(async () => {
        await useSearchStore.getState().search('django');
      });

      const marks = screen.getAllByTestId('search-highlight');
      expect(marks.length).toBeGreaterThan(0);
      marks.forEach((mark) => {
        expect(mark.className).toContain('text-highlight');
        expect(mark.className).toContain('bg-highlight/15');
      });
    });

    it('AC-4: displays exact courteous technical guidance when search yields zero results', async () => {
      const fetchMock = vi.fn().mockImplementation(async () =>
        createJsonResponse({ count: 0, results: [] })
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
        await useSearchStore.getState().search('introuvable');
      });

      const emptyNotice = screen.getByTestId('search-empty-results');
      expect(emptyNotice).toBeInTheDocument();
      expect(emptyNotice).toHaveTextContent(
        'Aucune leçon trouvée pour "introuvable". Essayez un mot-clé plus court ou un nom d\'enseignant.'
      );
    });

    it('AC-5: cycles through cards with ArrowDown/ArrowUp and navigates on Enter', async () => {
      const fetchMock = vi.fn().mockImplementation(async () =>
        createJsonResponse(mockSearchResults)
      );
      globalThis.fetch = fetchMock;

      render(
        <MemoryRouter initialEntries={['/courses']}>
          <LocationTracker />
          <SearchDialog />
        </MemoryRouter>
      );

      act(() => {
        useSearchStore.getState().openSearch();
      });

      await act(async () => {
        await useSearchStore.getState().search('django');
      });

      const input = screen.getByTestId('search-dialog-input');
      const cards = screen.getAllByRole('option');
      expect(cards).toHaveLength(2);

      // Initial state: no card is selected
      expect(cards[0]).toHaveAttribute('aria-selected', 'false');
      expect(cards[1]).toHaveAttribute('aria-selected', 'false');

      // Press ArrowDown -> first card becomes active
      fireEvent.keyDown(input, { key: 'ArrowDown', code: 'ArrowDown' });
      expect(cards[0]).toHaveAttribute('aria-selected', 'true');
      expect(cards[1]).toHaveAttribute('aria-selected', 'false');
      // Query is preserved
      expect(input).toHaveValue('django');

      // Press ArrowDown again -> second card becomes active
      fireEvent.keyDown(input, { key: 'ArrowDown', code: 'ArrowDown' });
      expect(cards[0]).toHaveAttribute('aria-selected', 'false');
      expect(cards[1]).toHaveAttribute('aria-selected', 'true');

      // Press ArrowUp -> first card becomes active again
      fireEvent.keyDown(input, { key: 'ArrowUp', code: 'ArrowUp' });
      expect(cards[0]).toHaveAttribute('aria-selected', 'true');
      expect(cards[1]).toHaveAttribute('aria-selected', 'false');

      // Press ArrowUp from card 0 -> active state resets to -1 and input receives focus
      fireEvent.keyDown(input, { key: 'ArrowUp', code: 'ArrowUp' });
      expect(cards[0]).toHaveAttribute('aria-selected', 'false');
      expect(cards[1]).toHaveAttribute('aria-selected', 'false');
      expect(input).toHaveFocus();

      // Press ArrowDown again -> card 0 becomes active
      fireEvent.keyDown(input, { key: 'ArrowDown', code: 'ArrowDown' });
      expect(cards[0]).toHaveAttribute('aria-selected', 'true');

      // Press Enter -> navigates to first card lesson id and closes dialog
      fireEvent.keyDown(input, { key: 'Enter', code: 'Enter' });

      await waitFor(() => {
        expect(screen.queryByTestId('search-dialog-content')).not.toBeInTheDocument();
      });
      expect(screen.getByTestId('location-display')).toHaveTextContent(
        `/lessons/${mockSearchResults.results[0].id}`
      );
    });

    it('guards Enter so pressing Enter on child buttons does not trigger search or navigation', async () => {
      const fetchMock = vi.fn().mockImplementation(async () =>
        createJsonResponse(mockSearchResults)
      );
      globalThis.fetch = fetchMock;

      render(
        <MemoryRouter initialEntries={['/courses']}>
          <LocationTracker />
          <SearchDialog />
        </MemoryRouter>
      );

      act(() => {
        useSearchStore.getState().openSearch();
      });

      await act(async () => {
        await useSearchStore.getState().search('django');
      });

      const clearBtn = screen.getByTestId('search-clear-button');
      clearBtn.focus();

      // Press Enter on the clear button
      fireEvent.keyDown(clearBtn, { key: 'Enter', code: 'Enter' });

      // Dialog should still be open, no navigation occurred
      expect(screen.getByTestId('search-dialog-content')).toBeInTheDocument();
      expect(screen.getByTestId('location-display')).toHaveTextContent('/courses');
    });

    it('renders input with combobox ARIA attributes and listbox id', async () => {
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

      await act(async () => {
        await useSearchStore.getState().search('django');
      });

      const input = screen.getByTestId('search-dialog-input');
      expect(input).toHaveAttribute('role', 'combobox');
      expect(input).toHaveAttribute('aria-expanded', 'true');
      expect(input).toHaveAttribute('aria-controls', 'search-results-list');
      expect(input).toHaveAttribute('aria-autocomplete', 'list');

      const listbox = screen.getByTestId('search-results-list');
      expect(listbox).toHaveAttribute('id', 'search-results-list');
    });
  });
});
