import { apiClient } from '@/lib/api';
import type {
  BrowseContainerItem,
  BrowseLessonItem,
  BrowseLessonDetailItem,
  BrowseLessonFilterParams,
  LessonNavigationResponse,
  PaginatedBrowseResponse,
  ResourceRetrievalResponse,
} from './types';

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

/**
 * Fetch the published lessons belonging to a specific visible chapter,
 * optionally filtered by date range (course_date_from, course_date_to).
 * Queries GET /api/v1/browse/chapters/:chapterId/lessons/
 */
export async function fetchChapterLessons(
  chapterId: string,
  params?: BrowseLessonFilterParams,
  page?: number
): Promise<PaginatedBrowseResponse<BrowseLessonItem>> {
  const queryParams = new URLSearchParams();
  if (params?.course_date_from) {
    queryParams.set('course_date_from', params.course_date_from);
  }
  if (params?.course_date_to) {
    queryParams.set('course_date_to', params.course_date_to);
  }
  if (page) {
    queryParams.set('page', String(page));
  }
  const queryString = queryParams.toString();
  const query = queryString ? `?${queryString}` : '';
  return apiClient<PaginatedBrowseResponse<BrowseLessonItem>>(
    `/api/v1/browse/chapters/${encodeURIComponent(chapterId)}/lessons/${query}`
  );
}

/**
 * Fetch the detail of a published lesson visible to students.
 * Queries GET /api/v1/browse/lessons/:lessonId/
 */
export async function fetchLessonDetail(
  lessonId: string,
  searchSessionId?: string
): Promise<BrowseLessonDetailItem> {
  const headers: Record<string, string> = {};
  if (searchSessionId && searchSessionId.trim()) {
    headers['X-Search-Session-Id'] = searchSessionId.trim();
  }
  return apiClient<BrowseLessonDetailItem>(
    `/api/v1/browse/lessons/${encodeURIComponent(lessonId)}/`,
    { headers }
  );
}

/**
 * Fetch a temporary signed URL for a document or image resource.
 * Queries GET /api/v1/resources/:resourceId/retrieval/
 */
export async function fetchResourceRetrieval(
  resourceId: string,
  disposition: 'inline' | 'attachment' = 'attachment'
): Promise<ResourceRetrievalResponse> {
  const query = disposition ? `?disposition=${encodeURIComponent(disposition)}` : '';
  return apiClient<ResourceRetrievalResponse>(
    `/api/v1/resources/${encodeURIComponent(resourceId)}/retrieval/${query}`
  );
}

/**
 * Fetch the navigation links (previous & next lesson) in the same course.
 * Queries GET /api/v1/browse/lessons/:lessonId/navigation/
 */
export async function fetchLessonNavigation(
  lessonId: string
): Promise<LessonNavigationResponse> {
  return apiClient<LessonNavigationResponse>(
    `/api/v1/browse/lessons/${encodeURIComponent(lessonId)}/navigation/`
  );
}



