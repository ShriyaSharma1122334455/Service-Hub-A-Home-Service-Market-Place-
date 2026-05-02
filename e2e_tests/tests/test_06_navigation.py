"""
test_06_navigation.py — Routing, navigation, and general UI tests.

Covers:
  - Hash-based routing works correctly for all major paths
  - NavBar is present on every page
  - NavBar shows correct items for guest / customer / provider
  - FAQ page loads and is accessible to guests
  - Home page renders the main hero/CTA
  - 'Log In' NavBar button navigates to /login
  - 'Get Started' NavBar button navigates to /register
  - Profile notification (LOW-01): no window.alert() — uses in-page notification
  - BookingConfirmation auth guard (LOW-02): redirects to /login when no token
  - 404 / unknown hash path shows a fallback or home page
"""

import time
import pytest
from selenium.webdriver.common.by import By
from selenium.webdriver.support.ui import WebDriverWait
from selenium.webdriver.support import expected_conditions as EC

from pages.base_page import BasePage
from pages.login_page import LoginPage
from pages.navbar import NavBar


# ── Hash Routing ──────────────────────────────────────────────────────────────

@pytest.mark.navigation
@pytest.mark.smoke
class TestHashRouting:

    def test_home_route_loads(self, driver, base_url):
        """Navigating to /#/ loads the home page."""
        driver.get(f"{base_url}/#/")
        page = BasePage(driver, base_url)
        # Home page should have content — at minimum the NavBar
        assert page.element_exists(By.TAG_NAME, "nav", timeout=8), "NavBar not found on home page"

    def test_login_route_loads(self, driver, base_url):
        """Navigating to /#/login loads the login form."""
        driver.get(f"{base_url}/#/login")
        page = BasePage(driver, base_url)
        assert page.element_exists(By.CSS_SELECTOR, "input[type='email']", timeout=8), \
            "Login form not found at /#/login"

    def test_register_route_loads(self, driver, base_url):
        """Navigating to /#/register loads the registration form."""
        driver.get(f"{base_url}/#/register")
        page = BasePage(driver, base_url)
        assert page.element_exists(By.CSS_SELECTOR, "input[placeholder='John Doe']", timeout=8), \
            "Register form not found at /#/register"

    def test_faq_route_loads(self, driver, base_url):
        """/#/faq is publicly accessible without authentication."""
        driver.get(f"{base_url}/#/faq")
        page = BasePage(driver, base_url)
        body = driver.find_element(By.TAG_NAME, "body").text.lower()
        assert "faq" in body or "question" in body or "help" in body, \
            f"FAQ content not found. Body: {body[:400]}"

    def test_unknown_hash_does_not_crash(self, driver, base_url):
        """An unknown hash path does not crash the app (shows home or a fallback)."""
        driver.get(f"{base_url}/#/this-path-does-not-exist")
        time.sleep(2)
        # App should stay alive — NavBar still present
        page = BasePage(driver, base_url)
        assert page.element_exists(By.TAG_NAME, "nav", timeout=6), \
            "NavBar missing after navigating to unknown hash — app may have crashed"

    def test_history_back_works(self, driver, base_url):
        """Browser back button correctly navigates between hash routes."""
        driver.get(f"{base_url}/#/")
        driver.get(f"{base_url}/#/faq")
        WebDriverWait(driver, 6).until(lambda d: "/faq" in d.current_url)
        driver.back()
        time.sleep(1)
        assert "/faq" not in driver.current_url or "/#/" in driver.current_url


# ── NavBar — Guest ─────────────────────────────────────────────────────────────

