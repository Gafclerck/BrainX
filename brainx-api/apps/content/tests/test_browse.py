"""The Student browse surface: four per-level listings (Story 5.2).

Browse is the Student port by construction. The three container listings read
through `visible_content()`, the one named container-visibility predicate, and
the lesson listing resolves its parent through it before reading its own rows
through `Lesson.objects.visible()`. Either way a container with no visible
descendant Lesson is hidden from its parent recursively and is never reachable
by its own id. These tests pin the whole
I/O matrix: recursive hiding at each level, unpublished and soft-deleted
invisibility, the byte-identical hidden/nonexistent 404, the five-key 401
envelope, fixed-20 pagination, the shared total order, the flat five-field
Lesson row, stable ids across repeated reads, a bounded query count, and a
source guard that no browse view filters the visibility flags locally.
"""

import ast
import uuid
from datetime import date
from pathlib import Path

from django.conf import settings
from django.test import SimpleTestCase
from django.urls import reverse
from drf_spectacular.generators import SchemaGenerator
from rest_framework.test import APIClient

from .. import views, visibility
from ..models import Chapter, Course, Lesson, Module
from ..ordering import order_containers, order_lessons
from ..serializers import LessonContextSerializer
from .helpers import assert_envelope
from .test_create_endpoints import ContentEndpointTestCase


class BrowseTestCase(ContentEndpointTestCase):
    """The shared tree with one visible Lesson, plus builders for the rest."""

    def setUp(self):
        super().setUp()
        # The base fixture stops at the Chapter; a published Lesson is what
        # makes the Chapter, and so the whole tree above it, visible.
        self.lesson = self.make_lesson(self.chapter, position=1)
        self.bad_token_client = APIClient()
        self.bad_token_client.credentials(
            HTTP_AUTHORIZATION='Bearer not-a-real-token'
        )

    def make_lesson(
        self,
        chapter,
        *,
        title='A lesson',
        position=1,
        is_published=True,
        is_deleted=False,
        course_date=date(2026, 9, 1),
    ):
        return Lesson.objects.create(
            chapter=chapter,
            title=title,
            teacher='Ms Ada',
            course_date=course_date,
            position=position,
            is_published=is_published,
            is_deleted=is_deleted,
            last_modified_by=self.publisher,
        )

    def make_chapter(
        self, module, *, name='Chapter', position=1, is_deleted=False
    ):
        return Chapter.objects.create(
            module=module,
            name=name,
            position=position,
            is_deleted=is_deleted,
            last_modified_by=self.publisher,
        )

    def make_module(
        self, course, *, name='Module', position=1, is_deleted=False
    ):
        return Module.objects.create(
            course=course,
            name=name,
            position=position,
            is_deleted=is_deleted,
            last_modified_by=self.publisher,
        )

    def make_course(self, *, name='Course', position=1, is_deleted=False):
        return Course.objects.create(
            name=name,
            subject='X',
            position=position,
            is_deleted=is_deleted,
            last_modified_by=self.publisher,
        )

    def hidden_tree(self):
        """A Course whose only Lesson is unpublished, so nothing shows."""
        course = self.make_course(name='Hidden', position=2)
        module = self.make_module(course)
        chapter = self.make_chapter(module)
        self.make_lesson(chapter, title='Hidden', is_published=False)
        return course, module, chapter

    def course_url(self):
        return reverse('browse-course-list')

    def module_url(self, course=None):
        return reverse('browse-module-list', args=[(course or self.course).pk])

    def chapter_url(self, module=None):
        return reverse(
            'browse-chapter-list', args=[(module or self.module).pk]
        )

    def lesson_url(self, chapter=None):
        return reverse(
            'browse-lesson-list', args=[(chapter or self.chapter).pk]
        )

    def ids(self, response):
        return [row['id'] for row in response.json()['results']]


