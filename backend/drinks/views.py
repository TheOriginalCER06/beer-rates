"""Plain HTTP endpoints next to GraphQL: photo upload (multipart) and spreadsheet export."""

from __future__ import annotations

from django.conf import settings
from django.http import HttpResponse, JsonResponse
from django.views.decorators.http import require_GET, require_POST

from core.errors import AppError

from . import export, photos, services


def _error(exc: AppError, status: int = 400) -> JsonResponse:
    status = {"NOT_AUTHENTICATED": 401, "NOT_APPROVED": 403, "FORBIDDEN": 403, "NOT_FOUND": 404}.get(exc.code, status)
    return JsonResponse({"error": {"code": exc.code, "message": exc.message}}, status=status)


def photo_payload(drink) -> dict:
    return {
        "id": str(drink.pk),
        "photoUrl": drink.photo.url if drink.photo else None,
        "thumbnailUrl": drink.thumbnail.url if drink.thumbnail else None,
        "photoWidth": drink.photo_width,
        "photoHeight": drink.photo_height,
    }


@require_POST
def upload_photo(request, drink_id: int):
    """POST /api/drinks/<id>/photo/ with the image in the multipart field `photo`."""
    try:
        drink = services.get_managed_drink(request.user, drink_id)
        upload = request.FILES.get("photo")
        if upload is None:
            raise AppError("INVALID_IMAGE", "No photo in the request.")
        if upload.size > settings.MAX_PHOTO_UPLOAD_BYTES:
            raise AppError("IMAGE_TOO_LARGE", "The photo is too large.")
        photos.save_photo(drink, upload.read())
    except AppError as exc:
        return _error(exc)
    return JsonResponse(photo_payload(drink))


@require_GET
def export_drinks(request, fmt: str):
    """GET /api/export/drinks.<csv|xlsx>?user=<id> — what the visitor can see, optionally one user's."""
    if fmt not in export.FORMATS:
        return HttpResponse(status=404)
    try:
        drinks = services.visible_drinks(request.user)
    except AppError as exc:
        return _error(exc)
    user_id = request.GET.get("user", "")
    if user_id.isdigit():
        drinks = drinks.filter(created_by_id=int(user_id))
    response = HttpResponse(export.export(drinks, fmt), content_type=export.FORMATS[fmt])
    response["Content-Disposition"] = f'attachment; filename="{export.filename(fmt)}"'
    response["Cache-Control"] = "private, no-store"
    return response
