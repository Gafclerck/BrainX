"""Tests for the AR-25 error envelope and the JSON log formatter.

The views and the URLconf live in this module and are wired in through
`override_settings(ROOT_URLCONF=...)`, so the project URLconf stays free of
test-only endpoints.
"""

import importlib
import io
import json
import logging
import sys

import environ
from django.conf import settings
from django.contrib.auth import get_user_model
from django.core.cache import cache
from django.core.exceptions import PermissionDenied as DjangoPermissionDenied
from django.core.exceptions import ValidationError as DjangoValidationError
from django.http import Http404
from django.test import SimpleTestCase, TestCase, override_settings
from django.urls import path

from rest_framework import serializers, status
from rest_framework.exceptions import (
    AuthenticationFailed,
    NotAuthenticated,
    NotFound,
    ParseError,
    PermissionDenied,
    Throttled,
    ValidationError,
)
from rest_framework.permissions import AllowAny, IsAuthenticated
from rest_framework.response import Response
from rest_framework.settings import api_settings
from rest_framework.test import APIClient
from rest_framework.throttling import AnonRateThrottle
from rest_framework.views import APIView
from rest_framework_simplejwt.authentication import JWTAuthentication

from apps.core.exceptions import (
    NON_FIELD_ERRORS_KEY,
    SERVICE_UNAVAILABLE_RETRY_AFTER_SECONDS,
    SLUG_BY_EXCEPTION,
    SLUG_BY_STATUS,
    TITLES,
    Conflict,
    ServiceUnavailable,
    brainx_exception_handler,
)
from apps.core.logging import JsonFormatter

# Written out rather than imported: these assertions exist to catch a change to
# the contract, so comparing against the constant under test would not.
ENVELOPE_KEYS = ('type', 'title', 'status', 'detail', 'errors')

# Keys reserved for a later epic; this contract never emits them at envelope
# level. A field legitimately named `blocked` stays an ordinary field error, so
# this is checked against the body only, never against `errors`.
RESERVED_KEYS = ('blocked',)


class RegistrationSerializer(serializers.Serializer):
    email = serializers.EmailField()
    password = serializers.CharField(min_length=8)


class AddressSerializer(serializers.Serializer):
    street = serializers.CharField()


class NestedRegistrationSerializer(serializers.Serializer):
    email = serializers.EmailField()
    address = AddressSerializer()


class ValidationFailureView(APIView):
    authentication_classes = []
    permission_classes = [AllowAny]

    def post(self, request):
        serializer = RegistrationSerializer(data=request.data)
        serializer.is_valid(raise_exception=True)
        return Response(serializer.validated_data)


class AuthenticatedOnlyView(APIView):
    def get(self, request):
        return Response({'ok': True})


class StudentOnlyView(APIView):
    permission_classes = [IsAuthenticated]

    def get(self, request):
        if not request.user.is_staff:
            raise PermissionDenied('Only staff may do this.')
        return Response({'ok': True})


class DjangoPermissionDeniedView(APIView):
    authentication_classes = []
    permission_classes = [AllowAny]

    def get(self, request):
        raise DjangoPermissionDenied('Nope.')


class NotFoundView(APIView):
    authentication_classes = []
    permission_classes = [AllowAny]

    def get(self, request):
        raise NotFound('No such thing.')


class Http404View(APIView):
    authentication_classes = []
    permission_classes = [AllowAny]

    def get(self, request):
        raise Http404('Gone by Django.')


class ConflictView(APIView):
    authentication_classes = []
    permission_classes = [AllowAny]

    def post(self, request):
        raise Conflict()


class ExpiredTokenView(APIView):
    """JWT is in the chain so DRF has an authenticate header to return with the 401."""

    authentication_classes = [JWTAuthentication]
    permission_classes = [AllowAny]

    def get(self, request):
        return Response({'ok': True})


class DjangoValidationFailureView(APIView):
    """Stands in for a model clean()/full_clean() failure raised by perform_create."""

    authentication_classes = []
    permission_classes = [AllowAny]

    def post(self, request):
        raise DjangoValidationError({'email': ['Enter a valid email address.']})


class UnhandledView(APIView):
    authentication_classes = []
    permission_classes = [AllowAny]

    def get(self, request):
        raise ValueError('internal detail that must never be rendered')


class ThrottledView(APIView):
    authentication_classes = []
    permission_classes = [AllowAny]
    throttle_classes = [AnonRateThrottle]

    def get(self, request):
        return Response({'ok': True})


class ServiceUnavailableView(APIView):
    authentication_classes = []
    permission_classes = [AllowAny]

    def get(self, request):
        raise ServiceUnavailable()


