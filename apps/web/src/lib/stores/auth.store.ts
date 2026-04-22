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
const DEBUG = typeof window !== 'undefined' && process.env.NODE_ENV !== 'production';

if (typeof window !== 'undefined') {
  console.log('%c[auth.store] módulo carregado — BUILD ' + Date.now(), 'color: cyan; font-weight: bold');
}

function log(...args: unknown[]) {
  if (DEBUG) console.log('[auth.store]', ...args);
}

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
    return {
      token: parsed?.token ?? null,
      user: parsed?.user ?? null,
    };
  } catch (e) {
    log('read error', e);
    return { token: null, user: null };
  }
}

function writeToStorage(token: string | null, user: AuthUser | null) {
  if (typeof window === 'undefined') return;
  try {
    if (token && user) {
      const payload: PersistedShape = { token, user };
      const serialized = JSON.stringify(payload);
      localStorage.setItem(STORAGE_KEY, serialized);
      const verify = localStorage.getItem(STORAGE_KEY);
      log('write OK, verify:', verify?.slice(0, 60) + '...');
    } else {
      localStorage.removeItem(STORAGE_KEY);
      log('remove OK');
    }
  } catch (e) {
    log('write ERROR', e);
  }
}

export const useAuthStore = create<AuthState>((set, get) => ({
  token: null,
  user: null,
  _hydrated: false,

  setAuth: (token, user) => {
    log('setAuth chamado', { email: user.email, tokenPrefix: token.slice(0, 20) });
    writeToStorage(token, user);
    set({ token, user, _hydrated: true });
  },

  clearAuth: () => {
    const stack = new Error().stack?.split('\n').slice(1, 5).join('\n');
    log('clearAuth chamado por:\n' + stack);
    writeToStorage(null, null);
    set({ token: null, user: null });
  },

  hydrate: () => {
    const current = get();
    if (current._hydrated) return;
    const persisted = readFromStorage();
    log('hydrate', { hasToken: Boolean(persisted.token) });
    set({
      token: persisted.token,
      user: persisted.user,
      _hydrated: true,
    });
  },
}));

if (typeof window !== 'undefined') {
  useAuthStore.getState().hydrate();

  window.addEventListener('storage', (e) => {
    if (e.key !== STORAGE_KEY) return;
    log('cross-tab storage event');
    const persisted = readFromStorage();
    useAuthStore.setState({
      token: persisted.token,
      user: persisted.user,
    });
  });
}

export function getAuthToken(): string | null {
  if (typeof window === 'undefined') return null;
  const fromStore = useAuthStore.getState().token;
  if (fromStore) return fromStore;
  return readFromStorage().token;
}
