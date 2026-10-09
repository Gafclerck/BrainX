"""The four-level content tree: Course > Module > Chapter > Lesson (AD-1).

Course, Module and Chapter are the same kind of node - a named container that
holds an ordered position and a removal flag - so they share one abstract base.
Lesson is the level whose fields are its own (a title, a teacher, a course
date), so it does not inherit that base; it carries the position and removal
flag it needs alongside its metadata.

Containment is a real non-null foreign key, which is what makes an orphan node
impossible at the database rather than only at the API. Identifiers come from
`UUIDModel`, so no level is ever addressed by an integer or a slug.
"""

from django.db import models

from apps.core.models import TimeStampedModel, UUIDModel


class ContentNode(UUIDModel, TimeStampedModel):
    """Abstract base for the three container levels.

    Carries only what Course, Module and Chapter have in common. `position` is
    the Publisher's ordering control and `is_deleted` is the soft-removal flag
    (AD-5); neither is set from a client payload. Lesson deliberately does not
    inherit this base, because its own fields make it a different kind of node.
    """

    name = models.CharField(max_length=255)
    position = models.PositiveIntegerField()
    is_deleted = models.BooleanField(default=False)

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