class CourseListTests(BrowseTestCase):
    """COURSE_LIST: only Courses holding a visible Lesson, as `{id, name}`."""

    def test_only_courses_with_a_visible_lesson_are_listed(self):
        self.make_course(name='Empty', position=2)
        hidden, _, _ = self.hidden_tree()

        response = self.student_client.get(self.course_url())

        self.assertEqual(response.status_code, 200)
        self.assertEqual(self.ids(response), [str(self.course.pk)])
        self.assertNotIn(str(hidden.pk), self.ids(response))

    def test_rows_carry_only_id_and_name(self):
        row = self.student_client.get(self.course_url()).json()['results'][0]

        self.assertEqual(set(row), {'id', 'name'})
        self.assertEqual(row['id'], str(self.course.pk))
        self.assertEqual(row['name'], 'Maths')

    def test_an_empty_course_is_hidden(self):
        self.make_course(name='Empty', position=2)

        response = self.student_client.get(self.course_url())

        self.assertEqual(len(self.ids(response)), 1)

    def test_the_publisher_sees_the_same_published_tree(self):
        # Browse is the Student port by construction: an authenticated
        # Publisher is allowed, but still sees nothing hidden.
        self.hidden_tree()

        for url in (
            self.course_url(),
            self.module_url(),
            self.chapter_url(),
            self.lesson_url(),
        ):
            with self.subTest(url=url):
                student = self.student_client.get(url).json()
                publisher = self.publisher_client.get(url).json()

                self.assertEqual(student, publisher)


class CrossParentScopingTests(BrowseTestCase):
    """Each sub-list is scoped to the parent in the URL, and only it."""

    def test_modules_are_scoped_to_their_course(self):
        # A second visible Course-with-Module elsewhere in the tree.
        other_course = self.make_course(name='Other', position=2)
        other_module = self.make_module(other_course, name='Other module')
        other_chapter = self.make_chapter(other_module)
        self.make_lesson(other_chapter, title='Elsewhere')

        response = self.student_client.get(self.module_url())

        self.assertEqual(self.ids(response), [str(self.module.pk)])
        self.assertNotIn(str(other_module.pk), self.ids(response))

    def test_chapters_are_scoped_to_their_module(self):
        # A second visible Module-with-Chapter under the same Course.
        sibling = self.make_module(self.course, name='Sibling', position=2)
        sibling_chapter = self.make_chapter(sibling)
        self.make_lesson(sibling_chapter, title='Elsewhere')

        response = self.student_client.get(self.chapter_url())

        self.assertEqual(self.ids(response), [str(self.chapter.pk)])
        self.assertNotIn(str(sibling_chapter.pk), self.ids(response))

    def test_lessons_are_scoped_to_their_chapter(self):
        # A second visible Chapter-with-Lessons under the same Module.
        sibling = self.make_chapter(self.module, name='Sibling', position=2)
        self.make_lesson(sibling, title='Elsewhere')

        response = self.student_client.get(self.lesson_url())

        self.assertEqual(
            [row['title'] for row in response.json()['results']], ['A lesson']
        )


class RecursiveHidingTests(BrowseTestCase):
    """RECURSIVE_HIDE: an empty or entirely unpublished container is hidden."""

    def test_a_chapter_with_only_unpublished_lessons_is_hidden(self):
        hidden = self.make_chapter(self.module, name='Hidden', position=2)
        self.make_lesson(hidden, is_published=False)

        response = self.student_client.get(self.chapter_url())

        self.assertEqual(self.ids(response), [str(self.chapter.pk)])

    def test_a_module_with_no_visible_chapter_is_hidden_from_its_course(self):
        hidden = self.make_module(self.course, name='Hidden', position=2)
        chapter = self.make_chapter(hidden)
        self.make_lesson(chapter, is_published=False)

        response = self.student_client.get(self.module_url())

        self.assertEqual(self.ids(response), [str(self.module.pk)])

    def test_an_empty_module_is_hidden(self):
        empty = self.make_module(self.course, name='Empty', position=2)

        listed = self.ids(self.student_client.get(self.module_url()))

        self.assertNotIn(str(empty.pk), listed)

    def test_a_course_of_only_hidden_content_is_hidden(self):
        hidden, _, _ = self.hidden_tree()

        listed = self.ids(self.student_client.get(self.course_url()))

        self.assertNotIn(str(hidden.pk), listed)


