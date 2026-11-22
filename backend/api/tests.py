from django.test import Client

from accounts.models import ApiToken, Role, User
from core.testing import GraphQLTestCase, make_drink, make_user
from drinks.models import Cheers, Drink, SiteSettings
from notifications.models import OutgoingEmail, PushMessage, PushSubscription

ME = "{ me { username role isApproved canAddDrinks } }"
DRINKS = """query($filter: DrinkFilter, $sort: DrinkSort, $descending: Boolean, $offset: Int, $limit: Int) {
  drinks(filter: $filter, sort: $sort, descending: $descending, offset: $offset, limit: $limit) {
    total hasMore items { id name rating canEdit cheersCount cheeredByMe createdBy { username } }
  }
}"""
CREATE = """mutation($input: DrinkInput!, $clientId: String) {
  createDrink(input: $input, clientId: $clientId) {
    id name rating abv category container canEdit createdBy { username }
  }
}"""
UPDATE = "mutation($id: ID!, $input: DrinkInput!) { updateDrink(id: $id, input: $input) { id name rating } }"
DELETE = "mutation($id: ID!) { deleteDrink(id: $id) }"
LOGIN = """mutation($u: String!, $p: String!, $d: String) {
  login(username: $u, password: $p, device: $d) { token user { username } }
}"""
SIGNUP = """mutation($u: String!, $e: String!, $p: String!) {
  signup(username: $u, email: $e, password: $p) { user { username isApproved role } }
}"""


class AuthTests(GraphQLTestCase):
    def test_session_login_and_logout(self):
        make_user("kari")
        data = self.ok(LOGIN, {"u": "kari", "p": "Sterkt-passord-42"})
        self.assertIsNone(data["login"]["token"])
        self.assertEqual(self.ok(ME)["me"]["username"], "kari")
        self.ok("mutation { logout }")
        self.assertIsNone(self.ok(ME)["me"])

    def test_wrong_password_is_rate_limited(self):
        make_user("kari")
        for _ in range(10):
            self.assertEqual(self.error_code(LOGIN, {"u": "kari", "p": "feil"}), "INVALID_CREDENTIALS")
        self.assertEqual(self.error_code(LOGIN, {"u": "kari", "p": "Sterkt-passord-42"}), "RATE_LIMITED")

    def test_app_login_returns_a_bearer_token(self):
        make_user("kari")
        # Before logging in, the app sends "Bearer anonymous": no cookies, so no CSRF token either.
        app = Client(enforce_csrf_checks=True)
        variables = {"u": "kari", "p": "Sterkt-passord-42", "d": "Pixel 9"}
        token = self.ok(LOGIN, variables, client=app, token="anonymous")["login"]["token"]
        self.assertTrue(token)
        self.assertEqual(self.ok(ME, client=app, token=token)["me"]["username"], "kari")
        # No session was started: without the token the app is anonymous.
        self.assertIsNone(self.ok(ME, client=app, token="anonymous")["me"])
        # Mutations work without CSRF when the token is used.
        self.ok(CREATE, {"input": {"name": "IPA", "rating": 8}}, client=app, token=token)
        self.ok("mutation { logout }", client=app, token=token)
        self.assertFalse(ApiToken.objects.exists())
        self.assertIsNone(self.ok(ME, client=app, token=token)["me"])

    def test_unknown_token_is_anonymous_even_with_a_session(self):
        user = make_user("kari")
        self.login(user)
        self.assertIsNone(self.ok(ME, token="not-a-token")["me"])

    def test_session_mutation_needs_csrf(self):
        user = make_user("kari")
        browser = Client(enforce_csrf_checks=True)
        browser.force_login(user)
        response = browser.post("/graphql/", data='{"query": "mutation { logout }"}', content_type="application/json")
        self.assertEqual(response.status_code, 403)

    def test_imported_bcrypt_password_works_and_is_upgraded(self):
        import bcrypt

        user = User.objects.create(username="gammel", is_approved=True)
        hashed = bcrypt.hashpw(b"gammelt-passord-1", bcrypt.gensalt(4)).decode().replace("$2b$", "$2a$", 1)
        User.objects.filter(pk=user.pk).update(password=f"bcrypt${hashed}")
        self.ok(LOGIN, {"u": "gammel", "p": "gammelt-passord-1"})
        self.assertFalse(User.objects.get(pk=user.pk).password.startswith("bcrypt$"))


