"""Rate limiting that can tell a customer from the storefront's own server.

In production every request reaches gunicorn from 127.0.0.1: either through
nginx, which always sets X-Forwarded-For to the visitor's address, or straight
from a process on the box — the Next.js storefront rendering catalogue pages,
or the deploy's readiness probe — which sets none.

DRF's stock AnonRateThrottle keys those internal calls on REMOTE_ADDR, so the
whole storefront would share a single anonymous budget of a few hundred
requests a day and start failing minutes after launch. Internal calls are not
customers and are exempt. The storefront forwards the customer's
X-Forwarded-For on checkout and tracking, so those stay throttled per customer.

The exemption is safe only because gunicorn listens on loopback alone and
nginx sets X-Forwarded-For on everything it proxies: nothing from outside can
arrive without one.
"""

from ipaddress import ip_address

from rest_framework import throttling


def is_internal_request(request) -> bool:
    """A loopback caller that did not come through nginx."""
    if request.META.get("HTTP_X_FORWARDED_FOR"):
        return False
    try:
        return ip_address(request.META.get("REMOTE_ADDR", "")).is_loopback
    except ValueError:
        return False


class AnonRateThrottle(throttling.AnonRateThrottle):
    def allow_request(self, request, view):
        if is_internal_request(request):
            return True
        return super().allow_request(request, view)
