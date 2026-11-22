"""
The background worker (`manage.py run_worker`, the `worker` service): sends queued emails and
pushes, and tidies up once an hour (expired look-up cache, unused app logins, old rate limits).
"""

from __future__ import annotations

import logging
import threading
from datetime import timedelta

from django.conf import settings
from django.db import close_old_connections
from django.utils import timezone

from . import push, services
from .models import WorkerHeartbeat

logger = logging.getLogger(__name__)

CLEANUP_INTERVAL = timedelta(hours=1)


def heartbeat_max_age() -> timedelta:
    return timedelta(seconds=max(60, settings.WORKER_POLL_SECONDS * 15))


def worker_is_healthy(heartbeat: WorkerHeartbeat | None = None) -> bool:
    if heartbeat is None:
        heartbeat = WorkerHeartbeat.objects.filter(pk=1).first()
    return heartbeat is not None and timezone.now() - heartbeat.last_seen <= heartbeat_max_age()


def cleanup() -> None:
    from accounts.models import ApiToken, RateLimit
    from drinks.models import LookupCache

    now = timezone.now()
    LookupCache.objects.filter(expires_at__lt=now).delete()
    ApiToken.objects.filter(last_used_at__lt=now - timedelta(days=settings.API_TOKEN_IDLE_DAYS)).delete()
    RateLimit.objects.filter(window_started__lt=now - timedelta(days=1)).delete()


class Worker:
    def __init__(self) -> None:
        self._stop = threading.Event()
        self._last_cleanup = timezone.now() - CLEANUP_INTERVAL

    def stop(self, *_args) -> None:
        logger.info("Worker stopping")
        self._stop.set()

    def tick(self) -> None:
        WorkerHeartbeat.objects.update_or_create(pk=1, defaults={"last_seen": timezone.now()})
        services.send_pending()
        push.send_pending()
        if timezone.now() - self._last_cleanup >= CLEANUP_INTERVAL:
            cleanup()
            self._last_cleanup = timezone.now()

    def run_forever(self) -> None:
        logger.info("Worker started (poll every %ss)", settings.WORKER_POLL_SECONDS)
        while not self._stop.is_set():
            close_old_connections()
            try:
                self.tick()
            except Exception:  # noqa: BLE001 - keep running; the next tick tries again
                logger.exception("Worker tick failed")
            self._stop.wait(settings.WORKER_POLL_SECONDS)
