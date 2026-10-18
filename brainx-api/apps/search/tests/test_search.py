"""The Student search surface: one endpoint over the denormalised document.

Pins the whole Story 5.4 matrix: a match on each of the five document parts,
case-insensitive partial-word matching, the row shape shared with browse,
Story 5.1's total order with the never-NULL relevance axis, the `sort=course`
one-slot substitution and its unknown-value 400, draft/deleted/hidden-ancestor
absence, the Resource bait, the `query`/`sort` 400s, the 401 envelope, fixed-20
pagination, a bounded query count, the OpenAPI references, and a source guard
that the view reads only through the content ports - plus the migration- and
database-state assertion that the functional GIN trigram index is exactly the
one this story owns. Story 5.5 adds the end-to-end invariant: a write through
the Publisher API retargets the index immediately, with no reindex step.
"""

import importlib
import tempfile
from datetime import date

from django.apps import apps as django_apps
from django.conf import settings
from django.contrib.postgres.indexes import GinIndex, OpClass
from django.contrib.postgres.search import TrigramWordSimilarity
from django.core.files.uploadedfile import SimpleUploadedFile
from django.db import connection, models
from django.db.migrations.loader import MigrationLoader
from django.db.models import FloatField, Value
from django.db.models.functions import Coalesce, Upper
from django.test import SimpleTestCase, TestCase, override_settings
from django.urls import reverse
from drf_spectacular.generators import SchemaGenerator

from apps.content.models import Lesson, Resource
from apps.content.ordering import order_lessons
from apps.content.tests.helpers import assert_envelope, class_sources
from apps.content.tests.test_browse import BrowseTestCase
from apps.content.tests.test_create_endpoints import ContentEndpointTestCase

from .. import views

MIGRATION = importlib.import_module(
    'apps.content.migrations.0005_lesson_search_document'
)


def compose_search_document(lesson):
    """The document composition Story 5.4 pins, byte for byte.

    Delegates to the live method on `Lesson`, so this stamping helper and
    Story 5.5's rebuild can never disagree; the independent copy of
    migration 0005's composition is pinned in
    `apps.content.tests.test_search_document`.
    """
    return lesson.compose_search_document()


class SearchTestCase(BrowseTestCase):
    """The browse fixture (a visible tree) plus indexed Lessons and clients."""

    def setUp(self):
        super().setUp()
        self.url = reverse('search-lessons')

    def make_searchable_lesson(
        self,
        chapter,
        *,
        title,
        position=1,
        course_date=date(2026, 9, 1),
        description='',
        keywords='',
        **kwargs,
    ):
        """A Lesson carrying its document, stamped like the 0005 backfill.

        The row is built with the ORM rather than the write port, so a test
        plants the exact bytes it needs - including an unindexed row, which
        the base fixture's own Lesson also is. Since Story 5.5 the write path
        composes the document itself; this helper bypasses it on purpose.
        """
        lesson = self.make_lesson(
            chapter,
            title=title,
            position=position,
            course_date=course_date,
            **kwargs,
        )
        lesson.description = description
        lesson.keywords = keywords
        Lesson.objects.filter(pk=lesson.pk).update(
            description=description,
            keywords=keywords,
            search_document=compose_search_document(lesson),
        )
        return lesson

    def search(self, **params):
        return self.student_client.get(self.url, params)


