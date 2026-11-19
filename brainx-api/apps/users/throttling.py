"""Throttles for the endpoints that drive email, keyed by destination (AD-17).

The four unauthenticated endpoints that drive email - registration, reset
request, and the two token acceptances - are bounded per destination address
rather than per caller: one attacker cannot mail one victim without limit
(Story 1.7 AC 2), and a school behind one NAT gateway never spends a shared
budget on itself (AC 3). Identity for the scope key is resolved server-side
from the request body or from the token's own row - never from the IP, never
from the authenticated user, never from a client-supplied header (AC 5).

The per-source backstop bounds what the destination key cannot see: a request
whose destination cannot be resolved (a garbage token) has no bucket to
charge, so it is the backstop that keeps those bursts finite.

Two accepted tradeoffs, both decided 2026-10-08 rather than mitigated:

- Destination budgets are spendable by anyone. About six cheap posts an hour
  to `register/` or `password-reset/`, including bodies that fail validation
  but carry a string `email`, hold a chosen address's bucket full and
  suppress that address's verification or reset mail for as long as the
  traffic is sustained. This is inherent to destination keying; the
  per-source alternative would fail AC 3.
- Throttle history lives in Django's default LocMemCache, because no `CACHES`
  setting exists. Counters are therefore per worker, and v1 deploys single
  process. The same cache is shared by every client behind the production
  proxy, so the backstop reads as one global ceiling for these endpoints
  rather than a per-client bound.
"""

from collections.abc import Mapping

from rest_framework.exceptions import ParseError, UnsupportedMediaType
from rest_framework.throttling import ScopedRateThrottle, SimpleRateThrottle

from .serializers import normalize_email
from .tokens import TokenRejected, _row_named_by


class DestinationRateThrottle(ScopedRateThrottle):
    """Charge the bucket of the address this request is about to affect.

    The bucket key is `scope:normalised email`, where the address comes from
    the body's `email` field on the endpoints that have one, and from the
    `AccountToken` row the body's token names on the token-acceptance
    endpoints - the view declares which by setting `throttle_token_salt`
    (Story 1.7 AC 2). The row is the only server-side resolver of a token's
    destination, so a body `email` claim is never trusted on those endpoints.

    A request whose destination cannot be resolved - a garbage token, a body
    that names no address - returns `None` from `get_cache_key` and is not
    charged here; `SourceRateThrottle` is what bounds it. That is also why a
    chosen address's budget is spendable by anyone: the resolver runs before
    the view validates, so an invalid body carrying a string `email` still
    charges the bucket (accepted tradeoff, see the module docstring).
    """

    def get_cache_key(self, request, view):
        destination = self._destination_email(request, view)
        if not destination:
            return None
        return self.cache_format % {'scope': self.scope, 'ident': destination}

    @staticmethod
    def _payload(request):
        # `check_throttles` runs this throttle before the backstop and has no
        # try/except, so a body the parser refuses must resolve to "no
        # destination" here rather than raise: a raise would skip both
        # charges, and a malformed burst would be charged nowhere. The view
        # re-reads the same body later and still answers its own 400.
        try:
            return request.data
        except (ParseError, UnsupportedMediaType):
            return {}

    def _destination_email(self, request, view):
        data = self._payload(request)
        if not isinstance(data, Mapping):
            return None

        salt = getattr(view, 'throttle_token_salt', None)
        if salt is not None:
            token = data.get('token')
            if not isinstance(token, str):
                return None
            # Stripped to mirror the view's `CharField`, which trims by
            # default: without this a padded token resolves to nothing here
            # while the view accepts it, and the sixth 429 becomes defeatable
            # with whitespace.
            token = token.strip()
            if not token:
                return None
            try:
                row = _row_named_by(token, salt=salt)
            except TokenRejected:
                # Wrong salt, bad signature, unknown row. A wrong salt fails
                # at the signature and costs no query; neither failure names a
                # destination, so neither has a bucket to charge.
                return None
            return normalize_email(row.user.email)

        email = data.get('email')
        if not isinstance(email, str):
            return None
        # Normalised by the same rule the account column is, so `Student@x`
        # and `  student@x` cannot draw two buckets for one mailbox.
        return normalize_email(email) or None


class SourceRateThrottle(SimpleRateThrottle):
    """A long-window backstop keyed by the caller's source address.

    `REMOTE_ADDR` only, never `X-Forwarded-For` or any client-supplied header
    (AC 5) - `BaseThrottle.get_ident` prefers the forwarded header, so it is
    deliberately not used here. Behind the production proxy every client
    shares one `REMOTE_ADDR`, which makes this a global daily ceiling for the
    four endpoints rather than a per-client bound (human decision
    2026-10-08), and lets a garbage-token stream spend the one bucket and 429
    legitimate traffic until the window rolls. Its load-bearing role is the
    token-acceptance endpoints, where a garbage token resolves to no
    destination. The history is in the per-process LocMemCache, so the
    ceiling multiplies by worker count.
    """

    scope = 'source'

    def get_cache_key(self, request, view):
        return self.cache_format % {
            'scope': self.scope,
            'ident': request.META.get('REMOTE_ADDR') or '',
        }
