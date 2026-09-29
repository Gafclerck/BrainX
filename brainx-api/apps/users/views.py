"""The open registration endpoint."""

import logging
import smtplib

from django.db import IntegrityError, transaction
from drf_spectacular.types import OpenApiTypes
from drf_spectacular.utils import (
    OpenApiParameter,
    OpenApiResponse,
    extend_schema,
    inline_serializer,
)
from rest_framework import serializers, status
from rest_framework.permissions import AllowAny
from rest_framework.response import Response
from rest_framework.views import APIView

from apps.core.exceptions import ServiceUnavailable

from .email import send_verification_email
from .models import User
from .serializers import RegistrationSerializer
from .tokens import issue_verification_token, live_verification_token

logger = logging.getLogger(__name__)

# One sentence for every branch, fresh or duplicate, delivered or not. The
# wording is deliberately about checking the inbox and not about a message just
# having been sent: on a verified, lapsed or spent duplicate nothing is sent at
# all, and on the retry after a 503 the retry is the first successful delivery
# rather than a second one (AR-26).
REGISTRATION_MESSAGE = 'Check your email for a verification link.'

# The 201 body, described for the schema: a view that neither declares a
# serializer_class nor accepts request.data has nothing for drf-spectacular to
# read, and the endpoint would be dropped from the documented API (AR-22).
REGISTRATION_RESPONSE = inline_serializer(
    name='RegistrationResponse', fields={'message': serializers.CharField()}
)

# Both failure modes, described for the same reason. A client generated from a
# document that names only the success cannot parse a rejection, and the two are
# not the same shape as each other: the 400 names the offending fields, the 503
# carries a `Retry-After`. Describing the envelope itself as a shared component
# belongs to the story that owns all seven statuses; naming it here is what
# keeps this endpoint's contract honest on its own.
ENVELOPE_RESPONSE = inline_serializer(
    name='RegistrationErrorResponse',
    fields={
        'type': serializers.CharField(),
        'title': serializers.CharField(),
        'status': serializers.IntegerField(),
        'detail': serializers.CharField(),
        'errors': serializers.DictField(),
    },
)

# The two rejections DRF raises before this view runs: the wrong method, and a
# content type the JSON-only parser will not take. They are not the project's
# envelope - `exceptions.py` states that a status outside the seven contract
# statuses keeps DRF's own body - but they are reachable on this endpoint, so
# the document names the shape a client actually receives rather than leaving
# it to discover a body the rest of the API never uses.
DRF_ERROR_RESPONSE = OpenApiResponse(
    response=inline_serializer(
        name='DrfErrorResponse', fields={'detail': serializers.CharField()}
    ),
    description="DRF's own body, which carries only `detail`.",
)

# Both failures are described through the same envelope component, and the 503
# additionally says what the client should do. `OpenApiResponse` has no headers
# argument, so the 503's `Retry-After` is declared the one way drf-spectacular
# can scope a response header: an `OpenApiParameter` carrying `response=[503]`.
# That list is a status filter in the emitted document, not a coupling - the
# header lands on the 503 and on no other response of this operation - and it
# is what a generated client reads to learn the header exists. The header is
# set on the real response too, and `SendFailureTests` pins the exact value.
SERVICE_UNAVAILABLE_RESPONSE = OpenApiResponse(
    response=ENVELOPE_RESPONSE,
    description=(
        'The verification email could not be sent. The account exists and is '
        'unverified; retrying the same request re-sends the same link. The '
        'response carries a Retry-After header with the seconds to wait.'
    ),
)

# The header the 503 promises, declared against that status code alone.
RETRY_AFTER_HEADER = OpenApiParameter(
    'Retry-After', OpenApiTypes.STR, OpenApiParameter.HEADER, response=[503]
)


