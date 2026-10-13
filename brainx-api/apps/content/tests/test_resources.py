"""The Resource model, the write endpoints and their gates (Stories 3.1-3.2).

A Resource is the material a Lesson carries: one typed row (`document`,
`image`, `video`, `external_link`) keyed to a Lesson only, whose payload is
pinned to its type by two database CHECK constraints. The URL-bearing types
(`video`, `external_link`) arrive as JSON; the file types (`document`, `image`)
arrive as multipart on the create action, with the file checked against the
settings ceiling and per-type extension allowlist. Every write goes through
`mutate`, so the acting Publisher is stamped.
"""

import os
import socket
import tempfile
import uuid
from datetime import date
from unittest import mock

from django.conf import settings
from django.core.exceptions import ValidationError
from django.core.files.uploadedfile import SimpleUploadedFile
from django.db import IntegrityError, models, transaction
from django.test import TestCase, override_settings
from django.urls import reverse
from drf_spectacular.generators import SchemaGenerator

from apps.users.models import User

from ..delivery import build_signed_url
from ..models import Chapter, Course, Lesson, Module, Resource
from .helpers import assert_envelope
from .test_create_endpoints import PASSWORD, ContentEndpointTestCase, client_for

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

    def retrieve_url(self, resource):
        return reverse('resource-retrieve', args=[resource.pk])


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
        # `file` is write-only: it is never serialized, so the write response
        # carries no storage URL. (Retrieval, which does return one, is 3.3.)
        self.assertNotIn('file', body)
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

    def test_the_listing_is_scoped_to_the_path_lesson(self):
        other_lesson = Lesson.objects.create(
            chapter=self.chapter,
            title='Parallel',
            teacher='Ms Ada',
            course_date=date(2026, 9, 2),
            position=2,
            last_modified_by=self.publisher,
        )
        self.publisher_client.post(
            self.resources_url(), VIDEO_PAYLOAD, format='json'
        )
        self.publisher_client.post(
            self.resources_url(other_lesson), VIDEO_PAYLOAD, format='json'
        )

        response = self.publisher_client.get(self.resources_url())

        self.assertEqual(response.status_code, 200)
        body = response.json()
        # Both rows exist; the listing shows only the path Lesson's one.
        self.assertEqual(Resource.objects.count(), 2)
        self.assertEqual(body['count'], 1)
        self.assertEqual(body['results'][0]['title'], 'Intro video')

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


def uploaded(name, content=b'file-bytes'):
    """A file part for a multipart request; only its name and size matter."""
    return SimpleUploadedFile(name, content)


