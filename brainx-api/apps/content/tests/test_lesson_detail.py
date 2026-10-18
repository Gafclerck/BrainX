"""The Student Lesson detail: one published Lesson, opened and recognised
(Story 5.3).

The detail resolves the Lesson through the Student read port, so an
unpublished or soft-deleted Lesson answers the byte-identical 404 of a
nonexistent id. The response is the Lesson's own fields plus the five context
fields from the single 5.1 serializer - identical in shape and value to the
browse row for the same Lesson - and the visible Resources in the shared
Resource order, as Student-safe rows with no audit fields and no file bytes.
These tests pin the whole I/O matrix: the flat context block, the browse-row
parity, the calendar-date rendering, the resource rows and their order, the
soft-deleted resource's absence, the byte-identical hidden/nonexistent 404,
the five-key 401 envelope, a bounded query count, and a source guard that the
detail view never filters the visibility flags itself.
"""

import uuid

from django.conf import settings
from django.test import SimpleTestCase
from django.urls import reverse
from drf_spectacular.generators import SchemaGenerator

from .. import views
from ..models import Resource
from ..serializers import LessonContextSerializer
from .helpers import assert_envelope, class_sources
from .test_browse import BrowseTestCase


class LessonDetailTestCase(BrowseTestCase):
    """The browse fixture plus the detail route and a resource builder."""

    def detail_url(self, lesson=None):
        return reverse(
            'browse-lesson-detail', args=[(lesson or self.lesson).pk]
        )

    def url_resource(self, lesson=None, **overrides):
        fields = {
            'lesson': lesson or self.lesson,
            'type': 'video',
            'title': 'Intro video',
            'url': 'https://videos.example.com/intro',
            'last_modified_by': self.publisher,
        }
        fields.update(overrides)
        return Resource.objects.create(**fields)

    def file_resource(self, lesson=None, **overrides):
        """A file-backed document; only its stored name matters to the read."""
        fields = {
            'lesson': lesson or self.lesson,
            'type': 'document',
            'title': 'Notes',
            'file': 'notes.pdf',
            'last_modified_by': self.publisher,
        }
        fields.update(overrides)
        return Resource.objects.create(**fields)


class LessonDetailShapeTests(LessonDetailTestCase):
    """The detail body is the Lesson's fields plus the five flat context
    fields plus its Resources."""

    def test_the_body_is_the_lesson_fields_the_context_and_the_resources(self):
        self.url_resource()

        response = self.student_client.get(self.detail_url())

        self.assertEqual(response.status_code, 200)
        body = response.json()
        self.assertEqual(
            set(body),
            {
                'id',
                'title',
                'description',
                'course_name',
                'module_name',
                'chapter_name',
                'teacher',
                'course_date',
                'resources',
            },
        )
        self.assertEqual(body['id'], str(self.lesson.pk))
        self.assertEqual(body['title'], 'A lesson')
        self.assertEqual(body['course_name'], 'Maths')
        self.assertEqual(body['module_name'], 'Module 1')
        self.assertEqual(body['chapter_name'], 'Chapter 1')
        self.assertEqual(body['teacher'], 'Ms Ada')

    def test_the_context_fields_match_the_browse_row_exactly(self):
        """AC2: one projection, so browse and detail cannot drift."""
        detail = self.student_client.get(self.detail_url()).json()
        row = self.student_client.get(self.lesson_url()).json()['results'][0]

        context_keys = set(LessonContextSerializer().fields)
        self.assertEqual(
            set(detail) - {'id', 'title', 'description', 'resources'},
            context_keys,
        )
        for key in context_keys:
            with self.subTest(field=key):
                self.assertEqual(detail[key], row[key])

    def test_course_date_is_the_iso_calendar_date(self):
        response = self.student_client.get(self.detail_url())

        # A DateField carries no time component, so the rendered value is the
        # calendar date itself - no TIME_ZONE conversion can apply to it.
        self.assertEqual(response.json()['course_date'], '2026-09-01')

    def test_the_publisher_sees_the_same_detail_as_the_student(self):
        # Detail is the Student port by construction: an authenticated
        # Publisher is allowed, but sees the same body, hidden rows included.
        self.url_resource()

        student = self.student_client.get(self.detail_url()).json()
        publisher = self.publisher_client.get(self.detail_url()).json()

        self.assertEqual(student, publisher)


