from __future__ import annotations

import strawberry
from django.conf import settings
from django.contrib.auth import authenticate, login, logout, update_session_auth_hash
from django.contrib.auth.password_validation import validate_password
from django.contrib.auth.tokens import default_token_generator
from django.core.exceptions import ValidationError
from django.core.validators import validate_email
from django.utils.encoding import force_str
from django.utils.http import urlsafe_base64_decode
from graphql.validation import NoSchemaIntrospectionCustomRule
from strawberry.extensions import AddValidationRules, MaxAliasesLimiter, MaxTokensLimiter, QueryDepthLimiter
from strawberry.types import Info

from accounts import ratelimit
from accounts.models import ApiToken, User
from core.errors import AppError
from drinks import lookup, photos, services, stats
from drinks.models import SiteSettings
from notifications import fcm, push
from notifications import services as notifications
from notifications.models import PushSubscription

from .admin import AdminMutation, AdminQuery, validate_new_user
from .errors import AppErrors
from .permissions import current_user, require_approved, require_user
from .types import (
    BarcodeResult,
    Category,
    DrinkFilter,
    DrinkInput,
    DrinkPage,
    DrinkSort,
    DrinkType,
    FieldName,
    Language,
    LoginResult,
    LookupResultType,
    NotificationSettingsInput,
    Person,
    Providers,
    PushConfig,
    SiteConfig,
    StatsType,
    UserType,
)

MAX_PAGE = 500


def _ip(info: Info) -> str:
    return ratelimit.client_ip(info.context.request)


def _viewer(info: Info):
    return info.context.request.user


def _drink(info: Info, drink) -> DrinkType:
    """Reload with cheers counts, as the viewer sees it."""
    return DrinkType.from_model(services.get_drink(_viewer(info), drink.pk), _viewer(info))


def _check_own_password(user: User, password: str, message: str) -> None:
    """Verify the user's current password, rate limited so it can't be brute-forced from a session."""
    ratelimit.PASSWORD_CHECK_PER_USER.check(str(user.pk))
    if not user.check_password(password):
        ratelimit.PASSWORD_CHECK_PER_USER.hit(str(user.pk))
        raise AppError("INVALID_CREDENTIALS", message)


def _start_session(info: Info, user: User, device: str | None) -> LoginResult:
    """Log in: a session cookie for the website, a bearer token for the apps (`device` given)."""
    request = info.context.request
    if device:
        token = ApiToken.issue(user, device.strip()[:100] or "app")
        return LoginResult(user=UserType.from_model(user), token=token)
    login(request, user, backend="django.contrib.auth.backends.ModelBackend")
    return LoginResult(user=UserType.from_model(user), token=None)


