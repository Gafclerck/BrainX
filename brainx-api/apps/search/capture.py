"""The capture port: the only writer of the search session tables (Story 6.1, 6.2).

Capture is instrumentation, not the product. It records the query text and the
size of the matched set so the Publisher's decay signal (Story 6.4) has data to
aggregate, and a write that fails is swallowed, because retrieval is the
product. `SearchLessonView` is the only caller, and this module is the only
place that writes `SearchSession` or `SearchQuery` - the endpoint itself gains
no ORM call.

The identifier travels as an `HttpOnly` cookie, never in a URL. A GET cannot
carry a body, so the cookie is what lets a later search group into the same
session. A carried id is reused only when it resolves to an open, unexpired
session owned by the caller; anything else - a foreign session, an unknown id,
a closed or expired session, or a value that is not a UUID at all - mints a
fresh one, so there is still no client-minted path.

Story 6.2 adds the lifecycle state (`open`, `closed`), the lazy 30-minute idle
expiry, and explicit close actions (`lesson_opened`, `abandoned`). The single
resolution authority is `resolve_session`, which returns uniform 404 for any
failed leg.

The query text never reaches a log, at any level. Length rules belong to the
endpoint; here the text is stripped of control characters before it is
written, because a control character in a stored value or a log line forges
entries in a plain handler (AD-13).
"""

from datetime import timedelta
import logging
import unicodedata
import uuid

from django.db import transaction
from django.http import Http404
from django.utils import timezone

from .models import CloseReason, SearchQuery, SearchSession, SessionState

logger = logging.getLogger(__name__)

# The cookie the search endpoint sets and reads back. The same id also rides
# the 200 body for the SPA; the cookie is the transport a later GET can use.
SESSION_COOKIE = 'search_session_id'

# A search session times out after 30 minutes of inactivity. Expiration is
# evaluated lazily on read with no background workers or external caches.
IDLE_TIMEOUT = timedelta(minutes=30)


def strip_control_characters(text):
    """Drop every Unicode "Other" character from `text` (AD-13).

    Controls, format characters (joiners, zero-width marks), surrogates,
    private-use and unassigned codepoints are all safe to drop from a search
    term: none is meaningful to the match, and any of them can forge a line in
    a stored value or a log. The endpoint applies its length rules first, so
    stripping can only shorten an already accepted value.
    """
    return ''.join(
        character
        for character in text
        if not unicodedata.category(character).startswith('C')
    )


def resolve_session(user, session_id):
    """The single resolution authority for any search session id (Story 6.2).

    Verifies UUID format, database existence, ownership (`session.user == user`),
    open state (`session.state == 'open'`), and inactivity <= 30 minutes
    (`now - last_activity_at`).

    Any failed leg raises `Http404` (rendered as the uniform `not_found` envelope),
    with no oracle distinguishing unknown, foreign, closed, expired, or
    malformed session IDs. If expired, the session is lazily marked closed in
    the database (`closed_at=last_activity_at + 30m`, `close_reason='idle_expired'`)
    before the 404 is raised.
    """
    if not session_id:
        raise Http404

    if isinstance(session_id, uuid.UUID):
        parsed_id = session_id
    else:
        try:
            parsed_id = uuid.UUID(str(session_id))
        except (ValueError, TypeError, AttributeError):
            raise Http404

    try:
        session = SearchSession.objects.get(pk=parsed_id)
    except SearchSession.DoesNotExist:
        raise Http404

    if session.user_id != user.id:
        raise Http404

    if session.state != SessionState.OPEN:
        raise Http404

    now = timezone.now()
    if now - session.last_activity_at > IDLE_TIMEOUT:
        session.state = SessionState.CLOSED
        session.closed_at = session.last_activity_at + IDLE_TIMEOUT
        session.close_reason = CloseReason.IDLE_EXPIRED
        session.save(
            update_fields=['state', 'closed_at', 'close_reason', 'updated_at']
        )
        raise Http404

    return session


def close_session(session, reason=CloseReason.LESSON_OPENED):
    """Mark `session` closed with the given `reason` and current timestamp."""
    session.state = SessionState.CLOSED
    session.closed_at = timezone.now()
    session.close_reason = reason
    session.save(
        update_fields=['state', 'closed_at', 'close_reason', 'updated_at']
    )
    return session


def record_search(request, query, result_count):
    """Record `query` for the caller; return the session id, or None.

    Resolves the carried cookie to a session owned by `request.user`, minting
    a fresh one when there is nothing valid to reuse, then writes the query
    with the size of its full matched set. Never raises: a capture failure
    costs a recorded query, never the search. `None` means nothing was
    captured - the text had no printable content left, or the write failed -
    and the caller still answers 200 with a null `search_session_id`.
    """
    try:
        return _capture(request, query, result_count)
    except Exception as error:
        # The error's own text is never logged: a driver error can echo a
        # parameter, and the query text must never reach a log (AD-13). The
        # exception class is enough to find the failure.
        logger.warning('search capture skipped: %s', error.__class__.__name__)
        return None


def _capture(request, query, result_count):
    """The write behind `record_search`, without the failure guard."""
    text = strip_control_characters(query)
    if not text:
        # Nothing printable survived: record nothing and mint nothing, the
        # same answer an empty query gets.
        return None
    # Mint and write are one unit: a failed insert must not leave a session
    # with no query behind it, or the next search would reuse a session that
    # recorded nothing.
    with transaction.atomic():
        session, created = _session_for(request)
        SearchQuery.objects.create(
            session=session,
            query=text,
            result_count=result_count,
        )
        if not created:
            session.last_activity_at = timezone.now()
            session.save(update_fields=['last_activity_at', 'updated_at'])
        return session.pk


def _session_for(request):
    """The caller's own session named by the cookie, or a freshly minted one."""
    raw = request.COOKIES.get(SESSION_COOKIE)
    if raw:
        try:
            return resolve_session(request.user, raw), False
        except Http404:
            pass
    return SearchSession.objects.create(user=request.user), True
