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
  chapter_id?: string;
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

export interface UpdateLessonPayload {
  title?: string;
  description?: string | null;
  teacher?: string;
  course_date?: string;
  keywords?: string | null;
}

export interface MoveLessonPayload {
  new_chapter_id?: string;
  chapter?: string;
}

export interface ChapterOptionItem {
  id: string;
  name: string;
  course_name: string;
  module_name: string;
  course_id?: string;
  module_id?: string;
  courseName?: string;
  moduleName?: string;
}

export type PublisherResourceType =
  | 'document'
  | 'image'
  | 'video'
  | 'external_link';

export interface PublisherResourceItem {
  id: string;
  type: PublisherResourceType;
  title: string;
  note?: string | null;
  url?: string | null;
  is_deleted: boolean;
  last_modified_by: PublisherLastModifiedBy | null;
  updated_at: string;
}

export interface CreateResourcePayload {
  type: PublisherResourceType;
  title: string;
  note?: string | null;
  url?: string | null;
  file?: File | Blob | null;
}

export type TrashItemType = 'course' | 'module' | 'chapter' | 'lesson' | 'resource';

export type TrashFilterType = 'all' | TrashItemType;

export type RestoredItemResult =
  | PublisherCourseItem
  | PublisherModuleItem
  | PublisherChapterItem
  | PublisherLessonItem
  | PublisherResourceItem;

export interface TrashItem {
  id: string;
  type: TrashItemType;
  name: string;
  deleted_at: string;
  last_modified_by: PublisherLastModifiedBy | null;
  parent_path?: string;
}

export interface BlockedLessonPreviewItem {
  id: string;
  missing: string[];
  title?: string;
  teacher?: string;
  course_date?: string;
  description?: string | null;
}

export interface BlockedLessonsTableProps {
  blocked: BlockedLessonPreviewItem[];
  onEditLesson: (lessonId: string) => void;
  isUpdating?: boolean;
}

export interface QuickEditLessonDrawerProps {
  isOpen: boolean;
  onClose: () => void;
  lessonId: string | null;
  onSaveSuccess: () => void;
}

export interface BulkPublishPreviewResponse {
  would_change: number;
  blocked: BlockedLessonPreviewItem[];
}

export interface BulkPublishBlockedCandidate {
  id: string;
  missing: string[];
}

export interface BulkPublishCommitPayload {
  would_change: number;
  blocked: BulkPublishBlockedCandidate[];
}

export interface BulkPublishCommitResponse {
  changed: number;
  errors: {
    blocked: BulkPublishBlockedCandidate[];
  };
}

export interface BulkPublishModalProps {
  isOpen: boolean;
  onClose: () => void;
  type: 'module' | 'chapter';
  item: {
    id: string;
    name: string;
  } | null;
  onSuccess?: (result: BulkPublishCommitResponse) => void;
}

/**
 * Types for Publisher Search Analytics (Story FE-5.5).
 */
export interface ZeroResultQueryItem {
  query: string;
  count: number;
}

export interface SearchAggregateResponse {
  total_queries: number;
  zero_result_queries: number;
  total_zero_result_queries?: number;
  total_answers: number;
  negative_answers: number;
  zero_result_rate: number;
  sm5_rate: number;
  sm5_zero_result_rate?: number;
  negative_answer_rate: number;
  sm6_rate: number;
  sm6_negative_answer_rate?: number;
  grouped_queries: ZeroResultQueryItem[];
  grouped_zero_result_queries: ZeroResultQueryItem[];
  zero_result_grouped_queries?: ZeroResultQueryItem[];
}

export interface SearchAnalyticsDateRange {
  from: string;
  to: string;
}

export type SearchAnalyticsPreset = 7 | 30 | 90 | 'custom';

export type SearchAnalyticsViewState =
  | { status: 'loading' }
  | { status: 'success'; data: SearchAggregateResponse }
  | { status: 'error'; message: string };



