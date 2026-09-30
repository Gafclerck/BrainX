"""Tests for email verification, the JWT pair it returns, and `me/`.

Both endpoints are reached through the project URLconf, so the mounting under
`API_PREFIX` is what these tests resolve rather than a test-only one, and
`me/` is exercised over real HTTP requests carrying an `Authorization: Bearer`
header rather than through `force_authenticate` or a direct call into the
authenticator. A permission decision and a row of data are only proven together
by the same credential arriving over the wire.
"""

import json
import re
import uuid
from datetime import timedelta
from types import SimpleNamespace

from django.conf import settings
from django.contrib.auth.models import AnonymousUser
from django.core import mail, signing
from django.db import IntegrityError, models, transaction
from django.test import SimpleTestCase, TestCase
from django.urls import reverse
from django.utils import timezone
from drf_spectacular.generators import SchemaGenerator
from rest_framework.permissions import AllowAny, IsAuthenticated
from rest_framework.test import APIRequestFactory, APIClient
from rest_framework_simplejwt.authentication import JWTAuthentication
from rest_framework_simplejwt.exceptions import InvalidToken
from rest_framework_simplejwt.token_blacklist.models import OutstandingToken
from rest_framework_simplejwt.tokens import AccessToken, RefreshToken

from apps.core.permissions import IsVerifiedAccount

from ..models import AccountToken, TokenConsumption, User
from ..tokens import (
    VERIFY_TOKEN_SALT,
    TokenRejected,
    consume_verification_token,
    issue_verification_token,
    live_verification_token,
)
from ..views import TOKEN_REJECTED_MESSAGE, MeView, VerifyEmailView

EMAIL = 'student@example.com'
PASSWORD = 'quixotic-marmalade-93'
OTHER_EMAIL = 'other@example.com'

# The salt a `reset` token would be signed with. Not a constant in `tokens.py` -
# the reset flow is story 1.4 and it has not been written, so naming the wrong
# purpose here is spelled out rather than imported from a module that would
# need to exist first.
RESET_SALT = 'user-password-reset'

# Mirrors apps.core.tests.test_exceptions.assert_envelope, and
# apps.users.tests.test_registration's own copy. Declared locally to follow the
# convention the two modules already set; the fact that the envelope is now
# spelled out in three places is recorded in deferred-work.md and belongs to
# the story that makes it one shared component.
ENVELOPE_KEYS = ('type', 'title', 'status', 'detail', 'errors')


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


def signed_for(pk, salt=VERIFY_TOKEN_SALT):
    """A signed value naming `pk`, for rows this test writes by hand."""
    return signing.dumps(str(pk), salt=salt)


def tamper(signed, position=-1):
    """One character of a signed value altered, leaving its shape intact."""
    replacement = 'A' if signed[position] != 'A' else 'B'
    return f'{signed[:position]}{replacement}{signed[position + 1:]}'


class TokenConsumptionRowTests(TestCase):
    """The record that a token was spent, and the constraint behind it."""

    def setUp(self):
        self.user = User.objects.create_user(email=EMAIL, password=PASSWORD)
        self._signed, self.row = issue_verification_token(self.user)

    def test_the_table_is_inheriting_the_project_bases(self):
        names = {field.name for field in TokenConsumption._meta.get_fields()}
        self.assertIn('id', names)
        self.assertIn('created_at', names)
        self.assertIn('updated_at', names)
        self.assertIsInstance(TokenConsumption._meta.pk, models.UUIDField)

    def test_the_token_column_is_a_one_to_one(self):
        # The constraint *is* the guarantee AC 4 asks for, and a one-to-one
        # column is a unique constraint on PostgreSQL - no extra declaration
        # needed to believe it.
        field = TokenConsumption._meta.get_field('token')
        self.assertTrue(field.one_to_one)
        self.assertTrue(field.unique)
        self.assertEqual(field.remote_field.on_delete, models.CASCADE)
        self.assertEqual(field.remote_field.related_name, 'consumption')
        self.assertIs(field.related_model, AccountToken)

    def test_the_row_reaches_its_token(self):
        TokenConsumption.objects.create(token=self.row)
        self.assertEqual(self.row.consumption.token, self.row)

    def test_one_token_cannot_be_consumed_twice(self):
        TokenConsumption.objects.create(token=self.row)
        # The inner block so the aborted transaction does not outlive it.
        with self.assertRaises(IntegrityError), transaction.atomic():
            TokenConsumption.objects.create(token=self.row)
        self.assertEqual(TokenConsumption.objects.count(), 1)

    def test_two_different_tokens_can_each_be_consumed(self):
        other = User.objects.create_user(email=OTHER_EMAIL, password=PASSWORD)
        _signed, other_row = issue_verification_token(other)
        TokenConsumption.objects.create(token=self.row)
        TokenConsumption.objects.create(token=other_row)
        self.assertEqual(TokenConsumption.objects.count(), 2)

    def test_deleting_the_token_takes_the_consumption_with_it(self):
        TokenConsumption.objects.create(token=self.row)
        self.row.delete()
        self.assertEqual(TokenConsumption.objects.count(), 0)

    def test_the_row_names_the_token_it_spends(self):
        consumption = TokenConsumption.objects.create(token=self.row)
        self.assertIn(str(self.row.pk), str(consumption))


