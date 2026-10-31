import React, { useEffect, useState, useCallback, useRef, useMemo } from 'react';
import { useParams, useSearchParams, useNavigate, Link } from 'react-router-dom';
import ReactMarkdown from 'react-markdown';
import rehypeSanitize from 'rehype-sanitize';
import {
  ChevronRight,
  ChevronLeft,
  Calendar,
  User,
  AlertCircle,
  RefreshCw,
  BookOpen,
} from 'lucide-react';
import { fetchLessonDetail } from './api';
import type { BrowseLessonDetailItem } from './types';
import { LessonToc } from './lesson-toc';
import { useToc, type TocItem } from '@/components/layout/toc-context';
import { ApiError } from '@/lib/api';
import { Button } from '@/components/ui/button';
import { ResourceBadge } from '@/components/ui/resource-badge';
import { ResourceCard } from './resource-card';
import { CodeBlock } from '@/components/ui/code-block';
import { SearchFeedbackPrompt } from '@/features/search';
import { cn } from '@/lib/utils';

export function slugify(text: string): string {
  return text
    .toLowerCase()
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '');
}

function getChildrenText(children: React.ReactNode): string {
  if (typeof children === 'string') return children;
  if (typeof children === 'number') return String(children);
  if (Array.isArray(children)) return children.map(getChildrenText).join('');
  if (React.isValidElement(children) && children.props && typeof children.props === 'object' && 'children' in children.props) {
    return getChildrenText((children.props as { children: React.ReactNode }).children);
  }
  return '';
}

