from __future__ import annotations

from datetime import date, datetime
from enum import Enum

import strawberry

from accounts.models import User
from drinks import lookup, stats
from drinks.models import Drink, SiteSettings


@strawberry.enum
class Language(Enum):
    EN = "en"
    NB = "nb"


@strawberry.enum
class Role(Enum):
    ADMIN = "admin"
    CONTRIBUTOR = "contributor"
    VIEWER = "viewer"


@strawberry.enum
class Category(Enum):
    BEER = "beer"
    WINE = "wine"
    COCKTAIL = "cocktail"
    ALCOHOL_FREE = "alcohol_free"
    OTHER = "other"


@strawberry.enum
class Container(Enum):
    BOTTLE = "bottle"
    CAN = "can"
    DRAFT = "draft"
    GLASS = "glass"
    OTHER = "other"


@strawberry.enum
class DrinkSort(Enum):
    DATE = "DATE"
    ADDED = "ADDED"
    RATING = "RATING"
    NAME = "NAME"
    ABV = "ABV"


@strawberry.enum
class FieldName(Enum):
    PRODUCER = "PRODUCER"
    COUNTRY = "COUNTRY"
    LOCATION = "LOCATION"
    STYLE = "STYLE"


@strawberry.type(name="User")
class UserType:
    id: strawberry.ID
    username: str
    email: str | None
    role: Role
    is_admin: bool
    is_approved: bool
    is_active: bool
    language: Language
    date_joined: datetime
    can_add_drinks: bool
    push_new_drinks: bool
    push_cheers: bool
    push_admin_new_signup: bool
    email_admin_new_signup: bool
    is_superuser: bool
    drink_count: int | None = None

    @classmethod
    def from_model(cls, user: User, drink_count: int | None = None) -> UserType:
        return cls(
            id=strawberry.ID(str(user.pk)),
            username=user.username,
            email=user.email,
            role=Role(user.role),
            is_admin=user.is_admin,
            is_approved=user.is_approved,
            is_active=user.is_active,
            language=Language(user.language),
            date_joined=user.date_joined,
            can_add_drinks=user.can_add_drinks,
            push_new_drinks=user.push_new_drinks,
            push_cheers=user.push_cheers,
            push_admin_new_signup=user.push_admin_new_signup,
            email_admin_new_signup=user.email_admin_new_signup,
            is_superuser=user.is_superuser,
            drink_count=drink_count,
        )


@strawberry.type(description="Who added a drink (public part of a user).")
class Person:
    id: strawberry.ID
    username: str


@strawberry.type(name="Drink")
class DrinkType:
    id: strawberry.ID
    name: str
    producer: str
    style: str
    abv: float | None
    country: str
    category: Category
    container: Container | None
    rating: int
    comment: str
    location: str
    date_tried: date
    would_have_again: bool
    barcode: str
    photo_url: str | None
    thumbnail_url: str | None
    photo_width: int | None
    photo_height: int | None
    created_by: Person | None
    created_at: datetime
    updated_at: datetime
    cheers_count: int
    cheered_by_me: bool
    can_edit: bool
    client_id: str | None

    @classmethod
    def from_model(cls, drink: Drink, viewer=None) -> DrinkType:
        from drinks.services import can_manage

        author = drink.created_by
        return cls(
            id=strawberry.ID(str(drink.pk)),
            name=drink.name,
            producer=drink.producer,
            style=drink.style,
            abv=float(drink.abv) if drink.abv is not None else None,
            country=drink.country,
            category=Category(drink.category),
            container=Container(drink.container) if drink.container else None,
            rating=drink.rating,
            comment=drink.comment,
            location=drink.location,
            date_tried=drink.date_tried,
            would_have_again=drink.would_have_again,
            barcode=drink.barcode,
            photo_url=drink.photo.url if drink.photo else None,
            thumbnail_url=drink.thumbnail.url if drink.thumbnail else None,
            photo_width=drink.photo_width,
            photo_height=drink.photo_height,
            created_by=Person(id=strawberry.ID(str(author.pk)), username=author.username) if author else None,
            created_at=drink.created_at,
            updated_at=drink.updated_at,
            cheers_count=drink.cheers_count if hasattr(drink, "cheers_count") else drink.cheers.count(),
            cheered_by_me=bool(getattr(drink, "cheered", False)),
            can_edit=can_manage(viewer, drink),
            client_id=drink.client_id or None,
        )


@strawberry.type
class DrinkPage:
    items: list[DrinkType]
    total: int
    has_more: bool


@strawberry.input
class DrinkInput:
    name: str
    rating: int
    category: Category = Category.BEER
    producer: str | None = None
    style: str | None = None
    abv: float | None = None
    country: str | None = None
    container: Container | None = None
    comment: str | None = None
    location: str | None = None
    date_tried: date | None = None
    would_have_again: bool = False
    barcode: str | None = None

    def to_dict(self) -> dict:
        data = {k: getattr(self, k) for k in self.__annotations__}
        data["category"] = self.category.value
        data["container"] = self.container.value if self.container else ""
        return data


@strawberry.input
class DrinkFilter:
    search: str | None = None
    category: Category | None = None
    style: str | None = None
    min_rating: int | None = None
    max_rating: int | None = None
    user_id: strawberry.ID | None = None
    mine: bool = False
    date_from: date | None = None
    date_to: date | None = None
    would_have_again: bool | None = None
    has_photo: bool | None = None


