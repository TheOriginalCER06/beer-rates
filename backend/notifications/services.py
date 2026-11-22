"""
Emails and pushes.

Emails have a plain-text and an HTML version, rendered from `templates/emails/<lang>/<kind>.txt`
(first line: `Subject: …`) and `<kind>.html`. They're queued in OutgoingEmail and sent by the
worker (`send_pending`); nothing is sent inline from a web request, since Domeneshop's SMTP server
can take 20+ seconds to answer.

Pushes (notifications/push.py) are queued the same way, per device.
"""

from __future__ import annotations

import logging
import smtplib
from datetime import timedelta

from django.conf import settings
from django.contrib.auth.tokens import default_token_generator
from django.core.mail import EmailMultiAlternatives
from django.db.models import Q
from django.template.loader import render_to_string
from django.utils import timezone, translation
from django.utils.encoding import force_bytes
from django.utils.http import urlsafe_base64_encode

from . import push
from .models import OutgoingEmail

logger = logging.getLogger(__name__)

MAX_ATTEMPTS = 6
SENT_RETENTION = timedelta(days=30)
SEND_LEASE = timedelta(minutes=2)

PUSH_TEXT = {
    "nb": {
        "approved_title": "Kontoen din er godkjent",
        "approved_body": "Nå kan du logge drikke i Drikke Vurderinger.",
        "signup_title": "Ny bruker: {username}",
        "signup_body": "Venter på godkjenning.",
        "signup_body_open": "Har laget en konto.",
        "drink_title": "{username} har smakt {name}",
        "drink_body": "{rating}/10",
        "cheers_title": "{username} skåler for {name}",
        "cheers_body": "Skål! 🍻",
    },
    "en": {
        "approved_title": "Your account is approved",
        "approved_body": "You can now log drinks in Drikke Vurderinger.",
        "signup_title": "New user: {username}",
        "signup_body": "Waiting for approval.",
        "signup_body_open": "Created an account.",
        "drink_title": "{username} had {name}",
        "drink_body": "{rating}/10",
        "cheers_title": "{username} cheers to your {name}",
        "cheers_body": "Cheers! 🍻",
    },
}


def _lang(user) -> str:
    return user.language if user.language in PUSH_TEXT else "nb"


def _text(user, key: str, **values) -> str:
    return PUSH_TEXT[_lang(user)][key].format(**values)


def render_email(kind: str, language: str, context: dict) -> tuple[str, str, str]:
    """(subject, text, html) for an email kind in a language."""
    language = language if language in ("nb", "en") else "nb"
    context = {"site_url": settings.SITE_URL, "language": language, **context}
    with translation.override(language):
        text = render_to_string(f"emails/{language}/{kind}.txt", context)
        html = render_to_string(f"emails/{language}/{kind}.html", context)
    first, _, rest = text.partition("\n")
    subject = first.removeprefix("Subject:").strip()
    return subject, rest.strip() + "\n", html


def queue_email(user, kind: str, context: dict | None = None, *, sensitive: bool = False) -> OutgoingEmail | None:
    if not user.email or not user.is_active:
        return None
    subject, text, html = render_email(kind, _lang(user), {"user": user, **(context or {})})
    return OutgoingEmail.objects.create(
        to=user.email,
        subject=subject,
        body=text,
        html_body=html,
        kind=kind,
        sensitive=sensitive,
        next_attempt_at=timezone.now(),
    )


def _admins():
    from accounts.models import Role, User

    return User.objects.filter(Q(is_superuser=True) | Q(role=Role.ADMIN, is_approved=True), is_active=True)


# --- What happens ------------------------------------------------------------------------------


def notify_user_approved(user) -> None:
    queue_email(user, "account_approved")
    push.queue(user, title=_text(user, "approved_title"), body=_text(user, "approved_body"), path="/", tag="approved")


def notify_admins_of_signup(new_user) -> None:
    for admin in _admins():
        if admin.pk == new_user.pk:
            continue
        if admin.email_admin_new_signup:
            queue_email(admin, "admin_new_signup", {"new_user": new_user})
        if admin.push_admin_new_signup:
            body_key = "signup_body_open" if new_user.is_approved else "signup_body"
            push.queue(
                admin,
                title=_text(admin, "signup_title", username=new_user.username),
                body=_text(admin, body_key),
                path="/manage?tab=users",
                tag="admin_new_signup",
            )


def send_password_reset(user) -> None:
    uid = urlsafe_base64_encode(force_bytes(user.pk))
    token = default_token_generator.make_token(user)
    link = f"{settings.SITE_URL}/reset-password?uid={uid}&token={token}"
    queue_email(
        user, "password_reset", {"link": link, "hours": settings.PASSWORD_RESET_TIMEOUT // 3600}, sensitive=True
    )


def notify_new_drink(drink) -> None:
    """Push to everyone else who wants to hear about new drinks."""
    from accounts.models import User

    author = drink.created_by
    if author is None:
        return
    for user in User.objects.filter(is_active=True, is_approved=True, push_new_drinks=True).exclude(pk=author.pk):
        push.queue(
            user,
            title=_text(user, "drink_title", username=author.username, name=drink.name),
            body=_text(user, "drink_body", rating=drink.rating),
            path=f"/drinks/{drink.pk}",
            tag=f"drink-{drink.pk}",
        )


def notify_cheers(drink, cheerer) -> None:
    owner = drink.created_by
    if owner is None or not owner.push_cheers:
        return
    push.queue(
        owner,
        title=_text(owner, "cheers_title", username=cheerer.username, name=drink.name),
        body=_text(owner, "cheers_body"),
        path=f"/drinks/{drink.pk}",
        tag=f"cheers-{drink.pk}",
    )


# --- Sending (the worker) ------------------------------------------------------------------------


def _send(email: OutgoingEmail) -> bool:
    claimed = OutgoingEmail.objects.filter(
        pk=email.pk, sent_at__isnull=True, next_attempt_at=email.next_attempt_at
    ).update(next_attempt_at=timezone.now() + SEND_LEASE)
    if not claimed:
        return False
    message = EmailMultiAlternatives(email.subject, email.body, settings.DEFAULT_FROM_EMAIL, [email.to])
    if email.html_body:
        message.attach_alternative(email.html_body, "text/html")
    try:
        message.send()
    except (smtplib.SMTPException, OSError) as exc:
        email.attempts += 1
        email.last_error = str(exc)[:1000]
        email.next_attempt_at = timezone.now() + timedelta(minutes=2**email.attempts)
        email.save(update_fields=["attempts", "last_error", "next_attempt_at"])
        logger.warning("Email %s to %s failed (attempt %d): %s", email.pk, email.to, email.attempts, exc)
        return False
    email.sent_at = timezone.now()
    email.attempts += 1
    fields = ["sent_at", "attempts"]
    if email.sensitive:
        email.body = email.html_body = ""
        fields += ["body", "html_body"]
    email.save(update_fields=fields)
    return True


def send_pending(limit: int = 20) -> int:
    """Send queued emails that are due. Returns how many went out."""
    now = timezone.now()
    OutgoingEmail.objects.filter(sent_at__lt=now - SENT_RETENTION).delete()
    due = OutgoingEmail.objects.filter(
        sent_at__isnull=True, attempts__lt=MAX_ATTEMPTS, next_attempt_at__lte=now
    ).order_by("created_at")[:limit]
    return sum(_send(email) for email in due)