class SignupTests(GraphQLTestCase):
    def test_signup_waits_for_approval_by_default(self):
        admin = make_user("admin", role=Role.ADMIN)
        data = self.ok(SIGNUP, {"u": "nyperson", "e": "ny@example.com", "p": "Sterkt-passord-42"})
        self.assertEqual(data["signup"]["user"], {"username": "nyperson", "isApproved": False, "role": "CONTRIBUTOR"})
        # The admin is told by email and push.
        self.assertTrue(OutgoingEmail.objects.filter(to=admin.email, kind="admin_new_signup").exists())
        # Unapproved users can't add drinks.
        self.assertEqual(self.error_code(CREATE, {"input": {"name": "IPA", "rating": 8}}), "NOT_APPROVED")

    def test_signup_without_approval(self):
        SiteSettings.objects.filter(pk=1).update(require_approval=False, default_role=Role.VIEWER)
        data = self.ok(SIGNUP, {"u": "nyperson", "e": "ny@example.com", "p": "Sterkt-passord-42"})
        self.assertEqual(data["signup"]["user"]["isApproved"], True)
        self.assertEqual(data["signup"]["user"]["role"], "VIEWER")

    def test_signup_closed(self):
        SiteSettings.objects.filter(pk=1).update(allow_signup=False)
        self.assertEqual(
            self.error_code(SIGNUP, {"u": "nyperson", "e": "ny@example.com", "p": "Sterkt-passord-42"}),
            "SIGNUP_CLOSED",
        )

    def test_duplicate_username_and_weak_password(self):
        make_user("kari")
        self.assertEqual(
            self.error_code(SIGNUP, {"u": "KARI", "e": "k2@example.com", "p": "Sterkt-passord-42"}), "USERNAME_TAKEN"
        )
        self.assertEqual(self.error_code(SIGNUP, {"u": "per", "e": "p@example.com", "p": "123"}), "INVALID_PASSWORD")

    def test_password_reset(self):
        user = make_user("kari")
        self.ok('mutation { requestPasswordReset(email: "KARI@example.com") }')
        email = OutgoingEmail.objects.get(kind="password_reset")
        link = next(line for line in email.body.splitlines() if "reset-password" in line).strip()
        self.assertNotIn("&amp;", link)
        query = link.split("?", 1)[1]
        params = dict(part.split("=", 1) for part in query.split("&"))
        self.ok(
            "mutation($uid: String!, $token: String!) "
            '{ resetPassword(uid: $uid, token: $token, newPassword: "Nytt-passord-99") }',
            {"uid": params["uid"], "token": params["token"]},
        )
        user.refresh_from_db()
        self.assertTrue(user.check_password("Nytt-passord-99"))


class PublicViewTests(GraphQLTestCase):
    def test_public_view_on_by_default(self):
        make_drink(make_user("kari"), name="Pils")
        data = self.ok(DRINKS)
        self.assertEqual(data["drinks"]["total"], 1)
        self.assertFalse(data["drinks"]["items"][0]["canEdit"])
        self.ok("{ stats { total } people { username } }")

    def test_public_view_off(self):
        SiteSettings.objects.filter(pk=1).update(public_view=False)
        make_drink(make_user("kari"))
        self.assertEqual(self.error_code(DRINKS), "NOT_AUTHENTICATED")
        pending = make_user("venter", approved=False)
        self.login(pending)
        self.assertEqual(self.error_code(DRINKS), "NOT_APPROVED")
        self.ok("{ siteConfig { publicView allowSignup } }")


