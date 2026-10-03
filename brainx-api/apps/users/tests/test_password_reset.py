"""Tests for password reset request, confirmation, token management, and email dispatch.

Verifies Story 1.4:
- POST /api/v1/password-reset/
- POST /api/v1/reset-password/
- AccountToken.Purpose.RESET with 30-minute TTL and invalidation of prior tokens
- Password update and refresh token blacklisting
- Anti-enumeration: uniform 200 response for registered, unregistered, and SMTP failure
- Single-use enforcement via TokenConsumption unique constraint
- RFC 9457 error contracts
"""

from datetime import timedelta
from unittest.mock import patch

from django.conf import settings
from django.core import mail, signing
from django.db import IntegrityError
from django.test import TestCase, override_settings
from django.urls import reverse
from django.utils import timezone
from rest_framework import status
from rest_framework.test import APIClient
from rest_framework_simplejwt.exceptions import TokenError
from rest_framework_simplejwt.token_blacklist.models import (
    BlacklistedToken,
    OutstandingToken,
)
from rest_framework_simplejwt.tokens import RefreshToken

from apps.users.email import (
    RESET_SUBJECT,
    build_password_reset_link,
    send_password_reset_email,
)
from apps.users.models import AccountToken, TokenConsumption, User
from apps.users.tokens import (
    RESET_TOKEN_SALT,
    TOKEN_REJECTED_MESSAGE,
    TokenRejected,
    consume_password_reset_token,
    issue_password_reset_token,
    issue_verification_token,
)
from apps.users.views import (
    PASSWORD_RESET_CONFIRM_MESSAGE,
    PASSWORD_RESET_REQUEST_MESSAGE,
)

ENVELOPE_KEYS = ('type', 'title', 'status', 'detail', 'errors')
EMAIL = 'student@example.com'
INITIAL_PASSWORD = 'strong-initial-password-123!'
NEW_PASSWORD = 'strong-new-password-456!'


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


def signed_for(pk, salt=RESET_TOKEN_SALT):
    return signing.dumps(str(pk), salt=salt)


def tamper(signed, position=-1):
    replacement = 'A' if signed[position] != 'A' else 'B'
    return f'{signed[:position]}{replacement}{signed[position + 1:]}'


class PasswordResetTokenUnitTests(TestCase):
    """Unit tests for token issuance and consumption helpers."""

    def setUp(self):
        self.user = User.objects.create_user(email=EMAIL, password=INITIAL_PASSWORD)

    def test_issue_password_reset_token_creates_unspent_token_with_30m_ttl(self):
        signed, row = issue_password_reset_token(self.user)
        self.assertEqual(row.user, self.user)
        self.assertEqual(row.purpose, AccountToken.Purpose.RESET)
        self.assertIsNone(row.used_at)
        expected_expiry = timezone.now() + timedelta(
            minutes=settings.PASSWORD_RESET_TOKEN_TTL_MINUTES
        )
        self.assertAlmostEqual(
            row.expires_at.timestamp(), expected_expiry.timestamp(), delta=5
        )

    def test_issue_invalidates_prior_unspent_reset_tokens(self):
        signed1, row1 = issue_password_reset_token(self.user)
        self.assertIsNone(row1.used_at)

        signed2, row2 = issue_password_reset_token(self.user)
        row1.refresh_from_db()
        self.assertIsNotNone(row1.used_at)
        self.assertIsNone(row2.used_at)

        with self.assertRaises(TokenRejected):
            consume_password_reset_token(signed1)

        user, row = consume_password_reset_token(signed2)
        self.assertEqual(user, self.user)
        self.assertEqual(row.pk, row2.pk)

    def test_consume_valid_token_returns_user_and_row(self):
        signed, row = issue_password_reset_token(self.user)
        resolved_user, resolved_row = consume_password_reset_token(signed)
        self.assertEqual(resolved_user, self.user)
        self.assertEqual(resolved_row.pk, row.pk)

    def test_consume_rejects_expired_token(self):
        signed, row = issue_password_reset_token(self.user)
        row.expires_at = timezone.now() - timedelta(seconds=1)
        row.save(update_fields=['expires_at'])

        with self.assertRaises(TokenRejected):
            consume_password_reset_token(signed)

    def test_consume_rejects_spent_token(self):
        signed, row = issue_password_reset_token(self.user)
        row.used_at = timezone.now()
        row.save(update_fields=['used_at'])

        with self.assertRaises(TokenRejected):
            consume_password_reset_token(signed)

    def test_consume_rejects_verify_token(self):
        signed_verify, _row = issue_verification_token(self.user)
        with self.assertRaises(TokenRejected):
            consume_password_reset_token(signed_verify)

    def test_consume_rejects_tampered_token(self):
        signed, _row = issue_password_reset_token(self.user)
        with self.assertRaises(TokenRejected):
            consume_password_reset_token(tamper(signed))

    def test_unverified_account_can_consume_reset_token(self):
        self.assertFalse(self.user.is_email_verified)
        signed, row = issue_password_reset_token(self.user)
        user, _ = consume_password_reset_token(signed)
        self.assertEqual(user, self.user)

    def test_issue_reset_token_does_not_invalidate_pending_verification_tokens(self):
        verify_signed, verify_row = issue_verification_token(self.user)
        self.assertIsNone(verify_row.used_at)

        reset_signed, reset_row = issue_password_reset_token(self.user)
        verify_row.refresh_from_db()
        reset_row.refresh_from_db()

        self.assertIsNone(verify_row.used_at)
        self.assertIsNone(reset_row.used_at)


