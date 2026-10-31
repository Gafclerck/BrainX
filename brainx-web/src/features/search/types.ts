/**
 * Data contracts for Student Global Command Palette Search (Cmd+K) (Story FE-3.1).
 * Strictly mirrors the DRF search endpoint PaginatedSearchLessonList contract
 * and search store state.
 */

export interface SearchLessonItem {
  id: string;
  title: string;
  course_name: string;
  module_name: string;
  chapter_name: string;
  teacher?: string;
  course_date?: string;
  resources?: import('@/features/browse/types').LessonResourceItem[];
}

export interface HighlightTextProps {
  text: string;
  query?: string;
  className?: string;
  highlightClassName?: string;
}

export interface SearchResultCardProps {
  lesson: SearchLessonItem;
  query?: string;
  isSelected?: boolean;
  onSelect: (lessonId: string) => void;
  onMouseEnter?: () => void;
  className?: string;
}

export interface PaginatedSearchResponse {
  count: number;
  next?: string | null;
  previous?: string | null;
  results: SearchLessonItem[];
  search_session_id?: string | null;
}

export interface SearchOptions {
  sort?: 'date' | 'course';
  course_date_from?: string;
  course_date_to?: string;
  page?: number;
  signal?: AbortSignal;
}

export interface SearchState {
  isOpen: boolean;
  query: string;
  results: SearchLessonItem[];
  count: number;
  searchSessionId: string | null;
  isLoading: boolean;
  isDebouncing: boolean;
  hasSearched: boolean;
  lastSearchedQuery: string | null;
  error: string | null;
  validationError: string | null;

  openSearch: () => void;
  closeSearch: () => void;
  setQuery: (query: string) => void;
  search: (query: string, options?: SearchOptions) => Promise<void>;
  reset: () => void;
}

/**
 * Lifecycle status of a search session (Story FE-3.3).
 */
export type SearchSessionStatus = 'idle' | 'active' | 'closed' | 'abandoned';

/**
 * Request payload for POST /api/v1/search/sessions/close/
 */
export interface CloseSessionPayload {
  session_id: string;
  search_session_id?: string;
  reason?: 'lesson_opened' | 'abandoned';
  lesson_id?: string;
}

/**
 * Request payload for POST /api/v1/search/sessions/abandon/
 */
export interface AbandonSessionPayload {
  session_id: string;
  search_session_id?: string;
}

/**
 * Request payload for POST /api/v1/search/sessions/answer/ (Story FE-3.4).
 */
export interface AnswerSessionPayload {
  session_id?: string;
  search_session_id?: string;
  found: boolean;
}

/**
 * Response payload from search session close/abandon endpoints.
 */
export interface SearchSessionResponse {
  search_session_id: string;
  state: string;
  close_reason?: string;
}

/**
 * Response payload from POST /api/v1/search/sessions/answer/ endpoint (Story FE-3.4).
 */
export interface SearchAnswerResponse {
  search_session_id: string;
  found: boolean;
}

/**
 * State and actions for the dedicated search session store (Story FE-3.3, FE-3.4).
 */
export interface SearchSessionState {
  sessionId: string | null;
  status: SearchSessionStatus;
  lastOpenedLessonId: string | null;
  feedbackDoneSessionIds: string[];

  setSessionId: (sessionId: string | null | undefined) => void;
  closeSession: (lessonId?: string) => Promise<void>;
  abandonSession: () => Promise<void>;
  clearLastOpenedLessonId: () => void;
  resetSession: () => void;
  answerSession: (found: boolean, targetSessionId?: string) => Promise<void>;
  dismissFeedback: (sessionId?: string) => void;
  isFeedbackDone: (sessionId: string) => boolean;
}
