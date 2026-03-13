import base64
import logging
from urllib import error, parse, request

from django.conf import settings
from django.core.mail import EmailMultiAlternatives
from django.template.loader import render_to_string
from django.utils.html import strip_tags


logger = logging.getLogger(__name__)


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
