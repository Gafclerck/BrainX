import React from 'react';
import { Link } from 'react-router-dom';
import { Calendar, User, BookOpen, ChevronRight, Pencil, Trash2 } from 'lucide-react';
import type { PublisherCourseItem, CourseStatus } from '../types';
import { cn } from '@/lib/utils';

export interface PublisherCourseCardProps {
  course: PublisherCourseItem;
  publishedCourseIds?: Set<string>;
  className?: string;
  onEdit?: (course: PublisherCourseItem) => void;
  onDelete?: (course: PublisherCourseItem) => void;
}

/**
 * Computes course publication status according to spec heuristic:
 * - is_deleted === true -> 'deleted'
 * - is_published === true OR publishedCourseIds.has(course.id) -> 'published'
 * - otherwise -> 'draft'
 */
export function computeCourseStatus(
  course: {
    id?: string;
    is_deleted?: boolean;
    is_published?: boolean;
  },
  publishedCourseIds?: Set<string>
): CourseStatus {
  if (course.is_deleted) {
    return 'deleted';
  }
  if (course.is_published || (course.id && publishedCourseIds?.has(course.id))) {
    return 'published';
  }
  return 'draft';
}

interface StatusConfig {
  label: string;
  badgeClass: string;
  testId: string;
}

const STATUS_CONFIG: Record<CourseStatus, StatusConfig> = {
  published: {
    label: 'Publié',
    badgeClass: 'text-[#3FB950] bg-[#122416] border-[#238636]',
    testId: 'status-badge-published',
  },
  draft: {
    label: 'Brouillon',
    badgeClass: 'text-[#D29922] bg-[#2E2211] border-[#9E6A03]',
    testId: 'status-badge-draft',
  },
  deleted: {
    label: 'Supprimé',
    badgeClass: 'text-[#F85149] bg-[#251719] border-[#DA3633]',
    testId: 'status-badge-deleted',
  },
};

export function formatIsoDate(dateStr: string): string {
  if (!dateStr || typeof dateStr !== 'string') return '';
  return dateStr.slice(0, 10);
}

export function PublisherStatusBadge({
  status,
  courseId,
  className,
}: {
  status: CourseStatus;
  courseId?: string;
  className?: string;
}) {
  const config = STATUS_CONFIG[status];

  return (
    <span
      data-testid={courseId ? `publisher-course-status-${courseId}` : undefined}
      data-badge-status={status}
      className={cn(
        'inline-flex items-center px-2.5 py-0.5 rounded-full text-xs font-medium border select-none',
        config.badgeClass,
        className
      )}
    >
      <span data-testid="publisher-course-status-badge">{config.label}</span>
    </span>
  );
}

export function PublisherCourseCard({
  course,
  publishedCourseIds,
  className,
  onEdit,
  onDelete,
}: PublisherCourseCardProps) {
  const status = computeCourseStatus(course, publishedCourseIds);
  const formattedDate = formatIsoDate(course.updated_at);
  const authorEmail = course.last_modified_by?.email || 'Auteur non renseigné';

  return (
    <div
      data-testid={`publisher-course-card-${course.id}`}
      className={cn(
        'group rounded-lg border border-border bg-card p-5 hover:border-primary/50 transition-colors flex flex-col justify-between gap-4 shadow-sm min-w-0',
        course.is_deleted && 'opacity-85 border-destructive-border/50',
        className
      )}
    >
      {/* Top Header: Subject tag & Status Badge */}
      <div className="flex items-center justify-between gap-2">
        <div className="flex items-center gap-1.5 min-w-0">
          <BookOpen className="h-4 w-4 text-primary shrink-0" aria-hidden="true" />
          <span
            data-testid={`publisher-course-subject-${course.id}`}
            className="text-xs font-semibold uppercase tracking-wider text-foreground-muted truncate"
          >
            {course.subject}
          </span>
        </div>
        <PublisherStatusBadge status={status} courseId={course.id} />
      </div>

      {/* Main Content: Course Title */}
      <div className="space-y-1">
        <Link
          to={`/publisher/courses/${course.id}`}
          className="focus:outline-none focus-visible:ring-2 focus-visible:ring-primary rounded block"
        >
          <h2
            data-testid={`publisher-course-name-${course.id}`}
            className="text-lg font-semibold text-foreground group-hover:text-primary transition-colors break-words"
          >
            {course.name}
          </h2>
        </Link>
      </div>

      {/* Metadata & Actions Footer */}
      <div className="pt-3 border-t border-border flex flex-col sm:flex-row sm:items-center justify-between gap-2.5">
        <div className="space-y-1 text-xs text-foreground-muted min-w-0">
          {/* Author Email */}
          <div
            data-testid={`publisher-course-author-${course.id}`}
            className="flex items-center gap-1.5 truncate"
            title={`Modifié par : ${authorEmail}`}
          >
            <User className="h-3.5 w-3.5 shrink-0" aria-hidden="true" />
            <span className="truncate">{authorEmail}</span>
          </div>

          {/* Modification Date in JetBrains Mono (YYYY-MM-DD) */}
          <div
            data-testid={`publisher-course-updated-at-${course.id}`}
            className="flex items-center gap-1.5 font-mono text-[11px]"
          >
            <Calendar className="h-3.5 w-3.5 shrink-0 font-sans" aria-hidden="true" />
            <span>{formattedDate}</span>
          </div>
        </div>

        {/* Action Buttons: Edit, Delete, Manage */}
        <div className="flex items-center gap-1.5 self-start sm:self-auto shrink-0">
          {onEdit && (
            <button
              type="button"
              onClick={() => onEdit(course)}
              data-testid={`publisher-edit-course-${course.id}`}
              aria-label={`Modifier le cours ${course.name}`}
              className="inline-flex items-center justify-center p-2 text-foreground-muted hover:text-foreground hover:bg-surface rounded-md border border-border min-h-[44px] min-w-[44px] transition-colors focus:outline-none focus-visible:ring-2 focus-visible:ring-primary"
            >
              <Pencil className="h-3.5 w-3.5" aria-hidden="true" />
            </button>
          )}

          {onDelete && (
            <button
              type="button"
              onClick={() => onDelete(course)}
              data-testid={`publisher-delete-course-${course.id}`}
              aria-label={`Supprimer le cours ${course.name}`}
              className="inline-flex items-center justify-center p-2 text-destructive hover:bg-destructive/10 rounded-md border border-destructive-border/50 min-h-[44px] min-w-[44px] transition-colors focus:outline-none focus-visible:ring-2 focus-visible:ring-destructive"
            >
              <Trash2 className="h-3.5 w-3.5" aria-hidden="true" />
            </button>
          )}

          {/* Action Link: Manage Course */}
          <Link
            to={`/publisher/courses/${course.id}`}
            data-testid={`publisher-manage-course-${course.id}`}
            aria-label={`Gérer le cours ${course.name}`}
            className="inline-flex items-center justify-center gap-1 px-3 py-1.5 text-xs font-medium rounded-md bg-surface hover:bg-border text-foreground hover:text-primary border border-border transition-colors min-h-[44px] min-w-[44px] focus:outline-none focus-visible:ring-2 focus-visible:ring-primary"
          >
            <span>Gérer</span>
            <ChevronRight className="h-3.5 w-3.5 shrink-0" aria-hidden="true" />
          </Link>
        </div>
      </div>
    </div>
  );
}

export default PublisherCourseCard;
