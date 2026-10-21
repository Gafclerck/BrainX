"""Publisher search aggregate view, date filtering, live metrics, and privacy (Story 6.4).

Pins the full Story 6.4 specification:
- Endpoint requires Publisher privilege: 401 for unauthenticated, 403 for Students.
- Optional calendar dates `date_from` and `date_to` formatted strictly as `YYYY-MM-DD`.
- Malformed date parameters return 400 Bad Request naming the invalid field in `errors`.
- Reversed date ranges (`date_from > date_to`) return 200 OK with 0 counts, 0.0 rates,
  and empty grouped query lists.
- Empty database returns 200 OK with 0 counts, 0.0 rates, and empty grouped query lists.
- SM-5 (zero-result query share) is computed live as `zero_result_queries / total_queries`
  (0.0 if empty).
- SM-6 (negative-answer rate) is computed live as `negative_answers / total_answers`
  (0.0 if empty), without dilution from unanswered sessions.
- Neither rate is ever stored or precomputed in the database.
- Grouped queries aggregate by query text, ordered by descending count, then alphabetical query text.
- Response contains zero student identity fields: no `user_id`, no `email`, no `username`,
  and no per-student query/session rows.
- Query text is treated as untrusted input and returned strictly as a JSON string without markup.
"""

from datetime import date, datetime, timedelta
import json
import uuid

from django.conf import settings
from django.db import models
from django.test import RequestFactory
from django.urls import reverse
from django.utils import timezone
from drf_spectacular.generators import SchemaGenerator
from rest_framework.exceptions import ValidationError

from apps.content.tests.helpers import assert_envelope
from apps.search.date_filters import parse_date_range
from apps.search.metrics import (
    calculate_sm5,
    calculate_sm5_rate,
    calculate_sm6,
    calculate_sm6_rate,
    get_search_aggregate,
    sm5_zero_result_rate,
    sm6_negative_answer_rate,
)
from apps.search.models import (
    CloseReason,
    SearchAnswer,
    SearchQuery,
    SearchSession,
    SessionState,
)
from apps.search.views import SearchAggregateResponseSerializer
from apps.users.models import User

from .test_session_lifecycle import SessionLifecycleTestCase


class SearchAggregateTestCase(SessionLifecycleTestCase):
    """Base test case providing users, aggregate URL, and database helpers."""

    def setUp(self):
        super().setUp()
        self.url = reverse('search-aggregate')
        self.factory = RequestFactory()

    def make_query(self, session, query_text, result_count=0, created_at=None):
        """Helper to create a SearchQuery with an optional explicit timestamp."""
        q = SearchQuery.objects.create(
            session=session,
            query=query_text,
            result_count=result_count,
        )
        if created_at is not None:
            SearchQuery.objects.filter(pk=q.pk).update(created_at=created_at)
            q.refresh_from_db()
        return q

    def make_answer(self, session, found=True, created_at=None):
        """Helper to create a SearchAnswer with an optional explicit timestamp."""
        a = SearchAnswer.objects.create(session=session, found=found)
        if created_at is not None:
            SearchAnswer.objects.filter(pk=a.pk).update(created_at=created_at)
            a.refresh_from_db()
        return a


class AggregatePermissionsTests(SearchAggregateTestCase):
    """Permission gating on GET /api/v1/search/aggregate/."""

    def test_unauthenticated_request_returns_401(self):
        response = self.anonymous_client.get(self.url)
        assert_envelope(self, response, 'unauthenticated', 401)

    def test_student_request_returns_403(self):
        response = self.student_client.get(self.url)
        assert_envelope(self, response, 'permission_denied', 403)

    def test_publisher_request_returns_200(self):
        response = self.publisher_client.get(self.url)
        self.assertEqual(response.status_code, 200)


