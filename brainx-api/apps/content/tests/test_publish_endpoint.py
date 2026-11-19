"""The single-Lesson publish action and its rule (Story 4.1, Epic 4).

Publishing is a dedicated Publisher-only `POST` that flips `is_published`
through the one write port. The publishable rule - which fields a Lesson must
carry - lives once in `apps.content.publication`, so the publish action and the
ordinary update path cannot drift into two definitions of Published. The
Student port `visible()` is widened to filter `is_published` alongside
`is_deleted`, so a draft is hidden exactly as a removed row is.

The cases here cover the I/O matrix, the four flag combinations, the port
boundary and the route/schema contract. The published-Lesson write cases live
in `test_update_endpoints.py`, next to the update path they exercise.
"""

import uuid
from datetime import date
from unittest import mock

from django.conf import settings
from django.test import TestCase
from django.urls import reverse
from drf_spectacular.generators import SchemaGenerator

from apps.users.models import User

from .. import publication
from ..models import Lesson
from .helpers import assert_envelope
from .test_create_endpoints import (
    LESSON_PAYLOAD,
    PASSWORD,
    ContentEndpointTestCase,
    client_for,
)


class PublishTestCase(ContentEndpointTestCase):
    """The shared tree plus one complete draft Lesson."""

    def setUp(self):
        super().setUp()
        self.lesson = Lesson.objects.create(
            chapter=self.chapter,
            title='Introduction',
            description='Opening',
            teacher='Ms Ada',
            course_date=date(2026, 9, 1),
            position=1,
            last_modified_by=self.publisher,
        )

    def publish_url(self, lesson=None):
        return reverse('lesson-publish', args=[(lesson or self.lesson).pk])

    def update_url(self, lesson=None):
        return reverse('lesson-update', args=[(lesson or self.lesson).pk])

    def publish(self, lesson=None):
        return self.publisher_client.post(self.publish_url(lesson))

    def assert_published(self, lesson):
        lesson.refresh_from_db()
        self.assertTrue(lesson.is_published)


class PublicationRuleTests(TestCase):
    """The required-metadata rule is one function, checked as data."""

    def complete_lesson(self, **overrides):
        fields = {
            'title': 'Introduction',
            'description': 'Opening',
            'teacher': 'Ms Ada',
            'course_date': date(2026, 9, 1),
        }
        fields.update(overrides)
        return Lesson(**fields)

    def test_the_required_set_is_the_four_metadata_fields(self):
        self.assertEqual(
            publication.LESSON_REQUIRED_METADATA,
            ('title', 'description', 'teacher', 'course_date'),
        )

    def test_a_complete_lesson_has_nothing_missing(self):
        self.assertEqual(
            publication.lesson_missing_metadata(self.complete_lesson()), {}
        )

    def test_every_missing_field_is_named(self):
        lesson = self.complete_lesson(
            title='', description='', teacher='', course_date=None
        )

        missing = publication.lesson_missing_metadata(lesson)

        self.assertEqual(
            set(missing), {'title', 'description', 'teacher', 'course_date'}
        )
        for messages in missing.values():
            self.assertTrue(messages)

    def test_whitespace_only_text_is_missing(self):
        lesson = self.complete_lesson(
            title='  ', description='\t', teacher='\n'
        )

        missing = publication.lesson_missing_metadata(lesson)

        self.assertEqual(set(missing), {'title', 'description', 'teacher'})

    def test_changes_overlay_the_rows_own_values(self):
        lesson = self.complete_lesson()

        missing = publication.lesson_missing_metadata(
            lesson, {'description': ''}
        )

        self.assertEqual(set(missing), {'description'})


class PublishSuccessTests(PublishTestCase):
    def test_a_publisher_publishes_a_complete_draft(self):
        response = self.publish()

        self.assertEqual(response.status_code, 200)
        body = response.json()
        self.assertTrue(body['is_published'])
        self.assertEqual(
            body['last_modified_by'],
            {'id': str(self.publisher.id), 'email': self.publisher.email},
        )
        self.assert_published(self.lesson)
        self.assertEqual(self.lesson.last_modified_by, self.publisher)

    def test_publishing_writes_through_the_port_and_stamps_the_actor(self):
        response = self.publish()

        self.assertEqual(response.status_code, 200)
        row = Lesson.objects.get(pk=self.lesson.pk)
        self.assertTrue(row.is_published)
        self.assertEqual(row.last_modified_by, self.publisher)

    def test_publishing_an_already_published_lesson_is_idempotent(self):
        self.publish()
        before = Lesson.objects.get(pk=self.lesson.pk)

        response = self.publish()

        self.assertEqual(response.status_code, 200)
        self.assertTrue(response.json()['is_published'])
        after = Lesson.objects.get(pk=self.lesson.pk)
        # No write: the row and its stamp are untouched.
        self.assertEqual(after.updated_at, before.updated_at)
        self.assertEqual(after.last_modified_by_id, before.last_modified_by_id)

    def test_a_second_publisher_does_not_re_stamp_an_already_published_row(self):
        self.publish()
        before = Lesson.objects.get(pk=self.lesson.pk).last_modified_by_id

        second = User.objects.create_user(
            email='second@example.com',
            password=PASSWORD,
            is_publisher=True,
            is_email_verified=True,
        )

        response = client_for(second).post(self.publish_url())

        self.assertEqual(response.status_code, 200)
        after = Lesson.objects.get(pk=self.lesson.pk)
        self.assertTrue(after.is_published)
        self.assertEqual(after.last_modified_by_id, before)


