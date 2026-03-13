from django.db import migrations, models


class Migration(migrations.Migration):

    dependencies = [
        ("storefront", "0002_homepagesettings_social_links"),
    ]

    operations = [
        migrations.AddField(
            model_name="homepagesettings",
            name="deal_enabled",
            field=models.BooleanField(default=True),
        ),
    ]
