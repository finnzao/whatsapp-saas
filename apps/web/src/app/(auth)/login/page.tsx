'use client';

import { useForm } from 'react-hook-form';
import Link from 'next/link';
import { useLogin } from '@/lib/hooks/useAuth';

interface LoginForm {
  email: string;
  password: string;
}

export default function LoginPage() {
  const { register, handleSubmit, formState: { errors } } = useForm<LoginForm>();
  const login = useLogin();

  const onSubmit = (data: LoginForm) => login.mutate(data);

  return (
    <div>
      <h2 className="mb-6 text-xl font-semibold text-gray-900">Entrar</h2>
      <form onSubmit={handleSubmit(onSubmit)} className="space-y-4">
        <div>
          <label className="mb-1 block text-sm font-medium text-gray-700">E-mail</label>
          <input
            type="email"
            className="input"
            placeholder="voce@loja.com"
            {...register('email', { required: 'E-mail obrigatório' })}
          />
          {errors.email && <p className="mt-1 text-xs text-red-600">{errors.email.message}</p>}
        </div>
        <div>
          <label className="mb-1 block text-sm font-medium text-gray-700">Senha</label>
          <input
            type="password"
            className="input"
            placeholder="••••••••"
            {...register('password', { required: 'Senha obrigatória' })}
          />
          {errors.password && <p className="mt-1 text-xs text-red-600">{errors.password.message}</p>}
        </div>
        <button type="submit" className="btn-primary w-full" disabled={login.isPending}>
          {login.isPending ? 'Entrando...' : 'Entrar'}
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
