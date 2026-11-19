"""The bulk-publish preview endpoints (Story 4.3, Epic 4).

A bulk publish across a Chapter or a Module is previewed before it is
committed: the Publisher sees how many descendant Lessons would actually open
and which ones are incomplete, and the dry run writes nothing. The preview and
the future commit share the single publishable rule in
`apps.content.publication`, so "would change" and "did change" cannot drift.

The candidate set is every live descendant Lesson; a Lesson already published
changes nothing, a Lesson missing required metadata is named under `blocked`,
and a removed Lesson is on the removal axis and is never touched. The commit
itself is Story 4.4.
"""

import json
import uuid
from datetime import date
from unittest import mock

from django.conf import settings
from django.test import SimpleTestCase, TestCase
from django.urls import reverse
from drf_spectacular.generators import SchemaGenerator

from ..models import Chapter, Course, Lesson, Module
from ..views import build_bulk_publish_preview
from .helpers import assert_envelope
from .test_create_endpoints import ContentEndpointTestCase


class BulkPublishPreviewTestCase(ContentEndpointTestCase):
    """The base tree plus a second Chapter, and helpers to fill both.

    Course
      Module
        Chapter 1
        Chapter 2
    """

    def setUp(self):
        super().setUp()
        self.chapter2 = Chapter.objects.create(
            module=self.module,
            name='Chapter 2',
            position=2,
            last_modified_by=self.publisher,
        )

    def make_lesson(self, chapter, position, **overrides):
        fields = {
            'chapter': chapter,
            'title': f'Lesson {position}',
            'description': 'Opening',
            'teacher': 'Ms Ada',
            'course_date': date(2026, 9, 1),
            'position': position,
            'last_modified_by': self.publisher,
        }
        fields.update(overrides)
        return Lesson.objects.create(**fields)

    def chapter_url(self, chapter=None):
        return reverse(
            'chapter-bulk-publish-preview',
            args=[(chapter or self.chapter).pk],
        )

    def module_url(self, module=None):
        return reverse(
            'module-bulk-publish-preview',
            args=[(module or self.module).pk],
        )

    def snapshot(self):
        """Every row's persisted identity, flags, stamp and timestamp."""
        return {
            model.__name__: list(
                model.objects.order_by('pk').values_list(
                    'pk',
                    'is_deleted',
                    'updated_at',
                    'last_modified_by_id',
                )
            )
            for model in (Course, Module, Chapter, Lesson)
        }

    def blocked_for(self, body, lesson):
        """The single `blocked` entry naming `lesson`, or None."""
        for item in body['blocked']:
            if item['id'] == str(lesson.pk):
                return item
        return None


class PreviewComputationTests(SimpleTestCase):
    """The rule's field order and the blocked/would_change split, as data.

    An unsaved Lesson can carry the state the I/O matrix names, including a
    missing `course_date`, which the model does not allow a saved row to hold.
    """

    def lesson(self, **overrides):
        fields = {
            'id': uuid.uuid4(),
            'title': 'Introduction',
            'description': 'Opening',
            'teacher': 'Ms Ada',
            'course_date': date(2026, 9, 1),
            'is_published': False,
        }
        fields.update(overrides)
        return Lesson(**fields)

    def test_the_missing_fields_follow_the_publishable_rule_order(self):
        incomplete = self.lesson(
            teacher='', course_date=None, is_published=True
        )

        preview = build_bulk_publish_preview([incomplete])

        self.assertEqual(preview['would_change'], 0)
        self.assertEqual(
            preview['blocked'],
            [
                {
                    'id': str(incomplete.id),
                    'missing': ['teacher', 'course_date'],
                }
            ],
        )

    def test_a_complete_draft_is_the_only_thing_counted(self):
        complete = self.lesson()

        preview = build_bulk_publish_preview([complete])

        self.assertEqual(preview, {'would_change': 1, 'blocked': []})


