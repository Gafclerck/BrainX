export type FeedbackCategory = 'bug' | 'suggestion' | 'recommendation' | 'other';

export type FeedbackStatus = 'new' | 'read' | 'processed' | 'archived';

export interface Feedback {
  id: string;
  category: FeedbackCategory;
  category_display: string;
  subject: string;
  message: string;
  page_url: string;
  status: FeedbackStatus;
  status_display: string;
  admin_notes: string;
  created_at: string;
  updated_at: string;
}

export interface FeedbackCreatePayload {
  category?: FeedbackCategory;
  subject?: string;
  message: string;
  page_url?: string;
  hp_code?: string;
}

export interface FeedbackStats {
  total: number;
  new: number;
  read: number;
  processed: number;
}

export interface PaginatedFeedbackList {
  count: number;
  next: string | null;
  previous: string | null;
  results: Feedback[];
}