@strawberry.type
class Query(AdminQuery):
    @strawberry.field(description="The app version (backend/pyproject.toml).")
    def app_version(self) -> str:
        return settings.APP_VERSION

    @strawberry.field(description="The logged-in user, or null.")
    def me(self, info: Info) -> UserType | None:
        user = current_user(info)
        return UserType.from_model(user) if user else None

    @strawberry.field
    def site_config(self) -> SiteConfig:
        site = SiteSettings.load()
        status = lookup.provider_status()
        return SiteConfig(
            version=settings.APP_VERSION,
            public_view=site.public_view,
            allow_signup=site.allow_signup,
            require_approval=site.require_approval,
            lookup_enabled=site.lookup_enabled,
            providers=Providers(**status),
            photo_ai=site.photo_ai,
            push_fcm=fcm.enabled(),
        )

    @strawberry.field(description="Drinks, newest first by default. Public when public viewing is on.")
    def drinks(
        self,
        info: Info,
        filter: DrinkFilter | None = None,
        sort: DrinkSort = DrinkSort.DATE,
        descending: bool = True,
        offset: int = 0,
        limit: int = 30,
    ) -> DrinkPage:
        viewer = _viewer(info)
        queryset = services.visible_drinks(viewer)
        if filter:
            user_id = int(filter.user_id) if filter.user_id and str(filter.user_id).isdigit() else None
            if filter.mine:
                me = current_user(info)
                user_id = me.pk if me else -1
            queryset = services.filter_drinks(
                queryset,
                search=(filter.search or "").strip()[:100],
                category=filter.category.value if filter.category else None,
                style=(filter.style or "").strip(),
                min_rating=filter.min_rating,
                max_rating=filter.max_rating,
                user_id=user_id,
                date_from=filter.date_from,
                date_to=filter.date_to,
                would_have_again=filter.would_have_again,
                has_photo=filter.has_photo,
            )
        queryset = services.sort_drinks(queryset, sort.value, descending)
        offset, limit = max(offset, 0), min(max(limit, 1), MAX_PAGE)
        total = queryset.count()
        items = list(queryset[offset : offset + limit])
        return DrinkPage(
            items=[DrinkType.from_model(d, viewer) for d in items],
            total=total,
            has_more=offset + len(items) < total,
        )

    @strawberry.field
    def drink(self, info: Info, id: strawberry.ID) -> DrinkType:
        return DrinkType.from_model(services.get_drink(_viewer(info), id), _viewer(info))

    @strawberry.field(description="Earlier drinks with the same or a similar name.")
    def similar_drinks(self, info: Info, name: str, exclude_id: strawberry.ID | None = None) -> list[DrinkType]:
        viewer = _viewer(info)
        exclude = int(exclude_id) if exclude_id and str(exclude_id).isdigit() else None
        return [DrinkType.from_model(d, viewer) for d in services.similar_drinks(viewer, name, exclude)]

    @strawberry.field(description="Values used before for a field, most used first (autocomplete).")
    def field_values(self, info: Info, field: FieldName) -> list[str]:
        return services.field_values(_viewer(info), field.value)

    @strawberry.field(description="Everyone who has logged a drink (for filters).")
    def people(self, info: Info) -> list[Person]:
        services.require_view(_viewer(info))
        users = User.objects.filter(drinks__isnull=False).distinct().order_by("username")
        return [Person(id=strawberry.ID(str(u.pk)), username=u.username) for u in users]

    @strawberry.field
    def stats(self, info: Info, user_id: strawberry.ID | None = None, year: int | None = None) -> StatsType:
        viewer = _viewer(info)
        uid = int(user_id) if user_id and str(user_id).isdigit() else None
        summary = stats.build(services.visible_drinks(viewer), user_id=uid, year=year)
        return StatsType.from_summary(summary, viewer)

    @strawberry.field(description="Search the online drink databases.")
    def lookup(self, info: Info, category: Category, query: str) -> list[LookupResultType]:
        user = services.require_can_add(_viewer(info))
        ratelimit.LOOKUP_PER_USER.check_and_hit(str(user.pk))
        return [LookupResultType.from_result(r) for r in lookup.search(category.value, query)]

    @strawberry.field(description="A scanned barcode: the product online, and drinks already logged with it.")
    def lookup_barcode(self, info: Info, code: str) -> BarcodeResult:
        user = services.require_can_add(_viewer(info))
        ratelimit.LOOKUP_PER_USER.check_and_hit(str(user.pk))
        code = "".join(ch for ch in code if ch.isalnum())[:32]
        previous = services.visible_drinks(user).filter(barcode=code).order_by("-date_tried")[:5] if code else []
        try:
            product = lookup.lookup_barcode(code)
        except Exception:  # noqa: BLE001 - offline provider: still show what we know
            product = None
        return BarcodeResult(
            code=code,
            product=LookupResultType.from_result(product) if product else None,
            previous=[DrinkType.from_model(d, user) for d in previous],
        )

    @strawberry.field(description="What a browser needs to register for push notifications.")
    def push_config(self, info: Info) -> PushConfig:
        user = require_approved(info)
        return PushConfig(
            public_key=push.public_key(),
            devices=PushSubscription.objects.filter(user=user).count(),
            fcm_enabled=fcm.enabled(),
        )