class AggregateDateRangeValidationTests(SearchAggregateTestCase):
    """Validation of optional `date_from` and `date_to` parameters."""

    def test_valid_date_range_parses_successfully(self):
        response = self.publisher_client.get(
            self.url, {'date_from': '2026-10-01', 'date_to': '2026-10-21'}
        )
        self.assertEqual(response.status_code, 200)

    def test_malformed_date_from_not_iso_returns_400(self):
        response = self.publisher_client.get(
            self.url, {'date_from': '2026-9-1'}
        )
        body = assert_envelope(self, response, 'validation_error', 400)
        self.assertIn('date_from', body['errors'])

    def test_malformed_date_from_string_returns_400(self):
        response = self.publisher_client.get(
            self.url, {'date_from': 'invalid'}
        )
        body = assert_envelope(self, response, 'validation_error', 400)
        self.assertIn('date_from', body['errors'])

    def test_malformed_date_to_not_iso_returns_400(self):
        response = self.publisher_client.get(
            self.url, {'date_to': '20261021'}
        )
        body = assert_envelope(self, response, 'validation_error', 400)
        self.assertIn('date_to', body['errors'])

    def test_malformed_date_to_invalid_calendar_date_returns_400(self):
        response = self.publisher_client.get(
            self.url, {'date_to': '2026-02-30'}
        )
        body = assert_envelope(self, response, 'validation_error', 400)
        self.assertIn('date_to', body['errors'])

    def test_simultaneous_invalid_date_from_and_date_to_reports_both_in_errors(self):
        response = self.publisher_client.get(
            self.url, {'date_from': 'invalid', 'date_to': '20261021'}
        )
        body = assert_envelope(self, response, 'validation_error', 400)
        self.assertIn('date_from', body['errors'])
        self.assertIn('date_to', body['errors'])

    def test_direct_parse_date_range_helper(self):
        req = self.factory.get('/?date_from=2026-10-01&date_to=2026-10-21')
        from rest_framework.request import Request
        drf_req = Request(req)
        d_from, d_to = parse_date_range(drf_req)
        self.assertEqual(d_from, date(2026, 10, 1))
        self.assertEqual(d_to, date(2026, 10, 21))

        # Absent params parse to (None, None)
        req_empty = Request(self.factory.get('/'))
        self.assertEqual(parse_date_range(req_empty), (None, None))

        # Invalid raises ValidationError
        req_bad = Request(self.factory.get('/?date_from=bad'))
        with self.assertRaises(ValidationError) as cm:
            parse_date_range(req_bad)
        self.assertIn('date_from', cm.exception.detail)

        # Simultaneous invalid params raise ValidationError with both fields
        req_both_bad = Request(self.factory.get('/?date_from=bad&date_to=worse'))
        with self.assertRaises(ValidationError) as cm_both:
            parse_date_range(req_both_bad)
        self.assertIn('date_from', cm_both.exception.detail)
        self.assertIn('date_to', cm_both.exception.detail)


