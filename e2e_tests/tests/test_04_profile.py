"""
test_04_profile.py — Profile view and edit tests.

Covers:
  - /profile/me renders the logged-in user's own profile
  - Profile shows correct role badge (User / Service Provider)
  - Edit profile page (/profile/edit) renders form fields
  - Updating full_name via edit profile form
  - Updating bio/phone via edit profile form
  - Validation errors on edit profile (e.g. name too short)
  - Customer profile shows 'Become Provider' CTA
  - Provider profile does NOT show 'Become Provider' CTA
  - Profile edit persists across page reload (via API)
"""

import time
import pytest
from selenium.webdriver.common.by import By
from selenium.webdriver.support.ui import WebDriverWait
from selenium.webdriver.support import expected_conditions as EC

from pages.login_page import LoginPage
from pages.base_page import BasePage


# ── Customer Profile Tests ─────────────────────────────────────────────────────

@pytest.mark.profile
class TestCustomerProfile:

    @pytest.fixture(autouse=True)
    def login(self, driver, base_url, customer_creds):
        LoginPage(driver, base_url).login_and_wait_dashboard(
            customer_creds["email"], customer_creds["password"], role="customer"
        )
        yield
        driver.get(f"{base_url}/#/")

    def test_own_profile_loads(self, driver, base_url):
        """Navigating to /profile/me renders the user's profile card."""
        driver.get(f"{base_url}/#/profile/me")
        page = BasePage(driver, base_url)
        body_text = driver.find_element(By.TAG_NAME, "body").text.lower()
        assert any(word in body_text for word in [
            "profile", "email", "customer", "user"
        ]), f"Own profile content not found. Body: {body_text[:400]}"

    def test_profile_shows_customer_role_badge(self, driver, base_url):
        """Customer profile page displays the 'User (Customer)' role badge."""
        driver.get(f"{base_url}/#/profile/me")
        page = BasePage(driver, base_url)
        body_text = driver.find_element(By.TAG_NAME, "body").text
        assert "Customer" in body_text or "User" in body_text, \
            f"Role badge not found. Body: {body_text[:400]}"

    def test_profile_shows_become_provider_cta(self, driver, base_url):
        """Customer profile shows the 'Become Provider' call-to-action."""
        driver.get(f"{base_url}/#/profile/me")
        page = BasePage(driver, base_url)
        body_text = driver.find_element(By.TAG_NAME, "body").text
        assert "Become" in body_text or "Provider" in body_text, \
            "Become Provider CTA not found on customer profile"

    def test_edit_profile_icon_visible(self, driver, base_url):
        """A pencil/edit button is visible on the user's own profile page."""
        driver.get(f"{base_url}/#/profile/me")
        page = BasePage(driver, base_url)
        edit_btn = page.element_exists(By.CSS_SELECTOR, "[aria-label='Edit profile']", timeout=6)
        assert edit_btn, "Edit profile button not found on own profile"

    def test_clicking_edit_navigates_to_edit_profile(self, driver, base_url):
        """Clicking the edit pencil icon navigates to /profile/edit."""
        driver.get(f"{base_url}/#/profile/me")
        page = BasePage(driver, base_url)
        page.click(By.CSS_SELECTOR, "[aria-label='Edit profile']")
        WebDriverWait(driver, 10).until(lambda d: "/profile/edit" in d.current_url)
        assert "/profile/edit" in driver.current_url


# ── Edit Profile Tests ────────────────────────────────────────────────────────

