"""
Django settings for Drikke Vurderinger.

All deployment-specific values come from environment variables (see ../.env.example).
For local development a `.env` file in the repository root is loaded automatically.
"""

import os
import sys
import tomllib
from pathlib import Path

import dj_database_url
from dotenv import load_dotenv

BASE_DIR = Path(__file__).resolve().parent.parent
# The app version lives in backend/pyproject.toml (see CHANGELOG.md and scripts/update.sh).
APP_VERSION = tomllib.loads((BASE_DIR / "pyproject.toml").read_text(encoding="utf-8"))["project"]["version"]
load_dotenv(BASE_DIR.parent / ".env")


def env_bool(name: str, default: bool = False) -> bool:
    return os.environ.get(name, str(default)).strip().lower() in {"1", "true", "yes", "on"}


def env_list(name: str, default: str = "") -> list[str]:
    return [item.strip() for item in os.environ.get(name, default).split(",") if item.strip()]


DEBUG = env_bool("DJANGO_DEBUG", False)

SECRET_KEY = os.environ.get("DJANGO_SECRET_KEY", "")
if not SECRET_KEY:
    if not DEBUG:
        raise RuntimeError("DJANGO_SECRET_KEY must be set when DJANGO_DEBUG is false.")
    SECRET_KEY = "django-insecure-dev-only-key"

# localhost is always allowed so container health checks work.
ALLOWED_HOSTS = list(dict.fromkeys(env_list("DJANGO_ALLOWED_HOSTS") + ["localhost", "127.0.0.1"]))
CSRF_TRUSTED_ORIGINS = env_list("DJANGO_CSRF_TRUSTED_ORIGINS")

INSTALLED_APPS = [
    "django.contrib.admin",
    "django.contrib.auth",
    "django.contrib.contenttypes",
    "django.contrib.sessions",
    "django.contrib.messages",
    "django.contrib.staticfiles",
    "corsheaders",
    "strawberry.django",
    "accounts",
    "drinks",
    "notifications",
]

MIDDLEWARE = [
    "django.middleware.security.SecurityMiddleware",
    "corsheaders.middleware.CorsMiddleware",
    "whitenoise.middleware.WhiteNoiseMiddleware",
    "django.contrib.sessions.middleware.SessionMiddleware",
    "django.middleware.locale.LocaleMiddleware",
    "django.middleware.common.CommonMiddleware",
    "django.middleware.csrf.CsrfViewMiddleware",
    "django.contrib.auth.middleware.AuthenticationMiddleware",
    # The phone apps send `Authorization: Bearer <token>` instead of a session cookie.
    "accounts.tokens.BearerTokenMiddleware",
    "django.contrib.messages.middleware.MessageMiddleware",
    "django.middleware.clickjacking.XFrameOptionsMiddleware",
]

ROOT_URLCONF = "config.urls"

TEMPLATES = [
    {
        "BACKEND": "django.template.backends.django.DjangoTemplates",
        "DIRS": [],
        "APP_DIRS": True,
        "OPTIONS": {
            "context_processors": [
                "django.template.context_processors.request",
                "django.contrib.auth.context_processors.auth",
                "django.contrib.messages.context_processors.messages",
            ],
        },
    },
]

WSGI_APPLICATION = "config.wsgi.application"

DATABASES = {
    "default": dj_database_url.config(
        default=f"sqlite:///{BASE_DIR / 'db.sqlite3'}",
        conn_max_age=60,
        conn_health_checks=True,
    )
}

AUTH_USER_MODEL = "accounts.User"

TESTING = len(sys.argv) > 1 and sys.argv[1] == "test"
PASSWORD_HASHERS = [
    "django.contrib.auth.hashers.PBKDF2PasswordHasher",
    # Accounts imported from the old Node app (bcryptjs); re-hashed with PBKDF2 at their next login.
    "django.contrib.auth.hashers.BCryptPasswordHasher",
]
# Fast (insecure) hashing keeps the test suite quick; never used outside `manage.py test`.
if TESTING:
    PASSWORD_HASHERS = ["django.contrib.auth.hashers.MD5PasswordHasher", *PASSWORD_HASHERS]

AUTH_PASSWORD_VALIDATORS = [
    {"NAME": "django.contrib.auth.password_validation.UserAttributeSimilarityValidator"},
    {"NAME": "django.contrib.auth.password_validation.MinimumLengthValidator"},
    {"NAME": "django.contrib.auth.password_validation.CommonPasswordValidator"},
    {"NAME": "django.contrib.auth.password_validation.NumericPasswordValidator"},
]

# Internationalization. The React frontend owns its own translations (en + nb);
# these settings mainly drive the Django admin and emails.
LANGUAGE_CODE = "nb"
LANGUAGES = [("en", "English"), ("nb", "Norsk bokmål")]
TIME_ZONE = "Europe/Oslo"
USE_I18N = True
USE_TZ = True

STATIC_URL = "static/"
STATIC_ROOT = BASE_DIR / "staticfiles"
STORAGES = {
    "default": {"BACKEND": "django.core.files.storage.FileSystemStorage"},
    "staticfiles": {"BACKEND": "whitenoise.storage.CompressedManifestStaticFilesStorage"},
}