class PasswordResetEmailUnitTests(TestCase):
    """Unit tests for email construction and link format."""

    def setUp(self):
        self.user = User.objects.create_user(email=EMAIL, password=INITIAL_PASSWORD)

    def test_build_password_reset_link_uses_fragment(self):
        link = build_password_reset_link('abc-123')
        base = settings.FRONTEND_URL.rstrip('/')
        path = settings.FRONTEND_RESET_PASSWORD_PATH.lstrip('/')
        expected = f'{base}/{path}#token=abc-123'
        self.assertEqual(link, expected)
        self.assertIn('#token=abc-123', link)
        self.assertNotIn('?token=', link)

    @override_settings(FRONTEND_URL='http://localhost:5173/')
    def test_build_password_reset_link_strips_trailing_slash_to_avoid_double_slash(self):
        link = build_password_reset_link('abc-123')
        self.assertEqual(link, 'http://localhost:5173/reset-password#token=abc-123')
        self.assertNotIn('//reset-password', link)

    def test_send_password_reset_email_dispatches_message(self):
        mail.outbox = []
        send_password_reset_email(self.user, 'test-token')
        self.assertEqual(len(mail.outbox), 1)
        email = mail.outbox[0]
        self.assertEqual(email.subject, RESET_SUBJECT)
        self.assertEqual(email.to, [self.user.email])
        self.assertIn(f'{settings.PASSWORD_RESET_TOKEN_TTL_MINUTES} minutes', email.body)
        self.assertIn('#token=test-token', email.body)


