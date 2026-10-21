"""The Student search surface: one endpoint over the denormalised document.

Search spans every Course and reads through the same ports browse and Lesson
detail use: `Lesson.objects.visible()` for the rows and `visible_content()`
for the ancestor walk, so a draft, a soft-deleted row, or a live Lesson under
a removed container is as invisible here as it is in browse - there is no
search-local visibility filter. Matching is a case-insensitive partial word
against `Lesson.search_document` (Story 5.4: title, description, Publisher
keywords, Module name and Chapter name in one column) and never touches a
Resource: no file content, file name or storage read ever enters the match,
and the read path is database-only.

Each row is Story 5.1's context shape (`BrowseLessonSerializer`) in Story
5.1's total order, with a single relevance axis inserted after the course
date. The relevance is a `TrigramWordSimilarity` over the uppercased document
wrapped so it can never be NULL, so a document too short for the trigram
machinery can never sort unpredictably under `DESC` (the EC2 deferral Story
5.1's review left open, settled here). The optional `sort` parameter replaces
the leading date key of the shared order with the course name
(`sort=course`); any value other than `date` or `course` is a 400 naming
`sort`.

`query` is required: absent is a 400 naming `query`; an empty or
whitespace-only value is a 200 with zero results; a non-empty value shorter
than three characters is a 400 - the length is checked after the trim, so
`" al "` is rejected like `ab`. Pagination is the shared `list_response`,
fixed at 20, with no `page_size`.

The optional inclusive `course_date_from`/`course_date_to` bounds (Story
5.6) narrow any match to an inclusive `YYYY-MM-DD` window on
`Lesson.course_date`. They parse string-only through the shared parser
browse uses, after `query` and `sort` are validated and ahead of the
empty-query answer: a malformed bound is a 400 naming the field whenever
`query` and `sort` are otherwise valid (an invalid `query` or `sort` is
named first), and the window applies before the shared order -
`sort=course` re-orders the rows the window selected, it never widens them.

`query` is capped at 200 characters (Story 6.1): a longer one is a 400
naming `query`, never truncated. The same story makes the endpoint the
capture surface for FR-20: once the first page's listing is built, its
result count and the query text are recorded through `capture`, which is the
only writer of the session tables, and the session id is handed to the client
both in the 200 body and as an `HttpOnly` cookie. A later page records
nothing, an empty or rejected query records nothing, and a capture failure
never turns the search into an error; the id is never placed in a URL.

Story 6.2 adds session lifecycle management: `SearchSessionCloseView` and
`SearchSessionAbandonView` close active sessions, with abandon clearing the
transport cookie.

Story 6.4 adds `SearchAggregateView` providing the Publisher aggregate view over
search queries, answers, and live retrieval decay signals (SM-5, SM-6).
"""

from django.conf import settings
from django.contrib.postgres.search import TrigramWordSimilarity
from django.db import IntegrityError
from django.db.models import FloatField, Value
from django.db.models.functions import Coalesce, Upper
from drf_spectacular.utils import (
    OpenApiParameter,
    extend_schema,
    inline_serializer,
)
from rest_framework import serializers, status
from rest_framework.exceptions import ValidationError
from rest_framework.generics import GenericAPIView
from rest_framework.permissions import IsAuthenticated
from rest_framework.response import Response

from apps.content.date_filters import course_date_range, filter_course_date
from apps.content.models import Lesson
from apps.content.ordering import lesson_order, order_lessons
from apps.content.serializers import BrowseLessonSerializer
from apps.content.views import ENVELOPE_RESPONSE, list_response
from apps.content.visibility import visible_content
from apps.core.exceptions import Conflict
from apps.core.permissions import IsPublisher

from . import capture
from .date_filters import parse_date_range
from .metrics import get_search_aggregate
from .models import CloseReason, SearchAnswer

# The shortest query that can match: trigrams need at least three characters.
MINIMUM_QUERY_LENGTH = 3

# The longest query the endpoint accepts, so capture cannot store an
# unbounded client string in a `CharField(200)` - rejected, never truncated.
MAXIMUM_QUERY_LENGTH = 200

# The search 200: the shared paginated frame plus the capture session id,
# which the body always carries (null when no session was minted). It is
# documented here rather than only returned, so the operation's contract stays
# honest; no other listing carries the key, hence a search-local component.
SEARCH_RESPONSE = inline_serializer(
    name='PaginatedSearchLessonList',
    fields={
        'count': serializers.IntegerField(),
        'next': serializers.URLField(allow_null=True, required=False),
        'previous': serializers.URLField(allow_null=True, required=False),
        'results': BrowseLessonSerializer(many=True),
        'search_session_id': serializers.UUIDField(allow_null=True),
    },
)