class SearchMatchingTests(SearchTestCase):
    """What matches, what is rejected, and what is never returned."""

    def test_a_title_match_returns_the_identifying_row(self):
        lesson = self.make_searchable_lesson(
            self.chapter, title='Sorting algorithms', position=2
        )

        response = self.search(query='algorithms')

        self.assertEqual(response.status_code, 200)
        body = response.json()
        self.assertEqual(body['count'], 1)
        row = body['results'][0]
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
        self.assertEqual(row['id'], str(lesson.pk))
        self.assertEqual(row['title'], 'Sorting algorithms')
        self.assertEqual(row['course_name'], 'Maths')
        self.assertEqual(row['module_name'], 'Module 1')
        self.assertEqual(row['chapter_name'], 'Chapter 1')
        self.assertEqual(row['teacher'], 'Ms Ada')
        self.assertEqual(row['course_date'], '2026-09-01')

    def test_the_row_is_byte_identical_to_the_browse_row(self):
        # Shape parity with browse: the same serializer, the same values.
        lesson = self.make_searchable_lesson(
            self.chapter, title='Sorting algorithms', position=2
        )

        search_row = self.search(query='algorithms').json()['results'][0]
        browse_rows = self.student_client.get(
            reverse('browse-lesson-list', args=[self.chapter.pk])
        ).json()['results']

        self.assertEqual(
            search_row,
            next(row for row in browse_rows if row['id'] == str(lesson.pk)),
        )

    def test_each_of_the_five_document_parts_matches(self):
        title_match = self.make_searchable_lesson(
            self.chapter, title='Violin scales', position=2
        )
        description_match = self.make_searchable_lesson(
            self.chapter, title='Cello piece', position=3,
            description='All about the cello',
        )
        keyword_match = self.make_searchable_lesson(
            self.chapter, title='Rhythm drill', position=4,
            keywords='drum, rhythm, beats',
        )
        guitar_module = self.make_module(
            self.course, name='Guitar module', position=2
        )
        guitar_chapter = self.make_chapter(guitar_module, name='Strumming')
        module_match = self.make_searchable_lesson(
            guitar_chapter, title='Chords'
        )
        keys_module = self.make_module(self.course, name='Keys', position=3)
        keys_chapter = self.make_chapter(
            keys_module, name='Xylophone chapter'
        )
        chapter_match = self.make_searchable_lesson(
            keys_chapter, title='Struck keys'
        )

        cases = (
            ('title', 'violin', title_match),
            ('description', 'cello', description_match),
            ('keywords', 'drum', keyword_match),
            ('module name', 'guitar', module_match),
            ('chapter name', 'xylophone', chapter_match),
        )
        for part, query, expected in cases:
            with self.subTest(part=part):
                response = self.search(query=query)

                self.assertEqual(response.status_code, 200)
                self.assertEqual(
                    self.ids(response), [str(expected.pk)],
                    f'a match on the {part} alone must return the Lesson',
                )

    def test_matching_is_case_insensitive_on_both_sides(self):
        lesson = self.make_searchable_lesson(
            self.chapter, title='quicksort algorithms', position=2
        )

        for query in ('algorithms', 'ALGORITHMS', 'Algorithms'):
            with self.subTest(query=query):
                self.assertEqual(
                    self.ids(self.search(query=query)), [str(lesson.pk)]
                )

    def test_matching_is_a_partial_word(self):
        lesson = self.make_searchable_lesson(
            self.chapter, title='Algorithms and data structures', position=2
        )

        for query in ('algorithm', 'Algorith', 'rithms'):
            with self.subTest(query=query):
                self.assertEqual(
                    self.ids(self.search(query=query)), [str(lesson.pk)]
                )

    def test_an_empty_or_whitespace_query_returns_no_results(self):
        self.make_searchable_lesson(
            self.chapter, title='Sorting algorithms', position=2
        )

        for query in ('', '   ', '\t '):
            with self.subTest(query=query):
                response = self.search(query=query)

                self.assertEqual(response.status_code, 200)
                body = response.json()
                self.assertEqual(body['count'], 0)
                self.assertEqual(body['results'], [])

    def test_a_short_query_is_a_400_naming_query(self):
        # `" al "` trims to two characters and is rejected like `ab`.
        for query in ('ab', ' al ', '  x ', 'éé'):
            with self.subTest(query=query):
                body = assert_envelope(
                    self, self.search(query=query), 'validation_error', 400
                )

                self.assertIn('query', body['errors'])

    def test_a_missing_query_is_a_400_naming_query(self):
        body = assert_envelope(
            self, self.student_client.get(self.url), 'validation_error', 400
        )

        self.assertIn('query', body['errors'])

    def test_a_nul_byte_in_the_query_is_a_400_naming_query(self):
        # PostgreSQL raises a DataError on NUL bytes in text parameters,
        # which would escape as a raw 500 instead of the envelope.
        for query in ('\x00', 'ab\x00cd', 'lecture\x00'):
            with self.subTest(query=query):
                body = assert_envelope(
                    self, self.search(query=query), 'validation_error', 400
                )

                self.assertIn('query', body['errors'])

    def test_a_draft_or_soft_deleted_lesson_is_never_returned(self):
        self.make_searchable_lesson(
            self.chapter, title='Algorithms draft', position=2,
            is_published=False,
        )
        self.make_searchable_lesson(
            self.chapter, title='Algorithms removed', position=3,
            is_deleted=True,
        )

        response = self.search(query='algorithms')

        self.assertEqual(response.status_code, 200)
        self.assertEqual(response.json()['results'], [])

    def test_a_live_lesson_under_a_removed_ancestor_is_never_returned(self):
        removed_chapter = self.make_chapter(
            self.module, name='Removed chapter', position=2, is_deleted=True
        )
        removed_module = self.make_module(
            self.course, name='Removed module', position=3, is_deleted=True
        )
        removed_module_chapter = self.make_chapter(removed_module)
        removed_course = self.make_course(
            name='Removed course', position=2, is_deleted=True
        )
        removed_course_module = self.make_module(removed_course)
        removed_course_chapter = self.make_chapter(removed_course_module)
        for chapter in (
            removed_chapter, removed_module_chapter, removed_course_chapter
        ):
            self.make_searchable_lesson(chapter, title='Algorithms hidden')

        response = self.search(query='algorithms')

        self.assertEqual(response.status_code, 200)
        self.assertEqual(response.json()['results'], [])


