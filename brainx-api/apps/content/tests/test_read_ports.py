"""The two named read ports and the Publisher listing (Story 2.6, AD-2).

The ports are pinned by behaviour (`visible()` hides soft-deleted rows,
`manageable()` keeps them) and structurally (exactly those two, plus
`with_deleted()` as `manageable()`'s sub-case, so no third port can appear).
The four collection routes are checked as the Publisher surface, guarded and
page-number paginated; the Student/unknown caller and unknown parent cases
answer the project envelope. The AD-2 Student property test is Epic 5's, since
no Student-facing endpoint exists until then.
"""

import ast
import uuid
from datetime import date
from pathlib import Path

from django.conf import settings
from django.test import SimpleTestCase
from django.urls import reverse
from drf_spectacular.generators import SchemaGenerator
from rest_framework.pagination import PageNumberPagination
from rest_framework.settings import api_settings

from .. import models
from ..models import Chapter, ContentQuerySet, Course, Lesson, Module
from .helpers import assert_envelope
from .test_create_endpoints import ContentEndpointTestCase


class ReadPortTestCase(ContentEndpointTestCase):
    """The shared tree plus one live and one soft-deleted row per level."""

    def setUp(self):
        super().setUp()
        # The base fixture gives a live Course, Module and Chapter; add the
        # soft-deleted counterpart for each level and both Lesson states, so
        # every port comparison has a deleted row to find.
        self.deleted_course = Course.objects.create(
            name='Removed course',
            subject='X',
            position=2,
            is_deleted=True,
            last_modified_by=self.publisher,
        )
        self.deleted_module = Module.objects.create(
            course=self.course,
            name='Removed module',
            position=2,
            is_deleted=True,
            last_modified_by=self.publisher,
        )
        self.deleted_chapter = Chapter.objects.create(
            module=self.module,
            name='Removed chapter',
            position=2,
            is_deleted=True,
            last_modified_by=self.publisher,
        )
        self.live_lesson = Lesson.objects.create(
            chapter=self.chapter,
            title='Live',
            teacher='Ms Ada',
            course_date=date(2026, 9, 1),
            position=1,
            last_modified_by=self.publisher,
        )
        self.deleted_lesson = Lesson.objects.create(
            chapter=self.chapter,
            title='Removed',
            teacher='Ms Ada',
            course_date=date(2026, 9, 2),
            position=2,
            is_deleted=True,
            last_modified_by=self.publisher,
        )

    def listing_specs(self):
        """Each listing route with its level and its parent-scoped rows."""
        return (
            (reverse('course-create'), Course, Course.objects.all()),
            (
                reverse('module-create', args=[self.course.pk]),
                Module,
                Module.objects.filter(course=self.course),
            ),
            (
                reverse('chapter-create', args=[self.module.pk]),
                Chapter,
                Chapter.objects.filter(module=self.module),
            ),
            (
                reverse('lesson-create', args=[self.chapter.pk]),
                Lesson,
                Lesson.objects.filter(chapter=self.chapter),
            ),
        )

    def listing_urls(self):
        """The four collection routes, each answering a Publisher listing."""
        return tuple(url for url, _, _ in self.listing_specs())


class PortSemanticsTests(ReadPortTestCase):
    """`visible()` hides soft-deleted rows; `manageable()` keeps them."""

    def test_visible_excludes_the_soft_deleted_row_at_every_level(self):
        for model in (Course, Module, Chapter, Lesson):
            with self.subTest(model=model.__name__):
                self.assertFalse(
                    model.objects.visible().filter(is_deleted=True).exists()
                )

    def test_manageable_includes_the_soft_deleted_row_at_every_level(self):
        for model in (Course, Module, Chapter, Lesson):
            with self.subTest(model=model.__name__):
                self.assertTrue(
                    model.objects.manageable().filter(is_deleted=True).exists()
                )

    def test_manageable_selects_every_row(self):
        for model in (Course, Module, Chapter, Lesson):
            with self.subTest(model=model.__name__):
                self.assertEqual(
                    model.objects.manageable().count(),
                    model.objects.count(),
                )

    def test_with_deleted_is_manageable_s_filtered_subcase(self):
        for model in (Course, Module, Chapter, Lesson):
            with self.subTest(model=model.__name__):
                self.assertEqual(
                    set(
                        model.objects.with_deleted().values_list(
                            'pk', flat=True
                        )
                    ),
                    set(
                        model.objects.manageable()
                        .filter(is_deleted=True)
                        .values_list('pk', flat=True)
                    ),
                )

    def test_the_live_lesson_is_visible_and_the_deleted_one_is_not(self):
        titles = set(Lesson.objects.visible().values_list('title', flat=True))
        self.assertIn('Live', titles)
        self.assertNotIn('Removed', titles)


