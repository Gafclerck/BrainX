"""Integration tests for dynamic public unauthenticated browsing (Story 1.1).

Verifies the 6 student browsing views, the public system config endpoint,
and the strict protection of publisher mutation endpoints under both
`BRAINX_PUBLIC_BROWSING=True` and `BRAINX_PUBLIC_BROWSING=False`.
"""

import uuid
from datetime import date
from django.core.files.uploadedfile import SimpleUploadedFile
from django.test import override_settings
from django.urls import reverse

from apps.content.models import Lesson, Resource
from .helpers import assert_envelope
from .test_create_endpoints import ContentEndpointTestCase


class PublicBrowsingIntegrationTestCase(ContentEndpointTestCase):
    """Test suite exercising the 6 browsing views and write guards under both flag settings."""

    def setUp(self):
        super().setUp()
        self.lesson_1 = Lesson.objects.create(
            chapter=self.chapter,
            title='Lesson 1: Introduction',
            teacher='Prof. Alpha',
            course_date=date(2026, 11, 1),
            description='First published lesson',
            position=1,
            is_published=True,
            is_deleted=False,
            last_modified_by=self.publisher,
        )
        self.lesson_2 = Lesson.objects.create(
            chapter=self.chapter,
            title='Lesson 2: Advanced Topics',
            teacher='Prof. Beta',
            course_date=date(2026, 11, 2),
            description='Second published lesson',
            position=2,
            is_published=True,
            is_deleted=False,
            last_modified_by=self.publisher,
        )
        self.resource = Resource.objects.create(
            lesson=self.lesson_1,
            type=Resource.Type.DOCUMENT,
            title='Course Syllabus PDF',
            file=SimpleUploadedFile('syllabus.pdf', b'%PDF-1.4 test content', content_type='application/pdf'),
            last_modified_by=self.publisher,
        )