class SearchResourceBaitTests(SearchTestCase):
    """A term that exists only inside a Resource never reaches its Lesson."""

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

    def test_a_resource_term_never_returns_its_lesson(self):
        lesson = self.make_searchable_lesson(
            self.chapter, title='Pie charts', position=2,
            description='Reading charts',
        )
        Resource.objects.create(
            lesson=lesson,
            type='document',
            title='Secret sauce deck',
            file=SimpleUploadedFile('secret-sauce.pdf', b'%PDF-1.4 bait'),
            last_modified_by=self.publisher,
        )
        Resource.objects.create(
            lesson=lesson,
            type='external_link',
            title='Extra reading',
            url='https://example.com/secret-sauce',
            last_modified_by=self.publisher,
        )

        response = self.search(query='sauce')

        self.assertEqual(response.status_code, 200)
        self.assertEqual(response.json()['results'], [])


class SearchOrderTests(SearchTestCase):
    """AD-7 with one relevance axis: the date first, then the shared keys."""

    def test_the_newer_course_date_outranks_the_position_keys(self):
        # The newer Lesson sits in the second Module, so every key after the
        # date would put the older one first - only `-course_date` leads.
        newer_module = self.make_module(self.course, name='Later', position=2)
        newer_chapter = self.make_chapter(newer_module, name='Chapter')
        newer = self.make_searchable_lesson(
            newer_chapter, title='Algorithms recap',
            course_date=date(2026, 9, 10),
        )
        older = self.make_searchable_lesson(
            self.chapter, title='Algorithms', position=2,
            course_date=date(2026, 9, 1),
        )

        self.assertEqual(
            self.ids(self.search(query='algorithms')),
            [str(newer.pk), str(older.pk)],
        )

    def test_equal_relevance_falls_through_to_the_standard_keys(self):
        # Every matched row scores the same similarity - the query is a
        # substring of each - so the keys after the relevance axis decide:
        # module position, chapter position, lesson position.
        first = self.make_searchable_lesson(
            self.chapter, title='Algorithms practice', position=2
        )
        second = self.make_searchable_lesson(
            self.chapter, title='Algorithms practice', position=3
        )
        later_chapter = self.make_chapter(
            self.module, name='Second chapter', position=2
        )
        third = self.make_searchable_lesson(
            later_chapter, title='Algorithms practice'
        )

        self.assertEqual(
            self.ids(self.search(query='algorithms')),
            [str(first.pk), str(second.pk), str(third.pk)],
        )

    def test_the_order_is_the_shared_total_order_with_one_relevance_axis(self):
        # The expectation is computed through the same shared helper and the
        # same similarity expression the view builds, so the endpoint cannot
        # drift from AD-7 without this test seeing it.
        self.make_searchable_lesson(
            self.chapter, title='Algorithms', position=2,
            course_date=date(2026, 9, 1),
        )
        newer_module = self.make_module(self.course, name='Later', position=2)
        newer_chapter = self.make_chapter(newer_module, name='Chapter')
        self.make_searchable_lesson(
            newer_chapter, title='Algorithms recap',
            course_date=date(2026, 9, 10),
        )
        later_chapter = self.make_chapter(
            self.module, name='Second chapter', position=2
        )
        self.make_searchable_lesson(
            later_chapter, title='Algorithms drills',
            course_date=date(2026, 9, 1),
        )

        expected_lessons = order_lessons(
            Lesson.objects.visible()
            .filter(search_document__icontains='algorithms')
            .annotate(
                relevance=Coalesce(
                    TrigramWordSimilarity(
                        'ALGORITHMS', Upper('search_document')
                    ),
                    Value(0.0),
                    output_field=FloatField(),
                )
            ),
            relevance='relevance',
        )
        expected = [str(lesson.pk) for lesson in expected_lessons]

        self.assertEqual(len(expected), 3)
        self.assertEqual(self.ids(self.search(query='algorithms')), expected)


