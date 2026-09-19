import uuid
from datetime import timedelta

from django.conf import settings
from django.db import models
from django.utils import timezone
from products.models import Product
from promotions.models import Promotion

class Order(models.Model):
    """A sale.

    Three independent facts about an order, kept in three fields, because
    collapsing them loses information the shop needs:

    ``payment_status``     has the money arrived?
    ``fulfilment_status``  where are the goods?
    ``status``             the legacy combined field, derived from the two above

    A COD parcel that has shipped is *unpaid and shipped*. A prepaid order
    awaiting packing is *paid and unfulfilled*. One field cannot say either, and
    the old single ``status`` is why "revenue" counted parcels nobody had paid
    for.

    ``status`` is kept and kept correct because the Vite storefront and the Expo
    admin both read it. It is derived now, not authoritative.
    """

    # -- legacy combined status, derived from the two real ones ------------
    ORDER_STATUS_CHOICES = (
        ('PENDING', 'Pending'),
        ('CONFIRMED', 'Confirmed'),
        ('SHIPPED', 'Shipped'),
        ('DELIVERED', 'Delivered'),
        ('CANCELLED', 'Cancelled'),
    )
    PAYMENT_METHOD_CHOICES = (
        ('COD', 'Cash on Delivery'),
        ('EASYPAISA', 'Easypaisa Transfer'),
        ('JAZZCASH', 'JazzCash Transfer'),
        ('BANK_TRANSFER', 'Bank Transfer'),
        ('SAFEPAY', 'Cards, Wallets & Bank Transfer'),
    )

    # -- payment -----------------------------------------------------------
    PAYMENT_PENDING = 'PENDING'
    PAYMENT_COD_PENDING = 'COD_PENDING'
    PAYMENT_PAID = 'PAID'
    PAYMENT_FAILED = 'FAILED'
    PAYMENT_REFUNDED = 'REFUNDED'
    PAYMENT_PARTIALLY_REFUNDED = 'PARTIALLY_REFUNDED'

    PAYMENT_STATUS_CHOICES = (
        (PAYMENT_PENDING, 'Awaiting payment'),
        (PAYMENT_COD_PENDING, 'Cash due on delivery'),
        (PAYMENT_PAID, 'Paid'),
        (PAYMENT_FAILED, 'Payment failed'),
        (PAYMENT_REFUNDED, 'Refunded'),
        (PAYMENT_PARTIALLY_REFUNDED, 'Partially refunded'),
    )

    #: Money is in the business. Used by the revenue definition in
    #: storefront/metrics.py — nothing else counts.
    SETTLED_PAYMENT_STATUSES = frozenset({PAYMENT_PAID, PAYMENT_PARTIALLY_REFUNDED})

    # -- fulfilment ---------------------------------------------------------
    FULFILMENT_PENDING_CONFIRMATION = 'PENDING_CONFIRMATION'
    FULFILMENT_CONFIRMED = 'CONFIRMED'
    FULFILMENT_READY_TO_PACK = 'READY_TO_PACK'
    FULFILMENT_PACKED = 'PACKED'
    FULFILMENT_READY_FOR_PICKUP = 'READY_FOR_PICKUP'
    FULFILMENT_SHIPPED = 'SHIPPED'
    FULFILMENT_DELIVERED = 'DELIVERED'
    FULFILMENT_CANCELLED = 'CANCELLED'
    FULFILMENT_RETURNED = 'RETURNED'

    FULFILMENT_STATUS_CHOICES = (
        (FULFILMENT_PENDING_CONFIRMATION, 'Awaiting confirmation'),
        (FULFILMENT_CONFIRMED, 'Confirmed'),
        (FULFILMENT_READY_TO_PACK, 'Ready to pack'),
        (FULFILMENT_PACKED, 'Packed'),
        (FULFILMENT_READY_FOR_PICKUP, 'Ready for pickup'),
        (FULFILMENT_SHIPPED, 'Shipped'),
        (FULFILMENT_DELIVERED, 'Delivered'),
        (FULFILMENT_CANCELLED, 'Cancelled'),
        (FULFILMENT_RETURNED, 'Returned'),
    )

    #: Nothing moves out of these.
    FULFILMENT_TERMINAL = frozenset(
        {FULFILMENT_DELIVERED, FULFILMENT_CANCELLED, FULFILMENT_RETURNED}
    )

    # -- where the sale came from -------------------------------------------
    CHANNEL_ONLINE = 'ONLINE'
    CHANNEL_PHONE = 'PHONE'
    CHANNEL_WHATSAPP = 'WHATSAPP'
    CHANNEL_IN_STORE = 'IN_STORE'

    SALES_CHANNEL_CHOICES = (
        (CHANNEL_ONLINE, 'Online store'),
        (CHANNEL_PHONE, 'Phone order'),
        (CHANNEL_WHATSAPP, 'WhatsApp order'),
        (CHANNEL_IN_STORE, 'In store'),
    )

    user = models.ForeignKey(settings.AUTH_USER_MODEL, on_delete=models.CASCADE, related_name='orders', null=True, blank=True)
    guest_name = models.CharField(max_length=255, blank=True)
    guest_email = models.EmailField(blank=True)
    guest_phone_number = models.CharField(max_length=20, blank=True)
    promotion = models.ForeignKey(Promotion, null=True, blank=True, on_delete=models.SET_NULL, related_name='orders')
    applied_promo_code = models.CharField(max_length=50, blank=True)
    subtotal_amount = models.DecimalField(max_digits=12, decimal_places=2, default=0)
    discount_amount = models.DecimalField(max_digits=12, decimal_places=2, default=0)
    shipping_fee = models.DecimalField(max_digits=10, decimal_places=2, default=0)
    total_amount = models.DecimalField(max_digits=12, decimal_places=2)
    shipping_address = models.TextField() # Snapshot of address
    payment_method = models.CharField(max_length=20, choices=PAYMENT_METHOD_CHOICES, default='COD')
    payment_provider = models.CharField(max_length=20, blank=True, default='')
    payment_reference = models.CharField(max_length=120, blank=True)
    payment_tracker = models.CharField(max_length=120, blank=True)
    payment_payload = models.JSONField(default=dict, blank=True)
    payment_status = models.CharField(
        max_length=20, choices=PAYMENT_STATUS_CHOICES, default=PAYMENT_PENDING, db_index=True
    )
    paid_at = models.DateTimeField(null=True, blank=True)
    refunded_amount = models.DecimalField(max_digits=12, decimal_places=2, default=0)

    fulfilment_status = models.CharField(
        max_length=24,
        choices=FULFILMENT_STATUS_CHOICES,
        default=FULFILMENT_PENDING_CONFIRMATION,
        db_index=True,
    )
    sales_channel = models.CharField(
        max_length=12, choices=SALES_CHANNEL_CHOICES, default=CHANNEL_ONLINE, db_index=True
    )

    #: Set when fulfilment reaches the matching milestone, so "how long from
    #: order to dispatch" is answerable without reconstructing it from history.
    confirmed_at = models.DateTimeField(null=True, blank=True)
    packed_at = models.DateTimeField(null=True, blank=True)
    shipped_at = models.DateTimeField(null=True, blank=True)
    delivered_at = models.DateTimeField(null=True, blank=True)
    cancelled_at = models.DateTimeField(null=True, blank=True)

    courier_name = models.CharField(max_length=80, blank=True, default="")
    tracking_number = models.CharField(max_length=120, blank=True, default="", db_index=True)

    #: Whether the goods have left inventory. Committing twice would sell the
    #: same units twice; not committing at all gives them away.
    inventory_committed = models.BooleanField(default=False)

    staff_note = models.TextField(blank=True, default="")

    #: Legacy combined status. Derived from payment_status and
    #: fulfilment_status by OrderTransitionService — see the class docstring.
    status = models.CharField(
        max_length=20, choices=ORDER_STATUS_CHOICES, default='PENDING', db_index=True
    )
    created_at = models.DateTimeField(auto_now_add=True)
    updated_at = models.DateTimeField(auto_now=True)

    class Meta:
        ordering = ["-created_at"]
        indexes = [
            models.Index(fields=["payment_status", "fulfilment_status"]),
            models.Index(fields=["-created_at"]),
            models.Index(fields=["guest_phone_number"]),
            models.Index(fields=["sales_channel", "-created_at"]),
        ]

    def __str__(self):
        customer = self.user.email if self.user_id else self.guest_email or self.guest_name or "guest"
        return f"Order #{self.id} - {customer}"

    # -- derived views of the two real statuses ---------------------------

    @property
    def is_settled(self):
        """Money received. The single definition revenue reporting relies on."""
        if self.fulfilment_status == self.FULFILMENT_CANCELLED:
            return False
        if self.payment_status in self.SETTLED_PAYMENT_STATUSES:
            return True
        # Cash on delivery is settled when the rider hands the parcel over.
        return (
            self.payment_method == "COD"
            and self.fulfilment_status == self.FULFILMENT_DELIVERED
        )

    @property
    def customer_phone(self):
        if self.user_id and self.user.phone_number:
            return self.user.phone_number
        return self.guest_phone_number

    @property
    def customer_display_name(self):
        if self.user_id:
            return self.user.name or self.user.email
        return self.guest_name or self.guest_email or "Guest"

