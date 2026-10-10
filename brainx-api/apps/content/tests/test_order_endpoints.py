"""The Publisher-only reorder and Lesson move endpoints (Story 2.4)."""

import uuid
from unittest import mock

from django.conf import settings
from django.test import TestCase
from django.urls import reverse
from drf_spectacular.generators import SchemaGenerator

from .. import mutations
from ..models import Chapter, Course, Lesson, Module
from apps.users.models import User
from .helpers import assert_envelope
from .test_create_endpoints import (
    PASSWORD,
    ContentEndpointTestCase,
    client_for,
)


class ReorderEndpointsTests(ContentEndpointTestCase):
    """A course with two modules, a module with two chapters, a lesson pair."""

    def setUp(self):
        super().setUp()
        self.module2 = Module.objects.create(
            course=self.course,
            name='Module 2',
            position=2,
            last_modified_by=self.publisher,
        )
        self.chapter2 = Chapter.objects.create(
            module=self.module,
            name='Chapter 2',
            position=2,
            last_modified_by=self.publisher,
        )
        self.lesson1 = Lesson.objects.create(
            chapter=self.chapter,
            title='Lesson 1',
            teacher='Ms Ada',
            course_date='2026-09-01',
            position=1,
            last_modified_by=self.publisher,
        )
        self.lesson2 = Lesson.objects.create(
            chapter=self.chapter,
            title='Lesson 2',
            teacher='Ms Ada',
            course_date='2026-09-02',
            position=2,
            last_modified_by=self.publisher,
        )

    def test_reordering_modules_returns_the_new_order_and_renumbers(self):
        self.module.refresh_from_db()
        older_updated_at = self.module.updated_at

        response = self.publisher_client.put(
            reverse('module-reorder', args=[self.course.pk]),
            {'order': [str(self.module2.pk), str(self.module.pk)]},
            format='json',
        )

        self.assertEqual(response.status_code, 200)
        body = response.json()
        self.assertEqual([row['id'] for row in body], [
            str(self.module2.pk),
            str(self.module.pk),
        ])
        self.assertEqual([row['position'] for row in body], [1, 2])
        self.module.refresh_from_db()
        self.module2.refresh_from_db()
        self.assertEqual(self.module2.position, 1)
        self.assertEqual(self.module.position, 2)
        # Every moved row is re-stamped with the acting Publisher and its
        # timestamp is refreshed.
        self.assertEqual(self.module.last_modified_by, self.publisher)
        self.assertEqual(self.module2.last_modified_by, self.publisher)
        self.assertGreater(self.module.updated_at, older_updated_at)

    def test_reordering_chapters_returns_the_new_order_and_renumbers(self):
        response = self.publisher_client.put(
            reverse('chapter-reorder', args=[self.module.pk]),
            {'order': [str(self.chapter2.pk), str(self.chapter.pk)]},
            format='json',
        )

        self.assertEqual(response.status_code, 200)
        self.chapter.refresh_from_db()
        self.chapter2.refresh_from_db()
        self.assertEqual(self.chapter2.position, 1)
        self.assertEqual(self.chapter.position, 2)

    def test_reordering_lessons_returns_the_new_order_and_renumbers(self):
        response = self.publisher_client.put(
            reverse('lesson-reorder', args=[self.chapter.pk]),
            {'order': [str(self.lesson2.pk), str(self.lesson1.pk)]},
            format='json',
        )

        self.assertEqual(response.status_code, 200)
        self.lesson1.refresh_from_db()
        self.lesson2.refresh_from_db()
        self.assertEqual(self.lesson2.position, 1)
        self.assertEqual(self.lesson1.position, 2)

    def test_reordering_normalises_sparse_positions(self):
        sparse = Module.objects.create(
            course=self.course,
            name='Sparse',
            position=5,
            last_modified_by=self.publisher,
        )
        response = self.publisher_client.put(
            reverse('module-reorder', args=[self.course.pk]),
            {'order': [
                str(sparse.pk),
                str(self.module.pk),
                str(self.module2.pk),
            ]},
            format='json',
        )

        self.assertEqual(response.status_code, 200)
        self.assertEqual(
            [row['position'] for row in response.json()], [1, 2, 3]
        )
        sparse.refresh_from_db()
        self.assertEqual(sparse.position, 1)

    def test_an_order_that_is_not_an_exact_permutation_is_rejected(self):
        valid = [str(self.module.pk), str(self.module2.pk)]
        cases = {
            'absent key': None,
            'missing': [str(self.module.pk)],
            'extra': [*valid, str(uuid.uuid4())],
            'foreign': [str(uuid.uuid4()), str(self.module.pk)],
            'duplicate': [str(self.module.pk), str(self.module.pk)],
            'empty with children': [],
        }
        for label, order in cases.items():
            with self.subTest(case=label):
                payload = {} if order is None else {'order': order}
                response = self.publisher_client.put(
                    reverse('module-reorder', args=[self.course.pk]),
                    payload,
                    format='json',
                )
                body = assert_envelope(
                    self, response, 'validation_error', 400
                )
                self.assertIn('order', body['errors'])
        # A rejected request changes nothing.
        self.module.refresh_from_db()
        self.module2.refresh_from_db()
        self.assertEqual(self.module.position, 1)
        self.assertEqual(self.module2.position, 2)

    def test_reordering_an_empty_container_is_a_no_op(self):
        empty = Course.objects.create(
            name='Empty', subject='S', position=99,
            last_modified_by=self.publisher,
        )
        response = self.publisher_client.put(
            reverse('module-reorder', args=[empty.pk]),
            {'order': []},
            format='json',
        )
        self.assertEqual(response.status_code, 200)
        self.assertEqual(response.json(), [])

    def test_already_ordered_children_are_not_rewritten(self):
        with mock.patch.object(mutations, 'mutate', wraps=mutations.mutate) as port:
            response = self.publisher_client.put(
                reverse('module-reorder', args=[self.course.pk]),
                {'order': [str(self.module.pk), str(self.module2.pk)]},
                format='json',
            )
        self.assertEqual(response.status_code, 200)
        port.assert_not_called()

    def test_reordering_an_unknown_container_is_a_404(self):
        response = self.publisher_client.put(
            reverse('module-reorder', args=[uuid.uuid4()]),
            {'order': []},
            format='json',
        )
        assert_envelope(self, response, 'not_found', 404)

    def test_a_non_uuid_container_segment_is_not_a_route(self):
        response = self.publisher_client.put(
            f'{settings.API_PREFIX}/courses/not-a-uuid/modules/order/',
            {'order': []},
            format='json',
        )
        assert_envelope(self, response, 'not_found', 404)


