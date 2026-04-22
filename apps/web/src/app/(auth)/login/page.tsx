'use client';

import { useEffect } from 'react';
import { useForm } from 'react-hook-form';
import { zodResolver } from '@hookform/resolvers/zod';
import Link from 'next/link';
import { Mail } from 'lucide-react';
import {
  useLogin,
  useAuthHydrated,
  useIsAuthenticated,
} from '@/lib/hooks/useAuth';
import { loginSchema, type LoginInput } from '@/lib/validation/schemas';
import { ValidatedInput } from '@/components/ui/ValidatedInput';

export default function LoginPage() {
  const hydrated = useAuthHydrated();
  const isAuthenticated = useIsAuthenticated();

  const {
    register,
    handleSubmit,
    formState: { errors, touchedFields, dirtyFields, isSubmitting },
  } = useForm<LoginInput>({
    resolver: zodResolver(loginSchema),
    mode: 'onBlur',
  });

  const login = useLogin();

  useEffect(() => {
    if (hydrated && isAuthenticated) {
      if (process.env.NODE_ENV !== 'production') {
        console.log('[LoginPage] já autenticado, redirect → /conversas');
      }
      window.location.assign('/conversas');
    }
  }, [hydrated, isAuthenticated]);

  const onSubmit = (data: LoginInput) => {
    if (login.isPending || login.isSuccess) return;
    login.mutate(data);
  };

  const emailValid = !errors.email && (touchedFields.email || dirtyFields.email);
  const passwordValid = !errors.password && (touchedFields.password || dirtyFields.password);

  if (hydrated && isAuthenticated) {
    return (
      <div className="flex items-center justify-center py-10 text-sm text-gray-500">
        Redirecionando...
      </div>
    );
  }

  return (
    <div>
      <h2 className="mb-6 text-xl font-semibold text-gray-900">Entrar</h2>
      <form onSubmit={handleSubmit(onSubmit)} className="space-y-4" noValidate>
        <ValidatedInput
          label="E-mail"
          type="email"
          autoComplete="email"
          placeholder="voce@loja.com"
          error={errors.email?.message}
          isValid={emailValid}
          showValidIcon
          rightElement={<Mail className="h-4 w-4 text-gray-400" />}
          {...register('email')}
        />
        <ValidatedInput
          label="Senha"
          type="password"
          autoComplete="current-password"
          placeholder="••••••••"
          error={errors.password?.message}
          isValid={passwordValid}
          {...register('password')}
        />
        <button
          type="submit"
          className="btn-primary w-full"
          disabled={isSubmitting || login.isPending || login.isSuccess}
        >
          {login.isPending
            ? 'Entrando...'
            : login.isSuccess
              ? 'Redirecionando...'
              : 'Entrar'}
        </button>
      </form>
      <p className="mt-6 text-center text-sm text-gray-600">
        Não tem conta?{' '}
        <Link href="/register" className="font-medium text-brand-600 hover:text-brand-700">
          Criar conta
        </Link>
      </p>
    </div>
  );
}
