"""The shared context shape and the one total order (Story 5.1).

This story ships two shared building blocks in `apps.content` and no endpoint
of its own: `LessonContextSerializer`, the single source of the five context
fields, and `ordering.py`, the single source of the total order AD-7 defines.
Browse, Lesson detail and search import both later, so their shape and their
order are pinned here before any consumer exists - that is what stops the
student-facing surfaces drifting apart.
"""

from datetime import date
from pathlib import Path

from django.db.models import Case, IntegerField, Value, When
from django.db.models.expressions import OrderBy
from django.db.models.functions import Length
from django.test import SimpleTestCase
from rest_framework.pagination import PageNumberPagination
from rest_framework.settings import api_settings

from .. import ordering
from ..models import Chapter, Course, Lesson, Module, Resource
from ..ordering import (
    CONTAINER_ORDER,
    LESSON_ORDER,
    RESOURCE_ORDER,
    lesson_order,
    order_containers,
    order_lessons,
    order_resources,
)
from ..serializers import LessonContextSerializer
from .test_create_endpoints import ContentEndpointTestCase


class ContextSerializerTests(ContentEndpointTestCase):
    """The five fields, flat, read-only, sourced through the ancestors."""

    def setUp(self):
        super().setUp()
        self.lesson = Lesson.objects.create(
            chapter=self.chapter,
            title='A Lesson',
            teacher='Ms Ada',
            course_date=date(2026, 9, 1),
            position=1,
            last_modified_by=self.publisher,
        )

    def test_the_serializer_declares_exactly_the_five_fields(self):
        self.assertEqual(
            set(LessonContextSerializer().fields),
            {
                'course_name',
                'module_name',
                'chapter_name',
                'teacher',
                'course_date',
            },
        )

    def test_every_field_is_read_only(self):
        for name, field in LessonContextSerializer().fields.items():
            with self.subTest(field=name):
                self.assertTrue(field.read_only)

    def test_each_field_reads_from_the_lesson_it_renders(self):
        data = LessonContextSerializer(self.lesson).data

        self.assertEqual(data['course_name'], 'Maths')
        self.assertEqual(data['module_name'], 'Module 1')
        self.assertEqual(data['chapter_name'], 'Chapter 1')
        self.assertEqual(data['teacher'], 'Ms Ada')
        self.assertEqual(data['course_date'], '2026-09-01')

    def test_the_output_carries_no_nested_object(self):
        data = LessonContextSerializer(self.lesson).data

        for value in data.values():
            self.assertNotIsInstance(value, (dict, list))


