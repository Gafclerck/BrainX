"""The Publisher-only removal, preview and restore endpoints (Story 2.5)."""

import uuid
from datetime import date
from unittest import mock

from django.conf import settings
from django.test import TestCase
from django.urls import reverse
from drf_spectacular.generators import SchemaGenerator

from apps.users.models import User

from .. import mutations
from ..models import Chapter, ContentQuerySet, Course, Lesson, Module
from .helpers import assert_envelope
from .test_create_endpoints import (
    PASSWORD,
    ContentEndpointTestCase,
    client_for,
)

DETAIL_ROUTE_BY_MODEL = {
    Course: 'course-update',
    Module: 'module-update',
    Chapter: 'chapter-update',
    Lesson: 'lesson-update',
}

PREVIEW_ROUTE_BY_MODEL = {
    Course: 'course-removal-preview',
    Module: 'module-removal-preview',
    Chapter: 'chapter-removal-preview',
    Lesson: 'lesson-removal-preview',
}

RESTORE_ROUTE_BY_MODEL = {
    Course: 'course-restore',
    Module: 'module-restore',
    Chapter: 'chapter-restore',
    Lesson: 'lesson-restore',
}


class RemovalEndpointTestCase(ContentEndpointTestCase):
    """The base tree plus a second container and the rows beneath it.

    Course
      Module 1
        Chapter 1
          Lesson 1
          Lesson 2
        Chapter 2
          Lesson 3
      Module 2
    """

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
            course_date=date(2026, 9, 1),
            position=1,
            last_modified_by=self.publisher,
        )
        self.lesson2 = Lesson.objects.create(
            chapter=self.chapter,
            title='Lesson 2',
            teacher='Ms Ada',
            course_date=date(2026, 9, 2),
            position=2,
            last_modified_by=self.publisher,
        )
        self.lesson3 = Lesson.objects.create(
            chapter=self.chapter2,
            title='Lesson 3',
            teacher='Ms Ada',
            course_date=date(2026, 9, 3),
            position=1,
            last_modified_by=self.publisher,
        )

    def preview_url(self, model, pk):
        return reverse(PREVIEW_ROUTE_BY_MODEL[model], args=[pk])

    def removal_url(self, model, pk):
        return reverse(DETAIL_ROUTE_BY_MODEL[model], args=[pk])

    def restore_url(self, model, pk):
        return reverse(RESTORE_ROUTE_BY_MODEL[model], args=[pk])

    def snapshot(self):
        """Every row's persisted identity, flag, stamp and timestamp."""
        return {
            model.__name__: list(
                model.objects.order_by('pk').values_list(
                    'pk', 'is_deleted', 'updated_at', 'last_modified_by_id'
                )
            )
            for model in (Course, Module, Chapter, Lesson)
        }

    def second_publisher(self):
        return User.objects.create_user(
            email='second@example.com',
            password=PASSWORD,
            is_publisher=True,
            is_email_verified=True,
        )