class RegisterView(APIView):
    """Create an unverified account and send it a verification link."""

    authentication_classes = []
    permission_classes = [AllowAny]

    @extend_schema(
        request=RegistrationSerializer,
        responses={
            201: REGISTRATION_RESPONSE,
            400: ENVELOPE_RESPONSE,
            405: DRF_ERROR_RESPONSE,
            415: DRF_ERROR_RESPONSE,
            503: SERVICE_UNAVAILABLE_RESPONSE,
        },
        parameters=[RETRY_AFTER_HEADER],
    )
    def post(self, request):
        serializer = RegistrationSerializer(data=request.data)
        serializer.is_valid(raise_exception=True)

        user, is_duplicate = self._create_account(serializer.validated_data)
        if is_duplicate:
            self._resend_verification(user)
        else:
            self._send_verification(user)

        # One construction point, so the two bodies cannot drift apart.
        return Response(
            {'message': REGISTRATION_MESSAGE}, status=status.HTTP_201_CREATED
        )

    def _create_account(self, credentials):
        """Return the `(account, is_duplicate)` pair for these credentials.

        The `except` sits outside `atomic()` on purpose: catching inside would
        leave the connection with an aborted transaction and the duplicate
        path would fail on its next query.

        A duplicate is detected by the unique constraint rather than by a read,
        so two concurrent registrations of the same address cannot both win.
        The lookup after the failure is what hands back the account this
        request could not create, so the caller can decide about a re-send
        without paying for a second query of its own.
        """
        try:
            with transaction.atomic():
                user = User.objects.create_user(
                    email=credentials['email'],
                    password=credentials['password'],
                )
        except IntegrityError:
            return User.objects.get(email=credentials['email']), True
        return user, False

    def _send_verification(self, user):
        """Issue a token for the account just created and send its link."""
        token, _row = issue_verification_token(user)
        self._deliver(user, token)

    def _resend_verification(self, user):
        """Send the link the account already holds, when one is still usable.

        The 503 tells a client to try again, and that retry necessarily lands
        here, so this is where a failed send has to recover from: without it the
        account exists, is unverified and is unreachable, because no resend
        endpoint exists until 1.3 (AD-11).

        Nothing new is issued. A verified account, or one whose token has
        lapsed or been spent, gets no mail at all; reviving a lapsed token
        belongs to the resend endpoint 1.3 owns.
        """
        if user.is_email_verified:
            # Logged for the same reason as the branch below: a 201 with no mail
            # and no log line is indistinguishable from a delivery.
            logger.info(
                'Account %s is already verified, so no link was sent', user.pk
            )
            return
        token = live_verification_token(user)
        if token is None:
            # Not a fault - the account may be verified elsewhere, or its token
            # may have been spent. Logged anyway, because a 201 with no mail and
            # no log line is indistinguishable from a delivery, and this is the
            # state 1.3's resend endpoint has to be able to explain.
            logger.warning(
                'No live verification token for account %s, so no link was sent',
                user.pk,
            )
            return
        self._deliver(user, token)

    def _deliver(self, user, token):
        """Send `token`'s link, or report the send as retryable.

        The account is already committed, so a failure here costs the client
        the message and nothing else: it stays existing, unverified and
        re-sendable, which is what makes the retry above worth taking (AD-11).

        Only the transport failures `EmailMessage.send` documents are caught.
        A `UnicodeEncodeError` or a `BadHeaderError` is a defect in this code
        rather than a fault downstream, and answering it with "please try
        again" would send the client into a retry loop that cannot succeed.
        The pairing is deliberate: `SMTPException` is an `OSError` subclass, so
        the two names together say "the transport failed" and nothing broader.

        Inside that family the split is permanent against transient rather than
        one class against another, because permanence is what the client acts
        on. A relay that answers with a 5xx, or that refuses the recipient
        outright, will answer the same way next time, so those are logged and
        re-raised for the operator instead of being reported as a service the
        client should come back to. A 4xx (421, 450, 451) is a temporary
        condition and stays retryable, as does every transport failure that
        carries no reply at all.
        """
        try:
            send_verification_email(user, token)
        except (smtplib.SMTPException, OSError) as exc:
            if self._is_permanent(exc):
                logger.exception(
                    'Verification email could not be sent for account %s: the '
                    'relay refused it permanently, and a retry cannot succeed',
                    user.pk,
                )
                raise
            # The account id, not the address: the record the operator needs is
            # the account, and a client's address is not a log line.
            logger.exception(
                'Verification email could not be sent for account %s', user.pk
            )
            raise ServiceUnavailable()

    @staticmethod
    def _is_permanent(exc):
        """Whether the relay would answer `exc` the same way if we asked again.

        Two shapes. A 5xx from `SMTPResponseException` covers the bad
        credentials and the refused from-address that used to be named here one
        by one, along with a rejected recipient and a policy refusal.
        `SMTPRecipientsRefused` is the one permanent failure that carries no
        code of its own, because it holds a mapping of refused addresses to
        codes rather than a single reply.
        """
        if isinstance(exc, smtplib.SMTPRecipientsRefused):
            return True
        return (
            isinstance(exc, smtplib.SMTPResponseException) and exc.smtp_code >= 500
        )
