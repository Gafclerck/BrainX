"""Tests for the per-destination throttling on the four email-driving endpoints.

Story 1.7: `register/`, `password-reset/`, `verify-email/` and
`reset-password/` are bounded per destination address rather than per caller -
the scope key is the normalised address resolved server-side from the body or
from the token's own row, never the IP and never a client-supplied header -
with a `REMOTE_ADDR` backstop underneath. Endpoints are reached through the
project URLconf, so the mounting under `API_PREFIX` is what these tests
resolve rather than a test-only one.

Throttling is disabled by `config.settings.development` (every rate is
`None`), so the behavioural classes here swap real rates into
`SimpleRateThrottle.THROTTLE_RATES` for the duration of each test - the same
override `apps.core.tests.test_exceptions` proves, with an `addCleanup`
because the rates are snapshotted at import.
"""

from django.conf import settings
from django.core import mail
from django.core.cache import cache
from django.test import SimpleTestCase, TestCase
from django.urls import reverse

from drf_spectacular.generators import SchemaGenerator

from rest_framework.test import APIClient, APIRequestFactory
from rest_framework.throttling import (
    AnonRateThrottle,
    ScopedRateThrottle,
    SimpleRateThrottle,
    UserRateThrottle,
)

from config.settings import base as base_settings

from ..throttling import DestinationRateThrottle, SourceRateThrottle

from ..models import AccountToken, TokenConsumption, User
from ..tokens import (
    RESET_TOKEN_SALT,
    VERIFY_TOKEN_SALT,
    issue_password_reset_token,
    issue_verification_token,
)
from ..views import (
    PasswordResetConfirmView,
    PasswordResetRequestView,
    RegisterView,
    VerifyEmailView,
)

EMAIL = 'student@example.com'
OTHER_EMAIL = 'other@example.com'
PASSWORD = 'quixotic-marmalade-93'
INITIAL_PASSWORD = 'strong-initial-password-123!'
NEW_PASSWORD = 'strong-new-password-456!'

# Mirrors apps.core.tests.test_exceptions.assert_envelope, and the local copy
# every other endpoint test file keeps (the convention, not a shared import).
ENVELOPE_KEYS = ('type', 'title', 'status', 'detail', 'errors')

# The rates the behavioural tests run with: base.py's own production values,
# written out rather than imported so a silent change to base cannot move
# these tests along with it. `ThrottleConfigurationTests` pins base separately.
ENABLED_RATES = {
    'register': '5/hour',
    'forgot': '5/hour',
    'reset': '5/hour',
    'activate': '5/hour',
    'source': '2000/day',
}


def assert_envelope(test_case, response, expected_type, expected_status):
    body = response.json()
    test_case.assertEqual(sorted(body), sorted(ENVELOPE_KEYS))
    test_case.assertEqual(body['type'], expected_type)
    test_case.assertTrue(body['title'])
    test_case.assertEqual(body['status'], expected_status)
    test_case.assertEqual(response.status_code, expected_status)
    test_case.assertTrue(body['detail'])
    test_case.assertIsInstance(body['errors'], dict)
    test_case.assertTrue(response['Content-Type'].startswith('application/json'))
    return body


class ThrottledEndpointTestCase(TestCase):
    """A base that turns throttling on for each test, then off again.

    `SimpleRateThrottle.THROTTLE_RATES` is snapshotted at import, so
    override_settings alone cannot move it once DRF is loaded; the class
    attribute is swapped for the duration of each test with an `addCleanup`,
    and the cache is cleared on both sides so no bucket survives a test or
    leaks into the next one.
    """

    rates = ENABLED_RATES

    def setUp(self):
        self.client = APIClient()
        original_rates = SimpleRateThrottle.THROTTLE_RATES
        self.addCleanup(
            setattr, SimpleRateThrottle, 'THROTTLE_RATES', original_rates
        )
        SimpleRateThrottle.THROTTLE_RATES = {**original_rates, **self.rates}
        cache.clear()
        self.addCleanup(cache.clear)


