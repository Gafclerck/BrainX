import { useEffect, useState, type MouseEvent } from 'react';
import { Link, useLocation } from 'react-router-dom';
import { BookOpen, Layers, ChevronDown, ChevronRight, LayoutGrid } from 'lucide-react';
import { fetchPublishedCourses, fetchCourseModules } from './api';
import type { BrowseContainerItem } from './types';
import { cn } from '@/lib/utils';

export interface BrowseTreeSidebarProps {
  onLinkClick?: () => void;
}

export function BrowseTreeSidebar({ onLinkClick }: BrowseTreeSidebarProps) {
  const location = useLocation();
  const [courses, setCourses] = useState<BrowseContainerItem[]>([]);
  const [modulesMap, setModulesMap] = useState<Record<string, BrowseContainerItem[]>>({});
  const [expandedCourses, setExpandedCourses] = useState<Record<string, boolean>>({});
  const [loading, setLoading] = useState<boolean>(true);

  // Extract current IDs from path
  const courseMatch = location.pathname.match(/^\/courses\/([^/?#]+)/);
  const moduleMatch = location.pathname.match(/^\/modules\/([^/?#]+)/);
  const chapterMatch = location.pathname.match(/^\/chapters\/([^/?#]+)/);
  const lessonMatch = location.pathname.match(/^\/lessons\/([^/?#]+)/);
  const activeCourseId = courseMatch ? courseMatch[1] : undefined;
  const activeModuleId = moduleMatch ? moduleMatch[1] : undefined;
  const activeChapterId = chapterMatch ? chapterMatch[1] : undefined;
  const activeLessonId = lessonMatch ? lessonMatch[1] : undefined;
  const isCatalogActive = location.pathname === '/courses';

  // Fetch published courses on mount
  useEffect(() => {
    let isMounted = true;
    setLoading(true);

    fetchPublishedCourses()
      .then((res) => {
        if (isMounted) {
          setCourses(res.results || []);
          setLoading(false);
        }
      })
      .catch(() => {
        if (isMounted) {
          setCourses([]);
          setLoading(false);
        }
      });

    return () => {
      isMounted = false;
    };
  }, []);

  // When a course is active, expand it and fetch its modules on demand
  useEffect(() => {
    if (!activeCourseId) return;

    setExpandedCourses((prev) => ({ ...prev, [activeCourseId]: true }));

    setModulesMap((prevMap) => {
      if (!prevMap[activeCourseId]) {
        fetchCourseModules(activeCourseId)
          .then((res) => {
            setModulesMap((m) => ({
              ...m,
              [activeCourseId]: res.results || [],
            }));
          })
          .catch(() => {
            setModulesMap((m) => ({
              ...m,
              [activeCourseId]: [],
            }));
          });
      }
      return prevMap;
    });
  }, [activeCourseId]);

  const toggleCourseExpand = (courseId: string, e: MouseEvent) => {
    e.preventDefault();
    e.stopPropagation();

    const isExpanding = !expandedCourses[courseId];
    setExpandedCourses((prev) => ({
      ...prev,
      [courseId]: isExpanding,
    }));

    if (isExpanding) {
      setModulesMap((prevMap) => {
        if (!prevMap[courseId]) {
          fetchCourseModules(courseId)
            .then((res) => {
              setModulesMap((m) => ({
                ...m,
                [courseId]: res.results || [],
              }));
            })
            .catch(() => {
              setModulesMap((m) => ({
                ...m,
                [courseId]: [],
              }));
            });
        }
        return prevMap;
      });
    }
  };

  return (
    <nav
      data-testid="browse-tree-sidebar"
      data-active-chapter={activeChapterId}
      data-active-lesson={activeLessonId}
      aria-label="Arborescence des cours"
      className="space-y-4 text-sm"
    >
      <div>
        <h3 className="font-semibold text-xs uppercase tracking-wider text-foreground-muted mb-3">
          Sommaire du cours
        </h3>

        {/* Root Catalog Link */}
        <Link
          to="/courses"
          onClick={onLinkClick}
          data-sidebar-link
          data-testid="sidebar-link-catalog"
          className={cn(
            'flex items-center gap-2 px-2.5 py-2 min-h-[48px] rounded-md transition-colors',
            isCatalogActive
              ? 'bg-surface text-primary font-medium'
              : 'text-foreground hover:bg-surface hover:text-foreground'
          )}
        >
          <LayoutGrid className="h-4 w-4 shrink-0 text-foreground-muted" />
          <span>Tous les cours</span>
        </Link>
      </div>

      {/* Loading Skeletons */}
      {loading && (
        <div className="space-y-2 pt-1" data-testid="sidebar-loading">
          <div className="h-7 w-5/6 bg-surface animate-pulse rounded" />
          <div className="h-7 w-4/6 bg-surface animate-pulse rounded" />
          <div className="h-7 w-5/6 bg-surface animate-pulse rounded" />
        </div>
      )}

      {/* Course Tree Hierarchy */}
      {!loading && courses.length > 0 && (
        <div className="space-y-1">
          <span className="block text-xs font-semibold text-foreground-muted uppercase tracking-wider px-2.5 py-1">
            Cours disponibles
          </span>
          <ul className="space-y-1">
            {courses.map((course) => {
              const isCourseActive = activeCourseId === course.id;
              const isExpanded = Boolean(expandedCourses[course.id]);
              const modules = modulesMap[course.id];

              return (
                <li key={course.id} className="space-y-1">
                  <div
                    className={cn(
                      'flex items-center justify-between rounded-md transition-colors group',
                      isCourseActive
                        ? 'bg-surface text-primary font-medium'
                        : 'text-foreground hover:bg-surface'
                    )}
                  >
                    <Link
                      to={`/courses/${course.id}`}
                      onClick={onLinkClick}
                      data-sidebar-link
                      data-testid={`sidebar-course-${course.id}`}
                      className="flex-1 flex items-center gap-2 px-2.5 py-2 min-h-[48px] truncate"
                    >
                      <BookOpen className="h-4 w-4 shrink-0 text-foreground-muted group-hover:text-primary transition-colors" />
                      <span className="truncate">{course.name}</span>
                    </Link>

                    {/* Expand/Collapse Toggle Button */}
                    <button
                      type="button"
                      onClick={(e) => toggleCourseExpand(course.id, e)}
                      aria-expanded={isExpanded}
                      aria-label={isExpanded ? `Réduire ${course.name}` : `Développer ${course.name}`}
                      data-testid={`sidebar-toggle-${course.id}`}
                      className="p-2 text-foreground-muted hover:text-foreground rounded focus:outline-none focus:ring-1 focus:ring-primary min-h-[48px] min-w-[48px] flex items-center justify-center"
                    >
                      {isExpanded ? (
                        <ChevronDown className="h-4 w-4" />
                      ) : (
                        <ChevronRight className="h-4 w-4" />
                      )}
                    </button>
                  </div>

                  {/* Nested Modules */}
                  {isExpanded && (
                    <ul className="pl-4 ml-2 border-l border-border space-y-1">
                      {modules ? (
                        modules.length > 0 ? (
                          modules.map((module) => {
                            const isModuleActive = activeModuleId === module.id;
                            return (
                              <li key={module.id}>
                                <Link
                                  to={`/modules/${module.id}`}
                                  onClick={onLinkClick}
                                  data-sidebar-link
                                  data-testid={`sidebar-module-${module.id}`}
                                  className={cn(
                                    'flex items-center gap-2 px-2.5 py-1.5 min-h-[48px] rounded-md text-xs transition-colors',
                                    isModuleActive
                                      ? 'text-primary font-medium bg-surface/60'
                                      : 'text-foreground-muted hover:text-foreground hover:bg-surface'
                                  )}
                                >
                                  <Layers className="h-3.5 w-3.5 shrink-0" />
                                  <span className="truncate">{module.name}</span>
                                </Link>
                              </li>
                            );
                          })
                        ) : (
                          <li className="px-2.5 py-2 text-xs text-foreground-subtle italic">
                            Aucun module publié
                          </li>
                        )
                      ) : (
                        <li className="space-y-1 py-1">
                          <div className="h-4 w-3/4 bg-surface animate-pulse rounded" />
                          <div className="h-4 w-1/2 bg-surface animate-pulse rounded" />
                        </li>
                      )}
                    </ul>
                  )}
                </li>
              );
            })}
          </ul>
        </div>
      )}
    </nav>
  );
}

export default BrowseTreeSidebar;
