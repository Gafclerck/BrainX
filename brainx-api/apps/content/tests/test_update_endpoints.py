"""The four Publisher-only update (edit/rename) endpoints (Story 2.3)."""

import uuid
from datetime import date
from unittest import mock

from django.conf import settings
from django.test import TestCase
from django.urls import reverse
from drf_spectacular.generators import SchemaGenerator

from apps.users.models import User

from .. import mutations
from ..models import Chapter, Course, Lesson, Module
from .helpers import assert_envelope
from .test_create_endpoints import (
    PASSWORD,
    ContentEndpointTestCase,
    client_for,
)

# The URL name and the model for each level, so the cases below stay one list.
UPDATE_ROUTE_BY_MODEL = {
    Course: 'course-update',
    Module: 'module-update',
    Chapter: 'chapter-update',
    Lesson: 'lesson-update',
}

# A value that changes exactly one descriptive field at each level.
EDIT_PAYLOAD_BY_MODEL = {
    Course: {'name': 'Renamed'},
    Module: {'name': 'Renamed'},
    Chapter: {'name': 'Renamed'},
    Lesson: {'title': 'Renamed'},
}


class UpdateEndpointTestCase(ContentEndpointTestCase):
    """The create fixture plus a Lesson and the detail-route lookup."""

    def setUp(self):
        super().setUp()
        self.lesson = Lesson.objects.create(
            chapter=self.chapter,
            title='Introduction',
            description='Opening',
            teacher='Ms Ada',
            course_date=date(2026, 9, 1),
            position=1,
            last_modified_by=self.publisher,
        )

    def update_url(self, model, pk):
        return reverse(UPDATE_ROUTE_BY_MODEL[model], args=[pk])

    def update_cases(self):
        """(model, row, payload) for a valid edit at every level."""
        rows = {
            Course: self.course,
            Module: self.module,
            Chapter: self.chapter,
            Lesson: self.lesson,
        }
        return [
            (model, rows[model], EDIT_PAYLOAD_BY_MODEL[model])
            for model in (Course, Module, Chapter, Lesson)
        ]

    def current_name(self, row):
        return row.name if hasattr(row, 'name') else row.title


class EditTests(UpdateEndpointTestCase):
    def test_every_level_edits_and_keeps_its_uuid(self):
        for model, row, payload in self.update_cases():
            with self.subTest(model=model.__name__):
                original_id = row.pk
                response = self.publisher_client.patch(
                    self.update_url(model, row.pk), payload, format='json'
                )

                self.assertEqual(response.status_code, 200)
                self.assertEqual(response.json()['id'], str(original_id))
                row.refresh_from_db()
                self.assertEqual(row.pk, original_id)
                for field, value in payload.items():
                    self.assertEqual(getattr(row, field), value)
                self.assertEqual(row.last_modified_by, self.publisher)

    def test_a_course_edits_its_name_and_subject_together(self):
        response = self.publisher_client.patch(
            self.update_url(Course, self.course.pk),
            {'name': 'Physics', 'subject': 'Mechanics'},
            format='json',
        )

        self.assertEqual(response.status_code, 200)
        self.course.refresh_from_db()
        self.assertEqual(self.course.name, 'Physics')
        self.assertEqual(self.course.subject, 'Mechanics')

    def test_a_lesson_edits_every_writable_field(self):
        response = self.publisher_client.patch(
            self.update_url(Lesson, self.lesson.pk),
            {
                'title': 'Vectors',
                'description': 'Updated',
                'teacher': 'Mr Euler',
                'course_date': '2026-10-05',
            },
            format='json',
        )

        self.assertEqual(response.status_code, 200)
        self.lesson.refresh_from_db()
        self.assertEqual(self.lesson.title, 'Vectors')
        self.assertEqual(self.lesson.description, 'Updated')
        self.assertEqual(self.lesson.teacher, 'Mr Euler')
        self.assertEqual(str(self.lesson.course_date), '2026-10-05')

    def test_an_update_bumps_updated_at_and_stamps_the_actor(self):
        before = Course.objects.get(pk=self.course.pk).updated_at

        response = self.publisher_client.patch(
            self.update_url(Course, self.course.pk),
            {'name': 'Bumped'},
            format='json',
        )

        self.assertEqual(response.status_code, 200)
        row = Course.objects.get(pk=self.course.pk)
        self.assertGreater(row.updated_at, before)
        self.assertEqual(row.last_modified_by, self.publisher)
        self.assertEqual(
            response.json()['last_modified_by'],
            {'id': str(self.publisher.id), 'email': self.publisher.email},
        )