class ThrottleConfigurationTests(SimpleTestCase):
    """The wiring itself (AC 1, AC 5), asserted on the declarations.

    The behavioural tests below prove the limits bite; these prove the
    configuration that makes them bite is the one shipped, so a dropped scope
    rate or a re-introduced caller-keyed throttle cannot pass by keeping every
    request under the limit anyway.
    """

    def test_the_scoped_throttle_is_in_the_base_defaults(self):
        classes = base_settings.REST_FRAMEWORK['DEFAULT_THROTTLE_CLASSES']
        self.assertIn('rest_framework.throttling.ScopedRateThrottle', classes)

    def test_the_destination_throttle_is_a_scoped_throttle(self):
        # AC 1: the four endpoints carry a `ScopedRateThrottle` scope, served
        # by a subclass of it rather than by a lookalike.
        self.assertTrue(issubclass(DestinationRateThrottle, ScopedRateThrottle))

    def test_the_base_rates_declare_every_scope_the_endpoints_need(self):
        rates = base_settings.REST_FRAMEWORK['DEFAULT_THROTTLE_RATES']
        # Written out rather than compared against ENABLED_RATES: the point
        # is what base declares, not what these tests happen to exercise.
        self.assertEqual(rates['register'], '5/hour')
        self.assertEqual(rates['forgot'], '5/hour')
        self.assertEqual(rates['reset'], '5/hour')
        self.assertEqual(rates['activate'], '5/hour')
        self.assertEqual(rates['source'], '2000/day')

    def test_each_endpoint_declares_its_scope(self):
        cases = (
            (RegisterView, 'register'),
            (PasswordResetRequestView, 'forgot'),
            (VerifyEmailView, 'reset'),
            (PasswordResetConfirmView, 'reset'),
        )
        for view, scope in cases:
            with self.subTest(view=view.__name__):
                self.assertEqual(view.throttle_scope, scope)

    def test_each_endpoint_uses_only_the_destination_and_backstop(self):
        for view in (
            RegisterView,
            PasswordResetRequestView,
            VerifyEmailView,
            PasswordResetConfirmView,
        ):
            with self.subTest(view=view.__name__):
                # The explicit list is what keeps the caller-keyed throttles
                # off these endpoints (AC 5).
                self.assertEqual(
                    view.throttle_classes,
                    [DestinationRateThrottle, SourceRateThrottle],
                )
                self.assertNotIn(AnonRateThrottle, view.throttle_classes)
                self.assertNotIn(UserRateThrottle, view.throttle_classes)

    def test_the_token_endpoints_declare_the_salt_their_rows_are_signed_with(self):
        self.assertIs(VerifyEmailView.throttle_token_salt, VERIFY_TOKEN_SALT)
        self.assertIs(PasswordResetConfirmView.throttle_token_salt, RESET_TOKEN_SALT)
        # The body-address endpoints have no salt: a stray `token` key in a
        # registration payload must not move where the destination is read
        # from.
        self.assertFalse(hasattr(RegisterView, 'throttle_token_salt'))
        self.assertFalse(hasattr(PasswordResetRequestView, 'throttle_token_salt'))

    def test_the_backstop_key_is_remote_addr_and_never_a_forwarded_header(self):
        request = APIRequestFactory().get(
            '/', HTTP_X_FORWARDED_FOR='203.0.113.9'
        )
        request.META['REMOTE_ADDR'] = '198.51.100.7'
        key = SourceRateThrottle().get_cache_key(request, RegisterView)
        self.assertEqual(key, 'throttle_source_198.51.100.7')
        self.assertNotIn('203.0.113.9', key)


