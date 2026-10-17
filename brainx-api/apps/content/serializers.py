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

from pathlib import Path

from django.conf import settings
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


class LessonContextSerializer(serializers.ModelSerializer):
    """The five-field context block for a Lesson (AD-15).

    The serializer emits exactly `course_name`, `module_name`, `chapter_name`,
    `teacher` and `course_date`, all flat. The names of the ancestor containers
    are read through `chapter__module__course`, so the output never nests an
    object; every field is read-only, and there is no writable field a request
    could fill in. It is the single source of the five fields shared by browse,
    Lesson detail and search, so those results cannot drift apart.

    A consumer reading many rows should `select_related(
    'chapter__module__course')` on the queryset, because each of the three
    ancestor names is a database column reached through that join.
    """

    course_name = serializers.CharField(
        source='chapter.module.course.name', read_only=True
    )
    module_name = serializers.CharField(
        source='chapter.module.name', read_only=True
    )
    chapter_name = serializers.CharField(
        source='chapter.name', read_only=True
    )
    teacher = serializers.CharField(read_only=True)
    course_date = serializers.DateField(read_only=True)

    class Meta:
        model = Lesson
        fields = (
            'course_name',
            'module_name',
            'chapter_name',
            'teacher',
            'course_date',
        )


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

    `is_published` is the publication axis (Epic 4). It is read-only like
    `is_deleted`: only the publish action sets it, so it is exposed on every
    read and never accepted from a body.
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
            'is_published',
            'last_modified_by',
            'updated_at',
        )
        read_only_fields = (
            'id',
            'position',
            'is_deleted',
            'is_published',
            'updated_at',
        )


class ResourceSerializer(serializers.ModelSerializer):
    """Create or update a Resource; its Lesson comes from the URL, not a field.

    One contract serves the attach (POST) and the metadata update (PATCH). The
    parent link is never a field, so a Resource can only ever be created under
    the Lesson the path names and an update cannot move it under another.
    `type` carries the full four-value set so the read output is honest, and it
    decides the payload: a `document` or `image` must carry a `file` and may not
    carry a `url`, a `video` or `external_link` must carry a `url` and may not
    carry a `file`. A file is accepted on create only - `PATCH` is
    metadata-only, so an update carrying one is refused naming `file` - and it
    is checked here against the single ceiling and per-type extension allowlist
    in settings, the last of the three upload layers. `file` is write-only: it
    is stored but never serialized, so no storage URL leaves the API. `url` is
    a plain field: stored and returned verbatim, validated at write by the
    http(s) rule (`validate_http_url` on the model) and in the database by the
    CHECK constraint. `is_deleted`, `last_modified_by` and `updated_at` are
    server-owned, read-only like every other level's.
    """

    last_modified_by = LastModifiedBySerializer(read_only=True)

    def validate(self, attrs):
        # The per-type payload rules mirror the database CHECK constraints so a
        # contradiction is a 400 naming the offending field rather than a 500
        # from the constraint. On a partial update the existing row's type and
        # url count, so editing only a video's title is fine while clearing its
        # url is refused.
        resource_type = attrs.get('type', getattr(self.instance, 'type', None))
        file = attrs.get('file')

        # `type` is write-once, and it is checked before the per-type payload
        # rules so a change to or from a file-bearing type names `type` rather
        # than the payload field the old row and the new type disagree on: the
        # per-type CHECK constraint would make the transition a database error,
        # and the discriminator stays in the creation payload. Re-sending the
        # row's own type is harmless and allowed.
        if (
            self.instance is not None
            and attrs.get('type') not in (None, self.instance.type)
        ):
            raise serializers.ValidationError(
                {'type': ['a Resource type cannot be changed']}
            )

        # A file is create-only: an update carrying one - even a null that would
        # clear it - is refused naming `file`, before the per-type rules below.
        if self.instance is not None and 'file' in attrs:
            raise serializers.ValidationError(
                {'file': ['a file can only be attached when the Resource is '
                          'created']}
            )

        if resource_type in ('document', 'image'):
            # The row's existing file counts on a metadata update, so only a
            # creation or an explicit file is checked.
            if file is None and not getattr(self.instance, 'file', None):
                raise serializers.ValidationError(
                    {'file': ['a document or image Resource must carry a file']}
                )
            if file is not None:
                self._check_file(file, resource_type)
            # A file type must not gain a URL, or the same CHECK constraint
            # would trip.
            if attrs.get('url') not in (None, ''):
                raise serializers.ValidationError(
                    {'url': ['a document or image Resource cannot carry a URL']}
                )
        elif file is not None:
            raise serializers.ValidationError(
                {'file': ['a video or external_link Resource cannot carry a '
                          'file']}
            )

        if resource_type in ('video', 'external_link') and not attrs.get(
            'url', getattr(self.instance, 'url', None)
        ):
            raise serializers.ValidationError(
                {'url': ['a video or external_link Resource must carry a URL']}
            )
        return attrs

    def _check_file(self, file, resource_type):
        """The per-file ceiling and extension allowlist, both read from settings.

        Naming the field in the raised error is what makes it a 400 under
        `errors.file` like every other per-field violation. The extension is the
        lowercased filename suffix: a convenience filter, not content sniffing.
        """
        max_bytes = settings.RESOURCE_FILE_MAX_BYTES
        if file.size > max_bytes:
            limit = (
                f'{max_bytes} bytes'
                if max_bytes < 1024 * 1024
                else f'{max_bytes // (1024 * 1024)} MB'
            )
            raise serializers.ValidationError(
                {'file': [f'a file may not exceed {limit}']}
            )
        allowed = settings.RESOURCE_FILE_EXTENSIONS[resource_type]
        if Path(file.name).suffix.lower() not in allowed:
            article = 'an' if resource_type[0] in 'aeiou' else 'a'
            raise serializers.ValidationError(
                {'file': [f'{article} {resource_type} file must end in '
                          + ' or '.join(allowed)]}
            )

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
        read_only_fields = ('id', 'is_deleted', 'updated_at')
        # Write-only: a file is accepted on create but never serialized, so no
        # storage URL is exposed before Story 3.3's authenticated retrieval.
        extra_kwargs = {'file': {'write_only': True}}


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