class RenameTests(UpdateEndpointTestCase):
    def test_renaming_a_module_keeps_its_uuid_and_parent(self):
        original_id = self.module.pk

        response = self.publisher_client.patch(
            self.update_url(Module, self.module.pk),
            {'name': 'Renamed Module'},
            format='json',
        )

        self.assertEqual(response.status_code, 200)
        self.module.refresh_from_db()
        self.assertEqual(self.module.pk, original_id)
        self.assertEqual(self.module.name, 'Renamed Module')
        self.assertEqual(self.module.course, self.course)

    def test_renaming_a_chapter_keeps_its_uuid_and_parent(self):
        original_id = self.chapter.pk

        response = self.publisher_client.patch(
            self.update_url(Chapter, self.chapter.pk),
            {'name': 'Renamed Chapter'},
            format='json',
        )

        self.assertEqual(response.status_code, 200)
        self.chapter.refresh_from_db()
        self.assertEqual(self.chapter.pk, original_id)
        self.assertEqual(self.chapter.name, 'Renamed Chapter')
        self.assertEqual(self.chapter.module, self.module)


class ServerOwnedFieldTests(UpdateEndpointTestCase):
    def setUp(self):
        super().setUp()
        self.other = User.objects.create_user(
            email='other@example.com',
            password=PASSWORD,
            is_publisher=True,
            is_email_verified=True,
        )
        self.injected = {
            'position': 99,
            'is_deleted': True,
            'last_modified_by': str(self.other.id),
            'updated_at': '2000-01-01T00:00:00Z',
            'id': str(uuid.uuid4()),
            'course': str(uuid.uuid4()),
            'module': str(uuid.uuid4()),
            'chapter': str(uuid.uuid4()),
        }

    def test_server_owned_fields_are_ignored_at_every_level(self):
        for model, row, payload in self.update_cases():
            with self.subTest(model=model.__name__):
                original_id = row.pk
                original_position = row.position
                response = self.publisher_client.patch(
                    self.update_url(model, row.pk),
                    {**payload, **self.injected},
                    format='json',
                )

                self.assertEqual(response.status_code, 200)
                row.refresh_from_db()
                self.assertEqual(row.pk, original_id)
                self.assertEqual(row.position, original_position)
                self.assertFalse(row.is_deleted)
                self.assertEqual(row.last_modified_by, self.publisher)
                self.assertNotEqual(row.updated_at.year, 2000)
                self.assertNotEqual(
                    response.json()['updated_at'], self.injected['updated_at']
                )
                self.assertEqual(
                    response.json()['last_modified_by']['email'],
                    'publisher@example.com',
                )

    def test_the_parent_link_is_never_changed(self):
        response = self.publisher_client.patch(
            self.update_url(Module, self.module.pk),
            {**EDIT_PAYLOAD_BY_MODEL[Module], **self.injected},
            format='json',
        )
        self.assertEqual(response.status_code, 200)

        response = self.publisher_client.patch(
            self.update_url(Chapter, self.chapter.pk),
            {**EDIT_PAYLOAD_BY_MODEL[Chapter], **self.injected},
            format='json',
        )
        self.assertEqual(response.status_code, 200)

        response = self.publisher_client.patch(
            self.update_url(Lesson, self.lesson.pk),
            {**EDIT_PAYLOAD_BY_MODEL[Lesson], **self.injected},
            format='json',
        )
        self.assertEqual(response.status_code, 200)

        self.module.refresh_from_db()
        self.chapter.refresh_from_db()
        self.lesson.refresh_from_db()
        self.assertEqual(self.module.course, self.course)
        self.assertEqual(self.chapter.module, self.module)
        self.assertEqual(self.lesson.chapter, self.chapter)


class LessonRequiredFieldTests(UpdateEndpointTestCase):
    def test_blanking_a_required_field_is_rejected_and_named(self):
        for field in ('title', 'teacher', 'course_date'):
            for blank in ('', None):
                with self.subTest(field=field, blank=blank):
                    response = self.publisher_client.patch(
                        self.update_url(Lesson, self.lesson.pk),
                        {field: blank},
                        format='json',
                    )
                    body = assert_envelope(
                        self, response, 'validation_error', 400
                    )
                    self.assertIn(field, body['errors'])

    def test_a_rejected_blank_leaves_the_row_untouched(self):
        self.publisher_client.patch(
            self.update_url(Lesson, self.lesson.pk),
            {'title': ''},
            format='json',
        )

        self.lesson.refresh_from_db()
        self.assertEqual(self.lesson.title, 'Introduction')

    def test_an_omitted_required_field_is_allowed(self):
        response = self.publisher_client.patch(
            self.update_url(Lesson, self.lesson.pk),
            {'description': 'Only this'},
            format='json',
        )

        self.assertEqual(response.status_code, 200)
        self.lesson.refresh_from_db()
        self.assertEqual(self.lesson.title, 'Introduction')
        self.assertEqual(self.lesson.teacher, 'Ms Ada')
        self.assertEqual(self.lesson.description, 'Only this')


