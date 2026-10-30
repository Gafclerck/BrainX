import { create } from 'zustand';
import { searchLessons } from './api';
import type { SearchOptions, SearchState } from './types';

let debounceTimer: ReturnType<typeof setTimeout> | null = null;
let currentAbortController: AbortController | null = null;

export const useSearchStore = create<SearchState>((set) => ({
  isOpen: false,
  query: '',
  results: [],
  count: 0,
  searchSessionId: null,
  isLoading: false,
  isDebouncing: false,
  hasSearched: false,
  lastSearchedQuery: null,
  error: null,
  validationError: null,

  openSearch: () => {
    set({ isOpen: true });
  },

  closeSearch: () => {
    if (debounceTimer) {
      clearTimeout(debounceTimer);
      debounceTimer = null;
    }
    if (currentAbortController) {
      currentAbortController.abort();
      currentAbortController = null;
    }
    set({
      isOpen: false,
      query: '',
      results: [],
      count: 0,
      searchSessionId: null,
      isLoading: false,
      isDebouncing: false,
      hasSearched: false,
      lastSearchedQuery: null,
      error: null,
      validationError: null,
    });
  },

  setQuery: (query: string) => {
    if (debounceTimer) {
      clearTimeout(debounceTimer);
      debounceTimer = null;
    }
    if (currentAbortController) {
      currentAbortController.abort();
      currentAbortController = null;
    }

    const trimmed = query.trim();

    if (trimmed.length === 0) {
      set({
        query,
        results: [],
        count: 0,
        searchSessionId: null,
        isLoading: false,
        isDebouncing: false,
        hasSearched: false,
        lastSearchedQuery: null,
        error: null,
        validationError: null,
      });
      return;
    }

    if (trimmed.length > 200) {
      set({
        query,
        results: [],
        count: 0,
        searchSessionId: null,
        isLoading: false,
        isDebouncing: false,
        hasSearched: false,
        lastSearchedQuery: null,
        error: null,
        validationError: 'La requête ne peut pas dépasser 200 caractères.',
      });
      return;
    }

    if (trimmed.length < 3) {
      set({
        query,
        results: [],
        count: 0,
        searchSessionId: null,
        isLoading: false,
        isDebouncing: false,
        hasSearched: false,
        lastSearchedQuery: null,
        error: null,
        validationError: 'Saisissez au moins 3 caractères pour lancer la recherche',
      });
      return;
    }

    // Valid query (>= 3 && <= 200) - clear stale results and mark debouncing
    set({
      query,
      results: [],
      count: 0,
      validationError: null,
      error: null,
      isDebouncing: true,
      hasSearched: false,
    });

    debounceTimer = setTimeout(async () => {
      debounceTimer = null;
      const controller = new AbortController();
      currentAbortController = controller;
      set({ isDebouncing: false, isLoading: true, error: null });

      try {
        const data = await searchLessons(trimmed, { signal: controller.signal });
        if (currentAbortController === controller) {
          set({
            results: data.results,
            count: data.count,
            searchSessionId: data.search_session_id ?? null,
            isLoading: false,
            isDebouncing: false,
            error: null,
            hasSearched: true,
            lastSearchedQuery: trimmed,
          });
        }
      } catch (err: unknown) {
        if (controller.signal.aborted) {
          return;
        }
        const apiErr = err as { envelope?: { detail?: string }; message?: string };
        const errorMessage =
          apiErr.envelope?.detail || apiErr.message || 'Une erreur est survenue lors de la recherche.';
        set({
          results: [],
          count: 0,
          searchSessionId: null,
          isLoading: false,
          isDebouncing: false,
          error: errorMessage,
          hasSearched: true,
          lastSearchedQuery: trimmed,
        });
      } finally {
        if (currentAbortController === controller) {
          currentAbortController = null;
        }
      }
    }, 300);
  },

  search: async (query: string, options?: SearchOptions) => {
    if (debounceTimer) {
      clearTimeout(debounceTimer);
      debounceTimer = null;
    }
    if (currentAbortController) {
      currentAbortController.abort();
      currentAbortController = null;
    }

    const trimmed = query.trim();
    if (trimmed.length < 3) {
      set({
        query,
        results: [],
        count: 0,
        validationError: 'Saisissez au moins 3 caractères pour lancer la recherche',
        isLoading: false,
        isDebouncing: false,
        hasSearched: false,
      });
      return;
    }
    if (trimmed.length > 200) {
      set({
        query,
        results: [],
        count: 0,
        validationError: 'La requête ne peut pas dépasser 200 caractères.',
        isLoading: false,
        isDebouncing: false,
        hasSearched: false,
      });
      return;
    }

    const controller = new AbortController();
    currentAbortController = controller;
    set({
      query,
      results: [],
      count: 0,
      isLoading: true,
      isDebouncing: false,
      error: null,
      validationError: null,
      hasSearched: false,
    });

    try {
      const data = await searchLessons(trimmed, {
        ...options,
        signal: options?.signal ?? controller.signal,
      });
      if (currentAbortController === controller) {
        set({
          results: data.results,
          count: data.count,
          searchSessionId: data.search_session_id ?? null,
          isLoading: false,
          isDebouncing: false,
          error: null,
          hasSearched: true,
          lastSearchedQuery: trimmed,
        });
      }
    } catch (err: unknown) {
      if (controller.signal.aborted) {
        return;
      }
      const apiErr = err as { envelope?: { detail?: string }; message?: string };
      const errorMessage =
        apiErr.envelope?.detail || apiErr.message || 'Une erreur est survenue lors de la recherche.';
      set({
        results: [],
        count: 0,
        searchSessionId: null,
        isLoading: false,
        isDebouncing: false,
        error: errorMessage,
        hasSearched: true,
        lastSearchedQuery: trimmed,
      });
    } finally {
      if (currentAbortController === controller) {
        currentAbortController = null;
      }
    }
  },

  reset: () => {
    if (debounceTimer) {
      clearTimeout(debounceTimer);
      debounceTimer = null;
    }
    if (currentAbortController) {
      currentAbortController.abort();
      currentAbortController = null;
    }
    set({
      isOpen: false,
      query: '',
      results: [],
      count: 0,
      searchSessionId: null,
      isLoading: false,
      isDebouncing: false,
      hasSearched: false,
      lastSearchedQuery: null,
      error: null,
      validationError: null,
    });
  },
}));