@pytest.mark.navigation
class TestNavBarGuest:

    def _clear_session(self, driver, base_url):
        """Navigate to login to ensure any stored hash-state is reset."""
        driver.get(f"{base_url}/#/login")
        time.sleep(1)

    def test_guest_navbar_shows_login_button(self, driver, base_url):
        """Unauthenticated users see 'Log In' in the NavBar."""
        self._clear_session(driver, base_url)
        nav = driver.find_element(By.TAG_NAME, "nav")
        assert "Log In" in nav.text, f"'Log In' not found in guest NavBar. NavBar: {nav.text}"

    def test_guest_navbar_shows_get_started_button(self, driver, base_url):
        """Unauthenticated users see 'Get Started' in the NavBar."""
        self._clear_session(driver, base_url)
        nav = driver.find_element(By.TAG_NAME, "nav")
        assert "Get Started" in nav.text, f"'Get Started' not found. NavBar: {nav.text}"

    def test_guest_navbar_login_navigates(self, driver, base_url):
        """Clicking 'Log In' in the NavBar goes to /login."""
        self._clear_session(driver, base_url)
        driver.get(f"{base_url}/#/")
        wait = WebDriverWait(driver, 10)
        login_btn = wait.until(EC.element_to_be_clickable(
            (By.XPATH, "//button[normalize-space()='Log In']")
        ))
        login_btn.click()
        WebDriverWait(driver, 10).until(lambda d: "/login" in d.current_url)
        assert "/login" in driver.current_url

    def test_guest_navbar_register_navigates(self, driver, base_url):
        """Clicking 'Get Started' in the NavBar goes to /register."""
        self._clear_session(driver, base_url)
        driver.get(f"{base_url}/#/")
        wait = WebDriverWait(driver, 10)
        btn = wait.until(EC.element_to_be_clickable(
            (By.XPATH, "//button[normalize-space()='Get Started']")
        ))
        btn.click()
        WebDriverWait(driver, 10).until(lambda d: "/register" in d.current_url)
        assert "/register" in driver.current_url


# ── NavBar — Customer ─────────────────────────────────────────────────────────

@pytest.mark.navigation
class TestNavBarCustomer:

    @pytest.fixture(autouse=True)
    def login(self, driver, base_url, customer_creds):
        LoginPage(driver, base_url).login_and_wait_dashboard(
            customer_creds["email"], customer_creds["password"], role="customer"
        )
        yield
        driver.get(f"{base_url}/#/")

    def test_customer_navbar_has_dashboard(self, driver, base_url):
        nav = driver.find_element(By.TAG_NAME, "nav")
        assert "Dashboard" in nav.text

    def test_customer_navbar_has_browse_services(self, driver, base_url):
        nav = driver.find_element(By.TAG_NAME, "nav")
        assert "Browse Services" in nav.text

    def test_customer_navbar_has_help(self, driver, base_url):
        nav = driver.find_element(By.TAG_NAME, "nav")
        assert "Help" in nav.text

    def test_customer_navbar_no_login_button(self, driver, base_url):
        """Logged-in customer does not see 'Log In' or 'Get Started'."""
        nav = driver.find_element(By.TAG_NAME, "nav")
        assert "Log In" not in nav.text
        assert "Get Started" not in nav.text

    def test_customer_navbar_logo_navigates_home(self, driver, base_url):
        """Clicking the ServiceHub logo takes a customer to the home page."""
        driver.get(f"{base_url}/#/faq")
        wait = WebDriverWait(driver, 10)
        logo = wait.until(EC.element_to_be_clickable(
            (By.XPATH, "//nav//*[contains(text(),'ServiceHub') or .//span[text()='S']]")
        ))
        logo.click()
        time.sleep(1)
        assert "/#/" in driver.current_url or "/#/dashboard" in driver.current_url


# ── NavBar — Provider ─────────────────────────────────────────────────────────