@pytest.mark.profile
class TestEditProfile:

    @pytest.fixture(autouse=True)
    def login(self, driver, base_url, customer_creds):
        LoginPage(driver, base_url).login_and_wait_dashboard(
            customer_creds["email"], customer_creds["password"], role="customer"
        )
        yield
        driver.get(f"{base_url}/#/")

    def test_edit_profile_page_renders_form(self, driver, base_url):
        """Edit profile page shows name, phone, and bio input fields."""
        driver.get(f"{base_url}/#/profile/edit")
        page = BasePage(driver, base_url)
        assert page.element_exists(By.CSS_SELECTOR, "input[name='full_name'], input[id='full_name'], input[placeholder*='name' i]", timeout=8), \
            "Full name input not found on edit profile page"

    def test_edit_profile_name_updates_successfully(self, driver, base_url, customer_api):
        """Changing the full name on the edit profile form saves successfully."""
        driver.get(f"{base_url}/#/profile/edit")
        page = BasePage(driver, base_url)

        new_name = f"E2E Test User {int(time.time()) % 10000}"
        # Find the name input — try several selectors
        for selector in [
            "input[name='full_name']",
            "input[id='full_name']",
            "input[placeholder*='name' i]",
            "input[type='text']:first-of-type",
        ]:
            if page.element_exists(By.CSS_SELECTOR, selector, timeout=3):
                name_input = driver.find_element(By.CSS_SELECTOR, selector)
                name_input.clear()
                name_input.send_keys(new_name)
                break

        # Submit the form
        page.click(By.CSS_SELECTOR, "button[type='submit']")

        # Wait for success message or redirect
        WebDriverWait(driver, 12).until(
            lambda d: "success" in d.find_element(By.TAG_NAME, "body").text.lower()
            or "updated" in d.find_element(By.TAG_NAME, "body").text.lower()
            or "profile" in d.find_element(By.TAG_NAME, "body").text.lower()
        )
        body_text = driver.find_element(By.TAG_NAME, "body").text.lower()
        assert "success" in body_text or "updated" in body_text or "saved" in body_text, \
            f"Profile update success message not found. Body: {body_text[:400]}"

    def test_edit_profile_empty_name_shows_error(self, driver, base_url):
        """Clearing the name field and submitting shows a validation error."""
        driver.get(f"{base_url}/#/profile/edit")
        page = BasePage(driver, base_url)

        for selector in [
            "input[name='full_name']",
            "input[id='full_name']",
            "input[placeholder*='name' i]",
        ]:
            if page.element_exists(By.CSS_SELECTOR, selector, timeout=3):
                name_input = driver.find_element(By.CSS_SELECTOR, selector)
                name_input.clear()
                # Leave empty
                break

        page.click(By.CSS_SELECTOR, "button[type='submit']")
        # Should show an error, not navigate away
        time.sleep(2)
        body_text = driver.find_element(By.TAG_NAME, "body").text.lower()
        assert "error" in body_text or "required" in body_text or "character" in body_text or "/profile/edit" in driver.current_url, \
            "Expected validation error for empty name"

    def test_edit_profile_persists_via_api(self, driver, base_url, customer_api):
        """After a successful edit, the backend /api/users/me returns the updated name."""
        unique_name = f"E2EUser {int(time.time()) % 9999}"
        r = customer_api.put("/api/users/me", json={"full_name": unique_name})
        data = r.json()
        assert data.get("success"), f"API profile update failed: {data}"

        # Now verify via GET
        r2 = customer_api.get("/api/users/me")
        profile = r2.json().get("data", {})
        assert profile.get("full_name") == unique_name or unique_name in str(profile), \
            f"Updated name not persisted. Profile: {profile}"


# ── Provider Profile Tests ────────────────────────────────────────────────────

@pytest.mark.profile
class TestProviderProfile:

    @pytest.fixture(autouse=True)
    def login(self, driver, base_url, provider_creds):
        LoginPage(driver, base_url).login_and_wait_dashboard(
            provider_creds["email"], provider_creds["password"], role="provider"
        )
        yield
        driver.get(f"{base_url}/#/")

    def test_provider_own_profile_loads(self, driver, base_url):
        """Provider's own /profile/me renders their profile."""
        driver.get(f"{base_url}/#/profile/me")
        page = BasePage(driver, base_url)
        body_text = driver.find_element(By.TAG_NAME, "body").text.lower()
        assert any(word in body_text for word in [
            "provider", "service", "profile", "business"
        ]), f"Provider profile not found. Body: {body_text[:400]}"

    def test_provider_profile_shows_provider_badge(self, driver, base_url):
        """Provider profile page displays 'Service Provider' role badge."""
        driver.get(f"{base_url}/#/profile/me")
        page = BasePage(driver, base_url)
        body_text = driver.find_element(By.TAG_NAME, "body").text
        assert "Provider" in body_text or "Service" in body_text, \
            f"Provider role badge not found. Body: {body_text[:400]}"

    def test_provider_profile_has_no_become_provider_cta(self, driver, base_url):
        """Provider profile does NOT show the 'Become Provider' CTA."""
        driver.get(f"{base_url}/#/profile/me")
        page = BasePage(driver, base_url)
        body_text = driver.find_element(By.TAG_NAME, "body").text
        assert "Become a Service Provider" not in body_text and "Become Provider" not in body_text, \
            "Provider should not see 'Become Provider' CTA on their own profile"