class PublicBrowsingEnabledTests(PublicBrowsingIntegrationTestCase):
    """AC-1 & AC-4: Unauthenticated browse access when BRAINX_PUBLIC_BROWSING is True."""

    @override_settings(BRAINX_PUBLIC_BROWSING=True)
    def test_anonymous_can_browse_courses(self):
        url = reverse('browse-course-list')
        response = self.anonymous_client.get(url)
        self.assertEqual(response.status_code, 200)
        data = response.json()
        self.assertIn('results', data)
        self.assertEqual(len(data['results']), 1)
        self.assertEqual(data['results'][0]['id'], str(self.course.id))
        self.assertEqual(data['results'][0]['name'], self.course.name)

    @override_settings(BRAINX_PUBLIC_BROWSING=True)
    def test_anonymous_can_browse_modules(self):
        url = reverse('browse-module-list', args=[self.course.id])
        response = self.anonymous_client.get(url)
        self.assertEqual(response.status_code, 200)
        data = response.json()
        self.assertEqual(len(data['results']), 1)
        self.assertEqual(data['results'][0]['id'], str(self.module.id))
        self.assertEqual(data['results'][0]['name'], self.module.name)

    @override_settings(BRAINX_PUBLIC_BROWSING=True)
    def test_anonymous_can_browse_chapters(self):
        url = reverse('browse-chapter-list', args=[self.module.id])
        response = self.anonymous_client.get(url)
        self.assertEqual(response.status_code, 200)
        data = response.json()
        self.assertEqual(len(data['results']), 1)
        self.assertEqual(data['results'][0]['id'], str(self.chapter.id))
        self.assertEqual(data['results'][0]['name'], self.chapter.name)

    @override_settings(BRAINX_PUBLIC_BROWSING=True)
    def test_anonymous_can_browse_lessons(self):
        url = reverse('browse-lesson-list', args=[self.chapter.id])
        response = self.anonymous_client.get(url)
        self.assertEqual(response.status_code, 200)
        data = response.json()
        self.assertEqual(len(data['results']), 2)
        # Lessons are ordered by -course_date, then container positions, position, id
        self.assertEqual(data['results'][0]['id'], str(self.lesson_2.id))
        self.assertEqual(data['results'][1]['id'], str(self.lesson_1.id))

    @override_settings(BRAINX_PUBLIC_BROWSING=True)
    def test_anonymous_can_retrieve_lesson_detail(self):
        url = reverse('browse-lesson-detail', args=[self.lesson_1.id])
        response = self.anonymous_client.get(url)
        self.assertEqual(response.status_code, 200)
        data = response.json()
        self.assertEqual(data['id'], str(self.lesson_1.id))
        self.assertEqual(data['title'], self.lesson_1.title)
        self.assertEqual(len(data['resources']), 1)
        self.assertEqual(data['resources'][0]['title'], 'Course Syllabus PDF')

    @override_settings(BRAINX_PUBLIC_BROWSING=True)
    def test_anonymous_lesson_detail_with_search_session_header_ignored_gracefully(self):
        url = reverse('browse-lesson-detail', args=[self.lesson_1.id])
        session_id = str(uuid.uuid4())
        response = self.anonymous_client.get(url, HTTP_X_SEARCH_SESSION_ID=session_id)
        self.assertEqual(response.status_code, 200)
        data = response.json()
        self.assertEqual(data['id'], str(self.lesson_1.id))

    @override_settings(BRAINX_PUBLIC_BROWSING=True)
    def test_anonymous_can_retrieve_lesson_navigation(self):
        url = reverse('browse-lesson-navigation', args=[self.lesson_1.id])
        response = self.anonymous_client.get(url)
        self.assertEqual(response.status_code, 200)
        data = response.json()
        self.assertEqual(data['current_lesson_id'], str(self.lesson_1.id))
        self.assertIsNone(data['previous_lesson'])
        self.assertIsNotNone(data['next_lesson'])
        self.assertEqual(data['next_lesson']['id'], str(self.lesson_2.id))

    @override_settings(BRAINX_PUBLIC_BROWSING=True)
    def test_authenticated_student_can_browse_when_flag_enabled(self):
        url = reverse('browse-course-list')
        response = self.student_client.get(url)
        self.assertEqual(response.status_code, 200)
        self.assertEqual(len(response.json()['results']), 1)

    @override_settings(BRAINX_PUBLIC_BROWSING=True)
    def test_system_config_endpoint_reports_true(self):
        url = reverse('core:config')
        response = self.anonymous_client.get(url)
        self.assertEqual(response.status_code, 200)
        self.assertEqual(response.json(), {'public_browsing': True})


class PublicBrowsingDisabledTests(PublicBrowsingIntegrationTestCase):
    """AC-2 & AC-4: Unauthenticated browse access rejected with RFC 9457 401 when flag is False."""

    @override_settings(BRAINX_PUBLIC_BROWSING=False)
    def test_anonymous_rejected_on_browse_courses(self):
        url = reverse('browse-course-list')
        response = self.anonymous_client.get(url)
        assert_envelope(self, response, 'unauthenticated', 401)

    @override_settings(BRAINX_PUBLIC_BROWSING=False)
    def test_anonymous_rejected_on_browse_modules(self):
        url = reverse('browse-module-list', args=[self.course.id])
        response = self.anonymous_client.get(url)
        assert_envelope(self, response, 'unauthenticated', 401)

    @override_settings(BRAINX_PUBLIC_BROWSING=False)
    def test_anonymous_rejected_on_browse_chapters(self):
        url = reverse('browse-chapter-list', args=[self.module.id])
        response = self.anonymous_client.get(url)
        assert_envelope(self, response, 'unauthenticated', 401)

    @override_settings(BRAINX_PUBLIC_BROWSING=False)
    def test_anonymous_rejected_on_browse_lessons(self):
        url = reverse('browse-lesson-list', args=[self.chapter.id])
        response = self.anonymous_client.get(url)
        assert_envelope(self, response, 'unauthenticated', 401)

    @override_settings(BRAINX_PUBLIC_BROWSING=False)
    def test_anonymous_rejected_on_lesson_detail(self):
        url = reverse('browse-lesson-detail', args=[self.lesson_1.id])
        response = self.anonymous_client.get(url)
        assert_envelope(self, response, 'unauthenticated', 401)

    @override_settings(BRAINX_PUBLIC_BROWSING=False)
    def test_anonymous_rejected_on_lesson_navigation(self):
        url = reverse('browse-lesson-navigation', args=[self.lesson_1.id])
        response = self.anonymous_client.get(url)
        assert_envelope(self, response, 'unauthenticated', 401)

    @override_settings(BRAINX_PUBLIC_BROWSING=False)
    def test_authenticated_student_can_browse_when_flag_disabled(self):
        # Authenticated student still has full read access when flag is False
        url = reverse('browse-course-list')
        response = self.student_client.get(url)
        self.assertEqual(response.status_code, 200)

        detail_url = reverse('browse-lesson-detail', args=[self.lesson_1.id])
        detail_response = self.student_client.get(detail_url)
        self.assertEqual(detail_response.status_code, 200)

    @override_settings(BRAINX_PUBLIC_BROWSING=False)
    def test_system_config_endpoint_reports_false(self):
        url = reverse('core:config')
        response = self.anonymous_client.get(url)
        self.assertEqual(response.status_code, 200)
        self.assertEqual(response.json(), {'public_browsing': False})