class MoveLessonTests(ContentEndpointTestCase):
    """A source Chapter with two Lessons and a target Chapter with one."""

    def setUp(self):
        super().setUp()
        self.module2 = Module.objects.create(
            course=self.course,
            name='Module 2',
            position=2,
            last_modified_by=self.publisher,
        )
        self.target = Chapter.objects.create(
            module=self.module2,
            name='Target Chapter',
            position=1,
            last_modified_by=self.publisher,
        )
        self.target_lesson = Lesson.objects.create(
            chapter=self.target,
            title='Already there',
            teacher='Ms Ada',
            course_date='2026-09-01',
            position=1,
            last_modified_by=self.publisher,
        )
        self.target_lesson2 = Lesson.objects.create(
            chapter=self.target,
            title='Also there',
            teacher='Ms Ada',
            course_date='2026-09-03',
            position=2,
            last_modified_by=self.publisher,
        )
        self.lesson_kept = Lesson.objects.create(
            chapter=self.chapter,
            title='Stays behind',
            teacher='Ms Ada',
            course_date='2026-09-01',
            position=1,
            last_modified_by=self.publisher,
        )
        self.moved = Lesson.objects.create(
            chapter=self.chapter,
            title='Moves away',
            teacher='Ms Ada',
            course_date='2026-09-02',
            position=2,
            last_modified_by=self.publisher,
        )

    def move_url(self):
        return reverse('lesson-move', args=[self.moved.pk])

    def test_moving_a_lesson_appends_at_the_target_and_keeps_its_uuid(self):
        original_id = self.moved.pk
        # The moved Lesson sits at 2 and the target's next free slot is 3, so
        # appending is distinguishable from keeping the pre-move position.
        self.assertEqual(self.moved.position, 2)

        response = self.publisher_client.patch(
            self.move_url(),
            {'chapter': str(self.target.pk)},
            format='json',
        )

        self.assertEqual(response.status_code, 200)
        body = response.json()
        self.assertEqual(body['id'], str(original_id))
        self.assertEqual(body['position'], 3)
        self.moved.refresh_from_db()
        self.assertEqual(self.moved.pk, original_id)
        self.assertEqual(self.moved.chapter_id, self.target.pk)
        self.assertEqual(self.moved.position, 3)
        # The source Chapter is left sparse: nothing occupies slot 2 there.
        self.assertFalse(
            Lesson.objects.filter(
                chapter=self.chapter, position=2
            ).exists()
        )
        self.assertEqual(self.lesson_kept.position, 1)

    def test_moving_to_the_same_chapter_is_rejected_and_named(self):
        response = self.publisher_client.patch(
            self.move_url(),
            {'chapter': str(self.chapter.pk)},
            format='json',
        )
        body = assert_envelope(self, response, 'validation_error', 400)
        self.assertIn('chapter', body['errors'])
        self.moved.refresh_from_db()
        self.assertEqual(self.moved.chapter_id, self.chapter.pk)

    def test_moving_to_an_unknown_chapter_is_a_404(self):
        response = self.publisher_client.patch(
            self.move_url(),
            {'chapter': str(uuid.uuid4())},
            format='json',
        )
        assert_envelope(self, response, 'not_found', 404)

    def test_a_missing_or_malformed_target_is_rejected_and_named(self):
        for payload in ({}, {'chapter': 'not-a-uuid'}):
            with self.subTest(payload=payload):
                response = self.publisher_client.patch(
                    self.move_url(), payload, format='json'
                )
                body = assert_envelope(
                    self, response, 'validation_error', 400
                )
                self.assertIn('chapter', body['errors'])

    def test_a_non_uuid_lesson_segment_is_not_a_route(self):
        response = self.publisher_client.patch(
            f'{settings.API_PREFIX}/lessons/not-a-uuid/move/',
            {'chapter': str(self.target.pk)},
            format='json',
        )
        assert_envelope(self, response, 'not_found', 404)


