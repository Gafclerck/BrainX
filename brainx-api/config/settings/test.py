"""Test-specific settings (Epic 1, Story 1.1).

Inherits from `development.py` and applies Django's official recommendations
for fast, isolated testing:
1. Fast password hashing via MD5PasswordHasher (eliminates PBKDF2 CPU bottleneck).
2. InMemoryStorage for default file uploads to eliminate filesystem I/O.
3. Isolated in-memory cache for rate-limiting / throttling tests.
"""

from .development import *

# Speed up tests drastically by avoiding expensive PBKDF2/Argon2 hashing.
# Recommended by Django official documentation: "Speeding up the tests".
PASSWORD_HASHERS = [
    'django.contrib.auth.hashers.MD5PasswordHasher',
]

# Use in-memory storage for test uploads instead of writing to disk.
STORAGES = {
    'default': {
        'BACKEND': 'django.core.files.storage.InMemoryStorage',
    },
    'staticfiles': {
        'BACKEND': 'django.contrib.staticfiles.storage.StaticFilesStorage',
    },
}

# Dedicated fast local-memory cache for throttling and caching tests.
CACHES = {
    'default': {
        'BACKEND': 'django.core.cache.backends.locmem.LocMemCache',
        'LOCATION': 'brainx-test-cache',
    }
}

# Ensure public browsing is deterministic in test suite (default False)
# Individual tests override with @override_settings(BRAINX_PUBLIC_BROWSING=True).
BRAINX_PUBLIC_BROWSING = False

