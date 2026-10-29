import * as React from 'react';
import { Link } from 'react-router-dom';
import { useForm } from 'react-hook-form';
import { CheckCircle2 } from 'lucide-react';
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

export interface ForgotPasswordFormData {
  email: string;
}

export function ForgotPasswordPage() {
  const [nonFieldErrors, setNonFieldErrors] = React.useState<string[]>([]);
  const [throttledSeconds, setThrottledSeconds] = React.useState<number | null>(null);
  const [throttledDetail, setThrottledDetail] = React.useState<string | undefined>();
  const [isSuccess, setIsSuccess] = React.useState(false);

  const {
    register,
    handleSubmit,
    setError,
    formState: { errors, isSubmitting },
  } = useForm<ForgotPasswordFormData>({
    defaultValues: {
      email: '',
    },
    mode: 'onSubmit',
  });

  const onSubmit = async (values: ForgotPasswordFormData) => {
    if (isSubmitting || throttledSeconds !== null || isSuccess) {
      return;
    }

    setNonFieldErrors([]);

    try {
      await apiClient('/api/v1/password-reset/', {
        method: 'POST',
        data: { email: values.email.trim() },
      });

      setIsSuccess(true);
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

        if (err.envelope.errors && Object.keys(err.envelope.errors).length > 0) {
          const topErrors = applyApiErrorsToForm(
            err.envelope.errors,
            setError,
            ['email']
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
          'Une erreur inattendue est survenue. Veuillez vérifier votre connexion.',
        ]);
      }
    }
  };

  const isFormBlocked = isSubmitting || throttledSeconds !== null || isSuccess;

  return (
    <div
      data-testid="forgot-password-page-root"
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

      {/* Main Content */}
      <main className="flex-1 flex items-center justify-center px-4 py-8 sm:py-12">
        <div className="w-full max-w-md mx-auto">
          <Card data-testid="forgot-password-card" className="border-border bg-card shadow-lg">
            <CardHeader className="space-y-1.5 pb-4">
              <CardTitle className="text-xl sm:text-2xl font-bold tracking-tight text-foreground">
                Mot de passe oublié
              </CardTitle>
              <CardDescription className="text-sm text-foreground-muted">
                Entrez votre adresse email pour recevoir un lien de réinitialisation.
              </CardDescription>
            </CardHeader>

            <CardContent className="pt-2">
              <form
                onSubmit={handleSubmit(onSubmit)}
                noValidate
                className="space-y-4"
                data-testid="forgot-password-form"
              >
                {/* Dynamic Countdown Banner for 429 / 503 Throttling */}
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

                {/* Non-Field / General Errors Alert */}
                {nonFieldErrors.length > 0 && (
                  <div
                    role="alert"
                    data-testid="forgot-password-non-field-errors"
                    className="rounded-md border border-destructive-border bg-destructive-surface p-3 text-sm text-destructive space-y-1"
                  >
                    {nonFieldErrors.map((errorMsg, idx) => (
                      <p key={idx}>{errorMsg}</p>
                    ))}
                  </div>
                )}

                {/* Uniform Success Confirmation (Anti-enumeration) */}
                {isSuccess && (
                  <div
                    role="status"
                    data-testid="forgot-password-success-card"
                    className="rounded-md border border-success-border bg-success-surface p-4 text-sm text-success space-y-2"
                  >
                    <div className="flex items-center gap-2 font-semibold">
                      <CheckCircle2 className="h-5 w-5 shrink-0 text-success" />
                      <span>Demande envoyée</span>
                    </div>
                    <p className="text-foreground text-sm font-medium">
                      Si un compte existe avec cet email, un lien de réinitialisation a été envoyé.
                    </p>
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
                    spellCheck="false"
                    placeholder="etudiant@universite.fr"
                    error={Boolean(errors.email)}
                    aria-required="true"
                    aria-describedby={errors.email ? 'email-error' : undefined}
                    disabled={isFormBlocked}
                    {...register('email', {
                      required: "L'adresse email est requise.",
                      validate: (val) =>
                        val.trim().length > 0 || "L'adresse email est requise.",
                      pattern: {
                        value: /^\s*[^\s@]+@[^\s@]+\.[^\s@]+\s*$/,
                        message: "Veuillez entrer une adresse email valide.",
                      },
                    })}
                  />
                  {errors.email && (
                    <p
                      id="email-error"
                      data-testid="email-error"
                      className="text-xs text-destructive font-medium mt-1"
                    >
                      {errors.email.message}
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
                    data-testid="forgot-password-submit-button"
                  >
                    {isSubmitting ? 'Envoi en cours...' : 'Envoyer le lien'}
                  </Button>
                </div>
              </form>
            </CardContent>

            <CardFooter className="flex flex-col sm:flex-row items-center justify-center text-xs text-foreground-muted border-t border-border pt-4 mt-2">
              <Link
                to="/login"
                data-testid="back-to-login-link"
                className="text-primary hover:text-primary-hover font-medium underline-offset-4 hover:underline focus:outline-none focus-visible:ring-2 focus-visible:ring-primary rounded px-1 min-h-[44px] flex items-center"
              >
                Retour à la connexion
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

export default ForgotPasswordPage;
