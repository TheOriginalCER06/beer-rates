import io
import sqlite3
import tarfile
import tempfile
from pathlib import Path
from unittest import mock

import bcrypt
from django.core.management import call_command
from django.test import Client
from PIL import Image

from accounts.models import ApiToken, Role, User
from core.testing import GraphQLTestCase, jpeg_bytes, make_drink, make_user
from drinks import lookup
from drinks.models import Drink, LookupCache, SiteSettings


class PhotoTests(GraphQLTestCase):
    def setUp(self):
        super().setUp()
        self.kari = make_user("kari")
        self.drink = make_drink(self.kari)

    def upload(self, data: bytes, client=None, **headers):
        return (client or self.client).post(
            f"/api/drinks/{self.drink.pk}/photo/",
            {"photo": io.BytesIO(data)},
            **headers,
        )

    def test_upload_turns_upright_strips_metadata_and_makes_thumbnail(self):
        self.login(self.kari)
        # Orientation 6 = the camera was turned 90°: the stored photo must be portrait.
        response = self.upload(jpeg_bytes(1600, 1200, exif_orientation=6))
        self.assertEqual(response.status_code, 200, response.content)
        body = response.json()
        self.assertTrue(body["photoUrl"].startswith("/media/drinks/"))
        self.drink.refresh_from_db()
        self.assertEqual((self.drink.photo_width, self.drink.photo_height), (1200, 1600))
        with Image.open(self.drink.photo.path) as image:
            self.assertEqual(image.size, (1200, 1600))
            self.assertNotIn(0x8825, image.getexif())  # no GPS
        with Image.open(self.drink.thumbnail.path) as thumb:
            self.assertLessEqual(max(thumb.size), 640)

    def test_replacing_and_deleting_removes_files(self):
        self.login(self.kari)
        self.upload(jpeg_bytes())
        self.drink.refresh_from_db()
        first = Path(self.drink.photo.path)
        self.upload(jpeg_bytes(color=(10, 10, 10)))
        self.assertFalse(first.exists())
        self.drink.refresh_from_db()
        second = Path(self.drink.photo.path)
        self.ok("mutation($id: ID!) { deleteDrink(id: $id) }", {"id": self.drink.pk})
        self.assertFalse(second.exists())

    def test_upload_with_app_token_and_permissions(self):
        token = ApiToken.issue(self.kari, "phone")
        app = Client(enforce_csrf_checks=True)
        self.assertEqual(self.upload(jpeg_bytes(), client=app, HTTP_AUTHORIZATION=f"Bearer {token}").status_code, 200)
        # Someone else's drink: refused.
        per_token = ApiToken.issue(make_user("per"), "phone")
        response = self.upload(jpeg_bytes(), client=app, HTTP_AUTHORIZATION=f"Bearer {per_token}")
        self.assertEqual(response.status_code, 403)
        # Anonymous app: refused. (An anonymous browser is already stopped by CSRF.)
        response = self.upload(jpeg_bytes(), client=app, HTTP_AUTHORIZATION="Bearer anonymous")
        self.assertEqual(response.status_code, 401)
        self.assertEqual(self.upload(jpeg_bytes(), client=Client(enforce_csrf_checks=True)).status_code, 403)

    def test_not_an_image(self):
        self.login(self.kari)
        response = self.upload(b"definitely not a jpeg")
        self.assertEqual(response.status_code, 400)
        self.assertEqual(response.json()["error"]["code"], "INVALID_IMAGE")

    def test_import_only_from_allowed_hosts(self):
        self.login(self.kari)
        mutation = "mutation($id: ID!, $url: String!) { importPhoto(drinkId: $id, url: $url) { photoUrl } }"
        code = self.error_code(mutation, {"id": self.drink.pk, "url": "https://169.254.169.254/latest"})
        self.assertEqual(code, "URL_NOT_ALLOWED")
        fake = mock.Mock(status_code=200, headers={"Content-Type": "image/jpeg"})
        fake.iter_content.return_value = [jpeg_bytes()]
        with mock.patch("drinks.photos.requests.get", return_value=fake):
            data = self.ok(mutation, {"id": self.drink.pk, "url": "https://images.openfoodfacts.org/x.jpg"})
        self.assertTrue(data["importPhoto"]["photoUrl"])

    def test_export(self):
        make_drink(self.kari, name="=cmd|' /C calc'!A0", comment="Kjempegod, med æøå")
        response = self.client.get("/api/export/drinks.csv")
        self.assertEqual(response.status_code, 200)
        text = response.content.decode("utf-8")
        self.assertTrue(text.startswith("﻿"))
        self.assertIn("'=cmd", text)
        self.assertIn("æøå", text)
        self.assertEqual(self.client.get("/api/export/drinks.xlsx").status_code, 200)
        SiteSettings.objects.filter(pk=1).update(public_view=False)
        self.assertEqual(Client().get("/api/export/drinks.csv").status_code, 401)