class TwoPortsGuardTests(SimpleTestCase):
    """AD-2's "exactly two named ports, no third" is structure, not habit."""

    def public_selectors(self):
        tree = ast.parse(Path(models.__file__).read_text(encoding='utf-8'))
        queryset = next(
            node
            for node in tree.body
            if isinstance(node, ast.ClassDef)
            and node.name == 'ContentQuerySet'
        )
        return {
            node.name
            for node in queryset.body
            if isinstance(node, ast.FunctionDef)
            and not node.name.startswith('_')
        }

    def test_only_the_two_ports_and_their_subcase_are_defined(self):
        # The two ports are `visible` and `manageable`; `with_deleted` is
        # `manageable`'s sub-case, not a third port. Any other public selector
        # would be a port the architecture forbids.
        self.assertEqual(
            self.public_selectors(),
            {'visible', 'manageable', 'with_deleted'},
        )

    def test_every_level_exposes_both_ports(self):
        for model in (Course, Module, Chapter, Lesson):
            with self.subTest(model=model.__name__):
                self.assertIsInstance(model.objects.all(), ContentQuerySet)
                for selector in ('visible', 'manageable', 'with_deleted'):
                    self.assertTrue(hasattr(model.objects, selector))

    def test_no_live_helper_exists(self):
        self.assertFalse(hasattr(ContentQuerySet, 'live'))


class PublisherListingTests(ReadPortTestCase):
    """The listing reads through `manageable()`, so it shows hidden rows."""

    def test_a_publisher_lists_every_level(self):
        for url, model, scoped in self.listing_specs():
            with self.subTest(model=model.__name__):
                response = self.publisher_client.get(url)

                self.assertEqual(response.status_code, 200)
                body = response.json()
                self.assertEqual(
                    sorted(body), ['count', 'next', 'previous', 'results']
                )
                self.assertEqual(body['count'], scoped.count())

    def test_the_listing_includes_soft_deleted_rows(self):
        deleted_ids = (
            self.deleted_course.pk,
            self.deleted_module.pk,
            self.deleted_chapter.pk,
            self.deleted_lesson.pk,
        )
        for url, deleted_id in zip(
            self.listing_urls(), deleted_ids, strict=True
        ):
            with self.subTest(url=url):
                response = self.publisher_client.get(url)
                identifiers = {
                    row['id'] for row in response.json()['results']
                }
                self.assertIn(str(deleted_id), identifiers)

    def test_each_listing_is_scoped_to_its_parent(self):
        # A foreign Module/Chapter/Lesson under a different parent must not
        # leak into the listing: each case would pass if the filter were
        # dropped, so the assertion can actually fail.
        other_course = Course.objects.create(
            name='Other',
            subject='X',
            position=2,
            last_modified_by=self.publisher,
        )
        other_module = Module.objects.create(
            course=other_course,
            name='Elsewhere',
            position=1,
            last_modified_by=self.publisher,
        )
        other_chapter = Chapter.objects.create(
            module=other_module,
            name='Foreign chapter',
            position=1,
            last_modified_by=self.publisher,
        )
        foreign_lesson = Lesson.objects.create(
            chapter=other_chapter,
            title='Foreign lesson',
            teacher='Ms Ada',
            course_date=date(2026, 9, 3),
            position=1,
            last_modified_by=self.publisher,
        )
        cases = (
            (
                reverse('module-create', args=[self.course.pk]),
                self.module.pk,
                other_module.pk,
            ),
            (
                reverse('chapter-create', args=[self.module.pk]),
                self.chapter.pk,
                other_chapter.pk,
            ),
            (
                reverse('lesson-create', args=[self.chapter.pk]),
                self.live_lesson.pk,
                foreign_lesson.pk,
            ),
        )
        for url, local_id, foreign_id in cases:
            with self.subTest(url=url):
                body = self.publisher_client.get(url).json()
                identifiers = {row['id'] for row in body['results']}
                self.assertIn(str(local_id), identifiers)
                self.assertNotIn(str(foreign_id), identifiers)

    def test_a_soft_deleted_parent_still_lists_its_soft_deleted_children(self):
        # The parent lookup reads through `manageable()`, so a removed Course
        # is resolvable and its removed Modules are listed through the port.
        removed_module = Module.objects.create(
            course=self.deleted_course,
            name='Removed child',
            position=1,
            is_deleted=True,
            last_modified_by=self.publisher,
        )

        response = self.publisher_client.get(
            reverse('module-create', args=[self.deleted_course.pk])
        )

        self.assertEqual(response.status_code, 200)
        identifiers = {row['id'] for row in response.json()['results']}
        self.assertIn(str(removed_module.pk), identifiers)


class ListingAuthorizationTests(ReadPortTestCase):
    """A Student is 403 and an anonymous caller 401, on every collection."""

    def test_a_student_cannot_list_any_level(self):
        for url in self.listing_urls():
            with self.subTest(url=url):
                response = self.student_client.get(url)
                assert_envelope(self, response, 'permission_denied', 403)

    def test_an_anonymous_caller_cannot_list_any_level(self):
        for url in self.listing_urls():
            with self.subTest(url=url):
                response = self.anonymous_client.get(url)
                assert_envelope(self, response, 'unauthenticated', 401)

    def test_an_unknown_parent_is_a_404(self):
        for name in ('module-create', 'chapter-create', 'lesson-create'):
            with self.subTest(name=name):
                response = self.publisher_client.get(
                    reverse(name, args=[uuid.uuid4()])
                )
                assert_envelope(self, response, 'not_found', 404)


