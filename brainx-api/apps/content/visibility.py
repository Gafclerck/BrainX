"""The one container-visibility predicate Browse uses and Search will (AD-2).

A Lesson is the only row with a publication axis, so it is the only row whose
visibility can be judged on its own. A container is visible exactly when it is
live, not soft-deleted, and holds at least one visible child: a Chapter needs a
visible Lesson, a Module a visible Chapter, a Course a visible Module. This
module owns that one rule, and owns it alone - Browse calls it today and Search
will (Story 5.4) rather than each repeating the walk, so the surfaces cannot
drift apart.

The predicate is computed, never denormalised: there is no `is_visible` column
and no cached tree. It is evaluated per request, bottom-up from Lesson, and
returns the three container querysets so a listing can intersect with them.
Every step is a `pk__in` subquery, so one request runs a fixed number of
queries regardless of how wide or deep the tree is - the walk is bounded at the
four levels of the content tree, and no subquery is executed on its own.

It uses the Student read port (`Lesson.objects.visible()`) to seed the walk and
the container `visible()` port for the container sets, without adding a new
queryset selector, so the port guard on `ContentQuerySet` stays at exactly
`visible`, `manageable` and `with_deleted`. Consumers pass the returned
querysets straight to `order_containers()` or to `get_object_or_404()` when
resolving a parent, so a hidden or nonexistent parent id produces the same 404
as the predicate itself does.
"""

from collections import namedtuple

from .models import Chapter, Course, Lesson, Module

# The visible containers a request needs, each a lazy queryset of live
# rows with at least one visible descendant Lesson.
VisibleContent = namedtuple(
    'VisibleContent', ('courses', 'modules', 'chapters')
)


def visible_content():
    """The visible Course, Module and Chapter querysets, computed bottom-up.

    The base is `Lesson.objects.visible()`, the one level that carries the
    publication axis; each container above it is the live rows of that level
    whose id appears in the visible set below, which is the recursive descent
    the epic's container-visibility decision describes. The final two filters
    tie each Chapter and Module to a fully visible ancestor chain, so a live
    child of a hidden parent stays unreachable even if the flags ever disagree.
    """
    lesson_chapters = Lesson.objects.visible().values('chapter_id')
    chapters = Chapter.objects.visible().filter(pk__in=lesson_chapters)

    chapter_modules = chapters.values('module_id')
    modules = Module.objects.visible().filter(pk__in=chapter_modules)

    module_courses = modules.values('course_id')
    courses = Course.objects.visible().filter(pk__in=module_courses)

    # A Module is visible only under a visible Course, and a Chapter only under
    # a visible Module, so the sets above intersect to the fully visible tree.
    modules = modules.filter(course_id__in=courses.values('pk'))
    chapters = chapters.filter(module_id__in=modules.values('pk'))

    return VisibleContent(
        courses=courses,
        modules=modules,
        chapters=chapters,
    )
