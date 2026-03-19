from django.db import migrations, models


class Migration(migrations.Migration):

    dependencies = [
        ("orders", "0004_order_paid_at_order_payment_payload_and_more"),
    ]

    operations = [
        migrations.AddField(
            model_name="order",
            name="shipping_fee",
            field=models.DecimalField(decimal_places=2, default=0, max_digits=10),
        ),
        migrations.AddField(
            model_name="paymentsession",
            name="shipping_fee",
            field=models.DecimalField(decimal_places=2, default=0, max_digits=10),
        ),
    ]
