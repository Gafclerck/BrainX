import { apiClient } from '@/lib/api';
import type { PaginatedSearchResponse, SearchOptions } from './types';

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