class AggregateDateRangeFilteringTests(SearchAggregateTestCase):
    """Filtering queries and answers strictly by date bounds."""

    def test_queries_and_answers_filtered_by_inclusive_date_range(self):
        SearchQuery.objects.all().delete()
        SearchAnswer.objects.all().delete()

        s1 = self.create_session()
        s2 = self.create_session()
        s3 = self.create_session()

        # Before window: 2026-09-30
        t_before = timezone.make_aware(datetime(2026, 9, 30, 12, 0, 0))
        self.make_query(s1, 'before query', result_count=0, created_at=t_before)
        self.make_answer(s1, found=False, created_at=t_before)

        # Inside window: 2026-10-05 and 2026-10-15
        t_in1 = timezone.make_aware(datetime(2026, 10, 5, 10, 0, 0))
        t_in2 = timezone.make_aware(datetime(2026, 10, 15, 14, 0, 0))
        self.make_query(s2, 'algebra', result_count=0, created_at=t_in1)
        self.make_query(s2, 'geometry', result_count=5, created_at=t_in2)
        self.make_answer(s2, found=False, created_at=t_in1)
        self.make_answer(s3, found=True, created_at=t_in2)

        # After window: 2026-10-25
        t_after = timezone.make_aware(datetime(2026, 10, 25, 9, 0, 0))
        self.make_query(s3, 'after query', result_count=0, created_at=t_after)
        # Note: s3 already has an answer, create session s4 for after answer
        s4 = self.create_session()
        self.make_answer(s4, found=False, created_at=t_after)

        response = self.publisher_client.get(
            self.url, {'date_from': '2026-10-01', 'date_to': '2026-10-21'}
        )
        self.assertEqual(response.status_code, 200)
        data = response.data

        # Inside window has 2 queries (algebra [0], geometry [5]) -> total_queries = 2, zero_result_queries = 1
        self.assertEqual(data['total_queries'], 2)
        self.assertEqual(data['zero_result_queries'], 1)
        self.assertAlmostEqual(data['sm5_rate'], 0.5)

        # Inside window has 2 answers (s2 [found=False], s3 [found=True]) -> total_answers = 2, negative_answers = 1
        self.assertEqual(data['total_answers'], 2)
        self.assertEqual(data['negative_answers'], 1)
        self.assertAlmostEqual(data['sm6_rate'], 0.5)

    def test_only_date_from_bound_applied(self):
        SearchQuery.objects.all().delete()
        SearchAnswer.objects.all().delete()

        s1 = self.create_session()
        s2 = self.create_session()

        t_past = timezone.make_aware(datetime(2026, 9, 15, 10, 0, 0))
        t_future = timezone.make_aware(datetime(2026, 10, 15, 10, 0, 0))

        self.make_query(s1, 'old query', result_count=0, created_at=t_past)
        self.make_query(s2, 'new query', result_count=0, created_at=t_future)

        response = self.publisher_client.get(self.url, {'date_from': '2026-10-01'})
        self.assertEqual(response.status_code, 200)
        self.assertEqual(response.data['total_queries'], 1)
        self.assertEqual(response.data['zero_result_queries'], 1)

    def test_only_date_to_bound_applied(self):
        SearchQuery.objects.all().delete()
        SearchAnswer.objects.all().delete()

        s1 = self.create_session()
        s2 = self.create_session()

        t_past = timezone.make_aware(datetime(2026, 9, 15, 10, 0, 0))
        t_future = timezone.make_aware(datetime(2026, 10, 15, 10, 0, 0))

        self.make_query(s1, 'old query', result_count=0, created_at=t_past)
        self.make_query(s2, 'new query', result_count=0, created_at=t_future)

        response = self.publisher_client.get(self.url, {'date_to': '2026-09-30'})
        self.assertEqual(response.status_code, 200)
        self.assertEqual(response.data['total_queries'], 1)
        self.assertEqual(response.data['zero_result_queries'], 1)

    def test_records_on_exact_boundary_dates_are_included(self):
        SearchQuery.objects.all().delete()
        SearchAnswer.objects.all().delete()

        s1 = self.create_session()
        s2 = self.create_session()
        s3 = self.create_session()
        s4 = self.create_session()

        # Day before date_from: 2026-09-30 23:59:59 (excluded)
        t_before = timezone.make_aware(datetime(2026, 9, 30, 23, 59, 59))
        self.make_query(s1, 'boundary before', result_count=0, created_at=t_before)

        # Exact lower boundary: 2026-10-01 00:00:00 (included)
        t_from = timezone.make_aware(datetime(2026, 10, 1, 0, 0, 0))
        self.make_query(s2, 'lower boundary', result_count=0, created_at=t_from)
        self.make_answer(s2, found=False, created_at=t_from)

        # Exact upper boundary: 2026-10-21 23:59:59 (included)
        t_to = timezone.make_aware(datetime(2026, 10, 21, 23, 59, 59))
        self.make_query(s3, 'upper boundary', result_count=5, created_at=t_to)
        self.make_answer(s3, found=True, created_at=t_to)

        # Day after date_to: 2026-10-22 00:00:00 (excluded)
        t_after = timezone.make_aware(datetime(2026, 10, 22, 0, 0, 0))
        self.make_query(s4, 'boundary after', result_count=0, created_at=t_after)

        response = self.publisher_client.get(
            self.url, {'date_from': '2026-10-01', 'date_to': '2026-10-21'}
        )
        self.assertEqual(response.status_code, 200)
        data = response.data

        self.assertEqual(data['total_queries'], 2)
        self.assertEqual(data['zero_result_queries'], 1)
        self.assertEqual(data['total_answers'], 2)
        self.assertEqual(data['negative_answers'], 1)

    def test_single_day_range_filtering(self):
        SearchQuery.objects.all().delete()
        SearchAnswer.objects.all().delete()

        s1 = self.create_session()
        s2 = self.create_session()
        s3 = self.create_session()
        s4 = self.create_session()

        t_yesterday = timezone.make_aware(datetime(2026, 10, 9, 23, 59, 59))
        t_target_morning = timezone.make_aware(datetime(2026, 10, 10, 8, 30, 0))
        t_target_evening = timezone.make_aware(datetime(2026, 10, 10, 20, 15, 0))
        t_tomorrow = timezone.make_aware(datetime(2026, 10, 11, 0, 0, 1))

        self.make_query(s1, 'yesterday', result_count=0, created_at=t_yesterday)
        self.make_query(s2, 'target morning', result_count=0, created_at=t_target_morning)
        self.make_query(s3, 'target evening', result_count=3, created_at=t_target_evening)
        self.make_answer(s2, found=False, created_at=t_target_morning)
        self.make_query(s4, 'tomorrow', result_count=0, created_at=t_tomorrow)

        response = self.publisher_client.get(
            self.url, {'date_from': '2026-10-10', 'date_to': '2026-10-10'}
        )
        self.assertEqual(response.status_code, 200)
        data = response.data

        self.assertEqual(data['total_queries'], 2)
        self.assertEqual(data['zero_result_queries'], 1)
        self.assertEqual(data['total_answers'], 1)
        self.assertEqual(data['negative_answers'], 1)
        self.assertEqual(len(data['grouped_queries']), 2)

    def test_reversed_date_range_returns_200_with_zero_counts_and_empty_lists(self):
        s = self.create_session()
        self.make_query(s, 'calculus', result_count=0)
        self.make_answer(s, found=False)

        response = self.publisher_client.get(
            self.url, {'date_from': '2026-10-21', 'date_to': '2026-10-01'}
        )
        self.assertEqual(response.status_code, 200)
        data = response.data

        self.assertEqual(data['total_queries'], 0)
        self.assertEqual(data['zero_result_queries'], 0)
        self.assertEqual(data['total_answers'], 0)
        self.assertEqual(data['negative_answers'], 0)
        self.assertEqual(data['zero_result_rate'], 0.0)
        self.assertEqual(data['negative_answer_rate'], 0.0)
        self.assertEqual(data['sm5_rate'], 0.0)
        self.assertEqual(data['sm6_rate'], 0.0)
        self.assertEqual(data['grouped_queries'], [])
        self.assertEqual(data['grouped_zero_result_queries'], [])

    def test_empty_database_returns_200_with_zero_counts_and_empty_lists(self):
        SearchQuery.objects.all().delete()
        SearchAnswer.objects.all().delete()

        response = self.publisher_client.get(self.url)
        self.assertEqual(response.status_code, 200)
        data = response.data

        self.assertEqual(data['total_queries'], 0)
        self.assertEqual(data['zero_result_queries'], 0)
        self.assertEqual(data['total_answers'], 0)
        self.assertEqual(data['negative_answers'], 0)
        self.assertEqual(data['zero_result_rate'], 0.0)
        self.assertEqual(data['negative_answer_rate'], 0.0)
        self.assertEqual(data['sm5_rate'], 0.0)
        self.assertEqual(data['sm6_rate'], 0.0)
        self.assertEqual(data['grouped_queries'], [])
        self.assertEqual(data['grouped_zero_result_queries'], [])


