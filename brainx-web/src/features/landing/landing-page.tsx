import React from 'react';
import { Link, Navigate, useLocation, useNavigate } from 'react-router-dom';
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
  Search,
  Code2,
  Terminal,
  UserPlus,
  LogIn,
  LogOut,
  AlertCircle,
  X,
  Layers,
  Sparkles,
  ArrowRight,
  ShieldCheck,
  Cpu,
} from 'lucide-react';
import { useAuthStore } from '@/features/auth/auth-store';
import { BrainXLogo } from '@/components/ui/brainx-logo';

export function LandingPage() {
  const [dialogOpen, setDialogOpen] = React.useState(false);
  const location = useLocation();
  const navigate = useNavigate();
  const notice = (location.state as { notice?: string } | null | undefined)?.notice;
  const [dismissed, setDismissed] = React.useState(false);

  const accessToken = useAuthStore((s) => s.accessToken);
  const isPublisher = useAuthStore((s) => s.isPublisher);
  const logout = useAuthStore((s) => s.logout);

  React.useEffect(() => {
    setDismissed(false);
  }, [location.key]);

  // Authenticated non-publisher students are immediately redirected to courses
  if (accessToken && !isPublisher) {
    return <Navigate to="/courses" replace />;
  }

  const handleDismissNotice = () => {
    setDismissed(true);
    navigate(`${location.pathname}${location.search}${location.hash}`, {
      replace: true,
      state: {},
    });
  };

  const isNoticeValid = typeof notice === 'string' && notice.trim().length > 0;
  const showNotice = Boolean(isNoticeValid && !dismissed);

  return (
    <div
      data-testid="app-root"
      className="min-h-screen bg-background text-foreground font-sans min-w-[360px] w-full overflow-x-hidden selection:bg-primary selection:text-primary-foreground relative"
    >
      {/* Subtle Geometric Background Grid */}
      <div
        className="absolute inset-0 pointer-events-none opacity-20 bg-[linear-gradient(to_right,#30363D_1px,transparent_1px),linear-gradient(to_bottom,#30363D_1px,transparent_1px)] bg-[size:4rem_4rem] [mask-image:radial-gradient(ellipse_60%_50%_at_50%_0%,#000_70%,transparent_100%)]"
        aria-hidden="true"
      />

      {/* Top Futuristic Navbar */}
      <header className="border-b border-border bg-surface/80 backdrop-blur-md sticky top-0 z-30">
        <div className="max-w-page-max mx-auto px-4 sm:px-6 h-14 flex items-center justify-between">
          <div className="flex items-center space-x-3">
            <Link
              to="/"
              className="flex items-center gap-2.5 focus:outline-none focus-visible:ring-2 focus-visible:ring-primary rounded-md"
              aria-label="Accueil BrainX"
            >
              <BrainXLogo size="md" />
              <div className="flex items-center gap-2">
                <span className="font-semibold text-foreground text-base tracking-tight font-sans">
                  BrainX
                </span>
                <span className="px-1.5 py-0.5 text-[10px] font-mono rounded bg-primary/10 border border-primary/30 text-primary uppercase font-bold tracking-wider">
                  v1.0
                </span>
              </div>
            </Link>
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
                  className="min-h-[44px] flex items-center gap-1.5"
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
                  className="min-h-[44px] shadow-sm shadow-primary/20"
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
          </div>
        </div>
      </header>

      {/* Main Content */}
      <main className="max-w-page-max mx-auto px-4 sm:px-6 py-12 space-y-16 relative z-10">
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

        {/* Futuristic Hero Section */}
        <section className="text-center max-w-3xl mx-auto space-y-6 pt-4">
          <div className="inline-flex items-center gap-2 px-3 py-1.5 rounded-full bg-surface border border-border shadow-inner text-xs font-mono text-primary animate-pulse">
            <Cpu className="h-3.5 w-3.5" />
            <span>PLATEFORME PÉDAGOGIQUE CENTRALISÉE</span>
            <span className="text-foreground-muted">|</span>
            <span className="text-foreground-muted">MODE SOMBRE NATIF</span>
          </div>

          <h1 className="text-3xl sm:text-5xl font-extrabold tracking-tight text-foreground leading-tight">
            L'apprentissage et le rattrapage de cours,{' '}
            <span className="text-transparent bg-clip-text bg-gradient-to-r from-primary via-sky-300 to-indigo-400">
              réinventés.
            </span>
          </h1>

          <p className="text-base sm:text-lg text-foreground-muted leading-relaxed max-w-2xl mx-auto">
            Retrouvez en quelques secondes le cours manqué, son plan détaillé et tout le matériel pédagogique associé (documents PDF, vidéos, code source et schémas).
          </p>

          <div className="flex flex-col sm:flex-row items-center justify-center gap-4 pt-4">
            <Button
              asChild
              variant="default"
              size="lg"
              className="w-full sm:w-auto min-h-[48px] px-8 text-base shadow-lg shadow-primary/25 gap-2"
            >
              <Link to="/register">
                <UserPlus className="h-5 w-5" />
                <span>Créer un compte étudiant</span>
                <ArrowRight className="h-4 w-4 ml-1" />
              </Link>
            </Button>
            <Button
              asChild
              variant="outline"
              size="lg"
              className="w-full sm:w-auto min-h-[48px] px-8 text-base gap-2 bg-surface/50 border-border hover:bg-surface"
            >
              <Link to="/login">
                <LogIn className="h-5 w-5" />
                <span>Se connecter</span>
              </Link>
            </Button>
          </div>
        </section>

        {/* Platform Capabilities & Pillars */}
        <section className="space-y-6">
          <div className="text-center space-y-2">
            <h2 className="text-xl sm:text-2xl font-bold tracking-tight text-foreground flex items-center justify-center gap-2">
              <Sparkles className="h-5 w-5 text-primary" />
              <span>Trois Piliers pour Réussir vos Études</span>
            </h2>
            <p className="text-sm text-foreground-muted">
              Une expérience fluide, conçue pour les étudiants développeurs et les équipes enseignantes.
            </p>
          </div>

          <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
            {/* Feature 1: Recherche Instantanée */}
            <Card className="border-border bg-card/60 backdrop-blur-sm hover:border-primary/50 transition-colors">
              <CardHeader>
                <div className="h-10 w-10 rounded-lg bg-primary/10 border border-primary/20 flex items-center justify-center text-primary mb-2">
                  <Search className="h-5 w-5" />
                </div>
                <CardTitle className="text-lg">Recherche Globale Cmd+K</CardTitle>
                <CardDescription>
                  Indexation multi-champs instantanée des leçons, enseignants et mots-clés.
                </CardDescription>
              </CardHeader>
              <CardContent className="text-sm text-foreground-muted">
                Déclenchez la palette à tout instant au clavier pour localiser immédiatement un concept technique ou une séance spécifique.
              </CardContent>
            </Card>

            {/* Feature 2: Arborescence Structurée */}
            <Card className="border-border bg-card/60 backdrop-blur-sm hover:border-primary/50 transition-colors">
              <CardHeader>
                <div className="h-10 w-10 rounded-lg bg-primary/10 border border-primary/20 flex items-center justify-center text-primary mb-2">
                  <Layers className="h-5 w-5" />
                </div>
                <CardTitle className="text-lg">Arborescence Pédagogique</CardTitle>
                <CardDescription>
                  Navigation rigoureuse : Cours &rarr; Modules &rarr; Chapitres &rarr; Leçons.
                </CardDescription>
              </CardHeader>
              <CardContent className="text-sm text-foreground-muted">
                Suivez la progression séquentielle des enseignements avec navigation précédente/suivante et repérage visuel dynamique.
              </CardContent>
            </Card>

            {/* Feature 3: Sécurité & Fiabilité */}
            <Card className="border-border bg-card/60 backdrop-blur-sm hover:border-primary/50 transition-colors">
              <CardHeader>
                <div className="h-10 w-10 rounded-lg bg-primary/10 border border-primary/20 flex items-center justify-center text-primary mb-2">
                  <ShieldCheck className="h-5 w-5" />
                </div>
                <CardTitle className="text-lg">Espace Éditeur Dédié</CardTitle>
                <CardDescription>
                  Outils de publication unitaire ou en masse sous verrou de conteneur.
                </CardDescription>
              </CardHeader>
              <CardContent className="text-sm text-foreground-muted">
                Tableau de bord de gestion, détection des leçons bloquées, restauration depuis la corbeille et analytique des recherches.
              </CardContent>
            </Card>
          </div>
        </section>

        {/* Technical Showcase & Foundation Primitives (Tested Primitives) */}
        <section className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6 pt-4 border-t border-border/60">
          {/* Button Variants Card */}
          <Card data-testid="card-buttons" className="border-border bg-card">
            <CardHeader>
              <CardTitle className="flex items-center gap-2 text-base">
                <Terminal className="h-4 w-4 text-primary" />
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
          <Card data-testid="card-dialog" className="border-border bg-card">
            <CardHeader>
              <CardTitle className="flex items-center gap-2 text-base">
                <BookOpen className="h-4 w-4 text-primary" />
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
          <Card data-testid="card-resources" className="border-border bg-card">
            <CardHeader>
              <CardTitle className="flex items-center gap-2 text-base">
                <FileText className="h-4 w-4 text-primary" />
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
      <footer className="border-t border-border bg-surface py-8 mt-12 relative z-10">
        <div className="max-w-page-max mx-auto px-4 sm:px-6 flex flex-col sm:flex-row items-center justify-between text-xs text-foreground-muted gap-4">
          <div className="flex items-center gap-2">
            <BrainXLogo size="sm" />
            <span>BrainX &copy; 2026 &mdash; Plateforme Pédagogique</span>
          </div>
          <p className="font-mono text-foreground-subtle">
            WCAG 2.1 AAA &bull; Canvas #0D1117 &bull; Inter &amp; JetBrains Mono
          </p>
        </div>
      </footer>
    </div>
  );
}

export default LandingPage;