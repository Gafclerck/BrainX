import { apiClient, ApiError } from '@/lib/api';
import type {
  PaginatedPublisherResponse,
  PublisherCourseItem,
  PublisherModuleItem,
  PublisherChapterItem,
  RemovalPreviewResponse,
  CreateCoursePayload,
  UpdateCoursePayload,
  CreateModulePayload,
  UpdateModulePayload,
  CreateChapterPayload,
  UpdateChapterPayload,
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

/**
 * Fetch a single manageable course by ID.
 * Tries direct GET /api/v1/courses/:id/, falling back to paginated list search if needed.
 */
export async function fetchManageableCourse(
  courseId: string
): Promise<PublisherCourseItem> {
  try {
    return await apiClient<PublisherCourseItem>(
      `/api/v1/courses/${encodeURIComponent(courseId)}/`
    );
  } catch (err: unknown) {
    if (
      err instanceof ApiError &&
      (err.envelope.status === 401 || err.envelope.status === 403)
    ) {
      throw err;
    }

    let page = 1;
    while (true) {
      const res = await fetchManageableCourses(page);
      const found = res.results?.find((c) => c.id === courseId);
      if (found) return found;
      if (!res.next) break;
      page++;
    }
    throw new Error('Cours introuvable');
  }
}

/**
 * Create a new Course at the root curriculum level.
 * POST /api/v1/courses/
 */
export async function createCourse(
  payload: CreateCoursePayload
): Promise<PublisherCourseItem> {
  return apiClient<PublisherCourseItem>('/api/v1/courses/', {
    method: 'POST',
    data: payload,
  });
}

/**
 * Update an existing Course (name, subject).
 * PATCH /api/v1/courses/:id/
 */
export async function updateCourse(
  id: string,
  payload: UpdateCoursePayload
): Promise<PublisherCourseItem> {
  return apiClient<PublisherCourseItem>(
    `/api/v1/courses/${encodeURIComponent(id)}/`,
    {
      method: 'PATCH',
      data: payload,
    }
  );
}

/**
 * Soft-delete an existing Course and cascade-hide descendants.
 * DELETE /api/v1/courses/:id/
 */
export async function deleteCourse(id: string): Promise<PublisherCourseItem> {
  return apiClient<PublisherCourseItem>(
    `/api/v1/courses/${encodeURIComponent(id)}/`,
    {
      method: 'DELETE',
    }
  );
}

/**
 * Preview cascade counts before soft-deleting a Course.
 * GET /api/v1/courses/:id/removal-preview/
 */
export async function fetchCourseRemovalPreview(
  id: string
): Promise<RemovalPreviewResponse> {
  return apiClient<RemovalPreviewResponse>(
    `/api/v1/courses/${encodeURIComponent(id)}/removal-preview/`
  );
}

/**
 * Fetch manageable modules under a Course.
 * GET /api/v1/courses/:courseId/modules/?page=...
 */
export async function fetchManageableModules(
  courseId: string,
  page?: number
): Promise<PaginatedPublisherResponse<PublisherModuleItem>> {
  const query = page ? `?page=${encodeURIComponent(page)}` : '';
  return apiClient<PaginatedPublisherResponse<PublisherModuleItem>>(
    `/api/v1/courses/${encodeURIComponent(courseId)}/modules/${query}`
  );
}

/**
 * Create a new Module under a parent Course.
 * POST /api/v1/courses/:courseId/modules/
 */
export async function createModule(
  courseId: string,
  payload: CreateModulePayload
): Promise<PublisherModuleItem> {
  return apiClient<PublisherModuleItem>(
    `/api/v1/courses/${encodeURIComponent(courseId)}/modules/`,
    {
      method: 'POST',
      data: payload,
    }
  );
}

/**
 * Update an existing Module (name).
 * PATCH /api/v1/modules/:id/
 */
export async function updateModule(
  id: string,
  payload: UpdateModulePayload
): Promise<PublisherModuleItem> {
  return apiClient<PublisherModuleItem>(
    `/api/v1/modules/${encodeURIComponent(id)}/`,
    {
      method: 'PATCH',
      data: payload,
    }
  );
}

/**
 * Soft-delete an existing Module and cascade-hide descendants.
 * DELETE /api/v1/modules/:id/
 */
export async function deleteModule(id: string): Promise<PublisherModuleItem> {
  return apiClient<PublisherModuleItem>(
    `/api/v1/modules/${encodeURIComponent(id)}/`,
    {
      method: 'DELETE',
    }
  );
}

/**
 * Preview cascade counts before soft-deleting a Module.
 * GET /api/v1/modules/:id/removal-preview/
 */
export async function fetchModuleRemovalPreview(
  id: string
): Promise<RemovalPreviewResponse> {
  return apiClient<RemovalPreviewResponse>(
    `/api/v1/modules/${encodeURIComponent(id)}/removal-preview/`
  );
}

/**
 * Fetch manageable chapters under a Module.
 * GET /api/v1/modules/:moduleId/chapters/?page=...
 */
export async function fetchManageableChapters(
  moduleId: string,
  page?: number
): Promise<PaginatedPublisherResponse<PublisherChapterItem>> {
  const query = page ? `?page=${encodeURIComponent(page)}` : '';
  return apiClient<PaginatedPublisherResponse<PublisherChapterItem>>(
    `/api/v1/modules/${encodeURIComponent(moduleId)}/chapters/${query}`
  );
}

/**
 * Create a new Chapter under a parent Module.
 * POST /api/v1/modules/:moduleId/chapters/
 */
export async function createChapter(
  moduleId: string,
  payload: CreateChapterPayload
): Promise<PublisherChapterItem> {
  return apiClient<PublisherChapterItem>(
    `/api/v1/modules/${encodeURIComponent(moduleId)}/chapters/`,
    {
      method: 'POST',
      data: payload,
    }
  );
}

/**
 * Update an existing Chapter (name).
 * PATCH /api/v1/chapters/:id/
 */
export async function updateChapter(
  id: string,
  payload: UpdateChapterPayload
): Promise<PublisherChapterItem> {
  return apiClient<PublisherChapterItem>(
    `/api/v1/chapters/${encodeURIComponent(id)}/`,
    {
      method: 'PATCH',
      data: payload,
    }
  );
}

/**
 * Soft-delete an existing Chapter and cascade-hide descendants.
 * DELETE /api/v1/chapters/:id/
 */
export async function deleteChapter(id: string): Promise<PublisherChapterItem> {
  return apiClient<PublisherChapterItem>(
    `/api/v1/chapters/${encodeURIComponent(id)}/`,
    {
      method: 'DELETE',
    }
  );
}

/**
 * Preview cascade counts before soft-deleting a Chapter.
 * GET /api/v1/chapters/:id/removal-preview/
 */
export async function fetchChapterRemovalPreview(
  id: string
): Promise<RemovalPreviewResponse> {
  return apiClient<RemovalPreviewResponse>(
    `/api/v1/chapters/${encodeURIComponent(id)}/removal-preview/`
  );
}