class RemovalPreviewTests(RemovalEndpointTestCase):
    def test_previewing_a_course_enumerates_every_live_row_and_writes_nothing(self):
        before = self.snapshot()

        response = self.publisher_client.get(
            self.preview_url(Course, self.course.pk)
        )

        self.assertEqual(response.status_code, 200)
        body = response.json()
        self.assertEqual(
            body['would_remove'],
            {
                'course': 1,
                'module': 2,
                'chapter': 2,
                'lesson': 3,
                'total': 8,
            },
        )
        expected_ids = {
            str(row.pk)
            for model in (Course, Module, Chapter, Lesson)
            for row in model.objects.all()
        }
        self.assertEqual({item['id'] for item in body['items']}, expected_ids)
        self.assertEqual(
            {item['level'] for item in body['items']},
            {'course', 'module', 'chapter', 'lesson'},
        )
        # The dry run changed no row at all.
        self.assertEqual(self.snapshot(), before)

    def test_previewing_a_lesson_reports_only_that_lesson(self):
        response = self.publisher_client.get(
            self.preview_url(Lesson, self.lesson1.pk)
        )

        self.assertEqual(response.status_code, 200)
        body = response.json()
        self.assertEqual(
            body['would_remove'],
            {'course': 0, 'module': 0, 'chapter': 0, 'lesson': 1, 'total': 1},
        )
        self.assertEqual(len(body['items']), 1)
        item = body['items'][0]
        self.assertEqual(item['id'], str(self.lesson1.pk))
        self.assertEqual(item['level'], 'lesson')
        self.assertEqual(item['name'], 'Lesson 1')
        self.assertEqual(item['position'], 1)

    def test_preview_excludes_rows_the_removal_would_not_newly_hide(self):
        mutations.mutate(
            actor=self.publisher,
            model=Lesson,
            instance=self.lesson2,
            data={'is_deleted': True},
        )

        response = self.publisher_client.get(
            self.preview_url(Course, self.course.pk)
        )

        body = response.json()
        self.assertEqual(body['would_remove']['total'], 7)
        self.assertEqual(body['would_remove']['lesson'], 2)
        self.assertNotIn(
            str(self.lesson2.pk), {item['id'] for item in body['items']}
        )

    def test_previewing_a_module_counts_its_whole_subtree(self):
        response = self.publisher_client.get(
            self.preview_url(Module, self.module.pk)
        )

        self.assertEqual(response.status_code, 200)
        body = response.json()
        self.assertEqual(
            body['would_remove'],
            {'course': 0, 'module': 1, 'chapter': 2, 'lesson': 3, 'total': 6},
        )
        self.assertEqual(
            {item['id'] for item in body['items']},
            {
                str(row.pk)
                for row in (
                    self.module,
                    self.chapter,
                    self.chapter2,
                    self.lesson1,
                    self.lesson2,
                    self.lesson3,
                )
            },
        )

    def test_previewing_a_chapter_counts_its_lessons(self):
        response = self.publisher_client.get(
            self.preview_url(Chapter, self.chapter.pk)
        )

        self.assertEqual(response.status_code, 200)
        body = response.json()
        self.assertEqual(
            body['would_remove'],
            {'course': 0, 'module': 0, 'chapter': 1, 'lesson': 2, 'total': 3},
        )
        self.assertEqual(
            {item['id'] for item in body['items']},
            {
                str(row.pk)
                for row in (self.chapter, self.lesson1, self.lesson2)
            },
        )

    def test_previewing_an_unknown_id_is_a_404(self):
        for model in (Course, Module, Chapter, Lesson):
            with self.subTest(model=model.__name__):
                response = self.publisher_client.get(
                    self.preview_url(model, uuid.uuid4())
                )
                assert_envelope(self, response, 'not_found', 404)

    def test_a_non_uuid_segment_is_not_a_route(self):
        response = self.publisher_client.get(
            f'{settings.API_PREFIX}/courses/not-a-uuid/removal-preview/'
        )
        assert_envelope(self, response, 'not_found', 404)


