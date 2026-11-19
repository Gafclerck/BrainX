"""Issuing and spending account tokens.

The signed string a client holds is not self-contained: it names an
`AccountToken` row, and that row is what resolves the account, the purpose and
the expiry (AD-10).
"""

import uuid
from datetime import timedelta

from django.conf import settings
from django.core import signing
from django.db import transaction
from django.utils import timezone
from rest_framework_simplejwt.token_blacklist.models import (
    BlacklistedToken,
    OutstandingToken,
)

from .models import AccountToken

# One salt per purpose, so a signature made for one can never verify as another.
VERIFY_TOKEN_SALT = 'user-verification'
RESET_TOKEN_SALT = 'password-reset'

# One sentence for every token rejection, so no caller can distinguish causes.
TOKEN_REJECTED_MESSAGE = 'The token is not valid.'


class TokenRejected(Exception):
    """Every reason a signed token does not authorise, as one outcome.

    One class rather than one per cause, so a caller has a single thing to
    catch and a new cause cannot grow a branch that answers differently. What
    the caller does with it - render it as a 400, or log it - is the caller's
    decision; what it may not do is tell one cause from another to the client.
    """


def issue_verification_token(user):
    """Return the `(signed_token, row)` pair that verifies `user`.

    Every unspent verification token the account already holds is spent in the
    same transaction as the new one, so a resend cannot accumulate tokens and,
    issued one after another, a leaked link cannot stay valid alongside the
    replacements that superseded it.

    Sequentially, and only sequentially. The update runs before the insert and
    nothing here takes a lock, so two transactions issuing at the same moment
    can each leave an unspent row behind. That is a separate question from
    spending one, which `consume_verification_token` settles on the
    `TokenConsumption` unique constraint: two acceptances of the *same* token
    collide there, and there is still nothing here that stops two concurrent
    issues from leaving two live rows for one account. Both rows verify the
    same account, so the property that is actually at stake - one link per
    account, and the older one dead - is only ever weakened transiently, and
    only by a client issuing twice at once.
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


def consume_verification_token(signed):
    """Return the `(account, row)` a verification token authorises, or reject.

    Resolution happens here rather than in the view, and it is the row that
    resolves: nothing in the signed value is trusted except its integrity. The
    signed payload is a UUID naming an `AccountToken`, and that row is what
    says which account, which purpose and when it lapses (AD-10).

    A token is refused unless it verifies, carries the `verify` purpose, is
    still unspent, has not lapsed, and names an account that is not already
    verified. All five refusals raise `TokenRejected`, so the caller has one
    branch and the responses cannot drift apart.

    The already-verified case is here rather than left to the caller because
    the row still looks spendable when the account behind it is not: another
    device may have verified it, or an operator may have, and a live token for
    a verified account must not be consumable. Deciding it here is what keeps a
    second caller of this function from having to remember.

    Expiry is decided against the stored `expires_at` and not against the
    signing `max_age`. `signing.dumps` embeds a timestamp and `loads` will
    enforce a `max_age` handed to it, but a number the caller supplies is a
    number the caller can also get wrong; the stored value is the one the row
    was written with.

    Nothing is written here. Spending is the caller's transaction, so the
    insert-or-fail and the effect it authorises commit together (AD-10).
    """
    row = _row_named_by(signed)
    if (
        row.purpose != AccountToken.Purpose.VERIFY
        or row.used_at is not None
        or row.expires_at <= timezone.now()
        or row.user.is_email_verified
    ):
        raise TokenRejected()
    return row.user, row


def _row_named_by(signed, salt=VERIFY_TOKEN_SALT):
    """The live `AccountToken` a signed string names, or reject.

    `BadSignature` covers a tampered value, one signed with another salt and
    one whose embedded timestamp is older than a `max_age` - `SignatureExpired`
    is a subclass of it, so a purpose-scoped salt and a max-age check both land
    here without a second name.

    `signing.loads` returns whatever was signed, and `signing.dumps` will sign
    any JSON-encodable value, so a value that verifies is not yet a UUID.
    `uuid.UUID` is what turns it into something the pk lookup can be asked for,
    and it is the only call in the first `try`, so the three ways it can refuse
    an unusable payload are all part of the same rejection as a signature it
    did not accept: `ValueError` on a malformed string, `TypeError` on nothing
    at all, and `AttributeError` on a number, which reaches the constructor's
    own `hex.replace`.

    The lookup is one query and carries `user` along: the account is needed by
    the caller on every success and by nothing on a failure.
    """
    try:
        payload = signing.loads(signed, salt=salt)
        row_id = uuid.UUID(payload)
    except (signing.BadSignature, ValueError, TypeError, AttributeError):
        raise TokenRejected() from None
    try:
        return AccountToken.objects.select_related('user').get(pk=row_id)
    except AccountToken.DoesNotExist:
        raise TokenRejected() from None


def issue_password_reset_token(user):
    """Return the `(signed_token, row)` pair that resets `user`'s password.

    Every unspent password reset token the account already holds is invalidated
    in the same transaction as the new one by setting `used_at = timezone.now()`,
    so a re-request cannot accumulate usable reset links and older leaked links
    are immediately dead.
    """
    purpose = AccountToken.Purpose.RESET
    with transaction.atomic():
        AccountToken.objects.filter(
            user=user, purpose=purpose, used_at__isnull=True
        ).update(used_at=timezone.now())
        row = AccountToken.objects.create(
            user=user,
            purpose=purpose,
            expires_at=timezone.now()
            + timedelta(minutes=settings.PASSWORD_RESET_TOKEN_TTL_MINUTES),
        )
    return signing.dumps(str(row.pk), salt=RESET_TOKEN_SALT), row


def consume_password_reset_token(signed):
    """Return the `(account, row)` a password reset token authorises, or reject.

    Resolution happens here rather than in the view, and it is the row that
    resolves: nothing in the signed value is trusted except its integrity.

    A token is refused unless it verifies with `RESET_TOKEN_SALT`, carries the
    `reset` purpose, is still unspent (`used_at is None`), and has not lapsed
    (`expires_at > timezone.now()`). All refusals raise `TokenRejected`.

    Unlike email verification, account verification status (`is_email_verified`)
    is not checked: verification is an orthogonal lifecycle event.

    Nothing is written here. Spending is the caller's transaction, so the
    insert-or-fail and the effect it authorises commit together (AD-10).
    """
    row = _row_named_by(signed, salt=RESET_TOKEN_SALT)
    if (
        row.purpose != AccountToken.Purpose.RESET
        or row.used_at is not None
        or row.expires_at <= timezone.now()
    ):
        raise TokenRejected()
    return row.user, row


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


def blacklist_outstanding_refresh_tokens(user):
    """Blacklist every outstanding, non-blacklisted refresh token for `user`.

    Invalidates existing sessions so privilege changes and credential rotations
    take effect within one access-token lifetime (AR-12).
    """
    outstanding = OutstandingToken.objects.filter(user=user).exclude(
        blacklistedtoken__isnull=False
    )
    return BlacklistedToken.objects.bulk_create(
        [BlacklistedToken(token=t) for t in outstanding],
        ignore_conflicts=True,
    )

