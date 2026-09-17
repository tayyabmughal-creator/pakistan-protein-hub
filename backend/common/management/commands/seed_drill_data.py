"""Create a small amount of synthetic data for the backup/restore drill.

The drill needs a database with rows in it, so that "the restore worked" means
something more than "the command exited zero". An empty database restores
perfectly and proves nothing.

Everything here is synthetic — no real customer data, no fixture file that could
drift into holding production records. This is why the repository no longer
tracks `data.json`.

Refuses to run against a database that already has orders, so it can never be
mistaken for a production seeding command.
"""

from __future__ import annotations

from decimal import Decimal

from django.contrib.auth import get_user_model
from django.core.management.base import BaseCommand, CommandError
from django.db import transaction
from django.utils import timezone

from orders.models import Order, OrderItem
from payments.models import PKR, PaymentTransaction
from products.models import Category, Product

User = get_user_model()


class Command(BaseCommand):
    help = "Seed synthetic data for the backup/restore drill. Never for production."

    def add_arguments(self, parser):
        parser.add_argument("--orders", type=int, default=5)

    def handle(self, *args, **options):
        if Order.objects.exists():
            raise CommandError(
                "This database already contains orders. seed_drill_data is for "
                "empty scratch databases only and will not touch real data."
            )

        with transaction.atomic():
            category = Category.objects.create(name="Protein", slug="protein-drill")

            products = [
                Product.objects.create(
                    name=f"Drill Whey {index}",
                    slug=f"drill-whey-{index}",
                    category=category,
                    brand="DrillBrand",
                    weight="2kg",
                    description="Synthetic product for the restore drill.",
                    price=Decimal("10000.00") + index,
                    stock=100,
                )
                for index in range(1, 4)
            ]

            customer = User.objects.create_user(
                username="drill@example.invalid",
                email="drill@example.invalid",
                name="Drill Customer",
                password="drill-only-not-a-real-account",
            )

            for index in range(options["orders"]):
                product = products[index % len(products)]
                order = Order.objects.create(
                    user=customer,
                    subtotal_amount=product.price,
                    total_amount=product.price,
                    shipping_address="Drill Customer, 03000000000, 1 Test St, Area, Lahore",
                    payment_method="SAFEPAY",
                    payment_status="PAID",
                    status="CONFIRMED",
                    paid_at=timezone.now(),
                )
                OrderItem.objects.create(
                    order=order,
                    product=product,
                    product_name=product.name,
                    quantity=1,
                    price=product.price,
                )
                PaymentTransaction.objects.create(
                    provider=PaymentTransaction.PROVIDER_SAFEPAY,
                    provider_reference=f"drill-ref-{index}",
                    provider_tracker=f"drill-tracker-{index}",
                    order=order,
                    expected_amount=product.price,
                    expected_currency=PKR,
                    verified_amount=product.price,
                    verified_currency=PKR,
                    status=PaymentTransaction.STATUS_PAID,
                    settled_at=timezone.now(),
                )

        self.stdout.write(
            self.style.SUCCESS(
                f"Seeded {User.objects.count()} user(s), {Product.objects.count()} product(s), "
                f"{Order.objects.count()} order(s), {PaymentTransaction.objects.count()} transaction(s)."
            )
        )
