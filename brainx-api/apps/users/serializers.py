"""The registration payload.

`is_publisher` is deliberately absent from this serializer, which is what makes
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
