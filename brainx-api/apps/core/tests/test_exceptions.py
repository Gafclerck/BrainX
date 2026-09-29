"""Tests for the AR-25 error envelope and the JSON log formatter.

The views and the URLconf live in this module and are wired in through
`override_settings(ROOT_URLCONF=...)`, so the project URLconf stays free of
test-only endpoints.
"""

import json
import logging
import sys

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
    ENVELOPE_KEYS,
    TITLES,
    Conflict,
    brainx_exception_handler,
)
from apps.core.logging import JsonFormatter

# Keys reserved for a later epic; this contract never emits them.
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
    path('unhandled/', UnhandledView.as_view()),
    path('throttled/', ThrottledView.as_view()),
]

TEST_SETTINGS = override_settings(ROOT_URLCONF=__name__)


class SubstrateSettingsTests(SimpleTestCase):
    """The substrate guarantees, pinned so a regression cannot pass the suite.

    Restoring the SQLite default, dropping the `socket_timeout` workaround or
    unhooking the exception handler would each leave every other test green.
    """

    def test_default_database_is_postgresql(self):
        self.assertEqual(
            settings.DATABASES['default']['ENGINE'],
            'django.db.backends.postgresql',
        )
        self.assertNotIn('sqlite', str(settings.DATABASES).lower())

    def test_every_channel_layer_host_carries_the_socket_timeout_workaround(self):
        hosts = settings.CHANNEL_LAYERS['default']['CONFIG']['hosts']
        self.assertTrue(hosts, 'no channel layer host configured')
        for host in hosts:
            with self.subTest(host=host):
                self.assertIn('socket_timeout', host)
                self.assertIsNone(host['socket_timeout'])

    def test_the_error_envelope_handler_is_the_configured_one(self):
        self.assertIs(api_settings.EXCEPTION_HANDLER, brainx_exception_handler)


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
        test_case.assertNotIn(reserved, body['errors'])
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

    def test_validation_error_without_fields_has_empty_errors(self):
        response = self.call_handler(ValidationError('Malformed payload.'))
        self.assertEqual(response.status_code, status.HTTP_400_BAD_REQUEST)
        self.assertEqual(response.data['errors'], {})
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

    def test_django_validation_error_renders_400_with_field_names(self):
        response = self.call_handler(
            DjangoValidationError({'email': ['Enter a valid email address.']})
        )
        body = response.data
        self.assertEqual(response.status_code, status.HTTP_400_BAD_REQUEST)
        self.assertEqual(body['type'], 'validation_error')
        self.assertEqual(body['errors'], {'email': ['Enter a valid email address.']})
        self.assertEqual(body['detail'], 'Enter a valid email address.')

    def test_django_validation_error_without_field_names_has_empty_errors(self):
        response = self.call_handler(DjangoValidationError('Malformed payload.'))
        self.assertEqual(response.status_code, status.HTTP_400_BAD_REQUEST)
        self.assertEqual(response.data['type'], 'validation_error')
        self.assertEqual(response.data['errors'], {})
        self.assertEqual(response.data['detail'], 'Malformed payload.')

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

    def test_django_permission_denied_renders_403(self):
        response = self.call_handler(DjangoPermissionDenied('Not for you.'))
        self.assertEqual(response.status_code, status.HTTP_403_FORBIDDEN)
        self.assertEqual(response.data['type'], 'permission_denied')
        self.assertEqual(response.data['detail'], 'Not for you.')

    def test_not_found_renders_404(self):
        response = self.call_handler(NotFound('No such thing.'))
        self.assertEqual(response.status_code, status.HTTP_404_NOT_FOUND)
        self.assertEqual(response.data['type'], 'not_found')

    def test_django_http404_renders_404(self):
        response = self.call_handler(Http404('Gone by Django.'))
        self.assertEqual(response.status_code, status.HTTP_404_NOT_FOUND)
        self.assertEqual(response.data['type'], 'not_found')
        self.assertEqual(response.data['detail'], 'Gone by Django.')

    def test_conflict_renders_409(self):
        response = self.call_handler(Conflict())
        self.assertEqual(response.status_code, status.HTTP_409_CONFLICT)
        self.assertEqual(response.data['type'], 'conflict')
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
            username=email,
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
        assert_envelope(self, response, 'permission_denied', 403)

    def test_not_found_renders_404(self):
        response = self.client.get('/not-found/')
        assert_envelope(self, response, 'not_found', 404)

    def test_django_http404_renders_404(self):
        response = self.client.get('/http-404/')
        assert_envelope(self, response, 'not_found', 404)

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

    def test_every_status_renders_the_same_five_keys(self):
        cases = [
            ('post', '/validation-failure/', 'validation_error', 400),
            ('get', '/authenticated-only/', 'unauthenticated', 401),
            ('get', '/student-only/', 'permission_denied', 403),
            ('get', '/not-found/', 'not_found', 404),
            ('post', '/conflict/', 'conflict', 409),
        ]
        for verb, path, expected_type, expected_status in cases:
            with self.subTest(status=expected_status):
                if expected_status == 403:
                    self.client.force_authenticate(self.make_user('s@example.com'))
                response = getattr(self.client, verb)(path, {}, format='json')
                assert_envelope(self, response, expected_type, expected_status)
                self.client.force_authenticate(user=None)


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

    def test_live_console_handler_formats_records_as_json(self):
        console_handlers = [
            handler
            for handler in logging.getLogger().handlers
            if getattr(handler, 'formatter', None) is not None
            and isinstance(handler.formatter, JsonFormatter)
        ]
        self.assertTrue(console_handlers, 'no handler is using JsonFormatter')
        line = console_handlers[0].format(self.make_record('through the live handler'))
        self.assertEqual(json.loads(line)['message'], 'through the live handler')
