"""The single error contract for the seven BrainX API rejection statuses (AR-25).

`brainx_exception_handler` renders every rejection that lands on 400, 401, 403,
404, 409, 429 or 503 with the same five keys - `type`, `title`, `status`,
`detail`, `errors` - so a client can parse all seven with one code path. Only
the values change; the shape never does.

Statuses outside that set (a 405, for instance) keep DRF's own body, and an
exception DRF does not handle returns None so Django renders its 500.
"""

from django.core.exceptions import PermissionDenied as DjangoPermissionDenied
from django.core.exceptions import ValidationError as DjangoValidationError
from django.http import Http404

from rest_framework import status
from rest_framework.exceptions import (
    APIException,
    AuthenticationFailed,
    NotAuthenticated,
    NotFound,
    PermissionDenied,
    Throttled,
    ValidationError,
)
from rest_framework.response import Response
from rest_framework.settings import api_settings
from rest_framework.views import exception_handler as drf_exception_handler

# The keys of the envelope, in the order the contract documents them.
ENVELOPE_KEYS = ('type', 'title', 'status', 'detail', 'errors')

# The key a message that belongs to no field is listed under. A snapshot of
# DRF's setting taken at import, kept because it is part of this module's
# published surface; rendering reads the live value instead, through
# `_non_field_errors_key`, so an override cannot leave this stale.
NON_FIELD_ERRORS_KEY = api_settings.NON_FIELD_ERRORS_KEY

# Seconds a 503 asks the client to wait before trying again. Not a rate limit:
# it is the courtesy that makes "please try again" actionable, because a client
# told only to retry is exactly the traffic that piles onto a service already
# struggling. The cap itself is a throttle, and `register` arrives in 1.7.
SERVICE_UNAVAILABLE_RETRY_AFTER_SECONDS = 60

# Short stable slugs paired with a short human label. The slug is the machine
# contract, the label only repeats what `detail` already says.
TITLES = {
    'validation_error': 'Validation error',
    'unauthenticated': 'Unauthenticated',
    'permission_denied': 'Permission denied',
    'not_found': 'Not found',
    'conflict': 'Conflict',
    'throttled': 'Too many requests',
    'service_unavailable': 'Service unavailable',
}

# Resolved per exception class, most specific first. Ordering matters only for
# subclasses of the listed classes.
SLUG_BY_EXCEPTION = (
    (ValidationError, 'validation_error'),
    (NotAuthenticated, 'unauthenticated'),
    (AuthenticationFailed, 'unauthenticated'),
    (DjangoPermissionDenied, 'permission_denied'),
    (PermissionDenied, 'permission_denied'),
    (Http404, 'not_found'),
    (NotFound, 'not_found'),
    (Throttled, 'throttled'),
)

# Fallback for DRF exceptions that are not listed above, so a custom
# `APIException` landing on one of the seven contract statuses can never leak the
# raw DRF body shape. Statuses outside that set keep DRF's default rendering.
SLUG_BY_STATUS = {
    status.HTTP_400_BAD_REQUEST: 'validation_error',
    status.HTTP_401_UNAUTHORIZED: 'unauthenticated',
    status.HTTP_403_FORBIDDEN: 'permission_denied',
    status.HTTP_404_NOT_FOUND: 'not_found',
    status.HTTP_409_CONFLICT: 'conflict',
    status.HTTP_429_TOO_MANY_REQUESTS: 'throttled',
    status.HTTP_503_SERVICE_UNAVAILABLE: 'service_unavailable',
}


class Conflict(APIException):
    """409, for a state change that would break a uniqueness or constraint rule.

    Domain code raises this instead of letting a database `IntegrityError`
    escape, which is what makes the 409 part of the contract predictable.
    """

    status_code = status.HTTP_409_CONFLICT
    default_detail = 'The request conflicts with the current state of the resource.'
    default_code = 'conflict'


