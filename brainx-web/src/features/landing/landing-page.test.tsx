import { describe, it, expect, beforeEach } from 'vitest';
import { renderWithProviders, screen } from '@/test/test-utils';
import { LandingPage } from './landing-page';
import { useAuthStore } from '@/features/auth/auth-store';

describe('Story 2.1 & 2.2: Landing Page & RAG Teaser Showcase', () => {
  beforeEach(() => {
    useAuthStore.getState().clearAuth();
  });

  it('renders Hero section with direct "Explorer les cours" CTA linking to /courses', () => {
    renderWithProviders(<LandingPage />, { route: '/' });

    const exploreBtn = screen.getByTestId('hero-explore-courses-btn');
    expect(exploreBtn).toBeInTheDocument();
    expect(exploreBtn).toHaveAttribute('href', '/courses');
    expect(exploreBtn).toHaveTextContent(/Explorer les cours/i);

    const loginBtn = screen.getByTestId('hero-login-btn');
    expect(loginBtn).toBeInTheDocument();
    expect(loginBtn).toHaveAttribute('href', '/login');
  });

  it('renders the RAG AI Assistant showcase section with "Bientôt disponible" badge', () => {
    renderWithProviders(<LandingPage />, { route: '/' });

    const ragSection = screen.getByTestId('rag-teaser-section');
    expect(ragSection).toBeInTheDocument();
    expect(ragSection).toHaveTextContent(/Assistant IA Contextuel Intégré aux Cours/i);
    expect(ragSection).toHaveTextContent(/BIENTÔT DISPONIBLE/i);
    expect(ragSection).toHaveTextContent(/BrainX AI \(RAG Engine\)/i);
  });
});