class InvisibleLessonTests(BrowseTestCase):
    """UNPUBLISHED_OR_DELETED_LESSON: never appears at any level."""

    def test_unpublished_and_deleted_lessons_are_absent(self):
        self.make_lesson(
            self.chapter, title='Draft', position=2, is_published=False
        )
        self.make_lesson(
            self.chapter, title='Removed', position=3, is_deleted=True
        )

        response = self.student_client.get(self.lesson_url())

        self.assertEqual(
            [row['title'] for row in response.json()['results']], ['A lesson']
        )

    def test_a_course_whose_only_lesson_is_deleted_is_hidden(self):
        course = self.make_course(name='Only removed', position=2)
        module = self.make_module(course)
        chapter = self.make_chapter(module)
        self.make_lesson(chapter, is_deleted=True)

        listed = self.ids(self.student_client.get(self.course_url()))

        self.assertNotIn(str(course.pk), listed)

    def test_a_module_whose_only_lesson_is_unpublished_is_hidden(self):
        module = self.make_module(self.course, name='Hidden', position=2)
        chapter = self.make_chapter(module)
        self.make_lesson(chapter, is_published=False)

        listed = self.ids(self.student_client.get(self.module_url()))

        self.assertNotIn(str(module.pk), listed)


class HiddenParentNotFoundTests(BrowseTestCase):
    """A hidden parent is never an existence oracle: the 404 matches."""

    def test_hidden_and_missing_parents_answer_the_same_404(self):
        hidden_course, hidden_module, _ = self.hidden_tree()
        hidden_chapter_2 = self.make_chapter(
            self.module, name='Hidden 2', position=2
        )
        self.make_lesson(hidden_chapter_2, is_published=False)

        cases = (
            (
                self.module_url(hidden_course),
                reverse('browse-module-list', args=[uuid.uuid4()]),
            ),
            (
                self.chapter_url(hidden_module),
                reverse('browse-chapter-list', args=[uuid.uuid4()]),
            ),
            (
                self.lesson_url(hidden_chapter_2),
                reverse('browse-lesson-list', args=[uuid.uuid4()]),
            ),
        )
        for hidden_url, missing_url in cases:
            with self.subTest(url=hidden_url):
                hidden = self.student_client.get(hidden_url)
                missing = self.student_client.get(missing_url)

                self.assertEqual(hidden.status_code, 404)
                self.assertEqual(hidden.content, missing.content)
                assert_envelope(self, hidden, 'not_found', 404)

    def test_a_soft_deleted_container_is_hidden_and_its_route_404s(self):
        # Removal cascades in the write path, but a stale flag on a container
        # must still hide it and its live descendants from browse.
        removed_course = self.make_course(
            name='Removed', position=2, is_deleted=True
        )
        course_module = self.make_module(removed_course)
        course_chapter = self.make_chapter(course_module)
        self.make_lesson(course_chapter)

        removed_module = self.make_module(
            self.course, name='Removed module', position=2, is_deleted=True
        )
        module_chapter = self.make_chapter(removed_module)
        self.make_lesson(module_chapter)

        removed_chapter = self.make_chapter(
            self.module, name='Removed chapter', position=2, is_deleted=True
        )
        self.make_lesson(removed_chapter)

        self.assertNotIn(
            str(removed_course.pk),
            self.ids(self.student_client.get(self.course_url())),
        )
        assert_envelope(
            self, self.student_client.get(self.module_url(removed_course)),
            'not_found', 404,
        )
        assert_envelope(
            self, self.student_client.get(self.chapter_url(removed_module)),
            'not_found', 404,
        )
        assert_envelope(
            self, self.student_client.get(self.lesson_url(removed_chapter)),
            'not_found', 404,
        )
        # A live descendant under a hidden ancestor is unreachable too: the
        # live Module under the soft-deleted Course, and the live Chapter under
        # the soft-deleted Module, 404 like a nonexistent id.
        assert_envelope(
            self, self.student_client.get(self.chapter_url(course_module)),
            'not_found', 404,
        )
        assert_envelope(
            self, self.student_client.get(self.lesson_url(module_chapter)),
            'not_found', 404,
        )


