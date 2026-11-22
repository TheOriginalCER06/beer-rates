"""Who may see and change drinks, and creating/updating them (shared by GraphQL and the REST views)."""

from __future__ import annotations

from dataclasses import dataclass
from datetime import date
from decimal import Decimal, InvalidOperation

from django.db import IntegrityError, transaction
from django.db.models import Count, Exists, F, OuterRef, Q, QuerySet
from django.db.models.functions import Lower
from django.utils import timezone

from accounts.models import User
from core.errors import AppError

from . import photos
from .models import Category, Cheers, Container, Drink, SiteSettings

TEXT_LIMITS = {"name": 200, "producer": 200, "style": 100, "country": 100, "location": 200, "barcode": 32}
COMMENT_LIMIT = 5000


def active_user(user) -> User | None:
    return user if user is not None and user.is_authenticated and user.is_active else None


def can_view(user) -> bool:
    """Approved users always; everyone else (also logged-in, unapproved users) only with public viewing on."""
    user = active_user(user)
    if user is not None and user.is_approved:
        return True
    return SiteSettings.load().public_view


def require_view(user) -> None:
    if not can_view(user):
        if active_user(user) is None:
            raise AppError("NOT_AUTHENTICATED", "You must be logged in.")
        raise AppError("NOT_APPROVED", "Your account is waiting for admin approval.")


def can_manage(user, drink: Drink) -> bool:
    user = active_user(user)
    if user is None or not user.is_approved:
        return False
    if user.is_admin:
        return True
    return user.can_add_drinks and drink.created_by_id == user.pk


def require_can_add(user) -> User:
    user = active_user(user)
    if user is None:
        raise AppError("NOT_AUTHENTICATED", "You must be logged in.")
    if not user.is_approved:
        raise AppError("NOT_APPROVED", "Your account is waiting for admin approval.")
    if not user.can_add_drinks:
        raise AppError("FORBIDDEN", "Your account can only view drinks.")
    return user


def visible_drinks(user) -> QuerySet[Drink]:
    """All drinks with cheers counts (and whether `user` cheered), if the user may see them."""
    require_view(user)
    queryset = Drink.objects.select_related("created_by").annotate(cheers_count=Count("cheers", distinct=True))
    user = active_user(user)
    if user is not None:
        queryset = queryset.annotate(cheered=Exists(Cheers.objects.filter(drink=OuterRef("pk"), user=user)))
    return queryset


def get_drink(user, drink_id) -> Drink:
    try:
        return visible_drinks(user).get(pk=int(drink_id))
    except (Drink.DoesNotExist, ValueError, TypeError) as exc:
        raise AppError("NOT_FOUND", "Drink not found.") from exc


def get_managed_drink(user, drink_id) -> Drink:
    if active_user(user) is None:
        raise AppError("NOT_AUTHENTICATED", "You must be logged in.")
    drink = get_drink(user, drink_id)
    if not can_manage(user, drink):
        raise AppError("FORBIDDEN", "You can only change your own drinks.")
    return drink


@dataclass
class DrinkData:
    """Validated input for a drink (from DrinkInput)."""

    name: str
    rating: int
    category: str = Category.BEER
    producer: str = ""
    style: str = ""
    abv: Decimal | None = None
    country: str = ""
    container: str = ""
    comment: str = ""
    location: str = ""
    date_tried: date | None = None
    would_have_again: bool = False
    barcode: str = ""


def clean_data(raw: dict) -> DrinkData:
    """Trim, validate and convert the fields of a drink. Raises AppError with a code per problem."""
    data = {k: v for k, v in raw.items() if v is not None}
    for field, limit in TEXT_LIMITS.items():
        if field in data:
            data[field] = str(data[field]).strip()[:limit]
    if "comment" in data:
        data["comment"] = str(data["comment"]).strip()[:COMMENT_LIMIT]
    if not data.get("name"):
        raise AppError("NAME_REQUIRED", "The drink needs a name.")
    try:
        rating = int(data.get("rating"))
    except (TypeError, ValueError) as exc:
        raise AppError("INVALID_RATING", "Rating must be 1–10.") from exc
    if not 1 <= rating <= 10:
        raise AppError("INVALID_RATING", "Rating must be 1–10.")
    data["rating"] = rating
    if data.get("category", Category.BEER) not in Category.values:
        raise AppError("INVALID_INPUT", "Unknown category.")
    if data.get("container", "") not in ("", *Container.values):
        raise AppError("INVALID_INPUT", "Unknown container.")
    if data.get("abv") not in (None, ""):
        try:
            abv = Decimal(str(data["abv"]).replace(",", ".")).quantize(Decimal("0.1"))
        except InvalidOperation as exc:
            raise AppError("INVALID_ABV", "ABV must be a number between 0 and 100.") from exc
        if not 0 <= abv <= 100:
            raise AppError("INVALID_ABV", "ABV must be a number between 0 and 100.")
        data["abv"] = abv
    else:
        data["abv"] = None
    if data.get("date_tried") and data["date_tried"] > timezone.localdate():
        raise AppError("DATE_IN_FUTURE", "The date can't be in the future.")
    if "barcode" in data:
        data["barcode"] = "".join(ch for ch in data["barcode"] if ch.isalnum())
    return DrinkData(**data)


