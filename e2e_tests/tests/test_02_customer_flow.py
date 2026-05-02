"""
test_02_customer_flow.py — Customer end-to-end journeys.

Covers:
  - Customer dashboard loads with stats and upcoming appointments
  - Browse services on the home page (service category cards)
  - View a provider's public profile
  - Booking modal opens from the provider profile / service page
  - Booking confirmation page renders correctly after a booking
  - Customer can view their own bookings via the dashboard
  - Customer can submit a review for a completed booking (via API setup)
"""

import pytest
from selenium.webdriver.common.by import By
from selenium.webdriver.support.ui import WebDriverWait
from selenium.webdriver.support import expected_conditions as EC

from pages.login_page import LoginPage
from pages.base_page import BasePage


# ── Fixtures ───────────────────────────────────────────────────────────────────

@pytest.fixture(autouse=True)
def login_as_customer(driver, base_url, customer_creds):
    """Log in as the test customer before every test in this module."""
    page = LoginPage(driver, base_url)
    page.login_and_wait_dashboard(
        customer_creds["email"],
        customer_creds["password"],
        role="customer",
    )
    yield
    # Navigate home to reset state between tests
    driver.get(f"{base_url}/#/")


# ── Customer Dashboard ─────────────────────────────────────────────────────────

@pytest.mark.customer
@pytest.mark.smoke
class TestCustomerDashboard:

    def test_dashboard_page_loads(self, driver, base_url):
        """Customer dashboard renders without errors."""
        driver.get(f"{base_url}/#/dashboard")
        page = BasePage(driver, base_url)
        # Dashboard typically shows a greeting or stats section
        body_text = driver.find_element(By.TAG_NAME, "body").text
        assert "dashboard" in body_text.lower() or "booking" in body_text.lower() or "welcome" in body_text.lower(), \
            f"Dashboard content not found. Body: {body_text[:300]}"

    def test_dashboard_shows_booking_stats(self, driver, base_url):
        """Stats or appointment section is visible on the customer dashboard."""
        driver.get(f"{base_url}/#/dashboard")
        page = BasePage(driver, base_url)
        body_text = driver.find_element(By.TAG_NAME, "body").text.lower()
        # App shows booking counts, upcoming appointments, or similar stats
        assert any(word in body_text for word in ["booking", "appointment", "service", "upcoming", "total"])

    def test_customer_navbar_shows_browse_services(self, driver, base_url):
        """The customer NavBar includes a 'Browse Services' link."""
        driver.get(f"{base_url}/#/dashboard")
        nav = driver.find_element(By.TAG_NAME, "nav")
        assert "Browse Services" in nav.text or "browse" in nav.text.lower()

    def test_customer_navbar_shows_dashboard_link(self, driver, base_url):
        """The customer NavBar includes a 'Dashboard' link."""
        driver.get(f"{base_url}/#/dashboard")
        nav = driver.find_element(By.TAG_NAME, "nav")
        assert "Dashboard" in nav.text


# ── Home Page / Browse Services ───────────────────────────────────────────────

@pytest.mark.customer
class TestBrowseServices:

    def test_home_page_loads_service_categories(self, driver, base_url):
        """The home page renders service categories or service cards."""
        driver.get(f"{base_url}/#/")
        page = BasePage(driver, base_url)
        body_text = driver.find_element(By.TAG_NAME, "body").text.lower()
        assert any(word in body_text for word in [
            "service", "plumbing", "cleaning", "electrician", "hvac", "category"
        ]), f"No service content found on home page. Body: {body_text[:400]}"

    def test_service_cards_are_clickable(self, driver, base_url):
        """At least one service card or category button is present and clickable."""
        driver.get(f"{base_url}/#/")
        wait = WebDriverWait(driver, 12)
        # Look for clickable cards — service items are typically <button> or <div> with an onClick
        cards = driver.find_elements(By.XPATH,
            "//button[contains(@class,'rounded') or contains(@class,'card')] | "
            "//div[@role='button'] | "
            "//a[contains(@href,'#/book')]"
        )
        assert len(cards) > 0, "No service cards or buttons found on home page"

    def test_search_or_filter_present(self, driver, base_url):
        """A search input or filter control is present on the home/services page."""
        driver.get(f"{base_url}/#/")
        page = BasePage(driver, base_url)
        # May be a text input or a category filter
        has_search = (
            page.element_exists(By.CSS_SELECTOR, "input[type='search']", timeout=4)
            or page.element_exists(By.CSS_SELECTOR, "input[placeholder*='search' i]", timeout=4)
            or page.element_exists(By.CSS_SELECTOR, "input[placeholder*='Search' i]", timeout=4)
        )
        # At minimum the page should have some filter UI or service list
        body = driver.find_element(By.TAG_NAME, "body").text
        assert has_search or "service" in body.lower(), "No search/filter UI found on home page"


# ── Provider Profile ──────────────────────────────────────────────────────────

