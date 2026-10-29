import React from 'react';
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
} from 'lucide-react';

export function App() {
  const [dialogOpen, setDialogOpen] = React.useState(false);

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
          <div className="flex items-center space-x-2">
            <span className="text-xs font-mono text-foreground-muted hidden sm:inline-block">
              2026-10-29
            </span>
            <span className="text-xs px-2.5 py-1 rounded-full border border-border text-foreground-muted bg-surface font-mono">
              Dark-Only
            </span>
          </div>
        </div>
      </header>

      {/* Main Content */}
      <main className="max-w-page-max mx-auto px-4 sm:px-6 py-8 space-y-8">
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

export default App;
