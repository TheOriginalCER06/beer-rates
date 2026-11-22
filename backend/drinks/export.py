"""Download drinks as CSV (opens in Excel with æ ø å) or XLSX."""

from __future__ import annotations

import csv
import io

from django.db.models import QuerySet
from django.utils import timezone
from openpyxl import Workbook
from openpyxl.utils import get_column_letter

from .models import Drink

COLUMNS = [
    ("id", "ID"),
    ("name", "Name"),
    ("producer", "Producer"),
    ("style", "Style"),
    ("abv", "ABV %"),
    ("country", "Country"),
    ("category", "Category"),
    ("container", "Container"),
    ("rating", "Rating"),
    ("would_have_again", "Would have again"),
    ("comment", "Comment"),
    ("location", "Location"),
    ("date_tried", "Date"),
    ("barcode", "Barcode"),
    ("created_by", "Added by"),
    ("created_at", "Added at"),
]
FORMATS = {
    "csv": "text/csv; charset=utf-8",
    "xlsx": "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
}


def _row(drink: Drink) -> list:
    values = []
    for column, _ in COLUMNS:
        if column == "created_by":
            values.append(drink.created_by.username if drink.created_by else "")
        elif column == "created_at":
            values.append(timezone.localtime(drink.created_at).replace(tzinfo=None))
        elif column == "category":
            values.append(drink.get_category_display())
        elif column == "container":
            values.append(drink.get_container_display() if drink.container else "")
        elif column == "abv":
            values.append(float(drink.abv) if drink.abv is not None else None)
        else:
            values.append(getattr(drink, column))
    return values


def _csv_cell(value):
    if value is None:
        return ""
    # Text starting with = + - @ would run as a formula in Excel.
    if isinstance(value, str) and value[:1] in ("=", "+", "-", "@"):
        return "'" + value
    return value


def export(drinks: QuerySet[Drink], fmt: str) -> bytes:
    drinks = drinks.select_related("created_by").order_by("-date_tried", "-created_at")
    if fmt == "csv":
        out = io.StringIO()
        writer = csv.writer(out, lineterminator="\r\n")
        writer.writerow([title for _, title in COLUMNS])
        for drink in drinks:
            writer.writerow([_csv_cell(v) for v in _row(drink)])
        # BOM, so Excel reads the file as UTF-8.
        return ("\ufeff" + out.getvalue()).encode("utf-8")

    book = Workbook()
    sheet = book.active
    sheet.title = "Drinks"
    sheet.append([title for _, title in COLUMNS])
    for drink in drinks:
        sheet.append(_row(drink))
    sheet.freeze_panes = "A2"
    for index, (column, title) in enumerate(COLUMNS, start=1):
        width = 40 if column == "comment" else max(10, len(title) + 2)
        sheet.column_dimensions[get_column_letter(index)].width = width
    out = io.BytesIO()
    book.save(out)
    return out.getvalue()


def filename(fmt: str) -> str:
    return f"drinks-{timezone.localdate().isoformat()}.{fmt}"
