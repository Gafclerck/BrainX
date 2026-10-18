"""The inclusive course-date bounds of the lesson read paths (Story 5.6).

Browse and search both accept `course_date_from` and `course_date_to` as
optional query parameters, each an inclusive bound on `Lesson.course_date`
written exactly as `YYYY-MM-DD`. Validation is string-only and lives here
once, so both endpoints reject a malformed bound with the same 400 whose
`errors` names the offending field, before any query runs - the endpoints'
pinned query counts cannot move. The parse is deliberately stricter than
`strptime` alone (which accepts `2026-9-1`) and than `fromisoformat` (which
also accepts `20260901`): the value must round-trip through `%Y-%m-%d` byte
for byte. A reversed window is not an error - both edges are applied as
written, so the queryset simply matches nothing.

Container listings never import this module: Course, Module and Chapter rows
carry no `course_date`, so the bounds stay ignored there, exactly like any
unknown parameter. The bounds only ever narrow a queryset before Story 5.1's
total order runs; they never reorder anything.
"""

from datetime import datetime

from rest_framework.exceptions import ValidationError

# The two bounds: the inclusive lower and upper edge of the date window.
COURSE_DATE_FROM = 'course_date_from'
COURSE_DATE_TO = 'course_date_to'

# Both bounds, in the order they are parsed.
COURSE_DATE_PARAMS = (COURSE_DATE_FROM, COURSE_DATE_TO)


def course_date_range(request):
    """The parsed `(date_from, date_to)` pair, or the 400 that names a bound.

    Each bound is optional on its own: an absent parameter parses to `None`.
    A supplied one must be a real calendar date written exactly as
    `YYYY-MM-DD`; anything else - `01-09-2026`, `2026-9-1`, `20260901`, the
    empty string, a date that does not exist - raises a DRF `ValidationError`
    keyed by the parameter name, which the project's handler renders as the
    400 envelope whose `errors` carries the field. Nothing here touches the
    database.
    """
    return tuple(
        _course_date_bound(request, name) for name in COURSE_DATE_PARAMS
    )


def filter_course_date(queryset, bounds):
    """Narrow `queryset` to the inclusive window; an absent edge is a no-op.

    The filter composes on whatever queryset the caller already scoped - the
    `visible()` port in both views - before the shared ordering runs, so the
    order keys, the five-field context projection and the page size stay
    untouched.
    """
    date_from, date_to = bounds
    if date_from is not None:
        queryset = queryset.filter(course_date__gte=date_from)
    if date_to is not None:
        queryset = queryset.filter(course_date__lte=date_to)
    return queryset


def _course_date_bound(request, name):
    """One bound as a `date`, `None` when absent, or the 400 that names it."""
    raw = request.query_params.get(name)
    if raw is None:
        return None
    try:
        parsed = datetime.strptime(raw, '%Y-%m-%d')
        # `strptime` alone is too permissive (`2026-9-1` parses), so the
        # value must survive the round-trip byte for byte. The canonical
        # form is built by hand: `strftime` leaves years below 1000
        # unpadded on glibc, which would wrongly reject `0001-01-01`.
        canonical = f'{parsed.year:04d}-{parsed.month:02d}-{parsed.day:02d}'
        exact = canonical == raw
    except ValueError:
        exact = False
    if not exact:
        raise ValidationError(
            {name: [f'{name} must be a date written as YYYY-MM-DD']}
        )
    return parsed.date()
