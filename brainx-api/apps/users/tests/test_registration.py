"""Tests for the open registration endpoint and the account it creates.

The endpoint is reached through the project URLconf, so the mounting under
`API_PREFIX` is what these tests resolve rather than a test-only one.
"""

import json
import re
import smtplib
import uuid
from datetime import timedelta
from unittest import mock

from django.conf import settings
from django.contrib.auth import get_user_model
from django.contrib.auth.password_validation import validate_password
from django.core import mail, signing
from django.core.mail import EmailMessage
from django.db import IntegrityError, models, transaction
from django.test import SimpleTestCase, TestCase, override_settings
from django.urls import reverse
from django.utils import timezone
from drf_spectacular.generators import SchemaGenerator
from rest_framework import serializers
from rest_framework.exceptions import AuthenticationFailed
from rest_framework_simplejwt.authentication import JWTAuthentication
from rest_framework_simplejwt.tokens import AccessToken
from rest_framework.test import APIClient

from apps.core.exceptions import SERVICE_UNAVAILABLE_RETRY_AFTER_SECONDS
from apps.core.logging import JsonFormatter

from ..email import SUBJECT
from ..models import AccountToken, User
from ..serializers import RegistrationSerializer
from ..tokens import (
    VERIFY_TOKEN_SALT,
    issue_verification_token,
    live_verification_token,
)
from ..views import REGISTRATION_MESSAGE

# Written out rather than imported: the point of the comparison is that the body
# a client sees is this sentence, not whatever the view currently says.
EXPECTED_MESSAGE = 'Check your email for a verification link.'

EMAIL = 'student@example.com'
PASSWORD = 'quixotic-marmalade-93'

# Mirrors apps.core.tests.test_exceptions.assert_envelope.
ENVELOPE_KEYS = ('type', 'title', 'status', 'detail', 'errors')


class UncoercedAddressSerializer(serializers.Serializer):
    """A bare EmailField: what DRF says about an address nobody touched."""

    email = serializers.EmailField()


def drf_message_for(value):
    """The messages DRF itself produces for `value` in an address field.

    The reference every normalization assertion is measured against, so the
    tests state "the payload reached the field untouched" without hardcoding a
    translated string that `LANGUAGE_CODE = 'fr-fr'` would otherwise own.
    """
    probe = UncoercedAddressSerializer(data={'email': value})
    probe.is_valid()
    return [str(message) for message in probe.errors['email']]


def link_in(message):
    """The one link a verification message carries."""
    (link,) = re.findall(r'https?://\S+', message.body)
    return link


def signed_token_in(message):
    """The signed token a verification message carries, as sent on the wire."""
    return link_in(message).split('#token=', 1)[1]


def row_named_by(message):
    """The `AccountToken` row a verification message's link resolves to."""
    return signing.loads(signed_token_in(message), salt=VERIFY_TOKEN_SALT)


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


class AccountModelTests(TestCase):
    """The shape of the single user model."""

    def test_the_project_user_model_is_the_custom_one(self):
        self.assertIs(get_user_model(), User)

    def test_the_primary_key_is_a_uuid(self):
        self.assertIsInstance(User._meta.pk, models.UUIDField)

    def test_the_table_has_no_username_column(self):
        names = {field.name for field in User._meta.get_fields()}
        self.assertNotIn('username', names)
        self.assertIn('email', names)

    def test_the_two_account_flags_start_false(self):
        user = User(email=EMAIL)
        self.assertFalse(user.is_email_verified)
        self.assertFalse(user.is_publisher)

    def test_the_email_is_the_username_and_the_email_field(self):
        self.assertEqual(User.USERNAME_FIELD, 'email')
        self.assertEqual(User.EMAIL_FIELD, 'email')

    def test_two_accounts_cannot_share_an_address(self):
        User.objects.create_user(email=EMAIL, password=PASSWORD)
        # The inner block so the aborted transaction does not outlive it.
        with self.assertRaises(IntegrityError), transaction.atomic():
            User.objects.create_user(email=EMAIL, password=PASSWORD)

    def test_the_manager_lowercases_the_whole_address(self):
        # Django's own `normalize_email` lowercases only the domain, which would
        # let `Foo@x.com` and `foo@x.com` become two rows for one mailbox: the
        # column is case-sensitive, so neither would collide and neither would
        # be caught.
        user = User.objects.create_user(email='Foo@Example.COM', password=PASSWORD)
        self.assertEqual(user.email, 'foo@example.com')

    def test_the_manager_and_the_serializer_normalize_identically(self):
        # The two paths into the column have to agree, or a row written through
        # one is invisible to the other and the same mailbox gets two accounts.
        # Compared through the *stored* value on each path, not function to
        # function: the serializer delegates to the manager, so calling both
        # helpers would compare an implementation to itself and pass whether or
        # not the delegation exists.
        created = User.objects.create_user(email='Foo@Example.COM', password=PASSWORD)
        accepted = RegistrationSerializer(
            data={'email': '  Foo@Example.COM  ', 'password': PASSWORD}
        )
        self.assertTrue(accepted.is_valid(), accepted.errors)
        self.assertEqual(accepted.validated_data['email'], created.email)
        self.assertEqual(created.email, 'foo@example.com')

    def test_a_manager_row_is_a_duplicate_for_the_endpoint(self):
        User.objects.create_user(email='Foo@Example.COM', password=PASSWORD)
        with self.assertRaises(IntegrityError), transaction.atomic():
            User.objects.create_user(email='foo@example.com', password=PASSWORD)

    def test_the_manager_stores_only_the_hash(self):
        user = User.objects.create_user(email=EMAIL, password=PASSWORD)
        self.assertNotEqual(user.password, PASSWORD)
        self.assertTrue(user.check_password(PASSWORD))

    def test_an_address_written_outside_the_manager_is_still_normalized(self):
        # The guarantee is one mailbox, one row - not "one row per calling
        # convention". Nothing about `User(...).save()` says it has to go
        # through the manager, so the model normalizes on the way in and the
        # case-sensitive unique constraint cannot be defeated from underneath.
        user = User.objects.create(email='Foo@Example.COM')
        self.assertEqual(user.email, 'foo@example.com')
        stored = User.objects.get(pk=user.pk)
        self.assertEqual(stored.email, 'foo@example.com')

    def test_a_narrowed_save_still_writes_the_normalized_address(self):
        # `update_fields` narrows the write to the columns it names. Without
        # `email` joining that set, `save()` would normalize the attribute and
        # leave the row holding the old spelling - so the instance and its own
        # row would disagree about which account this is, silently. Asserted on
        # the value read back, not on the attribute.
        user = User.objects.create(email='Orig@Example.com')
        user.email = 'Changed@Example.com'
        user.save(update_fields=['is_email_verified'])
        self.assertEqual(User.objects.get(pk=user.pk).email, 'changed@example.com')

    def test_an_account_names_itself_by_its_address(self):
        # Every repr would otherwise be `User object (<uuid>)`, in the shell, in
        # the admin and in the log lines, none of which can be read by a person.
        user = User.objects.create_user(email=EMAIL, password=PASSWORD)
        self.assertEqual(str(user), EMAIL)

    def test_a_token_names_its_account_and_its_purpose(self):
        user = User.objects.create_user(email=EMAIL, password=PASSWORD)
        _signed, row = issue_verification_token(user)
        rendered = str(row)
        self.assertIn('verify', rendered)
        self.assertIn(str(user.pk), rendered)
        self.assertIn(str(row.pk), rendered)

    def test_a_superuser_keeps_both_staff_flags(self):
        admin = User.objects.create_superuser(
            email='root@example.com', password=PASSWORD
        )
        self.assertTrue(admin.is_staff)
        self.assertTrue(admin.is_superuser)
        self.assertEqual(admin.get_username(), 'root@example.com')

    def test_a_superuser_without_staff_is_refused(self):
        with self.assertRaises(ValueError):
            User.objects.create_superuser(
                email='root@example.com', password=PASSWORD, is_staff=False
            )


