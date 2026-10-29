import React from 'react';
import { Outlet, useLocation } from 'react-router-dom';
import * as DialogPrimitive from '@radix-ui/react-dialog';
import { Menu, AlignRight, X } from 'lucide-react';
import { AppHeader } from './app-header';
import { cn } from '@/lib/utils';
import { TocProvider, useToc } from './toc-context';

export interface StudentLayoutProps {
  children?: React.ReactNode;
  sidebar?: React.ReactNode;
  toc?: React.ReactNode;
  onSearchTrigger?: () => void;
  className?: string;
}

export function DefaultSidebarContent({ onLinkClick }: { onLinkClick?: () => void }) {
  return (
    <nav className="space-y-4 text-sm" aria-label="Navigation secondaire du cours">
      <div>
        <h3 className="font-semibold text-xs uppercase tracking-wider text-foreground-muted mb-2">
          Sommaire du cours
        </h3>
        <ul className="space-y-1">
          <li>
            <a
              href="#vue-d-ensemble"
              onClick={onLinkClick}
              className="block px-2.5 py-1.5 rounded-md text-foreground hover:bg-surface transition-colors"
            >
              Vue d'ensemble
            </a>
          </li>
          <li>
            <a
              href="#modules"
              onClick={onLinkClick}
              className="block px-2.5 py-1.5 rounded-md text-foreground-muted hover:text-foreground hover:bg-surface transition-colors"
            >
              Modules pédagogiques
            </a>
          </li>
          <li>
            <a
              href="#ressources"
              onClick={onLinkClick}
              className="block px-2.5 py-1.5 rounded-md text-foreground-muted hover:text-foreground hover:bg-surface transition-colors"
            >
              Ressources associées
            </a>
          </li>
        </ul>
      </div>
    </nav>
  );
}

export function DefaultTocContent({ onLinkClick }: { onLinkClick?: () => void }) {
  return (
    <nav className="space-y-4 text-sm" aria-label="Table des matières">
      <h3 className="font-semibold text-xs uppercase tracking-wider text-foreground-muted mb-2">
        Sur cette page
      </h3>
      <ul className="space-y-1">
        <li>
          <a
            href="#introduction"
            onClick={onLinkClick}
            className="block px-2 py-1 text-xs text-foreground-muted hover:text-foreground transition-colors"
          >
            Introduction
          </a>
        </li>
        <li>
          <a
            href="#objectifs"
            onClick={onLinkClick}
            className="block px-2 py-1 text-xs text-foreground-muted hover:text-foreground transition-colors"
          >
            Objectifs
          </a>
        </li>
        <li>
          <a
            href="#prerequis"
            onClick={onLinkClick}
            className="block px-2 py-1 text-xs text-foreground-muted hover:text-foreground transition-colors"
          >
            Prérequis
          </a>
        </li>
      </ul>
    </nav>
  );
}