urlpatterns = [
    path('validation-failure/', ValidationFailureView.as_view()),
    path('authenticated-only/', AuthenticatedOnlyView.as_view()),
    path('student-only/', StudentOnlyView.as_view()),
    path('django-permission-denied/', DjangoPermissionDeniedView.as_view()),
    path('not-found/', NotFoundView.as_view()),
    path('http-404/', Http404View.as_view()),
    path('conflict/', ConflictView.as_view()),
    path('django-validation-failure/', DjangoValidationFailureView.as_view()),
    path('expired-token/', ExpiredTokenView.as_view()),
    path('service-unavailable/', ServiceUnavailableView.as_view()),
    path('unhandled/', UnhandledView.as_view()),
    path('throttled/', ThrottledView.as_view()),
]

TEST_SETTINGS = override_settings(ROOT_URLCONF=__name__)


class SubstrateSettingsTests(SimpleTestCase):
    """The substrate guarantees, pinned so a regression cannot pass the suite.

    Restoring the SQLite default, dropping the `socket_timeout` workaround,
    unhooking the exception handler, dropping one of the newly pinned packages
    or reverting the psycopg extras pin would each leave every other test green.
    """

    def test_default_database_is_postgresql(self):
        # Resolved from env.db's own default, not from settings: with a
        # DATABASE_URL in the environment, settings carries that URL instead and
        # the assertion would pass even if the default regressed to sqlite.
        default = environ.Env().db(
            'DATABASE_URL',
            default='postgres://brainx:brainx@localhost:5432/brainx',
        )
        self.assertEqual(default['ENGINE'], 'django.db.backends.postgresql')
        self.assertNotIn('sqlite', str(default).lower())
        self.assertEqual(
            settings.DATABASES['default']['ENGINE'],
            'django.db.backends.postgresql',
        )
        self.assertNotIn('sqlite', str(settings.DATABASES).lower())

    def test_every_pinned_package_is_importable(self):
        # Import only: no Redis server and no S3 credentials, so this does not
        # require either. It pins AC 2, which nothing else in the suite checks.
        for module in (
            'whitenoise',
            'boto3',
            'channels',
            'channels_redis',
            'redis',
            'storages.backends.s3',
        ):
            with self.subTest(module=module):
                self.assertIsNotNone(importlib.import_module(module))

    def test_psycopg_resolved_to_the_binary_build(self):
        # The bare pin needs a system libpq; the extras pin must not.
        import psycopg.pq

        self.assertEqual(psycopg.pq.__impl__, 'binary')

    def test_every_channel_layer_host_carries_the_socket_timeout_workaround(self):
        hosts = settings.CHANNEL_LAYERS['default']['CONFIG']['hosts']
        self.assertTrue(hosts, 'no channel layer host configured')
        for host in hosts:
            with self.subTest(host=host):
                self.assertIn('socket_timeout', host)
                self.assertIsNone(host['socket_timeout'])

    def test_the_error_envelope_handler_is_the_configured_one(self):
        self.assertIs(api_settings.EXCEPTION_HANDLER, brainx_exception_handler)

    def test_every_slug_a_response_can_carry_has_a_title(self):
        # TITLES is indexed with the resolved slug, so a slug without a title
        # raises KeyError inside the handler and turns a 4xx into a 500.
        slugs = {slug for _, slug in SLUG_BY_EXCEPTION}
        slugs.update(SLUG_BY_STATUS.values())
        self.assertLessEqual(slugs, set(TITLES))


def assert_envelope(test_case, response, expected_type, expected_status):
    """Assert the response is the five-key envelope for the given contract case."""
    body = response.json()
    test_case.assertEqual(sorted(body), sorted(ENVELOPE_KEYS))
    test_case.assertEqual(body['type'], expected_type)
    test_case.assertEqual(body['title'], TITLES[expected_type])
    test_case.assertEqual(body['status'], expected_status)
    test_case.assertEqual(response.status_code, expected_status)
    test_case.assertTrue(body['detail'])
    test_case.assertIsInstance(body['errors'], dict)
    test_case.assertTrue(response['Content-Type'].startswith('application/json'))
    for reserved in RESERVED_KEYS:
        test_case.assertNotIn(reserved, body)
    return body