class RegistrationThrottleTests(ThrottledEndpointTestCase):
    """The register scope: 5/hour per destination address."""

    def setUp(self):
        super().setUp()
        self.url = reverse('register')

    def register(self, email=EMAIL, body=None, **headers):
        payload = {'email': email, 'password': PASSWORD}
        if body:
            payload.update(body)
        return self.client.post(self.url, payload, format='json', **headers)

    def test_the_sixth_registration_for_one_address_is_429_in_the_envelope(self):
        for _ in range(5):
            self.assertEqual(self.register().status_code, 201)
        users = User.objects.count()
        tokens = AccountToken.objects.count()
        mails = len(mail.outbox)

        response = self.register()

        body = assert_envelope(self, response, 'throttled', 429)
        self.assertEqual(body['errors'], {})
        self.assertIn('Retry-After', response)
        self.assertGreaterEqual(int(response['Retry-After']), 1)
        # The throttled request itself sends no email, creates no account
        # row and issues no token (AC 4).
        self.assertEqual(User.objects.count(), users)
        self.assertEqual(AccountToken.objects.count(), tokens)
        self.assertEqual(len(mail.outbox), mails)

    def test_destinations_from_one_source_never_share_a_budget(self):
        # The NAT case (AC 3): five posts for one address, then the first
        # post for a second address - which is the sixth request from this
        # source, and would be refused if identity were the caller.
        for _ in range(5):
            self.assertEqual(self.register(email=EMAIL).status_code, 201)
        for _ in range(5):
            self.assertEqual(self.register(email=OTHER_EMAIL).status_code, 201)
        self.assertEqual(User.objects.count(), 2)

        # Each budget is spent, and each refusal touches only its own bucket.
        self.assertEqual(self.register(email=EMAIL).status_code, 429)
        self.assertEqual(self.register(email=OTHER_EMAIL).status_code, 429)

    def test_rotating_forwarded_headers_do_not_reset_the_bucket(self):
        # AC 5: identity is never header-derived, so a different
        # X-Forwarded-For per request still lands in one bucket.
        for index in range(5):
            response = self.register(HTTP_X_FORWARDED_FOR=f'203.0.113.{index + 1}')
            self.assertEqual(response.status_code, 201)
        response = self.register(HTTP_X_FORWARDED_FOR='198.51.100.99')
        self.assertEqual(response.status_code, 429)

    def test_the_bucket_is_keyed_on_the_normalised_address(self):
        # Five spellings of one mailbox are one bucket (AC 2): if the key
        # were the raw body value, each spelling would draw a fresh budget
        # and the sixth post would sail through.
        spellings = (
            'Student@Example.COM',
            '  student@example.com  ',
            'STUDENT@EXAMPLE.COM',
            ' student@Example.com ',
            'Student@example.com',
        )
        for spelling in spellings:
            self.assertEqual(self.register(email=spelling).status_code, 201)
        self.assertEqual(User.objects.count(), 1)
        self.assertEqual(self.register(email=EMAIL).status_code, 429)


class PasswordResetRequestThrottleTests(ThrottledEndpointTestCase):
    """The forgot scope: 5/hour per destination address, account or not."""

    def setUp(self):
        super().setUp()
        self.url = reverse('password-reset')
        User.objects.create_user(email=EMAIL, password=INITIAL_PASSWORD)

    def request_reset(self, email=EMAIL, **headers):
        return self.client.post(
            self.url, {'email': email}, format='json', **headers
        )

    def test_the_sixth_reset_request_for_one_address_is_429_and_sends_nothing(self):
        for _ in range(5):
            self.assertEqual(self.request_reset().status_code, 200)
        self.assertEqual(len(mail.outbox), 5)

        response = self.request_reset()

        body = assert_envelope(self, response, 'throttled', 429)
        self.assertIn('Retry-After', response)
        self.assertEqual(body['errors'], {})
        # AC 4: the throttled request mails nothing, so the outbox is
        # exactly what the five allowed requests left in it.
        self.assertEqual(len(mail.outbox), 5)

    def test_a_reset_request_for_an_unknown_address_is_bounded_too(self):
        # The budget belongs to the destination address, resolved from the
        # body - whether or not an account holds it (AC 2).
        for _ in range(5):
            self.assertEqual(
                self.request_reset(email='nobody@example.com').status_code, 200
            )
        self.assertEqual(
            self.request_reset(email='nobody@example.com').status_code, 429
        )
        self.assertEqual(len(mail.outbox), 0)


