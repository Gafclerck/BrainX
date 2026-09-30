"""The open registration endpoint, and the verification and account-state reads."""

import logging
import smtplib

from django.db import IntegrityError, transaction
from django.utils import timezone
from drf_spectacular.types import OpenApiTypes
from drf_spectacular.utils import (
    OpenApiParameter,
    OpenApiResponse,
    extend_schema,
    inline_serializer,
)
from rest_framework import serializers, status
from rest_framework.exceptions import ValidationError
from rest_framework.permissions import AllowAny, IsAuthenticated
from rest_framework.response import Response
from rest_framework.views import APIView
from rest_framework_simplejwt.tokens import RefreshToken

from apps.core.exceptions import ServiceUnavailable
from apps.core.permissions import IsVerifiedAccount

from .email import send_verification_email
from .models import TokenConsumption, User
from .serializers import (
    AccountStateSerializer,
    EmailVerificationSerializer,
    RegistrationSerializer,
)
from .tokens import (
    TokenRejected,
    consume_verification_token,
    issue_verification_token,
    live_verification_token,
)

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
# carries a `Retry-After`. Describing the envelope itself as a component shared
# by every operation belongs to the story that owns all seven statuses; naming
# it here is what keeps this endpoint's contract honest on its own.
#
# Named for the envelope rather than for registration, because the three
# operations in this module now share this one component. Which is the reason it
# is not spelled out three times: three descriptions of a 400 drift apart, and
# only one of them would be noticed when they did. The component is still local
# to this module rather than a shared schema entry, because none of the seven
# statuses has an owner yet to own it.
ENVELOPE_RESPONSE = inline_serializer(
    name='ErrorResponse',
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

# The pair verification hands back, described for the same reason as the 201
# above. Both fields are whole, and neither is the account: a client that can
# read one more field here is reading a field this endpoint has no business
# publishing.
VERIFICATION_RESPONSE = inline_serializer(
    name='EmailVerificationResponse',
    fields={
        'access': serializers.CharField(),
        'refresh': serializers.CharField(),
    },
)

# The one sentence a refused token gets, whatever the cause (AD-10). Written out
# rather than derived from the reason, so the body a client sees cannot carry
# the reason: an unknown, a replay, a forgery, a lapsed link, a token minted
# for another purpose and a token for a mismatched address are all this
# sentence and nothing else. The token and the address stay out of it too -
# neither is the client's to be reminded of, and a log line that named one
# would name it in every deployment's log aggregator.
TOKEN_REJECTED_MESSAGE = 'The token is not valid.'


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


class VerifyEmailView(APIView):
    """Accept an emailed verification token, and hand back a JWT pair.

    The credential is the link, not a JWT, so this is the one endpoint in the
    project a client may reach having proved nothing at all. Nothing about that
    makes it a weaker version of the others: the token names a row, the row names
    an account, and the token can be spent exactly once.
    """

    # Anonymous because the caller holds a link, and it is the only credential
    # there is at this point in the account's life - the pair this endpoint
    # returns does not exist yet. Authenticating here would also lock out the
    # case this endpoint exists for: a client carrying an expired pair in its
    # header while verifying the very account that pair was issued to.
    authentication_classes = []
    permission_classes = [AllowAny]

    @extend_schema(
        request=EmailVerificationSerializer,
        responses={
            200: VERIFICATION_RESPONSE,
            400: ENVELOPE_RESPONSE,
            405: DRF_ERROR_RESPONSE,
            415: DRF_ERROR_RESPONSE,
        },
    )
    def post(self, request):
        """Verify the account the token names, and return the pair it earns.

        The token is POSTed as a body field because the emailed link carries it
        in a URL fragment and the client reads it out of the page. A fragment
        never reaches the server, so a query parameter would be the only other
        way in, and a query string travels in `Referer` to every host the page
        links to - which, for a product that embeds third-party destinations, is
        every one of them (AD-10).

        Two exceptions land here and produce one answer. `TokenRejected` is
        every reason the token does not authorise: no such row, a bad signature,
        another purpose, a lapsed row, a spent one, an address that does not
        match. `IntegrityError` is the one that cannot be enumerated in advance
        - the unique constraint on `TokenConsumption.token`, which is the only
        constraint inside this transaction and is what two acceptances of one
        token actually collide on. Both are refused the same way, so there is
        one response for a client to be told about and nothing to compare.

        The `except` sits outside the `atomic()` the insert happens in, and
        catching inside would leave the connection holding an aborted
        transaction, which every later query on it would then fail.
        """
        serializer = EmailVerificationSerializer(data=request.data)
        serializer.is_valid(raise_exception=True)

        try:
            user, row = self._resolve(serializer.validated_data)
            tokens = self._spend(user, row)
        except (TokenRejected, IntegrityError):
            # The cause goes nowhere near the client. It is not logged either:
            # a rejected token is ordinary traffic rather than an anomaly - a
            # stale link, a second tab, a client that retried - and a log line
            # that named the reason would be one that could tell the causes
            # apart in the one place a client cannot read. `raise ... from None`
            # so the chained cause does not ride along in any traceback this
            # frame is ever printed in.
            raise ValidationError({'token': [TOKEN_REJECTED_MESSAGE]}) from None

        # The account id, never the address and never the token, for the reason
        # every other line in this module logs the same way.
        logger.info('Account %s verified its email address', user.pk)
        return Response(tokens, status=status.HTTP_200_OK)

    @staticmethod
    def _resolve(payload):
        """Return the `(account, row)` this payload authorises, or reject.

        The row resolves the account and nothing else does. A supplied `email`
        is compared with the account the row names and a mismatch is refused as
        though the token had never existed - comparing rather than resolving is
        what keeps one account's link from verifying another, and refusing it
        indistinguishably is what keeps the refusal from confirming which
        addresses hold live tokens.
        """
        user, row = consume_verification_token(payload['token'])
        claimed = payload.get('email')
        if claimed is not None and claimed != user.email:
            raise TokenRejected()
        return user, row

    @staticmethod
    def _spend(user, row):
        """Verify `user`, record the spend, and mint the pair - one transaction.

        The consumption row goes in first, while the account is still untouched.
        The constraint is what fails on a second acceptance, and inserting before
        the flag is flipped means that failure needs no compensating write: the
        rollback has nothing of ours to undo.

        `used_at` is stamped in the same transaction, so the column agrees with
        the consumption row instead of reporting a spent token as unspent -
        `live_verification_token` filters on `used_at IS NULL`, and a column that
        lies there is a query that answers wrongly later. The constraint stays
        the real guard: a sequential replay is now turned away one step earlier,
        by the `used_at IS NULL` pre-read inside `consume_verification_token`,
        and the `UNIQUE` failure is left to do the job it exists for, which is
        two acceptances racing each other where neither transaction can see the
        other's uncommitted insert.

        The pair is minted inside this transaction rather than after it. That is
        what makes a failure here recoverable: rolled back, the account is
        unverified and the token is unspent, so the client's own link is still
        good and a retry works. Minted outside, the same failure would leave an
        account that is verified, holding a spent token, with no pair - and since
        a verified account is sent no new link, that is the end of its access.

        `last_login` is not touched. It means "this account authenticated", and
        the settings that would update it belong to a sign-in endpoint, which
        does not exist; writing it here would record a login that never
        happened. Verification is not one - the client is not proving it knows
        the password.
        """
        with transaction.atomic():
            TokenConsumption.objects.create(token=row)
            row.used_at = timezone.now()
            row.save(update_fields=['used_at'])
            user.is_email_verified = True
            user.save(update_fields=['is_email_verified'])
            refresh = RefreshToken()
            refresh['user_id'] = str(user.pk)
            return {'access': str(refresh.access_token), 'refresh': str(refresh)}


class MeView(APIView):
    """The caller's own account state, read from the credential it arrived on.

    This is what a client calls immediately after verifying, which is why it
    carries `IsVerifiedAccount` alongside `IsAuthenticated`: a client that has a
    pair and finds itself refused here knows its verification did not take,
    rather than having to infer it from a later read failing for some other
    reason.
    """

    permission_classes = [IsAuthenticated, IsVerifiedAccount]

    @extend_schema(
        responses={
            200: AccountStateSerializer,
            401: ENVELOPE_RESPONSE,
            403: ENVELOPE_RESPONSE,
            405: DRF_ERROR_RESPONSE,
        },
    )
    def get(self, request):
        """Return the caller's address and whether it is verified.

        `request.user`, and no path segment, no query parameter and no body. A
        read that took an account id would need its own absent-versus-refused
        reasoning to avoid confirming which ids exist, and it would put an
        enumeration oracle on the one endpoint whose whole job is telling a
        client who it is. The authenticator has already resolved the caller
        from the credential, so there is nothing left for a caller to vary -
        which is also what makes the permission decision and the data provably
        the same fact: both come from the one token in the header.

        No privilege field, and not by an accident of the serializer: `me/`
        reports what state the account is in, never what it may do.
        """
        return Response(AccountStateSerializer(request.user).data)