class ResourceUploadTests(ResourceEndpointTestCase):
    """The file-bearing types upload through the create action (Story 3.2).

    A `document` or `image` write carries a `file` on a multipart request; the
    serializer requires it, checks it against the single settings ceiling and
    per-type extension allowlist, and refuses a file on an update. The URL
    types keep working as JSON (AC 1-4, 7-8).
    """

    @classmethod
    def setUpClass(cls):
        super().setUpClass()
        # Save uploads to a throwaway directory and reset Django's cached
        # default storage, so no test writes into the checkout's media/ folder.
        cls._uploads = tempfile.TemporaryDirectory()
        cls.enterClassContext(
            override_settings(
                STORAGES={
                    'default': {
                        'BACKEND': (
                            'django.core.files.storage.FileSystemStorage'
                        ),
                        'OPTIONS': {'location': cls._uploads.name},
                    },
                    'staticfiles': {
                        'BACKEND': (
                            'django.contrib.staticfiles.storage.'
                            'StaticFilesStorage'
                        ),
                    },
                }
            )
        )
        cls.addClassCleanup(cls._uploads.cleanup)

    def test_a_publisher_uploads_a_document(self):
        response = self.publisher_client.post(
            self.resources_url(),
            {'type': 'document', 'title': 'Deck', 'file': uploaded('notes.pdf')},
            format='multipart',
        )

        self.assertEqual(response.status_code, 201)
        body = response.json()
        self.assertEqual(body['type'], 'document')
        self.assertEqual(body['title'], 'Deck')
        self.assertIsNone(body['url'])
        self.assertNotIn('file', body)
        self.assertEqual(
            body['last_modified_by'],
            {'id': str(self.publisher.id), 'email': self.publisher.email},
        )

        row = Resource.objects.get(pk=body['id'])
        self.assertEqual(row.lesson, self.lesson)
        self.assertEqual(row.last_modified_by, self.publisher)
        self.assertTrue(row.file.name.endswith('.pdf'))
        # upload_to='resources/%Y/%m/' keeps every file under resources/.
        self.assertTrue(row.file.name.startswith('resources/'))

    def test_every_allowed_extension_is_accepted_for_its_type(self):
        cases = (
            ('document', 'notes.pdf'),
            ('image', 'photo.png'),
            ('image', 'photo.jpg'),
            ('image', 'photo.jpeg'),
            ('image', 'photo.webp'),
        )
        for resource_type, name in cases:
            with self.subTest(type=resource_type, name=name):
                response = self.publisher_client.post(
                    self.resources_url(),
                    {'type': resource_type, 'title': name,
                     'file': uploaded(name)},
                    format='multipart',
                )
                self.assertEqual(response.status_code, 201)
                row = Resource.objects.get(pk=response.json()['id'])
                extension = '.' + name.rsplit('.', 1)[-1]
                self.assertTrue(row.file.name.lower().endswith(extension))
                self.assertTrue(row.file.name.startswith('resources/'))

    def test_the_ceiling_and_allowlist_are_defined_once_in_settings(self):
        self.assertEqual(settings.RESOURCE_FILE_MAX_BYTES, 50 * 1024 * 1024)
        self.assertEqual(
            settings.RESOURCE_FILE_EXTENSIONS['document'], ('.pdf',)
        )
        self.assertEqual(
            set(settings.RESOURCE_FILE_EXTENSIONS['image']),
            {'.png', '.jpg', '.jpeg', '.webp'},
        )
        # The request-body ceiling rides the file ceiling, and the spool
        # threshold keeps Django's default; the README documents both.
        self.assertEqual(
            settings.DATA_UPLOAD_MAX_MEMORY_SIZE,
            settings.RESOURCE_FILE_MAX_BYTES,
        )
        self.assertEqual(
            settings.FILE_UPLOAD_MAX_MEMORY_SIZE, 2.5 * 1024 * 1024
        )

    def test_a_file_over_the_ceiling_is_rejected_and_named(self):
        # The bound is read from settings, so an 8-byte ceiling exercises the
        # same code path a 50 MB file would, without allocating one.
        with override_settings(RESOURCE_FILE_MAX_BYTES=8):
            response = self.publisher_client.post(
                self.resources_url(),
                {'type': 'document', 'title': 'Deck',
                 'file': uploaded('notes.pdf', b'0123456789')},
                format='multipart',
            )

        body = assert_envelope(self, response, 'validation_error', 400)
        self.assertIn('file', body['errors'])
        self.assertEqual(Resource.objects.count(), 0)

    def test_a_file_outside_its_type_allowlist_is_rejected_and_named(self):
        for resource_type, name in (
            ('document', 'notes.docx'),
            ('document', 'photo.png'),
            ('image', 'photo.gif'),
        ):
            with self.subTest(type=resource_type, name=name):
                response = self.publisher_client.post(
                    self.resources_url(),
                    {'type': resource_type, 'title': 'File',
                     'file': uploaded(name)},
                    format='multipart',
                )
                body = assert_envelope(self, response, 'validation_error', 400)
                self.assertIn('file', body['errors'])
        self.assertEqual(Resource.objects.count(), 0)

    def test_a_file_exactly_at_the_ceiling_is_accepted(self):
        # The boundary belongs to the accepted side: only a size *over* the
        # ceiling is rejected, so the check stays a strict `>`.
        with override_settings(RESOURCE_FILE_MAX_BYTES=8):
            response = self.publisher_client.post(
                self.resources_url(),
                {'type': 'document', 'title': 'Deck',
                 'file': uploaded('notes.pdf', b'12345678')},
                format='multipart',
            )

        self.assertEqual(response.status_code, 201)
        row = Resource.objects.get(pk=response.json()['id'])
        self.assertEqual(row.file.size, 8)

    def test_extension_matching_edges(self):
        # The allowlist matches the lowercased filename extension: an uppercase
        # suffix passes, a bare name and a trailing-dot name do not.
        for name, expected in (
            ('NOTES.PDF', 201),
            ('notes', 400),
            ('notes.', 400),
        ):
            with self.subTest(name=name):
                response = self.publisher_client.post(
                    self.resources_url(),
                    {'type': 'document', 'title': 'Deck',
                     'file': uploaded(name)},
                    format='multipart',
                )
                self.assertEqual(response.status_code, expected)
                if expected == 400:
                    body = assert_envelope(
                        self, response, 'validation_error', 400
                    )
                    self.assertIn('file', body['errors'])
        self.assertEqual(Resource.objects.count(), 1)

    def test_the_oversize_message_reports_bytes_below_one_mib(self):
        # Below 1 MiB the ceiling is rendered in bytes, not as a misleading
        # "0 MB".
        with override_settings(RESOURCE_FILE_MAX_BYTES=8):
            response = self.publisher_client.post(
                self.resources_url(),
                {'type': 'document', 'title': 'Deck',
                 'file': uploaded('notes.pdf', b'0123456789')},
                format='multipart',
            )

        body = assert_envelope(self, response, 'validation_error', 400)
        self.assertEqual(
            body['errors']['file'], ['a file may not exceed 8 bytes']
        )

    def test_the_allowlist_message_is_grammatical_for_an_image(self):
        response = self.publisher_client.post(
            self.resources_url(),
            {'type': 'image', 'title': 'Photo', 'file': uploaded('photo.gif')},
            format='multipart',
        )

        body = assert_envelope(self, response, 'validation_error', 400)
        self.assertEqual(
            body['errors']['file'],
            ['an image file must end in .png or .jpg or .jpeg or .webp'],
        )

    def test_an_update_cannot_change_a_resources_type(self):
        # The discriminator is write-once, and it is decided before the
        # per-type payload rules, so changing a row to or from a file-bearing
        # type is a 400 naming `type`, never `file` or `url`.
        video = Resource.objects.create(
            lesson=self.lesson,
            type='video',
            title='Intro video',
            url='https://videos.example.com/intro',
            last_modified_by=self.publisher,
        )
        for new_type in ('document', 'image'):
            with self.subTest(type=new_type):
                response = self.publisher_client.patch(
                    self.resource_url(video), {'type': new_type},
                    format='json',
                )
                body = assert_envelope(self, response, 'validation_error', 400)
                self.assertEqual(body['errors'], {'type': ['a Resource type '
                                                          'cannot be changed']})
        video.refresh_from_db()
        self.assertEqual(video.type, 'video')

        document = Resource.objects.create(
            lesson=self.lesson,
            type='document',
            title='Deck',
            file='notes.pdf',
            last_modified_by=self.publisher,
        )
        response = self.publisher_client.patch(
            self.resource_url(document), {'type': 'video'}, format='json',
        )
        body = assert_envelope(self, response, 'validation_error', 400)
        self.assertIn('type', body['errors'])
        document.refresh_from_db()
        self.assertEqual(document.type, 'document')

    def test_a_rejected_upload_writes_nothing_to_storage(self):
        # The storage directory predates and outlives the request, so the
        # before/after snapshot proves the 400 saved no bytes to it.
        before = self._stored_files()
        with override_settings(RESOURCE_FILE_MAX_BYTES=8):
            response = self.publisher_client.post(
                self.resources_url(),
                {'type': 'document', 'title': 'Deck',
                 'file': uploaded('notes.pdf', b'0123456789')},
                format='multipart',
            )
        assert_envelope(self, response, 'validation_error', 400)
        self.assertEqual(self._stored_files(), before)

    def _stored_files(self):
        found = []
        for root, _dirs, files in os.walk(self._uploads.name):
            found.extend(os.path.join(root, name) for name in files)
        return sorted(found)

    def test_a_file_type_without_a_file_is_rejected_and_named(self):
        for resource_type in ('document', 'image'):
            for fmt in ('multipart', 'json'):
                with self.subTest(type=resource_type, format=fmt):
                    response = self.publisher_client.post(
                        self.resources_url(),
                        {'type': resource_type, 'title': 'File'},
                        format=fmt,
                    )
                    body = assert_envelope(
                        self, response, 'validation_error', 400
                    )
                    self.assertIn('file', body['errors'])
        self.assertEqual(Resource.objects.count(), 0)

    def test_a_url_type_carrying_a_file_is_rejected_and_named(self):
        for resource_type in ('video', 'external_link'):
            with self.subTest(type=resource_type):
                response = self.publisher_client.post(
                    self.resources_url(),
                    {'type': resource_type, 'title': 'X',
                     'url': 'https://example.com/x',
                     'file': uploaded('notes.pdf')},
                    format='multipart',
                )
                body = assert_envelope(self, response, 'validation_error', 400)
                self.assertIn('file', body['errors'])
        self.assertEqual(Resource.objects.count(), 0)

    def test_an_update_cannot_carry_a_file(self):
        document = Resource.objects.create(
            lesson=self.lesson,
            type='document',
            title='Deck',
            file='notes.pdf',
            last_modified_by=self.publisher,
        )

        response = self.publisher_client.patch(
            self.resource_url(document),
            {'title': 'Renamed', 'file': uploaded('other.pdf')},
            format='multipart',
        )

        body = assert_envelope(self, response, 'validation_error', 400)
        self.assertIn('file', body['errors'])
        document.refresh_from_db()
        self.assertEqual(document.title, 'Deck')

    def test_an_update_carrying_a_file_in_json_is_rejected_and_named(self):
        document = Resource.objects.create(
            lesson=self.lesson,
            type='document',
            title='Deck',
            file='notes.pdf',
            last_modified_by=self.publisher,
        )

        response = self.publisher_client.patch(
            self.resource_url(document), {'file': 'ghost.pdf'}, format='json'
        )

        body = assert_envelope(self, response, 'validation_error', 400)
        self.assertIn('file', body['errors'])
        document.refresh_from_db()
        self.assertEqual(document.file.name, 'notes.pdf')

    def test_a_json_url_write_still_works_as_in_story_3_1(self):
        response = self.publisher_client.post(
            self.resources_url(), VIDEO_PAYLOAD, format='json'
        )

        self.assertEqual(response.status_code, 201)
        body = response.json()
        self.assertEqual(body['url'], VIDEO_PAYLOAD['url'])
        self.assertNotIn('file', body)

    def test_a_student_cannot_upload(self):
        response = self.student_client.post(
            self.resources_url(),
            {'type': 'document', 'title': 'Deck', 'file': uploaded('notes.pdf')},
            format='multipart',
        )

        assert_envelope(self, response, 'permission_denied', 403)
        self.assertEqual(Resource.objects.count(), 0)

    def test_an_anonymous_caller_cannot_upload(self):
        response = self.anonymous_client.post(
            self.resources_url(),
            {'type': 'document', 'title': 'Deck', 'file': uploaded('notes.pdf')},
            format='multipart',
        )

        assert_envelope(self, response, 'unauthenticated', 401)
        self.assertEqual(Resource.objects.count(), 0)

    def test_a_non_object_body_is_a_400_not_a_500(self):
        # A JSON body that is not an object must be refused by the serializer's
        # shape or required errors, never crash the view with a 500.
        for payload in (None, [], 'video'):
            with self.subTest(body=payload):
                response = self.publisher_client.post(
                    self.resources_url(), payload, format='json'
                )
                envelope = assert_envelope(
                    self, response, 'validation_error', 400
                )
                self.assertTrue(envelope['errors'])
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

    def test_clearing_the_url_of_a_url_type_is_rejected_and_named(self):
        # Without this, clearing the address would trip the database CHECK
        # constraint on save and surface as a 500 instead of the 400 naming
        # `url` every other violation gets.
        for cleared in ('', None):
            with self.subTest(url=cleared):
                response = self.publisher_client.patch(
                    self.resource_url(self.resource), {'url': cleared},
                    format='json',
                )
                body = assert_envelope(
                    self, response, 'validation_error', 400
                )
                self.assertIn('url', body['errors'])
        self.resource.refresh_from_db()
        self.assertEqual(self.resource.url, 'https://videos.example.com/intro')

    def test_a_url_on_a_file_type_is_rejected_and_named(self):
        document = Resource.objects.create(
            lesson=self.lesson,
            type='document',
            title='Deck',
            file='notes.pdf',
            last_modified_by=self.publisher,
        )

        response = self.publisher_client.patch(
            self.resource_url(document),
            {'url': 'https://files.example.com/deck'},
            format='json',
        )

        body = assert_envelope(self, response, 'validation_error', 400)
        self.assertIn('url', body['errors'])
        document.refresh_from_db()
        self.assertIsNone(document.url)


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
        # `file` is write-only, so the response never carries it either.
        self.assertNotIn('file', body)
        self.assertFalse(body['is_deleted'])
        self.assertEqual(
            body['last_modified_by']['email'], 'publisher@example.com'
        )
        self.resource.refresh_from_db()
        self.assertEqual(self.resource.pk, original_id)
        self.assertEqual(self.resource.lesson, self.lesson)
        self.assertFalse(self.resource.is_deleted)


