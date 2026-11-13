import React from 'react';
import { Navigate, Outlet, useLocation } from 'react-router-dom';
import { useAuthStore } from '@/features/auth/auth-store';

export interface AuthGuardProps {
  children?: React.ReactNode;
  allowGuest?: boolean;
}

export function AuthGuard({ children, allowGuest }: AuthGuardProps = {}) {
  const accessToken = useAuthStore((s) => s.accessToken);
  const location = useLocation();

  const isPublicBrowsing = allowGuest ?? (import.meta.env.VITE_PUBLIC_BROWSING === 'true');

  if (!accessToken && !isPublicBrowsing) {
    const fullPath = `${location.pathname}${location.search}${location.hash}`;
    const returnUrl = encodeURIComponent(fullPath);
    return <Navigate to={`/login?returnUrl=${returnUrl}`} replace />;
  }

  return children ? <>{children}</> : <Outlet />;
}

export default AuthGuard;