# The session status response returned on close or abandon.
SEARCH_SESSION_STATUS_RESPONSE = inline_serializer(
    name='SearchSessionStatusResponse',
    fields={
        'search_session_id': serializers.UUIDField(),
        'state': serializers.CharField(),
        'close_reason': serializers.CharField(),
    },
)

VALID_CLIENT_CLOSE_REASONS = (
    CloseReason.LESSON_OPENED,
    CloseReason.ABANDONED,
)

SEARCH_SESSION_CLOSE_REQUEST = inline_serializer(
    name='SearchSessionCloseRequest',
    fields={
        'search_session_id': serializers.UUIDField(required=False),
        'reason': serializers.ChoiceField(
            choices=VALID_CLIENT_CLOSE_REASONS,
            required=False,
            default=CloseReason.LESSON_OPENED,
        ),
    },
)

SEARCH_SESSION_ABANDON_REQUEST = inline_serializer(
    name='SearchSessionAbandonRequest',
    fields={
        'search_session_id': serializers.UUIDField(required=False),
    },
)


class SearchSessionAnswerRequestSerializer(serializers.Serializer):
    search_session_id = serializers.UUIDField(required=False)
    session_id = serializers.UUIDField(required=False)
    found = serializers.BooleanField(required=True)


class SearchSessionAnswerResponseSerializer(serializers.Serializer):
    search_session_id = serializers.UUIDField()
    found = serializers.BooleanField()


SEARCH_SESSION_ANSWER_REQUEST = SearchSessionAnswerRequestSerializer
SEARCH_SESSION_ANSWER_RESPONSE = SearchSessionAnswerResponseSerializer


class GroupedQuerySerializer(serializers.Serializer):
    query = serializers.CharField()
    count = serializers.IntegerField()


class SearchAggregateResponseSerializer(serializers.Serializer):
    total_queries = serializers.IntegerField()
    zero_result_queries = serializers.IntegerField()
    total_zero_result_queries = serializers.IntegerField(required=False)
    total_answers = serializers.IntegerField()
    negative_answers = serializers.IntegerField()
    zero_result_rate = serializers.FloatField()
    sm5_rate = serializers.FloatField()
    sm5_zero_result_rate = serializers.FloatField(required=False)
    negative_answer_rate = serializers.FloatField()
    sm6_rate = serializers.FloatField()
    sm6_negative_answer_rate = serializers.FloatField(required=False)
    grouped_queries = GroupedQuerySerializer(many=True)
    grouped_zero_result_queries = GroupedQuerySerializer(many=True)
    zero_result_grouped_queries = GroupedQuerySerializer(many=True, required=False)


SEARCH_AGGREGATE_RESPONSE = SearchAggregateResponseSerializer



# The accepted `sort` values. `date` is the search total order; `course`
# re-places its leading date key with the course name.
SORT_CHOICES = ('date', 'course')
DEFAULT_SORT = 'date'

# The name of the relevance annotation the ordering refers to.
RELEVANCE = 'relevance'


def _extract_session_id(request):
    """The session id from body, header, or cookie, or None."""
    if isinstance(request.data, dict):
        if 'search_session_id' in request.data:
            return request.data.get('search_session_id')
        if 'session_id' in request.data:
            return request.data.get('session_id')
    header_val = request.headers.get('X-Search-Session-Id')
    if header_val and header_val.strip():
        return header_val.strip()
    return request.COOKIES.get(capture.SESSION_COOKIE)


