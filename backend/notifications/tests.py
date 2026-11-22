import json
import tempfile
from datetime import timedelta
from unittest import mock

from cryptography.hazmat.primitives import serialization
from cryptography.hazmat.primitives.asymmetric import rsa
from django.core import mail
from django.test import override_settings
from django.utils import timezone

from accounts.models import ApiToken
from core.testing import GraphQLTestCase, make_user
from drinks.models import LookupCache
from notifications import fcm, push, services
from notifications.models import OutgoingEmail, PushMessage, PushSubscription, WorkerHeartbeat
from notifications.worker import Worker, worker_is_healthy


class EmailTests(GraphQLTestCase):
    def test_rendered_in_the_users_language_and_sent_by_the_worker(self):
        kari = make_user("kari", language="en")
        services.send_password_reset(kari)
        email = OutgoingEmail.objects.get()
        self.assertEqual(email.subject, "Reset your password")
        self.assertIn("reset-password?uid=", email.body)
        self.assertIn("<a href=", email.html_body)
        Worker().tick()
        self.assertEqual(len(mail.outbox), 1)
        email.refresh_from_db()
        self.assertIsNotNone(email.sent_at)
        self.assertEqual(email.body, "")  # sensitive: cleared once sent
        self.assertTrue(worker_is_healthy())

    def test_no_email_address_no_email(self):
        user = make_user("gammel", email=None)
        self.assertIsNone(services.queue_email(user, "account_approved"))

    def test_failed_send_is_retried_later(self):
        make_user("kari")
        services.send_password_reset(make_user("per"))
        with mock.patch("django.core.mail.EmailMultiAlternatives.send", side_effect=OSError("smtp down")):
            self.assertEqual(services.send_pending(), 0)
        email = OutgoingEmail.objects.get()
        self.assertEqual(email.attempts, 1)
        self.assertGreater(email.next_attempt_at, timezone.now())


class PushTests(GraphQLTestCase):
    def setUp(self):
        super().setUp()
        self.kari = make_user("kari")
        self.login(self.kari)

    def test_register_web_push_and_config(self):
        self.ok(
            'mutation { registerWebPush(endpoint: "https://fcm.googleapis.com/fcm/send/abc", p256dh: "k", auth: "a") }'
        )
        data = self.ok("{ pushConfig { publicKey devices fcmEnabled } }")["pushConfig"]
        self.assertEqual(data["devices"], 1)
        self.assertFalse(data["fcmEnabled"])
        self.assertGreater(len(data["publicKey"]), 80)
        self.assertEqual(self.error_code('mutation { registerFcm(token: "t") }'), "PUSH_UNAVAILABLE")

    def test_gone_subscription_is_removed(self):
        sub = PushSubscription.objects.create(user=self.kari, endpoint="https://push.example/x", p256dh="k", auth="a")
        push.queue(self.kari, title="Hei", body="", path="/", tag="t")
        with mock.patch("notifications.push.deliver_web", return_value=410):
            self.assertEqual(push.send_pending(), 0)
        self.assertFalse(PushSubscription.objects.filter(pk=sub.pk).exists())

    def test_successful_push(self):
        PushSubscription.objects.create(user=self.kari, endpoint="https://push.example/y", p256dh="k", auth="a")
        push.queue(self.kari, title="Skål", body="!", path="/drinks/1", tag="t")
        with mock.patch("notifications.push.deliver_web", return_value=201) as deliver:
            self.assertEqual(push.send_pending(), 1)
        payload = deliver.call_args.args[1]
        self.assertTrue(payload["url"].endswith("/drinks/1"))
        self.assertIsNotNone(PushMessage.objects.get().sent_at)


def _service_account(tmp) -> str:
    key = rsa.generate_private_key(public_exponent=65537, key_size=2048)
    pem = key.private_bytes(
        serialization.Encoding.PEM, serialization.PrivateFormat.PKCS8, serialization.NoEncryption()
    ).decode()
    path = f"{tmp}/sa.json"
    with open(path, "w") as f:
        json.dump({"client_email": "x@y.iam.gserviceaccount.com", "private_key": pem, "project_id": "beer"}, f)
    return path


class FcmTests(GraphQLTestCase):
    def setUp(self):
        super().setUp()
        fcm._credentials.cache_clear()
        fcm._token = None
        self.addCleanup(fcm._credentials.cache_clear)

    def test_send_through_fcm_and_drop_unregistered_tokens(self):
        with tempfile.TemporaryDirectory() as tmp, override_settings(FCM_SERVICE_ACCOUNT_FILE=_service_account(tmp)):
            kari = make_user("kari")
            self.login(kari)
            self.ok('mutation { registerFcm(token: "device-token-1", device: "Pixel") }')
            sub = PushSubscription.objects.get()
            self.assertEqual(sub.kind, PushSubscription.Kind.FCM)

            token_response = mock.Mock(status_code=200)
            token_response.json.return_value = {"access_token": "oauth", "expires_in": 3600}
            sent = mock.Mock(status_code=200, text="{}")
            push.queue(kari, title="Hei", body="", path="/drinks/3", tag="t")
            with mock.patch("notifications.fcm.requests.post", side_effect=[token_response, sent]) as post:
                self.assertEqual(push.send_pending(), 1)
            body = post.call_args_list[1].kwargs["json"]["message"]
            self.assertEqual(body["token"], "device-token-1")
            self.assertEqual(body["data"]["url"], "/drinks/3")

            gone = mock.Mock(status_code=404, text='{"error": {"status": "NOT_FOUND", "details": ["UNREGISTERED"]}}')
            push.queue(kari, title="Igjen", body="", path="/", tag="t")
            with mock.patch("notifications.fcm.requests.post", return_value=gone):
                push.send_pending()
            self.assertFalse(PushSubscription.objects.exists())


class WorkerTests(GraphQLTestCase):
    def test_cleanup(self):
        kari = make_user("kari")
        ApiToken.issue(kari, "old")
        ApiToken.objects.update(last_used_at=timezone.now() - timedelta(days=400))
        LookupCache.objects.create(key="old", body={}, expires_at=timezone.now() - timedelta(days=1))
        Worker().tick()
        self.assertFalse(ApiToken.objects.exists())
        self.assertFalse(LookupCache.objects.exists())
        self.assertTrue(WorkerHeartbeat.objects.exists())