class ChapterPreviewTests(BulkPublishPreviewTestCase):
    def test_a_chapter_of_complete_drafts_counts_them_all(self):
        for position in (1, 2, 3):
            self.make_lesson(self.chapter, position)

        response = self.publisher_client.get(self.chapter_url())

        self.assertEqual(response.status_code, 200)
        body = response.json()
        self.assertEqual(set(body), {'would_change', 'blocked'})
        self.assertEqual(body['would_change'], 3)
        self.assertEqual(body['blocked'], [])

    def test_a_chapter_preview_names_each_incomplete_lesson(self):
        self.make_lesson(self.chapter, 1)
        self.make_lesson(self.chapter, 2)
        blocked = self.make_lesson(
            self.chapter, 3, description='', teacher=''
        )

        response = self.publisher_client.get(self.chapter_url())

        self.assertEqual(response.status_code, 200)
        body = response.json()
        self.assertEqual(body['would_change'], 2)
        self.assertEqual(len(body['blocked']), 1)
        item = body['blocked'][0]
        self.assertEqual(item['id'], str(blocked.pk))
        # The canonical rule order, not the order the fields were blanked in.
        self.assertEqual(item['missing'], ['description', 'teacher'])

    def test_a_whitespace_only_field_is_reported_missing(self):
        blocked = self.make_lesson(self.chapter, 1, title='   ')

        response = self.publisher_client.get(self.chapter_url())

        body = response.json()
        self.assertEqual(body['would_change'], 0)
        self.assertEqual(self.blocked_for(body, blocked)['missing'], ['title'])

    def test_already_published_lessons_change_nothing(self):
        published = self.make_lesson(self.chapter, 1, is_published=True)
        self.make_lesson(self.chapter, 2)

        response = self.publisher_client.get(self.chapter_url())

        body = response.json()
        self.assertEqual(body['would_change'], 1)
        self.assertEqual(body['blocked'], [])
        self.assertIsNone(self.blocked_for(body, published))

    def test_a_published_but_incomplete_lesson_is_blocked_not_counted(self):
        # The legacy `(True, )` row: published, yet missing metadata. It is a
        # failure the commit would skip, so it is blocked, not a change.
        legacy = self.make_lesson(
            self.chapter, 1, is_published=True, description='', teacher=''
        )

        response = self.publisher_client.get(self.chapter_url())

        body = response.json()
        self.assertEqual(body['would_change'], 0)
        item = self.blocked_for(body, legacy)
        self.assertIsNotNone(item)
        self.assertEqual(item['missing'], ['description', 'teacher'])

    def test_a_removed_lesson_is_in_neither_figure(self):
        complete_removed = self.make_lesson(
            self.chapter, 1, is_deleted=True
        )
        incomplete_removed = self.make_lesson(
            self.chapter, 2, is_deleted=True, description='', teacher=''
        )
        self.make_lesson(self.chapter, 3)

        response = self.publisher_client.get(self.chapter_url())

        body = response.json()
        self.assertEqual(body['would_change'], 1)
        self.assertEqual(body['blocked'], [])
        self.assertIsNone(self.blocked_for(body, complete_removed))
        self.assertIsNone(self.blocked_for(body, incomplete_removed))

    def test_an_empty_chapter_previews_zero_and_no_blocks(self):
        response = self.publisher_client.get(self.chapter_url())

        self.assertEqual(response.status_code, 200)
        self.assertEqual(
            response.json(), {'would_change': 0, 'blocked': []}
        )

    def test_the_preview_writes_nothing(self):
        self.make_lesson(self.chapter, 1)
        self.make_lesson(self.chapter, 2, description='', teacher='')
        before = self.snapshot()

        self.publisher_client.get(self.chapter_url())

        self.assertEqual(self.snapshot(), before)

    def test_the_preview_never_calls_the_write_port(self):
        self.make_lesson(self.chapter, 1)

        with mock.patch(
            'apps.content.views.mutate',
            side_effect=AssertionError('a preview must never write'),
        ) as port:
            response = self.publisher_client.get(self.chapter_url())

        self.assertEqual(response.status_code, 200)
        port.assert_not_called()

    def test_an_unknown_chapter_is_a_404(self):
        response = self.publisher_client.get(
            reverse('chapter-bulk-publish-preview', args=[uuid.uuid4()])
        )

        assert_envelope(self, response, 'not_found', 404)

    def test_a_non_uuid_segment_is_not_a_route(self):
        response = self.publisher_client.get(
            f'{settings.API_PREFIX}/chapters/not-a-uuid/'
            'bulk-publish/preview/'
        )

        assert_envelope(self, response, 'not_found', 404)


