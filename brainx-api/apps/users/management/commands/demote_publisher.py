"""Management command to demote an existing user account from Publisher."""

from django.conf import settings
from django.core.management.base import BaseCommand, CommandError
from django.db import transaction

from apps.users.models import User, UserManager
from apps.users.tokens import blacklist_outstanding_refresh_tokens


class Command(BaseCommand):
    """Demote an account from Publisher out of band.

    Enforces DEBUG=False guard, idempotency against existing state,
    and blacklists outstanding refresh tokens upon privilege change (AR-12).
    """

    help = 'Demote an existing user account from Publisher out of band.'

    def add_arguments(self, parser):
        parser.add_argument(
            'email',
            type=str,
            help='Email address of the account to demote from Publisher.',
        )

    def handle(self, *args, **options):
        if settings.DEBUG:
            raise CommandError('Cannot demote publisher when DEBUG is True.')

        raw_email = options['email']
        email = UserManager.normalize_email(raw_email)

        try:
            user = User.objects.get(email=email)
        except User.DoesNotExist:
            raise CommandError(f'Account with email "{email}" does not exist.')

        if not user.is_publisher:
            self.stdout.write(f'Account {email} is already not a Publisher.')
            return

        with transaction.atomic():
            user.is_publisher = False
            user.save(update_fields=['is_publisher', 'updated_at'])
            blacklist_outstanding_refresh_tokens(user)

        self.stdout.write(f'Account {email} demoted from Publisher.')
