import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { useConfigStore } from './config-store';

describe('Story 1.3: ConfigStore (useConfigStore)', () => {
  const originalFetch = globalThis.fetch;

  beforeEach(() => {
    vi.restoreAllMocks();
    vi.stubEnv('VITE_PUBLIC_BROWSING', 'false');
    useConfigStore.getState().resetConfig();
  });

  afterEach(() => {
    vi.unstubAllEnvs();
    globalThis.fetch = originalFetch;
  });

  it('initializes publicBrowsing synchronously based on VITE_PUBLIC_BROWSING', () => {
    vi.stubEnv('VITE_PUBLIC_BROWSING', 'true');
    useConfigStore.getState().resetConfig();
    expect(useConfigStore.getState().publicBrowsing).toBe(true);

    vi.stubEnv('VITE_PUBLIC_BROWSING', 'false');
    useConfigStore.getState().resetConfig();
    expect(useConfigStore.getState().publicBrowsing).toBe(false);
  });

  it('updates publicBrowsing state via setPublicBrowsing', () => {
    useConfigStore.getState().setPublicBrowsing(true);
    expect(useConfigStore.getState().publicBrowsing).toBe(true);

    useConfigStore.getState().setPublicBrowsing(false);
    expect(useConfigStore.getState().publicBrowsing).toBe(false);
  });

  it('fetches server config via GET /api/v1/config/ and updates publicBrowsing', async () => {
    globalThis.fetch = vi.fn().mockImplementation((url: string) => {
      if (url.includes('/api/v1/config/')) {
        return Promise.resolve({
          ok: true,
          status: 200,
          text: () => Promise.resolve(JSON.stringify({ public_browsing: true })),
          headers: new Headers({ 'content-type': 'application/json' }),
        });
      }
      return Promise.reject(new Error('Unknown URL'));
    });

    useConfigStore.getState().setPublicBrowsing(false);
    const result = await useConfigStore.getState().fetchPublicConfig();

    expect(result).toBe(true);
    expect(useConfigStore.getState().publicBrowsing).toBe(true);
  });

  it('gracefully falls back to VITE_PUBLIC_BROWSING when fetchPublicConfig fails', async () => {
    vi.stubEnv('VITE_PUBLIC_BROWSING', 'true');
    globalThis.fetch = vi.fn().mockRejectedValue(new Error('Network error'));

    useConfigStore.getState().setPublicBrowsing(false);
    const result = await useConfigStore.getState().fetchPublicConfig();

    expect(result).toBe(true);
    expect(useConfigStore.getState().publicBrowsing).toBe(true);
  });
});
