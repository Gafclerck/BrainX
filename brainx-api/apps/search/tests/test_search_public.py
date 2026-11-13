"""Integration tests for secure anonymous global search (Story 1.4).

Verifies unauthenticated full-text search across published lessons under
BRAINX_PUBLIC_BROWSING=True, session capture instrumentation bypass (zero rows
added to SearchSession or SearchQuery, search_session_id=None, no cookie),
ignoring incoming X-Search-Session-Id header or cookie, unpublished and soft-deleted
content filtering, query parameter validation and bounds/sort, anonymous rate limiting
via AnonRateThrottle (429 with Retry-After header and RFC 9457 envelope), reversibility
to 401 under BRAINX_PUBLIC_BROWSING=False, and strict protection of session actions
and aggregate endpoints.
"""

from datetime import date
import uuid

from django.conf import settings
from django.core.cache import cache
from django.test import override_settings
from django.urls import reverse
from drf_spectacular.generators import SchemaGenerator
from rest_framework.throttling import AnonRateThrottle, UserRateThrottle

from apps.content.models import Chapter, Course, Lesson, Module
from apps.content.tests.helpers import assert_envelope
from apps.content.tests.test_browse import BrowseTestCase
from apps.search.capture import SESSION_COOKIE
from apps.search.models import SearchQuery, SearchSession
from apps.search.views import SearchLessonView


class PublicSearchTestCase(BrowseTestCase):
    """The browse fixture plus searchable lesson builder and search URL."""

    def setUp(self):
        super().setUp()
        self.url = reverse('search-lessons')

    def make_searchable_lesson(
        self,
        chapter,
        *,
        title,
        position=None,
        course_date=date(2026, 9, 1),
        description='',
        keywords='',
        is_published=True,
        is_deleted=False,
        **kwargs,
    ):
        if position is None:
            last = (
                Lesson.objects.filter(chapter=chapter)
                .order_by('-position')
                .first()
            )
            position = (last.position + 1) if last else 1

        lesson = self.make_lesson(
            chapter,
            title=title,
            position=position,
            course_date=course_date,
            is_published=is_published,
            is_deleted=is_deleted,
            **kwargs,
        )
        lesson.description = description
        lesson.keywords = keywords
        search_doc = lesson.compose_search_document()
        Lesson.objects.filter(pk=lesson.pk).update(
            description=description,
            keywords=keywords,
            search_document=search_doc,
        )
        lesson.search_document = search_doc
        return lesson

    def search_anon(self, **params):
        return self.anonymous_client.get(self.url, params)

    def ids(self, response):
        return [row['id'] for row in response.json()['results']]


