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

from .models import Chapter, Course, Lesson, Module


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
