#!/usr/bin/env python3
"""End-to-end smoke test against a running PakNutrition instance.

Walks the path that actually earns money — browse, add to cart, guest COD
checkout, look the order up — and checks the security properties that must hold
on a live system.

    python scripts/smoke_test.py                              # localhost:8000
    python scripts/smoke_test.py --base-url https://shop.example.com
    python scripts/smoke_test.py --read-only                  # no orders placed

Safe against production **with `--read-only`**. Without it, it places a real COD
order with an obviously-synthetic customer name, which staff will need to
cancel. CI runs the full version against a throwaway instance.

Exits non-zero on the first failure, naming what broke.
"""

from __future__ import annotations

import argparse
import json
import sys
import time
import urllib.error
import urllib.request
from urllib.parse import urljoin

SMOKE_MARKER = "SMOKE TEST — please cancel"


class SmokeFailure(Exception):
    pass


class _NoRedirect(urllib.request.HTTPRedirectHandler):
    """Report a redirect as the result instead of following it."""

    def redirect_request(self, req, fp, code, msg, headers, newurl):
        return None


class Client:
    def __init__(self, base_url: str, timeout: int = 20):
        self.base_url = base_url.rstrip("/") + "/"
        self.timeout = timeout

    def request(self, method: str, path: str, body=None, *, expect=(200, 201), follow_redirects=True):
        """Make a request.

        ``follow_redirects=False`` matters for the payment callbacks: they
        redirect to the storefront, which may not be running (or may be a
        different host entirely). Following would test the storefront rather
        than the thing under test.
        """
        url = urljoin(self.base_url, path.lstrip("/"))
        data = json.dumps(body).encode() if body is not None else None
        headers = {"Accept": "application/json", "User-Agent": "paknutrition-smoke/1"}
        if data:
            headers["Content-Type"] = "application/json"

        request = urllib.request.Request(url, data=data, headers=headers, method=method)
        opener = urllib.request.build_opener(_NoRedirect) if not follow_redirects else urllib.request.build_opener()
        try:
            with opener.open(request, timeout=self.timeout) as response:
                payload = response.read().decode()
                status = response.status
        except urllib.error.HTTPError as exc:
            payload = exc.read().decode(errors="ignore")
            status = exc.code
        except urllib.error.URLError as exc:
            raise SmokeFailure(f"{method} {url} — could not connect: {exc.reason}") from exc

        if expect and status not in expect:
            raise SmokeFailure(
                f"{method} {url} returned {status}, expected one of {expect}.\n  {payload[:400]}"
            )

        try:
            return status, json.loads(payload) if payload else None
        except json.JSONDecodeError:
            return status, payload


class Runner:
    def __init__(self):
        self.passed = 0
        self.failed = 0

    def check(self, description, fn):
        try:
            detail = fn()
        except SmokeFailure as exc:
            self.failed += 1
            print(f"  FAIL  {description}\n        {exc}")
            return None
        except Exception as exc:  # noqa: BLE001
            self.failed += 1
            print(f"  FAIL  {description}\n        unexpected {type(exc).__name__}: {exc}")
            return None

        self.passed += 1
        print(f"  ok    {description}" + (f" — {detail}" if isinstance(detail, str) else ""))
        return detail


