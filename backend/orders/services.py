"""Checkout, pricing and order creation.

Two rules govern everything here:

* **The server prices the order, not the browser and not the cart.** Prices are
  read from the catalogue inside the checkout transaction, with the product rows
  locked. A cart's stored price is a display hint with no authority.
* **Provider integration does not live in this module.** Settlement policy and
  the Safepay adapter are in the ``payments`` app. ``orders`` never decides that
  money arrived.
"""

import logging
import uuid
from decimal import Decimal, ROUND_HALF_UP

from django.conf import settings
from django.core.exceptions import ValidationError
from django.db import models, transaction
from django.db.models import F
from django.utils import timezone

from cart.models import Cart
from common.dispatch import enqueue
from inventory import services as inventory_services
from products.models import Product
from products.services import StockService
from promotions.models import Promotion
from users.models import Address

from .models import (
    Order,
    OrderHistory,
    OrderItem,
    PaymentSession,
    ReturnItem,
    ReturnRequest,
)
from .notifications import (
    send_admin_new_order_push,
    send_admin_payment_review_push,
    send_order_notifications,
)

logger = logging.getLogger(__name__)


def _to_money(value):
    return Decimal(value).quantize(Decimal("0.01"), rounding=ROUND_HALF_UP)


FREE_SHIPPING_THRESHOLD = Decimal("5000.00")
STANDARD_SHIPPING_FEE = Decimal("250.00")


def _shipping_fee_for_subtotal(subtotal):
    subtotal = _to_money(subtotal)
    return Decimal("0.00") if subtotal > FREE_SHIPPING_THRESHOLD else STANDARD_SHIPPING_FEE


def _notify_new_order(order):
    """Queue the order notifications. Never let them fail the order.

    One task per channel, so a dead SMTP server does not also cost the customer
    their SMS or the shop its push. These used to run inline: an SMTP handshake,
    a Twilio call and an Expo call, each with a 10 second timeout, all inside the
    request that placed the order.
    """
    from .tasks import (
        send_admin_new_order_push_task,
        send_order_confirmation_email_task,
        send_order_confirmation_sms_task,
    )

    for task in (
        send_order_confirmation_email_task,
        send_order_confirmation_sms_task,
        send_admin_new_order_push_task,
    ):
        enqueue(task, order.id)


class PromotionService:
    @staticmethod
    def get_valid_promotion(code):
        normalized = (code or "").strip().upper()
        if not normalized:
            return None
        try:
            promotion = Promotion.objects.get(code=normalized)
        except Promotion.DoesNotExist as exc:
            raise ValidationError("Invalid promo code") from exc
        if not promotion.is_valid():
            raise ValidationError("Promo code is not active")
        return promotion

    @staticmethod
    def calculate_discount(subtotal, promotion):
        if not promotion:
            return Decimal("0.00")
        discount = (Decimal(subtotal) * Decimal(promotion.discount_percentage) / Decimal("100")).quantize(
            Decimal("0.01"),
            rounding=ROUND_HALF_UP,
        )
        return discount

    @staticmethod
    def consume_redemption(promotion):
        """Claim one use of a promotion, safely under concurrency.

        The previous version read ``used_count`` into Python and wrote back
        ``used_count + 1``, so simultaneous redemptions overwrote each other and
        a coupon could exceed its ``usage_limit``. This increments in the
        database and only where a use is still available, then checks whether a
        row actually matched — the losing request gets a clean error instead of
        a silently over-redeemed coupon.
        """
        claimed = Promotion.objects.filter(
            id=promotion.id,
            used_count__lt=F("usage_limit"),
        ).update(used_count=F("used_count") + 1)

        if not claimed:
            raise ValidationError("This promo code has reached its usage limit.")

        # Keep the in-memory instance consistent for anything downstream.
        promotion.used_count += 1
        return promotion


