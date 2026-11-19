"""The verification email: one plain-text message carrying the link."""

from django.conf import settings
from django.core.mail import EmailMessage

SUBJECT = 'Verify your BrainX account'

BODY = """Hello,

Confirm your address to finish creating your BrainX account:

{link}

The link is valid for {hours} hours from when it was first issued. If you did
not ask for an account, ignore this message and nothing will happen.
"""


def build_verification_link(token):
    """The frontend page that reads `token`, with the token in the fragment.

    A fragment, never a query parameter: a query string travels in `Referer` to
    every host the page links to, and this product opens arbitrary external
    destinations (AD-10).

    `FRONTEND_URL` is env-driven, so a deployment that ends it with a slash
    would otherwise produce a link carrying a doubled separator. The slash is
    stripped here rather than demanded of every deployment, because the default
    in settings has none and the one that adds one is the one that breaks.
    """
    base = settings.FRONTEND_URL.rstrip('/')
    return f'{base}{settings.FRONTEND_VERIFY_PATH}#token={token}'


def send_verification_email(user, token):
    """Send `user` the link that verifies their address.

    Deliberately not silenced: a failure has to reach the caller, which is what
    turns it into a retryable 503 rather than a silently unverifiable account.

    The message says how long the link is valid for, not how long it has left.
    A re-send hands out a link for a row issued earlier, so a remaining-lifetime
    figure would have to be computed from the row; wording it as a window from
    first issue is the same information and is true on both the first send and
    every re-send.
    """
    message = EmailMessage(
        subject=SUBJECT,
        body=BODY.format(
            link=build_verification_link(token),
            hours=settings.EMAIL_VERIFICATION_TOKEN_TTL_HOURS,
        ),
        from_email=settings.DEFAULT_FROM_EMAIL,
        to=[user.email],
    )
    message.send()


RESET_SUBJECT = 'Reset your BrainX password'

RESET_BODY = """Hello,

Follow this link to reset your BrainX password:

{link}

The link is valid for {minutes} minutes from when it was first issued. If you did
not request a password reset, ignore this message and your password will remain
unchanged.
"""


def build_password_reset_link(token):
    """The frontend page that reads `token`, with the token in the fragment.

    A fragment, never a query parameter: a query string travels in `Referer` to
    every host the page links to, and this product opens arbitrary external
    destinations (AD-10).

    `FRONTEND_URL` is env-driven, so a deployment that ends it with a slash
    would otherwise produce a link carrying a doubled separator.
    """
    base = settings.FRONTEND_URL.rstrip('/')
    path = settings.FRONTEND_RESET_PASSWORD_PATH.lstrip('/')
    return f'{base}/{path}#token={token}'


def send_password_reset_email(user, token):
    """Send `user` the link that allows them to reset their password."""
    message = EmailMessage(
        subject=RESET_SUBJECT,
        body=RESET_BODY.format(
            link=build_password_reset_link(token),
            minutes=settings.PASSWORD_RESET_TOKEN_TTL_MINUTES,
        ),
        from_email=settings.DEFAULT_FROM_EMAIL,
        to=[user.email],
    )
    message.send()