class AggregateLiveMetricsCalculationsTests(SearchAggregateTestCase):
    """Dynamic live calculations for SM-5 and SM-6."""

    def test_sm5_zero_result_share_live_calculation(self):
        SearchQuery.objects.all().delete()
        s = self.create_session()

        # 4 queries: 3 with result_count=0, 1 with result_count=5
        self.make_query(s, 'zero1', result_count=0)
        self.make_query(s, 'zero2', result_count=0)
        self.make_query(s, 'zero3', result_count=0)
        self.make_query(s, 'match1', result_count=5)

        response = self.publisher_client.get(self.url)
        self.assertEqual(response.status_code, 200)
        data = response.data

        self.assertEqual(data['total_queries'], 4)
        self.assertEqual(data['zero_result_queries'], 3)
        self.assertAlmostEqual(data['zero_result_rate'], 0.75)
        self.assertAlmostEqual(data['sm5_rate'], 0.75)

    def test_sm6_negative_answer_rate_live_calculation(self):
        SearchAnswer.objects.all().delete()

        s1 = self.create_session()
        s2 = self.create_session()
        s3 = self.create_session()
        # s4 has no answer - must not dilute the denominator
        self.create_session()

        self.make_answer(s1, found=False)
        self.make_answer(s2, found=False)
        self.make_answer(s3, found=True)

        response = self.publisher_client.get(self.url)
        self.assertEqual(response.status_code, 200)
        data = response.data

        # 3 answers given, 2 negative answers -> 2 / 3
        self.assertEqual(data['total_answers'], 3)
        self.assertEqual(data['negative_answers'], 2)
        self.assertAlmostEqual(data['negative_answer_rate'], 2 / 3)
        self.assertAlmostEqual(data['sm6_rate'], 2 / 3)

    def test_sm5_and_sm6_not_stored_as_database_columns(self):
        """Confirm that neither rate is stored as a database field."""
        query_fields = [f.name for f in SearchQuery._meta.get_fields()]
        answer_fields = [f.name for f in SearchAnswer._meta.get_fields()]
        session_fields = [f.name for f in SearchSession._meta.get_fields()]

        for banned in ('sm5', 'sm_5', 'sm6', 'sm_6', 'zero_result_rate', 'negative_answer_rate'):
            self.assertNotIn(banned, query_fields)
            self.assertNotIn(banned, answer_fields)
            self.assertNotIn(banned, session_fields)

    def test_calculate_sm5_rate_direct(self):
        SearchQuery.objects.all().delete()
        self.assertEqual(calculate_sm5_rate(), 0.0)
        self.assertEqual(calculate_sm5(), 0.0)
        self.assertEqual(sm5_zero_result_rate(), 0.0)

        s = self.create_session()
        self.make_query(s, 'q1', result_count=0)
        self.make_query(s, 'q2', result_count=1)

        self.assertAlmostEqual(calculate_sm5_rate(), 0.5)
        self.assertAlmostEqual(calculate_sm5(), 0.5)
        self.assertAlmostEqual(sm5_zero_result_rate(), 0.5)


