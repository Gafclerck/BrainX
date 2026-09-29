"""Issuing account tokens.

The signed string a client holds is not self-contained: it names an
`AccountToken` row, and that row is what resolves the account, the purpose and
the expiry (AD-10).
"""

from datetime import timedelta

from django.conf import settings
from django.core import signing
from django.db import transaction
from django.utils import timezone

from .models import AccountToken

# One salt per purpose, so a signature made for one can never verify as another.
VERIFY_TOKEN_SALT = 'user-verification'


def issue_verification_token(user):
    """Return the `(signed_token, row)` pair that verifies `user`.

    Every unspent verification token the account already holds is spent in the
    same transaction as the new one, so a resend cannot accumulate tokens and,
    issued one after another, a leaked link cannot stay valid alongside the
    replacements that superseded it.

    Sequentially, and only sequentially. The update runs before the insert and
    nothing here takes a lock, so two transactions issuing at the same moment
    can each leave an unspent row behind. That is harmless until 1.3 adds the
    partial unique index which makes spending a token an insert-or-fail, and
    this docstring must not claim what that index will enforce.
    """
    purpose = AccountToken.Purpose.VERIFY
    with transaction.atomic():
        AccountToken.objects.filter(
            user=user, purpose=purpose, used_at__isnull=True
        ).update(used_at=timezone.now())
        row = AccountToken.objects.create(
            user=user,
            purpose=purpose,
            expires_at=timezone.now()
            + timedelta(hours=settings.EMAIL_VERIFICATION_TOKEN_TTL_HOURS),
        )
    return signing.dumps(str(row.pk), salt=VERIFY_TOKEN_SALT), row


def live_verification_token(user):
    """The signed string for `user`'s unspent, unexpired verification row, or None.

    The duplicate branch needs the link the account already holds rather than a
    new one, and this signs the same `str(pk)` an issue produces, so a re-send
    delivers a link that resolves to the row already in the database. The most
    recent row wins, which keeps the answer stable if a concurrent issue ever
    left two of them live. `created_at` alone is not enough to say which that
    is: it is written per transaction, so two concurrent issues can share it -
    the clock resolution on a Windows host is coarse enough for two issues in
    one request to land on one value - and the order between them would be
    whatever the database felt like. The primary key breaks that tie.

    What the tiebreaker gives is a *fixed* order, not a correct age. The pk is
    a random UUID, so it says nothing about which row was written first, and a
    tie on `created_at` between two concurrent issues is decided arbitrarily.
    Arbitrary is the right word to aim for here rather than accurate: both rows
    are unspent and unexpired, so either one verifies the account, and the
    property that actually matters is that every call in this deployment names
    the same row - a caller holding no other handle can re-derive the answer.
    Ordering by anything else, or not at all, is what would let it change.
    """
    row = (
        AccountToken.objects.filter(
            user=user,
            purpose=AccountToken.Purpose.VERIFY,
            used_at__isnull=True,
            expires_at__gt=timezone.now(),
        )
        .order_by('-created_at', '-pk')
        .first()
    )
    if row is None:
        return None
    return signing.dumps(str(row.pk), salt=VERIFY_TOKEN_SALT)