class OrderItem(models.Model):
    """One line, snapshotted at the moment of sale.

    Everything a receipt needs is copied here, not looked up through the
    foreign keys. A product renamed, repriced or deleted next year must not
    change what this order says was bought and for how much — that is a
    historical financial record, and joining to live catalogue data to render it
    would silently rewrite the past.

    The foreign keys are kept, nullable, only for "show me other orders for this
    SKU" style reporting.
    """

    order = models.ForeignKey(Order, related_name='items', on_delete=models.CASCADE)
    product = models.ForeignKey(Product, on_delete=models.SET_NULL, null=True, blank=True)
    variant = models.ForeignKey(
        "products.ProductVariant",
        on_delete=models.SET_NULL,
        null=True,
        blank=True,
        related_name="order_items",
    )

    # -- snapshot ---------------------------------------------------------
    product_name = models.CharField(max_length=255)
    sku = models.CharField(max_length=64, blank=True, default="", db_index=True)
    variant_description = models.CharField(
        max_length=160, blank=True, default="", help_text='e.g. "Chocolate, 2kg"'
    )
    brand_name = models.CharField(max_length=120, blank=True, default="")

    quantity = models.PositiveIntegerField()
    #: Unit price actually charged, after any per-unit discount.
    price = models.DecimalField(max_digits=10, decimal_places=2)
    #: Pre-discount unit price, for showing a saving on the receipt.
    compare_at_price = models.DecimalField(max_digits=10, decimal_places=2, null=True, blank=True)
    line_discount = models.DecimalField(max_digits=10, decimal_places=2, default=0)
    #: price * quantity - line_discount, stored rather than recomputed so the
    #: total cannot drift if the rounding rule ever changes.
    line_total = models.DecimalField(max_digits=12, decimal_places=2, default=0)

    class Meta:
        indexes = [
            models.Index(fields=["sku"]),
            models.Index(fields=["order"]),
        ]

    def __str__(self):
        label = f"{self.product_name} ({self.variant_description})" if self.variant_description else self.product_name
        return f"{self.quantity} x {label}"

    @property
    def computed_line_total(self):
        from decimal import Decimal

        return (self.price * self.quantity - (self.line_discount or Decimal("0.00"))).quantize(
            Decimal("0.01")
        )


