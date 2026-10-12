"""The four-level content tree: Course > Module > Chapter > Lesson (AD-1).

Course, Module and Chapter are the same kind of node - a named container that
holds an ordered position and a removal flag - so they share one abstract base.
Lesson is the level whose fields are its own (a title, a teacher, a course
date), so it does not inherit that base; it carries the position and removal
flag it needs alongside its metadata.

Containment is a real non-null foreign key, which is what makes an orphan node
impossible at the database rather than only at the API. Identifiers come from
`UUIDModel`, so no level is ever addressed by an integer or a slug.

Every row also records the account that last changed it (Story 2.2). The stamp
lives on the row, never as a single author field shared by the tree, so a
second Publisher is a permission change rather than a data migration.
"""

from django.conf import settings
from django.db import models

from apps.core.models import TimeStampedModel, UUIDModel


class ContentQuerySet(models.QuerySet):
    """The two named read ports of the content tree (AD-2).

    `visible()` is the Student port and the only Student entry point;
    `manageable()` is the Publisher port and is reached only behind
    `IsPublisher`. `with_deleted()` returns the soft-deleted rows alone as the
    restore path's selector, and is not a third port.

    The manager a content model exposes is this queryset without either port's
    filter, so an ordinary read still sees every row; a read path names a port
    when it needs the set that port defines.
    """

    def visible(self):
        """The Student port: live rows only.

        Applies `is_deleted=False`. The `is_published=True` clause lands here
        when Epic 4 introduces that axis; this story must not invent the
        column, so every live row is visible until then.
        """
        return self.filter(is_deleted=False)

    def manageable(self):
        """The Publisher port: every row, soft-deleted rows included.

        Reached only behind `IsPublisher`. The default manager is already
        unfiltered, so this names the existing behaviour; the write paths keep
        using the manager until they opt in. It does not clear a filter already
        on the queryset, so "every row" means every row of the set it is
        called on.
        """
        return self.all()

    def with_deleted(self):
        """The soft-deleted rows alone - the restore path's selector.

        A sub-case of `manageable()`, which also selects these rows as part of
        every row; this narrows that set to the deleted ones (Story 2.5).
        """
        return self.manageable().filter(is_deleted=True)


class ContentNode(UUIDModel, TimeStampedModel):
    """Abstract base for the three container levels.

    Carries only what Course, Module and Chapter have in common. `position` is
    the Publisher's ordering control and `is_deleted` is the soft-removal flag
    (AD-5); neither is set from a client payload. `last_modified_by` is the
    per-row actor stamp, set only by `apps.content.mutations.mutate`. Lesson
    deliberately does not inherit this base, because its own fields make it a
    different kind of node - which is why it declares the stamp itself.
    """

    name = models.CharField(max_length=255)
    position = models.PositiveIntegerField()
    is_deleted = models.BooleanField(default=False)
    # PROTECT: an account that has touched content cannot be deleted, so the
    # audit trail is never cascaded away.
    last_modified_by = models.ForeignKey(
        settings.AUTH_USER_MODEL,
        on_delete=models.PROTECT,
        related_name='%(app_label)s_%(class)s_last_modified_by',
    )

    objects = ContentQuerySet.as_manager()

    class Meta:
        abstract = True


class Course(ContentNode):
    """The top level. It carries the subject name; a Module never does."""

    subject = models.CharField(max_length=255)

    class Meta:
        ordering = ('position', 'id')

    def __str__(self):
        return self.name


class Module(ContentNode):
    """A division of a Course."""

    course = models.ForeignKey(
        Course,
        on_delete=models.CASCADE,
        related_name='modules',
    )

    class Meta:
        ordering = ('position', 'id')
        constraints = [
            models.UniqueConstraint(
                fields=('course', 'position'),
                name='unique_module_position_per_course',
            )
        ]

    def __str__(self):
        return self.name


class Chapter(ContentNode):
    """A division of a Module."""

    module = models.ForeignKey(
        Module,
        on_delete=models.CASCADE,
        related_name='chapters',
    )

    class Meta:
        ordering = ('position', 'id')
        constraints = [
            models.UniqueConstraint(
                fields=('module', 'position'),
                name='unique_chapter_position_per_module',
            )
        ]

    def __str__(self):
        return self.name


class Lesson(UUIDModel, TimeStampedModel):
    """The leaf level: the only node with type-specific fields.

    `title`, `teacher` and `course_date` are required at creation. `description`
    is optional here and becomes mandatory only when the Lesson is published
    (Epic 4).

    The per-row actor stamp and the removal/ordering controls are duplicated
    from `ContentNode` on purpose: this level is a different kind of node, so
    it declares what it needs rather than inheriting the container base.
    """

    chapter = models.ForeignKey(
        Chapter,
        on_delete=models.CASCADE,
        related_name='lessons',
    )
    title = models.CharField(max_length=255)
    description = models.TextField(blank=True, default='')
    teacher = models.CharField(max_length=255)
    course_date = models.DateField()
    position = models.PositiveIntegerField()
    is_deleted = models.BooleanField(default=False)
    # PROTECT: an account that has touched content cannot be deleted, so the
    # audit trail is never cascaded away.
    last_modified_by = models.ForeignKey(
        settings.AUTH_USER_MODEL,
        on_delete=models.PROTECT,
        related_name='%(app_label)s_%(class)s_last_modified_by',
    )

    objects = ContentQuerySet.as_manager()

    class Meta:
        ordering = ('position', 'id')
        constraints = [
            models.UniqueConstraint(
                fields=('chapter', 'position'),
                name='unique_lesson_position_per_chapter',
            )
        ]

    def __str__(self):
        return self.title