class PublishValidationTests(PublishTestCase):
    def incomplete_lesson(self, **overrides):
        fields = {
            'chapter': self.chapter,
            'title': 'Parallel',
            'description': 'Opening',
            'teacher': 'Ms Ada',
            'course_date': date(2026, 9, 2),
            'position': 2,
            'last_modified_by': self.publisher,
        }
        fields.update(overrides)
        return Lesson.objects.create(**fields)

    def test_a_lesson_missing_description_is_rejected_and_named(self):
        lesson = self.incomplete_lesson(description='')

        response = self.publish(lesson)

        body = assert_envelope(self, response, 'validation_error', 400)
        self.assertEqual(set(body['errors']), {'description'})
        lesson.refresh_from_db()
        self.assertFalse(lesson.is_published)

    def test_every_missing_field_is_named_not_only_the_first(self):
        lesson = self.incomplete_lesson(
            title='', description='', teacher=''
        )

        response = self.publish(lesson)

        body = assert_envelope(self, response, 'validation_error', 400)
        self.assertEqual(
            set(body['errors']), {'title', 'description', 'teacher'}
        )
        lesson.refresh_from_db()
        self.assertFalse(lesson.is_published)

    def test_a_whitespace_only_field_counts_as_missing(self):
        lesson = self.incomplete_lesson(title='   ')

        response = self.publish(lesson)

        body = assert_envelope(self, response, 'validation_error', 400)
        self.assertEqual(set(body['errors']), {'title'})


class PublishNotFoundTests(PublishTestCase):
    def test_an_unknown_lesson_is_a_404(self):
        response = self.publisher_client.post(
            reverse('lesson-publish', args=[uuid.uuid4()])
        )

        assert_envelope(self, response, 'not_found', 404)

    def test_a_non_uuid_segment_is_not_a_route(self):
        response = self.publisher_client.post(
            f'{settings.API_PREFIX}/lessons/not-a-uuid/publish/'
        )

        assert_envelope(self, response, 'not_found', 404)


class PublishAuthorizationTests(PublishTestCase):
    def test_a_student_cannot_publish(self):
        response = self.student_client.post(self.publish_url())

        assert_envelope(self, response, 'permission_denied', 403)
        self.lesson.refresh_from_db()
        self.assertFalse(self.lesson.is_published)

    def test_an_anonymous_caller_cannot_publish(self):
        response = self.anonymous_client.post(self.publish_url())

        assert_envelope(self, response, 'unauthenticated', 401)
        self.lesson.refresh_from_db()
        self.assertFalse(self.lesson.is_published)


class PublishPortTests(PublishTestCase):
    def test_publish_hands_the_actor_and_the_flag_to_the_port(self):
        phantom = Lesson.objects.create(
            chapter=self.chapter,
            title='Phantom',
            description='Opening',
            teacher='Ms Ada',
            course_date=date(2026, 9, 3),
            position=2,
            is_published=True,
            last_modified_by=self.publisher,
        )

        with mock.patch(
            'apps.content.views.mutate', return_value=phantom
        ) as port:
            response = self.publish()

        self.assertEqual(response.status_code, 200)
        self.assertEqual(port.call_args.kwargs['actor'], self.publisher)
        self.assertEqual(port.call_args.kwargs['model'], Lesson)
        self.assertEqual(port.call_args.kwargs['instance'].pk, self.lesson.pk)
        self.assertEqual(port.call_args.kwargs['data'], {'is_published': True})

    def test_a_publish_fails_when_the_port_is_unavailable(self):
        with mock.patch(
            'apps.content.views.mutate',
            side_effect=RuntimeError('mutate is unavailable'),
        ):
            with self.assertRaises(RuntimeError):
                self.publish()

        self.lesson.refresh_from_db()
        self.assertFalse(self.lesson.is_published)


