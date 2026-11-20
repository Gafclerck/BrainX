import React from 'react';
import { Link, useNavigate, useLocation } from 'react-router-dom';
import { Search, User, LogOut, BookOpen } from 'lucide-react';
import { useAuthStore } from '@/features/auth/auth-store';
import { BrainXLogo } from '@/components/ui/brainx-logo';
import { cn } from '@/lib/utils';

export interface AppHeaderProps {
  onSearchTrigger?: () => void;
  leftDrawerTrigger?: React.ReactNode;
  rightDrawerTrigger?: React.ReactNode;
  className?: string;
  forceShortcutLabel?: string;
}

export function AppHeader({
  onSearchTrigger,
  leftDrawerTrigger,
  rightDrawerTrigger,
  className,
  forceShortcutLabel,
}: AppHeaderProps) {
  const navigate = useNavigate();
  const location = useLocation();
  const [isProfileOpen, setIsProfileOpen] = React.useState(false);
  const profileMenuRef = React.useRef<HTMLDivElement>(null);
  const profileTriggerRef = React.useRef<HTMLButtonElement>(null);

  const accessToken = useAuthStore((s) => s.accessToken);
  const user = useAuthStore((s) => s.user);
  const isPublisher = useAuthStore((s) => s.isPublisher);
  const logout = useAuthStore((s) => s.logout);

  // Platform detection for Cmd+K (Mac) vs Ctrl+K (Windows/Linux)
  const isMac = (() => {
    if (typeof navigator === 'undefined') return false;
    const platform =
      (navigator as unknown as { userAgentData?: { platform?: string } })?.userAgentData?.platform ||
      navigator.platform ||
      navigator.userAgent ||
      '';
    return /(Mac|iPhone|iPod|iPad)/i.test(platform);
  })();

  const shortcutLabel = forceShortcutLabel ?? (isMac ? 'Cmd+K' : 'Ctrl+K');

  const handleSearchClick = () => {
    if (onSearchTrigger) {
      onSearchTrigger();
    } else {
      navigate('/search');
    }
  };

  // Keyboard shortcut listener: Cmd+K or Ctrl+K
  React.useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      // Ignore if modified by shift or alt
      if (e.shiftKey || e.altKey) return;

      // Ignore if user is currently typing inside an input, textarea, or contentEditable element
      const target = e.target as HTMLElement | null;
      if (target) {
        const tagName = target.tagName;
        if (tagName === 'INPUT' || tagName === 'TEXTAREA' || target.isContentEditable) {
          return;
        }
      }

      if ((e.metaKey || e.ctrlKey) && (e.key === 'k' || e.key === 'K')) {
        e.preventDefault();
        if (onSearchTrigger) {
          onSearchTrigger();
        } else {
          navigate('/search');
        }
      }
    };

    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, [navigate, onSearchTrigger]);

  // Click outside and Escape handling with focus restoration for profile dropdown
  React.useEffect(() => {
    if (!isProfileOpen) return;

    const handleClickOutside = (e: MouseEvent) => {
      if (profileMenuRef.current && !profileMenuRef.current.contains(e.target as Node)) {
        setIsProfileOpen(false);
      }
    };

    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.key === 'Escape') {
        setIsProfileOpen(false);
        profileTriggerRef.current?.focus();
      }
    };

    document.addEventListener('mousedown', handleClickOutside);
    document.addEventListener('keydown', handleKeyDown);

    return () => {
      document.removeEventListener('mousedown', handleClickOutside);
      document.removeEventListener('keydown', handleKeyDown);
    };
  }, [isProfileOpen]);

  const handleLogout = () => {
    setIsProfileOpen(false);
    logout();
    navigate('/login');
  };

  const userEmail = user?.email || 'Compte invité';

  return (
    <header
      data-testid="app-header"
      className={cn(
        'sticky top-0 z-40 w-full shrink-0 border-b border-border bg-surface text-foreground select-none',
        className
      )}
    >
      <div className="max-w-page-max mx-auto px-2 sm:px-4 lg:px-6 h-14 flex items-center justify-between gap-2 sm:gap-4">
        {/* Left section: Left mobile drawer slot + BrainX Logo */}
        <div className="flex items-center gap-2 shrink-0">
          {leftDrawerTrigger && (
            <div className="lg:hidden flex items-center" data-testid="left-drawer-slot">
              {leftDrawerTrigger}
            </div>
          )}
          <Link
            to="/courses"
            data-testid="header-logo"
            aria-label="Accueil BrainX"
            className="flex items-center gap-2.5 rounded-md focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-border-focus group"
          >
            <BrainXLogo size="md" className="h-7 w-auto transition-transform group-hover:scale-105" />
            <span className="sr-only">BX</span>
            <span className="hidden sm:inline font-semibold text-foreground text-base tracking-tight font-sans group-hover:text-primary transition-colors leading-none translate-y-[1px]">
              BrainX
            </span>
          </Link>
        </div>

        {/* Center section: Fast search trigger bar */}
        <div className="flex-1 max-w-md mx-2 sm:mx-4">
          <button
            type="button"
            data-testid="search-trigger"
            aria-label="Rechercher"
            onClick={handleSearchClick}
            className="w-full flex items-center justify-between h-9 px-3 text-sm rounded-md bg-background/50 hover:bg-background border border-border hover:border-border-focus transition-colors focus:outline-none focus-visible:ring-2 focus-visible:ring-border-focus text-foreground-muted"
          >
            <div className="flex items-center gap-2 truncate">
              <Search className="h-4 w-4 shrink-0 text-foreground-muted" />
              <span className="truncate text-xs sm:text-sm">Rechercher...</span>
            </div>
            <kbd
              data-testid="search-shortcut"
              className="hidden sm:inline-flex items-center px-1.5 py-0.5 text-[11px] font-mono rounded bg-surface border border-border text-foreground-muted shrink-0 select-none"
            >
              {shortcutLabel}
            </kbd>
          </button>
        </div>

        {/* Right section: Right mobile drawer slot + Profile Menu (Authenticated) or Guest Actions (Unauthenticated) */}
        <div className="flex items-center gap-1 sm:gap-2 shrink-0">
          {rightDrawerTrigger && (
            <div className="lg:hidden flex items-center" data-testid="right-drawer-slot">
              {rightDrawerTrigger}
            </div>
          )}

          {accessToken ? (
            <div className="relative" ref={profileMenuRef}>
              <button
                ref={profileTriggerRef}
                type="button"
                data-testid="profile-menu-trigger"
                aria-label="Menu profil"
                aria-expanded={isProfileOpen}
                aria-haspopup="menu"
                onClick={() => setIsProfileOpen((prev) => !prev)}
                className="inline-flex items-center justify-center h-12 w-12 min-h-[48px] min-w-[48px] rounded-md text-foreground-muted hover:text-foreground hover:bg-surface border border-transparent hover:border-border focus:outline-none focus-visible:ring-2 focus-visible:ring-border-focus"
              >
                <User className="h-5 w-5" />
              </button>

              {isProfileOpen && (
                <div
                  role="menu"
                  data-testid="profile-menu"
                  className="absolute right-0 mt-2 w-64 rounded-md border border-border bg-popover p-3 shadow-lg z-50 text-foreground text-sm focus:outline-none"
                >
                  {/* User Info Header */}
                  <div className="pb-3 mb-3 border-b border-border space-y-1">
                    <p className="text-xs text-foreground-muted font-medium">Compte connecté</p>
                    <p
                      data-testid="profile-email"
                      className="text-sm font-semibold truncate text-foreground"
                      title={userEmail}
                    >
                      {userEmail}
                    </p>
                    <div className="pt-1 flex items-center gap-2">
                      <span className="text-xs text-foreground-muted">Rôle :</span>
                      {isPublisher ? (
                        <span
                          data-testid="publisher-badge"
                          className="px-2 py-0.5 text-xs font-medium rounded-full bg-primary/10 text-primary border border-primary/20"
                        >
                          Éditeur
                        </span>
                      ) : (
                        <span
                          data-testid="student-badge"
                          className="px-2 py-0.5 text-xs font-medium rounded-full bg-surface border border-border text-foreground-muted"
                        >
                          Étudiant
                        </span>
                      )}
                    </div>
                  </div>

                  {/* Publisher Workspace Link (if publisher) */}
                  {isPublisher && (
                    <div className="mb-2">
                      <Link
                        to="/publisher"
                        data-testid="publisher-link"
                        onClick={() => setIsProfileOpen(false)}
                        className="flex items-center gap-2 w-full px-2.5 py-2 text-sm rounded-md text-foreground hover:bg-surface hover:text-primary transition-colors"
                        role="menuitem"
                      >
                        <BookOpen className="h-4 w-4" />
                        <span>Espace Éditeur</span>
                      </Link>
                    </div>
                  )}

                  {/* Logout Button */}
                  <button
                    type="button"
                    data-testid="logout-button"
                    onClick={handleLogout}
                    className="flex items-center gap-2 w-full px-2.5 py-2 text-sm rounded-md text-destructive hover:bg-destructive/10 transition-colors"
                    role="menuitem"
                  >
                    <LogOut className="h-4 w-4" />
                    <span>Se déconnecter</span>
                  </button>
                </div>
              )}
            </div>
          ) : (
            <div className="flex items-center gap-1.5 sm:gap-3">
              <Link
                to="/courses"
                data-testid="header-catalogue-link"
                className="hidden sm:inline-flex text-xs sm:text-sm font-medium text-foreground-muted hover:text-foreground transition-colors px-2 py-1.5 rounded-md focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-border-focus"
              >
                Catalogue
              </Link>
              <Link
                to={`/login?returnUrl=${encodeURIComponent(location.pathname + location.search + location.hash)}`}
                data-testid="header-auth-cta"
                className="hidden inline-flex items-center justify-center text-xs sm:text-sm font-medium rounded-md px-2.5 py-1.5 sm:px-3 sm:py-1.5 bg-primary text-primary-foreground hover:bg-primary/90 transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-border-focus shrink-0 text-center whitespace-nowrap min-h-[36px]"
              >
                Se connecter / S'inscrire
              </Link>
            </div>
          )}
        </div>
      </div>
    </header>
  );
}
