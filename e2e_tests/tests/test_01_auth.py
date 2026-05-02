"""
test_01_auth.py — Authentication & session tests.

Covers:
  - Customer and provider login (success)
  - Invalid credentials (error message)
  - Empty field validation
  - Wrong role for an existing account
  - Protected route redirect when unauthenticated
  - Logout clears session and redirects to home/login
  - Register: customer happy path
  - Register: validation (missing fields, weak password)
"""

import time
import pytest
from selenium.webdriver.common.by import By
from selenium.webdriver.support.ui import WebDriverWait
from selenium.webdriver.support import expected_conditions as EC

from pages.login_page import LoginPage
from pages.register_page import RegisterPage
from pages.navbar import NavBar


# ── Helpers ────────────────────────────────────────────────────────────────────

def _wait_hash(driver, partial: str, timeout: int = 12):
    WebDriverWait(driver, timeout).until(lambda d: partial in d.current_url)


# ── Login tests ────────────────────────────────────────────────────────────────

@pytest.mark.auth
@pytest.mark.smoke
class TestLogin:

    def test_login_page_renders(self, driver, base_url):
        """Login page loads the role selector, email and password fields."""
        page = LoginPage(driver, base_url).open()
        assert page.element_exists(By.CSS_SELECTOR, "input[type='email']")
        assert page.element_exists(By.CSS_SELECTOR, "input[type='password']")
        assert page.element_exists(By.CSS_SELECTOR, "button[type='submit']")
        assert page.is_text_present("Welcome back")

    def test_login_customer_success(self, driver, base_url, customer_creds):
        """Customer logs in and lands on /dashboard."""
        page = LoginPage(driver, base_url)
        page.login_and_wait_dashboard(
            customer_creds["email"],
            customer_creds["password"],
            role="customer",
        )
        assert "/dashboard" in driver.current_url

    def test_login_provider_success(self, driver, base_url, provider_creds):
        """Provider logs in and lands on /dashboard."""
        page = LoginPage(driver, base_url)
        page.open()  # clear any existing session first
        page.login_and_wait_dashboard(
            provider_creds["email"],
            provider_creds["password"],
            role="provider",
        )
        assert "/dashboard" in driver.current_url

    def test_login_invalid_credentials(self, driver, base_url):
        """Wrong password shows an error notification."""
        page = LoginPage(driver, base_url).open()
        page.select_customer()
        page.enter_email("nobody@nowhere.invalid")
        page.enter_password("WrongPassword1!")
        page.submit()
        error = page.get_error()
        assert error is not None, "Expected an error notification for invalid credentials"
        assert "/dashboard" not in driver.current_url

    def test_login_empty_email(self, driver, base_url):
        """Submitting without email shows a validation error or browser native validation."""
        page = LoginPage(driver, base_url).open()
        page.enter_password("SomePassword1!")
        page.submit()
        # Either a [role=alert] or browser native 'required' validation stops submission
        assert "/dashboard" not in driver.current_url

    def test_login_empty_password(self, driver, base_url):
        """Submitting without password stays on login page."""
        page = LoginPage(driver, base_url).open()
        page.enter_email("test@example.com")
        page.submit()
        assert "/dashboard" not in driver.current_url

    def test_login_wrong_role(self, driver, base_url, customer_creds):
        """Logging in with the wrong role (customer account → Provider tab) shows an error."""
        page = LoginPage(driver, base_url).open()
        page.select_provider()  # account is actually a customer
        page.enter_email(customer_creds["email"])
        page.enter_password(customer_creds["password"])
        page.submit()
        error = page.get_error()
        assert error is not None, "Expected role-mismatch error"
        assert "registered as" in error.lower() or "invalid role" in error.lower()

    def test_sign_up_link_navigates_to_register(self, driver, base_url):
        """'Sign up' link on the login page takes the user to /register."""
        page = LoginPage(driver, base_url).open()
        page.click_sign_up_link()
        _wait_hash(driver, "/register")
        assert "/register" in driver.current_url


# ── Protected route redirect tests ────────────────────────────────────────────

@pytest.mark.auth
class TestProtectedRoutes:

    def _clear_session(self, driver, base_url):
        """Navigate to login page (which effectively resets hash) without an active session."""
        driver.get(f"{base_url}/#/login")
        time.sleep(1)

    def test_dashboard_redirects_guest_to_login(self, driver, base_url):
        """Unauthenticated visit to /dashboard redirects to /login."""
        # Sign out any existing session by navigating to login and checking hash
        driver.get(f"{base_url}/#/login")
        # Force open /dashboard without being authenticated
        driver.execute_script("window.location.hash = '#/dashboard'")
        time.sleep(2)
        assert "/login" in driver.current_url or "/dashboard" not in driver.current_url

    def test_my_bookings_redirects_guest_to_login(self, driver, base_url):
        """Unauthenticated visit to /my-bookings redirects to /login."""
        driver.get(f"{base_url}/#/login")
        driver.execute_script("window.location.hash = '#/my-bookings'")
        time.sleep(2)
        assert "/login" in driver.current_url or "/my-bookings" not in driver.current_url

    def test_booking_confirmation_redirects_guest_to_login(self, driver, base_url):
        """Unauthenticated visit to /booking-confirmation/* redirects to /login."""
        driver.get(f"{base_url}/#/login")
        driver.execute_script("window.location.hash = '#/booking-confirmation/fake-id'")
        time.sleep(2)
        assert "/login" in driver.current_url or "booking-confirmation" not in driver.current_url


