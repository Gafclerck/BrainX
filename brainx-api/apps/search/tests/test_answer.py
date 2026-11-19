"""Answer endpoint, session resolution, immutability, and retrieval metrics (Story 6.3).

Pins the full Story 6.3 specification:
- SearchAnswer model linked 1:1 to SearchSession with a `found` boolean.
- Single resolution check in `resolve_session_for_answer` enforcing caller ownership,
  UUID format, valid state (`lesson_opened` or `open`), and activity within 30 minutes.
- Byte-identical oracle immunity across all failed resolution legs (unknown, foreign,
  abandoned, idle-expired, malformed).
- Lazy 30-minute idle expiry on open sessions when resolution is attempted.
- Recording an answer on an open session closes it with `close_reason='lesson_opened'`
  and current `closed_at`.
- Rejection of repeated answers with HTTP 409 Conflict; strictly append-only immutability.
- Multi-transport session ID resolution: body (`search_session_id`, `session_id`),
  header (`X-Search-Session-Id`), and cookie (`search_session_id`).
- Rejection of session IDs in URL paths or query parameters.
- Signal distinction: negative answer (`found=False`) is distinct from no answer given.
- Indefinite retention matching soft-delete policy.
- Dynamic live calculation of SM-1 (successful-rescue rate) and SM-6 (negative-answer rate)
  from raw database records without precomputing or storing rates.
"""

from datetime import timedelta
import uuid

from django.core.exceptions import ObjectDoesNotExist
from django.db import IntegrityError
from django.http import Http404
from django.urls import reverse
from django.utils import timezone

from apps.content.tests.helpers import assert_envelope
from apps.search import capture
from apps.search.metrics import (
    calculate_sm1,
    calculate_sm1_rate,
    calculate_sm6,
    calculate_sm6_rate,
    sm1_successful_rescue_rate,
    sm6_negative_answer_rate,
)
from apps.search.models import (
    CloseReason,
    SearchAnswer,
    SearchSession,
    SessionState,
)

from .test_session_lifecycle import SessionLifecycleTestCase


class AnswerTestCase(SessionLifecycleTestCase):
    """Fixture providing user accounts and the answer endpoint URL."""

    def setUp(self):
        super().setUp()
        self.answer_url = reverse('search-sessions-answer')