def _response(json_body, status=200):
    response = mock.Mock(status_code=status)
    response.json.return_value = json_body
    response.raise_for_status = mock.Mock()
    return response


class LookupTests(GraphQLTestCase):
    def setUp(self):
        super().setUp()
        self.login(make_user("kari"))

    def test_beer_search_is_cached(self):
        off = {"products": [{"code": "7041011050207", "product_name": "Ringnes Pils", "brands": "Ringnes,Carlsberg"}]}
        obdb = [{"name": "Ringnes Bryggeri", "country": "Norway", "city": "Oslo"}]

        def fake_get(url, **kwargs):
            return _response(off if "openfoodfacts" in url else obdb)

        query = '{ lookup(category: BEER, query: "ringnes") { source name producer barcode } }'
        with mock.patch("drinks.lookup.requests.get", side_effect=fake_get) as get:
            data = self.ok(query)["lookup"]
            self.ok(query)
        self.assertEqual(get.call_count, 2)  # second search came from the cache
        self.assertEqual(
            data[0],
            {"source": "openfoodfacts", "name": "Ringnes Pils", "producer": "Ringnes", "barcode": "7041011050207"},
        )
        self.assertEqual(data[1]["producer"], "Ringnes Bryggeri")
        self.assertEqual(LookupCache.objects.count(), 2)

    def test_disabled_provider_is_not_called(self):
        SiteSettings.objects.filter(pk=1).update(lookup_openbrewerydb=False, lookup_openfoodfacts=False)
        with mock.patch("drinks.lookup.requests.get") as get:
            self.assertEqual(self.ok('{ lookup(category: BEER, query: "x y") { name } }')["lookup"], [])
        get.assert_not_called()

    def test_failing_provider_is_skipped(self):
        def fake_get(url, **kwargs):
            if "openbrewerydb" in url:
                raise lookup.requests.ConnectionError("down")
            return _response({"products": [{"product_name": "Lervig Lucky Jack"}]})

        with mock.patch("drinks.lookup.requests.get", side_effect=fake_get):
            data = self.ok('{ lookup(category: BEER, query: "lucky jack") { name } }')["lookup"]
        self.assertEqual([r["name"] for r in data], ["Lervig Lucky Jack"])

    def test_barcode(self):
        product = {
            "status": 1,
            "product": {
                "code": "5701234567890",
                "product_name": "Nøgne Ø Imperial Stout",
                "brands": "Nøgne Ø",
                "categories": "Beverages, Alcoholic beverages, Beers, Stouts",
                "alcohol_value": "9",
            },
        }
        make_drink(User.objects.get(username="kari"), name="Imperial Stout", barcode="5701234567890")
        with mock.patch("drinks.lookup.requests.get", return_value=_response(product)):
            data = self.ok(
                '{ lookupBarcode(code: "5701234567890") '
                "{ code product { name abv category producer } previous { name } } }"
            )["lookupBarcode"]
        self.assertEqual(
            data["product"], {"name": "Nøgne Ø Imperial Stout", "abv": 9.0, "category": "BEER", "producer": "Nøgne Ø"}
        )
        self.assertEqual(data["previous"], [{"name": "Imperial Stout"}])

    def test_viewers_cannot_search(self):
        self.login(make_user("ser", role=Role.VIEWER))
        self.assertEqual(self.error_code('{ lookup(category: BEER, query: "pils") { name } }'), "FORBIDDEN")


