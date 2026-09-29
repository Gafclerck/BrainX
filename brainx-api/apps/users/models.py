"""The account: the project's single user model, and its account tokens."""

from django.conf import settings
from django.contrib.auth.base_user import AbstractBaseUser, BaseUserManager
from django.contrib.auth.models import PermissionsMixin
from django.db import models

from apps.core.models import TimeStampedModel, UUIDModel


class UserManager(BaseUserManager):
    """Creates accounts by email; there is no username to key them by."""

    @classmethod
    def normalize_email(cls, email):
        """Trim and lowercase the whole address, so one mailbox is one row.

        Django's own version lowercases only the domain, which the RFC allows
        for a local part. That is the wrong rule here: the account is keyed by
        the address, so two spellings of one mailbox have to collapse onto the
        same string before the unique constraint ever sees them. The column is
        case-sensitive, so `Foo@x.com` and `foo@x.com` would otherwise be two
        rows rather than one conflict.
        """
        return str(email or '').strip().lower()

    def create_user(self, email, password=None, **extra_fields):
        extra_fields.setdefault('is_staff', False)
        extra_fields.setdefault('is_superuser', False)
        user = self.model(email=self.normalize_email(email), **extra_fields)
        user.set_password(password)
        user.save(using=self._db)
        return user

    def create_superuser(self, email, password=None, **extra_fields):
        extra_fields.setdefault('is_staff', True)
        extra_fields.setdefault('is_superuser', True)
        if extra_fields.get('is_staff') is not True:
            raise ValueError('A superuser must have is_staff=True.')
        if extra_fields.get('is_superuser') is not True:
            raise ValueError('A superuser must have is_superuser=True.')
        return self.create_user(email, password, **extra_fields)


class User(UUIDModel, TimeStampedModel, PermissionsMixin, AbstractBaseUser):
    """One account per email address.

    `is_publisher` is the only privilege identity (AD-9) and is therefore in no
    writable serializer, so no endpoint a client can reach grants itself.
    """

    email = models.EmailField(unique=True)
    is_active = models.BooleanField(default=True)
    is_staff = models.BooleanField(default=False)
    is_email_verified = models.BooleanField(default=False)
    is_publisher = models.BooleanField(default=False)

    USERNAME_FIELD = 'email'
    EMAIL_FIELD = 'email'
    # `email` is the only field `createsuperuser` still has to be told.
    REQUIRED_FIELDS = []

    objects = UserManager()

    def save(self, *args, **kwargs):
        # Normalized here as well as in the manager, because the manager is not
        # the only way this table gets written: `User(email=...)` followed by
        # `save()` is legal and obvious, and `createsuperuser` and any future
        # admin action reach the model the same way. The unique constraint is
        # case-sensitive, so a row written unnormalized would be a second
        # account for one mailbox - silently, since nothing rejects it. The
        # manager's normalization is idempotent, so this repeats no work.
        # Through the class, not the instance: Django 6 refuses `self.objects`,
        # and a manager descriptor is a class-level access anyway.
        self.email = type(self).objects.normalize_email(self.email)
        # `update_fields` narrows the write to the columns it names, so
        # normalizing the attribute above would leave the row holding the old
        # spelling and the instance disagreeing with it. `email` joins the set
        # whenever the caller passed one, which is what makes the guarantee
        # above hold on every path `save()` actually writes.
        if kwargs.get('update_fields') is not None:
            kwargs['update_fields'] = {*kwargs['update_fields'], 'email'}
        super().save(*args, **kwargs)

    def __str__(self):
        # The address, because that is how a person names an account. Every
        # other repr here is `User object (<uuid>)`, which is what the shell,
        # the admin and the log lines are all reading.
        return self.email


class AccountToken(UUIDModel, TimeStampedModel):
    """A single-use, expiring token bound to one account and one purpose.

    The signed string a client holds names this row; the row, never the
    request body, is what resolves the account it belongs to (AD-10).
    """

    class Purpose(models.TextChoices):
        VERIFY = 'verify', 'Verify'

    user = models.ForeignKey(
        settings.AUTH_USER_MODEL,
        on_delete=models.CASCADE,
        related_name='account_tokens',
    )
    purpose = models.CharField(max_length=32, choices=Purpose.choices, db_index=True)
    expires_at = models.DateTimeField()
    # Null until the token is spent or superseded. Story 1.3 adds the
    # TokenConsumption row that makes spending it an insert-or-fail.
    used_at = models.DateTimeField(null=True, blank=True)

    def __str__(self):
        # The account and the purpose identify the row to a reader; the pk is
        # what the signed value carries, so it is here for the two to be lined
        # up in the shell and the admin.
        return f'{self.purpose} token for {self.user_id} ({self.pk})'
