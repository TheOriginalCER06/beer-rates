import sys
from datetime import timedelta

from django.core.management.base import BaseCommand
from django.utils import timezone

from notifications.models import WorkerHeartbeat
from notifications.worker import worker_is_healthy


class Command(BaseCommand):
    help = "Exit with status 1 if the worker hasn't recorded a heartbeat recently (for Docker health checks)."

    def handle(self, *args, **options):
        heartbeat = WorkerHeartbeat.objects.filter(pk=1).first()
        if worker_is_healthy(heartbeat):
            age = timezone.now() - heartbeat.last_seen
            self.stdout.write(f"ok: last heartbeat {age / timedelta(seconds=1):.0f}s ago")
            return
        self.stderr.write(
            "unhealthy: " + (f"last heartbeat {heartbeat.last_seen}" if heartbeat else "no heartbeat yet")
        )
        sys.exit(1)