OLD_SCHEMA = """
CREATE TABLE beers (id INTEGER PRIMARY KEY AUTOINCREMENT, name TEXT NOT NULL, brewery TEXT, style TEXT, abv REAL,
  country TEXT, rating INTEGER NOT NULL, comment TEXT, location TEXT, date_tried TEXT NOT NULL DEFAULT (date('now')),
  would_buy_again INTEGER NOT NULL DEFAULT 0, created_at TEXT NOT NULL DEFAULT (datetime('now')),
  category TEXT NOT NULL DEFAULT 'Beer', photo_path TEXT, created_by INTEGER, container TEXT);
CREATE TABLE users (id INTEGER PRIMARY KEY AUTOINCREMENT, username TEXT NOT NULL UNIQUE COLLATE NOCASE,
  password TEXT NOT NULL, role TEXT NOT NULL DEFAULT 'viewer', active INTEGER NOT NULL DEFAULT 1,
  created_at TEXT NOT NULL DEFAULT (datetime('now')));
CREATE TABLE settings (key TEXT PRIMARY KEY, value TEXT NOT NULL);
CREATE TABLE sessions (sid TEXT PRIMARY KEY, data TEXT NOT NULL, expires TEXT NOT NULL);
CREATE TABLE lookup_cache (key TEXT PRIMARY KEY, body TEXT NOT NULL, expires_at INTEGER NOT NULL);
"""


