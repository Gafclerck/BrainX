import { create } from 'zustand';
import { closeSearchSession, abandonSearchSession } from './api';
import type { SearchSessionState, SearchSessionStatus } from './types';

const initialState: {
  sessionId: string | null;
  status: SearchSessionStatus;
  lastOpenedLessonId: string | null;
} = {
  sessionId: null,
  status: 'idle',
  lastOpenedLessonId: null,
};

/**
 * Dedicated client-side store for orchestrating search session lifecycle (Story FE-3.3).
 * Serves as the single client source of truth for search session state across navigation.
 */
export const useSearchSessionStore = create<SearchSessionState>((set, get) => ({
  ...initialState,

  setSessionId: (id: string | null | undefined) => {
    if (!id || typeof id !== 'string' || !id.trim()) {
      return;
    }
    set({
      sessionId: id.trim(),
      status: 'active',
      lastOpenedLessonId: null,
    });
  },

  closeSession: async (lessonId?: string) => {
    const { sessionId, status } = get();
    // Guard: Only active sessions can be closed. Prevent double-close.
    if (!sessionId || status !== 'active') {
      return;
    }

    // Immediately transition state to preserve session ID and prevent abandon calls
    set({
      status: 'closed',
      lastOpenedLessonId: lessonId ?? null,
    });

    try {
      await closeSearchSession({
        session_id: sessionId,
        search_session_id: sessionId,
        reason: 'lesson_opened',
        lesson_id: lessonId,
      });
    } catch {
      // Telemetry oracle immunity: network and server errors fail silently
    }
  },

  abandonSession: async () => {
    const { sessionId, status } = get();
    // Guard: Only active sessions can be abandoned. If already closed, abandoned, or idle, skip.
    if (!sessionId || status !== 'active') {
      return;
    }

    // Immediately transition state to prevent duplicate abandon calls (e.g. dialog dismiss + beforeunload)
    set({
      status: 'abandoned',
    });

    try {
      await abandonSearchSession({
        session_id: sessionId,
        search_session_id: sessionId,
      });
    } catch {
      // Telemetry oracle immunity: network and server errors fail silently
    }
  },

  resetSession: () => {
    set({ ...initialState });
  },
}));