# Drink photos. In Docker this is the `media` volume, which the nginx container serves at /media/.
MEDIA_URL = "/media/"
MEDIA_ROOT = Path(os.environ.get("MEDIA_ROOT", BASE_DIR / "media"))
FILE_UPLOAD_PERMISSIONS = 0o644
FILE_UPLOAD_DIRECTORY_PERMISSIONS = 0o755
# Largest photo upload accepted (the apps shrink photos to well under 1 MB before sending).
MAX_PHOTO_UPLOAD_BYTES = int(os.environ.get("MAX_PHOTO_UPLOAD_MB", "15")) * 1024 * 1024
DATA_UPLOAD_MAX_MEMORY_SIZE = MAX_PHOTO_UPLOAD_BYTES + 1024 * 1024

# Running behind the nginx container (and possibly a TLS-terminating reverse proxy).
USE_X_FORWARDED_HOST = env_bool("DJANGO_USE_X_FORWARDED_HOST", True)
SECURE_PROXY_SSL_HEADER = ("HTTP_X_FORWARDED_PROTO", "https")
SESSION_COOKIE_SECURE = env_bool("DJANGO_SECURE_COOKIES", False)
CSRF_COOKIE_SECURE = SESSION_COOKIE_SECURE
SESSION_COOKIE_SAMESITE = "Lax"
CSRF_COOKIE_SAMESITE = "Lax"
# Stay logged in on phones: four weeks, renewed on every visit.
SESSION_COOKIE_AGE = 28 * 24 * 60 * 60
SESSION_SAVE_EVERY_REQUEST = True

# The Android and iOS apps load the bundled frontend from these origins and call the API with a
# bearer token (no cookies), so only the API and photo upload need CORS.
CORS_ALLOWED_ORIGINS = env_list("CORS_ALLOWED_ORIGINS", "https://localhost,capacitor://localhost,http://localhost")
CORS_URLS_REGEX = r"^/(graphql|api)/.*$"
CORS_ALLOW_CREDENTIALS = False
# Native app tokens unused for this many days stop working.
API_TOKEN_IDLE_DAYS = int(os.environ.get("API_TOKEN_IDLE_DAYS", "180"))

LOGGING = {
    "version": 1,
    "disable_existing_loggers": False,
    "formatters": {"simple": {"format": "%(asctime)s %(levelname)s %(name)s: %(message)s"}},
    "handlers": {"console": {"class": "logging.StreamHandler", "formatter": "simple"}},
    "root": {"handlers": ["console"], "level": os.environ.get("LOG_LEVEL", "INFO")},
    "loggers": {"django": {"level": "INFO"}},
}

# Public URL of the app, used for links in emails and push notifications.
SITE_URL = os.environ.get("SITE_URL", "http://localhost:5173").rstrip("/")

# Number of reverse proxies in front of Django that append to X-Forwarded-For
# (Nginx Proxy Manager for øl.cer06.no + the nginx container = 2). Used to find the
# real client IP for rate limiting.
TRUSTED_PROXY_COUNT = int(os.environ.get("TRUSTED_PROXY_COUNT", "2"))

PASSWORD_RESET_TIMEOUT = 2 * 60 * 60  # reset links are valid for 2 hours

# --- Email -----------------------------------------------------------------------
# Sent through the worker (notifications.OutgoingEmail). Without EMAIL_HOST, emails
# are printed to the worker log instead (handy in development).
DEFAULT_FROM_EMAIL = os.environ.get("DEFAULT_FROM_EMAIL", "Drikke Vurderinger <noreply@localhost>")
SERVER_EMAIL = DEFAULT_FROM_EMAIL
_email_use_ssl = env_bool("EMAIL_USE_SSL", False)
if os.environ.get("EMAIL_HOST"):
    MAILERS = {
        "default": {
            "BACKEND": "django.core.mail.backends.smtp.EmailBackend",
            "OPTIONS": {
                "host": os.environ["EMAIL_HOST"],
                "port": int(os.environ.get("EMAIL_PORT", "465" if _email_use_ssl else "587")),
                "username": os.environ.get("EMAIL_HOST_USER", ""),
                "password": os.environ.get("EMAIL_HOST_PASSWORD", ""),
                "use_ssl": _email_use_ssl,
                "use_tls": not _email_use_ssl and env_bool("EMAIL_USE_TLS", True),
                # Domeneshop scans each message before answering, which can take 20+ seconds.
                "timeout": 60,
            },
        }
    }
else:
    MAILERS = {"default": {"BACKEND": "django.core.mail.backends.console.EmailBackend"}}

# --- Push notifications ----------------------------------------------------------------
# Web Push (browsers and the installed web app) needs no setup: the VAPID keys are made on first
# use. Push to the Android app goes through Firebase Cloud Messaging and needs a service account
# key (Firebase console → Project settings → Service accounts → Generate new private key).
FCM_SERVICE_ACCOUNT_FILE = os.environ.get("FCM_SERVICE_ACCOUNT_FILE", "")

# --- Online drink databases ---------------------------------------------------------------
# Look-ups are cached this long (reference data hardly changes).
LOOKUP_CACHE_DAYS = int(os.environ.get("LOOKUP_CACHE_DAYS", "30"))
LOOKUP_TIMEOUT_SECONDS = float(os.environ.get("LOOKUP_TIMEOUT_SECONDS", "8"))
LOOKUP_USER_AGENT = os.environ.get("LOOKUP_USER_AGENT", f"DrikkeVurderinger/{APP_VERSION} (self-hosted)")
if TESTING:
    # Tests must mock the providers; anything that slips through fails fast.
    LOOKUP_TIMEOUT_SECONDS = 0.001

# --- Worker ---------------------------------------------------------------------------------
WORKER_POLL_SECONDS = float(os.environ.get("WORKER_POLL_SECONDS", "2"))