class CheckoutPreparationService:
    """Turns a basket into a priced, validated checkout snapshot.

    Every price here is read from the catalogue at checkout time. A cart's
    ``price_snapshot`` is never used as the sale price: it was written when the
    item was added, so honouring it meant a basket left open across a price rise
    checked out at the old price, and the guest and registered paths disagreed
    about what an item cost.
    """

    @staticmethod
    def _get_cart_items(user):
        try:
            cart = Cart.objects.get(user=user)
        except Cart.DoesNotExist as exc:
            raise ValidationError("Cart is empty") from exc
        cart_items = list(cart.items.select_related("product").all())
        if not cart_items:
            raise ValidationError("Cart is empty")
        return cart, cart_items

    @staticmethod
    def _get_registered_address(user, address_id):
        try:
            return Address.objects.get(id=address_id, user=user)
        except Address.DoesNotExist as exc:
            raise ValidationError("Invalid address ID") from exc

    @staticmethod
    def _load_priced_products(product_ids, *, lock=False):
        """Fetch current catalogue rows, optionally locked for the transaction.

        ``lock=True`` is used inside the checkout transaction so the price and
        stock that get validated are the same rows that then get decremented.
        """
        queryset = Product.objects.filter(id__in=product_ids)
        if lock:
            # Deterministic lock order avoids deadlocks between concurrent
            # checkouts that share products.
            queryset = queryset.select_for_update().order_by("id")
        return {product.id: product for product in queryset}

    @classmethod
    def _price_lines(cls, requested, *, lock=False):
        """Price and validate each line against the live catalogue.

        ``requested`` is a list of ``(product_id, quantity)``. Returns
        ``(normalized_items, subtotal)``.
        """
        product_ids = [product_id for product_id, _ in requested]
        products = cls._load_priced_products(product_ids, lock=lock)

        normalized_items = []
        subtotal = Decimal("0.00")

        for product_id, quantity in requested:
            product = products.get(product_id)
            if product is None:
                raise ValidationError("A product in your cart is no longer available.")
            if not product.is_active:
                raise ValidationError(f"{product.name} is no longer available.")
            if quantity < 1:
                raise ValidationError(f"Invalid quantity for {product.name}.")
            if product.stock < quantity:
                raise ValidationError(
                    f"Only {product.stock} left of {product.name}. Please update your cart."
                )

            price = _to_money(product.final_price)
            line_total = _to_money(price * quantity)
            subtotal += line_total
            normalized_items.append(
                {
                    "product_id": product.id,
                    "product_name": product.name,
                    "quantity": quantity,
                    "price": str(price),
                    "line_total": str(line_total),
                }
            )

        return normalized_items, _to_money(subtotal)

    @staticmethod
    def _totals(subtotal, promotion):
        discount = PromotionService.calculate_discount(subtotal, promotion)
        shipping_fee = _shipping_fee_for_subtotal(subtotal)
        return {
            "promotion": promotion,
            "applied_promo_code": promotion.code if promotion else "",
            "subtotal_amount": _to_money(subtotal),
            "discount_amount": _to_money(discount),
            "shipping_fee": _to_money(shipping_fee),
            "total_amount": _to_money(subtotal - discount + shipping_fee),
        }

    @classmethod
    def prepare_registered_checkout(cls, *, user, address_id, promo_code="", lock=False):
        cart, cart_items = cls._get_cart_items(user)
        address = cls._get_registered_address(user, address_id)

        shipping_address = f"{address.full_name}, {address.phone_number}, {address.street}, {address.area}, {address.city}"
        requested = [(item.product_id, item.quantity) for item in cart_items]
        normalized_items, subtotal = cls._price_lines(requested, lock=lock)

        promotion = PromotionService.get_valid_promotion(promo_code) if promo_code else None

        return {
            "user": user,
            "cart": cart,
            "guest_name": "",
            "guest_email": "",
            "guest_phone_number": "",
            "shipping_address": shipping_address,
            "items_snapshot": normalized_items,
            **cls._totals(subtotal, promotion),
        }

    @classmethod
    def prepare_guest_checkout(
        cls,
        *,
        guest_name,
        guest_email,
        guest_phone_number,
        city,
        area,
        street,
        items,
        promo_code="",
        lock=False,
    ):
        if not items:
            raise ValidationError("Cart is empty")

        shipping_address = f"{guest_name}, {guest_phone_number}, {street}, {area}, {city}"
        requested = [(item["product"].id, item["quantity"]) for item in items]
        normalized_items, subtotal = cls._price_lines(requested, lock=lock)

        promotion = PromotionService.get_valid_promotion(promo_code) if promo_code else None

        return {
            "user": None,
            "cart": None,
            "guest_name": guest_name,
            "guest_email": guest_email,
            "guest_phone_number": guest_phone_number,
            "shipping_address": shipping_address,
            "items_snapshot": normalized_items,
            **cls._totals(subtotal, promotion),
        }


class PaymentMethodService:
    MANUAL_METHODS = {"EASYPAISA", "JAZZCASH", "BANK_TRANSFER"}

    @staticmethod
    def is_manual_method(code):
        return code in PaymentMethodService.MANUAL_METHODS

    @staticmethod
    def _manual_details():
        bank_label = "Bank transfer"
        if settings.BANK_NAME and settings.BANK_ACCOUNT_TITLE and settings.BANK_ACCOUNT_NUMBER:
            bank_label = f"{settings.BANK_NAME} • {settings.BANK_ACCOUNT_TITLE} • {settings.BANK_ACCOUNT_NUMBER}"
        elif settings.BANK_NAME and settings.BANK_ACCOUNT_NUMBER:
            bank_label = f"{settings.BANK_NAME} • {settings.BANK_ACCOUNT_NUMBER}"

        return {
            "EASYPAISA": [
                f"Easypaisa account: {settings.EASYPAISA_ACCOUNT or 'Set EASYPAISA_ACCOUNT in env to show your merchant number.'}",
                settings.MANUAL_PAYMENT_NOTE,
            ],
            "JAZZCASH": [
                f"JazzCash account: {settings.JAZZCASH_ACCOUNT or 'Set JAZZCASH_ACCOUNT in env to show your merchant number.'}",
                settings.MANUAL_PAYMENT_NOTE,
            ],
            "BANK_TRANSFER": [
                bank_label,
                settings.MANUAL_PAYMENT_NOTE,
            ],
        }

    @staticmethod
    def get_available_methods():
        methods = [
            {
                "code": "COD",
                "label": "Cash on Delivery",
                "description": "Pay when your parcel arrives.",
                "provider": "",
                "is_online": False,
                "requires_reference": False,
                "reference_label": "",
                "details": ["Pay cash to the rider after checking your parcel."],
            }
        ]
        manual_details = PaymentMethodService._manual_details()
        methods.extend(
            [
                {
                    "code": "EASYPAISA",
                    "label": "Easypaisa Transfer",
                    "description": "Pay from your Easypaisa wallet and share the transfer reference.",
                    "provider": "MANUAL",
                    "is_online": False,
                    "requires_reference": True,
                    "reference_label": "Easypaisa transaction reference",
                    "details": manual_details["EASYPAISA"],
                },
                {
                    "code": "JAZZCASH",
                    "label": "JazzCash Transfer",
                    "description": "Pay from your JazzCash wallet and share the transfer reference.",
                    "provider": "MANUAL",
                    "is_online": False,
                    "requires_reference": True,
                    "reference_label": "JazzCash transaction reference",
                    "details": manual_details["JAZZCASH"],
                },
                {
                    "code": "BANK_TRANSFER",
                    "label": "Bank Transfer",
                    "description": "Transfer to the PakNutrition bank account and enter the transfer reference.",
                    "provider": "MANUAL",
                    "is_online": False,
                    "requires_reference": True,
                    "reference_label": "Bank transfer reference",
                    "details": manual_details["BANK_TRANSFER"],
                },
            ]
        )
        if getattr(settings, "SAFEPAY_ENABLED", False) and getattr(settings, "SAFEPAY_API_KEY", ""):
            methods.append(
                {
                    "code": "SAFEPAY",
                    "label": "Cards, Wallets & Bank Transfer",
                    "description": "Pay online with Pakistani cards and supported digital payment methods via Safepay.",
                    "provider": "SAFEPAY",
                    "is_online": True,
                    "requires_reference": False,
                    "reference_label": "",
                    "details": [
                        "Hosted secure checkout for cards and supported local digital payment methods.",
                    ],
                }
            )
        return methods


