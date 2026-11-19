"""Live retrieval metric calculations for the search surface (Story 6.3, Story 6.4).

SM-1 (successful-rescue rate), SM-5 (zero-result query share), and SM-6 (negative-answer
rate) are computed live from raw database records on read. None of these rates are
precomputed or stored in the database.

SM-1 measures:
    (positive answers + un-answered lesson-opened sessions) / total search sessions

SM-5 measures:
    zero-result queries / total search queries

SM-6 measures:
    negative answers / total answers given
"""

from django.db.models import Count

from .models import CloseReason, SearchAnswer, SearchQuery, SearchSession


def calculate_sm1_rate(sessions=None):
    """Calculate the SM-1 successful-rescue rate live from search sessions.

    Formula:
        (positive answers + un-answered lesson-opened sessions) / total search sessions

    Returns:
        float: Rate between 0.0 and 1.0 (0.0 if total sessions is 0).
    """
    if sessions is None:
        sessions = SearchSession.objects.all()

    total_sessions = sessions.count()
    if total_sessions == 0:
        return 0.0

    positive_answers = sessions.filter(answer__found=True).count()
    unanswered_lesson_opened = sessions.filter(
        close_reason=CloseReason.LESSON_OPENED,
        answer__isnull=True,
    ).count()

    return (positive_answers + unanswered_lesson_opened) / total_sessions


def calculate_sm5_rate(queries=None):
    """Calculate the SM-5 zero-result query share live from search queries.

    Formula:
        zero_result_queries / total_queries

    Returns:
        float: Rate between 0.0 and 1.0 (0.0 if total queries is 0).
    """
    if queries is None:
        queries = SearchQuery.objects.all()

    total_queries = queries.count()
    if total_queries == 0:
        return 0.0

    zero_result_queries = queries.filter(result_count=0).count()
    return zero_result_queries / total_queries


def calculate_sm6_rate(answers=None, sessions=None):
    """Calculate the SM-6 negative-answer rate live from search answers.

    Formula:
        negative answers / total answers given

    Returns:
        float: Rate between 0.0 and 1.0 (0.0 if total answers is 0).
    """
    if answers is None:
        if sessions is not None:
            try:
                session_pks = list(sessions.values_list('pk', flat=True))
            except Exception:
                session_pks = [s.pk if hasattr(s, 'pk') else s for s in sessions]
            answers = SearchAnswer.objects.filter(session_id__in=session_pks)
        else:
            answers = SearchAnswer.objects.all()

    total_answers = answers.count()
    if total_answers == 0:
        return 0.0

    negative_answers = answers.filter(found=False).count()
    return negative_answers / total_answers


def get_search_aggregate(date_from=None, date_to=None):
    """Compute aggregate retrieval metrics and query summaries over an optional date range.

    Dynamically calculates live on read:
    - total_queries: total count of SearchQuery records in the date window
    - zero_result_queries: count of SearchQuery records in the window with result_count=0
    - zero_result_rate / sm5_rate: live SM-5 rate (0.0 if total_queries == 0)
    - total_answers: total count of SearchAnswer records in the date window
    - negative_answers: count of SearchAnswer records in the window with found=False
    - negative_answer_rate / sm6_rate: live SM-6 rate (0.0 if total_answers == 0)
    - grouped_queries: all queries in the window grouped by query text with counts,
      ordered by descending count, then alphabetical query text
    - grouped_zero_result_queries: zero-result queries in the window grouped by query
      text with counts, ordered by descending count, then alphabetical query text

    Neither rate is precomputed or stored in the database.
    Does not expose student identity or per-student query/session records.
    """
    queries = SearchQuery.objects.all()
    answers = SearchAnswer.objects.all()

    if date_from is not None:
        queries = queries.filter(created_at__date__gte=date_from)
        answers = answers.filter(created_at__date__gte=date_from)
    if date_to is not None:
        queries = queries.filter(created_at__date__lte=date_to)
        answers = answers.filter(created_at__date__lte=date_to)

    total_queries = queries.count()
    zero_result_count = queries.filter(result_count=0).count()
    sm5_rate = zero_result_count / total_queries if total_queries > 0 else 0.0

    total_answers = answers.count()
    negative_answers_count = answers.filter(found=False).count()
    sm6_rate = (
        negative_answers_count / total_answers if total_answers > 0 else 0.0
    )

    zero_result_grouped = list(
        queries.filter(result_count=0)
        .values('query')
        .annotate(count=Count('id'))
        .order_by('-count', 'query')
    )

    all_grouped = list(
        queries.values('query')
        .annotate(count=Count('id'))
        .order_by('-count', 'query')
    )

    return {
        'total_queries': total_queries,
        'zero_result_queries': zero_result_count,
        'total_zero_result_queries': zero_result_count,
        'total_answers': total_answers,
        'negative_answers': negative_answers_count,
        'zero_result_rate': sm5_rate,
        'sm5_rate': sm5_rate,
        'sm5_zero_result_rate': sm5_rate,
        'negative_answer_rate': sm6_rate,
        'sm6_rate': sm6_rate,
        'sm6_negative_answer_rate': sm6_rate,
        'grouped_queries': all_grouped,
        'grouped_zero_result_queries': zero_result_grouped,
        'zero_result_grouped_queries': zero_result_grouped,
    }


# Canonical and alias names for flexible caller conventions
sm1_successful_rescue_rate = calculate_sm1_rate
sm5_zero_result_rate = calculate_sm5_rate
sm6_negative_answer_rate = calculate_sm6_rate
calculate_sm1 = calculate_sm1_rate
calculate_sm5 = calculate_sm5_rate
calculate_sm6 = calculate_sm6_rate