class ConsumeVerificationTokenTests(TestCase):
    """The token service, before any HTTP is involved."""

    def setUp(self):
        self.user = User.objects.create_user(email=EMAIL, password=PASSWORD)
        self.signed, self.row = issue_verification_token(self.user)

    def consume(self, signed):
        return consume_verification_token(signed)

    def test_a_live_token_resolves_to_its_row_and_its_account(self):
        account, row = self.consume(self.signed)
        self.assertEqual(account, self.user)
        self.assertEqual(row, self.row)

    def test_resolving_writes_nothing(self):
        self.consume(self.signed)
        self.assertEqual(TokenConsumption.objects.count(), 0)
        self.assertIsNone(AccountToken.objects.get(pk=self.row.pk).used_at)

    def test_an_unsigned_pk_is_refused(self):
        with self.assertRaises(TokenRejected):
            self.consume(str(self.row.pk))

    def test_a_tampered_value_is_refused(self):
        # The pk is the first segment of a signed value, so altering it leaves a
        # string that still has the right shape and still names no row.
        with self.assertRaises(TokenRejected):
            self.consume(tamper(self.signed, 0))

    def test_a_tampered_signature_is_refused(self):
        with self.assertRaises(TokenRejected):
            self.consume(tamper(self.signed))

    def test_a_value_naming_no_row_is_refused(self):
        with self.assertRaises(TokenRejected):
            self.consume(signed_for(uuid.uuid4()))

    def test_a_well_signed_value_that_is_not_a_uuid_is_refused(self):
        # `signing.dumps` will sign anything JSON-encodable, so a value that
        # passes the signature check is not yet something the pk lookup can be
        # asked for. This is the `uuid.UUID` `ValueError`.
        with self.assertRaises(TokenRejected):
            self.consume(signing.dumps('not-a-uuid', salt=VERIFY_TOKEN_SALT))

    def test_a_non_string_payload_is_refused(self):
        # The same call raising `TypeError` instead: a number is JSON-encodable,
        # so this reaches `uuid.UUID` as a well-signed value of the wrong type.
        with self.assertRaises(TokenRejected):
            self.consume(signing.dumps(12345, salt=VERIFY_TOKEN_SALT))

    def test_a_token_signed_for_another_purpose_is_refused(self):
        # A purpose-scoped salt is what stops a value minted for one purpose
        # from verifying as another, and it is the whole of the wrong-salt case.
        with self.assertRaises(TokenRejected):
            self.consume(signed_for(self.row.pk, salt=RESET_SALT))

    def test_a_reset_row_signed_with_the_verification_salt_is_refused(self):
        # The other half of the wrong-purpose case. A purpose-scoped salt turns a
        # reset token into a signature failure; this is the explicit `purpose`
        # check, which is what stops a row of another purpose from being spent
        # by a token that was minted for it and happened to verify.
        reset_row = AccountToken.objects.create(
            user=self.user,
            purpose='reset',
            expires_at=timezone.now() + timedelta(minutes=30),
        )
        with self.assertRaises(TokenRejected):
            self.consume(signed_for(reset_row.pk))

    def test_a_lapsed_token_is_refused(self):
        AccountToken.objects.filter(pk=self.row.pk).update(
            expires_at=timezone.now() - timedelta(minutes=1)
        )
        with self.assertRaises(TokenRejected):
            self.consume(self.signed)

    def test_expiry_is_read_from_the_row_and_not_from_the_signing_max_age(self):
        # The measurement that makes the case above mean something: the same
        # signed value is refused with no `max_age` in play at all, so nothing
        # but the stored `expires_at` can be what refused it.
        AccountToken.objects.filter(pk=self.row.pk).update(
            expires_at=timezone.now() - timedelta(minutes=1)
        )
        self.assertEqual(
            signing.loads(self.signed, salt=VERIFY_TOKEN_SALT), str(self.row.pk)
        )
        with self.assertRaises(TokenRejected):
            self.consume(self.signed)

    def test_a_spent_token_is_refused(self):
        AccountToken.objects.filter(pk=self.row.pk).update(used_at=timezone.now())
        with self.assertRaises(TokenRejected):
            self.consume(self.signed)

    def test_a_live_token_for_an_already_verified_account_is_refused(self):
        # The row still looks spendable, so nothing about the token itself says
        # no. Deciding it here is what keeps a second caller from forgetting.
        User.objects.filter(pk=self.user.pk).update(is_email_verified=True)
        with self.assertRaises(TokenRejected):
            self.consume(self.signed)

    def test_every_refusal_raises_the_same_class(self):
        # One outcome for every cause, which is what makes a single catch in the
        # view possible - and therefore what makes the responses unable to
        # drift apart as causes are added.
        AccountToken.objects.filter(pk=self.row.pk).update(
            expires_at=timezone.now() - timedelta(minutes=1)
        )
        for candidate in (
            str(self.row.pk),
            tamper(self.signed),
            signed_for(uuid.uuid4()),
            self.signed,
        ):
            with self.subTest(candidate=candidate[:20]):
                with self.assertRaises(TokenRejected):
                    self.consume(candidate)


