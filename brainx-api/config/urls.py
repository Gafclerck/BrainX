"""
URL configuration for config project.

The `urlpatterns` list routes URLs to views. For more information please see:
    https://docs.djangoproject.com/en/6.1/topics/http/urls/
Examples:
Function views
    1. Add an import:  from my_app import views
    2. Add a URL to urlpatterns:  path('', views.home, name='home')
Class-based views
    1. Add an import:  from other_app.views import Home
    2. Add a URL to urlpatterns:  path('', Home.as_view(), name='home')
Including another URLconf
    1. Import the include() function: from django.urls import include, path
    2. Add a URL to urlpatterns:  path('blog/', include('blog.urls'))
"""
from django.conf import settings
from django.urls import include, path
from drf_spectacular.views import SpectacularAPIView, SpectacularSwaggerView

# Read from the resolved settings, not from `config.settings.base`, so the
# mounts follow whichever settings module is active. `API_PREFIX` keeps its
# leading slash so it reads as a full path prefix; a `path()` route must not
# carry one, or every mount warns urls.W002.
API_MOUNT = settings.API_PREFIX.lstrip('/')

# `SPECTACULAR_SETTINGS` deliberately sets no `SERVE_PERMISSIONS`, so the schema
# and the Swagger UI stay anonymously readable at the drf-spectacular default
# even though `REST_FRAMEWORK` pins `IsAuthenticated` for the API itself. That
# is a decision, not an oversight: the schema is generated from the code and
# describes the contract rather than any account's data, and the UI renders
# that same document. `SERVE_PERMISSIONS` is the single place to change it.
# `SERVE_AUTHENTICATION` is set for the same decision, because its default of
# `None` would fall back to the project's authenticators and 401 a request that
# carries a bad `Bearer` header. Both settings move together.

# `Resolver404` is raised by Django's base handler before any DRF view runs, so
# an unmatched route never reaches `brainx_exception_handler`. `handler404`
# builds the same five-key envelope in `apps.core.views`.
handler404 = 'apps.core.views.handler404'

urlpatterns = [
    path(f'{API_MOUNT}/', include('apps.users.urls')),
    path(f'{API_MOUNT}/', include('apps.content.urls')),
    path(f'{API_MOUNT}/', include('apps.search.urls')),
    path(f'{API_MOUNT}/', include('apps.core.urls')),
    path(f'{API_MOUNT}/schema/', SpectacularAPIView.as_view(), name='schema'),
    path(
        f'{API_MOUNT}/docs/',
        SpectacularSwaggerView.as_view(url_name='schema'),
        name='swagger-ui',
    ),
]
