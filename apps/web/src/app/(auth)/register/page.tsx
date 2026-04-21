'use client';

import { useForm } from 'react-hook-form';
import Link from 'next/link';
import { useRegister } from '@/lib/hooks/useAuth';

interface RegisterForm {
  name: string;
  tenantName: string;
  email: string;
  password: string;
}

export default function RegisterPage() {
  const { register, handleSubmit, formState: { errors } } = useForm<RegisterForm>();
  const mutation = useRegister();

  const onSubmit = (data: RegisterForm) => mutation.mutate(data);

  return (
    <div>
      <h2 className="mb-6 text-xl font-semibold text-gray-900">Criar conta</h2>
      <form onSubmit={handleSubmit(onSubmit)} className="space-y-4">
        <div>
          <label className="mb-1 block text-sm font-medium text-gray-700">Nome da loja</label>
          <input
            className="input"
            placeholder="Minha Loja de Eletrônicos"
            {...register('tenantName', { required: 'Nome da loja obrigatório' })}
          />
          {errors.tenantName && <p className="mt-1 text-xs text-red-600">{errors.tenantName.message}</p>}
        </div>
        <div>
          <label className="mb-1 block text-sm font-medium text-gray-700">Seu nome</label>
          <input
            className="input"
            placeholder="João Silva"
            {...register('name', { required: 'Nome obrigatório' })}
          />
          {errors.name && <p className="mt-1 text-xs text-red-600">{errors.name.message}</p>}
        </div>
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
            placeholder="Mínimo 8 caracteres"
            {...register('password', { required: 'Senha obrigatória', minLength: { value: 8, message: 'Mínimo 8 caracteres' } })}
          />
          {errors.password && <p className="mt-1 text-xs text-red-600">{errors.password.message}</p>}
        </div>
        <button type="submit" className="btn-primary w-full" disabled={mutation.isPending}>
          {mutation.isPending ? 'Criando...' : 'Criar conta'}
        </button>
      </form>
      <p className="mt-6 text-center text-sm text-gray-600">
        Já tem conta?{' '}
        <Link href="/login" className="font-medium text-brand-600 hover:text-brand-700">
          Entrar
        </Link>
      </p>
    </div>
  );
}
