from django.urls import path

from .views import (
    ChapterCreateView,
    CourseCreateView,
    LessonCreateView,
    ModuleCreateView,
)

# Flat by default; a child nests one level under its immediate parent, because
# containment is strict composition. A bare `<uuid:...>` converter refuses a
# non-UUID segment before a view runs, and an unknown parent id is a 404.
urlpatterns = [
    path('courses/', CourseCreateView.as_view(), name='course-create'),
    path(
        'courses/<uuid:course_id>/modules/',
        ModuleCreateView.as_view(),
        name='module-create',
    ),
    path(
        'modules/<uuid:module_id>/chapters/',
        ChapterCreateView.as_view(),
        name='chapter-create',
    ),
    path(
        'chapters/<uuid:chapter_id>/lessons/',
        LessonCreateView.as_view(),
        name='lesson-create',
    ),
]
