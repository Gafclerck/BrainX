"""The four-level content tree plus the material a Lesson carries (AD-1, Epic 3).

Course, Module and Chapter are the same kind of node - a named container that
holds an ordered position and a removal flag - so they share one abstract base.
Lesson is the level whose fields are its own (a title, a teacher, a course
date), so it does not inherit that base; it carries the position and removal
flag it needs alongside its metadata.

Containment is a real non-null foreign key, which is what makes an orphan node
impossible at the database rather than only at the API. Identifiers come from
`UUIDModel`, so no level is ever addressed by an integer or a slug. Resource is
the leaf level's material: one row per attached item, keyed to a Lesson only,
discriminated by `type` and pinned to its payload by the database.

Every row also records the account that last changed it (Story 2.2). The stamp
lives on the row, never as a single author field shared by the tree, so a
second Publisher is a permission change rather than a data migration.
"""

from django.conf import settings
from django.contrib.postgres.indexes import GinIndex, OpClass
from django.core.exceptions import ValidationError
from django.db import models
from django.db.models.functions import Upper

from apps.core.models import TimeStampedModel, UUIDModel


def validate_http_url(value):
    """Reject a URL that does not begin http:// or https://, case-insensitively.

    The `resource_url_is_http` CHECK constraint enforces the same rule in the
    database, so an invalid URL is refused however it was written; this
    validator is the model-level half of the same contract. Empty values are
    skipped, because the payload CHECK constraint decides which type may carry
    a URL at all - a document or image row must not need one.
    """
    if not value:
        return
    if not str(value).lower().startswith(('http://', 'https://')):
        raise ValidationError(
            'Enter a URL beginning with http:// or https:// (case-insensitive).'
        )


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
        """The Student port: live, published rows only.

        Applies `is_deleted=False` to every level. On a model that carries the
        publication axis (Lesson) it also applies `is_published=True`, so a
        draft is hidden exactly as a removed row is. The clause is conditional
        because the same port serves the containers and Resource, which have
        only the removal flag and must keep their `is_deleted`-only behaviour.
        """
        queryset = self.filter(is_deleted=False)
        if 'is_published' in {field.name for field in self.model._meta.get_fields()}:
            queryset = queryset.filter(is_published=True)
        return queryset

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
    # Publisher keywords (Story 5.4): optional free text, part of the indexed
    # search document; a Lesson with none still indexes on its other fields.
    # Never serializer-exposed.
    keywords = models.TextField(blank=True, default='')
    # The denormalised search document (Story 5.4): title, description,
    # keywords, Module name and Chapter name, newline-joined as authored and
    # rebuilt by the single write entry point (Story 5.5). Read through
    # `search_document__icontains` behind the functional GIN trigram index
    # below; never serializer-exposed.
    search_document = models.TextField(blank=True, default='')
    teacher = models.CharField(max_length=255)
    course_date = models.DateField()
    position = models.PositiveIntegerField()
    is_deleted = models.BooleanField(default=False)
    # The publication axis (Epic 4). Independent of `is_deleted`: all four
    # combinations are representable, and a draft or a removed published
    # Lesson are different states. Set only by the publish action.
    is_published = models.BooleanField(default=False)
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
        indexes = [
            # The functional GIN trigram index (Story 5.4), on the uppercased
            # document exactly as the `icontains` match reads it - an index on
            # the bare column would never be consulted and is a defect.
            GinIndex(
                OpClass(Upper('search_document'), name='gin_trgm_ops'),
                name='lesson_search_document_trgm',
            ),
        ]

    def __str__(self):
        return self.title


class Resource(UUIDModel, TimeStampedModel):
    """The material a Lesson carries, one typed row per attached item (Epic 3).

    `type` is the closed Glossary set - `document`, `image`, `video`,
    `external_link` - and decides which payload the row may carry: a document
    or image is a file, a video or external link is a URL. Two CHECK
    constraints make the mismatch a database error (Story 3.1): one ties the
    payload present to the type, the other requires a stored URL to begin
    http(s):// case-insensitively, so a `javascript:` or `data:` address is
    refused however it was written. `validate_http_url` enforces the same rule
    at model validation.

    The row keys to a Lesson only, by a real non-null FK, and carries the same
    soft-removal flag and actor stamp as the tree levels. `is_deleted` ships
    because Resource is on the removal axis (AR-8), but nothing sets it until
    Story 3.5. `file` exists so the CHECK constraint and Story 3.2 share one
    table; this story never stores one. `url` is a plain field stored and
    returned verbatim, never interpolated into markup. Rows order by `id` -
    there is no `position`, so no reorder route exists.
    """

    class Type(models.TextChoices):
        DOCUMENT = 'document', 'Document'
        IMAGE = 'image', 'Image'
        VIDEO = 'video', 'Video'
        EXTERNAL_LINK = 'external_link', 'External link'

    lesson = models.ForeignKey(
        Lesson,
        on_delete=models.CASCADE,
        related_name='resources',
    )
    type = models.CharField(max_length=32, choices=Type.choices)
    title = models.CharField(max_length=255)
    note = models.TextField(blank=True, default='')
    file = models.FileField(upload_to='resources/%Y/%m/', null=True, blank=True)
    url = models.CharField(
        max_length=2048,
        null=True,
        blank=True,
        validators=[validate_http_url],
    )
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
        ordering = ('id',)
        constraints = [
            models.CheckConstraint(
                name='resource_payload_matches_type',
                condition=(
                    models.Q(type__in=('document', 'image'))
                    & ~(models.Q(file__isnull=True) | models.Q(file=''))
                    & (models.Q(url__isnull=True) | models.Q(url=''))
                )
                | (
                    models.Q(type__in=('video', 'external_link'))
                    & (models.Q(file__isnull=True) | models.Q(file=''))
                    & ~(models.Q(url__isnull=True) | models.Q(url=''))
                ),
            ),
            models.CheckConstraint(
                name='resource_url_is_http',
                condition=(
                    models.Q(url__isnull=True)
                    | models.Q(url='')
                    | models.Q(url__iregex=r'^https?://')
                ),
            ),
        ]

    def __str__(self):
        return self.title
