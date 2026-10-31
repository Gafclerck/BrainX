import { apiClient } from '@/lib/api';
import type {
  AbandonSessionPayload,
  AnswerSessionPayload,
  CloseSessionPayload,
  PaginatedSearchResponse,
  SearchAnswerResponse,
  SearchOptions,
  SearchSessionResponse,
} from './types';

/**
 * Dispatches an authenticated GET /api/v1/search/lessons/?query=... request.
 */
export async function searchLessons(
  query: string,
  options: SearchOptions = {}
): Promise<PaginatedSearchResponse> {
  const { sort, course_date_from, course_date_to, page, signal } = options;

  const params = new URLSearchParams();
  params.set('query', query);

  if (sort) {
    params.set('sort', sort);
  }
  if (course_date_from) {
    params.set('course_date_from', course_date_from);
  }
  if (course_date_to) {
    params.set('course_date_to', course_date_to);
  }
  if (page) {
    params.set('page', String(page));
  }

  const endpoint = `/api/v1/search/lessons/?${params.toString()}`;

  return apiClient<PaginatedSearchResponse>(endpoint, {
    method: 'GET',
    signal,
  });
}

/**
 * Dispatches an authenticated POST /api/v1/search/sessions/close/ request.
 * Header X-Search-Session-Id and body payload are sent.
 */
export async function closeSearchSession(
  payload: CloseSessionPayload,
  options?: { keepalive?: boolean; signal?: AbortSignal }
): Promise<SearchSessionResponse> {
  const sessionId = payload.session_id || payload.search_session_id;
  const headers: Record<string, string> = {};
  if (sessionId) {
    headers['X-Search-Session-Id'] = sessionId;
  }

  const data: CloseSessionPayload = {
    session_id: payload.session_id,
    search_session_id: payload.search_session_id ?? payload.session_id,
    reason: payload.reason ?? 'lesson_opened',
    ...(payload.lesson_id ? { lesson_id: payload.lesson_id } : {}),
  };

  return apiClient<SearchSessionResponse>('/api/v1/search/sessions/close/', {
    method: 'POST',
    data,
    headers,
    keepalive: options?.keepalive ?? true,
    signal: options?.signal,
  });
}

/**
 * Dispatches an authenticated POST /api/v1/search/sessions/abandon/ request.
 * Header X-Search-Session-Id and body payload are sent.
 */
export async function abandonSearchSession(
  payload: AbandonSessionPayload,
  options?: { keepalive?: boolean; signal?: AbortSignal }
): Promise<SearchSessionResponse> {
  const sessionId = payload.session_id || payload.search_session_id;
  const headers: Record<string, string> = {};
  if (sessionId) {
    headers['X-Search-Session-Id'] = sessionId;
  }

  const data: AbandonSessionPayload = {
    session_id: payload.session_id,
    search_session_id: payload.search_session_id ?? payload.session_id,
  };

  return apiClient<SearchSessionResponse>('/api/v1/search/sessions/abandon/', {
    method: 'POST',
    data,
    headers,
    keepalive: options?.keepalive ?? true,
    signal: options?.signal,
  });
}

/**
 * Dispatches an authenticated POST /api/v1/search/sessions/answer/ request.
 * Header X-Search-Session-Id and body payload are sent (Story FE-3.4).
 */
export async function answerSearchSession(
  payload: AnswerSessionPayload,
  options?: { keepalive?: boolean; signal?: AbortSignal }
): Promise<SearchAnswerResponse> {
  const sessionId = payload.session_id || payload.search_session_id;
  const headers: Record<string, string> = {};
  if (sessionId) {
    headers['X-Search-Session-Id'] = sessionId;
  }

  const data: AnswerSessionPayload = {
    session_id: payload.session_id ?? payload.search_session_id,
    search_session_id: payload.search_session_id ?? payload.session_id,
    found: payload.found,
  };

  return apiClient<SearchAnswerResponse>('/api/v1/search/sessions/answer/', {
    method: 'POST',
    data,
    headers,
    keepalive: options?.keepalive ?? true,
    signal: options?.signal,
  });
}