# ── Logout tests ───────────────────────────────────────────────────────────────

@pytest.mark.auth
class TestLogout:

    def test_logout_redirects_to_home(self, driver, base_url, customer_creds):
        """After login, clicking the logout button returns the user to home."""
        page = LoginPage(driver, base_url)
        page.login_and_wait_dashboard(customer_creds["email"], customer_creds["password"])

        # Click the red logout icon button in the NavBar
        wait = WebDriverWait(driver, 10)
        logout_btn = wait.until(EC.element_to_be_clickable(
            (By.XPATH, "//button[contains(@class,'text-red') or .//svg[contains(@class,'log-out')]]")
        ))
        logout_btn.click()

        # Should land on home or login
        WebDriverWait(driver, 10).until(
            lambda d: "#/dashboard" not in d.current_url
        )
        assert "#/dashboard" not in driver.current_url

    def test_dashboard_inaccessible_after_logout(self, driver, base_url, customer_creds):
        """After logout, navigating directly to /dashboard redirects to /login."""
        # Ensure logged out state (after previous test)
        driver.get(f"{base_url}/#/login")
        time.sleep(1)
        driver.execute_script("window.location.hash = '#/dashboard'")
        time.sleep(2)
        assert "/dashboard" not in driver.current_url or "/login" in driver.current_url


# ── Registration tests ─────────────────────────────────────────────────────────

@pytest.mark.auth
class TestRegister:

    def test_register_page_renders(self, driver, base_url):
        """Register page loads with name, email, phone, and password fields."""
        page = RegisterPage(driver, base_url).open()
        assert page.element_exists(By.CSS_SELECTOR, "input[placeholder='John Doe']")
        assert page.element_exists(By.CSS_SELECTOR, "input[type='email']")
        assert page.element_exists(By.CSS_SELECTOR, "input[type='password']")

    def test_register_customer_happy_path(self, fresh_driver, base_url):
        """New customer account can be created with valid data."""
        ts = str(int(time.time()))
        email = f"e2e_reg_{ts}@mailtest.dev"
        page = RegisterPage(fresh_driver, base_url)
        page.open()
        page.select_customer()
        page.enter_name("E2E Tester")
        page.enter_email(email)
        page.enter_phone("(555) 123-4567")
        page.enter_password("E2eTest@9876!")
        page.click_submit()

        # Successful registration either auto-logs in (→ /dashboard)
        # or shows email confirmation message
        WebDriverWait(fresh_driver, 15).until(
            lambda d: "/dashboard" in d.current_url
            or "confirm" in d.find_element(By.TAG_NAME, "body").text.lower()
            or "verification" in d.find_element(By.TAG_NAME, "body").text.lower()
        )
        result = fresh_driver.find_element(By.TAG_NAME, "body").text.lower()
        assert "/dashboard" in fresh_driver.current_url or "confirm" in result or "check" in result

    def test_register_missing_name_shows_error(self, driver, base_url):
        """Submitting without a full name shows a validation error."""
        page = RegisterPage(driver, base_url).open()
        page.select_customer()
        # Leave name empty
        page.enter_email("noname@example.com")
        page.enter_phone("(555) 000-0000")
        page.enter_password("E2eTest@9876!")
        page.click_submit()
        error = page.get_error()
        assert error is not None, "Expected validation error for missing name"
        assert "name" in error.lower()

    def test_register_weak_password_shows_error(self, driver, base_url):
        """A password without uppercase/digit/special char shows a validation error."""
        page = RegisterPage(driver, base_url).open()
        page.select_customer()
        page.enter_name("Weak Pass")
        page.enter_email("weakpass@example.com")
        page.enter_phone("(555) 000-0000")
        page.enter_password("weakpassword")  # no uppercase, no digit, no special
        page.click_submit()
        error = page.get_error()
        assert error is not None, "Expected password-strength validation error"
        assert "password" in error.lower()

    def test_register_invalid_email_format(self, driver, base_url):
        """An invalid email format prevents form submission."""
        page = RegisterPage(driver, base_url).open()
        page.select_customer()
        page.enter_name("Bad Email")
        page.enter_email("not-an-email")
        page.enter_phone("(555) 000-0000")
        page.enter_password("E2eTest@9876!")
        page.click_submit()
        # Browser native validation or app error
        error = page.get_error()
        assert "/dashboard" not in driver.current_url or error is not None

    def test_register_login_link_navigates_to_login(self, driver, base_url):
        """'Log in' link on the register page takes the user to /login."""
        page = RegisterPage(driver, base_url).open()
        page.click_login_link()
        WebDriverWait(driver, 10).until(lambda d: "/login" in d.current_url)
        assert "/login" in driver.current_url
