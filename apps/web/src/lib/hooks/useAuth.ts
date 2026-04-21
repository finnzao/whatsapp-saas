'use client';

import { useMutation } from '@tanstack/react-query';
import { useRouter } from 'next/navigation';
import { toast } from 'sonner';

import { api, extractApiError } from '@/lib/api/client';
import { useAuthStore, User } from '@/stores/auth.store';

interface LoginPayload {
  email: string;
  password: string;
}

interface RegisterPayload {
  email: string;
  password: string;
  name: string;
  tenantName: string;
}

interface AuthResponse {
  accessToken: string;
  user: User;
}

export function useLogin() {
  const router = useRouter();
  const setAuth = useAuthStore((s) => s.setAuth);

  return useMutation({
    mutationFn: async (payload: LoginPayload) => {
      const { data } = await api.post<AuthResponse>('/auth/login', payload);
      return data;
    },
    onSuccess: (data) => {
      setAuth(data.accessToken, data.user);
      toast.success('Login realizado com sucesso');
      router.push('/conversas');
    },
    onError: (error) => {
      toast.error(extractApiError(error));
    },
  });
}

export function useRegister() {
  const router = useRouter();
  const setAuth = useAuthStore((s) => s.setAuth);

  return useMutation({
    mutationFn: async (payload: RegisterPayload) => {
      const { data } = await api.post<AuthResponse>('/auth/register', payload);
      return data;
    },
    onSuccess: (data) => {
      setAuth(data.accessToken, data.user);
      toast.success('Conta criada com sucesso');
      router.push('/configuracoes');
    },
    onError: (error) => {
      toast.error(extractApiError(error));
    },
  });
}

export function useLogout() {
  const router = useRouter();
  const logout = useAuthStore((s) => s.logout);
  return () => {
    logout();
    router.push('/login');
  };
}