class LessonDetailResourceTests(LessonDetailTestCase):
    """AC4: the attached material, visible and in the shared Resource order."""

    def test_resources_carry_only_the_student_safe_fields(self):
        self.url_resource(title='First')

        row = self.student_client.get(self.detail_url()).json()['resources'][0]

        self.assertEqual(
            set(row), {'id', 'type', 'title', 'note', 'url'}
        )

    def test_resources_are_ordered_by_id(self):
        first = self.url_resource(title='First')
        second = self.url_resource(title='Second')

        rows = self.student_client.get(self.detail_url()).json()['resources']

        # The order key is `id`, which is a random uuid4, so the assertion is
        # ascending-by-id rather than creation order.
        self.assertEqual(
            [row['id'] for row in rows],
            sorted([str(first.pk), str(second.pk)]),
        )

    def test_a_soft_deleted_resource_is_absent(self):
        self.url_resource(title='Kept')
        self.url_resource(title='Removed', is_deleted=True)

        rows = self.student_client.get(self.detail_url()).json()['resources']

        self.assertEqual([row['title'] for row in rows], ['Kept'])

    def test_a_video_resource_carries_its_url_and_no_file(self):
        self.url_resource(url='https://videos.example.com/intro')

        row = self.student_client.get(self.detail_url()).json()['resources'][0]

        self.assertEqual(row['url'], 'https://videos.example.com/intro')
        self.assertNotIn('file', row)

    def test_a_document_resource_carries_no_url_and_no_file(self):
        # A file-backed row is a pointer only: its bytes stay behind the
        # retrieval endpoint, so `url` is null and no storage detail leaks.
        self.file_resource(title='Notes')

        row = self.student_client.get(self.detail_url()).json()['resources'][0]

        self.assertEqual(row['type'], 'document')
        self.assertIsNone(row['url'])
        self.assertNotIn('file', row)

    def test_a_resource_note_is_returned_verbatim(self):
        self.url_resource(note='Watch before class')

        row = self.student_client.get(self.detail_url()).json()['resources'][0]

        self.assertEqual(row['note'], 'Watch before class')

    def test_repeated_reads_return_the_same_material(self):
        first = self.url_resource(title='First')
        second = self.file_resource(title='Second')

        one = self.student_client.get(self.detail_url()).json()['resources']
        two = self.student_client.get(self.detail_url()).json()['resources']

        self.assertEqual(one, two)
        self.assertEqual(
            [row['id'] for row in one],
            sorted([str(first.pk), str(second.pk)]),
        )

    def test_a_lesson_without_material_has_an_empty_list(self):
        response = self.student_client.get(self.detail_url())

        self.assertEqual(response.json()['resources'], [])


