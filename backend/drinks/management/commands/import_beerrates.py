"""
Import everything from the old Node.js app (SQLite + photos folder).

    python manage.py import_beerrates /import            # the old data folder (beers.db, photos/)
    python manage.py import_beerrates /import/old.tar.gz # or a backup of it
    python manage.py import_beerrates /import --dry-run  # show what would happen, change nothing

Users keep their usernames, passwords (the old bcrypt hashes are accepted and upgraded at the next
login), roles and active state; `local_admin` becomes a superuser. Drinks keep their dates, who
added them and their photos. The public view and look-up settings are copied too.

Running it again is safe: rows imported before (by their old id) are skipped, so it can be repeated
to pick up drinks added to the old app since. scripts/import-old.sh runs this inside Docker.
"""

from __future__ import annotations

import shutil
import sqlite3
import tarfile
import tempfile
from datetime import UTC, date, datetime
from pathlib import Path

from django.core.management.base import BaseCommand, CommandError
from django.db import transaction
from django.utils import timezone

from accounts.models import Role, User
from core.errors import AppError
from drinks import photos
from drinks.models import Category, Container, Drink, SiteSettings

CATEGORIES = {
    "beer": Category.BEER,
    "wine": Category.WINE,
    "cocktail": Category.COCKTAIL,
    "alcohol free": Category.ALCOHOL_FREE,
    "alcohol-free": Category.ALCOHOL_FREE,
    "alkoholfri": Category.ALCOHOL_FREE,
    "other": Category.OTHER,
}
CONTAINERS = {
    "bottle": Container.BOTTLE,
    "can": Container.CAN,
    "draft": Container.DRAFT,
    "draught": Container.DRAFT,
    "cask": Container.DRAFT,
    "glass": Container.GLASS,
}
ROLES = {"admin": Role.ADMIN, "contributor": Role.CONTRIBUTOR, "viewer": Role.VIEWER}
SETTINGS = ["public_view", "lookup_enabled", "lookup_openbrewerydb", "lookup_thecocktaildb", "lookup_openfoodfacts"]


def _utc(text: str | None) -> datetime:
    """SQLite's datetime('now') is UTC without a zone: '2026-06-01 18:30:00'."""
    if not text:
        return timezone.now()
    for fmt in ("%Y-%m-%d %H:%M:%S", "%Y-%m-%dT%H:%M:%S.%fZ", "%Y-%m-%dT%H:%M:%SZ", "%Y-%m-%d"):
        try:
            return datetime.strptime(text, fmt).replace(tzinfo=UTC)
        except ValueError:
            continue
    return timezone.now()


def _date(text: str | None, fallback: datetime) -> date:
    try:
        return date.fromisoformat((text or "")[:10])
    except ValueError:
        return timezone.localtime(fallback).date()


def _text(value, limit: int) -> str:
    return str(value).strip()[:limit] if value is not None else ""


