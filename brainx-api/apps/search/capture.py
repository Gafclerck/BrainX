"""The capture port: the only writer of the search session tables (Story 6.1).

Capture is instrumentation, not the product. It records the query text and the
size of the matched set so the Publisher's decay signal (Story 6.4) has data to
aggregate, and a write that fails is swallowed, because retrieval is the
product. `SearchLessonView` is the only caller, and this module is the only
place that writes `SearchSession` or `SearchQuery` - the endpoint itself gains
no ORM call.

The identifier travels as an `HttpOnly` cookie, never in a URL. A GET cannot
carry a body, so the cookie is what lets a later search group into the same
session. A carried id is reused only when it resolves to a session owned by
the caller; anything else - a foreign session, an unknown id, or a value that
is not a UUID at all - mints a fresh one, so there is still no client-minted
path.

The query text never reaches a log, at any level. Length rules belong to the
endpoint; here the text is stripped of control characters before it is
written, because a control character in a stored value or a log line forges
entries in a plain handler (AD-13).
"""

import logging
import unicodedata
import uuid

from django.db import transaction

from .models import SearchQuery, SearchSession

logger = logging.getLogger(__name__)

# The cookie the search endpoint sets and reads back. The same id also rides
# the 200 body for the SPA; the cookie is the transport a later GET can use.
SESSION_COOKIE = 'search_session_id'


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
        session = _session_for(request)
        SearchQuery.objects.create(
            session=session,
            query=text,
            result_count=result_count,
        )
        return session.pk


def _session_for(request):
    """The caller's own session named by the cookie, or a freshly minted one."""
    candidate = _cookie_session_id(request)
    if candidate is not None:
        session = SearchSession.objects.filter(
            pk=candidate, user=request.user
        ).first()
        if session is not None:
            return session
    return SearchSession.objects.create(user=request.user)


def _cookie_session_id(request):
    """The carried id as a UUID, or None when absent or not a UUID at all.

    A forged or truncated cookie is not an error: it names nothing, so the
    caller gets a fresh session exactly as for any other unknown id.
    """
    raw = request.COOKIES.get(SESSION_COOKIE)
    if not raw:
        return None
    try:
        return uuid.UUID(raw)
    except (AttributeError, TypeError, ValueError):
        return None
