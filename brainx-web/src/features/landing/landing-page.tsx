import React from 'react';
import { Link, useLocation, useNavigate } from 'react-router-dom';
import { Button } from '@/components/ui/button';
import {
  Card,
  CardHeader,
  CardTitle,
  CardDescription,
  CardContent,
  CardFooter,
} from '@/components/ui/card';
import {
  Dialog,
  DialogTrigger,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogDescription,
  DialogFooter,
  DialogClose,
} from '@/components/ui/dialog';
import {
  BookOpen,
  FileText,
  Image as ImageIcon,
  Video,
  ExternalLink,
  Code2,
  Terminal,
  UserPlus,
  LogIn,
  LogOut,
  AlertCircle,
  X,
} from 'lucide-react';
import { useAuthStore } from '@/features/auth/auth-store';

export function LandingPage() {
  const [dialogOpen, setDialogOpen] = React.useState(false);
  const location = useLocation();
  const navigate = useNavigate();
  const notice = (location.state as { notice?: string } | null | undefined)?.notice;
  const [dismissed, setDismissed] = React.useState(false);

  React.useEffect(() => {
    setDismissed(false);
  }, [location.key]);

  const handleDismissNotice = () => {
    setDismissed(true);
    navigate(`${location.pathname}${location.search}${location.hash}`, {
      replace: true,
      state: {},
    });
  };

  const isNoticeValid = typeof notice === 'string' && notice.trim().length > 0;
  const showNotice = Boolean(isNoticeValid && !dismissed);

  const accessToken = useAuthStore((s) => s.accessToken);
  const isPublisher = useAuthStore((s) => s.isPublisher);
  const logout = useAuthStore((s) => s.logout);

  return (
    <div
      data-testid="app-root"
      className="min-h-screen bg-background text-foreground font-sans min-w-[360px] w-full overflow-x-hidden selection:bg-primary selection:text-primary-foreground"
    >
      {/* Top Navbar */}
      <header className="border-b border-border bg-surface sticky top-0 z-30">
        <div className="max-w-page-max mx-auto px-4 sm:px-6 h-14 flex items-center justify-between">
          <div className="flex items-center space-x-3">
            <div className="h-8 w-8 rounded-md bg-primary text-primary-foreground flex items-center justify-center font-bold text-lg font-mono">
              BX
            </div>
            <div>
              <span className="font-semibold text-foreground text-base tracking-tight">
                BrainX
              </span>
              <span className="ml-2 px-1.5 py-0.5 text-xs font-mono rounded-sm bg-surface border border-border text-foreground-muted">
                v1.0
              </span>
            </div>
          </div>
          <div className="flex items-center space-x-2 sm:space-x-3">
            {Boolean(accessToken && isPublisher) && (
              <Button
                asChild
                variant="outline"
                size="default"
                className="min-h-[44px]"
              >
                <Link
                  to="/publisher/dashboard"
                  data-testid="nav-publisher-link"
                  className="flex items-center gap-1.5"
                >
                  <BookOpen className="h-4 w-4 text-primary" />
                  <span>Espace Éditeur</span>
                </Link>
              </Button>
            )}
            {accessToken ? (
              <>
                <Button
                  asChild
                  variant="ghost"
                  size="default"
                  className="min-h-[44px]"
                >
                  <Link
                    to="/courses"
                    data-testid="nav-courses-link"
                    className="flex items-center gap-1.5"
                  >
                    <BookOpen className="h-4 w-4" />
                    <span>Cours</span>
                  </Link>
                </Button>
                <Button
                  variant="ghost"
                  size="default"
                  onClick={logout}
                  data-testid="nav-logout-btn"
                  className="min-h-[44px]"
                >
                  <LogOut className="h-4 w-4" />
                  <span>Se déconnecter</span>
                </Button>
              </>
            ) : (
              <>
                <Button
                  asChild
                  variant="ghost"
                  size="default"
                  className="min-h-[44px]"
                >
                  <Link
                    to="/login"
                    data-testid="nav-login-link"
                    className="flex items-center gap-1.5"
                  >
                    <LogIn className="h-4 w-4" />
                    <span>Se connecter</span>
                  </Link>
                </Button>
                <Button
                  asChild
                  variant="default"
                  size="default"
                  className="min-h-[44px]"
                >
                  <Link
                    to="/register"
                    data-testid="nav-register-link"
                    className="flex items-center gap-1.5"
                  >
                    <UserPlus className="h-4 w-4" />
                    <span>S'inscrire</span>
                  </Link>
                </Button>
              </>
            )}
            <span className="text-xs font-mono text-foreground-muted hidden sm:inline-block">
              2026-10-29
            </span>
            <span className="text-xs px-2.5 py-1 rounded-full border border-border text-foreground-muted bg-surface font-mono hidden md:inline-block">
              Dark-Only
            </span>
          </div>
        </div>
      </header>

      {/* Main Content */}
      <main className="max-w-page-max mx-auto px-4 sm:px-6 py-8 space-y-8">
        {/* Flash / Publisher Notice Banner */}
        {showNotice && (
          <div
            role="status"
            aria-live="polite"
            data-testid="publisher-notice-banner"
            className="rounded-md border border-info-border bg-info-surface p-4 text-sm text-info flex items-start sm:items-center justify-between gap-3 shadow-sm min-w-0"
          >
            <div className="flex items-start sm:items-center gap-3 min-w-0">
              <AlertCircle className="h-5 w-5 shrink-0 text-info mt-0.5 sm:mt-0" aria-hidden="true" />
              <p className="font-medium text-info break-words">
                {notice}
              </p>
            </div>
            <button
              type="button"
              onClick={handleDismissNotice}
              data-testid="dismiss-notice-button"
              aria-label="Fermer la notification"
              className="shrink-0 rounded p-1.5 text-info hover:text-foreground hover:bg-info-border/30 transition-colors focus:outline-none focus-visible:ring-2 focus-visible:ring-primary min-h-[44px] min-w-[44px] flex items-center justify-center"
            >
              <X className="h-4 w-4" aria-hidden="true" />
            </button>
          </div>
        )}

        {/* Hero Section */}
        <section className="space-y-3">
          <div className="inline-flex items-center space-x-2 px-2.5 py-1 rounded-full bg-info-surface border border-info-border text-info text-xs font-mono">
            <span>● Mode Sombre Exclusif</span>
            <span className="text-foreground-muted">|</span>
            <span>Plancher 360px</span>
          </div>
          <h1 className="text-2xl sm:text-3xl font-bold tracking-tight text-foreground">
            Socle Frontend BrainX
          </h1>
          <p className="text-sm sm:text-base text-foreground-muted max-w-content-max leading-relaxed">
            Plateforme d'apprentissage pour étudiants développeurs. Retrouvez en quelques secondes le cours manqué et son matériel pédagogique.
          </p>
          <div className="pt-2">
            <Button
              asChild
              variant="default"
              size="default"
              className="gap-2 min-h-[44px]"
            >
              <Link to="/register">
                <UserPlus className="h-4 w-4" />
                <span>Créer un compte étudiant</span>
              </Link>
            </Button>
          </div>
        </section>

        {/* UI Primitives Grid */}
        <section className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
          {/* Button Variants Card */}
          <Card data-testid="card-buttons">
            <CardHeader>
              <CardTitle className="flex items-center gap-2">
                <Terminal className="h-5 w-5 text-primary" />
                Primitives Boutons
              </CardTitle>
              <CardDescription>
                Boutons Radix avec variantes sémantiques et cible tactile &ge; 44px
              </CardDescription>
            </CardHeader>
            <CardContent className="space-y-3">
              <div className="flex flex-wrap gap-2">
                <Button variant="default">Primary</Button>
                <Button variant="secondary">Secondary</Button>
                <Button variant="outline">Outline</Button>
                <Button variant="destructive">Destructive</Button>
                <Button variant="ghost">Ghost</Button>
              </div>
            </CardContent>
            <CardFooter className="text-xs text-foreground-muted font-mono">
              focus-ring: #38BDF8
            </CardFooter>
          </Card>

          {/* Modal / Dialog Card */}
          <Card data-testid="card-dialog">
            <CardHeader>
              <CardTitle className="flex items-center gap-2">
                <BookOpen className="h-5 w-5 text-primary" />
                Modale Radix UI
              </CardTitle>
              <CardDescription>
                Dialogue accessible au clavier avec fond ardoise et contraste sombre
              </CardDescription>
            </CardHeader>
            <CardContent>
              <Dialog open={dialogOpen} onOpenChange={setDialogOpen}>
                <DialogTrigger asChild>
                  <Button variant="outline" className="w-full">
                    Ouvrir la Modale
                  </Button>
                </DialogTrigger>
                <DialogContent data-testid="test-dialog-content">
                  <DialogHeader>
                    <DialogTitle>BrainX Architecture Dialog</DialogTitle>
                    <DialogDescription>
                      Cette modale respecte le contrat de style sombre avec surface #161B22 et bordure #30363D.
                    </DialogDescription>
                  </DialogHeader>
                  <div className="py-2 text-sm text-foreground">
                    <p>
                      Conformité accessibilité : navigation Tab/Shift-Tab, touche Escape et focus automatique.
                    </p>
                  </div>
                  <DialogFooter>
                    <DialogClose asChild>
                      <Button variant="secondary">Fermer</Button>
                    </DialogClose>
                    <Button variant="default" onClick={() => setDialogOpen(false)}>
                      Confirmer
                    </Button>
                  </DialogFooter>
                </DialogContent>
              </Dialog>
            </CardContent>
            <CardFooter className="text-xs text-foreground-muted font-mono">
              surface: #161B22 | border: #30363D
            </CardFooter>
          </Card>

          {/* Resource Discriminators Card */}
          <Card data-testid="card-resources">
            <CardHeader>
              <CardTitle className="flex items-center gap-2">
                <FileText className="h-5 w-5 text-primary" />
                Types de Ressources (CAP-2)
              </CardTitle>
              <CardDescription>
                Les 4 types immuables de ressources pédagogiques
              </CardDescription>
            </CardHeader>
            <CardContent>
              <div className="grid grid-cols-2 gap-2">
                <div
                  data-testid="badge-document"
                  className="flex items-center gap-1.5 px-2.5 py-1.5 rounded-sm bg-resource-document-surface border border-resource-document-border text-resource-document text-xs font-mono font-medium"
                >
                  <FileText className="h-3.5 w-3.5" />
                  <span>document</span>
                </div>
                <div
                  data-testid="badge-image"
                  className="flex items-center gap-1.5 px-2.5 py-1.5 rounded-sm bg-resource-image-surface border border-resource-image-border text-resource-image text-xs font-mono font-medium"
                >
                  <ImageIcon className="h-3.5 w-3.5" />
                  <span>image</span>
                </div>
                <div
                  data-testid="badge-video"
                  className="flex items-center gap-1.5 px-2.5 py-1.5 rounded-sm bg-resource-video-surface border border-resource-video-border text-resource-video text-xs font-mono font-medium"
                >
                  <Video className="h-3.5 w-3.5" />
                  <span>video</span>
                </div>
                <div
                  data-testid="badge-link"
                  className="flex items-center gap-1.5 px-2.5 py-1.5 rounded-sm bg-resource-link-surface border border-resource-link-border text-resource-link text-xs font-mono font-medium"
                >
                  <ExternalLink className="h-3.5 w-3.5" />
                  <span>external_link</span>
                </div>
              </div>
            </CardContent>
            <CardFooter className="text-xs text-foreground-muted font-mono">
              Vocabulaire verbatim PRD
            </CardFooter>
          </Card>
        </section>

        {/* Code Block & 360px Isolation Showcase */}
        <section className="space-y-4">
          <div className="flex items-center justify-between">
            <h2 className="text-lg font-semibold text-foreground flex items-center gap-2">
              <Code2 className="h-5 w-5 text-primary" />
              Isolation Technique &amp; Scroll Horizontal
            </h2>
            <span className="text-xs font-mono text-foreground-muted">
              overflow-x: auto isolé
            </span>
          </div>

          <div
            data-testid="code-block-container"
            className="rounded-lg border border-code-border bg-code-bg overflow-hidden shadow-sm"
          >
            <div className="h-9 px-4 bg-code-header-bg border-b border-code-border flex items-center justify-between">
              <span className="text-xs font-mono text-foreground-muted font-semibold tracking-wider">
                TYPESCRIPT
              </span>
              <span className="text-xs font-mono text-foreground-subtle">
                src/lib/utils.ts
              </span>
            </div>
            <div
              data-testid="code-block-scroll"
              className="p-4 overflow-x-auto text-xs font-mono leading-relaxed"
            >
              <pre className="text-code-text">
                <code>
                  <span className="text-code-keyword">import</span> &#123; clsx, <span className="text-code-keyword">type</span> ClassValue &#125; <span className="text-code-keyword">from</span> <span className="text-code-string">'clsx'</span>;{'\n'}
                  <span className="text-code-keyword">import</span> &#123; twMerge &#125; <span className="text-code-keyword">from</span> <span className="text-code-string">'tailwind-merge'</span>;{'\n\n'}
                  <span className="text-code-comment">&#47;&#47; Helper combinant clsx et tailwind-merge pour la gestion des classes sémantiques</span>{'\n'}
                  <span className="text-code-keyword">export function</span> <span className="text-code-function">cn</span>(...inputs: ClassValue[]): <span className="text-code-keyword">string</span> &#123;{'\n'}
                  {'  '}<span className="text-code-keyword">return</span> <span className="text-code-function">twMerge</span>(<span className="text-code-function">clsx</span>(inputs));{'\n'}
                  &#125;
                </code>
              </pre>
            </div>
          </div>
        </section>
      </main>

      {/* Footer */}
      <footer className="border-t border-border bg-surface py-6 mt-12">
        <div className="max-w-page-max mx-auto px-4 sm:px-6 flex flex-col sm:flex-row items-center justify-between text-xs text-foreground-muted space-y-2 sm:space-y-0">
          <p>BrainX &copy; 2026 &mdash; Socle UI Mode Sombre</p>
          <p className="font-mono">
            WCAG 2.1 AAA &bull; Canvas #0D1117 &bull; Inter &amp; JetBrains Mono
          </p>
        </div>
      </footer>
    </div>
  );
}

export default LandingPage;
