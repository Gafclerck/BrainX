const GUEST_ROUTES = new Set([
  '/login',
  '/register',
  '/forgot-password',
  '/reset-password',
]);

/**
 * Sanitizes returnUrl query parameter to prevent open redirects and login/guest loops.
 *
 * Rules:
 * - Safely decodes URI components if encoded.
 * - Extracts and normalizes the path component before query/hash.
 * - Only safe relative paths starting with a single '/' are permitted.
 * - Disallows protocol schemes (e.g. 'https://', 'http://', '://') and backslashes ('\\') on path.
 * - Disallows all guest routes (/login, /register, /forgot-password, /reset-password) even with trailing slashes or queries.
 * - Falls back to '/courses' on invalid or disallowed URLs.
 */
export function sanitizeReturnUrl(url: string | null | undefined): string {
  if (!url) return '/courses';
  let candidate = url.trim();
  if (!candidate) return '/courses';

  // Safely decode percent-encoded sequences
  if (candidate.includes('%')) {
    try {
      candidate = decodeURIComponent(candidate);
    } catch {
      return '/courses';
    }
  }

  candidate = candidate.trim();
  if (!candidate.startsWith('/')) {
    return '/courses';
  }

  // Extract path component before query string (?) or fragment hash (#)
  const queryOrHashIndex = candidate.search(/[?#]/);
  const pathPart = queryOrHashIndex === -1 ? candidate : candidate.slice(0, queryOrHashIndex);

  // Validate path component:
  // Must begin with a single slash, not protocol-relative '//' or Windows path '/\',
  // and must not contain backslashes or protocol schemes ('://')
  if (
    !pathPart.startsWith('/') ||
    pathPart.startsWith('//') ||
    pathPart.startsWith('/\\') ||
    pathPart.includes('\\') ||
    pathPart.includes('://')
  ) {
    return '/courses';
  }

  // Normalize path by stripping trailing slashes (preserving single root '/')
  const normalizedPath = pathPart === '/' ? '/' : pathPart.replace(/\/+$/, '');

  // Disallow all guest routes (/login, /register, /forgot-password, /reset-password)
  if (GUEST_ROUTES.has(normalizedPath.toLowerCase())) {
    return '/courses';
  }

  return candidate;
}