class ContainerRequiredFieldTests(UpdateEndpointTestCase):
    def test_blanking_a_container_name_is_rejected_and_named(self):
        rows = {
            Course: self.course,
            Module: self.module,
            Chapter: self.chapter,
        }
        for model, row in rows.items():
            for blank in ('', None):
                with self.subTest(model=model.__name__, blank=blank):
                    response = self.publisher_client.patch(
                        self.update_url(model, row.pk),
                        {'name': blank},
                        format='json',
                    )
                    body = assert_envelope(
                        self, response, 'validation_error', 400
                    )
                    self.assertIn('name', body['errors'])


class InvalidValueTests(UpdateEndpointTestCase):
    def test_a_malformed_course_date_is_rejected_and_named(self):
        response = self.publisher_client.patch(
            self.update_url(Lesson, self.lesson.pk),
            {'course_date': 'not-a-date'},
            format='json',
        )

        body = assert_envelope(self, response, 'validation_error', 400)
        self.assertIn('course_date', body['errors'])

    def test_an_over_length_name_is_rejected_and_named(self):
        response = self.publisher_client.patch(
            self.update_url(Course, self.course.pk),
            {'name': 'x' * 256},
            format='json',
        )

        body = assert_envelope(self, response, 'validation_error', 400)
        self.assertIn('name', body['errors'])


class EmptyBodyTests(UpdateEndpointTestCase):
    def test_an_empty_body_changes_nothing_and_still_stamps(self):
        before = Course.objects.get(pk=self.course.pk)

        response = self.publisher_client.patch(
            self.update_url(Course, self.course.pk), {}, format='json'
        )

        self.assertEqual(response.status_code, 200)
        row = Course.objects.get(pk=self.course.pk)
        self.assertEqual(row.name, before.name)
        self.assertEqual(row.subject, before.subject)
        self.assertEqual(row.position, before.position)
        self.assertEqual(row.last_modified_by, self.publisher)
        self.assertGreater(row.updated_at, before.updated_at)


class NotFoundTests(UpdateEndpointTestCase):
    def test_an_unknown_uuid_is_a_404_at_every_level(self):
        for name in UPDATE_ROUTE_BY_MODEL.values():
            with self.subTest(name=name):
                response = self.publisher_client.patch(
                    reverse(name, args=[uuid.uuid4()]), {}, format='json'
                )
                assert_envelope(self, response, 'not_found', 404)

    def test_a_non_uuid_segment_is_not_a_route(self):
        for segment in ('courses', 'modules', 'chapters', 'lessons'):
            with self.subTest(segment=segment):
                response = self.publisher_client.patch(
                    f'{settings.API_PREFIX}/{segment}/not-a-uuid/',
                    {},
                    format='json',
                )
                assert_envelope(self, response, 'not_found', 404)


class AuthorizationTests(UpdateEndpointTestCase):
    def request_specs(self):
        return [
            (self.update_url(model, row.pk), payload)
            for model, row, payload in self.update_cases()
        ]

    def test_a_student_cannot_update_any_level(self):
        for url, payload in self.request_specs():
            with self.subTest(url=url):
                response = self.student_client.patch(url, payload, format='json')
                assert_envelope(self, response, 'permission_denied', 403)

    def test_an_anonymous_caller_cannot_update_any_level(self):
        for url, payload in self.request_specs():
            with self.subTest(url=url):
                response = self.anonymous_client.patch(
                    url, payload, format='json'
                )
                assert_envelope(self, response, 'unauthenticated', 401)


class SecondPublisherTests(UpdateEndpointTestCase):
    def test_a_second_publisher_stamps_themselves(self):
        second = User.objects.create_user(
            email='second@example.com',
            password=PASSWORD,
            is_publisher=True,
            is_email_verified=True,
        )

        response = client_for(second).patch(
            self.update_url(Course, self.course.pk),
            {'name': 'Biology'},
            format='json',
        )

        self.assertEqual(response.status_code, 200)
        self.course.refresh_from_db()
        self.assertEqual(self.course.last_modified_by, second)
        self.assertEqual(
            response.json()['last_modified_by']['email'], 'second@example.com'
        )


class LastWriteWinsTests(UpdateEndpointTestCase):
    def test_two_sequential_edits_return_the_last_write(self):
        first = self.publisher_client.patch(
            self.update_url(Course, self.course.pk),
            {'name': 'First'},
            format='json',
        )
        second = self.publisher_client.patch(
            self.update_url(Course, self.course.pk),
            {'name': 'Second'},
            format='json',
        )

        self.assertEqual(first.status_code, 200)
        self.assertEqual(second.status_code, 200)
        self.assertEqual(second.json()['name'], 'Second')
        self.assertNotIn('version', second.json())
        self.assertNotIn('conflict', second.json())