class BrainxExceptionHandlerUnitTests(SimpleTestCase):
    """The handler called directly, without a request going through it."""

    def call_handler(self, exc):
        return brainx_exception_handler(exc, {'view': None, 'request': None})

    def test_validation_error_renders_field_errors(self):
        response = self.call_handler(
            ValidationError({'email': ['Enter a valid email address.']})
        )
        body = response.data
        self.assertEqual(response.status_code, status.HTTP_400_BAD_REQUEST)
        self.assertEqual(body['type'], 'validation_error')
        self.assertEqual(body['errors'], {'email': ['Enter a valid email address.']})
        self.assertEqual(body['detail'], 'Enter a valid email address.')

    def test_validation_error_without_fields_lists_under_the_non_field_key(self):
        response = self.call_handler(ValidationError('Malformed payload.'))
        self.assertEqual(response.status_code, status.HTTP_400_BAD_REQUEST)
        self.assertEqual(
            response.data['errors'], {NON_FIELD_ERRORS_KEY: ['Malformed payload.']}
        )
        self.assertEqual(response.data['detail'], 'Malformed payload.')

    def test_error_detail_values_are_plain_strings(self):
        response = self.call_handler(ValidationError({'email': ['Required.']}))
        (message,) = response.data['errors']['email']
        self.assertIs(type(message), str)

    def test_parse_error_falls_back_to_the_400_slug(self):
        response = self.call_handler(ParseError('Malformed JSON.'))
        self.assertEqual(response.status_code, status.HTTP_400_BAD_REQUEST)
        self.assertEqual(response.data['type'], 'validation_error')

    def raised_by(self, serializer_class, data, **kwargs):
        """Return the ValidationError a real serializer raises for this payload."""
        with self.assertRaises(ValidationError) as raised:
            serializer_class(data=data, **kwargs).is_valid(raise_exception=True)
        return raised.exception

    def test_nested_serializer_field_errors_use_dotted_paths(self):
        exc = self.raised_by(
            NestedRegistrationSerializer,
            {'email': 'not-an-email', 'address': {'street': ''}},
        )
        response = self.call_handler(exc)
        body = response.data
        self.assertEqual(response.status_code, status.HTTP_400_BAD_REQUEST)
        self.assertEqual(body['type'], 'validation_error')
        self.assertEqual(sorted(body['errors']), ['address.street', 'email'])
        self.assertEqual(len(body['errors']['address.street']), 1)
        self.assertNotIn('{', body['errors']['address.street'][0])

    def test_nested_detail_is_never_rendered_as_a_python_repr(self):
        response = self.call_handler(
            ValidationError({'address': {'street': ['x']}})
        )
        (message,) = response.data['errors']['address.street']
        self.assertEqual(message, 'x')
        self.assertNotIn('ErrorDetail', message)

    def test_many_true_field_errors_use_indexed_paths(self):
        exc = self.raised_by(
            RegistrationSerializer,
            [
                {'email': 'first@example.com', 'password': 'short'},
                {'email': 'not-an-email', 'password': 'longenough'},
            ],
            many=True,
        )
        response = self.call_handler(exc)
        body = response.data
        self.assertEqual(response.status_code, status.HTTP_400_BAD_REQUEST)
        self.assertEqual(sorted(body['errors']), ['0.password', '1.email'])

    def test_many_true_detail_as_a_list_of_dicts_keeps_every_field(self):
        # A list of per-item dicts rather than the index-keyed mapping a
        # serializer raises; both must land on the same indexed paths.
        response = self.call_handler(
            ValidationError([{'email': ['a']}, {'email': ['b']}])
        )
        self.assertEqual(
            response.data['errors'], {'0.email': ['a'], '1.email': ['b']}
        )

    def test_list_form_detail_keeps_every_message(self):
        # A list with no dict in it is all non-field messages; every one of them
        # must reach the body, not only the one `detail` summarizes.
        response = self.call_handler(
            ValidationError(['first problem', 'second problem', 'third problem'])
        )
        self.assertEqual(
            response.data['errors'],
            {
                NON_FIELD_ERRORS_KEY: [
                    'first problem',
                    'second problem',
                    'third problem',
                ]
            },
        )
        self.assertEqual(response.data['detail'], 'first problem')

    def test_mixed_list_keeps_both_the_fields_and_the_loose_message(self):
        response = self.call_handler(
            ValidationError([{'email': ['bad']}, 'and a loose message'])
        )
        self.assertEqual(
            response.data['errors'],
            {'0.email': ['bad'], NON_FIELD_ERRORS_KEY: ['and a loose message']},
        )

    def test_the_non_field_key_is_drfs_own(self):
        # A client sees the same key DRF would have produced for the payload.
        self.assertEqual(NON_FIELD_ERRORS_KEY, api_settings.NON_FIELD_ERRORS_KEY)

    def test_the_non_field_key_is_read_per_call_not_snapshotted(self):
        # The comparison above holds whether or not rendering reads the live
        # value, because the constant was snapshotted from the very setting it
        # is compared against. This is the test that tells the two apart: the
        # module constant cannot move, so if the body follows the override then
        # the read is per call.
        overridden = {
            **settings.REST_FRAMEWORK,
            'NON_FIELD_ERRORS_KEY': '__all__',
        }
        with override_settings(REST_FRAMEWORK=overridden):
            response = self.call_handler(ValidationError(['bare sentence']))
        self.assertEqual(
            response.data['errors'],
            {'__all__': ['bare sentence']},
        )
        # And the import-time constant is unchanged, which is what makes the
        # difference above a fact about the rendering and not about the import.
        self.assertEqual(NON_FIELD_ERRORS_KEY, api_settings.NON_FIELD_ERRORS_KEY)

    def test_a_django_non_field_error_keeps_the_all_sentinel(self):
        # Django's full_clean() reports a non-field clean() error under __all__,
        # which passes through as a key exactly as DRF's sentinel does.
        response = self.call_handler(
            DjangoValidationError({'__all__': ['the object state is invalid']})
        )
        self.assertEqual(
            response.data['errors'], {'__all__': ['the object state is invalid']}
        )

    def test_django_validation_error_renders_400_with_field_names(self):
        response = self.call_handler(
            DjangoValidationError({'email': ['Enter a valid email address.']})
        )
        body = response.data
        self.assertEqual(response.status_code, status.HTTP_400_BAD_REQUEST)
        self.assertEqual(body['type'], 'validation_error')
        self.assertEqual(body['errors'], {'email': ['Enter a valid email address.']})
        self.assertEqual(body['detail'], 'Enter a valid email address.')

    def test_django_validation_error_without_field_names_keeps_every_message(self):
        # exc.messages is a list, so it lands on the same non-field key a DRF
        # list-form detail does rather than being dropped.
        response = self.call_handler(
            DjangoValidationError(['first', 'second'])
        )
        self.assertEqual(response.status_code, status.HTTP_400_BAD_REQUEST)
        self.assertEqual(response.data['type'], 'validation_error')
        self.assertEqual(
            response.data['errors'], {NON_FIELD_ERRORS_KEY: ['first', 'second']}
        )
        self.assertEqual(response.data['detail'], 'first')

    def test_django_validation_error_interpolates_message_params(self):
        response = self.call_handler(
            DjangoValidationError(
                {'age': [DjangoValidationError('Too young: %(min)s', params={'min': 18})]}
            )
        )
        self.assertEqual(response.data['errors'], {'age': ['Too young: 18']})

    def test_not_authenticated_renders_401(self):
        response = self.call_handler(NotAuthenticated())
        self.assertEqual(response.status_code, status.HTTP_401_UNAUTHORIZED)
        self.assertEqual(response.data['type'], 'unauthenticated')

    def test_authentication_failed_renders_401(self):
        response = self.call_handler(AuthenticationFailed('Bad token.'))
        self.assertEqual(response.status_code, status.HTTP_401_UNAUTHORIZED)
        self.assertEqual(response.data['type'], 'unauthenticated')
        self.assertEqual(response.data['detail'], 'Bad token.')

    def test_permission_denied_renders_403(self):
        response = self.call_handler(PermissionDenied('Not for you.'))
        self.assertEqual(response.status_code, status.HTTP_403_FORBIDDEN)
        self.assertEqual(response.data['type'], 'permission_denied')
        # One half of the asymmetry the Django class test below pins: a bare
        # DRF detail is a single sentence `detail` already carries, so it names
        # no field and is not repeated. Changing this half has to change that
        # one.
        self.assertEqual(response.data['errors'], {})

    def test_django_permission_denied_renders_403(self):
        response = self.call_handler(DjangoPermissionDenied('Not for you.'))
        self.assertEqual(response.status_code, status.HTTP_403_FORBIDDEN)
        self.assertEqual(response.data['type'], 'permission_denied')
        self.assertEqual(response.data['detail'], 'Not for you.')
        # The other half of the asymmetry the DRF test above pins. A Django
        # class exposes no `.detail`; the only place its message lives is
        # `args`, so dropping the tuple branch here would silently lose it.
        self.assertEqual(
            response.data['errors'], {NON_FIELD_ERRORS_KEY: ['Not for you.']}
        )

    def test_not_found_renders_404(self):
        response = self.call_handler(NotFound('No such thing.'))
        self.assertEqual(response.status_code, status.HTTP_404_NOT_FOUND)
        self.assertEqual(response.data['type'], 'not_found')

    def test_django_http404_renders_404(self):
        response = self.call_handler(Http404('Gone by Django.'))
        self.assertEqual(response.status_code, status.HTTP_404_NOT_FOUND)
        self.assertEqual(response.data['type'], 'not_found')
        self.assertEqual(response.data['detail'], 'Gone by Django.')
        # `Http404` carries its message in `args` and nowhere else, so the
        # message is listed under the non-field sentinel rather than dropped.
        # This is a contract-visible change to story 1.1, which returned `{}`
        # here, and it is pinned so it cannot drift back unnoticed.
        self.assertEqual(
            response.data['errors'], {NON_FIELD_ERRORS_KEY: ['Gone by Django.']}
        )

    def test_conflict_renders_409(self):
        response = self.call_handler(Conflict())
        self.assertEqual(response.status_code, status.HTTP_409_CONFLICT)
        self.assertEqual(response.data['type'], 'conflict')
        # A bare `APIException` detail is not repeated under the sentinel. This
        # and the `Http404` and `PermissionDenied` cases pin both halves of that
        # deliberate asymmetry, so neither can be changed alone.
        self.assertEqual(response.data['errors'], {})

    def test_custom_api_exception_on_409_gets_the_conflict_slug(self):
        from rest_framework.exceptions import APIException

        class AlreadyExists(APIException):
            status_code = status.HTTP_409_CONFLICT

        response = self.call_handler(AlreadyExists('Already exists.'))
        self.assertEqual(response.data['type'], 'conflict')

    def test_throttled_renders_429_with_retry_after(self):
        response = self.call_handler(Throttled(wait=61.7))
        self.assertEqual(response.status_code, status.HTTP_429_TOO_MANY_REQUESTS)
        self.assertEqual(response.data['type'], 'throttled')
        self.assertEqual(response.data['errors'], {})
        self.assertEqual(response['Retry-After'], '62')

    def test_throttled_without_a_wait_still_renders_the_envelope(self):
        response = self.call_handler(Throttled())
        self.assertEqual(response.status_code, status.HTTP_429_TOO_MANY_REQUESTS)
        self.assertEqual(response.data['type'], 'throttled')
        # The contract guarantees the header only when the throttle supplied a
        # wait; DRF computes it solely from `wait`, so here there is none.
        self.assertNotIn('Retry-After', response)

    def test_a_custom_429_gets_no_retry_after(self):
        from rest_framework.exceptions import APIException

        class RateLimited(APIException):
            status_code = status.HTTP_429_TOO_MANY_REQUESTS

        response = self.call_handler(RateLimited('Slow down.'))
        self.assertEqual(response.data['type'], 'throttled')
        self.assertNotIn('Retry-After', response)

    def test_service_unavailable_renders_503_with_retry_after(self):
        response = self.call_handler(ServiceUnavailable())
        self.assertEqual(response.status_code, status.HTTP_503_SERVICE_UNAVAILABLE)
        self.assertEqual(response.data['type'], 'service_unavailable')
        self.assertEqual(response.data['errors'], {})
        self.assertEqual(
            response['Retry-After'], str(SERVICE_UNAVAILABLE_RETRY_AFTER_SECONDS)
        )

    def test_a_positional_argument_is_the_detail_and_not_the_wait(self):
        # The signature is `ServiceUnavailable(detail, code, wait)` for DRF's
        # own ordering. Leading with `wait` would bind this sentence to the
        # header, and `str` of a sentence is what `'%d'` chokes on - so the
        # intended 503 turns into a 500 raised from inside the handler. The
        # rendered `detail` is what proves the binding went the other way.
        response = self.call_handler(ServiceUnavailable('SMTP is down.'))
        self.assertEqual(response.data['detail'], 'SMTP is down.')
        self.assertEqual(
            response['Retry-After'], str(SERVICE_UNAVAILABLE_RETRY_AFTER_SECONDS)
        )

    def test_a_non_integer_wait_still_renders_the_503(self):
        # DRF formats the header with `'%d'`, so anything else reaching it
        # raises a `TypeError` there and the client gets a 500 for a condition
        # it was just told to retry. `int()` in the constructor is what keeps
        # the header well formed whatever the caller passed - a float and a
        # numeric string, the two shapes a computed backoff actually arrives in.
        for wait, expected in (('90', '90'), (90.7, '90')):
            with self.subTest(wait=repr(wait)):
                response = self.call_handler(ServiceUnavailable(wait=wait))
                self.assertEqual(
                    response.status_code, status.HTTP_503_SERVICE_UNAVAILABLE
                )
                self.assertEqual(response['Retry-After'], expected)

    def test_a_503_without_a_wait_still_renders_the_envelope(self):
        # Same guarantee the throttled case above gets: the contract promises
        # the five keys, and the header only when the exception supplied a wait.
        response = self.call_handler(ServiceUnavailable(wait=None))
        self.assertEqual(response.status_code, status.HTTP_503_SERVICE_UNAVAILABLE)
        self.assertEqual(response.data['type'], 'service_unavailable')
        self.assertNotIn('Retry-After', response)

    def test_status_outside_the_contract_keeps_the_drf_body(self):
        from rest_framework.exceptions import MethodNotAllowed

        response = self.call_handler(MethodNotAllowed('POST'))
        self.assertEqual(response.status_code, status.HTTP_405_METHOD_NOT_ALLOWED)
        self.assertNotIn('type', response.data)
        self.assertNotIn('errors', response.data)

    def test_unhandled_exception_falls_through(self):
        self.assertIsNone(self.call_handler(ValueError('internal detail')))

    def test_every_contract_type_is_mapped_to_a_title(self):
        self.assertEqual(
            sorted(TITLES),
            sorted(
                {
                    'validation_error',
                    'unauthenticated',
                    'permission_denied',
                    'not_found',
                    'conflict',
                    'throttled',
                    'service_unavailable',
                }
            ),
        )


