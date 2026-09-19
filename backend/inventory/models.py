"""Inventory: what is physically there, what is spoken for, and why.

Three ideas, kept strictly separate:

``InventoryBalance``  what is true *now* — ``on_hand`` and ``reserved`` for one
                      variant at one location. ``available`` is derived, never
                      stored: a third number that can disagree with the other
                      two is a bug waiting to happen.

``StockMovement``     an immutable ledger of every change, with a reason and an
                      actor. The previous system stored a single ``stock``
                      integer, so "we are eleven tubs short" had no answer
                      beyond guessing.

``StockReservation``  stock held for a checkout that has not completed. This is
                      what makes it possible to take payment without either
                      overselling or deducting stock for an order that never
                      materialises.

The balance is the fast path and the ledger is the truth. They are written in
the same transaction by ``inventory.services``, and
``verify_ledger_matches_balances`` proves they still agree.

Nothing outside ``inventory.services`` may write these tables. That is the point
of the module: `product.stock -= quantity; product.save()` is how stock silently
went wrong before.
"""

from django.conf import settings
from django.db import models
from django.utils import timezone


class InventoryLocation(models.Model):
    """Somewhere stock physically sits.

    One row to begin with: the Pak Nutrition shop, which is both the retail
    counter and the fulfilment point. The model exists now so that the ledger
    and balances are keyed correctly from day one — retrofitting a location
    column onto historical movements later is far worse than carrying an
    always-one foreign key.

    Transfers between locations are deliberately not implemented. There is
    nowhere to transfer to, and an untested transfer path is a way to lose
    stock, not a feature.
    """

    code = models.SlugField(max_length=40, unique=True)
    name = models.CharField(max_length=120)
    address = models.TextField(blank=True, default="")
    city = models.CharField(max_length=80, blank=True, default="")

    #: Fulfils online orders. With one location this is always true.
    is_fulfilment = models.BooleanField(default=True)
    #: Customers can collect here.
    is_pickup_point = models.BooleanField(default=True)
    is_active = models.BooleanField(default=True)

    #: Where online orders draw stock from when nothing else says otherwise.
    is_default = models.BooleanField(default=False)

    created_at = models.DateTimeField(auto_now_add=True)
    updated_at = models.DateTimeField(auto_now=True)

    class Meta:
        ordering = ["code"]
        constraints = [
            models.UniqueConstraint(
                fields=["is_default"],
                condition=models.Q(is_default=True),
                name="inventory_single_default_location",
            ),
        ]

    def __str__(self):
        return f"{self.name} ({self.code})"

    @classmethod
    def get_default(cls):
        """The location online orders draw from.

        Falls back to the only active location, so a fresh install that has not
        ticked the default box still works rather than failing checkout.
        """
        location = cls.objects.filter(is_default=True, is_active=True).first()
        if location is not None:
            return location
        return cls.objects.filter(is_active=True).order_by("id").first()


class InventoryBalance(models.Model):
    """Current position for one variant at one location."""

    variant = models.ForeignKey(
        "products.ProductVariant", related_name="balances", on_delete=models.CASCADE
    )
    location = models.ForeignKey(
        InventoryLocation, related_name="balances", on_delete=models.PROTECT
    )

    #: Physically present, including anything reserved but not yet handed over.
    on_hand = models.IntegerField(default=0)
    #: Spoken for by a checkout or an accepted order that has not shipped.
    reserved = models.IntegerField(default=0)

    low_stock_threshold = models.PositiveIntegerField(default=5)

    #: Set when a physical count last confirmed on_hand. A balance that has
    #: never been counted is a migrated number, not an observation.
    last_counted_at = models.DateTimeField(null=True, blank=True)
    updated_at = models.DateTimeField(auto_now=True)

    class Meta:
        constraints = [
            models.UniqueConstraint(
                fields=["variant", "location"], name="inventory_one_balance_per_variant_location"
            ),
            # These are the invariants. Enforced by the database so that no
            # future code path — an import, a management command, a shell
            # session — can leave stock in an impossible state.
            models.CheckConstraint(
                condition=models.Q(on_hand__gte=0), name="inventory_on_hand_not_negative"
            ),
            models.CheckConstraint(
                condition=models.Q(reserved__gte=0), name="inventory_reserved_not_negative"
            ),
            models.CheckConstraint(
                condition=models.Q(reserved__lte=models.F("on_hand")),
                name="inventory_reserved_within_on_hand",
            ),
        ]
        indexes = [
            models.Index(fields=["location", "variant"]),
            models.Index(fields=["variant"]),
        ]

    def __str__(self):
        return f"{self.variant.sku} @ {self.location.code}: {self.available} available"

    @property
    def available(self):
        """What can still be sold. Always derived, never stored."""
        return self.on_hand - self.reserved

    @property
    def is_low_stock(self):
        return 0 < self.available <= self.low_stock_threshold

    @property
    def is_out_of_stock(self):
        return self.available <= 0


