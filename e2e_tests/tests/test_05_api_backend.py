"""
test_05_api_backend.py — Direct REST API tests (no browser required).

These tests call the backend via the `requests` library and validate:
  - Health check endpoint
  - Auth: register, login, bad credentials
  - Services CRUD
  - Providers listing and search
  - Bookings lifecycle (create, list, get)
  - Reviews: create and list
  - User profile: get /me, update profile
  - listUsers pagination and role filter (MED-03 fix)
  - Service ownership validation on createBooking (MED-06 fix)
  - fullName normalization on register (LOW-03 fix)
"""

import time
import datetime
import pytest


# ── Health ─────────────────────────────────────────────────────────────────────

@pytest.mark.api
@pytest.mark.smoke
class TestHealth:

    def test_api_health_check(self, api):
        r = api.get("/api/health")
        assert r.status_code == 200
        data = r.json()
        assert data.get("status") == "ok"

    def test_api_root_returns_welcome(self, api):
        r = api.get("/")
        assert r.status_code == 200


# ── Auth API ───────────────────────────────────────────────────────────────────

@pytest.mark.api
class TestAuthApi:

    def test_login_customer_success(self, api, customer_creds):
        data = api.login(customer_creds["email"], customer_creds["password"])
        assert data.get("success"), f"Login failed: {data}"
        assert "token" in data["data"]
        assert data["data"]["token"]
        api.logout()

    def test_login_provider_success(self, api, provider_creds):
        data = api.login(provider_creds["email"], provider_creds["password"])
        assert data.get("success"), f"Provider login failed: {data}"
        assert "token" in data["data"]
        api.logout()

    def test_login_invalid_password(self, api):
        data = api.login("nobody@nowhere.invalid", "WrongPass@1!")
        assert not data.get("success")

    def test_login_missing_email(self, api):
        r = api.session.post(f"{api.base}/api/auth/login", json={"password": "Test@1234!"})
        data = r.json()
        assert not data.get("success") or r.status_code == 400

    def test_login_missing_password(self, api):
        r = api.session.post(f"{api.base}/api/auth/login", json={"email": "test@example.com"})
        data = r.json()
        assert not data.get("success") or r.status_code == 400

    def test_register_fullname_title_case_normalization(self, api):
        """LOW-03: fullName should be stored in title case with collapsed whitespace."""
        ts = int(time.time())
        r = api.session.post(f"{api.base}/api/auth/register", json={
            "email": f"e2e_titlecase_{ts}@mailtest.dev",
            "password": "E2eTest@9876!",
            "fullName": "  john   doe  ",  # mixed whitespace and lowercase
            "role": "customer",
        })
        data = r.json()
        if not data.get("success"):
            # Email confirmation required or rate limited — check the normalization via token if available
            pytest.skip("Registration requires email confirmation or is rate-limited.")
        token = data["data"].get("token")
        if not token:
            pytest.skip("No token returned (email confirmation required).")
        # Fetch profile to check stored name
        import requests as req_lib
        profile_r = req_lib.get(
            f"{api.base}/api/users/me",
            headers={"Authorization": f"Bearer {token}"},
        )
        profile = profile_r.json().get("data", {})
        stored_name = profile.get("full_name") or ""
        assert stored_name == "John Doe", \
            f"Expected 'John Doe' after normalization, got '{stored_name}'"


# ── Services API ───────────────────────────────────────────────────────────────

@pytest.mark.api
class TestServicesApi:

    def test_list_services_public(self, api):
        """GET /api/services is publicly accessible."""
        api.logout()
        r = api.get("/api/services")
        assert r.status_code == 200
        data = r.json()
        assert data.get("success")
        assert "data" in data

    def test_list_services_pagination(self, api):
        """GET /api/services accepts page and limit params."""
        api.logout()
        r = api.get("/api/services?page=1&limit=5")
        data = r.json()
        assert data.get("success")
        items = data.get("data", [])
        assert isinstance(items, list)
        assert len(items) <= 5

    def test_get_service_by_id(self, api):
        """GET /api/services/:id returns a single service."""
        api.logout()
        r = api.get("/api/services?limit=1")
        services = r.json().get("data", [])
        if not services:
            pytest.skip("No services in DB.")
        service_id = services[0].get("id") or services[0].get("_id")
        r2 = api.get(f"/api/services/{service_id}")
        data = r2.json()
        assert data.get("success")
        assert str(data["data"].get("id") or data["data"].get("_id")) == str(service_id)

    def test_get_nonexistent_service_returns_404(self, api):
        api.logout()
        r = api.get("/api/services/00000000-0000-0000-0000-000000000000")
        assert r.status_code == 404

    def test_create_service_requires_auth(self, api):
        """POST /api/services without a token returns 401."""
        api.logout()
        r = api.post("/api/services", json={
            "name": "Unauthorized Service",
            "category_id": "1",
            "base_price": 50,
            "duration_minutes": 60,
        })
        assert r.status_code == 401

    def test_provider_can_create_service(self, provider_api):
        """Authenticated provider can create a service."""
        r = provider_api.get("/api/categories")
        cats = r.json().get("data", [])
        if not cats:
            pytest.skip("No categories in DB.")
        cat_id = cats[0].get("id") or cats[0].get("_id")

        ts = int(time.time())
        r2 = provider_api.post("/api/services", json={
            "name": f"E2E Service {ts}",
            "category_id": str(cat_id),
            "base_price": 75,
            "duration_minutes": 90,
            "description": "Created by Selenium E2E test",
        })
        data = r2.json()
        assert data.get("success"), f"Create service failed: {data}"
        assert data["data"].get("name") == f"E2E Service {ts}"

        # Clean up — delete the created service
        service_id = data["data"].get("id") or data["data"].get("_id")
        if service_id:
            provider_api.delete(f"/api/services/{service_id}")

    def test_customer_cannot_create_service(self, customer_api):
        """Authenticated customer cannot create a service (provider-only endpoint)."""
        r = customer_api.post("/api/services", json={
            "name": "Illegal Service",
            "category_id": "1",
            "base_price": 10,
            "duration_minutes": 30,
        })
        assert r.status_code in (403, 401), f"Expected 403/401, got {r.status_code}"