class AccountTokenRowTests(TestCase):
    """What a persisted token row carries, and how it is signed."""

    def setUp(self):
        self.user = User.objects.create_user(email=EMAIL, password=PASSWORD)

    def test_a_new_token_is_unspent_and_carries_its_purpose(self):
        _signed, row = issue_verification_token(self.user)
        self.assertEqual(row.user, self.user)
        self.assertEqual(row.purpose, 'verify')
        self.assertIsNone(row.used_at)

    def test_a_token_expires_after_the_configured_ttl(self):
        _signed, row = issue_verification_token(self.user)
        self.assertAlmostEqual(
            (row.expires_at - timezone.now()).total_seconds(),
            settings.EMAIL_VERIFICATION_TOKEN_TTL_HOURS * 3600,
            delta=60,
        )

    def test_issuing_again_spends_the_previous_token(self):
        _first, first = issue_verification_token(self.user)
        _second, second = issue_verification_token(self.user)

        first.refresh_from_db()
        self.assertIsNotNone(first.used_at)
        self.assertIsNone(second.used_at)
        self.assertEqual(AccountToken.objects.filter(used_at__isnull=True).count(), 1)

    def test_a_token_of_another_account_is_untouched(self):
        other = User.objects.create_user(email='other@example.com', password=PASSWORD)
        _first, first = issue_verification_token(self.user)
        issue_verification_token(other)

        first.refresh_from_db()
        self.assertIsNone(first.used_at)

    def test_the_signed_value_names_the_row(self):
        signed, row = issue_verification_token(self.user)
        self.assertNotEqual(signed, str(row.pk))
        self.assertEqual(
            signing.loads(signed, salt=VERIFY_TOKEN_SALT), str(row.pk)
        )

    def test_the_signed_value_is_purpose_scoped(self):
        signed, _row = issue_verification_token(self.user)
        with self.assertRaises(signing.BadSignature):
            signing.loads(signed, salt='some-other-purpose')

    def test_a_freshly_issued_token_is_the_live_one(self):
        # Compared through the decoded value, not the signed string:
        # `signing.dumps` uses a `TimestampSigner`, so two signs of the same row
        # differ the moment they straddle a wall-clock second. The row is what
        # the two have to agree on.
        _signed, row = issue_verification_token(self.user)
        self.assertEqual(
            signing.loads(
                live_verification_token(self.user), salt=VERIFY_TOKEN_SALT
            ),
            str(row.pk),
        )

    def test_two_live_rows_sharing_a_timestamp_resolve_to_the_same_one_every_time(self):
        # `created_at` is written per transaction, so two concurrent issues can
        # share one value - the clock resolution on the project's Windows host is
        # coarse enough for two issues in one request to land on the same one.
        # Ordered by that column alone the answer is whatever order the database
        # happens to return, which need not be the same on the next call, and a
        # caller holding no other handle would then be naming a different token
        # each time it asked.
        #
        # What the tiebreaker guarantees is a *fixed* order, not the right age:
        # the pk is a random UUID, so it says nothing about which row was written
        # first. Asserted as the highest pk among the tied rows, which is what
        # `order_by('-created_at', '-pk')` means, and asserted over repeated
        # calls, which is the property the caller depends on.
        _signed, first = issue_verification_token(self.user)
        second = AccountToken.objects.create(
            user=self.user,
            purpose=AccountToken.Purpose.VERIFY,
            expires_at=timezone.now() + timedelta(hours=24),
        )
        AccountToken.objects.filter(pk__in=[first.pk, second.pk]).update(
            created_at=first.created_at
        )
        # Read back rather than trusting the in-memory `created_at`, which is
        # each instance's own value and is exactly what the update overwrote.
        stamped = set(
            AccountToken.objects.filter(pk__in=[first.pk, second.pk]).values_list(
                'created_at', flat=True
            )
        )
        self.assertEqual(len(stamped), 1)
        expected = max(str(first.pk), str(second.pk))

        for attempt in range(3):
            with self.subTest(attempt=attempt):
                self.assertEqual(
                    signing.loads(
                        live_verification_token(self.user), salt=VERIFY_TOKEN_SALT
                    ),
                    expected,
                )

    def test_a_spent_token_is_not_live(self):
        issue_verification_token(self.user)
        AccountToken.objects.update(used_at=timezone.now())
        self.assertIsNone(live_verification_token(self.user))

    def test_a_lapsed_token_is_not_live(self):
        issue_verification_token(self.user)
        AccountToken.objects.update(expires_at=timezone.now() - timedelta(minutes=1))
        self.assertIsNone(live_verification_token(self.user))

    def test_an_account_with_no_token_has_no_live_one(self):
        self.assertIsNone(live_verification_token(self.user))

    def test_another_accounts_live_token_is_not_borrowed(self):
        issue_verification_token(self.user)
        other = User.objects.create_user(email='other@example.com', password=PASSWORD)
        self.assertIsNone(live_verification_token(other))