class ServiceUnavailable(APIException):
    """503, for a request the server could not carry out and the client may retry.

    A failed outbound send is the case this exists for: the account is already
    committed, so retrying is safe and is the only way to reach the client.
    """

    status_code = status.HTTP_503_SERVICE_UNAVAILABLE
    default_detail = 'The service is temporarily unavailable. Please try again.'
    default_code = 'service_unavailable'

    def __init__(
        self, detail=None, code=None, wait=SERVICE_UNAVAILABLE_RETRY_AFTER_SECONDS
    ):
        # `detail` and `code` stay first, in DRF's own order for every other
        # `APIException` in this module, so `ServiceUnavailable('SMTP is down')`
        # reads as a message. `wait` is last because it is this class's addition,
        # and leading with it would bind that sentence to the header instead -
        # which DRF then formats with `'%d'`, turning the intended 503 into a
        # 500 raised from inside the handler.
        #
        # `wait` is DRF's own mechanism for a Retry-After, the same one a 429
        # uses: `exception_handler` reads the attribute off the exception and
        # `brainx_exception_handler` copies the headers it computed. Carrying it
        # here is what makes the 503 as actionable as the 429 rather than a bare
        # "try again" with nothing to back off against.
        #
        # Coerced, because DRF formats it with `'%d'` and a `timedelta`, a
        # string or anything else reaching the handler raises a `TypeError`
        # there and turns the intended 503 into a 500.
        self.wait = int(wait) if wait is not None else None
        super().__init__(detail, code)


def _detail_source(exc):
    """Return the detail structure to render.

    DRF exceptions expose `.detail`; Django's `Http404` and `PermissionDenied`
    only carry positional args, which is what the raising view supplied.
    """
    if isinstance(exc, APIException):
        return exc.detail
    return exc.args


def _django_validation_detail(exc):
    """Field mapping, or message list, from a Django `ValidationError`.

    The field names live in `error_dict`/`message_dict`, never in `args`,
    which is a (message, code, params) triple.
    """
    if hasattr(exc, 'error_dict'):
        # message_dict flattens to {field: [message, ...]} with %-params
        # already interpolated; it raises AttributeError without an error_dict.
        return exc.message_dict
    return exc.messages


def _summarize(detail):
    """Reduce any DRF detail structure to a single human-readable sentence."""
    if isinstance(detail, dict):
        candidates = detail.values()
    elif isinstance(detail, (list, tuple)):
        candidates = detail
    else:
        return str(detail).strip()

    for candidate in candidates:
        summary = _summarize(candidate)
        if summary:
            return summary
    return ''


def _messages(value):
    """Normalize a per-field message or list of messages into a list of strings."""
    if isinstance(value, (list, tuple)):
        return [str(item) for item in value]
    return [str(value)]


def _flatten(detail, prefix=''):
    """Yield (dotted_field_path, message) for every leaf in a detail structure.

    Nested serializers nest dicts and `many=True` nests them under an index, so
    both become dotted paths: `address.street`, `0.email`. A list of dicts is
    indexed by position, since that is the only field name it carries.
    """
    for field, messages in detail.items():
        path = f'{prefix}{field}'
        if isinstance(messages, dict):
            yield from _flatten(messages, f'{path}.')
        elif isinstance(messages, list) and any(
            isinstance(item, dict) for item in messages
        ):
            for index, item in enumerate(messages):
                if isinstance(item, dict):
                    yield from _flatten(item, f'{path}.{index}.')
                else:
                    for message in _messages(item):
                        yield path, message
        else:
            for message in _messages(messages):
                yield path, message


def _non_field_errors_key():
    """DRF's non-field sentinel, read per call so an override is not missed.

    `api_settings` re-reads on `setting_changed`; the module constant above is
    a snapshot taken at import. Reading here means a project or a test that
    overrides the key is rendered under the key the framework would have used,
    rather than under the one that happened to be in force when this module was
    first imported.
    """
    return api_settings.NON_FIELD_ERRORS_KEY


