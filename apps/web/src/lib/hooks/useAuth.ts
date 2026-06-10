'use client';

import { useMutation } from '@tanstack/react-query';
import { toast } from 'sonner';
import { api, extractApiError } from '@/lib/api/client';
import { useAuthStore, AuthUser } from '@/lib/stores/auth.store';

interface LoginResponse {
  token?: string;
  access_token?: string;
  accessToken?: string;
  user?: AuthUser;
  data?: { token?: string; user?: AuthUser };
}

function hardRedirect(path: string) {
  if (typeof window !== 'undefined') window.location.assign(path);
}

// Normaliza as diferentes formas de payload que o backend pode retornar.
function extractAuthFromResponse(raw: unknown): { token: string; user: AuthUser } | null {
  if (!raw || typeof raw !== 'object') return null;
  const r = raw as LoginResponse;
  const token = r.token ?? r.access_token ?? r.accessToken ?? r.data?.token;
  const user = r.user ?? r.data?.user;
  if (!token || !user) return null;
  return { token, user };
}

export function useLogin() {
  return useMutation({
    mutationFn: async (payload: { email: string; password: string }) => {
      const { data } = await api.post('/auth/login', payload);
      return data;
    },
    onSuccess: (data) => {
      const extracted = extractAuthFromResponse(data);
      if (!extracted) {
        toast.error('Resposta de login inválida');
        return;
      }
      useAuthStore.getState().setAuth(extracted.token, extracted.user);
      toast.success(`Bem-vindo, ${extracted.user.name}`);
      hardRedirect('/conversas');
    },
    onError: (e) => toast.error(extractApiError(e)),
  });
}

export function useRegister() {
  return useMutation({
    mutationFn: async (payload: {
      email: string;
      password: string;
      name: string;
      tenantName: string;
    }) => {
      const { data } = await api.post('/auth/register', payload);
      return data;
    },
    onSuccess: (data) => {
      const extracted = extractAuthFromResponse(data);
      if (!extracted) {
        toast.error('Resposta de registro inválida');
        return;
      }
      useAuthStore.getState().setAuth(extracted.token, extracted.user);
      toast.success('Conta criada com sucesso!');
      hardRedirect('/conversas');
    },
    onError: (e) => toast.error(extractApiError(e)),
  });
}

export function useLogout() {
  return () => {
    useAuthStore.getState().clearAuth();
    hardRedirect('/login');
  };
}

export function useCurrentUser() {
  return useAuthStore((s) => s.user);
}

export function useIsAuthenticated() {
  return useAuthStore((s) => Boolean(s.token && s.user));
}

export function useAuthHydrated() {
  return useAuthStore((s) => s._hydrated);
}
