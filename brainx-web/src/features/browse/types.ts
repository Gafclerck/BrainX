/**
 * Data contracts for Student published curriculum exploration (Story FE-2.2).
 * Strictly mirrors the DRF BrowseContainerSerializer and standard pagination envelope.
 */

export interface BrowseContainerItem {
  id: string;
  name: string;
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
  | { status: 'error'; is404: boolean; message: string };