class ModulePreviewTests(BulkPublishPreviewTestCase):
    def test_a_module_preview_spans_every_chapter_beneath_it(self):
        for position in (1, 2):
            self.make_lesson(self.chapter, position)
        for position in (1, 2):
            self.make_lesson(self.chapter2, position)

        response = self.publisher_client.get(self.module_url())

        self.assertEqual(response.status_code, 200)
        body = response.json()
        self.assertEqual(body['would_change'], 4)
        self.assertEqual(body['blocked'], [])

    def test_a_module_preview_blocks_incomplete_lessons_in_any_chapter(self):
        self.make_lesson(self.chapter, 1)
        blocked = self.make_lesson(self.chapter2, 1, teacher='')

        response = self.publisher_client.get(self.module_url())

        body = response.json()
        self.assertEqual(body['would_change'], 1)
        self.assertEqual(
            self.blocked_for(body, blocked)['missing'], ['teacher']
        )

    def test_a_module_preview_ignores_lessons_of_another_module(self):
        self.make_lesson(self.chapter, 1)
        other_module = Module.objects.create(
            course=self.course,
            name='Module 2',
            position=2,
            last_modified_by=self.publisher,
        )
        other_chapter = Chapter.objects.create(
            module=other_module,
            name='Elsewhere',
            position=1,
            last_modified_by=self.publisher,
        )
        self.make_lesson(other_chapter, 1)

        response = self.publisher_client.get(self.module_url())

        self.assertEqual(response.json()['would_change'], 1)

    def test_a_module_preview_excludes_removed_lessons(self):
        self.make_lesson(self.chapter, 1)
        removed = self.make_lesson(self.chapter2, 1, is_deleted=True)

        response = self.publisher_client.get(self.module_url())

        body = response.json()
        self.assertEqual(body['would_change'], 1)
        self.assertIsNone(self.blocked_for(body, removed))

    def test_an_empty_module_previews_zero_and_no_blocks(self):
        response = self.publisher_client.get(self.module_url())

        self.assertEqual(response.status_code, 200)
        self.assertEqual(
            response.json(), {'would_change': 0, 'blocked': []}
        )

    def test_the_preview_writes_nothing(self):
        self.make_lesson(self.chapter, 1)
        self.make_lesson(self.chapter2, 1, description='')
        before = self.snapshot()

        self.publisher_client.get(self.module_url())

        self.assertEqual(self.snapshot(), before)

    def test_the_preview_never_calls_the_write_port(self):
        self.make_lesson(self.chapter, 1)

        with mock.patch(
            'apps.content.views.mutate',
            side_effect=AssertionError('a preview must never write'),
        ) as port:
            response = self.publisher_client.get(self.module_url())

        self.assertEqual(response.status_code, 200)
        port.assert_not_called()

    def test_an_unknown_module_is_a_404(self):
        response = self.publisher_client.get(
            reverse('module-bulk-publish-preview', args=[uuid.uuid4()])
        )

        assert_envelope(self, response, 'not_found', 404)

    def test_a_non_uuid_segment_is_not_a_route(self):
        response = self.publisher_client.get(
            f'{settings.API_PREFIX}/modules/not-a-uuid/'
            'bulk-publish/preview/'
        )

        assert_envelope(self, response, 'not_found', 404)


class BulkPublishPreviewAuthorizationTests(BulkPublishPreviewTestCase):
    def test_a_student_is_forbidden_from_both_previews(self):
        for url in (self.chapter_url(), self.module_url()):
            with self.subTest(url=url):
                response = self.student_client.get(url)
                assert_envelope(self, response, 'permission_denied', 403)

    def test_an_anonymous_caller_is_unauthenticated_on_both_previews(self):
        for url in (self.chapter_url(), self.module_url()):
            with self.subTest(url=url):
                response = self.anonymous_client.get(url)
                assert_envelope(self, response, 'unauthenticated', 401)


class BulkPublishPreviewRoutingAndSchemaTests(TestCase):
    def route_specs(self):
        return [
            (
                'chapter-bulk-publish-preview',
                '/api/v1/chapters/{chapter_id}/bulk-publish/preview/',
            ),
            (
                'module-bulk-publish-preview',
                '/api/v1/modules/{module_id}/bulk-publish/preview/',
            ),
        ]

    def test_every_preview_route_lives_under_the_api_prefix(self):
        for name, _ in self.route_specs():
            with self.subTest(name=name):
                url = reverse(name, args=[uuid.uuid4()])
                self.assertTrue(url.startswith(settings.API_PREFIX + '/'))

    def test_the_schema_documents_both_preview_operations(self):
        schema = SchemaGenerator().get_schema(request=None, public=True)
        paths = schema['paths']
        for _, path in self.route_specs():
            with self.subTest(path=path):
                self.assertIn(path, paths)
                operation = paths[path]['get']
                self.assertEqual(
                    operation['responses']['200']['content'][
                        'application/json'
                    ]['schema']['$ref'],
                    '#/components/schemas/BulkPublishPreview',
                )
                for status_code in ('401', '403', '404'):
                    self.assertIn(status_code, operation['responses'])

    def test_the_schema_exposes_the_preview_contract(self):
        schema = SchemaGenerator().get_schema(request=None, public=True)
        components = schema['components']['schemas']
        self.assertIn('BulkPublishPreview', components)
        self.assertIn('BulkPublishBlockedItem', components)
        preview = components['BulkPublishPreview']['properties']
        self.assertEqual(preview['would_change']['type'], 'integer')
        self.assertEqual(preview['blocked']['type'], 'array')
        self.assertIn(
            'BulkPublishBlockedItem', json.dumps(preview['blocked'])
        )
