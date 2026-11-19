import * as React from 'react';
import { useForm } from 'react-hook-form';
import { CheckCircle2 } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { ThrottledBanner } from '@/components/ui/throttled-banner';
import { apiClient, ApiError, applyApiErrorsToForm } from '@/lib/api';

export interface RegisterFormData {
  email: string;
  password: string;
}

export interface RegisterFormProps {
  onSuccess?: () => void;
  className?: string;
}

export function RegisterForm({ onSuccess, className }: RegisterFormProps) {
  const [nonFieldErrors, setNonFieldErrors] = React.useState<string[]>([]);
  const [throttledSeconds, setThrottledSeconds] = React.useState<number | null>(null);
  const [throttledDetail, setThrottledDetail] = React.useState<string | undefined>();
  const [isSuccess, setIsSuccess] = React.useState(false);

  const {
    register,
    handleSubmit,
    setError,
    reset,
    formState: { errors, isSubmitting },
  } = useForm<RegisterFormData>({
    defaultValues: {
      email: '',
      password: '',
    },
    mode: 'onSubmit',
  });

  const onSubmit = async (values: RegisterFormData) => {
    if (isSubmitting || throttledSeconds !== null || isSuccess) {
      return;
    }

    setNonFieldErrors([]);

    try {
      await apiClient('/api/v1/register/', {
        method: 'POST',
        data: values,
      });

      setIsSuccess(true);
      reset({ email: values.email, password: '' });
      onSuccess?.();
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
          'Une erreur inattendue est survenue. Veuillez vérifier votre connexion.',
        ]);
      }
    }
  };

  const isFormBlocked = isSubmitting || throttledSeconds !== null || isSuccess;

  return (
    <form
      onSubmit={handleSubmit(onSubmit)}
      noValidate
      className={className || 'space-y-4'}
      data-testid="register-form"
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
          data-testid="register-non-field-errors"
          className="rounded-md border border-destructive-border bg-destructive-surface p-3 text-sm text-destructive space-y-1"
        >
          {nonFieldErrors.map((errorMsg, idx) => (
            <p key={idx}>{errorMsg}</p>
          ))}
        </div>
      )}

      {/* Success Confirmation Card */}
      {isSuccess && (
        <div
          role="status"
          data-testid="register-success-card"
          className="rounded-md border border-success-border bg-success-surface p-4 text-sm text-success space-y-2"
        >
          <div className="flex items-center gap-2 font-semibold">
            <CheckCircle2 className="h-5 w-5 shrink-0 text-success" />
            <span>Compte créé avec succès</span>
          </div>
          <p className="text-foreground text-sm font-medium">
            Vérifiez vos emails pour activer votre compte.
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

      {/* Password Field */}
      <div className="space-y-1.5">
        <label
          htmlFor="password"
          className="block text-sm font-medium text-foreground"
        >
          Mot de passe
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

      {/* Submit Action */}
      <div className="pt-2">
        <Button
          type="submit"
          variant="default"
          size="default"
          className="w-full min-h-[44px]"
          disabled={isFormBlocked}
          data-testid="register-submit-button"
        >
          {isSubmitting ? 'Création en cours...' : "S'inscrire"}
        </Button>
      </div>
    </form>
  );
}
