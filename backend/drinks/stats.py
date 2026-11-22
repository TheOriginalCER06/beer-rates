"""Statistics for the Stats page: for everyone, one user, and/or one year."""

from __future__ import annotations

from dataclasses import dataclass, field

from django.db.models import Avg, Count, Q, QuerySet
from django.db.models.functions import ExtractYear, TruncMonth

from .models import Drink


@dataclass
class Bucket:
    label: str
    count: int
    avg_rating: float | None = None


@dataclass
class UserBucket:
    user_id: int | None
    username: str
    count: int
    avg_rating: float | None


@dataclass
class Summary:
    total: int = 0
    avg_rating: float | None = None
    would_have_again_pct: int | None = None
    unique_producers: int = 0
    unique_countries: int = 0
    with_photo: int = 0
    rating_distribution: list[int] = field(default_factory=lambda: [0] * 10)
    by_category: list[Bucket] = field(default_factory=list)
    by_container: list[Bucket] = field(default_factory=list)
    top_styles: list[Bucket] = field(default_factory=list)
    top_countries: list[Bucket] = field(default_factory=list)
    top_producers: list[Bucket] = field(default_factory=list)
    monthly: list[Bucket] = field(default_factory=list)
    by_user: list[UserBucket] = field(default_factory=list)
    top_drinks: list[Drink] = field(default_factory=list)
    years: list[int] = field(default_factory=list)


def _round(value) -> float | None:
    return round(float(value), 1) if value is not None else None


def _grouped(queryset: QuerySet, column: str, limit: int | None = 10) -> list[Bucket]:
    rows = (
        queryset.exclude(**{column: ""})
        .values(column)
        .annotate(n=Count("id"), avg=Avg("rating"))
        .order_by("-n", "-avg", column)
    )
    if limit:
        rows = rows[:limit]
    return [Bucket(label=row[column], count=row["n"], avg_rating=_round(row["avg"])) for row in rows]


def build(drinks: QuerySet[Drink], *, user_id: int | None = None, year: int | None = None) -> Summary:
    """`drinks` is the visible queryset; it's narrowed to the user and year here."""
    base = Drink.objects.filter(pk__in=drinks.values("pk"))
    if user_id:
        base = base.filter(created_by_id=user_id)
    years = sorted(
        {y for y in base.annotate(y=ExtractYear("date_tried")).values_list("y", flat=True) if y}, reverse=True
    )
    if year:
        base = base.filter(date_tried__year=year)

    totals = base.aggregate(
        total=Count("id"),
        avg=Avg("rating"),
        again=Count("id", filter=Q(would_have_again=True)),
        photos=Count("id", filter=~Q(photo="")),
    )
    total = totals["total"]
    summary = Summary(total=total, years=years)
    if not total:
        return summary

    summary.avg_rating = _round(totals["avg"])
    summary.would_have_again_pct = round(100 * totals["again"] / total)
    summary.with_photo = totals["photos"]
    summary.unique_producers = base.exclude(producer="").values("producer").distinct().count()
    summary.unique_countries = base.exclude(country="").values("country").distinct().count()
    for row in base.values("rating").annotate(n=Count("id")):
        summary.rating_distribution[row["rating"] - 1] = row["n"]
    summary.by_category = _grouped(base, "category", limit=None)
    summary.by_container = _grouped(base, "container", limit=None)
    summary.top_styles = _grouped(base, "style")
    summary.top_countries = _grouped(base, "country")
    summary.top_producers = _grouped(base, "producer")
    months = (
        base.annotate(month=TruncMonth("date_tried"))
        .values("month")
        .annotate(n=Count("id"), avg=Avg("rating"))
        .order_by("-month")[:12]
    )
    summary.monthly = [
        Bucket(label=row["month"].strftime("%Y-%m"), count=row["n"], avg_rating=_round(row["avg"]))
        for row in reversed(list(months))
    ]
    users = (
        base.values("created_by_id", "created_by__username")
        .annotate(n=Count("id"), avg=Avg("rating"))
        .order_by("-n", "created_by__username")
    )
    summary.by_user = [
        UserBucket(
            user_id=row["created_by_id"],
            username=row["created_by__username"] or "",
            count=row["n"],
            avg_rating=_round(row["avg"]),
        )
        for row in users
    ]
    summary.top_drinks = list(base.select_related("created_by").order_by("-rating", "-date_tried", "-id")[:5])
    return summary