class OrderService:
    @staticmethod
    def preview_discount(*, user=None, items=None, promo_code=""):
        """Quote a promo code. Indicative only — checkout reprices from scratch."""
        promotion = PromotionService.get_valid_promotion(promo_code)
        if user:
            _, cart_items = CheckoutPreparationService._get_cart_items(user)
            requested = [(item.product_id, item.quantity) for item in cart_items]
        else:
            if not items:
                raise ValidationError("Cart is empty")
            requested = [(item["product"].id, item["quantity"]) for item in items]

        # Priced from the live catalogue, exactly as checkout will price it, so
        # the quote the customer sees matches what they are charged.
        _, subtotal = CheckoutPreparationService._price_lines(requested)

        discount = PromotionService.calculate_discount(subtotal, promotion)
        shipping_fee = _shipping_fee_for_subtotal(subtotal)
        total = _to_money(subtotal - discount + shipping_fee)
        return {
            "code": promotion.code,
            "discount_percentage": promotion.discount_percentage,
            "subtotal_amount": subtotal,
            "discount_amount": discount,
            "shipping_fee": shipping_fee,
            "total_amount": total,
        }

    @classmethod
    def _create_order_from_snapshot(
        cls,
        *,
        checkout_data,
        payment_method,
        payment_status,
        payment_provider="",
        payment_reference="",
        payment_tracker="",
        payment_payload=None,
        paid_at=None,
        order_status="PENDING",
        clear_cart=False,
        fulfilment_status=None,
        sales_channel=Order.CHANNEL_ONLINE,
        reservation_reference=None,
    ):
        with transaction.atomic():
            # Cash on delivery is money owed, not money received. Saying
            # PENDING for both a prepaid order awaiting a webhook and a COD
            # parcel awaiting a rider is what let unpaid parcels be counted as
            # revenue.
            if payment_method == "COD" and payment_status == "PENDING":
                payment_status = Order.PAYMENT_COD_PENDING

            if fulfilment_status is None:
                fulfilment_status = (
                    Order.FULFILMENT_CONFIRMED
                    if order_status == "CONFIRMED"
                    else Order.FULFILMENT_PENDING_CONFIRMATION
                )

            order = Order.objects.create(
                user=checkout_data["user"],
                guest_name=checkout_data["guest_name"],
                guest_email=checkout_data["guest_email"],
                guest_phone_number=checkout_data["guest_phone_number"],
                promotion=checkout_data["promotion"],
                applied_promo_code=checkout_data["applied_promo_code"],
                subtotal_amount=checkout_data["subtotal_amount"],
                discount_amount=checkout_data["discount_amount"],
                shipping_fee=checkout_data["shipping_fee"],
                total_amount=checkout_data["total_amount"],
                shipping_address=checkout_data["shipping_address"],
                payment_method=payment_method,
                payment_provider=payment_provider,
                payment_reference=payment_reference,
                payment_tracker=payment_tracker,
                payment_payload=payment_payload or {},
                payment_status=payment_status,
                paid_at=paid_at,
                fulfilment_status=fulfilment_status,
                sales_channel=sales_channel,
                confirmed_at=timezone.now() if fulfilment_status == Order.FULFILMENT_CONFIRMED else None,
                status=order_status,
            )

            for item in checkout_data["items_snapshot"]:
                product = None
                variant = None
                product_id = item.get("product_id")
                if product_id:
                    product = (
                        Product.objects.filter(id=product_id)
                        .select_related("brand_ref")
                        .prefetch_related("variants")
                        .first()
                    )
                    variant = product.default_variant if product else None

                    # Stock already held by a reservation is committed by the
                    # caller, not sold again here.
                    if reservation_reference is None:
                        StockService.deduct_stock(
                            product_id, item["quantity"], reference=f"order:{order.id}", order=order
                        )

                unit_price = _to_money(item["price"])
                quantity = item["quantity"]

                # Snapshot everything the receipt needs. Reading it back through
                # the foreign keys would let a later rename or reprice silently
                # rewrite what this order says was bought.
                OrderItem.objects.create(
                    order=order,
                    product=product,
                    variant=variant,
                    product_name=item["product_name"],
                    sku=variant.sku if variant else "",
                    variant_description=(variant.descriptor if variant else "")[:160],
                    brand_name=(
                        product.brand_ref.name if product and product.brand_ref_id
                        else (product.brand if product else "")
                    )[:120],
                    quantity=quantity,
                    price=unit_price,
                    compare_at_price=(
                        variant.compare_at_price
                        if variant and variant.has_genuine_discount
                        else None
                    ),
                    line_total=_to_money(unit_price * quantity),
                )

            if reservation_reference is not None:
                # Convert the held stock into a sale, now that there is an order
                # to attribute it to.
                committed = inventory_services.commit(
                    reference=reservation_reference, order=order
                )

                if not committed:
                    # The hold is gone — it expired while the customer was at
                    # the bank's page, or staff approved a held payment days
                    # later. The sale still happened, so the goods must still
                    # leave inventory. Without this the order ships stock that
                    # was never drawn down and the shop oversells it again.
                    logger.warning(
                        "No active reservation at settlement; deducting directly",
                        extra={"order_id": order.id, "reference": reservation_reference},
                    )
                    for item in order.items.select_related("variant"):
                        if item.variant_id is None:
                            continue
                        StockService.deduct_stock(
                            item.product_id,
                            item.quantity,
                            reference=f"order:{order.id}",
                            order=order,
                        )

                # Refresh the legacy Product.stock column the current storefront
                # still reads. The non-reserved path does this inside
                # StockService.deduct_stock; this path has to do it explicitly.
                from products.services import sync_variant_products

                sync_variant_products(
                    [item.variant for item in order.items.select_related("variant") if item.variant_id]
                )

            order.inventory_committed = True
            order.save(update_fields=["inventory_committed"])

            promotion = checkout_data["promotion"]
            if promotion:
                PromotionService.consume_redemption(promotion)

            if clear_cart and checkout_data["user"]:
                cart = Cart.objects.filter(user=checkout_data["user"]).first()
                if cart:
                    cart.updated_at = timezone.now()
                    cart.save(update_fields=["updated_at"])
                    cart.items.all().delete()

            # Notifications reach out over the network — email, Expo push. Doing
            # that inside the transaction held row locks open for the duration
            # of an SMTP handshake. on_commit also means a rolled-back checkout
            # can no longer send a confirmation for an order that does not exist.
            transaction.on_commit(lambda: _notify_new_order(order))

        return order

    @classmethod
    def create_order(
        cls,
        user,
        address_id,
        payment_method="COD",
        promo_code="",
        payment_reference="",
        payment_note="",
    ):
        payment_provider = "MANUAL" if PaymentMethodService.is_manual_method(payment_method) else ""
        payment_payload = {"note": payment_note} if payment_note else {}
        with transaction.atomic():
            # Priced with the product rows locked, so the prices validated here
            # are the ones the stock decrement below applies to.
            checkout_data = CheckoutPreparationService.prepare_registered_checkout(
                user=user,
                address_id=address_id,
                promo_code=promo_code,
                lock=True,
            )
            return cls._create_order_from_snapshot(
                checkout_data=checkout_data,
                payment_method=payment_method,
                payment_status="PENDING",
                payment_provider=payment_provider,
                payment_reference=payment_reference,
                payment_payload=payment_payload,
                clear_cart=True,
            )

    @classmethod
    def create_guest_order(
        cls,
        *,
        guest_name,
        guest_email,
        guest_phone_number,
        city,
        area,
        street,
        items,
        payment_method="COD",
        promo_code="",
        payment_reference="",
        payment_note="",
    ):
        payment_provider = "MANUAL" if PaymentMethodService.is_manual_method(payment_method) else ""
        payment_payload = {"note": payment_note} if payment_note else {}
        with transaction.atomic():
            checkout_data = CheckoutPreparationService.prepare_guest_checkout(
                guest_name=guest_name,
                guest_email=guest_email,
                guest_phone_number=guest_phone_number,
                city=city,
                area=area,
                street=street,
                items=items,
                promo_code=promo_code,
                lock=True,
            )
            return cls._create_order_from_snapshot(
                checkout_data=checkout_data,
                payment_method=payment_method,
                payment_status="PENDING",
                payment_provider=payment_provider,
                payment_reference=payment_reference,
                payment_payload=payment_payload,
                clear_cart=False,
            )

    @classmethod
    def create_paid_order_from_session(cls, session, gateway_data):
        checkout_data = {
            "user": session.user,
            "guest_name": session.guest_name,
            "guest_email": session.guest_email,
            "guest_phone_number": session.guest_phone_number,
            "promotion": session.promotion,
            "applied_promo_code": session.applied_promo_code,
            "subtotal_amount": session.subtotal_amount,
            "discount_amount": session.discount_amount,
            "shipping_fee": session.shipping_fee,
            "total_amount": session.total_amount,
            "shipping_address": session.shipping_address,
            "items_snapshot": session.items_snapshot,
        }
        return cls._create_order_from_snapshot(
            checkout_data=checkout_data,
            payment_method=session.payment_method,
            payment_status="PAID",
            # The stock was reserved when the session was created. Commit that
            # hold rather than deducting again, which would sell it twice.
            reservation_reference=PaymentSessionService.reservation_reference(session),
            payment_provider=session.provider,
            payment_reference=gateway_data.get("reference", ""),
            payment_tracker=gateway_data.get("tracker", ""),
            payment_payload=gateway_data.get("payload", {}),
            paid_at=timezone.now(),
            order_status="CONFIRMED",
            clear_cart=bool(session.user_id),
        )


