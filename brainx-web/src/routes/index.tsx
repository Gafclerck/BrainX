import { Routes, Route, Navigate, Link } from 'react-router-dom';
import { RegisterPage } from '@/features/auth/register-page';
import { VerifyEmailPage } from '@/features/auth/verify-email-page';
import { ForgotPasswordPage } from '@/features/auth/forgot-password-page';
import { ResetPasswordPage } from '@/features/auth/reset-password-page';
import { LandingPage } from '@/features/landing/landing-page';

function LoginPagePlaceholder() {
  return (
    <div
      data-testid="login-page-placeholder"
      className="min-h-screen bg-background text-foreground flex items-center justify-center p-4 min-w-[360px]"
    >
      <div className="rounded-lg border border-border bg-card p-6 max-w-md w-full text-center space-y-3">
        <h1 className="text-xl font-bold">Connexion</h1>
        <p className="text-sm text-foreground-muted">
          La page de connexion (Story FE-1.5) sera disponible prochainement.
        </p>
        <div>
          <Link
            to="/forgot-password"
            className="text-primary hover:text-primary-hover text-sm underline-offset-4 hover:underline"
          >
            Mot de passe oublié ?
          </Link>
        </div>
      </div>
    </div>
  );
}

function CoursesPagePlaceholder() {
  return (
    <div
      data-testid="courses-page-placeholder"
      className="min-h-screen bg-background text-foreground flex items-center justify-center p-4 min-w-[360px]"
    >
      <div className="rounded-lg border border-border bg-card p-6 max-w-md w-full text-center space-y-3">
        <h1 className="text-xl font-bold">Catalogue des Cours</h1>
        <p className="text-sm text-foreground-muted">
          Bienvenue sur BrainX. Les cours et ressources pédagogiques seront affichés ici.
        </p>
      </div>
    </div>
  );
}

export function AppRoutes() {
  return (
    <Routes>
      <Route path="/" element={<LandingPage />} />
      <Route path="/register" element={<RegisterPage />} />
      <Route path="/login" element={<LoginPagePlaceholder />} />
      <Route path="/verify-email" element={<VerifyEmailPage />} />
      <Route path="/forgot-password" element={<ForgotPasswordPage />} />
      <Route path="/reset-password" element={<ResetPasswordPage />} />
      <Route path="/courses" element={<CoursesPagePlaceholder />} />
      <Route path="*" element={<Navigate to="/" replace />} />
    </Routes>
  );
}

export default AppRoutes;