def create_drink(user, raw: dict, client_id: str = "") -> Drink:
    """Create a drink. With a client_id, retrying the same create returns the first one."""
    user = require_can_add(user)
    client_id = (client_id or "").strip()[:64]
    if client_id:
        existing = Drink.objects.filter(created_by=user, client_id=client_id).first()
        if existing:
            return existing
    data = clean_data(raw)
    drink = Drink(**vars(data), created_by=user, client_id=client_id)
    if drink.date_tried is None:
        drink.date_tried = timezone.localdate()
    try:
        with transaction.atomic():
            drink.save()
    except IntegrityError:
        # The same client_id raced in from a second request.
        existing = Drink.objects.filter(created_by=user, client_id=client_id).first()
        if existing is None:
            raise
        return existing
    from notifications.services import notify_new_drink

    notify_new_drink(drink)
    return drink


def update_drink(user, drink_id, raw: dict) -> Drink:
    drink = get_managed_drink(user, drink_id)
    data = clean_data(raw)
    for field, value in vars(data).items():
        if field == "date_tried" and value is None:
            continue
        setattr(drink, field, value)
    drink.save()
    return drink


def delete_drink(user, drink_id) -> None:
    drink = get_managed_drink(user, drink_id)
    photos.delete_files(drink)
    drink.delete()


def set_cheers(user, drink_id, on: bool) -> Drink:
    user = active_user(user)
    if user is None:
        raise AppError("NOT_AUTHENTICATED", "You must be logged in.")
    if not user.is_approved:
        raise AppError("NOT_APPROVED", "Your account is waiting for admin approval.")
    drink = get_drink(user, drink_id)
    if on:
        _, created = Cheers.objects.get_or_create(drink=drink, user=user)
        if created and drink.created_by_id and drink.created_by_id != user.pk:
            from notifications.services import notify_cheers

            notify_cheers(drink, user)
    else:
        Cheers.objects.filter(drink=drink, user=user).delete()
    return get_drink(user, drink.pk)


def filter_drinks(
    queryset: QuerySet[Drink],
    *,
    search: str = "",
    category: str | None = None,
    style: str = "",
    min_rating: int | None = None,
    max_rating: int | None = None,
    user_id: int | None = None,
    date_from: date | None = None,
    date_to: date | None = None,
    would_have_again: bool | None = None,
    has_photo: bool | None = None,
) -> QuerySet[Drink]:
    if search:
        for word in search.split()[:5]:
            queryset = queryset.filter(
                Q(name__icontains=word)
                | Q(producer__icontains=word)
                | Q(style__icontains=word)
                | Q(comment__icontains=word)
                | Q(country__icontains=word)
                | Q(location__icontains=word)
            )
    if category:
        queryset = queryset.filter(category=category)
    if style:
        queryset = queryset.filter(style__iexact=style)
    if min_rating:
        queryset = queryset.filter(rating__gte=min_rating)
    if max_rating:
        queryset = queryset.filter(rating__lte=max_rating)
    if user_id:
        queryset = queryset.filter(created_by_id=user_id)
    if date_from:
        queryset = queryset.filter(date_tried__gte=date_from)
    if date_to:
        queryset = queryset.filter(date_tried__lte=date_to)
    if would_have_again is not None:
        queryset = queryset.filter(would_have_again=would_have_again)
    if has_photo is not None:
        queryset = queryset.exclude(photo="") if has_photo else queryset.filter(photo="")
    return queryset


SORTS = {"DATE", "ADDED", "RATING", "NAME", "ABV"}


def sort_drinks(queryset: QuerySet[Drink], sort: str, descending: bool) -> QuerySet[Drink]:
    def order(expression):
        return expression.desc(nulls_last=True) if descending else expression.asc(nulls_last=True)

    if sort == "ADDED":
        ordering = [order(F("created_at"))]
    elif sort == "RATING":
        ordering = [order(F("rating")), F("date_tried").desc()]
    elif sort == "NAME":
        ordering = [order(Lower("name")), F("date_tried").desc()]
    elif sort == "ABV":
        ordering = [order(F("abv")), F("date_tried").desc()]
    else:
        ordering = [order(F("date_tried")), order(F("created_at"))]
    return queryset.order_by(*ordering, "-id")


def similar_drinks(user, name: str, exclude_id=None, limit: int = 5) -> list[Drink]:
    """Earlier drinks with the same or a very similar name, newest first ("you've had this before")."""
    name = (name or "").strip()
    if len(name) < 3:
        return []
    queryset = visible_drinks(user).filter(Q(name__iexact=name) | Q(name__icontains=name))
    if exclude_id:
        queryset = queryset.exclude(pk=exclude_id)
    return list(queryset.order_by("-date_tried", "-created_at")[:limit])


FIELD_VALUE_FIELDS = {"PRODUCER": "producer", "COUNTRY": "country", "LOCATION": "location", "STYLE": "style"}


def field_values(user, field: str, limit: int = 200) -> list[str]:
    """Values already used for a field, most used first (autocomplete in the form)."""
    require_view(user)
    column = FIELD_VALUE_FIELDS[field]
    rows = Drink.objects.exclude(**{column: ""}).values(column).annotate(n=Count("id")).order_by("-n", column)[:limit]
    return [row[column] for row in rows]