class RegistrationEndpointTests(TestCase):
    """The POST itself: what it creates, what it says, and what it never says."""

    def setUp(self):
        self.client = APIClient()
        self.url = reverse('register')

    def register(self, email=EMAIL, password=PASSWORD, **extra):
        return self.client.post(
            self.url, {'email': email, 'password': password, **extra}, format='json'
        )

    def verification_link(self):
        (message,) = mail.outbox
        self.assertEqual(message.subject, SUBJECT)
        self.assertEqual(message.to, [EMAIL])
        self.assertEqual(message.from_email, settings.DEFAULT_FROM_EMAIL)
        return link_in(message)

    def test_the_endpoint_is_mounted_under_the_api_prefix(self):
        self.assertEqual(self.url, f'{settings.API_PREFIX}/register/')

    def test_a_fresh_registration_is_201_with_the_constant_message(self):
        response = self.register()
        self.assertEqual(response.status_code, 201)
        self.assertEqual(response.json(), {'message': EXPECTED_MESSAGE})
        self.assertEqual(REGISTRATION_MESSAGE, EXPECTED_MESSAGE)

    def test_the_response_carries_no_account_state(self):
        body = self.register().json()
        self.assertEqual(sorted(body), ['message'])
        serialized = json.dumps(body)
        for leak in (EMAIL, str(User.objects.get().pk), PASSWORD):
            self.assertNotIn(leak, serialized)

    def test_a_fresh_registration_creates_one_unverified_account(self):
        self.register()
        (user,) = User.objects.all()
        self.assertEqual(user.email, EMAIL)
        self.assertFalse(user.is_email_verified)
        self.assertFalse(user.is_publisher)
        self.assertTrue(user.is_active)

    def test_a_fresh_registration_issues_one_token_and_sends_one_email(self):
        self.register()
        (token,) = AccountToken.objects.all()
        self.assertEqual(token.purpose, 'verify')
        self.assertIsNone(token.used_at)
        self.assertEqual(len(mail.outbox), 1)

    def test_the_password_is_stored_hashed_and_never_echoed(self):
        response = self.register()
        (user,) = User.objects.all()
        self.assertNotEqual(user.password, PASSWORD)
        self.assertTrue(user.check_password(PASSWORD))
        self.assertNotIn(PASSWORD, response.content.decode())
        self.assertNotIn(PASSWORD, mail.outbox[0].body)

    def test_the_address_is_trimmed_and_lowercased_before_it_is_stored(self):
        self.register(email='  Student@Example.COM  ')
        (user,) = User.objects.all()
        self.assertEqual(user.email, EMAIL)

    def test_the_privilege_flags_are_unsettable_from_the_payload(self):
        response = self.register(
            is_publisher=True, is_staff=True, is_email_verified=True
        )
        (user,) = User.objects.all()
        self.assertFalse(user.is_publisher)
        self.assertFalse(user.is_staff)
        self.assertFalse(user.is_email_verified)
        self.assertEqual(response.json(), {'message': EXPECTED_MESSAGE})

    def test_the_token_travels_in_the_fragment_and_never_the_query_string(self):
        self.register()
        link = self.verification_link()
        self.assertTrue(
            link.startswith(f'{settings.FRONTEND_URL}{settings.FRONTEND_VERIFY_PATH}')
        )
        self.assertIn('#token=', link)
        self.assertNotIn('?', link)

    @override_settings(FRONTEND_URL='https://brainx.example.com/')
    def test_a_frontend_url_ending_in_a_slash_does_not_double_it(self):
        # The value is env-driven, so a deployment that supplies a trailing
        # slash would otherwise hand out a link with `//verify-email` in it.
        self.register()
        link = self.verification_link()
        self.assertTrue(
            link.startswith(f'https://brainx.example.com{settings.FRONTEND_VERIFY_PATH}')
        )
        self.assertNotIn('com//', link)

    def test_the_linked_token_is_the_row_that_was_persisted(self):
        self.register()
        signed = self.verification_link().split('#token=', 1)[1]
        (row,) = AccountToken.objects.all()
        self.assertEqual(
            signing.loads(signed, salt=VERIFY_TOKEN_SALT), str(row.pk)
        )

    def test_the_address_is_required(self):
        response = self.client.post(self.url, {'password': PASSWORD}, format='json')
        body = assert_envelope(self, response, 'validation_error', 400)
        self.assertIn('email', body['errors'])

    def test_a_malformed_address_is_a_400_naming_the_field(self):
        body = assert_envelope(
            self, self.register(email='not-an-email'), 'validation_error', 400
        )
        self.assertIn('email', body['errors'])
        self.assertEqual(User.objects.count(), 0)

    def test_a_null_address_is_reported_as_null_and_not_as_a_bad_address(self):
        # The bug this pins: coercing None through `str()` yields the literal
        # 'none', and DRF answers that with the same message it gives a
        # genuinely malformed address, so the client is told the wrong thing
        # about its own payload. Compared against an untouched field rather
        # than a literal, because LANGUAGE_CODE is fr-fr and DRF's messages
        # are translated.
        body = assert_envelope(
            self, self.client.post(self.url, {'email': None}, format='json'),
            'validation_error', 400,
        )
        self.assertEqual(body['errors']['email'], drf_message_for(None))
        self.assertNotEqual(body['errors']['email'], drf_message_for('none'))
        self.assertEqual(User.objects.count(), 0)

    def test_a_non_string_address_is_reported_rather_than_coerced(self):
        # A number is the weaker of the two cases and the test says so: DRF
        # renders `123` and the string `'123'` with the same "malformed address"
        # message, so this assertion holds whether or not the serializer left
        # the value alone. What it does pin is that a number is never turned
        # into something that could pass. The `null` case above is the one that
        # can tell the two behaviours apart, which is why it is its own test.
        body = assert_envelope(
            self, self.client.post(self.url, {'email': 123}, format='json'),
            'validation_error', 400,
        )
        self.assertEqual(body['errors']['email'], drf_message_for(123))
        self.assertEqual(User.objects.count(), 0)

    def test_a_falsy_non_string_address_is_reported_as_a_type_problem(self):
        # The case that can tell the guard from its absence. `0` and `''` are
        # both falsy, so a serializer that coerced through `str(email or '')`
        # would hand the field an empty string and answer "this field cannot be
        # blank" - telling a client that sent a number that its field is empty.
        # Left alone, DRF reports the value it was actually given, which is what
        # the `null` case above pins for the other half.
        body = assert_envelope(
            self, self.client.post(self.url, {'email': 0}, format='json'),
            'validation_error', 400,
        )
        self.assertEqual(body['errors']['email'], drf_message_for(0))
        self.assertNotEqual(body['errors']['email'], drf_message_for(''))
        self.assertEqual(User.objects.count(), 0)

    def test_a_rejected_password_is_a_400_naming_the_field(self):
        body = assert_envelope(
            self, self.register(password='12345'), 'validation_error', 400
        )
        self.assertEqual(sorted(body['errors']), ['password'])
        self.assertEqual(User.objects.count(), 0)

    def test_a_rejected_password_is_not_listed_under_a_dotted_path(self):
        body = self.register(password='12345').json()
        self.assertNotIn('password.password', body['errors'])

    def test_a_rejected_registration_sends_nothing(self):
        self.register(password='12345')
        self.assertEqual(len(mail.outbox), 0)
        self.assertEqual(AccountToken.objects.count(), 0)

    def test_the_endpoint_is_post_only(self):
        self.assertEqual(self.client.get(self.url).status_code, 405)

    def test_a_wrong_method_is_answered_with_drfs_own_body(self):
        # Both rejections DRF raises before the view runs keep its rendering,
        # because a 405 and a 415 are outside the seven contract statuses the
        # envelope covers. So the body is `{"detail": ...}` and not the five
        # keys - the same fact the document declares, asserted on the wire so
        # the two halves cannot disagree.
        response = self.client.get(self.url)
        self.assertEqual(response.status_code, 405)
        self.assertEqual(sorted(response.json()), ['detail'])
        self.assertTrue(response.json()['detail'])
        self.assertEqual(User.objects.count(), 0)

    def test_an_unparseable_body_is_answered_with_drfs_own_body(self):
        # The project is JSON-only, so a form-encoded POST never reaches the
        # view. A client that has been told a 400 carries a named-field `errors`
        # map would read the 415 the same way and find nothing to parse.
        response = self.client.post(self.url, {'email': EMAIL, 'password': PASSWORD})
        self.assertEqual(response.status_code, 415)
        self.assertEqual(sorted(response.json()), ['detail'])
        self.assertTrue(response.json()['detail'])
        self.assertEqual(User.objects.count(), 0)
        self.assertEqual(len(mail.outbox), 0)