class VerifyEndpointTests(TestCase):
    """The POST that spends a token, and what it hands back for it."""

    def setUp(self):
        self.client = APIClient()
        self.url = reverse('verify-email')
        self.user = User.objects.create_user(email=EMAIL, password=PASSWORD)
        self.signed, self.row = issue_verification_token(self.user)

    def verify(self, token, **extra):
        return self.client.post(
            self.url, {'token': token, **extra}, format='json'
        )

    def assert_rejected(self, response):
        body = assert_envelope(self, response, 'validation_error', 400)
        self.assertIn('token', body['errors'])
        self.assertEqual(body['errors']['token'], [TOKEN_REJECTED_MESSAGE])
        return body

    # The success row of the matrix.

    def test_a_live_token_verifies_the_account_and_returns_the_pair(self):
        response = self.verify(self.signed)
        self.assertEqual(response.status_code, 200)
        body = response.json()
        self.assertEqual(sorted(body), ['access', 'refresh'])
        self.assertTrue(body['access'])
        self.assertTrue(body['refresh'])

    def test_the_account_is_verified_and_the_token_is_spent(self):
        self.verify(self.signed)
        self.user.refresh_from_db()
        self.row.refresh_from_db()
        self.assertTrue(self.user.is_email_verified)
        self.assertIsNotNone(self.row.used_at)
        self.assertIsNone(self.user.last_login)

    def test_concurrent_collision_on_consumption_is_answered_with_the_rejection_body(self):
        # When two acceptances race on the same unspent token, both pass the
        # pre-read in `consume_verification_token` because neither transaction
        # has committed. The second transaction hits the unique constraint on
        # `TokenConsumption.token` inside `_spend` and raises `IntegrityError`.
        # `VerifyEmailView.post` catches that outside `atomic()` and returns the
        # same rejection body as every other failure cause, rolling back the
        # transaction so `row.used_at` and `user.is_email_verified` are clean.
        TokenConsumption.objects.create(token=self.row)
        response = self.verify(self.signed)
        self.assert_rejected(response)
        self.user.refresh_from_db()
        self.row.refresh_from_db()
        self.assertFalse(self.user.is_email_verified)
        self.assertIsNone(self.row.used_at)
        self.assertEqual(TokenConsumption.objects.count(), 1)

    def test_spending_leaves_exactly_one_consumption_row(self):
        self.verify(self.signed)
        (consumption,) = TokenConsumption.objects.all()
        self.assertEqual(consumption.token, self.row)
        self.assertEqual(consumption.token.user, self.user)

    def test_the_access_token_resolves_back_to_the_account(self):
        # The point of the pair is that something downstream can use it, so it
        # is read the way a request would read it - through
        # `JWTAuthentication`, against the UUID-pk user model the project
        # swapped to - rather than by calling the model.
        access = self.verify(self.signed).json()['access']
        authenticator = JWTAuthentication()
        validated = authenticator.get_validated_token(access)
        self.assertEqual(authenticator.get_user(validated), self.user)

    def test_the_refresh_token_names_the_account_and_is_not_an_access_token(self):
        # The two halves of the pair are not interchangeable, and the property
        # that matters is the negative one: `AUTH_TOKEN_CLASSES` is
        # `[AccessToken]`, so a refresh token is refused as a credential. A
        # verification endpoint that handed back a refresh token any protected
        # route would accept would make the 15-minute access lifetime a
        # suggestion.
        body = self.verify(self.signed).json()
        refresh = RefreshToken(body['refresh'])
        self.assertEqual(
            str(refresh[settings.SIMPLE_JWT['USER_ID_CLAIM']]), str(self.user.pk)
        )
        with self.assertRaises(InvalidToken):
            JWTAuthentication().get_validated_token(body['refresh'])

    def test_the_minted_refresh_token_is_blacklistable(self):
        # `SIMPLE_JWT` sets `BLACKLIST_AFTER_ROTATION`, which is only meaningful
        # while a minted refresh token actually reaches the blacklist tables.
        # If the app is ever removed from `INSTALLED_APPS` this goes red instead
        # of the rotation setting quietly becoming a promise with no tables.
        self.verify(self.signed)
        (outstanding,) = OutstandingToken.objects.all()
        self.assertEqual(outstanding.user, self.user)

    def test_a_verified_account_gains_nothing_any_public_endpoint_could_set(self):
        self.verify(self.signed)
        self.user.refresh_from_db()
        self.assertTrue(self.user.is_email_verified)
        # Verification verifies the address and nothing else.
        self.assertFalse(self.user.is_publisher)
        self.assertFalse(self.user.is_staff)
        self.assertFalse(self.user.is_superuser)
        self.assertTrue(self.user.is_active)

    def test_a_second_acceptance_changes_nothing_at_all(self):
        self.verify(self.signed)
        self.user.refresh_from_db()
        self.row.refresh_from_db()
        stamped = self.row.used_at

        self.assert_rejected(self.verify(self.signed))

        self.user.refresh_from_db()
        self.row.refresh_from_db()
        self.assertTrue(self.user.is_email_verified)
        self.assertEqual(TokenConsumption.objects.count(), 1)
        self.assertEqual(self.row.used_at, stamped)

    # The rejection rows of the matrix, one test each so a cause that starts
    # answering differently is named by the test that broke.

    def test_a_replay_is_refused_and_leaves_the_account_verified(self):
        self.verify(self.signed)
        self.user.refresh_from_db()
        self.assert_rejected(self.verify(self.signed))
        self.user.refresh_from_db()
        self.assertTrue(self.user.is_email_verified)
        self.assertEqual(TokenConsumption.objects.count(), 1)

    def test_an_unknown_token_is_refused(self):
        self.assert_rejected(self.verify(signed_for(uuid.uuid4())))
        self.assertEqual(TokenConsumption.objects.count(), 0)

    def test_an_unsigned_token_is_refused(self):
        self.assert_rejected(self.verify(str(self.row.pk)))
        self.assertEqual(TokenConsumption.objects.count(), 0)

    def test_a_tampered_token_is_refused(self):
        self.assert_rejected(self.verify(tamper(self.signed)))
        self.assertEqual(TokenConsumption.objects.count(), 0)

    def test_a_token_for_another_purpose_is_refused(self):
        self.assert_rejected(self.verify(signed_for(self.row.pk, salt=RESET_SALT)))
        self.assertEqual(TokenConsumption.objects.count(), 0)

    def test_a_reset_row_signed_with_the_verification_salt_is_refused(self):
        reset_row = AccountToken.objects.create(
            user=self.user,
            purpose='reset',
            expires_at=timezone.now() + timedelta(minutes=30),
        )
        self.assert_rejected(self.verify(signed_for(reset_row.pk)))
        self.assertEqual(TokenConsumption.objects.count(), 0)

    def test_a_lapsed_token_is_refused(self):
        AccountToken.objects.filter(pk=self.row.pk).update(
            expires_at=timezone.now() - timedelta(minutes=1)
        )
        self.assert_rejected(self.verify(self.signed))
        self.assertFalse(User.objects.get(pk=self.user.pk).is_email_verified)
        self.assertEqual(TokenConsumption.objects.count(), 0)

    def test_a_spent_token_is_refused(self):
        AccountToken.objects.filter(pk=self.row.pk).update(used_at=timezone.now())
        self.assert_rejected(self.verify(self.signed))
        self.assertEqual(TokenConsumption.objects.count(), 0)

    def test_a_mismatched_address_is_refused(self):
        self.assert_rejected(self.verify(self.signed, email=OTHER_EMAIL))
        self.assertFalse(User.objects.get(pk=self.user.pk).is_email_verified)
        self.assertEqual(TokenConsumption.objects.count(), 0)

    def test_a_mismatched_address_never_resolves_its_own_account(self):
        # The row decides which account this is. A body naming another one is
        # refused; it does not verify the account it names, and it does not
        # verify the row's account either.
        other = User.objects.create_user(email=OTHER_EMAIL, password=PASSWORD)
        _other_signed, _other_row = issue_verification_token(other)
        self.assert_rejected(self.verify(self.signed, email=OTHER_EMAIL))
        self.user.refresh_from_db()
        other.refresh_from_db()
        self.assertFalse(self.user.is_email_verified)
        self.assertFalse(other.is_email_verified)
        self.assertEqual(TokenConsumption.objects.count(), 0)

    def test_a_matching_address_is_accepted(self):
        # The comparison is a check on the client, not a second credential, so
        # a client that supplies its own address is not refused for supplying
        # it.
        self.assertEqual(self.verify(self.signed, email=EMAIL).status_code, 200)

    def test_a_differently_cased_address_matches(self):
        # Compared against a stored address that is itself normalized, so the
        # comparison has to normalize too or a client typing its own mailbox
        # with capitals is refused for it.
        self.assertEqual(
            self.verify(self.signed, email='  Student@Example.COM  ').status_code,
            200,
        )

    def test_a_live_token_for_an_already_verified_account_is_refused(self):
        User.objects.filter(pk=self.user.pk).update(is_email_verified=True)
        self.assert_rejected(self.verify(self.signed))
        self.assertEqual(TokenConsumption.objects.count(), 0)

    def test_every_rejection_returns_byte_identical_bodies(self):
        # The whole of the matrix's error column in one assertion: replay,
        # unknown, forged, wrong-purpose, expired and mismatched are all the
        # same bytes, so a client has nothing to compare and an attacker has
        # nothing to learn from which one it hit. Compared on `content` rather
        # than on `json()` because only the bytes are the contract.
        rejections = {}

        # The reference: a well-signed value naming no row at all.
        rejections['unknown'] = self.verify(signed_for(uuid.uuid4())).content

        rejections['unsigned'] = self.verify(str(self.row.pk)).content
        rejections['tampered'] = self.verify(tamper(self.signed)).content
        rejections['wrong salt'] = self.verify(
            signed_for(self.row.pk, salt=RESET_SALT)
        ).content
        reset_row = AccountToken.objects.create(
            user=self.user,
            purpose='reset',
            expires_at=timezone.now() + timedelta(minutes=30),
        )
        rejections['wrong purpose'] = self.verify(signed_for(reset_row.pk)).content

        # A live row again, so the expiry case has a spendable token to lapse.
        self.signed, self.row = issue_verification_token(self.user)
        AccountToken.objects.filter(pk=self.row.pk).update(
            expires_at=timezone.now() - timedelta(minutes=1)
        )
        rejections['expired'] = self.verify(self.signed).content

        # And another, for the mismatch and then the replay. `issue_...`
        # supersedes the lapsed row, so the account holds exactly one live token.
        self.signed, self.row = issue_verification_token(self.user)
        rejections['mismatch'] = self.verify(
            self.signed, email=OTHER_EMAIL
        ).content

        self.assertEqual(self.verify(self.signed).status_code, 200)
        rejections['replay'] = self.verify(self.signed).content

        # Already verified, with a token that is still live and unspent, so the
        # account state is the only thing that refuses it.
        live_signed, _live_row = issue_verification_token(self.user)
        rejections['already verified'] = self.verify(live_signed).content

        reference = rejections['unknown']
        self.assertEqual(len(set(rejections.values())), 1, sorted(rejections))
        for cause, content in rejections.items():
            with self.subTest(cause=cause):
                self.assertEqual(content, reference)

    def test_the_rejection_body_names_no_token_and_no_address(self):
        rendered = self.verify(self.signed, email=OTHER_EMAIL).content.decode()
        self.assertNotIn(self.signed, rendered)
        self.assertNotIn(str(self.row.pk), rendered)
        self.assertNotIn(EMAIL, rendered)
        self.assertNotIn(OTHER_EMAIL, rendered)

    def test_a_rejection_is_logged_without_the_token_or_the_address(self):
        # The cause goes nowhere near the client, and it does not go into a log
        # line either: a line naming the reason is a line that can tell the
        # causes apart in the one place a client cannot read, and a line naming
        # the token or the address writes a credential and personal data into
        # every deployment's log aggregator. A refused token is ordinary traffic
        # - a stale link, a second tab, a client that retried - so there is
        # nothing for an operator to act on either.
        with self.assertNoLogs('apps.users.views', level='INFO'):
            response = self.verify(self.signed, email=OTHER_EMAIL)
        self.assertEqual(response.status_code, 400)

    def test_a_success_names_the_account_and_never_the_address_or_the_token(self):
        with self.assertLogs('apps.users.views', level='INFO') as captured:
            self.verify(self.signed)
        rendered = '\n'.join(record.getMessage() for record in captured.records)
        self.assertIn(str(self.user.pk), rendered)
        self.assertNotIn(EMAIL, rendered)
        self.assertNotIn(self.signed, rendered)

    # What the endpoint is wired to.

    def test_the_endpoint_is_mounted_under_the_api_prefix(self):
        self.assertEqual(self.url, f'{settings.API_PREFIX}/verify-email/')

    def test_the_route_mirrors_the_frontend_page_the_emailed_link_lands_on(self):
        # The link carries no path of its own, so the only thing tying the two
        # together is the name. Asserted so a rename of either side is a failure
        # here rather than a link that lands on a page with no endpoint behind it.
        self.assertEqual(
            settings.FRONTEND_VERIFY_PATH.lstrip('/'), 'verify-email'
        )
        self.assertEqual(reverse('verify-email'), self.url)

    def test_the_endpoint_is_anonymous(self):
        # A client holding a link is not holding a credential, and the pair this
        # endpoint returns does not exist yet - so authenticating here would lock
        # out the case the endpoint exists for.
        self.assertEqual(VerifyEmailView.authentication_classes, [])
        self.assertEqual(VerifyEmailView.permission_classes, [AllowAny])

    def test_a_client_with_a_stale_header_can_still_verify(self):
        # The other half of being anonymous: not merely "no header required" but
        # "a bad header is ignored". A client that has already verified once
        # carries a pair that may be stale, on a second device or after a
        # re-register, and it must still be able to spend this link.
        self.client.credentials(HTTP_AUTHORIZATION='Bearer not-a-real-token')
        self.assertEqual(self.verify(self.signed).status_code, 200)

    def test_the_endpoint_is_post_only(self):
        self.assertEqual(self.client.get(self.url).status_code, 405)

    def test_a_wrong_method_is_answered_with_drfs_own_body(self):
        response = self.client.get(self.url)
        self.assertEqual(response.status_code, 405)
        self.assertEqual(sorted(response.json()), ['detail'])

    def test_an_unparseable_body_is_answered_with_drfs_own_body(self):
        response = self.client.post(self.url, {'token': self.signed})
        self.assertEqual(response.status_code, 415)
        self.assertEqual(sorted(response.json()), ['detail'])
        self.assertFalse(User.objects.get(pk=self.user.pk).is_email_verified)

    def test_a_missing_token_is_a_400_naming_the_field(self):
        body = assert_envelope(
            self, self.client.post(self.url, {}, format='json'),
            'validation_error', 400,
        )
        self.assertIn('token', body['errors'])
        self.assertEqual(TokenConsumption.objects.count(), 0)

    def test_a_token_is_required_in_the_body_and_never_in_the_query_string(self):
        # The emailed link carries the token in a URL fragment, because a query
        # string travels in `Referer` to every host the page links to and this
        # product opens third-party destinations (AD-10). The server never sees
        # a fragment, so the only way in is a body field - which is what this
        # pins: a caller who puts it in the query string has verified nothing.
        response = self.client.post(
            f'{self.url}?token={self.signed}', {}, format='json'
        )
        body = assert_envelope(self, response, 'validation_error', 400)
        self.assertIn('token', body['errors'])
        self.assertFalse(User.objects.get(pk=self.user.pk).is_email_verified)
        self.assertEqual(TokenConsumption.objects.count(), 0)

    def test_a_null_token_is_reported_rather_than_coerced(self):
        # Same rule as the registration address: a value that is not a string is
        # left alone, so a `null` is reported as a null rather than as a token
        # that happens to look like the word.
        body = assert_envelope(
            self, self.client.post(self.url, {'token': None}, format='json'),
            'validation_error', 400,
        )
        self.assertIn('token', body['errors'])
        self.assertEqual(TokenConsumption.objects.count(), 0)

    def test_a_null_address_is_reported_rather_than_coerced(self):
        body = assert_envelope(
            self,
            self.client.post(
                self.url, {'token': self.signed, 'email': None}, format='json'
            ),
            'validation_error', 400,
        )
        self.assertIn('email', body['errors'])
        self.assertFalse(User.objects.get(pk=self.user.pk).is_email_verified)

    def test_an_extra_key_cannot_change_what_the_request_does(self):
        # The same contract the registration serializer states: an undeclared
        # key is ignored rather than rejected, so nothing a client adds can
        # reach the account state.
        response = self.verify(
            self.signed,
            is_email_verified=False,
            is_publisher=True,
            is_staff=True,
            is_superuser=True,
            pk=str(uuid.uuid4()),
        )
        self.assertEqual(response.status_code, 200)
        self.user.refresh_from_db()
        self.assertTrue(self.user.is_email_verified)
        self.assertFalse(self.user.is_publisher)
        self.assertFalse(self.user.is_staff)
        self.assertFalse(self.user.is_superuser)

    def test_the_response_carries_no_account_state(self):
        body = self.verify(self.signed).json()
        self.assertEqual(sorted(body), ['access', 'refresh'])
        self.assertNotIn(EMAIL, json.dumps(body))
        self.assertNotIn(str(self.user.pk), json.dumps(body))


