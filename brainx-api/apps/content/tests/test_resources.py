"""The Resource model, the attach endpoint and its gates (Story 3.1).

A Resource is the material a Lesson carries: one typed row (`document`,
`image`, `video`, `external_link`) keyed to a Lesson only, whose payload is
pinned to its type by two database CHECK constraints. This story ships the
URL-bearing attach surface (`video` and `external_link`) only; a `document`
or `image` write is a 400 naming `type`, because the file upload is Story
3.2's. Every write goes through `mutate`, so the acting Publisher is stamped.
"""

import uuid
from datetime import date
from unittest import mock

from django.conf import settings
from django.core.exceptions import ValidationError
from django.db import IntegrityError, models, transaction
from django.test import TestCase
from django.urls import reverse
from drf_spectacular.generators import SchemaGenerator

from apps.users.models import User

from ..models import Chapter, Course, Lesson, Module, Resource
from .helpers import assert_envelope
from .test_create_endpoints import ContentEndpointTestCase

VIDEO_PAYLOAD = {
    'type': 'video',
    'title': 'Intro video',
    'url': 'https://videos.example.com/intro?t=30#part',
    'note': 'Watch first',
}


def bad_urls():
    """URLs the http(s) rule refuses at the validator and in the database."""
    return (
        'javascript:alert(1)',
        'data:text/plain,hello',
        'ftp://files.example.com/deck.pdf',
        'mailto:publisher@example.com',
    )


class ResourceModelTests(TestCase):
    """The table: fields, Meta, and the two CHECK constraints (AC 1-3)."""

    def setUp(self):
        self.actor = User.objects.create_user(email='actor@example.com')
        self.course = Course.objects.create(
            name='Maths', subject='Algebra', position=1,
            last_modified_by=self.actor,
        )
        self.module = Module.objects.create(
            course=self.course, name='Module 1', position=1,
            last_modified_by=self.actor,
        )
        self.chapter = Chapter.objects.create(
            module=self.module, name='Chapter 1', position=1,
            last_modified_by=self.actor,
        )
        self.lesson = Lesson.objects.create(
            chapter=self.chapter,
            title='Introduction',
            teacher='Ms Ada',
            course_date=date(2026, 9, 1),
            position=1,
            last_modified_by=self.actor,
        )

    def url_payload(self, **overrides):
        payload = {
            'type': 'video',
            'title': 'Intro video',
            'url': 'https://videos.example.com/intro',
            'lesson': self.lesson,
            'last_modified_by': self.actor,
        }
        payload.update(overrides)
        return payload

    def test_type_is_the_closed_glossary_set(self):
        self.assertEqual(
            {choice.value for choice in Resource.Type},
            {'document', 'image', 'video', 'external_link'},
        )

    def test_every_field_is_present(self):
        names = {
            field.name
            for field in Resource._meta.get_fields(include_parents=False)
        }
        for name in (
            'lesson',
            'type',
            'title',
            'note',
            'file',
            'url',
            'is_deleted',
            'last_modified_by',
        ):
            self.assertIn(name, names)

    def test_a_resource_keys_to_a_lesson_only(self):
        field = Resource._meta.get_field('lesson')
        self.assertIs(field.remote_field.model, Lesson)
        self.assertFalse(field.null)
        self.assertEqual(field.remote_field.on_delete, models.CASCADE)

    def test_rows_order_by_id(self):
        self.assertEqual(Resource._meta.ordering, ('id',))

    def test_the_actor_stamp_is_protected(self):
        field = Resource._meta.get_field('last_modified_by')
        self.assertEqual(field.remote_field.on_delete, models.PROTECT)

    def test_note_and_url_are_optional_on_the_model(self):
        self.assertTrue(Resource._meta.get_field('note').blank)
        self.assertTrue(Resource._meta.get_field('url').blank)
        self.assertTrue(Resource._meta.get_field('url').null)

    def test_the_database_rejects_a_payload_that_matches_no_type(self):
        for payload in (
            # document/image without a file, and with a url instead.
            self.url_payload(type='document'),
            self.url_payload(type='image'),
            # video/external_link with a file.
            self.url_payload(type='video', file='movie.mp4'),
            self.url_payload(
                type='external_link', url='https://example.com/', file='x.bin'
            ),
        ):
            with self.subTest(type=payload['type'], file=payload.get('file')):
                with self.assertRaises(IntegrityError):
                    with transaction.atomic():
                        Resource.objects.create(**payload)

    def test_the_database_accepts_a_payload_that_matches_its_type(self):
        for resource_type in ('video', 'external_link'):
            with self.subTest(type=resource_type):
                resource = Resource.objects.create(
                    **self.url_payload(type=resource_type)
                )
                self.assertEqual(resource.type, resource_type)

    def test_the_database_rejects_a_non_http_url(self):
        for bad in bad_urls():
            with self.subTest(url=bad):
                with self.assertRaises(IntegrityError):
                    with transaction.atomic():
                        Resource.objects.create(**self.url_payload(url=bad))

    def test_the_database_accepts_an_http_url_in_any_case(self):
        for url in ('HTTP://example.com/x', 'Https://example.com/x'):
            with self.subTest(url=url):
                Resource.objects.create(**self.url_payload(url=url))

    def test_the_http_validator_matches_the_constraint(self):
        for bad in bad_urls():
            with self.subTest(url=bad):
                with self.assertRaises(ValidationError):
                    Resource(**self.url_payload(url=bad)).full_clean()

    def test_the_http_validator_skips_an_empty_url(self):
        # A document or image Resource carries no URL at all; a null URL must
        # pass full_clean untouched rather than trip the http(s) validator.
        # `full_clean` checks the payload CHECK constraint too, which is why
        # the fixture here is a document with a file, not a URL type.
        Resource(
            **self.url_payload(type='document', url=None, file='notes.pdf')
        ).full_clean()


