/**
 * Data contracts for Publisher back-office curriculum management (Story FE-4.1).
 * Strictly mirrors the backend manageable() port (GET /api/v1/courses/),
 * CourseSerializer, and standard pagination envelope.
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
