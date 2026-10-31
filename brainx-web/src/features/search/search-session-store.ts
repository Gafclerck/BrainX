import { create } from 'zustand';
import { closeSearchSession, abandonSearchSession, answerSearchSession } from './api';
import type { SearchSessionState, SearchSessionStatus } from './types';

export const FEEDBACK_DONE_STORAGE_PREFIX = 'brainx_search_feedback_done_';

function getSessionStorageFeedbackDone(sessionId: string): boolean {
  try {
    if (typeof window !== 'undefined' && window.sessionStorage) {
      return (
        window.sessionStorage.getItem(`${FEEDBACK_DONE_STORAGE_PREFIX}${sessionId}`) === 'true'
      );
    }
  } catch {
    // Telemetry oracle immunity
  }
  return false;
}

function setSessionStorageFeedbackDone(sessionId: string): void {
  try {
    if (typeof window !== 'undefined' && window.sessionStorage) {
      window.sessionStorage.setItem(`${FEEDBACK_DONE_STORAGE_PREFIX}${sessionId}`, 'true');
    }
  } catch {
    // Telemetry oracle immunity
  }
}

const initialState: {
  sessionId: string | null;
  status: SearchSessionStatus;
  lastOpenedLessonId: string | null;
  feedbackDoneSessionIds: string[];
} = {
  sessionId: null,
  status: 'idle',
  lastOpenedLessonId: null,
  feedbackDoneSessionIds: [],
};

/**
 * Dedicated client-side store for orchestrating search session lifecycle (Story FE-3.3, FE-3.4).
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

  isFeedbackDone: (sessionId: string) => {
    if (!sessionId || !sessionId.trim()) {
      return true;
    }
    const trimmedId = sessionId.trim();
    if (get().feedbackDoneSessionIds.includes(trimmedId)) {
      return true;
    }
    return getSessionStorageFeedbackDone(trimmedId);
  },

  dismissFeedback: (sessionId?: string) => {
    const targetId = (sessionId || get().sessionId)?.trim();
    if (!targetId) {
      return;
    }
    setSessionStorageFeedbackDone(targetId);
    set((state) => ({
      feedbackDoneSessionIds: state.feedbackDoneSessionIds.includes(targetId)
        ? state.feedbackDoneSessionIds
        : [...state.feedbackDoneSessionIds, targetId],
    }));
  },

  answerSession: async (found: boolean, targetSessionId?: string) => {
    const targetId = (targetSessionId || get().sessionId)?.trim();
    if (!targetId) {
      return;
    }

    // Guard against duplicate submission if already answered or dismissed
    if (get().isFeedbackDone(targetId)) {
      return;
    }

    // Immediately record as done to permanently dismiss and prevent double-clicks
    get().dismissFeedback(targetId);

    try {
      await answerSearchSession({
        session_id: targetId,
        search_session_id: targetId,
        found,
      });
    } catch {
      // Telemetry oracle immunity: network, 404, 409 swallow silently
    }
  },

  clearLastOpenedLessonId: () => {
    set({ lastOpenedLessonId: null });
  },

  resetSession: () => {
    set({ ...initialState });
  },
}));