def main() -> int:
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("--base-url", default="http://127.0.0.1:8000")
    parser.add_argument(
        "--read-only",
        action="store_true",
        help="Skip anything that writes. Use this against production.",
    )
    parser.add_argument("--timeout", type=int, default=20)
    args = parser.parse_args()

    client = Client(args.base_url, timeout=args.timeout)
    runner = Runner()

    print(f"Smoke test against {args.base_url}" + (" (read-only)" if args.read_only else ""))
    print()

    # -- the site is up and ready ----------------------------------------
    print("Health")

    def liveness():
        _, body = client.request("GET", "/healthz")
        if body.get("status") != "ok":
            raise SmokeFailure(f"unexpected body: {body}")
        return "process alive"

    runner.check("liveness responds", liveness)

    def readiness():
        status, body = client.request("GET", "/readyz", expect=(200, 503))
        if status != 200:
            broken = [n for n, c in body.get("checks", {}).items() if not c.get("ok")]
            raise SmokeFailure(f"not ready; failing checks: {', '.join(broken) or 'unknown'}")
        return "database, cache and migrations all ready"

    runner.check("readiness reports every dependency healthy", readiness)

    # -- catalogue --------------------------------------------------------
    print("\nCatalogue")

    state = {}

    def products():
        _, body = client.request("GET", "/api/products/")
        items = body.get("results", body) if isinstance(body, dict) else body
        if not items:
            raise SmokeFailure("no products returned — the storefront would be empty")
        in_stock = [p for p in items if p.get("is_in_stock") and p.get("is_active")]
        if not in_stock:
            raise SmokeFailure(f"{len(items)} products, none of them buyable")
        state["product"] = in_stock[0]
        return f"{len(items)} products, {len(in_stock)} buyable"

    runner.check("product list is served and has something to sell", products)

    def detail():
        product = state.get("product")
        if not product:
            raise SmokeFailure("skipped: no product from the previous check")
        _, body = client.request("GET", f"/api/products/{product['slug']}/")
        for field in ("name", "final_price", "is_in_stock"):
            if field not in body:
                raise SmokeFailure(f"product detail is missing {field!r}")
        return f"{body['name']} @ {body['final_price']}"

    runner.check("product detail page renders its pricing fields", detail)

    def payment_methods():
        _, body = client.request("GET", "/api/payment-methods/")
        codes = {m["code"] for m in body}
        if "COD" not in codes:
            raise SmokeFailure(f"cash on delivery is not offered; got {sorted(codes)}")
        return f"offered: {', '.join(sorted(codes))}"

    runner.check("cash on delivery is available", payment_methods)

    # -- the security properties that must hold live ----------------------
    print("\nPayment safety")

    def browser_return_cannot_settle():
        """The flaw this release removed: a browser claiming success."""
        status, _ = client.request(
            "GET",
            "/api/payments/safepay/return/"
            "?order_id=00000000-0000-0000-0000-000000000000"
            "&state=paid&status=success&signature=forged",
            expect=(200, 301, 302),
            follow_redirects=False,
        )
        return f"return endpoint answered {status} without settling anything"

    runner.check("a browser asserting 'paid' settles nothing", browser_return_cannot_settle)

    def unsigned_webhook_rejected():
        status, _ = client.request(
            "POST",
            "/api/payments/safepay/webhook/",
            body={"tracker": "smoke", "state": "paid", "amount": 1, "currency": "PKR"},
            expect=(400, 401, 403),
        )
        return f"rejected with {status}"

    runner.check("an unsigned webhook is rejected", unsigned_webhook_rejected)

    def admin_requires_auth():
        status, _ = client.request("GET", "/api/admin/orders/", expect=(401, 403))
        return f"anonymous access refused with {status}"

    runner.check("admin order list refuses anonymous callers", admin_requires_auth)

    # -- the purchase path ------------------------------------------------
    if args.read_only:
        print("\nCheckout — skipped (--read-only)")
    else:
        print("\nCheckout")

        def guest_cod_order():
            product = state.get("product")
            if not product:
                raise SmokeFailure("skipped: no product to buy")

            stamp = time.strftime("%Y%m%d-%H%M%S")
            _, order = client.request(
                "POST",
                "/api/orders/",
                body={
                    "payment_method": "COD",
                    "guest_name": f"{SMOKE_MARKER} {stamp}",
                    "guest_email": f"smoke-{stamp}@example.invalid",
                    "guest_phone_number": "03000000000",
                    "city": "Lahore",
                    "area": "Smoke Test Area",
                    "street": "Not a real address",
                    "items": [{"product_id": product["id"], "quantity": 1}],
                },
                expect=(201,),
            )
            state["order"] = order

            if order.get("payment_status") != "COD_PENDING":
                raise SmokeFailure(
                    f"a COD order was created with payment_status={order.get('payment_status')!r}. "
                    "Cash on delivery is not paid at checkout."
                )
            expected_total = float(order["subtotal_amount"]) - float(order["discount_amount"]) + float(order["shipping_fee"])
            if abs(float(order["total_amount"]) - expected_total) > 0.01:
                raise SmokeFailure(
                    f"total {order['total_amount']} does not equal "
                    f"subtotal - discount + shipping ({expected_total:.2f})"
                )
            return f"order #{order['id']}, total {order['total_amount']} PKR"

        runner.check("a guest can place a COD order, priced correctly", guest_cod_order)

        def order_lookup():
            order = state.get("order")
            if not order:
                raise SmokeFailure("skipped: no order was placed")
            _, found = client.request(
                "POST",
                "/api/orders/guest-lookup/",
                body={"order_id": order["id"], "phone_number": "03000000000"},
            )
            if found["id"] != order["id"]:
                raise SmokeFailure("lookup returned a different order")
            return f"order #{found['id']} is trackable by phone"

        runner.check("the customer can track the order they just placed", order_lookup)

        def lookup_rejects_wrong_details():
            order = state.get("order")
            if not order:
                raise SmokeFailure("skipped: no order was placed")
            client.request(
                "POST",
                "/api/orders/guest-lookup/",
                body={"order_id": order["id"], "phone_number": "03999999999"},
                expect=(404,),
            )
            return "a wrong phone number does not reveal the order"

        runner.check("order lookup refuses mismatched details", lookup_rejects_wrong_details)

    # -- result -----------------------------------------------------------
    print()
    total = runner.passed + runner.failed
    if runner.failed:
        print(f"SMOKE TEST FAILED — {runner.failed} of {total} checks failed.")
        if not args.read_only and state.get("order"):
            print(f"Note: order #{state['order']['id']} was created and needs cancelling.")
        return 1

    print(f"Smoke test passed — {runner.passed}/{total} checks.")
    if state.get("order"):
        print(
            f"Order #{state['order']['id']} was created by this run "
            f'(named "{SMOKE_MARKER}") and should be cancelled.'
        )
    return 0


if __name__ == "__main__":
    sys.exit(main())
