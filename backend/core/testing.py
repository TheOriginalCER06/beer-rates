"""Test helpers: GraphQL calls through the real view, users, photos and a temporary MEDIA_ROOT."""

from __future__ import annotations

import io
import json
import shutil
import tempfile

from django.test import Client, TestCase, override_settings
from PIL import Image

from accounts.models import Role, User
from drinks.models import Drink, SiteSettings


def make_user(username="ola", password="Sterkt-passord-42", role=Role.CONTRIBUTOR, approved=True, **extra) -> User:
    user = User(username=username, role=role, is_approved=approved, email=extra.pop("email", f"{username}@example.com"))
    for key, value in extra.items():
        setattr(user, key, value)
    user.set_password(password)
    user.save()
    return user


def make_drink(user=None, **fields) -> Drink:
    defaults = {"name": "Testøl", "rating": 7, "category": "beer", "date_tried": "2026-05-01"}
    return Drink.objects.create(created_by=user, **{**defaults, **fields})


def jpeg_bytes(width=800, height=600, color=(200, 120, 30), exif_orientation: int | None = None) -> bytes:
    image = Image.new("RGB", (width, height), color)
    out = io.BytesIO()
    if exif_orientation:
        exif = Image.Exif()
        exif[0x0112] = exif_orientation
        exif[0x8825] = {2: (59.0, 54.0, 0.0)}  # GPS info that must be stripped
        image.save(out, "JPEG", exif=exif)
    else:
        image.save(out, "JPEG")
    return out.getvalue()


class GraphQLTestCase(TestCase):
    """TestCase with `self.gql(...)`, and photos saved to a throwaway folder."""

    @classmethod
    def setUpClass(cls):
        cls._media = tempfile.mkdtemp(prefix="beer-media-")
        cls._media_override = override_settings(MEDIA_ROOT=cls._media)
        cls._media_override.enable()
        super().setUpClass()

    @classmethod
    def tearDownClass(cls):
        super().tearDownClass()
        cls._media_override.disable()
        shutil.rmtree(cls._media, ignore_errors=True)

    def setUp(self):
        self.client = Client(enforce_csrf_checks=False)
        SiteSettings.load()

    def gql(self, query: str, variables: dict | None = None, *, client: Client | None = None, token: str | None = None):
        headers = {"HTTP_AUTHORIZATION": f"Bearer {token}"} if token else {}
        response = (client or self.client).post(
            "/graphql/",
            data=json.dumps({"query": query, "variables": variables or {}}),
            content_type="application/json",
            **headers,
        )
        self.assertEqual(response.status_code, 200, response.content)
        return response.json()

    def ok(self, query: str, variables: dict | None = None, **kwargs) -> dict:
        body = self.gql(query, variables, **kwargs)
        self.assertNotIn("errors", body, body.get("errors"))
        return body["data"]

    def error_code(self, query: str, variables: dict | None = None, **kwargs) -> str:
        body = self.gql(query, variables, **kwargs)
        self.assertIn("errors", body, body)
        return body["errors"][0]["extensions"]["code"]

    def login(self, user: User, client: Client | None = None) -> None:
        (client or self.client).force_login(user)