class PasswordResetRequestAPITests(TestCase):
    """Integration tests for POST /api/v1/password-reset/."""

    def setUp(self):
        self.client = APIClient()
        self.url = reverse('password-reset')
        self.user = User.objects.create_user(email=EMAIL, password=INITIAL_PASSWORD)
        mail.outbox = []

    def test_request_for_registered_user_creates_token_and_sends_email(self):
        response = self.client.post(self.url, {'email': EMAIL}, format='json')
        self.assertEqual(response.status_code, status.HTTP_200_OK)
        self.assertEqual(
            response.json(), {'message': PASSWORD_RESET_REQUEST_MESSAGE}
        )

        # Token created
        token_row = AccountToken.objects.filter(
            user=self.user, purpose=AccountToken.Purpose.RESET
        ).first()
        self.assertIsNotNone(token_row)
        self.assertIsNone(token_row.used_at)

        # Email sent
        self.assertEqual(len(mail.outbox), 1)
        sent = mail.outbox[0]
        self.assertEqual(sent.to, [EMAIL])
        self.assertIn(f'#token=', sent.body)

    def test_request_normalizes_email(self):
        response = self.client.post(
            self.url, {'email': f'  {EMAIL.upper()}  '}, format='json'
        )
        self.assertEqual(response.status_code, status.HTTP_200_OK)
        self.assertEqual(len(mail.outbox), 1)
        self.assertEqual(mail.outbox[0].to, [EMAIL])

    def test_request_for_unregistered_user_returns_uniform_200_with_no_token_or_email(self):
        response = self.client.post(
            self.url, {'email': 'nonexistent@example.com'}, format='json'
        )
        self.assertEqual(response.status_code, status.HTTP_200_OK)
        self.assertEqual(
            response.json(), {'message': PASSWORD_RESET_REQUEST_MESSAGE}
        )
        self.assertEqual(len(mail.outbox), 0)
        self.assertEqual(
            AccountToken.objects.filter(user__email='nonexistent@example.com').count(),
            0,
        )

    def test_email_send_failure_returns_uniform_200_and_logs(self):
        with patch(
            'apps.users.views.send_password_reset_email',
            side_effect=OSError('SMTP server unreachable'),
        ):
            with self.assertLogs('apps.users.views', level='ERROR') as cm:
                response = self.client.post(self.url, {'email': EMAIL}, format='json')
                self.assertEqual(response.status_code, status.HTTP_200_OK)
                self.assertEqual(
                    response.json(), {'message': PASSWORD_RESET_REQUEST_MESSAGE}
                )
                self.assertTrue(
                    any(str(self.user.pk) in msg for msg in cm.output)
                )
                # Ensure raw email and secret tokens are not leaked in log output
                self.assertFalse(any(EMAIL in msg for msg in cm.output))

    def test_invalid_email_format_returns_400_envelope(self):
        response = self.client.post(
            self.url, {'email': 'not-an-email'}, format='json'
        )
        body = assert_envelope(
            self, response, 'validation_error', 400
        )
        self.assertIn('email', body['errors'])

    def test_missing_email_field_returns_400_envelope(self):
        response = self.client.post(self.url, {}, format='json')
        body = assert_envelope(
            self, response, 'validation_error', 400
        )
        self.assertIn('email', body['errors'])

    def test_disallowed_methods_return_405(self):
        for method in ('get', 'put', 'patch', 'delete'):
            response = getattr(self.client, method)(self.url)
            self.assertEqual(response.status_code, status.HTTP_405_METHOD_NOT_ALLOWED)

    def test_anonymous_request_endpoint_ignores_invalid_authorization_header(self):
        self.client.credentials(HTTP_AUTHORIZATION='Bearer not-a-real-token')
        response = self.client.post(
            self.url, {'email': EMAIL}, format='json'
        )
        self.assertEqual(response.status_code, status.HTTP_200_OK)

    def test_unsupported_media_type_returns_415(self):
        response = self.client.post(
            self.url,
            data='email=foo@example.com',
            content_type='application/x-www-form-urlencoded',
        )
        self.assertEqual(
            response.status_code, status.HTTP_415_UNSUPPORTED_MEDIA_TYPE
        )


