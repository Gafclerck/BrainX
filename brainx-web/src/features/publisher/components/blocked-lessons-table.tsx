import { useState, useEffect } from 'react';
import { AlertTriangle, Edit3 } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { useAuthStore } from '@/features/auth/auth-store';
import { fetchManageableLesson } from '../api';
import type { BlockedLessonsTableProps, BlockedLessonPreviewItem } from '../types';

export const CANONICAL_FIELD_ORDER = [
  'title',
  'description',
  'teacher',
  'course_date',
] as const;

export const MISSING_FIELD_LABELS: Record<string, string> = {
  title: 'Titre',
  description: 'Description',
  teacher: 'Enseignant',
  course_date: 'Date',
};

export function BlockedLessonsTable({
  blocked,
  onEditLesson,
  isUpdating = false,
}: BlockedLessonsTableProps) {
  const isPublisher = useAuthStore((state) => state.isPublisher);
  const [resolvedTitles, setResolvedTitles] = useState<Record<string, string>>({});

  useEffect(() => {
    if (!isPublisher || !blocked || blocked.length === 0) return;

    let isMounted = true;
    const itemsToFetch = blocked.filter(
      (item) => !item.title && !item.missing?.includes('title') && !resolvedTitles[item.id]
    );

    if (itemsToFetch.length === 0) return;

    itemsToFetch.forEach((item) => {
      fetchManageableLesson(item.id)
        .then((lesson) => {
          if (isMounted && lesson?.title) {
            setResolvedTitles((prev) => {
              if (prev[item.id] === lesson.title) return prev;
              return {
                ...prev,
                [item.id]: lesson.title,
              };
            });
          }
        })
        .catch(() => {
          if (isMounted) {
            setResolvedTitles((prev) => ({
              ...prev,
              [item.id]: 'Leçon sans titre',
            }));
          }
        });
    });

    return () => {
      isMounted = false;
    };
  }, [blocked, isPublisher]);

  if (!isPublisher || !blocked || blocked.length === 0) {
    return null;
  }

  const headerText =
    blocked.length === 1
      ? '1 leçon incomplète bloquant la publication'
      : `${blocked.length} leçons incomplètes bloquant la publication`;

  const getMissingBadges = (item: BlockedLessonPreviewItem) => {
    const missing = item.missing || [];
    const ordered = CANONICAL_FIELD_ORDER.filter((field) => missing.includes(field));
    const others = missing.filter(
      (field) => !(CANONICAL_FIELD_ORDER as readonly string[]).includes(field)
    );
    return [...ordered, ...others];
  };

  return (
    <div
      data-testid="blocked-lessons-table"
      className="rounded-lg border border-warning-border bg-warning-surface p-4 text-warning space-y-3"
    >
      <div className="flex items-center gap-2">
        <AlertTriangle className="h-5 w-5 shrink-0 text-warning" />
        <h4 id="blocked-lessons-heading" className="text-sm font-semibold text-warning">
          {headerText}
        </h4>
      </div>
      <p className="text-xs text-foreground-muted">
        Chaque leçon doit comporter un titre, une description, un enseignant et une date de cours pour pouvoir être publiée.
      </p>

      <div className="overflow-x-auto max-h-72 w-full">
        <table
          aria-labelledby="blocked-lessons-heading"
          className="w-full min-w-[460px] border-collapse text-left text-xs sm:text-sm"
        >
          <thead>
            <tr className="border-b border-warning-border/50 text-foreground-muted">
              <th scope="col" className="py-2 pr-3 font-medium">
                Leçon
              </th>
              <th scope="col" className="py-2 px-3 font-medium">
                Champs manquants
              </th>
              <th scope="col" className="py-2 pl-3 text-right font-medium">
                Action
              </th>
            </tr>
          </thead>
          <tbody className="divide-y divide-warning-border/30">
            {blocked.map((item) => {
              const displayTitle =
                item.title?.trim() ||
                resolvedTitles[item.id]?.trim() ||
                'Leçon sans titre';
              const missingFields = getMissingBadges(item);

              return (
                <tr
                  key={item.id}
                  data-testid={`blocked-lesson-row-${item.id}`}
                  className="hover:bg-warning-surface/80 transition-colors"
                >
                  <td
                    className="py-3 pr-3 font-medium text-foreground max-w-[200px] truncate"
                    title={displayTitle}
                  >
                    <span data-testid={`blocked-lesson-title-${item.id}`}>{displayTitle}</span>
                  </td>
                  <td className="py-3 px-3">
                    <div className="flex flex-wrap gap-1.5 items-center">
                      {missingFields.map((field) => (
                        <span
                          key={field}
                          data-testid={`missing-field-badge-${field}`}
                          className="inline-flex items-center px-2 py-0.5 rounded-full text-xs font-medium border border-destructive-border bg-destructive-surface text-destructive"
                        >
                          {MISSING_FIELD_LABELS[field] || field}
                        </span>
                      ))}
                    </div>
                  </td>
                  <td className="py-3 pl-3 text-right">
                    <Button
                      type="button"
                      variant="outline"
                      size="sm"
                      data-testid={`edit-blocked-lesson-btn-${item.id}`}
                      onClick={() => onEditLesson(item.id)}
                      disabled={isUpdating}
                      className="min-h-[44px] min-w-[44px] text-xs border-warning-border text-foreground hover:bg-warning/20 focus:ring-warning"
                      aria-label={`Modifier la leçon ${displayTitle}`}
                    >
                      <Edit3 className="h-3.5 w-3.5 mr-1 sm:inline-block" />
                      Modifier la leçon
                    </Button>
                  </td>
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>
    </div>
  );
}