class ServerOwnedFlagTests(PublishTestCase):
    def test_is_published_is_never_accepted_on_create(self):
        response = self.publisher_client.post(
            reverse('lesson-create', args=[self.chapter.pk]),
            {**LESSON_PAYLOAD, 'is_published': True},
            format='json',
        )

        self.assertEqual(response.status_code, 201)
        self.assertFalse(response.json()['is_published'])
        created = Lesson.objects.get(pk=response.json()['id'])
        self.assertFalse(created.is_published)

    def test_is_published_is_never_accepted_on_update(self):
        response = self.publisher_client.patch(
            self.update_url(), {'is_published': True}, format='json'
        )

        self.assertEqual(response.status_code, 200)
        self.assertFalse(response.json()['is_published'])
        self.lesson.refresh_from_db()
        self.assertFalse(self.lesson.is_published)

    def test_only_the_publish_action_sets_the_flag(self):
        # An update body that injects the flag leaves the row a draft; the
        # publish action then sets it. One writer, one reader.
        self.publisher_client.patch(
            self.update_url(), {'is_published': True}, format='json'
        )
        self.lesson.refresh_from_db()
        self.assertFalse(self.lesson.is_published)

        self.publish()

        self.assert_published(self.lesson)


class FlagCombinationTests(PublishTestCase):
    def test_all_four_flag_combinations_are_representable(self):
        expected = {
            (is_published, is_deleted)
            for is_published in (False, True)
            for is_deleted in (False, True)
        }
        for position, (is_published, is_deleted) in enumerate(
            sorted(expected), start=2
        ):
            Lesson.objects.create(
                chapter=self.chapter,
                title=f'Lesson {position}',
                description='Opening',
                teacher='Ms Ada',
                course_date=date(2026, 9, position),
                position=position,
                is_published=is_published,
                is_deleted=is_deleted,
                last_modified_by=self.publisher,
            )

        self.assertEqual(
            set(Lesson.objects.values_list('is_published', 'is_deleted')),
            expected,
        )

    def test_all_four_flag_combinations_are_reachable_through_actions(self):
        # (False, False): a new Lesson is a live draft by default.
        self.assertFalse(self.lesson.is_published)
        self.assertFalse(self.lesson.is_deleted)

        # (True, False): the publish action.
        self.publish()
        self.lesson.refresh_from_db()
        self.assertTrue(self.lesson.is_published)
        self.assertFalse(self.lesson.is_deleted)

        # (True, True): publish then remove.
        self.publisher_client.delete(self.update_url())
        self.lesson.refresh_from_db()
        self.assertTrue(self.lesson.is_published)
        self.assertTrue(self.lesson.is_deleted)

        # (False, True): remove a draft.
        draft = Lesson.objects.create(
            chapter=self.chapter,
            title='Draft',
            description='Opening',
            teacher='Ms Ada',
            course_date=date(2026, 9, 2),
            position=2,
            last_modified_by=self.publisher,
        )
        self.publisher_client.delete(
            reverse('lesson-update', args=[draft.pk])
        )
        draft.refresh_from_db()
        self.assertFalse(draft.is_published)
        self.assertTrue(draft.is_deleted)

    def test_a_removed_draft_can_still_be_published(self):
        # Publication is orthogonal to removal: the action resolves the Lesson
        # with the raw manager, so a removed draft reaches (True, True) too -
        # not only through publish-then-remove.
        self.publisher_client.delete(self.update_url())
        self.lesson.refresh_from_db()
        self.assertFalse(self.lesson.is_published)
        self.assertTrue(self.lesson.is_deleted)

        response = self.publish()

        self.assertEqual(response.status_code, 200)
        self.assertTrue(response.json()['is_published'])
        self.lesson.refresh_from_db()
        self.assertTrue(self.lesson.is_published)
        self.assertTrue(self.lesson.is_deleted)


class StudentReadPortTests(PublishTestCase):
    def test_visible_hides_a_draft_and_shows_it_once_published(self):
        self.assertFalse(
            Lesson.objects.visible().filter(pk=self.lesson.pk).exists()
        )

        self.publish()

        self.assertTrue(
            Lesson.objects.visible().filter(pk=self.lesson.pk).exists()
        )

    def test_visible_still_hides_a_published_but_removed_lesson(self):
        self.publish()
        self.publisher_client.delete(self.update_url())

        self.assertFalse(
            Lesson.objects.visible().filter(pk=self.lesson.pk).exists()
        )
        self.assertTrue(
            Lesson.objects.manageable().filter(pk=self.lesson.pk).exists()
        )


class PublishRoutingAndSchemaTests(ContentEndpointTestCase):
    def test_the_publish_route_lives_under_the_api_prefix(self):
        url = reverse('lesson-publish', args=[uuid.uuid4()])

        self.assertTrue(url.startswith(settings.API_PREFIX + '/'))

    def test_the_schema_documents_the_publish_operation(self):
        schema = SchemaGenerator().get_schema(request=None, public=True)
        operation = schema['paths'][
            f'{settings.API_PREFIX}/lessons/{{lesson_id}}/publish/'
        ]['post']

        self.assertEqual(
            operation['responses']['200']['content']['application/json'][
                'schema'
            ]['$ref'],
            '#/components/schemas/Lesson',
        )

    def test_the_schema_marks_is_published_read_only(self):
        schema = SchemaGenerator().get_schema(request=None, public=True)
        component = schema['components']['schemas']['Lesson']

        self.assertIs(component['properties']['is_published']['readOnly'], True)
