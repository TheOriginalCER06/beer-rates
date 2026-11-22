"""
Search free online drink databases from the add/edit form. No API keys are needed.

Each provider can be turned off by admins (SiteSettings.lookup_*). Upstream responses are cached
in LookupCache for LOOKUP_CACHE_DAYS, so repeat searches cost no requests.

Every result has the same shape (`Result`): name, producer, style, abv, country, category,
thumbnail (an https URL), detail (one line of extra info) and barcode.
"""

from __future__ import annotations

import logging
import re
from concurrent.futures import ThreadPoolExecutor
from dataclasses import dataclass, field
from datetime import timedelta
from urllib.parse import quote

import requests
from django.conf import settings
from django.db import connections
from django.utils import timezone

from .models import Category, LookupCache, SiteSettings

logger = logging.getLogger(__name__)

OBDB_BASE = "https://api.openbrewerydb.org/v1"
CDB_BASE = "https://www.thecocktaildb.com/api/json/v1/1"  # "1" = the free public key
OFF_SEARCH = "https://world.openfoodfacts.org/cgi/search.pl"
OFF_PRODUCT = "https://world.openfoodfacts.org/api/v2/product/{code}.json"
VIVINO_BASE = "https://www.vivino.com/api/explore/explore"  # unofficial; parsed defensively

PROVIDERS = ("openbrewerydb", "thecocktaildb", "openfoodfacts", "vivino")
MAX_RESULTS = 15


@dataclass
class Result:
    source: str
    name: str
    producer: str | None = None
    style: str | None = None
    abv: float | None = None
    country: str | None = None
    category: str = Category.OTHER
    thumbnail: str | None = None
    detail: str | None = None
    barcode: str | None = None
    ingredients: list[str] = field(default_factory=list)


def _clean(value) -> str | None:
    return value.strip() if isinstance(value, str) and value.strip() else None


def _https(url) -> str | None:
    url = _clean(url)
    if url and url.startswith("//"):
        url = "https:" + url
    return url if url and url.startswith("https://") else None


def _number(value) -> float | None:
    try:
        number = float(str(value).replace(",", "."))
    except (TypeError, ValueError):
        return None
    return round(number, 1) if 0 <= number <= 100 else None


def _cached_json(key: str, url: str, headers: dict | None = None):
    key = key[:300]
    now = timezone.now()
    hit = LookupCache.objects.filter(key=key, expires_at__gt=now).first()
    if hit is not None:
        return hit.body
    response = requests.get(
        url,
        headers={"User-Agent": settings.LOOKUP_USER_AGENT, "Accept": "application/json", **(headers or {})},
        timeout=settings.LOOKUP_TIMEOUT_SECONDS,
    )
    response.raise_for_status()
    body = response.json()
    LookupCache.objects.update_or_create(
        key=key, defaults={"body": body, "expires_at": now + timedelta(days=settings.LOOKUP_CACHE_DAYS)}
    )
    return body


# --- Providers ---------------------------------------------------------------------------------


def search_breweries(query: str) -> list[Result]:
    """OpenBreweryDB: breweries (no beers or ABV, but the brewery and its country)."""
    rows = _cached_json(f"obdb:{query.lower()}", f"{OBDB_BASE}/breweries?by_name={quote(query)}&per_page=8")
    results = []
    for row in rows if isinstance(rows, list) else []:
        name = _clean(row.get("name"))
        if not name:
            continue
        detail = " · ".join(x for x in (_clean(row.get("city")), _clean(row.get("state_province"))) if x)
        results.append(
            Result(
                source="openbrewerydb",
                name=name,
                producer=name,
                country=_clean(row.get("country")),
                category=Category.BEER,
                detail=detail or _clean(row.get("brewery_type")),
            )
        )
    return results


