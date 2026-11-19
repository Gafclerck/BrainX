import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { render, screen, waitFor, fireEvent } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { MemoryRouter, Routes, Route } from 'react-router-dom';
import { SearchFeedbackPrompt } from './search-feedback-prompt';
import { useSearchSessionStore, FEEDBACK_DONE_STORAGE_PREFIX } from './search-session-store';
import { useAuthStore } from '@/features/auth/auth-store';

describe('Story FE-3.4: Widget de Feedback Discret SearchFeedbackPrompt Unit Tests', () => {
  const originalFetch = globalThis.fetch;

  beforeEach(() => {
    vi.restoreAllMocks();
    sessionStorage.clear();
    useAuthStore.getState().setTokens({
      access: 'mock_token',
      refresh: 'mock_refresh',
    });
    useSearchSessionStore.getState().resetSession();
  });

  afterEach(() => {
    globalThis.fetch = originalFetch;
  });

  const renderWithRouter = (
    ui: React.ReactNode,
    initialEntries = ['/lessons/lesson-uuid-1']
  ) => {
    return render(
      <MemoryRouter initialEntries={initialEntries}>
        <Routes>
          <Route path="/lessons/:lessonId" element={ui} />
          <Route path="/other" element={<div>Other Page</div>} />
        </Routes>
      </MemoryRouter>
    );
  };

  // ---------------------------------------------------------------------------
  // AC-1: Visibility Conditions & Content
  // ---------------------------------------------------------------------------
  describe('AC-1: Visibility & Rendering Conditions', () => {
    it('renders the floating prompt when lesson was opened from an active/closed search session', () => {
      useSearchSessionStore.getState().setSessionId('sess-123');
      useSearchSessionStore.getState().closeSession('lesson-uuid-1');

      renderWithRouter(<SearchFeedbackPrompt />);

      const prompt = screen.getByTestId('search-feedback-prompt');
      expect(prompt).toBeInTheDocument();
      expect(prompt).toHaveAttribute('role', 'region');
      expect(prompt).toHaveAttribute('aria-label', 'Retour sur la recherche');
      expect(prompt).toHaveAttribute('aria-live', 'polite');

      // Question text
      expect(screen.getByTestId('search-feedback-question')).toHaveTextContent(
        'Avez-vous trouvé ce que vous cherchiez ?'
      );

      // Binary actions & dismiss button
      expect(screen.getByTestId('search-feedback-yes')).toBeInTheDocument();
      expect(screen.getByTestId('search-feedback-no')).toBeInTheDocument();
      expect(screen.getByTestId('search-feedback-close')).toBeInTheDocument();
    });

    it('renders when search session id is provided via query parameters', () => {
      renderWithRouter(
        <SearchFeedbackPrompt />,
        ['/lessons/lesson-uuid-1?session_id=sess-query-param']
      );

      expect(screen.getByTestId('search-feedback-prompt')).toBeInTheDocument();
      expect(screen.getByTestId('search-feedback-question')).toBeInTheDocument();
    });

    it('renders when explicit searchSessionId and lessonId props are passed', () => {
      render(
        <MemoryRouter>
          <SearchFeedbackPrompt
            lessonId="les-prop-1"
            searchSessionId="sess-prop-1"
          />
        </MemoryRouter>
      );

      expect(screen.getByTestId('search-feedback-prompt')).toBeInTheDocument();
    });

    it('does NOT render when student navigated directly (status: idle)', () => {
      // Store is in default idle state without session
      renderWithRouter(<SearchFeedbackPrompt />);

      expect(screen.queryByTestId('search-feedback-prompt')).toBeNull();
      expect(screen.queryByText(/Avez-vous trouvé ce que vous cherchiez \?/i)).toBeNull();
    });

    it('does NOT render when lastOpenedLessonId does not match current lessonId', () => {
      useSearchSessionStore.getState().setSessionId('sess-123');
      useSearchSessionStore.getState().closeSession('other-lesson-id');

      renderWithRouter(<SearchFeedbackPrompt />);

      expect(screen.queryByTestId('search-feedback-prompt')).toBeNull();
    });

    it('does NOT render if session was already marked done in sessionStorage (Page Reload / Return scenario)', () => {
      useSearchSessionStore.getState().setSessionId('sess-persisted');
      useSearchSessionStore.getState().closeSession('lesson-uuid-1');
      sessionStorage.setItem(`${FEEDBACK_DONE_STORAGE_PREFIX}sess-persisted`, 'true');

      renderWithRouter(<SearchFeedbackPrompt />);

      expect(screen.queryByTestId('search-feedback-prompt')).toBeNull();
    });
  });

  // ---------------------------------------------------------------------------
  // AC-2: Actions & API Dispatch ([Oui] and [Non])
  // ---------------------------------------------------------------------------
  describe('AC-2: Binary Action Dispatch ([Oui] and [Non])', () => {
    it('dispatches POST /answer/ with found: true, X-Search-Session-Id header, and dismisses prompt on [Oui]', async () => {
      let requestedUrl = '';
      let requestedInit: RequestInit | undefined;

      globalThis.fetch = vi.fn().mockImplementation((url: string, init?: RequestInit) => {
        requestedUrl = url;
        requestedInit = init;
        return Promise.resolve(
          new Response(
            JSON.stringify({
              search_session_id: 'sess-yes-flow',
              found: true,
            }),
            { status: 201, headers: { 'Content-Type': 'application/json' } }
          )
        );
      });

      useSearchSessionStore.getState().setSessionId('sess-yes-flow');
      useSearchSessionStore.getState().closeSession('lesson-uuid-1');

      renderWithRouter(<SearchFeedbackPrompt />);

      const yesButton = screen.getByTestId('search-feedback-yes');
      expect(yesButton).toHaveTextContent('Oui');
      expect(yesButton).toHaveAttribute(
        'aria-label',
        "Oui, j'ai trouvé ce que je cherchais"
      );

      const user = userEvent.setup();
      await user.click(yesButton);

      // Banner disappears immediately
      expect(screen.queryByTestId('search-feedback-prompt')).toBeNull();

      // Verify dispatched API payload and headers
      await waitFor(() => {
        expect(requestedUrl).toContain('/api/v1/search/sessions/answer/');
      });
      expect(requestedInit?.method).toBe('POST');
      expect((requestedInit?.headers as Record<string, string>)['X-Search-Session-Id']).toBe('sess-yes-flow');

      const body = JSON.parse(requestedInit?.body as string);
      expect(body).toEqual({
        session_id: 'sess-yes-flow',
        search_session_id: 'sess-yes-flow',
        found: true,
      });

      // Session is permanently marked done in sessionStorage
      expect(sessionStorage.getItem(`${FEEDBACK_DONE_STORAGE_PREFIX}sess-yes-flow`)).toBe('true');
    });

    it('dispatches POST /answer/ with found: false, X-Search-Session-Id header, and dismisses prompt on [Non]', async () => {
      let requestedUrl = '';
      let requestedInit: RequestInit | undefined;

      globalThis.fetch = vi.fn().mockImplementation((url: string, init?: RequestInit) => {
        requestedUrl = url;
        requestedInit = init;
        return Promise.resolve(
          new Response(
            JSON.stringify({
              search_session_id: 'sess-no-flow',
              found: false,
            }),
            { status: 201, headers: { 'Content-Type': 'application/json' } }
          )
        );
      });

      useSearchSessionStore.getState().setSessionId('sess-no-flow');
      useSearchSessionStore.getState().closeSession('lesson-uuid-1');

      renderWithRouter(<SearchFeedbackPrompt />);

      const noButton = screen.getByTestId('search-feedback-no');
      expect(noButton).toHaveTextContent('Non');
      expect(noButton).toHaveAttribute(
        'aria-label',
        "Non, je n'ai pas trouvé ce que je cherchais"
      );

      const user = userEvent.setup();
      await user.click(noButton);

      // Banner disappears immediately
      expect(screen.queryByTestId('search-feedback-prompt')).toBeNull();

      await waitFor(() => {
        expect(requestedUrl).toContain('/api/v1/search/sessions/answer/');
      });
      expect(requestedInit?.method).toBe('POST');
      expect((requestedInit?.headers as Record<string, string>)['X-Search-Session-Id']).toBe('sess-no-flow');

      const body = JSON.parse(requestedInit?.body as string);
      expect(body.found).toBe(false);

      expect(sessionStorage.getItem(`${FEEDBACK_DONE_STORAGE_PREFIX}sess-no-flow`)).toBe('true');
    });

    it('swallows network failure and 409 Conflict silently without crashing or showing modal dialogs', async () => {
      globalThis.fetch = vi.fn().mockImplementation(() =>
        Promise.resolve(
          new Response(
            JSON.stringify({
              type: 'about:blank',
              title: 'Conflict',
              status: 409,
              detail: 'An answer has already been recorded for this search session.',
            }),
            { status: 409, headers: { 'Content-Type': 'application/json' } }
          )
        )
      );

      useSearchSessionStore.getState().setSessionId('sess-err');
      useSearchSessionStore.getState().closeSession('lesson-uuid-1');

      renderWithRouter(<SearchFeedbackPrompt />);

      const yesButton = screen.getByTestId('search-feedback-yes');
      const user = userEvent.setup();
      await user.click(yesButton);

      // Prompt disappears and no modal dialog or crash occurs
      expect(screen.queryByTestId('search-feedback-prompt')).toBeNull();
      expect(sessionStorage.getItem(`${FEEDBACK_DONE_STORAGE_PREFIX}sess-err`)).toBe('true');
    });
  });

  // ---------------------------------------------------------------------------
  // AC-3: Dismiss Without Answer & Permanent Dismissal
  // ---------------------------------------------------------------------------
  describe('AC-3: Dismiss Without Answer & Permanent Dismissal', () => {
    it('clicking dismiss button [Fermer] hides prompt permanently without dispatching answer API', async () => {
      const fetchSpy = vi.fn();
      globalThis.fetch = fetchSpy;

      useSearchSessionStore.getState().setSessionId('sess-dismiss-flow');
      await useSearchSessionStore.getState().closeSession('lesson-uuid-1');
      fetchSpy.mockClear();

      renderWithRouter(<SearchFeedbackPrompt />);

      const closeButton = screen.getByTestId('search-feedback-close');
      expect(closeButton).toHaveAttribute('aria-label', 'Fermer le bandeau de retour');

      const user = userEvent.setup();
      await user.click(closeButton);

      // Prompt disappears immediately
      expect(screen.queryByTestId('search-feedback-prompt')).toBeNull();

      // No network call dispatched
      expect(fetchSpy).not.toHaveBeenCalled();

      // Recorded in sessionStorage
      expect(
        sessionStorage.getItem(`${FEEDBACK_DONE_STORAGE_PREFIX}sess-dismiss-flow`)
      ).toBe('true');
    });

    it('prevents duplicate answer requests on rapid double-clicks', async () => {
      const fetchSpy = vi.fn().mockImplementation(() =>
        Promise.resolve(
          new Response(JSON.stringify({ search_session_id: 'sess-rapid', found: true }), {
            status: 201,
            headers: { 'Content-Type': 'application/json' },
          })
        )
      );
      globalThis.fetch = fetchSpy;

      useSearchSessionStore.getState().setSessionId('sess-rapid');
      await useSearchSessionStore.getState().closeSession('lesson-uuid-1');
      fetchSpy.mockClear();

      renderWithRouter(<SearchFeedbackPrompt />);

      const yesButton = screen.getByTestId('search-feedback-yes');
      fireEvent.click(yesButton);
      fireEvent.click(yesButton);

      await waitFor(() => {
        expect(fetchSpy).toHaveBeenCalledTimes(1);
      });
    });
  });

  // ---------------------------------------------------------------------------
  // Accessibility & Design Token Validation
  // ---------------------------------------------------------------------------
  describe('Accessibility & Design Tokens', () => {
    it('applies styling tokens: bg-info-surface, border-info-border, fixed floating position, and 44px touch targets', () => {
      useSearchSessionStore.getState().setSessionId('sess-tokens');
      useSearchSessionStore.getState().closeSession('lesson-uuid-1');

      renderWithRouter(<SearchFeedbackPrompt />);

      const prompt = screen.getByTestId('search-feedback-prompt');
      expect(prompt.className).toContain('fixed');
      expect(prompt.className).toContain('bottom-4');
      expect(prompt.className).toContain('bg-info-surface');
      expect(prompt.className).toContain('border-info-border');
      expect(prompt.className).toContain('z-40');
      expect(prompt.className).toContain('max-w-lg');

      const yesBtn = screen.getByTestId('search-feedback-yes');
      expect(yesBtn.className).toContain('min-h-[44px]');
      expect(yesBtn.className).toContain('min-w-[44px]');

      const noBtn = screen.getByTestId('search-feedback-no');
      expect(noBtn.className).toContain('min-h-[44px]');
      expect(noBtn.className).toContain('min-w-[44px]');

      const closeBtn = screen.getByTestId('search-feedback-close');
      expect(closeBtn.className).toContain('min-h-[44px]');
      expect(closeBtn.className).toContain('min-w-[44px]');
      expect(closeBtn.className).not.toContain('h-9');
      expect(closeBtn.className).not.toContain('w-9');
    });

    it('resets isDismissed and submittingRef when activeSessionId changes on mounted prompt', () => {
      const { rerender } = render(
        <MemoryRouter initialEntries={['/lessons/lesson-1']}>
          <SearchFeedbackPrompt lessonId="lesson-1" searchSessionId="session-1" />
        </MemoryRouter>
      );

      expect(screen.getByTestId('search-feedback-prompt')).toBeInTheDocument();

      // Dismiss for session-1
      const closeButton = screen.getByTestId('search-feedback-close');
      fireEvent.click(closeButton);
      expect(screen.queryByTestId('search-feedback-prompt')).toBeNull();

      // Rerender with session-2: must reset dismissal and display prompt again
      rerender(
        <MemoryRouter initialEntries={['/lessons/lesson-1']}>
          <SearchFeedbackPrompt lessonId="lesson-1" searchSessionId="session-2" />
        </MemoryRouter>
      );

      expect(screen.getByTestId('search-feedback-prompt')).toBeInTheDocument();
    });

    it('clears lastOpenedLessonId on prompt unmount to prevent direct navigation resurrection', () => {
      useSearchSessionStore.getState().setSessionId('sess-unmount');
      useSearchSessionStore.getState().closeSession('lesson-uuid-1');
      expect(useSearchSessionStore.getState().lastOpenedLessonId).toBe('lesson-uuid-1');

      const { unmount } = renderWithRouter(<SearchFeedbackPrompt />);
      expect(screen.getByTestId('search-feedback-prompt')).toBeInTheDocument();

      unmount();

      expect(useSearchSessionStore.getState().lastOpenedLessonId).toBeNull();
    });
  });
});