class SearchLessonView(GenericAPIView):
    """Find visible Lessons across every Course by text (Story 5.4)."""

    permission_classes = [IsAuthenticated]

    @extend_schema(
        parameters=[
            OpenApiParameter(
                name='query',
                type=str,
                required=True,
                description=(
                    'The text to match, case-insensitively and partially, '
                    'against the Lesson search document. Empty returns no '
                    'rows; under three characters is rejected, and a query '
                    'over 200 characters is rejected rather than truncated.'
                ),
            ),
            OpenApiParameter(
                name='sort',
                type=str,
                required=False,
                enum=SORT_CHOICES,
                default=DEFAULT_SORT,
                description=(
                    '`date` is the default course-date order; `course` '
                    're-orders the same rows by course name ascending.'
                ),
            ),
            OpenApiParameter(
                name='course_date_from',
                type=str,
                required=False,
                description=(
                    'Inclusive lower bound on the lesson course date, '
                    'written as YYYY-MM-DD.'
                ),
            ),
            OpenApiParameter(
                name='course_date_to',
                type=str,
                required=False,
                description=(
                    'Inclusive upper bound on the lesson course date, '
                    'written as YYYY-MM-DD.'
                ),
            ),
        ],
        responses={
            200: SEARCH_RESPONSE,
            400: ENVELOPE_RESPONSE,
            401: ENVELOPE_RESPONSE,
        },
    )
    def get(self, request):
        query = self._validated_query(request)
        sort = self._validated_sort(request)
        # String-only, so a malformed window is the 400 that names the field
        # even when the query itself would answer with no rows.
        bounds = course_date_range(request)

        # An empty query is a valid request with no answer, not an error, and
        # mints no session: its 200 carries a null `search_session_id`.
        if not query:
            return self._answer(
                list_response(
                    self,
                    order_lessons(Lesson.objects.none()),
                    BrowseLessonSerializer,
                ),
                session_id=None,
            )

        visible = visible_content()
        lessons = (
            Lesson.objects.visible()
            .select_related('chapter__module__course')
            .filter(chapter__in=visible.chapters)
            .filter(search_document__icontains=query)
            # Both sides are uppercased in SQL - the column and the literal
            # wrapped in `Upper()` - so relevance folds the query exactly as
            # the `icontains` match does (Python's `upper()` and PostgreSQL's
            # disagree on characters like `fi` ligatures and `ss`, so folding
            # the literal in Python would rank on differently-folded text).
            # The `Coalesce` is the never-NULL decision: a document too
            # short for a trigram scores 0.0 rather than NULL, so the
            # descending key always compares real numbers.
            .annotate(
                **{
                    RELEVANCE: Coalesce(
                        TrigramWordSimilarity(
                            Upper(Value(query)), Upper('search_document')
                        ),
                        Value(0.0),
                        output_field=FloatField(),
                    )
                }
            )
        )
        # The window narrows the matched rows before either sort mode sees
        # them: `sort=course` re-orders the selection, never widens it.
        lessons = filter_course_date(lessons, bounds)
        if sort == 'course':
            # The course sort is the one-slot substitution the 2026-10-18
            # decision defines: the shared order's leading date key is
            # replaced by the course name, and relevance, the positions and
            # `id` follow unchanged.
            lessons = lessons.order_by(
                'chapter__module__course__name',
                *lesson_order(relevance=RELEVANCE)[1:],
            )
        else:
            lessons = order_lessons(lessons, relevance=RELEVANCE)
        response = list_response(self, lessons, BrowseLessonSerializer)
        # Capture rides the listing: the count it records is the paginator's
        # own, so it costs no extra COUNT.
        session_id = self._captured_session_id(request, query, response)
        return self._answer(response, session_id)

    def _captured_session_id(self, request, query, response):
        """The session this search belongs to, or None when nothing is captured.

        Only the first page is captured: a `page>1` request answers exactly as
        before and records nothing, so paging cannot inflate the zero-result
        share. The page is compared as a number, because the paginator treats
        spellings like `01`, `+1` or ` 1` as page one. Capture is additive
        instrumentation, so the call is guarded even though the port already
        swallows its own failures - a capture failure must never turn a valid
        search into an error.
        """
        page = request.query_params.get('page')
        if page is not None:
            try:
                # The paginator serves an empty value as page one
                # (`... or 1`), so `?page=` is treated the same here.
                first_page = int(page or 1) <= 1
            except (TypeError, ValueError):
                # A value the paginator cannot parse never reaches capture; it
                # has already been answered with a 404.
                first_page = False
            if not first_page:
                return None
        try:
            return capture.record_search(
                request, query, response.data['count']
            )
        except Exception:
            return None

    def _answer(self, response, session_id):
        """Add the session id to the 200 body and, when there is one, its cookie.

        The id is handed over both ways: the SPA reads the top-level body key,
        and the `HttpOnly` cookie is what groups a later GET, which cannot
        carry a body. It is never in a URL. With no session minted (an empty
        query, a later page, a failed capture) the key is null and no cookie is
        set.
        """
        response.data['search_session_id'] = (
            None if session_id is None else str(session_id)
        )
        if session_id is not None:
            response.set_cookie(
                capture.SESSION_COOKIE,
                str(session_id),
                httponly=True,
                secure=settings.SESSION_COOKIE_SECURE,
                samesite=settings.SESSION_COOKIE_SAMESITE,
            )
        return response

    def _validated_query(self, request):
        """The trimmed `query`, or the 400 that names it.

        Absent is a 400, because the parameter is required. A NUL byte is a
        400, because PostgreSQL cannot store it in a text parameter. A
        supplied empty or whitespace-only value is valid and returns no rows.
        Anything else is length-checked after the trim - a minimum of
        `MINIMUM_QUERY_LENGTH` and a maximum of `MAXIMUM_QUERY_LENGTH`, the
        latter rejected rather than truncated - so `" al "` is rejected like
        `ab` and a 201-character query is rejected whole.
        """
        raw = request.query_params.get('query')
        if raw is None:
            raise ValidationError(
                {'query': ['this query parameter is required']}
            )
        # PostgreSQL rejects NUL bytes in text with a DataError, which would
        # escape the envelope as a 500; reject them here as the same 400
        # every other bad `query` gets.
        if '\x00' in raw:
            raise ValidationError(
                {'query': ['a search query cannot contain NUL bytes']}
            )
        query = raw.strip()
        if query and len(query) < MINIMUM_QUERY_LENGTH:
            raise ValidationError(
                {
                    'query': [
                        f'a search query must be at least '
                        f'{MINIMUM_QUERY_LENGTH} characters long'
                    ]
                }
            )
        if len(query) > MAXIMUM_QUERY_LENGTH:
            raise ValidationError(
                {
                    'query': [
                        f'a search query must be at most '
                        f'{MAXIMUM_QUERY_LENGTH} characters long'
                    ]
                }
            )
        return query

    def _validated_sort(self, request):
        """The `sort` value, defaulting to the date order; unknown is a 400."""
        sort = request.query_params.get('sort', DEFAULT_SORT)
        if sort not in SORT_CHOICES:
            raise ValidationError(
                {'sort': [f'sort must be one of: {", ".join(SORT_CHOICES)}']}
            )
        return sort


