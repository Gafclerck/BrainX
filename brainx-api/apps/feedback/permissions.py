from rest_framework.permissions import BasePermission


class IsSuperAdminOrStaff(BasePermission):
    """Allows access only to authenticated superusers, staff members, or publishers."""

    def has_permission(self, request, view):
        user = request.user
        if not user or user.is_anonymous:
            return False
        return bool(user.is_superuser or user.is_staff or getattr(user, 'is_publisher', False))

    def has_object_permission(self, request, view, obj):
        return self.has_permission(request, view)
