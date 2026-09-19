from django.apps import AppConfig


class ProductsConfig(AppConfig):
    default_auto_field = "django.db.models.BigAutoField"
    name = "products"
    verbose_name = "Catalogue"

    def ready(self):
        # Registers the signal that guarantees every product has a sellable
        # variant. Imported here rather than at module level so Django's app
        # registry is fully populated first.
        from . import signals  # noqa: F401