class PaymentSession(models.Model):
    STATUS_CHOICES = (
        ('PENDING', 'Pending'),
        ('COMPLETED', 'Completed'),
        ('CANCELLED', 'Cancelled'),
        ('FAILED', 'Failed'),
        ('REVIEW', 'Review Required'),
    )
    PROVIDER_CHOICES = (
        ('SAFEPAY', 'Safepay'),
    )

    #: How long a hosted checkout may stay payable. Past this, reconciliation
    #: treats an unsettled session as abandoned.
    PAYABLE_WINDOW = timedelta(hours=2)

    public_id = models.UUIDField(default=uuid.uuid4, editable=False, unique=True)
    user = models.ForeignKey(
        settings.AUTH_USER_MODEL,
        on_delete=models.CASCADE,
        related_name='payment_sessions',
        null=True,
        blank=True,
    )
    guest_name = models.CharField(max_length=255, blank=True)
    guest_email = models.EmailField(blank=True)
    guest_phone_number = models.CharField(max_length=20, blank=True)
    promotion = models.ForeignKey(Promotion, null=True, blank=True, on_delete=models.SET_NULL, related_name='payment_sessions')
    applied_promo_code = models.CharField(max_length=50, blank=True)
    subtotal_amount = models.DecimalField(max_digits=12, decimal_places=2, default=0)
    discount_amount = models.DecimalField(max_digits=12, decimal_places=2, default=0)
    shipping_fee = models.DecimalField(max_digits=10, decimal_places=2, default=0)
    total_amount = models.DecimalField(max_digits=12, decimal_places=2)
    shipping_address = models.TextField()
    items_snapshot = models.JSONField(default=list, blank=True)
    payment_method = models.CharField(max_length=20, choices=Order.PAYMENT_METHOD_CHOICES, default='SAFEPAY')
    provider = models.CharField(max_length=20, choices=PROVIDER_CHOICES, default='SAFEPAY')
    gateway_tracker = models.CharField(max_length=120, blank=True)
    gateway_reference = models.CharField(max_length=120, blank=True)
    gateway_payload = models.JSONField(default=dict, blank=True)
    checkout_url = models.URLField(blank=True)
    status = models.CharField(max_length=20, choices=STATUS_CHOICES, default='PENDING')
    order = models.ForeignKey(Order, null=True, blank=True, on_delete=models.SET_NULL, related_name='payment_sessions')
    review_reason = models.CharField(max_length=255, blank=True, default='')
    expires_at = models.DateTimeField(null=True, blank=True)
    created_at = models.DateTimeField(auto_now_add=True)
    updated_at = models.DateTimeField(auto_now=True)

    class Meta:
        constraints = [
            # One provider tracker settles at most one session. This is what
            # stops a signed tracker from one checkout being pointed at another.
            # Partial, because sessions start with an empty tracker.
            models.UniqueConstraint(
                fields=['provider', 'gateway_tracker'],
                condition=~models.Q(gateway_tracker=''),
                name='orders_unique_session_gateway_tracker',
            ),
        ]
        indexes = [
            models.Index(fields=['status', 'created_at']),
            models.Index(fields=['gateway_tracker']),
        ]

    def __str__(self):
        return f"PaymentSession {self.public_id} ({self.get_status_display()})"

    @property
    def is_expired(self):
        if self.expires_at is None:
            return False
        return timezone.now() >= self.expires_at


