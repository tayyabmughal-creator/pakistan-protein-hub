from django.db import migrations, models


class Migration(migrations.Migration):

    dependencies = [
        ("storefront", "0001_initial"),
    ]

    operations = [
        migrations.AddField(
            model_name="homepagesettings",
            name="facebook_url",
            field=models.URLField(blank=True, default=""),
        ),
        migrations.AddField(
            model_name="homepagesettings",
            name="instagram_url",
            field=models.URLField(blank=True, default=""),
        ),
        migrations.AddField(
            model_name="homepagesettings",
            name="tiktok_url",
            field=models.URLField(blank=True, default=""),
        ),
        migrations.AddField(
            model_name="homepagesettings",
            name="youtube_url",
            field=models.URLField(blank=True, default=""),
        ),
    ]
