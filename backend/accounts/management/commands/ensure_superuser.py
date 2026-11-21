import os

from django.core.management.base import BaseCommand

from accounts.models import User


class Command(BaseCommand):
    help = "Create the first admin from DJANGO_SUPERUSER_* env vars if it doesn't exist yet (idempotent)."

    def handle(self, *args, **options):
        username = os.environ.get("DJANGO_SUPERUSER_USERNAME")
        password = os.environ.get("DJANGO_SUPERUSER_PASSWORD")
        email = os.environ.get("DJANGO_SUPERUSER_EMAIL", "")
        if not username or not password:
            self.stdout.write("DJANGO_SUPERUSER_USERNAME/PASSWORD not set; skipping admin creation.")
            return
        if User.objects.filter(username=username).exists():
            return
        User.objects.create_superuser(username=username, email=email, password=password)
        self.stdout.write(self.style.SUCCESS(f"Created admin user '{username}'."))