class OrderHistory(models.Model):
    """An immutable record of every meaningful change to an order.

    Append-only. "Who marked this shipped, and when" must be answerable months
    later, and it cannot be if the answer is derived from the current row —
    the current row only knows where the order ended up.

    Deliberately not a generic audit log: order transitions are the thing staff
    and customers argue about, and they deserve a first-class table that can be
    queried by order without filtering a table of everything.
    """

    KIND_PAYMENT = "PAYMENT"
    KIND_FULFILMENT = "FULFILMENT"
    KIND_NOTE = "NOTE"
    KIND_REFUND = "REFUND"
    KIND_RETURN = "RETURN"

    KIND_CHOICES = (
        (KIND_PAYMENT, "Payment"),
        (KIND_FULFILMENT, "Fulfilment"),
        (KIND_NOTE, "Note"),
        (KIND_REFUND, "Refund"),
        (KIND_RETURN, "Return"),
    )

    order = models.ForeignKey(Order, related_name="history", on_delete=models.CASCADE)
    kind = models.CharField(max_length=16, choices=KIND_CHOICES, default=KIND_FULFILMENT)

    from_status = models.CharField(max_length=24, blank=True, default="")
    to_status = models.CharField(max_length=24, blank=True, default="")

    actor = models.ForeignKey(
        settings.AUTH_USER_MODEL,
        related_name="order_history_entries",
        on_delete=models.SET_NULL,
        null=True,
        blank=True,
        help_text="Null when the system did it, e.g. a verified payment webhook.",
    )
    note = models.CharField(max_length=255, blank=True, default="")

    #: Shown to the customer on the tracking page. Internal notes stay internal.
    is_customer_visible = models.BooleanField(default=False)

    created_at = models.DateTimeField(auto_now_add=True, db_index=True)

    class Meta:
        ordering = ["-created_at", "-id"]
        verbose_name_plural = "Order history"
        indexes = [models.Index(fields=["order", "-created_at"])]

    def __str__(self):
        if self.from_status and self.to_status:
            return f"Order #{self.order_id}: {self.from_status} -> {self.to_status}"
        return f"Order #{self.order_id}: {self.note[:60]}"