class ResourceEndpointTestCase(ContentEndpointTestCase):
    """The shared fixture plus a Lesson, and the two route lookups."""

    def setUp(self):
        super().setUp()
        self.lesson = Lesson.objects.create(
            chapter=self.chapter,
            title='Introduction',
            teacher='Ms Ada',
            course_date=date(2026, 9, 1),
            position=1,
            last_modified_by=self.publisher,
        )

    def resources_url(self, lesson=None):
        return reverse('resource-create', args=[(lesson or self.lesson).pk])

    def resource_url(self, resource):
        return reverse('resource-update', args=[resource.pk])


class AttachTests(ResourceEndpointTestCase):
    def test_a_publisher_attaches_a_video_resource(self):
        response = self.publisher_client.post(
            self.resources_url(), VIDEO_PAYLOAD, format='json'
        )

        self.assertEqual(response.status_code, 201)
        body = response.json()
        # The URL is stored and returned verbatim as the plain field it is.
        self.assertEqual(body['url'], VIDEO_PAYLOAD['url'])
        self.assertEqual(body['type'], 'video')
        self.assertEqual(body['title'], 'Intro video')
        self.assertEqual(body['note'], 'Watch first')
        self.assertIsNone(body['file'])
        self.assertFalse(body['is_deleted'])
        self.assertEqual(
            body['last_modified_by'],
            {'id': str(self.publisher.id), 'email': self.publisher.email},
        )

        row = Resource.objects.get(pk=body['id'])
        self.assertEqual(row.url, VIDEO_PAYLOAD['url'])
        self.assertEqual(row.lesson, self.lesson)
        self.assertEqual(row.last_modified_by, self.publisher)

    def test_an_external_link_is_attached_the_same_way(self):
        response = self.publisher_client.post(
            self.resources_url(),
            {
                'type': 'external_link',
                'title': 'Syllabus',
                'url': 'https://curriculum.example.com/syllabus.pdf',
            },
            format='json',
        )

        self.assertEqual(response.status_code, 201)
        self.assertEqual(
            response.json()['url'],
            'https://curriculum.example.com/syllabus.pdf',
        )
        row = Resource.objects.get(pk=response.json()['id'])
        self.assertEqual(row.type, 'external_link')
        self.assertFalse(row.file)

    def test_note_is_optional(self):
        response = self.publisher_client.post(
            self.resources_url(),
            {
                'type': 'video',
                'title': 'No note',
                'url': 'https://videos.example.com/x',
            },
            format='json',
        )

        self.assertEqual(response.status_code, 201)
        self.assertEqual(response.json()['note'], '')

    def test_several_resources_of_one_type_all_persist(self):
        first = self.publisher_client.post(
            self.resources_url(), VIDEO_PAYLOAD, format='json'
        )
        second = self.publisher_client.post(
            self.resources_url(),
            {**VIDEO_PAYLOAD, 'title': 'Second video'}, format='json',
        )

        self.assertEqual(first.status_code, 201)
        self.assertEqual(second.status_code, 201)
        self.assertNotEqual(first.json()['id'], second.json()['id'])
        self.assertEqual(Resource.objects.filter(lesson=self.lesson).count(), 2)

    def test_a_missing_url_on_a_url_type_is_rejected_and_named(self):
        response = self.publisher_client.post(
            self.resources_url(),
            {'type': 'video', 'title': 'No address'},
            format='json',
        )

        body = assert_envelope(self, response, 'validation_error', 400)
        self.assertIn('url', body['errors'])
        self.assertEqual(Resource.objects.count(), 0)

    def test_the_listing_returns_the_attached_resources(self):
        self.publisher_client.post(
            self.resources_url(), VIDEO_PAYLOAD, format='json'
        )
        self.publisher_client.post(
            self.resources_url(),
            {**VIDEO_PAYLOAD, 'title': 'Second video'}, format='json',
        )

        response = self.publisher_client.get(self.resources_url())

        self.assertEqual(response.status_code, 200)
        self.assertEqual(response.json()['count'], 2)

    def test_the_attach_views_write_through_the_port(self):
        with mock.patch(
            'apps.content.views.mutate',
            return_value=Resource(
                lesson=self.lesson,
                type='video',
                title='Intro video',
                url='https://videos.example.com/intro',
                last_modified_by=self.publisher,
            ),
        ) as port:
            response = self.publisher_client.post(
                self.resources_url(), VIDEO_PAYLOAD, format='json'
            )

        self.assertEqual(response.status_code, 201)
        self.assertEqual(port.call_args.kwargs['actor'], self.publisher)
        self.assertEqual(port.call_args.kwargs['model'], Resource)
        self.assertEqual(port.call_args.kwargs['data']['lesson'], self.lesson)

    def test_an_unknown_lesson_is_a_404(self):
        response = self.publisher_client.post(
            reverse('resource-create', args=[uuid.uuid4()]),
            VIDEO_PAYLOAD,
            format='json',
        )

        assert_envelope(self, response, 'not_found', 404)

    def test_a_non_uuid_lesson_segment_is_not_a_route(self):
        response = self.publisher_client.post(
            f'{settings.API_PREFIX}/lessons/not-a-uuid/resources/',
            VIDEO_PAYLOAD,
            format='json',
        )

        assert_envelope(self, response, 'not_found', 404)