class SearchCourseSortTests(SearchTestCase):
    """`sort=course` re-places the order's date key with the course name."""

    def setUp(self):
        super().setUp()
        # A second Course whose matching Lesson is newer, so the two sort
        # modes disagree on which row leads.
        zebra = self.make_course(name='Zebra maths', position=2)
        zebra_module = self.make_module(zebra, name='Module 1')
        zebra_chapter = self.make_chapter(zebra_module, name='Chapter 1')
        self.z_lesson = self.make_searchable_lesson(
            zebra_chapter, title='Algorithms recaps',
            course_date=date(2026, 9, 10),
        )
        self.a_lesson = self.make_searchable_lesson(
            self.chapter, title='Algorithms intro', position=2,
            course_date=date(2026, 9, 1),
        )

    def test_the_default_order_is_the_search_total_order(self):
        expected = [str(self.z_lesson.pk), str(self.a_lesson.pk)]

        self.assertEqual(self.ids(self.search(query='algorithms')), expected)
        self.assertEqual(
            self.ids(self.search(query='algorithms', sort='date')), expected
        )

    def test_sort_by_course_puts_the_older_course_first_by_name(self):
        response = self.search(query='algorithms', sort='course')

        self.assertEqual(
            self.ids(response), [str(self.a_lesson.pk), str(self.z_lesson.pk)]
        )

    def test_sort_by_course_returns_the_same_rows(self):
        default = self.ids(self.search(query='algorithms'))
        by_course = self.ids(self.search(query='algorithms', sort='course'))

        self.assertEqual(set(default), set(by_course))

    def test_sort_by_course_keeps_the_standard_keys_inside_a_course(self):
        # All three 'Maths' rows tie on relevance (each contains the query),
        # so the shared keys after it decide inside the course group; the
        # newer 'Zebra maths' row is pushed behind them by the course name.
        weak = self.make_searchable_lesson(
            self.chapter, title='Algorithms drills', position=3
        )
        later_chapter = self.make_chapter(
            self.module, name='Second chapter', position=2
        )
        deep = self.make_searchable_lesson(
            later_chapter, title='Algorithms'
        )

        self.assertEqual(
            self.ids(self.search(query='algorithms', sort='course')),
            [
                str(self.a_lesson.pk),
                str(weak.pk),
                str(deep.pk),
                str(self.z_lesson.pk),
            ],
        )

    def test_an_unknown_sort_value_is_a_400_naming_sort(self):
        for sort in ('bywhatever', '', 'course_name'):
            with self.subTest(sort=sort):
                body = assert_envelope(
                    self,
                    self.search(query='algorithms', sort=sort),
                    'validation_error',
                    400,
                )

                self.assertIn('sort', body['errors'])