# Throttling is disabled by config.settings.development, so the 429 case must
# re-enable it to exercise a real throttled request. REST_FRAMEWORK is replaced
# wholesale by override_settings, so it is spread first to keep the rest of the
# contract (notably EXCEPTION_HANDLER) in place.
THROTTLED_SETTINGS = {
    **settings.REST_FRAMEWORK,
    'DEFAULT_THROTTLE_CLASSES': ['rest_framework.throttling.AnonRateThrottle'],
    'DEFAULT_THROTTLE_RATES': {'anon': '1/minute', 'user': '1000/day'},
}


class UserMixin:
    """Builds throwaway auth users; requires database access."""

    def make_user(self, email, is_staff=False):
        return get_user_model().objects.create_user(
            email=email,
            password='irrelevant-for-force-authenticate',
            is_staff=is_staff,
        )


@TEST_SETTINGS
class ErrorEnvelopeIntegrationTests(UserMixin, TestCase):
    """End-to-end through the DRF stack, using the configured exception handler."""

    def setUp(self):
        self.client = APIClient()

    def test_validation_failure_renders_400(self):
        response = self.client.post('/validation-failure/', {}, format='json')
        body = assert_envelope(self, response, 'validation_error', 400)
        self.assertIn('email', body['errors'])
        self.assertTrue(body['errors']['email'])

    def test_validation_failure_lists_every_offending_field(self):
        response = self.client.post(
            '/validation-failure/',
            {'email': 'not-an-email', 'password': 'short'},
            format='json',
        )
        body = assert_envelope(self, response, 'validation_error', 400)
        self.assertEqual(sorted(body['errors']), ['email', 'password'])
        for field in ('email', 'password'):
            with self.subTest(field=field):
                self.assertTrue(body['errors'][field])

    def test_missing_credentials_render_401(self):
        response = self.client.get('/authenticated-only/')
        assert_envelope(self, response, 'unauthenticated', 401)
        self.assertIn('WWW-Authenticate', response)

    def test_wrong_privilege_renders_403(self):
        user = self.make_user('student@example.com', is_staff=False)
        self.client.force_authenticate(user)
        response = self.client.get('/student-only/')
        assert_envelope(self, response, 'permission_denied', 403)

    def test_django_permission_denied_renders_403(self):
        response = self.client.get('/django-permission-denied/')
        body = assert_envelope(self, response, 'permission_denied', 403)
        # The Django classes have no `.detail`, so their message reaches the
        # envelope only through the `errors` map. Asserted on the rendered body
        # rather than on the handler's return value, because the handler is not
        # the only thing standing between the exception and the client.
        self.assertEqual(body['errors'], {NON_FIELD_ERRORS_KEY: ['Nope.']})

    def test_not_found_renders_404(self):
        response = self.client.get('/not-found/')
        assert_envelope(self, response, 'not_found', 404)

    def test_django_http404_renders_404(self):
        response = self.client.get('/http-404/')
        body = assert_envelope(self, response, 'not_found', 404)
        self.assertEqual(body['errors'], {NON_FIELD_ERRORS_KEY: ['Gone by Django.']})

    def test_conflict_renders_409(self):
        response = self.client.post('/conflict/', {}, format='json')
        assert_envelope(self, response, 'conflict', 409)

    def test_invalid_jwt_renders_401(self):
        self.client.credentials(HTTP_AUTHORIZATION='Bearer not-a-real-token')
        response = self.client.get('/expired-token/')
        assert_envelope(self, response, 'unauthenticated', 401)
        self.assertIn('WWW-Authenticate', response)
        self.assertTrue(response['WWW-Authenticate'].startswith('Bearer'))

    def test_django_validation_error_renders_400(self):
        response = self.client.post('/django-validation-failure/', {}, format='json')
        body = assert_envelope(self, response, 'validation_error', 400)
        self.assertEqual(body['errors'], {'email': ['Enter a valid email address.']})

    def test_unhandled_exception_is_not_rendered_as_an_envelope(self):
        # The test client re-raises unhandled exceptions; that proves the handler
        # let it through instead of swallowing it into a 500 envelope.
        with self.assertRaises(ValueError):
            self.client.get('/unhandled/')

    def test_every_non_throttled_status_renders_the_same_five_keys(self):
        # 429 is covered by ThrottledRequestIntegrationTests, which needs a real
        # throttled request to reach. 503 was added to this sweep with the
        # exception itself: a test named "every" that skipped the newest status
        # would have gone on passing while the one status nothing in this file
        # rendered was the one the registration endpoint raises.
        cases = [
            ('post', '/validation-failure/', 'validation_error', 400),
            ('get', '/authenticated-only/', 'unauthenticated', 401),
            ('get', '/student-only/', 'permission_denied', 403),
            ('get', '/not-found/', 'not_found', 404),
            ('post', '/conflict/', 'conflict', 409),
            ('get', '/service-unavailable/', 'service_unavailable', 503),
        ]
        for verb, path, expected_type, expected_status in cases:
            with self.subTest(status=expected_status):
                if expected_status == 403:
                    self.client.force_authenticate(self.make_user('s@example.com'))
                response = getattr(self.client, verb)(path, {}, format='json')
                assert_envelope(self, response, expected_type, expected_status)
                self.client.force_authenticate(user=None)

    def test_the_503_sweep_case_also_carries_its_retry_after(self):
        # The five keys are the envelope; the header is what makes the one
        # retryable status actionable, so it is checked where the 503 is
        # rendered rather than only in the endpoint's own tests.
        response = self.client.get('/service-unavailable/', {}, format='json')
        self.assertIn('Retry-After', response)


