import React from 'react';
import { Link, Navigate, useLocation, useNavigate } from 'react-router-dom';
import { Button } from '@/components/ui/button';
import {
  Card,
  CardHeader,
  CardTitle,
  CardDescription,
  CardContent,
} from '@/components/ui/card';
import {
  BookOpen,
  Search,
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
  Users,
  MessageSquare,
  Newspaper,
  Award,
  MailCheck,
  CheckCircle2,
  Zap,
} from 'lucide-react';
import { useAuthStore } from '@/features/auth/auth-store';
import { BrainXLogo } from '@/components/ui/brainx-logo';

export function LandingPage() {
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
                <span
                  data-testid="version-badge"
                  className="px-1.5 py-0.5 text-[10px] font-mono rounded bg-primary/10 border border-primary/30 text-primary uppercase font-bold tracking-wider"
                >
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
      <main className="max-w-page-max mx-auto px-4 sm:px-6 py-12 space-y-20 relative z-10">
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
          <div className="inline-flex items-center gap-2 px-3.5 py-1.5 rounded-full bg-surface border border-border shadow-inner text-xs font-mono text-primary">
            <Cpu className="h-3.5 w-3.5 text-primary animate-pulse" />
            <span>PLATEFORME PÉDAGOGIQUE CENTRALISÉE</span>
            <span className="text-foreground-muted">|</span>
            <span className="text-foreground-muted">MODE SOMBRE NATIF</span>
          </div>

          <h1 className="text-3xl sm:text-5xl lg:text-6xl font-extrabold tracking-tight text-foreground leading-tight">
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
              <Link to="/courses" data-testid="hero-explore-courses-btn">
                <BookOpen className="h-5 w-5" />
                <span>Explorer les cours</span>
                <ArrowRight className="h-4 w-4 ml-1" />
              </Link>
            </Button>
            <Button
              asChild
              variant="outline"
              size="lg"
              className="w-full sm:w-auto min-h-[48px] px-8 text-base gap-2 bg-surface/50 border-border hover:bg-surface"
            >
              <Link to="/login" data-testid="hero-login-btn">
                <LogIn className="h-5 w-5" />
                <span>Se connecter</span>
              </Link>
            </Button>
          </div>
        </section>

        {/* Section Vitrine RAG Teaser (Story 2.2) */}
        <section
          data-testid="rag-teaser-section"
          className="rounded-2xl border border-primary/30 bg-card/60 backdrop-blur-md p-6 sm:p-10 relative overflow-hidden space-y-6 shadow-xl shadow-primary/5"
        >
          <div className="absolute top-0 right-0 p-8 opacity-10 pointer-events-none">
            <Sparkles className="w-64 h-64 text-primary" />
          </div>

          <div className="space-y-2">
            <div className="inline-flex items-center gap-2 px-3 py-1 rounded-full bg-primary/10 border border-primary/30 text-xs font-mono text-primary font-bold uppercase tracking-wider">
              <Sparkles className="h-3.5 w-3.5 animate-spin" />
              <span>RAG &bull; Retrieval-Augmented Generation</span>
              <span className="bg-primary/20 text-primary px-1.5 py-0.5 rounded text-[10px]">BIENTÔT DISPONIBLE</span>
            </div>
            <h2 className="text-2xl sm:text-3xl font-bold tracking-tight text-foreground">
              Assistant IA Contextuel Intégré aux Cours
            </h2>
            <p className="text-sm sm:text-base text-foreground-muted max-w-2xl">
              Bientôt sur BrainX : posez n'importe quelle question en langage naturel et obtenez des réponses précises extraites directement de vos supports de cours, polycopiés et schémas, avec renvoi direct vers la leçon concernée.
            </p>
          </div>

          {/* Simulated Interactive Chat Preview */}
          <div className="rounded-xl border border-border bg-surface/90 p-4 sm:p-6 space-y-4 max-w-2xl font-sans text-sm shadow-inner">
            {/* Student query bubble */}
            <div className="flex items-start gap-3 justify-end">
              <div className="bg-primary/15 border border-primary/30 rounded-2xl rounded-tr-sm px-4 py-2.5 text-foreground max-w-md">
                <p className="text-xs font-mono text-primary font-semibold mb-1">Étudiant</p>
                <p className="text-sm">« Comment fonctionne le principe de partitionnement horizontal dans une base de données distribuée ? »</p>
              </div>
              <div className="h-8 w-8 rounded-full bg-surface border border-border flex items-center justify-center shrink-0 text-foreground-muted">
                <Users className="h-4 w-4" />
              </div>
            </div>

            {/* AI Assistant response bubble */}
            <div className="flex items-start gap-3">
              <div className="h-8 w-8 rounded-full bg-primary/20 border border-primary/40 flex items-center justify-center shrink-0 text-primary">
                <Cpu className="h-4 w-4" />
              </div>
              <div className="bg-card border border-border rounded-2xl rounded-tl-sm px-4 py-3 text-foreground space-y-2.5 max-w-lg shadow-sm">
                <div className="flex items-center justify-between gap-2">
                  <span className="text-xs font-mono text-primary font-semibold flex items-center gap-1.5">
                    <Sparkles className="h-3 w-3" />
                    BrainX AI (RAG Engine)
                  </span>
                  <span className="text-[10px] font-mono text-foreground-subtle bg-surface px-2 py-0.5 rounded border border-border">
                    100% Sourcé
                  </span>
                </div>
                <p className="text-sm text-foreground-muted leading-relaxed">
                  Le partitionnement horizontal (ou <em>sharding</em>) divise une table en plusieurs sous-ensembles de lignes distribués sur des nœuds distincts en utilisant une clé de partitionnement (<em>shard key</em>).
                </p>
                <div className="pt-1 border-t border-border/60 flex items-center gap-2 text-xs text-primary font-medium">
                  <BookOpen className="h-3.5 w-3.5" />
                  <span>Source : Systèmes Distribués &bull; Module 2 &bull; Chapitre 4 (Leçon 2)</span>
                </div>
              </div>
            </div>
          </div>
        </section>

        {/* Section 1 : Platform Pillars (Déjà Disponibles) */}
        <section className="space-y-6" data-testid="section-current-features">
          <div className="text-center space-y-2">
            <div className="inline-flex items-center gap-1.5 text-xs font-mono text-primary uppercase tracking-wider font-semibold">
              <Sparkles className="h-3.5 w-3.5" />
              <span>Socle Opérationnel</span>
            </div>
            <h2 className="text-2xl sm:text-3xl font-bold tracking-tight text-foreground">
              Trois Piliers pour Réussir vos Études
            </h2>
            <p className="text-sm text-foreground-muted max-w-xl mx-auto">
              Une infrastructure robuste et fluide, pensée pour les étudiants développeurs et les équipes enseignantes.
            </p>
          </div>

          <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
            {/* Feature 1: Recherche Instantanée */}
            <Card className="border-border bg-card/60 backdrop-blur-sm hover:border-primary/50 transition-all hover:-translate-y-0.5">
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
            <Card className="border-border bg-card/60 backdrop-blur-sm hover:border-primary/50 transition-all hover:-translate-y-0.5">
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
            <Card className="border-border bg-card/60 backdrop-blur-sm hover:border-primary/50 transition-all hover:-translate-y-0.5">
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

        {/* Section 2 : Upcoming Features (Fonctionnalités à Venir / Roadmap) */}
        <section className="space-y-8 pt-4 border-t border-border/60" data-testid="section-upcoming-features">
          <div className="text-center space-y-2">
            <div className="inline-flex items-center gap-1.5 px-3 py-1 rounded-full bg-primary/10 border border-primary/30 text-xs font-mono text-primary font-bold uppercase tracking-wider">
              <Zap className="h-3.5 w-3.5" />
              <span>Prochaines Frontières &bull; Roadmap BrainX</span>
            </div>
            <h2 className="text-2xl sm:text-3xl font-bold tracking-tight text-foreground">
              Fonctionnalités à Venir
            </h2>
            <p className="text-sm text-foreground-muted max-w-2xl mx-auto">
              L'écosystème s'agrandit pour offrir une expérience académique collaborative, engageante et automatisée.
            </p>
          </div>

          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
            {/* Upcoming 1: Multi-classes & Promotions */}
            <Card
              data-testid="card-feature-multiclass"
              className="border-border bg-card/40 hover:bg-card/70 backdrop-blur-sm hover:border-primary/40 transition-all relative group"
            >
              <CardHeader>
                <div className="flex items-center justify-between mb-2">
                  <div className="h-10 w-10 rounded-lg bg-sky-500/10 border border-sky-500/20 flex items-center justify-center text-sky-400 group-hover:scale-105 transition-transform">
                    <Users className="h-5 w-5" />
                  </div>
                  <span className="px-2 py-0.5 text-[10px] font-mono rounded bg-sky-500/10 border border-sky-500/30 text-sky-300 font-bold uppercase tracking-wider">
                    MULTI-CLASSE
                  </span>
                </div>
                <CardTitle className="text-lg">Gestion Multi-Classes &amp; Promos</CardTitle>
                <CardDescription>
                  Cloisonnement étanche par promotions, filières et groupes de travaux dirigés.
                </CardDescription>
              </CardHeader>
              <CardContent className="text-sm text-foreground-muted leading-relaxed">
                Assignez les cours et ressources de manière ciblée selon la classe (L1, L2, L3, Masters) avec des plannings et des droits adaptés à chaque cohorte.
              </CardContent>
            </Card>

            {/* Upcoming 2: Interactions sur les Leçons */}
            <Card
              data-testid="card-feature-interactions"
              className="border-border bg-card/40 hover:bg-card/70 backdrop-blur-sm hover:border-primary/40 transition-all relative group"
            >
              <CardHeader>
                <div className="flex items-center justify-between mb-2">
                  <div className="h-10 w-10 rounded-lg bg-indigo-500/10 border border-indigo-500/20 flex items-center justify-center text-indigo-400 group-hover:scale-105 transition-transform">
                    <MessageSquare className="h-5 w-5" />
                  </div>
                  <span className="px-2 py-0.5 text-[10px] font-mono rounded bg-indigo-500/10 border border-indigo-500/30 text-indigo-300 font-bold uppercase tracking-wider">
                    COMMUNAUTÉ
                  </span>
                </div>
                <CardTitle className="text-lg">Interactions &amp; Entraide en Direct</CardTitle>
                <CardDescription>
                  Fils de discussion, questions/réponses contextuelles et annotations sous les leçons.
                </CardDescription>
              </CardHeader>
              <CardContent className="text-sm text-foreground-muted leading-relaxed">
                Posez vos questions directement sous le point du cours concerné. Les étudiants s'entraident et les enseignants certifient les meilleures réponses.
              </CardContent>
            </Card>

            {/* Upcoming 3: Blogs & Veille Pédagogique */}
            <Card
              data-testid="card-feature-blogs"
              className="border-border bg-card/40 hover:bg-card/70 backdrop-blur-sm hover:border-primary/40 transition-all relative group"
            >
              <CardHeader>
                <div className="flex items-center justify-between mb-2">
                  <div className="h-10 w-10 rounded-lg bg-emerald-500/10 border border-emerald-500/20 flex items-center justify-center text-emerald-400 group-hover:scale-105 transition-transform">
                    <Newspaper className="h-5 w-5" />
                  </div>
                  <span className="px-2 py-0.5 text-[10px] font-mono rounded bg-emerald-500/10 border border-emerald-500/30 text-emerald-300 font-bold uppercase tracking-wider">
                    BLOGS
                  </span>
                </div>
                <CardTitle className="text-lg">Blogs &amp; Publications Pédagogiques</CardTitle>
                <CardDescription>
                  Articles de veille, retours d'expérience et tutoriels de l'équipe enseignante.
                </CardDescription>
              </CardHeader>
              <CardContent className="text-sm text-foreground-muted leading-relaxed">
                Un espace dédié pour approfondir les concepts : condensés technologiques, astuces d'ingénierie et bonnes pratiques partagées par vos intervenants.
              </CardContent>
            </Card>

            {/* Upcoming 4: Formations Spécialisées & Certifications */}
            <Card
              data-testid="card-feature-formations"
              className="border-border bg-card/40 hover:bg-card/70 backdrop-blur-sm hover:border-primary/40 transition-all relative group"
            >
              <CardHeader>
                <div className="flex items-center justify-between mb-2">
                  <div className="h-10 w-10 rounded-lg bg-amber-500/10 border border-amber-500/20 flex items-center justify-center text-amber-400 group-hover:scale-105 transition-transform">
                    <Award className="h-5 w-5" />
                  </div>
                  <span className="px-2 py-0.5 text-[10px] font-mono rounded bg-amber-500/10 border border-amber-500/30 text-amber-300 font-bold uppercase tracking-wider">
                    FORMATIONS
                  </span>
                </div>
                <CardTitle className="text-lg">Formations &amp; Parcours Certifiants</CardTitle>
                <CardDescription>
                  Cursus complets guidés par compétences avec validation et attestation.
                </CardDescription>
              </CardHeader>
              <CardContent className="text-sm text-foreground-muted leading-relaxed">
                Suivez des parcours thématiques structurés (Symfony avancé, Architecture Django REST, DevOps Docker) et validez vos acquis avec des badges certifiés.
              </CardContent>
            </Card>

            {/* Upcoming 5: Réception d'Emails Automatiques */}
            <Card
              data-testid="card-feature-emails"
              className="border-border bg-card/40 hover:bg-card/70 backdrop-blur-sm hover:border-primary/40 transition-all relative group"
            >
              <CardHeader>
                <div className="flex items-center justify-between mb-2">
                  <div className="h-10 w-10 rounded-lg bg-purple-500/10 border border-purple-500/20 flex items-center justify-center text-purple-400 group-hover:scale-105 transition-transform">
                    <MailCheck className="h-5 w-5" />
                  </div>
                  <span className="px-2 py-0.5 text-[10px] font-mono rounded bg-purple-500/10 border border-purple-500/30 text-purple-300 font-bold uppercase tracking-wider">
                    AUTOMATISATION
                  </span>
                </div>
                <CardTitle className="text-lg">Emails &amp; Notifications Automatiques</CardTitle>
                <CardDescription>
                  Alertes instantanées dès qu'une leçon ou une ressource est publiée.
                </CardDescription>
              </CardHeader>
              <CardContent className="text-sm text-foreground-muted leading-relaxed">
                Recevez un récapitulatif par email dès qu'un cours est mis à jour par votre enseignant. Ne manquez plus aucun support de révision ni date importante.
              </CardContent>
            </Card>

            {/* Upcoming 6: Évaluations & Exercices Pratiques */}
            <Card
              data-testid="card-feature-evaluations"
              className="border-border bg-card/40 hover:bg-card/70 backdrop-blur-sm hover:border-primary/40 transition-all relative group"
            >
              <CardHeader>
                <div className="flex items-center justify-between mb-2">
                  <div className="h-10 w-10 rounded-lg bg-rose-500/10 border border-rose-500/20 flex items-center justify-center text-rose-400 group-hover:scale-105 transition-transform">
                    <CheckCircle2 className="h-5 w-5" />
                  </div>
                  <span className="px-2 py-0.5 text-[10px] font-mono rounded bg-rose-500/10 border border-rose-500/30 text-rose-300 font-bold uppercase tracking-wider">
                    PRATIQUE
                  </span>
                </div>
                <CardTitle className="text-lg">Quiz &amp; Évaluations Continues</CardTitle>
                <CardDescription>
                  Auto-évaluations interactives et exercices pratiques à la fin des leçons.
                </CardDescription>
              </CardHeader>
              <CardContent className="text-sm text-foreground-muted leading-relaxed">
                Mesurez votre compréhension instantanément grâce à des questionnaires ciblés et des exercices avec rétroaction immédiate.
              </CardContent>
            </Card>
          </div>
        </section>

        {/* Section 3 : Bottom Call-To-Action */}
        <section className="text-center rounded-2xl border border-primary/30 bg-gradient-to-b from-primary/10 via-surface/80 to-surface p-8 sm:p-12 space-y-6 relative overflow-hidden">
          <div className="max-w-xl mx-auto space-y-3 relative z-10">
            <h2 className="text-2xl sm:text-3xl font-extrabold text-foreground tracking-tight">
              Prêt à accélérer vos apprentissages ?
            </h2>
            <p className="text-sm sm:text-base text-foreground-muted">
              Rejoignez BrainX dès aujourd'hui et accédez à l'ensemble des cours et ressources pédagogiques.
            </p>
            <div className="pt-2 flex flex-col sm:flex-row items-center justify-center gap-3">
              <Button asChild variant="default" size="lg" className="min-h-[48px] px-8 text-base shadow-lg shadow-primary/20">
                <Link to="/register">
                  <span>Créer mon compte</span>
                  <ArrowRight className="h-4 w-4 ml-1" />
                </Link>
              </Button>
              <Button asChild variant="outline" size="lg" className="min-h-[48px] px-8 text-base bg-surface">
                <Link to="/login">
                  <span>Se connecter</span>
                </Link>
              </Button>
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
