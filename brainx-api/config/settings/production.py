from django.core.exceptions import ImproperlyConfigured

from .base import *

DEBUG = False
SECURE_SSL_REDIRECT = True
SESSION_COOKIE_SECURE = True
CSRF_COOKIE_SECURE = True
SECURE_CONTENT_TYPE_NOSNIFF = True
X_FRAME_OPTIONS = 'DENY'
SECURE_HSTS_SECONDS = 31536000
SECURE_HSTS_INCLUDE_SUBDOMAINS = True
SECURE_HSTS_PRELOAD = True

# Render (like most PaaS platforms) terminates TLS at its edge and forwards
# the request in HTTP with this header: without it, SECURE_SSL_REDIRECT
# loops forever.
SECURE_PROXY_SSL_HEADER = ('HTTP_X_FORWARDED_PROTO', 'https')

# Trusted origins for a cross-origin POST forwarded by the HTTPS edge.
CSRF_TRUSTED_ORIGINS = env.list('CSRF_TRUSTED_ORIGINS', default=[])

# In production, files must be stored on S3 (signed URLs): the 'local'
# backend would serve the bytes without authentication.
if env("STORAGE_BACKEND", default="local") != "s3":
    raise ImproperlyConfigured("STORAGE_BACKEND must be 's3' in production.")

# In production, emails must go out through a backend that actually delivers
# them: a console, locmem, dummy or filebased backend would dispatch the codes
# into the void, or into a local file, silently. The known non-delivering sinks
# are rejected rather than requiring exactly SMTP, so a legitimate provider
# backend (django-ses, anymail, ...) is not refused.
NON_DELIVERING_EMAIL_BACKENDS = (
    'django.core.mail.backends.console.EmailBackend',
    'django.core.mail.backends.locmem.EmailBackend',
    'django.core.mail.backends.dummy.EmailBackend',
    'django.core.mail.backends.filebased.EmailBackend',
)
if env(
    'EMAIL_BACKEND',
    default='django.core.mail.backends.console.EmailBackend',
) in NON_DELIVERING_EMAIL_BACKENDS:
    raise ImproperlyConfigured(
        "EMAIL_BACKEND must be a delivering backend in production; the "
        "console, locmem, dummy and filebased backends do not deliver mail."
    )

# Throttling is the only bound on how fast the four email-driving endpoints
# can send mail (AD-17), so production refuses to boot without it: a missing
# throttle class or a missing/None scope rate would come up as a 500 on the
# first request, or - worse - as an unthrottled endpoint (Story 1.7 AC 6).
# The backstop scope is guarded exactly like the destination scopes, since a
# `None` silently disables it and a missing key 500s on the first request.
if 'rest_framework.throttling.ScopedRateThrottle' not in REST_FRAMEWORK.get(
        'DEFAULT_THROTTLE_CLASSES', []):
    raise ImproperlyConfigured(
        "ScopedRateThrottle must be in "
        "REST_FRAMEWORK['DEFAULT_THROTTLE_CLASSES'] in production."
    )

REQUIRED_THROTTLE_SCOPES = ('register', 'forgot', 'reset', 'activate', 'source')
_throttle_rates = REST_FRAMEWORK.get('DEFAULT_THROTTLE_RATES', {})
_missing_throttle_scopes = [
    scope
    for scope in REQUIRED_THROTTLE_SCOPES
    if _throttle_rates.get(scope) is None
]
if _missing_throttle_scopes:
    raise ImproperlyConfigured(
        "REST_FRAMEWORK['DEFAULT_THROTTLE_RATES'] must declare a rate for "
        "scope(s): " + ', '.join(_missing_throttle_scopes) + "."
    )
