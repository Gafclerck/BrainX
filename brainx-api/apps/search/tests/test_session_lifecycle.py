"""Session lifecycle test suite: resolve, close, lazy idle expiration, and oracle immunity (Story 6.2).

Pins the full Story 6.2 matrix:
- Single resolution authority `resolve_session` enforcing UUID format, existence,
  ownership (`session.user == user`), open state, and idle timeout <= 30m.
- Uniform 404 `not_found` envelope for every failed resolution leg with byte-identical
  oracle immunity (unknown, foreign, closed, expired, malformed).
- Lazy 30-minute idle expiration on read (`closed_at=last_activity_at + 30m`,
  `close_reason='idle_expired'`), without background tasks or external caches.
- Opening a Lesson from search results via `X-Search-Session-Id` closes the
  session with `close_reason='lesson_opened'`. Normal browse tree navigation
  without the header leaves all sessions untouched.
- Failed resolution on `GET /browse/lessons/<id>/` with an invalid header answers 404.
- Explicit abandon (`POST /search/sessions/abandon/` or close with
  `reason='abandoned'`) closes the session with `close_reason='abandoned'` and
  clears the cookie.
- Explicit close endpoint (`POST /search/sessions/close/`) closes with
  `close_reason='lesson_opened'` by default.
- Transport: Session identifiers travel in request body, header, or cookie,
  and are never accepted in URL paths or query parameters.
- Retention is indefinite: closed and expired sessions remain in the database.
"""

from datetime import timedelta
import uuid

from django.conf import settings
from django.http import Http404
from django.urls import reverse
from django.utils import timezone

from apps.content.tests.helpers import assert_envelope
from apps.search import capture
from apps.search.models import CloseReason, SearchQuery, SearchSession, SessionState

from .test_search import SearchTestCase


class SessionLifecycleTestCase(SearchTestCase):
    """Fixture providing user accounts, search endpoints, and session builders."""

    def setUp(self):
        super().setUp()
        self.close_url = reverse('search-sessions-close')
        self.abandon_url = reverse('search-sessions-abandon')
        self.lesson_detail_url = reverse(
            'browse-lesson-detail', args=[self.lesson.pk]
        )

    def create_session(
        self,
        user=None,
        state=SessionState.OPEN,
        close_reason=None,
        last_activity_at=None,
        closed_at=None,
    ):
        """Build a SearchSession with controlled lifecycle timestamps."""
        session = SearchSession.objects.create(
            user=user or self.student,
            state=state,
            close_reason=close_reason,
            closed_at=closed_at,
        )
        if last_activity_at is not None:
            SearchSession.objects.filter(pk=session.pk).update(
                last_activity_at=last_activity_at
            )
            session.refresh_from_db()
        return session


class ResolveSessionDirectTests(SessionLifecycleTestCase):
    """Direct unit tests on `capture.resolve_session`."""

    def test_resolve_valid_open_session_returns_instance(self):
        session = self.create_session()
        resolved = capture.resolve_session(self.student, session.pk)
        self.assertEqual(resolved.pk, session.pk)
        self.assertEqual(resolved.state, SessionState.OPEN)

    def test_resolve_accepts_uuid_instance_or_string(self):
        session = self.create_session()
        by_uuid = capture.resolve_session(self.student, session.pk)
        by_str = capture.resolve_session(self.student, str(session.pk))
        self.assertEqual(by_uuid, session)
        self.assertEqual(by_str, session)

    def test_resolve_unknown_uuid_raises_404(self):
        unknown_id = uuid.uuid4()
        with self.assertRaises(Http404):
            capture.resolve_session(self.student, unknown_id)

    def test_resolve_malformed_id_raises_404(self):
        for bad_id in ('not-a-uuid', '', None, 12345, '   '):
            with self.subTest(bad_id=bad_id):
                with self.assertRaises(Http404):
                    capture.resolve_session(self.student, bad_id)

    def test_resolve_foreign_session_raises_404(self):
        foreign = self.create_session(user=self.publisher)
        with self.assertRaises(Http404):
            capture.resolve_session(self.student, foreign.pk)

    def test_resolve_closed_session_raises_404(self):
        closed = self.create_session(
            state=SessionState.CLOSED,
            close_reason=CloseReason.LESSON_OPENED,
            closed_at=timezone.now(),
        )
        with self.assertRaises(Http404):
            capture.resolve_session(self.student, closed.pk)

    def test_resolve_idle_expired_session_closes_lazily_and_raises_404(self):
        now = timezone.now()
        idle_activity = now - timedelta(minutes=35)
        expired = self.create_session(last_activity_at=idle_activity)

        with self.assertRaises(Http404):
            capture.resolve_session(self.student, expired.pk)

        expired.refresh_from_db()
        self.assertEqual(expired.state, SessionState.CLOSED)
        self.assertEqual(expired.close_reason, CloseReason.IDLE_EXPIRED)
        self.assertEqual(
            expired.closed_at, idle_activity + capture.IDLE_TIMEOUT
        )
        # Indefinite retention: the session remains in the database.
        self.assertTrue(SearchSession.objects.filter(pk=expired.pk).exists())

    def test_resolve_active_session_under_30m_succeeds(self):
        active_time = timezone.now() - timedelta(minutes=29, seconds=50)
        session = self.create_session(last_activity_at=active_time)
        resolved = capture.resolve_session(self.student, session.pk)
        self.assertEqual(resolved, session)
        self.assertEqual(resolved.state, SessionState.OPEN)