class RegistrationToVerificationTests(TestCase):
    """The emailed link, from the account it is sent for to the pair it earns.

    The two halves of the flow are stories apart, so this is the one place the
    SPA's actual path is exercised: register, read the token out of the link's
    fragment, POST it as a body field, get a pair.
    """

    def setUp(self):
        self.client = APIClient()

    def test_a_registered_account_can_verify_with_the_link_it_was_sent(self):
        register = self.client.post(
            reverse('register'),
            {'email': EMAIL, 'password': PASSWORD},
            format='json',
        )
        self.assertEqual(register.status_code, 201)
        (message,) = mail.outbox

        # Read the way the page does: the fragment, never a query parameter.
        (link,) = re.findall(r'https?://\S+', message.body)
        self.assertNotIn('?', link)
        token = link.split('#token=', 1)[1]

        response = self.client.post(
            reverse('verify-email'), {'token': token}, format='json'
        )
        self.assertEqual(response.status_code, 200)
        self.assertEqual(sorted(response.json()), ['access', 'refresh'])

        user = User.objects.get(email=EMAIL)
        self.assertTrue(user.is_email_verified)
        self.assertEqual(TokenConsumption.objects.count(), 1)

    def test_the_token_in_the_link_is_the_row_that_was_persisted(self):
        self.client.post(
            reverse('register'),
            {'email': EMAIL, 'password': PASSWORD},
            format='json',
        )
        (link,) = re.findall(r'https?://\S+', mail.outbox[0].body)
        (row,) = AccountToken.objects.all()
        self.assertEqual(
            signing.loads(link.split('#token=', 1)[1], salt=VERIFY_TOKEN_SALT),
            str(row.pk),
        )

    def test_the_spent_token_is_no_longer_the_link_a_re_register_uses(self):
        # `live_verification_token` filters on `used_at IS NULL`, so a column
        # left NULL on a spent token would hand a verified account a live link
        # on its next registration - and the account is verified, so that link
        # could never be spent either. The two writes are in one transaction
        # precisely so this cannot drift.
        self.client.post(
            reverse('register'),
            {'email': EMAIL, 'password': PASSWORD},
            format='json',
        )
        (link,) = re.findall(r'https?://\S+', mail.outbox[0].body)
        self.client.post(
            reverse('verify-email'),
            {'token': link.split('#token=', 1)[1]},
            format='json',
        )
        mail.outbox.clear()

        duplicate = self.client.post(
            reverse('register'),
            {'email': EMAIL, 'password': PASSWORD},
            format='json',
        )
        self.assertEqual(duplicate.status_code, 201)
        # A verified account is sent nothing, and the reason it is not holding a
        # live token is the row, not the branch.
        self.assertEqual(len(mail.outbox), 0)
        user = User.objects.get(email=EMAIL)
        self.assertIsNone(live_verification_token(user))
        self.assertEqual(AccountToken.objects.filter(used_at__isnull=True).count(), 0)


