import { apiClient } from '@/lib/api';
import type {
  Feedback,
  FeedbackCreatePayload,
  FeedbackStats,
  PaginatedFeedbackList,
  FeedbackStatus,
} from './types';

/**
 * Submit anonymous feedback.
 * Intentionally strips Authorization header to guarantee network-level anonymity.
 */
export async function submitFeedback(payload: FeedbackCreatePayload): Promise<Feedback> {
  return apiClient<Feedback>('/api/v1/feedback/', {
    method: 'POST',
    data: payload,
    headers: {
      Authorization: '',
    },
  });
}

/**
 * Fetch aggregate feedback counts for the superadmin dashboard.
 */
export async function getFeedbackStats(): Promise<FeedbackStats> {
  return apiClient<FeedbackStats>('/api/v1/admin/feedback/stats/');
}

/**
 * List feedback submissions with optional filtering, search, and pagination.
 */
export async function getFeedbackList(params?: {
  status?: string;
  category?: string;
  search?: string;
  page?: number;
}): Promise<PaginatedFeedbackList> {
  const query = new URLSearchParams();
  if (params?.status && params.status !== 'all') {
    query.set('status', params.status);
  }
  if (params?.category && params.category !== 'all') {
    query.set('category', params.category);
  }
  if (params?.search && params.search.trim()) {
    query.set('search', params.search.trim());
  }
  if (params?.page && params.page > 1) {
    query.set('page', params.page.toString());
  }

  const qs = query.toString();
  const endpoint = `/api/v1/admin/feedback/${qs ? `?${qs}` : ''}`;
  return apiClient<PaginatedFeedbackList>(endpoint);
}

/**
 * Update feedback status or admin notes.
 */
export async function updateFeedback(
  id: string,
  payload: { status?: FeedbackStatus; admin_notes?: string }
): Promise<Feedback> {
  return apiClient<Feedback>(`/api/v1/admin/feedback/${id}/`, {
    method: 'PATCH',
    data: payload,
  });
}

/**
 * Delete a feedback item.
 */
export async function deleteFeedback(id: string): Promise<void> {
  return apiClient<void>(`/api/v1/admin/feedback/${id}/`, {
    method: 'DELETE',
  });
}