class DrinkTests(GraphQLTestCase):
    def setUp(self):
        super().setUp()
        self.kari = make_user("kari")
        self.login(self.kari)

    def test_create_cleans_input(self):
        data = self.ok(
            CREATE,
            {"input": {"name": "  Hazy IPA ", "rating": 9, "abv": 6.55, "category": "BEER", "container": "CAN"}},
        )["createDrink"]
        self.assertEqual(data["name"], "Hazy IPA")
        self.assertEqual(data["abv"], 6.6)
        self.assertEqual(data["container"], "CAN")
        self.assertTrue(data["canEdit"])
        self.assertEqual(data["createdBy"]["username"], "kari")

    def test_validation(self):
        self.assertEqual(self.error_code(CREATE, {"input": {"name": " ", "rating": 5}}), "NAME_REQUIRED")
        self.assertEqual(self.error_code(CREATE, {"input": {"name": "X", "rating": 11}}), "INVALID_RATING")
        self.assertEqual(self.error_code(CREATE, {"input": {"name": "X", "rating": 5, "abv": 120}}), "INVALID_ABV")
        self.assertEqual(
            self.error_code(CREATE, {"input": {"name": "X", "rating": 5, "dateTried": "2999-01-01"}}),
            "DATE_IN_FUTURE",
        )

    def test_client_id_makes_create_idempotent(self):
        first = self.ok(CREATE, {"input": {"name": "Stout", "rating": 7}, "clientId": "abc-1"})["createDrink"]
        again = self.ok(CREATE, {"input": {"name": "Stout", "rating": 7}, "clientId": "abc-1"})["createDrink"]
        self.assertEqual(first["id"], again["id"])
        self.assertEqual(Drink.objects.count(), 1)

    def test_only_own_drinks_can_be_changed(self):
        other = make_drink(make_user("per"), name="Pers øl")
        self.assertEqual(self.error_code(UPDATE, {"id": other.pk, "input": {"name": "Mitt", "rating": 1}}), "FORBIDDEN")
        self.assertEqual(self.error_code(DELETE, {"id": other.pk}), "FORBIDDEN")
        mine = make_drink(self.kari)
        self.ok(UPDATE, {"id": mine.pk, "input": {"name": "Bedre", "rating": 10}})
        self.ok(DELETE, {"id": mine.pk})
        self.assertFalse(Drink.objects.filter(pk=mine.pk).exists())

    def test_admin_can_change_any_drink(self):
        other = make_drink(make_user("per"))
        self.login(make_user("sjef", role=Role.ADMIN))
        self.ok(UPDATE, {"id": other.pk, "input": {"name": "Rettet", "rating": 6}})

    def test_viewer_cannot_add(self):
        self.login(make_user("ser", role=Role.VIEWER))
        self.assertEqual(self.error_code(CREATE, {"input": {"name": "X", "rating": 5}}), "FORBIDDEN")

    def test_filter_sort_and_paging(self):
        for i in range(5):
            make_drink(self.kari, name=f"Øl {i}", rating=i + 1, date_tried=f"2026-01-0{i + 1}")
        make_drink(make_user("per"), name="Vin", category="wine", rating=9)
        data = self.ok(DRINKS, {"filter": {"category": "BEER"}, "sort": "RATING", "limit": 2})["drinks"]
        self.assertEqual(data["total"], 5)
        self.assertTrue(data["hasMore"])
        self.assertEqual([d["rating"] for d in data["items"]], [5, 4])
        data = self.ok(DRINKS, {"filter": {"mine": True, "search": "Øl 3"}})["drinks"]
        self.assertEqual([d["name"] for d in data["items"]], ["Øl 3"])
        data = self.ok(DRINKS, {"filter": {"dateFrom": "2026-01-02", "dateTo": "2026-01-03"}})["drinks"]
        self.assertEqual(data["total"], 2)

    def test_cheers_notifies_the_owner(self):
        per = make_user("per")
        PushSubscription.objects.create(user=per, endpoint="https://push.example/1", p256dh="x", auth="y")
        drink = make_drink(per)
        mutation = "mutation($id: ID!, $on: Boolean!) { cheer(drinkId: $id, on: $on) { cheersCount cheeredByMe } }"
        data = self.ok(mutation, {"id": drink.pk, "on": True})["cheer"]
        self.assertEqual(data, {"cheersCount": 1, "cheeredByMe": True})
        self.ok(mutation, {"id": drink.pk, "on": True})
        self.assertEqual(Cheers.objects.count(), 1)
        self.assertEqual(PushMessage.objects.filter(tag=f"cheers-{drink.pk}").count(), 1)
        self.assertEqual(self.ok(mutation, {"id": drink.pk, "on": False})["cheer"]["cheersCount"], 0)

    def test_new_drink_push_to_subscribers(self):
        per = make_user("per", push_new_drinks=True)
        PushSubscription.objects.create(user=per, endpoint="https://push.example/2", p256dh="x", auth="y")
        self.ok(CREATE, {"input": {"name": "Saison", "rating": 8}})
        message = PushMessage.objects.get()
        self.assertIn("kari", message.title)
        self.assertTrue(message.url.startswith("/drinks/"))

    def test_similar_and_field_values(self):
        make_drink(self.kari, name="Guinness Draught", producer="Guinness")
        make_drink(self.kari, name="Guinness Extra", producer="Guinness")
        make_drink(self.kari, name="Pils", producer="Ringnes")
        data = self.ok('{ similarDrinks(name: "guinness") { name } fieldValues(field: PRODUCER) }')
        self.assertEqual(len(data["similarDrinks"]), 2)
        self.assertEqual(data["fieldValues"], ["Guinness", "Ringnes"])

    def test_stats(self):
        make_drink(self.kari, rating=8, country="Norge", style="IPA", would_have_again=True)
        make_drink(self.kari, rating=6, country="Norge", category="wine", date_tried="2025-03-01")
        make_drink(make_user("per"), rating=10, country="Irland")
        data = self.ok(
            "query($u: ID) { stats(userId: $u) { total avgRating wouldHaveAgainPct ratingDistribution "
            "byCategory { label count } topCountries { label count } byUser { username count } years } }",
            {"u": str(self.kari.pk)},
        )["stats"]
        self.assertEqual(data["total"], 2)
        self.assertEqual(data["avgRating"], 7.0)
        self.assertEqual(data["wouldHaveAgainPct"], 50)
        self.assertEqual(data["ratingDistribution"][7], 1)
        self.assertEqual(data["topCountries"], [{"label": "Norge", "count": 2}])
        self.assertEqual(data["years"], [2026, 2025])
        everyone = self.ok("{ stats(year: 2026) { total byUser { username count } } }")["stats"]
        self.assertEqual(everyone["total"], 2)
        self.assertEqual({u["username"] for u in everyone["byUser"]}, {"kari", "per"})


