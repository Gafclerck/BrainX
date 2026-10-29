import { Link } from 'react-router-dom';
import {
  Card,
  CardHeader,
  CardTitle,
  CardDescription,
  CardContent,
  CardFooter,
} from '@/components/ui/card';
import { RegisterForm } from './register-form';

export function RegisterPage() {
  return (
    <div
      data-testid="register-page-root"
      className="min-h-screen bg-background text-foreground font-sans min-w-[360px] w-full overflow-x-hidden flex flex-col justify-between selection:bg-primary selection:text-primary-foreground"
    >
      {/* Top Minimal Header */}
      <header className="border-b border-border bg-surface">
        <div className="max-w-page-max mx-auto px-4 sm:px-6 h-14 flex items-center justify-between">
          <Link
            to="/"
            className="flex items-center space-x-3 group focus:outline-none focus-visible:ring-2 focus-visible:ring-primary rounded"
            aria-label="Retour à l'accueil BrainX"
          >
            <div className="h-8 w-8 rounded-md bg-primary text-primary-foreground flex items-center justify-center font-bold text-lg font-mono">
              BX
            </div>
            <div className="flex items-center">
              <span className="font-semibold text-foreground text-base tracking-tight group-hover:text-primary transition-colors">
                BrainX
              </span>
              <span className="ml-2 px-1.5 py-0.5 text-xs font-mono rounded-sm bg-surface border border-border text-foreground-muted">
                v1.0
              </span>
            </div>
          </Link>
          <div className="flex items-center space-x-2">
            <span className="text-xs px-2.5 py-1 rounded-full border border-border text-foreground-muted bg-surface font-mono">
              Dark-Only
            </span>
          </div>
        </div>
      </header>

      {/* Main Registration Card Centerpiece */}
      <main className="flex-1 flex items-center justify-center px-4 py-8 sm:py-12">
        <div className="w-full max-w-md mx-auto">
          <Card data-testid="register-card" className="border-border bg-card shadow-lg">
            <CardHeader className="space-y-1.5 pb-4">
              <CardTitle className="text-xl sm:text-2xl font-bold tracking-tight text-foreground">
                Inscription Étudiante
              </CardTitle>
              <CardDescription className="text-sm text-foreground-muted">
                Créez votre compte pour accéder aux cours, leçons et ressources pédagogiques.
              </CardDescription>
            </CardHeader>
            <CardContent className="pt-2">
              <RegisterForm />
            </CardContent>
            <CardFooter className="flex flex-col sm:flex-row items-center justify-center text-xs text-foreground-muted border-t border-border pt-4 mt-2">
              <span>Vous possédez déjà un compte ?</span>
              <Link
                to="/login"
                className="ml-1 text-primary hover:text-primary-hover font-medium underline-offset-4 hover:underline focus:outline-none focus-visible:ring-2 focus-visible:ring-primary rounded px-1 min-h-[44px] flex items-center"
              >
                Se connecter
              </Link>
            </CardFooter>
          </Card>
        </div>
      </main>

      {/* Footer */}
      <footer className="border-t border-border bg-surface py-4">
        <div className="max-w-page-max mx-auto px-4 sm:px-6 flex flex-col sm:flex-row items-center justify-between text-xs text-foreground-muted space-y-1 sm:space-y-0">
          <p>BrainX &copy; 2026 &mdash; Plateforme d'apprentissage technique</p>
          <p className="font-mono">Plancher 360px &bull; RFC 9457 &bull; Inter &amp; JetBrains Mono</p>
        </div>
      </footer>
    </div>
  );
}

export default RegisterPage;
