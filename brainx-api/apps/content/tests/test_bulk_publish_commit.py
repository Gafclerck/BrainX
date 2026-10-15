"""The bulk-publish commit endpoints (Story 4.4, Epic 4).

A bulk publish is previewed by Story 4.3 and committed here: the Publisher
echoes the previewed enumeration, and the commit re-derives the candidate set
under a row lock on the addressed Chapter or Module and recomputes it before
writing anything. When the two agree every ready Lesson is published through
the write port, one row at a time; when they no longer agree nothing is written
and the answer is a 409. The response's `changed` is the count actually
written, and the incomplete candidates are the reserved `blocked` work list
nested under `errors`.
"""

import json
import uuid
from datetime import date
from unittest import mock

from django.conf import settings
from django.test import TestCase
from django.urls import reverse
from drf_spectacular.generators import SchemaGenerator

from apps.users.models import User

from .. import mutations
from ..models import Chapter, Course, Lesson, Module
from .helpers import assert_envelope
from .test_create_endpoints import (
    PASSWORD,
    ContentEndpointTestCase,
    client_for,
)


class BulkPublishCommitTestCase(ContentEndpointTestCase):
    """The base tree plus a second Chapter, and helpers to fill and commit both.

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

    def second_publisher(self):
        return User.objects.create_user(
            email='second@example.com',
            password=PASSWORD,
            is_publisher=True,
            is_email_verified=True,
        )

    def chapter_preview_url(self, chapter=None):
        return reverse(
            'chapter-bulk-publish-preview',
            args=[(chapter or self.chapter).pk],
        )

    def chapter_commit_url(self, chapter=None):
        return reverse(
            'chapter-bulk-publish',
            args=[(chapter or self.chapter).pk],
        )

    def module_preview_url(self, module=None):
        return reverse(
            'module-bulk-publish-preview',
            args=[(module or self.module).pk],
        )

    def module_commit_url(self, module=None):
        return reverse(
            'module-bulk-publish',
            args=[(module or self.module).pk],
        )

    def preview(self, url):
        """The Story 4.3 enumeration, ready to be echoed back as the body."""
        response = self.publisher_client.get(url)
        self.assertEqual(response.status_code, 200)
        return response.json()

    def commit(self, url, body, client=None):
        return (client or self.publisher_client).post(
            url, body, format='json'
        )

    def metadata_snapshot(self):
        """Every Lesson's metadata plus the flags a commit must not touch."""
        return {
            lesson.pk: (
                lesson.title,
                lesson.description,
                lesson.teacher,
                lesson.course_date,
                lesson.position,
                lesson.is_deleted,
            )
            for lesson in Lesson.objects.all()
        }

    def result_blocked_for(self, body, lesson):
        for item in body['errors']['blocked']:
            if item['id'] == str(lesson.pk):
                return item
        return None


