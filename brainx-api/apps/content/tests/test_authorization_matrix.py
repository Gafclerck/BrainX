"""Declarative security matrix verifying 401/403 authorization gates across publisher endpoints.

Story 3.4 (Epic 3):
- AC-1 (Suite déclarative): PublisherEndpointSecurityMatrixTests verifies in matrix form:
    1. Unauthenticated requests (no token) -> 401 unauthenticated envelope
    2. Student requests (non-publisher token) -> 403 permission_denied envelope
    3. Invalid/expired token requests -> 401 unauthenticated envelope
- Covers all write/mutation routes across Courses, Modules, Chapters, Lessons, and Resources.
"""

from datetime import date
from django.urls import reverse
from rest_framework.test import APIClient

from apps.content.models import Lesson, Resource
from .helpers import assert_envelope
from .test_create_endpoints import ContentEndpointTestCase, LESSON_PAYLOAD


class PublisherEndpointSecurityMatrixTests(ContentEndpointTestCase):
    """Declarative authorization matrix exercising every publisher mutation route."""

    @classmethod
    def setUpTestData(cls):
        super().setUpTestData()
        cls.lesson = Lesson.objects.create(
            chapter=cls.chapter,
            title='Sample Lesson',
            teacher='Ms Ada',
            course_date=date(2026, 9, 1),
            position=1,
            is_published=True,
            last_modified_by=cls.publisher,
        )
        cls.resource = Resource.objects.create(
            lesson=cls.lesson,
            type='video',
            title='Sample Video',
            url='https://videos.example.com/sample',
            last_modified_by=cls.publisher,
        )

    def setUp(self):
        super().setUp()
        self.bad_token_client = APIClient()
        self.bad_token_client.credentials(
            HTTP_AUTHORIZATION='Bearer invalid-or-expired-jwt-token'
        )

    def mutation_targets(self):
        """Matrix of (method, url, payload) across all publisher mutation endpoints."""
        return [
            # Courses
            ('post', reverse('course-create'), {'name': 'C', 'subject': 'S', 'position': 2}),
            ('patch', reverse('course-update', args=[self.course.id]), {'name': 'C2'}),
            ('delete', reverse('course-update', args=[self.course.id]), {}),
            ('get', reverse('course-removal-preview', args=[self.course.id]), {}),
            ('post', reverse('course-restore', args=[self.course.id]), {}),
            ('post', reverse('module-reorder', args=[self.course.id]), {'order': [str(self.module.id)]}),
            # Modules
            ('post', reverse('module-create', args=[self.course.id]), {'name': 'M', 'position': 2}),
            ('patch', reverse('module-update', args=[self.module.id]), {'name': 'M2'}),
            ('delete', reverse('module-update', args=[self.module.id]), {}),
            ('get', reverse('module-removal-preview', args=[self.module.id]), {}),
            ('post', reverse('module-restore', args=[self.module.id]), {}),
            ('post', reverse('chapter-reorder', args=[self.module.id]), {'order': [str(self.chapter.id)]}),
            ('get', reverse('module-bulk-publish-preview', args=[self.module.id]), {}),
            ('post', reverse('module-bulk-publish', args=[self.module.id]), {}),
            # Chapters
            ('post', reverse('chapter-create', args=[self.module.id]), {'name': 'Ch', 'position': 2}),
            ('patch', reverse('chapter-update', args=[self.chapter.id]), {'name': 'Ch2'}),
            ('delete', reverse('chapter-update', args=[self.chapter.id]), {}),
            ('get', reverse('chapter-removal-preview', args=[self.chapter.id]), {}),
            ('post', reverse('chapter-restore', args=[self.chapter.id]), {}),
            ('post', reverse('lesson-reorder', args=[self.chapter.id]), {'order': [str(self.lesson.id)]}),
            ('get', reverse('chapter-bulk-publish-preview', args=[self.chapter.id]), {}),
            ('post', reverse('chapter-bulk-publish', args=[self.chapter.id]), {}),
            # Lessons
            ('post', reverse('lesson-create', args=[self.chapter.id]), LESSON_PAYLOAD),
            ('patch', reverse('lesson-update', args=[self.lesson.id]), {'title': 'L2'}),
            ('delete', reverse('lesson-update', args=[self.lesson.id]), {}),
            ('get', reverse('lesson-removal-preview', args=[self.lesson.id]), {}),
            ('post', reverse('lesson-restore', args=[self.lesson.id]), {}),
            ('post', reverse('lesson-publish', args=[self.lesson.id]), {}),
            ('post', reverse('lesson-unpublish', args=[self.lesson.id]), {}),
            ('post', reverse('lesson-move', args=[self.lesson.id]), {'chapter_id': str(self.chapter.id)}),
            # Resources
            ('post', reverse('resource-create', args=[self.lesson.id]), {'type': 'video', 'title': 'V', 'url': 'https://v.com'}),
            ('patch', reverse('resource-update', args=[self.resource.id]), {'title': 'V2'}),
            ('delete', reverse('resource-update', args=[self.resource.id]), {}),
            ('post', reverse('resource-restore', args=[self.resource.id]), {}),
        ]

    def test_anonymous_requests_receive_401_unauthenticated(self):
        for method, url, payload in self.mutation_targets():
            with self.subTest(method=method, url=url):
                res = getattr(self.anonymous_client, method)(url, payload, format='json')
                assert_envelope(self, res, 'unauthenticated', 401)

    def test_student_requests_receive_403_permission_denied(self):
        for method, url, payload in self.mutation_targets():
            with self.subTest(method=method, url=url):
                res = getattr(self.student_client, method)(url, payload, format='json')
                assert_envelope(self, res, 'permission_denied', 403)

    def test_invalid_token_requests_receive_401_unauthenticated(self):
        for method, url, payload in self.mutation_targets():
            with self.subTest(method=method, url=url):
                res = getattr(self.bad_token_client, method)(url, payload, format='json')
                assert_envelope(self, res, 'unauthenticated', 401)
