"""Tests for promote_publisher and demote_publisher management commands.

These tests prove:
1. Promotion and demotion commands execute idempotently and report state via stdout (AC 1).
2. Both commands refuse execution when settings.DEBUG is True by raising CommandError (AC 2).
3. Privilege changes blacklist all outstanding refresh tokens, eliminating stale 7-day
   refresh sessions (AC 3).
4. Full permission loop closure: promoted accounts pass IsPublisher mutating checks,
   demoted accounts receive 403 Forbidden RFC 9457 errors (AC 4, Story 1.5).
5. Multiple publishers can exist simultaneously without singleton constraints (AC 5).
6. Robust edge-case handling: case-insensitive emails, nonexistent accounts, missing arguments.
"""

import io

from django.core.management import call_command
from django.core.management.base import CommandError
from django.test import TestCase, override_settings
from django.urls import path
from rest_framework import status
from rest_framework.exceptions import PermissionDenied
from rest_framework.permissions import IsAuthenticated
from rest_framework.response import Response
from rest_framework.test import APIClient
from rest_framework.views import APIView
from rest_framework_simplejwt.exceptions import TokenError
from rest_framework_simplejwt.token_blacklist.models import (
    BlacklistedToken,
    OutstandingToken,
)
from rest_framework_simplejwt.tokens import AccessToken, RefreshToken

from apps.core.exceptions import TITLES
from apps.core.permissions import IsPublisher
from apps.users.models import User
from apps.users.tokens import blacklist_outstanding_refresh_tokens
from config.urls import urlpatterns as base_urlpatterns

ENVELOPE_KEYS = ('type', 'title', 'status', 'detail', 'errors')


def assert_envelope(test_case, response, expected_type, expected_status):
    """Assert response matches the standard 5-key RFC 9457 error envelope."""
    body = response.json()
    test_case.assertEqual(sorted(body), sorted(ENVELOPE_KEYS))
    test_case.assertEqual(body['type'], expected_type)
    test_case.assertEqual(body['title'], TITLES[expected_type])
    test_case.assertEqual(body['status'], expected_status)
    test_case.assertEqual(response.status_code, expected_status)
    test_case.assertTrue(body['detail'])
    test_case.assertIsInstance(body['errors'], dict)
    test_case.assertTrue(response['Content-Type'].startswith('application/json'))
    return body


class MutatingActionTestView(APIView):
    """Test endpoint gated by IsPublisher to verify permission loop closure."""

    permission_classes = [IsAuthenticated, IsPublisher]

    def post(self, request):
        return Response({'status': 'created'}, status=status.HTTP_201_CREATED)


urlpatterns = [
    path('test-action/', MutatingActionTestView.as_view(), name='test-action'),
    *base_urlpatterns,
]


class BlacklistOutstandingTokensUnitTests(TestCase):
    """Unit tests for the blacklist_outstanding_refresh_tokens helper in apps.users.tokens."""

    def setUp(self):
        self.user1 = User.objects.create_user(email='user1@example.com')
        self.user2 = User.objects.create_user(email='user2@example.com')

    def test_blacklists_all_outstanding_tokens_for_target_user(self):
        token1 = RefreshToken.for_user(self.user1)
        token2 = RefreshToken.for_user(self.user1)
        other_token = RefreshToken.for_user(self.user2)

        blacklist_outstanding_refresh_tokens(self.user1)

        # Target user tokens must now be blacklisted
        with self.assertRaises(TokenError):
            RefreshToken(str(token1)).check_blacklist()
        with self.assertRaises(TokenError):
            RefreshToken(str(token2)).check_blacklist()

        # Other user's token remains valid and untouched
        RefreshToken(str(other_token)).check_blacklist()

    def test_idempotent_with_existing_blacklisted_tokens(self):
        token = RefreshToken.for_user(self.user1)
        blacklist_outstanding_refresh_tokens(self.user1)

        # Calling again should succeed without IntegrityError
        blacklist_outstanding_refresh_tokens(self.user1)

        with self.assertRaises(TokenError):
            RefreshToken(str(token)).check_blacklist()


