from django.db import models
from django.core.validators import MinValueValidator, MaxValueValidator
from django.utils import timezone

class Promotion(models.Model):
    code = models.CharField(max_length=50, unique=True)
    description = models.TextField(blank=True)
    discount_percentage = models.PositiveIntegerField(
        validators=[MinValueValidator(1), MaxValueValidator(100)],
        help_text="Percentage discount (1-100)"
    )
    valid_from = models.DateTimeField(default=timezone.now)
    valid_to = models.DateTimeField()
    active = models.BooleanField(default=True)
    usage_limit = models.PositiveIntegerField(default=100, help_text="Configurable max uses")
    used_count = models.PositiveIntegerField(default=0)

    class Meta:
        constraints = [
            # A coupon that has been redeemed more times than it allows is a
            # money bug. Redemption already increments conditionally in the
            # database (PromotionService.consume_redemption); this is the
            # backstop that makes over-redemption impossible to persist at all,
            # whatever future code path writes the field.
            models.CheckConstraint(
                condition=models.Q(used_count__lte=models.F("usage_limit")),
                name="promotions_used_count_within_limit",
            ),
        ]

    def is_valid(self):
        now = timezone.now()
        return self.active and self.valid_from <= now <= self.valid_to and self.used_count < self.usage_limit

    def __str__(self):
        return f"{self.code} - {self.discount_percentage}%"