class LessonDetailSessionClosureTests(SessionLifecycleTestCase):
    """Session resolution and closure via `GET /browse/lessons/<id>/`."""

    def test_lesson_opened_without_header_leaves_sessions_untouched(self):
        session = self.create_session()
        self.student_client.cookies[capture.SESSION_COOKIE] = str(session.pk)
        response = self.student_client.get(self.lesson_detail_url)

        self.assertEqual(response.status_code, 200)
        session.refresh_from_db()
        self.assertEqual(session.state, SessionState.OPEN)
        self.assertIsNone(session.closed_at)
        self.assertIsNone(session.close_reason)

    def test_lesson_opened_with_blank_or_empty_session_header_succeeds_as_normal_browse(
        self,
    ):
        session = self.create_session()
        for empty_header in ('', '   '):
            with self.subTest(empty_header=empty_header):
                response = self.student_client.get(
                    self.lesson_detail_url,
                    headers={'X-Search-Session-Id': empty_header},
                )
                self.assertEqual(response.status_code, 200)
                session.refresh_from_db()
                self.assertEqual(session.state, SessionState.OPEN)

    def test_nonexistent_lesson_with_valid_session_header_is_404_and_leaves_session_open(
        self,
    ):
        session = self.create_session()
        nonexistent_url = reverse(
            'browse-lesson-detail', args=[uuid.uuid4()]
        )
        response = self.student_client.get(
            nonexistent_url,
            headers={'X-Search-Session-Id': str(session.pk)},
        )
        assert_envelope(self, response, 'not_found', 404)
        session.refresh_from_db()
        self.assertEqual(session.state, SessionState.OPEN)
        self.assertIsNone(session.closed_at)
        self.assertIsNone(session.close_reason)

    def test_lesson_opened_with_valid_session_header_closes_session(self):
        session = self.create_session()
        before = timezone.now()

        response = self.student_client.get(
            self.lesson_detail_url,
            headers={'X-Search-Session-Id': str(session.pk)},
        )

        self.assertEqual(response.status_code, 200)
        session.refresh_from_db()
        self.assertEqual(session.state, SessionState.CLOSED)
        self.assertEqual(session.close_reason, CloseReason.LESSON_OPENED)
        self.assertIsNotNone(session.closed_at)
        self.assertGreaterEqual(session.closed_at, before)

    def test_lesson_opened_with_unknown_session_header_is_404(self):
        unknown = str(uuid.uuid4())
        response = self.student_client.get(
            self.lesson_detail_url,
            headers={'X-Search-Session-Id': unknown},
        )
        assert_envelope(self, response, 'not_found', 404)

    def test_lesson_opened_with_foreign_session_header_is_404(self):
        foreign = self.create_session(user=self.publisher)
        response = self.student_client.get(
            self.lesson_detail_url,
            headers={'X-Search-Session-Id': str(foreign.pk)},
        )
        assert_envelope(self, response, 'not_found', 404)
        foreign.refresh_from_db()
        self.assertEqual(foreign.state, SessionState.OPEN)

    def test_lesson_opened_with_closed_session_header_is_404(self):
        closed = self.create_session(
            state=SessionState.CLOSED,
            close_reason=CloseReason.ABANDONED,
            closed_at=timezone.now(),
        )
        response = self.student_client.get(
            self.lesson_detail_url,
            headers={'X-Search-Session-Id': str(closed.pk)},
        )
        assert_envelope(self, response, 'not_found', 404)

    def test_lesson_opened_with_idle_expired_header_lazily_closes_and_404s(self):
        idle_activity = timezone.now() - timedelta(minutes=31)
        expired = self.create_session(last_activity_at=idle_activity)

        response = self.student_client.get(
            self.lesson_detail_url,
            headers={'X-Search-Session-Id': str(expired.pk)},
        )

        assert_envelope(self, response, 'not_found', 404)
        expired.refresh_from_db()
        self.assertEqual(expired.state, SessionState.CLOSED)
        self.assertEqual(expired.close_reason, CloseReason.IDLE_EXPIRED)
        self.assertEqual(
            expired.closed_at, idle_activity + capture.IDLE_TIMEOUT
        )

    def test_lesson_opened_with_malformed_session_header_is_404(self):
        response = self.student_client.get(
            self.lesson_detail_url,
            headers={'X-Search-Session-Id': 'not-a-valid-uuid'},
        )
        assert_envelope(self, response, 'not_found', 404)

    def test_resolution_failures_are_byte_identical_with_no_oracle(self):
        """Every failure leg on LessonDetailView yields byte-identical 404."""
        foreign = self.create_session(user=self.publisher)
        closed = self.create_session(
            state=SessionState.CLOSED,
            close_reason=CloseReason.LESSON_OPENED,
            closed_at=timezone.now(),
        )
        expired = self.create_session(
            last_activity_at=timezone.now() - timedelta(minutes=40)
        )
        unknown = str(uuid.uuid4())
        malformed = 'malformed-session-id'

        responses = [
            self.student_client.get(
                self.lesson_detail_url,
                headers={'X-Search-Session-Id': target},
            )
            for target in (
                unknown,
                str(foreign.pk),
                str(closed.pk),
                str(expired.pk),
                malformed,
            )
        ]
        first_content = responses[0].content
        for response in responses:
            self.assertEqual(response.status_code, 404)
            self.assertEqual(response.content, first_content)
            assert_envelope(self, response, 'not_found', 404)


