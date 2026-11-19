import '@testing-library/jest-dom';
import { vi } from 'vitest';

// In unit tests, default API base URL to empty so endpoints remain relative
vi.stubEnv('VITE_API_BASE_URL', '');

const storageMock = (() => {
  let store: Record<string, string> = {};
  return {
    getItem: (key: string) => store[key] ?? null,
    setItem: (key: string, value: string) => {
      store[key] = String(value);
    },
    removeItem: (key: string) => {
      delete store[key];
    },
    clear: () => {
      store = {};
    },
    key: (index: number) => Object.keys(store)[index] ?? null,
    get length() {
      return Object.keys(store).length;
    },
  };
})();

// Provide storageMock to both window and globalThis in test environment
if (typeof window !== 'undefined') {
  Object.defineProperty(window, 'localStorage', {
    value: storageMock,
    configurable: true,
    writable: true,
  });
}

try {
  Object.defineProperty(globalThis, 'localStorage', {
    value: storageMock,
    configurable: true,
    writable: true,
  });
} catch {
  // Ignore if restricted
}
