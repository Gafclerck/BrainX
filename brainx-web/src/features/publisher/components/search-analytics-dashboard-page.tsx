import React, { useState, useEffect, useCallback, useRef } from 'react';
import { Link } from 'react-router-dom';
import {
  ChevronLeft,
  Trash2,
  Search,
  AlertTriangle,
  ThumbsDown,
  AlertCircle,
  RefreshCw,
  CheckCircle2,
} from 'lucide-react';
import { AppHeader } from '@/components/layout/app-header';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Card, CardHeader, CardTitle, CardContent } from '@/components/ui/card';
import { fetchSearchAnalytics } from '../api';
import type {
  SearchAnalyticsPreset,
  SearchAnalyticsViewState,
} from '../types';
import { ApiError } from '@/lib/api';
import { cn } from '@/lib/utils';
import { PublisherSubNav } from './publisher-sub-nav';

/**
 * Format Date to strictly ISO YYYY-MM-DD.
 */
export function formatDateISO(date: Date): string {
  const y = date.getFullYear();
  const m = String(date.getMonth() + 1).padStart(2, '0');
  const d = String(date.getDate()).padStart(2, '0');
  return `${y}-${m}-${d}`;
}

/**
 * Calculate preset start and end dates relative to reference date.
 * Uses calendar day subtraction to prevent 1-day boundary drift across daylight saving time.
 */
export function getPresetDateRange(
  days: 7 | 30 | 90,
  referenceDate = new Date()
): { from: string; to: string } {
  const past = new Date(referenceDate);
  past.setDate(past.getDate() - days);
  return {
    from: formatDateISO(past),
    to: formatDateISO(referenceDate),
  };
}

/**
 * Validate strictly byte-for-byte YYYY-MM-DD calendar date string.
 */
export function isValidISODate(str: string): boolean {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(str)) return false;
  const [y, m, d] = str.split('-').map(Number);
  const date = new Date(y, m - 1, d);
  return (
    date.getFullYear() === y &&
    date.getMonth() === m - 1 &&
    date.getDate() === d
  );
}

/**
 * Format live retrieval rates to a percentage string with 1 decimal place.
 * Deterministically formats finite numeric ratio as (rate * 100).toFixed(1) + '%'.
 */
export function formatPercentage(rate: number | null | undefined): string {
  if (typeof rate !== 'number' || !Number.isFinite(rate)) {
    return '0.0%';
  }
  return `${(rate * 100).toFixed(1)}%`;
}

