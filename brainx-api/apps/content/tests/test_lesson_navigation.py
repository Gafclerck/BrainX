"""Tests for the Student lesson navigation endpoint (Previous / Next).

Returns the preceding and succeeding visible lessons in the same course,
ordered by curriculum progression:
  module.position -> chapter.position -> lesson.position -> course_date -> id.
"""

import uuid
from datetime import date
from django.urls import reverse

from .test_browse import BrowseTestCase


class LessonNavigationTests(BrowseTestCase):
    """Pin previous/next navigation within a course's visible lessons."""

    def nav_url(self, lesson=None):
        return reverse(
            'browse-lesson-navigation', args=[(lesson or self.lesson).pk]
        )

    def test_single_lesson_course_has_no_previous_and_no_next(self):
        response = self.student_client.get(self.nav_url())
        self.assertEqual(response.status_code, 200)
        data = response.json()

        self.assertEqual(data['current_lesson_id'], str(self.lesson.pk))
        self.assertIsNone(data['previous_lesson'])
        self.assertIsNone(data['next_lesson'])

    def test_navigation_within_same_chapter(self):
        lesson_1 = self.lesson  # pos 1
        lesson_2 = self.make_lesson(
            self.chapter, title='Lesson 2', position=2, course_date=date(2026, 9, 2)
        )
        lesson_3 = self.make_lesson(
            self.chapter, title='Lesson 3', position=3, course_date=date(2026, 9, 3)
        )

        # 1. First lesson has no previous, points to lesson 2
        res1 = self.student_client.get(self.nav_url(lesson_1))
        self.assertEqual(res1.status_code, 200)
        d1 = res1.json()
        self.assertIsNone(d1['previous_lesson'])
        self.assertIsNotNone(d1['next_lesson'])
        self.assertEqual(d1['next_lesson']['id'], str(lesson_2.pk))
        self.assertEqual(d1['next_lesson']['title'], 'Lesson 2')
        self.assertEqual(d1['next_lesson']['chapter_name'], self.chapter.name)

        # 2. Middle lesson has both previous and next
        res2 = self.student_client.get(self.nav_url(lesson_2))
        self.assertEqual(res2.status_code, 200)
        d2 = res2.json()
        self.assertIsNotNone(d2['previous_lesson'])
        self.assertEqual(d2['previous_lesson']['id'], str(lesson_1.pk))
        self.assertEqual(d2['previous_lesson']['title'], 'A lesson')
        self.assertEqual(d2['previous_lesson']['chapter_name'], self.chapter.name)
        self.assertIsNotNone(d2['next_lesson'])
        self.assertEqual(d2['next_lesson']['id'], str(lesson_3.pk))
        self.assertEqual(d2['next_lesson']['title'], 'Lesson 3')

        # 3. Last lesson has previous, no next
        res3 = self.student_client.get(self.nav_url(lesson_3))
        self.assertEqual(res3.status_code, 200)
        d3 = res3.json()
        self.assertIsNotNone(d3['previous_lesson'])
        self.assertEqual(d3['previous_lesson']['id'], str(lesson_2.pk))
        self.assertIsNone(d3['next_lesson'])

    def test_navigation_crosses_chapter_and_module_boundaries(self):
        # Module 1 -> Chapter 1 (self.chapter) -> Lesson A (self.lesson, pos 1)
        lesson_a = self.lesson

        # Module 1 -> Chapter 2 -> Lesson B (pos 1)
        chap_2 = self.make_chapter(self.module, name='Chapter 2', position=2)
        lesson_b = self.make_lesson(chap_2, title='Lesson B', position=1)

        # Module 2 -> Chapter 3 -> Lesson C (pos 1)
        mod_2 = self.make_module(self.course, name='Module 2', position=2)
        chap_3 = self.make_chapter(mod_2, name='Chapter 3', position=1)
        lesson_c = self.make_lesson(chap_3, title='Lesson C', position=1)

        # Lesson A next is Lesson B in Chapter 2
        res_a = self.student_client.get(self.nav_url(lesson_a))
        self.assertEqual(res_a.json()['next_lesson']['id'], str(lesson_b.pk))
        self.assertEqual(res_a.json()['next_lesson']['chapter_name'], 'Chapter 2')

        # Lesson B previous is Lesson A, next is Lesson C in Module 2 / Chapter 3
        res_b = self.student_client.get(self.nav_url(lesson_b))
        self.assertEqual(res_b.json()['previous_lesson']['id'], str(lesson_a.pk))
        self.assertEqual(res_b.json()['next_lesson']['id'], str(lesson_c.pk))
        self.assertEqual(res_b.json()['next_lesson']['chapter_name'], 'Chapter 3')

        # Lesson C previous is Lesson B
        res_c = self.student_client.get(self.nav_url(lesson_c))
        self.assertEqual(res_c.json()['previous_lesson']['id'], str(lesson_b.pk))
        self.assertIsNone(res_c.json()['next_lesson'])

    def test_navigation_skips_unpublished_and_deleted_lessons(self):
        lesson_1 = self.lesson
        # Hidden intermediate lessons
        self.make_lesson(self.chapter, title='Draft', position=2, is_published=False)
        self.make_lesson(self.chapter, title='Deleted', position=3, is_deleted=True)
        lesson_4 = self.make_lesson(self.chapter, title='Lesson 4', position=4)

        res1 = self.student_client.get(self.nav_url(lesson_1))
        # Skips 2 & 3 directly to 4
        self.assertEqual(res1.json()['next_lesson']['id'], str(lesson_4.pk))
        self.assertEqual(res1.json()['next_lesson']['title'], 'Lesson 4')

        res4 = self.student_client.get(self.nav_url(lesson_4))
        self.assertEqual(res4.json()['previous_lesson']['id'], str(lesson_1.pk))

    def test_navigation_is_isolated_to_same_course(self):
        other_course = self.make_course(name='Other Course', position=2)
        other_mod = self.make_module(other_course, position=1)
        other_chap = self.make_chapter(other_mod, position=1)
        other_lesson = self.make_lesson(other_chap, title='Other Lesson', position=1)

        res = self.student_client.get(self.nav_url(self.lesson))
        self.assertIsNone(res.json()['next_lesson'])

    def test_unauthenticated_returns_401(self):
        res = self.client.get(self.nav_url())
        self.assertEqual(res.status_code, 401)

    def test_nonexistent_or_unpublished_lesson_returns_404(self):
        missing_url = reverse('browse-lesson-navigation', args=[uuid.uuid4()])
        res = self.student_client.get(missing_url)
        self.assertEqual(res.status_code, 404)

        draft = self.make_lesson(self.chapter, position=2, is_published=False)
        draft_url = self.nav_url(draft)
        res_draft = self.student_client.get(draft_url)
        self.assertEqual(res_draft.status_code, 404)