class DocumentImageWriteTests(ResourceEndpointTestCase):
    """The file types are Story 3.2's surface: 400 naming `type` (Q1, AC 4)."""

    def test_a_document_or_image_write_is_rejected_and_names_type(self):
        for resource_type in ('document', 'image'):
            with self.subTest(type=resource_type):
                response = self.publisher_client.post(
                    self.resources_url(),
                    {'type': resource_type, 'title': 'File'},
                    format='json',
                )
                body = assert_envelope(
                    self, response, 'validation_error', 400
                )
                self.assertIn('type', body['errors'])
                self.assertEqual(Resource.objects.count(), 0)

    def test_an_update_to_document_or_image_is_rejected_and_names_type(self):
        resource = Resource.objects.create(
            lesson=self.lesson,
            type='video',
            title='Intro video',
            url='https://videos.example.com/intro',
            last_modified_by=self.publisher,
        )
        for resource_type in ('document', 'image'):
            with self.subTest(type=resource_type):
                response = self.publisher_client.patch(
                    self.resource_url(resource),
                    {'type': resource_type},
                    format='json',
                )
                body = assert_envelope(
                    self, response, 'validation_error', 400
                )
                self.assertIn('type', body['errors'])

    def test_a_document_payload_with_a_file_field_is_still_rejected(self):
        # `file` is read-only in the serializer, so even a body that smuggles
        # one is refused on `type` before any row is written.
        response = self.publisher_client.post(
            self.resources_url(),
            {'type': 'document', 'title': 'File', 'file': 'notes.pdf'},
            format='json',
        )

        body = assert_envelope(self, response, 'validation_error', 400)
        self.assertIn('type', body['errors'])
        self.assertEqual(Resource.objects.count(), 0)