class ChapterBulkPublishCommitTests(BulkPublishCommitTestCase):
    def test_an_all_ready_chapter_publishes_every_lesson(self):
        for position in (1, 2, 3):
            self.make_lesson(self.chapter, position)
        body = self.preview(self.chapter_preview_url())

        response = self.commit(self.chapter_commit_url(), body)

        self.assertEqual(response.status_code, 200)
        result = response.json()
        self.assertEqual(set(result), {'changed', 'errors'})
        self.assertEqual(result['changed'], 3)
        self.assertEqual(result['errors']['blocked'], [])
        self.assertFalse(Lesson.objects.filter(is_published=False).exists())

    def test_a_mixed_chapter_publishes_the_ready_and_blocks_the_incomplete(self):
        self.make_lesson(self.chapter, 1)
        self.make_lesson(self.chapter, 2)
        blocked = self.make_lesson(
            self.chapter, 3, description='', teacher=''
        )
        body = self.preview(self.chapter_preview_url())

        response = self.commit(self.chapter_commit_url(), body)

        self.assertEqual(response.status_code, 200)
        result = response.json()
        self.assertEqual(result['changed'], 2)
        item = self.result_blocked_for(result, blocked)
        # The canonical rule order, not the order the fields were blanked in.
        self.assertEqual(item['missing'], ['description', 'teacher'])
        blocked.refresh_from_db()
        self.assertFalse(blocked.is_published)
        self.assertEqual(
            Lesson.objects.filter(is_published=True).count(), 2
        )

    def test_an_empty_chapter_changes_nothing(self):
        response = self.commit(
            self.chapter_commit_url(),
            {'would_change': 0, 'blocked': []},
        )

        self.assertEqual(response.status_code, 200)
        self.assertEqual(
            response.json(), {'changed': 0, 'errors': {'blocked': []}}
        )

    def test_an_already_published_lesson_is_not_re_stamped(self):
        published = self.make_lesson(self.chapter, 1, is_published=True)
        self.make_lesson(self.chapter, 2)
        stamp = published.last_modified_by
        updated_at = published.updated_at
        body = self.preview(self.chapter_preview_url())
        second = self.second_publisher()

        response = self.commit(
            self.chapter_commit_url(), body, client=client_for(second)
        )

        self.assertEqual(response.status_code, 200)
        self.assertEqual(response.json()['changed'], 1)
        published.refresh_from_db()
        self.assertTrue(published.is_published)
        self.assertEqual(published.last_modified_by, stamp)
        self.assertEqual(published.updated_at, updated_at)

    def test_a_published_but_incomplete_lesson_is_blocked_and_untouched(self):
        legacy = self.make_lesson(
            self.chapter, 1, is_published=True, description='', teacher=''
        )
        self.make_lesson(self.chapter, 2)
        body = self.preview(self.chapter_preview_url())
        stamp = legacy.last_modified_by

        response = self.commit(self.chapter_commit_url(), body)

        self.assertEqual(response.status_code, 200)
        result = response.json()
        self.assertEqual(result['changed'], 1)
        self.assertIsNotNone(self.result_blocked_for(result, legacy))
        legacy.refresh_from_db()
        self.assertTrue(legacy.is_published)
        self.assertEqual(legacy.last_modified_by, stamp)

    def test_a_removed_lesson_is_neither_published_nor_resurrected(self):
        removed = self.make_lesson(self.chapter, 1, is_deleted=True)
        self.make_lesson(self.chapter, 2)
        body = self.preview(self.chapter_preview_url())

        response = self.commit(self.chapter_commit_url(), body)

        self.assertEqual(response.status_code, 200)
        result = response.json()
        self.assertEqual(result['changed'], 1)
        self.assertNotIn(str(removed.pk), json.dumps(result))
        removed.refresh_from_db()
        self.assertTrue(removed.is_deleted)
        self.assertFalse(removed.is_published)

    def test_a_commit_changes_no_per_lesson_metadata(self):
        self.make_lesson(self.chapter, 1)
        self.make_lesson(self.chapter, 2, description='', teacher='')
        before = self.metadata_snapshot()

        response = self.commit(
            self.chapter_commit_url(),
            self.preview(self.chapter_preview_url()),
        )

        self.assertEqual(response.status_code, 200)
        self.assertEqual(self.metadata_snapshot(), before)

    def test_each_ready_row_is_stamped_with_the_acting_publisher(self):
        self.make_lesson(self.chapter, 1)
        self.make_lesson(self.chapter, 2)
        body = self.preview(self.chapter_preview_url())
        second = self.second_publisher()

        with mock.patch.object(
            mutations, 'mutate', wraps=mutations.mutate
        ) as port:
            response = self.commit(
                self.chapter_commit_url(),
                body,
                client=client_for(second),
            )

        self.assertEqual(response.status_code, 200)
        self.assertEqual(port.call_count, 2)
        for call in port.call_args_list:
            self.assertEqual(call.kwargs['actor'], second)
            self.assertEqual(call.kwargs['data'], {'is_published': True})
        for lesson in Lesson.objects.all():
            lesson.refresh_from_db()
            self.assertTrue(lesson.is_published)
            self.assertEqual(lesson.last_modified_by, second)

    def test_a_commit_is_one_transaction_and_rolls_back_as_one(self):
        self.make_lesson(self.chapter, 1)
        self.make_lesson(self.chapter, 2)
        body = self.preview(self.chapter_preview_url())
        calls = {'count': 0}

        def fail_on_second_row(instance):
            calls['count'] += 1
            if calls['count'] == 2:
                raise RuntimeError('publish pass failed')

        with mock.patch.object(
            mutations, '_recompute_ancestors', side_effect=fail_on_second_row
        ):
            with self.assertRaises(RuntimeError):
                self.commit(self.chapter_commit_url(), body)

        # The first row was written inside the transaction, then the failure
        # rolled every row back together.
        self.assertFalse(Lesson.objects.filter(is_published=True).exists())

    def test_a_stale_preview_writes_nothing_and_conflicts(self):
        self.make_lesson(self.chapter, 1)
        self.make_lesson(self.chapter, 2)
        stale = self.preview(self.chapter_preview_url())
        self.make_lesson(self.chapter, 3)

        response = self.commit(self.chapter_commit_url(), stale)

        assert_envelope(self, response, 'conflict', 409)
        self.assertFalse(Lesson.objects.filter(is_published=True).exists())

    def test_a_changed_blocked_entry_conflicts(self):
        blocked = self.make_lesson(self.chapter, 1, teacher='')
        self.make_lesson(self.chapter, 2)
        stale = self.preview(self.chapter_preview_url())
        # Another Publisher completes the blocked Lesson before the commit.
        blocked.teacher = 'Ms Ada'
        blocked.save(update_fields=['teacher'])

        response = self.commit(self.chapter_commit_url(), stale)

        assert_envelope(self, response, 'conflict', 409)
        self.assertFalse(Lesson.objects.filter(is_published=True).exists())

    def test_a_swapped_blocked_entry_conflicts_even_at_the_same_count(self):
        ready = self.make_lesson(self.chapter, 1)
        blocked = self.make_lesson(self.chapter, 2, teacher='')
        stale = self.preview(self.chapter_preview_url())
        # The two swap: the count stays 1, but the blocked entry no longer
        # names the Lesson the preview named.
        ready.teacher = ''
        ready.save(update_fields=['teacher'])
        blocked.teacher = 'Ms Ada'
        blocked.save(update_fields=['teacher'])

        response = self.commit(self.chapter_commit_url(), stale)

        assert_envelope(self, response, 'conflict', 409)
        self.assertFalse(Lesson.objects.filter(is_published=True).exists())

    def test_a_re_permuted_blocked_echo_is_accepted(self):
        self.make_lesson(self.chapter, 1)
        first = self.make_lesson(self.chapter, 2, description='', teacher='')
        second = self.make_lesson(
            self.chapter, 3, description='', teacher=''
        )
        body = self.preview(self.chapter_preview_url())
        # The same entries, in the opposite order: the comparison is a set of
        # `(id, missing)` pairs, so the order of `blocked` is not a change.
        body['blocked'] = list(reversed(body['blocked']))

        response = self.commit(self.chapter_commit_url(), body)

        self.assertEqual(response.status_code, 200)
        result = response.json()
        self.assertEqual(result['changed'], 1)
        self.assertEqual(len(result['errors']['blocked']), 2)
        for lesson in (first, second):
            lesson.refresh_from_db()
            self.assertFalse(lesson.is_published)

    def test_a_reordered_missing_list_is_a_change(self):
        self.make_lesson(self.chapter, 1)
        self.make_lesson(self.chapter, 2, description='', teacher='')
        body = self.preview(self.chapter_preview_url())
        # The rule reports `['description', 'teacher']`; the same fields in a
        # different order are a different `missing` list, so it is a change.
        body['blocked'][0]['missing'] = list(
            reversed(body['blocked'][0]['missing'])
        )

        response = self.commit(self.chapter_commit_url(), body)

        assert_envelope(self, response, 'conflict', 409)
        self.assertFalse(Lesson.objects.filter(is_published=True).exists())

    def test_a_descendant_moved_between_preview_and_commit_conflicts(self):
        moved = self.make_lesson(self.chapter, 1)
        self.make_lesson(self.chapter, 2)
        stale = self.preview(self.chapter_preview_url())
        # A descendant leaving the addressed container is exactly the "moved"
        # stale cause the preview and commit must not paper over.
        moved.chapter = self.chapter2
        moved.save(update_fields=['chapter'])

        response = self.commit(self.chapter_commit_url(), stale)

        assert_envelope(self, response, 'conflict', 409)
        self.assertFalse(Lesson.objects.filter(is_published=True).exists())
        moved.refresh_from_db()
        self.assertEqual(moved.chapter, self.chapter2)

    def test_a_missing_would_change_is_a_400(self):
        response = self.commit(
            self.chapter_commit_url(), {'blocked': []}
        )

        assert_envelope(self, response, 'validation_error', 400)

    def test_a_malformed_blocked_entry_is_a_400(self):
        response = self.commit(
            self.chapter_commit_url(),
            {'would_change': 0, 'blocked': [{'missing': ['title']}]},
        )

        assert_envelope(self, response, 'validation_error', 400)

    def test_an_unknown_chapter_is_a_404(self):
        response = self.commit(
            reverse('chapter-bulk-publish', args=[uuid.uuid4()]),
            {'would_change': 0, 'blocked': []},
        )

        assert_envelope(self, response, 'not_found', 404)

    def test_a_non_uuid_segment_is_not_a_route(self):
        response = self.commit(
            f'{settings.API_PREFIX}/chapters/not-a-uuid/bulk-publish/',
            {'would_change': 0, 'blocked': []},
        )

        assert_envelope(self, response, 'not_found', 404)


