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