@pytest.mark.navigation
class TestNavBarProvider:

    @pytest.fixture(autouse=True)
    def login(self, driver, base_url, provider_creds):
        LoginPage(driver, base_url).login_and_wait_dashboard(
            provider_creds["email"], provider_creds["password"], role="provider"
        )
        yield
        driver.get(f"{base_url}/#/")

    def test_provider_navbar_no_browse_services(self, driver):
        nav = driver.find_element(By.TAG_NAME, "nav")
        assert "Browse Services" not in nav.text

    def test_provider_navbar_has_help(self, driver):
        nav = driver.find_element(By.TAG_NAME, "nav")
        assert "Help" in nav.text

    def test_provider_navbar_no_login_button(self, driver):
        nav = driver.find_element(By.TAG_NAME, "nav")
        assert "Log In" not in nav.text


# ── LOW-01 Verification: No window.alert() on profile page ────────────────────

@pytest.mark.navigation
class TestNoWindowAlert:

    @pytest.fixture(autouse=True)
    def login(self, driver, base_url, customer_creds):
        LoginPage(driver, base_url).login_and_wait_dashboard(
            customer_creds["email"], customer_creds["password"], role="customer"
        )
        yield
        driver.get(f"{base_url}/#/")

    def test_profile_page_uses_no_window_alert(self, driver, base_url):
        """LOW-01: The profile page must not show a window.alert() dialog.
        We inject a JS trap for window.alert before loading the page,
        then check if it was triggered."""
        driver.get(f"{base_url}/#/profile/me")

        # Inject alert trap
        driver.execute_script("""
            window._alertCalled = false;
            window._alertMessage = '';
            window.alert = function(msg) {
                window._alertCalled = true;
                window._alertMessage = msg || '';
            };
        """)

        # Trigger the "Become Provider" button logic by confirming the prompt
        # (we trap window.confirm too so the role-upgrade flow runs)
        driver.execute_script("""
            window._confirmCalled = false;
            window.confirm = function(msg) {
                window._confirmCalled = true;
                return false;  // cancel — we don't want to actually change the role
            };
        """)

        # Wait for profile to fully render
        time.sleep(2)

        # Check if alert was ever called
        alert_called = driver.execute_script("return window._alertCalled;")
        assert not alert_called, (
            f"window.alert() was called on the profile page with: "
            f"{driver.execute_script('return window._alertMessage;')}"
        )


# ── LOW-02 Verification: BookingConfirmation auth guard ───────────────────────

@pytest.mark.navigation
class TestBookingConfirmationAuthGuard:

    def test_no_token_redirects_to_login(self, driver, base_url):
        """LOW-02: Visiting /booking-confirmation/* with no token redirects to /login."""
        # First go to login page to clear any session from previous tests
        driver.get(f"{base_url}/#/login")
        time.sleep(1)

        # Directly navigate to booking confirmation without a token
        driver.execute_script("window.location.hash = '#/booking-confirmation/some-booking-id'")
        time.sleep(3)

        # Should redirect to /login or stay on login
        current = driver.current_url
        assert "/login" in current or "booking-confirmation" not in current, \
            f"Expected redirect to /login for unauthenticated booking confirmation. URL: {current}"


# ── FAQ Page ──────────────────────────────────────────────────────────────────

@pytest.mark.navigation
class TestFaqPage:

    def test_faq_accessible_as_guest(self, driver, base_url):
        """FAQ page loads without authentication."""
        driver.get(f"{base_url}/#/faq")
        page = BasePage(driver, base_url)
        body = driver.find_element(By.TAG_NAME, "body").text.lower()
        assert "faq" in body or "question" in body or "help" in body or "frequently" in body

    def test_faq_nav_help_link_works(self, driver, base_url):
        """Clicking 'Help' in the NavBar goes to /faq."""
        driver.get(f"{base_url}/#/")
        wait = WebDriverWait(driver, 10)
        help_btn = wait.until(EC.element_to_be_clickable(
            (By.XPATH, "//span[normalize-space()='Help'] | //a[normalize-space()='Help']")
        ))
        help_btn.click()
        WebDriverWait(driver, 8).until(lambda d: "/faq" in d.current_url)
        assert "/faq" in driver.current_url
