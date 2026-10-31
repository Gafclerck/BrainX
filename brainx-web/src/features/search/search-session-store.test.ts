import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { useSearchSessionStore, FEEDBACK_DONE_STORAGE_PREFIX } from './search-session-store';
import { closeSearchSession, abandonSearchSession, answerSearchSession } from './api';
import { useAuthStore } from '@/features/auth/auth-store';

describe('Story FE-3.3 & FE-3.4: useSearchSessionStore & Session API Unit Tests', () => {
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

  describe('Initial State & setSessionId', () => {
    it('initializes with idle status, null sessionId, and null lastOpenedLessonId', () => {
      const state = useSearchSessionStore.getState();
      expect(state.sessionId).toBeNull();
      expect(state.status).toBe('idle');
      expect(state.lastOpenedLessonId).toBeNull();
    });

    it('sets sessionId and transitions status to active on valid string', () => {
      useSearchSessionStore.getState().setSessionId('sess-uuid-1');
      const state = useSearchSessionStore.getState();
      expect(state.sessionId).toBe('sess-uuid-1');
      expect(state.status).toBe('active');
      expect(state.lastOpenedLessonId).toBeNull();
    });

    it('trims whitespace on setSessionId', () => {
      useSearchSessionStore.getState().setSessionId('  sess-trimmed  ');
      expect(useSearchSessionStore.getState().sessionId).toBe('sess-trimmed');
      expect(useSearchSessionStore.getState().status).toBe('active');
    });

    it('handles null, undefined, and empty string gracefully without state change', () => {
      useSearchSessionStore.getState().setSessionId(null);
      expect(useSearchSessionStore.getState().sessionId).toBeNull();
      expect(useSearchSessionStore.getState().status).toBe('idle');

      useSearchSessionStore.getState().setSessionId(undefined);
      expect(useSearchSessionStore.getState().sessionId).toBeNull();
      expect(useSearchSessionStore.getState().status).toBe('idle');

      useSearchSessionStore.getState().setSessionId('   ');
      expect(useSearchSessionStore.getState().sessionId).toBeNull();
      expect(useSearchSessionStore.getState().status).toBe('idle');
    });
  });

  describe('closeSession', () => {
    it('transitions to closed, retains sessionId, sets lastOpenedLessonId, and posts to /close/', async () => {
      let requestedUrl = '';
      let requestedInit: RequestInit | undefined;

      globalThis.fetch = vi.fn().mockImplementation((url: string, init?: RequestInit) => {
        requestedUrl = url;
        requestedInit = init;
        return Promise.resolve(
          new Response(
            JSON.stringify({
              search_session_id: 'sess-123',
              state: 'closed',
              close_reason: 'lesson_opened',
            }),
            { status: 200, headers: { 'Content-Type': 'application/json' } }
          )
        );
      });

      useSearchSessionStore.getState().setSessionId('sess-123');
      await useSearchSessionStore.getState().closeSession('les-456');

      const state = useSearchSessionStore.getState();
      expect(state.sessionId).toBe('sess-123');
      expect(state.status).toBe('closed');
      expect(state.lastOpenedLessonId).toBe('les-456');

      expect(requestedUrl).toContain('/api/v1/search/sessions/close/');
      expect(requestedInit?.method).toBe('POST');
      expect((requestedInit?.headers as Record<string, string>)['X-Search-Session-Id']).toBe('sess-123');

      const parsedBody = JSON.parse(requestedInit?.body as string);
      expect(parsedBody).toEqual({
        session_id: 'sess-123',
        search_session_id: 'sess-123',
        reason: 'lesson_opened',
        lesson_id: 'les-456',
      });
    });

    it('prevents double-close if session is already closed', async () => {
      const fetchSpy = vi.fn().mockImplementation(() =>
        Promise.resolve(
          new Response(JSON.stringify({ state: 'closed' }), {
            status: 200,
            headers: { 'Content-Type': 'application/json' },
          })
        )
      );
      globalThis.fetch = fetchSpy;

      useSearchSessionStore.getState().setSessionId('sess-123');
      await useSearchSessionStore.getState().closeSession('les-1');
      expect(fetchSpy).toHaveBeenCalledTimes(1);

      // Attempt second close
      await useSearchSessionStore.getState().closeSession('les-2');
      expect(fetchSpy).toHaveBeenCalledTimes(1);
    });

    it('does nothing if status is idle or sessionId is null', async () => {
      const fetchSpy = vi.fn();
      globalThis.fetch = fetchSpy;

      await useSearchSessionStore.getState().closeSession('les-1');
      expect(fetchSpy).not.toHaveBeenCalled();
      expect(useSearchSessionStore.getState().status).toBe('idle');
    });

    it('swallows errors silently on 404, 401, or network failure (telemetry oracle immunity)', async () => {
      globalThis.fetch = vi.fn().mockImplementation(() =>
        Promise.resolve(
          new Response(JSON.stringify({ type: 'not_found', status: 404 }), {
            status: 404,
            headers: { 'Content-Type': 'application/json' },
          })
        )
      );

      useSearchSessionStore.getState().setSessionId('sess-123');

      // Must not throw
      await expect(useSearchSessionStore.getState().closeSession('les-456')).resolves.not.toThrow();

      const state = useSearchSessionStore.getState();
      expect(state.sessionId).toBe('sess-123');
      expect(state.status).toBe('closed');
      expect(state.lastOpenedLessonId).toBe('les-456');
    });

    it('swallows network exceptions silently', async () => {
      globalThis.fetch = vi.fn().mockImplementation(() =>
        Promise.reject(new Error('Network offline'))
      );

      useSearchSessionStore.getState().setSessionId('sess-123');

      await expect(useSearchSessionStore.getState().closeSession('les-456')).resolves.not.toThrow();
      expect(useSearchSessionStore.getState().status).toBe('closed');
    });
  });

  describe('abandonSession', () => {
    it('transitions to abandoned and posts to /abandon/ with X-Search-Session-Id and keepalive', async () => {
      let requestedUrl = '';
      let requestedInit: RequestInit | undefined;

      globalThis.fetch = vi.fn().mockImplementation((url: string, init?: RequestInit) => {
        requestedUrl = url;
        requestedInit = init;
        return Promise.resolve(
          new Response(
            JSON.stringify({
              search_session_id: 'sess-789',
              state: 'closed',
              close_reason: 'abandoned',
            }),
            { status: 200, headers: { 'Content-Type': 'application/json' } }
          )
        );
      });

      useSearchSessionStore.getState().setSessionId('sess-789');
      await useSearchSessionStore.getState().abandonSession();

      const state = useSearchSessionStore.getState();
      expect(state.sessionId).toBe('sess-789');
      expect(state.status).toBe('abandoned');

      expect(requestedUrl).toContain('/api/v1/search/sessions/abandon/');
      expect(requestedInit?.method).toBe('POST');
      expect((requestedInit?.headers as Record<string, string>)['X-Search-Session-Id']).toBe('sess-789');
      expect(requestedInit?.keepalive).toBe(true);

      const parsedBody = JSON.parse(requestedInit?.body as string);
      expect(parsedBody).toEqual({
        session_id: 'sess-789',
        search_session_id: 'sess-789',
      });
    });

    it('does nothing if session was already closed', async () => {
      const fetchSpy = vi.fn().mockImplementation(() =>
        Promise.resolve(
          new Response(JSON.stringify({ state: 'closed' }), {
            status: 200,
            headers: { 'Content-Type': 'application/json' },
          })
        )
      );
      globalThis.fetch = fetchSpy;

      useSearchSessionStore.getState().setSessionId('sess-123');
      await useSearchSessionStore.getState().closeSession('les-1');
      expect(fetchSpy).toHaveBeenCalledTimes(1);

      // Now attempt abandon on closed session
      await useSearchSessionStore.getState().abandonSession();
      // Should NOT call fetch again
      expect(fetchSpy).toHaveBeenCalledTimes(1);
      expect(useSearchSessionStore.getState().status).toBe('closed');
    });

    it('does nothing if session was already abandoned (duplicate abandon guard)', async () => {
      const fetchSpy = vi.fn().mockImplementation(() =>
        Promise.resolve(
          new Response(JSON.stringify({ state: 'closed' }), {
            status: 200,
            headers: { 'Content-Type': 'application/json' },
          })
        )
      );
      globalThis.fetch = fetchSpy;

      useSearchSessionStore.getState().setSessionId('sess-123');
      await useSearchSessionStore.getState().abandonSession();
      expect(fetchSpy).toHaveBeenCalledTimes(1);

      // Call abandon again (e.g. dialog dismiss + beforeunload)
      await useSearchSessionStore.getState().abandonSession();
      expect(fetchSpy).toHaveBeenCalledTimes(1);
    });

    it('does nothing if status is idle or sessionId is null', async () => {
      const fetchSpy = vi.fn();
      globalThis.fetch = fetchSpy;

      await useSearchSessionStore.getState().abandonSession();
      expect(fetchSpy).not.toHaveBeenCalled();
      expect(useSearchSessionStore.getState().status).toBe('idle');
    });

    it('swallows errors silently on network failure or HTTP error', async () => {
      globalThis.fetch = vi.fn().mockImplementation(() =>
        Promise.reject(new Error('Failed to fetch'))
      );

      useSearchSessionStore.getState().setSessionId('sess-123');

      await expect(useSearchSessionStore.getState().abandonSession()).resolves.not.toThrow();
      expect(useSearchSessionStore.getState().status).toBe('abandoned');
    });
  });

  describe('clearLastOpenedLessonId', () => {
    it('sets lastOpenedLessonId to null without altering sessionId or status', async () => {
      useSearchSessionStore.getState().setSessionId('sess-clear-test');
      useSearchSessionStore.getState().closeSession('lesson-abc');

      expect(useSearchSessionStore.getState().lastOpenedLessonId).toBe('lesson-abc');
      useSearchSessionStore.getState().clearLastOpenedLessonId();

      const state = useSearchSessionStore.getState();
      expect(state.lastOpenedLessonId).toBeNull();
      expect(state.sessionId).toBe('sess-clear-test');
      expect(state.status).toBe('closed');
    });
  });

  describe('resetSession', () => {
    it('restores all state properties back to initial idle defaults', () => {
      useSearchSessionStore.getState().setSessionId('sess-123');
      useSearchSessionStore.getState().resetSession();

      const state = useSearchSessionStore.getState();
      expect(state.sessionId).toBeNull();
      expect(state.status).toBe('idle');
      expect(state.lastOpenedLessonId).toBeNull();
    });
  });

  describe('API functions: closeSearchSession & abandonSearchSession', () => {
    it('closeSearchSession sets headers, body, and method properly', async () => {
      let passedInit: RequestInit | undefined;
      globalThis.fetch = vi.fn().mockImplementation((_url: string, init?: RequestInit) => {
        passedInit = init;
        return Promise.resolve(
          new Response(JSON.stringify({ success: true }), {
            status: 200,
            headers: { 'Content-Type': 'application/json' },
          })
        );
      });

      await closeSearchSession({
        session_id: 'test-sess',
        reason: 'lesson_opened',
        lesson_id: 'lesson-xyz',
      });

      expect(passedInit?.method).toBe('POST');
      expect(passedInit?.keepalive).toBe(true);
      expect((passedInit?.headers as Record<string, string>)['X-Search-Session-Id']).toBe('test-sess');
      const body = JSON.parse(passedInit?.body as string);
      expect(body.session_id).toBe('test-sess');
      expect(body.search_session_id).toBe('test-sess');
      expect(body.reason).toBe('lesson_opened');
      expect(body.lesson_id).toBe('lesson-xyz');
    });

    it('abandonSearchSession sets headers, body, and keepalive properly', async () => {
      let passedInit: RequestInit | undefined;
      globalThis.fetch = vi.fn().mockImplementation((_url: string, init?: RequestInit) => {
        passedInit = init;
        return Promise.resolve(
          new Response(JSON.stringify({ success: true }), {
            status: 200,
            headers: { 'Content-Type': 'application/json' },
          })
        );
      });

      await abandonSearchSession({
        session_id: 'test-sess-2',
      });

      expect(passedInit?.method).toBe('POST');
      expect(passedInit?.keepalive).toBe(true);
      expect((passedInit?.headers as Record<string, string>)['X-Search-Session-Id']).toBe('test-sess-2');
      const body = JSON.parse(passedInit?.body as string);
      expect(body.session_id).toBe('test-sess-2');
      expect(body.search_session_id).toBe('test-sess-2');
    });

    it('answerSearchSession sets headers, body, found boolean, and keepalive properly', async () => {
      let passedInit: RequestInit | undefined;
      let passedUrl = '';
      globalThis.fetch = vi.fn().mockImplementation((url: string, init?: RequestInit) => {
        passedUrl = url;
        passedInit = init;
        return Promise.resolve(
          new Response(JSON.stringify({ search_session_id: 'test-sess-3', found: true }), {
            status: 201,
            headers: { 'Content-Type': 'application/json' },
          })
        );
      });

      const res = await answerSearchSession({
        session_id: 'test-sess-3',
        found: true,
      });

      expect(passedUrl).toContain('/api/v1/search/sessions/answer/');
      expect(passedInit?.method).toBe('POST');
      expect(passedInit?.keepalive).toBe(true);
      expect((passedInit?.headers as Record<string, string>)['X-Search-Session-Id']).toBe('test-sess-3');
      const body = JSON.parse(passedInit?.body as string);
      expect(body.session_id).toBe('test-sess-3');
      expect(body.search_session_id).toBe('test-sess-3');
      expect(body.found).toBe(true);
      expect(res.found).toBe(true);
    });
  });

  describe('Story FE-3.4: Feedback Lifecycle (dismissFeedback, isFeedbackDone, answerSession)', () => {
    it('isFeedbackDone returns false initially for active session without storage flag', () => {
      useSearchSessionStore.getState().setSessionId('sess-100');
      expect(useSearchSessionStore.getState().isFeedbackDone('sess-100')).toBe(false);
    });

    it('isFeedbackDone returns true for empty or whitespace-only sessionId', () => {
      expect(useSearchSessionStore.getState().isFeedbackDone('')).toBe(true);
      expect(useSearchSessionStore.getState().isFeedbackDone('   ')).toBe(true);
    });

    it('dismissFeedback records session in store and sessionStorage without API calls', () => {
      const fetchSpy = vi.fn();
      globalThis.fetch = fetchSpy;

      useSearchSessionStore.getState().setSessionId('sess-dismiss');
      useSearchSessionStore.getState().dismissFeedback('sess-dismiss');

      expect(fetchSpy).not.toHaveBeenCalled();
      expect(useSearchSessionStore.getState().isFeedbackDone('sess-dismiss')).toBe(true);
      expect(sessionStorage.getItem(`${FEEDBACK_DONE_STORAGE_PREFIX}sess-dismiss`)).toBe('true');
    });

    it('dismissFeedback defaults to current sessionId when no parameter is passed', () => {
      useSearchSessionStore.getState().setSessionId('sess-default-dismiss');
      useSearchSessionStore.getState().dismissFeedback();

      expect(useSearchSessionStore.getState().isFeedbackDone('sess-default-dismiss')).toBe(true);
      expect(sessionStorage.getItem(`${FEEDBACK_DONE_STORAGE_PREFIX}sess-default-dismiss`)).toBe('true');
    });

    it('isFeedbackDone returns true if sessionStorage contains the done flag', () => {
      sessionStorage.setItem(`${FEEDBACK_DONE_STORAGE_PREFIX}persisted-session`, 'true');
      expect(useSearchSessionStore.getState().isFeedbackDone('persisted-session')).toBe(true);
    });

    it('answerSession dispatches POST /answer/ with found=true and marks session done', async () => {
      let requestedUrl = '';
      let requestedInit: RequestInit | undefined;

      globalThis.fetch = vi.fn().mockImplementation((url: string, init?: RequestInit) => {
        requestedUrl = url;
        requestedInit = init;
        return Promise.resolve(
          new Response(
            JSON.stringify({
              search_session_id: 'sess-yes',
              found: true,
            }),
            { status: 201, headers: { 'Content-Type': 'application/json' } }
          )
        );
      });

      useSearchSessionStore.getState().setSessionId('sess-yes');
      await useSearchSessionStore.getState().answerSession(true);

      expect(requestedUrl).toContain('/api/v1/search/sessions/answer/');
      expect(requestedInit?.method).toBe('POST');
      expect((requestedInit?.headers as Record<string, string>)['X-Search-Session-Id']).toBe('sess-yes');

      const body = JSON.parse(requestedInit?.body as string);
      expect(body).toEqual({
        session_id: 'sess-yes',
        search_session_id: 'sess-yes',
        found: true,
      });

      expect(useSearchSessionStore.getState().isFeedbackDone('sess-yes')).toBe(true);
      expect(sessionStorage.getItem(`${FEEDBACK_DONE_STORAGE_PREFIX}sess-yes`)).toBe('true');
    });

    it('answerSession dispatches POST /answer/ with found=false for negative answer', async () => {
      let requestedInit: RequestInit | undefined;

      globalThis.fetch = vi.fn().mockImplementation((_url: string, init?: RequestInit) => {
        requestedInit = init;
        return Promise.resolve(
          new Response(
            JSON.stringify({
              search_session_id: 'sess-no',
              found: false,
            }),
            { status: 201, headers: { 'Content-Type': 'application/json' } }
          )
        );
      });

      useSearchSessionStore.getState().setSessionId('sess-no');
      await useSearchSessionStore.getState().answerSession(false);

      const body = JSON.parse(requestedInit?.body as string);
      expect(body.found).toBe(false);
      expect(useSearchSessionStore.getState().isFeedbackDone('sess-no')).toBe(true);
    });

    it('answerSession guards against duplicate submissions on rapid clicks', async () => {
      const fetchSpy = vi.fn().mockImplementation(() =>
        Promise.resolve(
          new Response(JSON.stringify({ search_session_id: 'sess-double', found: true }), {
            status: 201,
            headers: { 'Content-Type': 'application/json' },
          })
        )
      );
      globalThis.fetch = fetchSpy;

      useSearchSessionStore.getState().setSessionId('sess-double');

      // Trigger two calls simultaneously
      const call1 = useSearchSessionStore.getState().answerSession(true);
      const call2 = useSearchSessionStore.getState().answerSession(true);

      await Promise.all([call1, call2]);

      // Only one API request must have been dispatched
      expect(fetchSpy).toHaveBeenCalledTimes(1);
    });

    it('answerSession silently swallows 404, 409 Conflict, and network errors (telemetry oracle immunity)', async () => {
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

      useSearchSessionStore.getState().setSessionId('sess-conflict');

      await expect(useSearchSessionStore.getState().answerSession(true)).resolves.not.toThrow();
      expect(useSearchSessionStore.getState().isFeedbackDone('sess-conflict')).toBe(true);
    });

    it('answerSession silently swallows network connection failures', async () => {
      globalThis.fetch = vi.fn().mockImplementation(() =>
        Promise.reject(new Error('Network disconnected'))
      );

      useSearchSessionStore.getState().setSessionId('sess-net-err');

      await expect(useSearchSessionStore.getState().answerSession(false)).resolves.not.toThrow();
      expect(useSearchSessionStore.getState().isFeedbackDone('sess-net-err')).toBe(true);
    });
  });
});
