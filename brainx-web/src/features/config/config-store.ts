import { create } from 'zustand';
import { apiClient } from '@/lib/api';

export interface SystemConfigResponse {
  public_browsing: boolean;
  [key: string]: unknown;
}

export interface ConfigState {
  publicBrowsing: boolean;
  setPublicBrowsing: (val: boolean) => void;
  resetConfig: () => void;
  fetchPublicConfig: () => Promise<boolean>;
}

export const useConfigStore = create<ConfigState>((set, get) => ({
  publicBrowsing: import.meta.env.VITE_PUBLIC_BROWSING === 'true',
  setPublicBrowsing: (val: boolean) => set({ publicBrowsing: val }),
  resetConfig: () => set({ publicBrowsing: import.meta.env.VITE_PUBLIC_BROWSING === 'true' }),
  fetchPublicConfig: async () => {
    try {
      const data = await apiClient<SystemConfigResponse>('/api/v1/config/');
      if (data && typeof data.public_browsing === 'boolean') {
        set({ publicBrowsing: data.public_browsing });
        return data.public_browsing;
      }
    } catch {
      // Graceful fallback to VITE_PUBLIC_BROWSING env value without crashing
      const fallback = import.meta.env.VITE_PUBLIC_BROWSING === 'true';
      set({ publicBrowsing: fallback });
      return fallback;
    }
    return get().publicBrowsing;
  },
}));

export const fetchPublicConfig = () => useConfigStore.getState().fetchPublicConfig();