class TokenAcceptanceThrottleTests(ThrottledEndpointTestCase):
    """The reset scope: one 5/hour bucket shared by both acceptances."""

    def setUp(self):
        super().setUp()
        self.verify_url = reverse('verify-email')
        self.reset_url = reverse('reset-password')
        self.user = User.objects.create_user(
            email=EMAIL, password=INITIAL_PASSWORD
        )
        self.verify_token, _row = issue_verification_token(self.user)

    def accept_verification(self, token=None, **headers):
        return self.client.post(
            self.verify_url,
            {'token': self.verify_token if token is None else token},
            format='json',
            **headers,
        )

    def accept_reset(self, token, **headers):
        return self.client.post(
            self.reset_url,
            {'token': token, 'password': NEW_PASSWORD},
            format='json',
            **headers,
        )

    def test_the_sixth_acceptance_is_429_not_400_and_consumes_nothing(self):
        # Burn the shared bucket with this destination: the first acceptance
        # verifies the account, and the four spent replays still resolve to
        # the same row and therefore to the same bucket.
        self.assertEqual(self.accept_verification().status_code, 200)
        for _ in range(4):
            self.assertEqual(self.accept_verification().status_code, 400)
        self.assertEqual(TokenConsumption.objects.count(), 1)

        # A *valid, unspent* token arrives sixth: the answer is 429 rather
        # than the 400 a spent token would get, and nothing is consumed.
        reset_token, reset_row = issue_password_reset_token(self.user)
        response = self.accept_reset(reset_token)

        body = assert_envelope(self, response, 'throttled', 429)
        self.assertIn('Retry-After', response)
        self.assertEqual(body['errors'], {})
        reset_row.refresh_from_db()
        self.assertIsNone(reset_row.used_at)
        self.user.refresh_from_db()
        self.assertTrue(self.user.check_password(INITIAL_PASSWORD))
        self.assertEqual(TokenConsumption.objects.count(), 1)

    def test_garbage_tokens_never_consume_a_destination_bucket(self):
        # A garbage token resolves to no destination, so the destination
        # throttle skips it entirely and the real bucket stays untouched
        # (the matrix's "destination throttle skips" row).
        for _ in range(5):
            self.assertEqual(
                self.accept_verification(token='not-a-real-token').status_code, 400
            )
        self.assertEqual(self.accept_verification().status_code, 200)

    def test_the_backstop_never_blocks_a_resolvable_destination_on_its_own(self):
        # The mirror of the backstop tests below: with the generous
        # production source rate in force, the first acceptance verifies the
        # account and the four spent replays are bounded by the destination
        # (5/hour) - six requests reach one source and the backstop
        # (2000/day) has not spoken: the garbage replay below is still
        # answered by the view, not by a throttle.
        self.assertEqual(self.accept_verification().status_code, 200)
        for _ in range(4):
            self.assertEqual(self.accept_verification().status_code, 400)
        self.assertEqual(
            self.accept_verification(token='still-not-a-real-token').status_code,
            400,
        )
        # Only the destination can bound the valid token that arrives next.
        reset_token, _row = issue_password_reset_token(self.user)
        self.assertEqual(self.accept_reset(reset_token).status_code, 429)

    def test_a_body_email_claim_is_never_a_destination(self):
        # AC 2 (triage row 7): on the token endpoints the token's own row is
        # the only server-side resolver, so a body `email` claim must not
        # move which bucket a garbage token charges. Five garbage posts that
        # claim EMAIL would spend EMAIL's shared `reset` bucket if the claim
        # were trusted; the honest resolver skips all five, so the genuine
        # token still confirms at the tail of the burst.
        for _ in range(5):
            response = self.client.post(
                self.verify_url,
                {'token': 'not-a-real-token', 'email': EMAIL},
                format='json',
            )
            self.assertEqual(response.status_code, 400)
        self.assertEqual(self.accept_verification().status_code, 200)

    def test_a_whitespace_padded_token_charges_the_same_bucket(self):
        # Triage row 5: the view's `CharField` trims, so a padded token is
        # the same token; the throttle strips too (throttling.py), so the
        # padded posts draw from the same bucket and the sixth acceptance
        # still answers 429 rather than sailing through on a fresh bucket.
        padded = f'  {self.verify_token}  '
        self.assertEqual(self.accept_verification(token=padded).status_code, 200)
        for _ in range(4):
            self.assertEqual(self.accept_verification(token=padded).status_code, 400)
        reset_token, _row = issue_password_reset_token(self.user)
        response = self.accept_reset(reset_token)
        assert_envelope(self, response, 'throttled', 429)


