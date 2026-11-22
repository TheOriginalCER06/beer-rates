"""
Drink photos: every upload is decoded, turned upright (EXIF orientation), shrunk and saved again
as JPEG, which also drops all metadata (GPS position, camera serial). A small thumbnail is made
for the lists. Files get random names, are never changed, and are served by nginx at /media/.
"""

from __future__ import annotations

import io
import logging
import uuid
from urllib.parse import urlsplit

import requests
from django.conf import settings
from django.core.files.base import ContentFile
from django.core.files.storage import default_storage
from PIL import Image, ImageOps, UnidentifiedImageError

from core.errors import AppError

from .models import Drink

logger = logging.getLogger(__name__)

FULL_SIZE = 2000
THUMB_SIZE = 640
# Refuse absurd images before decoding them (a 15 MB file can unpack to gigabytes).
Image.MAX_IMAGE_PIXELS = 60_000_000

# Photos offered by the online look-ups. Only these hosts can be fetched, so the import can't be
# used to reach other servers (SSRF).
IMPORT_HOSTS = {
    "www.thecocktaildb.com",
    "thecocktaildb.com",
    "images.openfoodfacts.org",
    "static.openfoodfacts.org",
    "images.vivino.com",
}
IMPORT_MAX_BYTES = 8 * 1024 * 1024


def _encode(image: Image.Image, size: int, quality: int) -> bytes:
    copy = image.copy()
    copy.thumbnail((size, size), Image.Resampling.LANCZOS)
    out = io.BytesIO()
    copy.save(out, "JPEG", quality=quality, optimize=True, progressive=True)
    return out.getvalue()


def _open(data: bytes) -> Image.Image:
    try:
        image = Image.open(io.BytesIO(data))
        image.load()
    except (UnidentifiedImageError, OSError, Image.DecompressionBombError, ValueError) as exc:
        raise AppError("INVALID_IMAGE", "That file isn't a photo the server can read.") from exc
    image = ImageOps.exif_transpose(image)
    if image.mode != "RGB":
        # Transparent PNGs get a white background instead of black.
        background = Image.new("RGB", image.size, "white")
        rgba = image.convert("RGBA")
        background.paste(rgba, mask=rgba.split()[-1])
        image = background
    return image


def _delete(names: list[str]) -> None:
    for name in names:
        if name:
            try:
                default_storage.delete(name)
            except OSError:
                logger.warning("Could not delete %s", name)


def delete_files(drink: Drink) -> None:
    _delete([drink.photo.name, drink.thumbnail.name])


def save_photo(drink: Drink, data: bytes) -> Drink:
    """Store `data` (any common image format) as the drink's photo, replacing the old one."""
    if len(data) > settings.MAX_PHOTO_UPLOAD_BYTES:
        raise AppError("IMAGE_TOO_LARGE", "The photo is too large.")
    image = _open(data)
    full = _encode(image, FULL_SIZE, 85)
    thumb = _encode(image, THUMB_SIZE, 78)

    old = [drink.photo.name, drink.thumbnail.name]
    stem = uuid.uuid4().hex
    drink.photo.save(f"{stem}.jpg", ContentFile(full), save=False)
    drink.thumbnail.save(f"{stem}_t.jpg", ContentFile(thumb), save=False)
    drink.save(update_fields=["photo", "photo_width", "photo_height", "thumbnail", "updated_at"])
    _delete(old)
    return drink


def remove_photo(drink: Drink) -> Drink:
    delete_files(drink)
    drink.photo = ""
    drink.thumbnail = ""
    drink.photo_width = drink.photo_height = None
    drink.save(update_fields=["photo", "photo_width", "photo_height", "thumbnail", "updated_at"])
    return drink


def import_from_url(drink: Drink, url: str) -> Drink:
    """Fetch a look-up result's picture (allowlisted hosts only) and use it as the photo."""
    parts = urlsplit(url or "")
    if parts.scheme != "https" or parts.hostname not in IMPORT_HOSTS:
        raise AppError("URL_NOT_ALLOWED", "Photos can only be imported from the drink databases.")
    try:
        response = requests.get(
            url,
            timeout=settings.LOOKUP_TIMEOUT_SECONDS,
            headers={"User-Agent": settings.LOOKUP_USER_AGENT},
            stream=True,
            allow_redirects=False,
        )
        response.raise_for_status()
        if not response.headers.get("Content-Type", "").startswith("image/"):
            raise AppError("INVALID_IMAGE", "That link isn't a picture.")
        data = b""
        for chunk in response.iter_content(64 * 1024):
            data += chunk
            if len(data) > IMPORT_MAX_BYTES:
                raise AppError("IMAGE_TOO_LARGE", "The picture is too large.")
    except requests.RequestException as exc:
        raise AppError("IMPORT_FAILED", "Could not fetch the picture.") from exc
    return save_photo(drink, data)