class SearchAuthorizationTests(SearchTestCase):
    """401 for anonymous and bad-token callers; the port is the whole gate."""

    def test_an_anonymous_caller_is_a_401_envelope(self):
        for params in ({'query': 'algorithms'}, {'query': ''}, {}):
            with self.subTest(params=params):
                assert_envelope(
                    self,
                    self.anonymous_client.get(self.url, params),
                    'unauthenticated',
                    401,
                )

    def test_a_bad_token_is_a_401_envelope(self):
        assert_envelope(
            self,
            self.bad_token_client.get(self.url, {'query': 'algorithms'}),
            'unauthenticated',
            401,
        )

    def test_the_publisher_sees_the_same_published_tree(self):
        self.make_searchable_lesson(
            self.chapter, title='Algorithms', position=2
        )
        self.make_searchable_lesson(
            self.chapter, title='Algorithms draft', position=3,
            is_published=False,
        )

        student = self.search(query='algorithms')
        publisher = self.publisher_client.get(
            self.url, {'query': 'algorithms'}
        )

        self.assertEqual(student.status_code, 200)
        self.assertEqual(student.content, publisher.content)


class SearchPaginationTests(SearchTestCase):
    """Fixed-20 pages, `page_size` ignored, and a bounded query count."""

    def fill(self, count):
        # The base fixture's Lesson holds position 1 and stays unindexed.
        for position in range(2, count + 2):
            self.make_searchable_lesson(
                self.chapter, title=f'Lecture {position}', position=position
            )

    def test_pages_are_fixed_at_twenty_and_disjoint(self):
        self.fill(25)

        first = self.search(query='lecture').json()
        second = self.search(query='lecture', page=2).json()

        self.assertEqual(first['count'], 25)
        self.assertEqual(len(first['results']), 20)
        self.assertIsNotNone(first['next'])
        self.assertEqual(len(second['results']), 5)
        self.assertIsNone(second['next'])
        first_ids = {row['id'] for row in first['results']}
        second_ids = {row['id'] for row in second['results']}
        self.assertFalse(first_ids & second_ids)

    def test_a_page_size_parameter_is_ignored(self):
        self.fill(25)

        sized = self.search(query='lecture', page_size=1)

        self.assertEqual(len(sized.json()['results']), 20)

    def test_the_listing_runs_a_bounded_number_of_queries(self):
        # A wide tree, so a per-row query would be obvious in the count.
        for position in range(2, 9):
            course = self.make_course(
                name=f'Course {position}', position=position
            )
            module = self.make_module(course)
            chapter = self.make_chapter(module)
            for lesson_position in range(1, 6):
                self.make_searchable_lesson(
                    chapter, title=f'Lecture {lesson_position}',
                    position=lesson_position,
                )

        # One query loads the account from the JWT; the rest is the listing:
        # a page count and a page fetch. The ancestor walk rides along as
        # subqueries of the same statements.
        with self.assertNumQueries(3):
            self.search(query='lecture')

    def test_the_empty_query_answers_in_a_fixed_number_of_queries(self):
        with self.assertNumQueries(1):
            self.search(query='')