class SourceBackstopTests(ThrottledEndpointTestCase):
    """The REMOTE_ADDR backstop, exercised at a deliberately low source rate.

    The destination scopes stay at their production 5/hour, so a 429 that
    arrives before a destination bucket is full can only have come from the
    backstop - which is what proves it, and not the destination, is what
    bounds traffic no destination can key on.
    """

    rates = {**ENABLED_RATES, 'source': '2/day'}

    def test_garbage_verification_tokens_are_bounded_by_the_backstop(self):
        url = reverse('verify-email')
        for _ in range(2):
            response = self.client.post(
                url, {'token': 'not-a-real-token'}, format='json'
            )
            self.assertEqual(response.status_code, 400)
        response = self.client.post(
            url, {'token': 'not-a-real-token'}, format='json'
        )
        body = assert_envelope(self, response, 'throttled', 429)
        self.assertIn('Retry-After', response)
        self.assertEqual(body['errors'], {})

    def test_garbage_reset_tokens_are_bounded_by_the_backstop(self):
        url = reverse('reset-password')
        for _ in range(2):
            response = self.client.post(
                url,
                {'token': 'not-a-real-token', 'password': NEW_PASSWORD},
                format='json',
            )
            self.assertEqual(response.status_code, 400)
        response = self.client.post(
            url,
            {'token': 'not-a-real-token', 'password': NEW_PASSWORD},
            format='json',
        )
        assert_envelope(self, response, 'throttled', 429)

    def test_the_backstop_identity_is_remote_addr_not_the_forwarded_header(self):
        # The forgot scope is at 5/hour and cannot answer the third request,
        # so this 429 is the backstop - and it arrives despite every request
        # carrying a different X-Forwarded-For (AC 5).
        url = reverse('password-reset')
        for index in range(2):
            response = self.client.post(
                url,
                {'email': EMAIL},
                format='json',
                HTTP_X_FORWARDED_FOR=f'203.0.113.{index + 1}',
            )
            self.assertEqual(response.status_code, 200)
        response = self.client.post(
            url,
            {'email': EMAIL},
            format='json',
            HTTP_X_FORWARDED_FOR='192.0.2.44',
        )
        assert_envelope(self, response, 'throttled', 429)

    def test_malformed_json_is_bounded_by_the_backstop_not_a_500(self):
        # Triage row 4: the guarded body read resolves a body the parser
        # refuses to "no destination" inside the throttle instead of
        # raising, so the backstop still runs beneath every malformed post
        # (the view answers its own 400) - and the third post of the burst
        # is refused by the backstop rather than answered or 500ed.
        url = reverse('verify-email')
        for _ in range(2):
            response = self.client.post(
                url, '{not json', content_type='application/json'
            )
            self.assertEqual(response.status_code, 400)
        response = self.client.post(url, '{not json', content_type='application/json')
        assert_envelope(self, response, 'throttled', 429)

    def test_unsupported_media_types_are_bounded_by_the_backstop(self):
        # Triage row 28: `_payload` catches `UnsupportedMediaType` too, so a
        # body the parser refuses for its content type charges no
        # destination but still runs the backstop beneath it (the view
        # answers its own 415).
        url = reverse('verify-email')
        for _ in range(2):
            response = self.client.post(
                url, 'token=x', content_type='application/xml'
            )
            self.assertEqual(response.status_code, 415)
        response = self.client.post(
            url, 'token=x', content_type='application/xml'
        )
        assert_envelope(self, response, 'throttled', 429)


