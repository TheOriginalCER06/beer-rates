from __future__ import annotations

import hashlib
import secrets
from datetime import timedelta

from django.conf import settings
from django.contrib.auth.models import AbstractUser, UserManager
from django.db import models
from django.utils import timezone


class Role(models.TextChoices):
    """What a user may do with drinks. Admins also manage users and site settings."""

    ADMIN = "admin", "Admin"
    CONTRIBUTOR = "contributor", "Contributor"  # adds drinks, edits and deletes their own
    VIEWER = "viewer", "Viewer"  # read only


class BeerUserManager(UserManager):
    def create_superuser(self, username, email=None, password=None, **extra_fields):
        extra_fields.setdefault("role", Role.ADMIN)
        return super().create_superuser(username, email or None, password, **extra_fields)


class User(AbstractUser):
    """
    App user. Depending on the site settings, new signups wait for an admin's approval and see
    only public content (if public viewing is on) until then.
    """

    class Language(models.TextChoices):
        ENGLISH = "en", "English"
        NORWEGIAN = "nb", "Norsk bokmål"

    # Optional: accounts imported from the old app have none. Needed for password reset emails.
    email = models.EmailField("email address", unique=True, null=True, blank=True)
    role = models.CharField(max_length=20, choices=Role.choices, default=Role.CONTRIBUTOR)
    is_approved = models.BooleanField(default=False)
    approved_at = models.DateTimeField(null=True, blank=True)
    language = models.CharField(max_length=5, choices=Language.choices, default=Language.NORWEGIAN)
    # Id in the old Node app's SQLite database (drinks.management.commands.import_beerrates).
    legacy_id = models.PositiveIntegerField(null=True, blank=True, unique=True, editable=False)

    # --- Notifications (push to this user's devices; admin ones only apply to admins) ---
    push_new_drinks = models.BooleanField(default=False, help_text="Push: someone else logged a drink.")
    push_cheers = models.BooleanField(default=True, help_text="Push: someone cheered one of my drinks.")
    push_admin_new_signup = models.BooleanField(default=True, help_text="Push (admins): a new user signed up.")
    email_admin_new_signup = models.BooleanField(default=True, help_text="Email (admins): a new user signed up.")

    objects = BeerUserManager()

    @property
    def is_admin(self) -> bool:
        return self.is_superuser or self.role == Role.ADMIN

    @property
    def can_add_drinks(self) -> bool:
        return self.is_active and self.is_approved and self.role in (Role.ADMIN, Role.CONTRIBUTOR)

    def save(self, *args, **kwargs):
        # Superusers (e.g. from `createsuperuser`) are always approved admins.
        if self.is_superuser:
            self.role = Role.ADMIN
            self.is_approved = True
        # Django's admin site and is_staff follow the role.
        self.is_staff = self.is_superuser or self.role == Role.ADMIN
        if self.is_approved and self.approved_at is None:
            self.approved_at = timezone.now()
        if self.email == "":
            self.email = None
        update_fields = kwargs.get("update_fields")
        if update_fields is not None and "role" in update_fields:
            kwargs["update_fields"] = {*update_fields, "is_staff"}
        super().save(*args, **kwargs)

    def approve(self) -> None:
        """Approve the account and tell the user. Use this rather than setting is_approved directly."""
        from notifications.services import notify_user_approved

        self.is_approved = True
        self.approved_at = timezone.now()
        self.save(update_fields=["is_approved", "approved_at"])
        notify_user_approved(self)


class RateLimit(models.Model):
    """Fixed-window counters for rate limiting (see accounts/ratelimit.py). Shared by all processes."""

    key = models.CharField(max_length=255, primary_key=True)
    count = models.PositiveIntegerField(default=0)
    window_started = models.DateTimeField()

    def __str__(self) -> str:
        return f"{self.key}: {self.count}"


def _hash(raw: str) -> str:
    return hashlib.sha256(raw.encode()).hexdigest()


class ApiToken(models.Model):
    """
    A login for the Android/iOS app. The app keeps the raw token; only its SHA-256 is stored.
    Removed on logout, or by the worker after API_TOKEN_IDLE_DAYS without use.
    """

    user = models.ForeignKey(User, on_delete=models.CASCADE, related_name="api_tokens")
    key_hash = models.CharField(max_length=64, unique=True, editable=False)
    name = models.CharField(max_length=100, blank=True, help_text="Device, as the app reported it.")
    created_at = models.DateTimeField(auto_now_add=True)
    last_used_at = models.DateTimeField(default=timezone.now)

    def __str__(self) -> str:
        return f"{self.user}: {self.name or 'app'}"

    @classmethod
    def issue(cls, user: User, name: str = "") -> str:
        raw = secrets.token_urlsafe(32)
        cls.objects.create(user=user, key_hash=_hash(raw), name=name[:100])
        return raw

    @classmethod
    def authenticate(cls, raw: str) -> ApiToken | None:
        if not raw or len(raw) > 200:
            return None
        cutoff = timezone.now() - timedelta(days=settings.API_TOKEN_IDLE_DAYS)
        token = (
            cls.objects.select_related("user")
            .filter(key_hash=_hash(raw), last_used_at__gte=cutoff, user__is_active=True)
            .first()
        )
        if token and timezone.now() - token.last_used_at > timedelta(hours=1):
            cls.objects.filter(pk=token.pk).update(last_used_at=timezone.now())
        return token

    @classmethod
    def revoke(cls, raw: str) -> None:
        cls.objects.filter(key_hash=_hash(raw)).delete()