class AtomicityTests(UpdateEndpointTestCase):
    def test_a_failure_after_the_row_change_rolls_everything_back(self):
        with mock.patch.object(
            mutations,
            '_recompute_ancestors',
            side_effect=RuntimeError('ancestor pass failed'),
        ):
            with self.assertRaises(RuntimeError):
                self.publisher_client.patch(
                    self.update_url(Course, self.course.pk),
                    {'name': 'Rollback'},
                    format='json',
                )

        self.course.refresh_from_db()
        self.assertEqual(self.course.name, 'Maths')


class SingleWritePathTests(UpdateEndpointTestCase):
    def test_an_update_fails_when_the_port_is_unavailable(self):
        for model, row, payload in self.update_cases():
            with self.subTest(model=model.__name__):
                with mock.patch(
                    'apps.content.views.mutate',
                    side_effect=RuntimeError('mutate is unavailable'),
                ):
                    with self.assertRaises(RuntimeError):
                        self.publisher_client.patch(
                            self.update_url(model, row.pk),
                            payload,
                            format='json',
                        )

        self.assertEqual(Course.objects.get(pk=self.course.pk).name, 'Maths')
        self.assertEqual(Module.objects.get(pk=self.module.pk).name, 'Module 1')
        self.assertEqual(
            Chapter.objects.get(pk=self.chapter.pk).name, 'Chapter 1'
        )
        self.assertEqual(Lesson.objects.get(pk=self.lesson.pk).title, 'Introduction')

    def test_no_view_persists_a_row_without_the_port(self):
        phantoms = {
            Course: Course(
                name='Ghost', subject='S', position=99,
                last_modified_by=self.publisher,
            ),
            Module: Module(
                name='Ghost', course=self.course, position=99,
                last_modified_by=self.publisher,
            ),
            Chapter: Chapter(
                name='Ghost', module=self.module, position=99,
                last_modified_by=self.publisher,
            ),
            Lesson: Lesson(
                chapter=self.chapter, title='Ghost', teacher='T',
                course_date=date(2026, 9, 1), position=99,
                last_modified_by=self.publisher,
            ),
        }

        for model, row, payload in self.update_cases():
            with self.subTest(model=model.__name__):
                original_name = self.current_name(row)
                with mock.patch(
                    'apps.content.views.mutate',
                    return_value=phantoms[model],
                ) as port:
                    response = self.publisher_client.patch(
                        self.update_url(model, row.pk), payload, format='json'
                    )

                self.assertEqual(response.status_code, 200)
                self.assertEqual(port.call_args.kwargs['actor'], self.publisher)
                self.assertEqual(port.call_args.kwargs['model'], model)
                self.assertEqual(port.call_args.kwargs['instance'].pk, row.pk)
                row.refresh_from_db()
                self.assertEqual(self.current_name(row), original_name)


class RoutingAndSchemaTests(ContentEndpointTestCase):
    def test_every_update_route_lives_under_the_api_prefix(self):
        for name in UPDATE_ROUTE_BY_MODEL.values():
            with self.subTest(name=name):
                url = reverse(name, args=[uuid.uuid4()])
                self.assertTrue(url.startswith(settings.API_PREFIX + '/'))

    def test_the_schema_documents_every_update_operation(self):
        schema = SchemaGenerator().get_schema(request=None, public=True)
        paths = schema['paths']
        for path, level in (
            ('/api/v1/courses/{course_id}/', 'Course'),
            ('/api/v1/modules/{module_id}/', 'Module'),
            ('/api/v1/chapters/{chapter_id}/', 'Chapter'),
            ('/api/v1/lessons/{lesson_id}/', 'Lesson'),
        ):
            with self.subTest(path=path):
                self.assertIn(path, paths)
                patch = paths[path]['patch']
                self.assertEqual(
                    patch['requestBody']['content']['application/json'][
                        'schema'
                    ]['$ref'],
                    f'#/components/schemas/Patched{level}',
                )
                self.assertEqual(
                    patch['responses']['200']['content']['application/json'][
                        'schema'
                    ]['$ref'],
                    f'#/components/schemas/{level}',
                )


class NoSecondWritePathTests(TestCase):
    """The port is the only update path, so no update view calls `.update()`."""

    def test_views_module_never_calls_queryset_update(self):
        import ast
        from pathlib import Path

        from .. import views

        tree = ast.parse(Path(views.__file__).read_text(encoding='utf-8'))
        calls = [
            node
            for node in ast.walk(tree)
            if isinstance(node, ast.Call)
            and isinstance(node.func, ast.Attribute)
            and node.func.attr == 'update'
        ]
        self.assertEqual(calls, [])
