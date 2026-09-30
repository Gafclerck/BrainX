"""The registration and verification payloads, and the account state read.

`is_publisher` is deliberately absent from this module, which is what makes
self-registration structurally unable to grant the privilege (AD-9, AR-12).
"""

from collections.abc import Mapping

from django.contrib.auth.password_validation import validate_password
from rest_framework import serializers

from .models import User, UserManager


def normalize_email(value):
    """The address as it is stored and mailed: the manager's own rule.

    Delegated rather than restated, because a second implementation of the same
    rule is precisely how a manager and a serializer end up writing two
    spellings of one mailbox to two rows. The column is case-sensitive, so
    nothing downstream would notice and nothing would collide.
    """
    return UserManager.normalize_email(value)


class RegistrationSerializer(serializers.Serializer):
    """An address and a password, and nothing else.

    Both fields are the whole contract: a key the serializer does not declare
    is ignored rather than rejected, so an extra key in a payload cannot change
    what a request does.
    """

    email = serializers.EmailField()
    password = serializers.CharField(write_only=True, trim_whitespace=False)

    def to_internal_value(self, data):
        """Normalize the address before any field validates it.

        Done first so uniqueness and the address the mail is sent to are the
        same string, whatever the client sent.

        A value that is not a string is left exactly as it arrived. Coercing it
        would hand DRF a string the client never sent, and a `null` or a wrong
        type would then be reported as a malformed address instead of as the
        type problem it is.
        """
        if isinstance(data, Mapping) and isinstance(data.get('email'), str):
            data = {**data, 'email': normalize_email(data['email'])}
        return super().to_internal_value(data)

    def validate_password(self, value):
        """Run the project's `AUTH_PASSWORD_VALIDATORS` against the address.

        The address is the context the similarity validator needs, so the
        candidate is validated as the account it would create.

        Django's `ValidationError` is raised unchanged. DRF already catches one
        coming out of a `validate_<field>` hook and files its messages under
        that field, so restating it as DRF's own exception would render the
        same body while discarding the validator's error codes, which is the
        only thing the conversion actually changes.
        """
        raw = self.initial_data if isinstance(self.initial_data, Mapping) else {}
        validate_password(value, User(email=normalize_email(raw.get('email'))))
        return value


class EmailVerificationSerializer(serializers.Serializer):
    """The token the emailed link carried, and optionally the account's address.

    `token` is the whole contract. `email` is a claim a client may add, and the
    view compares it to the address the row resolves to rather than resolving
    anything with it: the row, never the body, says which account this is
    (AD-10). A client that supplies no address is the common case, so the field
    is optional rather than required.
    """

    token = serializers.CharField()
    email = serializers.EmailField(required=False)

    def to_internal_value(self, data):
        """Normalize a supplied address before the comparison that uses it.

        The account's stored address is normalized, and the column is
        case-sensitive, so comparing a raw `Student@Example.com` against a
        stored `student@example.com` would refuse a caller who owns the very
        mailbox they typed. Delegated to the manager's rule for the same reason
        registration delegates to it: two implementations of one rule is how two
        spellings of one mailbox end up on two rows.

        A value that is not a string is left exactly as it arrived, for
        `RegistrationSerializer`'s reason: coercing it would report a type
        problem as a malformed address.
        """
        if isinstance(data, Mapping) and isinstance(data.get('email'), str):
            data = {**data, 'email': normalize_email(data['email'])}
        return super().to_internal_value(data)


class AccountStateSerializer(serializers.ModelSerializer):
    """What a client may read about its own account.

    Two fields, and no privilege flag. `is_publisher` is in no serializer here
    or in registration, and the point of `me/` is to report whether the caller
    is verified - not to tell a caller what it may not do, and never about any
    other account.
    """

    class Meta:
        model = User
        fields = ('email', 'is_email_verified')
        read_only_fields = fields