class SearchSchemaTests(SearchTestCase):
    """The operation is documented: parameters, paginated rows, envelopes."""

    def schema(self):
        return SchemaGenerator().get_schema(request=None, public=True)

    def the_get_operation(self):
        path = f'{settings.API_PREFIX}/search/lessons/'
        schema = self.schema()

        self.assertIn(path, schema['paths'])
        return schema['paths'][path]['get']

    def test_the_schema_documents_the_search_operation(self):
        get = self.the_get_operation()

        self.assertEqual(
            get['responses']['200']['content']['application/json']['schema'][
                '$ref'
            ],
            '#/components/schemas/PaginatedBrowseLessonList',
        )

    def test_every_rejection_declares_the_shared_envelope(self):
        get = self.the_get_operation()

        for status_code in ('400', '401'):
            with self.subTest(status=status_code):
                self.assertEqual(
                    get['responses'][status_code]['content'][
                        'application/json'
                    ]['schema']['$ref'],
                    '#/components/schemas/ContentErrorResponse',
                )

    def test_the_query_and_sort_parameters_are_declared(self):
        parameters = self.the_get_operation()['parameters']
        by_name = {parameter['name']: parameter for parameter in parameters}

        self.assertIn('query', by_name)
        self.assertTrue(by_name['query']['required'])
        self.assertIn('sort', by_name)
        # drf-spectacular omits `required` entirely when it is false.
        self.assertFalse(by_name['sort'].get('required', False))


class SearchSourceGuardTests(SimpleTestCase):
    """The view reads only through the ports and never touches files."""

    def view_source(self):
        return class_sources(views, ('SearchLessonView',))['SearchLessonView']

    def test_the_view_is_pinned_to_the_ports_and_the_shared_parts(self):
        source = self.view_source()

        self.assertIn('Lesson.objects.visible()', source)
        self.assertIn('visible_content()', source)
        self.assertIn('BrowseLessonSerializer', source)
        self.assertIn('list_response', source)
        # The never-NULL relevance decision, in the view itself.
        self.assertIn('Coalesce', source)

    def test_the_view_never_names_the_visibility_flags_or_a_resource(self):
        source = self.view_source()

        for token in (
            'is_published',
            'is_deleted',
            'manageable',
            'with_deleted',
            'Resource',
            'storage',
            'delivery',
        ):
            with self.subTest(token=token):
                self.assertNotIn(token, source)


class SearchIndexTests(TestCase):
    """The functional GIN trigram index, from migration and database state."""

    def the_migration(self):
        return MigrationLoader(connection).get_migration(
            'content', '0005_lesson_search_document'
        )

    def test_the_migration_owns_the_extension_the_fields_and_the_index(self):
        operations = [
            type(operation).__name__
            for operation in self.the_migration().operations
        ]

        self.assertEqual(
            operations,
            [
                'TrigramExtension',
                'AddField',
                'AddField',
                'RunPython',
                'AddIndex',
            ],
        )

    def test_the_index_is_exactly_the_functional_upper_trigram_one(self):
        index = self.the_migration().operations[-1].index

        self.assertIsInstance(index, GinIndex)
        self.assertEqual(index.name, 'lesson_search_document_trgm')
        with connection.schema_editor() as editor:
            sql = str(index.create_sql(Lesson, editor))

        self.assertIn('USING gin', sql)
        self.assertIn('UPPER("search_document")', sql)
        self.assertIn('gin_trgm_ops', sql)

    def test_the_model_state_carries_the_same_index(self):
        indexes = [
            index
            for index in Lesson._meta.indexes
            if isinstance(index, GinIndex)
        ]

        self.assertEqual(
            [index.name for index in indexes], ['lesson_search_document_trgm']
        )
        expression = indexes[0].expressions[0]
        self.assertIsInstance(expression, OpClass)
        self.assertEqual(expression.extra['name'], 'gin_trgm_ops')
        self.assertIsInstance(
            expression.get_source_expressions()[0], Upper
        )

    def test_the_database_holds_the_functional_index_and_no_bare_one(self):
        with connection.cursor() as cursor:
            cursor.execute(
                'SELECT indexname, indexdef FROM pg_indexes '
                'WHERE tablename = %s',
                [Lesson._meta.db_table],
            )
            rows = dict(cursor.fetchall())

        self.assertIn(
            'USING gin (upper(search_document) gin_trgm_ops)',
            rows['lesson_search_document_trgm'],
        )
        # A trigram index on the bare column is a defect, not a spare.
        for name, definition in rows.items():
            if name != 'lesson_search_document_trgm':
                with self.subTest(index=name):
                    self.assertNotIn('gin_trgm_ops', definition)

    def test_the_two_fields_are_storage_only(self):
        keywords = Lesson._meta.get_field('keywords')
        document = Lesson._meta.get_field('search_document')

        self.assertIsInstance(keywords, models.TextField)
        self.assertTrue(keywords.blank)
        self.assertIsInstance(document, models.TextField)
        self.assertFalse(document.null)


