import base64
import json
import logging
from urllib import error, parse, request

from django.conf import settings
from django.core.mail import EmailMultiAlternatives
from django.template.loader import render_to_string
from django.utils.html import strip_tags
from users.models import AdminDevice


logger = logging.getLogger(__name__)
EXPO_PUSH_ENDPOINT = "https://exp.host/--/api/v2/push/send"
EXPO_PUSH_BATCH_SIZE = 100


def _order_customer_name(order):
    if order.user_id:
        return order.user.name or order.user.email
    return order.guest_name or "Customer"


def _order_customer_email(order):
    if order.user_id:
        return order.user.email
    return order.guest_email


def _order_customer_phone(order):
    if order.user_id:
        return getattr(order.user, "phone_number", "") or ""
    return order.guest_phone_number


def send_order_confirmation_email(order):
    if not getattr(settings, "ORDER_NOTIFICATION_EMAIL_ENABLED", True):
        return

    recipient = _order_customer_email(order)
    if not recipient:
        return

    tracking_url = (
        f"{settings.FRONTEND_URL}/orders/{order.id}"
        if order.user_id
        else f"{settings.FRONTEND_URL}/guest-orders"
    )
    context = {
        "order": order,
        "customer_name": _order_customer_name(order),
        "tracking_url": tracking_url,
        "items": order.items.all(),
    }
    html_message = render_to_string("orders/order_confirmation.html", context)
    text_message = strip_tags(html_message)

    message = EmailMultiAlternatives(
        subject=f"Order Confirmation #{order.id}",
        body=text_message,
        from_email=settings.DEFAULT_FROM_EMAIL,
        to=[recipient],
    )
    message.attach_alternative(html_message, "text/html")
    message.send(fail_silently=False)


def send_order_confirmation_sms(order):
    if not getattr(settings, "ORDER_NOTIFICATION_SMS_ENABLED", False):
        return

    phone_number = _order_customer_phone(order)
    if not phone_number:
        return

    account_sid = getattr(settings, "TWILIO_ACCOUNT_SID", "")
    auth_token = getattr(settings, "TWILIO_AUTH_TOKEN", "")
    from_number = getattr(settings, "TWILIO_FROM_NUMBER", "")

    if not account_sid or not auth_token or not from_number:
        logger.info("SMS notifications enabled but Twilio credentials are incomplete; skipping SMS for order %s", order.id)
        return

    body = (
        f"PakNutrition: your order #{order.id} is confirmed. "
        f"Total PKR {order.total_amount}. Track it with your reference number."
    )

    payload = parse.urlencode({
        "To": phone_number,
        "From": from_number,
        "Body": body,
    }).encode()

    sms_request = request.Request(
        url=f"https://api.twilio.com/2010-04-01/Accounts/{account_sid}/Messages.json",
        data=payload,
        method="POST",
    )
    auth_value = base64.b64encode(f"{account_sid}:{auth_token}".encode()).decode()
    sms_request.add_header("Authorization", f"Basic {auth_value}")
    sms_request.add_header("Content-Type", "application/x-www-form-urlencoded")

    try:
        with request.urlopen(sms_request, timeout=10) as response:
            response.read()
    except error.URLError as exc:
        logger.warning("Failed to send SMS for order %s: %s", order.id, exc)


def send_order_notifications(order):
    try:
        send_order_confirmation_email(order)
    except Exception as exc:
        logger.exception("Order confirmation email failed for order %s: %s", order.id, exc)

    try:
        send_order_confirmation_sms(order)
    except Exception as exc:
        logger.exception("Order confirmation SMS failed for order %s: %s", order.id, exc)


def _chunked(items, size):
    for index in range(0, len(items), size):
        yield items[index:index + size]


def _get_active_admin_tokens():
    return list(
        AdminDevice.objects.filter(
            is_active=True,
            user__is_staff=True,
            user__is_active=True,
        )
        .values_list("expo_push_token", flat=True)
        .distinct()
    )


def _dispatch_expo_messages(messages):
    if not getattr(settings, "ADMIN_PUSH_NOTIFICATIONS_ENABLED", True):
        return
    if not messages:
        return

    headers = {
        "Content-Type": "application/json",
        "Accept": "application/json",
    }
    access_token = getattr(settings, "EXPO_PUSH_ACCESS_TOKEN", "").strip()
    if access_token:
        headers["Authorization"] = f"Bearer {access_token}"

    for batch in _chunked(messages, EXPO_PUSH_BATCH_SIZE):
        push_request = request.Request(
            url=EXPO_PUSH_ENDPOINT,
            data=json.dumps(batch).encode("utf-8"),
            method="POST",
            headers=headers,
        )
        try:
            with request.urlopen(push_request, timeout=10) as response:
                payload = json.loads(response.read().decode("utf-8"))
        except error.URLError as exc:
            logger.warning("Failed to send Expo push notification batch: %s", exc)
            continue

        if payload.get("errors"):
            logger.warning("Expo push notification returned errors: %s", payload["errors"])


def _build_push_messages(*, title, body, data):
    tokens = _get_active_admin_tokens()
    return [
        {
            "to": token,
            "title": title,
            "body": body,
            "data": data,
            "sound": "default",
            "priority": "high",
            "channelId": "orders",
        }
        for token in tokens
    ]


def send_admin_new_order_push(order):
    try:
        customer = _order_customer_name(order)
        body = f"{customer} placed a {order.payment_method} order for PKR {order.total_amount}."
        messages = _build_push_messages(
            title=f"New order #{order.id}",
            body=body,
            data={
                "type": "new-order",
                "screen": "order-detail",
                "orderId": order.id,
            },
        )
        _dispatch_expo_messages(messages)
    except Exception as exc:
        logger.exception("Admin order push failed for order %s: %s", order.id, exc)


def send_admin_payment_review_push(session):
    try:
        customer = session.user.name if session.user_id else session.guest_name or session.guest_email or "Customer"
        body = f"{customer} needs manual payment review for PKR {session.total_amount}."
        messages = _build_push_messages(
            title="Payment review required",
            body=body,
            data={
                "type": "payment-review",
                "screen": "payment-review",
                "sessionId": str(session.public_id),
            },
        )
        _dispatch_expo_messages(messages)
    except Exception as exc:
        logger.exception("Admin payment review push failed for session %s: %s", session.public_id, exc)
