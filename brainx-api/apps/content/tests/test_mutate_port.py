"""The single write port that stamps who changed a content row (Story 2.2)."""

import ast
from datetime import date
from pathlib import Path
from unittest import mock

from django.db import connection, models
from django.db.migrations.executor import MigrationExecutor
from django.test import SimpleTestCase, TestCase, TransactionTestCase
from django.urls import reverse

from apps.core.models import TimeStampedModel
from apps.users.models import User

from .. import mutations, views
from ..models import Chapter, Course, Lesson, Module
from ..mutations import mutate
from .test_create_endpoints import (
    LESSON_PAYLOAD,
    PASSWORD,
    ContentEndpointTestCase,
    client_for,
)


def create_cases(test):
    """Every create endpoint with a valid payload, paired with its model."""
    return (
        (
            reverse('course-create'),
            {'name': 'Physics', 'subject': 'Mechanics'},
            Course,
        ),
        (test.module_url(), {'name': 'Module 2'}, Module),
        (
            reverse('chapter-create', args=[test.module.pk]),
            {'name': 'Chapter 2'},
            Chapter,
        ),
        (test.lesson_url(), LESSON_PAYLOAD, Lesson),
    )


class StampOnCreateTests(ContentEndpointTestCase):
    def test_every_level_stamps_the_acting_publisher(self):
        cases = (
            (
                reverse('course-create'),
                {'name': 'Physics', 'subject': 'Mechanics'},
                Course,
            ),
            (self.module_url(), {'name': 'Module 2'}, Module),
            (
                reverse('chapter-create', args=[self.module.pk]),
                {'name': 'Chapter 2'},
                Chapter,
            ),
            (self.lesson_url(), LESSON_PAYLOAD, Lesson),
        )

        for url, payload, model in cases:
            with self.subTest(model=model.__name__):
                response = self.publisher_client.post(url, payload, format='json')

                self.assertEqual(response.status_code, 201)
                row = model.objects.get(pk=response.json()['id'])
                self.assertEqual(row.last_modified_by, self.publisher)

    def test_every_response_exposes_the_stamp_and_when_it_changed(self):
        expected = {'id': str(self.publisher.id), 'email': self.publisher.email}

        for url, payload, model in create_cases(self):
            with self.subTest(model=model.__name__):
                response = self.publisher_client.post(url, payload, format='json')

                self.assertEqual(response.status_code, 201)
                body = response.json()
                self.assertEqual(body['last_modified_by'], expected)
                self.assertIn('updated_at', body)
                self.assertIsNotNone(body['updated_at'])


class MutatePortTests(ContentEndpointTestCase):
    def test_the_actor_is_an_explicit_argument(self):
        row = mutate(
            actor=self.publisher,
            model=Course,
            data={'name': 'Direct', 'subject': 'S', 'position': 2},
        )

        self.assertTrue(Course.objects.filter(pk=row.pk).exists())
        self.assertEqual(row.last_modified_by, self.publisher)


class InjectedStampTests(ContentEndpointTestCase):
    def test_an_injected_stamp_and_timestamp_are_ignored_at_every_level(self):
        other = User.objects.create_user(
            email='other@example.com',
            password=PASSWORD,
            is_publisher=True,
            is_email_verified=True,
        )
        injected = {
            'last_modified_by': str(other.id),
            'updated_at': '2000-01-01T00:00:00Z',
        }
        expected = {'id': str(self.publisher.id), 'email': self.publisher.email}

        for url, payload, model in create_cases(self):
            with self.subTest(model=model.__name__):
                response = self.publisher_client.post(
                    url, {**payload, **injected}, format='json'
                )

                self.assertEqual(response.status_code, 201)
                row = model.objects.get(pk=response.json()['id'])
                self.assertEqual(row.last_modified_by, self.publisher)
                body = response.json()
                self.assertEqual(body['last_modified_by'], expected)
                self.assertNotEqual(body['updated_at'], injected['updated_at'])


class AtomicityTests(ContentEndpointTestCase):
    def test_a_failure_after_the_row_change_rolls_everything_back(self):
        with mock.patch.object(
            mutations,
            '_recompute_ancestors',
            side_effect=RuntimeError('ancestor pass failed'),
        ):
            with self.assertRaises(RuntimeError):
                self.publisher_client.post(
                    reverse('course-create'),
                    {'name': 'Rollback', 'subject': 'X'},
                    format='json',
                )

        # The exception propagated and the change never became a row, so the
        # row and its stamp rolled back together.
        self.assertFalse(Course.objects.filter(name='Rollback').exists())


