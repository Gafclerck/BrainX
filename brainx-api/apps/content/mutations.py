"""The one write port for content rows (Story 2.2).

Every content row enters the database through `mutate`, and every later change
to one goes back through it, and nothing else does: a view validates input and
hands the acting user over - it has resolved the parent and the position for a
create, and the row itself for an update - but never calls `save()` on a content
row itself, and no code calls `queryset.update()` on one. The actor is an
explicit argument that views fill from `request.user`; it is never read from a
payload, and `last_modified_by` is read-only in every serializer, so a caller
cannot choose whose name a row carries.

Stories 2.3-2.5 (edit, reorder, move, remove, restore) route through this same
entry point instead of opening a second write path, and Epic 5 extends it with
the `search_document` rebuild rather than writing around it.
"""

from django.db import transaction
from django.db.models import Max

from .models import Chapter, Course, Lesson, Module

# The direct-children relation of each level, keyed by model. Lesson is absent
# because it is the leaf: an entry here is what "has descendants" means.
_CHILD_RELATION = {
    Course: 'modules',
    Module: 'chapters',
    Chapter: 'lessons',
}

# The stable identifier of each level, used to name a row in a removal preview.
LEVEL_NAMES = {
    Course: 'course',
    Module: 'module',
    Chapter: 'chapter',
    Lesson: 'lesson',
}


def direct_children(container):
    """Every direct child of `container`, soft-deleted rows included."""
    relation = _CHILD_RELATION.get(type(container))
    if relation is None:
        return []
    return list(getattr(container, relation).all())


def _subtree(node):
    """`node` and every descendant, depth-first, soft-deleted rows included."""
    yield node
    for child in direct_children(node):
        yield from _subtree(child)


def removal_targets(node):
    """The live rows removing `node` would newly hide, the node first.

    A row already carrying the removal flag is skipped, so a removal over a
    partly deleted subtree neither re-stamps nor resurfaces it.
    """
    return [row for row in _subtree(node) if not row.is_deleted]



def mutate(*, actor, model, data, instance=None):
    """Create a content row, or update one that exists, stamped with the actor.

    With no `instance`, `model` is one of the four content models and `data` is
    validated input with the parent and `position` already resolved by the view;
    a new row is inserted. With an `instance`, `data` is partial validated
    input and only the fields it names are written: the save is scoped with
    `update_fields`, so the stamp and `updated_at` are refreshed while every
    column the body did not name keeps its value. The serializers declare every
    server-owned field (`position`, `is_deleted`, the parent link) read-only, so
    a client-supplied update cannot reach one; the reorder, move, removal and
    restoration helpers are the only code that passes such a field to this
    port, and they do so deliberately.

    Either way the row change, the `last_modified_by` stamp and the ancestor
    recomputation all happen inside a single `transaction.atomic()`, so an error
    raised after the row change starts rolls the change and the stamp back
    together: there is never a half-written or unstamped row.

    Two obligations are documented here rather than performed, because their
    fields and rules arrive later:

    - `search_document` is NOT rebuilt. That field does not exist until
      Epic 5, which extends this same entry point rather than adding a second
      write path next to it.
    - Ancestor recomputation runs but is a no-op in this story; it is the hook
      Epic 5's recursive container computation fills in, inside this same
      transaction.

    Returns the created or updated row.
    """
    with transaction.atomic():
        if instance is None:
            instance = model.objects.create(**data, last_modified_by=actor)
        else:
            for field, value in data.items():
                setattr(instance, field, value)
            instance.last_modified_by = actor
            instance.save(
                update_fields=[*data, 'last_modified_by', 'updated_at']
            )
        _recompute_ancestors(instance)
        return instance


def _recompute_ancestors(instance):
    """Recompute the changed row's ancestors - a no-op in Story 2.2.

    Called inside `mutate`'s transaction so the recomputation and the row
    change commit or roll back together. Epic 5's recursive
    container-visibility computation lands here; nothing is recomputed while
    no visibility column exists.
    """