class LessonDetailVisibilityTests(LessonDetailTestCase):
    """AC5: hidden Lessons answer the byte-identical 404 of a missing id."""

    def test_hidden_and_missing_lessons_answer_the_same_404(self):
        draft = self.make_lesson(
            self.chapter, title='Draft', position=2, is_published=False
        )
        removed = self.make_lesson(
            self.chapter, title='Removed', position=3, is_deleted=True
        )
        missing_url = reverse('browse-lesson-detail', args=[uuid.uuid4()])

        for hidden in (draft, removed):
            with self.subTest(lesson=hidden.title):
                hidden_response = self.student_client.get(
                    self.detail_url(hidden)
                )
                missing_response = self.student_client.get(missing_url)

                self.assertEqual(hidden_response.status_code, 404)
                self.assertEqual(
                    hidden_response.content, missing_response.content
                )
                assert_envelope(self, hidden_response, 'not_found', 404)

    def test_a_draft_with_material_is_still_hidden(self):
        draft = self.make_lesson(
            self.chapter, title='Draft', position=2, is_published=False
        )
        self.url_resource(lesson=draft)

        response = self.student_client.get(self.detail_url(draft))

        assert_envelope(self, response, 'not_found', 404)

    def test_a_lesson_under_a_removed_chapter_is_hidden(self):
        # The write path can create a Lesson under an already-removed Chapter,
        # so the detail walks the ancestor chain: a live, published Lesson whose
        # container is hidden answers the same 404 as a nonexistent id.
        removed_chapter = self.make_chapter(
            self.module, name='Removed chapter', position=2, is_deleted=True
        )
        orphan = self.make_lesson(removed_chapter, title='Orphan')
        missing_url = reverse('browse-lesson-detail', args=[uuid.uuid4()])

        response = self.student_client.get(self.detail_url(orphan))
        missing_response = self.student_client.get(missing_url)

        self.assertEqual(response.status_code, 404)
        self.assertEqual(response.content, missing_response.content)
        assert_envelope(self, response, 'not_found', 404)


class LessonDetailAuthTests(LessonDetailTestCase):
    """401 for anonymous and bad-token callers; a Student is permitted."""

    def test_an_anonymous_caller_is_a_401_envelope(self):
        assert_envelope(
            self,
            self.anonymous_client.get(self.detail_url()),
            'unauthenticated', 401,
        )

    def test_a_bad_token_is_a_401_envelope(self):
        assert_envelope(
            self,
            self.bad_token_client.get(self.detail_url()),
            'unauthenticated', 401,
        )

    def test_a_student_is_permitted(self):
        response = self.student_client.get(self.detail_url())

        self.assertEqual(response.status_code, 200)


class LessonDetailQueryBoundTests(LessonDetailTestCase):
    """A fixed query count regardless of how much material the Lesson has."""

    def test_the_detail_runs_a_bounded_number_of_queries(self):
        with self.assertNumQueries(3):
            self.student_client.get(self.detail_url())

        # Ten more Resources must not add a query: they ride the prefetch.
        for position in range(10):
            self.url_resource(title=f'R{position}')

        with self.assertNumQueries(3):
            self.student_client.get(self.detail_url())


class LessonDetailSchemaTests(LessonDetailTestCase):
    """The detail operation is documented, envelope errors and all."""

    def detail_path(self):
        return f'{settings.API_PREFIX}/browse/lessons/{{lesson_id}}/'

    def test_the_schema_documents_the_detail_operation(self):
        schema = SchemaGenerator().get_schema(request=None, public=True)
        path = self.detail_path()

        self.assertIn(path, schema['paths'])
        self.assertIn('get', schema['paths'][path])

    def test_the_operation_declares_the_expected_responses(self):
        schema = SchemaGenerator().get_schema(request=None, public=True)
        responses = schema['paths'][self.detail_path()]['get']['responses']

        for status_code in ('401', '404'):
            self.assertIn(status_code, responses)
            self.assertEqual(
                responses[status_code]['content']['application/json'][
                    'schema'
                ]['$ref'],
                '#/components/schemas/ContentErrorResponse',
            )
        self.assertIn('200', responses)
        self.assertEqual(
            responses['200']['content']['application/json']['schema']['$ref'],
            '#/components/schemas/LessonDetail',
        )


class LessonDetailSourceGuardTests(SimpleTestCase):
    """The detail view resolves through the port, never a local flag filter."""

    def test_the_detail_view_names_no_visibility_flag(self):
        text = class_sources(views, ['LessonDetailView'])['LessonDetailView']

        self.assertNotIn('is_published', text)
        self.assertNotIn('is_deleted', text)
        self.assertIn('Lesson.objects.visible()', text)
