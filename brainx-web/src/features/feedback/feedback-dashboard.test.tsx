import { describe, it, expect, vi, beforeEach } from 'vitest';
import { screen, waitFor } from '@testing-library/react';
import { renderWithProviders } from '@/test/test-utils';
import { FeedbackDashboardPage } from './components/feedback-dashboard-page';
import * as feedbackApi from './api';
import type { Feedback, FeedbackStats } from './types';

const mockFeedbacks: Feedback[] = [
  {
    id: 'fb-1',
    category: 'bug',
    category_display: 'Signalement de bug',
    subject: 'Erreur quiz',
    message: 'Le quiz ne charge pas.',
    page_url: '/courses/intro',
    status: 'new',
    status_display: 'Nouveau',
    admin_notes: '',
    created_at: '2026-11-20T10:00:00Z',
    updated_at: '2026-11-20T10:00:00Z',
  },
  {
    id: 'fb-2',
    category: 'suggestion',
    category_display: 'Suggestion',
    subject: 'Mode sombre',
    message: 'Ajoutez un thème sombre pour la nuit.',
    page_url: '/courses',
    status: 'read',
    status_display: 'Lu',
    admin_notes: 'Prévu en v2',
    created_at: '2026-11-19T10:00:00Z',
    updated_at: '2026-11-19T12:00:00Z',
  },
];

const mockStats: FeedbackStats = {
  total: 2,
  new: 1,
  read: 1,
  processed: 0,
};

describe('FeedbackDashboardPage Component', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('renders dashboard with stats and feedback list', async () => {
    vi.spyOn(feedbackApi, 'getFeedbackList').mockResolvedValueOnce({
      count: 2,
      next: null,
      previous: null,
      results: mockFeedbacks,
    });
    vi.spyOn(feedbackApi, 'getFeedbackStats').mockResolvedValueOnce(mockStats);

    renderWithProviders(<FeedbackDashboardPage />, {
      auth: { isPublisher: true },
    });

    expect(screen.getByText('Boîte à suggestions & retours anonymes')).toBeInTheDocument();

    // Check stats cards
    await waitFor(() => {
      expect(screen.getByText('Total reçu')).toBeInTheDocument();
      expect(screen.getByText('Nouveaux (non lus)')).toBeInTheDocument();
    });

    // Check feedback cards
    expect(screen.getByText('Erreur quiz')).toBeInTheDocument();
    expect(screen.getByText('Mode sombre')).toBeInTheDocument();
    expect(screen.getByText('Le quiz ne charge pas.')).toBeInTheDocument();
  });

  it('allows superadmin to mark a feedback as read', async () => {
    vi.spyOn(feedbackApi, 'getFeedbackList').mockResolvedValueOnce({
      count: 2,
      next: null,
      previous: null,
      results: mockFeedbacks,
    });
    vi.spyOn(feedbackApi, 'getFeedbackStats').mockResolvedValue(mockStats);

    const updateSpy = vi.spyOn(feedbackApi, 'updateFeedback').mockResolvedValueOnce({
      ...mockFeedbacks[0],
      status: 'read',
      status_display: 'Lu',
    });

    const { user } = renderWithProviders(<FeedbackDashboardPage />, {
      auth: { isPublisher: true },
    });

    await waitFor(() => {
      expect(screen.getByTestId('action-mark-read-fb-1')).toBeInTheDocument();
    });

    await user.click(screen.getByTestId('action-mark-read-fb-1'));

    expect(updateSpy).toHaveBeenCalledWith('fb-1', { status: 'read' });
  });

  it('allows superadmin to mark a feedback as processed', async () => {
    vi.spyOn(feedbackApi, 'getFeedbackList').mockResolvedValueOnce({
      count: 2,
      next: null,
      previous: null,
      results: mockFeedbacks,
    });
    vi.spyOn(feedbackApi, 'getFeedbackStats').mockResolvedValue(mockStats);

    const updateSpy = vi.spyOn(feedbackApi, 'updateFeedback').mockResolvedValueOnce({
      ...mockFeedbacks[0],
      status: 'processed',
      status_display: 'Traité',
    });

    const { user } = renderWithProviders(<FeedbackDashboardPage />, {
      auth: { isPublisher: true },
    });

    await waitFor(() => {
      expect(screen.getByTestId('action-mark-processed-fb-1')).toBeInTheDocument();
    });

    await user.click(screen.getByTestId('action-mark-processed-fb-1'));

    expect(updateSpy).toHaveBeenCalledWith('fb-1', { status: 'processed' });
  });

  it('allows superadmin to delete a feedback', async () => {
    vi.spyOn(feedbackApi, 'getFeedbackList').mockResolvedValueOnce({
      count: 2,
      next: null,
      previous: null,
      results: mockFeedbacks,
    });
    vi.spyOn(feedbackApi, 'getFeedbackStats').mockResolvedValue(mockStats);
    vi.spyOn(window, 'confirm').mockReturnValue(true);

    const deleteSpy = vi.spyOn(feedbackApi, 'deleteFeedback').mockResolvedValueOnce();

    const { user } = renderWithProviders(<FeedbackDashboardPage />, {
      auth: { isPublisher: true },
    });

    await waitFor(() => {
      expect(screen.getByTestId('action-delete-fb-1')).toBeInTheDocument();
    });

    await user.click(screen.getByTestId('action-delete-fb-1'));

    expect(deleteSpy).toHaveBeenCalledWith('fb-1');
  });
});
