from django.urls import path

from .views import MeView, RegisterView, VerifyEmailView

urlpatterns = [
    path('register/', RegisterView.as_view(), name='register'),
    # Mirrors `FRONTEND_VERIFY_PATH`'s default, because that is the page the
    # emailed link already lands the SPA on and the page that POSTs the fragment
    # it read. Written out rather than read from the setting: that setting names
    # a frontend path and this is an API path, so a deployment that moves its
    # SPA should not silently move the API endpoint the SPA posts to.
    path('verify-email/', VerifyEmailView.as_view(), name='verify-email'),
    path('me/', MeView.as_view(), name='me'),
]