class AdminTests(GraphQLTestCase):
    def setUp(self):
        super().setUp()
        self.admin = make_user("sjef", role=Role.ADMIN)
        self.login(self.admin)

    def test_non_admin_is_refused(self):
        self.login(make_user("kari"))
        self.assertEqual(self.error_code("{ users { username } }"), "FORBIDDEN")

    def test_settings(self):
        data = self.ok(
            "mutation { updateSiteSettings(input: {publicView: false, requireApproval: false, defaultRole: VIEWER}) "
            "{ publicView requireApproval defaultRole allowSignup } }"
        )["updateSiteSettings"]
        self.assertEqual(
            data, {"publicView": False, "requireApproval": False, "defaultRole": "VIEWER", "allowSignup": True}
        )
        self.assertFalse(SiteSettings.load().public_view)

    def test_approve_and_reject(self):
        waiting = make_user("venter", approved=False)
        self.ok("mutation($id: ID!) { approveUser(id: $id) { isApproved } }", {"id": waiting.pk})
        self.assertTrue(OutgoingEmail.objects.filter(kind="account_approved", to=waiting.email).exists())
        other = make_user("spam", approved=False)
        self.ok("mutation($id: ID!) { rejectUser(id: $id) }", {"id": other.pk})
        self.assertFalse(User.objects.filter(pk=other.pk).exists())

    def test_cannot_remove_own_or_last_admin(self):
        mutation = "mutation($id: ID!) { updateUser(id: $id, role: VIEWER) { role } }"
        self.assertEqual(self.error_code(mutation, {"id": self.admin.pk}), "CANNOT_CHANGE_SELF")
        self.assertEqual(
            self.error_code("mutation($id: ID!) { deleteUser(id: $id) }", {"id": self.admin.pk}), "CANNOT_CHANGE_SELF"
        )
        kari = make_user("kari")
        self.assertEqual(
            self.ok("mutation($id: ID!) { updateUser(id: $id, role: ADMIN) { role } }", {"id": kari.pk})["updateUser"][
                "role"
            ],
            "ADMIN",
        )
        kari.refresh_from_db()
        self.assertTrue(kari.is_staff)

    def test_create_and_delete_user_keeps_drinks(self):
        data = self.ok(
            'mutation { createUser(username: "nyperson", password: "Sterkt-passord-42", role: VIEWER) '
            "{ id isApproved role } }"
        )["createUser"]
        self.assertTrue(data["isApproved"])
        user = User.objects.get(pk=data["id"])
        drink = make_drink(user)
        self.ok("mutation($id: ID!) { deleteUser(id: $id) }", {"id": user.pk})
        drink.refresh_from_db()
        self.assertIsNone(drink.created_by)

    def test_deactivating_logs_out_apps(self):
        kari = make_user("kari")
        ApiToken.issue(kari, "phone")
        self.ok("mutation($id: ID!) { updateUser(id: $id, isActive: false) { isActive } }", {"id": kari.pk})
        self.assertFalse(ApiToken.objects.exists())

    def test_system_status(self):
        data = self.ok("{ systemStatus { workerHealthy users drinks version } }")["systemStatus"]
        self.assertFalse(data["workerHealthy"])
        self.assertEqual(data["users"], 1)
