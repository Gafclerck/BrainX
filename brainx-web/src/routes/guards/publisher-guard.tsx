import React from 'react';
import { Navigate, Outlet, useLocation } from 'react-router-dom';
import { useAuthStore } from '@/features/auth/auth-store';

export const PUBLISHER_NOTICE =
  "Accès réservé aux éditeurs. Vous avez été redirigé vers l'accueil.";

export interface PublisherGuardProps {
  children?: React.ReactNode;
}

export function PublisherGuard({ children }: PublisherGuardProps = {}) {
  const accessToken = useAuthStore((s) => s.accessToken);
  const isPublisher = useAuthStore((s) => s.isPublisher);
  const location = useLocation();

  if (!accessToken) {
    const fullPath = `${location.pathname}${location.search}${location.hash}`;
    const returnUrl = encodeURIComponent(fullPath);
    return <Navigate to={`/login?returnUrl=${returnUrl}`} replace />;
  }

  if (!isPublisher) {
    return (
      <Navigate
        to="/courses"
        replace
        state={{ notice: PUBLISHER_NOTICE }}
      />
    );
  }

  return children ? <>{children}</> : <Outlet />;
}

export default PublisherGuard;
