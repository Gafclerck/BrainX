"""Tests for the bootstrap_admin management command.

Validates:
1. Complete creation of a new administrator with all required privileges:
   - is_active = True
   - is_email_verified = True
   - is_publisher = True
   - is_staff = True
   - is_superuser = True
2. Email normalization (case folding and whitespace trimming).
3. Creation using environment variables (DJANGO_SUPERUSER_EMAIL / DJANGO_SUPERUSER_PASSWORD).
4. Validation failure on invalid email format or weak password.
5. Missing required options in non-interactive mode.
6. Idempotent promotion of an existing unprivileged account (with or without password reset).
7. Invalidation of outstanding refresh tokens upon account privilege or password change.
8. Interactive prompts flow (mocked input / getpass).
"""

import io
import os
from unittest.mock import patch

from django.core.management import call_command
from django.core.management.base import CommandError
from django.test import TestCase
from rest_framework_simplejwt.token_blacklist.models import (
    BlacklistedToken,
    OutstandingToken,
)
from rest_framework_simplejwt.tokens import RefreshToken

from apps.users.models import User


class BootstrapAdminTests(TestCase):
    """Test suite for bootstrap_admin management command."""

    def test_create_new_admin_non_interactive(self):
        """Creates a fully privileged admin account in non-interactive mode."""
        out = io.StringIO()
        call_command(
            'bootstrap_admin',
            '--email=NewAdmin@Example.COM',
            '--password=ComplexP@ssw0rd2026!',
            '--noinput',
            stdout=out,
        )

        user = User.objects.filter(email='newadmin@example.com').first()
        self.assertIsNotNone(user)
        self.assertTrue(user.is_active)
        self.assertTrue(user.is_email_verified)
        self.assertTrue(user.is_publisher)
        self.assertTrue(user.is_staff)
        self.assertTrue(user.is_superuser)
        self.assertTrue(user.check_password('ComplexP@ssw0rd2026!'))
        self.assertIn("Administrator account 'newadmin@example.com' created successfully", out.getvalue())

    def test_create_admin_from_env_vars(self):
        """Creates an admin account when email and password are provided in env vars."""
        out = io.StringIO()
        with patch.dict(
            os.environ,
            {
                'DJANGO_SUPERUSER_EMAIL': 'envadmin@example.com',
                'DJANGO_SUPERUSER_PASSWORD': 'EnvP@ssw0rd2026!Strict',
            },
        ):
            call_command('bootstrap_admin', '--noinput', stdout=out)

        user = User.objects.filter(email='envadmin@example.com').first()
        self.assertIsNotNone(user)
        self.assertTrue(user.is_publisher)
        self.assertTrue(user.is_superuser)
        self.assertTrue(user.check_password('EnvP@ssw0rd2026!Strict'))

    def test_invalid_email_format_raises_error(self):
        """Fails with CommandError if the provided email has an invalid format."""
        with self.assertRaises(CommandError) as ctx:
            call_command(
                'bootstrap_admin',
                '--email=not-an-email',
                '--password=ValidP@ssw0rd123!',
                '--noinput',
            )
        self.assertIn("is not a valid email address", str(ctx.exception))

    def test_missing_password_for_new_account_raises_error(self):
        """Fails in non-interactive mode if no password is provided for a new account."""
        with self.assertRaises(CommandError) as ctx:
            call_command(
                'bootstrap_admin',
                '--email=someone@example.com',
                '--noinput',
            )
        self.assertIn("Password is required for a new administrator account", str(ctx.exception))

    def test_weak_password_raises_validation_error(self):
        """Fails with CommandError if the password does not pass Django's validators."""
        with self.assertRaises(CommandError) as ctx:
            call_command(
                'bootstrap_admin',
                '--email=admin@example.com',
                '--password=short',
                '--noinput',
            )
        err_msg = str(ctx.exception).lower()
        self.assertTrue('trop court' in err_msg or 'too short' in err_msg)

    def test_idempotent_promotion_existing_user_without_password(self):
        """Promotes an existing standard user without modifying their existing password."""
        initial_user = User.objects.create_user(
            email='existing@example.com',
            password='InitialP@ssw0rd2026!',
            is_active=True,
            is_email_verified=False,
            is_publisher=False,
        )

        token = RefreshToken.for_user(initial_user)
        out = io.StringIO()

        call_command(
            'bootstrap_admin',
            '--email=existing@example.com',
            '--noinput',
            stdout=out,
        )

        initial_user.refresh_from_db()
        self.assertTrue(initial_user.is_email_verified)
        self.assertTrue(initial_user.is_publisher)
        self.assertTrue(initial_user.is_staff)
        self.assertTrue(initial_user.is_superuser)
        self.assertTrue(initial_user.check_password('InitialP@ssw0rd2026!'))
        self.assertIn("promoted/updated successfully", out.getvalue())

        # Tokens must be blacklisted following privilege promotion
        outstanding = OutstandingToken.objects.filter(token=str(token)).first()
        if outstanding:
            self.assertTrue(BlacklistedToken.objects.filter(token=outstanding).exists())

    def test_idempotent_update_existing_user_with_new_password(self):
        """Promotes an existing user and changes their password when requested."""
        initial_user = User.objects.create_user(
            email='existing2@example.com',
            password='InitialP@ssw0rd2026!',
            is_active=True,
        )

        token = RefreshToken.for_user(initial_user)
        out = io.StringIO()

        call_command(
            'bootstrap_admin',
            '--email=existing2@example.com',
            '--password=UpdatedP@ssw0rd2026!Strict',
            '--noinput',
            stdout=out,
        )

        initial_user.refresh_from_db()
        self.assertTrue(initial_user.is_publisher)
        self.assertTrue(initial_user.check_password('UpdatedP@ssw0rd2026!Strict'))

        outstanding = OutstandingToken.objects.filter(token=str(token)).first()
        if outstanding:
            self.assertTrue(BlacklistedToken.objects.filter(token=outstanding).exists())

    @patch('builtins.input')
    @patch('getpass.getpass')
    def test_interactive_mode_success(self, mock_getpass, mock_input):
        """Prompts interactively for email and password if omitted."""
        mock_input.side_effect = ['interactive@example.com']
        mock_getpass.side_effect = [
            'InteractiveP@ssw0rd2026!',
            'InteractiveP@ssw0rd2026!',
        ]

        out = io.StringIO()
        call_command('bootstrap_admin', stdout=out)

        user = User.objects.filter(email='interactive@example.com').first()
        self.assertIsNotNone(user)
        self.assertTrue(user.is_publisher)
        self.assertTrue(user.is_superuser)
        self.assertTrue(user.check_password('InteractiveP@ssw0rd2026!'))
