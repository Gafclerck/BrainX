import { useEffect, useState, type MouseEvent } from 'react';
import { cn } from '@/lib/utils';
import type { TocItem } from '@/components/layout/toc-context';

export interface LessonTocProps {
  items: TocItem[];
  className?: string;
  onItemClick?: (id: string) => void;
}

export function LessonToc({ items, className, onItemClick }: LessonTocProps) {
  const [activeId, setActiveId] = useState<string>(() => items[0]?.id || '');

  useEffect(() => {
    if (items.length === 0) return;
    if (!activeId || !items.some((item) => item.id === activeId)) {
      setActiveId(items[0].id);
    }
  }, [items, activeId]);

  useEffect(() => {
    if (typeof window === 'undefined' || typeof IntersectionObserver === 'undefined') {
      return;
    }
    if (items.length === 0) return;

    const visibleElements = new Map<string, IntersectionObserverEntry>();

    const observer = new IntersectionObserver(
      (entries) => {
        entries.forEach((entry) => {
          visibleElements.set(entry.target.id, entry);
        });

        // Find the first intersecting heading based on document hierarchy order
        const visibleItem = items.find((item) => {
          const entry = visibleElements.get(item.id);
          return entry && entry.isIntersecting;
        });

        if (visibleItem) {
          setActiveId(visibleItem.id);
        }
      },
      {
        rootMargin: '-80px 0px -60% 0px',
        threshold: 0,
      }
    );

    items.forEach((item) => {
      const el = document.getElementById(item.id);
      if (el) {
        observer.observe(el);
      }
    });

    return () => {
      observer.disconnect();
    };
  }, [items]);

  if (items.length === 0) {
    return null;
  }

  const handleClick = (e: MouseEvent<HTMLAnchorElement>, id: string) => {
    e.preventDefault();
    setActiveId(id);
    if (onItemClick) {
      onItemClick(id);
    }
    const el = document.getElementById(id);
    if (el) {
      if (typeof el.scrollIntoView === 'function') {
        el.scrollIntoView({ behavior: 'smooth' });
      }
      if (typeof window !== 'undefined' && window.history?.replaceState) {
        window.history.replaceState(null, '', `#${id}`);
      }
    }
  };

  return (
    <nav
      data-testid="lesson-toc"
      aria-label="Sur cette page"
      className={cn('space-y-3 text-sm', className)}
    >
      <h3 className="font-semibold text-xs uppercase tracking-wider text-foreground-muted mb-2">
        Sur cette page
      </h3>
      <ul className="space-y-1 text-xs border-l border-border/40">
        {items.map((item) => {
          const isActive = item.id === activeId;
          return (
            <li key={item.id}>
              <a
                href={`#${item.id}`}
                data-toc-link
                data-testid={`toc-link-${item.id}`}
                data-active={isActive ? 'true' : 'false'}
                aria-current={isActive ? 'location' : undefined}
                onClick={(e) => handleClick(e, item.id)}
                className={cn(
                  'flex items-center min-h-[44px] py-1 text-xs transition-colors',
                  isActive
                    ? 'text-primary font-medium border-l-2 border-primary -ml-[1px]'
                    : 'text-foreground-muted hover:text-foreground',
                  item.level === 3 ? 'pl-4' : 'pl-2'
                )}
              >
                {item.text}
              </a>
            </li>
          );
        })}
      </ul>
    </nav>
  );
}

export default LessonToc;