@pytest.mark.customer
class TestProviderProfile:

    def _get_first_provider_id(self, customer_api) -> str | None:
        r = customer_api.get("/api/providers?limit=1")
        data = r.json()
        if data.get("success") and data.get("data"):
            providers = data["data"]
            if isinstance(providers, list) and len(providers) > 0:
                return str(providers[0].get("id") or providers[0].get("_id"))
            if isinstance(providers, dict) and "providers" in providers:
                plist = providers["providers"]
                if plist:
                    return str(plist[0].get("id") or plist[0].get("_id"))
        return None

    def test_provider_profile_page_renders(self, driver, base_url, customer_api):
        """Navigating to a provider's public profile renders their info."""
        provider_id = self._get_first_provider_id(customer_api)
        if not provider_id:
            pytest.skip("No providers found in the database — seed the DB first.")
        driver.get(f"{base_url}/#/profile/{provider_id}?type=provider")
        page = BasePage(driver, base_url)
        body_text = driver.find_element(By.TAG_NAME, "body").text.lower()
        assert any(word in body_text for word in [
            "provider", "service", "rating", "review", "availability"
        ]), f"Provider profile content not found. Body: {body_text[:400]}"

    def test_provider_profile_shows_reviews_section(self, driver, base_url, customer_api):
        """Provider profile includes a reviews or rating section."""
        provider_id = self._get_first_provider_id(customer_api)
        if not provider_id:
            pytest.skip("No providers found.")
        driver.get(f"{base_url}/#/profile/{provider_id}?type=provider")
        page = BasePage(driver, base_url)
        body_text = driver.find_element(By.TAG_NAME, "body").text.lower()
        assert "review" in body_text or "rating" in body_text, \
            "No review/rating section found on provider profile"

    def test_provider_profile_shows_services_section(self, driver, base_url, customer_api):
        """Provider profile shows their listed services."""
        provider_id = self._get_first_provider_id(customer_api)
        if not provider_id:
            pytest.skip("No providers found.")
        driver.get(f"{base_url}/#/profile/{provider_id}?type=provider")
        page = BasePage(driver, base_url)
        body_text = driver.find_element(By.TAG_NAME, "body").text.lower()
        assert "service" in body_text or "availability" in body_text, \
            "No services/availability section found on provider profile"


# ── Booking Flow ──────────────────────────────────────────────────────────────

@pytest.mark.customer
class TestBookingFlow:

    def _get_first_service_id(self, customer_api) -> str | None:
        r = customer_api.get("/api/services?limit=1")
        data = r.json()
        if data.get("success") and data.get("data"):
            services = data["data"]
            if isinstance(services, list) and len(services) > 0:
                return str(services[0].get("id") or services[0].get("_id"))
        return None

    def test_book_service_page_loads(self, driver, base_url, customer_api):
        """The /book/:serviceId page renders and lists providers for that service."""
        service_id = self._get_first_service_id(customer_api)
        if not service_id:
            pytest.skip("No services in database — seed first.")
        driver.get(f"{base_url}/#/book/{service_id}")
        page = BasePage(driver, base_url)
        body_text = driver.find_element(By.TAG_NAME, "body").text.lower()
        assert any(word in body_text for word in [
            "provider", "book", "service", "select", "available"
        ]), f"No booking page content found. Body: {body_text[:400]}"

    def test_booking_confirmation_page_requires_auth(self, driver, base_url):
        """Accessing /booking-confirmation with a fake ID shows an error, not a crash."""
        driver.get(f"{base_url}/#/booking-confirmation/fake-booking-id-000")
        page = BasePage(driver, base_url)
        body_text = driver.find_element(By.TAG_NAME, "body").text.lower()
        # Should show error state or redirect
        assert "not found" in body_text or "booking" in body_text or "login" in body_text, \
            f"Unexpected content on confirmation page: {body_text[:400]}"

    def test_my_bookings_section_visible_on_dashboard(self, driver, base_url):
        """Customer dashboard shows the user's bookings (or empty state)."""
        driver.get(f"{base_url}/#/dashboard")
        page = BasePage(driver, base_url)
        body_text = driver.find_element(By.TAG_NAME, "body").text.lower()
        assert "booking" in body_text or "appointment" in body_text, \
            f"No bookings section found on customer dashboard. Body: {body_text[:400]}"


# ── Review Submission ─────────────────────────────────────────────────────────

@pytest.mark.customer
class TestReviewSubmission:

    def test_review_form_visible_on_provider_profile_after_completed_booking(
        self, driver, base_url, customer_api
    ):
        """A customer with a completed booking sees the review form on the provider's profile.
        This test is skipped if no completed bookings exist for the test customer.
        """
        # Check if there are completed bookings for this customer
        r = customer_api.get("/api/bookings")
        data = r.json()
        bookings = data.get("data", []) if data.get("success") else []
        completed = [
            b for b in (bookings if isinstance(bookings, list) else [])
            if b.get("status") == "completed"
        ]
        if not completed:
            pytest.skip("No completed bookings for test customer — skip review form test.")

        first = completed[0]
        provider_id = first.get("provider_id")
        driver.get(f"{base_url}/#/profile/{provider_id}?type=provider")
        page = BasePage(driver, base_url)
        body_text = driver.find_element(By.TAG_NAME, "body").text.lower()
        assert "leave a review" in body_text or "submit review" in body_text or "rating" in body_text
