'use client';

import { useMutation } from '@tanstack/react-query';
import { toast } from 'sonner';
import { api, extractApiError } from '@/lib/api/client';
import { useAuthStore, AuthUser } from '@/lib/stores/auth.store';

if (typeof window !== 'undefined') {
  console.log('%c[useAuth] módulo carregado — BUILD ' + Date.now(), 'color: hotpink; font-weight: bold');
}

interface LoginResponse {
  token?: string;
  access_token?: string;
  accessToken?: string;
  user?: AuthUser;
  data?: {
    token?: string;
    user?: AuthUser;
  };
}

const DEBUG = typeof window !== 'undefined' && process.env.NODE_ENV !== 'production';

function hardRedirect(path: string) {
  if (DEBUG) console.log('[useAuth] hardRedirect →', path);
  if (typeof window !== 'undefined') {
    window.location.assign(path);
  }
}

function extractAuthFromResponse(raw: unknown): { token: string; user: AuthUser } | null {
  console.log('[useAuth] resposta crua do backend:', raw);

  if (!raw || typeof raw !== 'object') {
    console.error('[useAuth] resposta não é objeto');
    return null;
  }

  const r = raw as LoginResponse;

  const token = r.token ?? r.access_token ?? r.accessToken ?? r.data?.token;
  const user = r.user ?? r.data?.user;

  if (!token) {
    console.error('[useAuth] token NÃO encontrado na resposta. Chaves disponíveis:', Object.keys(r));
    return null;
  }
  if (!user) {
    console.error('[useAuth] user NÃO encontrado na resposta. Chaves disponíveis:', Object.keys(r));
    return null;
  }

  console.log('[useAuth] extraído:', { hasToken: Boolean(token), user });
  return { token, user };
}

export function useLogin() {
  return useMutation({
    mutationFn: async (payload: { email: string; password: string }) => {
      console.log('[useAuth] useLogin.mutationFn chamado', { email: payload.email });
      try {
        const { data, status } = await api.post('/auth/login', payload);
        console.log('[useAuth] POST /auth/login respondeu', { status });
        return data;
      } catch (e) {
        console.error('[useAuth] POST /auth/login FALHOU', e);
        throw e;
      }
    },
    onSuccess: (data) => {
      console.log('[useAuth] onSuccess disparado');
      const extracted = extractAuthFromResponse(data);
      if (!extracted) {
        toast.error('Resposta de login inválida — veja o console');
        return;
      }
      useAuthStore.getState().setAuth(extracted.token, extracted.user);
      toast.success(`Bem-vindo, ${extracted.user.name}`);

      const stored = localStorage.getItem('auth-storage');
      console.log('[useAuth] APÓS setAuth, localStorage tem:', stored);

      setTimeout(() => hardRedirect('/conversas'), 50);
    },
    onError: (e) => {
      console.error('[useAuth] onError', e);
      toast.error(extractApiError(e));
    },
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
        toast.error('Resposta de registro inválida — veja o console');
        return;
      }
      useAuthStore.getState().setAuth(extracted.token, extracted.user);
      toast.success('Conta criada com sucesso!');
      setTimeout(() => hardRedirect('/conversas'), 50);
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
