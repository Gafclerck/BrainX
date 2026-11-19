import React from 'react';
import { Navigate, Outlet, useLocation } from 'react-router-dom';
import { useAuthStore } from '@/features/auth/auth-store';
import { useConfigStore } from '@/features/config/config-store';

export interface AuthGuardProps {
  children?: React.ReactNode;
  allowGuest?: boolean;
}

export function AuthGuard({ children, allowGuest }: AuthGuardProps = {}) {
  const accessToken = useAuthStore((s) => s.accessToken);
  const storePublicBrowsing = useConfigStore((s) => s.publicBrowsing);
  const location = useLocation();

  const isPublicBrowsing = allowGuest ?? storePublicBrowsing;

  if (!accessToken && !isPublicBrowsing) {
    const fullPath = `${location.pathname}${location.search}${location.hash}`;
    const returnUrl = encodeURIComponent(fullPath);
    return <Navigate to={`/login?returnUrl=${returnUrl}`} replace />;
  }

  return children ? <>{children}</> : <Outlet />;
}

export default AuthGuard;