class SearchBackfillTests(ContentEndpointTestCase):
    """The 0005 backfill writes the pinned composition on every row."""

    def test_the_backfill_indexes_every_lesson_byte_for_byte(self):
        rich = Lesson.objects.create(
            chapter=self.chapter, title='Algorithms',
            description='Greedy and lazy', keywords='sorting, graphs',
            teacher='Ms Ada', course_date=date(2026, 9, 1), position=1,
            last_modified_by=self.publisher,
        )
        bare = Lesson.objects.create(
            chapter=self.chapter, title='Bare', teacher='Ms Ada',
            course_date=date(2026, 9, 1), position=2,
            last_modified_by=self.publisher,
        )

        MIGRATION.backfill(django_apps, None)

        rich.refresh_from_db()
        bare.refresh_from_db()
        self.assertEqual(
            rich.search_document,
            'Algorithms\nGreedy and lazy\nsorting, graphs'
            '\nModule 1\nChapter 1',
        )
        self.assertEqual(bare.search_document, 'Bare\n\n\nModule 1\nChapter 1')


class SearchWriteRebuildEndToEndTests(SearchTestCase):
    """Story 5.5: a write through the Publisher API retargets the index.

    The invariant the story exists for - no reindex step, no second write
    path: keywords edited through the API become searchable immediately, and
    a Module rename makes the old name miss while the new one hits, both
    answered from the same denormalised document the write port maintains.
    """

    def create_published_lesson(self, chapter, **payload):
        """A visible Lesson: created through the API, then published."""
        body = {
            'title': 'Quadratic equations',
            'description': 'Parabolas and roots',
            'teacher': 'Ms Ada',
            'course_date': '2026-09-01',
            **payload,
        }
        response = self.publisher_client.post(
            reverse('lesson-create', args=[chapter.pk]), body, format='json'
        )
        self.assertEqual(response.status_code, 201)
        lesson = Lesson.objects.get(pk=response.json()['id'])
        published = self.publisher_client.post(
            reverse('lesson-publish', args=[lesson.pk])
        )
        self.assertEqual(published.status_code, 200)
        return lesson

    def test_editing_keywords_through_the_api_makes_the_new_term_findable(self):
        lesson = self.create_published_lesson(self.chapter)
        self.assertEqual(self.ids(self.search(query='revision')), [])

        response = self.publisher_client.patch(
            reverse('lesson-update', args=[lesson.pk]),
            {'keywords': 'exam revision'},
            format='json',
        )

        self.assertEqual(response.status_code, 200)
        self.assertEqual(
            self.ids(self.search(query='revision')), [str(lesson.pk)]
        )

    def test_renaming_a_module_retargets_the_matches(self):
        lesson = self.create_published_lesson(self.chapter)
        self.assertEqual(
            self.ids(self.search(query='module')), [str(lesson.pk)]
        )

        response = self.publisher_client.patch(
            reverse('module-update', args=[self.module.pk]),
            {'name': 'Geometry'},
            format='json',
        )

        self.assertEqual(response.status_code, 200)
        # The old name no longer matches any document; the new one does -
        # for the created Lesson and for the fixture's previously unindexed
        # one, which the same descendant refresh composed along the way.
        self.assertEqual(self.ids(self.search(query='module')), [])
        self.assertEqual(
            set(self.ids(self.search(query='geometry'))),
            {str(lesson.pk), str(self.lesson.pk)},
        )