class DuplicateRegistrationTests(TestCase):
    """A second registration of a taken address is indistinguishable from a first.

    Same status and the same bytes on every branch (AR-26), and never a second
    row or a second token. The mail is the one thing that does differ: an
    unverified account holding a live token has its link re-sent, because the
    503 tells a client to try again and that retry lands here (AD-11).
    """

    def setUp(self):
        self.client = APIClient()
        self.url = reverse('register')
        self.first = self.register()
        self.mails_after_first = len(mail.outbox)

    def register(self, email=EMAIL, password=PASSWORD, **extra):
        return self.client.post(
            self.url, {'email': email, 'password': password, **extra}, format='json'
        )

    def last_link(self):
        """The link in the most recent message, whichever branch sent it."""
        return link_in(mail.outbox[-1])

    def mark_verified(self):
        User.objects.update(is_email_verified=True)

    def test_the_two_responses_are_byte_identical(self):
        second = self.register()
        self.assertEqual(second.status_code, self.first.status_code)
        self.assertEqual(second.content, self.first.content)

    def test_the_duplicate_creates_no_second_row_or_token(self):
        self.register()
        self.assertEqual(User.objects.count(), 1)
        (row,) = AccountToken.objects.all()
        self.assertIsNone(row.used_at)

    def test_the_duplicate_re_sends_the_link_the_account_already_holds(self):
        # The state a 503 leaves behind is exactly this one, so the retry the
        # 503 instructs has to deliver the mail the first attempt could not.
        self.register()
        self.assertEqual(len(mail.outbox), self.mails_after_first + 1)
        (row,) = AccountToken.objects.all()
        self.assertEqual(row_named_by(mail.outbox[-1]), str(row.pk))

    def test_the_duplicate_sends_the_row_the_first_attempt_did(self):
        # Both halves compare the decoded row, never the signed string: the
        # string is stamped when it is produced, so a re-send is deliberately
        # not byte-identical to the first link and asserting that it is would
        # fail whenever the two signs straddle a second. What has to hold is
        # that the re-send resolves to the row the first attempt issued, and
        # that the live token names it too - no second row is issued.
        self.register()
        self.assertEqual(
            row_named_by(mail.outbox[-1]), row_named_by(mail.outbox[0])
        )
        self.assertEqual(
            signing.loads(
                live_verification_token(User.objects.get()),
                salt=VERIFY_TOKEN_SALT,
            ),
            row_named_by(mail.outbox[-1]),
        )

    def test_a_differently_cased_address_is_the_same_duplicate(self):
        second = self.register(email='STUDENT@Example.com')
        self.assertEqual(second.content, self.first.content)
        self.assertEqual(User.objects.count(), 1)
        # Same account, so the same link comes back, not a second one.
        self.assertEqual(len(mail.outbox), self.mails_after_first + 1)

    def test_a_differently_spaced_address_is_the_same_duplicate(self):
        second = self.register(email='  student@example.com  ')
        self.assertEqual(second.content, self.first.content)
        self.assertEqual(User.objects.count(), 1)

    def test_the_duplicate_leaves_the_existing_account_untouched(self):
        before = User.objects.get()
        self.register()
        after = User.objects.get()
        self.assertEqual(before.pk, after.pk)
        self.assertEqual(before.password, after.password)
        self.assertFalse(after.is_email_verified)

    def test_the_duplicate_does_not_issue_a_second_token(self):
        self.register()
        (row,) = AccountToken.objects.all()
        self.assertIsNone(row.used_at)
        self.assertEqual(AccountToken.objects.count(), 1)

    def test_a_duplicate_of_a_verified_account_sends_nothing(self):
        # A verified account is not waiting on a link, so re-sending one would
        # be noise; the body is unchanged either way.
        self.mark_verified()
        self.register()
        self.assertEqual(len(mail.outbox), self.mails_after_first)
        self.assertEqual(AccountToken.objects.count(), 1)

    def test_a_duplicate_whose_token_has_lapsed_sends_nothing(self):
        # Reviving a lapsed token belongs to the resend endpoint 1.3 owns.
        AccountToken.objects.update(
            expires_at=timezone.now() - timedelta(minutes=1)
        )
        self.register()
        self.assertEqual(len(mail.outbox), self.mails_after_first)
        self.assertEqual(AccountToken.objects.count(), 1)

    def test_a_duplicate_whose_token_is_spent_sends_nothing(self):
        AccountToken.objects.update(used_at=timezone.now())
        self.register()
        self.assertEqual(len(mail.outbox), self.mails_after_first)

    def test_a_duplicate_of_a_verified_account_still_answers_201(self):
        self.mark_verified()
        second = self.register()
        self.assertEqual(second.status_code, 201)
        self.assertEqual(second.content, self.first.content)

    def test_the_duplicate_ignores_a_privilege_flag_the_same_way(self):
        second = self.register(is_publisher=True)
        self.assertEqual(second.content, self.first.content)
        self.assertFalse(User.objects.get().is_publisher)

    def test_a_duplicate_of_a_verified_account_says_so_in_the_log(self):
        # The sibling of the case below, and the one that had none: a 201 with
        # no mail and no log line is indistinguishable from a delivery, and this
        # branch returned before the log line the other branch has. `info`, not
        # `warning`: the account is verified, so this is the expected answer to
        # a duplicate and not an anomaly.
        self.mark_verified()
        with self.assertLogs('apps.users.views', level='INFO') as captured:
            second = self.register()
        self.assertEqual(second.status_code, 201)
        self.assertEqual(second.content, self.first.content)
        (record,) = captured.records
        self.assertIn('already verified', record.getMessage())
        self.assertIn(str(User.objects.get().pk), record.getMessage())
        self.assertNotIn(EMAIL, record.getMessage())

    def test_a_duplicate_of_a_verified_account_does_not_warn(self):
        # The other half of the level choice above: a client re-registering an
        # account it already owns is ordinary traffic, and a warning an operator
        # is expected to act on should not be raised by it.
        self.mark_verified()
        with self.assertNoLogs('apps.users.views', level='WARNING'):
            self.register()

    def test_a_duplicate_with_no_live_token_says_so_in_the_log(self):
        # A 201 with no mail and no log line is indistinguishable from a
        # delivery. This is the state 1.3's resend endpoint has to be able to
        # explain, so the account is named - and named by its pk, not its
        # address, like every other line this view writes.
        AccountToken.objects.all().delete()
        with self.assertLogs('apps.users.views', level='WARNING') as captured:
            second = self.register()
        self.assertEqual(second.status_code, 201)
        self.assertEqual(second.content, self.first.content)
        self.assertEqual(len(mail.outbox), self.mails_after_first)
        (record,) = captured.records
        self.assertIn('No live verification token', record.getMessage())
        self.assertIn(str(User.objects.get().pk), record.getMessage())
        self.assertNotIn(EMAIL, record.getMessage())