class OrderTransitionService:
    """The only supported way for staff to move an order.

    Two independent lifecycles, because payment and fulfilment are independent
    facts. A COD parcel ships unpaid; a prepaid order sits paid and unpacked.
    A single status cannot describe either.

    Every transition records who did it and why, and its stock consequence is
    explicit rather than a side effect of setting a field.
    """

    #: Fulfilment transitions. Deliberately restrictive: the way to a state that
    #: is not reachable is to go through the states in between, so the history
    #: reflects what actually happened.
    FULFILMENT_TRANSITIONS = {
        Order.FULFILMENT_PENDING_CONFIRMATION: {
            Order.FULFILMENT_CONFIRMED,
            Order.FULFILMENT_CANCELLED,
        },
        Order.FULFILMENT_CONFIRMED: {
            Order.FULFILMENT_READY_TO_PACK,
            Order.FULFILMENT_PACKED,
            Order.FULFILMENT_CANCELLED,
        },
        Order.FULFILMENT_READY_TO_PACK: {
            Order.FULFILMENT_PACKED,
            Order.FULFILMENT_CANCELLED,
        },
        Order.FULFILMENT_PACKED: {
            Order.FULFILMENT_SHIPPED,
            Order.FULFILMENT_READY_FOR_PICKUP,
            Order.FULFILMENT_CANCELLED,
        },
        Order.FULFILMENT_READY_FOR_PICKUP: {
            Order.FULFILMENT_DELIVERED,
            Order.FULFILMENT_CANCELLED,
        },
        Order.FULFILMENT_SHIPPED: {
            Order.FULFILMENT_DELIVERED,
            Order.FULFILMENT_RETURNED,
        },
        Order.FULFILMENT_DELIVERED: {Order.FULFILMENT_RETURNED},
        Order.FULFILMENT_CANCELLED: set(),
        Order.FULFILMENT_RETURNED: set(),
    }

    #: Which fulfilment state sets which timestamp.
    TIMESTAMP_FIELDS = {
        Order.FULFILMENT_CONFIRMED: "confirmed_at",
        Order.FULFILMENT_PACKED: "packed_at",
        Order.FULFILMENT_SHIPPED: "shipped_at",
        Order.FULFILMENT_DELIVERED: "delivered_at",
        Order.FULFILMENT_CANCELLED: "cancelled_at",
    }

    #: What the legacy combined `status` should read, so the SPA and the Expo
    #: admin keep working while they still consume it.
    LEGACY_STATUS = {
        Order.FULFILMENT_PENDING_CONFIRMATION: "PENDING",
        Order.FULFILMENT_CONFIRMED: "CONFIRMED",
        Order.FULFILMENT_READY_TO_PACK: "CONFIRMED",
        Order.FULFILMENT_PACKED: "CONFIRMED",
        Order.FULFILMENT_READY_FOR_PICKUP: "CONFIRMED",
        Order.FULFILMENT_SHIPPED: "SHIPPED",
        Order.FULFILMENT_DELIVERED: "DELIVERED",
        Order.FULFILMENT_CANCELLED: "CANCELLED",
        Order.FULFILMENT_RETURNED: "DELIVERED",
    }

    # -- legacy shim -------------------------------------------------------

    ALLOWED_TRANSITIONS = {
        "PENDING": {"CONFIRMED", "CANCELLED"},
        "CONFIRMED": {"SHIPPED", "CANCELLED"},
        "SHIPPED": {"DELIVERED"},
        "DELIVERED": set(),
        "CANCELLED": set(),
    }
    RESTOCK_ON = {"CANCELLED"}

    #: Legacy combined status -> the fulfilment state it now means.
    _LEGACY_TO_FULFILMENT = {
        "PENDING": Order.FULFILMENT_PENDING_CONFIRMATION,
        "CONFIRMED": Order.FULFILMENT_CONFIRMED,
        "SHIPPED": Order.FULFILMENT_SHIPPED,
        "DELIVERED": Order.FULFILMENT_DELIVERED,
        "CANCELLED": Order.FULFILMENT_CANCELLED,
    }

    @classmethod
    def can_transition(cls, from_status, to_status):
        return to_status in cls.ALLOWED_TRANSITIONS.get(from_status, set())

    @classmethod
    def transition(cls, *, order_id, to_status, actor=None, reason=""):
        """Move an order using the legacy combined vocabulary.

        Kept so the current admin keeps working. Translates to the real
        fulfilment lifecycle rather than duplicating its rules.
        """
        if to_status not in cls._LEGACY_TO_FULFILMENT:
            raise ValidationError(f"{to_status} is not a valid order status.")
        return cls.transition_fulfilment(
            order_id=order_id,
            to_status=cls._LEGACY_TO_FULFILMENT[to_status],
            actor=actor,
            reason=reason,
        )

    # -- fulfilment --------------------------------------------------------

    @classmethod
    def transition_fulfilment(
        cls, *, order_id, to_status, actor=None, reason="", courier_name="", tracking_number=""
    ):
        valid = dict(Order.FULFILMENT_STATUS_CHOICES)
        if to_status not in valid:
            raise ValidationError(f"{to_status} is not a valid fulfilment status.")

        with transaction.atomic():
            order = Order.objects.select_for_update().get(pk=order_id)
            previous = order.fulfilment_status

            if previous == to_status:
                return order

            allowed = cls.FULFILMENT_TRANSITIONS.get(previous, set())
            if to_status not in allowed:
                readable = ", ".join(sorted(valid[s] for s in allowed)) or "nothing"
                raise ValidationError(
                    f"An order that is {valid[previous]} can only move to: {readable}."
                )

            if to_status == Order.FULFILMENT_CANCELLED:
                cls._cancel(order, actor=actor, reason=reason)

            order.fulfilment_status = to_status
            fields = ["fulfilment_status", "updated_at"]

            timestamp_field = cls.TIMESTAMP_FIELDS.get(to_status)
            if timestamp_field and getattr(order, timestamp_field) is None:
                setattr(order, timestamp_field, timezone.now())
                fields.append(timestamp_field)

            if courier_name:
                order.courier_name = courier_name
                fields.append("courier_name")
            if tracking_number:
                order.tracking_number = tracking_number
                fields.append("tracking_number")

            # Cash arrives when the rider hands the parcel over. This is the
            # moment a COD sale becomes revenue.
            if (
                to_status == Order.FULFILMENT_DELIVERED
                and order.payment_method == "COD"
                and order.payment_status == Order.PAYMENT_COD_PENDING
            ):
                order.payment_status = Order.PAYMENT_PAID
                order.paid_at = timezone.now()
                fields += ["payment_status", "paid_at"]
                cls._record(
                    order,
                    kind=OrderHistory.KIND_PAYMENT,
                    from_status=Order.PAYMENT_COD_PENDING,
                    to_status=Order.PAYMENT_PAID,
                    actor=actor,
                    note="Cash collected on delivery.",
                )

            legacy = cls.LEGACY_STATUS.get(to_status)
            if legacy and order.status != legacy:
                order.status = legacy
                fields.append("status")

            order.save(update_fields=fields)

            cls._record(
                order,
                kind=OrderHistory.KIND_FULFILMENT,
                from_status=previous,
                to_status=to_status,
                actor=actor,
                note=reason,
                is_customer_visible=True,
            )

            logger.info(
                "Order fulfilment moved",
                extra={
                    "order_id": order.id,
                    "from_status": previous,
                    "to_status": to_status,
                    "actor": getattr(actor, "email", "system"),
                },
            )
            return order

    @classmethod
    def _cancel(cls, order, *, actor=None, reason=""):
        """Undo a cancelled order's claim on stock, exactly once."""
        if order.payment_status == Order.PAYMENT_PAID:
            raise ValidationError(
                "This order is paid. Refund it before cancelling, so the money and "
                "the stock are not resolved separately."
            )

        reference = f"order:{order.id}"

        if order.inventory_committed:
            # The goods already left inventory, so put them back.
            for item in order.items.select_related("variant"):
                if item.variant_id is None:
                    continue
                inventory_services.restock_cancelled(
                    variant=item.variant,
                    quantity=item.quantity,
                    order=order,
                    actor=actor,
                    reference=reference,
                )
            order.inventory_committed = False
            order.save(update_fields=["inventory_committed"])
        else:
            # Still only reserved — release the hold, nothing was ever sold.
            inventory_services.release(reference=reference, reason=reason or "Order cancelled")

        if order.payment_status == Order.PAYMENT_COD_PENDING:
            order.payment_status = Order.PAYMENT_FAILED
            order.save(update_fields=["payment_status"])

        from products.services import sync_variant_products

        sync_variant_products(
            [item.variant for item in order.items.select_related("variant") if item.variant_id]
        )

    # -- payment -----------------------------------------------------------

    @classmethod
    def record_payment_status(cls, *, order, to_status, actor=None, note=""):
        """Move payment state, recording it. Never called for fulfilment."""
        previous = order.payment_status
        if previous == to_status:
            return order

        order.payment_status = to_status
        fields = ["payment_status", "updated_at"]
        if to_status == Order.PAYMENT_PAID and order.paid_at is None:
            order.paid_at = timezone.now()
            fields.append("paid_at")
        order.save(update_fields=fields)

        cls._record(
            order,
            kind=OrderHistory.KIND_PAYMENT,
            from_status=previous,
            to_status=to_status,
            actor=actor,
            note=note,
        )
        return order

    # -- history -----------------------------------------------------------

    @staticmethod
    def _record(order, *, kind, from_status="", to_status="", actor=None, note="", is_customer_visible=False):
        return OrderHistory.objects.create(
            order=order,
            kind=kind,
            from_status=from_status,
            to_status=to_status,
            actor=actor,
            note=(note or "")[:255],
            is_customer_visible=is_customer_visible,
        )


