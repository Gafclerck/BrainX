"""Management command to cleanly and securely bootstrap the first administrator.

Enforces:
1. Email normalization (UserManager.normalize_email) and format validation.
2. Complete privilege assignment:
   - is_active = True
   - is_email_verified = True (required for IsVerifiedAccount permission)
   - is_publisher = True (required for IsPublisher permission & publisher workspace)
   - is_staff = True (Django staff)
   - is_superuser = True (Django superuser)
3. Django password validation (AUTH_PASSWORD_VALIDATORS).
4. Idempotency: safe updates if account already exists.
5. Invalidation of outstanding refresh tokens on password/privilege change.
6. Support for both interactive mode and non-interactive mode (CLI args or env vars).
"""

import getpass
import os
import sys

from django.contrib.auth.password_validation import validate_password
from django.core.exceptions import ValidationError
from django.core.management.base import BaseCommand, CommandError
from django.core.validators import validate_email
from django.db import transaction

from apps.users.models import User, UserManager
from apps.users.tokens import blacklist_outstanding_refresh_tokens


class Command(BaseCommand):
    """Bootstrap or promote the primary administrator / publisher account."""

    help = 'Bootstrap the initial administrator account with full Publisher and Superuser privileges.'

    def add_arguments(self, parser):
        parser.add_argument(
            '--email',
            type=str,
            default=None,
            help="Admin's email address.",
        )
        parser.add_argument(
            '--password',
            type=str,
            default=None,
            help="Admin's password (avoid in shell history; prefer prompt or environment variables).",
        )
        parser.add_argument(
            '--noinput',
            '--no-input',
            action='store_false',
            dest='interactive',
            default=True,
            help='Do not prompt for input. Requires email and password via flags or env vars.',
        )

    def _resolve_email(self, options):
        email = options.get('email') or os.environ.get('DJANGO_SUPERUSER_EMAIL') or os.environ.get('ADMIN_EMAIL')
        interactive = options.get('interactive', True)

        if not email and interactive:
            while True:
                prompt_val = input('Admin email address: ').strip()
                if not prompt_val:
                    self.stderr.write('Email address cannot be empty.')
                    continue
                try:
                    validate_email(prompt_val)
                    email = prompt_val
                    break
                except ValidationError:
                    self.stderr.write(f"'{prompt_val}' is not a valid email address.")

        if not email:
            raise CommandError(
                'Email is required. Provide --email, set DJANGO_SUPERUSER_EMAIL/ADMIN_EMAIL, '
                'or run interactively.'
            )

        try:
            validate_email(email)
        except ValidationError:
            raise CommandError(f"'{email}' is not a valid email address.")

        return UserManager.normalize_email(email)

    def _resolve_password(self, email, user_instance, options):
        password = options.get('password') or os.environ.get('DJANGO_SUPERUSER_PASSWORD') or os.environ.get('ADMIN_PASSWORD')
        interactive = options.get('interactive', True)

        if not password and interactive:
            if user_instance is not None:
                confirm = input(
                    f"Account '{email}' already exists. Do you want to update its password? [y/N]: "
                ).strip().lower()
                if confirm not in ('y', 'yes'):
                    return None

            while True:
                pwd1 = getpass.getpass('Password: ')
                if not pwd1:
                    self.stderr.write('Password cannot be empty.')
                    continue
                pwd2 = getpass.getpass('Password (again): ')
                if pwd1 != pwd2:
                    self.stderr.write('Passwords do not match. Please try again.')
                    continue

                try:
                    target_user = user_instance or User(email=email)
                    validate_password(pwd1, user=target_user)
                    password = pwd1
                    break
                except ValidationError as exc:
                    self.stderr.write('\n'.join(exc.messages))

        if not password:
            if user_instance is None:
                raise CommandError(
                    'Password is required for a new administrator account. '
                    'Provide --password, set DJANGO_SUPERUSER_PASSWORD/ADMIN_PASSWORD, '
                    'or run interactively.'
                )
            return None

        # Validate password against validators
        target_user = user_instance or User(email=email)
        try:
            validate_password(password, user=target_user)
        except ValidationError as exc:
            raise CommandError('; '.join(exc.messages))

        return password

    def handle(self, *args, **options):
        email = self._resolve_email(options)
        existing_user = User.objects.filter(email=email).first()
        password = self._resolve_password(email, existing_user, options)

        with transaction.atomic():
            if existing_user:
                user = existing_user
                is_new = False
                user.is_active = True
                user.is_email_verified = True
                user.is_publisher = True
                user.is_staff = True
                user.is_superuser = True

                if password:
                    user.set_password(password)

                user.save()

                # Revoke existing sessions when privileges/passwords are updated
                blacklist_outstanding_refresh_tokens(user)
            else:
                is_new = True
                user = User(
                    email=email,
                    is_active=True,
                    is_email_verified=True,
                    is_publisher=True,
                    is_staff=True,
                    is_superuser=True,
                )
                user.set_password(password)
                user.save()

        action = 'created' if is_new else 'promoted/updated'
        self.stdout.write(
            self.style.SUCCESS(
                f"Administrator account '{user.email}' {action} successfully:\n"
                f"  - Active: {user.is_active}\n"
                f"  - Email Verified: {user.is_email_verified}\n"
                f"  - Publisher: {user.is_publisher}\n"
                f"  - Staff: {user.is_staff}\n"
                f"  - Superuser: {user.is_superuser}"
            )
        )
