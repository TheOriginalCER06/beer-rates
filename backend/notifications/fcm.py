"""
Push to the Android (and, with APNs set up in Firebase, iOS) app through Firebase Cloud Messaging
(HTTP v1 API). Needs a Firebase service account key file, FCM_SERVICE_ACCOUNT_FILE. Without it,
FCM devices simply aren't registered (the app is told push isn't available).
"""

from __future__ import annotations

import base64
import json
import logging
import threading
import time
from functools import cache

import requests
from cryptography.hazmat.primitives import hashes, serialization
from cryptography.hazmat.primitives.asymmetric import padding
from django.conf import settings

logger = logging.getLogger(__name__)

SCOPE = "https://www.googleapis.com/auth/firebase.messaging"
_token_lock = threading.Lock()
_token: tuple[str, float] | None = None


class Unregistered(Exception):
    """The device token is no longer valid (app uninstalled, data cleared)."""


@cache
def _credentials() -> dict | None:
    path = settings.FCM_SERVICE_ACCOUNT_FILE
    if not path:
        return None
    try:
        with open(path, encoding="utf-8") as f:
            data = json.load(f)
    except (OSError, ValueError) as exc:
        logger.error("Can't read FCM_SERVICE_ACCOUNT_FILE %s: %s", path, exc)
        return None
    if not all(data.get(k) for k in ("client_email", "private_key", "project_id")):
        logger.error("FCM_SERVICE_ACCOUNT_FILE %s isn't a service account key", path)
        return None
    return data


def enabled() -> bool:
    return _credentials() is not None


def _b64(data: bytes) -> str:
    return base64.urlsafe_b64encode(data).rstrip(b"=").decode()


def _access_token() -> str:
    """An OAuth access token for FCM, from a JWT signed with the service account key (cached ~55 min)."""
    global _token
    with _token_lock:
        if _token and _token[1] > time.time() + 60:
            return _token[0]
        creds = _credentials()
        now = int(time.time())
        header = _b64(json.dumps({"alg": "RS256", "typ": "JWT"}).encode())
        claims = _b64(
            json.dumps(
                {
                    "iss": creds["client_email"],
                    "scope": SCOPE,
                    "aud": creds.get("token_uri", "https://oauth2.googleapis.com/token"),
                    "iat": now,
                    "exp": now + 3600,
                }
            ).encode()
        )
        key = serialization.load_pem_private_key(creds["private_key"].encode(), password=None)
        signature = key.sign(f"{header}.{claims}".encode(), padding.PKCS1v15(), hashes.SHA256())
        response = requests.post(
            creds.get("token_uri", "https://oauth2.googleapis.com/token"),
            data={
                "grant_type": "urn:ietf:params:oauth:grant-type:jwt-bearer",
                "assertion": f"{header}.{claims}.{_b64(signature)}",
            },
            timeout=10,
        )
        response.raise_for_status()
        data = response.json()
        _token = (data["access_token"], now + int(data.get("expires_in", 3600)))
        return _token[0]


def send(token: str, title: str, body: str, url: str, tag: str) -> int:
    """Send one notification. Returns the HTTP status; raises Unregistered for dead tokens."""
    creds = _credentials()
    if creds is None:
        raise RuntimeError("FCM is not configured")
    message = {
        "message": {
            "token": token,
            "notification": {"title": title, "body": body},
            "data": {"url": url, "tag": tag},
            "android": {"priority": "high", "notification": {"tag": tag or "beer-rates", "channel_id": "default"}},
        }
    }
    response = requests.post(
        f"https://fcm.googleapis.com/v1/projects/{creds['project_id']}/messages:send",
        json=message,
        headers={"Authorization": f"Bearer {_access_token()}"},
        timeout=10,
    )
    text = response.text if response.status_code in (400, 404) else ""
    if response.status_code == 404 or "UNREGISTERED" in text or "not a valid FCM registration token" in text:
        raise Unregistered(text[:200])
    return response.status_code