class LessonOrderTests(ContentEndpointTestCase):
    """`order_lessons` is the AD-7 total order, with `id` last."""

    def setUp(self):
        super().setUp()
        # Two Chapters under Module 1 (positions 1 and 2) and a second Module
        # (position 2), each carrying dated Lessons, so every key in the order
        # has a pair to distinguish.
        self.chapter_2 = Chapter.objects.create(
            module=self.module,
            name='Chapter 2',
            position=2,
            last_modified_by=self.publisher,
        )
        self.module_2 = Module.objects.create(
            course=self.course,
            name='Module 2',
            position=2,
            last_modified_by=self.publisher,
        )
        self.chapter_3 = Chapter.objects.create(
            module=self.module_2,
            name='Chapter 3',
            position=1,
            last_modified_by=self.publisher,
        )
        self.lesson_1 = self._lesson(self.chapter, 1, 'Chapter 1, Lesson 1')
        self.lesson_2 = self._lesson(self.chapter, 2, 'Chapter 1, Lesson 2')
        self.lesson_3 = self._lesson(self.chapter_2, 1, 'Chapter 2, Lesson 1')
        self.lesson_4 = self._lesson(self.chapter_3, 1, 'Chapter 3, Lesson 1')
        # A newer course date, whatever the tree positions say.
        self.newest = self._lesson(
            self.chapter, 3, 'Newest', course_date=date(2026, 9, 10)
        )

    def _lesson(self, chapter, position, title, course_date=date(2026, 9, 5)):
        return Lesson.objects.create(
            chapter=chapter,
            title=title,
            teacher='Ms Ada',
            course_date=course_date,
            position=position,
            last_modified_by=self.publisher,
        )

    def test_lessons_order_by_date_then_module_then_chapter_then_position(self):
        titles = [lesson.title for lesson in order_lessons(Lesson.objects.all())]

        self.assertEqual(
            titles,
            [
                'Newest',
                'Chapter 1, Lesson 1',
                'Chapter 1, Lesson 2',
                'Chapter 2, Lesson 1',
                'Chapter 3, Lesson 1',
            ],
        )

    def test_lessons_from_different_courses_tie_break_on_id(self):
        # Two Courses whose Modules and Chapters hold identical positions, so
        # every key before `id` ties and the final key has to settle it.
        other = Course.objects.create(
            name='Other course',
            subject='X',
            position=2,
            last_modified_by=self.publisher,
        )
        other_module = Module.objects.create(
            course=other,
            name=other.name,
            position=1,
            last_modified_by=self.publisher,
        )
        other_chapter = Chapter.objects.create(
            module=other_module,
            name='Chapter 1',
            position=1,
            last_modified_by=self.publisher,
        )
        other_lesson = Lesson.objects.create(
            chapter=other_chapter,
            title='Elsewhere',
            teacher='Ms Ada',
            course_date=date(2026, 9, 5),
            position=1,
            last_modified_by=self.publisher,
        )
        # `self.lesson_1` has the same date and the same relative positions.
        ordered = list(
            order_lessons(
                Lesson.objects.filter(
                    pk__in=[self.lesson_1.pk, other_lesson.pk]
                )
            )
        )

        self.assertEqual(
            [lesson.pk for lesson in ordered],
            sorted([self.lesson_1.pk, other_lesson.pk]),
        )

    def test_the_model_ordering_is_left_untouched(self):
        # AD-7's order is applied to the queryset; the Publisher `Meta.ordering`
        # stays `position, id` so no existing listing is reordered.
        self.assertEqual(Lesson._meta.ordering, ('position', 'id'))
        self.assertNotEqual(Lesson.objects.all().first().title, 'Newest')

    def test_a_supplied_relevance_key_is_inserted_after_the_date(self):
        keys = lesson_order(relevance='relevance')

        self.assertEqual(keys[0], '-course_date')
        # The relevance axis is the second key, descending.
        self.assertIsInstance(keys[1], OrderBy)
        self.assertTrue(keys[1].descending)
        self.assertEqual(
            tuple(keys[2:]),
            (
                'chapter__module__position',
                'chapter__position',
                'position',
                'id',
            ),
        )

    def test_a_relevance_key_may_be_a_ready_expression(self):
        keys = lesson_order(relevance=Length('title'))

        self.assertIsInstance(keys[1], OrderBy)
        self.assertTrue(keys[1].descending)

    def test_no_relevance_key_leaves_the_browsing_order(self):
        self.assertIs(lesson_order(), LESSON_ORDER)
        self.assertIs(lesson_order(relevance=None), LESSON_ORDER)

    def test_the_date_outranks_the_relevance_key(self):
        # An older but far more relevant Lesson must still lose to a newer one,
        # which is what proves relevance is inserted *after* the date.
        older = self.lesson_1
        queryset = Lesson.objects.annotate(
            relevance=Case(
                When(pk=older.pk, then=Value(9)),
                default=Value(1),
                output_field=IntegerField(),
            )
        ).filter(pk__in=[self.newest.pk, older.pk])

        ordered = [lesson.pk for lesson in order_lessons(
            queryset, relevance='relevance'
        )]

        self.assertEqual(ordered, [self.newest.pk, older.pk])

    def test_relevance_is_applied_descending_before_the_positions(self):
        # Give the *lower*-positioned Lesson a high relevance, so a correct
        # descending key puts it first where `position` alone would not.
        queryset = Lesson.objects.filter(
            pk__in=[self.lesson_1.pk, self.lesson_2.pk]
        ).annotate(
            relevance=Case(
                When(pk=self.lesson_2.pk, then=Value(2)),
                default=Value(1),
                output_field=IntegerField(),
            )
        )
        ordered = list(order_lessons(queryset, relevance='relevance'))

        self.assertEqual(
            [lesson.pk for lesson in ordered],
            [self.lesson_2.pk, self.lesson_1.pk],
        )