class StockMovement(models.Model):
    """Immutable ledger row. One per change, with a reason.

    Append-only: correcting a mistake means posting a compensating movement, not
    editing history. That is what makes the ledger able to answer "why are we
    eleven short" months later.
    """

    RECEIPT = "RECEIPT"
    SALE = "SALE"
    RETURN = "RETURN"
    CANCELLATION = "CANCELLATION"
    DAMAGE = "DAMAGE"
    MANUAL_ADJUSTMENT = "MANUAL_ADJUSTMENT"
    STOCKTAKE = "STOCKTAKE"

    MOVEMENT_TYPES = (
        (RECEIPT, "Stock received"),
        (SALE, "Sold"),
        (RETURN, "Returned by customer"),
        (CANCELLATION, "Order cancelled"),
        (DAMAGE, "Damaged or written off"),
        (MANUAL_ADJUSTMENT, "Manual adjustment"),
        (STOCKTAKE, "Physical count correction"),
    )

    #: Types a human may post directly, and which therefore require a reason.
    OPERATOR_TYPES = frozenset({DAMAGE, MANUAL_ADJUSTMENT, STOCKTAKE, RECEIPT})

    variant = models.ForeignKey(
        "products.ProductVariant", related_name="movements", on_delete=models.PROTECT
    )
    location = models.ForeignKey(
        InventoryLocation, related_name="movements", on_delete=models.PROTECT
    )

    #: Signed. Negative takes stock out, positive puts it in. Never zero — a
    #: movement that moves nothing is noise in an audit trail.
    quantity = models.IntegerField()
    movement_type = models.CharField(max_length=20, choices=MOVEMENT_TYPES, db_index=True)

    #: What caused it, e.g. "order:412" or "return:38". Free-form so the ledger
    #: does not need a foreign key to every model that can move stock.
    reference = models.CharField(max_length=120, blank=True, default="", db_index=True)
    order = models.ForeignKey(
        "orders.Order",
        related_name="stock_movements",
        on_delete=models.SET_NULL,
        null=True,
        blank=True,
    )

    actor = models.ForeignKey(
        settings.AUTH_USER_MODEL,
        related_name="stock_movements",
        on_delete=models.SET_NULL,
        null=True,
        blank=True,
        help_text="Null when the system posted it, e.g. a sale at checkout.",
    )
    reason = models.CharField(max_length=255, blank=True, default="")

    #: The resulting on_hand, recorded at the time. Lets the ledger be audited
    #: without replaying every row, and makes a divergence obvious.
    balance_after = models.IntegerField(null=True, blank=True)

    created_at = models.DateTimeField(default=timezone.now, db_index=True)

    class Meta:
        ordering = ["-created_at", "-id"]
        constraints = [
            models.CheckConstraint(
                condition=~models.Q(quantity=0), name="inventory_movement_quantity_not_zero"
            ),
        ]
        indexes = [
            models.Index(fields=["variant", "-created_at"]),
            models.Index(fields=["movement_type", "-created_at"]),
            models.Index(fields=["reference"]),
        ]

    def __str__(self):
        sign = "+" if self.quantity > 0 else ""
        return f"{sign}{self.quantity} {self.variant.sku} ({self.movement_type})"


class StockReservation(models.Model):
    """Stock held for a checkout that has not completed.

    The lifecycle this exists for:

        reserve  → on_hand unchanged, reserved +n, so nobody else can buy it
        commit   → on_hand -n, reserved -n, and a SALE movement is posted
        release  → reserved -n, nothing sold

    Without it there are only two options, and both are wrong: deduct at
    checkout and lose stock to every abandoned payment, or deduct on payment and
    oversell the last tub to everyone who reaches the payment page.
    """

    ACTIVE = "ACTIVE"
    COMMITTED = "COMMITTED"
    RELEASED = "RELEASED"
    EXPIRED = "EXPIRED"

    STATUS_CHOICES = (
        (ACTIVE, "Active"),
        (COMMITTED, "Committed"),
        (RELEASED, "Released"),
        (EXPIRED, "Expired"),
    )

    variant = models.ForeignKey(
        "products.ProductVariant", related_name="reservations", on_delete=models.PROTECT
    )
    location = models.ForeignKey(
        InventoryLocation, related_name="reservations", on_delete=models.PROTECT
    )
    quantity = models.PositiveIntegerField()

    #: What the stock is held for. Unique per (reference, variant) while active,
    #: which is what makes reserving twice for the same checkout a no-op rather
    #: than a double hold.
    reference = models.CharField(max_length=120, db_index=True)
    order = models.ForeignKey(
        "orders.Order",
        related_name="reservations",
        on_delete=models.SET_NULL,
        null=True,
        blank=True,
    )

    status = models.CharField(max_length=12, choices=STATUS_CHOICES, default=ACTIVE, db_index=True)

    #: After this, a sweeper may release it. An abandoned checkout must not hold
    #: the last tub out of the catalogue indefinitely.
    expires_at = models.DateTimeField(null=True, blank=True, db_index=True)
    resolved_at = models.DateTimeField(null=True, blank=True)
    created_at = models.DateTimeField(auto_now_add=True)

    class Meta:
        ordering = ["-created_at"]
        constraints = [
            models.UniqueConstraint(
                fields=["reference", "variant"],
                condition=models.Q(status="ACTIVE"),
                name="inventory_one_active_reservation_per_reference_variant",
            ),
            models.CheckConstraint(
                condition=models.Q(quantity__gt=0), name="inventory_reservation_quantity_positive"
            ),
        ]
        indexes = [
            models.Index(fields=["status", "expires_at"]),
            models.Index(fields=["reference", "status"]),
        ]

    def __str__(self):
        return f"{self.quantity} x {self.variant.sku} for {self.reference} ({self.status})"

    @property
    def is_expired(self):
        return (
            self.status == self.ACTIVE
            and self.expires_at is not None
            and timezone.now() >= self.expires_at
        )
