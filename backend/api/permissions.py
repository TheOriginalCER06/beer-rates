from strawberry.types import Info

from accounts.models import User
from core.errors import AppError


def current_user(info: Info) -> User | None:
    user = info.context.request.user
    return user if user.is_authenticated and user.is_active else None


def require_user(info: Info) -> User:
    user = current_user(info)
    if user is None:
        raise AppError("NOT_AUTHENTICATED", "You must be logged in.")
    return user


def require_approved(info: Info) -> User:
    user = require_user(info)
    if not user.is_approved:
        raise AppError("NOT_APPROVED", "Your account is waiting for admin approval.")
    return user


def require_admin(info: Info) -> User:
    user = require_approved(info)
    if not user.is_admin:
        raise AppError("FORBIDDEN", "Admin access required.")
    return user
