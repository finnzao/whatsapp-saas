'use client';

import { useEffect } from 'react';
import { useAuthHydrated, useIsAuthenticated } from '@/lib/hooks/useAuth';

const DEBUG = typeof window !== 'undefined' && process.env.NODE_ENV !== 'production';

interface AuthGuardProps {
  children: React.ReactNode;
  redirectTo?: string;
}

export function AuthGuard({ children, redirectTo = '/login' }: AuthGuardProps) {
  const hydrated = useAuthHydrated();
  const isAuthenticated = useIsAuthenticated();

  useEffect(() => {
    if (hydrated && !isAuthenticated) {
      if (DEBUG) console.log('[AuthGuard] sem auth após hidratação, redirect →', redirectTo);
      if (typeof window !== 'undefined') {
        window.location.assign(redirectTo);
      }
    }
  }, [hydrated, isAuthenticated, redirectTo]);

  if (!hydrated) {
    return (
      <div className="flex h-screen items-center justify-center text-sm text-gray-500">
        Carregando...
      </div>
    );
  }

  if (!isAuthenticated) {
    return (
      <div className="flex h-screen items-center justify-center text-sm text-gray-500">
        Redirecionando para login...
      </div>
    );
  }

  return <>{children}</>;
}
