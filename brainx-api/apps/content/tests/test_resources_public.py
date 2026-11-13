"""Integration tests for public anonymous access to documents and images (Story 1.2).

Verifies anonymous retrieval of documents and images, existence-oracle immunity
(indistinguishable 404s for unpublished/deleted/non-file resources),
anonymous rate limiting via AnonRateThrottle (429 with Retry-After),
and strict reversibility to 401/403 when BRAINX_PUBLIC_BROWSING=False.
"""

from datetime import date
import tempfile
import uuid

from django.conf import settings
from django.core.cache import cache
from django.db import connection, transaction
from django.test import override_settings
from django.urls import reverse
from rest_framework.throttling import AnonRateThrottle, UserRateThrottle

from apps.content.models import Lesson, Resource
from apps.content.views import ResourceRetrievalView
from apps.users.models import User

from .helpers import assert_envelope
from .test_create_endpoints import ContentEndpointTestCase, PASSWORD, client_for


class PublicResourceTestCase(ContentEndpointTestCase):
    """Base fixture with temporary storage, published parent lesson, and verified student."""

    @classmethod
    def setUpClass(cls):
        super().setUpClass()
        cls._uploads = tempfile.TemporaryDirectory()
        cls.enterClassContext(
            override_settings(
                STORAGES={
                    'default': {
                        'BACKEND': 'django.core.files.storage.FileSystemStorage',
                        'OPTIONS': {'location': cls._uploads.name},
                    },
                    'staticfiles': {
                        'BACKEND': 'django.contrib.staticfiles.storage.StaticFilesStorage',
                    },
                }
            )
        )
        cls.addClassCleanup(cls._uploads.cleanup)

    def setUp(self):
        super().setUp()
        self.verified_student = User.objects.create_user(
            email='verified_student@example.com',
            password=PASSWORD,
            is_email_verified=True,
        )
        self.verified_client = client_for(self.verified_student)
        self.lesson = Lesson.objects.create(
            chapter=self.chapter,
            title='Lesson 1: Introduction',
            teacher='Prof. Ada',
            course_date=date(2026, 11, 1),
            description='First published lesson',
            position=1,
            is_published=True,
            is_deleted=False,
            last_modified_by=self.publisher,
        )

    def retrieve_url(self, resource):
        return reverse('resource-retrieve', args=[resource.pk])

    def file_resource(
        self, resource_type='document', title='Course Syllabus', name='syllabus.pdf'
    ):
        return Resource.objects.create(
            lesson=self.lesson,
            type=resource_type,
            title=title,
            file=name,
            last_modified_by=self.publisher,
        )

    def url_resource(self, **overrides):
        fields = {
            'lesson': self.lesson,
            'type': 'video',
            'title': 'Intro video',
            'url': 'https://videos.example.com/intro',
            'last_modified_by': self.publisher,
        }
        fields.update(overrides)
        return Resource.objects.create(**fields)


class PublicResourceRetrievalTests(PublicResourceTestCase):
    """AC-1: Anonymous signed URL generation for documents and images when BRAINX_PUBLIC_BROWSING=True."""

    @override_settings(BRAINX_PUBLIC_BROWSING=True)
    def test_anonymous_retrieves_document_inline_default(self):
        resource = self.file_resource('document', 'Course Syllabus', 'syllabus.pdf')

        response = self.anonymous_client.get(self.retrieve_url(resource))

        self.assertEqual(response.status_code, 200)
        body = response.json()
        self.assertEqual(body['content_type'], 'application/pdf')
        self.assertEqual(body['disposition'], 'inline')
        self.assertEqual(body['filename'], 'course-syllabus.pdf')
        self.assertEqual(body['expires_in'], settings.RESOURCE_URL_TTL_SECONDS)
        self.assertTrue(body['url'])
        self.assertIn('syllabus.pdf', body['url'])
        self.assertEqual(response['Cache-Control'], 'no-store')

    @override_settings(BRAINX_PUBLIC_BROWSING=True)
    def test_anonymous_retrieves_document_attachment(self):
        resource = self.file_resource('document', 'Course Syllabus', 'syllabus.pdf')

        response = self.anonymous_client.get(
            self.retrieve_url(resource), {'disposition': 'attachment'}
        )

        self.assertEqual(response.status_code, 200)
        body = response.json()
        self.assertEqual(body['content_type'], 'application/pdf')
        self.assertEqual(body['disposition'], 'attachment')
        self.assertEqual(body['filename'], 'course-syllabus.pdf')
        self.assertEqual(body['expires_in'], settings.RESOURCE_URL_TTL_SECONDS)
        self.assertTrue(body['url'])
        self.assertEqual(response['Cache-Control'], 'no-store')

    @override_settings(BRAINX_PUBLIC_BROWSING=True)
    def test_anonymous_retrieves_image_inline(self):
        resource = self.file_resource('image', 'Diagram Image', 'diagram.png')

        response = self.anonymous_client.get(
            self.retrieve_url(resource), {'disposition': 'inline'}
        )

        self.assertEqual(response.status_code, 200)
        body = response.json()
        self.assertEqual(body['content_type'], 'image/png')
        self.assertEqual(body['disposition'], 'inline')
        self.assertEqual(body['filename'], 'diagram-image.png')
        self.assertEqual(body['expires_in'], settings.RESOURCE_URL_TTL_SECONDS)
        self.assertTrue(body['url'])
        self.assertIn('diagram.png', body['url'])
        self.assertEqual(response['Cache-Control'], 'no-store')

    @override_settings(BRAINX_PUBLIC_BROWSING=True)
    def test_anonymous_retrieves_image_attachment(self):
        resource = self.file_resource('image', 'Diagram Image', 'diagram.png')

        response = self.anonymous_client.get(
            self.retrieve_url(resource), {'disposition': 'attachment'}
        )

        self.assertEqual(response.status_code, 200)
        body = response.json()
        self.assertEqual(body['content_type'], 'image/png')
        self.assertEqual(body['disposition'], 'attachment')
        self.assertEqual(body['filename'], 'diagram-image.png')
        self.assertEqual(body['expires_in'], settings.RESOURCE_URL_TTL_SECONDS)
        self.assertTrue(body['url'])
        self.assertEqual(response['Cache-Control'], 'no-store')

    @override_settings(BRAINX_PUBLIC_BROWSING=True)
    def test_invalid_disposition_returns_400_validation_error(self):
        resource = self.file_resource('document', 'Course Syllabus', 'syllabus.pdf')

        response = self.anonymous_client.get(
            self.retrieve_url(resource), {'disposition': 'invalid_disposition'}
        )

        body = assert_envelope(self, response, 'validation_error', 400)
        self.assertIn('disposition', body['errors'])