class RetryAfterFailureTests(TestCase):
    """A 503 tells the client to try again, so the retry has to deliver (AD-11).

    The retry is a duplicate by construction, which is why this is the case the
    duplicate branch's re-send exists for: without it the account exists, is
    unverified and is unreachable, because 1.3's resend endpoint does not exist.
    """

    def setUp(self):
        self.client = APIClient()
        self.url = reverse('register')

    def post(self):
        return self.client.post(
            self.url, {'email': EMAIL, 'password': PASSWORD}, format='json'
        )

    def fail_the_send(self, *args, **kwargs):
        return mock.patch.object(
            EmailMessage, 'send', side_effect=smtplib.SMTPException('connection refused')
        )

    def test_the_retry_after_a_failed_send_delivers_the_link(self):
        with self.fail_the_send():
            first = self.post()
        self.assertEqual(first.status_code, 503)
        self.assertEqual(len(mail.outbox), 0)

        second = self.post()

        self.assertEqual(second.status_code, 201)
        self.assertEqual(second.json(), {'message': EXPECTED_MESSAGE})
        self.assertEqual(len(mail.outbox), 1)
        self.assertEqual(mail.outbox[0].to, [EMAIL])
        (row,) = AccountToken.objects.all()
        (link,) = re.findall(r'https?://\S+', mail.outbox[0].body)
        self.assertEqual(
            signing.loads(link.split('#token=', 1)[1], salt=VERIFY_TOKEN_SALT),
            str(row.pk),
        )

    def test_the_retry_issues_no_second_token(self):
        with self.fail_the_send():
            self.post()
        self.post()
        self.assertEqual(AccountToken.objects.count(), 1)

    def test_a_second_retry_keeps_delivering_the_same_token(self):
        # The token stays unspent, so the path stays open for as long as the
        # client keeps being told to retry. The links are not byte-identical,
        # because the signature is stamped per send; the row they name is.
        with self.fail_the_send():
            self.post()
        self.post()
        first = row_named_by(mail.outbox[-1])
        self.post()
        self.assertEqual(len(mail.outbox), 2)
        self.assertEqual(row_named_by(mail.outbox[-1]), first)

    def test_a_retry_that_also_fails_503s_and_logs_again(self):
        with self.fail_the_send():
            self.post()
            with self.assertLogs('apps.users.views', level='ERROR') as captured:
                second = self.post()
        self.assertEqual(second.status_code, 503)
        # The retry is logged exactly like the first attempt, so an operator
        # reading the log sees two attempts rather than one unexplained gap.
        (record,) = captured.records
        payload = json.loads(JsonFormatter().format(record))
        self.assertIn('SMTPException', payload['exception'])

    def test_the_retry_body_is_byte_identical_to_the_first_success(self):
        reference = self.post()
        with self.fail_the_send():
            self.post()
        retry = self.post()
        self.assertEqual(retry.content, reference.content)


