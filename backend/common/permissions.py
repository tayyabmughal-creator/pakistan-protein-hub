"""DRF permissions backed by capabilities.

Backend enforcement is the authorisation. A hidden button in the admin is a
usability choice, not a permission — the API is what anyone with a browser and
the network tab can reach, so it is the API that has to refuse.
"""

from rest_framework import permissions


class HasCapability(permissions.BasePermission):
    """Require a capability, named on the view as ``required_capability``.

        class AdminOrderListView(ListAPIView):
            permission_classes = [HasCapability]
            required_capability = CAP_ORDER_VIEW

    A view with no ``required_capability`` denies everyone. Failing closed
    matters more than convenience here: forgetting to name a capability should
    make a screen unreachable, not make it public.
    """

    message = "Your account does not have permission to do that."

    def has_permission(self, request, view):
        user = request.user
        if not (user and user.is_authenticated):
            return False

        capability = getattr(view, "required_capability", None)
        if capability is None:
            return False

        # Safe methods may name a lighter capability, so that read access can be
        # granted without write access on the same view.
        if request.method in permissions.SAFE_METHODS:
            capability = getattr(view, "required_read_capability", capability)

        return user.has_capability(capability)


def capability_required(capability, *, read_capability=None):
    """Build a permission class for one capability, for use inline.

        permission_classes = [capability_required(CAP_INVENTORY_ADJUST)]
    """

    class _HasCapability(HasCapability):
        def has_permission(self, request, view):
            user = request.user
            if not (user and user.is_authenticated):
                return False
            needed = capability
            if request.method in permissions.SAFE_METHODS and read_capability:
                needed = read_capability
            return user.has_capability(needed)

    _HasCapability.__name__ = f"HasCapability_{capability.replace('.', '_')}"
    return _HasCapability