class PublicResourceVisibilityTests(PublicResourceTestCase):
    """AC-2: Indistinguishable 404 responses without existence leaks under BRAINX_PUBLIC_BROWSING=True."""

    @override_settings(BRAINX_PUBLIC_BROWSING=True)
    def test_unpublished_parent_lesson_returns_404_indistinguishable_from_unknown_id(self):
        resource = self.file_resource()
        self.lesson.is_published = False
        self.lesson.save(update_fields=['is_published'])

        response = self.anonymous_client.get(self.retrieve_url(resource))
        body = assert_envelope(self, response, 'not_found', 404)

        nonexistent_response = self.anonymous_client.get(
            reverse('resource-retrieve', args=[uuid.uuid4()])
        )
        nonexistent_body = assert_envelope(self, nonexistent_response, 'not_found', 404)
        self.assertEqual(body, nonexistent_body)

    @override_settings(BRAINX_PUBLIC_BROWSING=True)
    def test_soft_deleted_parent_lesson_returns_404_indistinguishable_from_unknown_id(self):
        resource = self.file_resource()
        self.lesson.is_deleted = True
        self.lesson.save(update_fields=['is_deleted'])

        response = self.anonymous_client.get(self.retrieve_url(resource))
        body = assert_envelope(self, response, 'not_found', 404)

        nonexistent_response = self.anonymous_client.get(
            reverse('resource-retrieve', args=[uuid.uuid4()])
        )
        nonexistent_body = assert_envelope(self, nonexistent_response, 'not_found', 404)
        self.assertEqual(body, nonexistent_body)

    @override_settings(BRAINX_PUBLIC_BROWSING=True)
    def test_soft_deleted_resource_returns_404_indistinguishable_from_unknown_id(self):
        resource = self.file_resource()
        resource.is_deleted = True
        resource.save(update_fields=['is_deleted'])

        response = self.anonymous_client.get(self.retrieve_url(resource))
        body = assert_envelope(self, response, 'not_found', 404)

        nonexistent_response = self.anonymous_client.get(
            reverse('resource-retrieve', args=[uuid.uuid4()])
        )
        nonexistent_body = assert_envelope(self, nonexistent_response, 'not_found', 404)
        self.assertEqual(body, nonexistent_body)

    @override_settings(BRAINX_PUBLIC_BROWSING=True)
    def test_video_resource_returns_404_indistinguishable_from_unknown_id(self):
        video = self.url_resource(type='video')

        response = self.anonymous_client.get(self.retrieve_url(video))
        body = assert_envelope(self, response, 'not_found', 404)

        nonexistent_response = self.anonymous_client.get(
            reverse('resource-retrieve', args=[uuid.uuid4()])
        )
        nonexistent_body = assert_envelope(self, nonexistent_response, 'not_found', 404)
        self.assertEqual(body, nonexistent_body)

    @override_settings(BRAINX_PUBLIC_BROWSING=True)
    def test_external_link_resource_returns_404_indistinguishable_from_unknown_id(self):
        link = self.url_resource(type='external_link', url='https://example.com/syllabus.pdf')

        response = self.anonymous_client.get(self.retrieve_url(link))
        body = assert_envelope(self, response, 'not_found', 404)

        nonexistent_response = self.anonymous_client.get(
            reverse('resource-retrieve', args=[uuid.uuid4()])
        )
        nonexistent_body = assert_envelope(self, nonexistent_response, 'not_found', 404)
        self.assertEqual(body, nonexistent_body)

    @override_settings(BRAINX_PUBLIC_BROWSING=True)
    def test_resource_with_null_file_returns_404_indistinguishable_from_unknown_id(self):
        if connection.vendor == 'postgresql':
            with transaction.atomic():
                sid = transaction.savepoint()
                with connection.cursor() as cursor:
                    cursor.execute(
                        'ALTER TABLE content_resource DROP CONSTRAINT resource_payload_matches_type'
                    )
                resource = Resource.objects.create(
                    lesson=self.lesson,
                    type='document',
                    title='Document without file',
                    file=None,
                    last_modified_by=self.publisher,
                )
                response = self.anonymous_client.get(self.retrieve_url(resource))
                body = assert_envelope(self, response, 'not_found', 404)

                nonexistent_response = self.anonymous_client.get(
                    reverse('resource-retrieve', args=[uuid.uuid4()])
                )
                nonexistent_body = assert_envelope(self, nonexistent_response, 'not_found', 404)
                self.assertEqual(body, nonexistent_body)

                transaction.savepoint_rollback(sid)
        else:
            resource = Resource.objects.create(
                lesson=self.lesson,
                type='document',
                title='Document without file',
                file=None,
                last_modified_by=self.publisher,
            )
            response = self.anonymous_client.get(self.retrieve_url(resource))
            body = assert_envelope(self, response, 'not_found', 404)

            nonexistent_response = self.anonymous_client.get(
                reverse('resource-retrieve', args=[uuid.uuid4()])
            )
            nonexistent_body = assert_envelope(self, nonexistent_response, 'not_found', 404)
            self.assertEqual(body, nonexistent_body)