class PaymentSessionService:
    """Creates and resolves hosted-checkout sessions.

    This class no longer talks to the provider and no longer decides that a
    payment succeeded. Creating the provider-side checkout is
    ``payments.services.initiate_payment``; deciding that money arrived is
    ``payments.services.apply_provider_status``. Everything here is either
    building the session or reacting to a decision already made server-side.
    """

    @classmethod
    def create_registered_session(cls, *, user, address_id, payment_method, promo_code=""):
        checkout_data = CheckoutPreparationService.prepare_registered_checkout(
            user=user,
            address_id=address_id,
            promo_code=promo_code,
        )
        return cls._create_session(checkout_data=checkout_data, payment_method=payment_method)

    @classmethod
    def create_guest_session(
        cls,
        *,
        guest_name,
        guest_email,
        guest_phone_number,
        city,
        area,
        street,
        items,
        payment_method,
        promo_code="",
    ):
        checkout_data = CheckoutPreparationService.prepare_guest_checkout(
            guest_name=guest_name,
            guest_email=guest_email,
            guest_phone_number=guest_phone_number,
            city=city,
            area=area,
            street=street,
            items=items,
            promo_code=promo_code,
        )
        return cls._create_session(checkout_data=checkout_data, payment_method=payment_method)

    @classmethod
    def _create_session(cls, *, checkout_data, payment_method):
        if payment_method != "SAFEPAY":
            raise ValidationError("Unsupported online payment method.")

        session = PaymentSession.objects.create(
            user=checkout_data["user"],
            guest_name=checkout_data["guest_name"],
            guest_email=checkout_data["guest_email"],
            guest_phone_number=checkout_data["guest_phone_number"],
            promotion=checkout_data["promotion"],
            applied_promo_code=checkout_data["applied_promo_code"],
            subtotal_amount=checkout_data["subtotal_amount"],
            discount_amount=checkout_data["discount_amount"],
            shipping_fee=checkout_data["shipping_fee"],
            total_amount=checkout_data["total_amount"],
            shipping_address=checkout_data["shipping_address"],
            items_snapshot=checkout_data["items_snapshot"],
            payment_method=payment_method,
            provider="SAFEPAY",
            expires_at=timezone.now() + PaymentSession.PAYABLE_WINDOW,
        )

        # Hold the stock for the duration of the payment. Without this there are
        # only two options and both are wrong: deduct now and lose stock to
        # every abandoned payment, or deduct on success and sell the last tub to
        # everyone who reaches the payment page.
        #
        # The hold expires (PaymentSession.PAYABLE_WINDOW), so an abandoned
        # checkout cannot keep goods out of the catalogue indefinitely.
        reference = cls.reservation_reference(session)
        for item in checkout_data["items_snapshot"]:
            product = (
                Product.objects.filter(id=item.get("product_id"))
                .prefetch_related("variants")
                .first()
            )
            variant = product.default_variant if product else None
            if variant is None:
                continue
            inventory_services.reserve(
                variant=variant,
                quantity=item["quantity"],
                reference=reference,
                ttl=PaymentSession.PAYABLE_WINDOW,
            )

        return session

    @staticmethod
    def reservation_reference(session):
        """The key stock is held under for this checkout."""
        return f"session:{session.public_id}"

    @classmethod
    def mark_review_required(cls, *, public_id, payload=None, reference="", tracker="", reason=""):
        try:
            session = PaymentSession.objects.get(public_id=public_id)
        except PaymentSession.DoesNotExist as exc:
            raise ValidationError("Payment session not found.") from exc

        if session.status == "COMPLETED":
            return session

        should_notify = session.status != "REVIEW"
        session.status = "REVIEW"
        updated_fields = ["status", "review_reason", "updated_at"]
        session.review_reason = (reason or session.review_reason or "")[:255]
        if payload:
            session.gateway_payload = payload
            updated_fields.append("gateway_payload")
        if reference:
            session.gateway_reference = reference
            updated_fields.append("gateway_reference")
        if tracker and not session.gateway_tracker:
            session.gateway_tracker = tracker
            updated_fields.append("gateway_tracker")
        session.save(update_fields=updated_fields)
        if should_notify:
            from .tasks import send_admin_payment_review_push_task

            enqueue(send_admin_payment_review_push_task, str(session.public_id))
        return session

    @classmethod
    def cancel_session(cls, *, public_id, payload=None, failed=False):
        """Abandon a session. A completed session is never touched."""
        try:
            session = PaymentSession.objects.get(public_id=public_id)
        except PaymentSession.DoesNotExist as exc:
            raise ValidationError("Payment session not found.") from exc

        # A cancellation callback arriving after a successful payment must not
        # undo it — the customer has been charged.
        if session.status == "COMPLETED":
            return session

        session.status = "FAILED" if failed else "CANCELLED"
        if payload:
            session.gateway_payload = payload
        session.save(update_fields=["status", "gateway_payload", "updated_at"])

        # Give the stock back. The customer is not buying it.
        inventory_services.release(
            reference=cls.reservation_reference(session),
            reason="Payment cancelled" if not failed else "Payment failed",
        )
        return session

    @classmethod
    def resolve_review_session(cls, *, public_id, action, actor=None, reason=""):
        """Staff resolution of a payment that verification could not settle.

        Approval is restricted to sessions actually parked in ``REVIEW``. It used
        to accept ``PENDING`` too, which meant a staff account could turn any
        un-paid checkout into a confirmed paid order without the provider ever
        saying a payment happened — the admin-side equivalent of the callback
        flaw this release removes.
        """
        if action == "approve" and not reason:
            raise ValidationError("A reason is required when approving a payment manually.")

        with transaction.atomic():
            try:
                session = (
                    PaymentSession.objects.select_for_update(of=("self",))
                    .select_related("promotion", "user", "order")
                    .get(public_id=public_id)
                )
            except PaymentSession.DoesNotExist as exc:
                raise ValidationError("Payment session not found.") from exc

            if action == "approve":
                if session.status == "COMPLETED" and session.order_id:
                    return session
                if session.status != "REVIEW":
                    raise ValidationError(
                        "Only payments held for review can be approved manually."
                    )

                gateway_data = {
                    "reference": session.gateway_reference,
                    "tracker": session.gateway_tracker,
                    "payload": session.gateway_payload,
                }
                order = session.order or OrderService.create_paid_order_from_session(
                    session, gateway_data
                )
                session.status = "COMPLETED"
                session.order = order
                session.review_reason = f"Manually approved: {reason}"[:255]
                session.save(
                    update_fields=["status", "order", "review_reason", "updated_at"]
                )
                logger.warning(
                    "Payment session %s manually approved by %s: %s",
                    session.public_id,
                    getattr(actor, "email", "unknown"),
                    reason,
                )
                return session

            if action == "fail":
                if session.status == "COMPLETED":
                    raise ValidationError("Completed payment sessions cannot be marked failed.")
                session.status = "FAILED"
                session.review_reason = (reason or session.review_reason or "")[:255]
                session.save(update_fields=["status", "review_reason", "updated_at"])
                logger.info(
                    "Payment session %s marked failed by %s: %s",
                    session.public_id,
                    getattr(actor, "email", "unknown"),
                    reason or "(no reason given)",
                )
                return session

            raise ValidationError("Unsupported review action.")


