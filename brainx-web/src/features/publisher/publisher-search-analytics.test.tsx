import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { render, screen, waitFor, fireEvent } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { MemoryRouter } from 'react-router-dom';
import { useAuthStore } from '@/features/auth/auth-store';
import { AppRoutes } from '@/routes';
import {
  SearchAnalyticsDashboardPage,
  fetchSearchAnalytics,
  formatDateISO,
  getPresetDateRange,
  isValidISODate,
  formatPercentage,
} from './index';
import type { SearchAggregateResponse } from './types';

// Mock data fixtures
const mockAggregateResponse: SearchAggregateResponse = {
  total_queries: 142,
  zero_result_queries: 18,
  total_answers: 24,
  negative_answers: 2,
  zero_result_rate: 0.1268,
  sm5_rate: 0.1268,
  negative_answer_rate: 0.0833,
  sm6_rate: 0.0833,
  grouped_queries: [
    { query: 'algorithme a*', count: 42 },
    { query: 'arbres binaires', count: 30 },
    { query: 'graphes et flots', count: 25 },
    { query: 'programmation dynamique', count: 18 },
  ],
  grouped_zero_result_queries: [
    { query: 'programmation dynamique', count: 18 },
    { query: 'tri fusion récursif', count: 7 },
    { query: "l'intelligence artificielle", count: 3 },
  ],
};

const mockEmptyAggregateResponse: SearchAggregateResponse = {
  total_queries: 0,
  zero_result_queries: 0,
  total_answers: 0,
  negative_answers: 0,
  zero_result_rate: 0.0,
  sm5_rate: 0.0,
  negative_answer_rate: 0.0,
  sm6_rate: 0.0,
  grouped_queries: [],
  grouped_zero_result_queries: [],
};

const mockZeroFailedAggregateResponse: SearchAggregateResponse = {
  total_queries: 85,
  zero_result_queries: 0,
  total_answers: 10,
  negative_answers: 0,
  zero_result_rate: 0.0,
  sm5_rate: 0.0,
  negative_answer_rate: 0.0,
  sm6_rate: 0.0,
  grouped_queries: [
    { query: 'dijkstra', count: 50 },
    { query: 'bellman-ford', count: 35 },
  ],
  grouped_zero_result_queries: [],
};

function setupPublisherAuth() {
  useAuthStore.getState().setTokens({
    access: 'valid-publisher-token',
    refresh: 'valid-refresh-token',
  });
  useAuthStore.getState().setUser({
    id: 'u1111111-1111-1111-1111-111111111111',
    email: 'alex.curator@brainx.edu',
    is_publisher: true,
  });
  useAuthStore.getState().setIsPublisher(true);
}

function setupStudentAuth() {
  useAuthStore.getState().setTokens({
    access: 'valid-student-token',
    refresh: 'valid-refresh-token',
  });
  useAuthStore.getState().setUser({
    id: 'u9999999-9999-9999-9999-999999999999',
    email: 'student@brainx.edu',
    is_publisher: false,
  });
  useAuthStore.getState().setIsPublisher(false);
}