class BrowseAuthorizationTests(BrowseTestCase):
    """401 for anonymous and bad-token callers; a Student is permitted."""

    def all_urls(self):
        return (
            self.course_url(),
            self.module_url(),
            self.chapter_url(),
            self.lesson_url(),
        )

    def test_an_anonymous_caller_is_a_401_envelope(self):
        for url in self.all_urls():
            with self.subTest(url=url):
                assert_envelope(
                    self, self.anonymous_client.get(url),
                    'unauthenticated', 401,
                )

    def test_a_bad_token_is_a_401_envelope(self):
        for url in self.all_urls():
            with self.subTest(url=url):
                assert_envelope(
                    self, self.bad_token_client.get(url),
                    'unauthenticated', 401,
                )

    def test_a_student_may_read_every_level(self):
        for url in self.all_urls():
            with self.subTest(url=url):
                self.assertEqual(self.student_client.get(url).status_code, 200)


class BrowsePaginationTests(BrowseTestCase):
    """PAGINATION: fixed at 20, disjoint and stable, `page_size` ignored."""

    def fill_courses(self, count):
        for position in range(2, count + 2):
            course = self.make_course(
                name=f'Course {position}', position=position
            )
            module = self.make_module(course)
            chapter = self.make_chapter(module)
            self.make_lesson(chapter, title=f'Lesson {position}')

    def test_pages_are_fixed_at_twenty_and_disjoint(self):
        self.fill_courses(22)  # 23 visible Courses in total.

        first = self.student_client.get(self.course_url()).json()
        second = self.student_client.get(
            self.course_url(), {'page': 2}
        ).json()

        self.assertEqual(first['count'], 23)
        self.assertEqual(len(first['results']), 20)
        self.assertIsNotNone(first['next'])
        self.assertEqual(len(second['results']), 3)
        self.assertIsNone(second['next'])

        first_ids = {row['id'] for row in first['results']}
        second_ids = {row['id'] for row in second['results']}
        self.assertFalse(first_ids & second_ids)
        self.assertEqual(len(first_ids | second_ids), 23)

    def test_a_page_size_parameter_is_ignored(self):
        self.fill_courses(22)

        sized = self.student_client.get(self.course_url(), {'page_size': 1})

        self.assertEqual(len(sized.json()['results']), 20)

    def test_an_invalid_page_is_a_not_found_envelope(self):
        for bad_page in ('0', '999', 'abc'):
            with self.subTest(page=bad_page):
                assert_envelope(
                    self, self.student_client.get(
                        self.course_url(), {'page': bad_page}
                    ),
                    'not_found', 404,
                )

    def fill_lessons(self, count):
        for position in range(2, count + 2):
            self.make_lesson(
                self.chapter, title=f'Lesson {position}', position=position
            )

    def test_a_lesson_page_size_parameter_is_ignored(self):
        self.fill_lessons(21)  # self.lesson plus 21 = 22 visible Lessons.

        response = self.student_client.get(self.lesson_url(), {'page_size': 1})

        self.assertEqual(len(response.json()['results']), 20)

    def test_a_lesson_invalid_page_is_a_not_found_envelope(self):
        for bad_page in ('0', '999', 'abc'):
            with self.subTest(page=bad_page):
                assert_envelope(
                    self, self.student_client.get(
                        self.lesson_url(), {'page': bad_page}
                    ),
                    'not_found', 404,
                )


