"""Admin-only GraphQL fields (Manage page): users and site settings."""

from __future__ import annotations

import strawberry
from django.contrib.auth.password_validation import validate_password
from django.core.exceptions import ValidationError
from django.core.validators import validate_email
from django.db import transaction
from django.db.models import Count, Q
from strawberry.types import Info

from accounts.models import ApiToken, User
from accounts.models import Role as RoleModel
from core.errors import AppError
from drinks import photos
from drinks.models import Drink, SiteSettings
from notifications import push
from notifications import services as notifications
from notifications.models import OutgoingEmail, PushMessage
from notifications.worker import worker_is_healthy

from .permissions import require_admin
from .types import Role, SiteSettingsInput, SiteSettingsType, SystemStatus, UserType


def _get_user(user_id) -> User:
    try:
        return User.objects.get(pk=int(user_id))
    except (User.DoesNotExist, ValueError, TypeError) as exc:
        raise AppError("NOT_FOUND", "User not found.") from exc


def _other_admins_exist(user: User) -> bool:
    return (
        User.objects.filter(Q(is_superuser=True) | Q(role=RoleModel.ADMIN), is_active=True, is_approved=True)
        .exclude(pk=user.pk)
        .exists()
    )


def _guard_change(admin: User, target: User) -> None:
    if target.is_superuser and not admin.is_superuser:
        raise AppError("FORBIDDEN", "Only a superuser can change a superuser.")


def validate_new_user(username: str, email: str | None, password: str) -> tuple[str, str | None]:
    username = username.strip()
    try:
        User.username_validator(username)
    except ValidationError as exc:
        raise AppError("INVALID_USERNAME", " ".join(exc.messages)) from exc
    if not username or len(username) > 150:
        raise AppError("INVALID_USERNAME", "Choose a username.")
    if User.objects.filter(username__iexact=username).exists():
        raise AppError("USERNAME_TAKEN", "That username is taken.")
    email = (email or "").strip().lower() or None
    if email:
        try:
            validate_email(email)
        except ValidationError as exc:
            raise AppError("INVALID_EMAIL", "Enter a valid email address.") from exc
        if User.objects.filter(email__iexact=email).exists():
            raise AppError("EMAIL_TAKEN", "That email is already registered.")
    try:
        validate_password(password, User(username=username, email=email))
    except ValidationError as exc:
        raise AppError("INVALID_PASSWORD", " ".join(exc.messages)) from exc
    return username, email


@strawberry.type
class AdminQuery:
    @strawberry.field(description="All users, pending first, with how many drinks each has logged.")
    def users(self, info: Info) -> list[UserType]:
        require_admin(info)
        users = User.objects.annotate(n=Count("drinks")).order_by("is_approved", "-is_active", "username")
        return [UserType.from_model(u, drink_count=u.n) for u in users]

    @strawberry.field
    def site_settings(self, info: Info) -> SiteSettingsType:
        require_admin(info)
        return SiteSettingsType.from_model(SiteSettings.load())

    @strawberry.field
    def system_status(self, info: Info) -> SystemStatus:
        from django.conf import settings

        from notifications.models import WorkerHeartbeat

        require_admin(info)
        heartbeat = WorkerHeartbeat.objects.filter(pk=1).first()
        unsent = OutgoingEmail.objects.filter(sent_at__isnull=True)
        return SystemStatus(
            version=settings.APP_VERSION,
            worker_healthy=worker_is_healthy(heartbeat),
            worker_last_seen=heartbeat.last_seen if heartbeat else None,
            emails_pending=unsent.filter(attempts__lt=notifications.MAX_ATTEMPTS).count(),
            emails_failed=unsent.filter(attempts__gte=notifications.MAX_ATTEMPTS).count(),
            pushes_pending=PushMessage.objects.filter(sent_at__isnull=True, attempts__lt=push.MAX_ATTEMPTS).count(),
            users=User.objects.filter(is_active=True).count(),
            pending_users=User.objects.filter(is_active=True, is_approved=False).count(),
            drinks=Drink.objects.count(),
            photos=Drink.objects.exclude(photo="").count(),
            app_logins=ApiToken.objects.count(),
        )