class ResolveSessionForAnswerDirectTests(AnswerTestCase):
    """Direct unit tests on `capture.resolve_session_for_answer`."""

    def test_resolve_session_for_answer_closed_lesson_opened_succeeds(self):
        session = self.create_session(
            state=SessionState.CLOSED,
            close_reason=CloseReason.LESSON_OPENED,
            closed_at=timezone.now(),
        )
        resolved = capture.resolve_session_for_answer(self.student, session.pk)
        self.assertEqual(resolved.pk, session.pk)
        self.assertEqual(resolved.state, SessionState.CLOSED)
        self.assertEqual(resolved.close_reason, CloseReason.LESSON_OPENED)

    def test_resolve_session_for_answer_open_session_succeeds(self):
        session = self.create_session(state=SessionState.OPEN)
        resolved = capture.resolve_session_for_answer(self.student, session.pk)
        self.assertEqual(resolved.pk, session.pk)
        self.assertEqual(resolved.state, SessionState.OPEN)

    def test_resolve_session_for_answer_accepts_uuid_and_string(self):
        session = self.create_session(
            state=SessionState.CLOSED,
            close_reason=CloseReason.LESSON_OPENED,
            closed_at=timezone.now(),
        )
        by_uuid = capture.resolve_session_for_answer(self.student, session.pk)
        by_str = capture.resolve_session_for_answer(
            self.student, str(session.pk)
        )
        self.assertEqual(by_uuid, session)
        self.assertEqual(by_str, session)

    def test_resolve_session_for_answer_unknown_uuid_raises_404(self):
        unknown_id = uuid.uuid4()
        with self.assertRaises(Http404):
            capture.resolve_session_for_answer(self.student, unknown_id)

    def test_resolve_session_for_answer_malformed_id_raises_404(self):
        for bad_id in ('not-a-uuid', '', None, 12345, '   '):
            with self.subTest(bad_id=bad_id):
                with self.assertRaises(Http404):
                    capture.resolve_session_for_answer(self.student, bad_id)

    def test_resolve_session_for_answer_foreign_session_raises_404(self):
        foreign = self.create_session(
            user=self.publisher,
            state=SessionState.CLOSED,
            close_reason=CloseReason.LESSON_OPENED,
            closed_at=timezone.now(),
        )
        with self.assertRaises(Http404):
            capture.resolve_session_for_answer(self.student, foreign.pk)

    def test_resolve_session_for_answer_closed_abandoned_raises_404(self):
        abandoned = self.create_session(
            state=SessionState.CLOSED,
            close_reason=CloseReason.ABANDONED,
            closed_at=timezone.now(),
        )
        with self.assertRaises(Http404):
            capture.resolve_session_for_answer(self.student, abandoned.pk)

    def test_resolve_session_for_answer_closed_idle_expired_raises_404(self):
        expired = self.create_session(
            state=SessionState.CLOSED,
            close_reason=CloseReason.IDLE_EXPIRED,
            closed_at=timezone.now(),
        )
        with self.assertRaises(Http404):
            capture.resolve_session_for_answer(self.student, expired.pk)

    def test_resolve_session_for_answer_open_session_idle_expired_lazily_closes_and_raises_404(
        self,
    ):
        now = timezone.now()
        idle_activity = now - timedelta(minutes=35)
        expired = self.create_session(last_activity_at=idle_activity)

        with self.assertRaises(Http404):
            capture.resolve_session_for_answer(self.student, expired.pk)

        expired.refresh_from_db()
        self.assertEqual(expired.state, SessionState.CLOSED)
        self.assertEqual(expired.close_reason, CloseReason.IDLE_EXPIRED)
        self.assertEqual(
            expired.closed_at, idle_activity + capture.IDLE_TIMEOUT
        )
        self.assertTrue(SearchSession.objects.filter(pk=expired.pk).exists())

    def test_resolve_session_for_answer_closed_lesson_opened_closed_at_expired_raises_404(
        self,
    ):
        now = timezone.now()
        closed_past = now - timedelta(minutes=35)
        expired = self.create_session(
            state=SessionState.CLOSED,
            close_reason=CloseReason.LESSON_OPENED,
            closed_at=closed_past,
            last_activity_at=closed_past,
        )
        with self.assertRaises(Http404):
            capture.resolve_session_for_answer(self.student, expired.pk)

    def test_resolve_session_for_answer_closed_lesson_opened_answered_25m_after_query_with_10m_study_succeeds(
        self,
    ):
        """Query 25m ago, closed via lesson_opened 10m ago (10m study time): resolution succeeds."""
        now = timezone.now()
        query_time = now - timedelta(minutes=25)
        study_close_time = now - timedelta(minutes=10)
        session = self.create_session(
            state=SessionState.CLOSED,
            close_reason=CloseReason.LESSON_OPENED,
            closed_at=study_close_time,
            last_activity_at=query_time,
        )
        resolved = capture.resolve_session_for_answer(self.student, session.pk)
        self.assertEqual(resolved.pk, session.pk)
        self.assertEqual(resolved.state, SessionState.CLOSED)



