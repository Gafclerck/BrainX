import React, { type ReactElement } from 'react';
import { render, type RenderOptions } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { MemoryRouter, type MemoryRouterProps } from 'react-router-dom';
import { vi } from 'vitest';
import { useAuthStore, type UserProfile } from '@/features/auth/auth-store';

export interface RenderWithProvidersOptions extends Omit<RenderOptions, 'wrapper'> {
  route?: string;
  routerOptions?: Omit<MemoryRouterProps, 'children'>;
  auth?: {
    accessToken?: string | null;
    refreshToken?: string | null;
    user?: UserProfile | null;
    isPublisher?: boolean;
  };
}

/**
 * Custom render helper that automatically wraps the tested component
 * in MemoryRouter and configures initial auth store state if specified.
 */
export function renderWithProviders(
  ui: ReactElement,
  {
    route = '/',
    routerOptions = {},
    auth,
    ...renderOptions
  }: RenderWithProvidersOptions = {}
) {
  if (auth) {
    if (auth.accessToken && auth.refreshToken) {
      useAuthStore.getState().setTokens({
        access: auth.accessToken,
        refresh: auth.refreshToken,
      });
    }
    if (auth.user !== undefined) {
      useAuthStore.getState().setUser(auth.user);
    }
    if (auth.isPublisher !== undefined) {
      useAuthStore.getState().setIsPublisher(auth.isPublisher);
    }
  }

  function Wrapper({ children }: { children: React.ReactNode }) {
    const initialEntries = routerOptions.initialEntries || [route];
    return (
      <MemoryRouter initialEntries={initialEntries} {...routerOptions}>
        {children}
      </MemoryRouter>
    );
  }

  return {
    user: userEvent.setup(),
    ...render(ui, { wrapper: Wrapper, ...renderOptions }),
  };
}

/**
 * Creates a standard mock Response object for globalThis.fetch,
 * with text(), json(), status, and headers properly configured.
 */
export function createMockResponse(
  data: unknown,
  status = 200,
  headers: Record<string, string> = {}
) {
  const isJson = typeof data === 'object' && data !== null;
  const bodyText = isJson ? JSON.stringify(data) : String(data ?? '');
  return Promise.resolve({
    ok: status >= 200 && status < 300,
    status,
    statusText: status === 200 ? 'OK' : 'Error',
    text: () => Promise.resolve(bodyText),
    json: () => Promise.resolve(data),
    headers: new Headers({
      'content-type': isJson ? 'application/json' : 'text/plain',
      ...headers,
    }),
  });
}

/**
 * Creates an RFC 9457 compliant error Response mock.
 */
export function createMockErrorResponse(
  status: number,
  detail: string | Record<string, unknown> = 'An error occurred'
) {
  const errorBody = typeof detail === 'string' ? { detail } : detail;
  return createMockResponse(errorBody, status);
}

/**
 * Helper to build a fetch spy mapped to route substrings.
 */
export function setupMockFetch(
  routes: Record<string, unknown | ((url: string, init?: RequestInit) => unknown)>
) {
  return vi.fn().mockImplementation((url: string, init?: RequestInit) => {
    for (const [routePattern, handler] of Object.entries(routes)) {
      if (url.includes(routePattern)) {
        if (typeof handler === 'function') {
          const result = handler(url, init);
          return createMockResponse(result);
        }
        return createMockResponse(handler);
      }
    }
    return Promise.reject(new Error(`Unhandled fetch URL: ${url}`));
  });
}

// Re-export testing library utilities for clean single-source imports in tests
export * from '@testing-library/react';
export { userEvent };