export function SearchAnalyticsDashboardPage() {
  const defaultRange = getPresetDateRange(30);
  const [dateFrom, setDateFrom] = useState<string>(defaultRange.from);
  const [dateTo, setDateTo] = useState<string>(defaultRange.to);
  const [activePreset, setActivePreset] = useState<SearchAnalyticsPreset>(30);
  const [viewState, setViewState] = useState<SearchAnalyticsViewState>({
    status: 'loading',
  });

  const isMountedRef = useRef(true);
  const reqIdRef = useRef(0);

  useEffect(() => {
    isMountedRef.current = true;
    return () => {
      isMountedRef.current = false;
    };
  }, []);

  const loadAnalytics = useCallback(async (from: string, to: string) => {
    const currentReqId = ++reqIdRef.current;
    setViewState({ status: 'loading' });
    try {
      const data = await fetchSearchAnalytics(from, to);
      if (isMountedRef.current && reqIdRef.current === currentReqId) {
        setViewState({ status: 'success', data });
      }
    } catch (err: unknown) {
      if (!isMountedRef.current || reqIdRef.current !== currentReqId) return;
      const message =
        err instanceof ApiError && err.envelope.detail
          ? err.envelope.detail
          : (err as Error)?.message ||
            'Impossible de charger les statistiques de recherche.';
      setViewState({ status: 'error', message });
    }
  }, []);

  useEffect(() => {
    loadAnalytics(defaultRange.from, defaultRange.to);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [loadAnalytics]);

  const handlePresetClick = (days: 7 | 30 | 90) => {
    const range = getPresetDateRange(days);
    setDateFrom(range.from);
    setDateTo(range.to);
    setActivePreset(days);
    loadAnalytics(range.from, range.to);
  };

  const isRangeValid = isValidISODate(dateFrom) && isValidISODate(dateTo);

  const handleCustomSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    if (!isRangeValid) return;
    loadAnalytics(dateFrom, dateTo);
  };

  const handleRetry = () => {
    loadAnalytics(dateFrom, dateTo);
  };

  return (
    <div
      data-testid="search-analytics-dashboard-page"
      className="min-h-screen bg-background text-foreground flex flex-col min-w-[360px] w-full overflow-x-hidden selection:bg-primary selection:text-primary-foreground"
    >
      {/* Top Application Header */}
      <AppHeader />

      <main className="flex-1 max-w-page-max mx-auto w-full px-4 sm:px-6 lg:px-8 py-6 sm:py-8 space-y-6 sm:space-y-8">
        {/* Publisher Shared Secondary Navigation */}
        <PublisherSubNav />

        {/* Breadcrumb & Section Identifier */}
        <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4 pb-2 border-b border-border">
          <div className="space-y-1">
            <div className="flex items-center gap-2 text-xs font-mono text-primary uppercase tracking-wider">
              <Link to="/publisher" className="hover:underline">
                Espace Éditeur
              </Link>
              <span>/</span>
              <span className="text-foreground-muted">Analytiques</span>
            </div>
            <h1 className="text-2xl sm:text-3xl font-bold tracking-tight text-foreground">
              Tableau de Bord Analytique des Recherches
            </h1>
            <p className="text-sm text-foreground-muted">
              Supervisez les performances de recherche, les requêtes infructueuses et les retours des étudiants.
            </p>
          </div>

          {/* Action Bar */}
          <div className="flex flex-wrap items-center gap-2.5 sm:gap-3">
            <Button
              asChild
              variant="outline"
              className="min-h-[44px] min-w-[44px] text-xs sm:text-sm font-medium"
            >
              <Link
                to="/publisher/trash"
                data-testid="nav-trash-link"
                className="inline-flex items-center gap-2"
              >
                <Trash2 className="h-4 w-4 text-destructive shrink-0" aria-hidden="true" />
                <span>Corbeille</span>
              </Link>
            </Button>

            <Button
              asChild
              variant="outline"
              className="min-h-[44px] min-w-[44px] text-xs sm:text-sm font-medium"
            >
              <Link
                to="/publisher"
                data-testid="nav-back-publisher-btn"
                className="inline-flex items-center gap-2"
              >
                <ChevronLeft className="h-4 w-4 shrink-0" aria-hidden="true" />
                <span>Retour aux cours</span>
              </Link>
            </Button>
          </div>
        </div>

        {/* Date Filter Toolbar: Presets & Custom Calendar Bounds */}
        <div
          data-testid="search-analytics-date-toolbar"
          className="rounded-lg border border-border bg-card p-4 flex flex-col lg:flex-row lg:items-center justify-between gap-4"
        >
          {/* Preset Buttons */}
          <div className="flex items-center gap-2 overflow-x-auto pb-1 lg:pb-0">
            <span className="text-xs font-medium text-foreground-muted uppercase tracking-wider shrink-0 mr-1">
              Période :
            </span>
            <Button
              type="button"
              variant={activePreset === 7 ? 'default' : 'outline'}
              size="sm"
              aria-pressed={activePreset === 7}
              data-testid="preset-7d"
              onClick={() => handlePresetClick(7)}
              className={cn(
                'min-h-[38px] text-xs font-medium shrink-0',
                activePreset === 7 && 'bg-primary text-primary-foreground'
              )}
            >
              7 jours
            </Button>
            <Button
              type="button"
              variant={activePreset === 30 ? 'default' : 'outline'}
              size="sm"
              aria-pressed={activePreset === 30}
              data-testid="preset-30d"
              onClick={() => handlePresetClick(30)}
              className={cn(
                'min-h-[38px] text-xs font-medium shrink-0',
                activePreset === 30 && 'bg-primary text-primary-foreground'
              )}
            >
              30 jours
            </Button>
            <Button
              type="button"
              variant={activePreset === 90 ? 'default' : 'outline'}
              size="sm"
              aria-pressed={activePreset === 90}
              data-testid="preset-90d"
              onClick={() => handlePresetClick(90)}
              className={cn(
                'min-h-[38px] text-xs font-medium shrink-0',
                activePreset === 90 && 'bg-primary text-primary-foreground'
              )}
            >
              90 jours
            </Button>
          </div>

          {/* Custom Date Form */}
          <form
            onSubmit={handleCustomSubmit}
            data-testid="custom-date-form"
            className="flex flex-wrap items-center gap-2.5 sm:gap-3"
          >
            <div className="flex items-center gap-1.5">
              <label
                htmlFor="date-from-input"
                className="text-xs font-medium text-foreground-muted shrink-0"
              >
                Du :
              </label>
              <Input
                id="date-from-input"
                type="date"
                aria-label="Date de début"
                data-testid="date-from-input"
                value={dateFrom}
                onChange={(e) => {
                  setDateFrom(e.target.value);
                  setActivePreset('custom');
                }}
                className="min-h-[38px] w-36 text-xs bg-surface border-border focus-visible:ring-primary"
              />
            </div>

            <div className="flex items-center gap-1.5">
              <label
                htmlFor="date-to-input"
                className="text-xs font-medium text-foreground-muted shrink-0"
              >
                Au :
              </label>
              <Input
                id="date-to-input"
                type="date"
                aria-label="Date de fin"
                data-testid="date-to-input"
                value={dateTo}
                onChange={(e) => {
                  setDateTo(e.target.value);
                  setActivePreset('custom');
                }}
                className="min-h-[38px] w-36 text-xs bg-surface border-border focus-visible:ring-primary"
              />
            </div>

            <Button
              type="submit"
              variant="secondary"
              size="sm"
              disabled={!isRangeValid}
              data-testid="apply-date-filter"
              className="min-h-[38px] text-xs font-medium px-4 border border-border shrink-0 disabled:opacity-40 disabled:cursor-not-allowed"
            >
              Appliquer
            </Button>
          </form>
        </div>

        {/* Loading State */}
        {viewState.status === 'loading' && (
          <div
            data-testid="analytics-loading-state"
            aria-label="Chargement des données analytiques"
            className="space-y-6"
          >
            {/* KPI Skeletons */}
            <div className="grid grid-cols-1 md:grid-cols-3 gap-4 sm:gap-6">
              {[1, 2, 3].map((i) => (
                <div
                  key={i}
                  className="rounded-lg border border-border bg-card p-6 space-y-4 animate-pulse"
                >
                  <div className="flex items-center justify-between">
                    <div className="h-4 w-32 bg-surface rounded" />
                    <div className="h-5 w-5 bg-surface rounded" />
                  </div>
                  <div className="h-8 w-24 bg-surface rounded" />
                  <div className="h-3 w-40 bg-surface rounded" />
                </div>
              ))}
            </div>

            {/* Table Skeleton */}
            <div className="rounded-lg border border-border bg-card p-6 space-y-4 animate-pulse">
              <div className="h-5 w-48 bg-surface rounded" />
              <div className="space-y-3 pt-2">
                {[1, 2, 3, 4].map((j) => (
                  <div key={j} className="h-8 bg-surface rounded w-full" />
                ))}
              </div>
            </div>
          </div>
        )}

        {/* Error State */}
        {viewState.status === 'error' && (
          <div
            data-testid="analytics-error-state"
            role="alert"
            className="rounded-lg border border-destructive-border bg-destructive-surface p-6 sm:p-8 text-center space-y-4 max-w-lg mx-auto"
          >
            <div className="inline-flex items-center justify-center h-12 w-12 rounded-full bg-destructive/10 text-destructive mx-auto">
              <AlertCircle className="h-6 w-6" />
            </div>
            <div className="space-y-2">
              <h2 className="text-lg font-semibold text-foreground">
                Une erreur est survenue lors de la récupération des données analytiques.
              </h2>
              <p className="text-sm text-foreground-muted">
                {viewState.message}
              </p>
            </div>
            <Button
              type="button"
              onClick={handleRetry}
              variant="secondary"
              data-testid="analytics-retry-btn"
              className="min-h-[44px] min-w-[44px] px-6 inline-flex items-center gap-2 border-border"
            >
              <RefreshCw className="h-4 w-4" />
              Réessayer
            </Button>
          </div>
        )}

        {/* Success State */}
        {viewState.status === 'success' && (
          <div className="space-y-8">
            {/* 3 Primary KPI Cards Row */}
            <div className="overflow-x-auto w-full">
              <div className="grid grid-cols-1 md:grid-cols-3 gap-4 sm:gap-6 min-w-0">
                {/* KPI 1: Volume total des recherches */}
                <Card
                  data-testid="kpi-total-queries"
                  className="bg-card border-border shadow-sm flex flex-col justify-between"
                >
                  <CardHeader className="pb-2">
                    <div className="flex items-center justify-between">
                      <CardTitle className="text-xs sm:text-sm font-medium text-foreground-muted uppercase tracking-wider">
                        Volume total des recherches
                      </CardTitle>
                      <Search
                        className="h-4 w-4 text-[#58A6FF] shrink-0"
                        aria-hidden="true"
                      />
                    </div>
                  </CardHeader>
                  <CardContent className="pt-0 space-y-1">
                    <div className="text-2xl sm:text-3xl font-bold font-mono text-[#58A6FF]">
                      {viewState.data.total_queries}
                    </div>
                    <p className="text-xs text-foreground-muted">
                      Requêtes exécutées sur la période
                    </p>
                  </CardContent>
                </Card>

                {/* KPI 2: Taux de requêtes sans résultat (SM-5) */}
                <Card
                  data-testid="kpi-zero-result-rate"
                  className="bg-card border-border shadow-sm flex flex-col justify-between"
                >
                  <CardHeader className="pb-2">
                    <div className="flex items-center justify-between">
                      <CardTitle className="text-xs sm:text-sm font-medium text-foreground-muted uppercase tracking-wider">
                        Taux de requêtes sans résultat (SM-5)
                      </CardTitle>
                      <AlertTriangle
                        className="h-4 w-4 text-[#D29922] shrink-0"
                        aria-hidden="true"
                      />
                    </div>
                  </CardHeader>
                  <CardContent className="pt-0 space-y-1">
                    <div className="text-2xl sm:text-3xl font-bold font-mono text-[#D29922]">
                      {formatPercentage(
                        viewState.data.sm5_rate ?? viewState.data.zero_result_rate
                      )}
                    </div>
                    <p className="text-xs text-foreground-muted">
                      {viewState.data.zero_result_queries ?? 0} requête(s) infructueuse(s)
                    </p>
                  </CardContent>
                </Card>

                {/* KPI 3: Taux de retours négatifs (SM-6) */}
                <Card
                  data-testid="kpi-negative-feedback-rate"
                  className="bg-card border-border shadow-sm flex flex-col justify-between"
                >
                  <CardHeader className="pb-2">
                    <div className="flex items-center justify-between">
                      <CardTitle className="text-xs sm:text-sm font-medium text-foreground-muted uppercase tracking-wider">
                        Taux de retours négatifs (SM-6)
                      </CardTitle>
                      <ThumbsDown
                        className="h-4 w-4 text-[#58A6FF] shrink-0"
                        aria-hidden="true"
                      />
                    </div>
                  </CardHeader>
                  <CardContent className="pt-0 space-y-1">
                    <div className="text-2xl sm:text-3xl font-bold font-mono text-[#58A6FF]">
                      {formatPercentage(
                        viewState.data.sm6_rate ?? viewState.data.negative_answer_rate
                      )}
                    </div>
                    <p className="text-xs text-foreground-muted">
                      {viewState.data.negative_answers ?? 0} retour(s) négatif(s) sur{' '}
                      {viewState.data.total_answers ?? 0} réponses
                    </p>
                  </CardContent>
                </Card>
              </div>
            </div>

            {/* Zero-Result Queries Ranked Table */}
            <div className="space-y-4">
              <div className="flex items-center justify-between pb-1">
                <div>
                  <h2 className="text-lg sm:text-xl font-bold text-foreground tracking-tight">
                    Requêtes sans résultat fréquentes
                  </h2>
                  <p className="text-xs sm:text-sm text-foreground-muted">
                    Classement par fréquence d'apparition pour identifier les contenus manquants.
                  </p>
                </div>
              </div>

              {(() => {
                const zeroResultQueries =
                  viewState.data.grouped_zero_result_queries ||
                  viewState.data.zero_result_grouped_queries ||
                  [];

                if (zeroResultQueries.length === 0) {
                  return (
                    <div
                      data-testid="zero-result-empty-state"
                      className="rounded-lg border border-border bg-card p-8 sm:p-12 text-center space-y-3 max-w-lg mx-auto"
                    >
                      <div className="inline-flex items-center justify-center h-12 w-12 rounded-full bg-surface text-foreground-muted mx-auto border border-border">
                        <CheckCircle2 className="h-6 w-6 text-emerald-400" />
                      </div>
                      <div className="space-y-1">
                        <h3 className="text-base font-semibold text-foreground">
                          Aucune requête infructueuse sur cette période
                        </h3>
                        <p className="text-xs sm:text-sm text-foreground-muted">
                          Toutes les requêtes de recherche ont renvoyé des leçons correspondantes.
                        </p>
                      </div>
                    </div>
                  );
                }

                return (
                  <div className="overflow-x-auto w-full rounded-lg border border-border bg-card">
                    <table
                      data-testid="zero-result-queries-table"
                      aria-label="Requêtes sans résultat fréquentes"
                      className="w-full text-left border-collapse min-w-[320px]"
                    >
                      <thead>
                        <tr className="border-b border-border bg-surface/50 text-xs font-medium text-foreground-muted uppercase tracking-wider">
                          <th scope="col" className="py-3 px-4 sm:px-6">
                            Requête
                          </th>
                          <th
                            scope="col"
                            className="py-3 px-4 sm:px-6 text-right w-36"
                          >
                            Occurrences
                          </th>
                        </tr>
                      </thead>
                      <tbody className="divide-y divide-border/60">
                        {zeroResultQueries.map((item, idx) => (
                          <tr
                            key={`${item.query}-${idx}`}
                            data-testid="zero-result-query-row"
                            className="hover:bg-surface/40 transition-colors"
                          >
                            <td className="py-3 px-4 sm:px-6 text-sm text-foreground font-mono font-medium break-words">
                              {item.query}
                            </td>
                            <td className="py-3 px-4 sm:px-6 text-sm text-right font-mono">
                              <span className="inline-flex items-center px-2.5 py-0.5 rounded-full text-xs font-semibold bg-amber-500/10 text-amber-400 border border-amber-500/20">
                                {item.count}
                              </span>
                            </td>
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  </div>
                );
              })()}
            </div>
          </div>
        )}
      </main>
    </div>
  );
}

export default SearchAnalyticsDashboardPage;
