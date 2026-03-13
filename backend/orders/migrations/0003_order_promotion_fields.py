from django.db import migrations, models
import django.db.models.deletion


class Migration(migrations.Migration):

    dependencies = [
        ("promotions", "0001_initial"),
        ("orders", "0002_guest_checkout_fields"),
    ]

    operations = [
        migrations.AddField(
            model_name="order",
            name="applied_promo_code",
            field=models.CharField(blank=True, max_length=50),
        ),
        migrations.AddField(
            model_name="order",
            name="discount_amount",
            field=models.DecimalField(decimal_places=2, default=0, max_digits=12),
        ),
        migrations.AddField(
            model_name="order",
            name="promotion",
            field=models.ForeignKey(blank=True, null=True, on_delete=django.db.models.deletion.SET_NULL, related_name="orders", to="promotions.promotion"),
        ),
        migrations.AddField(
            model_name="order",
            name="subtotal_amount",
            field=models.DecimalField(decimal_places=2, default=0, max_digits=12),
        ),
    ]
