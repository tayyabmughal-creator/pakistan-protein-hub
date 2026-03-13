from django.db import migrations, models
import django.db.models.deletion


class Migration(migrations.Migration):

    dependencies = [
        ("promotions", "0001_initial"),
        ("storefront", "0003_homepagesettings_deal_enabled"),
    ]

    operations = [
        migrations.AddField(
            model_name="homepagesettings",
            name="featured_promotion",
            field=models.ForeignKey(blank=True, null=True, on_delete=django.db.models.deletion.SET_NULL, related_name="homepage_features", to="promotions.promotion"),
        ),
    ]