class OrderingAuthorizationTests(ContentEndpointTestCase):
    def setUp(self):
        super().setUp()
        self.module2 = Module.objects.create(
            course=self.course,
            name='Module 2',
            position=2,
            last_modified_by=self.publisher,
        )
        self.chapter2 = Chapter.objects.create(
            module=self.module2,
            name='Chapter 2',
            position=1,
            last_modified_by=self.publisher,
        )
        self.lesson = Lesson.objects.create(
            chapter=self.chapter,
            title='Lesson',
            teacher='Ms Ada',
            course_date='2026-09-01',
            position=1,
            last_modified_by=self.publisher,
        )

    def test_a_student_or_anonymous_caller_cannot_reorder_or_move(self):
        order_url = reverse('module-reorder', args=[self.course.pk])
        order_payload = {
            'order': [str(self.module2.pk), str(self.module.pk)]
        }
        move_url = reverse('lesson-move', args=[self.lesson.pk])
        move_payload = {'chapter': str(self.chapter2.pk)}

        student = client_for(self.student)
        for method, url, payload in (
            ('put', order_url, order_payload),
            ('patch', move_url, move_payload),
        ):
            with self.subTest(url=url):
                response = getattr(student, method)(url, payload, format='json')
                assert_envelope(self, response, 'permission_denied', 403)

        for client in (self.anonymous_client,):
            for method, url, payload in (
                ('put', order_url, order_payload),
                ('patch', move_url, move_payload),
            ):
                with self.subTest(method=method, url=url):
                    response = getattr(client, method)(
                        url, payload, format='json'
                    )
                    assert_envelope(self, response, 'unauthenticated', 401)


class OrderingAtomicityAndPortTests(ContentEndpointTestCase):
    """Reorder and move are one transaction and write only through mutate."""

    def setUp(self):
        super().setUp()
        self.module2 = Module.objects.create(
            course=self.course,
            name='Module 2',
            position=2,
            last_modified_by=self.publisher,
        )
        self.chapter2 = Chapter.objects.create(
            module=self.module2,
            name='Chapter 2',
            position=1,
            last_modified_by=self.publisher,
        )
        self.lesson = Lesson.objects.create(
            chapter=self.chapter,
            title='Lesson',
            teacher='Ms Ada',
            course_date='2026-09-01',
            position=1,
            last_modified_by=self.publisher,
        )

    def test_a_reorder_is_one_transaction_and_rolls_back_as_one(self):
        calls = {'count': 0}

        def fail_on_second_ancestor_pass(instance):
            calls['count'] += 1
            if calls['count'] == 2:
                raise RuntimeError('ancestor pass failed')

        with mock.patch.object(
            mutations, '_recompute_ancestors', side_effect=fail_on_second_ancestor_pass
        ):
            with self.assertRaises(RuntimeError):
                self.publisher_client.put(
                    reverse('module-reorder', args=[self.course.pk]),
                    {'order': [str(self.module2.pk), str(self.module.pk)]},
                    format='json',
                )

        # The first row change was written inside the transaction, then the
        # failure rolled both rows back together.
        self.module.refresh_from_db()
        self.module2.refresh_from_db()
        self.assertEqual(self.module.position, 1)
        self.assertEqual(self.module2.position, 2)

    def test_a_move_is_one_transaction_and_rolls_back_as_one(self):
        with mock.patch.object(
            mutations, '_recompute_ancestors', side_effect=RuntimeError('boom')
        ):
            with self.assertRaises(RuntimeError):
                self.publisher_client.patch(
                    reverse('lesson-move', args=[self.lesson.pk]),
                    {'chapter': str(self.chapter2.pk)},
                    format='json',
                )

        self.lesson.refresh_from_db()
        self.assertEqual(self.lesson.chapter_id, self.chapter.pk)
        self.assertEqual(self.lesson.position, 1)

    def test_reorder_stamps_each_row_through_mutate(self):
        with mock.patch.object(
            mutations, 'mutate', wraps=mutations.mutate
        ) as port:
            self.publisher_client.put(
                reverse('module-reorder', args=[self.course.pk]),
                {'order': [str(self.module2.pk), str(self.module.pk)]},
                format='json',
            )
        # Two pass-1 moves plus two pass-2 moves, all position-only writes.
        self.assertEqual(port.call_count, 4)
        for call in port.call_args_list:
            self.assertEqual(call.kwargs['actor'], self.publisher)
            self.assertEqual(set(call.kwargs['data']), {'position'})

    def test_move_stamps_the_row_through_mutate(self):
        with mock.patch.object(
            mutations, 'mutate', wraps=mutations.mutate
        ) as port:
            self.publisher_client.patch(
                reverse('lesson-move', args=[self.lesson.pk]),
                {'chapter': str(self.chapter2.pk)},
                format='json',
            )
        port.assert_called_once()
        self.assertEqual(port.call_args.kwargs['actor'], self.publisher)
        self.assertEqual(
            set(port.call_args.kwargs['data']), {'chapter', 'position'}
        )