class PublicSearchExecutionTests(PublicSearchTestCase):
    """AC-1 & AC-2: Anonymous search execution, session omission, header/cookie ignoring, and filtering."""

    @override_settings(BRAINX_PUBLIC_BROWSING=True)
    def test_anonymous_search_returns_200_with_matching_published_lessons(self):
        lesson = self.make_searchable_lesson(
            self.chapter,
            title='Algebre lineaire',
            description='Espaces vectoriels et matrices',
            keywords='maths, vecteurs',
        )

        response = self.search_anon(query='algebre')

        self.assertEqual(response.status_code, 200)
        body = response.json()
        self.assertEqual(body['count'], 1)
        self.assertEqual(self.ids(response), [str(lesson.pk)])
        self.assertIsNone(body['search_session_id'])
        self.assertNotIn(SESSION_COOKIE, response.cookies)
        self.assertEqual(SearchSession.objects.count(), 0)
        self.assertEqual(SearchQuery.objects.count(), 0)

    @override_settings(BRAINX_PUBLIC_BROWSING=True)
    def test_anonymous_search_ignores_incoming_session_cookie_without_error(self):
        lesson = self.make_searchable_lesson(
            self.chapter,
            title='Algebre lineaire',
        )
        fake_session_id = str(uuid.uuid4())
        self.anonymous_client.cookies[SESSION_COOKIE] = fake_session_id

        response = self.search_anon(query='algebre')

        self.assertEqual(response.status_code, 200)
        body = response.json()
        self.assertEqual(body['count'], 1)
        self.assertEqual(self.ids(response), [str(lesson.pk)])
        self.assertIsNone(body['search_session_id'])
        self.assertNotIn(SESSION_COOKIE, response.cookies)
        self.assertEqual(SearchSession.objects.count(), 0)
        self.assertEqual(SearchQuery.objects.count(), 0)

    @override_settings(BRAINX_PUBLIC_BROWSING=True)
    def test_anonymous_search_ignores_incoming_session_header_without_error(self):
        lesson = self.make_searchable_lesson(
            self.chapter,
            title='Algebre lineaire',
        )
        fake_session_id = str(uuid.uuid4())

        response = self.anonymous_client.get(
            self.url,
            {'query': 'algebre'},
            HTTP_X_SEARCH_SESSION_ID=fake_session_id,
        )

        self.assertEqual(response.status_code, 200)
        body = response.json()
        self.assertEqual(body['count'], 1)
        self.assertEqual(self.ids(response), [str(lesson.pk)])
        self.assertIsNone(body['search_session_id'])
        self.assertNotIn(SESSION_COOKIE, response.cookies)
        self.assertEqual(SearchSession.objects.count(), 0)
        self.assertEqual(SearchQuery.objects.count(), 0)

    @override_settings(BRAINX_PUBLIC_BROWSING=True)
    def test_anonymous_empty_query_returns_200_with_empty_results(self):
        self.make_searchable_lesson(self.chapter, title='Algebre lineaire')

        for empty_val in ('', '   ', '\t\n'):
            with self.subTest(empty_val=empty_val):
                response = self.search_anon(query=empty_val)

                self.assertEqual(response.status_code, 200)
                body = response.json()
                self.assertEqual(body['count'], 0)
                self.assertEqual(body['results'], [])
                self.assertIsNone(body['search_session_id'])
                self.assertNotIn(SESSION_COOKIE, response.cookies)
                self.assertEqual(SearchSession.objects.count(), 0)
                self.assertEqual(SearchQuery.objects.count(), 0)

    @override_settings(BRAINX_PUBLIC_BROWSING=True)
    def test_anonymous_short_query_returns_400_validation_error(self):
        response = self.search_anon(query='al')

        body = assert_envelope(self, response, 'validation_error', 400)
        self.assertIn('query', body['errors'])
        self.assertEqual(SearchSession.objects.count(), 0)
        self.assertEqual(SearchQuery.objects.count(), 0)

    @override_settings(BRAINX_PUBLIC_BROWSING=True)
    def test_anonymous_missing_query_returns_400_validation_error(self):
        response = self.anonymous_client.get(self.url)

        body = assert_envelope(self, response, 'validation_error', 400)
        self.assertIn('query', body['errors'])

    @override_settings(BRAINX_PUBLIC_BROWSING=True)
    def test_anonymous_too_long_query_returns_400_validation_error(self):
        response = self.search_anon(query='a' * 201)

        body = assert_envelope(self, response, 'validation_error', 400)
        self.assertIn('query', body['errors'])

    @override_settings(BRAINX_PUBLIC_BROWSING=True)
    def test_anonymous_search_with_course_date_bounds(self):
        older = self.make_searchable_lesson(
            self.chapter,
            title='Algebre ancienne',
            course_date=date(2026, 8, 15),
        )
        newer = self.make_searchable_lesson(
            self.chapter,
            title='Algebre moderne',
            course_date=date(2026, 9, 15),
        )

        response = self.search_anon(
            query='algebre',
            course_date_from='2026-09-01',
        )

        self.assertEqual(response.status_code, 200)
        self.assertEqual(self.ids(response), [str(newer.pk)])
        self.assertNotIn(str(older.pk), self.ids(response))

    @override_settings(BRAINX_PUBLIC_BROWSING=True)
    def test_anonymous_search_with_sort_course(self):
        # Base course name is "Maths"
        math_lesson = self.make_searchable_lesson(
            self.chapter,
            title='Algebre maths',
        )
        # Create second course "Analyse" which sorts before "Maths" alphabetically
        alpha_course = self.make_course(name='Analyse', position=2)
        alpha_mod = self.make_module(alpha_course, name='Module A')
        alpha_chap = self.make_chapter(alpha_mod, name='Chapitre A')
        alpha_lesson = self.make_searchable_lesson(
            alpha_chap,
            title='Algebre analyse',
            position=1,
        )

        response = self.search_anon(query='algebre', sort='course')

        self.assertEqual(response.status_code, 200)
        self.assertEqual(
            self.ids(response),
            [str(alpha_lesson.pk), str(math_lesson.pk)],
        )

    @override_settings(BRAINX_PUBLIC_BROWSING=True)
    def test_anonymous_search_excludes_unpublished_and_deleted_lessons(self):
        published = self.make_searchable_lesson(
            self.chapter,
            title='Algebre publiee',
            is_published=True,
            is_deleted=False,
        )
        # Unpublished lesson
        self.make_searchable_lesson(
            self.chapter,
            title='Algebre brouillon',
            is_published=False,
            is_deleted=False,
        )
        # Soft-deleted lesson
        self.make_searchable_lesson(
            self.chapter,
            title='Algebre supprimee',
            is_published=True,
            is_deleted=True,
        )
        # Lesson under soft-deleted chapter
        deleted_chapter = self.make_chapter(
            self.module,
            name='Chapitre supprime',
            position=2,
            is_deleted=True,
        )
        self.make_searchable_lesson(
            deleted_chapter,
            title='Algebre orpheline',
            is_published=True,
            is_deleted=False,
            position=1,
        )

        response = self.search_anon(query='algebre')

        self.assertEqual(response.status_code, 200)
        self.assertEqual(self.ids(response), [str(published.pk)])

    @override_settings(BRAINX_PUBLIC_BROWSING=True)
    def test_invalid_token_returns_401_even_when_public_browsing_true(self):
        self.make_searchable_lesson(self.chapter, title='Algebre lineaire')

        response = self.bad_token_client.get(self.url, {'query': 'algebre'})

        assert_envelope(self, response, 'unauthenticated', 401)
        self.assertEqual(SearchSession.objects.count(), 0)
        self.assertEqual(SearchQuery.objects.count(), 0)

    @override_settings(BRAINX_PUBLIC_BROWSING=True)
    def test_anonymous_search_page_two_works_and_mints_no_session(self):
        for i in range(25):
            self.make_searchable_lesson(
                self.chapter,
                title=f'Algebre lesson {i}',
            )

        response = self.search_anon(query='algebre', page=2)

        self.assertEqual(response.status_code, 200)
        body = response.json()
        self.assertGreater(len(body['results']), 0)
        self.assertEqual(body['count'], 25)
        self.assertIsNone(body['search_session_id'])
        self.assertNotIn(SESSION_COOKIE, response.cookies)
        self.assertEqual(SearchSession.objects.count(), 0)
        self.assertEqual(SearchQuery.objects.count(), 0)