class SendFailureTests(TestCase):
    """A failed send costs the client the message and nothing else (AD-11)."""

    def setUp(self):
        self.client = APIClient()
        self.url = reverse('register')
        self.failure = smtplib.SMTPException('connection refused')

    def register_failing(self):
        with mock.patch.object(EmailMessage, 'send', side_effect=self.failure):
            return self.post()

    def post(self):
        return self.client.post(
            self.url, {'email': EMAIL, 'password': PASSWORD}, format='json'
        )

    def test_a_failed_send_is_a_retryable_503_in_the_contract_shape(self):
        response = self.register_failing()
        body = assert_envelope(self, response, 'service_unavailable', 503)
        self.assertEqual(body['title'], 'Service unavailable')
        self.assertEqual(body['errors'], {})

    def test_the_503_carries_a_retry_after_hint(self):
        # "Please try again" with nothing to back off against is what turns a
        # struggling service into an overloaded one; 429 already sets the
        # header and 503 has to be as actionable. The value is pinned, not
        # merely asserted positive: a hint of one second is technically present
        # and functionally worse than none.
        response = self.register_failing()
        self.assertIn('Retry-After', response)
        self.assertEqual(
            int(response['Retry-After']), SERVICE_UNAVAILABLE_RETRY_AFTER_SECONDS
        )

    def test_a_bad_smtp_configuration_is_not_reported_as_retryable(self):
        # Wrong credentials or a from-address the relay refuses cannot be fixed
        # by the client coming back later, so a 503 with a Retry-After would send
        # every retry of every client into the same wall. They are a deployment
        # fault, and the traceback is what says so.
        #
        # Four names, not two, because the rule is permanence and not a
        # hand-picked pair: a 5xx from `SMTPResponseException` covers the first
        # two, and `SMTPRecipientsRefused` is the one permanent failure that
        # carries no code of its own - it holds a mapping of refused addresses
        # to codes - so it is named separately. `SMTPDataError` is the
        # to-address counterpart of the refused from-address above, and a 550 to
        # an unknown recipient is exactly as unfixable by a retry.
        for failure in (
            smtplib.SMTPAuthenticationError(535, b'bad credentials'),
            smtplib.SMTPSenderRefused(550, b'unknown sender', 'no-reply@brainx.test'),
            smtplib.SMTPRecipientsRefused({'student@example.com': (550, b'no such user')}),
            smtplib.SMTPDataError(554, b'rejected by policy'),
        ):
            with self.subTest(failure=type(failure).__name__):
                with mock.patch.object(EmailMessage, 'send', side_effect=failure):
                    with self.assertRaises(type(failure)):
                        self.post()

    def test_a_relay_reply_below_500_stays_retryable(self):
        # The other half of the permanence rule, and the one that would have
        # been lost if only the permanent cases were pinned: 421 and 451 are the
        # relay's own "come back later", so a 503 with a Retry-After is the
        # correct answer to each. A rule that read "any response" instead of
        # "any 5xx" would answer these with an operator's 500.
        for failure in (
            smtplib.SMTPSenderRefused(421, b'try again later', 'no-reply@brainx.test'),
            smtplib.SMTPDataError(451, b'try again later'),
        ):
            with self.subTest(failure=type(failure).__name__):
                with mock.patch.object(EmailMessage, 'send', side_effect=failure):
                    response = self.post()
                body = assert_envelope(self, response, 'service_unavailable', 503)
                self.assertEqual(body['errors'], {})
                self.assertEqual(
                    int(response['Retry-After']),
                    SERVICE_UNAVAILABLE_RETRY_AFTER_SECONDS,
                )

    def test_a_bad_smtp_configuration_is_logged_with_its_traceback(self):
        failure = smtplib.SMTPAuthenticationError(535, b'bad credentials')
        with mock.patch.object(EmailMessage, 'send', side_effect=failure):
            with self.assertLogs('apps.users.views', level='ERROR') as captured:
                with self.assertRaises(type(failure)):
                    self.post()
        (record,) = captured.records
        payload = json.loads(JsonFormatter().format(record))
        self.assertIn('SMTPAuthenticationError', payload['exception'])
        # The message has to say the retry cannot succeed, because the whole
        # point of the carve-out is that this is the operator's problem and not
        # the client's. It says "permanently" rather than naming a
        # misconfiguration, because the rule is permanence and not one fault: a
        # rejected recipient is equally unfixable and is not a misconfiguration.
        self.assertIn('permanently', record.getMessage())
        self.assertIn('a retry cannot succeed', record.getMessage())
        self.assertNotIn(EMAIL, record.getMessage())

    def test_a_defect_in_the_message_is_not_reported_as_retryable(self):
        # A transport failure is worth retrying and a bad header is not. Catching
        # everything would answer a permanent defect with "try again" and send
        # the client into a loop that can never succeed, so the exception is
        # left to propagate instead.
        broken = UnicodeEncodeError('ascii', 'x', 0, 1, 'unencodable subject')
        with mock.patch.object(EmailMessage, 'send', side_effect=broken):
            with self.assertRaises(UnicodeEncodeError):
                self.post()

    def test_a_defect_in_the_message_is_not_swallowed_into_a_503(self):
        broken = UnicodeEncodeError('ascii', 'x', 0, 1, 'unencodable subject')
        with mock.patch.object(EmailMessage, 'send', side_effect=broken):
            with self.assertNoLogs('apps.users.views', level='ERROR'):
                with self.assertRaises(UnicodeEncodeError):
                    self.post()

    def test_a_connection_failure_is_also_retryable(self):
        # OSError is the other family `EmailMessage.send` documents, and the
        # one that covers a refused or dropped socket.
        with mock.patch.object(EmailMessage, 'send', side_effect=OSError('down')):
            response = self.post()
        body = assert_envelope(self, response, 'service_unavailable', 503)
        self.assertIn('Retry-After', response)
        self.assertEqual(body['errors'], {})

    def test_the_account_survives_the_failure_and_is_still_unverified(self):
        self.register_failing()
        (user,) = User.objects.all()
        self.assertEqual(user.email, EMAIL)
        self.assertFalse(user.is_email_verified)
        self.assertTrue(user.check_password(PASSWORD))

    def test_the_account_is_re_sendable_because_a_token_survived(self):
        self.register_failing()
        (row,) = AccountToken.objects.all()
        self.assertIsNone(row.used_at)
        self.assertGreater(row.expires_at, timezone.now())

    def test_the_failure_is_logged_with_its_traceback(self):
        with self.assertLogs('apps.users.views', level='ERROR') as captured:
            self.register_failing()
        (record,) = captured.records
        payload = json.loads(JsonFormatter().format(record))
        self.assertIn('Traceback', payload['exception'])
        self.assertIn('SMTPException', payload['exception'])
        self.assertIn('connection refused', payload['exception'])

    def test_the_log_line_names_the_account_and_never_the_address(self):
        # The record an operator needs is the account, and a client's address is
        # personal data that has no business in a log line. Asserted on the
        # rendered record, because that is what ships.
        with self.assertLogs('apps.users.views', level='ERROR') as captured:
            self.register_failing()
        (record,) = captured.records
        rendered = JsonFormatter().format(record)
        pk = str(User.objects.get().pk)
        self.assertIn(pk, rendered)
        self.assertNotIn(EMAIL, rendered)

    def test_a_registration_that_succeeds_logs_nothing_at_error(self):
        with self.assertNoLogs('apps.users.views', level='ERROR'):
            response = self.post()
        self.assertEqual(response.status_code, 201)


