"""The capture tables of the search surface (Story 6.1).

Story 6.1 gives `apps.search` its first tables. Neither is read by a Student
read path: `SearchSession` groups one account's searches and `SearchQuery`
records what was searched and how much it matched, so the Publisher's decay
signal (Story 6.4) has data to aggregate. The search endpoint is the only
writer, through `apps.search.capture`, and retention is indefinite - there is
no soft-delete or deletion path here (Story 6.2 owns closing a session;
nothing owns deleting one).
"""

from django.conf import settings
from django.db import models

from apps.core.models import TimeStampedModel, UUIDModel


class SearchSession(UUIDModel, TimeStampedModel):
    """One account's run of searches, minted server-side.

    The id is the UUID primary key, which is what makes it safe to hand to the
    client; the session belongs to exactly one account, so a carried id that
    does not resolve to the caller's own row mints a fresh session instead of
    attaching a query to someone else's (Story 6.1). Story 6.2 adds the open
    state and its lazy idle expiry; this story records only the owner and the
    timestamps.
    """

    # PROTECT: a session is the attribution for the product's retrieval
    # signal, so an account that has searched cannot be deleted out from under
    # it - the same rule every content actor stamp follows.
    user = models.ForeignKey(
        settings.AUTH_USER_MODEL,
        on_delete=models.PROTECT,
        related_name='search_sessions',
    )

    class Meta:
        # Newest session first: the order Story 6.2's resolution check wants.
        ordering = ('-created_at', 'id')

    def __str__(self):
        # Never the owner's email or the query text: this is what a log line
        # or a debugger would print.
        return str(self.pk)


class SearchQuery(UUIDModel, TimeStampedModel):
    """One recorded search: its text and the size of its full matched set.

    Written only by `apps.search.capture`, and only for the first page of a
    search, so paging cannot inflate the number of rows. The acting account is
    reached through `session.user`: a query is never detached from the session
    it grouped into, so attribution is exactly one hop away. `result_count` is
    the count of the whole matched set - not the page size - which is what
    makes a zero-result search distinguishable from a narrow one without a
    second `COUNT`. `query` is capped at 200 characters by the endpoint and
    stripped of control characters before it is written, so the stored text is
    the sanitised form of what was searched.
    """

    session = models.ForeignKey(
        SearchSession,
        on_delete=models.CASCADE,
        related_name='queries',
    )
    query = models.CharField(max_length=200)
    result_count = models.PositiveIntegerField()

    class Meta:
        # Chronological inside a session, with `id` as the final tiebreak.
        ordering = ('created_at', 'id')

    def __str__(self):
        # Deliberately not the query text: a search term must never reach a
        # log, and `__str__` is what a log call or a debugger would print.
        return str(self.pk)