class PublicResourceThrottlingTests(PublicResourceTestCase):
    """AC-3: Anonymous rate limiting yielding 429 Too Many Requests with Retry-After header."""

    def setUp(self):
        super().setUp()
        original_rates = AnonRateThrottle.THROTTLE_RATES
        self.addCleanup(setattr, AnonRateThrottle, 'THROTTLE_RATES', original_rates)
        AnonRateThrottle.THROTTLE_RATES = {**original_rates, 'anon': '2/minute'}
        cache.clear()
        self.addCleanup(cache.clear)

    def test_throttle_classes_are_explicitly_declared_on_view(self):
        self.assertEqual(
            ResourceRetrievalView.throttle_classes,
            [AnonRateThrottle, UserRateThrottle],
        )

    @override_settings(BRAINX_PUBLIC_BROWSING=True)
    def test_anonymous_rate_limiting_exceeded_returns_429_with_retry_after(self):
        resource = self.file_resource()
        url = self.retrieve_url(resource)

        # First request allowed
        first_resp = self.anonymous_client.get(url)
        self.assertEqual(first_resp.status_code, 200)

        # Second request allowed (limit is 2/minute)
        second_resp = self.anonymous_client.get(url)
        self.assertEqual(second_resp.status_code, 200)

        # Third request exceeds limit and gets throttled
        throttled_resp = self.anonymous_client.get(url)
        body = assert_envelope(self, throttled_resp, 'throttled', 429)
        self.assertEqual(body['errors'], {})
        self.assertIn('Retry-After', throttled_resp)
        self.assertGreaterEqual(int(throttled_resp['Retry-After']), 1)

    @override_settings(BRAINX_PUBLIC_BROWSING=True)
    def test_authenticated_user_not_affected_by_anonymous_throttle_bucket(self):
        resource = self.file_resource()
        url = self.retrieve_url(resource)

        # Exhaust the anon throttle
        self.anonymous_client.get(url)
        self.anonymous_client.get(url)
        throttled_anon = self.anonymous_client.get(url)
        self.assertEqual(throttled_anon.status_code, 429)

        # Authenticated verified user makes requests and is not blocked by anon throttle
        verified_resp = self.verified_client.get(url)
        self.assertEqual(verified_resp.status_code, 200)


class PublicResourceReversibilityTests(PublicResourceTestCase):
    """AC-4: Strict reversibility to 401/403 when BRAINX_PUBLIC_BROWSING=False."""

    @override_settings(BRAINX_PUBLIC_BROWSING=False)
    def test_anonymous_caller_rejected_with_401_when_browsing_disabled(self):
        resource = self.file_resource()

        response = self.anonymous_client.get(self.retrieve_url(resource))

        assert_envelope(self, response, 'unauthenticated', 401)

    @override_settings(BRAINX_PUBLIC_BROWSING=False)
    def test_unverified_student_rejected_with_403_when_browsing_disabled(self):
        resource = self.file_resource()

        response = self.student_client.get(self.retrieve_url(resource))

        assert_envelope(self, response, 'permission_denied', 403)

    @override_settings(BRAINX_PUBLIC_BROWSING=False)
    def test_verified_student_allowed_with_200_when_browsing_disabled(self):
        resource = self.file_resource()

        response = self.verified_client.get(self.retrieve_url(resource))

        self.assertEqual(response.status_code, 200)
        body = response.json()
        self.assertIn('url', body)
        self.assertEqual(body['content_type'], 'application/pdf')
        self.assertEqual(body['disposition'], 'inline')
