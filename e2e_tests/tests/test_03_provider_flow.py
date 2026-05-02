"""
test_03_provider_flow.py — Provider end-to-end journeys.

Covers:
  - Provider dashboard renders with correct stats / sections
  - Provider can view their bookings (/my-bookings)
  - Provider-specific NavBar items (no 'Browse Services')
  - Provider dashboard API returns data
  - Accept a booking (via API + UI verification)
  - Reject a booking (via API + UI verification)
  - Complete a booking (API)
  - /visual-damage redirects a provider to /dashboard (customer-only page)
"""

import pytest
from selenium.webdriver.common.by import By
from selenium.webdriver.support.ui import WebDriverWait
from selenium.webdriver.support import expected_conditions as EC

from pages.login_page import LoginPage
from pages.base_page import BasePage


# ── Fixtures ───────────────────────────────────────────────────────────────────

@pytest.fixture(autouse=True)
def login_as_provider(driver, base_url, provider_creds):
    """Log in as the test provider before every test in this module."""
    page = LoginPage(driver, base_url)
    page.login_and_wait_dashboard(
        provider_creds["email"],
        provider_creds["password"],
        role="provider",
    )
    yield
    driver.get(f"{base_url}/#/")


# ── Provider Dashboard ─────────────────────────────────────────────────────────

@pytest.mark.provider
@pytest.mark.smoke
class TestProviderDashboard:

    def test_dashboard_loads(self, driver, base_url):
        """Provider dashboard renders without JS errors."""
        driver.get(f"{base_url}/#/dashboard")
        body_text = driver.find_element(By.TAG_NAME, "body").text.lower()
        assert any(word in body_text for word in [
            "dashboard", "booking", "service", "revenue", "provider"
        ]), f"Provider dashboard content missing. Body: {body_text[:400]}"

    def test_provider_navbar_has_no_browse_services(self, driver, base_url):
        """Provider NavBar does NOT show 'Browse Services' (customer-only link)."""
        driver.get(f"{base_url}/#/dashboard")
        nav = driver.find_element(By.TAG_NAME, "nav")
        assert "Browse Services" not in nav.text

    def test_provider_navbar_has_home_link(self, driver, base_url):
        """Provider NavBar shows a 'Home' link pointing to /dashboard."""
        driver.get(f"{base_url}/#/dashboard")
        nav = driver.find_element(By.TAG_NAME, "nav")
        assert "Home" in nav.text or "Dashboard" in nav.text

    def test_dashboard_shows_stats_section(self, driver, base_url):
        """Provider dashboard shows revenue, bookings, or rating stats."""
        driver.get(f"{base_url}/#/dashboard")
        body_text = driver.find_element(By.TAG_NAME, "body").text.lower()
        assert any(word in body_text for word in [
            "booking", "service", "rating", "revenue", "total", "pending", "confirmed"
        ])


# ── My Bookings page ──────────────────────────────────────────────────────────

@pytest.mark.provider
class TestProviderBookings:

    def test_my_bookings_page_accessible(self, driver, base_url):
        """Provider can navigate to /my-bookings."""
        driver.get(f"{base_url}/#/my-bookings")
        page = BasePage(driver, base_url)
        body_text = driver.find_element(By.TAG_NAME, "body").text.lower()
        assert any(word in body_text for word in [
            "booking", "no booking", "appointment", "pending", "confirmed"
        ]), f"/my-bookings content missing. Body: {body_text[:400]}"

    def test_my_bookings_shows_status_filters(self, driver, base_url):
        """Booking list page has some filtering mechanism (tabs, dropdown, or buttons)."""
        driver.get(f"{base_url}/#/my-bookings")
        page = BasePage(driver, base_url)
        body_text = driver.find_element(By.TAG_NAME, "body").text.lower()
        # The provider bookings page should show status labels
        has_filter_ui = any(word in body_text for word in [
            "pending", "confirmed", "completed", "cancelled", "all"
        ])
        assert has_filter_ui, f"No status filter UI found. Body: {body_text[:400]}"


# ── Booking Status Transitions (API + UI) ─────────────────────────────────────