class BulkPublishBlockedItemSerializer(serializers.Serializer):
    """One incomplete Lesson a bulk publish would skip, with its missing fields.

    `id` names the Lesson and `missing` lists the required metadata fields it
    lacks, in the canonical order the publishable rule reports them, so the
    Publisher can turn the preview into a work list.
    """

    id = serializers.UUIDField()
    missing = serializers.ListField(child=serializers.CharField())


class BulkPublishPreviewSerializer(serializers.Serializer):
    """What a bulk publish would change: the count that will flip and the blocked.

    The dry run is advisory and side-effect free: it writes nothing and takes
    no request body. `would_change` counts only unpublished Lessons that pass
    the publishable rule; `blocked` names every candidate that fails it.
    `blocked` is reserved for bulk publication and appears nowhere else.
    """

    would_change = serializers.IntegerField()
    blocked = BulkPublishBlockedItemSerializer(many=True)


class BulkPublishCommitSerializer(serializers.Serializer):
    """The request contract of a bulk publish commit: the echoed 4.3 preview.

    `would_change` and `blocked` must reproduce what the preview returned; the
    commit recomputes the enumeration under the container lock and answers 409
    when the two no longer agree, so the body is the client's statement of what
    it saw, not an instruction. `blocked` reuses the preview's item shape so the
    request and the preview cannot drift apart.
    """

    would_change = serializers.IntegerField()
    blocked = BulkPublishBlockedItemSerializer(many=True)


class BulkPublishResultSerializer(serializers.Serializer):
    """The 200 body of a bulk publish commit.

    `changed` is the count actually written, not the previewed count, and
    `errors.blocked` is the reserved bulk-publication work list of incomplete
    candidates. `blocked` sits under `errors` here, unlike the 4.3 preview which
    carries it at the top level.
    """

    changed = serializers.IntegerField()
    errors = serializers.DictField(
        child=serializers.ListField(child=BulkPublishBlockedItemSerializer())
    )


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


class ResourceRetrievalSerializer(serializers.Serializer):
    """Response serializer for the retrieval endpoint (Story 3.3)."""

    url = serializers.CharField()
    expires_in = serializers.IntegerField()
    content_type = serializers.CharField()
    disposition = serializers.CharField()
    filename = serializers.CharField()