class AggregateQueryGroupingTests(SearchAggregateTestCase):
    """Query text grouping, count sorting, alphabetical tiebreaking."""

    def test_zero_result_queries_grouped_by_count_descending_then_alphabetical(self):
        SearchQuery.objects.all().delete()
        s1 = self.create_session()
        s2 = self.create_session()

        # 'banana' appears twice (result_count=0)
        self.make_query(s1, 'banana', result_count=0)
        self.make_query(s2, 'banana', result_count=0)

        # 'apple' appears 3 times (result_count=0)
        self.make_query(s1, 'apple', result_count=0)
        self.make_query(s1, 'apple', result_count=0)
        self.make_query(s2, 'apple', result_count=0)

        # 'cherry' appears twice (result_count=0) -> tie with 'banana', 'banana' < 'cherry'
        self.make_query(s1, 'cherry', result_count=0)
        self.make_query(s2, 'cherry', result_count=0)

        # 'date' appears 1 time with result_count=5 -> NOT in grouped_zero_result_queries
        self.make_query(s1, 'date', result_count=5)

        response = self.publisher_client.get(self.url)
        self.assertEqual(response.status_code, 200)
        grouped_zero = response.data['grouped_zero_result_queries']

        # Expected order:
        # 1. apple: 3
        # 2. banana: 2 (tied with cherry, 'b' < 'c')
        # 3. cherry: 2
        self.assertEqual(len(grouped_zero), 3)
        self.assertEqual(grouped_zero[0], {'query': 'apple', 'count': 3})
        self.assertEqual(grouped_zero[1], {'query': 'banana', 'count': 2})
        self.assertEqual(grouped_zero[2], {'query': 'cherry', 'count': 2})

    def test_all_queries_grouped_in_grouped_queries(self):
        SearchQuery.objects.all().delete()
        s = self.create_session()

        self.make_query(s, 'zero_query', result_count=0)
        self.make_query(s, 'found_query', result_count=10)

        response = self.publisher_client.get(self.url)
        self.assertEqual(response.status_code, 200)

        grouped_all = response.data['grouped_queries']
        grouped_zero = response.data['grouped_zero_result_queries']

        self.assertEqual(len(grouped_all), 2)
        self.assertEqual(len(grouped_zero), 1)
        self.assertEqual(grouped_zero[0]['query'], 'zero_query')