describe('Story FE-5.5: Tableau de Bord Analytique des Recherches (/publisher/search-analytics)', () => {
  const originalFetch = globalThis.fetch;

  beforeEach(() => {
    vi.restoreAllMocks();
    useAuthStore.getState().clearAuth();
    window.localStorage?.clear();
  });

  afterEach(() => {
    globalThis.fetch = originalFetch;
  });

  // ===========================================================================
  // 1. Helper & API Unit Tests
  // ===========================================================================
  describe('Helper Functions and API Client', () => {
    it('formatDateISO returns strictly YYYY-MM-DD with single-digit padding for month and day', () => {
      const date1 = new Date(2026, 9, 31); // 31 Oct 2026
      expect(formatDateISO(date1)).toBe('2026-10-31');

      const date2 = new Date(2026, 0, 5); // 5 Jan 2026 (month 0 -> 01, day 5 -> 05)
      expect(formatDateISO(date2)).toBe('2026-01-05');
    });

    it('getPresetDateRange calculates correct date difference and asserts .from bounds on all presets', () => {
      const ref = new Date(2026, 10, 4); // 4 Nov 2026
      const range7 = getPresetDateRange(7, ref);
      expect(range7.to).toBe('2026-11-04');
      expect(range7.from).toBe('2026-10-28'); // 4 Nov - 7 days = 28 Oct

      const range30 = getPresetDateRange(30, ref);
      expect(range30.to).toBe('2026-11-04');
      expect(range30.from).toBe('2026-10-05'); // 4 Nov - 30 days = 5 Oct

      const range90 = getPresetDateRange(90, ref);
      expect(range90.to).toBe('2026-11-04');
      expect(range90.from).toBe('2026-08-06'); // 4 Nov - 90 days = 6 Aug
    });

    it('isValidISODate validates standard YYYY-MM-DD strings accurately', () => {
      expect(isValidISODate('2026-10-31')).toBe(true);
      expect(isValidISODate('2026-02-28')).toBe(true);
      expect(isValidISODate('2026-02-30')).toBe(false); // Non-existent date
      expect(isValidISODate('2026-13-01')).toBe(false); // Invalid month
      expect(isValidISODate('2026/10/31')).toBe(false); // Wrong separator
      expect(isValidISODate('invalid-date')).toBe(false);
      expect(isValidISODate('')).toBe(false);
    });

    it('formatPercentage formats rates to 1 decimal place percentage string and handles Infinity', () => {
      expect(formatPercentage(0.1268)).toBe('12.7%');
      expect(formatPercentage(0.0833)).toBe('8.3%');
      expect(formatPercentage(0.0)).toBe('0.0%');
      expect(formatPercentage(0)).toBe('0.0%');
      expect(formatPercentage(1.0)).toBe('100.0%');
      expect(formatPercentage(null)).toBe('0.0%');
      expect(formatPercentage(undefined)).toBe('0.0%');
      expect(formatPercentage(NaN)).toBe('0.0%');
      expect(formatPercentage(Infinity)).toBe('0.0%');
      expect(formatPercentage(-Infinity)).toBe('0.0%');
    });

    it('fetchSearchAnalytics calls GET /api/v1/search/aggregate/ with query bounds', async () => {
      const mockFetch = vi.fn().mockResolvedValue({
        ok: true,
        status: 200,
        headers: new Headers({ 'content-type': 'application/json' }),
        text: async () => JSON.stringify(mockAggregateResponse),
      });
      globalThis.fetch = mockFetch;

      const res = await fetchSearchAnalytics('2026-10-01', '2026-10-31');
      expect(res.total_queries).toBe(142);
      expect(mockFetch).toHaveBeenCalledWith(
        expect.stringMatching(
          /\/api\/v1\/search\/aggregate\/\?date_from=2026-10-01&date_to=2026-10-31/
        ),
        expect.anything()
      );
    });

    it('fetchSearchAnalytics supports object parameter syntax', async () => {
      const mockFetch = vi.fn().mockResolvedValue({
        ok: true,
        status: 200,
        headers: new Headers({ 'content-type': 'application/json' }),
        text: async () => JSON.stringify(mockAggregateResponse),
      });
      globalThis.fetch = mockFetch;

      await fetchSearchAnalytics({ from: '2026-09-01', to: '2026-09-30' });
      expect(mockFetch).toHaveBeenCalledWith(
        expect.stringMatching(
          /\/api\/v1\/search\/aggregate\/\?date_from=2026-09-01&date_to=2026-09-30/
        ),
        expect.anything()
      );
    });

    it('fetchSearchAnalytics forwards optional AbortSignal to apiClient', async () => {
      const mockFetch = vi.fn().mockResolvedValue({
        ok: true,
        status: 200,
        headers: new Headers({ 'content-type': 'application/json' }),
        text: async () => JSON.stringify(mockAggregateResponse),
      });
      globalThis.fetch = mockFetch;

      const controller = new AbortController();
      await fetchSearchAnalytics('2026-10-01', '2026-10-31', { signal: controller.signal });
      expect(mockFetch).toHaveBeenCalledWith(
        expect.stringMatching(/date_from=2026-10-01&date_to=2026-10-31/),
        expect.objectContaining({ signal: controller.signal })
      );
    });
  });

  // ===========================================================================
  // 2. Initial Dashboard Load & KPI Cards (AC-1, AC-2, AC-3)
  // ===========================================================================
  describe('Initial Load and Metrics Presentation (AC-1, AC-2, AC-3)', () => {
    it('requests default 30-day aggregate data and renders 3 KPI cards', async () => {
      setupPublisherAuth();

      const mockFetch = vi.fn().mockResolvedValue({
        ok: true,
        status: 200,
        headers: new Headers({ 'content-type': 'application/json' }),
        text: async () => JSON.stringify(mockAggregateResponse),
      });
      globalThis.fetch = mockFetch;

      render(
        <MemoryRouter initialEntries={['/publisher/search-analytics']}>
          <AppRoutes />
        </MemoryRouter>
      );

      // Verify initial loading skeleton presence
      expect(screen.getByTestId('analytics-loading-state')).toBeInTheDocument();

      // Wait for fetch completion
      await waitFor(() => {
        expect(screen.getByTestId('kpi-total-queries')).toBeInTheDocument();
      });

      // Assert default 30-day fetch was performed
      expect(mockFetch).toHaveBeenCalledWith(
        expect.stringMatching(/\/api\/v1\/search\/aggregate\/\?date_from=.*&date_to=.*/),
        expect.anything()
      );

      // Verify Card 1: Volume total des recherches
      const totalQueriesCard = screen.getByTestId('kpi-total-queries');
      expect(totalQueriesCard).toHaveTextContent('Volume total des recherches');
      expect(totalQueriesCard).toHaveTextContent('142');

      // Verify Card 2: Taux de requêtes sans résultat (SM-5) (12.7%)
      const zeroResultCard = screen.getByTestId('kpi-zero-result-rate');
      expect(zeroResultCard).toHaveTextContent('Taux de requêtes sans résultat (SM-5)');
      expect(zeroResultCard).toHaveTextContent('12.7%');
      expect(zeroResultCard).toHaveTextContent('18 requête(s) infructueuse(s)');

      // Verify Card 3: Taux de retours négatifs (SM-6) (8.3%)
      const feedbackCard = screen.getByTestId('kpi-negative-feedback-rate');
      expect(feedbackCard).toHaveTextContent('Taux de retours négatifs (SM-6)');
      expect(feedbackCard).toHaveTextContent('8.3%');
      expect(feedbackCard).toHaveTextContent('2 retour(s) négatif(s) sur 24 réponses');
    });

    it('renders zero-result queries ranked table with exact query strings and counts', async () => {
      setupPublisherAuth();

      const mockFetch = vi.fn().mockResolvedValue({
        ok: true,
        status: 200,
        headers: new Headers({ 'content-type': 'application/json' }),
        text: async () => JSON.stringify(mockAggregateResponse),
      });
      globalThis.fetch = mockFetch;

      render(
        <MemoryRouter initialEntries={['/publisher/search-analytics']}>
          <AppRoutes />
        </MemoryRouter>
      );

      await waitFor(() => {
        expect(screen.getByTestId('zero-result-queries-table')).toBeInTheDocument();
      });

      const table = screen.getByTestId('zero-result-queries-table');
      expect(table).toHaveAttribute('aria-label', 'Requêtes sans résultat fréquentes');

      const rows = screen.getAllByTestId('zero-result-query-row');
      expect(rows).toHaveLength(3);

      expect(rows[0]).toHaveTextContent('programmation dynamique');
      expect(rows[0].querySelector('td')).toHaveClass('break-words');
      expect(rows[0]).toHaveTextContent('18');

      expect(rows[1]).toHaveTextContent('tri fusion récursif');
      expect(rows[1].querySelector('td')).toHaveClass('break-words');
      expect(rows[1]).toHaveTextContent('7');

      expect(rows[2]).toHaveTextContent("l'intelligence artificielle");
      expect(rows[2].querySelector('td')).toHaveClass('break-words');
      expect(rows[2]).toHaveTextContent('3');
    });

    it('safely renders queries with quotes and special characters without XSS', async () => {
      setupPublisherAuth();

      const specialAggregate: SearchAggregateResponse = {
        ...mockAggregateResponse,
        grouped_zero_result_queries: [
          { query: '<script>alert("XSS")</script>', count: 5 },
          { query: 'Qu\'est-ce que l\'API "REST" & GraphQL ?', count: 2 },
        ],
      };

      const mockFetch = vi.fn().mockResolvedValue({
        ok: true,
        status: 200,
        headers: new Headers({ 'content-type': 'application/json' }),
        text: async () => JSON.stringify(specialAggregate),
      });
      globalThis.fetch = mockFetch;

      render(
        <MemoryRouter initialEntries={['/publisher/search-analytics']}>
          <AppRoutes />
        </MemoryRouter>
      );

      await waitFor(() => {
        expect(screen.getByTestId('zero-result-queries-table')).toBeInTheDocument();
      });

      const rows = screen.getAllByTestId('zero-result-query-row');
      expect(rows[0]).toHaveTextContent('<script>alert("XSS")</script>');
      expect(rows[1]).toHaveTextContent('Qu\'est-ce que l\'API "REST" & GraphQL ?');
      expect(document.querySelector('script[src*="XSS"]')).toBeNull();
    });
  });

  // ===========================================================================
  // 3. Date Presets & Custom Date Filter Interactions
  // ===========================================================================
  describe('Date Presets & Date Range Filtering', () => {
    it('clicking preset buttons (7 jours, 90 jours) updates bounds, aria-pressed, and refetches with exact query parameters', async () => {
      setupPublisherAuth();
      const user = userEvent.setup();

      const mockFetch = vi.fn().mockResolvedValue({
        ok: true,
        status: 200,
        headers: new Headers({ 'content-type': 'application/json' }),
        text: async () => JSON.stringify(mockAggregateResponse),
      });
      globalThis.fetch = mockFetch;

      render(
        <MemoryRouter initialEntries={['/publisher/search-analytics']}>
          <AppRoutes />
        </MemoryRouter>
      );

      await waitFor(() => {
        expect(screen.getByTestId('preset-7d')).toBeInTheDocument();
      });

      const exp30 = getPresetDateRange(30);
      expect(screen.getByTestId('preset-30d')).toHaveAttribute('aria-pressed', 'true');
      expect(screen.getByTestId('preset-7d')).toHaveAttribute('aria-pressed', 'false');
      expect(screen.getByTestId('preset-90d')).toHaveAttribute('aria-pressed', 'false');

      // Click "7 jours" preset
      const exp7 = getPresetDateRange(7);
      await user.click(screen.getByTestId('preset-7d'));

      await waitFor(() => {
        expect(mockFetch).toHaveBeenCalledWith(
          expect.stringContaining(`date_from=${exp7.from}&date_to=${exp7.to}`),
          expect.anything()
        );
      });
      expect(screen.getByTestId('preset-7d')).toHaveAttribute('aria-pressed', 'true');
      expect(screen.getByTestId('preset-30d')).toHaveAttribute('aria-pressed', 'false');

      // Click "90 jours" preset
      const exp90 = getPresetDateRange(90);
      await user.click(screen.getByTestId('preset-90d'));

      await waitFor(() => {
        expect(mockFetch).toHaveBeenCalledWith(
          expect.stringContaining(`date_from=${exp90.from}&date_to=${exp90.to}`),
          expect.anything()
        );
      });
      expect(screen.getByTestId('preset-90d')).toHaveAttribute('aria-pressed', 'true');
      expect(screen.getByTestId('preset-7d')).toHaveAttribute('aria-pressed', 'false');

      // Click "30 jours" preset
      await user.click(screen.getByTestId('preset-30d'));

      await waitFor(() => {
        expect(mockFetch).toHaveBeenCalledWith(
          expect.stringContaining(`date_from=${exp30.from}&date_to=${exp30.to}`),
          expect.anything()
        );
      });
      expect(screen.getByTestId('preset-30d')).toHaveAttribute('aria-pressed', 'true');
    });

    it('discards stale earlier response when multiple preset changes occur rapidly', async () => {
      setupPublisherAuth();
      const user = userEvent.setup();

      let resolveSlowRequest: ((val: unknown) => void) | null = null;
      const slowPromise = new Promise((resolve) => {
        resolveSlowRequest = resolve;
      });

      const fastAggregate: SearchAggregateResponse = {
        ...mockAggregateResponse,
        total_queries: 999,
      };

      const mockFetch = vi
        .fn()
        // 1st call on initial load
        .mockResolvedValueOnce({
          ok: true,
          status: 200,
          headers: new Headers({ 'content-type': 'application/json' }),
          text: async () => JSON.stringify(mockAggregateResponse),
        })
        // 2nd call: slow request (triggered by 7d)
        .mockImplementationOnce(() => slowPromise)
        // 3rd call: fast request (triggered by 90d)
        .mockResolvedValueOnce({
          ok: true,
          status: 200,
          headers: new Headers({ 'content-type': 'application/json' }),
          text: async () => JSON.stringify(fastAggregate),
        });
      globalThis.fetch = mockFetch;

      render(
        <MemoryRouter initialEntries={['/publisher/search-analytics']}>
          <AppRoutes />
        </MemoryRouter>
      );

      await waitFor(() => {
        expect(screen.getByTestId('preset-7d')).toBeInTheDocument();
      });

      // Rapidly trigger slow 7d then fast 90d
      await user.click(screen.getByTestId('preset-7d'));
      await user.click(screen.getByTestId('preset-90d'));

      // Fast request resolves and displays its value
      await waitFor(() => {
        expect(screen.getByTestId('kpi-total-queries')).toHaveTextContent('999');
      });

      // Now resolve the older slow request with stale data
      resolveSlowRequest!({
        ok: true,
        status: 200,
        headers: new Headers({ 'content-type': 'application/json' }),
        text: async () => JSON.stringify({ ...mockAggregateResponse, total_queries: 111 }),
      });

      // Ensure data was NOT overwritten by the slow request
      await new Promise((r) => setTimeout(r, 50));
      expect(screen.getByTestId('kpi-total-queries')).toHaveTextContent('999');
    });

    it('custom date range entry validates YYYY-MM-DD and triggers fetch on submit', async () => {
      setupPublisherAuth();
      const user = userEvent.setup();

      const mockFetch = vi.fn().mockResolvedValue({
        ok: true,
        status: 200,
        headers: new Headers({ 'content-type': 'application/json' }),
        text: async () => JSON.stringify(mockAggregateResponse),
      });
      globalThis.fetch = mockFetch;

      render(
        <MemoryRouter initialEntries={['/publisher/search-analytics']}>
          <AppRoutes />
        </MemoryRouter>
      );

      await waitFor(() => {
        expect(screen.getByTestId('date-from-input')).toBeInTheDocument();
      });

      const fromInput = screen.getByTestId('date-from-input');
      const toInput = screen.getByTestId('date-to-input');
      const applyBtn = screen.getByTestId('apply-date-filter');

      // Enter invalid/malformed date in fromInput
      fireEvent.change(fromInput, { target: { value: '2026-99-99' } });
      expect(applyBtn).toBeDisabled();

      // Enter valid dates
      fireEvent.change(fromInput, { target: { value: '2026-10-01' } });
      fireEvent.change(toInput, { target: { value: '2026-10-25' } });
      expect(applyBtn).not.toBeDisabled();

      // Click Appliquer
      await user.click(applyBtn);

      await waitFor(() => {
        expect(mockFetch).toHaveBeenCalledWith(
          expect.stringContaining('date_from=2026-10-01&date_to=2026-10-25'),
          expect.anything()
        );
      });
    });

    it('handles reversed date range (from > to) cleanly with 0 metrics and empty state', async () => {
      setupPublisherAuth();
      const user = userEvent.setup();

      const mockFetch = vi
        .fn()
        .mockResolvedValueOnce({
          ok: true,
          status: 200,
          headers: new Headers({ 'content-type': 'application/json' }),
          text: async () => JSON.stringify(mockAggregateResponse),
        })
        .mockResolvedValueOnce({
          ok: true,
          status: 200,
          headers: new Headers({ 'content-type': 'application/json' }),
          text: async () => JSON.stringify(mockEmptyAggregateResponse),
        });
      globalThis.fetch = mockFetch;

      render(
        <MemoryRouter initialEntries={['/publisher/search-analytics']}>
          <AppRoutes />
        </MemoryRouter>
      );

      await waitFor(() => {
        expect(screen.getByTestId('date-from-input')).toBeInTheDocument();
      });

      const fromInput = screen.getByTestId('date-from-input');
      const toInput = screen.getByTestId('date-to-input');
      const applyBtn = screen.getByTestId('apply-date-filter');

      // Set from > to (e.g. 2026-11-10 > 2026-11-01)
      fireEvent.change(fromInput, { target: { value: '2026-11-10' } });
      fireEvent.change(toInput, { target: { value: '2026-11-01' } });

      await user.click(applyBtn);

      await waitFor(() => {
        expect(screen.getByTestId('kpi-total-queries')).toHaveTextContent('0');
      });

      expect(screen.getByTestId('kpi-zero-result-rate')).toHaveTextContent('0.0%');
      expect(screen.getByTestId('kpi-negative-feedback-rate')).toHaveTextContent('0.0%');
      expect(screen.getByTestId('zero-result-empty-state')).toHaveTextContent(
        'Aucune requête infructueuse sur cette période'
      );
    });
  });

  // ===========================================================================
  // 4. Empty States & Error Recovery
  // ===========================================================================
  describe('Empty States and Error Recovery', () => {
    it('displays friendly empty state when there are zero failed searches', async () => {
      setupPublisherAuth();

      const mockFetch = vi.fn().mockResolvedValue({
        ok: true,
        status: 200,
        headers: new Headers({ 'content-type': 'application/json' }),
        text: async () => JSON.stringify(mockZeroFailedAggregateResponse),
      });
      globalThis.fetch = mockFetch;

      render(
        <MemoryRouter initialEntries={['/publisher/search-analytics']}>
          <AppRoutes />
        </MemoryRouter>
      );

      await waitFor(() => {
        expect(screen.getByTestId('zero-result-empty-state')).toBeInTheDocument();
      });

      expect(screen.getByTestId('kpi-zero-result-rate')).toHaveTextContent('0.0%');
      expect(screen.getByTestId('zero-result-empty-state')).toHaveTextContent(
        'Aucune requête infructueuse sur cette période'
      );
    });

    it('renders RFC 9457 error card and recovers on clicking Réessayer', async () => {
      setupPublisherAuth();
      const user = userEvent.setup();

      const mockFetch = vi
        .fn()
        .mockResolvedValueOnce({
          ok: false,
          status: 500,
          statusText: 'Internal Server Error',
          headers: new Headers({ 'content-type': 'application/json' }),
          text: async () =>
            JSON.stringify({
              type: 'about:blank',
              title: 'Server Error',
              status: 500,
              detail: 'Panne temporaire du service d\'agrégation.',
              errors: {},
            }),
        })
        .mockResolvedValueOnce({
          ok: true,
          status: 200,
          headers: new Headers({ 'content-type': 'application/json' }),
          text: async () => JSON.stringify(mockAggregateResponse),
        });
      globalThis.fetch = mockFetch;

      render(
        <MemoryRouter initialEntries={['/publisher/search-analytics']}>
          <AppRoutes />
        </MemoryRouter>
      );

      // Verify error alert presentation
      await waitFor(() => {
        expect(screen.getByTestId('analytics-error-state')).toBeInTheDocument();
      });

      expect(screen.getByTestId('analytics-error-state')).toHaveTextContent(
        'Panne temporaire du service d\'agrégation.'
      );

      // Click Réessayer
      const retryBtn = screen.getByTestId('analytics-retry-btn');
      await user.click(retryBtn);

      // Successfully recovers
      await waitFor(() => {
        expect(screen.getByTestId('kpi-total-queries')).toHaveTextContent('142');
      });
    });
  });

  // ===========================================================================
  // 5. Strict Privacy Invariants (AD-13)
  // ===========================================================================
  describe('Strict Privacy Invariants (AD-13)', () => {
    it('guarantees zero student identities, emails, or session tokens are rendered', async () => {
      setupPublisherAuth();

      const mockFetch = vi.fn().mockResolvedValue({
        ok: true,
        status: 200,
        headers: new Headers({ 'content-type': 'application/json' }),
        text: async () => JSON.stringify(mockAggregateResponse),
      });
      globalThis.fetch = mockFetch;

      const { container } = render(
        <MemoryRouter initialEntries={['/publisher/search-analytics']}>
          <AppRoutes />
        </MemoryRouter>
      );

      await waitFor(() => {
        expect(screen.getByTestId('kpi-total-queries')).toBeInTheDocument();
      });

      // Ensure no student email or user ID or session id is exposed in the DOM
      const html = container.innerHTML;
      expect(html).not.toMatch(/student@/i);
      expect(html).not.toMatch(/user_id/i);
      expect(html).not.toMatch(/session_id/i);
      expect(html).not.toMatch(/search_session/i);
    });
  });

  // ===========================================================================
  // 6. Access Control & Route Guarding
  // ===========================================================================
  describe('Access Control & PublisherGuard', () => {
    it('redirects unauthenticated visitors to /login with returnUrl', async () => {
      useAuthStore.getState().clearAuth();

      render(
        <MemoryRouter initialEntries={['/publisher/search-analytics']}>
          <AppRoutes />
        </MemoryRouter>
      );

      await waitFor(() => {
        expect(
          screen.getByRole('heading', { name: /Connexion/i })
        ).toBeInTheDocument();
      });
    });

    it('redirects authenticated non-publisher student to /courses with notice', async () => {
      setupStudentAuth();

      render(
        <MemoryRouter initialEntries={['/publisher/search-analytics']}>
          <AppRoutes />
        </MemoryRouter>
      );

      await waitFor(() => {
        expect(screen.getByTestId('courses-page')).toBeInTheDocument();
      });
    });

    it('navigating from publisher dashboard via Analytiques button works', async () => {
      setupPublisherAuth();
      const user = userEvent.setup();

      const mockFetch = vi.fn().mockImplementation((url: string) => {
        if (url.includes('/api/v1/search/aggregate/')) {
          return Promise.resolve({
            ok: true,
            status: 200,
            headers: new Headers({ 'content-type': 'application/json' }),
            text: async () => JSON.stringify(mockAggregateResponse),
          });
        }
        return Promise.resolve({
          ok: true,
          status: 200,
          headers: new Headers({ 'content-type': 'application/json' }),
          text: async () =>
            JSON.stringify({
              count: 0,
              next: null,
              previous: null,
              results: [],
            }),
        });
      });
      globalThis.fetch = mockFetch;

      render(
        <MemoryRouter initialEntries={['/publisher']}>
          <AppRoutes />
        </MemoryRouter>
      );

      await waitFor(() => {
        expect(screen.getByTestId('nav-analytics-link')).toBeInTheDocument();
      });

      const analyticsLink = screen.getByTestId('nav-analytics-link');
      await user.click(analyticsLink);

      await waitFor(() => {
        expect(
          screen.getByTestId('search-analytics-dashboard-page')
        ).toBeInTheDocument();
      });
    });
  });

  // ===========================================================================
  // 7. Viewport & Layout Protection (AD-FE-6)
  // ===========================================================================
  describe('Viewport Floor Protection (AD-FE-6)', () => {
    it('has minimum width floor 360px and horizontal scroll isolation', async () => {
      setupPublisherAuth();

      const mockFetch = vi.fn().mockResolvedValue({
        ok: true,
        status: 200,
        headers: new Headers({ 'content-type': 'application/json' }),
        text: async () => JSON.stringify(mockAggregateResponse),
      });
      globalThis.fetch = mockFetch;

      render(
        <SearchAnalyticsDashboardPage />
      , { wrapper: MemoryRouter });

      await waitFor(() => {
        expect(
          screen.getByTestId('search-analytics-dashboard-page')
        ).toBeInTheDocument();
      });

      const page = screen.getByTestId('search-analytics-dashboard-page');
      expect(page.className).toContain('min-w-[360px]');

      const tableContainer = screen.getByTestId('zero-result-queries-table').closest('div');
      expect(tableContainer?.className).toContain('overflow-x-auto');
    });
  });
});
