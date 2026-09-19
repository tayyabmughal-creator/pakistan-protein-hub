"""Make sure there is somewhere for stock to live.

    python manage.py ensure_inventory_location
    python manage.py ensure_inventory_location --code warehouse --name "Storage Unit"

Every balance, movement and reservation is keyed by location, so without one
nothing can be sold. The migration creates the shop; this exists for databases
built another way — a restored backup that predates the migration, a test
fixture, or a fresh environment someone set up by hand.

Idempotent.
"""

from django.core.management.base import BaseCommand

from inventory.models import InventoryLocation


class Command(BaseCommand):
    help = "Create the default inventory location if none exists."

    def add_arguments(self, parser):
        parser.add_argument("--code", default="main-shop")
        parser.add_argument("--name", default="Pak Nutrition Shop")
        parser.add_argument("--city", default="")

    def handle(self, *args, **options):
        existing = InventoryLocation.get_default()
        if existing is not None:
            self.stdout.write(f"Default location already exists: {existing}")
            return str(existing.code)

        location, created = InventoryLocation.objects.get_or_create(
            code=options["code"],
            defaults={
                "name": options["name"],
                "city": options["city"],
                "is_fulfilment": True,
                "is_pickup_point": True,
                "is_active": True,
                "is_default": True,
            },
        )
        if not created and not location.is_default:
            location.is_default = True
            location.is_active = True
            location.save(update_fields=["is_default", "is_active"])

        self.stdout.write(
            self.style.SUCCESS(f"{'Created' if created else 'Promoted'} default location: {location}")
        )
        return str(location.code)
