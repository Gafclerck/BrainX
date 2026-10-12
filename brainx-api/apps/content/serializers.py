"""The create and update payloads for the four content levels.

One `ModelSerializer` per level doubles as the request contract and the row's
representation, on create and on update. The parent link is never a serializer
field: it comes from the URL, so a client cannot create a node under a different
parent than the path names, and an update cannot move a row to a new parent.
`position` and `is_deleted` are read-only for the same reason - they are the
Publisher's controls, set by the server here and by the ordering story (2.4)
later, never accepted from a body.

`last_modified_by` and `updated_at` are read-only too, and for the same shape
of reason: who last changed a row and when are answers about the write, so
they are only ever exposed, never accepted (Story 2.2). `last_modified_by` is
stamped by `mutations.mutate`; `updated_at` is maintained by the model's
`auto_now`, not by the port.

The same serializer serves an update as a `PATCH`, validated with
`partial=True`: only the fields present in the body change, and every
read-only declaration above keeps the server-owned fields out of reach. On a
Lesson the model-required fields stay required when one is supplied, so a blank
value is a 400 rather than a silent empty write.
"""

from rest_framework import serializers

from apps.users.models import User

from .models import Chapter, Course, Lesson, Module, Resource


class LastModifiedBySerializer(serializers.ModelSerializer):
    """The actor stamped on a row, as `{id, email}`.

    `User` is keyed by email and has no username, and no user-read endpoint
    exists, so a bare UUID would not answer "who". The address is how a person
    identifies an account, which is what the stamp exists to show.
    """

    class Meta:
        model = User
        fields = ('id', 'email')


class CourseSerializer(serializers.ModelSerializer):
    """Create or update a Course, the one level that carries a subject."""

    last_modified_by = LastModifiedBySerializer(read_only=True)

    class Meta:
        model = Course
        fields = (
            'id',
            'name',
            'subject',
            'position',
            'is_deleted',
            'last_modified_by',
            'updated_at',
        )
        read_only_fields = ('id', 'position', 'is_deleted', 'updated_at')


class ModuleSerializer(serializers.ModelSerializer):
    """Create or update a Module; its Course comes from creation, not a field."""

    last_modified_by = LastModifiedBySerializer(read_only=True)

    class Meta:
        model = Module
        fields = (
            'id',
            'name',
            'position',
            'is_deleted',
            'last_modified_by',
            'updated_at',
        )
        read_only_fields = ('id', 'position', 'is_deleted', 'updated_at')


class ChapterSerializer(serializers.ModelSerializer):
    """Create or update a Chapter; its Module comes from creation, not a field."""

    last_modified_by = LastModifiedBySerializer(read_only=True)

    class Meta:
        model = Chapter
        fields = (
            'id',
            'name',
            'position',
            'is_deleted',
            'last_modified_by',
            'updated_at',
        )
        read_only_fields = ('id', 'position', 'is_deleted', 'updated_at')


class LessonSerializer(serializers.ModelSerializer):
    """Create or update a Lesson; its Chapter comes from creation, not a field.

    `title`, `teacher` and `course_date` are required by the model, so DRF marks
    them required and a missing one is reported under its own key in the 400
    `errors` map. On a partial update the field may be omitted, but supplying it
    blank is rejected the same way - the model's `blank=False` keeps the field
    non-blank. `description` is optional at creation (FR-4, Epic 4).
    """

    last_modified_by = LastModifiedBySerializer(read_only=True)

    class Meta:
        model = Lesson
        fields = (
            'id',
            'title',
            'description',
            'teacher',
            'course_date',
            'position',
            'is_deleted',
            'last_modified_by',
            'updated_at',
        )
        read_only_fields = ('id', 'position', 'is_deleted', 'updated_at')


class ResourceSerializer(serializers.ModelSerializer):
    """Create or update a Resource; its Lesson comes from the URL, not a field.

    One contract serves the attach (POST) and the metadata update (PATCH). The
    parent link is never a field, so a Resource can only ever be created under
    the Lesson the path names and an update cannot move it under another.
    `type` carries the full four-value set so the read output is honest, but
    the views reject a write whose `type` is `document` or `image` with a 400
    naming `type`, because the file upload is Story 3.2's; `file` is read-only
    for the same reason and is always null in this story's responses. `url` is
    a plain field: stored and returned verbatim, validated at write by the
    http(s) rule (`validate_http_url` on the model) and in the database by the
    CHECK constraint. `is_deleted`, `last_modified_by` and `updated_at` are
    server-owned, read-only like every other level's.
    """

    last_modified_by = LastModifiedBySerializer(read_only=True)

    def validate(self, attrs):
        # A URL-carrying type must have a URL, or the payload CHECK constraint
        # would reject the row on write - here it is refused as a 400 naming
        # `url` instead of a database error. On a partial update the existing
        # row's URL counts, so editing only the title of a video Resource does
        # not force the address to be re-sent.
        if attrs.get('type') in ('video', 'external_link') and not attrs.get(
            'url', getattr(self.instance, 'url', None)
        ):
            raise serializers.ValidationError(
                {'url': ['a video or external_link Resource must carry a URL']}
            )
        # `type` is write-once: the per-type CHECK constraint would make a
        # document-to-video transition a database error, and this story keeps
        # the discriminator in the creation payload. Re-sending the row's own
        # type is harmless and allowed.
        if (
            self.instance is not None
            and attrs.get('type') not in (None, self.instance.type)
        ):
            raise serializers.ValidationError(
                {'type': ['a Resource type cannot be changed']}
            )
        return attrs

    class Meta:
        model = Resource
        fields = (
            'id',
            'type',
            'title',
            'note',
            'file',
            'url',
            'is_deleted',
            'last_modified_by',
            'updated_at',
        )
        read_only_fields = ('id', 'file', 'is_deleted', 'updated_at')


class RemovalPreviewItemSerializer(serializers.Serializer):
    """One row a removal would newly hide, named so the Publisher can judge it."""

    level = serializers.ChoiceField(
        choices=('course', 'module', 'chapter', 'lesson')
    )
    id = serializers.UUIDField()
    name = serializers.CharField()
    position = serializers.IntegerField()


class RemovalPreviewSerializer(serializers.Serializer):
    """What a removal would hide: per-level counts and the rows themselves.

    The dry run is advisory: it writes nothing and the commit needs no token.
    """

    would_remove = serializers.DictField(child=serializers.IntegerField())
    items = RemovalPreviewItemSerializer(many=True)


class ReorderSerializer(serializers.Serializer):
    """The request contract of a reorder: the children's new order.

    The list must be an exact permutation of the container's direct children;
    the view enforces that, because only it knows the container's current set.
    `allow_empty` is deliberate: an empty container reorders to the empty
    order, and the view rejects an empty list whenever children exist.
    """

    order = serializers.ListField(
        child=serializers.UUIDField(),
        allow_empty=True,
    )


class LessonMoveSerializer(serializers.Serializer):
    """The request contract of a Lesson move: the target Chapter."""

    chapter = serializers.UUIDField()