class ContainerAndResourceOrderTests(ContentEndpointTestCase):
    """Containers order by `position, id`; Resources by `id`."""

    def test_containers_order_by_position_then_id(self):
        earliest = Course.objects.create(
            name='Earliest',
            subject='X',
            position=3,
            last_modified_by=self.publisher,
        )
        # Course positions are not unique per parent, so a shared position is
        # exactly the case the final `id` key exists to settle.
        first = Course.objects.create(
            name='First',
            subject='X',
            position=5,
            last_modified_by=self.publisher,
        )
        second = Course.objects.create(
            name='Second',
            subject='X',
            position=5,
            last_modified_by=self.publisher,
        )

        ordered = [
            course.pk
            for course in order_containers(Course.objects.filter(
                pk__in=[second.pk, first.pk, earliest.pk]
            ))
        ]

        self.assertEqual(
            ordered,
            [earliest.pk, *sorted([first.pk, second.pk])],
        )

    def test_resources_order_by_id(self):
        host = _a_lesson(self)
        first = Resource.objects.create(
            lesson=host,
            type='external_link',
            title='First',
            url='https://example.com/1',
            last_modified_by=self.publisher,
        )
        second = Resource.objects.create(
            lesson=host,
            type='external_link',
            title='Second',
            url='https://example.com/2',
            last_modified_by=self.publisher,
        )

        ordered = list(order_resources(
            Resource.objects.filter(pk__in=[second.pk, first.pk])
        ))

        self.assertEqual(
            [resource.pk for resource in ordered],
            sorted([first.pk, second.pk]),
        )


def _a_lesson(test_case):
    return Lesson.objects.create(
        chapter=test_case.chapter,
        title='Host',
        teacher='Ms Ada',
        course_date=date(2026, 9, 1),
        position=1,
        last_modified_by=test_case.publisher,
    )


class OrderShapeTests(SimpleTestCase):
    """Every order in the module ends with `id` and never names audit time."""

    def test_the_constants_are_verbatim(self):
        self.assertEqual(
            LESSON_ORDER,
            (
                '-course_date',
                'chapter__module__position',
                'chapter__position',
                'position',
                'id',
            ),
        )
        self.assertEqual(CONTAINER_ORDER, ('position', 'id'))
        self.assertEqual(RESOURCE_ORDER, ('id',))

    def test_every_order_ends_with_id(self):
        for name, order in (
            ('LESSON_ORDER', LESSON_ORDER),
            ('CONTAINER_ORDER', CONTAINER_ORDER),
            ('RESOURCE_ORDER', RESOURCE_ORDER),
            ('lesson_order(relevance)', lesson_order(relevance='relevance')),
        ):
            with self.subTest(order=name):
                self.assertEqual(str(order[-1]), 'id')

    def test_the_module_names_no_audit_timestamp(self):
        # A substring scan, not an AST one: a bare `order_by('created_at')`
        # would evade a name/attribute walk while still breaking the rule.
        source = Path(ordering.__file__).read_text(encoding='utf-8')

        for token in ('created_at', 'updated_at'):
            with self.subTest(timestamp=token):
                self.assertNotIn(token, source)


class PaginationConfigTests(SimpleTestCase):
    """Page-number pagination, fixed at 20, with no `page_size` parameter."""

    def test_the_default_is_page_number_pagination(self):
        self.assertIs(
            api_settings.DEFAULT_PAGINATION_CLASS, PageNumberPagination
        )

    def test_the_configured_paginator_is_fixed_at_twenty(self):
        paginator = api_settings.DEFAULT_PAGINATION_CLASS()

        self.assertEqual(paginator.page_size, 20)
        self.assertEqual(paginator.page_size, api_settings.PAGE_SIZE)
        self.assertIsNone(paginator.page_size_query_param)