class SearchSessionCloseView(GenericAPIView):
    """Explicitly close a search session (Story 6.2).

    Resolves the session through `capture.resolve_session`, ensuring existence,
    caller ownership, open state, and idle timeout <= 30 minutes. An invalid,
    foreign, closed, or expired session answers uniform 404. Closes with
    `close_reason='lesson_opened'` by default, or an optional reason from the
    body. If closed as `abandoned`, the cookie is cleared.
    """

    permission_classes = [IsAuthenticated]

    @extend_schema(
        parameters=[
            OpenApiParameter(
                name='X-Search-Session-Id',
                type=str,
                location=OpenApiParameter.HEADER,
                required=False,
                description='The search session id when not sent in body or cookie.',
            ),
        ],
        request=SEARCH_SESSION_CLOSE_REQUEST,
        responses={
            200: SEARCH_SESSION_STATUS_RESPONSE,
            400: ENVELOPE_RESPONSE,
            401: ENVELOPE_RESPONSE,
            404: ENVELOPE_RESPONSE,
        },
    )
    def post(self, request):
        session_id = _extract_session_id(request)
        session = capture.resolve_session(request.user, session_id)

        reason = CloseReason.LESSON_OPENED
        if isinstance(request.data, dict):
            if 'reason' in request.data:
                candidate = request.data.get('reason')
                if not candidate or candidate not in VALID_CLIENT_CLOSE_REASONS:
                    raise ValidationError(
                        {
                            'reason': [
                                f'reason must be one of: {", ".join(VALID_CLIENT_CLOSE_REASONS)}'
                            ]
                        }
                    )
                reason = candidate
            elif 'close_reason' in request.data:
                candidate = request.data.get('close_reason')
                if not candidate or candidate not in VALID_CLIENT_CLOSE_REASONS:
                    raise ValidationError(
                        {
                            'reason': [
                                f'reason must be one of: {", ".join(VALID_CLIENT_CLOSE_REASONS)}'
                            ]
                        }
                    )
                reason = candidate

        capture.close_session(session, reason=reason)
        response = Response(
            {
                'search_session_id': str(session.pk),
                'state': session.state,
                'close_reason': session.close_reason,
            },
            status=status.HTTP_200_OK,
        )
        if reason == CloseReason.ABANDONED:
            response.delete_cookie(
                capture.SESSION_COOKIE,
                samesite=settings.SESSION_COOKIE_SAMESITE,
            )
        return response