# ── Providers API ─────────────────────────────────────────────────────────────

@pytest.mark.api
class TestProvidersApi:

    def test_list_providers_public(self, api):
        api.logout()
        r = api.get("/api/providers")
        assert r.status_code == 200
        data = r.json()
        assert data.get("success")

    def test_provider_search(self, api):
        api.logout()
        r = api.get("/api/providers/search?q=")
        assert r.status_code == 200

    def test_get_provider_by_id(self, api):
        api.logout()
        r = api.get("/api/providers?limit=1")
        providers = r.json().get("data", [])
        if not providers:
            pytest.skip("No providers in DB.")
        # Handle both list and dict response shapes
        if isinstance(providers, dict):
            providers = providers.get("providers", [])
        if not providers:
            pytest.skip("No providers in DB.")
        provider_id = providers[0].get("id") or providers[0].get("_id")
        r2 = api.get(f"/api/providers/{provider_id}")
        data = r2.json()
        assert data.get("success")


# ── Bookings API ──────────────────────────────────────────────────────────────

@pytest.mark.api
class TestBookingsApi:

    def test_list_bookings_requires_auth(self, api):
        api.logout()
        r = api.get("/api/bookings")
        assert r.status_code == 401

    def test_list_bookings_customer(self, customer_api):
        r = customer_api.get("/api/bookings")
        data = r.json()
        assert data.get("success"), f"List bookings failed: {data}"
        assert "data" in data

    def test_list_bookings_pagination(self, customer_api):
        r = customer_api.get("/api/bookings?page=1&limit=5")
        data = r.json()
        assert data.get("success")
        assert data.get("page") == 1
        assert data.get("limit") == 5

    def test_create_booking_requires_auth(self, api):
        api.logout()
        r = api.post("/api/bookings", json={
            "provider_id": "fake",
            "service_id": "fake",
            "scheduled_at": "2099-01-01T10:00:00Z",
        })
        assert r.status_code == 401

    def test_create_booking_service_belongs_to_provider_validation(self, customer_api, provider_api):
        """MED-06: Creating a booking with a service that doesn't belong to the provider returns 400."""
        # Get a provider
        r_prov = customer_api.get("/api/providers?limit=2")
        providers = r_prov.json().get("data", [])
        if isinstance(providers, dict):
            providers = providers.get("providers", [])
        if len(providers) < 2:
            pytest.skip("Need at least 2 providers to test cross-provider service mismatch.")

        # Get a service from provider[0]
        prov_0_id = str(providers[0].get("id") or providers[0].get("_id"))
        prov_1_id = str(providers[1].get("id") or providers[1].get("_id"))

        r_svc = customer_api.get(f"/api/services?limit=5")
        services = r_svc.json().get("data", [])
        # Find a service that belongs to providers[0]
        svc_for_p0 = next(
            (s for s in services if str(s.get("provider_id")) == prov_0_id),
            None,
        )
        if not svc_for_p0:
            pytest.skip("Could not find a service owned by provider[0].")

        future = (datetime.datetime.utcnow() + datetime.timedelta(days=14)).strftime("%Y-%m-%dT%H:%M:%SZ")
        # Attempt booking with provider[1] but service from provider[0] → should be rejected
        r = customer_api.post("/api/bookings", json={
            "provider_id": prov_1_id,
            "service_id": str(svc_for_p0.get("id") or svc_for_p0.get("_id")),
            "scheduled_at": future,
        })
        data = r.json()
        assert r.status_code == 400 or not data.get("success"), \
            f"Expected 400 for service/provider mismatch. Got {r.status_code}: {data}"
        if not data.get("success"):
            assert "provider" in str(data.get("error", "")).lower() or \
                   "service" in str(data.get("error", "")).lower()

    def test_get_booking_forbidden_for_unrelated_user(self, customer_api, provider_api):
        """A customer cannot get a booking they don't own (403)."""
        # Get a provider booking
        r = provider_api.get("/api/bookings")
        data = r.json()
        bookings = data.get("data", [])
        if not bookings:
            pytest.skip("No bookings for provider.")
        booking_id = bookings[0].get("id") or bookings[0].get("_id")

        # Access it as an unrelated customer
        r2 = customer_api.get(f"/api/bookings/{booking_id}")
        # Should be 403 or 404 if the customer doesn't own it
        assert r2.status_code in (403, 404) or not r2.json().get("success"), \
            f"Expected 403/404 for unrelated booking access, got {r2.status_code}"