@override_settings(ROOT_URLCONF=__name__, REST_FRAMEWORK=THROTTLED_SETTINGS)
class ThrottledRequestIntegrationTests(TestCase):
    """A real throttled request: 429, same body shape, Retry-After present."""

    def setUp(self):
        self.client = APIClient()
        # SimpleRateThrottle snapshots DEFAULT_THROTTLE_RATES into a class
        # attribute at import time, so override_settings alone cannot move it
        # once DRF is loaded. Point the class attribute at the overridden rates
        # for the duration of each test, and reset the history the view recorded.
        original_rates = AnonRateThrottle.THROTTLE_RATES
        self.addCleanup(setattr, AnonRateThrottle, 'THROTTLE_RATES', original_rates)
        AnonRateThrottle.THROTTLE_RATES = dict(THROTTLED_SETTINGS['DEFAULT_THROTTLE_RATES'])
        cache.clear()

    def test_throttled_request_renders_429_with_retry_after(self):
        first = self.client.get('/throttled/')
        self.assertEqual(first.status_code, 200)

        response = self.client.get('/throttled/')
        body = assert_envelope(self, response, 'throttled', 429)
        self.assertEqual(body['errors'], {})
        self.assertIn('Retry-After', response)
        self.assertGreaterEqual(int(response['Retry-After']), 1)

    def test_429_body_is_indistinguishable_from_another_rejection(self):
        self.client.get('/throttled/')
        throttled = self.client.get('/throttled/')
        not_found = self.client.get('/not-found/')
        # Pinned so this cannot pass vacuously by comparing a 429 with another
        # 429 if every view ever became throttled.
        self.assertEqual(throttled.status_code, 429)
        self.assertEqual(not_found.status_code, 404)
        self.assertEqual(sorted(throttled.json()), sorted(not_found.json()))
        self.assertEqual(sorted(throttled.json()), sorted(ENVELOPE_KEYS))


