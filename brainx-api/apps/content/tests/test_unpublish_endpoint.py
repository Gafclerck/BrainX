"""The single-Lesson unpublish action (Story 4.2, Epic 4).

Unpublishing is the one writer that clears `is_published`: a dedicated
Publisher-only `POST` that flips the flag through the one write port. It is
never gated on metadata completeness, so an urgent withdrawal of an incomplete
Lesson still succeeds. Because Story 4.1 made the Student port `visible()`
filter `is_published` alongside `is_deleted`, clearing the flag removes the
Lesson and its Resources from every Student read path at once.

The cases here cover the I/O matrix, the four flag combinations, the port
boundary and the route/schema contract. The end-to-end Resource retrieval case
lives in `test_resources.py`, over the surface that resolves the parent Lesson,
because that is where the Student-facing consequence is observable.
"""

import uuid
from datetime import date
from unittest import mock

from django.conf import settings
from django.urls import reverse
from drf_spectacular.generators import SchemaGenerator

from apps.users.models import User

from ..models import Lesson
from .helpers import assert_envelope
from .test_create_endpoints import (
    PASSWORD,
    ContentEndpointTestCase,
    client_for,
)


class UnpublishTestCase(ContentEndpointTestCase):
    """The shared tree plus one published Lesson."""

    def setUp(self):
        super().setUp()
        self.lesson = Lesson.objects.create(
            chapter=self.chapter,
            title='Introduction',
            description='Opening',
            teacher='Ms Ada',
            course_date=date(2026, 9, 1),
            position=1,
            is_published=True,
            last_modified_by=self.publisher,
        )

    def unpublish_url(self, lesson=None):
        return reverse('lesson-unpublish', args=[(lesson or self.lesson).pk])

    def update_url(self, lesson=None):
        return reverse('lesson-update', args=[(lesson or self.lesson).pk])

    def unpublish(self, lesson=None):
        return self.publisher_client.post(self.unpublish_url(lesson))

    def assert_unpublished(self, lesson):
        lesson.refresh_from_db()
        self.assertFalse(lesson.is_published)


class UnpublishSuccessTests(UnpublishTestCase):
    def test_a_publisher_unpublishes_a_published_lesson(self):
        response = self.unpublish()

        self.assertEqual(response.status_code, 200)
        body = response.json()
        self.assertFalse(body['is_published'])
        self.assertEqual(
            body['last_modified_by'],
            {'id': str(self.publisher.id), 'email': self.publisher.email},
        )
        self.assert_unpublished(self.lesson)
        self.assertEqual(self.lesson.last_modified_by, self.publisher)

    def test_unpublishing_writes_through_the_port_and_stamps_the_actor(self):
        response = self.unpublish()

        self.assertEqual(response.status_code, 200)
        row = Lesson.objects.get(pk=self.lesson.pk)
        self.assertFalse(row.is_published)
        self.assertEqual(row.last_modified_by, self.publisher)

    def test_unpublishing_an_already_unpublished_lesson_is_idempotent(self):
        self.unpublish()
        before = Lesson.objects.get(pk=self.lesson.pk)

        response = self.unpublish()

        self.assertEqual(response.status_code, 200)
        self.assertFalse(response.json()['is_published'])
        after = Lesson.objects.get(pk=self.lesson.pk)
        # No write: the row and its stamp are untouched.
        self.assertEqual(after.updated_at, before.updated_at)
        self.assertEqual(after.last_modified_by_id, before.last_modified_by_id)

    def test_a_second_publisher_does_not_re_stamp_an_already_unpublished_row(
        self,
    ):
        self.unpublish()
        before = Lesson.objects.get(pk=self.lesson.pk).last_modified_by_id

        second = User.objects.create_user(
            email='second@example.com',
            password=PASSWORD,
            is_publisher=True,
            is_email_verified=True,
        )

        response = client_for(second).post(self.unpublish_url())

        self.assertEqual(response.status_code, 200)
        after = Lesson.objects.get(pk=self.lesson.pk)
        self.assertFalse(after.is_published)
        self.assertEqual(after.last_modified_by_id, before)


class UnpublishNoMetadataGateTests(UnpublishTestCase):
    def test_a_lesson_missing_metadata_is_still_withdrawn(self):
        # An urgent retraction of an incomplete Lesson must still work, so the
        # action is not gated on the publishable rule.
        self.lesson.description = ''
        self.lesson.save(update_fields=['description'])

        response = self.unpublish()

        self.assertEqual(response.status_code, 200)
        self.assertFalse(response.json()['is_published'])
        self.assert_unpublished(self.lesson)

    def test_the_publishable_rule_is_not_consulted(self):
        with mock.patch(
            'apps.content.views.lesson_missing_metadata',
            side_effect=AssertionError('unpublish must not consult the rule'),
        ) as rule:
            response = self.unpublish()

        self.assertEqual(response.status_code, 200)
        rule.assert_not_called()


class UnpublishNotFoundTests(UnpublishTestCase):
    def test_an_unknown_lesson_is_a_404(self):
        response = self.publisher_client.post(
            reverse('lesson-unpublish', args=[uuid.uuid4()])
        )

        assert_envelope(self, response, 'not_found', 404)

    def test_a_non_uuid_segment_is_not_a_route(self):
        response = self.publisher_client.post(
            f'{settings.API_PREFIX}/lessons/not-a-uuid/unpublish/'
        )

        assert_envelope(self, response, 'not_found', 404)


class UnpublishAuthorizationTests(UnpublishTestCase):
    def test_a_student_cannot_unpublish(self):
        response = self.student_client.post(self.unpublish_url())

        assert_envelope(self, response, 'permission_denied', 403)
        self.lesson.refresh_from_db()
        self.assertTrue(self.lesson.is_published)

    def test_an_anonymous_caller_cannot_unpublish(self):
        response = self.anonymous_client.post(self.unpublish_url())

        assert_envelope(self, response, 'unauthenticated', 401)
        self.lesson.refresh_from_db()
        self.assertTrue(self.lesson.is_published)