class Command(BaseCommand):
    help = "Import users, drinks, photos and settings from the old Node.js app's data folder or backup."

    def add_arguments(self, parser):
        parser.add_argument("source", help="Folder with beers.db (and photos/), or a .tar.gz of it")
        parser.add_argument("--dry-run", action="store_true", help="Show what would be imported, then roll back")
        parser.add_argument("--no-photos", action="store_true", help="Skip the photos")

    def handle(self, source, dry_run=False, no_photos=False, **options):
        with tempfile.TemporaryDirectory() as tmp:
            db_path, photo_dir = self._prepare(Path(source), Path(tmp))
            connection = sqlite3.connect(db_path)
            connection.row_factory = sqlite3.Row
            try:
                with transaction.atomic():
                    self._import(connection, photo_dir, no_photos, dry_run)
                    if dry_run:
                        self.stdout.write(self.style.WARNING("Dry run: nothing was saved."))
                        transaction.set_rollback(True)
            finally:
                connection.close()

    # --- Finding the data ------------------------------------------------------------------

    def _prepare(self, source: Path, tmp: Path) -> tuple[Path, Path]:
        """
        (database, photo folder). The database and its WAL files are copied to a temporary folder,
        since SQLite may need to write to them and the source can be a read-only mount.
        """
        if source.is_file() and source.name.endswith((".tar.gz", ".tgz", ".tar")):
            with tarfile.open(source) as archive:
                archive.extractall(tmp / "archive", filter="data")
            matches = sorted((tmp / "archive").rglob("beers.db"))
            if not matches:
                raise CommandError(f"No beers.db in {source}")
            return matches[0], matches[0].parent / "photos"
        if source.is_file() and source.name.endswith(".db"):
            source = source.parent
        if not (source / "beers.db").is_file():
            raise CommandError(f"No beers.db in {source}")
        for name in ("beers.db", "beers.db-wal", "beers.db-shm"):
            if (source / name).is_file():
                shutil.copy2(source / name, tmp / name)
        return tmp / "beers.db", source / "photos"

    # --- Importing ---------------------------------------------------------------------------

    def _tables(self, connection) -> set[str]:
        return {row[0] for row in connection.execute("SELECT name FROM sqlite_master WHERE type='table'")}

    def _import(self, connection, photo_dir: Path, no_photos: bool, dry_run: bool = False) -> None:
        tables = self._tables(connection)
        if "beers" not in tables:
            raise CommandError("This doesn't look like the old app's database (no `beers` table).")
        users = self._import_users(connection) if "users" in tables else {}
        if "settings" in tables:
            self._import_settings(connection)
        self._import_drinks(connection, users, photo_dir, no_photos, dry_run)

    def _import_users(self, connection) -> dict[int, User]:
        by_old_id: dict[int, User] = {}
        created = skipped = 0
        for row in connection.execute("SELECT * FROM users ORDER BY id"):
            old_id = row["id"]
            user = User.objects.filter(legacy_id=old_id).first()
            if user is None:
                user = User.objects.filter(username__iexact=row["username"]).first()
                if user is not None:
                    # Same name already here (e.g. the admin from DJANGO_SUPERUSER_*): link, don't overwrite.
                    if user.legacy_id is None:
                        user.legacy_id = old_id
                        user.save(update_fields=["legacy_id"])
                    skipped += 1
                    by_old_id[old_id] = user
                    continue
                password = row["password"] or ""
                user = User(
                    username=_text(row["username"], 150),
                    role=ROLES.get((row["role"] or "").lower(), Role.VIEWER),
                    is_active=bool(row["active"]),
                    is_approved=True,
                    legacy_id=old_id,
                    is_superuser=row["username"] == "local_admin",
                    date_joined=_utc(row["created_at"]),
                )
                # bcryptjs hashes ($2a$/$2b$) work with Django's BCryptPasswordHasher as "bcrypt$<hash>".
                user.password = f"bcrypt${password}" if password.startswith("$2") else "!"
                user.save()
                created += 1
            else:
                skipped += 1
            by_old_id[old_id] = user
        self.stdout.write(f"Users: {created} imported, {skipped} already here.")
        return by_old_id

    def _import_settings(self, connection) -> None:
        values = {row["key"]: row["value"] for row in connection.execute("SELECT key, value FROM settings")}
        site = SiteSettings.load()
        changed = []
        for key in SETTINGS:
            if key in values:
                setattr(site, key, values[key] == "true")
                changed.append(f"{key}={values[key]}")
        if "lookup_vivino" in values:
            site.lookup_vivino = values["lookup_vivino"] == "true"
            changed.append(f"lookup_vivino={values['lookup_vivino']}")
        site.save()
        self.stdout.write(f"Settings: {', '.join(changed) or 'none found'}.")

    def _import_drinks(
        self, connection, users: dict[int, User], photo_dir: Path, no_photos: bool, dry_run: bool = False
    ) -> None:
        columns = {row[1] for row in connection.execute("PRAGMA table_info(beers)")}
        created = skipped = photo_count = 0
        missing_photos = []
        for row in connection.execute("SELECT * FROM beers ORDER BY id"):
            data = {c: row[c] for c in columns}
            if Drink.objects.filter(legacy_id=data["id"]).exists():
                skipped += 1
                continue
            created_at = _utc(data.get("created_at"))
            abv = data.get("abv")
            try:
                abv = round(float(abv), 1) if abv not in (None, "") else None
            except (TypeError, ValueError):
                abv = None
            if abv is not None and not 0 <= abv <= 100:
                abv = None
            category = CATEGORIES.get(_text(data.get("category"), 40).lower(), Category.OTHER)
            container = _text(data.get("container"), 40).lower()
            drink = Drink(
                legacy_id=data["id"],
                name=_text(data.get("name"), 200) or "?",
                producer=_text(data.get("brewery"), 200),
                style=_text(data.get("style"), 100),
                abv=abv,
                country=_text(data.get("country"), 100),
                category=category,
                container=CONTAINERS.get(container, Container.OTHER if container else ""),
                rating=min(10, max(1, int(data.get("rating") or 5))),
                comment=_text(data.get("comment"), 5000),
                location=_text(data.get("location"), 200),
                date_tried=_date(data.get("date_tried"), created_at),
                would_have_again=bool(data.get("would_buy_again")),
                created_by=users.get(data.get("created_by")),
            )
            drink.save()
            # auto_now_add ignores the value on create; set the original time afterwards.
            Drink.objects.filter(pk=drink.pk).update(created_at=created_at)
            created += 1

            photo_path = data.get("photo_path")
            if photo_path and not no_photos:
                file = photo_dir / Path(photo_path).name
                if file.is_file() and dry_run:
                    # The database is rolled back after a dry run, but files would stay: only check.
                    photo_count += 1
                elif file.is_file():
                    try:
                        photos.save_photo(drink, file.read_bytes())
                        photo_count += 1
                    except AppError as exc:
                        missing_photos.append(f"{file.name} ({exc.message})")
                else:
                    missing_photos.append(f"{file.name} (not found)")
        self.stdout.write(f"Drinks: {created} imported ({photo_count} with photos), {skipped} already here.")
        if missing_photos:
            self.stdout.write(self.style.WARNING("Photos not imported: " + ", ".join(missing_photos)))
        self.stdout.write(self.style.SUCCESS("Import finished."))
