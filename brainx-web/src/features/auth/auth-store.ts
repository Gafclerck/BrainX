import { create } from 'zustand';
import { persist, createJSONStorage, type StateStorage } from 'zustand/middleware';

export interface UserProfile {
  id?: string;
  email?: string;
  is_publisher?: boolean;
  [key: string]: unknown;
}

export interface AuthTokens {
  access: string;
  refresh: string;
}

export interface AuthState {
  accessToken: string | null;
  refreshToken: string | null;
  user: UserProfile | null;
  isPublisher: boolean;
  setTokens: (tokens: { access: string; refresh: string }) => void;
  setUser: (user: UserProfile | null) => void;
  clearAuth: () => void;
  logout: () => void;
}

const memoryStore: Record<string, string> = {};

const getSafeStorage = (): StateStorage => {
  try {
    if (typeof window !== 'undefined' && window.localStorage) {
      return window.localStorage;
    }
  } catch {
    // window.localStorage access may throw in restricted contexts (e.g. sandboxed iframes)
  }

  return {
    getItem: (key: string) => memoryStore[key] ?? null,
    setItem: (key: string, value: string) => {
      memoryStore[key] = value;
    },
    removeItem: (key: string) => {
      delete memoryStore[key];
    },
  };
};

export const useAuthStore = create<AuthState>()(
  persist(
    (set) => ({
      accessToken: null,
      refreshToken: null,
      user: null,
      isPublisher: false,
      setTokens: ({ access, refresh }: { access: string; refresh: string }) =>
        set({
          accessToken: access,
          refreshToken: refresh,
        }),
      setUser: (user: UserProfile | null) =>
        set({
          user,
          isPublisher: Boolean(user?.is_publisher),
        }),
      clearAuth: () =>
        set({
          accessToken: null,
          refreshToken: null,
          user: null,
          isPublisher: false,
        }),
      logout: () =>
        set({
          accessToken: null,
          refreshToken: null,
          user: null,
          isPublisher: false,
        }),
    }),
    {
      name: 'brainx_auth_tokens',
      storage: createJSONStorage(getSafeStorage),
      partialize: (state) => ({
        accessToken: state.accessToken,
        refreshToken: state.refreshToken,
        user: state.user,
      }),
    }
  )
);
