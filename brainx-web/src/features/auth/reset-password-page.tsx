import * as React from 'react';
import { Link } from 'react-router-dom';
import { useForm } from 'react-hook-form';
import { CheckCircle2, AlertTriangle, XCircle, Loader2 } from 'lucide-react';
import {
  Card,
  CardHeader,
  CardTitle,
  CardDescription,
  CardContent,
  CardFooter,
} from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { ThrottledBanner } from '@/components/ui/throttled-banner';
import { apiClient, ApiError, applyApiErrorsToForm } from '@/lib/api';

export interface ResetPasswordFormData {
  password: string;
  confirmPassword: string;
}

export type ResetPageStatus =
  | 'initializing'
  | 'missing_token'
  | 'ready'
  | 'token_rejected'
  | 'success';

export function ResetPasswordPage() {
  const initializedRef = React.useRef(false);
  const [resetToken, setResetToken] = React.useState<string | null>(null);
  const [status, setStatus] = React.useState<ResetPageStatus>('initializing');
  const [tokenErrorMessage, setTokenErrorMessage] = React.useState<string | null>(null);
  const [nonFieldErrors, setNonFieldErrors] = React.useState<string[]>([]);
  const [throttledSeconds, setThrottledSeconds] = React.useState<number | null>(null);
  const [throttledDetail, setThrottledDetail] = React.useState<string | undefined>();

  const {
    register,
    handleSubmit,
    setError,
    reset,
    watch,
    formState: { errors, isSubmitting },
  } = useForm<ResetPasswordFormData>({
    defaultValues: {
      password: '',
      confirmPassword: '',
    },
    mode: 'onSubmit',
  });

  React.useLayoutEffect(() => {
    if (initializedRef.current) return;
    initializedRef.current = true;

    let token: string | null = null;
    if (typeof window !== 'undefined') {
      if (window.location.hash) {
        const hash = window.location.hash.replace(/^#/, '');
        token = new URLSearchParams(hash).get('token');
      }

      // Synchronously purge history whenever window.location.hash or window.location.search is present
      if (window.location.hash || window.location.search) {
        window.history.replaceState(null, '', window.location.pathname);
      }
    }

    if (token && token.trim()) {
      setResetToken(token);
      setStatus('ready');
    } else {
      setStatus('missing_token');
    }
  }, []);

  const onSubmit = async (values: ResetPasswordFormData) => {
    if (isSubmitting || throttledSeconds !== null || !resetToken) {
      return;
    }

    setNonFieldErrors([]);

    try {
      await apiClient('/api/v1/reset-password/', {
        method: 'POST',
        data: {
          token: resetToken,
          password: values.password,
        },
      });

      setStatus('success');
      setResetToken(null);
      reset({ password: '', confirmPassword: '' });
    } catch (err) {
      if (err instanceof ApiError) {
        if (
          err.envelope.status === 429 ||
          err.envelope.status === 503 ||
          (err.retryAfter !== undefined && err.retryAfter >= 0)
        ) {
          setThrottledSeconds(err.retryAfter ?? 30);
          setThrottledDetail(err.envelope.detail);
          return;
        }

        // Token rejected by server (400 errors.token)
        if (err.envelope.errors?.token) {
          const tokenMsg = Array.isArray(err.envelope.errors.token)
            ? err.envelope.errors.token[0]
            : String(err.envelope.errors.token);
          setTokenErrorMessage(tokenMsg);
          setStatus('token_rejected');
          setResetToken(null);
          reset({ password: '', confirmPassword: '' });
          return;
        }

        if (err.envelope.errors && Object.keys(err.envelope.errors).length > 0) {
          // Multi-error password messages preserved without truncation
          const normalizedErrors: Record<string, string[]> = {};
          for (const [k, v] of Object.entries(err.envelope.errors)) {
            const arr = Array.isArray(v) ? v : [String(v)];
            normalizedErrors[k] = [arr.join(' ')];
          }
          const unmapped = applyApiErrorsToForm(
            normalizedErrors,
            setError,
            ['password', 'confirmPassword']
          );
          if (unmapped.length > 0) {
            setNonFieldErrors((prev) => [...prev, ...unmapped]);
          }
        } else if (err.envelope.detail) {
          setNonFieldErrors([err.envelope.detail]);
        } else if (err.envelope.title) {
          setNonFieldErrors([err.envelope.title]);
        }
      } else {
        setNonFieldErrors([
          'Une erreur réseau est survenue lors de la réinitialisation. Veuillez vérifier votre connexion et réessayer.',
        ]);
      }
    }
  };

  const isFormBlocked = isSubmitting || throttledSeconds !== null;

  return (
    <div
      data-testid="reset-password-page-root"
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

      {/* Main Content Area */}
      <main className="flex-1 flex items-center justify-center px-4 py-8 sm:py-12">
        <div className="w-full max-w-md mx-auto">
          {/* State 0: Initializing Loading Card */}
          {status === 'initializing' && (
            <Card data-testid="reset-loading-card" className="border-border bg-card shadow-lg">
              <CardContent
                role="status"
                aria-live="polite"
                data-testid="reset-loading"
                className="flex flex-col items-center justify-center py-8 space-y-3"
              >
                <Loader2 className="h-8 w-8 animate-spin text-primary" />
                <p className="text-sm text-foreground-muted">Initialisation...</p>
              </CardContent>
            </Card>
          )}

          {/* State 1: Missing Token Warning Card */}
          {status === 'missing_token' && (
            <Card data-testid="reset-missing-token-card" className="border-border bg-card shadow-lg">
              <CardHeader className="space-y-1.5 pb-4">
                <CardTitle className="text-xl sm:text-2xl font-bold tracking-tight text-foreground">
                  Jeton manquant ou invalide
                </CardTitle>
                <CardDescription className="text-sm text-foreground-muted">
                  Aucun jeton de réinitialisation n'a été détecté dans le lien.
                </CardDescription>
              </CardHeader>
              <CardContent className="space-y-4 pt-2">
                <div
                  role="alert"
                  data-testid="reset-missing-token"
                  className="flex items-start gap-3 rounded-md border border-warning-border bg-warning-surface p-4 text-sm text-warning"
                >
                  <AlertTriangle className="h-5 w-5 shrink-0 mt-0.5 text-warning" />
                  <p>
                    Le lien de réinitialisation utilisé est incomplet ou invalide. Veuillez demander un nouveau lien de récupération.
                  </p>
                </div>
              </CardContent>
              <CardFooter className="flex flex-col sm:flex-row gap-3 pt-2">
                <Button asChild variant="default" className="w-full sm:flex-1 min-h-[44px]">
                  <Link to="/forgot-password">Demander un nouveau lien</Link>
                </Button>
                <Button asChild variant="secondary" className="w-full sm:flex-1 min-h-[44px]">
                  <Link to="/login">Retour à la connexion</Link>
                </Button>
              </CardFooter>
            </Card>
          )}

          {/* State 2: Token Rejected Error Card (400 errors.token) */}
          {status === 'token_rejected' && (
            <Card data-testid="reset-token-rejected-card" className="border-border bg-card shadow-lg">
              <CardHeader className="space-y-1.5 pb-4">
                <CardTitle className="text-xl sm:text-2xl font-bold tracking-tight text-foreground">
                  Lien invalide ou expiré
                </CardTitle>
                <CardDescription className="text-sm text-foreground-muted">
                  Le jeton de réinitialisation ne peut pas être validé.
                </CardDescription>
              </CardHeader>
              <CardContent className="space-y-4 pt-2">
                <div
                  role="alert"
                  data-testid="reset-error-card"
                  className="flex items-start gap-3 rounded-md border border-destructive-border bg-destructive-surface p-4 text-sm text-destructive"
                >
                  <XCircle className="h-5 w-5 shrink-0 mt-0.5 text-destructive" />
                  <p>
                    {tokenErrorMessage ||
                      'Le lien de réinitialisation est invalide ou a expiré. Veuillez demander un nouveau lien.'}
                  </p>
                </div>
              </CardContent>
              <CardFooter className="flex flex-col sm:flex-row gap-3 pt-2">
                <Button asChild variant="default" className="w-full sm:flex-1 min-h-[44px]">
                  <Link to="/forgot-password">Demander un nouveau lien</Link>
                </Button>
                <Button asChild variant="secondary" className="w-full sm:flex-1 min-h-[44px]">
                  <Link to="/login">Retour à la connexion</Link>
                </Button>
              </CardFooter>
            </Card>
          )}

          {/* State 3: Success View */}
          {status === 'success' && (
            <Card data-testid="reset-success-card" className="border-border bg-card shadow-lg">
              <CardHeader className="text-center space-y-1.5 pb-4">
                <CardTitle className="text-xl sm:text-2xl font-bold tracking-tight text-foreground">
                  Mot de passe mis à jour !
                </CardTitle>
                <CardDescription className="text-sm text-foreground-muted">
                  Votre nouveau mot de passe a été enregistré avec succès.
                </CardDescription>
              </CardHeader>
              <CardContent
                data-testid="reset-success-content"
                className="flex flex-col items-center justify-center py-6 space-y-4 text-center"
              >
                <CheckCircle2 className="h-12 w-12 text-primary" />
                <p className="text-sm text-foreground">
                  Vous pouvez dès à présent vous connecter à l'aide de vos nouveaux identifiants.
                </p>
              </CardContent>
              <CardFooter className="pt-2">
                <Button asChild variant="default" className="w-full min-h-[44px]">
                  <Link to="/login">Se connecter</Link>
                </Button>
              </CardFooter>
            </Card>
          )}

          {/* State 4: Reset Form */}
          {status === 'ready' && (
            <Card data-testid="reset-password-card" className="border-border bg-card shadow-lg">
              <CardHeader className="space-y-1.5 pb-4">
                <CardTitle className="text-xl sm:text-2xl font-bold tracking-tight text-foreground">
                  Nouveau mot de passe
                </CardTitle>
                <CardDescription className="text-sm text-foreground-muted">
                  Choisissez un nouveau mot de passe sécurisé pour votre compte BrainX.
                </CardDescription>
              </CardHeader>

              <CardContent className="pt-2">
                <form
                  onSubmit={handleSubmit(onSubmit)}
                  noValidate
                  className="space-y-4"
                  data-testid="reset-password-form"
                >
                  {/* Throttled Banner */}
                  {throttledSeconds !== null && (
                    <ThrottledBanner
                      seconds={throttledSeconds}
                      detail={throttledDetail}
                      onExpire={() => {
                        setThrottledSeconds(null);
                        setThrottledDetail(undefined);
                      }}
                    />
                  )}

                  {/* Consolidated Non-field / Server Errors Alert */}
                  {nonFieldErrors.length > 0 && (
                    <div
                      role="alert"
                      data-testid="reset-non-field-errors"
                      className="rounded-md border border-destructive-border bg-destructive-surface p-3 text-sm text-destructive space-y-1"
                    >
                      {nonFieldErrors.map((msg, idx) => (
                        <p key={idx} data-testid="reset-server-error">
                          {msg}
                        </p>
                      ))}
                    </div>
                  )}

                  {/* Password Field */}
                  <div className="space-y-1.5">
                    <label
                      htmlFor="password"
                      className="block text-sm font-medium text-foreground"
                    >
                      Nouveau mot de passe
                    </label>
                    <Input
                      id="password"
                      type="password"
                      autoComplete="new-password"
                      placeholder="••••••••"
                      error={Boolean(errors.password)}
                      aria-required="true"
                      aria-describedby={errors.password ? 'password-error' : undefined}
                      disabled={isFormBlocked}
                      {...register('password', {
                        required: 'Le mot de passe est requis.',
                      })}
                    />
                    {errors.password && (
                      <p
                        id="password-error"
                        data-testid="password-error"
                        className="text-xs text-destructive font-medium mt-1"
                      >
                        {errors.password.message}
                      </p>
                    )}
                  </div>

                  {/* Confirm Password Field */}
                  <div className="space-y-1.5">
                    <label
                      htmlFor="confirmPassword"
                      className="block text-sm font-medium text-foreground"
                    >
                      Confirmer le mot de passe
                    </label>
                    <Input
                      id="confirmPassword"
                      type="password"
                      autoComplete="new-password"
                      placeholder="••••••••"
                      error={Boolean(errors.confirmPassword)}
                      aria-required="true"
                      aria-describedby={
                        errors.confirmPassword ? 'confirm-password-error' : undefined
                      }
                      disabled={isFormBlocked}
                      {...register('confirmPassword', {
                        required: 'La confirmation du mot de passe est requise.',
                        validate: (val) =>
                          val === watch('password') ||
                          'Les mots de passe ne correspondent pas.',
                      })}
                    />
                    {errors.confirmPassword && (
                      <p
                        id="confirm-password-error"
                        data-testid="confirm-password-error"
                        className="text-xs text-destructive font-medium mt-1"
                      >
                        {errors.confirmPassword.message}
                      </p>
                    )}
                  </div>

                  {/* Submit Action */}
                  <div className="pt-2">
                    <Button
                      type="submit"
                      variant="default"
                      size="default"
                      className="w-full min-h-[44px]"
                      disabled={isFormBlocked}
                      data-testid="reset-submit-button"
                    >
                      {isSubmitting ? 'Mise à jour en cours...' : 'Réinitialiser le mot de passe'}
                    </Button>
                  </div>
                </form>
              </CardContent>

              <CardFooter className="flex flex-col sm:flex-row items-center justify-center text-xs text-foreground-muted border-t border-border pt-4 mt-2">
                <Link
                  to="/login"
                  className="text-primary hover:text-primary-hover font-medium underline-offset-4 hover:underline focus:outline-none focus-visible:ring-2 focus-visible:ring-primary rounded px-1 min-h-[44px] flex items-center"
                >
                  Retour à la connexion
                </Link>
              </CardFooter>
            </Card>
          )}
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

export default ResetPasswordPage;