@strawberry.type(name="LookupResult")
class LookupResultType:
    source: str
    name: str
    producer: str | None
    style: str | None
    abv: float | None
    country: str | None
    category: Category
    thumbnail: str | None
    detail: str | None
    barcode: str | None

    @classmethod
    def from_result(cls, result: lookup.Result) -> LookupResultType:
        return cls(
            source=result.source,
            name=result.name,
            producer=result.producer,
            style=result.style,
            abv=result.abv,
            country=result.country,
            category=Category(result.category),
            thumbnail=result.thumbnail,
            detail=result.detail,
            barcode=result.barcode,
        )


@strawberry.type
class BarcodeResult:
    code: str
    product: LookupResultType | None
    previous: list[DrinkType] = strawberry.field(description="Drinks already logged with this barcode.")


@strawberry.type
class Bucket:
    label: str
    count: int
    avg_rating: float | None


@strawberry.type
class UserBucket:
    user_id: strawberry.ID | None
    username: str
    count: int
    avg_rating: float | None


@strawberry.type(name="Stats")
class StatsType:
    total: int
    avg_rating: float | None
    would_have_again_pct: int | None
    unique_producers: int
    unique_countries: int
    with_photo: int
    rating_distribution: list[int] = strawberry.field(description="Count per rating, index 0 = rating 1.")
    by_category: list[Bucket]
    by_container: list[Bucket]
    top_styles: list[Bucket]
    top_countries: list[Bucket]
    top_producers: list[Bucket]
    monthly: list[Bucket]
    by_user: list[UserBucket]
    top_drinks: list[DrinkType]
    years: list[int]

    @classmethod
    def from_summary(cls, summary: stats.Summary, viewer=None) -> StatsType:
        def buckets(items):
            return [Bucket(label=b.label, count=b.count, avg_rating=b.avg_rating) for b in items]

        return cls(
            total=summary.total,
            avg_rating=summary.avg_rating,
            would_have_again_pct=summary.would_have_again_pct,
            unique_producers=summary.unique_producers,
            unique_countries=summary.unique_countries,
            with_photo=summary.with_photo,
            rating_distribution=summary.rating_distribution,
            by_category=buckets(summary.by_category),
            by_container=buckets(summary.by_container),
            top_styles=buckets(summary.top_styles),
            top_countries=buckets(summary.top_countries),
            top_producers=buckets(summary.top_producers),
            monthly=buckets(summary.monthly),
            by_user=[
                UserBucket(
                    user_id=strawberry.ID(str(u.user_id)) if u.user_id else None,
                    username=u.username,
                    count=u.count,
                    avg_rating=u.avg_rating,
                )
                for u in summary.by_user
            ],
            top_drinks=[DrinkType.from_model(d, viewer) for d in summary.top_drinks],
            years=summary.years,
        )


@strawberry.type
class Providers:
    openbrewerydb: bool
    thecocktaildb: bool
    openfoodfacts: bool
    vivino: bool


@strawberry.type(description="What every visitor needs to know about this site (no login needed).")
class SiteConfig:
    version: str
    public_view: bool
    allow_signup: bool
    require_approval: bool
    lookup_enabled: bool
    providers: Providers
    photo_ai: bool
    push_fcm: bool = strawberry.field(description="Push to the Android app is set up on the server.")


@strawberry.type(name="SiteSettings")
class SiteSettingsType:
    public_view: bool
    allow_signup: bool
    require_approval: bool
    default_role: Role
    lookup_enabled: bool
    lookup_openbrewerydb: bool
    lookup_thecocktaildb: bool
    lookup_openfoodfacts: bool
    lookup_vivino: bool
    photo_ai: bool

    @classmethod
    def from_model(cls, site: SiteSettings) -> SiteSettingsType:
        return cls(
            public_view=site.public_view,
            allow_signup=site.allow_signup,
            require_approval=site.require_approval,
            default_role=Role(site.default_role),
            lookup_enabled=site.lookup_enabled,
            lookup_openbrewerydb=site.lookup_openbrewerydb,
            lookup_thecocktaildb=site.lookup_thecocktaildb,
            lookup_openfoodfacts=site.lookup_openfoodfacts,
            lookup_vivino=site.lookup_vivino,
            photo_ai=site.photo_ai,
        )


@strawberry.input
class SiteSettingsInput:
    public_view: bool | None = None
    allow_signup: bool | None = None
    require_approval: bool | None = None
    default_role: Role | None = None
    lookup_enabled: bool | None = None
    lookup_openbrewerydb: bool | None = None
    lookup_thecocktaildb: bool | None = None
    lookup_openfoodfacts: bool | None = None
    lookup_vivino: bool | None = None
    photo_ai: bool | None = None


@strawberry.input
class NotificationSettingsInput:
    push_new_drinks: bool | None = None
    push_cheers: bool | None = None
    push_admin_new_signup: bool | None = None
    email_admin_new_signup: bool | None = None


@strawberry.type
class LoginResult:
    user: UserType
    token: str | None = strawberry.field(description="Only for app logins (`device` given): send as Bearer token.")


@strawberry.type
class PushConfig:
    public_key: str
    devices: int
    fcm_enabled: bool


@strawberry.type
class SystemStatus:
    version: str
    worker_healthy: bool
    worker_last_seen: datetime | None
    emails_pending: int
    emails_failed: int
    pushes_pending: int
    users: int
    pending_users: int
    drinks: int
    photos: int
    app_logins: int
