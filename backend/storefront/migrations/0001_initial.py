from django.db import migrations, models
import django.utils.timezone


class Migration(migrations.Migration):
    initial = True

    dependencies = []

    operations = [
        migrations.CreateModel(
            name="HomePageSettings",
            fields=[
                ("id", models.BigAutoField(auto_created=True, primary_key=True, serialize=False, verbose_name="ID")),
                ("hero_badge", models.CharField(default="Pakistan's #1 Supplement Store", max_length=120)),
                ("hero_title_line_one", models.CharField(default="FUEL YOUR", max_length=120)),
                ("hero_title_line_two", models.CharField(default="GAINS", max_length=120)),
                ("hero_description", models.TextField(default="Premium quality proteins & supplements delivered across Pakistan. 100% authentic products with COD available.")),
                ("hero_stat_one_label", models.CharField(default="Happy Customers", max_length=80)),
                ("hero_stat_one_value", models.CharField(default="50K+", max_length=40)),
                ("hero_stat_two_label", models.CharField(default="Authentic Products", max_length=80)),
                ("hero_stat_two_value", models.CharField(default="100%", max_length=40)),
                ("hero_stat_three_label", models.CharField(default="Fast Delivery", max_length=80)),
                ("hero_stat_three_value", models.CharField(default="24hr", max_length=40)),
                ("deal_badge", models.CharField(default="Limited Time Offer", max_length=120)),
                ("deal_title", models.CharField(default="MEGA SALE", max_length=120)),
                ("deal_subtitle", models.CharField(default="Up to 50% OFF on all proteins", max_length=160)),
                ("deal_code", models.CharField(default="POWER50", max_length=40)),
                ("deal_target_date", models.DateTimeField(default=django.utils.timezone.now)),
                ("support_email", models.EmailField(blank=True, default="", max_length=254)),
                ("support_phone", models.CharField(blank=True, default="", max_length=32)),
                ("announcement_text", models.CharField(blank=True, default="", max_length=180)),
                ("updated_at", models.DateTimeField(auto_now=True)),
            ],
            options={
                "verbose_name": "Homepage Settings",
                "verbose_name_plural": "Homepage Settings",
            },
        ),
    ]