@strawberry.type
class Mutation(AdminMutation):
    # --- Authentication & profile --------------------------------------------

    @strawberry.mutation(description="Create an account. With `device`, returns an app token instead of a cookie.")
    def signup(
        self,
        info: Info,
        username: str,
        email: str,
        password: str,
        language: Language | None = None,
        device: str | None = None,
    ) -> LoginResult:
        site = SiteSettings.load()
        if not site.allow_signup:
            raise AppError("SIGNUP_CLOSED", "New accounts can only be made by an admin.")
        ratelimit.SIGNUP_PER_IP.check_and_hit(_ip(info))
        if not email.strip():
            raise AppError("INVALID_EMAIL", "Enter a valid email address.")
        username, email = validate_new_user(username, email, password)
        user = User(
            username=username,
            email=email,
            language=(language or Language.NB).value,
            role=site.default_role,
            is_approved=not site.require_approval,
        )
        user.set_password(password)
        user.save()
        notifications.notify_admins_of_signup(user)
        return _start_session(info, user, device)

    @strawberry.mutation(description="Log in. With `device` (the app's device name), returns a bearer token.")
    def login(self, info: Info, username: str, password: str, device: str | None = None) -> LoginResult:
        request = info.context.request
        username, ip = username.strip(), _ip(info)
        ratelimit.LOGIN_PER_USER.check(username)
        ratelimit.LOGIN_PER_IP.check(ip)
        user = authenticate(request, username=username, password=password)
        if user is None:
            ratelimit.LOGIN_PER_USER.hit(username)
            ratelimit.LOGIN_PER_IP.hit(ip)
            raise AppError("INVALID_CREDENTIALS", "Wrong username or password.")
        ratelimit.LOGIN_PER_USER.reset(username)
        return _start_session(info, user, device)

    @strawberry.mutation
    def logout(self, info: Info) -> bool:
        request = info.context.request
        token = getattr(request, "api_token", None)
        if token is not None:
            token.delete()
        else:
            logout(request)
        return True

    @strawberry.mutation(description="Always returns true, so it can't be used to find out who has an account.")
    def request_password_reset(self, info: Info, email: str) -> bool:
        email = email.strip().lower()
        ratelimit.RESET_REQUEST_PER_IP.check_and_hit(_ip(info))
        ratelimit.RESET_REQUEST_PER_EMAIL.check_and_hit(email)
        user = User.objects.filter(email__iexact=email, is_active=True).first() if email else None
        if user:
            notifications.send_password_reset(user)
        return True

    @strawberry.mutation
    def reset_password(self, info: Info, uid: str, token: str, new_password: str) -> bool:
        ratelimit.RESET_CONFIRM_PER_IP.check_and_hit(_ip(info))
        try:
            user = User.objects.get(pk=force_str(urlsafe_base64_decode(uid)), is_active=True)
        except (User.DoesNotExist, ValueError, TypeError, OverflowError):
            user = None
        if user is None or not default_token_generator.check_token(user, token):
            raise AppError("INVALID_RESET_LINK", "The reset link is invalid or has expired.")
        try:
            validate_password(new_password, user)
        except ValidationError as exc:
            raise AppError("INVALID_PASSWORD", " ".join(exc.messages)) from exc
        user.set_password(new_password)
        user.save()
        ApiToken.objects.filter(user=user).delete()
        ratelimit.LOGIN_PER_USER.reset(user.username)
        return True

    @strawberry.mutation
    def change_password(self, info: Info, current_password: str, new_password: str) -> bool:
        user = require_user(info)
        _check_own_password(user, current_password, "Your current password is wrong.")
        try:
            validate_password(new_password, user)
        except ValidationError as exc:
            raise AppError("INVALID_PASSWORD", " ".join(exc.messages)) from exc
        user.set_password(new_password)
        user.save()
        request = info.context.request
        # Other phones are logged out; this browser or phone stays logged in.
        current = getattr(request, "api_token", None)
        ApiToken.objects.filter(user=user).exclude(pk=current.pk if current else None).delete()
        if current is None:
            update_session_auth_hash(request, user)
        return True

    @strawberry.mutation
    def update_profile(self, info: Info, email: str | None = None, language: Language | None = None) -> UserType:
        user = require_user(info)
        if email is not None:
            email = email.strip().lower()
            if email:
                try:
                    validate_email(email)
                except ValidationError as exc:
                    raise AppError("INVALID_EMAIL", "Enter a valid email address.") from exc
                if User.objects.filter(email__iexact=email).exclude(pk=user.pk).exists():
                    raise AppError("EMAIL_TAKEN", "That email is already registered.")
            user.email = email or None
        if language is not None:
            user.language = language.value
        user.save()
        return UserType.from_model(user)

    @strawberry.mutation
    def update_notifications(self, info: Info, input: NotificationSettingsInput) -> UserType:
        user = require_approved(info)
        for field in NotificationSettingsInput.__annotations__:
            value = getattr(input, field)
            if value is not None:
                setattr(user, field, value)
        user.save()
        return UserType.from_model(user)

    # --- Drinks ------------------------------------------------------------------

    @strawberry.mutation(description="Add a drink. Send a clientId so a retried request doesn't add it twice.")
    def create_drink(self, info: Info, input: DrinkInput, client_id: str | None = None) -> DrinkType:
        drink = services.create_drink(_viewer(info), input.to_dict(), client_id or "")
        return _drink(info, drink)

    @strawberry.mutation
    def update_drink(self, info: Info, id: strawberry.ID, input: DrinkInput) -> DrinkType:
        drink = services.update_drink(_viewer(info), id, input.to_dict())
        return _drink(info, drink)

    @strawberry.mutation
    def delete_drink(self, info: Info, id: strawberry.ID) -> bool:
        services.delete_drink(_viewer(info), id)
        return True

    @strawberry.mutation
    def remove_photo(self, info: Info, drink_id: strawberry.ID) -> DrinkType:
        drink = services.get_managed_drink(_viewer(info), drink_id)
        photos.remove_photo(drink)
        return _drink(info, drink)

    @strawberry.mutation(description="Use a picture from a look-up result as the drink's photo.")
    def import_photo(self, info: Info, drink_id: strawberry.ID, url: str) -> DrinkType:
        user = services.require_can_add(_viewer(info))
        ratelimit.PHOTO_IMPORT_PER_USER.check_and_hit(str(user.pk))
        drink = services.get_managed_drink(user, drink_id)
        photos.import_from_url(drink, url)
        return _drink(info, drink)

    @strawberry.mutation(description="Cheers to a drink (on=false takes it back).")
    def cheer(self, info: Info, drink_id: strawberry.ID, on: bool = True) -> DrinkType:
        drink = services.set_cheers(_viewer(info), drink_id, on)
        return DrinkType.from_model(drink, _viewer(info))

    # --- Push ----------------------------------------------------------------------

    @strawberry.mutation(description="Register this browser for Web Push.")
    def register_web_push(self, info: Info, endpoint: str, p256dh: str, auth: str) -> bool:
        user = require_approved(info)
        if not endpoint.startswith("https://") or len(endpoint) > 1000 or not p256dh or not auth:
            raise AppError("INVALID_INPUT", "That isn't a push subscription.")
        PushSubscription.objects.update_or_create(
            endpoint=endpoint,
            defaults={
                "user": user,
                "kind": PushSubscription.Kind.WEB,
                "p256dh": p256dh[:200],
                "auth": auth[:100],
                "user_agent": info.context.request.headers.get("User-Agent", "")[:300],
            },
        )
        return True

    @strawberry.mutation(description="Register this phone (Firebase token from the Android app).")
    def register_fcm(self, info: Info, token: str, device: str | None = None) -> bool:
        user = require_approved(info)
        if not fcm.enabled():
            raise AppError("PUSH_UNAVAILABLE", "Push to the app isn't set up on this server.")
        token = token.strip()
        if not token or len(token) > 1000:
            raise AppError("INVALID_INPUT", "That isn't a device token.")
        PushSubscription.objects.update_or_create(
            endpoint=token,
            defaults={"user": user, "kind": PushSubscription.Kind.FCM, "user_agent": (device or "Android app")[:300]},
        )
        return True

    @strawberry.mutation
    def unregister_push(self, info: Info, endpoint: str) -> bool:
        user = require_user(info)
        PushSubscription.objects.filter(user=user, endpoint=endpoint).delete()
        return True

    @strawberry.mutation(description="Send a test notification to all your devices. Returns how many got it.")
    def send_test_push(self, info: Info) -> int:
        user = require_approved(info)
        ratelimit.TEST_PUSH_PER_USER.check_and_hit(str(user.pk))
        return push.send_test(user)


class AppSchema(strawberry.Schema):
    def process_errors(self, errors, execution_context=None) -> None:
        # Expected AppErrors aren't worth logging as errors.
        unexpected = [e for e in errors if not isinstance(e.original_error, AppError)]
        if unexpected:
            super().process_errors(unexpected, execution_context)


# Depth, size and alias limits stop pathological queries; the app's own queries are at most 5 deep.
# Introspection is for development only.
_limits = [
    QueryDepthLimiter(max_depth=10),
    MaxTokensLimiter(max_token_count=3000),
    MaxAliasesLimiter(max_alias_count=15),
]
if not settings.DEBUG:
    _limits.append(AddValidationRules([NoSchemaIntrospectionCustomRule]))
schema = AppSchema(query=Query, mutation=Mutation, extensions=[AppErrors, *_limits])
