"""The shared ordering rules for the content tree (AD-7, Epic 5).

This module owns the single total order used by browse and search so they can
never drift apart. It is kept separate from `models.py` to avoid changing the
Publisher `Meta.ordering` (the Publisher listings keep ordering by `position,
id`). "Single" here means every Student-facing list derives its ordering from
this module instead of declaring its own; the model defaults stay because the
Publisher listings rely on them, and a new listing must call these helpers
rather than trust the model ordering.
"""

from django.db.models import F

# Lesson order: newest course date, then the container positions, then `id`.
# `id` is the final key of every order below, which is what keeps page-number
# pagination stable when the preceding keys tie.
LESSON_ORDER = (
    '-course_date',
    'chapter__module__position',
    'chapter__position',
    'position',
    'id',
)

# Containers have no course date; they order by their own position, then `id`.
CONTAINER_ORDER = ('position', 'id')

# Resource has no position, so `id` alone is its final (and only) key.
RESOURCE_ORDER = ('id',)


def lesson_order(relevance=None):
    """The Lesson keys, with an optional relevance axis in place.

    With no `relevance`, the browsing order constant is returned unchanged. A
    caller may pass the axis as a field or annotation name string (e.g.
    `'similarity'`), or as a ready expression such as
    `TrigramWordSimilarity(...)`. Either way the axis is descending and sits
    after the date and before the three container positions.
    """
    if relevance is None:
        return LESSON_ORDER

    return (
        '-course_date',
        _descending(relevance),
        'chapter__module__position',
        'chapter__position',
        'position',
        'id',
    )


def _descending(relevance):
    """The relevance key, descending, from a name string or a ready expression."""
    if isinstance(relevance, str):
        return F(relevance).desc()
    return relevance.desc()


def order_lessons(queryset, *, relevance=None):
    """Apply the Lesson total order, replacing any ordering already set.

    Browse and search call this so they cannot disagree on the order. Search
    passes the relevance axis; browse leaves it out. The final key is always
    `id`, never an audit timestamp.
    """
    return queryset.order_by(*lesson_order(relevance=relevance))


def order_containers(queryset):
    """Order Courses, Modules or Chapters by `position`, then `id`."""
    return queryset.order_by(*CONTAINER_ORDER)


def order_resources(queryset):
    """Order Resources by `id` - they carry no position."""
    return queryset.order_by(*RESOURCE_ORDER)