def search_cocktails(query: str) -> list[Result]:
    """TheCocktailDB: cocktails with pictures and ingredients."""
    data = _cached_json(f"cdb:{query.lower()}", f"{CDB_BASE}/search.php?s={quote(query)}")
    drinks = data.get("drinks") if isinstance(data, dict) else None
    results = []
    for row in (drinks or [])[:10]:
        name = _clean(row.get("strDrink"))
        if not name:
            continue
        ingredients = [x for x in (_clean(row.get(f"strIngredient{i}")) for i in range(1, 16)) if x]
        alcohol_free = "non" in (row.get("strAlcoholic") or "").lower()
        results.append(
            Result(
                source="thecocktaildb",
                name=name,
                style=_clean(row.get("strCategory")),
                category=Category.ALCOHOL_FREE if alcohol_free else Category.COCKTAIL,
                thumbnail=_https(row.get("strDrinkThumb")),
                detail=", ".join(ingredients[:4]) or None,
                ingredients=ingredients,
            )
        )
    return results


def search_wines(query: str) -> list[Result]:
    """Vivino's unofficial explore API. Its format changes now and then, so fail soft."""
    try:
        data = _cached_json(
            f"vivino:{query.lower()}",
            f"{VIVINO_BASE}?q={quote(query)}&per_page=8",
            headers={"User-Agent": "Mozilla/5.0 (compatible; DrikkeVurderinger/2.0)"},
        )
    except (requests.RequestException, ValueError) as exc:
        logger.info("Vivino look-up failed: %s", exc)
        return []
    matches = (data.get("explore_vintage") or {}).get("matches") or data.get("matches") or []
    results = []
    for match in matches[:8] if isinstance(matches, list) else []:
        vintage = match.get("vintage") or match
        wine = vintage.get("wine") or match.get("wine") or {}
        name = _clean(vintage.get("name") or wine.get("name") or match.get("name"))
        if not name:
            continue
        region = wine.get("region") or {}
        year = vintage.get("year")
        average = (vintage.get("statistics") or {}).get("ratings_average")
        results.append(
            Result(
                source="vivino",
                name=name,
                producer=_clean((wine.get("winery") or {}).get("name") or (vintage.get("winery") or {}).get("name")),
                style=_clean((wine.get("style") or {}).get("varietal_name") or wine.get("type_name")),
                abv=_number(wine.get("alcohol")),
                country=_clean((region.get("country") or {}).get("name") or region.get("name")),
                category=Category.WINE,
                thumbnail=_https(
                    (vintage.get("image") or {}).get("location") or (wine.get("image") or {}).get("location")
                ),
                detail=f"{year}" if year else (f"★ {average}" if average else None),
            )
        )
    return results


def _off_result(product: dict, category: str) -> Result | None:
    name = _clean(product.get("product_name"))
    if not name:
        return None
    categories = [c.strip() for c in (product.get("categories") or "").split(",") if c.strip()]
    quantity = _clean(product.get("quantity"))
    return Result(
        source="openfoodfacts",
        name=name,
        producer=_clean((product.get("brands") or "").split(",")[0]),
        abv=_number(product.get("alcohol_value") or (product.get("nutriments") or {}).get("alcohol")),
        country=_clean((product.get("countries") or "").split(",")[0]),
        category=category,
        thumbnail=_https(product.get("image_front_small_url") or product.get("image_front_url")),
        detail=" · ".join(x for x in (quantity, categories[-1] if categories else None) if x) or None,
        barcode=_clean(product.get("code")),
    )


OFF_FIELDS = (
    "code,product_name,brands,countries,image_front_small_url,image_front_url,categories,alcohol_value,quantity"
)


def search_open_food_facts(query: str, category: str) -> list[Result]:
    """Open Food Facts: packaged products (bottles, cans) with photos and often ABV."""
    url = (
        f"{OFF_SEARCH}?search_terms={quote(query)}&search_simple=1&action=process&json=1&page_size=8"
        f"&fields={OFF_FIELDS}"
    )
    data = _cached_json(f"off:{query.lower()}", url)
    products = data.get("products") if isinstance(data, dict) else None
    return [r for r in (_off_result(p, category) for p in (products or [])[:8]) if r]