class MeEndpointTests(TestCase):
    """`me/` over real HTTP, one test per permission branch.

    `force_authenticate` is not used anywhere in this class. It replaces the
    authenticator, so a view wired to no authentication at all would pass these
    tests, and the whole question here is whether the header is really parsed.
    """

    def setUp(self):
        self.client = APIClient()
        self.url = reverse('me')
        self.user = User.objects.create_user(email=EMAIL, password=PASSWORD)

    def as_this_account(self, token):
        self.client.credentials(HTTP_AUTHORIZATION=f'Bearer {token}')

    def test_the_endpoint_is_mounted_under_the_api_prefix(self):
        self.assertEqual(self.url, f'{settings.API_PREFIX}/me/')

    def test_an_anonymous_caller_is_401(self):
        body = assert_envelope(self, self.client.get(self.url), 'unauthenticated', 401)
        self.assertEqual(body['errors'], {})

    def test_an_unverified_account_is_403(self):
        self.as_this_account(str(AccessToken.for_user(self.user)))
        body = assert_envelope(
            self, self.client.get(self.url), 'permission_denied', 403
        )
        self.assertEqual(body['errors'], {})

    def test_the_403_is_a_different_answer_from_the_401(self):
        # The two branches are distinguishable on purpose: a client that is
        # refused must be able to tell "you are not signed in" from "your address
        # is not confirmed", because the second is something it can still fix.
        anonymous = self.client.get(self.url)
        self.as_this_account(str(AccessToken.for_user(self.user)))
        unverified = self.client.get(self.url)
        self.assertEqual(anonymous.status_code, 401)
        self.assertEqual(unverified.status_code, 403)
        self.assertNotEqual(anonymous.json()['type'], unverified.json()['type'])
        self.assertNotEqual(anonymous.content, unverified.content)

    def test_a_verified_account_gets_its_own_state(self):
        # The pair verification returned, used as a credential: the same token
        # both proves the caller is who it says and says what it may read.
        verifier = APIClient()
        signed, _row = issue_verification_token(self.user)
        pair = verifier.post(
            reverse('verify-email'), {'token': signed}, format='json'
        ).json()
        self.as_this_account(pair['access'])

        response = self.client.get(self.url)
        self.assertEqual(response.status_code, 200)
        self.assertEqual(
            response.json(), {'email': EMAIL, 'is_email_verified': True}
        )

    def test_a_malformed_token_is_401_and_not_403(self):
        # Proof the header is parsed rather than bypassed. A view with no
        # authenticator at all would answer 403 here, because an anonymous
        # caller reaches `IsVerifiedAccount` and is refused by it.
        self.as_this_account('not-a-real-token')
        self.assertEqual(self.client.get(self.url).status_code, 401)

    def test_a_token_naming_no_account_is_401(self):
        forged = AccessToken()
        forged[settings.SIMPLE_JWT['USER_ID_CLAIM']] = str(uuid.uuid4())
        self.as_this_account(str(forged))
        self.assertEqual(self.client.get(self.url).status_code, 401)

    def test_the_response_exposes_no_privilege_field(self):
        User.objects.filter(pk=self.user.pk).update(
            is_email_verified=True, is_publisher=True
        )
        self.as_this_account(str(AccessToken.for_user(self.user)))
        body = self.client.get(self.url).json()
        self.assertEqual(sorted(body), ['email', 'is_email_verified'])
        serialized = json.dumps(body)
        for absent in (
            'is_publisher',
            'is_staff',
            'is_superuser',
            'is_active',
            'id',
            'last_login',
            'password',
        ):
            self.assertNotIn(absent, serialized)

    def test_the_response_carries_no_other_accounts_address(self):
        other = User.objects.create_user(email=OTHER_EMAIL, password=PASSWORD)
        User.objects.filter(pk=self.user.pk).update(is_email_verified=True)
        self.as_this_account(str(AccessToken.for_user(self.user)))
        body = self.client.get(self.url).json()
        self.assertEqual(body['email'], EMAIL)
        self.assertNotIn(other.email, json.dumps(body))
        self.assertNotIn(str(other.pk), json.dumps(body))

    def test_each_caller_reads_only_its_own_account(self):
        # Two accounts, two verification tokens, two credentials, two answers.
        # The surface has no parameter, so there is nothing for a caller to vary
        # and therefore no id to enumerate - which is the property this test is
        # here to keep true as the endpoint grows.
        other = User.objects.create_user(email=OTHER_EMAIL, password=PASSWORD)
        verifier = APIClient()
        answers = {}
        for user in (self.user, other):
            signed, _row = issue_verification_token(user)
            pair = verifier.post(
                reverse('verify-email'), {'token': signed}, format='json'
            ).json()
            client = APIClient()
            client.credentials(HTTP_AUTHORIZATION=f'Bearer {pair["access"]}')
            answers[user.pk] = client.get(reverse('me')).json()
        self.assertEqual(answers[self.user.pk]['email'], EMAIL)
        self.assertEqual(answers[other.pk]['email'], OTHER_EMAIL)
        self.assertNotIn(OTHER_EMAIL, json.dumps(answers[self.user.pk]))
        self.assertNotIn(EMAIL, json.dumps(answers[other.pk]))

    def test_no_permission_branch_is_decided_by_a_queryset(self):
        # The authenticator already loaded the account, so both decisions and
        # the body are answered from what it brought. A queryset in a permission
        # class would show up here as a second query per request; the anonymous
        # branch is pinned at zero because nothing is resolved at all.
        User.objects.filter(pk=self.user.pk).update(is_email_verified=True)
        self.as_this_account(str(AccessToken.for_user(self.user)))
        with self.assertNumQueries(1):
            self.assertEqual(self.client.get(self.url).status_code, 200)

        unverified = User.objects.create_user(email=OTHER_EMAIL, password=PASSWORD)
        anonymous = APIClient()
        with self.assertNumQueries(0):
            self.assertEqual(anonymous.get(self.url).status_code, 401)

        client = APIClient()
        client.credentials(
            HTTP_AUTHORIZATION=f'Bearer {AccessToken.for_user(unverified)}'
        )
        with self.assertNumQueries(1):
            self.assertEqual(client.get(self.url).status_code, 403)

    def test_the_endpoint_is_get_only(self):
        # Authenticated, because DRF resolves permissions before it dispatches
        # to a method handler: an anonymous POST is answered 401 and never
        # reaches the 405. Asserted with a credential so the 405 is the answer
        # actually being measured.
        User.objects.filter(pk=self.user.pk).update(is_email_verified=True)
        self.as_this_account(str(AccessToken.for_user(self.user)))
        response = self.client.post(self.url, {}, format='json')
        self.assertEqual(response.status_code, 405)
        self.assertEqual(sorted(response.json()), ['detail'])

    def test_the_view_names_isauthenticated_before_isverified(self):
        # The order is the 401/403 split: `IsAuthenticated` is the floor, and
        # the unverified check is only reached by a caller that cleared it.
        self.assertEqual(
            MeView.permission_classes, [IsAuthenticated, IsVerifiedAccount]
        )
        # The default authenticator, not a pinned list: a view naming its own
        # would be the place a future credential has to be added twice.
        self.assertNotIn('authentication_classes', vars(MeView))