class UrlTypeOutsideTests(ResourceEndpointTestCase):
    """The URL types point outside BrainX and are never reached (Story 3.4).

    A `video` or `external_link` Resource is a pointer and nothing more: its
    URL is stored, listed and returned verbatim as a plain JSON field, and the
    API never reaches for the host it names - it neither crawls nor gates a
    Lesson on reachability. A `file` on a URL type is refused on create and on
    update. Scheme rejection and the retrieval 404 for URL types are already
    pinned in `UrlValidationTests` and `ResourceRetrievalTests`.
    """

    def test_the_listing_returns_a_stored_url_verbatim(self):
        self.publisher_client.post(
            self.resources_url(), VIDEO_PAYLOAD, format='json'
        )

        response = self.publisher_client.get(self.resources_url())

        self.assertEqual(response.status_code, 200)
        self.assertEqual(response.json()['count'], 1)
        resource = response.json()['results'][0]
        self.assertEqual(resource['url'], VIDEO_PAYLOAD['url'])
        self.assertEqual(resource['type'], 'video')
        self.assertNotIn('file', resource)

    def test_a_metadata_edit_leaves_the_url_verbatim(self):
        resource = Resource.objects.create(
            lesson=self.lesson,
            type='external_link',
            title='Syllabus',
            url='https://curriculum.example.com/syllabus.pdf',
            last_modified_by=self.publisher,
        )

        response = self.publisher_client.patch(
            self.resource_url(resource), {'title': 'Renamed'}, format='json'
        )

        self.assertEqual(response.status_code, 200)
        body = response.json()
        self.assertEqual(body['title'], 'Renamed')
        self.assertEqual(
            body['url'], 'https://curriculum.example.com/syllabus.pdf'
        )
        self.assertNotIn('file', body)
        resource.refresh_from_db()
        self.assertEqual(
            resource.url, 'https://curriculum.example.com/syllabus.pdf'
        )

    def test_an_unreachable_host_is_accepted_without_a_reachability_check(self):
        # `.invalid` is reserved by RFC 2606 and never resolves. Turning a
        # lookup of it into a failure means the requests below succeed only
        # because the API never reaches for the host it stores.
        url = 'https://videos.example.invalid/intro'
        real_getaddrinfo = socket.getaddrinfo

        def refuse_invalid_host(host, *args, **kwargs):
            if str(host).endswith('.invalid'):
                raise AssertionError('the API resolved an external host')
            return real_getaddrinfo(host, *args, **kwargs)

        with mock.patch(
            'socket.getaddrinfo', side_effect=refuse_invalid_host
        ):
            attached = {}
            for resource_type in ('video', 'external_link'):
                with self.subTest(type=resource_type):
                    attach = self.publisher_client.post(
                        self.resources_url(),
                        {**VIDEO_PAYLOAD, 'type': resource_type, 'url': url},
                        format='json',
                    )
                    self.assertEqual(attach.status_code, 201)
                    self.assertEqual(attach.json()['url'], url)
                    self.assertNotIn('file', attach.json())
                    attached[resource_type] = attach.json()['id']

            listing = self.publisher_client.get(self.resources_url())
            self.assertEqual(listing.status_code, 200)
            body = listing.json()
            self.assertEqual(body['count'], 2)
            self.assertEqual(
                {resource['type'] for resource in body['results']},
                {'video', 'external_link'},
            )
            for resource in body['results']:
                self.assertEqual(resource['url'], url)

            for resource_type, resource_id in attached.items():
                with self.subTest(type=resource_type):
                    resource = Resource.objects.get(pk=resource_id)
                    edit = self.publisher_client.patch(
                        self.resource_url(resource), {'title': 'Renamed'},
                        format='json',
                    )
                    self.assertEqual(edit.status_code, 200)
                    self.assertEqual(edit.json()['url'], url)

    def test_a_file_on_a_url_type_is_refused_on_create(self):
        for resource_type in ('video', 'external_link'):
            with self.subTest(type=resource_type):
                response = self.publisher_client.post(
                    self.resources_url(),
                    {'type': resource_type, 'title': 'X',
                     'url': 'https://example.com/x',
                     'file': uploaded('clip.mp4')},
                    format='multipart',
                )
                body = assert_envelope(self, response, 'validation_error', 400)
                self.assertIn('file', body['errors'])
        self.assertEqual(Resource.objects.count(), 0)

    def test_a_file_on_a_url_type_is_refused_on_update(self):
        for resource_type in ('video', 'external_link'):
            with self.subTest(type=resource_type):
                resource = Resource.objects.create(
                    lesson=self.lesson,
                    type=resource_type,
                    title='Intro video',
                    url='https://videos.example.com/intro',
                    last_modified_by=self.publisher,
                )

                response = self.publisher_client.patch(
                    self.resource_url(resource),
                    {'title': 'Renamed', 'file': uploaded('clip.mp4')},
                    format='multipart',
                )

                body = assert_envelope(
                    self, response, 'validation_error', 400
                )
                self.assertIn('file', body['errors'])
                resource.refresh_from_db()
                self.assertEqual(resource.title, 'Intro video')
                self.assertEqual(
                    resource.url, 'https://videos.example.com/intro'
                )

    def test_a_refused_scheme_leaves_the_table_untouched(self):
        # The scheme rule itself is pinned in `UrlValidationTests`; what this
        # adds is that a refused write, whatever the scheme, leaves no row.
        for bad in bad_urls():
            with self.subTest(url=bad):
                response = self.publisher_client.post(
                    self.resources_url(),
                    {'type': 'video', 'title': 'X', 'url': bad},
                    format='json',
                )
                assert_envelope(self, response, 'validation_error', 400)
        self.assertEqual(Resource.objects.count(), 0)


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
        for name in ('resource-create', 'resource-update', 'resource-retrieve'):
            with self.subTest(name=name):
                url = reverse(name, args=[uuid.uuid4()])
                self.assertTrue(url.startswith(settings.API_PREFIX + '/'))

    def test_the_schema_documents_the_new_operations(self):
        schema = SchemaGenerator().get_schema(request=None, public=True)
        paths = schema['paths']

        resources = paths[f'{settings.API_PREFIX}/lessons/{{lesson_id}}/resources/']
        self.assertIn('get', resources)
        self.assertIn('post', resources)
        content = resources['post']['requestBody']['content']
        self.assertEqual(
            content['application/json']['schema']['$ref'],
            '#/components/schemas/Resource',
        )
        # The create action accepts a file, so the same body is documented as
        # multipart alongside the JSON the URL types use.
        self.assertIn('multipart/form-data', content)

        detail = paths[f'{settings.API_PREFIX}/resources/{{resource_id}}/']
        self.assertIn('patch', detail)

    def test_the_schema_marks_server_owned_fields_read_only(self):
        schema = SchemaGenerator().get_schema(request=None, public=True)
        component = schema['components']['schemas']['Resource']
        properties = component['properties']
        for name in ('id', 'is_deleted', 'updated_at'):
            with self.subTest(name=name):
                self.assertIs(properties[name]['readOnly'], True)
        self.assertIs(properties['last_modified_by']['readOnly'], True)

    def test_the_schema_marks_the_file_write_only(self):
        schema = SchemaGenerator().get_schema(request=None, public=True)
        component = schema['components']['schemas']['Resource']
        self.assertIs(component['properties']['file']['writeOnly'], True)

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

    def test_non_resource_writes_do_not_accept_multipart(self):
        # The multipart parser is scoped to the Resource write actions; any
        # other write surfaces JSON only in the schema.
        schema = SchemaGenerator().get_schema(request=None, public=True)
        content = schema['paths'][f'{settings.API_PREFIX}/courses/']['post'][
            'requestBody'
        ]['content']
        self.assertIn('application/json', content)
        self.assertNotIn('multipart/form-data', content)

    def test_the_default_parser_classes_stay_json_only(self):
        self.assertEqual(
            settings.REST_FRAMEWORK['DEFAULT_PARSER_CLASSES'],
            ['rest_framework.parsers.JSONParser'],
        )

    def test_a_multipart_body_to_a_json_only_action_is_a_415(self):
        response = self.publisher_client.post(
            reverse('course-create'),
            {'name': 'Physics', 'subject': 'Mechanics'},
            format='multipart',
        )
        self.assertEqual(response.status_code, 415)


