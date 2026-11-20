"""Tests for Chapter and Module bulk unpublish endpoints."""

import uuid
from datetime import date
from django.urls import reverse

from ..models import Chapter, Lesson
from .test_create_endpoints import ContentEndpointTestCase, client_for


class BulkUnpublishTestCase(ContentEndpointTestCase):
    def setUp(self):
        super().setUp()
        self.chapter2 = Chapter.objects.create(
            module=self.module,
            name='Chapter 2',
            position=2,
            last_modified_by=self.publisher,
        )

    def make_lesson(self, chapter, position, is_published=True, **overrides):
        defaults = {
            'chapter': chapter,
            'title': f'Lesson {position}',
            'teacher': 'Teacher',
            'course_date': date(2026, 1, 1),
            'description': 'Description',
            'keywords': 'java, test',
            'position': position,
            'is_published': is_published,
            'last_modified_by': self.publisher,
        }
        defaults.update(overrides)
        return Lesson.objects.create(**defaults)

    def test_chapter_bulk_unpublish_unpublishes_all_published_lessons(self):
        l1 = self.make_lesson(self.chapter, 1, is_published=True)
        l2 = self.make_lesson(self.chapter, 2, is_published=True)
        l3 = self.make_lesson(self.chapter, 3, is_published=False)
        # Lesson in another chapter should not be affected
        l_other = self.make_lesson(self.chapter2, 1, is_published=True)

        client = client_for(self.publisher)
        url = reverse('chapter-bulk-unpublish', kwargs={'chapter_id': self.chapter.id})
        response = client.post(url)

        self.assertEqual(response.status_code, 200)
        self.assertEqual(response.data, {'changed': 2})

        l1.refresh_from_db()
        l2.refresh_from_db()
        l3.refresh_from_db()
        l_other.refresh_from_db()

        self.assertFalse(l1.is_published)
        self.assertFalse(l2.is_published)
        self.assertFalse(l3.is_published)
        self.assertTrue(l_other.is_published)

    def test_module_bulk_unpublish_unpublishes_across_all_chapters(self):
        l1 = self.make_lesson(self.chapter, 1, is_published=True)
        l2 = self.make_lesson(self.chapter2, 1, is_published=True)
        l3 = self.make_lesson(self.chapter2, 2, is_published=False)

        client = client_for(self.publisher)
        url = reverse('module-bulk-unpublish', kwargs={'module_id': self.module.id})
        response = client.post(url)

        self.assertEqual(response.status_code, 200)
        self.assertEqual(response.data, {'changed': 2})

        l1.refresh_from_db()
        l2.refresh_from_db()
        l3.refresh_from_db()

        self.assertFalse(l1.is_published)
        self.assertFalse(l2.is_published)
        self.assertFalse(l3.is_published)

    def test_bulk_unpublish_requires_publisher(self):
        client = client_for(self.student)
        url = reverse('chapter-bulk-unpublish', kwargs={'chapter_id': self.chapter.id})
        response = client.post(url)
        self.assertEqual(response.status_code, 403)

    def test_bulk_unpublish_nonexistent_returns_404(self):
        client = client_for(self.publisher)
        url = reverse('chapter-bulk-unpublish', kwargs={'chapter_id': uuid.uuid4()})
        response = client.post(url)
        self.assertEqual(response.status_code, 404)