class RemovalCommitTests(RemovalEndpointTestCase):
    def test_removing_a_course_cascades_to_every_live_descendant(self):
        second = self.second_publisher()

        response = client_for(second).delete(
            self.removal_url(Course, self.course.pk)
        )

        self.assertEqual(response.status_code, 200)
        self.assertTrue(response.json()['is_deleted'])
        for model in (Course, Module, Chapter, Lesson):
            with self.subTest(model=model.__name__):
                rows = model.objects.all()
                self.assertTrue(rows.exists())
                self.assertFalse(rows.filter(is_deleted=False).exists())
                # The cascade re-stamps every row with the acting Publisher.
                self.assertFalse(rows.exclude(last_modified_by=second).exists())

    def test_removing_a_lesson_sets_only_its_own_flag(self):
        response = self.publisher_client.delete(
            self.removal_url(Lesson, self.lesson1.pk)
        )

        self.assertEqual(response.status_code, 200)
        self.lesson1.refresh_from_db()
        self.lesson2.refresh_from_db()
        self.assertTrue(self.lesson1.is_deleted)
        self.assertFalse(self.lesson2.is_deleted)
        self.assertFalse(Course.objects.get(pk=self.course.pk).is_deleted)

    def test_removing_a_module_cascades_to_its_subtree_and_restamps(self):
        second = self.second_publisher()

        response = client_for(second).delete(
            self.removal_url(Module, self.module.pk)
        )

        self.assertEqual(response.status_code, 200)
        self.assertTrue(response.json()['is_deleted'])
        for row in (
            self.module,
            self.chapter,
            self.chapter2,
            self.lesson1,
            self.lesson2,
            self.lesson3,
        ):
            row.refresh_from_db()
            self.assertTrue(row.is_deleted)
            self.assertEqual(row.last_modified_by, second)
        # Siblings outside the subtree stay live.
        self.course.refresh_from_db()
        self.module2.refresh_from_db()
        self.assertFalse(self.course.is_deleted)
        self.assertFalse(self.module2.is_deleted)

    def test_removing_a_chapter_cascades_to_its_lessons_and_restamps(self):
        second = self.second_publisher()

        response = client_for(second).delete(
            self.removal_url(Chapter, self.chapter.pk)
        )

        self.assertEqual(response.status_code, 200)
        self.assertTrue(response.json()['is_deleted'])
        for row in (self.chapter, self.lesson1, self.lesson2):
            row.refresh_from_db()
            self.assertTrue(row.is_deleted)
            self.assertEqual(row.last_modified_by, second)
        self.module.refresh_from_db()
        self.chapter2.refresh_from_db()
        self.lesson3.refresh_from_db()
        self.assertFalse(self.module.is_deleted)
        self.assertFalse(self.chapter2.is_deleted)
        self.assertFalse(self.lesson3.is_deleted)

    def test_removing_an_already_deleted_container_hides_a_new_live_descendant(self):
        self.publisher_client.delete(
            self.removal_url(Course, self.course.pk)
        )
        self.course.refresh_from_db()
        stamp_before = self.course.last_modified_by_id
        updated_before = self.course.updated_at

        # Reachable because the default manager is unfiltered: a live child can
        # exist under a container that already carries the flag.
        late = Module.objects.create(
            course=self.course,
            name='Late',
            position=3,
            last_modified_by=self.publisher,
        )
        second = self.second_publisher()

        response = client_for(second).delete(
            self.removal_url(Course, self.course.pk)
        )

        self.assertEqual(response.status_code, 200)
        self.course.refresh_from_db()
        self.assertTrue(self.course.is_deleted)
        # The already-deleted node itself is untouched.
        self.assertEqual(self.course.last_modified_by_id, stamp_before)
        self.assertEqual(self.course.updated_at, updated_before)
        # The newly live descendant is hidden and re-stamped.
        late.refresh_from_db()
        self.assertTrue(late.is_deleted)
        self.assertEqual(late.last_modified_by, second)

    def test_removing_an_already_deleted_node_changes_nothing(self):
        self.publisher_client.delete(
            self.removal_url(Lesson, self.lesson1.pk)
        )
        self.lesson1.refresh_from_db()
        stamp_before = self.lesson1.last_modified_by_id
        updated_before = self.lesson1.updated_at

        response = self.publisher_client.delete(
            self.removal_url(Lesson, self.lesson1.pk)
        )

        self.assertEqual(response.status_code, 200)
        self.lesson1.refresh_from_db()
        self.assertTrue(self.lesson1.is_deleted)
        self.assertEqual(self.lesson1.last_modified_by_id, stamp_before)
        self.assertEqual(self.lesson1.updated_at, updated_before)

    def test_removing_skips_a_descendant_already_deleted(self):
        self.publisher_client.delete(
            self.removal_url(Lesson, self.lesson1.pk)
        )
        self.lesson1.refresh_from_db()
        stamp_before = self.lesson1.last_modified_by_id
        updated_before = self.lesson1.updated_at

        response = self.publisher_client.delete(
            self.removal_url(Course, self.course.pk)
        )

        self.assertEqual(response.status_code, 200)
        self.lesson1.refresh_from_db()
        self.assertTrue(self.lesson1.is_deleted)
        # Not resurfaced and not re-stamped by the later removal.
        self.assertEqual(self.lesson1.last_modified_by_id, stamp_before)
        self.assertEqual(self.lesson1.updated_at, updated_before)

    def test_removing_an_unknown_id_is_a_404(self):
        for model in (Course, Module, Chapter, Lesson):
            with self.subTest(model=model.__name__):
                response = self.publisher_client.delete(
                    self.removal_url(model, uuid.uuid4())
                )
                assert_envelope(self, response, 'not_found', 404)

    def test_a_failure_mid_cascade_rolls_back_every_change(self):
        calls = {'count': 0}

        def fail_on_second_row(instance):
            calls['count'] += 1
            if calls['count'] == 2:
                raise RuntimeError('cascade row failed')

        with mock.patch.object(
            mutations, '_recompute_ancestors', side_effect=fail_on_second_row
        ):
            with self.assertRaises(RuntimeError):
                self.publisher_client.delete(
                    self.removal_url(Course, self.course.pk)
                )

        for model in (Course, Module, Chapter, Lesson):
            with self.subTest(model=model.__name__):
                self.assertFalse(model.objects.filter(is_deleted=True).exists())