class UrlValidationTests(ResourceEndpointTestCase):
    def setUp(self):
        super().setUp()
        self.resource = Resource.objects.create(
            lesson=self.lesson,
            type='video',
            title='Intro video',
            url='https://videos.example.com/intro',
            last_modified_by=self.publisher,
        )

    def test_each_bad_url_is_rejected_and_named_on_create(self):
        for bad in bad_urls():
            with self.subTest(url=bad):
                response = self.publisher_client.post(
                    self.resources_url(),
                    {'type': 'video', 'title': 'X', 'url': bad},
                    format='json',
                )
                body = assert_envelope(
                    self, response, 'validation_error', 400
                )
                self.assertIn('url', body['errors'])

    def test_each_bad_url_is_rejected_and_named_on_update(self):
        for bad in bad_urls():
            with self.subTest(url=bad):
                response = self.publisher_client.patch(
                    self.resource_url(self.resource), {'url': bad},
                    format='json',
                )
                body = assert_envelope(
                    self, response, 'validation_error', 400
                )
                self.assertIn('url', body['errors'])
        self.resource.refresh_from_db()
        self.assertEqual(self.resource.url, 'https://videos.example.com/intro')


class MetadataUpdateTests(ResourceEndpointTestCase):
    def setUp(self):
        super().setUp()
        self.resource = Resource.objects.create(
            lesson=self.lesson,
            type='video',
            title='Intro video',
            note='Original',
            url='https://videos.example.com/intro',
            last_modified_by=self.publisher,
        )

    def test_a_publisher_edits_the_metadata(self):
        response = self.publisher_client.patch(
            self.resource_url(self.resource),
            {'title': 'Renamed', 'note': 'Updated'},
            format='json',
        )

        self.assertEqual(response.status_code, 200)
        self.resource.refresh_from_db()
        self.assertEqual(self.resource.title, 'Renamed')
        self.assertEqual(self.resource.note, 'Updated')
        self.assertEqual(self.resource.url, 'https://videos.example.com/intro')
        self.assertEqual(self.resource.last_modified_by, self.publisher)

    def test_the_update_stamps_the_expected_port_call(self):
        with mock.patch(
            'apps.content.views.mutate', return_value=self.resource
        ) as port:
            self.publisher_client.patch(
                self.resource_url(self.resource),
                {'title': 'Renamed'},
                format='json',
            )
        self.assertEqual(port.call_args.kwargs['actor'], self.publisher)
        self.assertEqual(port.call_args.kwargs['model'], Resource)
        self.assertEqual(port.call_args.kwargs['instance'].pk, self.resource.pk)

    def test_an_omitted_url_stays_put_on_a_metadata_edit(self):
        response = self.publisher_client.patch(
            self.resource_url(self.resource), {'title': 'Renamed'},
            format='json',
        )

        self.assertEqual(response.status_code, 200)
        self.resource.refresh_from_db()
        self.assertEqual(self.resource.url, 'https://videos.example.com/intro')

    def test_type_is_write_once_on_update(self):
        response = self.publisher_client.patch(
            self.resource_url(self.resource), {'type': 'external_link'},
            format='json',
        )

        body = assert_envelope(self, response, 'validation_error', 400)
        self.assertIn('type', body['errors'])
        self.resource.refresh_from_db()
        self.assertEqual(self.resource.type, 'video')

    def test_resending_the_own_type_is_allowed(self):
        response = self.publisher_client.patch(
            self.resource_url(self.resource),
            {'type': 'video', 'title': 'Renamed'},
            format='json',
        )

        self.assertEqual(response.status_code, 200)
        self.resource.refresh_from_db()
        self.assertEqual(self.resource.type, 'video')
        self.assertEqual(self.resource.title, 'Renamed')

    def test_an_unknown_resource_is_a_404(self):
        response = self.publisher_client.patch(
            reverse('resource-update', args=[uuid.uuid4()]),
            {'title': 'X'},
            format='json',
        )

        assert_envelope(self, response, 'not_found', 404)

    def test_server_owned_fields_are_ignored_on_update(self):
        original_id = self.resource.pk
        response = self.publisher_client.patch(
            self.resource_url(self.resource),
            {
                'title': 'Renamed',
                'id': str(uuid.uuid4()),
                'file': 'ghost.pdf',
                'is_deleted': True,
                'lesson': str(self.chapter.pk),
                'last_modified_by': str(self.student.id),
                'updated_at': '2000-01-01T00:00:00Z',
            },
            format='json',
        )

        self.assertEqual(response.status_code, 200)
        body = response.json()
        self.assertEqual(body['id'], str(original_id))
        self.assertIsNone(body['file'])
        self.assertFalse(body['is_deleted'])
        self.assertEqual(
            body['last_modified_by']['email'], 'publisher@example.com'
        )
        self.resource.refresh_from_db()
        self.assertEqual(self.resource.pk, original_id)
        self.assertEqual(self.resource.lesson, self.lesson)
        self.assertFalse(self.resource.is_deleted)