class OrderingSecondPublisherTests(ContentEndpointTestCase):
    """A reorder or move re-stamps each touched row with the acting Publisher."""

    def setUp(self):
        super().setUp()
        self.module2 = Module.objects.create(
            course=self.course,
            name='Module 2',
            position=2,
            last_modified_by=self.publisher,
        )
        self.chapter2 = Chapter.objects.create(
            module=self.module2,
            name='Chapter 2',
            position=1,
            last_modified_by=self.publisher,
        )
        self.lesson = Lesson.objects.create(
            chapter=self.chapter,
            title='Lesson',
            teacher='Ms Ada',
            course_date='2026-09-01',
            position=1,
            last_modified_by=self.publisher,
        )

    def test_a_second_publisher_re_stamps_a_reorder_and_a_move(self):
        second = User.objects.create_user(
            email='second@example.com',
            password=PASSWORD,
            is_publisher=True,
            is_email_verified=True,
        )
        second_client = client_for(second)

        reorder = second_client.put(
            reverse('module-reorder', args=[self.course.pk]),
            {'order': [str(self.module2.pk), str(self.module.pk)]},
            format='json',
        )
        self.assertEqual(reorder.status_code, 200)
        move = second_client.patch(
            reverse('lesson-move', args=[self.lesson.pk]),
            {'chapter': str(self.chapter2.pk)},
            format='json',
        )
        self.assertEqual(move.status_code, 200)

        self.module.refresh_from_db()
        self.module2.refresh_from_db()
        self.lesson.refresh_from_db()
        self.assertEqual(self.module.last_modified_by, second)
        self.assertEqual(self.module2.last_modified_by, second)
        self.assertEqual(self.lesson.last_modified_by, second)


class ReorderSchemaTests(TestCase):
    """The reorder and move operations are documented and under the prefix."""

    def route_specs(self):
        return [
            ('module-reorder', 'put', '/api/v1/courses/{course_id}/modules/order/'),
            ('chapter-reorder', 'put', '/api/v1/modules/{module_id}/chapters/order/'),
            ('lesson-reorder', 'put', '/api/v1/chapters/{chapter_id}/lessons/order/'),
            ('lesson-move', 'patch', '/api/v1/lessons/{lesson_id}/move/'),
        ]

    def test_every_route_lives_under_the_api_prefix(self):
        for name, _, _ in self.route_specs():
            with self.subTest(name=name):
                url = reverse(name, args=[uuid.uuid4()])
                self.assertTrue(url.startswith(settings.API_PREFIX + '/'))

    def test_the_schema_documents_every_operation(self):
        schema = SchemaGenerator().get_schema(request=None, public=True)
        paths = schema['paths']
        for _, method, path in self.route_specs():
            with self.subTest(path=path):
                self.assertIn(path, paths)
                self.assertIn(method, paths[path])

    def test_the_schema_uses_the_request_serializers(self):
        schema = SchemaGenerator().get_schema(request=None, public=True)
        paths = schema['paths']
        self.assertEqual(
            paths['/api/v1/courses/{course_id}/modules/order/']['put'][
                'requestBody'
            ]['content']['application/json']['schema']['$ref'],
            '#/components/schemas/Reorder',
        )
        # drf-spectacular prefixes PATCH request schemas with "Patched".
        self.assertEqual(
            paths['/api/v1/lessons/{lesson_id}/move/']['patch'][
                'requestBody'
            ]['content']['application/json']['schema']['$ref'],
            '#/components/schemas/PatchedLessonMove',
        )
