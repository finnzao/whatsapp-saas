'use client';

import axios, { AxiosError } from 'axios';
import { getAuthToken, useAuthStore } from '@/lib/stores/auth.store';

const DEBUG = typeof window !== 'undefined' && process.env.NODE_ENV !== 'production';

export const api = axios.create({
  baseURL: process.env.NEXT_PUBLIC_API_URL ?? 'http://localhost:3001',
  timeout: 60_000,
});

api.interceptors.request.use((config) => {
  const token = getAuthToken();
  if (token) {
    config.headers.Authorization = `Bearer ${token}`;
  }
  return config;
});

api.interceptors.response.use(
  (r) => r,
  (error: AxiosError) => {
    if (error.response?.status === 401) {
      const state = useAuthStore.getState();
      const path = typeof window !== 'undefined' ? window.location.pathname : '';
      const isAuthRoute = path === '/login' || path === '/register';

      if (DEBUG) {
        console.warn('[api] 401', {
          url: error.config?.url,
          path,
          hadToken: Boolean(state.token),
          hydrated: state._hydrated,
        });
      }

      if (state._hydrated && state.token && !isAuthRoute) {
        state.clearAuth();
        if (typeof window !== 'undefined') {
          window.location.assign('/login');
        }
      }
    }
    return Promise.reject(error);
  },
);

export function extractApiError(err: unknown): string {
  if (axios.isAxiosError(err)) {
    const data = err.response?.data as any;
    if (data?.message) {
      return Array.isArray(data.message) ? data.message.join(', ') : data.message;
    }
    if (err.message) return err.message;
  }
  if (err instanceof Error) return err.message;
  return 'Erro desconhecido';
}