class PublishedSchemaTests(TestCase):
    """The endpoint has to be in the published contract, not only in the code.

    A view that declares no `serializer_class` and takes no documented request
    body gives drf-spectacular nothing to describe, and it answers that by
    dropping the path from the schema rather than by failing (AR-22). Nothing
    else in the suite would notice, so the generated document is asserted here.
    """

    def setUp(self):
        self.schema = SchemaGenerator().get_schema(request=None, public=True)
        self.components = self.schema['components']['schemas']
        self.paths = self.schema['paths']
        # The prefix is the project's, not a literal written out here again:
        # `API_PREFIX` is the version contract, so a test that hardcodes `/api/v1`
        # keeps passing after the contract moves and stops meaning anything.
        self.register_path = f'{settings.API_PREFIX}/register/'
        self.operation = self.paths[self.register_path]['post']

    def named_schema(self, ref):
        """The component schema a `$ref` points at, which must exist."""
        name = ref.rsplit('/', 1)[-1]
        self.assertIn(name, self.components)
        return self.components[name]

    def test_the_register_path_is_in_the_generated_schema(self):
        self.assertIn(self.register_path, self.paths)
        # The mount is the project's, not a test-only URLconf, so the path in
        # the document is the one a client will actually call.
        self.assertEqual(self.register_path, reverse('register'))

    def test_the_request_body_is_described(self):
        content = self.operation['requestBody']['content']['application/json']
        request_schema = self.named_schema(content['schema']['$ref'])
        # The two declared fields and nothing else: `is_publisher` is absent
        # from the published contract as well as from the serializer, so the
        # document cannot be read as an invitation to send it.
        self.assertEqual(
            sorted(request_schema['properties']), ['email', 'password']
        )

    def test_the_201_response_is_described(self):
        responses = self.operation['responses']
        self.assertIn('201', responses)
        ref = responses['201']['content']['application/json']['schema']['$ref']
        self.assertIn('message', self.named_schema(ref)['properties'])

    def test_the_201_is_the_only_success_status(self):
        # The body is the one constant message and nothing else, so the document
        # must not imply a second success shape. Scoped to 2xx on purpose: an
        # earlier version of this test compared every digit key, which forbade
        # the 400 and 503 the endpoint really returns.
        successes = [
            code
            for code in self.operation['responses']
            if code.isdigit() and code.startswith('2')
        ]
        self.assertEqual(successes, ['201'])

    def test_both_failure_modes_are_described(self):
        # A client generated from a document naming only the success has no way
        # to parse a rejection, and these two are not the same shape as each
        # other: the 400 names the offending fields, the 503 does not. Asserting
        # the 201 is alone is not enough to keep them here - the previous version
        # of this test forbade exactly the statuses the endpoint does return.
        responses = self.operation['responses']
        for code in ('400', '503'):
            with self.subTest(code=code):
                ref = responses[code]['content']['application/json']['schema'][
                    '$ref'
                ]
                self.assertEqual(
                    sorted(self.named_schema(ref)['properties']),
                    sorted(ENVELOPE_KEYS),
                )

    def test_the_503_description_says_how_to_recover(self):
        # The 503 is the one status whose response has to say what to do next,
        # so the document has to say it too - the wait is the whole instruction.
        description = self.operation['responses']['503']['description']
        self.assertIn('Retry-After', description)
        self.assertIn('re-sends', description)

    def test_the_503_declares_its_retry_after_header(self):
        # The description alone is not the contract: a generated client reads
        # `responses[code].headers`, and a header named only in prose is a header
        # the client has to be told about by hand. `OpenApiParameter` is the
        # one declaration drf-spectacular can scope to a single response.
        headers = self.operation['responses']['503'].get('headers', {})
        self.assertIn('Retry-After', headers)

    def test_the_retry_after_header_is_declared_on_the_503_and_nowhere_else(self):
        # The scoping is the other half, and the reason the declaration is an
        # `OpenApiParameter` carrying `response=[503]` rather than something
        # hung off the operation. A client that believes the 201 carries a
        # `Retry-After` - or that a 503 does not - is worse than one that
        # believes the document says nothing at all, so every other declared
        # response is checked for its absence.
        for code, response in self.operation['responses'].items():
            with self.subTest(code=code):
                if code == '503':
                    self.assertIn('Retry-After', response.get('headers', {}))
                else:
                    self.assertNotIn('Retry-After', response.get('headers', {}))

    def test_the_pre_parser_rejections_are_described(self):
        # A GET and a form-encoded POST are both reachable on this endpoint and
        # both answer before the view runs, so the document names them. The body
        # is the point: neither is the five-key envelope - `exceptions.py`
        # states that a status outside the seven contract statuses keeps DRF's
        # own rendering - and a client generated from a document that claimed
        # the envelope here would fail to read its own error.
        responses = self.operation['responses']
        for code in ('405', '415'):
            with self.subTest(code=code):
                self.assertIn(code, responses)
                ref = responses[code]['content']['application/json']['schema'][
                    '$ref'
                ]
                self.assertEqual(
                    sorted(self.named_schema(ref)['properties']), ['detail']
                )


