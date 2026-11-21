"""
Simple fixed-window rate limiting backed by the database (shared by all gunicorn workers).

    limit = Limit("login-user", max_hits=10, window=timedelta(minutes=15))
    limit.check(username)      # raises AppError("RATE_LIMITED") if the budget is used up
    limit.hit(username)        # count one attempt
    limit.reset(username)      # e.g. after a successful login
"""

from __future__ import annotations

import math
from dataclasses import dataclass
from datetime import timedelta

from django.conf import settings
from django.db import transaction
from django.utils import timezone

from core.errors import AppError

from .models import RateLimit


@dataclass(frozen=True)
class Limit:
    name: str
    max_hits: int
    window: timedelta

    def _key(self, subject: str) -> str:
        return f"{self.name}:{subject.lower()}"[:255]

    def _retry_after(self, bucket: RateLimit) -> int:
        remaining = bucket.window_started + self.window - timezone.now()
        return max(1, math.ceil(remaining.total_seconds()))

    def check(self, subject: str) -> None:
        bucket = RateLimit.objects.filter(key=self._key(subject)).first()
        if bucket and timezone.now() - bucket.window_started < self.window and bucket.count >= self.max_hits:
            seconds = self._retry_after(bucket)
            raise AppError(
                "RATE_LIMITED",
                f"Too many attempts. Try again in {math.ceil(seconds / 60)} minute(s).",
                minutes=math.ceil(seconds / 60),
            )

    def hit(self, subject: str) -> None:
        now = timezone.now()
        with transaction.atomic():
            bucket, _ = RateLimit.objects.select_for_update().get_or_create(
                key=self._key(subject), defaults={"count": 0, "window_started": now}
            )
            if now - bucket.window_started >= self.window:
                bucket.count, bucket.window_started = 0, now
            bucket.count += 1
            bucket.save()

    def check_and_hit(self, subject: str) -> None:
        self.check(subject)
        self.hit(subject)

    def reset(self, subject: str) -> None:
        RateLimit.objects.filter(key=self._key(subject)).delete()


LOGIN_PER_USER = Limit("login-user", max_hits=10, window=timedelta(minutes=15))
LOGIN_PER_IP = Limit("login-ip", max_hits=30, window=timedelta(minutes=15))
SIGNUP_PER_IP = Limit("signup-ip", max_hits=5, window=timedelta(hours=1))
RESET_REQUEST_PER_IP = Limit("reset-ip", max_hits=5, window=timedelta(hours=1))
RESET_REQUEST_PER_EMAIL = Limit("reset-email", max_hits=3, window=timedelta(hours=1))
RESET_CONFIRM_PER_IP = Limit("reset-confirm-ip", max_hits=10, window=timedelta(hours=1))
PASSWORD_CHECK_PER_USER = Limit("password-check", max_hits=10, window=timedelta(minutes=15))
# Look-ups are cached, but each miss is a request to someone else's free API.
LOOKUP_PER_USER = Limit("lookup", max_hits=60, window=timedelta(minutes=1))
PHOTO_IMPORT_PER_USER = Limit("photo-import", max_hits=30, window=timedelta(minutes=10))
# Test pushes go out through third-party push services.
TEST_PUSH_PER_USER = Limit("test-push", max_hits=5, window=timedelta(minutes=10))


def client_ip(request) -> str:
    """
    The real client IP. Each trusted proxy appends to X-Forwarded-For, so the client is the
    entry TRUSTED_PROXY_COUNT positions from the end (earlier entries can be spoofed).
    """
    forwarded = [ip.strip() for ip in request.META.get("HTTP_X_FORWARDED_FOR", "").split(",") if ip.strip()]
    if forwarded:
        return forwarded[max(len(forwarded) - settings.TRUSTED_PROXY_COUNT, 0)]
    return request.META.get("REMOTE_ADDR", "unknown")
