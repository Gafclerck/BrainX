"""The search capture surface: mint, group, and never break the search.

Story 6.1 pins the whole matrix here: a first search mints one session and
records one query with the full matched-set count, attributed to the acting
account; a carried id groups a second query into the same session; a foreign,
unknown, or non-UUID carried id mints a fresh session and attaches nothing to
the foreign row; a query over the 200-character cap is a 400 that writes
nothing; control characters are stripped before the write; the query text
never reaches a log at any level; only the first page is recorded; the empty,
short, absent and NUL cases write nothing and keep their existing answers; and
a capture write that fails still leaves the search a 200 with its rows.
"""

import logging
from unittest.mock import patch

from django.conf import settings
from django.test import RequestFactory, override_settings

from apps.content.tests.helpers import assert_envelope
from apps.search import capture
from apps.search.models import SearchQuery, SearchSession

from ..views import MAXIMUM_QUERY_LENGTH
from .test_search import SearchTestCase


class _LogCollector(logging.Handler):
    """Collects the formatted message of every record it is handed."""

    def __init__(self):
        super().__init__(level=logging.DEBUG)
        self.messages = []

    def emit(self, record):
        self.messages.append(record.getMessage())


class SearchCaptureTests(SearchTestCase):
    """The Story 6.1 I/O matrix over the search endpoint."""

    def cookie_id(self, response):
        return response.cookies[capture.SESSION_COOKIE].value

    def fill_lectures(self, count):
        # Positions 2..count+1, so `count` matches for the query 'lecture'.
        for position in range(2, count + 2):
            self.make_searchable_lesson(
                self.chapter, title=f'Lecture {position}', position=position
            )

    def test_a_first_search_mints_one_session_and_records_the_query(self):
        self.fill_lectures(25)

        with override_settings(SESSION_COOKIE_SECURE=True):
            response = self.search(query='lecture')

        self.assertEqual(response.status_code, 200)
        body = response.json()
        session = SearchSession.objects.get()
        self.assertEqual(session.user, self.student)
        self.assertEqual(body['search_session_id'], str(session.pk))
        self.assertEqual(self.cookie_id(response), str(session.pk))
        cookie = response.cookies[capture.SESSION_COOKIE]
        self.assertTrue(cookie['httponly'])
        self.assertTrue(cookie['secure'])
        self.assertEqual(cookie['samesite'], settings.SESSION_COOKIE_SAMESITE)
        query_row = SearchQuery.objects.get()
        self.assertEqual(query_row.session, session)
        self.assertEqual(query_row.query, 'lecture')
        # The full matched set, not the 20-row page.
        self.assertEqual(body['count'], 25)
        self.assertEqual(query_row.result_count, 25)

    def test_a_carried_session_groups_the_next_query(self):
        self.make_searchable_lesson(
            self.chapter, title='Algorithms', position=2
        )

        first = self.search(query='algorithms')
        second = self.search(query='algorithms')

        session = SearchSession.objects.get()
        self.assertEqual(first.json()['search_session_id'], str(session.pk))
        self.assertEqual(second.json()['search_session_id'], str(session.pk))
        self.assertEqual(SearchQuery.objects.count(), 2)
        self.assertEqual(
            {row.session_id for row in SearchQuery.objects.all()},
            {session.pk},
        )

    def test_an_unknown_carried_id_mints_a_fresh_session(self):
        unknown = '00000000-0000-4000-8000-000000000000'
        self.student_client.cookies[capture.SESSION_COOKIE] = unknown

        response = self.search(query='algorithms')

        self.assertEqual(response.status_code, 200)
        session = SearchSession.objects.get()
        self.assertNotEqual(str(session.pk), unknown)
        self.assertEqual(response.json()['search_session_id'], str(session.pk))
        self.assertEqual(SearchQuery.objects.get().session, session)

    def test_a_carried_id_that_is_not_a_uuid_mints_a_fresh_session(self):
        self.student_client.cookies[capture.SESSION_COOKIE] = 'not-a-uuid'

        response = self.search(query='algorithms')

        self.assertEqual(response.status_code, 200)
        session = SearchSession.objects.get()
        self.assertEqual(response.json()['search_session_id'], str(session.pk))

    def test_a_foreign_carried_id_attaches_nothing_to_it(self):
        foreign = SearchSession.objects.create(user=self.publisher)
        self.student_client.cookies[capture.SESSION_COOKIE] = str(foreign.pk)

        response = self.search(query='algorithms')

        self.assertEqual(response.status_code, 200)
        self.assertNotEqual(
            response.json()['search_session_id'], str(foreign.pk)
        )
        fresh = SearchSession.objects.exclude(pk=foreign.pk).get()
        self.assertEqual(fresh.user, self.student)
        self.assertEqual(SearchQuery.objects.get().session, fresh)
        self.assertEqual(foreign.queries.count(), 0)

    def test_a_publisher_search_is_attributed_to_the_publisher(self):
        self.make_searchable_lesson(
            self.chapter, title='Algorithms', position=2
        )

        response = self.publisher_client.get(
            self.url, {'query': 'algorithms'}
        )

        self.assertEqual(response.status_code, 200)
        session = SearchSession.objects.get()
        self.assertEqual(session.user, self.publisher)
        self.assertEqual(response.json()['search_session_id'], str(session.pk))
        self.assertEqual(SearchQuery.objects.get().session, session)

    def test_a_query_over_the_cap_is_a_400_that_writes_nothing(self):
        body = assert_envelope(
            self,
            self.search(query='a' * (MAXIMUM_QUERY_LENGTH + 1)),
            'validation_error',
            400,
        )

        self.assertIn('query', body['errors'])
        self.assertEqual(SearchSession.objects.count(), 0)
        self.assertEqual(SearchQuery.objects.count(), 0)

    def test_a_query_of_exactly_the_cap_is_recorded(self):
        response = self.search(query='a' * MAXIMUM_QUERY_LENGTH)

        self.assertEqual(response.status_code, 200)
        self.assertEqual(
            SearchQuery.objects.get().query, 'a' * MAXIMUM_QUERY_LENGTH
        )

    def test_control_characters_are_stripped_before_the_write(self):
        for query, expected in (
            ('algo\x01rithms', 'algorithms'),
            ('data\tstructures', 'datastructures'),
            ('algo\u200brithms', 'algorithms'),
        ):
            with self.subTest(query=repr(query)):
                SearchQuery.objects.all().delete()

                response = self.search(query=query)

                self.assertEqual(response.status_code, 200)
                self.assertEqual(SearchQuery.objects.get().query, expected)

    def test_a_query_of_only_control_characters_is_not_recorded(self):
        response = self.search(query='\x01\x02\x03')

        self.assertEqual(response.status_code, 200)
        self.assertIsNone(response.json()['search_session_id'])
        self.assertNotIn(capture.SESSION_COOKIE, response.cookies)
        self.assertEqual(SearchSession.objects.count(), 0)
        self.assertEqual(SearchQuery.objects.count(), 0)

    def test_an_empty_query_writes_nothing_and_reports_no_session(self):
        self.make_searchable_lesson(
            self.chapter, title='Algorithms', position=2
        )

        response = self.search(query='')

        self.assertEqual(response.status_code, 200)
        body = response.json()
        self.assertEqual(body['count'], 0)
        self.assertEqual(body['results'], [])
        self.assertIsNone(body['search_session_id'])
        self.assertNotIn(capture.SESSION_COOKIE, response.cookies)
        self.assertEqual(SearchSession.objects.count(), 0)
        self.assertEqual(SearchQuery.objects.count(), 0)

    def test_the_short_absent_and_nul_cases_write_nothing(self):
        for params in ({'query': 'ab'}, {}, {'query': 'a\x00b'}):
            with self.subTest(params=params):
                assert_envelope(
                    self,
                    self.student_client.get(self.url, params),
                    'validation_error',
                    400,
                )

        self.assertEqual(SearchSession.objects.count(), 0)
        self.assertEqual(SearchQuery.objects.count(), 0)

    def test_a_later_page_records_nothing(self):
        self.fill_lectures(25)

        first = self.search(query='lecture')
        second = self.search(query='lecture', page=2)

        self.assertEqual(second.status_code, 200)
        second_body = second.json()
        self.assertEqual(second_body['count'], 25)
        self.assertEqual(len(second_body['results']), 5)
        # The key is always present; this page minted no session, so it is
        # null, and the paging recorded nothing new.
        self.assertIn('search_session_id', second_body)
        self.assertIsNone(second_body['search_session_id'])
        self.assertEqual(SearchSession.objects.count(), 1)
        self.assertEqual(SearchQuery.objects.count(), 1)
        self.assertEqual(SearchQuery.objects.get().result_count, 25)
        carried = first.json()['search_session_id']
        self.assertIsNotNone(carried)
        # The id never rides a URL: it is absent from both paging links.
        for link in (second_body['next'], second_body['previous']):
            self.assertNotIn(carried, link or '')

    def test_an_explicit_first_page_is_still_recorded(self):
        response = self.search(query='algorithms', page=1)

        self.assertEqual(response.status_code, 200)
        self.assertIsNotNone(response.json()['search_session_id'])
        self.assertEqual(SearchQuery.objects.count(), 1)

    def test_an_empty_page_is_served_and_recorded_as_the_first_page(self):
        # The paginator serves `?page=` as page one (`... or 1`), so it is the
        # first page and is captured like one.
        response = self.search(query='algorithms', page='')

        self.assertEqual(response.status_code, 200)
        self.assertIsNotNone(response.json()['search_session_id'])
        self.assertEqual(SearchQuery.objects.count(), 1)

    def test_a_capture_failure_still_answers_with_its_rows(self):
        lesson = self.make_searchable_lesson(
            self.chapter, title='Algorithms', position=2
        )

        with patch(
            'apps.search.capture.record_search',
            side_effect=RuntimeError('capture down'),
        ):
            response = self.search(query='algorithms')

        self.assertEqual(response.status_code, 200)
        body = response.json()
        self.assertEqual(body['count'], 1)
        self.assertEqual(
            [row['id'] for row in body['results']], [str(lesson.pk)]
        )
        self.assertIsNone(body['search_session_id'])
        self.assertEqual(SearchSession.objects.count(), 0)
        self.assertEqual(SearchQuery.objects.count(), 0)

    def test_the_capture_port_swallows_its_own_write_failure(self):
        request = RequestFactory().get('/api/v1/search/lessons/')
        request.user = self.student

        with patch.object(
            SearchQuery.objects,
            'create',
            side_effect=RuntimeError('write down'),
        ):
            with self.assertLogs('apps.search.capture', level='WARNING') as logs:
                session_id = capture.record_search(request, 'algorithms', 3)

        self.assertIsNone(session_id)
        self.assertEqual(SearchQuery.objects.count(), 0)
        # The mint and the write are one unit, so the failed insert left no
        # orphaned session behind; the failure is swallowed, and the warning
        # names only the exception class.
        self.assertEqual(SearchSession.objects.count(), 0)
        for message in logs.output:
            self.assertNotIn('algorithms', message)

    def test_the_query_text_never_reaches_a_log(self):
        text = 'xyzzy-secret-query'
        self.make_searchable_lesson(
            self.chapter, title='Algorithms', position=2
        )
        collector = _LogCollector()
        root = logging.getLogger()
        previous_level = root.level
        root.addHandler(collector)
        root.setLevel(logging.DEBUG)
        try:
            self.search(query=text)
            # Even the failure path, where capture does log, must not carry
            # the text: the exception's own message can hold a parameter.
            with patch(
                'apps.search.capture._capture',
                side_effect=RuntimeError(text),
            ):
                self.search(query=text)
        finally:
            root.removeHandler(collector)
            root.setLevel(previous_level)

        # The second search emitted capture's failure warning ...
        self.assertTrue(collector.messages)
        # ... and no record, at any level, carried the query text.
        for message in collector.messages:
            self.assertNotIn(text, message)