class PublicSearchThrottlingTests(PublicSearchTestCase):
    """Rate limiting via AnonRateThrottle (429 with Retry-After header and RFC 9457 envelope)."""

    def setUp(self):
        super().setUp()
        original_rates = AnonRateThrottle.THROTTLE_RATES
        self.addCleanup(setattr, AnonRateThrottle, 'THROTTLE_RATES', original_rates)
        AnonRateThrottle.THROTTLE_RATES = {**original_rates, 'anon': '2/minute'}
        cache.clear()
        self.addCleanup(cache.clear)

    def test_throttle_classes_are_explicitly_declared_on_view(self):
        self.assertEqual(
            SearchLessonView.throttle_classes,
            [AnonRateThrottle, UserRateThrottle],
        )

    @override_settings(BRAINX_PUBLIC_BROWSING=True)
    def test_anonymous_rate_limiting_exceeded_returns_429_with_retry_after(self):
        self.make_searchable_lesson(self.chapter, title='Algebre lineaire')

        # First request allowed
        resp1 = self.search_anon(query='algebre')
        self.assertEqual(resp1.status_code, 200)

        # Second request allowed (limit is 2/minute)
        resp2 = self.search_anon(query='algebre')
        self.assertEqual(resp2.status_code, 200)

        # Third request exceeds limit and gets throttled
        throttled_resp = self.search_anon(query='algebre')
        body = assert_envelope(self, throttled_resp, 'throttled', 429)
        self.assertEqual(body['errors'], {})
        self.assertIn('Retry-After', throttled_resp)
        self.assertGreaterEqual(int(throttled_resp['Retry-After']), 1)

    @override_settings(BRAINX_PUBLIC_BROWSING=True)
    def test_authenticated_rate_limiting_exceeded_returns_429_with_retry_after(self):
        original_rates = UserRateThrottle.THROTTLE_RATES
        self.addCleanup(setattr, UserRateThrottle, 'THROTTLE_RATES', original_rates)
        UserRateThrottle.THROTTLE_RATES = {**original_rates, 'user': '2/minute'}
        cache.clear()

        self.make_searchable_lesson(self.chapter, title='Algebre lineaire')

        resp1 = self.student_client.get(self.url, {'query': 'algebre'})
        self.assertEqual(resp1.status_code, 200)

        resp2 = self.student_client.get(self.url, {'query': 'algebre'})
        self.assertEqual(resp2.status_code, 200)

        throttled_resp = self.student_client.get(self.url, {'query': 'algebre'})
        body = assert_envelope(self, throttled_resp, 'throttled', 429)
        self.assertEqual(body['errors'], {})
        self.assertIn('Retry-After', throttled_resp)
        self.assertGreaterEqual(int(throttled_resp['Retry-After']), 1)

    @override_settings(BRAINX_PUBLIC_BROWSING=True)
    def test_authenticated_user_not_affected_by_anonymous_throttle_bucket(self):
        self.make_searchable_lesson(self.chapter, title='Algebre lineaire')

        # Exhaust the anon throttle
        self.search_anon(query='algebre')
        self.search_anon(query='algebre')
        throttled_anon = self.search_anon(query='algebre')
        self.assertEqual(throttled_anon.status_code, 429)

        # Authenticated student makes requests and is not blocked by anon throttle
        student_resp = self.student_client.get(self.url, {'query': 'algebre'})
        self.assertEqual(student_resp.status_code, 200)


