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
from decimal import Decimal, ROUND_HALF_UP

from django.conf import settings
from django.core.exceptions import ValidationError
from django.db import transaction
from django.db.models import F
from django.utils import timezone

from cart.models import Cart
from products.models import Product
from products.services import StockService
from promotions.models import Promotion
from users.models import Address

from .models import Order, OrderItem, PaymentSession
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
    """Fire order notifications after commit. Never let them fail the order."""
    try:
        send_order_notifications(order)
    except Exception:  # noqa: BLE001 — a failed email must not lose a paid order
        logger.exception("Order confirmation notification failed for order %s", order.id)
    try:
        send_admin_new_order_push(order)
    except Exception:  # noqa: BLE001
        logger.exception("Admin push notification failed for order %s", order.id)


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
    ):
        with transaction.atomic():
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
                status=order_status,
            )

            for item in checkout_data["items_snapshot"]:
                product = None
                product_id = item.get("product_id")
                if product_id:
                    StockService.deduct_stock(product_id, item["quantity"])
                    product = Product.objects.filter(id=product_id).first()

                OrderItem.objects.create(
                    order=order,
                    product=product,
                    product_name=item["product_name"],
                    quantity=item["quantity"],
                    price=_to_money(item["price"]),
                )

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

    Previously the admin order endpoint was a writable ``ModelSerializer``, so a
    PATCH could set ``payment_status`` to PAID, rewrite ``paid_at``, or edit the
    discount — no invariant, no stock consequence, no record of who did it. All
    of those fields are read-only now, and movement goes through here.

    Transitions are deliberately conservative in this phase. The richer
    payment/fulfilment split arrives with the orders rework; what matters now is
    that the financially meaningful moves are validated rather than assignable.
    """

    ALLOWED_TRANSITIONS = {
        "PENDING": {"CONFIRMED", "CANCELLED"},
        "CONFIRMED": {"SHIPPED", "CANCELLED"},
        "SHIPPED": {"DELIVERED"},
        "DELIVERED": set(),
        "CANCELLED": set(),
    }

    #: Moving into one of these returns the reserved goods to sellable stock.
    RESTOCK_ON = {"CANCELLED"}

    @classmethod
    def can_transition(cls, from_status, to_status):
        return to_status in cls.ALLOWED_TRANSITIONS.get(from_status, set())

    @classmethod
    def transition(cls, *, order_id, to_status, actor=None, reason=""):
        if to_status not in dict(Order.ORDER_STATUS_CHOICES):
            raise ValidationError(f"{to_status} is not a valid order status.")

        with transaction.atomic():
            try:
                order = Order.objects.select_for_update().get(pk=order_id)
            except Order.DoesNotExist as exc:
                raise ValidationError("Order not found.") from exc

            if order.status == to_status:
                return order

            if not cls.can_transition(order.status, to_status):
                raise ValidationError(
                    f"An order cannot move from {order.status} to {to_status}."
                )

            if to_status == "CANCELLED" and order.payment_status == "PAID":
                # Cancelling money that has been taken is a refund decision, not
                # a fulfilment one. Refunds arrive with the returns workflow.
                raise ValidationError(
                    "This order is paid. Refund it before cancelling, so the money "
                    "and the stock are not resolved separately."
                )

            previous_status = order.status
            if to_status in cls.RESTOCK_ON:
                for item in order.items.exclude(product_id=None):
                    StockService.restore_stock(item.product_id, item.quantity)

            order.status = to_status
            order.save(update_fields=["status", "updated_at"])

            logger.info(
                "Order %s moved %s → %s by %s (%s)",
                order.id,
                previous_status,
                to_status,
                getattr(actor, "email", "unknown"),
                reason or "no reason given",
            )
            return order


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

        return PaymentSession.objects.create(
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
            send_admin_payment_review_push(session)
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
                    PaymentSession.objects.select_for_update()
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
