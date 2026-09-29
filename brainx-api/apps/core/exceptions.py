"""The single error contract for the six BrainX API rejection statuses (AR-25).

`brainx_exception_handler` renders every rejection that lands on 400, 401, 403,
404, 409 or 429 with the same five keys - `type`, `title`, `status`, `detail`,
`errors` - so a client can parse all six with one code path. Only the values
change; the shape never does.

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
from rest_framework.views import exception_handler as drf_exception_handler

# The keys of the envelope, in the order the contract documents them.
ENVELOPE_KEYS = ('type', 'title', 'status', 'detail', 'errors')

# Short stable slugs paired with a short human label. The slug is the machine
# contract, the label only repeats what `detail` already says.
TITLES = {
    'validation_error': 'Validation error',
    'unauthenticated': 'Unauthenticated',
    'permission_denied': 'Permission denied',
    'not_found': 'Not found',
    'conflict': 'Conflict',
    'throttled': 'Too many requests',
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
# `APIException` landing on one of the six contract statuses can never leak the
# raw DRF body shape. Statuses outside that set keep DRF's default rendering.
SLUG_BY_STATUS = {
    status.HTTP_400_BAD_REQUEST: 'validation_error',
    status.HTTP_401_UNAUTHORIZED: 'unauthenticated',
    status.HTTP_403_FORBIDDEN: 'permission_denied',
    status.HTTP_404_NOT_FOUND: 'not_found',
    status.HTTP_409_CONFLICT: 'conflict',
    status.HTTP_429_TOO_MANY_REQUESTS: 'throttled',
}


class Conflict(APIException):
    """409, for a state change that would break a uniqueness or constraint rule.

    Domain code raises this instead of letting a database `IntegrityError`
    escape, which is what makes the 409 part of the contract predictable.
    """

    status_code = status.HTTP_409_CONFLICT
    default_detail = 'The request conflicts with the current state of the resource.'
    default_code = 'conflict'


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


def _field_errors(detail):
    """Map each offending field name to its messages; empty when there is none.

    Both DRF shapes are flattened to dotted paths so the map stays flat and
    every offending field is listed: a nested serializer, and a `many=True`
    payload that arrives as a list of per-item dicts.
    """
    if isinstance(detail, list) and any(isinstance(item, dict) for item in detail):
        return _collect(
            (f'{index}.{field}', message)
            for index, item in enumerate(detail)
            if isinstance(item, dict)
            for field, message in _flatten(item)
        )
    if not isinstance(detail, dict):
        return {}
    return _collect(_flatten(detail))


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
    """Render the AR-25 envelope for the six contract statuses.

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