class RemovalRestoreTests(RemovalEndpointTestCase):
    def test_restoring_a_node_clears_only_its_own_flag(self):
        self.publisher_client.delete(
            self.removal_url(Course, self.course.pk)
        )

        response = self.publisher_client.post(
            self.restore_url(Course, self.course.pk)
        )

        self.assertEqual(response.status_code, 200)
        self.assertFalse(response.json()['is_deleted'])
        self.course.refresh_from_db()
        self.assertFalse(self.course.is_deleted)
        # Node-only: descendants stay deleted until restored themselves.
        for model in (Module, Chapter, Lesson):
            with self.subTest(model=model.__name__):
                self.assertFalse(model.objects.filter(is_deleted=False).exists())

    def test_restoring_a_module_clears_only_its_own_flag(self):
        self.publisher_client.delete(
            self.removal_url(Module, self.module.pk)
        )

        response = self.publisher_client.post(
            self.restore_url(Module, self.module.pk)
        )

        self.assertEqual(response.status_code, 200)
        self.assertFalse(response.json()['is_deleted'])
        self.module.refresh_from_db()
        self.assertFalse(self.module.is_deleted)
        # Node-only: its Chapters and Lessons stay deleted.
        for row in (
            self.chapter,
            self.chapter2,
            self.lesson1,
            self.lesson2,
            self.lesson3,
        ):
            row.refresh_from_db()
            self.assertTrue(row.is_deleted)

    def test_restoring_a_chapter_clears_only_its_own_flag(self):
        self.publisher_client.delete(
            self.removal_url(Chapter, self.chapter.pk)
        )

        response = self.publisher_client.post(
            self.restore_url(Chapter, self.chapter.pk)
        )

        self.assertEqual(response.status_code, 200)
        self.assertFalse(response.json()['is_deleted'])
        self.chapter.refresh_from_db()
        self.assertFalse(self.chapter.is_deleted)
        # Node-only: its Lessons stay deleted.
        for row in (self.lesson1, self.lesson2):
            row.refresh_from_db()
            self.assertTrue(row.is_deleted)

    def test_restoring_a_child_leaves_its_ancestors_deleted(self):
        self.publisher_client.delete(
            self.removal_url(Course, self.course.pk)
        )

        response = self.publisher_client.post(
            self.restore_url(Lesson, self.lesson1.pk)
        )

        self.assertEqual(response.status_code, 200)
        self.lesson1.refresh_from_db()
        self.assertFalse(self.lesson1.is_deleted)
        # The row above it is a separate restore and stays hidden.
        for row in (
            self.course,
            self.module,
            self.chapter,
            self.chapter2,
            self.lesson2,
            self.lesson3,
        ):
            row.refresh_from_db()
            self.assertTrue(row.is_deleted)

    def test_a_soft_deleted_row_is_reachable_through_with_deleted(self):
        self.publisher_client.delete(
            self.removal_url(Lesson, self.lesson1.pk)
        )

        self.assertTrue(
            Lesson.objects.with_deleted().filter(pk=self.lesson1.pk).exists()
        )
        self.assertFalse(
            Lesson.objects.filter(
                pk=self.lesson1.pk, is_deleted=False
            ).exists()
        )

        self.publisher_client.post(
            self.restore_url(Lesson, self.lesson1.pk)
        )

        self.assertFalse(
            Lesson.objects.with_deleted().filter(pk=self.lesson1.pk).exists()
        )
        self.assertTrue(
            Lesson.objects.filter(
                pk=self.lesson1.pk, is_deleted=False
            ).exists()
        )

    def test_restore_reads_the_soft_deleted_row_through_with_deleted(self):
        self.publisher_client.delete(
            self.removal_url(Lesson, self.lesson1.pk)
        )
        original = ContentQuerySet.with_deleted
        calls = []

        def spy(queryset):
            calls.append(queryset)
            return original(queryset)

        with mock.patch.object(ContentQuerySet, 'with_deleted', spy):
            response = self.publisher_client.post(
                self.restore_url(Lesson, self.lesson1.pk)
            )

        self.assertEqual(response.status_code, 200)
        self.assertTrue(calls)

    def test_restoring_a_live_node_is_a_no_op(self):
        self.lesson1.refresh_from_db()
        updated_before = self.lesson1.updated_at
        stamp_before = self.lesson1.last_modified_by_id

        response = self.publisher_client.post(
            self.restore_url(Lesson, self.lesson1.pk)
        )

        self.assertEqual(response.status_code, 200)
        self.lesson1.refresh_from_db()
        self.assertFalse(self.lesson1.is_deleted)
        self.assertEqual(self.lesson1.updated_at, updated_before)
        self.assertEqual(self.lesson1.last_modified_by_id, stamp_before)

    def test_restoring_an_unknown_id_is_a_404(self):
        for model in (Course, Module, Chapter, Lesson):
            with self.subTest(model=model.__name__):
                response = self.publisher_client.post(
                    self.restore_url(model, uuid.uuid4())
                )
                assert_envelope(self, response, 'not_found', 404)