class PublicSearchReversibilityTests(PublicSearchTestCase):
    """Strict reversibility to 401 when BRAINX_PUBLIC_BROWSING=False."""

    @override_settings(BRAINX_PUBLIC_BROWSING=False)
    def test_anonymous_search_rejected_with_401_when_browsing_disabled(self):
        self.make_searchable_lesson(self.chapter, title='Algebre lineaire')

        response = self.search_anon(query='algebre')

        body = assert_envelope(self, response, 'unauthenticated', 401)
        self.assertEqual(body['errors'], {})
        self.assertEqual(SearchSession.objects.count(), 0)
        self.assertEqual(SearchQuery.objects.count(), 0)

    @override_settings(BRAINX_PUBLIC_BROWSING=False)
    def test_authenticated_student_search_allowed_when_browsing_disabled(self):
        self.make_searchable_lesson(self.chapter, title='Algebre lineaire')

        response = self.student_client.get(self.url, {'query': 'algebre'})

        self.assertEqual(response.status_code, 200)
        body = response.json()
        self.assertIsNotNone(body['search_session_id'])
        self.assertIn(SESSION_COOKIE, response.cookies)
        self.assertEqual(SearchSession.objects.count(), 1)
        self.assertEqual(SearchQuery.objects.count(), 1)


class PublicSearchBoundaryProtectionTests(PublicSearchTestCase):
    """Guaranteed 401/403 protection on session actions and aggregate endpoints."""

    @override_settings(BRAINX_PUBLIC_BROWSING=True)
    def test_anonymous_calls_to_session_close_return_401(self):
        response = self.anonymous_client.post(reverse('search-sessions-close'))
        assert_envelope(self, response, 'unauthenticated', 401)

    @override_settings(BRAINX_PUBLIC_BROWSING=True)
    def test_anonymous_calls_to_session_abandon_return_401(self):
        response = self.anonymous_client.post(reverse('search-sessions-abandon'))
        assert_envelope(self, response, 'unauthenticated', 401)

    @override_settings(BRAINX_PUBLIC_BROWSING=True)
    def test_anonymous_calls_to_session_answer_return_401(self):
        response = self.anonymous_client.post(
            reverse('search-sessions-answer'),
            {'found': True},
            format='json',
        )
        assert_envelope(self, response, 'unauthenticated', 401)

    @override_settings(BRAINX_PUBLIC_BROWSING=True)
    def test_anonymous_calls_to_search_aggregate_return_401(self):
        response = self.anonymous_client.get(reverse('search-aggregate'))
        assert_envelope(self, response, 'unauthenticated', 401)

    @override_settings(BRAINX_PUBLIC_BROWSING=True)
    def test_student_calls_to_search_aggregate_return_403(self):
        response = self.student_client.get(reverse('search-aggregate'))
        assert_envelope(self, response, 'permission_denied', 403)


class PublicSearchOpenApiSchemaTests(PublicSearchTestCase):
    """OpenAPI schema declarations for search rate limiting (429)."""

    def test_schema_declares_429_envelope_response_on_search_endpoint(self):
        schema = SchemaGenerator().get_schema(request=None, public=True)
        path = f'{settings.API_PREFIX}/search/lessons/'
        get_op = schema['paths'][path]['get']

        self.assertIn('429', get_op['responses'])
        self.assertEqual(
            get_op['responses']['429']['content']['application/json']['schema']['$ref'],
            '#/components/schemas/ContentErrorResponse',
        )
