import * as React from 'react';
import { Link, useNavigate, useSearchParams } from 'react-router-dom';
import { useForm } from 'react-hook-form';
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
import { useAuthStore, type UserProfile } from './auth-store';
import { sanitizeReturnUrl } from '@/routes/guards';

export { sanitizeReturnUrl };

export interface LoginFormData {
  email: string;
  password: string;
}

export function LoginPage() {
  const navigate = useNavigate();
  const [searchParams] = useSearchParams();
  const returnUrlParam = searchParams.get('returnUrl');

  const setTokens = useAuthStore((s) => s.setTokens);
  const setUser = useAuthStore((s) => s.setUser);
  const setIsPublisher = useAuthStore((s) => s.setIsPublisher);

  const [nonFieldErrors, setNonFieldErrors] = React.useState<string[]>([]);
  const [throttledSeconds, setThrottledSeconds] = React.useState<number | null>(null);
  const [throttledDetail, setThrottledDetail] = React.useState<string | undefined>();

  const {
    register,
    handleSubmit,
    setError,
    formState: { errors, isSubmitting },
  } = useForm<LoginFormData>({
    defaultValues: {
      email: '',
      password: '',
    },
    mode: 'onSubmit',
  });

  const onSubmit = async (values: LoginFormData) => {
    if (isSubmitting || throttledSeconds !== null) {
      return;
    }

    setNonFieldErrors([]);

    const normalizedEmail = values.email.trim().toLowerCase();
    const password = values.password;

    try {
      // 1. POST /api/v1/login/
      const loginData = await apiClient<{ access: string; refresh: string }>(
        '/api/v1/login/',
        {
          method: 'POST',
          data: { email: normalizedEmail, password },
        }
      );

      const authHeaders = {
        Authorization: `Bearer ${loginData.access}`,
      };

      // 2. Fetch profile from GET /api/v1/me/ with explicit Authorization header
      let profile: UserProfile | null = null;
      try {
        profile = await apiClient<UserProfile>('/api/v1/me/', {
          headers: authHeaders,
        });
      } catch (profileErr) {
        if (profileErr instanceof ApiError && profileErr.envelope.status === 403) {
          setNonFieldErrors([
            'Votre adresse email n’est pas encore vérifiée. Veuillez vérifier votre boîte de réception.',
          ]);
          return;
        }
        // Non-fatal for other errors
      }

      // 3. Silent publisher probe GET /api/v1/courses/?page=1 with explicit Authorization header
      let isUserPublisher = false;
      try {
        await apiClient('/api/v1/courses/?page=1', {
          headers: authHeaders,
        });
        isUserPublisher = true;
      } catch (probeErr) {
        // Only set isUserPublisher to false on 403 Forbidden
        if (probeErr instanceof ApiError && probeErr.envelope.status === 403) {
          isUserPublisher = false;
        }
      }

      // 4. Commit tokens, profile, and publisher status together before redirecting
      setTokens({ access: loginData.access, refresh: loginData.refresh });
      setUser(profile);
      setIsPublisher(isUserPublisher);

      // 5. Clean redirect to sanitized returnUrl or /courses
      const target = sanitizeReturnUrl(returnUrlParam);
      navigate(target, { replace: true });
    } catch (err) {
      if (err instanceof ApiError) {
        if (
          err.envelope.status === 429 ||
          err.envelope.status === 503 ||
          (err.retryAfter !== undefined && err.retryAfter >= 0)
        ) {
          setThrottledSeconds(err.retryAfter ?? 60);
          setThrottledDetail(
            err.envelope.detail ||
              'Trop de tentatives de connexion. Veuillez patienter avant de réessayer.'
          );
          return;
        }

        if (err.envelope.status === 401) {
          setNonFieldErrors(['Email ou mot de passe incorrect']);
          return;
        }

        if (err.envelope.errors && Object.keys(err.envelope.errors).length > 0) {
          const topErrors = applyApiErrorsToForm(
            err.envelope.errors,
            setError,
            ['email', 'password']
          );
          if (topErrors.length > 0) {
            setNonFieldErrors(topErrors);
          }
        } else if (err.envelope.detail) {
          setNonFieldErrors([err.envelope.detail]);
        } else if (err.envelope.title) {
          setNonFieldErrors([err.envelope.title]);
        }
      } else {
        setNonFieldErrors([
          'Une erreur inattendue est survenue. Veuillez vérifier votre connexion et réessayer.',
        ]);
      }
    }
  };

  const isFormBlocked = isSubmitting || throttledSeconds !== null;

  return (
    <div
      data-testid="login-page-root"
      className="min-h-screen bg-background text-foreground font-sans min-w-[360px] w-full overflow-x-hidden flex flex-col justify-between selection:bg-primary selection:text-primary-foreground"
    >
      <div data-testid="login-page-placeholder" className="sr-only" aria-hidden="true" />
      {/* Top Header */}
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

      {/* Main Login Card */}
      <main className="flex-1 flex items-center justify-center px-4 py-8 sm:py-12">
        <div className="w-full max-w-md mx-auto">
          <Card data-testid="login-card" className="border-border bg-card shadow-lg">
            <CardHeader className="space-y-1.5 pb-4">
              <CardTitle className="text-xl sm:text-2xl font-bold tracking-tight text-foreground">
                Connexion
              </CardTitle>
              <CardDescription className="text-sm text-foreground-muted">
                Entrez vos identifiants pour accéder à vos cours et ressources.
              </CardDescription>
            </CardHeader>
            <CardContent className="pt-2">
              <form
                onSubmit={handleSubmit(onSubmit)}
                noValidate
                className="space-y-4"
                data-testid="login-form"
              >
                {/* Throttled Banner for 429 */}
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

                {/* Non-Field / 401 / General Errors */}
                {nonFieldErrors.length > 0 && (
                  <div
                    role="alert"
                    data-testid="login-non-field-errors"
                    className="rounded-md border border-destructive-border bg-destructive-surface p-3 text-sm text-destructive space-y-1"
                  >
                    {nonFieldErrors.map((msg, idx) => (
                      <p key={idx}>{msg}</p>
                    ))}
                  </div>
                )}

                {/* Email Field */}
                <div className="space-y-1.5">
                  <label
                    htmlFor="email"
                    className="block text-sm font-medium text-foreground"
                  >
                    Adresse email
                  </label>
                  <Input
                    id="email"
                    type="email"
                    autoComplete="email"
                    autoCapitalize="none"
                    autoCorrect="off"
                    spellCheck="false"
                    placeholder="etudiant@universite.fr"
                    error={Boolean(errors.email)}
                    aria-required="true"
                    aria-describedby={errors.email ? 'email-error' : undefined}
                    disabled={isFormBlocked}
                    data-testid="login-email-input"
                    {...register('email', {
                      required: "L'adresse email est requise.",
                      pattern: {
                        value: /^\s*[^\s@]+@[^\s@]+\.[^\s@]+\s*$/,
                        message: "Format d'adresse email invalide.",
                      },
                    })}
                  />
                  {errors.email && (
                    <p
                      id="email-error"
                      data-testid="login-email-error"
                      role="alert"
                      className="text-xs text-destructive font-medium"
                    >
                      {errors.email.message}
                    </p>
                  )}
                </div>

                {/* Password Field */}
                <div className="space-y-1.5">
                  <div className="flex items-center justify-between">
                    <label
                      htmlFor="password"
                      className="block text-sm font-medium text-foreground"
                    >
                      Mot de passe
                    </label>
                    <Link
                      to="/forgot-password"
                      data-testid="login-forgot-password-link"
                      className="text-xs text-primary hover:text-primary-hover underline-offset-4 hover:underline focus:outline-none focus-visible:ring-2 focus-visible:ring-primary rounded"
                    >
                      Mot de passe oublié ?
                    </Link>
                  </div>
                  <Input
                    id="password"
                    type="password"
                    autoComplete="current-password"
                    placeholder="••••••••"
                    error={Boolean(errors.password)}
                    aria-required="true"
                    aria-describedby={errors.password ? 'password-error' : undefined}
                    disabled={isFormBlocked}
                    data-testid="login-password-input"
                    {...register('password', {
                      required: 'Le mot de passe est requis.',
                    })}
                  />
                  {errors.password && (
                    <p
                      id="password-error"
                      data-testid="login-password-error"
                      role="alert"
                      className="text-xs text-destructive font-medium"
                    >
                      {errors.password.message}
                    </p>
                  )}
                </div>

                {/* Submit Button */}
                <Button
                  type="submit"
                  variant="default"
                  size="default"
                  className="w-full min-h-[44px] font-medium"
                  disabled={isFormBlocked}
                  data-testid="login-submit-button"
                >
                  {isSubmitting ? 'Connexion en cours...' : 'Se connecter'}
                </Button>
              </form>
            </CardContent>
            <CardFooter className="flex flex-col sm:flex-row items-center justify-center text-xs text-foreground-muted border-t border-border pt-4 mt-2">
              <span>Vous n'avez pas encore de compte ?</span>
              <Link
                to="/register"
                data-testid="login-register-link"
                className="ml-1 text-primary hover:text-primary-hover font-medium underline-offset-4 hover:underline focus:outline-none focus-visible:ring-2 focus-visible:ring-primary rounded px-1 min-h-[44px] flex items-center"
              >
                S'inscrire
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

export default LoginPage;
