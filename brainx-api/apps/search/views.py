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
"""

from django.contrib.postgres.search import TrigramWordSimilarity
from django.db.models import FloatField, Value
from django.db.models.functions import Coalesce, Upper
from drf_spectacular.utils import OpenApiParameter, extend_schema
from rest_framework.exceptions import ValidationError
from rest_framework.generics import GenericAPIView
from rest_framework.permissions import IsAuthenticated

from apps.content.models import Lesson
from apps.content.ordering import lesson_order, order_lessons
from apps.content.serializers import BrowseLessonSerializer
from apps.content.views import ENVELOPE_RESPONSE, list_response
from apps.content.visibility import visible_content

# The shortest query that can match: trigrams need at least three characters.
MINIMUM_QUERY_LENGTH = 3

# The accepted `sort` values. `date` is the search total order; `course`
# re-places its leading date key with the course name.
SORT_CHOICES = ('date', 'course')
DEFAULT_SORT = 'date'

# The name of the relevance annotation the ordering refers to.
RELEVANCE = 'relevance'


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
                    'rows; under three characters is rejected.'
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
        ],
        responses={
            200: BrowseLessonSerializer(many=True),
            400: ENVELOPE_RESPONSE,
            401: ENVELOPE_RESPONSE,
        },
    )
    def get(self, request):
        query = self._validated_query(request)
        sort = self._validated_sort(request)

        # An empty query is a valid request with no answer, not an error.
        if not query:
            return list_response(
                self,
                order_lessons(Lesson.objects.none()),
                BrowseLessonSerializer,
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
        return list_response(self, lessons, BrowseLessonSerializer)

    def _validated_query(self, request):
        """The trimmed `query`, or the 400 that names it.

        Absent is a 400, because the parameter is required. A NUL byte is a
        400, because PostgreSQL cannot store it in a text parameter. A
        supplied empty or whitespace-only value is valid and returns no rows.
        Anything else is length-checked after the trim, so `" al "` is
        rejected like `ab`.
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
        return query

    def _validated_sort(self, request):
        """The `sort` value, defaulting to the date order; unknown is a 400."""
        sort = request.query_params.get('sort', DEFAULT_SORT)
        if sort not in SORT_CHOICES:
            raise ValidationError(
                {'sort': [f'sort must be one of: {", ".join(SORT_CHOICES)}']}
            )
        return sort