class ModuleBulkPublishCommitTests(BulkPublishCommitTestCase):
    def test_a_module_commit_spans_every_chapter_beneath_it(self):
        self.make_lesson(self.chapter, 1)
        self.make_lesson(self.chapter, 2)
        self.make_lesson(self.chapter2, 1)
        body = self.preview(self.module_preview_url())

        response = self.commit(self.module_commit_url(), body)

        self.assertEqual(response.status_code, 200)
        self.assertEqual(response.json()['changed'], 3)
        self.assertEqual(
            Lesson.objects.filter(is_published=True).count(), 3
        )

    def test_a_module_commit_blocks_incomplete_lessons_in_any_chapter(self):
        self.make_lesson(self.chapter, 1)
        blocked = self.make_lesson(self.chapter2, 1, teacher='')
        body = self.preview(self.module_preview_url())

        response = self.commit(self.module_commit_url(), body)

        self.assertEqual(response.status_code, 200)
        result = response.json()
        self.assertEqual(result['changed'], 1)
        self.assertEqual(
            self.result_blocked_for(result, blocked)['missing'], ['teacher']
        )

    def test_a_module_commit_ignores_lessons_of_another_module(self):
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
        outside = self.make_lesson(other_chapter, 1)
        body = self.preview(self.module_preview_url())

        self.commit(self.module_commit_url(), body)

        outside.refresh_from_db()
        self.assertFalse(outside.is_published)

    def test_an_empty_module_changes_nothing(self):
        response = self.commit(
            self.module_commit_url(),
            {'would_change': 0, 'blocked': []},
        )

        self.assertEqual(response.status_code, 200)
        self.assertEqual(
            response.json(), {'changed': 0, 'errors': {'blocked': []}}
        )

    def test_a_stale_module_preview_writes_nothing_and_conflicts(self):
        self.make_lesson(self.chapter, 1)
        stale = self.preview(self.module_preview_url())
        self.make_lesson(self.chapter2, 1)

        response = self.commit(self.module_commit_url(), stale)

        assert_envelope(self, response, 'conflict', 409)
        self.assertFalse(Lesson.objects.filter(is_published=True).exists())

    def test_an_unknown_module_is_a_404(self):
        response = self.commit(
            reverse('module-bulk-publish', args=[uuid.uuid4()]),
            {'would_change': 0, 'blocked': []},
        )

        assert_envelope(self, response, 'not_found', 404)