export function extractHeadings(markdown: string): TocItem[] {
  if (!markdown) return [];
  const lines = markdown.split('\n');
  const items: TocItem[] = [];
  const counts: Record<string, number> = Object.create(null);
  let inCodeFence = false;
  let currentFence = '';

  for (const line of lines) {
    const trimmed = line.trim();

    // Track code fences (``` or ~~~) to skip code blocks
    const fenceMatch = trimmed.match(/^(`{3,}|~{3,})/);
    if (fenceMatch) {
      const marker = fenceMatch[1];
      if (!inCodeFence) {
        inCodeFence = true;
        currentFence = marker[0];
        continue;
      } else if (marker.startsWith(currentFence)) {
        inCodeFence = false;
        currentFence = '';
        continue;
      }
    }

    if (inCodeFence) {
      continue;
    }

    const h3Match = trimmed.match(/^###\s+(.+)$/);
    const h2Match = trimmed.match(/^##\s+(.+)$/);

    if (h3Match || h2Match) {
      const match = h3Match || h2Match;
      const level = h3Match ? 3 : 2;
      // Strip markdown links [text](url) -> text
      let rawText = match![1].replace(/\[([^\]]+)\]\([^)]+\)/g, '$1');
      // Strip inline formatting characters
      rawText = rawText.replace(/[*_`#]/g, '').trim();

      if (rawText) {
        const baseSlug = slugify(rawText) || 'section';
        const count = counts[baseSlug] || 0;
        counts[baseSlug] = count + 1;
        const id = count === 0 ? baseSlug : `${baseSlug}-${count}`;
        items.push({ id, text: rawText, level });
      }
    }
  }
  return items;
}

export type LessonDetailState =
  | { status: 'loading' }
  | { status: 'success'; data: BrowseLessonDetailItem }
  | { status: 'error'; is404: boolean; message: string };

export function LessonDetailPage() {
  const { lessonId } = useParams<{ lessonId: string }>();
  const [searchParams] = useSearchParams();
  const navigate = useNavigate();
  const { setToc } = useToc();

  const [state, setState] = useState<LessonDetailState>({ status: 'loading' });
  const contentRef = useRef<HTMLElement>(null);

  const searchSessionId =
    searchParams.get('session_id') ||
    searchParams.get('search_session_id') ||
    undefined;

  const loadLesson = useCallback(
    async (id: string, sessionId?: string, isMountedRef?: { current: boolean }) => {
      setState({ status: 'loading' });
      try {
        const data = await fetchLessonDetail(id, sessionId);
        if (!isMountedRef || isMountedRef.current) {
          setState({ status: 'success', data });
        }
      } catch (err: unknown) {
        if (isMountedRef && !isMountedRef.current) return;

        const isApiError = err instanceof ApiError;
        const status = isApiError
          ? err.envelope.status
          : (err as { status?: number })?.status;

        const is404 = status === 404;
        let message = 'Une erreur est survenue lors du chargement de la leçon.';
        if (is404) {
          message = 'Leçon introuvable ou non publiée.';
        } else if (isApiError && err.envelope.detail) {
          message = err.envelope.detail;
        }

        setState({
          status: 'error',
          is404: Boolean(is404),
          message,
        });
      }
    },
    []
  );

  useEffect(() => {
    const isMountedRef = { current: true };

    if (!lessonId) {
      setState({
        status: 'error',
        is404: true,
        message: 'Leçon introuvable ou non publiée.',
      });
      return;
    }

    loadLesson(lessonId, searchSessionId, isMountedRef);

    return () => {
      isMountedRef.current = false;
    };
  }, [lessonId, searchSessionId, loadLesson]);

  const handleRetry = () => {
    if (lessonId) {
      loadLesson(lessonId, searchSessionId);
    }
  };

  const handleMobileBack = () => {
    if (
      typeof window !== 'undefined' &&
      typeof window.history?.state?.idx === 'number' &&
      window.history.state.idx > 0
    ) {
      navigate(-1);
    } else {
      navigate('/courses');
    }
  };

  // Extract dynamic TOC items from Markdown description
  const headings = useMemo(() => {
    if (state.status !== 'success' || !state.data.description) {
      return [];
    }
    return extractHeadings(state.data.description);
  }, [state]);

  // Synchronize dynamic TOC with StudentLayout
  useEffect(() => {
    if (state.status === 'success' && headings.length > 0) {
      setToc(<LessonToc items={headings} />);
    } else {
      // Provide empty TOC fragment during loading/error/no-headings to prevent dummy placeholder links
      setToc(<div data-testid="empty-toc" />);
    }

    return () => {
      setToc(null);
    };
  }, [state.status, headings, setToc]);

  // Stamp matching IDs on rendered heading DOM elements for intersection observer synchronization
  useEffect(() => {
    if (!contentRef.current || headings.length === 0) return;
    const headingElements = contentRef.current.querySelectorAll('h2, h3');
    headingElements.forEach((el, idx) => {
      if (headings[idx]) {
        el.id = headings[idx].id;
      }
    });
  }, [headings, state]);

  // Markdown custom component overrides mapping Design Notes typography tokens
  const markdownComponents = useMemo(
    () => ({
      h1: ({ children }: React.ComponentPropsWithoutRef<'h1'>) => (
        <h1 className="text-2xl font-bold text-foreground mb-4">
          {children}
        </h1>
      ),
      h2: ({ children }: React.ComponentPropsWithoutRef<'h2'>) => {
        const text = getChildrenText(children);
        const id = slugify(text) || 'section';
        return (
          <h2
            id={id}
            className="text-xl font-semibold text-foreground mt-6 mb-3 border-b border-border pb-2 scroll-mt-20"
          >
            {children}
          </h2>
        );
      },
      h3: ({ children }: React.ComponentPropsWithoutRef<'h3'>) => {
        const text = getChildrenText(children);
        const id = slugify(text) || 'section';
        return (
          <h3
            id={id}
            className="text-lg font-semibold text-foreground mt-4 mb-2 scroll-mt-20"
          >
            {children}
          </h3>
        );
      },
      p: ({ children }: React.ComponentPropsWithoutRef<'p'>) => (
        <p className="text-sm sm:text-base text-foreground/90 leading-relaxed mb-4">
          {children}
        </p>
      ),
      ul: ({ children }: React.ComponentPropsWithoutRef<'ul'>) => (
        <ul className="list-disc pl-6 mb-4 space-y-1 text-foreground/90">
          {children}
        </ul>
      ),
      ol: ({ children }: React.ComponentPropsWithoutRef<'ol'>) => (
        <ol className="list-decimal pl-6 mb-4 space-y-1 text-foreground/90">
          {children}
        </ol>
      ),
      blockquote: ({ children }: React.ComponentPropsWithoutRef<'blockquote'>) => (
        <blockquote className="border-l-4 border-border bg-surface/50 pl-4 py-2 my-4 italic text-foreground-muted rounded-r">
          {children}
        </blockquote>
      ),
      pre: ({ children }: React.ComponentPropsWithoutRef<'pre'>) => {
        if (React.isValidElement(children)) {
          const childProps = children.props as { className?: string; children?: React.ReactNode };
          const codeString = getChildrenText(childProps.children);
          const match = /language-([^\s]+)/.exec(childProps.className || '');
          const language = match ? match[1] : undefined;
          return <CodeBlock code={codeString} language={language} />;
        }
        return (
          <pre className="bg-[#0F141C] border border-[#30363D] rounded-lg p-4 font-mono text-xs overflow-x-auto min-w-0 max-w-full text-[#E6EDF3] my-4">
            {children}
          </pre>
        );
      },
      code: ({ className, children, ...props }: React.ComponentPropsWithoutRef<'code'>) => (
        <code
          className={cn(
            'font-mono text-[13px] bg-[#1F242C] border border-[#30363D] text-[#E6EDF3] px-1.5 py-0.5 rounded',
            className
          )}
          {...props}
        >
          {children}
        </code>
      ),
    }),
    []
  );

  return (
    <div
      data-testid="lesson-detail-page"
      className="w-full min-w-[360px] overflow-x-hidden text-foreground pb-20"
    >
      {/* Loading Skeleton */}
      {state.status === 'loading' && (
        <div data-testid="lesson-detail-loading" className="space-y-6 animate-pulse py-4">
          <div className="h-4 w-1/3 bg-surface rounded" />
          <div className="h-8 w-2/3 bg-surface rounded" />
          <div className="h-4 w-1/4 bg-surface rounded" />
          <div className="space-y-3 pt-4">
            <div className="h-4 w-full bg-surface rounded" />
            <div className="h-4 w-5/6 bg-surface rounded" />
            <div className="h-4 w-4/6 bg-surface rounded" />
          </div>
        </div>
      )}

      {/* Error: 404 Not Found / Unpublished */}
      {state.status === 'error' && state.is404 && (
        <div
          data-testid="lesson-detail-error-404"
          role="alert"
          className="rounded-lg border border-border bg-card p-8 text-center space-y-4 max-w-md mx-auto my-12"
        >
          <div className="inline-flex items-center justify-center h-12 w-12 rounded-full bg-surface text-foreground-muted mx-auto border border-border">
            <BookOpen className="h-6 w-6" />
          </div>
          <div className="space-y-2">
            <h2 className="text-base font-semibold text-foreground">
              Leçon introuvable ou non publiée.
            </h2>
            <p className="text-sm text-foreground-muted">
              Cette leçon n'existe pas ou n'est plus accessible aux étudiants.
            </p>
          </div>
          <div className="pt-2">
            <Button
              asChild
              variant="secondary"
              className="min-h-[48px] min-w-[48px] px-6 inline-flex items-center gap-2 border-border"
            >
              <Link to="/courses" data-testid="error-back-courses-btn">
                Retour aux cours
              </Link>
            </Button>
          </div>
        </div>
      )}

      {/* Error: 500 Server or Network failure */}
      {state.status === 'error' && !state.is404 && (
        <div
          data-testid="lesson-detail-error-network"
          role="alert"
          className="rounded-lg border border-destructive-border bg-destructive-surface p-6 text-center space-y-4 max-w-lg mx-auto my-12"
        >
          <div className="inline-flex items-center justify-center h-12 w-12 rounded-full bg-destructive/10 text-destructive mx-auto">
            <AlertCircle className="h-6 w-6" />
          </div>
          <div className="space-y-2">
            <h2 className="text-lg font-semibold text-foreground">
              Une erreur est survenue lors du chargement de la leçon.
            </h2>
            <p className="text-sm text-foreground-muted">
              {state.message}
            </p>
          </div>
          <Button
            type="button"
            onClick={handleRetry}
            variant="secondary"
            className="min-h-[48px] min-w-[48px] px-6 inline-flex items-center gap-2 border-border"
          >
            <RefreshCw className="h-4 w-4" />
            Réessayer
          </Button>
        </div>
      )}

      {/* Success State */}
      {state.status === 'success' && (
        <div>
          {/* Desktop Breadcrumbs: [Cours] > [Module] > [Chapitre] > [Leçon] */}
          <nav
            aria-label="Fil d'Ariane"
            data-testid="lesson-breadcrumbs-desktop"
            className="hidden sm:flex items-center gap-1.5 text-xs text-foreground-muted mb-4 flex-wrap"
          >
            <Link
              to="/courses"
              data-testid="breadcrumb-course-link"
              className="hover:text-foreground transition-colors font-medium"
            >
              {state.data.course_name}
            </Link>
            <ChevronRight className="h-3.5 w-3.5 text-foreground-muted/60 shrink-0" aria-hidden="true" />
            <span data-testid="breadcrumb-module" className="truncate max-w-[200px]">
              {state.data.module_name}
            </span>
            <ChevronRight className="h-3.5 w-3.5 text-foreground-muted/60 shrink-0" aria-hidden="true" />
            <span data-testid="breadcrumb-chapter" className="truncate max-w-[200px]">
              {state.data.chapter_name}
            </span>
            <ChevronRight className="h-3.5 w-3.5 text-foreground-muted/60 shrink-0" aria-hidden="true" />
            <span
              data-testid="breadcrumb-current-leaf"
              className="text-foreground-muted truncate max-w-[250px]"
              aria-current="page"
            >
              {state.data.title}
            </span>
          </nav>

          {/* Mobile Collapsed Breadcrumbs: ← [Nom du Chapitre] */}
          <div className="flex sm:hidden mb-4">
            <button
              type="button"
              data-testid="mobile-back-button"
              onClick={handleMobileBack}
              className="inline-flex items-center gap-1.5 text-xs text-foreground-muted hover:text-foreground min-h-[48px] min-w-[48px] px-2 py-1 rounded transition-colors focus:outline-none focus:ring-1 focus:ring-primary"
              aria-label={`Retour au chapitre ${state.data.chapter_name}`}
            >
              <ChevronLeft className="h-4 w-4 shrink-0" aria-hidden="true" />
              <span className="truncate">{state.data.chapter_name}</span>
            </button>
          </div>

          {/* Metadata Header */}
          <header className="mb-6 pb-4 border-b border-border">
            <h1
              data-testid="lesson-title"
              className="text-2xl sm:text-3xl font-bold text-foreground mb-3 tracking-tight"
            >
              {state.data.title}
            </h1>
            <div className="flex flex-wrap items-center gap-x-4 gap-y-2 text-xs text-foreground-muted">
              <span data-testid="lesson-teacher" className="inline-flex items-center gap-1.5">
                <User className="h-4 w-4 shrink-0" aria-hidden="true" />
                <span>{state.data.teacher}</span>
              </span>
              <span data-testid="lesson-date" className="font-mono inline-flex items-center gap-1.5">
                <Calendar className="h-4 w-4 shrink-0" aria-hidden="true" />
                <span>{state.data.course_date}</span>
              </span>

              {/* Resource Micro-Badges */}
              {state.data.resources && state.data.resources.length > 0 && (
                <div
                  data-testid="lesson-resource-badges"
                  className="inline-flex flex-wrap items-center gap-1.5 ml-auto"
                >
                  {state.data.resources.map((res, idx) => (
                    <ResourceBadge
                      key={res.id ? `${res.id}-${idx}` : `${state.data.id}-${res.type}-${idx}`}
                      type={res.type}
                    />
                  ))}
                </div>
              )}
            </div>
          </header>

          {/* Markdown Content Area */}
          <article
            ref={contentRef}
            data-testid="lesson-markdown-body"
            className="prose prose-invert max-w-none text-foreground min-w-0"
          >
            {state.data.description && state.data.description.trim() ? (
              <ReactMarkdown
                rehypePlugins={[rehypeSanitize]}
                components={markdownComponents}
              >
                {state.data.description}
              </ReactMarkdown>
            ) : (
              <div
                data-testid="lesson-empty-content"
                className="rounded-lg border border-border bg-card p-6 text-center space-y-2 max-w-lg mx-auto my-8"
              >
                <p className="text-sm text-foreground-muted">
                  Cette leçon ne contient pas encore de texte.
                </p>
              </div>
            )}
          </article>

          {/* Attached Resources Section */}
          {state.data.resources && state.data.resources.length > 0 && (
            <section
              aria-labelledby="resources-heading"
              data-testid="lesson-resources-section"
              className="mt-12 pt-8 border-t border-border min-w-0 max-w-full"
            >
              <h2
                id="resources-heading"
                data-testid="resources-heading"
                className="text-xl font-semibold text-foreground mb-6"
              >
                Ressources
              </h2>
              <div
                data-testid="lesson-resources-grid"
                className="grid grid-cols-1 md:grid-cols-2 gap-4"
              >
                {state.data.resources.map((resource) => (
                  <ResourceCard
                    key={resource.id}
                    resource={resource}
                    className={resource.type === 'video' ? 'col-span-full' : undefined}
                  />
                ))}
              </div>
            </section>
          )}

          {/* Discreet Floating Search Feedback Banner (Story FE-3.4) */}
          <SearchFeedbackPrompt lessonId={lessonId} searchSessionId={searchSessionId} />
        </div>
      )}
    </div>
  );
}

export default LessonDetailPage;