class AuthorizationTests(ResourceEndpointTestCase):
    def write_specs(self):
        resource = Resource.objects.create(
            lesson=self.lesson,
            type='video',
            title='Intro video',
            url='https://videos.example.com/intro',
            last_modified_by=self.publisher,
        )
        return [
            (self.resources_url(), 'post', VIDEO_PAYLOAD),
            (self.resource_url(resource), 'patch', {'title': 'Renamed'}),
        ]

    def test_a_student_cannot_write_a_resource(self):
        for url, method, payload in self.write_specs():
            with self.subTest(url=url):
                response = getattr(self.student_client, method)(
                    url, payload, format='json'
                )
                assert_envelope(self, response, 'permission_denied', 403)

    def test_an_anonymous_caller_cannot_write_a_resource(self):
        for url, method, payload in self.write_specs():
            with self.subTest(url=url):
                response = getattr(self.anonymous_client, method)(
                    url, payload, format='json'
                )
                assert_envelope(self, response, 'unauthenticated', 401)


class RoutingAndSchemaTests(ContentEndpointTestCase):
    def test_the_routes_live_under_the_api_prefix(self):
        for name in ('resource-create', 'resource-update'):
            with self.subTest(name=name):
                url = reverse(name, args=[uuid.uuid4()])
                self.assertTrue(url.startswith(settings.API_PREFIX + '/'))

    def test_the_schema_documents_the_new_operations(self):
        schema = SchemaGenerator().get_schema(request=None, public=True)
        paths = schema['paths']

        resources = paths[f'{settings.API_PREFIX}/lessons/{{lesson_id}}/resources/']
        self.assertIn('get', resources)
        self.assertIn('post', resources)
        self.assertEqual(
            resources['post']['requestBody']['content']['application/json'][
                'schema'
            ]['$ref'],
            '#/components/schemas/Resource',
        )

        detail = paths[f'{settings.API_PREFIX}/resources/{{resource_id}}/']
        self.assertIn('patch', detail)

    def test_the_schema_marks_server_owned_fields_read_only(self):
        schema = SchemaGenerator().get_schema(request=None, public=True)
        component = schema['components']['schemas']['Resource']
        properties = component['properties']
        for name in ('id', 'file', 'is_deleted', 'updated_at'):
            with self.subTest(name=name):
                self.assertIs(properties[name]['readOnly'], True)
        self.assertIs(properties['last_modified_by']['readOnly'], True)

    def test_the_schema_lists_all_four_type_choices(self):
        schema = SchemaGenerator().get_schema(request=None, public=True)
        component = schema['components']['schemas']['Resource']
        type_ref = component['properties']['type']['$ref']
        enum = schema['components']['schemas'][type_ref.rsplit('/', 1)[-1]][
            'enum'
        ]
        self.assertEqual(
            set(enum), {'document', 'image', 'video', 'external_link'}
        )