class SearchSessionAbandonView(GenericAPIView):
    """Explicitly abandon a search session and clear its cookie (Story 6.2)."""

    permission_classes = [IsAuthenticated]

    @extend_schema(
        parameters=[
            OpenApiParameter(
                name='X-Search-Session-Id',
                type=str,
                location=OpenApiParameter.HEADER,
                required=False,
                description='The search session id when not sent in body or cookie.',
            ),
        ],
        request=SEARCH_SESSION_ABANDON_REQUEST,
        responses={
            200: SEARCH_SESSION_STATUS_RESPONSE,
            401: ENVELOPE_RESPONSE,
            404: ENVELOPE_RESPONSE,
        },
    )
    def post(self, request):
        session_id = _extract_session_id(request)
        session = capture.resolve_session(request.user, session_id)
        capture.close_session(session, reason=CloseReason.ABANDONED)
        response = Response(
            {
                'search_session_id': str(session.pk),
                'state': session.state,
                'close_reason': session.close_reason,
            },
            status=status.HTTP_200_OK,
        )
        response.delete_cookie(
            capture.SESSION_COOKIE,
            samesite=settings.SESSION_COOKIE_SAMESITE,
        )
        return response


class SearchSessionAnswerView(GenericAPIView):
    """Record a Student's one-time answer to 'did you find it?' (Story 6.3).

    Resolves the session through `capture.resolve_session_for_answer`, ensuring
    existence, caller ownership, eligible lifecycle state (`lesson_opened` or `open`),
    and idle timeout <= 30 minutes. An invalid, foreign, closed (abandoned/idle_expired),
    or expired session answers uniform 404 with no existence oracle.

    If the session already has an associated answer, rejects with 409 Conflict.
    Answers are strictly append-only; an outcome can never be updated, restated,
    or overwritten. If submitted while the session is open, closes the session
    with `close_reason='lesson_opened'`.
    """

    permission_classes = [IsAuthenticated]
    serializer_class = SEARCH_SESSION_ANSWER_REQUEST

    @extend_schema(
        parameters=[
            OpenApiParameter(
                name='X-Search-Session-Id',
                type=str,
                location=OpenApiParameter.HEADER,
                required=False,
                description='The search session id when not sent in body or cookie.',
            ),
        ],
        request=SEARCH_SESSION_ANSWER_REQUEST,
        responses={
            201: SEARCH_SESSION_ANSWER_RESPONSE,
            400: ENVELOPE_RESPONSE,
            401: ENVELOPE_RESPONSE,
            404: ENVELOPE_RESPONSE,
            409: ENVELOPE_RESPONSE,
        },
    )
    def post(self, request):
        session_id = _extract_session_id(request)
        session = capture.resolve_session_for_answer(request.user, session_id)

        if SearchAnswer.objects.filter(session=session).exists():
            raise Conflict(
                'An answer has already been recorded for this search session.'
            )

        serializer = self.get_serializer(data=request.data)
        serializer.is_valid(raise_exception=True)
        found = serializer.validated_data['found']

        try:
            answer = capture.record_answer(session, found)
        except IntegrityError:
            raise Conflict(
                'An answer has already been recorded for this search session.'
            )

        return Response(
            {
                'search_session_id': str(session.pk),
                'found': answer.found,
            },
            status=status.HTTP_201_CREATED,
        )


class SearchAggregateView(GenericAPIView):
    """Publisher aggregate view over search queries, answers, and decay signals (Story 6.4).

    Returns dynamic SM-5 (zero-result query share), SM-6 (negative-answer rate),
    totals, and grouped query texts over an optional inclusive calendar date range
    bounded by `date_from` and `date_to` (YYYY-MM-DD).

    Requires Publisher privilege: unauthenticated callers receive 401; authenticated
    non-publishers (Students) receive 403.
    Contains no student identity fields and no per-student query histories.
    """

    permission_classes = [IsAuthenticated, IsPublisher]
    serializer_class = SEARCH_AGGREGATE_RESPONSE

    @extend_schema(
        parameters=[
            OpenApiParameter(
                name='date_from',
                type=str,
                location=OpenApiParameter.QUERY,
                required=False,
                description='Optional inclusive lower date bound written strictly as YYYY-MM-DD.',
            ),
            OpenApiParameter(
                name='date_to',
                type=str,
                location=OpenApiParameter.QUERY,
                required=False,
                description='Optional inclusive upper date bound written strictly as YYYY-MM-DD.',
            ),
        ],
        responses={
            200: SEARCH_AGGREGATE_RESPONSE,
            400: ENVELOPE_RESPONSE,
            401: ENVELOPE_RESPONSE,
            403: ENVELOPE_RESPONSE,
        },
    )
    def get(self, request):
        date_from, date_to = parse_date_range(request)
        data = get_search_aggregate(date_from=date_from, date_to=date_to)
        serializer = self.get_serializer(data)
        return Response(serializer.data, status=status.HTTP_200_OK)