class UnresolvableDestinationTests(ThrottledEndpointTestCase):
    """Absent-field bodies: 400 from the view, and no bucket charged.

    The review's gap (triage row 6) was that every rate-enabled test carried
    a usable string field, so the `_destination_email` skip branches never
    ran with live rates - a `data['email']` regression would have shipped
    green. These tests post bodies with no resolvable destination: the
    destination throttle must skip them (their own bucket stays untouched,
    which the request that follows proves) and the view must answer its own
    400, never a 500.
    """

    def setUp(self):
        super().setUp()
        self.user = User.objects.create_user(
            email=EMAIL, password=INITIAL_PASSWORD
        )

    def test_register_without_an_email_field_is_400_and_charges_no_destination(self):
        url = reverse('register')
        for _ in range(5):
            response = self.client.post(
                url, {'password': PASSWORD}, format='json'
            )
            self.assertEqual(response.status_code, 400)
        # The email-less posts never touched EMAIL's bucket, so the first
        # valid registration for it still passes the 5/hour limit.
        response = self.client.post(
            url, {'email': EMAIL, 'password': PASSWORD}, format='json'
        )
        self.assertEqual(response.status_code, 201)
        self.assertEqual(User.objects.filter(email=EMAIL).count(), 1)

    def test_reset_request_without_an_email_field_is_400_and_charges_no_destination(self):
        url = reverse('password-reset')
        for _ in range(5):
            response = self.client.post(url, {}, format='json')
            self.assertEqual(response.status_code, 400)
        response = self.client.post(url, {'email': EMAIL}, format='json')
        self.assertEqual(response.status_code, 200)
        self.assertEqual(len(mail.outbox), 1)

    def test_verification_without_a_token_is_400_and_charges_no_destination(self):
        url = reverse('verify-email')
        for _ in range(5):
            response = self.client.post(url, {}, format='json')
            self.assertEqual(response.status_code, 400)
        token, _row = issue_verification_token(self.user)
        response = self.client.post(url, {'token': token}, format='json')
        self.assertEqual(response.status_code, 200)

    def test_reset_confirmation_without_a_token_is_400_and_charges_no_destination(self):
        url = reverse('reset-password')
        for _ in range(5):
            response = self.client.post(
                url, {'password': NEW_PASSWORD}, format='json'
            )
            self.assertEqual(response.status_code, 400)
        token, _row = issue_password_reset_token(self.user)
        response = self.client.post(
            url, {'token': token, 'password': NEW_PASSWORD}, format='json'
        )
        self.assertEqual(response.status_code, 200)

    def test_a_json_array_body_is_400_and_charges_no_destination(self):
        # Triage row 27: the `isinstance(data, Mapping)` guard runs only at
        # live rates. A list body must resolve to "no destination" rather
        # than raise `AttributeError` out of `check_throttles` into a 500.
        url = reverse('register')
        for _ in range(5):
            response = self.client.post(url, [], format='json')
            self.assertEqual(response.status_code, 400)
        response = self.client.post(
            url, {'email': EMAIL, 'password': PASSWORD}, format='json'
        )
        self.assertEqual(response.status_code, 201)

    def test_a_non_string_email_is_400_and_charges_no_destination(self):
        # Triage row 27: the non-string `email` guard. A number is not an
        # address and must be skipped, not passed to `normalize_email`.
        url = reverse('register')
        for _ in range(5):
            response = self.client.post(
                url, {'email': 123, 'password': PASSWORD}, format='json'
            )
            self.assertEqual(response.status_code, 400)
        response = self.client.post(
            url, {'email': EMAIL, 'password': PASSWORD}, format='json'
        )
        self.assertEqual(response.status_code, 201)

    def test_a_non_string_token_is_400_and_charges_no_destination(self):
        # Triage row 27: the non-string `token` guard that precedes the
        # `.strip()` call. An integer must resolve to "no destination".
        url = reverse('verify-email')
        for _ in range(5):
            response = self.client.post(url, {'token': 123}, format='json')
            self.assertEqual(response.status_code, 400)
        token, _row = issue_verification_token(self.user)
        response = self.client.post(url, {'token': token}, format='json')
        self.assertEqual(response.status_code, 200)


