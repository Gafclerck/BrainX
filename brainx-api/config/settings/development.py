from .base import *

DEBUG = True
ALLOWED_HOSTS = ['localhost', '127.0.0.1']
CORS_ALLOW_ALL_ORIGINS = True

# Email: defined in base.py via the env (console default). Do not override it
# here, otherwise the env could not enable SMTP in development.

# Throttling neutralised in development to keep testing easy (reset-password,
# etc.). The rates dict replaces base's wholesale rather than spreading it, so
# a forgotten key cannot leak in as a live rate: it is `get_rate`'s KeyError
# becoming `ImproperlyConfigured` on the first request. Every scope the views
# use must therefore be listed here as `None`.
REST_FRAMEWORK = {
    **REST_FRAMEWORK,
    'DEFAULT_THROTTLE_CLASSES': [],
    'DEFAULT_THROTTLE_RATES': {
        'anon': None,
        'user': None,
        'login': None,
        'register': None,
        'forgot': None,
        'reset': None,
        'activate': None,
        'source': None,
    },
}
