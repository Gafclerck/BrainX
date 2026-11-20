import { Link, useLocation } from 'react-router-dom';
import { BookOpen, Trash2, BarChart2, Inbox } from 'lucide-react';
import { cn } from '@/lib/utils';

export function PublisherSubNav({ className }: { className?: string }) {
  const location = useLocation();

  const isCoursesActive =
    location.pathname === '/publisher' ||
    location.pathname === '/publisher/dashboard' ||
    location.pathname.startsWith('/publisher/courses') ||
    location.pathname.startsWith('/publisher/lessons');

  const isTrashActive = location.pathname.startsWith('/publisher/trash');
  const isAnalyticsActive = location.pathname.startsWith('/publisher/search-analytics');
  const isFeedbackActive = location.pathname.startsWith('/publisher/feedback');

  const links = [
    {
      to: '/publisher/dashboard',
      label: 'Catalogue des Cours',
      icon: BookOpen,
      isActive: isCoursesActive,
      testId: 'subnav-courses',
    },
    {
      to: '/publisher/trash',
      label: 'Corbeille',
      icon: Trash2,
      isActive: isTrashActive,
      testId: 'subnav-trash',
    },
    {
      to: '/publisher/search-analytics',
      label: 'Analytique des Recherches',
      icon: BarChart2,
      isActive: isAnalyticsActive,
      testId: 'subnav-analytics',
    },
    {
      to: '/publisher/feedback',
      label: 'Boîte à suggestions',
      icon: Inbox,
      isActive: isFeedbackActive,
      testId: 'subnav-feedback',
    },
  ];

  return (
    <nav
      aria-label="Navigation secondaire éditeur"
      className={cn(
        'flex items-center gap-1 sm:gap-2 border-b border-border pb-2 overflow-x-auto min-w-0',
        className
      )}
    >
      {links.map((link) => {
        const Icon = link.icon;
        return (
          <Link
            key={link.to}
            to={link.to}
            data-testid={link.testId}
            className={cn(
              'inline-flex items-center gap-2 px-3 py-1.5 rounded-md text-xs sm:text-sm font-medium transition-colors shrink-0 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary',
              link.isActive
                ? 'bg-surface text-foreground font-semibold border border-border shadow-sm'
                : 'text-foreground-muted hover:text-foreground hover:bg-surface/50 border border-transparent'
            )}
          >
            <Icon
              className={cn(
                'h-4 w-4',
                link.isActive ? 'text-primary' : 'text-foreground-muted'
              )}
            />
            <span>{link.label}</span>
          </Link>
        );
      })}
    </nav>
  );
}

export default PublisherSubNav;
