import hashlib
import hmac
import json
from decimal import Decimal, ROUND_HALF_UP
from urllib.error import HTTPError, URLError
from urllib.parse import urlencode
from urllib.request import Request, urlopen

from django.conf import settings
from django.core.exceptions import ValidationError
from django.db import transaction
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


def _to_money(value):
    return Decimal(value).quantize(Decimal("0.01"), rounding=ROUND_HALF_UP)


FREE_SHIPPING_THRESHOLD = Decimal("5000.00")
STANDARD_SHIPPING_FEE = Decimal("250.00")


def _shipping_fee_for_subtotal(subtotal):
    subtotal = _to_money(subtotal)
    return Decimal("0.00") if subtotal > FREE_SHIPPING_THRESHOLD else STANDARD_SHIPPING_FEE


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


class CheckoutPreparationService:
    @staticmethod
    def _get_cart_items(user):
        try:
            cart = Cart.objects.get(user=user)
        except Cart.DoesNotExist as exc:
            raise ValidationError("Cart is empty") from exc
        cart_items = cart.items.select_related("product").all()
        if not cart_items:
            raise ValidationError("Cart is empty")
        return cart, cart_items

    @staticmethod
    def _get_registered_address(user, address_id):
        try:
            return Address.objects.get(id=address_id, user=user)
        except Address.DoesNotExist as exc:
            raise ValidationError("Invalid address ID") from exc

    @classmethod
    def prepare_registered_checkout(cls, *, user, address_id, promo_code=""):
        cart, cart_items = cls._get_cart_items(user)
        address = cls._get_registered_address(user, address_id)

        shipping_address = f"{address.full_name}, {address.phone_number}, {address.street}, {address.area}, {address.city}"
        normalized_items = []
        subtotal = Decimal("0.00")

        for item in cart_items:
            price = _to_money(item.price_snapshot if item.price_snapshot else item.product.final_price)
            line_total = price * item.quantity
            subtotal += line_total
            normalized_items.append(
                {
                    "product_id": item.product.id,
                    "product_name": item.product.name,
                    "quantity": item.quantity,
                    "price": str(price),
                }
            )

        promotion = PromotionService.get_valid_promotion(promo_code) if promo_code else None
        discount = PromotionService.calculate_discount(subtotal, promotion)
        shipping_fee = _shipping_fee_for_subtotal(subtotal)

        return {
            "user": user,
            "cart": cart,
            "guest_name": "",
            "guest_email": "",
            "guest_phone_number": "",
            "shipping_address": shipping_address,
            "items_snapshot": normalized_items,
            "promotion": promotion,
            "applied_promo_code": promotion.code if promotion else "",
            "subtotal_amount": subtotal,
            "discount_amount": discount,
            "shipping_fee": shipping_fee,
            "total_amount": subtotal - discount + shipping_fee,
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
    ):
        if not items:
            raise ValidationError("Cart is empty")

        shipping_address = f"{guest_name}, {guest_phone_number}, {street}, {area}, {city}"
        normalized_items = []
        subtotal = Decimal("0.00")

        for item in items:
            product = item["product"]
            quantity = item["quantity"]
            price = _to_money(product.final_price)
            line_total = price * quantity
            subtotal += line_total
            normalized_items.append(
                {
                    "product_id": product.id,
                    "product_name": product.name,
                    "quantity": quantity,
                    "price": str(price),
                }
            )

        promotion = PromotionService.get_valid_promotion(promo_code) if promo_code else None
        discount = PromotionService.calculate_discount(subtotal, promotion)
        shipping_fee = _shipping_fee_for_subtotal(subtotal)

        return {
            "user": None,
            "cart": None,
            "guest_name": guest_name,
            "guest_email": guest_email,
            "guest_phone_number": guest_phone_number,
            "shipping_address": shipping_address,
            "items_snapshot": normalized_items,
            "promotion": promotion,
            "applied_promo_code": promotion.code if promotion else "",
            "subtotal_amount": subtotal,
            "discount_amount": discount,
            "shipping_fee": shipping_fee,
            "total_amount": subtotal - discount + shipping_fee,
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


class SafepayGateway:
    @staticmethod
    def _api_base():
        if settings.SAFEPAY_ENV == "production":
            return "https://api.getsafepay.com"
        return "https://sandbox.api.getsafepay.com"

    @staticmethod
    def _checkout_base():
        if settings.SAFEPAY_ENV == "production":
            return "https://www.getsafepay.com"
        return "https://sandbox.api.getsafepay.com"

    @staticmethod
    def _amount_in_subunits(total_amount):
        return int((_to_money(total_amount) * 100).quantize(Decimal("1"), rounding=ROUND_HALF_UP))

    @classmethod
    def _extract_tracker(cls, payload):
        return (
            payload.get("token")
            or payload.get("tracker")
            or payload.get("paymentTracker", {}).get("token")
            or payload.get("tracker", {}).get("token")
            or payload.get("data", {}).get("paymentTracker", {}).get("token")
            or payload.get("data", {}).get("tracker", {}).get("token")
        )

    @classmethod
    def initialize_session(cls, session):
        if not getattr(settings, "SAFEPAY_API_KEY", ""):
            raise ValidationError("Safepay API key is not configured.")

        payload = {
            "client": settings.SAFEPAY_API_KEY,
            "amount": cls._amount_in_subunits(session.total_amount),
            "currency": "PKR",
            "environment": settings.SAFEPAY_ENV,
        }
        body = json.dumps(payload).encode("utf-8")
        request = Request(
            f"{cls._api_base()}/order/v1/init",
            data=body,
            headers={"Content-Type": "application/json"},
            method="POST",
        )

        try:
            with urlopen(request, timeout=20) as response:
                response_payload = json.loads(response.read().decode("utf-8"))
        except HTTPError as exc:
            details = exc.read().decode("utf-8", errors="ignore")
            raise ValidationError(f"Safepay rejected the payment request. {details}".strip()) from exc
        except URLError as exc:
            raise ValidationError("Could not connect to Safepay. Please try again shortly.") from exc

        tracker = cls._extract_tracker(response_payload)
        if not tracker:
            raise ValidationError("Safepay did not return a payment tracker.")

        checkout_params = urlencode(
            {
                "beacon": tracker,
                "source": settings.SAFEPAY_SOURCE,
                "order_id": str(session.public_id),
                "redirect_url": f"{settings.BACKEND_PUBLIC_URL}/api/orders/payments/safepay/return/",
                "cancel_url": f"{settings.BACKEND_PUBLIC_URL}/api/orders/payments/safepay/cancel/",
            }
        )
        checkout_url = f"{cls._checkout_base()}/components?{checkout_params}"
        return {
            "tracker": tracker,
            "checkout_url": checkout_url,
            "payload": response_payload,
        }

    @staticmethod
    def verify_signature(*, tracker, signature):
        shared_secret = getattr(settings, "SAFEPAY_SHARED_SECRET", "")
        if not shared_secret:
            raise ValidationError("Safepay shared secret is not configured.")
        if not tracker or not signature:
            raise ValidationError("Safepay response is missing tracker or signature.")

        expected = hmac.new(
            shared_secret.encode("utf-8"),
            tracker.encode("utf-8"),
            hashlib.sha256,
        ).hexdigest()
        if not hmac.compare_digest(expected.lower(), signature.lower()):
            raise ValidationError("Safepay response signature is invalid.")

    @staticmethod
    def extract_callback_payload(data):
        callback_data = dict(data or {})
        return {
            "public_id": callback_data.get("order_id") or callback_data.get("orderId"),
            "tracker": callback_data.get("tracker") or callback_data.get("beacon") or callback_data.get("token"),
            "reference": callback_data.get("reference")
            or callback_data.get("reference_code")
            or callback_data.get("referenceCode"),
            "signature": callback_data.get("signature"),
            "payload": callback_data,
        }


class OrderService:
    @staticmethod
    def preview_discount(*, user=None, items=None, promo_code=""):
        promotion = PromotionService.get_valid_promotion(promo_code)
        if user:
            _, cart_items = CheckoutPreparationService._get_cart_items(user)
            subtotal = sum(
                _to_money(item.price_snapshot if item.price_snapshot else item.product.final_price) * item.quantity
                for item in cart_items
            )
        else:
            if not items:
                raise ValidationError("Cart is empty")
            subtotal = sum(_to_money(item["product"].final_price) * item["quantity"] for item in items)

        discount = PromotionService.calculate_discount(subtotal, promotion)
        shipping_fee = _shipping_fee_for_subtotal(subtotal)
        total = Decimal(subtotal) - discount + shipping_fee
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
                    try:
                        StockService.deduct_stock(product_id, item["quantity"])
                        product = Product.objects.filter(id=product_id).first()
                    except ValidationError:
                        raise

                OrderItem.objects.create(
                    order=order,
                    product=product,
                    product_name=item["product_name"],
                    quantity=item["quantity"],
                    price=_to_money(item["price"]),
                )

            promotion = checkout_data["promotion"]
            if promotion:
                Promotion.objects.filter(id=promotion.id).update(used_count=promotion.used_count + 1)

            if clear_cart and checkout_data["user"]:
                cart = Cart.objects.filter(user=checkout_data["user"]).first()
                if cart:
                    cart.updated_at = timezone.now()
                    cart.save(update_fields=["updated_at"])
                    cart.items.all().delete()

            send_order_notifications(order)
            send_admin_new_order_push(order)
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
        checkout_data = CheckoutPreparationService.prepare_registered_checkout(
            user=user,
            address_id=address_id,
            promo_code=promo_code,
        )
        payment_provider = "MANUAL" if PaymentMethodService.is_manual_method(payment_method) else ""
        payment_payload = {"note": payment_note} if payment_note else {}
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
        payment_provider = "MANUAL" if PaymentMethodService.is_manual_method(payment_method) else ""
        payment_payload = {"note": payment_note} if payment_note else {}
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


class PaymentSessionService:
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
        )

        gateway_session = SafepayGateway.initialize_session(session)
        session.gateway_tracker = gateway_session["tracker"]
        session.checkout_url = gateway_session["checkout_url"]
        session.gateway_payload = gateway_session["payload"]
        session.save(update_fields=["gateway_tracker", "checkout_url", "gateway_payload", "updated_at"])
        return session

    @classmethod
    def complete_session(cls, *, public_id, gateway_data):
        with transaction.atomic():
            try:
                session = PaymentSession.objects.select_for_update().select_related("promotion", "user").get(public_id=public_id)
            except PaymentSession.DoesNotExist as exc:
                raise ValidationError("Payment session not found.") from exc

            if session.status == "COMPLETED" and session.order_id:
                return session.order

            if session.status != "PENDING":
                raise ValidationError("Payment session is not payable.")

            order = OrderService.create_paid_order_from_session(session, gateway_data)
            session.status = "COMPLETED"
            session.order = order
            session.gateway_reference = gateway_data.get("reference", "")
            session.gateway_payload = gateway_data.get("payload", {})
            session.save(
                update_fields=["status", "order", "gateway_reference", "gateway_payload", "updated_at"]
            )
            return order

    @classmethod
    def mark_review_required(cls, *, public_id, payload=None, reference="", tracker=""):
        try:
            session = PaymentSession.objects.get(public_id=public_id)
        except PaymentSession.DoesNotExist as exc:
            raise ValidationError("Payment session not found.") from exc

        if session.status == "COMPLETED":
            return session

        should_notify = session.status != "REVIEW"
        session.status = "REVIEW"
        if reference:
            session.gateway_reference = reference
        updated_fields = ["status", "updated_at"]
        if payload:
            session.gateway_payload = payload
            updated_fields.append("gateway_payload")
        if reference:
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
        try:
            session = PaymentSession.objects.get(public_id=public_id)
        except PaymentSession.DoesNotExist as exc:
            raise ValidationError("Payment session not found.") from exc

        if session.status == "COMPLETED":
            return session

        session.status = "FAILED" if failed else "CANCELLED"
        if payload:
            session.gateway_payload = payload
        session.save(update_fields=["status", "gateway_payload", "updated_at"])
        return session

    @classmethod
    def resolve_review_session(cls, *, public_id, action):
        with transaction.atomic():
            try:
                session = PaymentSession.objects.select_for_update().select_related("promotion", "user", "order").get(public_id=public_id)
            except PaymentSession.DoesNotExist as exc:
                raise ValidationError("Payment session not found.") from exc

            if action == "approve":
                if session.status == "COMPLETED" and session.order_id:
                    return session
                if session.status not in {"PENDING", "REVIEW"}:
                    raise ValidationError("Only pending or review sessions can be approved.")

                gateway_data = {
                    "reference": session.gateway_reference,
                    "tracker": session.gateway_tracker,
                    "payload": session.gateway_payload,
                }
                order = session.order or OrderService.create_paid_order_from_session(session, gateway_data)
                session.status = "COMPLETED"
                session.order = order
                session.save(update_fields=["status", "order", "updated_at"])
                return session

            if action == "fail":
                if session.status == "COMPLETED":
                    raise ValidationError("Completed payment sessions cannot be marked failed.")
                session.status = "FAILED"
                session.save(update_fields=["status", "updated_at"])
                return session

            raise ValidationError("Unsupported review action.")