def guess_category(product: dict) -> str:
    text = " ".join(str(product.get(k) or "") for k in ("categories", "product_name", "categories_tags")).lower()
    alcohol = _number(product.get("alcohol_value") or (product.get("nutriments") or {}).get("alcohol"))
    if any(w in text for w in ("alcohol-free", "alkoholfri", "non-alcoholic", "sans alcool", "0.0%", "0,0%")):
        return Category.ALCOHOL_FREE
    if any(w in text for w in ("wine", "vin", "wein", "vino")):
        return Category.WINE
    if any(w in text for w in ("beer", "øl", "bier", "biere", "bière", "lager", "ale", "ipa", "stout")):
        return Category.ALCOHOL_FREE if alcohol is not None and alcohol <= 0.5 else Category.BEER
    return Category.OTHER


def lookup_barcode(code: str) -> Result | None:
    """A product by its barcode (EAN/UPC) in Open Food Facts, or None."""
    code = "".join(ch for ch in code or "" if ch.isdigit())
    site = SiteSettings.load()
    if not (8 <= len(code) <= 14) or not site.provider_on("openfoodfacts"):
        return None
    try:
        data = _cached_json(f"offcode:{code}", OFF_PRODUCT.format(code=code) + f"?fields={OFF_FIELDS},nutriments")
    except requests.HTTPError as exc:
        if exc.response is not None and exc.response.status_code == 404:
            return None
        raise
    product = data.get("product") if isinstance(data, dict) and data.get("status") in (1, "1") else None
    if not product:
        return None
    result = _off_result({**product, "code": product.get("code") or code}, guess_category(product))
    return result


# --- Search ---------------------------------------------------------------------------------------


def _tasks(category: str, query: str, site: SiteSettings):
    on = site.provider_on
    if category == Category.COCKTAIL:
        return [lambda: search_cocktails(query)] if on("thecocktaildb") else []
    tasks = []
    if category == Category.WINE:
        if on("vivino"):
            tasks.append(lambda: search_wines(query))
        if on("openfoodfacts"):
            tasks.append(lambda: search_open_food_facts(query, Category.WINE))
    elif category == Category.ALCOHOL_FREE:
        if on("thecocktaildb"):
            tasks.append(lambda: search_cocktails(query))
        if on("openfoodfacts"):
            tasks.append(lambda: search_open_food_facts(query, Category.ALCOHOL_FREE))
    elif category == Category.BEER:
        if on("openfoodfacts"):
            tasks.append(lambda: search_open_food_facts(query, Category.BEER))
        if on("openbrewerydb"):
            tasks.append(lambda: search_breweries(query))
    elif on("openfoodfacts"):
        tasks.append(lambda: search_open_food_facts(query, Category.OTHER))
    return tasks


def _in_thread(task):
    try:
        return task()
    except Exception as exc:  # noqa: BLE001 - one provider failing mustn't break the search
        return exc
    finally:
        # Each thread opened its own database connection (for the cache).
        connections.close_all()


def _run_all(tasks) -> list:
    """Run the providers at the same time (one at a time in tests, which share one database connection)."""
    if len(tasks) < 2 or settings.TESTING:
        outcomes = []
        for task in tasks:
            try:
                outcomes.append(task())
            except Exception as exc:  # noqa: BLE001
                outcomes.append(exc)
        return outcomes
    with ThreadPoolExecutor(max_workers=len(tasks)) as pool:
        return list(pool.map(_in_thread, tasks))


def search(category: str, query: str) -> list[Result]:
    """Search the providers that fit the category, at the same time. Failing providers are skipped."""
    query = re.sub(r"\s+", " ", query or "").strip()[:100]
    site = SiteSettings.load()
    if len(query) < 2 or not site.lookup_enabled:
        return []
    tasks = _tasks(category, query, site)
    results: list[Result] = []
    for outcome in _run_all(tasks):
        if isinstance(outcome, Exception):
            logger.info("Look-up provider failed: %s", outcome)
        else:
            results.extend(outcome)
    seen = set()
    unique = []
    for result in results:
        key = (result.source, result.name.lower(), (result.producer or "").lower())
        if key not in seen:
            seen.add(key)
            unique.append(result)
    return unique[:MAX_RESULTS]


def provider_status() -> dict[str, bool]:
    site = SiteSettings.load()
    return {name: site.provider_on(name) for name in PROVIDERS}
