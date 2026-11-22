from __future__ import annotations

from django.conf import settings
from django.core.validators import MaxValueValidator, MinValueValidator
from django.db import models
from django.db.models import Q

from accounts.models import Role


class Category(models.TextChoices):
    BEER = "beer", "Beer"
    WINE = "wine", "Wine"
    COCKTAIL = "cocktail", "Cocktail"
    ALCOHOL_FREE = "alcohol_free", "Alcohol free"
    OTHER = "other", "Other"


class Container(models.TextChoices):
    BOTTLE = "bottle", "Bottle"
    CAN = "can", "Can"
    DRAFT = "draft", "Draft"
    GLASS = "glass", "Glass"
    OTHER = "other", "Other"


class Drink(models.Model):
    """One drink someone had, with their rating."""

    name = models.CharField(max_length=200)
    producer = models.CharField(max_length=200, blank=True, help_text="Brewery, winery or bar.")
    style = models.CharField(max_length=100, blank=True)
    abv = models.DecimalField(
        "ABV %",
        max_digits=4,
        decimal_places=1,
        null=True,
        blank=True,
        validators=[MinValueValidator(0), MaxValueValidator(100)],
    )
    country = models.CharField(max_length=100, blank=True)
    category = models.CharField(max_length=20, choices=Category.choices, default=Category.BEER)
    container = models.CharField(max_length=20, choices=Container.choices, blank=True)
    rating = models.PositiveSmallIntegerField(validators=[MinValueValidator(1), MaxValueValidator(10)])
    comment = models.TextField(blank=True)
    location = models.CharField(max_length=200, blank=True)
    date_tried = models.DateField(db_index=True)
    would_have_again = models.BooleanField(default=False)
    barcode = models.CharField(max_length=32, blank=True, db_index=True)

    photo = models.ImageField(upload_to="drinks/", blank=True, width_field="photo_width", height_field="photo_height")
    photo_width = models.PositiveIntegerField(null=True, blank=True, editable=False)
    photo_height = models.PositiveIntegerField(null=True, blank=True, editable=False)
    thumbnail = models.ImageField(upload_to="drinks/", blank=True, editable=False)

    created_by = models.ForeignKey(
        settings.AUTH_USER_MODEL, on_delete=models.SET_NULL, null=True, blank=True, related_name="drinks"
    )
    created_at = models.DateTimeField(auto_now_add=True, db_index=True)
    updated_at = models.DateTimeField(auto_now=True)
    # Picked by the app when the drink is saved, so a create that is retried after a lost
    # connection (the offline queue) doesn't make a second copy.
    client_id = models.CharField(max_length=64, blank=True)
    # Id in the old Node app's SQLite database (management command import_beerrates).
    legacy_id = models.PositiveIntegerField(null=True, blank=True, unique=True, editable=False)

    class Meta:
        ordering = ["-date_tried", "-created_at"]
        constraints = [
            models.CheckConstraint(condition=Q(rating__gte=1, rating__lte=10), name="drink_rating_1_10"),
            models.UniqueConstraint(
                fields=["created_by", "client_id"], condition=~Q(client_id=""), name="drink_unique_client_id"
            ),
        ]
        indexes = [models.Index(fields=["category", "-date_tried"])]

    def __str__(self) -> str:
        return f"{self.name} ({self.rating}/10)"


class Cheers(models.Model):
    """Someone raising a glass to someone else's drink (like a like)."""

    drink = models.ForeignKey(Drink, on_delete=models.CASCADE, related_name="cheers")
    user = models.ForeignKey(settings.AUTH_USER_MODEL, on_delete=models.CASCADE, related_name="cheers")
    created_at = models.DateTimeField(auto_now_add=True)

    class Meta:
        constraints = [models.UniqueConstraint(fields=["drink", "user"], name="cheers_once_per_user")]
        verbose_name_plural = "cheers"

    def __str__(self) -> str:
        return f"{self.user} → {self.drink}"


class SiteSettings(models.Model):
    """Settings admins change in the app (Manage → Settings). A single row, pk=1."""

    public_view = models.BooleanField(
        default=True, help_text="Anyone with the link can browse drinks, stats and the calendar without logging in."
    )
    allow_signup = models.BooleanField(default=True, help_text="People can create their own account.")
    require_approval = models.BooleanField(
        default=True, help_text="New accounts wait for an admin's approval before they can add drinks."
    )
    default_role = models.CharField(
        max_length=20,
        choices=Role.choices,
        default=Role.CONTRIBUTOR,
        help_text="Role given to new accounts.",
    )
    lookup_enabled = models.BooleanField(default=True, help_text="Search online drink databases from the form.")
    lookup_openbrewerydb = models.BooleanField(default=True)
    lookup_thecocktaildb = models.BooleanField(default=True)
    lookup_openfoodfacts = models.BooleanField(default=True)
    lookup_vivino = models.BooleanField(default=True)
    photo_ai = models.BooleanField(
        default=True, help_text="Barcode scanning and label reading on the phone (nothing leaves the device)."
    )
    # Web Push key pair, made on first use (notifications/push.py).
    vapid_private_key = models.TextField(blank=True, editable=False)

    class Meta:
        verbose_name_plural = "site settings"

    def __str__(self) -> str:
        return "Site settings"

    @classmethod
    def load(cls) -> SiteSettings:
        return cls.objects.get_or_create(pk=1)[0]

    def provider_on(self, name: str) -> bool:
        return self.lookup_enabled and getattr(self, f"lookup_{name}", False)


class LookupCache(models.Model):
    """Responses from the online drink databases, so repeat searches cost no requests."""

    key = models.CharField(max_length=300, primary_key=True)
    body = models.JSONField()
    expires_at = models.DateTimeField(db_index=True)

    def __str__(self) -> str:
        return self.key