class UnpublishPortTests(UnpublishTestCase):
    def test_unpublish_hands_the_actor_and_the_flag_to_the_port(self):
        phantom = Lesson.objects.create(
            chapter=self.chapter,
            title='Phantom',
            description='Opening',
            teacher='Ms Ada',
            course_date=date(2026, 9, 2),
            position=2,
            last_modified_by=self.publisher,
        )

        with mock.patch(
            'apps.content.views.mutate', return_value=phantom
        ) as port:
            response = self.unpublish()

        self.assertEqual(response.status_code, 200)
        self.assertEqual(port.call_args.kwargs['actor'], self.publisher)
        self.assertEqual(port.call_args.kwargs['model'], Lesson)
        self.assertEqual(port.call_args.kwargs['instance'].pk, self.lesson.pk)
        self.assertEqual(
            port.call_args.kwargs['data'], {'is_published': False}
        )

    def test_an_unpublish_fails_when_the_port_is_unavailable(self):
        with mock.patch(
            'apps.content.views.mutate',
            side_effect=RuntimeError('mutate is unavailable'),
        ):
            with self.assertRaises(RuntimeError):
                self.unpublish()

        self.lesson.refresh_from_db()
        self.assertTrue(self.lesson.is_published)


class ServerOwnedFlagTests(UnpublishTestCase):
    def test_is_published_is_never_accepted_on_update(self):
        response = self.publisher_client.patch(
            self.update_url(), {'is_published': False}, format='json'
        )

        self.assertEqual(response.status_code, 200)
        self.assertTrue(response.json()['is_published'])
        self.lesson.refresh_from_db()
        self.assertTrue(self.lesson.is_published)

    def test_only_the_publish_and_unpublish_actions_write_the_flag(self):
        # An update body that injects the flag leaves the row alone; the two
        # named actions are the only writers.
        self.publisher_client.patch(
            self.update_url(), {'is_published': False}, format='json'
        )
        self.lesson.refresh_from_db()
        self.assertTrue(self.lesson.is_published)

        self.unpublish()
        self.assert_unpublished(self.lesson)

        self.publisher_client.post(
            reverse('lesson-publish', args=[self.lesson.pk])
        )
        self.lesson.refresh_from_db()
        self.assertTrue(self.lesson.is_published)


class FlagCombinationTests(UnpublishTestCase):
    def test_all_four_flag_combinations_are_reachable_through_actions(self):
        # (True, False): the shared fixture starts published and live.
        self.assertTrue(self.lesson.is_published)
        self.assertFalse(self.lesson.is_deleted)

        # (False, False): unpublish.
        self.unpublish()
        self.lesson.refresh_from_db()
        self.assertFalse(self.lesson.is_published)
        self.assertFalse(self.lesson.is_deleted)

        # (True, False): publish again.
        self.publisher_client.post(
            reverse('lesson-publish', args=[self.lesson.pk])
        )
        self.lesson.refresh_from_db()
        self.assertTrue(self.lesson.is_published)

        # (True, True): publish then remove.
        self.publisher_client.delete(self.update_url())
        self.lesson.refresh_from_db()
        self.assertTrue(self.lesson.is_published)
        self.assertTrue(self.lesson.is_deleted)

        # (False, True): unpublish a removed published Lesson.
        response = self.unpublish()
        self.assertEqual(response.status_code, 200)
        self.lesson.refresh_from_db()
        self.assertFalse(self.lesson.is_published)
        self.assertTrue(self.lesson.is_deleted)

    def test_a_removed_draft_reaches_false_true(self):
        # (False, True) is also reachable by removing a draft, independently of
        # the unpublish action.
        self.lesson.is_published = False
        self.lesson.save(update_fields=['is_published'])
        self.publisher_client.delete(self.update_url())

        self.lesson.refresh_from_db()
        self.assertFalse(self.lesson.is_published)
        self.assertTrue(self.lesson.is_deleted)


class StudentReadPortTests(UnpublishTestCase):
    def test_visible_hides_the_lesson_once_it_is_unpublished(self):
        self.assertTrue(
            Lesson.objects.visible().filter(pk=self.lesson.pk).exists()
        )

        self.unpublish()

        self.assertFalse(
            Lesson.objects.visible().filter(pk=self.lesson.pk).exists()
        )

    def test_manageable_still_returns_an_unpublished_lesson(self):
        # Unpublishing is not deletion: the Publisher port still sees the row.
        self.unpublish()

        self.assertTrue(
            Lesson.objects.manageable().filter(pk=self.lesson.pk).exists()
        )


class UnpublishRoutingAndSchemaTests(ContentEndpointTestCase):
    def test_the_unpublish_route_lives_under_the_api_prefix(self):
        url = reverse('lesson-unpublish', args=[uuid.uuid4()])

        self.assertTrue(url.startswith(settings.API_PREFIX + '/'))

    def test_the_schema_documents_the_unpublish_operation(self):
        schema = SchemaGenerator().get_schema(request=None, public=True)
        operation = schema['paths'][
            f'{settings.API_PREFIX}/lessons/{{lesson_id}}/unpublish/'
        ]['post']

        self.assertEqual(
            operation['responses']['200']['content']['application/json'][
                'schema'
            ]['$ref'],
            '#/components/schemas/Lesson',
        )
        for status_code in ('401', '403', '404'):
            self.assertEqual(
                operation['responses'][status_code]['content'][
                    'application/json'
                ]['schema']['$ref'],
                '#/components/schemas/ContentErrorResponse',
            )

