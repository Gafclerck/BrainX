from django.urls import path

from .views import (
    ChapterCreateView,
    ChapterLessonsReorderView,
    ChapterUpdateView,
    CourseCreateView,
    CourseModulesReorderView,
    CourseUpdateView,
    LessonCreateView,
    LessonMoveView,
    LessonUpdateView,
    ModuleChaptersReorderView,
    ModuleCreateView,
    ModuleUpdateView,
)

# Flat by default; a child nests one level under its immediate parent, because
# containment is strict composition. A bare `<uuid:...>` converter refuses a
# non-UUID segment before a view runs, and an unknown parent id is a 404. The
# detail routes address a row by its own UUID and are the update surface; the
# parent link is not part of them because an edit never moves a row.
urlpatterns = [
    path('courses/', CourseCreateView.as_view(), name='course-create'),
    path(
        'courses/<uuid:course_id>/',
        CourseUpdateView.as_view(),
        name='course-update',
    ),
    path(
        'courses/<uuid:course_id>/modules/',
        ModuleCreateView.as_view(),
        name='module-create',
    ),
    path(
        'modules/<uuid:module_id>/',
        ModuleUpdateView.as_view(),
        name='module-update',
    ),
    path(
        'modules/<uuid:module_id>/chapters/',
        ChapterCreateView.as_view(),
        name='chapter-create',
    ),
    path(
        'chapters/<uuid:chapter_id>/',
        ChapterUpdateView.as_view(),
        name='chapter-update',
    ),
    path(
        'chapters/<uuid:chapter_id>/lessons/',
        LessonCreateView.as_view(),
        name='lesson-create',
    ),
    path(
        'lessons/<uuid:lesson_id>/',
        LessonUpdateView.as_view(),
        name='lesson-update',
    ),
    path(
        'courses/<uuid:course_id>/modules/order/',
        CourseModulesReorderView.as_view(),
        name='module-reorder',
    ),
    path(
        'modules/<uuid:module_id>/chapters/order/',
        ModuleChaptersReorderView.as_view(),
        name='chapter-reorder',
    ),
    path(
        'chapters/<uuid:chapter_id>/lessons/order/',
        ChapterLessonsReorderView.as_view(),
        name='lesson-reorder',
    ),
    path(
        'lessons/<uuid:lesson_id>/move/',
        LessonMoveView.as_view(),
        name='lesson-move',
    ),
]