class ReturnService:
    """Goods coming back, and money going back — tracked separately.

    They are different events. A customer may return goods and receive a
    replacement rather than a refund. A refund may be issued for a damaged item
    the customer was told to keep. Stock going back on the shelf is a physical
    fact; a refund is a financial one. Collapsing them is how a shop refunds for
    inventory it never received.
    """

    @staticmethod
    def _next_reference():
        return f"RET-{uuid.uuid4().hex[:10].upper()}"

    @classmethod
    def request_return(cls, *, order, lines, reason="OTHER", customer_note="", actor=None):
        """Open a return. ``lines`` is ``[{"order_item_id": int, "quantity": int}]``."""
        if order.fulfilment_status not in {
            Order.FULFILMENT_SHIPPED,
            Order.FULFILMENT_DELIVERED,
        }:
            raise ValidationError(
                "Only orders that have shipped or been delivered can be returned."
            )
        if not lines:
            raise ValidationError("Select at least one item to return.")

        with transaction.atomic():
            request = ReturnRequest.objects.create(
                order=order,
                reference=cls._next_reference(),
                reason=reason,
                customer_note=customer_note,
            )

            for line in lines:
                item = order.items.filter(pk=line["order_item_id"]).first()
                if item is None:
                    raise ValidationError("That item is not part of this order.")

                quantity = int(line["quantity"])
                if quantity < 1:
                    raise ValidationError("Return quantity must be at least one.")

                # Cannot send back more than was bought, counting anything
                # already returned on an earlier request.
                already = (
                    ReturnItem.objects.filter(order_item=item)
                    .exclude(return_request__status__in=[
                        ReturnRequest.STATUS_REJECTED, ReturnRequest.STATUS_CANCELLED
                    ])
                    .aggregate(total=models.Sum("quantity"))["total"]
                    or 0
                )
                if already + quantity > item.quantity:
                    remaining = item.quantity - already
                    raise ValidationError(
                        f"Only {remaining} of {item.product_name} can still be returned."
                    )

                ReturnItem.objects.create(
                    return_request=request, order_item=item, quantity=quantity
                )

            OrderTransitionService._record(
                order,
                kind=OrderHistory.KIND_RETURN,
                to_status=ReturnRequest.STATUS_REQUESTED,
                actor=actor,
                note=f"Return {request.reference} requested: {reason}",
                is_customer_visible=True,
            )
            return request

    @classmethod
    def approve(cls, *, return_request, actor=None, note=""):
        if return_request.status != ReturnRequest.STATUS_REQUESTED:
            raise ValidationError("Only a requested return can be approved.")

        return_request.status = ReturnRequest.STATUS_APPROVED
        return_request.staff_note = note[:1000]
        return_request.save(update_fields=["status", "staff_note"])

        OrderTransitionService._record(
            return_request.order,
            kind=OrderHistory.KIND_RETURN,
            from_status=ReturnRequest.STATUS_REQUESTED,
            to_status=ReturnRequest.STATUS_APPROVED,
            actor=actor,
            note=note or f"Return {return_request.reference} approved.",
            is_customer_visible=True,
        )
        return return_request

    @classmethod
    def reject(cls, *, return_request, actor=None, reason=""):
        if not reason.strip():
            raise ValidationError("A reason is required when rejecting a return.")
        if return_request.status not in {
            ReturnRequest.STATUS_REQUESTED, ReturnRequest.STATUS_APPROVED
        }:
            raise ValidationError("This return can no longer be rejected.")

        return_request.status = ReturnRequest.STATUS_REJECTED
        return_request.staff_note = reason[:1000]
        return_request.resolved_at = timezone.now()
        return_request.resolved_by = actor
        return_request.save(
            update_fields=["status", "staff_note", "resolved_at", "resolved_by"]
        )

        OrderTransitionService._record(
            return_request.order,
            kind=OrderHistory.KIND_RETURN,
            to_status=ReturnRequest.STATUS_REJECTED,
            actor=actor,
            note=reason,
            is_customer_visible=True,
        )
        return return_request

    @classmethod
    def receive_goods(cls, *, return_request, restock_decisions, actor=None):
        """Record what physically came back, and put back only what is sellable.

        ``restock_decisions`` is ``{return_item_id: bool}``. Per-line, because a
        decision that covers the whole return would force the same answer for a
        resealed tub and a leaking one.
        """
        if return_request.status != ReturnRequest.STATUS_APPROVED:
            raise ValidationError("Goods can only be received for an approved return.")

        with transaction.atomic():
            restocked_any = False

            for item in return_request.items.select_related("order_item__variant"):
                restock = bool(restock_decisions.get(item.pk, False))
                item.restock = restock

                if restock and item.order_item.variant_id:
                    inventory_services.return_to_stock(
                        variant=item.order_item.variant,
                        quantity=item.quantity,
                        order=return_request.order,
                        actor=actor,
                        reason=f"Return {return_request.reference}",
                        reference=f"return:{return_request.reference}",
                    )
                    item.restocked_at = timezone.now()
                    restocked_any = True

                item.save(update_fields=["restock", "restocked_at"])

            return_request.status = ReturnRequest.STATUS_RECEIVED
            return_request.save(update_fields=["status"])

            if restocked_any:
                from products.services import sync_variant_products

                sync_variant_products(
                    [
                        item.order_item.variant
                        for item in return_request.items.select_related("order_item__variant")
                        if item.order_item.variant_id
                    ]
                )

            OrderTransitionService._record(
                return_request.order,
                kind=OrderHistory.KIND_RETURN,
                to_status=ReturnRequest.STATUS_RECEIVED,
                actor=actor,
                note=f"Goods received for return {return_request.reference}.",
                is_customer_visible=True,
            )
            return return_request

    @classmethod
    def record_refund(cls, *, return_request, amount, actor=None, note=""):
        """Record money returned to the customer.

        Deliberately independent of whether the goods came back. Marking a
        refund does not move stock, and receiving stock does not move money.
        """
        amount = _to_money(amount)
        if amount <= 0:
            raise ValidationError("A refund must be for a positive amount.")

        order = return_request.order
        already_refunded = order.refunded_amount or Decimal("0.00")
        if already_refunded + amount > order.total_amount:
            remaining = order.total_amount - already_refunded
            raise ValidationError(
                f"That would refund more than the order was worth. "
                f"At most {remaining} remains refundable."
            )

        with transaction.atomic():
            return_request.refund_amount = amount
            return_request.refunded_at = timezone.now()
            return_request.save(update_fields=["refund_amount", "refunded_at"])

            order.refunded_amount = already_refunded + amount
            new_status = (
                Order.PAYMENT_REFUNDED
                if order.refunded_amount >= order.total_amount
                else Order.PAYMENT_PARTIALLY_REFUNDED
            )
            previous = order.payment_status
            order.payment_status = new_status
            order.save(update_fields=["refunded_amount", "payment_status", "updated_at"])

            OrderTransitionService._record(
                order,
                kind=OrderHistory.KIND_REFUND,
                from_status=previous,
                to_status=new_status,
                actor=actor,
                note=note or f"Refunded {amount} for return {return_request.reference}.",
                is_customer_visible=True,
            )
            return return_request

    @classmethod
    def complete(cls, *, return_request, actor=None):
        if return_request.status != ReturnRequest.STATUS_RECEIVED:
            raise ValidationError("Only a received return can be completed.")

        return_request.status = ReturnRequest.STATUS_COMPLETED
        return_request.resolved_at = timezone.now()
        return_request.resolved_by = actor
        return_request.save(update_fields=["status", "resolved_at", "resolved_by"])
        return return_request