class IsVerifiedAccountTests(SimpleTestCase):
    """The permission class on its own, including the caller it is not for."""

    def setUp(self):
        self.factory = APIRequestFactory()
        self.permission = IsVerifiedAccount()

    def ask(self, user):
        request = self.factory.get(f'{settings.API_PREFIX}/me/')
        request.user = user
        return self.permission.has_permission(request, view=None)

    def test_a_verified_account_is_allowed(self):
        self.assertTrue(
            self.ask(SimpleNamespace(is_anonymous=False, is_email_verified=True))
        )

    def test_an_unverified_account_is_refused(self):
        self.assertFalse(
            self.ask(SimpleNamespace(is_anonymous=False, is_email_verified=False))
        )

    def test_an_anonymous_caller_is_refused(self):
        self.assertFalse(self.ask(AnonymousUser()))

    def test_a_caller_carrying_no_flag_is_refused_rather_than_raising(self):
        # `IsVerifiedAccount` is not the only class that will ever be listed on a
        # view, and a permission class that raised on a caller it was not written
        # for would answer 500 to a request that deserved 401 or 403. The
        # attribute is read defensively for exactly that reason.
        self.assertFalse(self.ask(SimpleNamespace(is_anonymous=False)))

    def test_no_user_at_all_is_refused(self):
        # `request.user` is set by DRF before permissions run, so this cannot
        # happen on a real request - but the class must not assume a caller it
        # is not going to be handed.
        self.assertFalse(self.ask(None))


