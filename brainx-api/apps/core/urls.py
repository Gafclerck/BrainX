from django.urls import path

from .views import healthz, system_config

# Namespaced so the routes this app adds under `API_PREFIX` cannot collide with
# the users app, which is mounted at the same prefix and reverses by bare name.
app_name = 'core'

urlpatterns = [
    path('healthz/', healthz, name='healthz'),
    path('config/', system_config, name='config'),
]