class BrowseOrderTests(BrowseTestCase):
    """AD-7: the listing uses the shared total order, `id` last."""

    def visible_course(self, name, position):
        course = self.make_course(name=name, position=position)
        module = self.make_module(course)
        chapter = self.make_chapter(module)
        self.make_lesson(chapter, title=name)
        return course

    def test_courses_follow_the_container_order(self):
        later = self.visible_course('Later', 3)
        earlier = self.visible_course('Earlier', 2)
        expected = [
            str(course.pk)
            for course in order_containers(
                Course.objects.visible().filter(
                    pk__in=[self.course.pk, earlier.pk, later.pk]
                )
            )
        ]

        got = self.ids(self.student_client.get(self.course_url()))

        self.assertEqual(got, expected)
        self.assertEqual(
            got, [str(self.course.pk), str(earlier.pk), str(later.pk)]
        )

    def test_modules_follow_the_container_order(self):
        later = self.make_module(self.course, name='Later', position=3)
        self.make_lesson(self.make_chapter(later), title='Later lesson')
        earlier = self.make_module(self.course, name='Earlier', position=2)
        self.make_lesson(self.make_chapter(earlier), title='Earlier lesson')
        expected = [
            str(module.pk)
            for module in order_containers(
                Module.objects.visible().filter(
                    pk__in=[self.module.pk, earlier.pk, later.pk]
                )
            )
        ]

        got = self.ids(self.student_client.get(self.module_url()))

        self.assertEqual(got, expected)
        self.assertEqual(
            got, [str(self.module.pk), str(earlier.pk), str(later.pk)]
        )

    def test_chapters_follow_the_container_order(self):
        later = self.make_chapter(self.module, name='Later', position=3)
        self.make_lesson(later, title='Later lesson')
        earlier = self.make_chapter(self.module, name='Earlier', position=2)
        self.make_lesson(earlier, title='Earlier lesson')
        expected = [
            str(chapter.pk)
            for chapter in order_containers(
                Chapter.objects.visible().filter(
                    pk__in=[self.chapter.pk, earlier.pk, later.pk]
                )
            )
        ]

        got = self.ids(self.student_client.get(self.chapter_url()))

        self.assertEqual(got, expected)
        self.assertEqual(
            got, [str(self.chapter.pk), str(earlier.pk), str(later.pk)]
        )

    def test_lessons_follow_the_total_order(self):
        self.make_lesson(
            self.chapter, title='Older', position=2,
            course_date=date(2026, 9, 1),
        )
        self.make_lesson(
            self.chapter, title='Newer', position=3,
            course_date=date(2026, 9, 10),
        )
        expected = [
            str(lesson.pk)
            for lesson in order_lessons(
                Lesson.objects.visible().filter(chapter=self.chapter)
            )
        ]

        response = self.student_client.get(self.lesson_url())

        self.assertEqual(self.ids(response), expected)
        self.assertEqual(
            [row['title'] for row in response.json()['results']],
            ['Newer', 'A lesson', 'Older'],
        )


class BrowseLessonShapeTests(BrowseTestCase):
    """A Lesson row is `{id, title}` plus the five flat context fields."""

    def test_a_lesson_row_is_id_title_and_the_five_flat_fields(self):
        row = self.student_client.get(self.lesson_url()).json()['results'][0]

        self.assertEqual(
            set(row),
            {
                'id',
                'title',
                'course_name',
                'module_name',
                'chapter_name',
                'teacher',
                'course_date',
            },
        )
        # The five context fields come from the single 5.1 serializer, flat.
        self.assertEqual(
            set(row) - {'id', 'title'},
            set(LessonContextSerializer().fields),
        )
        self.assertEqual(row['id'], str(self.lesson.pk))
        self.assertEqual(row['title'], 'A lesson')
        self.assertEqual(row['course_name'], 'Maths')
        self.assertEqual(row['module_name'], 'Module 1')
        self.assertEqual(row['chapter_name'], 'Chapter 1')
        self.assertEqual(row['teacher'], 'Ms Ada')
        self.assertEqual(row['course_date'], '2026-09-01')

    def test_the_output_carries_no_nested_object(self):
        row = self.student_client.get(self.lesson_url()).json()['results'][0]

        for value in row.values():
            self.assertNotIsInstance(value, (dict, list))


class BrowseStabilityTests(BrowseTestCase):
    """TREE_POSITION: two identical reads are byte-identical."""

    def test_two_identical_reads_are_byte_identical(self):
        urls = (
            self.course_url(),
            self.module_url(),
            self.chapter_url(),
            self.lesson_url(),
        )
        for url in urls:
            with self.subTest(url=url):
                first = self.student_client.get(url)
                second = self.student_client.get(url)

                self.assertEqual(first.status_code, 200)
                self.assertEqual(first.content, second.content)