class JsonFormatterTests(SimpleTestCase):
    """One JSON object per line, with client input unable to forge a record."""

    def make_record(self, message, args=(), exc_info=None):
        return logging.LogRecord(
            name='apps.core.tests',
            level=logging.WARNING,
            pathname=__file__,
            lineno=1,
            msg=message,
            args=args,
            exc_info=exc_info,
        )

    def format(self, record):
        return JsonFormatter().format(record)

    def exc_info_for(self, message):
        try:
            raise ValueError(message)
        except ValueError:
            return sys.exc_info()

    def test_line_is_a_single_json_object_with_the_documented_keys(self):
        line = self.format(self.make_record('hello %s', ('world',)))
        self.assertNotIn('\n', line)
        payload = json.loads(line)
        self.assertEqual(
            sorted(payload), ['level', 'logger', 'message', 'module', 'timestamp']
        )
        # A document is one JSON object per line, not a JSON array.
        self.assertNotIn('exception', payload)
        self.assertEqual(payload['message'], 'hello world')
        self.assertEqual(payload['level'], 'WARNING')
        self.assertEqual(payload['logger'], 'apps.core.tests')
        self.assertTrue(payload['timestamp'])

    def test_client_input_cannot_forge_or_split_a_record(self):
        hostile = '{"level": "ERROR", "logger": "forged"}\n{"forged": true}'
        payload = json.loads(self.format(self.make_record(hostile)))
        self.assertEqual(payload['message'], hostile)
        self.assertEqual(payload['level'], 'WARNING')
        self.assertEqual(payload['logger'], 'apps.core.tests')

    def test_control_characters_are_escaped(self):
        payload = json.loads(self.format(self.make_record('bad\x00char\ttab')))
        self.assertEqual(payload['message'], 'bad\x00char\ttab')

    def test_non_ascii_is_escaped_not_emitted_raw(self):
        line = self.format(self.make_record('clé-privée'))
        self.assertIn('\\u', line)
        self.assertEqual(json.loads(line)['message'], 'clé-privée')

    def test_message_args_are_interpolated_before_escaping(self):
        payload = json.loads(self.format(self.make_record('user %s is %d', ('ana', 7))))
        self.assertEqual(payload['message'], 'user ana is 7')

    def test_traceback_is_carried_in_the_payload(self):
        record = self.make_record('boom', exc_info=self.exc_info_for('kaboom'))
        payload = json.loads(self.format(record))
        self.assertEqual(payload['message'], 'boom')
        self.assertIn('exception', payload)
        self.assertIn('ValueError: kaboom', payload['exception'])
        self.assertIn('Traceback (most recent call last)', payload['exception'])

    def test_a_multi_line_traceback_does_not_split_the_line(self):
        record = self.make_record('boom', exc_info=self.exc_info_for('kaboom'))
        line = self.format(record)
        self.assertNotIn('\n', line)
        self.assertIn('\\n', line)
        # The escaped newlines survive the round trip inside the value.
        self.assertIn('\n', json.loads(line)['exception'])

    def test_a_traceback_cannot_forge_a_second_record(self):
        hostile = self.exc_info_for('kaboom"\n{"forged": true}')
        line = self.format(self.make_record('boom', exc_info=hostile))
        self.assertNotIn('\n', line)
        payload = json.loads(line)
        self.assertEqual(payload['level'], 'WARNING')
        self.assertEqual(payload['logger'], 'apps.core.tests')
        self.assertIn('kaboom', payload['exception'])

    def test_stdout_handler_uses_the_json_formatter(self):
        handler = settings.LOGGING['handlers']['console']
        self.assertEqual(handler['formatter'], 'json')
        self.assertEqual(
            settings.LOGGING['formatters']['json']['()'],
            'apps.core.logging.JsonFormatter',
        )
        self.assertEqual(handler['stream'], 'ext://sys.stdout')

    def console_handler(self):
        console_handlers = [
            handler
            for handler in logging.getLogger().handlers
            if getattr(handler, 'formatter', None) is not None
            and isinstance(handler.formatter, JsonFormatter)
        ]
        self.assertTrue(console_handlers, 'no handler is using JsonFormatter')
        return console_handlers[0]

    def test_live_console_handler_formats_records_as_json(self):
        line = self.console_handler().format(
            self.make_record('through the live handler')
        )
        self.assertEqual(json.loads(line)['message'], 'through the live handler')

    def test_a_record_reaches_stdout_as_one_json_line(self):
        # Through handle(), not format(): the config names ext://sys.stdout, so
        # this is what observes AC 7's "JSON on stdout".
        handler = self.console_handler()
        stream = io.StringIO()
        original_stream = handler.stream
        handler.stream = stream
        self.addCleanup(setattr, handler, 'stream', original_stream)
        handler.handle(self.make_record('onto the wire'))
        stream.seek(0)
        written = stream.read()
        self.assertEqual(len(written.splitlines()), 1)
        self.assertEqual(json.loads(written)['message'], 'onto the wire')

    def test_a_cached_exc_text_is_still_carried(self):
        # A record that has already been formatted, or that crossed a queue
        # boundary, keeps its traceback in exc_text with exc_info gone.
        record = self.make_record('boom', exc_info=self.exc_info_for('kaboom'))
        logging.Formatter().format(record)
        self.assertIsNotNone(record.exc_text)
        record.exc_info = None
        payload = json.loads(self.format(record))
        self.assertIn('ValueError: kaboom', payload['exception'])

    def test_stack_info_is_carried(self):
        record = self.make_record('boom')
        record.stack_info = 'Stack (most recent call last):\n  probe'
        payload = json.loads(self.format(record))
        self.assertIn('Stack (most recent call last)', payload['stack'])

    def test_an_exc_info_true_outside_except_emits_no_exception(self):
        # exc_info=True with no active exception is the tuple (None, None, None),
        # which is truthy, so the exception type has to be the thing checked.
        record = self.make_record('no active exception')
        record.exc_info = (None, None, None)
        self.assertNotIn('exception', json.loads(self.format(record)))
