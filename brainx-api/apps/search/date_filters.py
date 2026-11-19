"""The optional inclusive date bounds for the search aggregate endpoint (Story 6.4).

`SearchAggregateView` accepts `date_from` and `date_to` as optional query parameters,
each an inclusive bound on query and answer creation dates written strictly as `YYYY-MM-DD`.
Validation is string-only and raises a DRF `ValidationError` collecting all invalid parameter
errors, which the project's exception handler renders as the 400 envelope whose `errors`
names the offending field(s).

The validation is strictly byte-for-byte against `%Y-%m-%d`. A reversed window
(`date_from > date_to`) is not a validation error - both edges are returned as written,
and the resulting queryset simply matches nothing.
"""

from datetime import datetime

from rest_framework.exceptions import ValidationError

# The two query parameter names for the aggregate date range.
DATE_FROM = 'date_from'
DATE_TO = 'date_to'

DATE_PARAMS = (DATE_FROM, DATE_TO)


def parse_date_range(request):
    """The parsed `(date_from, date_to)` pair, or the 400 that names invalid bounds.

    Each bound is optional on its own: an absent parameter parses to `None`.
    A supplied one must be a real calendar date written strictly as
    `YYYY-MM-DD`; anything else - `2026-9-1`, `20261021`, the empty string, or an
    invalid date - records a validation error keyed by the parameter name. If any
    errors exist across all supplied parameters, raises a DRF `ValidationError`
    accumulating them into one error dictionary, which the project's handler renders
    as the 400 envelope naming all offending fields in `errors`.
    Nothing here touches the database.
    """
    errors = {}
    parsed_bounds = {}

    for name in DATE_PARAMS:
        raw = request.query_params.get(name)
        if raw is None:
            parsed_bounds[name] = None
            continue
        try:
            parsed = datetime.strptime(raw, '%Y-%m-%d')
            canonical = f'{parsed.year:04d}-{parsed.month:02d}-{parsed.day:02d}'
            exact = canonical == raw
        except ValueError:
            exact = False
        if not exact:
            errors[name] = ['must be a date written as YYYY-MM-DD']
        else:
            parsed_bounds[name] = parsed.date()

    if errors:
        raise ValidationError(errors)

    return (parsed_bounds[DATE_FROM], parsed_bounds[DATE_TO])