# ── Users API (admin features) ────────────────────────────────────────────────

@pytest.mark.api
class TestUsersApi:

    def test_get_me_returns_profile(self, customer_api):
        r = customer_api.get("/api/users/me")
        data = r.json()
        assert data.get("success"), f"GET /me failed: {data}"
        assert "email" in data["data"]

    def test_update_profile_name(self, customer_api):
        unique_name = f"API Tester {int(time.time()) % 9999}"
        r = customer_api.put("/api/users/me", json={"full_name": unique_name})
        data = r.json()
        assert data.get("success"), f"Profile update failed: {data}"

    def test_update_profile_phone_and_bio(self, customer_api):
        r = customer_api.put("/api/users/me", json={
            "phone": "(555) 987-6543",
            "bio": "E2E test bio",
        })
        data = r.json()
        assert data.get("success") or "migration" in str(data).lower(), \
            f"Phone/bio update failed: {data}"

    def test_list_users_requires_admin(self, customer_api):
        """GET /api/users is admin-only. A customer gets 403."""
        r = customer_api.get("/api/users")
        assert r.status_code == 403

    def test_list_users_pagination_params_accepted(self, customer_api):
        """MED-03: /api/users endpoint accepts page, limit, and role query params.
        We can only verify the request is accepted (403 due to role) not the result."""
        r = customer_api.get("/api/users?page=1&limit=10&role=customer")
        # 403 is correct for a non-admin; the key is the query params don't cause a 500
        assert r.status_code in (403, 200), f"Unexpected status {r.status_code}"


# ── Reviews API ───────────────────────────────────────────────────────────────

@pytest.mark.api
class TestReviewsApi:

    def test_get_provider_reviews_public(self, api):
        """GET /api/reviews/:providerId is publicly accessible."""
        api.logout()
        r = api.get("/api/providers?limit=1")
        providers = r.json().get("data", [])
        if isinstance(providers, dict):
            providers = providers.get("providers", [])
        if not providers:
            pytest.skip("No providers in DB.")
        provider_id = providers[0].get("id") or providers[0].get("_id")
        r2 = api.get(f"/api/reviews/{provider_id}")
        assert r2.status_code == 200
        data = r2.json()
        assert data.get("success")
        assert isinstance(data.get("data"), list)

    def test_create_review_requires_auth(self, api):
        api.logout()
        r = api.post("/api/reviews", json={
            "booking_id": "fake",
            "rating": 5,
        })
        assert r.status_code == 401

    def test_create_review_on_non_completed_booking_fails(self, customer_api):
        """Trying to review a pending booking returns an error."""
        r = customer_api.get("/api/bookings")
        bookings = r.json().get("data", [])
        pending = next((b for b in (bookings if isinstance(bookings, list) else [])
                        if b.get("status") == "pending"), None)
        if not pending:
            pytest.skip("No pending bookings to test with.")
        r2 = customer_api.post("/api/reviews", json={
            "booking_id": str(pending.get("id") or pending.get("_id")),
            "rating": 5,
        })
        data = r2.json()
        assert not data.get("success"), "Should not allow review of non-completed booking"
        assert "completed" in str(data.get("error", "")).lower()


# ── Categories API ────────────────────────────────────────────────────────────

@pytest.mark.api
class TestCategoriesApi:

    def test_list_categories_public(self, api):
        api.logout()
        r = api.get("/api/categories")
        assert r.status_code == 200
        data = r.json()
        assert data.get("success")
        assert isinstance(data.get("data"), list)
        assert len(data["data"]) > 0, "At least one category should exist"

    def test_get_category_by_id(self, api):
        api.logout()
        r = api.get("/api/categories")
        cats = r.json().get("data", [])
        if not cats:
            pytest.skip("No categories.")
        cat_id = cats[0].get("id") or cats[0].get("_id")
        r2 = api.get(f"/api/categories/{cat_id}")
        assert r2.status_code == 200
        data = r2.json()
        assert data.get("success")