function StudentLayoutInner({
  children,
  sidebar,
  toc: tocProp,
  onSearchTrigger,
  className,
}: StudentLayoutProps) {
  const { toc: dynamicToc } = useToc();
  const [isLeftDrawerOpen, setIsLeftDrawerOpen] = React.useState(false);
  const [isRightDrawerOpen, setIsRightDrawerOpen] = React.useState(false);
  const location = useLocation();

  // Auto-close mobile drawers on route / location change
  React.useEffect(() => {
    setIsLeftDrawerOpen(false);
    setIsRightDrawerOpen(false);
  }, [location.pathname, location.search, location.hash]);

  // Close left drawer on link or interactive action selection inside sidebar
  const handleLeftDrawerContentClick = (e: React.MouseEvent) => {
    const target = e.target as HTMLElement;
    if (target.closest('a') || target.tagName === 'A' || target.closest('button[data-sidebar-link]')) {
      setIsLeftDrawerOpen(false);
    }
  };

  // Close right drawer on link selection inside TOC
  const handleRightDrawerContentClick = (e: React.MouseEvent) => {
    const target = e.target as HTMLElement;
    if (target.closest('a') || target.tagName === 'A' || target.closest('button[data-toc-link]')) {
      setIsRightDrawerOpen(false);
    }
  };

  // Mobile drawer trigger buttons (minimum 48x48px touch targets)
  const leftDrawerTrigger = (
    <button
      type="button"
      data-testid="left-drawer-trigger"
      aria-label="Sommaire du cours"
      onClick={() => setIsLeftDrawerOpen(true)}
      className="inline-flex items-center justify-center h-12 w-12 min-h-[48px] min-w-[48px] rounded-md text-foreground-muted hover:text-foreground hover:bg-surface border border-transparent hover:border-border focus:outline-none focus-visible:ring-2 focus-visible:ring-border-focus"
    >
      <Menu className="h-5 w-5" />
      <span className="sr-only">Sommaire du cours</span>
    </button>
  );

  const rightDrawerTrigger = (
    <button
      type="button"
      data-testid="right-drawer-trigger"
      aria-label="Sur cette page"
      onClick={() => setIsRightDrawerOpen(true)}
      className="inline-flex items-center justify-center h-12 w-12 min-h-[48px] min-w-[48px] rounded-md text-foreground-muted hover:text-foreground hover:bg-surface border border-transparent hover:border-border focus:outline-none focus-visible:ring-2 focus-visible:ring-border-focus"
    >
      <AlignRight className="h-5 w-5" />
      <span className="sr-only">Sur cette page</span>
    </button>
  );

  return (
    <div
      data-testid="student-layout"
      className={cn(
        'min-h-screen bg-background text-foreground min-w-[360px] w-full overflow-x-hidden flex flex-col font-sans selection:bg-primary selection:text-primary-foreground',
        className
      )}
    >
      {/* Sticky Header with drawer triggers for mobile viewport */}
      <AppHeader
        onSearchTrigger={onSearchTrigger}
        leftDrawerTrigger={leftDrawerTrigger}
        rightDrawerTrigger={rightDrawerTrigger}
      />

      {/* Main 3-Column Documentation Container */}
      <div className="flex-1 w-full max-w-page-max mx-auto flex">
        {/* Left Column (280px Navigation Sidebar - Desktop only) */}
        <aside
          data-testid="student-left-sidebar"
          aria-label="Sommaire du cours"
          className="hidden lg:block w-sidebar-width shrink-0 sticky top-14 h-[calc(100vh-3.5rem)] overflow-y-auto border-r border-border p-4 bg-surface/30"
        >
          {sidebar ?? <DefaultSidebarContent />}
        </aside>

        {/* Central Column (Reading zone - max-w 860px) */}
        <main
          data-testid="student-main-content"
          className="flex-1 min-w-0 max-w-content-max mx-auto w-full py-6 px-4 sm:px-6 lg:px-8"
        >
          {children ?? <Outlet />}
        </main>

        {/* Right Column (220px TOC Rail - Desktop only) */}
        <aside
          data-testid="student-right-toc"
          aria-label="Sur cette page"
          className="hidden lg:block w-toc-width shrink-0 sticky top-14 h-[calc(100vh-3.5rem)] overflow-y-auto border-l border-border p-4 bg-surface/30"
        >
          {tocProp ?? dynamicToc ?? <DefaultTocContent />}
        </aside>
      </div>

      {/* Mobile Slide-out Left Drawer: Sommaire du cours */}
      <DialogPrimitive.Root open={isLeftDrawerOpen} onOpenChange={setIsLeftDrawerOpen}>
        <DialogPrimitive.Portal>
          <DialogPrimitive.Overlay
            data-testid="left-drawer-backdrop"
            className="fixed inset-0 z-50 bg-black/70 backdrop-blur-sm data-[state=open]:animate-in data-[state=closed]:animate-out data-[state=closed]:fade-out-0 data-[state=open]:fade-in-0"
          />
          <DialogPrimitive.Content
            data-testid="left-drawer-content"
            aria-label="Sommaire du cours"
            onClick={handleLeftDrawerContentClick}
            className="fixed inset-y-0 left-0 z-50 w-sidebar-width max-w-[85vw] bg-surface border-r border-border p-4 shadow-xl flex flex-col focus:outline-none transition ease-in-out data-[state=open]:animate-in data-[state=closed]:animate-out data-[state=closed]:slide-out-to-left data-[state=open]:slide-in-from-left"
          >
            <div className="flex items-center justify-between pb-3 border-b border-border shrink-0">
              <DialogPrimitive.Title className="text-base font-semibold text-foreground">
                Sommaire du cours
              </DialogPrimitive.Title>
              <DialogPrimitive.Close
                data-testid="close-left-drawer"
                aria-label="Fermer"
                className="inline-flex h-12 w-12 min-h-[48px] min-w-[48px] items-center justify-center rounded-md text-foreground-muted hover:text-foreground hover:bg-surface focus:outline-none focus:ring-2 focus:ring-border-focus"
              >
                <X className="h-5 w-5" />
                <span className="sr-only">Fermer</span>
              </DialogPrimitive.Close>
            </div>
            <DialogPrimitive.Description className="sr-only">
              Navigation et sommaire du cours pour appareils mobiles
            </DialogPrimitive.Description>
            <div className="flex-1 overflow-y-auto py-4">
              {sidebar ?? <DefaultSidebarContent onLinkClick={() => setIsLeftDrawerOpen(false)} />}
            </div>
          </DialogPrimitive.Content>
        </DialogPrimitive.Portal>
      </DialogPrimitive.Root>

      {/* Mobile Slide-out Right Drawer: Sur cette page */}
      <DialogPrimitive.Root open={isRightDrawerOpen} onOpenChange={setIsRightDrawerOpen}>
        <DialogPrimitive.Portal>
          <DialogPrimitive.Overlay
            data-testid="right-drawer-backdrop"
            className="fixed inset-0 z-50 bg-black/70 backdrop-blur-sm data-[state=open]:animate-in data-[state=closed]:animate-out data-[state=closed]:fade-out-0 data-[state=open]:fade-in-0"
          />
          <DialogPrimitive.Content
            data-testid="right-drawer-content"
            aria-label="Sur cette page"
            onClick={handleRightDrawerContentClick}
            className="fixed inset-y-0 right-0 z-50 w-toc-width max-w-[85vw] bg-surface border-l border-border p-4 shadow-xl flex flex-col focus:outline-none transition ease-in-out data-[state=open]:animate-in data-[state=closed]:animate-out data-[state=closed]:slide-out-to-right data-[state=open]:slide-in-from-right"
          >
            <div className="flex items-center justify-between pb-3 border-b border-border shrink-0">
              <DialogPrimitive.Title className="text-base font-semibold text-foreground">
                Sur cette page
              </DialogPrimitive.Title>
              <DialogPrimitive.Close
                data-testid="close-right-drawer"
                aria-label="Fermer"
                className="inline-flex h-12 w-12 min-h-[48px] min-w-[48px] items-center justify-center rounded-md text-foreground-muted hover:text-foreground hover:bg-surface focus:outline-none focus:ring-2 focus:ring-border-focus"
              >
                <X className="h-5 w-5" />
                <span className="sr-only">Fermer</span>
              </DialogPrimitive.Close>
            </div>
            <DialogPrimitive.Description className="sr-only">
              Table des matières et ressources de la leçon pour appareils mobiles
            </DialogPrimitive.Description>
            <div className="flex-1 overflow-y-auto py-4">
              {tocProp ?? dynamicToc ?? <DefaultTocContent onLinkClick={() => setIsRightDrawerOpen(false)} />}
            </div>
          </DialogPrimitive.Content>
        </DialogPrimitive.Portal>
      </DialogPrimitive.Root>
    </div>
  );
}

export function StudentLayout(props: StudentLayoutProps) {
  return (
    <TocProvider>
      <StudentLayoutInner {...props} />
    </TocProvider>
  );
}

export default StudentLayout;