class PromotePublisherCommandTests(TestCase):
    """Tests for the promote_publisher management command."""

    def setUp(self):
        self.email = 'student@example.com'
        self.user = User.objects.create_user(
            email=self.email,
            password='test-password-123',
            is_email_verified=True,
            is_publisher=False,
        )

    def test_promotes_existing_student_to_publisher_and_reports_stdout(self):
        out = io.StringIO()
        call_command('promote_publisher', self.email, stdout=out)

        self.user.refresh_from_db()
        self.assertTrue(self.user.is_publisher)
        self.assertIn(f'Account {self.email} promoted to Publisher.', out.getvalue())

    def test_promote_is_idempotent_when_already_publisher(self):
        self.user.is_publisher = True
        self.user.save(update_fields=['is_publisher', 'updated_at'])
        self.user.refresh_from_db()
        original_updated_at = self.user.updated_at

        out = io.StringIO()
        call_command('promote_publisher', self.email, stdout=out)

        self.user.refresh_from_db()
        self.assertTrue(self.user.is_publisher)
        self.assertEqual(self.user.updated_at, original_updated_at)
        self.assertIn(f'Account {self.email} is already a Publisher.', out.getvalue())

    @override_settings(DEBUG=True)
    def test_refuses_to_run_when_debug_is_true(self):
        out = io.StringIO()
        with self.assertRaises(CommandError) as ctx:
            call_command('promote_publisher', self.email, stdout=out)

        self.assertIn('DEBUG', str(ctx.exception))
        self.user.refresh_from_db()
        self.assertFalse(self.user.is_publisher)

    def test_raises_command_error_for_nonexistent_email(self):
        nonexistent = 'nobody@example.com'
        out = io.StringIO()
        with self.assertRaises(CommandError) as ctx:
            call_command('promote_publisher', nonexistent, stdout=out)

        self.assertIn('does not exist', str(ctx.exception))

    def test_normalizes_case_and_whitespace(self):
        out = io.StringIO()
        call_command('promote_publisher', '  STUDENT@example.COM  ', stdout=out)

        self.user.refresh_from_db()
        self.assertTrue(self.user.is_publisher)
        self.assertIn(f'Account {self.email} promoted to Publisher.', out.getvalue())

    def test_missing_email_argument_raises_command_error(self):
        with self.assertRaises(CommandError):
            call_command('promote_publisher')

    def test_promotion_blacklists_outstanding_refresh_tokens(self):
        refresh_before = RefreshToken.for_user(self.user)

        out = io.StringIO()
        call_command('promote_publisher', self.email, stdout=out)

        self.user.refresh_from_db()
        self.assertTrue(self.user.is_publisher)

        # Refresh token must be blacklisted
        self.assertTrue(
            BlacklistedToken.objects.filter(token__token=str(refresh_before)).exists()
        )
        with self.assertRaises(TokenError):
            RefreshToken(str(refresh_before)).check_blacklist()


class DemotePublisherCommandTests(TestCase):
    """Tests for the demote_publisher management command."""

    def setUp(self):
        self.email = 'publisher@example.com'
        self.user = User.objects.create_user(
            email=self.email,
            password='test-password-123',
            is_email_verified=True,
            is_publisher=True,
        )

    def test_demotes_existing_publisher_and_reports_stdout(self):
        out = io.StringIO()
        call_command('demote_publisher', self.email, stdout=out)

        self.user.refresh_from_db()
        self.assertFalse(self.user.is_publisher)
        self.assertIn(f'Account {self.email} demoted from Publisher.', out.getvalue())

    def test_demote_is_idempotent_when_already_not_publisher(self):
        self.user.is_publisher = False
        self.user.save(update_fields=['is_publisher', 'updated_at'])
        self.user.refresh_from_db()
        original_updated_at = self.user.updated_at

        out = io.StringIO()
        call_command('demote_publisher', self.email, stdout=out)

        self.user.refresh_from_db()
        self.assertFalse(self.user.is_publisher)
        self.assertEqual(self.user.updated_at, original_updated_at)
        self.assertIn(f'Account {self.email} is already not a Publisher.', out.getvalue())

    @override_settings(DEBUG=True)
    def test_refuses_to_run_when_debug_is_true(self):
        out = io.StringIO()
        with self.assertRaises(CommandError) as ctx:
            call_command('demote_publisher', self.email, stdout=out)

        self.assertIn('DEBUG', str(ctx.exception))
        self.user.refresh_from_db()
        self.assertTrue(self.user.is_publisher)

    def test_raises_command_error_for_nonexistent_email(self):
        nonexistent = 'nobody@example.com'
        out = io.StringIO()
        with self.assertRaises(CommandError) as ctx:
            call_command('demote_publisher', nonexistent, stdout=out)

        self.assertIn('does not exist', str(ctx.exception))

    def test_normalizes_case_and_whitespace(self):
        out = io.StringIO()
        call_command('demote_publisher', '  PUBLISHER@example.COM  ', stdout=out)

        self.user.refresh_from_db()
        self.assertFalse(self.user.is_publisher)
        self.assertIn(f'Account {self.email} demoted from Publisher.', out.getvalue())

    def test_missing_email_argument_raises_command_error(self):
        with self.assertRaises(CommandError):
            call_command('demote_publisher')

    def test_demotion_blacklists_outstanding_refresh_tokens(self):
        refresh_before = RefreshToken.for_user(self.user)

        out = io.StringIO()
        call_command('demote_publisher', self.email, stdout=out)

        self.user.refresh_from_db()
        self.assertFalse(self.user.is_publisher)

        # Refresh token must be blacklisted (AC 3)
        self.assertTrue(
            BlacklistedToken.objects.filter(token__token=str(refresh_before)).exists()
        )
        with self.assertRaises(TokenError):
            RefreshToken(str(refresh_before)).check_blacklist()


