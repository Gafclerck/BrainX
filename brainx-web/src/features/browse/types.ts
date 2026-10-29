/**
 * Data contracts for Student published curriculum exploration (Story FE-2.2 & FE-2.3).
 * Strictly mirrors the DRF BrowseContainerSerializer, BrowseLessonSerializer,
 * and standard pagination envelope.
 */

export interface BrowseContainerItem {
  id: string;
  name: string;
}

export type LessonResourceType = 'document' | 'image' | 'video' | 'external_link';

export interface LessonResourceItem {
  id: string;
  type: LessonResourceType;
  title?: string;
  note?: string;
  url?: string | null;
}

export interface BrowseLessonItem {
  id: string;
  title: string;
  course_name: string;
  module_name: string;
  chapter_name: string;
  teacher: string;
  course_date: string;
  resources?: LessonResourceItem[];
}

export interface BrowseLessonDetailItem extends BrowseLessonItem {
  description: string;
}

export interface BrowseLessonFilterParams {
  course_date_from?: string;
  course_date_to?: string;
}

export interface PaginatedBrowseResponse<T> {
  count: number;
  next: string | null;
  previous: string | null;
  results: T[];
}

export type BrowseViewState<T> =
  | { status: 'loading' }
  | { status: 'success'; data: PaginatedBrowseResponse<T> }
  | {
      status: 'error';
      is404: boolean;
      is400?: boolean;
      fieldErrors?: Record<string, string[]>;
      message: string;
    };

