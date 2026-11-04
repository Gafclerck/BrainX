import { describe, it, expect, beforeEach } from 'vitest';
import { render, screen, fireEvent, waitFor } from '@testing-library/react';
import App from './App';
import { useAuthStore } from '@/features/auth/auth-store';

describe('BrainX Frontend UI Foundation (FE-1.1)', () => {
  beforeEach(() => {
    useAuthStore.getState().clearAuth();
  });
  it('renders root view with dark-only theme classes and no light theme', () => {
    render(<App />);
    const rootElement = screen.getByTestId('app-root');

    expect(rootElement).toBeInTheDocument();
    expect(rootElement.className).toContain('bg-background');
    expect(rootElement.className).toContain('text-foreground');
    expect(rootElement.className).toContain('font-sans');
    expect(rootElement.className).not.toContain('light');
    expect(document.querySelector('.light')).toBeNull();
  });

  it('enforces 360px mobile viewport floor with overflow-x containment', () => {
    render(<App />);
    const rootElement = screen.getByTestId('app-root');

    // Root container must enforce 360px floor and hidden horizontal document overflow
    expect(rootElement.className).toContain('min-w-[360px]');
    expect(rootElement.className).toContain('overflow-x-hidden');

    // Code block container must isolate its own horizontal scrolling
    const codeScroll = screen.getByTestId('code-block-scroll');
    expect(codeScroll.className).toContain('overflow-x-auto');
  });

  it('renders UI primitive: Card containers with dark surface and border tokens', () => {
    render(<App />);
    const cardButtons = screen.getByTestId('card-buttons');

    expect(cardButtons).toBeInTheDocument();
    expect(cardButtons.className).toContain('bg-card');
    expect(cardButtons.className).toContain('border-border');
    expect(cardButtons.className).toContain('rounded-lg');
  });

  it('renders UI primitive: Button variants with accessible dark styling', () => {
    render(<App />);
    const primaryButton = screen.getByRole('button', { name: /primary/i });
    const secondaryButton = screen.getByRole('button', { name: /secondary/i });
    const destructiveButton = screen.getByRole('button', { name: /destructive/i });

    expect(primaryButton).toBeInTheDocument();
    expect(primaryButton.className).toContain('bg-primary');
    expect(primaryButton.className).toContain('text-primary-foreground');

    expect(secondaryButton).toBeInTheDocument();
    expect(secondaryButton.className).toContain('bg-surface');

    expect(destructiveButton).toBeInTheDocument();
    expect(destructiveButton.className).toContain('bg-destructive');
    expect(destructiveButton.className).toContain('text-destructive-foreground');
  });

  it('renders UI primitive: Radix Dialog modal and handles open/close cycle', async () => {
    render(<App />);
    const openTrigger = screen.getByRole('button', { name: /ouvrir la modale/i });
    expect(openTrigger).toBeInTheDocument();

    // Dialog content should not be visible before clicking trigger
    expect(screen.queryByTestId('test-dialog-content')).not.toBeInTheDocument();

    // Click trigger to open modal
    fireEvent.click(openTrigger);

    // Dialog should now be mounted
    const dialogContent = await screen.findByTestId('test-dialog-content');
    expect(dialogContent).toBeInTheDocument();
    expect(dialogContent.className).toContain('bg-dialog');
    expect(dialogContent.className).toContain('border-border');

    // Title and description must be rendered
    expect(screen.getByText('BrainX Architecture Dialog')).toBeInTheDocument();

    // Close button should close modal
    const closeButtons = screen.getAllByRole('button', { name: /fermer/i });
    expect(closeButtons.length).toBeGreaterThanOrEqual(1);
    fireEvent.click(closeButtons[0]);
    expect(screen.queryByTestId('test-dialog-content')).not.toBeInTheDocument();
  });

  it('renders verbatim resource discriminator badges (CAP-2)', () => {
    render(<App />);
    const docBadge = screen.getByTestId('badge-document');
    const imgBadge = screen.getByTestId('badge-image');
    const vidBadge = screen.getByTestId('badge-video');
    const linkBadge = screen.getByTestId('badge-link');

    expect(docBadge).toHaveTextContent('document');
    expect(docBadge.className).toContain('text-resource-document');
    expect(docBadge.className).toContain('border-resource-document-border');

    expect(imgBadge).toHaveTextContent('image');
    expect(imgBadge.className).toContain('text-resource-image');
    expect(imgBadge.className).toContain('border-resource-image-border');

    expect(vidBadge).toHaveTextContent('video');
    expect(vidBadge.className).toContain('text-resource-video');
    expect(vidBadge.className).toContain('border-resource-video-border');

    expect(linkBadge).toHaveTextContent('external_link');
    expect(linkBadge.className).toContain('text-resource-link');
    expect(linkBadge.className).toContain('border-resource-link-border');
  });

  it('binds Inter and JetBrains Mono typography families', () => {
    render(<App />);
    const rootElement = screen.getByTestId('app-root');
    expect(rootElement.className).toContain('font-sans');

    const codeContainer = screen.getByTestId('code-block-scroll');
    expect(codeContainer.className).toContain('font-mono');
  });

  it('redirects authenticated user to /courses when visiting landing page', async () => {
    useAuthStore.getState().setTokens({
      access: 'valid-test-access-token',
      refresh: 'valid-test-refresh-token',
    });

    render(<App />);

    await waitFor(() => {
      expect(screen.queryByTestId('app-root')).not.toBeInTheDocument();
      expect(screen.getByTestId('student-layout')).toBeInTheDocument();
    });
  });
});
