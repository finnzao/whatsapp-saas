'use client';

import { create } from 'zustand';

export interface AuthUser {
  id: string;
  email: string;
  name: string;
  role: string;
  tenantId: string;
}

interface AuthState {
  token: string | null;
  user: AuthUser | null;
  _hydrated: boolean;
  setAuth: (token: string, user: AuthUser) => void;
  clearAuth: () => void;
  hydrate: () => void;
}

const STORAGE_KEY = 'auth-storage';

interface PersistedShape {
  token: string | null;
  user: AuthUser | null;
}

function readFromStorage(): PersistedShape {
  if (typeof window === 'undefined') return { token: null, user: null };
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    if (!raw) return { token: null, user: null };
    const parsed = JSON.parse(raw) as PersistedShape;
    return { token: parsed?.token ?? null, user: parsed?.user ?? null };
  } catch {
    return { token: null, user: null };
  }
}

function writeToStorage(token: string | null, user: AuthUser | null) {
  if (typeof window === 'undefined') return;
  try {
    if (token && user) {
      localStorage.setItem(STORAGE_KEY, JSON.stringify({ token, user }));
    } else {
      localStorage.removeItem(STORAGE_KEY);
    }
  } catch {
    // localStorage indisponível (modo privado/quota): estado segue só em memória.
  }
}

export const useAuthStore = create<AuthState>((set, get) => ({
  token: null,
  user: null,
  _hydrated: false,

  setAuth: (token, user) => {
    writeToStorage(token, user);
    set({ token, user, _hydrated: true });
  },

  clearAuth: () => {
    writeToStorage(null, null);
    set({ token: null, user: null });
  },

  hydrate: () => {
    if (get()._hydrated) return;
    const { token, user } = readFromStorage();
    set({ token, user, _hydrated: true });
  },
}));

// Hidrata no carregamento do módulo e sincroniza entre abas.
if (typeof window !== 'undefined') {
  useAuthStore.getState().hydrate();
  window.addEventListener('storage', (e) => {
    if (e.key !== STORAGE_KEY) return;
    const { token, user } = readFromStorage();
    useAuthStore.setState({ token, user });
  });
}

export function getAuthToken(): string | null {
  if (typeof window === 'undefined') return null;
  return useAuthStore.getState().token ?? readFromStorage().token;
}
