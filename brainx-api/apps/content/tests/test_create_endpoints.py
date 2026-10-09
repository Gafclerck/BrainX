"""The four Publisher-only create endpoints (Story 2.1 AC 6-9)."""

import uuid

from django.conf import settings
from django.test import TestCase
from django.urls import reverse
from drf_spectacular.generators import SchemaGenerator
from rest_framework.test import APIClient
from rest_framework_simplejwt.tokens import AccessToken

from apps.users.models import User

from ..models import Chapter, Course, Lesson, Module
from .helpers import assert_envelope

PASSWORD = 'a-long-enough-password'
LESSON_PAYLOAD = {
    'title': 'Introduction',
    'teacher': 'Ms Ada',
    'course_date': '2026-09-01',
}


def client_for(user):
    client = APIClient()
    client.credentials(HTTP_AUTHORIZATION=f'Bearer {AccessToken.for_user(user)}')
    return client


class ContentEndpointTestCase(TestCase):
    """A publisher client, a student client, and the tree they act on."""

    def setUp(self):
        self.publisher = User.objects.create_user(
            email='publisher@example.com',
            password=PASSWORD,
            is_publisher=True,
            is_email_verified=True,
        )
        self.student = User.objects.create_user(
            email='student@example.com',
            password=PASSWORD,
        )
        self.publisher_client = client_for(self.publisher)
        self.student_client = client_for(self.student)
        self.anonymous_client = APIClient()

        self.course = Course.objects.create(
            name='Maths', subject='Algebra', position=1,
            last_modified_by=self.publisher,
        )
        self.module = Module.objects.create(
            course=self.course, name='Module 1', position=1,
            last_modified_by=self.publisher,
        )
        self.chapter = Chapter.objects.create(
            module=self.module, name='Chapter 1', position=1,
            last_modified_by=self.publisher,
        )

    def lesson_url(self, chapter=None):
        return reverse(
            'lesson-create', args=[(chapter or self.chapter).pk]
        )

    def module_url(self, course=None):
        return reverse('module-create', args=[(course or self.course).pk])


class CreateCourseTests(ContentEndpointTestCase):
    def test_a_publisher_creates_a_course(self):
        response = self.publisher_client.post(
            reverse('course-create'),
            {'name': 'Physics', 'subject': 'Mechanics'},
            format='json',
        )

        self.assertEqual(response.status_code, 201)
        body = response.json()
        self.assertEqual(body['name'], 'Physics')
        self.assertEqual(body['subject'], 'Mechanics')
        self.assertEqual(body['position'], 2)
        self.assertFalse(body['is_deleted'])
        # A UUID, never an integer or a slug.
        self.assertEqual(str(uuid.UUID(body['id'])), body['id'])
        self.assertTrue(Course.objects.filter(pk=body['id']).exists())

    def test_positions_append_at_the_end(self):
        self.publisher_client.post(
            reverse('course-create'),
            {'name': 'A', 'subject': 'S'},
            format='json',
        )
        response = self.publisher_client.post(
            reverse('course-create'),
            {'name': 'B', 'subject': 'S'},
            format='json',
        )
        self.assertEqual(response.json()['position'], 3)

    def test_position_and_is_deleted_are_never_accepted_from_a_client(self):
        response = self.publisher_client.post(
            reverse('course-create'),
            {'name': 'C', 'subject': 'S', 'position': 99, 'is_deleted': True},
            format='json',
        )

        self.assertEqual(response.status_code, 201)
        body = response.json()
        self.assertEqual(body['position'], 2)
        self.assertFalse(body['is_deleted'])
        self.assertFalse(Course.objects.get(pk=body['id']).is_deleted)