class ImportTests(GraphQLTestCase):
    def make_old_data(self, folder: Path) -> None:
        (folder / "photos").mkdir()
        (folder / "photos" / "2.jpg").write_bytes(jpeg_bytes(900, 1600))
        db = sqlite3.connect(folder / "beers.db")
        db.executescript(OLD_SCHEMA)
        hashed = bcrypt.hashpw(b"admin-passord-1", bcrypt.gensalt(4)).decode().replace("$2b$", "$2a$", 1)
        db.executemany(
            "INSERT INTO users (id, username, password, role, active, created_at) VALUES (?,?,?,?,?,?)",
            [
                (1, "local_admin", hashed, "admin", 1, "2025-01-01 10:00:00"),
                (2, "kari", hashed, "contributor", 1, "2025-02-01 10:00:00"),
                (3, "borte", hashed, "viewer", 0, "2025-03-01 10:00:00"),
            ],
        )
        db.executemany(
            "INSERT INTO beers (id, name, brewery, style, abv, country, rating, comment, location, date_tried,"
            " would_buy_again, created_at, category, photo_path, created_by, container) VALUES"
            " (?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?)",
            [
                (
                    1,
                    "Pils",
                    "Ringnes",
                    "Pilsner",
                    4.7,
                    "Norge",
                    6,
                    "Grei",
                    "Hjemme",
                    "2025-06-01",
                    1,
                    "2025-06-01 18:00:00",
                    "Beer",
                    None,
                    2,
                    "Can",
                ),
                (
                    2,
                    "Barolo",
                    "Fontanafredda",
                    "Red Wine",
                    14,
                    "Italia",
                    9,
                    "",
                    "",
                    "2025-07-01",
                    0,
                    "2025-07-01 19:00:00",
                    "Wine",
                    "/photos/2.jpg",
                    1,
                    "Glass",
                ),
                (
                    3,
                    "Virgin Mojito",
                    None,
                    "Mocktail",
                    None,
                    None,
                    8,
                    None,
                    None,
                    "2025-08-01",
                    0,
                    "2025-08-01 20:00:00",
                    "Alcohol Free",
                    "/photos/404.jpg",
                    None,
                    None,
                ),
            ],
        )
        db.executemany(
            "INSERT INTO settings VALUES (?, ?)",
            [("public_view", "false"), ("lookup_vivino", "false"), ("session_secret", "x")],
        )
        db.commit()
        db.close()

    def test_import_folder_and_rerun(self):
        with tempfile.TemporaryDirectory() as tmp:
            folder = Path(tmp)
            self.make_old_data(folder)
            out = io.StringIO()
            call_command("import_beerrates", str(folder), stdout=out)
            self.assertIn("Drinks: 3 imported (1 with photos)", out.getvalue())
            self.assertIn("404.jpg (not found)", out.getvalue())
            # Again: nothing new.
            out = io.StringIO()
            call_command("import_beerrates", str(folder), stdout=out)
            self.assertIn("Drinks: 0 imported (0 with photos), 3 already here.", out.getvalue())

        admin = User.objects.get(username="local_admin")
        self.assertTrue(admin.is_superuser and admin.is_admin and admin.is_staff)
        kari = User.objects.get(username="kari")
        self.assertEqual(kari.role, Role.CONTRIBUTOR)
        self.assertTrue(kari.check_password("admin-passord-1"))
        self.assertFalse(User.objects.get(username="borte").is_active)

        pils = Drink.objects.get(legacy_id=1)
        self.assertEqual(
            (pils.producer, pils.container, pils.created_by, pils.would_have_again), ("Ringnes", "can", kari, True)
        )
        self.assertEqual(pils.created_at.isoformat(), "2025-06-01T18:00:00+00:00")
        barolo = Drink.objects.get(legacy_id=2)
        self.assertEqual((barolo.category, barolo.photo_height), ("wine", 1600))
        mojito = Drink.objects.get(legacy_id=3)
        self.assertEqual((mojito.category, mojito.abv, mojito.created_by), ("alcohol_free", None, None))

        site = SiteSettings.load()
        self.assertFalse(site.public_view)
        self.assertFalse(site.lookup_vivino)
        self.assertTrue(site.lookup_openfoodfacts)

    def test_import_tarball_and_dry_run(self):
        with tempfile.TemporaryDirectory() as tmp:
            folder = Path(tmp) / "data"
            folder.mkdir()
            self.make_old_data(folder)
            archive = Path(tmp) / "old.tar.gz"
            with tarfile.open(archive, "w:gz") as tar:
                tar.add(folder, arcname=".")
            call_command("import_beerrates", str(archive), "--dry-run", stdout=io.StringIO())
            self.assertFalse(Drink.objects.exists())
            call_command("import_beerrates", str(archive), stdout=io.StringIO())
            self.assertEqual(Drink.objects.count(), 3)
            self.assertEqual(Drink.objects.exclude(photo="").count(), 1)

    def test_existing_admin_is_linked_not_overwritten(self):
        existing = make_user("local_admin", password="Nytt-passord-77", role=Role.ADMIN)
        with tempfile.TemporaryDirectory() as tmp:
            self.make_old_data(Path(tmp))
            call_command("import_beerrates", tmp, stdout=io.StringIO())
        existing.refresh_from_db()
        self.assertTrue(existing.check_password("Nytt-passord-77"))
        self.assertEqual(existing.legacy_id, 1)
        self.assertEqual(Drink.objects.get(legacy_id=2).created_by, existing)

    def test_dry_run_writes_no_photo_files(self):
        with tempfile.TemporaryDirectory() as tmp:
            self.make_old_data(Path(tmp))
            out = io.StringIO()
            call_command("import_beerrates", tmp, "--dry-run", stdout=out)
        self.assertIn("(1 with photos)", out.getvalue())
        media = Path(self._media) / "drinks"
        self.assertFalse(media.exists() and any(media.iterdir()))