class SingleWritePathTests(ContentEndpointTestCase):
    def test_a_create_fails_when_the_port_is_unavailable(self):
        cases = (
            (reverse('course-create'), {'name': 'X', 'subject': 'Y'}),
            (self.module_url(), {'name': 'X'}),
            (reverse('chapter-create', args=[self.module.pk]), {'name': 'X'}),
            (self.lesson_url(), LESSON_PAYLOAD),
        )

        for url, payload in cases:
            with self.subTest(url=url):
                with mock.patch(
                    'apps.content.views.mutate',
                    side_effect=RuntimeError('mutate is unavailable'),
                ):
                    with self.assertRaises(RuntimeError):
                        self.publisher_client.post(url, payload, format='json')

        self.assertEqual(Course.objects.count(), 1)
        self.assertEqual(Module.objects.count(), 1)
        self.assertEqual(Chapter.objects.count(), 1)
        self.assertEqual(Lesson.objects.count(), 0)

    def test_no_view_persists_a_row_without_the_port(self):
        # Each view is handed a valid but unsaved row in place of the port's
        # real result. If a view wrote a content row itself, a row would exist
        # even though the port never ran.
        phantom_lesson = Lesson(
            chapter=self.chapter,
            title=LESSON_PAYLOAD['title'],
            teacher=LESSON_PAYLOAD['teacher'],
            course_date=date(2026, 9, 1),
            position=99,
            last_modified_by=self.publisher,
        )
        cases = (
            (
                reverse('course-create'),
                {'name': 'Ghost', 'subject': 'S'},
                Course,
                Course(
                    name='Ghost', subject='S', position=99,
                    last_modified_by=self.publisher,
                ),
            ),
            (
                self.module_url(),
                {'name': 'Ghost'},
                Module,
                Module(
                    name='Ghost', course=self.course, position=99,
                    last_modified_by=self.publisher,
                ),
            ),
            (
                reverse('chapter-create', args=[self.module.pk]),
                {'name': 'Ghost'},
                Chapter,
                Chapter(
                    name='Ghost', module=self.module, position=99,
                    last_modified_by=self.publisher,
                ),
            ),
            (self.lesson_url(), LESSON_PAYLOAD, Lesson, phantom_lesson),
        )

        for url, payload, model, phantom in cases:
            with self.subTest(url=url):
                with mock.patch(
                    'apps.content.views.mutate', return_value=phantom
                ) as port:
                    response = self.publisher_client.post(
                        url, payload, format='json'
                    )

                self.assertEqual(response.status_code, 201)
                self.assertEqual(port.call_args.kwargs['actor'], self.publisher)
                self.assertEqual(port.call_args.kwargs['model'], model)

        self.assertEqual(Course.objects.count(), 1)
        self.assertEqual(Module.objects.count(), 1)
        self.assertEqual(Chapter.objects.count(), 1)
        self.assertEqual(Lesson.objects.count(), 0)


class SecondPublisherTests(ContentEndpointTestCase):
    def test_a_second_publisher_stamps_themselves(self):
        second = User.objects.create_user(
            email='second@example.com',
            password=PASSWORD,
            is_publisher=True,
            is_email_verified=True,
        )
        response = client_for(second).post(
            reverse('course-create'),
            {'name': 'Biology', 'subject': 'Cells'},
            format='json',
        )

        self.assertEqual(response.status_code, 201)
        row = Course.objects.get(pk=response.json()['id'])
        self.assertEqual(row.last_modified_by, second)
        self.assertEqual(
            response.json()['last_modified_by']['email'], 'second@example.com'
        )


class SchemaAuthorshipTests(TestCase):
    def test_every_content_model_carries_a_non_null_protected_stamp(self):
        for model in (Course, Module, Chapter, Lesson):
            with self.subTest(model=model.__name__):
                field = model._meta.get_field('last_modified_by')
                self.assertIsInstance(field, models.ForeignKey)
                self.assertFalse(field.null)
                self.assertIs(field.related_model, User)
                self.assertIs(field.remote_field.on_delete, models.PROTECT)

    def test_the_stamp_is_the_only_field_pointing_at_the_user(self):
        # Authorship is per row. A second user reference on a model would be
        # the start of a global author field, which the schema forbids.
        for model in (Course, Module, Chapter, Lesson):
            with self.subTest(model=model.__name__):
                user_fields = sorted(
                    field.name
                    for field in model._meta.get_fields()
                    if isinstance(field, models.ForeignKey)
                    and field.related_model is User
                )
                self.assertEqual(user_fields, ['last_modified_by'])

    def test_the_shared_timestamped_base_carries_no_author(self):
        names = {field.name for field in TimeStampedModel._meta.local_fields}
        self.assertEqual(names, {'created_at', 'updated_at'})


class NoQuerysetUpdateTests(SimpleTestCase):
    """No view or the port itself rewrites a content row in place."""

    def calls_update(self, module):
        tree = ast.parse(Path(module.__file__).read_text(encoding='utf-8'))
        return [
            node
            for node in ast.walk(tree)
            if isinstance(node, ast.Call)
            and isinstance(node.func, ast.Attribute)
            and node.func.attr == 'update'
        ]

    def test_views_and_mutations_never_call_update(self):
        for module in (views, mutations):
            with self.subTest(module=module.__name__):
                self.assertEqual(self.calls_update(module), [])


class MigrationBackfillTests(TransactionTestCase):
    """0002 stamps rows that predate the actor field instead of dropping them."""

    MIGRATE_FROM = [('content', '0001_initial')]
    MIGRATE_TO = [
        (
            'content',
            '0002_chapter_last_modified_by_course_last_modified_by_and_more',
        )
    ]

    def tearDown(self):
        # Leave the schema at the latest revision for the tests that follow.
        executor = MigrationExecutor(connection)
        executor.migrate(executor.loader.graph.leaf_nodes())

    def test_an_existing_course_survives_and_is_stamped_with_a_real_user(self):
        executor = MigrationExecutor(connection)
        executor.migrate(self.MIGRATE_FROM)
        actor = User.objects.create_user(email='legacy@example.com')

        historical_course = executor.loader.project_state(
            self.MIGRATE_FROM
        ).apps.get_model('content', 'Course')
        course_id = historical_course.objects.create(
            name='Legacy', subject='Algebra', position=1
        ).pk

        executor = MigrationExecutor(connection)
        executor.migrate(self.MIGRATE_TO)

        row = Course.objects.get(pk=course_id)
        self.assertIsNotNone(row.last_modified_by_id)
        self.assertEqual(User.objects.get(pk=row.last_modified_by_id), actor)
