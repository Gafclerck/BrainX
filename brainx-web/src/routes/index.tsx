import { Routes, Route, Navigate } from 'react-router-dom';
import { RegisterPage } from '@/features/auth/register-page';
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
      <Route path="*" element={<Navigate to="/" replace />} />
    </Routes>
  );
}

export default AppRoutes;
