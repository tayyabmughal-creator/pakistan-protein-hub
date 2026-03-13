from django.db import migrations, models


class Migration(migrations.Migration):

    dependencies = [
        ("products", "0002_category_image"),
    ]

    operations = [
        migrations.AddField(
            model_name="product",
            name="show_sale_badge",
            field=models.BooleanField(default=True),
        ),
    ]