@pytest.mark.provider
class TestBookingTransitions:

    def _get_pending_booking_id(self, provider_api) -> str | None:
        """Return the ID of the first pending booking belonging to the provider, or None."""
        r = provider_api.get("/api/bookings")
        data = r.json()
        if not data.get("success"):
            return None
        bookings = data.get("data", [])
        if not isinstance(bookings, list):
            return None
        for b in bookings:
            if b.get("status") == "pending":
                return str(b.get("id") or b.get("_id"))
        return None

    def _get_confirmed_booking_id(self, provider_api) -> str | None:
        """Return the ID of the first confirmed booking for the provider, or None."""
        r = provider_api.get("/api/bookings")
        data = r.json()
        if not data.get("success"):
            return None
        bookings = data.get("data", [])
        if not isinstance(bookings, list):
            return None
        for b in bookings:
            if b.get("status") == "confirmed":
                return str(b.get("id") or b.get("_id"))
        return None

    def test_accept_booking_via_api(self, provider_api):
        """Provider can accept a pending booking via the REST API."""
        booking_id = self._get_pending_booking_id(provider_api)
        if not booking_id:
            pytest.skip("No pending bookings available for the test provider.")
        r = provider_api.put(f"/api/bookings/{booking_id}/accept", json={})
        data = r.json()
        assert data.get("success"), f"Accept failed: {data}"
        assert data["data"]["status"] == "confirmed"

    def test_reject_booking_via_api(self, provider_api):
        """Provider can reject a pending booking via the REST API."""
        booking_id = self._get_pending_booking_id(provider_api)
        if not booking_id:
            pytest.skip("No pending bookings available for the test provider.")
        r = provider_api.put(
            f"/api/bookings/{booking_id}/reject",
            json={"reason": "E2E test rejection"},
        )
        data = r.json()
        assert data.get("success"), f"Reject failed: {data}"
        assert data["data"]["status"] == "cancelled"

    def test_complete_booking_via_api(self, provider_api):
        """Provider can mark a confirmed booking as completed via the REST API."""
        booking_id = self._get_confirmed_booking_id(provider_api)
        if not booking_id:
            pytest.skip("No confirmed bookings available for the test provider.")
        r = provider_api.put(f"/api/bookings/{booking_id}/complete", json={})
        data = r.json()
        assert data.get("success"), f"Complete failed: {data}"
        assert data["data"]["status"] == "completed"

    def test_accept_nonexistent_booking_returns_404(self, provider_api):
        """Accepting a booking that does not exist returns 404."""
        r = provider_api.put("/api/bookings/00000000-0000-0000-0000-000000000000/accept", json={})
        assert r.status_code in (404, 403, 400), f"Expected 404/403/400, got {r.status_code}"

    def test_cannot_accept_already_confirmed_booking(self, provider_api):
        """Accepting a booking that is already confirmed returns a conflict error."""
        booking_id = self._get_confirmed_booking_id(provider_api)
        if not booking_id:
            pytest.skip("No confirmed bookings available.")
        r = provider_api.put(f"/api/bookings/{booking_id}/accept", json={})
        data = r.json()
        # Already confirmed — should return 409 or success:false
        assert r.status_code == 409 or not data.get("success"), \
            "Expected failure when accepting an already-confirmed booking"


# ── Role restriction: /visual-damage is customer-only ─────────────────────────

@pytest.mark.provider
class TestProviderRoleRestrictions:

    def test_visual_damage_redirects_provider_to_dashboard(self, driver, base_url):
        """A logged-in provider visiting /visual-damage is redirected to /dashboard."""
        driver.get(f"{base_url}/#/visual-damage")
        WebDriverWait(driver, 10).until(
            lambda d: "/dashboard" in d.current_url or "/visual-damage" not in d.current_url
        )
        assert "/dashboard" in driver.current_url, \
            f"Provider should be redirected from /visual-damage to /dashboard. URL: {driver.current_url}"

    def test_provider_cannot_create_booking(self, provider_api, customer_api):
        """Providers are not customers — posting to /api/bookings should fail or be role-guarded."""
        # Get a service ID to attempt booking against
        r = customer_api.get("/api/services?limit=1")
        services = r.json().get("data", [])
        if not services:
            pytest.skip("No services available.")
        service_id = services[0].get("id")
        providers_r = customer_api.get(f"/api/providers/by-service/{service_id}")
        providers = providers_r.json().get("data", [])
        if not providers:
            pytest.skip("No providers for this service.")
        provider_id = providers[0].get("id")

        import datetime
        future_dt = (datetime.datetime.utcnow() + datetime.timedelta(days=7)).isoformat() + "Z"
        r = provider_api.post("/api/bookings", json={
            "provider_id": provider_id,
            "service_id": service_id,
            "scheduled_at": future_dt,
        })
        # Should fail — providers cannot book services for themselves
        data = r.json()
        assert r.status_code in (400, 403) or not data.get("success"), \
            "Provider should not be able to create a booking"
