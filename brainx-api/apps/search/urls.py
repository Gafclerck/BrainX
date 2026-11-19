from django.urls import path

from .views import SearchLessonView

# The search surface is one Student endpoint under its own `search/` prefix,
# so it can never collide with a Publisher or a browse route. The query text
# and the optional sort ride as query parameters, never in the path.
urlpatterns = [
    path(
        'search/lessons/',
        SearchLessonView.as_view(),
        name='search-lessons',
    ),
]
