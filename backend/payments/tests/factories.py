"""Shared fixtures for payment tests."""

import hashlib
import hmac
import json
from decimal import Decimal

from django.conf import settings
from django.utils import timezone

from orders.models import PaymentSession
from payments.models import PKR, PaymentTransaction
from products.models import Category, Product

WEBHOOK_SECRET = "test-webhook-secret"


def make_product(*, name="Whey Gold Standard", price="12000.00", stock=10, slug=None):
    category, _ = Category.objects.get_or_create(
        slug="protein", defaults={"name": "Protein"}
    )
    return Product.objects.create(
        name=name,
        slug=slug or name.lower().replace(" ", "-"),
        category=category,
        brand="Optimum Nutrition",
        weight="2kg",
        description="Test product.",
        price=Decimal(price),
        stock=stock,
    )


def make_session(*, product, quantity=1, tracker="", total=None, status="PENDING"):
    """A pending online-checkout session with a priced item snapshot."""
    unit_price = Decimal(product.final_price)
    subtotal = unit_price * quantity
    shipping = Decimal("0.00") if subtotal > Decimal("5000.00") else Decimal("250.00")
    total_amount = Decimal(total) if total is not None else subtotal + shipping

    return PaymentSession.objects.create(
        guest_name="Test Customer",
        guest_email="customer@example.com",
        guest_phone_number="03001234567",
        subtotal_amount=subtotal,
        discount_amount=Decimal("0.00"),
        shipping_fee=shipping,
        total_amount=total_amount,
        shipping_address="Test Customer, 03001234567, 1 Main St, Gulberg, Lahore",
        items_snapshot=[
            {
                "product_id": product.id,
                "product_name": product.name,
                "quantity": quantity,
                "price": str(unit_price),
                "line_total": str(unit_price * quantity),
            }
        ],
        payment_method="SAFEPAY",
        provider="SAFEPAY",
        gateway_tracker=tracker,
        status=status,
        expires_at=timezone.now() + PaymentSession.PAYABLE_WINDOW,
    )


def make_transaction(session, *, tracker, reference="", status=PaymentTransaction.STATUS_INITIATED):
    """The expectation record written at initiation, before the customer pays."""
    return PaymentTransaction.objects.create(
        provider=PaymentTransaction.PROVIDER_SAFEPAY,
        provider_reference=reference or tracker,
        provider_tracker=tracker,
        session=session,
        expected_amount=session.total_amount,
        expected_currency=PKR,
        status=status,
    )


def webhook_body(
    *,
    tracker,
    amount,
    currency=PKR,
    state="paid",
    reference=None,
    event_id=None,
):
    """Build a provider callback body. Amounts are quoted in minor units."""
    payload = {
        "tracker": tracker,
        "state": state,
        "amount": int((Decimal(str(amount)) * 100).to_integral_value()),
        "currency": currency,
    }
    if reference is not None:
        payload["reference"] = reference
    if event_id is not None:
        payload["event_id"] = event_id
    return json.dumps(payload).encode("utf-8")


def sign(body: bytes, secret: str = WEBHOOK_SECRET) -> str:
    algorithm = str(
        getattr(settings, "SAFEPAY_WEBHOOK_SIGNATURE_ALGORITHM", "sha512")
    ).lower()
    digest = hashlib.sha512 if algorithm == "sha512" else hashlib.sha256
    return hmac.new(secret.encode("utf-8"), body, digest).hexdigest()