class SearchSessionCloseEndpointTests(SessionLifecycleTestCase):
    """Tests for `POST /api/v1/search/sessions/close/`."""

    def test_close_with_body_id_closes_as_lesson_opened(self):
        session = self.create_session()
        response = self.student_client.post(
            self.close_url,
            {'search_session_id': str(session.pk)},
            format='json',
        )

        self.assertEqual(response.status_code, 200)
        body = response.json()
        self.assertEqual(body['search_session_id'], str(session.pk))
        self.assertEqual(body['state'], SessionState.CLOSED)
        self.assertEqual(body['close_reason'], CloseReason.LESSON_OPENED)

        session.refresh_from_db()
        self.assertEqual(session.state, SessionState.CLOSED)
        self.assertEqual(session.close_reason, CloseReason.LESSON_OPENED)
        self.assertIsNotNone(session.closed_at)

    def test_close_with_alternate_body_key_session_id(self):
        session = self.create_session()
        response = self.student_client.post(
            self.close_url,
            {'session_id': str(session.pk)},
            format='json',
        )

        self.assertEqual(response.status_code, 200)
        session.refresh_from_db()
        self.assertEqual(session.state, SessionState.CLOSED)

    def test_close_with_cookie_transport(self):
        session = self.create_session()
        self.student_client.cookies[capture.SESSION_COOKIE] = str(session.pk)

        response = self.student_client.post(self.close_url)

        self.assertEqual(response.status_code, 200)
        session.refresh_from_db()
        self.assertEqual(session.state, SessionState.CLOSED)

    def test_close_with_header_only_closes_as_lesson_opened(self):
        session = self.create_session()
        response = self.student_client.post(
            self.close_url,
            headers={'X-Search-Session-Id': str(session.pk)},
        )

        self.assertEqual(response.status_code, 200)
        body = response.json()
        self.assertEqual(body['search_session_id'], str(session.pk))
        self.assertEqual(body['state'], SessionState.CLOSED)
        self.assertEqual(body['close_reason'], CloseReason.LESSON_OPENED)

        session.refresh_from_db()
        self.assertEqual(session.state, SessionState.CLOSED)
        self.assertEqual(session.close_reason, CloseReason.LESSON_OPENED)

    def test_close_with_idle_expired_reason_is_400_validation_error(self):
        session = self.create_session()
        response = self.student_client.post(
            self.close_url,
            {
                'search_session_id': str(session.pk),
                'reason': CloseReason.IDLE_EXPIRED,
            },
            format='json',
        )

        assert_envelope(self, response, 'validation_error', 400)
        session.refresh_from_db()
        self.assertEqual(session.state, SessionState.OPEN)

    def test_close_with_empty_reason_is_400_validation_error(self):
        session = self.create_session()
        response = self.student_client.post(
            self.close_url,
            {
                'search_session_id': str(session.pk),
                'reason': '',
            },
            format='json',
        )

        assert_envelope(self, response, 'validation_error', 400)
        session.refresh_from_db()
        self.assertEqual(session.state, SessionState.OPEN)

    def test_close_with_explicit_body_null_does_not_fall_back_to_cookie(self):
        session = self.create_session()
        self.student_client.cookies[capture.SESSION_COOKIE] = str(session.pk)

        response = self.student_client.post(
            self.close_url,
            {'search_session_id': None},
            format='json',
        )

        assert_envelope(self, response, 'not_found', 404)
        session.refresh_from_db()
        self.assertEqual(session.state, SessionState.OPEN)

    def test_close_with_explicit_abandon_reason_clears_cookie(self):
        session = self.create_session()
        self.student_client.cookies[capture.SESSION_COOKIE] = str(session.pk)

        response = self.student_client.post(
            self.close_url,
            {
                'search_session_id': str(session.pk),
                'reason': CloseReason.ABANDONED,
            },
            format='json',
        )

        self.assertEqual(response.status_code, 200)
        session.refresh_from_db()
        self.assertEqual(session.close_reason, CloseReason.ABANDONED)
        # Cookie is cleared
        cookie = response.cookies.get(capture.SESSION_COOKIE)
        self.assertTrue(cookie is not None and (cookie.value == '' or cookie['max-age'] == 0))

    def test_close_with_invalid_reason_is_400_validation_error(self):
        session = self.create_session()
        response = self.student_client.post(
            self.close_url,
            {
                'search_session_id': str(session.pk),
                'reason': 'bogus_reason',
            },
            format='json',
        )

        assert_envelope(self, response, 'validation_error', 400)
        session.refresh_from_db()
        self.assertEqual(session.state, SessionState.OPEN)

    def test_close_with_foreign_session_is_404(self):
        foreign = self.create_session(user=self.publisher)
        response = self.student_client.post(
            self.close_url,
            {'search_session_id': str(foreign.pk)},
            format='json',
        )
        assert_envelope(self, response, 'not_found', 404)

    def test_close_with_expired_session_is_404_and_closes_session(self):
        idle_activity = timezone.now() - timedelta(minutes=40)
        expired = self.create_session(last_activity_at=idle_activity)

        response = self.student_client.post(
            self.close_url,
            {'search_session_id': str(expired.pk)},
            format='json',
        )

        assert_envelope(self, response, 'not_found', 404)
        expired.refresh_from_db()
        self.assertEqual(expired.state, SessionState.CLOSED)
        self.assertEqual(expired.close_reason, CloseReason.IDLE_EXPIRED)

    def test_close_with_malformed_session_is_404(self):
        response = self.student_client.post(
            self.close_url,
            {'search_session_id': 'invalid-uuid'},
            format='json',
        )
        assert_envelope(self, response, 'not_found', 404)

    def test_close_without_session_is_404(self):
        response = self.student_client.post(self.close_url, {}, format='json')
        assert_envelope(self, response, 'not_found', 404)

    def test_close_unauthenticated_is_401(self):
        response = self.anonymous_client.post(self.close_url)
        assert_envelope(self, response, 'unauthenticated', 401)


