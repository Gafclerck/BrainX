import React from 'react';
import { Navigate, Outlet, useSearchParams } from 'react-router-dom';
import { useAuthStore } from '@/features/auth/auth-store';
import { sanitizeReturnUrl } from './utils';

export interface GuestGuardProps {
  children?: React.ReactNode;
}

export function GuestGuard({ children }: GuestGuardProps = {}) {
  const accessToken = useAuthStore((s) => s.accessToken);
  const [searchParams] = useSearchParams();

  if (accessToken) {
    const returnUrlParam = searchParams.get('returnUrl');
    const target = sanitizeReturnUrl(returnUrlParam);
    return <Navigate to={target} replace />;
  }

  return children ? <>{children}</> : <Outlet />;
}

export default GuestGuard;
