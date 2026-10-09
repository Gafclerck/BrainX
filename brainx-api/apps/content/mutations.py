"""The one write port for content rows (Story 2.2).

Every content row enters the database through `mutate`, and nothing else does:
a view validates input, resolves the parent and the position, and hands the
acting user over - it never calls `save()` on a content row itself, and no code
calls `queryset.update()` on one. The actor is an explicit argument that views
fill from `request.user`; it is never read from a payload, and
`last_modified_by` is read-only in every serializer, so a caller cannot choose
whose name a row carries.

Stories 2.3-2.5 (edit, reorder, move, remove, restore) route through this same
entry point instead of opening a second write path, and Epic 5 extends it with
the `search_document` rebuild rather than writing around it.
"""

from django.db import transaction


def mutate(*, actor, model, data):
    """Create one content row, stamped with the acting user.

    `model` is one of the four content models and `data` is validated input
    with the parent and `position` already resolved by the view. The row
    insert, the `last_modified_by` stamp and the ancestor recomputation all
    happen inside a single `transaction.atomic()`, so an error raised after
    the row change starts rolls the change and the stamp back together: there
    is never a half-written or unstamped row.

    Two obligations are documented here rather than performed, because their
    fields and rules arrive later:

    - `search_document` is NOT rebuilt. That field does not exist until
      Epic 5, which extends this same entry point rather than adding a second
      write path next to it.
    - Ancestor recomputation runs but is a no-op in this story; it is the hook
      Epic 5's recursive container computation fills in, inside this same
      transaction.

    Returns the created row.
    """
    with transaction.atomic():
        instance = model.objects.create(**data, last_modified_by=actor)
        _recompute_ancestors(instance)
        return instance


def _recompute_ancestors(instance):
    """Recompute the changed row's ancestors - a no-op in Story 2.2.

    Called inside `mutate`'s transaction so the recomputation and the row
    change commit or roll back together. Epic 5's recursive
    container-visibility computation lands here; nothing is recomputed while
    no visibility column exists.
    """
