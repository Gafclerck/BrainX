import * as React from 'react';
import { Link, useNavigate } from 'react-router-dom';
import {
  Loader2,
  CheckCircle2,
  AlertTriangle,
  XCircle,
  WifiOff,
} from 'lucide-react';
import {
  Card,
  CardHeader,
  CardTitle,
  CardDescription,
  CardContent,
  CardFooter,
} from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { ThrottledBanner } from '@/components/ui/throttled-banner';
import { apiClient, ApiError } from '@/lib/api';
import { useAuthStore } from './auth-store';

export type VerifyStatus =
  | 'idle'
  | 'loading'
  | 'success'
  | 'missing'
  | 'error'
  | 'throttled'
  | 'network_error';

export function VerifyEmailPage() {
  const navigate = useNavigate();
  const setTokens = useAuthStore((state) => state.setTokens);

  const [status, setStatus] = React.useState<VerifyStatus>('idle');
  const [errorMessage, setErrorMessage] = React.useState<string | null>(null);
  const [throttledSeconds, setThrottledSeconds] = React.useState<number | null>(null);
  const [throttledDetail, setThrottledDetail] = React.useState<string | undefined>();

  const tokenRef = React.useRef<string | null>(null);
  const initializedRef = React.useRef(false);

  const verifyToken = React.useCallback(
    async (tokenToVerify: string) => {
      setStatus('loading');
      setErrorMessage(null);
      setThrottledSeconds(null);

      try {
        const data = await apiClient<{ access: string; refresh: string }>(
          '/api/v1/verify-email/',
          {
            method: 'POST',
            data: { token: tokenToVerify },
          }
        );

        if (
          !data ||
          typeof data.access !== 'string' ||
          !data.access.trim() ||
          typeof data.refresh !== 'string' ||
          !data.refresh.trim()
        ) {
          setStatus('error');
          setErrorMessage('Les identifiants reçus sont invalides ou incomplets.');
          return;
        }

        setTokens({ access: data.access, refresh: data.refresh });
        setStatus('success');
        navigate('/courses', { replace: true });
      } catch (err) {
        if (err instanceof ApiError) {
          if (
            err.envelope.status === 429 ||
            err.envelope.status === 503 ||
            (err.retryAfter !== undefined && err.retryAfter >= 0)
          ) {
            setStatus('throttled');
            setThrottledSeconds(err.retryAfter ?? 30);
            setThrottledDetail(err.envelope.detail);
            return;
          }

          if (err.envelope.status >= 500) {
            setStatus('network_error');
            setErrorMessage(
              err.envelope.detail ||
                'Une erreur serveur est survenue lors de la vérification. Veuillez réessayer.'
            );
            return;
          }

          setStatus('error');
          const tokenErrors = err.envelope.errors?.token;
          if (tokenErrors) {
            if (Array.isArray(tokenErrors) && tokenErrors.length > 0) {
              setErrorMessage(String(tokenErrors[0]));
            } else if (typeof tokenErrors === 'string') {
              setErrorMessage(tokenErrors);
            }
          } else if (err.envelope.detail) {
            setErrorMessage(err.envelope.detail);
          } else if (err.envelope.title) {
            setErrorMessage(err.envelope.title);
          } else {
            setErrorMessage('Le lien de vérification est invalide ou a expiré.');
          }
        } else {
          setStatus('network_error');
          setErrorMessage(
            'Une erreur réseau est survenue lors de la vérification. Veuillez vérifier votre connexion et réessayer.'
          );
        }
      }
    },
    [navigate, setTokens]
  );

  React.useLayoutEffect(() => {
    if (initializedRef.current) return;
    initializedRef.current = true;

    // Strict hash extraction: extract strictly from window.location.hash
    let token: string | null = null;
    if (typeof window !== 'undefined' && window.location.hash) {
      const hash = window.location.hash.replace(/^#/, '');
      const params = new URLSearchParams(hash);
      token = params.get('token');

      // Purge hash and query string immediately to prevent Referer leakage
      window.history.replaceState(null, '', window.location.pathname);
    }

    if (token && token.trim() !== '') {
      tokenRef.current = token;
      verifyToken(token);
    } else {
      setStatus('missing');
    }
  }, [verifyToken]);

  const handleRetry = () => {
    if (tokenRef.current) {
      verifyToken(tokenRef.current);
    }
  };

  return (
    <div
      data-testid="verify-email-page-root"
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

      {/* Main Verification Card */}
      <main className="flex-1 flex items-center justify-center px-4 py-8 sm:py-12">
        <div className="w-full max-w-md mx-auto">
          <Card data-testid="verify-card" className="border-border bg-card shadow-lg">
            {status === 'loading' && (
              <>
                <CardHeader className="text-center space-y-1.5 pb-4">
                  <CardTitle className="text-xl sm:text-2xl font-bold tracking-tight text-foreground">
                    Activation du compte
                  </CardTitle>
                  <CardDescription className="text-sm text-foreground-muted">
                    Validation de votre jeton d'authentification...
                  </CardDescription>
                </CardHeader>
                <CardContent
                  role="status"
                  aria-live="polite"
                  data-testid="verify-loading"
                  className="flex flex-col items-center justify-center py-6 space-y-4"
                >
                  <Loader2 className="h-10 w-10 animate-spin text-primary" />
                  <p className="text-sm text-foreground-muted">
                    Veuillez patienter pendant la finalisation de votre inscription.
                  </p>
                </CardContent>
              </>
            )}

            {status === 'success' && (
              <>
                <CardHeader className="text-center space-y-1.5 pb-4">
                  <CardTitle className="text-xl sm:text-2xl font-bold tracking-tight text-foreground">
                    Compte activé !
                  </CardTitle>
                  <CardDescription className="text-sm text-foreground-muted">
                    Votre adresse email a été confirmée avec succès.
                  </CardDescription>
                </CardHeader>
                <CardContent
                  data-testid="verify-success"
                  className="flex flex-col items-center justify-center py-6 space-y-4"
                >
                  <CheckCircle2 className="h-12 w-12 text-primary" />
                  <p className="text-sm text-foreground text-center">
                    Redirection vers votre espace de cours...
                  </p>
                </CardContent>
              </>
            )}

            {status === 'missing' && (
              <>
                <CardHeader className="space-y-1.5 pb-4">
                  <CardTitle className="text-xl sm:text-2xl font-bold tracking-tight text-foreground">
                    Jeton introuvable
                  </CardTitle>
                  <CardDescription className="text-sm text-foreground-muted">
                    Aucun jeton d'activation n'a été détecté dans l'URL.
                  </CardDescription>
                </CardHeader>
                <CardContent className="space-y-4 pt-2">
                  <div
                    data-testid="verify-missing-token"
                    role="alert"
                    className="flex items-start gap-3 rounded-md border border-warning-border bg-warning-surface p-4 text-sm text-warning"
                  >
                    <AlertTriangle className="h-5 w-5 shrink-0 mt-0.5 text-warning" />
                    <p>
                      Le lien d'activation utilisé ne contient pas de jeton valide.
                      Veuillez cliquer à nouveau sur le lien reçu par email ou créer un compte.
                    </p>
                  </div>
                </CardContent>
                <CardFooter className="flex flex-col sm:flex-row gap-3 pt-2">
                  <Button asChild variant="default" className="w-full sm:flex-1 min-h-[44px]">
                    <Link to="/register">S'inscrire</Link>
                  </Button>
                  <Button asChild variant="secondary" className="w-full sm:flex-1 min-h-[44px]">
                    <Link to="/login">Se connecter</Link>
                  </Button>
                </CardFooter>
              </>
            )}

            {status === 'error' && (
              <>
                <CardHeader className="space-y-1.5 pb-4">
                  <CardTitle className="text-xl sm:text-2xl font-bold tracking-tight text-foreground">
                    Échec de l'activation
                  </CardTitle>
                  <CardDescription className="text-sm text-foreground-muted">
                    Le jeton de confirmation n'a pas pu être validé.
                  </CardDescription>
                </CardHeader>
                <CardContent className="space-y-4 pt-2">
                  <div
                    data-testid="verify-error-card"
                    role="alert"
                    className="flex items-start gap-3 rounded-md border border-destructive/50 bg-destructive/10 p-4 text-sm text-destructive"
                  >
                    <XCircle className="h-5 w-5 shrink-0 mt-0.5 text-destructive" />
                    <p>{errorMessage || 'Le lien de vérification est invalide ou a expiré.'}</p>
                  </div>
                </CardContent>
                <CardFooter className="flex flex-col sm:flex-row gap-3 pt-2">
                  <Button asChild variant="default" className="w-full sm:flex-1 min-h-[44px]">
                    <Link to="/register">Demander un nouveau lien</Link>
                  </Button>
                  <Button asChild variant="secondary" className="w-full sm:flex-1 min-h-[44px]">
                    <Link to="/">Retour à l'accueil</Link>
                  </Button>
                </CardFooter>
              </>
            )}

            {status === 'throttled' && (
              <>
                <CardHeader className="space-y-1.5 pb-4">
                  <CardTitle className="text-xl sm:text-2xl font-bold tracking-tight text-foreground">
                    Trop de requêtes
                  </CardTitle>
                  <CardDescription className="text-sm text-foreground-muted">
                    Veuillez patienter avant de renouveler la tentative.
                  </CardDescription>
                </CardHeader>
                <CardContent className="space-y-4 pt-2">
                  {throttledSeconds !== null && (
                    <ThrottledBanner
                      seconds={throttledSeconds}
                      detail={throttledDetail}
                      onExpire={() => setThrottledSeconds(null)}
                    />
                  )}
                </CardContent>
                <CardFooter className="flex flex-col sm:flex-row gap-3 pt-2">
                  <Button
                    variant="default"
                    onClick={handleRetry}
                    disabled={throttledSeconds !== null}
                    data-testid="retry-button"
                    className="w-full sm:flex-1 min-h-[44px]"
                  >
                    Réessayer
                  </Button>
                  <Button asChild variant="secondary" className="w-full sm:flex-1 min-h-[44px]">
                    <Link to="/">Retour à l'accueil</Link>
                  </Button>
                </CardFooter>
              </>
            )}

            {status === 'network_error' && (
              <>
                <CardHeader className="space-y-1.5 pb-4">
                  <CardTitle className="text-xl sm:text-2xl font-bold tracking-tight text-foreground">
                    Erreur de connexion
                  </CardTitle>
                  <CardDescription className="text-sm text-foreground-muted">
                    Impossible de communiquer avec le serveur.
                  </CardDescription>
                </CardHeader>
                <CardContent className="space-y-4 pt-2">
                  <div
                    data-testid="verify-network-error"
                    role="alert"
                    className="flex items-start gap-3 rounded-md border border-destructive/50 bg-destructive/10 p-4 text-sm text-destructive"
                  >
                    <WifiOff className="h-5 w-5 shrink-0 mt-0.5 text-destructive" />
                    <p>{errorMessage}</p>
                  </div>
                </CardContent>
                <CardFooter className="flex flex-col sm:flex-row gap-3 pt-2">
                  <Button
                    variant="default"
                    onClick={handleRetry}
                    data-testid="retry-button"
                    className="w-full sm:flex-1 min-h-[44px]"
                  >
                    Réessayer
                  </Button>
                  <Button asChild variant="secondary" className="w-full sm:flex-1 min-h-[44px]">
                    <Link to="/">Retour à l'accueil</Link>
                  </Button>
                </CardFooter>
              </>
            )}

            {status === 'idle' && (
              <CardContent className="flex items-center justify-center py-8">
                <Loader2 className="h-8 w-8 animate-spin text-primary" />
              </CardContent>
            )}
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

export default VerifyEmailPage;
