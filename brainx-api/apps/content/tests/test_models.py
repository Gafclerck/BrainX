"""The data model of the four-level tree (Story 2.1 AC 1-5)."""

from datetime import date

from django.db import IntegrityError, models, transaction
from django.test import TestCase

from apps.users.models import User

from ..models import Chapter, ContentNode, Course, Lesson, Module


class TreeShapeTests(TestCase):
    """Four concrete models in one foreign-key chain."""

    def setUp(self):
        # The rows here carry a real stamp, because every content row records
        # its actor (Story 2.2) - a fixture without one is not a valid row.
        self.actor = User.objects.create_user(email='actor@example.com')

    def test_course_module_chapter_share_the_abstract_base(self):
        self.assertTrue(ContentNode._meta.abstract)
        for model in (Course, Module, Chapter):
            self.assertTrue(issubclass(model, ContentNode))
        # Lesson is the level with type-specific fields, so it is not this base.
        self.assertFalse(issubclass(Lesson, ContentNode))

    def test_every_level_has_a_uuid_primary_key(self):
        for model in (Course, Module, Chapter, Lesson):
            self.assertIsInstance(model._meta.pk, models.UUIDField)

    def test_the_chain_is_course_module_chapter_lesson(self):
        self.assertIs(Module._meta.get_field('course').remote_field.model, Course)
        self.assertIs(Chapter._meta.get_field('module').remote_field.model, Module)
        self.assertIs(Lesson._meta.get_field('chapter').remote_field.model, Chapter)

    def test_every_parent_link_is_non_null(self):
        for model, field in (
            (Module, 'course'),
            (Chapter, 'module'),
            (Lesson, 'chapter'),
        ):
            self.assertFalse(model._meta.get_field(field).null)

    def test_the_database_rejects_a_parentless_node(self):
        # The one path the API cannot take, because the parent comes from the
        # URL - and the reason containment is structural rather than a habit.
        cases = (
            (
                Module,
                {
                    'name': 'orphan',
                    'position': 1,
                    'course': None,
                    'last_modified_by': self.actor,
                },
            ),
            (
                Chapter,
                {
                    'name': 'orphan',
                    'position': 1,
                    'module': None,
                    'last_modified_by': self.actor,
                },
            ),
            (
                Lesson,
                {
                    'title': 'orphan',
                    'teacher': 'Ms Ada',
                    'course_date': date(2026, 9, 1),
                    'position': 1,
                    'chapter': None,
                    'last_modified_by': self.actor,
                },
            ),
        )
        for model, payload in cases:
            with self.subTest(model=model.__name__):
                with self.assertRaises(IntegrityError):
                    with transaction.atomic():
                        model.objects.create(**payload)


class PositionUniquenessTests(TestCase):
    """`position` is unique per parent, enforced by the applied schema."""

    def setUp(self):
        self.actor = User.objects.create_user(email='actor@example.com')
        self.course = Course.objects.create(
            name='Maths', subject='X', position=1, last_modified_by=self.actor
        )
        self.module = Module.objects.create(
            course=self.course, name='M', position=1, last_modified_by=self.actor
        )
        self.chapter = Chapter.objects.create(
            module=self.module, name='C', position=1, last_modified_by=self.actor
        )
        self.lesson = Lesson.objects.create(
            chapter=self.chapter,
            title='L',
            teacher='Ms Ada',
            course_date=date(2026, 9, 1),
            position=1,
            last_modified_by=self.actor,
        )

    def test_a_duplicate_position_within_a_parent_is_rejected(self):
        cases = (
            (
                Module,
                {'course': self.course, 'name': 'dup', 'last_modified_by': self.actor},
            ),
            (
                Chapter,
                {'module': self.module, 'name': 'dup', 'last_modified_by': self.actor},
            ),
            (
                Lesson,
                {
                    'chapter': self.chapter,
                    'title': 'dup',
                    'teacher': 'Ms Ada',
                    'course_date': date(2026, 9, 1),
                    'last_modified_by': self.actor,
                },
            ),
        )
        for model, kwargs in cases:
            with self.subTest(model=model.__name__):
                with self.assertRaises(IntegrityError):
                    with transaction.atomic():
                        model.objects.create(position=1, **kwargs)


class LevelFieldTests(TestCase):
    """What each level carries, and what it deliberately does not."""

    def test_the_subject_lives_on_course_only(self):
        course_fields = {field.name for field in Course._meta.get_fields()}
        module_fields = {field.name for field in Module._meta.get_fields()}
        self.assertIn('subject', course_fields)
        self.assertNotIn('subject', module_fields)

    def test_the_shared_controls_are_on_every_level(self):
        for model in (Course, Module, Chapter, Lesson):
            names = {field.name for field in model._meta.get_fields()}
            self.assertIn('position', names)
            self.assertIn('is_deleted', names)

    def test_course_date_is_a_calendar_date(self):
        field = Lesson._meta.get_field('course_date')
        self.assertIsInstance(field, models.DateField)
        self.assertEqual(field.get_internal_type(), 'DateField')

    def test_lesson_metadata_fields_have_the_expected_requiredness(self):
        self.assertFalse(Lesson._meta.get_field('title').blank)
        self.assertFalse(Lesson._meta.get_field('teacher').blank)
        self.assertTrue(Lesson._meta.get_field('description').blank)

    def test_each_container_parent_orders_by_position_then_id(self):
        for model in (Course, Module, Chapter, Lesson):
            self.assertEqual(model._meta.ordering, ('position', 'id'))

    def test_position_is_unique_within_each_parent(self):
        constraint_names = {
            constraint.name
            for model in (Module, Chapter, Lesson)
            for constraint in model._meta.constraints
        }
        self.assertEqual(
            constraint_names,
            {
                'unique_module_position_per_course',
                'unique_chapter_position_per_module',
                'unique_lesson_position_per_chapter',
            },
        )
