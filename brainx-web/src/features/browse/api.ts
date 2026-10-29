import { apiClient } from '@/lib/api';
import type { BrowseContainerItem, PaginatedBrowseResponse } from './types';

/**
 * Fetch the published courses visible to students.
 * Queries GET /api/v1/browse/courses/
 */
export async function fetchPublishedCourses(
  page?: number
): Promise<PaginatedBrowseResponse<BrowseContainerItem>> {
  const query = page ? `?page=${encodeURIComponent(page)}` : '';
  return apiClient<PaginatedBrowseResponse<BrowseContainerItem>>(
    `/api/v1/browse/courses/${query}`
  );
}

/**
 * Fetch the published modules belonging to a specific visible course.
 * Queries GET /api/v1/browse/courses/:courseId/modules/
 */
export async function fetchCourseModules(
  courseId: string,
  page?: number
): Promise<PaginatedBrowseResponse<BrowseContainerItem>> {
  const query = page ? `?page=${encodeURIComponent(page)}` : '';
  return apiClient<PaginatedBrowseResponse<BrowseContainerItem>>(
    `/api/v1/browse/courses/${encodeURIComponent(courseId)}/modules/${query}`
  );
}

/**
 * Fetch the published chapters belonging to a specific visible module.
 * Queries GET /api/v1/browse/modules/:moduleId/chapters/
 */
export async function fetchModuleChapters(
  moduleId: string,
  page?: number
): Promise<PaginatedBrowseResponse<BrowseContainerItem>> {
  const query = page ? `?page=${encodeURIComponent(page)}` : '';
  return apiClient<PaginatedBrowseResponse<BrowseContainerItem>>(
    `/api/v1/browse/modules/${encodeURIComponent(moduleId)}/chapters/${query}`
  );
}