class PaginationConfigTests(SimpleTestCase):
    """Page-number pagination, fixed at 20, with no `page_size` parameter."""

    def test_the_default_is_page_number_pagination(self):
        self.assertIs(
            api_settings.DEFAULT_PAGINATION_CLASS, PageNumberPagination
        )

    def test_the_configured_paginator_is_fixed_at_twenty(self):
        paginator = api_settings.DEFAULT_PAGINATION_CLASS()
        self.assertEqual(paginator.page_size, 20)
        self.assertEqual(paginator.page_size, api_settings.PAGE_SIZE)
        self.assertIsNone(paginator.page_size_query_param)


class PaginationBehaviourTests(ReadPortTestCase):
    def fill_each_collection_to_twenty_one(self):
        """Give every collection 21 rows so page 2 holds exactly one."""
        for position in range(3, 22):
            Course.objects.create(
                name=f'Course {position}',
                subject='X',
                position=position,
                last_modified_by=self.publisher,
            )
            Module.objects.create(
                course=self.course,
                name=f'Module {position}',
                position=position,
                last_modified_by=self.publisher,
            )
            Chapter.objects.create(
                module=self.module,
                name=f'Chapter {position}',
                position=position,
                last_modified_by=self.publisher,
            )
            Lesson.objects.create(
                chapter=self.chapter,
                title=f'Lesson {position}',
                teacher='Ms Ada',
                course_date=date(2026, 9, position),
                position=position,
                last_modified_by=self.publisher,
            )

    def test_a_page_holds_twenty_and_the_next_page_holds_the_rest(self):
        self.fill_each_collection_to_twenty_one()

        for url, model, scoped in self.listing_specs():
            with self.subTest(model=model.__name__):
                total = scoped.count()
                self.assertGreater(total, 20)

                first = self.publisher_client.get(url).json()
                self.assertEqual(first['count'], total)
                self.assertEqual(len(first['results']), 20)
                self.assertIsNotNone(first['next'])
                first_ids = {row['id'] for row in first['results']}

                second = self.publisher_client.get(url, {'page': 2}).json()
                self.assertEqual(len(second['results']), total - 20)
                self.assertIsNone(second['next'])
                second_ids = {row['id'] for row in second['results']}

                # The two pages must be disjoint and together cover the set,
                # so a duplicated or dropped row across the boundary fails.
                self.assertFalse(first_ids & second_ids)
                self.assertEqual(len(first_ids | second_ids), total)

    def test_a_page_size_parameter_cannot_change_the_page(self):
        # More rows than one page, so ignoring `page_size` (fixed at 20) is
        # distinguishable from pagination being absent altogether.
        for position in range(3, 26):
            Course.objects.create(
                name=f'Course {position}',
                subject='X',
                position=position,
                last_modified_by=self.publisher,
            )
        response = self.publisher_client.get(
            self.listing_urls()[0], {'page_size': 1}
        )
        self.assertEqual(len(response.json()['results']), 20)
        self.assertGreater(Course.objects.count(), 20)

    def test_an_invalid_page_is_a_not_found_envelope(self):
        for bad_page in ('0', '999', 'abc'):
            for url in self.listing_urls():
                with self.subTest(page=bad_page, url=url):
                    response = self.publisher_client.get(
                        url, {'page': bad_page}
                    )
                    assert_envelope(self, response, 'not_found', 404)


class RoutingAndSchemaTests(ReadPortTestCase):
    def test_every_listing_route_lives_under_the_api_prefix(self):
        for url in self.listing_urls():
            with self.subTest(url=url):
                self.assertTrue(url.startswith(settings.API_PREFIX + '/'))

    def test_the_schema_documents_a_paginated_get_on_each_listing(self):
        prefix = settings.API_PREFIX
        schema = SchemaGenerator().get_schema(request=None, public=True)
        paths = schema['paths']
        for path, component in (
            (f'{prefix}/courses/', 'PaginatedCourseList'),
            (
                f'{prefix}/courses/{{course_id}}/modules/',
                'PaginatedModuleList',
            ),
            (
                f'{prefix}/modules/{{module_id}}/chapters/',
                'PaginatedChapterList',
            ),
            (
                f'{prefix}/chapters/{{chapter_id}}/lessons/',
                'PaginatedLessonList',
            ),
        ):
            with self.subTest(path=path):
                self.assertIn(path, paths)
                get = paths[path]['get']
                self.assertEqual(
                    get['responses']['200']['content']['application/json'][
                        'schema'
                    ]['$ref'],
                    f'#/components/schemas/{component}',
                )
                self.assertIn('post', paths[path])
