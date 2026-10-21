"""Live retrieval metric calculations for the search surface (Story 6.3).

SM-1 (successful-rescue rate) and SM-6 (negative-answer rate) are computed live
from raw database records on read. Neither rate is precomputed or stored in the
database.

SM-1 measures:
    (positive answers + un-answered lesson-opened sessions) / total search sessions

SM-6 measures:
    negative answers / total answers given
"""

from .models import CloseReason, SearchAnswer, SearchSession


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



# Canonical and alias names for flexible caller conventions
sm1_successful_rescue_rate = calculate_sm1_rate
sm6_negative_answer_rate = calculate_sm6_rate
calculate_sm1 = calculate_sm1_rate
calculate_sm6 = calculate_sm6_rate
