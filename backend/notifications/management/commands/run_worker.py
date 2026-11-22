import signal

from django.core.management.base import BaseCommand

from notifications.worker import Worker


class Command(BaseCommand):
    help = "Run the background worker that sends emails and push notifications."

    def handle(self, *args, **options):
        worker = Worker()
        signal.signal(signal.SIGINT, worker.stop)
        signal.signal(signal.SIGTERM, worker.stop)
        worker.run_forever()