class RemovalAuthorizationTests(RemovalEndpointTestCase):
    def request_specs(self):
        course_id = self.course.pk
        specs = []
        for model in (Course, Module, Chapter, Lesson):
            pk = course_id
            specs.append(
                ('get', self.preview_url(model, pk))
            )
            specs.append(
                ('delete', self.removal_url(model, pk))
            )
            specs.append(
                ('post', self.restore_url(model, pk))
            )
        return specs

    def test_a_student_is_forbidden_from_every_removal_operation(self):
        for method, url in self.request_specs():
            with self.subTest(method=method, url=url):
                response = getattr(self.student_client, method)(url)
                assert_envelope(self, response, 'permission_denied', 403)

    def test_an_anonymous_caller_is_unauthenticated_on_every_operation(self):
        for method, url in self.request_specs():
            with self.subTest(method=method, url=url):
                response = getattr(self.anonymous_client, method)(url)
                assert_envelope(self, response, 'unauthenticated', 401)


class RemovalRoutingAndSchemaTests(TestCase):
    def route_specs(self):
        return [
            ('course-removal-preview', 'get', '/api/v1/courses/{course_id}/removal-preview/'),
            ('module-removal-preview', 'get', '/api/v1/modules/{module_id}/removal-preview/'),
            ('chapter-removal-preview', 'get', '/api/v1/chapters/{chapter_id}/removal-preview/'),
            ('lesson-removal-preview', 'get', '/api/v1/lessons/{lesson_id}/removal-preview/'),
            ('course-restore', 'post', '/api/v1/courses/{course_id}/restore/'),
            ('module-restore', 'post', '/api/v1/modules/{module_id}/restore/'),
            ('chapter-restore', 'post', '/api/v1/chapters/{chapter_id}/restore/'),
            ('lesson-restore', 'post', '/api/v1/lessons/{lesson_id}/restore/'),
        ]

    def test_every_new_route_lives_under_the_api_prefix(self):
        for name, _, _ in self.route_specs():
            with self.subTest(name=name):
                url = reverse(name, args=[uuid.uuid4()])
                self.assertTrue(url.startswith(settings.API_PREFIX + '/'))

    def test_the_schema_documents_preview_restore_and_removal(self):
        schema = SchemaGenerator().get_schema(request=None, public=True)
        paths = schema['paths']
        for _, method, path in self.route_specs():
            with self.subTest(path=path):
                self.assertIn(path, paths)
                self.assertIn(method, paths[path])
        # Removal rides the existing detail route as DELETE.
        for path in (
            '/api/v1/courses/{course_id}/',
            '/api/v1/modules/{module_id}/',
            '/api/v1/chapters/{chapter_id}/',
            '/api/v1/lessons/{lesson_id}/',
        ):
            with self.subTest(path=path):
                self.assertIn('delete', paths[path])

    def test_the_schema_exposes_the_preview_contract(self):
        schema = SchemaGenerator().get_schema(request=None, public=True)
        components = schema['components']['schemas']
        self.assertIn('RemovalPreview', components)
        self.assertIn('RemovalPreviewItem', components)

    def test_is_deleted_stays_an_independent_boolean(self):
        for model in (Course, Module, Chapter, Lesson):
            with self.subTest(model=model.__name__):
                field = model._meta.get_field('is_deleted')
                self.assertTrue(field.default is False)
                self.assertEqual(field.get_internal_type(), 'BooleanField')

    def test_every_level_exposes_the_soft_deleted_selector(self):
        for model in (Course, Module, Chapter, Lesson):
            with self.subTest(model=model.__name__):
                self.assertIsInstance(
                    model.objects.all(), ContentQuerySet
                )
                self.assertTrue(hasattr(model.objects, 'with_deleted'))