class SearchSessionAbandonEndpointTests(SessionLifecycleTestCase):
    """Tests for `POST /api/v1/search/sessions/abandon/`."""

    def test_abandon_with_body_id_closes_as_abandoned_and_clears_cookie(self):
        session = self.create_session()
        self.student_client.cookies[capture.SESSION_COOKIE] = str(session.pk)

        response = self.student_client.post(
            self.abandon_url,
            {'search_session_id': str(session.pk)},
            format='json',
        )

        self.assertEqual(response.status_code, 200)
        body = response.json()
        self.assertEqual(body['search_session_id'], str(session.pk))
        self.assertEqual(body['state'], SessionState.CLOSED)
        self.assertEqual(body['close_reason'], CloseReason.ABANDONED)

        session.refresh_from_db()
        self.assertEqual(session.state, SessionState.CLOSED)
        self.assertEqual(session.close_reason, CloseReason.ABANDONED)
        self.assertIsNotNone(session.closed_at)

        cookie = response.cookies.get(capture.SESSION_COOKIE)
        self.assertTrue(cookie is not None and (cookie.value == '' or cookie['max-age'] == 0))

    def test_abandon_with_cookie_only(self):
        session = self.create_session()
        self.student_client.cookies[capture.SESSION_COOKIE] = str(session.pk)

        response = self.student_client.post(self.abandon_url)

        self.assertEqual(response.status_code, 200)
        session.refresh_from_db()
        self.assertEqual(session.state, SessionState.CLOSED)
        self.assertEqual(session.close_reason, CloseReason.ABANDONED)

    def test_abandon_with_header_only_closes_as_abandoned_and_clears_cookie(self):
        session = self.create_session()
        self.student_client.cookies[capture.SESSION_COOKIE] = str(session.pk)

        response = self.student_client.post(
            self.abandon_url,
            headers={'X-Search-Session-Id': str(session.pk)},
        )

        self.assertEqual(response.status_code, 200)
        body = response.json()
        self.assertEqual(body['search_session_id'], str(session.pk))
        self.assertEqual(body['state'], SessionState.CLOSED)
        self.assertEqual(body['close_reason'], CloseReason.ABANDONED)

        session.refresh_from_db()
        self.assertEqual(session.state, SessionState.CLOSED)
        self.assertEqual(session.close_reason, CloseReason.ABANDONED)

        cookie = response.cookies.get(capture.SESSION_COOKIE)
        self.assertTrue(cookie is not None and (cookie.value == '' or cookie['max-age'] == 0))

    def test_abandon_with_foreign_session_is_404(self):
        foreign = self.create_session(user=self.publisher)
        response = self.student_client.post(
            self.abandon_url,
            {'search_session_id': str(foreign.pk)},
            format='json',
        )
        assert_envelope(self, response, 'not_found', 404)

    def test_abandon_with_expired_session_is_404(self):
        idle_activity = timezone.now() - timedelta(minutes=45)
        expired = self.create_session(last_activity_at=idle_activity)

        response = self.student_client.post(
            self.abandon_url,
            {'search_session_id': str(expired.pk)},
            format='json',
        )

        assert_envelope(self, response, 'not_found', 404)
        expired.refresh_from_db()
        self.assertEqual(expired.state, SessionState.CLOSED)
        self.assertEqual(expired.close_reason, CloseReason.IDLE_EXPIRED)

    def test_abandon_with_malformed_session_is_404(self):
        response = self.student_client.post(
            self.abandon_url,
            {'search_session_id': 'malformed-uuid'},
            format='json',
        )
        assert_envelope(self, response, 'not_found', 404)

    def test_abandon_unauthenticated_is_401(self):
        response = self.anonymous_client.post(self.abandon_url)
        assert_envelope(self, response, 'unauthenticated', 401)