def next_position(queryset):
    """The next free position among the rows `queryset` selects.

    The client never sends a position on create or move; ordering is set
    through the reorder and move helpers, so appending at the end is the least
    surprising default. It also keeps the per-parent unique constraint
    satisfied without the caller having to count the siblings first.
    """
    current = queryset.aggregate(highest=Max('position'))['highest']
    return (current or 0) + 1


def reorder_children(*, actor, container, children, order):
    """Write `container`'s live direct children in `order`, renumbered.

    `children` is the container's complete set of live direct children and
    `order` a permutation of their ids, both validated by the view; soft-deleted
    siblings are part of neither. The reorder runs in one transaction under a
    row lock on the container. Because `position` is unique per container across
    deleted rows too, the target band starts above the highest soft-deleted
    position (at 1 when there is none, which is Story 2.4's behaviour) and the
    move band starts above every row in the container, so neither pass can
    collide with a deleted slot. Every change goes through `mutate`, so each row
    is re-stamped with `actor` and the whole reorder commits or rolls back as
    one. Returns the children in their new order, positions already applied.
    """
    with transaction.atomic():
        type(container).objects.select_for_update().get(pk=container.pk)
        siblings = direct_children(container)
        by_id = {child.pk: child for child in children}
        ordered = [by_id[child_id] for child_id in order]

        deleted_positions = [
            sibling.position for sibling in siblings if sibling.is_deleted
        ]
        band_start = max(deleted_positions, default=0) + 1
        targets = [band_start + index for index in range(len(ordered))]

        if [child.position for child in ordered] == targets:
            return ordered

        high = max((sibling.position for sibling in siblings), default=0) + 1
        for index, child in enumerate(ordered):
            if child.position != high + index:
                mutate(
                    actor=actor,
                    model=type(child),
                    instance=child,
                    data={'position': high + index},
                )
        for index, child in enumerate(ordered):
            target = band_start + index
            if child.position != target:
                mutate(
                    actor=actor,
                    model=type(child),
                    instance=child,
                    data={'position': target},
                )
        return ordered


def remove(*, actor, model, node):
    """Soft-delete `node` and every live descendant, stamped with `actor`.

    Runs in one transaction under a row lock on the addressed node. Each
    affected row is written through `mutate`, so the whole cascade is
    re-stamped with the acting Publisher and commits or rolls back as one.
    Rows already carrying the flag are skipped. Returns the addressed node.
    """
    with transaction.atomic():
        locked = model.objects.select_for_update().get(pk=node.pk)
        for row in removal_targets(locked):
            mutate(
                actor=actor,
                model=type(row),
                instance=row,
                data={'is_deleted': True},
            )
        return locked


def restore(*, actor, model, node):
    """Clear the removal flag on `node` alone, stamped with `actor`.

    The soft-deleted row is reached through `with_deleted()`, the only selector
    of soft-deleted rows. Restoration is node-only: descendants stay deleted
    until restored themselves. A node that is already live is returned
    unchanged.
    """
    with transaction.atomic():
        locked = model.objects.select_for_update().get(pk=node.pk)
        if not locked.is_deleted:
            return locked
        deleted = model.objects.with_deleted().get(pk=node.pk)
        mutate(
            actor=actor,
            model=model,
            instance=deleted,
            data={'is_deleted': False},
        )
        return deleted


def move_lesson(*, actor, lesson, target_chapter):
    """Move a Lesson to the end of `target_chapter`, keeping its identity.

    Runs in one transaction under a row lock on the target Chapter and on the
    Lesson itself. The Lesson is appended at the target's next position while
    the source Chapter is left sparse (AD-7 permits sparse positions); the row
    change and the `last_modified_by` stamp go through `mutate` like any other
    write, so the move commits or rolls back as one.
    """
    with transaction.atomic():
        Chapter.objects.select_for_update().get(pk=target_chapter.pk)
        locked = Lesson.objects.select_for_update().get(pk=lesson.pk)
        mutate(
            actor=actor,
            model=Lesson,
            instance=locked,
            data={
                'chapter': target_chapter,
                'position': next_position(
                    Lesson.objects.filter(chapter=target_chapter)
                ),
            },
        )
        return locked
