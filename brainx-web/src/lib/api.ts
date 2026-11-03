import type { FieldValues, Path, UseFormSetError } from 'react-hook-form';
import { useAuthStore } from '@/features/auth/auth-store';

/**
 * Standard RFC 9457 error representation used across BrainX API.
 */
export interface ApiErrorEnvelope {
  type: string;
  title: string;
  status: number;
  detail: string;
  errors: Record<string, string[]>;
}

/**
 * Custom error thrown when the BrainX API rejects a request.
 */
export class ApiError extends Error {
  envelope: ApiErrorEnvelope;
  retryAfter?: number;

  constructor(envelope: ApiErrorEnvelope, retryAfter?: number) {
    super(envelope.detail || envelope.title || 'API Error');
    this.name = 'ApiError';
    this.envelope = envelope;
    this.retryAfter = retryAfter;
  }
}

export interface RequestOptions extends RequestInit {
  data?: unknown;
}

/**
 * Parse Retry-After header either as integer seconds or HTTP-date.
 */
function parseRetryAfter(headerValue: string | null): number | undefined {
  if (!headerValue) return undefined;

  const seconds = parseInt(headerValue, 10);
  if (!isNaN(seconds) && seconds >= 0) {
    return seconds;
  }

  const dateMs = Date.parse(headerValue);
  if (!isNaN(dateMs)) {
    return Math.max(0, Math.ceil((dateMs - Date.now()) / 1000));
  }

  return undefined;
}

/**
 * Typed HTTP client with RFC 9457 error parsing and Retry-After support.
 */
export async function apiClient<T = unknown>(
  endpoint: string,
  options: RequestOptions = {}
): Promise<T> {
  const { data, headers, ...rest } = options;

  const requestHeaders: Record<string, string> = {
    Accept: 'application/json',
    ...(headers as Record<string, string>),
  };

  const accessToken = useAuthStore.getState().accessToken;
  if (
    accessToken &&
    !requestHeaders['Authorization'] &&
    !requestHeaders['authorization']
  ) {
    requestHeaders['Authorization'] = `Bearer ${accessToken}`;
  }

  let body: BodyInit | undefined;
  if (data !== undefined) {
    if (typeof FormData !== 'undefined' && data instanceof FormData) {
      body = data;
      delete requestHeaders['Content-Type'];
      delete requestHeaders['content-type'];
    } else {
      requestHeaders['Content-Type'] = 'application/json';
      body = JSON.stringify(data);
    }
  }

  const baseUrl = (import.meta.env?.VITE_API_BASE_URL || '').replace(/\/$/, '');
  const url =
    endpoint.startsWith('http://') || endpoint.startsWith('https://')
      ? endpoint
      : `${baseUrl}${endpoint.startsWith('/') ? '' : '/'}${endpoint}`;

  const response = await fetch(url, {
    ...rest,
    headers: requestHeaders,
    body,
  });

  const text = await response.text();

  if (!response.ok) {
    let envelope: ApiErrorEnvelope;

    try {
      const json = text && text.trim() ? JSON.parse(text) : {};
      envelope = {
        type: json.type || 'about:blank',
        title: json.title || response.statusText || 'Error',
        status: typeof json.status === 'number' ? json.status : response.status,
        detail: json.detail || '',
        errors: json.errors && typeof json.errors === 'object' ? json.errors : {},
      };
    } catch {
      envelope = {
        type: 'about:blank',
        title: response.statusText || 'Error',
        status: response.status,
        detail: response.statusText || 'An unexpected error occurred.',
        errors: {},
      };
    }

    const retryAfter = parseRetryAfter(
      response.headers?.get ? response.headers.get('Retry-After') : null
    );

    const PUBLIC_ROUTES = [
      '/login',
      '/register',
      '/verify-email',
      '/forgot-password',
      '/reset-password',
      '/',
    ];

    const isLoginEndpoint = /(?:^|\/)login\/?$/.test(endpoint.split('?')[0]);
    if (response.status === 401 && !isLoginEndpoint) {
      const hadToken = Boolean(useAuthStore.getState().accessToken);
      useAuthStore.getState().clearAuth();

      if (typeof window !== 'undefined' && hadToken) {
        const currentPathname = window.location.pathname;
        const isPublicRoute = PUBLIC_ROUTES.includes(currentPathname);

        if (!isPublicRoute) {
          const currentPath =
            window.location.pathname + window.location.search + window.location.hash;
          const redirectUrl = `/login?returnUrl=${encodeURIComponent(currentPath)}`;
          try {
            if (typeof window.location.assign === 'function') {
              window.location.assign(redirectUrl);
            } else {
              window.location.href = redirectUrl;
            }
          } catch {
            try {
              window.location.href = redirectUrl;
            } catch {
              // Ignore in environments where navigation is restricted
            }
          }
        }
      }
    }

    throw new ApiError(envelope, retryAfter);
  }

  if (response.status === 204 || !text || text.trim() === '') {
    return {} as T;
  }

  return JSON.parse(text) as T;
}

/**
 * Maps server-side RFC 9457 field errors directly into react-hook-form state.
 * Accepts optional knownFields to route unmapped server field errors to nonFieldErrors.
 * Returns any non-field or general errors to be displayed in a top-level alert.
 */
export function applyApiErrorsToForm<T extends FieldValues>(
  errors: Record<string, string[] | string>,
  setError: UseFormSetError<T>,
  knownFields?: Array<Path<T>>
): string[] {
  const nonFieldErrors: string[] = [];

  for (const [field, rawMessages] of Object.entries(errors)) {
    if (!rawMessages) continue;
    const messages = Array.isArray(rawMessages) ? rawMessages : [String(rawMessages)];
    if (messages.length === 0) continue;

    const isNonFieldKey =
      field === 'non_field_errors' || field === '__all__' || field === 'detail';
    const isUnmappedField =
      knownFields !== undefined && !knownFields.includes(field as Path<T>);

    if (isNonFieldKey || isUnmappedField) {
      nonFieldErrors.push(...messages);
    } else {
      setError(field as Path<T>, {
        type: 'server',
        message: messages[0],
      });
    }
  }

  return nonFieldErrors;
}