def _field_errors(detail):
    """Map each offending field name to its messages; empty when there is none.

    Both DRF shapes are flattened to dotted paths so the map stays flat and
    every offending field is listed: a nested serializer, and a `many=True`
    payload that arrives as a list of per-item dicts.

    A message that belongs to no field is keyed by the framework's non-field
    sentinel - DRF's `non_field_errors`, read live so an override is honoured -
    so a list-form detail keeps every message instead of collapsing to the one
    `detail` summarizes.

    The sentinel is this module's choice, not DRF's output. DRF wraps a list
    detail under that key only in the browsable-API renderer, which this project
    does not use, so under the JSON renderer DRF's own `exc.detail` is a bare
    list. Keying the messages here is what makes the JSON body as complete as
    the browsable one.
    """
    # A list or a tuple. DRF raises the list; Django's own `Http404` and
    # `PermissionDenied` carry their message in the `args` tuple, which is the
    # only place DRF's handler reads it from. Both hold bare sentences, and
    # both repeat them under the sentinel, because a client reading `errors` is
    # owed the reason whichever class raised it.
    if isinstance(detail, (list, tuple)):
        errors = {}
        if any(isinstance(item, dict) for item in detail):
            errors = _collect(
                (f'{index}.{field}', message)
                for index, item in enumerate(detail)
                if isinstance(item, dict)
                for field, message in _flatten(item)
            )
        loose = _list_form_messages(detail)
        if loose:
            errors.setdefault(_non_field_errors_key(), []).extend(loose)
        return errors
    # A dict maps field names, so it flattens to dotted paths. What is left is
    # a single sentence, and the two remaining shapes are deliberately not
    # treated alike. A bare `APIException` detail names no field, so `detail`
    # already carries it and a copy under the sentinel would be noise a client
    # has to filter out - it stays out. An `exc.args` tuple is the exception
    # above and is repeated, because it is the only carrier the two Django
    # classes have. `test_conflict_renders_409` pins the first half of that
    # asymmetry and the `Http404` and `PermissionDenied` cases pin the second.
    if not isinstance(detail, dict):
        return {}
    return _collect(_flatten(detail))


def _list_form_messages(detail):
    """The messages a list-form detail carries outside its per-item dicts."""
    return [
        message
        for item in detail
        if not isinstance(item, dict)
        for message in _messages(item)
    ]


def _collect(pairs):
    """Group (field, message) pairs into the {field: [message, ...]} contract."""
    errors = {}
    for field, message in pairs:
        errors.setdefault(field, []).append(message)
    return errors


def _resolve_slug(exc, status_code):
    """The envelope `type` for this exception, or None to leave it to DRF."""
    for exception_class, slug in SLUG_BY_EXCEPTION:
        if isinstance(exc, exception_class):
            return slug
    return SLUG_BY_STATUS.get(status_code)


def _build_envelope(exc, error_type, status_code):
    detail = _detail_source(exc)
    return {
        'type': error_type,
        'title': TITLES[error_type],
        'status': status_code,
        'detail': _summarize(detail) or TITLES[error_type],
        'errors': _field_errors(detail),
    }


def brainx_exception_handler(exc, context):
    """Render the AR-25 envelope for the seven contract statuses.

    Returns None for anything DRF does not handle, which lets the exception
    propagate and Django render its 500 without leaking internals.
    """
    if isinstance(exc, DjangoValidationError):
        # DRF does not recognize Django's own ValidationError, so it would
        # return None and the client would get a 500. Restate it as the DRF
        # equivalent, which the rest of this handler already understands.
        exc = ValidationError(_django_validation_detail(exc))

    response = drf_exception_handler(exc, context)
    if response is None:
        return None

    error_type = _resolve_slug(exc, response.status_code)
    if error_type is None:
        return response

    # The copy carries the headers DRF already computed: Retry-After on a
    # throttled request, WWW-Authenticate on a 401.
    return Response(
        _build_envelope(exc, error_type, response.status_code),
        status=response.status_code,
        headers=dict(response.headers),
    )