class ReturnRequest(models.Model):
    """A customer wants to send something back.

    Returning goods and refunding money are tracked separately on purpose. They
    happen at different times, sometimes only one of them happens at all, and
    conflating them is how a shop refunds for stock it never received back.
    ``restocked_at`` and the refund are independent facts.
    """

    STATUS_REQUESTED = "REQUESTED"
    STATUS_APPROVED = "APPROVED"
    STATUS_REJECTED = "REJECTED"
    STATUS_RECEIVED = "RECEIVED"
    STATUS_COMPLETED = "COMPLETED"
    STATUS_CANCELLED = "CANCELLED"

    STATUS_CHOICES = (
        (STATUS_REQUESTED, "Requested"),
        (STATUS_APPROVED, "Approved — awaiting goods"),
        (STATUS_REJECTED, "Rejected"),
        (STATUS_RECEIVED, "Goods received"),
        (STATUS_COMPLETED, "Completed"),
        (STATUS_CANCELLED, "Cancelled"),
    )

    REASON_CHOICES = (
        ("DAMAGED", "Arrived damaged"),
        ("WRONG_ITEM", "Wrong item sent"),
        ("NOT_AS_DESCRIBED", "Not as described"),
        ("EXPIRED", "Expired or near expiry"),
        ("CHANGED_MIND", "Changed mind"),
        ("OTHER", "Other"),
    )

    order = models.ForeignKey(Order, related_name="returns", on_delete=models.PROTECT)
    reference = models.CharField(max_length=32, unique=True, db_index=True)

    status = models.CharField(
        max_length=12, choices=STATUS_CHOICES, default=STATUS_REQUESTED, db_index=True
    )
    reason = models.CharField(max_length=20, choices=REASON_CHOICES, default="OTHER")
    customer_note = models.TextField(blank=True, default="")
    staff_note = models.TextField(blank=True, default="")

    requested_at = models.DateTimeField(auto_now_add=True)
    resolved_at = models.DateTimeField(null=True, blank=True)
    resolved_by = models.ForeignKey(
        settings.AUTH_USER_MODEL,
        related_name="resolved_returns",
        on_delete=models.SET_NULL,
        null=True,
        blank=True,
    )

    #: Money agreed to be returned. Zero is valid: a replacement rather than a
    #: refund is a legitimate outcome.
    refund_amount = models.DecimalField(max_digits=12, decimal_places=2, default=0)
    refunded_at = models.DateTimeField(null=True, blank=True)

    class Meta:
        ordering = ["-requested_at"]
        indexes = [models.Index(fields=["status", "-requested_at"])]

    def __str__(self):
        return f"Return {self.reference} for order #{self.order_id} ({self.status})"

    @property
    def is_open(self):
        return self.status not in {
            self.STATUS_COMPLETED,
            self.STATUS_REJECTED,
            self.STATUS_CANCELLED,
        }


class ReturnItem(models.Model):
    """One line of a return, with its own quantity and its own restock decision.

    Restocking is per-line because it is per-line in reality: of two tubs sent
    back, one may be resealed and sellable and the other leaking.
    """

    return_request = models.ForeignKey(
        ReturnRequest, related_name="items", on_delete=models.CASCADE
    )
    order_item = models.ForeignKey(OrderItem, related_name="return_items", on_delete=models.PROTECT)

    quantity = models.PositiveIntegerField()

    #: Whether these units went back on the shelf. Null until someone inspects
    #: them — "not yet decided" and "decided not to" are different answers.
    restock = models.BooleanField(null=True, blank=True)
    restocked_at = models.DateTimeField(null=True, blank=True)
    condition_note = models.CharField(max_length=255, blank=True, default="")

    class Meta:
        constraints = [
            models.CheckConstraint(
                condition=models.Q(quantity__gt=0), name="orders_return_item_quantity_positive"
            ),
        ]

    def __str__(self):
        return f"{self.quantity} x {self.order_item.product_name}"