class PublisherMutationProtectionTests(PublicBrowsingIntegrationTestCase):
    """AC-3: Content mutations strictly reject anonymous (401) and student (403) regardless of flag."""

    def _test_write_rejections(self):
        # Course creation
        course_url = reverse('course-create')
        course_payload = {'name': 'New Course', 'subject': 'Physics', 'position': 2}
        res_anon = self.anonymous_client.post(course_url, course_payload, format='json')
        assert_envelope(self, res_anon, 'unauthenticated', 401)
        res_student = self.student_client.post(course_url, course_payload, format='json')
        assert_envelope(self, res_student, 'permission_denied', 403)

        # Module creation
        module_url = reverse('module-create', args=[self.course.id])
        module_payload = {'name': 'New Module', 'position': 2}
        res_anon = self.anonymous_client.post(module_url, module_payload, format='json')
        assert_envelope(self, res_anon, 'unauthenticated', 401)
        res_student = self.student_client.post(module_url, module_payload, format='json')
        assert_envelope(self, res_student, 'permission_denied', 403)

        # Chapter creation
        chapter_url = reverse('chapter-create', args=[self.module.id])
        chapter_payload = {'name': 'New Chapter', 'position': 2}
        res_anon = self.anonymous_client.post(chapter_url, chapter_payload, format='json')
        assert_envelope(self, res_anon, 'unauthenticated', 401)
        res_student = self.student_client.post(chapter_url, chapter_payload, format='json')
        assert_envelope(self, res_student, 'permission_denied', 403)

        # Lesson creation
        lesson_url = reverse('lesson-create', args=[self.chapter.id])
        lesson_payload = {
            'title': 'New Lesson',
            'teacher': 'Prof. Write',
            'course_date': '2026-11-05',
        }
        res_anon = self.anonymous_client.post(lesson_url, lesson_payload, format='json')
        assert_envelope(self, res_anon, 'unauthenticated', 401)
        res_student = self.student_client.post(lesson_url, lesson_payload, format='json')
        assert_envelope(self, res_student, 'permission_denied', 403)

        # Lesson publish
        publish_url = reverse('lesson-publish', args=[self.lesson_1.id])
        res_anon = self.anonymous_client.post(publish_url)
        assert_envelope(self, res_anon, 'unauthenticated', 401)
        res_student = self.student_client.post(publish_url)
        assert_envelope(self, res_student, 'permission_denied', 403)

        # Lesson unpublish
        unpublish_url = reverse('lesson-unpublish', args=[self.lesson_1.id])
        res_anon = self.anonymous_client.post(unpublish_url)
        assert_envelope(self, res_anon, 'unauthenticated', 401)
        res_student = self.student_client.post(unpublish_url)
        assert_envelope(self, res_student, 'permission_denied', 403)

    @override_settings(BRAINX_PUBLIC_BROWSING=True)
    def test_write_endpoints_protected_when_public_browsing_true(self):
        self._test_write_rejections()

    @override_settings(BRAINX_PUBLIC_BROWSING=False)
    def test_write_endpoints_protected_when_public_browsing_false(self):
        self._test_write_rejections()