class PublishedSchemaRouteTests(SimpleTestCase):
    """The two schema routes are served, and served to anyone.

    `PublishedSchemaTests` calls `SchemaGenerator` directly, which walks view
    classes and never goes through the URLconf. So a renamed route, a dropped
    `path()` or a `SERVE_PERMISSIONS` that starts requiring a token would leave
    that class green while the comment in `config/urls.py` still claimed the
    public default is deliberate. These tests resolve and request instead.

    No database: rendering the document reads no row, and DRF is not asked to
    authenticate anybody, so the permissive answer is a property of the
    declaration rather than of anything stored.
    """

    def test_the_schema_route_serves_the_document(self):
        # `?format=json`, because the route's default media type is the OpenAPI
        # YAML one and this is a JSON suite; both are served by the same view,
        # and a generated client reads whichever it asks for.
        response = self.client.get(f'{reverse("schema")}?format=json')
        self.assertEqual(response.status_code, 200)
        self.assertEqual(response['Content-Type'], 'application/vnd.oai.openapi+json')
        document = response.json()
        self.assertIn(f'{settings.API_PREFIX}/register/', document['paths'])

    def test_the_swagger_ui_is_readable_without_credentials(self):
        # The public default is a decision (see `config/urls.py`), and a
        # decision nothing asserts stops being one on the next edit.
        response = self.client.get(reverse('swagger-ui'))
        self.assertEqual(response.status_code, 200)
        self.assertIn(b'swagger', response.content.lower())

    def test_a_stale_bearer_token_does_not_lock_the_document(self):
        # The decision is "the schema and the UI are readable by anyone", and a
        # client reading it with an expired session still sends its header.
        # drf-spectacular's default for SERVE_AUTHENTICATION is None, which
        # falls back to DEFAULT_AUTHENTICATION_CLASSES - `JWTAuthentication`
        # here - so the public answer held only for a request that sent no
        # `Authorization` at all, and this request answered 401. `SERVE_...: []`
        # is what makes the decision mean what it says.
        #
        # The header is passed per request rather than through
        # `APIClient.credentials`, because this is a `SimpleTestCase` on
        # Django's own `Client` and the answer being tested is a property of the
        # schema view, not of the request helper.
        for path in (f'{reverse("schema")}?format=json', reverse('swagger-ui')):
            with self.subTest(path=path):
                response = self.client.get(
                    path, HTTP_AUTHORIZATION='Bearer stale-token'
                )
                self.assertEqual(response.status_code, 200)

    def test_both_routes_are_mounted_under_the_api_prefix(self):
        # Named routes with the project's prefix, so neither can be re-mounted
        # somewhere else without one of these going red.
        self.assertEqual(reverse('schema'), f'{settings.API_PREFIX}/schema/')
        self.assertEqual(reverse('swagger-ui'), f'{settings.API_PREFIX}/docs/')


class AuthenticationAfterTheModelSwapTests(TestCase):
    """A real token has to resolve against the swapped user model.

    This story is what set `AUTH_USER_MODEL` to a UUID-primary-key model, and
    JWT is the only authenticator the project configures. The existing 401 test
    sends `Bearer not-a-real-token`, and a token that cannot be resolved to an
    account produces the same 401 - so it passes identically whether the swap
    works or not. The two authenticated tests use `force_authenticate`, which
    replaces the authenticator entirely and therefore cannot see it either.
    """

    def test_a_token_issued_for_an_account_resolves_to_that_account(self):
        user = User(email=EMAIL)
        user.set_password(PASSWORD)
        user.save()

        token = AccessToken.for_user(user)
        self.assertEqual(
            str(token[settings.SIMPLE_JWT['USER_ID_CLAIM']]), str(user.pk)
        )

        resolved = JWTAuthentication().get_validated_token(str(token))
        self.assertEqual(JWTAuthentication().get_user(resolved), user)

    def test_a_signed_token_naming_an_absent_account_is_rejected(self):
        # The other half: the claim has to be read as this model's pk. A claim
        # naming nobody has to fail authentication, not quietly pass a request
        # through as anonymous-but-fine. The claim is a string, as it is on the
        # wire - `Token.encode` refuses a raw UUID, which is itself part of what
        # the model swap has to get right.
        forged = AccessToken()
        forged[settings.SIMPLE_JWT['USER_ID_CLAIM']] = str(uuid.uuid4())
        validated = JWTAuthentication().get_validated_token(str(forged))
        with self.assertRaises(AuthenticationFailed) as caught:
            JWTAuthentication().get_user(validated)
        # SimpleJWT reports a missing account with its own code, so a client
        # can tell a stale session from a malformed token instead of seeing one
        # undifferentiated 401.
        self.assertEqual(
            str(caught.exception.detail['code']), 'user_not_found'
        )

    def test_the_project_asks_simple_jwt_for_the_uuid_field(self):
        # The claim name and the field are what the two halves above depend on;
        # if either is repointed, say so in the same commit that changes it.
        #
        # Read by key, not through a default. The previous version was
        # `settings.SIMPLE_JWT.get('USER_ID_FIELD', 'id') == 'id'`, which cannot
        # fail: the fallback is the same string, so deleting the key from
        # `base.py` left the assertion green, and SimpleJWT's own default is
        # `'id'` too, so the behaviour would have been unchanged either way.
        # What is actually asserted is that the decision is written down here,
        # which is what makes it this project's rather than SimpleJWT's.
        self.assertIn('USER_ID_FIELD', settings.SIMPLE_JWT)
        self.assertEqual(settings.SIMPLE_JWT['USER_ID_FIELD'], 'id')
        self.assertIn('USER_ID_CLAIM', settings.SIMPLE_JWT)
        self.assertEqual(settings.SIMPLE_JWT['USER_ID_CLAIM'], 'user_id')
        # The field named above is the one this model's pk is, so the claim is
        # read as a UUID and a token minted for one account cannot resolve
        # another. `AccountModelTests` already pins the swap itself.
        self.assertEqual(
            settings.SIMPLE_JWT['USER_ID_FIELD'],
            get_user_model()._meta.pk.name,
        )


class PasswordPolicyWiringTests(TestCase):
    """The configured validators have to actually reach the candidate.

    Both password tests in `RegistrationEndpointTests` use a password that
    `MinimumLengthValidator` rejects on length alone, so none of them proves the
    other three ran. `validate_password` returns early when it is given no user,
    which means the candidate the serializer builds is the only thing that
    activates the attribute-similarity check: without it, a student's own address
    would be a valid password and the whole suite would stay green.
    """

    def test_a_password_derived_from_the_address_is_rejected(self):
        client = APIClient()
        response = client.post(
            reverse('register'),
            {'email': EMAIL, 'password': EMAIL},
            format='json',
        )
        self.assertEqual(response.status_code, 400)
        self.assertIn('password', response.json()['errors'])
        self.assertEqual(User.objects.count(), 0)

    def test_the_validator_is_reached_only_through_the_candidate(self):
        # The measurement that makes the test above meaningful: handed no
        # candidate, the validator set passes the same value, so the check is
        # activated by the serializer and by nothing else.
        validate_password(EMAIL, user=None)


