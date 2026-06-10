'use client';

import { useEffect } from 'react';
import { useRouter } from 'next/navigation';
import { useAuthHydrated, useIsAuthenticated } from '@/lib/hooks/useAuth';

export default function HomePage() {
  const router = useRouter();
  const hydrated = useAuthHydrated();
  const isAuthenticated = useIsAuthenticated();

  useEffect(() => {
    // Só decide depois de hidratar pra não redirecionar pro /login indevidamente.
    if (!hydrated) return;
    router.replace(isAuthenticated ? '/conversas' : '/login');
  }, [hydrated, isAuthenticated, router]);

  return (
    <div className="flex h-screen items-center justify-center">
      <div className="text-gray-500">Carregando...</div>
    </div>
  );
}