class CreateChildTests(ContentEndpointTestCase):
    def test_a_module_is_created_under_its_course(self):
        response = self.publisher_client.post(
            self.module_url(), {'name': 'Module 2'}, format='json'
        )

        self.assertEqual(response.status_code, 201)
        created = Module.objects.get(pk=response.json()['id'])
        self.assertEqual(created.course, self.course)
        self.assertEqual(created.position, 2)

    def test_a_chapter_is_created_under_its_module(self):
        response = self.publisher_client.post(
            reverse('chapter-create', args=[self.module.pk]),
            {'name': 'Chapter 2'},
            format='json',
        )

        self.assertEqual(response.status_code, 201)
        created = Chapter.objects.get(pk=response.json()['id'])
        self.assertEqual(created.module, self.module)

    def test_chapter_position_is_scoped_to_its_module(self):
        # A fresh module has no chapters, so its first chapter is slot 1 even
        # though the other module already holds one - position is per parent.
        other = Module.objects.create(
            course=self.course, name='Other', position=2,
            last_modified_by=self.publisher,
        )
        first = self.publisher_client.post(
            reverse('chapter-create', args=[other.pk]),
            {'name': 'First'},
            format='json',
        )
        self.assertEqual(first.json()['position'], 1)

        second = self.publisher_client.post(
            reverse('chapter-create', args=[self.module.pk]),
            {'name': 'Second'},
            format='json',
        )
        self.assertEqual(second.json()['position'], 2)

    def test_a_lesson_is_created_under_its_chapter(self):
        response = self.publisher_client.post(
            self.lesson_url(), LESSON_PAYLOAD, format='json'
        )

        self.assertEqual(response.status_code, 201)
        created = Lesson.objects.get(pk=response.json()['id'])
        self.assertEqual(created.chapter, self.chapter)
        self.assertEqual(str(created.course_date), '2026-09-01')

    def test_lesson_position_appends_within_its_chapter(self):
        first = self.publisher_client.post(
            self.lesson_url(), LESSON_PAYLOAD, format='json'
        )
        self.assertEqual(first.json()['position'], 1)
        second = self.publisher_client.post(
            self.lesson_url(), LESSON_PAYLOAD, format='json'
        )
        self.assertEqual(second.json()['position'], 2)

    def test_an_unknown_parent_is_a_404(self):
        for name in ('module-create', 'chapter-create', 'lesson-create'):
            with self.subTest(name=name):
                response = self.publisher_client.post(
                    reverse(name, args=[uuid.uuid4()]),
                    {'name': 'Orphan'},
                    format='json',
                )
                assert_envelope(self, response, 'not_found', 404)

    def test_a_non_uuid_parent_segment_is_not_a_route(self):
        response = self.publisher_client.post(
            f'{settings.API_PREFIX}/courses/not-a-uuid/modules/',
            {'name': 'X'},
            format='json',
        )
        assert_envelope(self, response, 'not_found', 404)


class LessonMetadataTests(ContentEndpointTestCase):
    def test_each_missing_field_is_named(self):
        for field in ('title', 'teacher', 'course_date'):
            with self.subTest(field=field):
                payload = {
                    key: value
                    for key, value in LESSON_PAYLOAD.items()
                    if key != field
                }
                response = self.publisher_client.post(
                    self.lesson_url(), payload, format='json'
                )
                body = assert_envelope(self, response, 'validation_error', 400)
                self.assertIn(field, body['errors'])

    def test_description_is_optional_at_creation(self):
        response = self.publisher_client.post(
            self.lesson_url(), LESSON_PAYLOAD, format='json'
        )
        self.assertEqual(response.status_code, 201)
        self.assertEqual(response.json()['description'], '')


class AuthorizationTests(ContentEndpointTestCase):
    def request_specs(self):
        sid = uuid.uuid4()
        return [
            (reverse('course-create'), {'name': 'X', 'subject': 'Y'}),
            (reverse('module-create', args=[sid]), {'name': 'X'}),
            (reverse('chapter-create', args=[sid]), {'name': 'X'}),
            (reverse('lesson-create', args=[sid]), LESSON_PAYLOAD),
        ]

    def test_a_student_cannot_create_any_level(self):
        for url, payload in self.request_specs():
            with self.subTest(url=url):
                response = self.student_client.post(url, payload, format='json')
                assert_envelope(self, response, 'permission_denied', 403)

    def test_an_anonymous_caller_cannot_create_any_level(self):
        for url, payload in self.request_specs():
            with self.subTest(url=url):
                response = self.anonymous_client.post(url, payload, format='json')
                assert_envelope(self, response, 'unauthenticated', 401)


class RoutingAndSchemaTests(ContentEndpointTestCase):
    def test_every_create_route_lives_under_the_api_prefix(self):
        for name in (
            'course-create',
            'module-create',
            'chapter-create',
            'lesson-create',
        ):
            with self.subTest(name=name):
                if name == 'course-create':
                    url = reverse(name)
                else:
                    url = reverse(name, args=[uuid.uuid4()])
                self.assertTrue(url.startswith(settings.API_PREFIX + '/'))

    def test_the_schema_documents_every_create_operation(self):
        schema = SchemaGenerator().get_schema(request=None, public=True)
        paths = schema['paths']
        for path in (
            '/api/v1/courses/',
            '/api/v1/courses/{course_id}/modules/',
            '/api/v1/modules/{module_id}/chapters/',
            '/api/v1/chapters/{chapter_id}/lessons/',
        ):
            with self.subTest(path=path):
                self.assertIn(path, paths)
                self.assertIn('post', paths[path])

    def test_the_schema_marks_the_stamp_and_timestamp_read_only(self):
        schema = SchemaGenerator().get_schema(request=None, public=True)
        components = schema['components']['schemas']
        for name in ('Course', 'Module', 'Chapter', 'Lesson'):
            with self.subTest(component=name):
                properties = components[name]['properties']
                self.assertIs(properties['last_modified_by']['readOnly'], True)
                self.assertIs(properties['updated_at']['readOnly'], True)