class DevelopmentNeutralityTests(TestCase):
    """Under development settings nothing throttles, however often it is called."""

    def setUp(self):
        self.client = APIClient()

    def test_every_scope_rate_is_declared_and_none_under_development(self):
        rates = settings.REST_FRAMEWORK['DEFAULT_THROTTLE_RATES']
        for scope in ('register', 'forgot', 'reset', 'activate', 'source'):
            with self.subTest(scope=scope):
                self.assertIn(scope, rates)
                self.assertIsNone(rates[scope])
        self.assertEqual(settings.REST_FRAMEWORK['DEFAULT_THROTTLE_CLASSES'], [])

    def test_repeated_registrations_are_never_throttled_in_development(self):
        statuses = [
            self.client.post(
                reverse('register'),
                {'email': EMAIL, 'password': PASSWORD},
                format='json',
            ).status_code
            for _ in range(7)
        ]
        self.assertEqual(statuses, [201] * 7)

    def test_repeated_reset_requests_are_never_throttled_in_development(self):
        statuses = [
            self.client.post(
                reverse('password-reset'), {'email': EMAIL}, format='json'
            ).status_code
            for _ in range(7)
        ]
        self.assertEqual(statuses, [200] * 7)

    def test_repeated_garbage_token_posts_are_never_throttled_in_development(self):
        verify_statuses = [
            self.client.post(
                reverse('verify-email'),
                {'token': 'not-a-real-token'},
                format='json',
            ).status_code
            for _ in range(7)
        ]
        reset_statuses = [
            self.client.post(
                reverse('reset-password'),
                {'token': 'not-a-real-token', 'password': NEW_PASSWORD},
                format='json',
            ).status_code
            for _ in range(7)
        ]
        self.assertEqual(verify_statuses, [400] * 7)
        self.assertEqual(reset_statuses, [400] * 7)


class PublishedThrottledResponseSchemaTests(TestCase):
    """The four endpoints publish the 429 the story adds (AC 4).

    The throttled response is designed and tested at runtime, so the document
    a client reads to decide how to parse a rejection has to declare it too.
    No other test reads the `429` key, so a dropped `THROTTLED_RESPONSE` would
    otherwise ship green - the spec's own check is a manual `spectacular` run.
    """

    def test_the_four_endpoints_declare_the_throttled_envelope(self):
        schema = SchemaGenerator().get_schema(request=None, public=True)
        paths = schema['paths']
        components = schema['components']['schemas']
        for route in (
            'register',
            'verify-email',
            'password-reset',
            'reset-password',
        ):
            with self.subTest(route=route):
                operation = paths[reverse(route)]['post']
                self.assertIn('429', operation['responses'])
                ref = operation['responses']['429']['content'][
                    'application/json'
                ]['schema']['$ref']
                name = ref.rsplit('/', 1)[-1]
                self.assertIn(name, components)
                self.assertEqual(
                    sorted(components[name]['properties']), sorted(ENVELOPE_KEYS)
                )
