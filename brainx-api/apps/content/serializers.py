"""The create payloads for the four content levels.

One `ModelSerializer` per level doubles as the request contract and the created
object's representation. The parent link is never a serializer field: it comes
from the URL, so a client cannot create a node under a different parent than the
path names. `position` and `is_deleted` are read-only for the same reason -
they are the Publisher's controls, set by the server here and by the ordering
story (2.4) later, never accepted from a body.
"""

from rest_framework import serializers

from .models import Chapter, Course, Lesson, Module


class CourseSerializer(serializers.ModelSerializer):
    """Create a Course, the one level that carries a subject."""

    class Meta:
        model = Course
        fields = ('id', 'name', 'subject', 'position', 'is_deleted')
        read_only_fields = ('id', 'position', 'is_deleted')


class ModuleSerializer(serializers.ModelSerializer):
    """Create a Module under the Course named by the URL."""

    class Meta:
        model = Module
        fields = ('id', 'name', 'position', 'is_deleted')
        read_only_fields = ('id', 'position', 'is_deleted')


class ChapterSerializer(serializers.ModelSerializer):
    """Create a Chapter under the Module named by the URL."""

    class Meta:
        model = Chapter
        fields = ('id', 'name', 'position', 'is_deleted')
        read_only_fields = ('id', 'position', 'is_deleted')


class LessonSerializer(serializers.ModelSerializer):
    """Create a Lesson under the Chapter named by the URL.

    `title`, `teacher` and `course_date` are required by the model, so DRF marks
    them required and a missing one is reported under its own key in the 400
    `errors` map. `description` is optional at creation (FR-4, Epic 4).
    """

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
        )
        read_only_fields = ('id', 'position', 'is_deleted')
