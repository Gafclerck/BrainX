from .base import *

DEBUG = True
ALLOWED_HOSTS = ['localhost', '127.0.0.1']
CORS_ALLOW_ALL_ORIGINS = True

# Email : défini dans base.py via l'env (défaut console). Ne pas surcharger ici,
# sinon l'env ne pourrait pas activer le SMTP en développement.

# Throttling neutralisé en développement pour faciliter les tests (reset-password, etc.)
REST_FRAMEWORK = {
    **REST_FRAMEWORK,
    'DEFAULT_THROTTLE_CLASSES': [],
    'DEFAULT_THROTTLE_RATES': {
        'anon': None,
        'user': None,
        'login': None,
        'forgot': None,
        'reset': None,
        'activate': None,
    },
}