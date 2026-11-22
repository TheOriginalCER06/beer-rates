"""
Push notifications: Web Push (RFC 8030/8291/8292) for browsers and the installed web app, and
Firebase Cloud Messaging (notifications/fcm.py) for the Android app.

Pushes are queued per device (PushMessage) and sent by the worker. The server's VAPID key pair is
made on first use and kept in SiteSettings, so Web Push needs no setup. Browsers get the public key
through GraphQL (`pushConfig`).
"""

from __future__ import annotations

import base64
import json
import logging
import time
from datetime import timedelta
from urllib.parse import urlsplit

import http_ece
import requests
from cryptography.hazmat.primitives import serialization
from cryptography.hazmat.primitives.asymmetric import ec
from django.conf import settings
from django.db import transaction
from django.utils import timezone
from py_vapid import Vapid02

from . import fcm
from .models import PushMessage, PushSubscription

logger = logging.getLogger(__name__)

MAX_ATTEMPTS = 4
TTL_SECONDS = 24 * 60 * 60


def _b64url(data: bytes) -> str:
    return base64.urlsafe_b64encode(data).rstrip(b"=").decode()


def _b64url_decode(text: str) -> bytes:
    return base64.urlsafe_b64decode(text + "=" * (-len(text) % 4))


def _vapid() -> Vapid02:
    from drinks.models import SiteSettings

    with transaction.atomic():
        site = SiteSettings.objects.select_for_update().get_or_create(pk=1)[0]
        if not site.vapid_private_key:
            vapid = Vapid02()
            vapid.generate_keys()
            site.vapid_private_key = vapid.private_pem().decode()
            site.save(update_fields=["vapid_private_key"])
    return Vapid02.from_pem(site.vapid_private_key.encode())


def public_key() -> str:
    """The VAPID public key, as browsers want it for PushManager.subscribe (base64url, raw point)."""
    raw = _vapid().public_key.public_bytes(serialization.Encoding.X962, serialization.PublicFormat.UncompressedPoint)
    return _b64url(raw)


def queue(user, *, title: str, body: str, path: str, tag: str) -> list[PushMessage]:
    """Queue a push to each of the user's devices."""
    subscriptions = list(PushSubscription.objects.filter(user=user))
    if not subscriptions or not user.is_active:
        return []
    now = timezone.now()
    return PushMessage.objects.bulk_create(
        PushMessage(subscription=s, title=title[:200], body=body[:300], url=path[:500], tag=tag, next_attempt_at=now)
        for s in subscriptions
    )


def deliver_web(subscription: PushSubscription, payload: dict) -> int:
    """Encrypt and POST one Web Push. Returns the push service's HTTP status. Raises on network errors."""
    server_key = ec.generate_private_key(ec.SECP256R1())
    body = http_ece.encrypt(
        json.dumps(payload).encode(),
        private_key=server_key,
        dh=_b64url_decode(subscription.p256dh),
        auth_secret=_b64url_decode(subscription.auth),
        version="aes128gcm",
    )
    endpoint = urlsplit(subscription.endpoint)
    sender = settings.DEFAULT_FROM_EMAIL.rsplit("<", 1)[-1].rstrip(">").strip() or "noreply@localhost"
    headers = _vapid().sign(
        {
            "aud": f"{endpoint.scheme}://{endpoint.netloc}",
            "exp": int(time.time()) + 12 * 60 * 60,
            "sub": f"mailto:{sender}",
        }
    )
    headers.update(
        {
            "TTL": str(TTL_SECONDS),
            "Content-Encoding": "aes128gcm",
            "Content-Type": "application/octet-stream",
            "Urgency": "normal",
        }
    )
    response = requests.post(subscription.endpoint, data=body, headers=headers, timeout=10)
    return response.status_code


def _deliver(message: PushMessage) -> int | None:
    """Send one message. Returns the HTTP status, or None when the device is gone (and removed)."""
    subscription = message.subscription
    url = settings.SITE_URL + message.url
    if subscription.kind == PushSubscription.Kind.FCM:
        try:
            return fcm.send(subscription.endpoint, message.title, message.body, message.url, message.tag)
        except fcm.Unregistered:
            status = 410
    else:
        payload = {"title": message.title, "body": message.body, "url": url, "tag": message.tag}
        status = deliver_web(subscription, payload)
    if status in (404, 410):
        # The device dropped the subscription (app removed, permission revoked): forget it.
        logger.info("Push subscription %s is gone (%s); removing it", subscription.pk, status)
        subscription.delete()
        return None
    return status


def _send(message: PushMessage) -> bool:
    claimed = PushMessage.objects.filter(
        pk=message.pk, sent_at__isnull=True, next_attempt_at=message.next_attempt_at
    ).update(next_attempt_at=timezone.now() + timedelta(minutes=2))
    if not claimed:
        return False
    try:
        status = _deliver(message)
    except Exception as exc:  # noqa: BLE001 - network trouble: retry later
        status, error = 0, str(exc)
    else:
        error = f"HTTP {status}"
    if status is None:
        return False
    if 200 <= status < 300:
        message.sent_at = timezone.now()
        message.attempts += 1
        message.save(update_fields=["sent_at", "attempts"])
        PushSubscription.objects.filter(pk=message.subscription_id).update(last_success_at=message.sent_at)
        return True
    message.attempts += 1
    message.last_error = error[:500]
    message.next_attempt_at = timezone.now() + timedelta(minutes=2**message.attempts)
    message.save(update_fields=["attempts", "last_error", "next_attempt_at"])
    logger.warning("Push %s failed (attempt %d): %s", message.pk, message.attempts, error)
    return False


def send_pending(limit: int = 50) -> int:
    """Send queued pushes that are due. Returns how many went out. Never raises."""
    now = timezone.now()
    PushMessage.objects.filter(created_at__lt=now - timedelta(days=7)).delete()
    due = (
        PushMessage.objects.filter(sent_at__isnull=True, attempts__lt=MAX_ATTEMPTS, next_attempt_at__lte=now)
        .select_related("subscription")
        .order_by("created_at")[:limit]
    )
    return sum(_send(m) for m in due)


def send_test(user) -> int:
    """Push a test notification to all of the user's devices right away. Returns how many got it."""
    body = (
        "Push notifications work on this device." if user.language == "en" else "Push-varsler virker på denne enheten."
    )
    sent = 0
    for subscription in PushSubscription.objects.filter(user=user):
        message = PushMessage.objects.create(
            subscription=subscription,
            title="Beer Rates",
            body=body,
            url="/profile",
            tag="test",
            next_attempt_at=timezone.now(),
        )
        sent += _send(message)
    return sent