class PublishedVerificationSchemaTests(TestCase):
    """Both new paths are in the published contract, not only in the code.

    A view that declares no request serializer and no response gives
    drf-spectacular nothing to describe, and it answers that by dropping the
    path rather than by failing (AR-22). Nothing else in the suite would
    notice, so the generated document is asserted here.
    """

    def setUp(self):
        self.schema = SchemaGenerator().get_schema(request=None, public=True)
        self.components = self.schema['components']['schemas']
        self.paths = self.schema['paths']
        self.verify_path = f'{settings.API_PREFIX}/verify-email/'
        self.me_path = f'{settings.API_PREFIX}/me/'

    def named_schema(self, ref):
        name = ref.rsplit('/', 1)[-1]
        self.assertIn(name, self.components)
        return self.components[name]

    def response_schema(self, operation, code):
        ref = operation['responses'][code]['content']['application/json'][
            'schema'
        ]['$ref']
        return self.named_schema(ref)

    def test_both_paths_are_in_the_generated_schema(self):
        self.assertIn(self.verify_path, self.paths)
        self.assertIn(self.me_path, self.paths)
        # The mounts are the project's, not a test-only URLconf.
        self.assertEqual(self.verify_path, reverse('verify-email'))
        self.assertEqual(self.me_path, reverse('me'))

    def test_the_verification_request_body_names_the_token_and_nothing_else(self):
        operation = self.paths[self.verify_path]['post']
        content = operation['requestBody']['content']['application/json']
        request_schema = self.named_schema(content['schema']['$ref'])
        self.assertEqual(sorted(request_schema['properties']), ['email', 'token'])
        # Only `token` is required: the address is a claim a client may add.
        self.assertEqual(sorted(request_schema['required']), ['token'])

    def test_the_200_carries_the_pair_and_no_account_state(self):
        operation = self.paths[self.verify_path]['post']
        schema = self.response_schema(operation, '200')
        self.assertEqual(sorted(schema['properties']), ['access', 'refresh'])

    def test_the_verification_operation_declares_its_rejections(self):
        operation = self.paths[self.verify_path]['post']
        for code in ('400', '405', '415'):
            with self.subTest(code=code):
                self.assertIn(code, operation['responses'])
        self.assertEqual(
            sorted(self.response_schema(operation, '400')['properties']),
            sorted(ENVELOPE_KEYS),
        )

    def test_the_verification_operation_is_declared_anonymous(self):
        # `security: [{}]` is drf-spectacular's spelling for "no credential
        # required", and it is what a generated client reads to decide whether
        # to send a header at all.
        self.assertEqual(self.paths[self.verify_path]['post']['security'], [{}])

    def test_the_me_operation_is_declared_as_requiring_a_credential(self):
        security = self.paths[self.me_path]['get']['security']
        self.assertEqual(security, [{'jwtAuth': []}])

    def test_the_me_success_body_is_the_two_state_fields(self):
        operation = self.paths[self.me_path]['get']
        schema = self.response_schema(operation, '200')
        self.assertEqual(sorted(schema['properties']), ['email', 'is_email_verified'])
        self.assertNotIn('is_publisher', schema['properties'])

    def test_the_me_operation_declares_both_permission_answers(self):
        operation = self.paths[self.me_path]['get']
        for code in ('401', '403', '405'):
            with self.subTest(code=code):
                self.assertIn(code, operation['responses'])
        for code in ('401', '403'):
            with self.subTest(code=code):
                self.assertEqual(
                    sorted(self.response_schema(operation, code)['properties']),
                    sorted(ENVELOPE_KEYS),
                )

    def test_every_declared_rejection_points_at_the_one_error_component(self):
        # Registration, verification and `me/` all describe an envelope-shaped
        # rejection by `$ref`, not by spelling the five keys out again, so the
        # three cannot drift apart and a fourth operation cannot quietly inline
        # its own. The 405 is excluded from each list because it is genuinely a
        # different body - DRF's own, outside the seven contract statuses.
        for path, method, codes in (
            ('register', 'post', ('400', '503')),
            ('verify-email', 'post', ('400',)),
            ('me', 'get', ('401', '403')),
        ):
            operation = self.paths[f'{settings.API_PREFIX}/{path}/'][method]
            for code in codes:
                with self.subTest(path=path, code=code):
                    self.assertEqual(
                        operation['responses'][code]['content']['application/json'][
                            'schema'
                        ]['$ref'],
                        '#/components/schemas/ErrorResponse',
                    )