class SearchSessionAnswerEndpointTests(AnswerTestCase):
    """Tests for `POST /api/v1/search/sessions/answer/`."""

    def test_answer_lesson_opened_session_found_true(self):
        session = self.create_session(
            state=SessionState.CLOSED,
            close_reason=CloseReason.LESSON_OPENED,
            closed_at=timezone.now(),
        )

        response = self.student_client.post(
            self.answer_url,
            {
                'search_session_id': str(session.pk),
                'found': True,
            },
            format='json',
        )

        self.assertEqual(response.status_code, 201)
        body = response.json()
        self.assertEqual(body['search_session_id'], str(session.pk))
        self.assertIs(body['found'], True)

        # Database verification
        answer = SearchAnswer.objects.get(session=session)
        self.assertIs(answer.found, True)
        self.assertEqual(str(answer), str(answer.pk))

    def test_answer_lesson_opened_session_found_false(self):
        session = self.create_session(
            state=SessionState.CLOSED,
            close_reason=CloseReason.LESSON_OPENED,
            closed_at=timezone.now(),
        )

        response = self.student_client.post(
            self.answer_url,
            {
                'search_session_id': str(session.pk),
                'found': False,
            },
            format='json',
        )

        self.assertEqual(response.status_code, 201)
        body = response.json()
        self.assertEqual(body['search_session_id'], str(session.pk))
        self.assertIs(body['found'], False)

        answer = SearchAnswer.objects.get(session=session)
        self.assertIs(answer.found, False)

    def test_answer_open_session_transitions_to_closed_lesson_opened(self):
        session = self.create_session(state=SessionState.OPEN)
        before = timezone.now()

        response = self.student_client.post(
            self.answer_url,
            {
                'search_session_id': str(session.pk),
                'found': True,
            },
            format='json',
        )

        self.assertEqual(response.status_code, 201)
        session.refresh_from_db()
        self.assertEqual(session.state, SessionState.CLOSED)
        self.assertEqual(session.close_reason, CloseReason.LESSON_OPENED)
        self.assertIsNotNone(session.closed_at)
        self.assertGreaterEqual(session.closed_at, before)

        answer = SearchAnswer.objects.get(session=session)
        self.assertIs(answer.found, True)

    def test_second_answer_on_same_session_is_409_conflict(self):
        session = self.create_session(
            state=SessionState.CLOSED,
            close_reason=CloseReason.LESSON_OPENED,
            closed_at=timezone.now(),
        )

        # First answer succeeds
        first_resp = self.student_client.post(
            self.answer_url,
            {
                'search_session_id': str(session.pk),
                'found': True,
            },
            format='json',
        )
        self.assertEqual(first_resp.status_code, 201)

        # Second answer is rejected with 409
        second_resp = self.student_client.post(
            self.answer_url,
            {
                'search_session_id': str(session.pk),
                'found': False,
            },
            format='json',
        )
        assert_envelope(self, second_resp, 'conflict', 409)

        # Verify initial answer remains unmodified (append-only immutability)
        answer = SearchAnswer.objects.get(session=session)
        self.assertIs(answer.found, True)
        self.assertEqual(SearchAnswer.objects.filter(session=session).count(), 1)

    def test_second_answer_with_no_body_on_answered_session_is_409(self):
        session = self.create_session(
            state=SessionState.CLOSED,
            close_reason=CloseReason.LESSON_OPENED,
            closed_at=timezone.now(),
        )
        SearchAnswer.objects.create(session=session, found=True)

        response = self.student_client.post(
            self.answer_url,
            headers={'X-Search-Session-Id': str(session.pk)},
            data={},
            format='json',
        )
        assert_envelope(self, response, 'conflict', 409)

    def test_put_and_patch_methods_are_not_allowed(self):
        session = self.create_session(
            state=SessionState.CLOSED,
            close_reason=CloseReason.LESSON_OPENED,
            closed_at=timezone.now(),
        )
        SearchAnswer.objects.create(session=session, found=True)

        put_resp = self.student_client.put(
            self.answer_url,
            {'search_session_id': str(session.pk), 'found': False},
            format='json',
        )
        self.assertEqual(put_resp.status_code, 405)

        patch_resp = self.student_client.patch(
            self.answer_url,
            {'search_session_id': str(session.pk), 'found': False},
            format='json',
        )
        self.assertEqual(patch_resp.status_code, 405)

    def test_answer_via_alternate_body_key_session_id(self):
        session = self.create_session(
            state=SessionState.CLOSED,
            close_reason=CloseReason.LESSON_OPENED,
            closed_at=timezone.now(),
        )
        response = self.student_client.post(
            self.answer_url,
            {
                'session_id': str(session.pk),
                'found': True,
            },
            format='json',
        )
        self.assertEqual(response.status_code, 201)
        self.assertTrue(SearchAnswer.objects.filter(session=session).exists())

    def test_answer_via_header_transport(self):
        session = self.create_session(
            state=SessionState.CLOSED,
            close_reason=CloseReason.LESSON_OPENED,
            closed_at=timezone.now(),
        )
        response = self.student_client.post(
            self.answer_url,
            headers={'X-Search-Session-Id': str(session.pk)},
            data={'found': True},
            format='json',
        )
        self.assertEqual(response.status_code, 201)
        body = response.json()
        self.assertEqual(body['search_session_id'], str(session.pk))
        self.assertIs(body['found'], True)

    def test_answer_via_cookie_transport(self):
        session = self.create_session(
            state=SessionState.CLOSED,
            close_reason=CloseReason.LESSON_OPENED,
            closed_at=timezone.now(),
        )
        self.student_client.cookies[capture.SESSION_COOKIE] = str(session.pk)

        response = self.student_client.post(
            self.answer_url,
            {'found': False},
            format='json',
        )
        self.assertEqual(response.status_code, 201)
        body = response.json()
        self.assertEqual(body['search_session_id'], str(session.pk))
        self.assertIs(body['found'], False)

    def test_transport_precedence_body_over_header(self):
        """Body session ID takes precedence over X-Search-Session-Id header."""
        session_body = self.create_session(
            state=SessionState.CLOSED,
            close_reason=CloseReason.LESSON_OPENED,
            closed_at=timezone.now(),
        )
        session_header = self.create_session(
            state=SessionState.CLOSED,
            close_reason=CloseReason.LESSON_OPENED,
            closed_at=timezone.now(),
        )

        response = self.student_client.post(
            self.answer_url,
            data={'search_session_id': str(session_body.pk), 'found': True},
            headers={'X-Search-Session-Id': str(session_header.pk)},
            format='json',
        )

        self.assertEqual(response.status_code, 201)
        self.assertEqual(
            response.json()['search_session_id'], str(session_body.pk)
        )
        self.assertTrue(
            SearchAnswer.objects.filter(session=session_body).exists()
        )
        self.assertFalse(
            SearchAnswer.objects.filter(session=session_header).exists()
        )

    def test_transport_precedence_header_over_cookie(self):
        """X-Search-Session-Id header takes precedence over search_session_id cookie."""
        session_header = self.create_session(
            state=SessionState.CLOSED,
            close_reason=CloseReason.LESSON_OPENED,
            closed_at=timezone.now(),
        )
        session_cookie = self.create_session(
            state=SessionState.CLOSED,
            close_reason=CloseReason.LESSON_OPENED,
            closed_at=timezone.now(),
        )

        self.student_client.cookies[capture.SESSION_COOKIE] = str(
            session_cookie.pk
        )
        response = self.student_client.post(
            self.answer_url,
            data={'found': True},
            headers={'X-Search-Session-Id': str(session_header.pk)},
            format='json',
        )

        self.assertEqual(response.status_code, 201)
        self.assertEqual(
            response.json()['search_session_id'], str(session_header.pk)
        )
        self.assertTrue(
            SearchAnswer.objects.filter(session=session_header).exists()
        )
        self.assertFalse(
            SearchAnswer.objects.filter(session=session_cookie).exists()
        )


    def test_answer_with_explicit_body_null_does_not_fall_back_to_cookie(self):
        session = self.create_session(
            state=SessionState.CLOSED,
            close_reason=CloseReason.LESSON_OPENED,
            closed_at=timezone.now(),
        )
        self.student_client.cookies[capture.SESSION_COOKIE] = str(session.pk)

        response = self.student_client.post(
            self.answer_url,
            {
                'search_session_id': None,
                'found': True,
            },
            format='json',
        )
        assert_envelope(self, response, 'not_found', 404)
        self.assertFalse(SearchAnswer.objects.filter(session=session).exists())

    def test_session_id_in_query_param_never_accepted(self):
        session = self.create_session(
            state=SessionState.CLOSED,
            close_reason=CloseReason.LESSON_OPENED,
            closed_at=timezone.now(),
        )
        response = self.student_client.post(
            f'{self.answer_url}?search_session_id={session.pk}',
            {'found': True},
            format='json',
        )
        assert_envelope(self, response, 'not_found', 404)

    def test_unauthenticated_request_is_401(self):
        response = self.anonymous_client.post(
            self.answer_url,
            {'found': True},
            format='json',
        )
        assert_envelope(self, response, 'unauthenticated', 401)

    def test_missing_found_field_is_400_validation_error(self):
        session = self.create_session(
            state=SessionState.CLOSED,
            close_reason=CloseReason.LESSON_OPENED,
            closed_at=timezone.now(),
        )
        response = self.student_client.post(
            self.answer_url,
            {'search_session_id': str(session.pk)},
            format='json',
        )
        body = assert_envelope(self, response, 'validation_error', 400)
        self.assertIn('found', body['errors'])

    def test_invalid_found_field_is_400_validation_error(self):
        session = self.create_session(
            state=SessionState.CLOSED,
            close_reason=CloseReason.LESSON_OPENED,
            closed_at=timezone.now(),
        )
        response = self.student_client.post(
            self.answer_url,
            {
                'search_session_id': str(session.pk),
                'found': 'invalid',
            },
            format='json',
        )
        body = assert_envelope(self, response, 'validation_error', 400)
        self.assertIn('found', body['errors'])

    def test_null_found_field_is_400_validation_error(self):
        session = self.create_session(
            state=SessionState.CLOSED,
            close_reason=CloseReason.LESSON_OPENED,
            closed_at=timezone.now(),
        )
        response = self.student_client.post(
            self.answer_url,
            {
                'search_session_id': str(session.pk),
                'found': None,
            },
            format='json',
        )
        body = assert_envelope(self, response, 'validation_error', 400)
        self.assertIn('found', body['errors'])

    def test_oracle_immunity_byte_identical_404_responses(self):
        """Every failure leg on SearchSessionAnswerView yields byte-identical 404."""
        foreign = self.create_session(
            user=self.publisher,
            state=SessionState.CLOSED,
            close_reason=CloseReason.LESSON_OPENED,
            closed_at=timezone.now(),
        )
        abandoned = self.create_session(
            state=SessionState.CLOSED,
            close_reason=CloseReason.ABANDONED,
            closed_at=timezone.now(),
        )
        expired = self.create_session(
            last_activity_at=timezone.now() - timedelta(minutes=40)
        )
        unknown = str(uuid.uuid4())
        malformed = 'malformed-session-id'

        targets = (
            unknown,
            str(foreign.pk),
            str(abandoned.pk),
            str(expired.pk),
            malformed,
        )

        responses = [
            self.student_client.post(
                self.answer_url,
                {'search_session_id': target, 'found': True},
                format='json',
            )
            for target in targets
        ]

        first_content = responses[0].content
        for response in responses:
            self.assertEqual(response.status_code, 404)
            self.assertEqual(response.content, first_content)
            assert_envelope(self, response, 'not_found', 404)

    def test_foreign_session_remains_untouched_after_404(self):
        foreign = self.create_session(
            user=self.publisher,
            state=SessionState.CLOSED,
            close_reason=CloseReason.LESSON_OPENED,
            closed_at=timezone.now(),
        )
        response = self.student_client.post(
            self.answer_url,
            {'search_session_id': str(foreign.pk), 'found': True},
            format='json',
        )
        assert_envelope(self, response, 'not_found', 404)
        foreign.refresh_from_db()
        self.assertEqual(foreign.state, SessionState.CLOSED)
        self.assertFalse(SearchAnswer.objects.filter(session=foreign).exists())

    def test_signal_distinction_negative_answer_vs_no_answer(self):
        """Negative answers are distinct from un-answered sessions in queries."""
        # 1. Unanswered lesson-opened session
        s_unanswered = self.create_session(
            state=SessionState.CLOSED,
            close_reason=CloseReason.LESSON_OPENED,
            closed_at=timezone.now(),
        )
        # 2. Answered found=False
        s_negative = self.create_session(
            state=SessionState.CLOSED,
            close_reason=CloseReason.LESSON_OPENED,
            closed_at=timezone.now(),
        )
        SearchAnswer.objects.create(session=s_negative, found=False)
        # 3. Answered found=True
        s_positive = self.create_session(
            state=SessionState.CLOSED,
            close_reason=CloseReason.LESSON_OPENED,
            closed_at=timezone.now(),
        )
        SearchAnswer.objects.create(session=s_positive, found=True)

        # Distinguishability checks
        self.assertEqual(
            SearchSession.objects.filter(
                close_reason=CloseReason.LESSON_OPENED,
                answer__isnull=True,
            ).count(),
            1,
        )
        self.assertEqual(
            SearchSession.objects.filter(answer__found=False).count(), 1
        )
        self.assertEqual(
            SearchSession.objects.filter(answer__found=True).count(), 1
        )

    def test_indefinite_retention(self):
        session = self.create_session(
            state=SessionState.CLOSED,
            close_reason=CloseReason.LESSON_OPENED,
            closed_at=timezone.now(),
        )
        answer = SearchAnswer.objects.create(session=session, found=True)
        self.assertTrue(SearchAnswer.objects.filter(pk=answer.pk).exists())
        self.assertTrue(SearchSession.objects.filter(pk=session.pk).exists())


