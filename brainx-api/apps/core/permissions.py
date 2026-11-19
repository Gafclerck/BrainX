"""The permission classes a view names in addition to being authenticated.

`IsAuthenticated` is the floor and never the ceiling: a view that needs more
than a valid credential names one of these above it. They are here rather than
in an app because they read account state and no app owns account state.

Each class answers one question about the caller and nothing about the
resource. `IsVerifiedAccount` is the read gate; `IsPublisher` is the write gate.
"""

from rest_framework.permissions import BasePermission


class IsVerifiedAccount(BasePermission):
    """Whether the authenticated caller has confirmed its own address.

    Orthogonal to `IsAuthenticated` on purpose, and listed alongside it:
    the two answer different questions, and DRF evaluates the classes in the
    order they are declared. A caller with no credential has not authenticated,
    and is not thereby unverified - that is `IsAuthenticated`'s 401. A caller
    with a valid credential whose address is unconfirmed is a different
    situation and gets a different answer, this class's 403.

    The split is DRF's to make, not this class's. Returning `False` rather than
    raising is what keeps it that way: `APIView.permission_denied` raises
    `NotAuthenticated` when no authenticator succeeded and `PermissionDenied`
    otherwise, so the 401 and the 403 fall out of the ordering the view
    declared. Raising here would make one class responsible for both, and a
    view that forgot `IsAuthenticated` would get a 403 for an anonymous caller
    where the answer is a 401.

    Nothing is queried. The flag was loaded with the account by the
    authenticator, and a queryset could not answer the question anyway: the
    caller's own account is not a set to be filtered.

    An anonymous request is refused rather than inspected, because the two are
    not the same thing and only one of them may be asked this question.
    `AnonymousUser` carries no `is_email_verified`, so the read is guarded
    rather than assumed: a class must not raise on a caller it was not written
    for, and `me/` is not the only view that will ever list this.
    """

    def has_permission(self, request, view):
        user = request.user
        if user is None or user.is_anonymous:
            return False
        return bool(getattr(user, 'is_email_verified', False))


class IsPublisher(BasePermission):
    """Whether the authenticated caller holds the Publisher privilege.

    Orthogonal to `IsAuthenticated` on purpose, matching `IsVerifiedAccount`:
    the two answer different questions, and DRF evaluates the classes in the
    order they are declared. A caller with no credential has not authenticated,
    and is not thereby not a publisher - that is `IsAuthenticated`'s 401. A
    caller with a valid credential who does not hold the publisher privilege
    is a different situation and gets a different answer, this class's 403.

    The split is DRF's to make, not this class's. Returning `False` rather than
    raising is what keeps it that way: `APIView.permission_denied` raises
    `NotAuthenticated` when no authenticator succeeded and `PermissionDenied`
    otherwise, so the 401 and the 403 fall out of the ordering the view
    declared. Raising here would make one class responsible for both, and a
    view that forgot `IsAuthenticated` would get a 403 for an anonymous caller
    where the answer is a 401.

    Nothing is queried. The flag was loaded with the account by the
    authenticator, and a queryset could not answer the question anyway: the
    caller's own account is not a set to be filtered.

    An anonymous request is refused rather than inspected, because the two are
    not the same thing and only one of them may be asked this question.
    `AnonymousUser` carries no `is_publisher`, so the read is guarded
    rather than assumed: a class must not raise on a caller it was not written
    for.

    This class answers one question about the caller's privileges and does not
    inspect HTTP methods (AD-9, AR-12): publisher-only read views require
    `IsPublisher`, while viewsets manage action-level permissions.
    `has_object_permission` delegates to `has_permission` to maintain
    consistent enforcement.
    """

    def has_permission(self, request, view):
        user = request.user
        if user is None or user.is_anonymous:
            return False
        return bool(getattr(user, 'is_publisher', False))

    def has_object_permission(self, request, view, obj):
        return self.has_permission(request, view)