@strawberry.type
class AdminMutation:
    @strawberry.mutation
    def update_site_settings(self, info: Info, input: SiteSettingsInput) -> SiteSettingsType:
        require_admin(info)
        site = SiteSettings.load()
        for field in SiteSettingsInput.__annotations__:
            value = getattr(input, field)
            if value is not None:
                setattr(site, field, value.value if isinstance(value, Role) else value)
        site.save()
        return SiteSettingsType.from_model(site)

    @strawberry.mutation(description="Create an account (approved at once).")
    def create_user(
        self, info: Info, username: str, password: str, role: Role = Role.CONTRIBUTOR, email: str | None = None
    ) -> UserType:
        require_admin(info)
        username, email = validate_new_user(username, email, password)
        user = User(username=username, email=email, role=role.value, is_approved=True)
        user.set_password(password)
        user.save()
        return UserType.from_model(user, drink_count=0)

    @strawberry.mutation
    def update_user(
        self, info: Info, id: strawberry.ID, role: Role | None = None, is_active: bool | None = None
    ) -> UserType:
        admin = require_admin(info)
        user = _get_user(id)
        _guard_change(admin, user)
        losing_admin = (role is not None and role != Role.ADMIN and user.is_admin) or (
            is_active is False and user.is_admin
        )
        if user.pk == admin.pk and losing_admin:
            raise AppError("CANNOT_CHANGE_SELF", "You can't remove your own admin access.")
        if losing_admin and not _other_admins_exist(user):
            raise AppError("LAST_ADMIN", "There must be at least one active admin.")
        if role is not None and not user.is_superuser:
            user.role = role.value
        if is_active is not None:
            user.is_active = is_active
            if not is_active:
                ApiToken.objects.filter(user=user).delete()
        user.save()
        return UserType.from_model(user, drink_count=user.drinks.count())

    @strawberry.mutation
    def approve_user(self, info: Info, id: strawberry.ID) -> UserType:
        require_admin(info)
        user = User.objects.filter(pk=id, is_approved=False).first()
        if user is None:
            raise AppError("NOT_FOUND", "No pending user with that id.")
        user.approve()
        return UserType.from_model(user, drink_count=user.drinks.count())

    @strawberry.mutation(description="Delete a pending (unapproved) account.")
    def reject_user(self, info: Info, id: strawberry.ID) -> bool:
        require_admin(info)
        deleted, _ = User.objects.filter(pk=id, is_approved=False, is_superuser=False).delete()
        if not deleted:
            raise AppError("NOT_FOUND", "No pending user with that id.")
        return True

    @strawberry.mutation(description="Delete an account. Its drinks are kept (without an owner) unless deleteDrinks.")
    def delete_user(self, info: Info, id: strawberry.ID, delete_drinks: bool = False) -> bool:
        admin = require_admin(info)
        user = _get_user(id)
        _guard_change(admin, user)
        if user.pk == admin.pk:
            raise AppError("CANNOT_CHANGE_SELF", "You can't delete your own account here.")
        if user.is_admin and not _other_admins_exist(user):
            raise AppError("LAST_ADMIN", "There must be at least one active admin.")
        with transaction.atomic():
            if delete_drinks:
                for drink in Drink.objects.filter(created_by=user):
                    photos.delete_files(drink)
                    drink.delete()
            user.delete()
        return True

    @strawberry.mutation(description="Set a new password for someone (logs them out of the apps).")
    def set_user_password(self, info: Info, id: strawberry.ID, password: str) -> bool:
        admin = require_admin(info)
        user = _get_user(id)
        _guard_change(admin, user)
        try:
            validate_password(password, user)
        except ValidationError as exc:
            raise AppError("INVALID_PASSWORD", " ".join(exc.messages)) from exc
        user.set_password(password)
        user.save()
        ApiToken.objects.filter(user=user).delete()
        return True
