import { describe, it, expect, vi, beforeEach } from 'vitest';
import { screen, waitFor } from '@testing-library/react';
import { renderWithProviders } from '@/test/test-utils';
import { FeedbackWidget } from './components/feedback-widget';
import * as feedbackApi from './api';

describe('FeedbackWidget Component', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('renders floating trigger button with accessible label', () => {
    renderWithProviders(<FeedbackWidget />);

    const trigger = screen.getByTestId('feedback-widget-trigger');
    expect(trigger).toBeInTheDocument();
    expect(trigger).toHaveAttribute('aria-label', 'Ouvrir la boîte à suggestions');
    expect(screen.getByText('Suggestions')).toBeInTheDocument();
  });

  it('opens feedback modal on click', async () => {
    const { user } = renderWithProviders(<FeedbackWidget />);

    const trigger = screen.getByTestId('feedback-widget-trigger');
    await user.click(trigger);

    expect(screen.getByTestId('feedback-modal-content')).toBeInTheDocument();
    expect(screen.getByText('Boîte à suggestions & retours')).toBeInTheDocument();
    expect(screen.getByText(/100% Anonyme/i)).toBeInTheDocument();
  });

  it('allows user to select category, type message, and submit successfully', async () => {
    const submitSpy = vi.spyOn(feedbackApi, 'submitFeedback').mockResolvedValueOnce({
      id: 'fb-123',
      category: 'bug',
      category_display: 'Signalement de bug',
      subject: 'Problème de son',
      message: 'Le son est coupé à 2:30 de la vidéo.',
      page_url: '/courses/1',
      status: 'new',
      status_display: 'Nouveau',
      admin_notes: '',
      created_at: new Date().toISOString(),
      updated_at: new Date().toISOString(),
    });

    const { user } = renderWithProviders(<FeedbackWidget />, { route: '/courses/1' });

    // Open modal
    await user.click(screen.getByTestId('feedback-widget-trigger'));

    // Switch to 'Bug' category
    const bugCategoryBtn = screen.getByTestId('feedback-category-bug');
    await user.click(bugCategoryBtn);

    // Fill subject
    const subjectInput = screen.getByTestId('feedback-subject-input');
    await user.type(subjectInput, 'Problème de son');

    // Fill message
    const messageInput = screen.getByTestId('feedback-message-input');
    await user.type(messageInput, 'Le son est coupé à 2:30 de la vidéo.');

    // Submit
    const submitBtn = screen.getByTestId('feedback-submit-button');
    await user.click(submitBtn);

    await waitFor(() => {
      expect(submitSpy).toHaveBeenCalledWith(
        expect.objectContaining({
          category: 'bug',
          subject: 'Problème de son',
          message: 'Le son est coupé à 2:30 de la vidéo.',
          page_url: '/courses/1',
        })
      );
    });

    // Check success state
    expect(await screen.findByTestId('feedback-success-state')).toBeInTheDocument();
    expect(screen.getByText('Merci pour votre retour !')).toBeInTheDocument();

    // Close on success
    const closeBtn = screen.getByTestId('feedback-success-close-button');
    await user.click(closeBtn);

    await waitFor(() => {
      expect(screen.queryByTestId('feedback-modal-content')).not.toBeInTheDocument();
    });
  });

  it('keeps submit button disabled when message is too short', async () => {
    const { user } = renderWithProviders(<FeedbackWidget />);

    await user.click(screen.getByTestId('feedback-widget-trigger'));

    const submitBtn = screen.getByTestId('feedback-submit-button');
    expect(submitBtn).toBeDisabled();

    const messageInput = screen.getByTestId('feedback-message-input');
    await user.type(messageInput, 'ab');

    expect(submitBtn).toBeDisabled();

    await user.type(messageInput, 'c');
    expect(submitBtn).not.toBeDisabled();
  });
});