class MultiplePublishersModelTests(TestCase):
    """Tests verifying multiple publishers can exist without singleton constraints (AC 5)."""

    def test_multiple_publishers_supported_concurrently(self):
        user1 = User.objects.create_user(email='pub1@example.com', is_publisher=False)
        user2 = User.objects.create_user(email='pub2@example.com', is_publisher=False)

        out = io.StringIO()
        call_command('promote_publisher', user1.email, stdout=out)
        call_command('promote_publisher', user2.email, stdout=out)

        user1.refresh_from_db()
        user2.refresh_from_db()
        self.assertTrue(user1.is_publisher)
        self.assertTrue(user2.is_publisher)

        # Demote first publisher, second remains publisher
        call_command('demote_publisher', user1.email, stdout=out)
        user1.refresh_from_db()
        user2.refresh_from_db()
        self.assertFalse(user1.is_publisher)
        self.assertTrue(user2.is_publisher)


@override_settings(ROOT_URLCONF=__name__)
class PermissionLoopClosureIntegrationTests(TestCase):
    """Integration tests verifying IsPublisher permission loop closure with commands (AC 4)."""

    def setUp(self):
        self.client = APIClient()
        self.email = 'candidate@example.com'
        self.user = User.objects.create_user(
            email=self.email,
            password='test-password-123',
            is_email_verified=True,
            is_publisher=False,
        )

    def authenticate_as(self, user):
        token = str(AccessToken.for_user(user))
        self.client.credentials(HTTP_AUTHORIZATION=f'Bearer {token}')

    def test_mutating_request_rejected_then_permitted_after_promotion_then_rejected_after_demotion(self):
        # 1. As a regular student, mutating request is rejected with 403 Forbidden RFC 9457 error
        self.authenticate_as(self.user)
        response = self.client.post('/test-action/', format='json')
        body = assert_envelope(self, response, 'permission_denied', 403)
        self.assertEqual(body['detail'], str(PermissionDenied.default_detail))

        # 2. Promote account to Publisher out of band
        out = io.StringIO()
        call_command('promote_publisher', self.email, stdout=out)
        self.user.refresh_from_db()
        self.assertTrue(self.user.is_publisher)

        # 3. New token for promoted user passes mutating check (201 Created)
        self.authenticate_as(self.user)
        resp_promoted = self.client.post('/test-action/', format='json')
        self.assertEqual(resp_promoted.status_code, 201)
        self.assertEqual(resp_promoted.json(), {'status': 'created'})

        # 4. Demote account from Publisher out of band
        call_command('demote_publisher', self.email, stdout=out)
        self.user.refresh_from_db()
        self.assertFalse(self.user.is_publisher)

        # 5. New token for demoted user is rejected with 403 Forbidden RFC 9457 error
        self.authenticate_as(self.user)
        resp_demoted = self.client.post('/test-action/', format='json')
        assert_envelope(self, resp_demoted, 'permission_denied', 403)