class SessionTransportAndRetentionTests(SessionLifecycleTestCase):
    """Transport security and soft-delete matching retention policy."""

    def test_session_id_in_url_query_param_is_never_accepted_for_close(self):
        session = self.create_session()
        # Query param ?search_session_id=... must NOT be accepted
        response = self.student_client.post(
            f'{self.close_url}?search_session_id={session.pk}',
            content_type='application/json',
        )
        # Without body or cookie, it fails with 404
        assert_envelope(self, response, 'not_found', 404)
        session.refresh_from_db()
        self.assertEqual(session.state, SessionState.OPEN)

    def test_retention_is_indefinite_matching_soft_delete_policy(self):
        """Closed and expired sessions are never deleted."""
        s1 = self.create_session()
        s2 = self.create_session()

        capture.close_session(s1, reason=CloseReason.LESSON_OPENED)
        now = timezone.now()
        SearchSession.objects.filter(pk=s2.pk).update(
            last_activity_at=now - timedelta(minutes=35)
        )
        with self.assertRaises(Http404):
            capture.resolve_session(self.student, s2.pk)

        # Both rows still exist in the database
        self.assertTrue(SearchSession.objects.filter(pk=s1.pk).exists())
        self.assertTrue(SearchSession.objects.filter(pk=s2.pk).exists())
        self.assertEqual(
            SearchSession.objects.filter(user=self.student).count(), 2
        )
