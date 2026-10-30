import React from 'react';
import { ResourceBadge } from '@/components/ui/resource-badge';
import { HighlightText } from './highlight-text';
import { cn } from '@/lib/utils';
import type { SearchResultCardProps } from './types';

export function SearchResultCard({
  lesson,
  query = '',
  isSelected = false,
  onSelect,
  onMouseEnter,
  className,
}: SearchResultCardProps) {
  const cardRef = React.useRef<HTMLButtonElement>(null);

  React.useEffect(() => {
    if (isSelected && cardRef.current) {
      if (typeof cardRef.current.scrollIntoView === 'function') {
        cardRef.current.scrollIntoView({ block: 'nearest' });
      }
    }
  }, [isSelected]);

  const hasResources = Array.isArray(lesson.resources) && lesson.resources.length > 0;

  const ancestrySegments = [
    lesson.course_name?.trim(),
    lesson.module_name?.trim(),
    lesson.chapter_name?.trim(),
  ].filter((segment): segment is string => Boolean(segment && segment.length > 0));

  const trimmedTeacher = lesson.teacher?.trim();

  return (
    <button
      ref={cardRef}
      type="button"
      tabIndex={-1}
      title={lesson.title}
      id={`search-result-item-${lesson.id}`}
      data-testid={`search-result-item-${lesson.id}`}
      role="option"
      aria-selected={isSelected}
      onClick={() => onSelect(lesson.id)}
      onMouseEnter={onMouseEnter}
      className={cn(
        'w-full text-left p-3 sm:p-4 rounded-md border transition-colors flex flex-col gap-2 min-h-[48px] focus:outline-none cursor-pointer select-none',
        isSelected
          ? 'bg-[#1F242C] border-[#38BDF8] ring-1 ring-[#38BDF8]'
          : 'bg-[#161B22] border-[#30363D] hover:bg-[#1F242C] hover:border-border-focus',
        className
      )}
    >
      {/* Header: Title (h3) and Date (font-mono) */}
      <div className="flex items-start justify-between gap-3 w-full">
        <h3
          data-testid={`search-result-title-${lesson.id}`}
          className="font-semibold text-foreground text-sm sm:text-base line-clamp-1 flex-1 text-left"
        >
          <HighlightText text={lesson.title} query={query} />
        </h3>
        {lesson.course_date ? (
          <span
            data-testid={`search-result-date-${lesson.id}`}
            className="text-xs text-foreground-muted font-mono shrink-0 pt-0.5"
          >
            {lesson.course_date.slice(0, 10)}
          </span>
        ) : (
          <span
            data-testid={`search-result-date-${lesson.id}`}
            className="text-xs text-foreground-subtle font-mono shrink-0 pt-0.5"
          >
            Date non spécifiée
          </span>
        )}
      </div>

      {/* Ancestry Breadcrumb: [Cours] → [Module] → [Chapitre] */}
      <div
        data-testid={`search-result-ancestry-${lesson.id}`}
        className="flex items-center flex-wrap gap-1 text-xs text-foreground-muted w-full"
      >
        {ancestrySegments.map((segment, index) => (
          <React.Fragment key={index}>
            {index > 0 && (
              <span className="text-foreground-subtle select-none px-0.5" aria-hidden="true">
                →
              </span>
            )}
            <span className="truncate max-w-[150px] sm:max-w-none">
              <HighlightText text={segment} query={query} />
            </span>
          </React.Fragment>
        ))}
      </div>

      {/* Footer: Teacher and Resource Badges */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-2 pt-1 border-t border-[#30363D]/60 w-full text-xs">
        <div
          data-testid={`search-result-teacher-${lesson.id}`}
          className="text-foreground-muted truncate min-w-0"
        >
          {trimmedTeacher && trimmedTeacher.length > 0 ? (
            <span>
              Enseignant : <HighlightText text={trimmedTeacher} query={query} />
            </span>
          ) : (
            <span className="text-foreground-subtle">Enseignant non spécifié</span>
          )}
        </div>

        {hasResources ? (
          <div
            data-testid={`search-result-resources-${lesson.id}`}
            className="flex flex-wrap items-center gap-1.5 shrink-0"
          >
            {lesson.resources!.map((res, idx) => (
              <ResourceBadge
                key={res.id ? `${res.id}-${idx}` : `${lesson.id}-${res.type}-${idx}`}
                type={res.type}
              />
            ))}
          </div>
        ) : (
          <span
            data-testid={`search-result-no-resources-${lesson.id}`}
            className="text-xs text-foreground-subtle shrink-0"
          >
            Aucune ressource
          </span>
        )}
      </div>
    </button>
  );
}

export default SearchResultCard;
