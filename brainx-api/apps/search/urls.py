from django.urls import path

from .views import (
    SearchLessonView,
    SearchSessionAbandonView,
    SearchSessionCloseView,
)

# The search surface endpoints under the shared `search/` prefix.
# The query text rides as query parameters, and session identifiers ride
# in request bodies, headers, or cookies - never in URL paths or query params.
urlpatterns = [
    path(
        'search/lessons/',
        SearchLessonView.as_view(),
        name='search-lessons',
    ),
    path(
        'search/sessions/close/',
        SearchSessionCloseView.as_view(),
        name='search-sessions-close',
    ),
    path(
        'search/sessions/abandon/',
        SearchSessionAbandonView.as_view(),
        name='search-sessions-abandon',
    ),
]
