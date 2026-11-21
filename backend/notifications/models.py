from django.db import models


class OutgoingEmail(models.Model):
    """Email outbox. Web requests only queue emails; the worker sends them (with retries)."""

    to = models.EmailField()
    subject = models.CharField(max_length=300)
    body = models.TextField(help_text="Plain-text version.")
    html_body = models.TextField(blank=True, help_text="HTML version, sent alongside the plain text.")
    kind = models.CharField(max_length=50, help_text="Template name, e.g. password_reset.")
    # Bodies of sensitive emails (password reset links) are cleared once sent.
    sensitive = models.BooleanField(default=False)
    created_at = models.DateTimeField(auto_now_add=True)
    next_attempt_at = models.DateTimeField(db_index=True)
    attempts = models.PositiveSmallIntegerField(default=0)
    sent_at = models.DateTimeField(null=True, blank=True, db_index=True)
    last_error = models.TextField(blank=True)

    class Meta:
        ordering = ["-created_at"]

    def __str__(self) -> str:
        return f"{self.kind} → {self.to}"


class PushSubscription(models.Model):
    """One browser or phone that gets push notifications for a user."""

    class Kind(models.TextChoices):
        WEB = "web", "Web Push (browser)"
        FCM = "fcm", "Firebase (Android app)"

    user = models.ForeignKey("accounts.User", on_delete=models.CASCADE, related_name="push_subscriptions")
    kind = models.CharField(max_length=10, choices=Kind.choices, default=Kind.WEB)
    # Web Push: the push service URL. FCM: the device's registration token.
    endpoint = models.CharField(max_length=1000, unique=True)
    p256dh = models.CharField(max_length=200, blank=True)
    auth = models.CharField(max_length=100, blank=True)
    user_agent = models.CharField(max_length=300, blank=True)
    created_at = models.DateTimeField(auto_now_add=True)
    last_success_at = models.DateTimeField(null=True, blank=True)

    def __str__(self) -> str:
        return f"{self.user} ({self.kind}): {self.user_agent[:40] or self.endpoint[:40]}"


class PushMessage(models.Model):
    """Push outbox, like OutgoingEmail: queued by web requests, sent by the worker."""

    subscription = models.ForeignKey(PushSubscription, on_delete=models.CASCADE, related_name="messages")
    title = models.CharField(max_length=200)
    body = models.CharField(max_length=300, blank=True)
    url = models.CharField(max_length=500, help_text="Path in the app, e.g. /drinks/12.")
    tag = models.CharField(max_length=50, blank=True)
    created_at = models.DateTimeField(auto_now_add=True)
    next_attempt_at = models.DateTimeField(db_index=True)
    attempts = models.PositiveSmallIntegerField(default=0)
    sent_at = models.DateTimeField(null=True, blank=True, db_index=True)
    last_error = models.TextField(blank=True)

    def __str__(self) -> str:
        return f"{self.tag} → {self.subscription_id}"


class WorkerHeartbeat(models.Model):
    """Updated by the worker on every loop (single row), for Docker's health check and the admin page."""

    last_seen = models.DateTimeField()

    def __str__(self) -> str:
        return f"Worker last seen {self.last_seen}"