class RetrievalMetricsTests(AnswerTestCase):
    """Live metric calculations for SM-1 and SM-6."""

    def test_calculate_sm1_rate_no_arguments_on_empty_db(self):
        SearchAnswer.objects.all().delete()
        SearchSession.objects.all().delete()
        self.assertEqual(calculate_sm1_rate(), 0.0)
        self.assertEqual(calculate_sm6_rate(), 0.0)

    def test_sm1_calculation_zero_sessions_returns_zero(self):
        self.assertEqual(calculate_sm1_rate(SearchSession.objects.none()), 0.0)

    def test_sm6_calculation_zero_answers_returns_zero(self):
        self.assertEqual(calculate_sm6_rate(SearchAnswer.objects.none()), 0.0)

    def test_calculate_sm6_rate_with_sliced_queryset(self):
        """Sliced queryset passed to calculate_sm6_rate evaluates cleanly."""
        SearchAnswer.objects.all().delete()
        SearchSession.objects.all().delete()

        s1 = self.create_session(
            state=SessionState.CLOSED, close_reason=CloseReason.LESSON_OPENED
        )
        s2 = self.create_session(
            state=SessionState.CLOSED, close_reason=CloseReason.LESSON_OPENED
        )
        s3 = self.create_session(
            state=SessionState.CLOSED, close_reason=CloseReason.LESSON_OPENED
        )

        SearchAnswer.objects.create(session=s1, found=True)
        SearchAnswer.objects.create(session=s2, found=False)
        SearchAnswer.objects.create(session=s3, found=False)

        # Slice the queryset
        sliced_sessions = SearchSession.objects.order_by('created_at', 'id')[:2]

        rate = calculate_sm6_rate(sessions=sliced_sessions)
        # First 2 sessions have 1 positive (s1) and 1 negative (s2) -> 1/2 = 0.5
        self.assertEqual(rate, 0.5)


    def test_sm1_and_sm6_calculations(self):
        """Verify dynamic calculations against raw database records.

        Scenario:
        - Session 1: closed via lesson_opened, answered found=True (+1 rescue, +1 positive)
        - Session 2: closed via lesson_opened, answered found=False (0 rescue, +1 negative)
        - Session 3: closed via lesson_opened, no answer (+1 rescue, 0 answers)
        - Session 4: closed via abandoned, no answer (0 rescue, 0 answers)
        - Session 5: answered found=False while open -> closed lesson_opened (0 rescue, +1 negative)

        Total sessions = 5
        Rescues = Session 1 (found=True) + Session 3 (unanswered lesson_opened) = 2
        SM-1 = 2 / 5 = 0.4

        Total answers = 3 (Session 1, Session 2, Session 5)
        Negative answers = 2 (Session 2, Session 5)
        SM-6 = 2 / 3 = ~0.66667
        """
        # Session 1: positive answer
        s1 = self.create_session(
            state=SessionState.CLOSED,
            close_reason=CloseReason.LESSON_OPENED,
            closed_at=timezone.now(),
        )
        SearchAnswer.objects.create(session=s1, found=True)

        # Session 2: negative answer
        s2 = self.create_session(
            state=SessionState.CLOSED,
            close_reason=CloseReason.LESSON_OPENED,
            closed_at=timezone.now(),
        )
        SearchAnswer.objects.create(session=s2, found=False)

        # Session 3: unanswered lesson_opened
        s3 = self.create_session(
            state=SessionState.CLOSED,
            close_reason=CloseReason.LESSON_OPENED,
            closed_at=timezone.now(),
        )

        # Session 4: abandoned
        s4 = self.create_session(
            state=SessionState.CLOSED,
            close_reason=CloseReason.ABANDONED,
            closed_at=timezone.now(),
        )

        # Session 5: answered found=False while open
        s5 = self.create_session(state=SessionState.OPEN)
        capture.record_answer(s5, found=False)

        sessions = SearchSession.objects.filter(pk__in=[s1.pk, s2.pk, s3.pk, s4.pk, s5.pk])
        answers = SearchAnswer.objects.filter(session__in=sessions)

        # SM-1 checks
        self.assertAlmostEqual(calculate_sm1_rate(sessions), 2 / 5)
        self.assertAlmostEqual(sm1_successful_rescue_rate(sessions), 2 / 5)
        self.assertAlmostEqual(calculate_sm1(sessions), 2 / 5)

        # SM-6 checks
        self.assertAlmostEqual(calculate_sm6_rate(answers), 2 / 3)
        self.assertAlmostEqual(calculate_sm6_rate(sessions=sessions), 2 / 3)
        self.assertAlmostEqual(sm6_negative_answer_rate(answers), 2 / 3)
        self.assertAlmostEqual(calculate_sm6(answers), 2 / 3)

    def test_metrics_not_stored_as_fields_on_models(self):
        """Ensure SM-1 and SM-6 rates are never stored in the database."""
        session_fields = [f.name for f in SearchSession._meta.get_fields()]
        answer_fields = [f.name for f in SearchAnswer._meta.get_fields()]

        for banned in ('sm1', 'sm_1', 'sm6', 'sm_6', 'rescue_rate', 'negative_rate'):
            self.assertNotIn(banned, session_fields)
            self.assertNotIn(banned, answer_fields)