class BrowseQueryBoundTests(BrowseTestCase):
    """BOUNDED_QUERIES: a fixed query count regardless of row count."""

    def test_each_listing_runs_a_bounded_number_of_queries(self):
        # A wide tree, so a per-row query would be obvious in the count.
        for position in range(2, 9):
            course = self.make_course(
                name=f'Course {position}', position=position
            )
            module = self.make_module(course)
            chapter = self.make_chapter(module)
            for lesson_position in range(1, 6):
                self.make_lesson(
                    chapter,
                    title=f'L{lesson_position}',
                    position=lesson_position,
                )

        # One query loads the account from the JWT; the rest is the listing:
        # a page count and a page fetch, plus one parent lookup on a sub-list.
        cases = (
            (self.course_url(), 3),
            (self.module_url(), 4),
            (self.chapter_url(), 4),
            (self.lesson_url(), 4),
        )
        for url, expected in cases:
            with self.subTest(url=url):
                with self.assertNumQueries(expected):
                    self.student_client.get(url)

    def test_the_lesson_list_count_does_not_grow_with_rows(self):
        with self.assertNumQueries(4):
            self.student_client.get(self.lesson_url())

        for position in range(2, 12):
            self.make_lesson(
                self.chapter, title=f'L{position}', position=position
            )

        with self.assertNumQueries(4):
            self.student_client.get(self.lesson_url())


class BrowseSchemaTests(BrowseTestCase):
    """The four browse operations are documented, envelope errors and all."""

    def browse_paths(self):
        prefix = settings.API_PREFIX
        return (
            f'{prefix}/browse/courses/',
            f'{prefix}/browse/courses/{{course_id}}/modules/',
            f'{prefix}/browse/modules/{{module_id}}/chapters/',
            f'{prefix}/browse/chapters/{{chapter_id}}/lessons/',
        )

    def test_the_schema_documents_the_four_browse_operations(self):
        schema = SchemaGenerator().get_schema(request=None, public=True)
        paths = schema['paths']

        for path in self.browse_paths():
            with self.subTest(path=path):
                self.assertIn(path, paths)
                self.assertIn('get', paths[path])

    def test_each_browse_operation_declares_the_401_and_404_envelopes(self):
        schema = SchemaGenerator().get_schema(request=None, public=True)
        paths = schema['paths']

        for path in self.browse_paths():
            with self.subTest(path=path):
                responses = paths[path]['get']['responses']
                for status_code in ('401', '404'):
                    self.assertIn(status_code, responses)
                    self.assertEqual(
                        responses[status_code]['content']['application/json'][
                            'schema'
                        ]['$ref'],
                        '#/components/schemas/ContentErrorResponse',
                    )


class BrowseSourceGuardTests(SimpleTestCase):
    """No browse view filters the visibility flags itself."""

    BROWSE_VIEWS = (
        'BrowseCourseListView',
        'BrowseModuleListView',
        'BrowseChapterListView',
        'BrowseLessonListView',
    )

    def test_no_browse_view_names_the_visibility_flags(self):
        source = Path(views.__file__).read_text(encoding='utf-8')
        tree = ast.parse(source)
        classes = {
            node.name: node
            for node in tree.body
            if isinstance(node, ast.ClassDef)
        }

        for name in self.BROWSE_VIEWS:
            with self.subTest(view=name):
                text = ast.get_source_segment(source, classes[name])
                self.assertNotIn('is_published', text)
                self.assertNotIn('is_deleted', text)


class VisibilityPredicateGuardTests(SimpleTestCase):
    """The predicate is one named public function in its own module."""

    def public_functions(self):
        source = Path(visibility.__file__).read_text(encoding='utf-8')
        tree = ast.parse(source)
        return [
            node.name
            for node in tree.body
            if isinstance(node, ast.FunctionDef)
            and not node.name.startswith('_')
        ]

    def test_the_module_exposes_one_public_predicate(self):
        self.assertEqual(self.public_functions(), ['visible_content'])

    def test_the_predicate_reads_bottom_up_from_the_lesson_port(self):
        source = Path(visibility.__file__).read_text(encoding='utf-8')

        self.assertIn('Lesson.objects.visible()', source)
