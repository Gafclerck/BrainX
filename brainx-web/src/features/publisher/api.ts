import { apiClient } from '@/lib/api';
import type {
  PaginatedPublisherResponse,
  PublisherCourseItem,
} from './types';

/**
 * Fetch all manageable courses for the publisher back-office.
 * Queries backend manageable() port: GET /api/v1/courses/?page=...
 * Stale time is 0 for authoring consistency (AD-FE-2, AD-FE-4).
 */
export async function fetchManageableCourses(
  page?: number
): Promise<PaginatedPublisherResponse<PublisherCourseItem>> {
  const query = page ? `?page=${encodeURIComponent(page)}` : '';
  return apiClient<PaginatedPublisherResponse<PublisherCourseItem>>(
    `/api/v1/courses/${query}`
  );
}
