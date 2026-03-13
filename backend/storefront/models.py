from datetime import timedelta

from django.db import OperationalError, ProgrammingError
from django.db import models
from django.utils import timezone
from promotions.models import Promotion


class HomePageSettings(models.Model):
    hero_badge = models.CharField(max_length=120, default="Pakistan's #1 Supplement Store")
    hero_title_line_one = models.CharField(max_length=120, default="FUEL YOUR")
    hero_title_line_two = models.CharField(max_length=120, default="GAINS")
    hero_description = models.TextField(
        default="Premium quality proteins & supplements delivered across Pakistan. 100% authentic products with COD available."
    )
    hero_stat_one_label = models.CharField(max_length=80, default="Happy Customers")
    hero_stat_one_value = models.CharField(max_length=40, default="50K+")
    hero_stat_two_label = models.CharField(max_length=80, default="Authentic Products")
    hero_stat_two_value = models.CharField(max_length=40, default="100%")
    hero_stat_three_label = models.CharField(max_length=80, default="Fast Delivery")
    hero_stat_three_value = models.CharField(max_length=40, default="24hr")
    deal_badge = models.CharField(max_length=120, default="Limited Time Offer")
    deal_title = models.CharField(max_length=120, default="MEGA SALE")
    deal_subtitle = models.CharField(max_length=160, default="Up to 50% OFF on all proteins")
    deal_code = models.CharField(max_length=40, default="POWER50")
    deal_enabled = models.BooleanField(default=True)
    deal_target_date = models.DateTimeField(default=timezone.now)
    featured_promotion = models.ForeignKey(Promotion, null=True, blank=True, on_delete=models.SET_NULL, related_name="homepage_features")
    support_email = models.EmailField(blank=True, default="")
    support_phone = models.CharField(max_length=32, blank=True, default="")
    announcement_text = models.CharField(max_length=180, blank=True, default="")
    facebook_url = models.URLField(blank=True, default="")
    instagram_url = models.URLField(blank=True, default="")
    tiktok_url = models.URLField(blank=True, default="")
    youtube_url = models.URLField(blank=True, default="")
    updated_at = models.DateTimeField(auto_now=True)

    class Meta:
        verbose_name = "Homepage Settings"
        verbose_name_plural = "Homepage Settings"

    def save(self, *args, **kwargs):
        self.pk = 1
        super().save(*args, **kwargs)

    @classmethod
    def get_solo(cls):
        defaults = {
            "deal_target_date": timezone.now() + timedelta(days=20),
        }
        try:
            instance, _ = cls.objects.get_or_create(pk=1, defaults=defaults)
            return instance
        except (OperationalError, ProgrammingError):
            return cls(pk=1, **defaults)