class PasswordResetConfirmAPITests(TestCase):
    """Integration tests for POST /api/v1/reset-password/."""

    def setUp(self):
        self.client = APIClient()
        self.url = reverse('reset-password')
        self.user = User.objects.create_user(
            email=EMAIL, password=INITIAL_PASSWORD, is_email_verified=True
        )
        self.token, self.token_row = issue_password_reset_token(self.user)

    def test_successful_reset_changes_password_and_blacklists_refresh_tokens(self):
        # Create an outstanding refresh token before the reset
        refresh_before = RefreshToken.for_user(self.user)
        access_before = str(refresh_before.access_token)

        response = self.client.post(
            self.url,
            {'token': self.token, 'password': NEW_PASSWORD},
            format='json',
        )
        self.assertEqual(response.status_code, status.HTTP_200_OK)
        self.assertEqual(
            response.json(), {'message': PASSWORD_RESET_CONFIRM_MESSAGE}
        )

        # 1. Password changed
        self.user.refresh_from_db()
        self.assertTrue(self.user.check_password(NEW_PASSWORD))
        self.assertFalse(self.user.check_password(INITIAL_PASSWORD))

        # 2. Token consumption recorded and used_at stamped
        self.token_row.refresh_from_db()
        self.assertIsNotNone(self.token_row.used_at)
        self.assertTrue(
            TokenConsumption.objects.filter(token=self.token_row).exists()
        )

        # 3. Refresh token blacklisted
        self.assertTrue(
            BlacklistedToken.objects.filter(
                token__token=str(refresh_before)
            ).exists()
        )

        # 4. Old refresh token is blacklisted and cannot be used
        with self.assertRaises(TokenError):
            RefreshToken(str(refresh_before)).check_blacklist()

        # 5. Access token issued before reset remains valid until natural expiry (15m window)
        # Verify access token is accepted at me/ endpoint (account is already verified)
        me_url = reverse('me')
        me_response = self.client.get(
            me_url, HTTP_AUTHORIZATION=f'Bearer {access_before}'
        )
        self.assertEqual(me_response.status_code, status.HTTP_200_OK)

    def test_replaying_spent_token_returns_400_token_error(self):
        # First spend succeeds
        self.client.post(
            self.url,
            {'token': self.token, 'password': NEW_PASSWORD},
            format='json',
        )

        # Second spend fails
        second_response = self.client.post(
            self.url,
            {'token': self.token, 'password': 'AnotherValidPassword999!'},
            format='json',
        )
        body = assert_envelope(
            self, second_response, 'validation_error', 400
        )
        self.assertEqual(body['errors']['token'], [TOKEN_REJECTED_MESSAGE])

        # Password remains NEW_PASSWORD, not updated to AnotherValidPassword999!
        self.user.refresh_from_db()
        self.assertTrue(self.user.check_password(NEW_PASSWORD))
        self.assertFalse(self.user.check_password('AnotherValidPassword999!'))

    def test_integrity_error_during_spend_returns_400_token_error(self):
        with patch.object(
            TokenConsumption.objects,
            'create',
            side_effect=IntegrityError('duplicate key value violates unique constraint'),
        ):
            response = self.client.post(
                self.url,
                {'token': self.token, 'password': NEW_PASSWORD},
                format='json',
            )
            body = assert_envelope(
                self, response, 'validation_error', 400
            )
            self.assertEqual(body['errors']['token'], [TOKEN_REJECTED_MESSAGE])

            # Password was not updated
            self.user.refresh_from_db()
            self.assertTrue(self.user.check_password(INITIAL_PASSWORD))

    def test_expired_token_returns_400_token_error(self):
        self.token_row.expires_at = timezone.now() - timedelta(minutes=1)
        self.token_row.save(update_fields=['expires_at'])

        response = self.client.post(
            self.url,
            {'token': self.token, 'password': NEW_PASSWORD},
            format='json',
        )
        body = assert_envelope(
            self, response, 'validation_error', 400
        )
        self.assertEqual(body['errors']['token'], [TOKEN_REJECTED_MESSAGE])

    def test_wrong_purpose_verify_token_returns_400_token_error(self):
        verify_token, _ = issue_verification_token(self.user)
        response = self.client.post(
            self.url,
            {'token': verify_token, 'password': NEW_PASSWORD},
            format='json',
        )
        body = assert_envelope(
            self, response, 'validation_error', 400
        )
        self.assertEqual(body['errors']['token'], [TOKEN_REJECTED_MESSAGE])

    def test_tampered_token_returns_400_token_error(self):
        response = self.client.post(
            self.url,
            {'token': tamper(self.token), 'password': NEW_PASSWORD},
            format='json',
        )
        body = assert_envelope(
            self, response, 'validation_error', 400
        )
        self.assertEqual(body['errors']['token'], [TOKEN_REJECTED_MESSAGE])

    def test_weak_password_rejected_and_leaves_token_unspent(self):
        response = self.client.post(
            self.url,
            {'token': self.token, 'password': '123'},
            format='json',
        )
        body = assert_envelope(
            self, response, 'validation_error', 400
        )
        self.assertIn('password', body['errors'])
        self.assertNotIn('token', body['errors'])

        # Token is still unspent
        self.token_row.refresh_from_db()
        self.assertIsNone(self.token_row.used_at)
        self.assertFalse(
            TokenConsumption.objects.filter(token=self.token_row).exists()
        )

        # Can now be used with a strong password
        second_response = self.client.post(
            self.url,
            {'token': self.token, 'password': NEW_PASSWORD},
            format='json',
        )
        self.assertEqual(second_response.status_code, status.HTTP_200_OK)

    def test_missing_password_field_returns_400_envelope(self):
        response = self.client.post(
            self.url, {'token': self.token}, format='json'
        )
        body = assert_envelope(
            self, response, 'validation_error', 400
        )
        self.assertIn('password', body['errors'])

    def test_missing_token_field_returns_400_envelope(self):
        response = self.client.post(
            self.url, {'password': NEW_PASSWORD}, format='json'
        )
        body = assert_envelope(
            self, response, 'validation_error', 400
        )
        self.assertIn('token', body['errors'])

    def test_anonymous_confirm_endpoint_ignores_invalid_authorization_header(self):
        self.client.credentials(HTTP_AUTHORIZATION='Bearer not-a-real-token')
        response = self.client.post(
            self.url,
            {'token': self.token, 'password': NEW_PASSWORD},
            format='json',
        )
        self.assertEqual(response.status_code, status.HTTP_200_OK)

    def test_reset_succeeds_when_user_already_has_blacklisted_tokens(self):
        # Create an already-blacklisted token
        first_refresh = RefreshToken.for_user(self.user)
        first_refresh.blacklist()

        # Create an active unblacklisted token
        second_refresh = RefreshToken.for_user(self.user)

        response = self.client.post(
            self.url,
            {'token': self.token, 'password': NEW_PASSWORD},
            format='json',
        )
        self.assertEqual(response.status_code, status.HTTP_200_OK)

        # Both tokens are now blacklisted
        with self.assertRaises(TokenError):
            RefreshToken(str(first_refresh)).check_blacklist()
        with self.assertRaises(TokenError):
            RefreshToken(str(second_refresh)).check_blacklist()

    def test_empty_request_body_returns_400_with_both_field_errors(self):
        response = self.client.post(self.url, {}, format='json')
        body = assert_envelope(self, response, 'validation_error', 400)
        self.assertIn('token', body['errors'])
        self.assertIn('password', body['errors'])

    def test_spending_superseded_token_returns_400_token_error(self):
        # Issue a second reset token which invalidates the first
        _new_token, _ = issue_password_reset_token(self.user)

        # Attempting to spend the superseded token fails
        response = self.client.post(
            self.url,
            {'token': self.token, 'password': NEW_PASSWORD},
            format='json',
        )
        body = assert_envelope(self, response, 'validation_error', 400)
        self.assertEqual(body['errors']['token'], [TOKEN_REJECTED_MESSAGE])

    def test_reset_preserves_verified_account_status(self):
        self.assertTrue(self.user.is_email_verified)
        response = self.client.post(
            self.url,
            {'token': self.token, 'password': NEW_PASSWORD},
            format='json',
        )
        self.assertEqual(response.status_code, status.HTTP_200_OK)
        self.user.refresh_from_db()
        self.assertTrue(self.user.is_email_verified)

    def test_reset_preserves_unverified_account_status(self):
        self.user.is_email_verified = False
        self.user.save(update_fields=['is_email_verified'])
        response = self.client.post(
            self.url,
            {'token': self.token, 'password': NEW_PASSWORD},
            format='json',
        )
        self.assertEqual(response.status_code, status.HTTP_200_OK)
        self.user.refresh_from_db()
        self.assertFalse(self.user.is_email_verified)

    def test_reset_updates_user_and_token_updated_at_timestamps(self):
        past_time = timezone.now() - timedelta(minutes=10)
        User.objects.filter(pk=self.user.pk).update(updated_at=past_time)
        AccountToken.objects.filter(pk=self.token_row.pk).update(updated_at=past_time)

        response = self.client.post(
            self.url,
            {'token': self.token, 'password': NEW_PASSWORD},
            format='json',
        )
        self.assertEqual(response.status_code, status.HTTP_200_OK)

        self.user.refresh_from_db()
        self.token_row.refresh_from_db()
        self.assertGreater(self.user.updated_at, past_time)
        self.assertGreater(self.token_row.updated_at, past_time)

    def test_disallowed_methods_return_405(self):
        for method in ('get', 'put', 'patch', 'delete'):
            response = getattr(self.client, method)(self.url)
            self.assertEqual(response.status_code, status.HTTP_405_METHOD_NOT_ALLOWED)

    def test_unsupported_media_type_returns_415(self):
        response = self.client.post(
            self.url,
            data=f'token={self.token}&password={NEW_PASSWORD}',
            content_type='application/x-www-form-urlencoded',
        )
        self.assertEqual(
            response.status_code, status.HTTP_415_UNSUPPORTED_MEDIA_TYPE
        )