class AggregatePrivacyAndUntrustedInputTests(SearchAggregateTestCase):
    """Guarantees against student identity leakage and HTML injection."""

    def test_response_contains_zero_student_identity_fields(self):
        SearchQuery.objects.all().delete()
        SearchAnswer.objects.all().delete()

        student_user = User.objects.create_user(
            email='confidential_student_99@example.com',
            password='some-password',
        )
        s = self.create_session(user=student_user)
        self.make_query(s, 'private topic', result_count=0)
        self.make_answer(s, found=False)

        response = self.publisher_client.get(self.url)
        self.assertEqual(response.status_code, 200)

        # Inspect raw JSON string payload
        content_str = response.content.decode('utf-8')

        # None of the student's identifying markers should appear anywhere in response
        self.assertNotIn('confidential_student_99', content_str)
        self.assertNotIn(str(student_user.pk), content_str)
        self.assertNotIn(str(s.pk), content_str)

        # Response top-level keys must not have user_id, email, username
        for forbidden in ('user_id', 'email', 'username', 'user', 'session_id', 'sessions'):
            self.assertNotIn(forbidden, response.data)

    def test_query_text_with_special_characters_and_markup_rendered_as_plain_json_string(self):
        SearchQuery.objects.all().delete()
        s = self.create_session()

        xss_query = "<script>alert('xss')</script> & \"quotes\" 'single'"
        unicode_query = "algèbre linéaire & intégration 100% 👍"

        self.make_query(s, xss_query, result_count=0)
        self.make_query(s, unicode_query, result_count=0)

        response = self.publisher_client.get(self.url)
        self.assertEqual(response.status_code, 200)

        # Query text returned strictly as JSON string, not HTML escaped (e.g. not &lt;script&gt;)
        queries_returned = [item['query'] for item in response.data['grouped_queries']]
        self.assertIn(xss_query, queries_returned)
        self.assertIn(unicode_query, queries_returned)

        # Verify JSON serialization round-trips byte for byte without HTML entity replacement
        parsed = json.loads(response.content)
        parsed_queries = [item['query'] for item in parsed['grouped_queries']]
        self.assertIn(xss_query, parsed_queries)
        self.assertIn(unicode_query, parsed_queries)


class AggregateSchemaAndSerializationTests(SearchAggregateTestCase):
    """OpenAPI schema generation and serializer contract adherence."""

    def test_openapi_schema_generation_and_response_serialization(self):
        generator = SchemaGenerator()
        schema = generator.get_schema(request=None, public=True)
        path = f'{settings.API_PREFIX}/search/aggregate/'
        self.assertIn(path, schema['paths'])
        self.assertIn('get', schema['paths'][path])

        # Populate sample data and verify response payload validates against serializer
        s = self.create_session()
        self.make_query(s, 'schema_test', result_count=0)
        self.make_answer(s, found=False)

        response = self.publisher_client.get(self.url)
        self.assertEqual(response.status_code, 200)

        serializer = SearchAggregateResponseSerializer(data=response.data)
        self.assertTrue(serializer.is_valid(), serializer.errors)