class FakeSigningStorage:
    """A storage double for the S3 branch: records every url() call."""

    def __init__(self):
        self.calls = []

    def url(self, name, *, expire=None, parameters=None):
        self.calls.append(
            {'name': name, 'expire': expire, 'parameters': parameters}
        )
        return f'https://cdn.example.com/{name}?X-Amz-Signature=abc'


class ResourceRetrievalTests(ResourceEndpointTestCase):
    """The Student retrieval action (Story 3.3).

    A verified Student asks for one file-bearing Resource and gets an
    object-scoped URL plus the server-derived delivery answers: `content_type`
    from the per-type extension map, `filename` from `slugify(title)` plus the
    stored extension, and the disposition from the query parameter. Hidden,
    missing and non-file rows are all the same 404; local storage returns a
    plain URL while the S3 path signs with the response overrides baked in.
    """

    @classmethod
    def setUpClass(cls):
        super().setUpClass()
        cls._uploads = tempfile.TemporaryDirectory()
        cls.enterClassContext(
            override_settings(
                STORAGES={
                    'default': {
                        'BACKEND': (
                            'django.core.files.storage.FileSystemStorage'
                        ),
                        'OPTIONS': {'location': cls._uploads.name},
                    },
                    'staticfiles': {
                        'BACKEND': (
                            'django.contrib.staticfiles.storage.'
                            'StaticFilesStorage'
                        ),
                    },
                }
            )
        )
        cls.addClassCleanup(cls._uploads.cleanup)

    def setUp(self):
        super().setUp()
        self.verified = User.objects.create_user(
            email='verified@example.com',
            password=PASSWORD,
            is_email_verified=True,
        )
        self.verified_client = client_for(self.verified)

    def file_resource(
        self, resource_type='document', title='Deck', name='notes.pdf'
    ):
        return Resource.objects.create(
            lesson=self.lesson,
            type=resource_type,
            title=title,
            file=name,
            last_modified_by=self.publisher,
        )

    def test_a_verified_student_retrieves_a_document_inline(self):
        resource = self.file_resource()

        response = self.verified_client.get(self.retrieve_url(resource))

        self.assertEqual(response.status_code, 200)
        body = response.json()
        self.assertEqual(body['content_type'], 'application/pdf')
        self.assertEqual(body['disposition'], 'inline')
        self.assertEqual(body['filename'], 'deck.pdf')
        self.assertEqual(body['expires_in'], 3600)
        self.assertIn('notes.pdf', body['url'])

    def test_an_image_derives_type_and_name_from_the_stored_extension(self):
        resource = self.file_resource('image', 'My Photo!', 'photo.PNG')

        response = self.verified_client.get(
            self.retrieve_url(resource), {'disposition': 'attachment'}
        )

        self.assertEqual(response.status_code, 200)
        body = response.json()
        self.assertEqual(body['content_type'], 'image/png')
        self.assertEqual(body['disposition'], 'attachment')
        self.assertEqual(body['filename'], 'my-photo.png')

    def test_the_content_type_map_pins_the_allowlisted_extensions(self):
        # The delivery map is a second source of extension truth next to the
        # upload allowlist; pin its values and tie its keys to the allowlist so
        # either side cannot drift silently.
        self.assertEqual(
            settings.RESOURCE_CONTENT_TYPES,
            {
                'document': {'.pdf': 'application/pdf'},
                'image': {
                    '.png': 'image/png',
                    '.jpg': 'image/jpeg',
                    '.jpeg': 'image/jpeg',
                    '.webp': 'image/webp',
                },
            },
        )
        allowlist = settings.RESOURCE_FILE_EXTENSIONS
        for resource_type, extensions in allowlist.items():
            with self.subTest(type=resource_type):
                self.assertEqual(
                    set(settings.RESOURCE_CONTENT_TYPES[resource_type]),
                    set(extensions),
                )

    def test_an_unknown_extension_falls_back_to_octet_stream(self):
        resource = self.file_resource(name='notes.txt')

        response = self.verified_client.get(self.retrieve_url(resource))

        self.assertEqual(response.status_code, 200)
        self.assertEqual(
            response.json()['content_type'], 'application/octet-stream'
        )

    def test_a_title_with_no_slug_characters_falls_back_to_resource(self):
        resource = self.file_resource(title='!!!')

        response = self.verified_client.get(self.retrieve_url(resource))

        self.assertEqual(response.status_code, 200)
        self.assertEqual(response.json()['filename'], 'resource.pdf')

    def test_build_signed_url_is_empty_without_a_file(self):
        resource = Resource(
            lesson=self.lesson,
            type='video',
            title='Clip',
            url='https://videos.example.com/x',
            last_modified_by=self.publisher,
        )

        self.assertEqual(build_signed_url(resource), '')

    def test_an_unknown_disposition_is_a_400_naming_it(self):
        resource = self.file_resource()

        response = self.verified_client.get(
            self.retrieve_url(resource), {'disposition': 'open_in_new'}
        )

        body = assert_envelope(self, response, 'validation_error', 400)
        self.assertIn('disposition', body['errors'])

    def test_the_s3_url_is_signed_with_the_delivery_overrides(self):
        # The S3 branch belongs here, on the helper it exercises: the view
        # re-fetches its own row, so swapping the storage on a test instance
        # could never reach it. With an S3-like storage recording the call,
        # the URL is signed for the TTL and carries the response overrides.
        resource = Resource(
            lesson=self.lesson,
            type='document',
            title='Deck',
            file='resources/2026/09/notes.pdf',
            last_modified_by=self.publisher,
        )
        storage = FakeSigningStorage()
        resource.file.storage = storage

        with override_settings(STORAGE_BACKEND='s3'):
            signed = build_signed_url(resource)

        self.assertEqual(
            signed,
            'https://cdn.example.com/resources/2026/09/notes.pdf'
            '?X-Amz-Signature=abc',
        )
        call = storage.calls[0]
        self.assertEqual(call['name'], 'resources/2026/09/notes.pdf')
        self.assertEqual(call['expire'], 3600)
        self.assertEqual(
            call['parameters'],
            {
                'ResponseContentType': 'application/pdf',
                'ResponseContentDisposition': 'inline; filename="deck.pdf"',
            },
        )

        # AC 2: a non-default disposition reaches the signed URL, not just the
        # JSON body. The endpoint forwards the query parameter here.
        storage.calls.clear()
        with override_settings(STORAGE_BACKEND='s3'):
            build_signed_url(resource, disposition='attachment')
        self.assertEqual(
            storage.calls[0]['parameters']['ResponseContentDisposition'],
            'attachment; filename="deck.pdf"',
        )

    def test_a_soft_deleted_resource_is_404(self):
        resource = self.file_resource()
        resource.is_deleted = True
        resource.save(update_fields=['is_deleted'])

        response = self.verified_client.get(self.retrieve_url(resource))

        assert_envelope(self, response, 'not_found', 404)

    def test_a_soft_deleted_parent_lesson_is_404(self):
        resource = self.file_resource()
        self.lesson.is_deleted = True
        self.lesson.save(update_fields=['is_deleted'])

        response = self.verified_client.get(self.retrieve_url(resource))

        assert_envelope(self, response, 'not_found', 404)

    def test_a_url_type_resource_is_404(self):
        resource = Resource.objects.create(
            lesson=self.lesson,
            type='video',
            title='Clip',
            url='https://videos.example.com/x',
            last_modified_by=self.publisher,
        )

        response = self.verified_client.get(self.retrieve_url(resource))

        assert_envelope(self, response, 'not_found', 404)

    def test_an_unknown_resource_is_404(self):
        response = self.verified_client.get(
            reverse('resource-retrieve', args=[uuid.uuid4()])
        )

        assert_envelope(self, response, 'not_found', 404)

    def test_an_unverified_student_cannot_retrieve(self):
        resource = self.file_resource()

        response = self.student_client.get(self.retrieve_url(resource))

        assert_envelope(self, response, 'permission_denied', 403)

    def test_an_anonymous_caller_cannot_retrieve(self):
        resource = self.file_resource()

        response = self.anonymous_client.get(self.retrieve_url(resource))

        assert_envelope(self, response, 'unauthenticated', 401)

    def test_the_schema_documents_the_retrieval_operation(self):
        schema = SchemaGenerator().get_schema(request=None, public=True)
        operation = schema['paths'][
            f'{settings.API_PREFIX}/resources/{{resource_id}}/retrieval/'
        ]['get']

        self.assertEqual(
            operation['responses']['200']['content']['application/json'][
                'schema'
            ]['$ref'],
            '#/components/schemas/ResourceRetrieval',
        )
        disposition = next(
            parameter
            for parameter in operation['parameters']
            if parameter['name'] == 'disposition'
        )
        self.assertEqual(
            set(disposition['schema']['enum']), {'inline', 'attachment'}
        )