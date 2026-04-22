'use client';

import { useForm } from 'react-hook-form';
import { zodResolver } from '@hookform/resolvers/zod';
import Link from 'next/link';
import { Store, User, Mail } from 'lucide-react';
import { useRegister } from '@/lib/hooks/useAuth';
import { registerSchema, type RegisterInput } from '@/lib/validation/schemas';
import { ValidatedInput } from '@/components/ui/ValidatedInput';
import { PasswordStrengthMeter } from '@/components/ui/PasswordStrengthMeter';

export default function RegisterPage() {
  const {
    register,
    handleSubmit,
    watch,
    formState: { errors, touchedFields, dirtyFields },
  } = useForm<RegisterInput>({
    resolver: zodResolver(registerSchema),
    mode: 'onBlur',
  });

  const mutation = useRegister();
  const password = watch('password') ?? '';

  const onSubmit = (data: RegisterInput) => mutation.mutate(data);

  const isFieldValid = (name: keyof RegisterInput) =>
    !errors[name] && (touchedFields[name] || dirtyFields[name]);

  return (
    <div>
      <h2 className="mb-6 text-xl font-semibold text-gray-900">Criar conta</h2>
      <form onSubmit={handleSubmit(onSubmit)} className="space-y-4" noValidate>
        <ValidatedInput
          label="Nome da loja"
          placeholder="Minha Loja de Eletrônicos"
          error={errors.tenantName?.message}
          isValid={isFieldValid('tenantName')}
          showValidIcon
          rightElement={<Store className="h-4 w-4 text-gray-400" />}
          {...register('tenantName')}
        />
        <ValidatedInput
          label="Seu nome"
          autoComplete="name"
          placeholder="João Silva"
          error={errors.name?.message}
          isValid={isFieldValid('name')}
          showValidIcon
          rightElement={<User className="h-4 w-4 text-gray-400" />}
          {...register('name')}
        />
        <ValidatedInput
          label="E-mail"
          type="email"
          autoComplete="email"
          placeholder="voce@loja.com"
          error={errors.email?.message}
          isValid={isFieldValid('email')}
          showValidIcon
          rightElement={<Mail className="h-4 w-4 text-gray-400" />}
          {...register('email')}
        />
        <div>
          <ValidatedInput
            label="Senha"
            type="password"
            autoComplete="new-password"
            placeholder="Mínimo 8 caracteres"
            error={errors.password?.message}
            {...register('password')}
          />
          <PasswordStrengthMeter password={password} />
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