class BulkPublishCommitAuthorizationTests(BulkPublishCommitTestCase):
    def valid_body(self):
        return {'would_change': 0, 'blocked': []}

    def test_a_student_is_forbidden_from_both_commits(self):
        for url in (
            self.chapter_commit_url(),
            self.module_commit_url(),
        ):
            with self.subTest(url=url):
                response = self.student_client.post(
                    url, self.valid_body(), format='json'
                )
                assert_envelope(self, response, 'permission_denied', 403)

    def test_an_anonymous_caller_is_unauthenticated_on_both_commits(self):
        for url in (
            self.chapter_commit_url(),
            self.module_commit_url(),
        ):
            with self.subTest(url=url):
                response = self.anonymous_client.post(
                    url, self.valid_body(), format='json'
                )
                assert_envelope(self, response, 'unauthenticated', 401)


class BulkPublishCommitRoutingAndSchemaTests(TestCase):
    def route_specs(self):
        return [
            (
                'chapter-bulk-publish',
                '/api/v1/chapters/{chapter_id}/bulk-publish/',
            ),
            (
                'module-bulk-publish',
                '/api/v1/modules/{module_id}/bulk-publish/',
            ),
        ]

    def test_every_commit_route_lives_under_the_api_prefix(self):
        for name, _ in self.route_specs():
            with self.subTest(name=name):
                url = reverse(name, args=[uuid.uuid4()])
                self.assertTrue(url.startswith(settings.API_PREFIX + '/'))

    def test_the_schema_documents_both_commit_operations(self):
        schema = SchemaGenerator().get_schema(request=None, public=True)
        paths = schema['paths']
        for _, path in self.route_specs():
            with self.subTest(path=path):
                self.assertIn(path, paths)
                operation = paths[path]['post']
                self.assertEqual(
                    operation['responses']['200']['content'][
                        'application/json'
                    ]['schema']['$ref'],
                    '#/components/schemas/BulkPublishResult',
                )
                for status_code in ('400', '401', '403', '404', '409'):
                    self.assertIn(status_code, operation['responses'])

    def test_the_schema_exposes_the_commit_contracts(self):
        schema = SchemaGenerator().get_schema(request=None, public=True)
        components = schema['components']['schemas']
        self.assertIn('BulkPublishCommit', components)
        self.assertIn('BulkPublishResult', components)
        commit = components['BulkPublishCommit']['properties']
        self.assertEqual(commit['would_change']['type'], 'integer')
        self.assertIn(
            'BulkPublishBlockedItem', json.dumps(commit['blocked'])
        )
        result = components['BulkPublishResult']['properties']
        self.assertEqual(result['changed']['type'], 'integer')
        self.assertIn('errors', result)
