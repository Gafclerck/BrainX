import { apiClient, ApiError } from '@/lib/api';
import type {
  PaginatedPublisherResponse,
  PublisherCourseItem,
  PublisherModuleItem,
  PublisherChapterItem,
  PublisherLessonItem,
  RemovalPreviewResponse,
  CreateCoursePayload,
  UpdateCoursePayload,
  CreateModulePayload,
  UpdateModulePayload,
  CreateChapterPayload,
  UpdateChapterPayload,
  ReorderPayload,
  UpdateLessonPayload,
  MoveLessonPayload,
  ChapterOptionItem,
  PublisherResourceItem,
  CreateResourcePayload,
  TrashItem,
  RestoredItemResult,
  BlockedLessonPreviewItem,
  BulkPublishPreviewResponse,
  BulkPublishCommitPayload,
  BulkPublishCommitResponse,
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
 * Preview bulk publish impact on all descendant lessons in a Module.
 * GET /api/v1/modules/:id/bulk-publish/preview/
 */
export async function fetchModuleBulkPublishPreview(
  moduleId: string
): Promise<BulkPublishPreviewResponse> {
  return apiClient<BulkPublishPreviewResponse>(
    `/api/v1/modules/${encodeURIComponent(moduleId)}/bulk-publish/preview/`
  );
}

/**
 * Commit bulk publish for all descendant lessons in a Module under row lock.
 * POST /api/v1/modules/:id/bulk-publish/
 * Body: { would_change, blocked: [{ id, missing }] }
 */
export async function commitModuleBulkPublish(
  moduleId: string,
  payload: BulkPublishCommitPayload
): Promise<BulkPublishCommitResponse> {
  return apiClient<BulkPublishCommitResponse>(
    `/api/v1/modules/${encodeURIComponent(moduleId)}/bulk-publish/`,
    {
      method: 'POST',
      data: payload,
    }
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

/**
 * Preview bulk publish impact on all descendant lessons in a Chapter.
 * GET /api/v1/chapters/:id/bulk-publish/preview/
 */
export async function fetchChapterBulkPublishPreview(
  chapterId: string
): Promise<BulkPublishPreviewResponse> {
  return apiClient<BulkPublishPreviewResponse>(
    `/api/v1/chapters/${encodeURIComponent(chapterId)}/bulk-publish/preview/`
  );
}

/**
 * Commit bulk publish for all descendant lessons in a Chapter under row lock.
 * POST /api/v1/chapters/:id/bulk-publish/
 * Body: { would_change, blocked: [{ id, missing }] }
 */
export async function commitChapterBulkPublish(
  chapterId: string,
  payload: BulkPublishCommitPayload
): Promise<BulkPublishCommitResponse> {
  return apiClient<BulkPublishCommitResponse>(
    `/api/v1/chapters/${encodeURIComponent(chapterId)}/bulk-publish/`,
    {
      method: 'POST',
      data: payload,
    }
  );
}

/**
 * Reorder modules under a course.
 * PUT /api/v1/courses/:courseId/modules/order/
 * Submits exact permutation of all non-deleted direct module UUIDs.
 */
export async function reorderModules(
  courseId: string,
  order: string[]
): Promise<PublisherModuleItem[]> {
  const payload: ReorderPayload = { order };
  return apiClient<PublisherModuleItem[]>(
    `/api/v1/courses/${encodeURIComponent(courseId)}/modules/order/`,
    {
      method: 'PUT',
      data: payload,
    }
  );
}

/**
 * Reorder chapters under a module.
 * PUT /api/v1/modules/:moduleId/chapters/order/
 * Submits exact permutation of all non-deleted direct chapter UUIDs.
 */
export async function reorderChapters(
  moduleId: string,
  order: string[]
): Promise<PublisherChapterItem[]> {
  const payload: ReorderPayload = { order };
  return apiClient<PublisherChapterItem[]>(
    `/api/v1/modules/${encodeURIComponent(moduleId)}/chapters/order/`,
    {
      method: 'PUT',
      data: payload,
    }
  );
}

/**
 * Reorder lessons under a chapter.
 * PUT /api/v1/chapters/:chapterId/lessons/order/
 * Submits exact permutation of all non-deleted direct lesson UUIDs.
 */
export async function reorderLessons(
  chapterId: string,
  order: string[]
): Promise<PublisherLessonItem[]> {
  const payload: ReorderPayload = { order };
  return apiClient<PublisherLessonItem[]>(
    `/api/v1/chapters/${encodeURIComponent(chapterId)}/lessons/order/`,
    {
      method: 'PUT',
      data: payload,
    }
  );
}

/**
 * Fetch manageable lessons under a chapter.
 * Loops through all pages if next exists to ensure exhaustive list of children (Story FE-4.3).
 * Queries backend manageable() port: GET /api/v1/chapters/:chapterId/lessons/?page=...
 */
export async function fetchManageableLessons(
  chapterId: string,
  page?: number
): Promise<PaginatedPublisherResponse<PublisherLessonItem>> {
  if (page !== undefined) {
    const query = `?page=${encodeURIComponent(page)}`;
    return apiClient<PaginatedPublisherResponse<PublisherLessonItem>>(
      `/api/v1/chapters/${encodeURIComponent(chapterId)}/lessons/${query}`
    );
  }

  let currentPage = 1;
  let allResults: PublisherLessonItem[] = [];
  let totalCount = 0;

  while (true) {
    const query = currentPage === 1 ? '' : `?page=${encodeURIComponent(currentPage)}`;
    const res = await apiClient<PaginatedPublisherResponse<PublisherLessonItem>>(
      `/api/v1/chapters/${encodeURIComponent(chapterId)}/lessons/${query}`
    );
    totalCount = res.count ?? allResults.length + (res.results?.length || 0);
    allResults = allResults.concat(res.results || []);
    if (!res.next) break;
    currentPage++;
  }

  return {
    count: totalCount,
    next: null,
    previous: null,
    results: allResults,
  };
}

/**
 * Fetch a single manageable lesson by ID.
 * GET /api/v1/lessons/:lessonId/
 */
export async function fetchManageableLesson(
  lessonId: string
): Promise<PublisherLessonItem> {
  return apiClient<PublisherLessonItem>(
    `/api/v1/lessons/${encodeURIComponent(lessonId)}/`
  );
}

/**
 * Update metadata on an existing Lesson.
 * PATCH /api/v1/lessons/:lessonId/
 */
export async function updateLesson(
  lessonId: string,
  payload: UpdateLessonPayload
): Promise<PublisherLessonItem> {
  return apiClient<PublisherLessonItem>(
    `/api/v1/lessons/${encodeURIComponent(lessonId)}/`,
    {
      method: 'PATCH',
      data: payload,
    }
  );
}

/**
 * Move a lesson to another destination chapter.
 * POST /api/v1/lessons/:lessonId/move/
 */
export async function moveLesson(
  lessonId: string,
  target: string | MoveLessonPayload
): Promise<PublisherLessonItem> {
  const data = typeof target === 'string'
    ? { new_chapter_id: target }
    : target;
  return apiClient<PublisherLessonItem>(
    `/api/v1/lessons/${encodeURIComponent(lessonId)}/move/`,
    {
      method: 'POST',
      data,
    }
  );
}

/**
 * Publish an existing Lesson.
 * POST /api/v1/lessons/:lessonId/publish/
 */
export async function publishLesson(
  lessonId: string
): Promise<PublisherLessonItem> {
  return apiClient<PublisherLessonItem>(
    `/api/v1/lessons/${encodeURIComponent(lessonId)}/publish/`,
    {
      method: 'POST',
    }
  );
}

/**
 * Unpublish an existing Lesson.
 * POST /api/v1/lessons/:lessonId/unpublish/
 */
export async function unpublishLesson(
  lessonId: string
): Promise<PublisherLessonItem> {
  return apiClient<PublisherLessonItem>(
    `/api/v1/lessons/${encodeURIComponent(lessonId)}/unpublish/`,
    {
      method: 'POST',
    }
  );
}

/**
 * Fetch all chapters across courses and modules for the chapter move modal.
 * Returns hierarchical option list: [Course] > [Module] > [Chapter].
 */
export async function fetchAllManageableChapters(): Promise<ChapterOptionItem[]> {
  const chapterOptions: ChapterOptionItem[] = [];
  let coursePage = 1;
  const allCourses: PublisherCourseItem[] = [];
  while (true) {
    const res = await fetchManageableCourses(coursePage);
    allCourses.push(...(res.results || []));
    if (!res.next) break;
    coursePage++;
  }

  for (const course of allCourses) {
    if (course.is_deleted) continue;
    let modPage = 1;
    const allModules: PublisherModuleItem[] = [];
    while (true) {
      const res = await fetchManageableModules(course.id, modPage);
      allModules.push(...(res.results || []));
      if (!res.next) break;
      modPage++;
    }

    for (const mod of allModules) {
      if (mod.is_deleted) continue;
      let chapPage = 1;
      const allChapters: PublisherChapterItem[] = [];
      while (true) {
        const res = await fetchManageableChapters(mod.id, chapPage);
        allChapters.push(...(res.results || []));
        if (!res.next) break;
        chapPage++;
      }

      for (const chap of allChapters) {
        if (chap.is_deleted) continue;
        chapterOptions.push({
          id: chap.id,
          name: chap.name,
          course_name: course.name,
          module_name: mod.name,
          courseName: course.name,
          moduleName: mod.name,
          course_id: course.id,
          module_id: mod.id,
        });
      }
    }
  }

  return chapterOptions;
}

/**
 * Fetch manageable pedagogical resources attached to a lesson.
 * Unwraps all paginated results to ensure exhaustive list of resources (Story FE-4.5).
 * GET /api/v1/lessons/:lessonId/resources/?page=...
 */
export async function fetchManageableResources(
  lessonId: string
): Promise<PublisherResourceItem[]> {
  let currentPage = 1;
  let allResults: PublisherResourceItem[] = [];

  while (true) {
    const query = currentPage === 1 ? '' : `?page=${encodeURIComponent(currentPage)}`;
    const res = await apiClient<
      PaginatedPublisherResponse<PublisherResourceItem> | PublisherResourceItem[]
    >(
      `/api/v1/lessons/${encodeURIComponent(lessonId)}/resources/${query}`
    );

    if (Array.isArray(res)) {
      return res;
    }

    allResults = allResults.concat(res.results || []);
    if (!res.next) break;
    currentPage++;
  }

  return allResults;
}

/**
 * Create a pedagogical resource attached to a lesson.
 * POST /api/v1/lessons/:lessonId/resources/
 * Handles multipart/form-data for document/image, JSON for video/external_link.
 */
export async function createResource(
  lessonId: string,
  payload: CreateResourcePayload
): Promise<PublisherResourceItem> {
  const isFileUpload = payload.type === 'document' || payload.type === 'image';

  if (isFileUpload) {
    const formData = new FormData();
    formData.append('type', payload.type);
    if (payload.title !== undefined) {
      formData.append('title', payload.title);
    }
    if (payload.note !== undefined && payload.note !== null) {
      formData.append('note', payload.note);
    }
    if (payload.file) {
      formData.append('file', payload.file);
    }

    return apiClient<PublisherResourceItem>(
      `/api/v1/lessons/${encodeURIComponent(lessonId)}/resources/`,
      {
        method: 'POST',
        data: formData,
      }
    );
  }

  const jsonPayload: Record<string, unknown> = {
    type: payload.type,
    title: payload.title,
    url: payload.url,
  };
  if (payload.note !== undefined && payload.note !== null) {
    jsonPayload.note = payload.note;
  }

  return apiClient<PublisherResourceItem>(
    `/api/v1/lessons/${encodeURIComponent(lessonId)}/resources/`,
    {
      method: 'POST',
      data: jsonPayload,
    }
  );
}

/**
 * Soft-delete an existing resource.
 * DELETE /api/v1/resources/:resourceId/
 */
export async function deleteResource(
  resourceId: string
): Promise<PublisherResourceItem> {
  return apiClient<PublisherResourceItem>(
    `/api/v1/resources/${encodeURIComponent(resourceId)}/`,
    {
      method: 'DELETE',
    }
  );
}

/**
 * Restore a soft-deleted course.
 * POST /api/v1/courses/:id/restore/
 */
export async function restoreCourse(id: string): Promise<PublisherCourseItem> {
  return apiClient<PublisherCourseItem>(
    `/api/v1/courses/${encodeURIComponent(id)}/restore/`,
    {
      method: 'POST',
    }
  );
}

/**
 * Restore a soft-deleted module.
 * POST /api/v1/modules/:id/restore/
 */
export async function restoreModule(id: string): Promise<PublisherModuleItem> {
  return apiClient<PublisherModuleItem>(
    `/api/v1/modules/${encodeURIComponent(id)}/restore/`,
    {
      method: 'POST',
    }
  );
}

/**
 * Restore a soft-deleted chapter.
 * POST /api/v1/chapters/:id/restore/
 */
export async function restoreChapter(id: string): Promise<PublisherChapterItem> {
  return apiClient<PublisherChapterItem>(
    `/api/v1/chapters/${encodeURIComponent(id)}/restore/`,
    {
      method: 'POST',
    }
  );
}

/**
 * Restore a soft-deleted lesson.
 * POST /api/v1/lessons/:id/restore/
 */
export async function restoreLesson(id: string): Promise<PublisherLessonItem> {
  return apiClient<PublisherLessonItem>(
    `/api/v1/lessons/${encodeURIComponent(id)}/restore/`,
    {
      method: 'POST',
    }
  );
}

/**
 * Restore a soft-deleted resource.
 * POST /api/v1/resources/:id/restore/
 */
export async function restoreResource(
  id: string
): Promise<PublisherResourceItem> {
  return apiClient<PublisherResourceItem>(
    `/api/v1/resources/${encodeURIComponent(id)}/restore/`,
    {
      method: 'POST',
    }
  );
}

/**
 * Restore a trash item by dispatching to the type-specific restore API function.
 */
export async function restoreTrashItem(item: TrashItem): Promise<RestoredItemResult> {
  if (!item || !item.type) {
    throw new Error('Élément invalide pour la restauration');
  }

  switch (item.type) {
    case 'course':
      return restoreCourse(item.id);
    case 'module':
      return restoreModule(item.id);
    case 'chapter':
      return restoreChapter(item.id);
    case 'lesson':
      return restoreLesson(item.id);
    case 'resource':
      return restoreResource(item.id);
    default:
      throw new Error(`Type d'élément inconnu: ${(item as TrashItem).type}`);
  }
}

/**
 * Aggregates all soft-deleted items (is_deleted === true) across courses, modules,
 * chapters, lessons, and resources by traversing the backend manageable() hierarchy.
 * Results are sorted descending by deleted_at (updated_at).
 * Individual branch failures are handled gracefully without aborting the entire scrape.
 */
export async function fetchTrashItems(): Promise<TrashItem[]> {
  const trashItems: TrashItem[] = [];

  // 1. Fetch all courses (both active and deleted)
  let coursePage = 1;
  const allCourses: PublisherCourseItem[] = [];
  while (true) {
    const res = await fetchManageableCourses(coursePage);
    allCourses.push(...(res.results || []));
    if (!res.next) break;
    coursePage++;
  }

  for (const course of allCourses) {
    if (course.is_deleted) {
      trashItems.push({
        id: course.id,
        type: 'course',
        name: course.name,
        deleted_at: course.updated_at,
        last_modified_by: course.last_modified_by,
        parent_path: undefined,
      });
    }

    // 2. Fetch all modules under this course
    let modPage = 1;
    const allModules: PublisherModuleItem[] = [];
    while (true) {
      try {
        const res = await fetchManageableModules(course.id, modPage);
        allModules.push(...(res.results || []));
        if (!res.next) break;
        modPage++;
      } catch {
        break;
      }
    }

    for (const mod of allModules) {
      const modulePath = `[Cours] ${course.name}`;
      if (mod.is_deleted) {
        trashItems.push({
          id: mod.id,
          type: 'module',
          name: mod.name,
          deleted_at: mod.updated_at,
          last_modified_by: mod.last_modified_by,
          parent_path: modulePath,
        });
      }

      // 3. Fetch all chapters under this module
      let chapPage = 1;
      const allChapters: PublisherChapterItem[] = [];
      while (true) {
        try {
          const res = await fetchManageableChapters(mod.id, chapPage);
          allChapters.push(...(res.results || []));
          if (!res.next) break;
          chapPage++;
        } catch {
          break;
        }
      }

      for (const chap of allChapters) {
        const chapterPath = `[Cours] ${course.name} > [Module] ${mod.name}`;
        if (chap.is_deleted) {
          trashItems.push({
            id: chap.id,
            type: 'chapter',
            name: chap.name,
            deleted_at: chap.updated_at,
            last_modified_by: chap.last_modified_by,
            parent_path: chapterPath,
          });
        }

        // 4. Fetch all lessons under this chapter
        let allLessons: PublisherLessonItem[] = [];
        try {
          const lessonsRes = await fetchManageableLessons(chap.id);
          allLessons = lessonsRes.results || [];
        } catch {
          allLessons = [];
        }

        for (const lesson of allLessons) {
          const lessonPath = `[Cours] ${course.name} > [Module] ${mod.name} > [Chapitre] ${chap.name}`;
          if (lesson.is_deleted) {
            trashItems.push({
              id: lesson.id,
              type: 'lesson',
              name: lesson.title,
              deleted_at: lesson.updated_at,
              last_modified_by: lesson.last_modified_by,
              parent_path: lessonPath,
            });
          }

          // 5. Fetch all resources under this lesson
          let allResources: PublisherResourceItem[] = [];
          try {
            allResources = await fetchManageableResources(lesson.id);
          } catch {
            allResources = [];
          }

          for (const resource of allResources) {
            const resourcePath = `[Cours] ${course.name} > [Module] ${mod.name} > [Chapitre] ${chap.name} > [Leçon] ${lesson.title}`;
            if (resource.is_deleted) {
              trashItems.push({
                id: resource.id,
                type: 'resource',
                name: resource.title,
                deleted_at: resource.updated_at,
                last_modified_by: resource.last_modified_by,
                parent_path: resourcePath,
              });
            }
          }
        }
      }
    }
  }

  // Sort descending by deleted_at (most recently deleted first)
  trashItems.sort((a, b) => {
    const timeA = new Date(a.deleted_at).getTime();
    const timeB = new Date(b.deleted_at).getTime();
    if (!isNaN(timeA) && !isNaN(timeB)) {
      return timeB - timeA;
    }
    return (b.deleted_at || '').localeCompare(a.deleted_at || '');
  });

  return trashItems;
}


