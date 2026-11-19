"""Tests for the seed_symfony_course management command."""

import io
from django.core.management import call_command
from django.test import TestCase

from apps.content.models import Chapter, Course, Lesson, Module, Resource
from apps.users.models import User


class SeedSymfonyCourseCommandTests(TestCase):
    """Prove the seed_symfony_course management command creates the complete tree."""

    def setUp(self):
        self.publisher = User.objects.create_user(
            email='publisher@example.com',
            password='TestPassword123!',
            is_publisher=True,
            is_email_verified=True,
        )

    def test_seed_creates_complete_course_tree(self):
        out = io.StringIO()
        call_command('seed_symfony_course', email=self.publisher.email, stdout=out)

        course = Course.objects.get(name='Symfony', is_deleted=False)
        self.assertEqual(course.subject, 'Génie Logiciel')
        self.assertEqual(course.last_modified_by, self.publisher)

        modules = list(course.modules.all())
        self.assertEqual(len(modules), 3)

        lessons = list(Lesson.objects.filter(chapter__module__course=course))
        self.assertEqual(len(lessons), 5)

        for lesson in lessons:
            self.assertEqual(lesson.teacher, 'Baila Wane')
            self.assertTrue(lesson.is_published)
            self.assertTrue(lesson.description)
            self.assertTrue(lesson.keywords)
            self.assertTrue(lesson.search_document)
            self.assertIn(lesson.title, lesson.search_document)

        resources = list(Resource.objects.filter(lesson__in=lessons))
        self.assertEqual(len(resources), 8)
        for res in resources:
            self.assertTrue(res.url.startswith('https://'))

    def test_seed_is_idempotent(self):
        call_command('seed_symfony_course', email=self.publisher.email)
        self.assertEqual(Lesson.objects.count(), 5)

        # Run a second time without --reset
        call_command('seed_symfony_course', email=self.publisher.email)
        self.assertEqual(Lesson.objects.count(), 5)
        self.assertEqual(Course.objects.filter(name='Symfony').count(), 1)

    def test_seed_reset_flag(self):
        call_command('seed_symfony_course', email=self.publisher.email)
        first_course_id = Course.objects.get(name='Symfony').id

        # Run with --reset
        call_command('seed_symfony_course', email=self.publisher.email, reset=True)
        new_course = Course.objects.get(name='Symfony')
        self.assertNotEqual(new_course.id, first_course_id)
        self.assertEqual(Lesson.objects.filter(chapter__module__course=new_course).count(), 5)

    def test_seed_unpublish_flag(self):
        call_command('seed_symfony_course', email=self.publisher.email, unpublish=True, reset=True)
        lessons = Lesson.objects.all()
        self.assertEqual(lessons.count(), 5)
        for lesson in lessons:
            self.assertFalse(lesson.is_published)
