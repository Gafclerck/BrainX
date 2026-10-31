/**
 * Data contracts for Publisher back-office curriculum management (Story FE-4.1, FE-4.2).
 * Strictly mirrors the backend manageable() port (GET /api/v1/courses/, modules/, chapters/),
 * CourseSerializer, ModuleSerializer, ChapterSerializer, and standard pagination envelope.
 */

export interface PublisherLastModifiedBy {
  id: string;
  email: string;
}

export type CourseStatus = 'published' | 'draft' | 'deleted';

export interface PublisherCourseItem {
  id: string;
  name: string;
  subject: string;
  position: number;
  is_deleted: boolean;
  is_published?: boolean;
  last_modified_by: PublisherLastModifiedBy | null;
  updated_at: string;
}

export interface PublisherModuleItem {
  id: string;
  name: string;
  position: number;
  is_deleted: boolean;
  last_modified_by: PublisherLastModifiedBy | null;
  updated_at: string;
}

export interface PublisherChapterItem {
  id: string;
  name: string;
  position: number;
  is_deleted: boolean;
  last_modified_by: PublisherLastModifiedBy | null;
  updated_at: string;
}

export interface PublisherLessonItem {
  id: string;
  title: string;
  description?: string | null;
  keywords?: string | null;
  teacher: string;
  course_date: string;
  position: number;
  is_deleted: boolean;
  is_published?: boolean;
  last_modified_by: PublisherLastModifiedBy | null;
  updated_at: string;
}

export interface ReorderPayload {
  order: string[];
}

export interface ReorderState {
  isReordering: boolean;
  error: string | null;
}

export interface PaginatedPublisherResponse<T = PublisherCourseItem> {
  count: number;
  next: string | null;
  previous: string | null;
  results: T[];
}

export type CourseStatusFilter = 'all' | 'published' | 'draft' | 'deleted';

export type PublisherViewState<T = PublisherCourseItem> =
  | { status: 'loading' }
  | { status: 'success'; data: PaginatedPublisherResponse<T> }
  | {
      status: 'error';
      message: string;
      is404?: boolean;
    };

export interface RemovalPreviewCounts {
  course?: number;
  module?: number;
  chapter?: number;
  lesson?: number;
  total: number;
}

export interface RemovalPreviewItem {
  level: 'course' | 'module' | 'chapter' | 'lesson';
  id: string;
  name: string;
  position: number;
}

export interface RemovalPreviewResponse {
  would_remove: RemovalPreviewCounts;
  items?: RemovalPreviewItem[];
}

export type ContainerType = 'course' | 'module' | 'chapter';

export interface CreateCoursePayload {
  name: string;
  subject: string;
}

export interface UpdateCoursePayload {
  name?: string;
  subject?: string;
}

export interface CreateModulePayload {
  name: string;
}

export interface UpdateModulePayload {
  name?: string;
}

export interface CreateChapterPayload {
  name: string;
}

export interface UpdateChapterPayload {
  name?: string;
}

export interface ContainerFormData {
  name: string;
  subject?: string;
}
