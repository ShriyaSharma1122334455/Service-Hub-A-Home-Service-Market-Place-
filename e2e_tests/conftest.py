"""
Global fixtures shared across all test modules.

Setup before running:
    1. pip install -r requirements.txt
    2. cp .env.test.example .env.test  &&  fill in credentials
    3. Ensure frontend (port 5173) and backend (port 3000) are running
    4. pytest
"""

import os
import time
import pytest
import requests
from dotenv import load_dotenv
from selenium import webdriver
from selenium.webdriver.chrome.options import Options
from selenium.webdriver.chrome.service import Service as ChromeService
from selenium.webdriver.support.ui import WebDriverWait
from selenium.webdriver.support import expected_conditions as EC
from selenium.webdriver.common.by import By

# Load .env.test from the same directory as this file
load_dotenv(os.path.join(os.path.dirname(__file__), ".env.test"))

# ── Configuration ──────────────────────────────────────────────────────────────

FRONTEND_URL = os.getenv("FRONTEND_URL", "http://localhost:5173")
BACKEND_URL  = os.getenv("BACKEND_URL",  "http://localhost:3000")

CUSTOMER_EMAIL    = os.getenv("TEST_CUSTOMER_EMAIL",    "test_customer@example.com")
CUSTOMER_PASSWORD = os.getenv("TEST_CUSTOMER_PASSWORD", "Test@1234!")
PROVIDER_EMAIL    = os.getenv("TEST_PROVIDER_EMAIL",    "test_provider@example.com")
PROVIDER_PASSWORD = os.getenv("TEST_PROVIDER_PASSWORD", "Test@1234!")

HEADLESS      = os.getenv("SELENIUM_HEADLESS", "true").lower() != "false"
WINDOW_WIDTH  = int(os.getenv("SELENIUM_WINDOW_WIDTH",  "1440"))
WINDOW_HEIGHT = int(os.getenv("SELENIUM_WINDOW_HEIGHT", "900"))

DEFAULT_WAIT = 12  # seconds


# ── Driver factory ─────────────────────────────────────────────────────────────

def _build_driver() -> webdriver.Chrome:
    options = Options()
    if HEADLESS:
        options.add_argument("--headless=new")
    options.add_argument("--no-sandbox")
    options.add_argument("--disable-dev-shm-usage")
    options.add_argument("--disable-gpu")
    options.add_argument(f"--window-size={WINDOW_WIDTH},{WINDOW_HEIGHT}")
    options.add_argument("--disable-extensions")
    # Suppress DevTools / console noise
    options.add_experimental_option("excludeSwitches", ["enable-logging"])
    options.add_experimental_option("prefs", {"profile.default_content_setting_values.notifications": 2})
    driver = webdriver.Chrome(options=options)
    driver.implicitly_wait(DEFAULT_WAIT)
    return driver


# ── Session-scoped driver (shared across tests for speed) ─────────────────────

@pytest.fixture(scope="session")
def driver():
    """Single Chrome session reused by all tests. Logs out between suites via the
    logout helper or by navigating to /login."""
    d = _build_driver()
    yield d
    d.quit()


@pytest.fixture()
def fresh_driver():
    """Per-test isolated driver. Use for tests that need a completely clean state
    (e.g. testing registration with a new email)."""
    d = _build_driver()
    yield d
    d.quit()


# ── Convenience fixtures ───────────────────────────────────────────────────────

@pytest.fixture(scope="session")
def base_url():
    return FRONTEND_URL


@pytest.fixture(scope="session")
def api_url():
    return BACKEND_URL


@pytest.fixture(scope="session")
def customer_creds():
    return {"email": CUSTOMER_EMAIL, "password": CUSTOMER_PASSWORD}


@pytest.fixture(scope="session")
def provider_creds():
    return {"email": PROVIDER_EMAIL, "password": PROVIDER_PASSWORD}


# ── Direct API helper ──────────────────────────────────────────────────────────

class ApiClient:
    """Thin wrapper around requests for direct backend calls."""

    def __init__(self, base: str):
        self.base = base.rstrip("/")
        self.token: str | None = None
        self.session = requests.Session()

    def _headers(self, extra: dict | None = None) -> dict:
        h = {"Content-Type": "application/json"}
        if self.token:
            h["Authorization"] = f"Bearer {self.token}"
        if extra:
            h.update(extra)
        return h

    def login(self, email: str, password: str) -> dict:
        r = self.session.post(
            f"{self.base}/api/auth/login",
            json={"email": email, "password": password},
        )
        data = r.json()
        if data.get("success"):
            self.token = data["data"]["token"]
        return data

    def logout(self):
        self.token = None

    def get(self, path: str, **kw) -> requests.Response:
        return self.session.get(f"{self.base}{path}", headers=self._headers(), **kw)

    def post(self, path: str, **kw) -> requests.Response:
        return self.session.post(f"{self.base}{path}", headers=self._headers(), **kw)

    def put(self, path: str, **kw) -> requests.Response:
        return self.session.put(f"{self.base}{path}", headers=self._headers(), **kw)

    def delete(self, path: str, **kw) -> requests.Response:
        return self.session.delete(f"{self.base}{path}", headers=self._headers(), **kw)


@pytest.fixture(scope="session")
def api(api_url):
    return ApiClient(api_url)


@pytest.fixture(scope="session")
def customer_api(api_url):
    client = ApiClient(api_url)
    result = client.login(CUSTOMER_EMAIL, CUSTOMER_PASSWORD)
    assert result.get("success"), (
        f"Could not log in test customer ({CUSTOMER_EMAIL}). "
        "Make sure the account exists and the password is correct."
    )
    return client


@pytest.fixture(scope="session")
def provider_api(api_url):
    client = ApiClient(api_url)
    result = client.login(PROVIDER_EMAIL, PROVIDER_PASSWORD)
    assert result.get("success"), (
        f"Could not log in test provider ({PROVIDER_EMAIL}). "
        "Make sure the account exists and the password is correct."
    )
    return client


# ── UI login helper ────────────────────────────────────────────────────────────

def ui_login(driver, base_url: str, email: str, password: str, role: str = "customer"):
    """Navigate to the login page and perform a full UI login.
    role: 'customer' | 'provider'
    Returns when the dashboard URL is active.
    """
    wait = WebDriverWait(driver, DEFAULT_WAIT)
    driver.get(f"{base_url}/#/login")

    # Select role tab
    role_btn_text = "User" if role == "customer" else "Provider"
    role_btn = wait.until(EC.element_to_be_clickable(
        (By.XPATH, f"//button[@type='button' and normalize-space()='{role_btn_text}']")
    ))
    role_btn.click()

    # Fill credentials
    email_input = wait.until(EC.presence_of_element_located((By.CSS_SELECTOR, "input[type='email']")))
    email_input.clear()
    email_input.send_keys(email)

    pwd_input = driver.find_element(By.CSS_SELECTOR, "input[type='password']")
    pwd_input.clear()
    pwd_input.send_keys(password)

    # Submit
    driver.find_element(By.CSS_SELECTOR, "button[type='submit']").click()

    # Wait for redirect to /dashboard
    wait.until(lambda d: "/dashboard" in d.current_url or "#/dashboard" in d.current_url)


def ui_logout(driver, base_url: str):
    """Click the logout button in the NavBar."""
    wait = WebDriverWait(driver, DEFAULT_WAIT)
    driver.get(f"{base_url}/#/dashboard")
    logout_btn = wait.until(EC.element_to_be_clickable(
        (By.XPATH, "//button[.//svg[contains(@class,'lucide-log-out')] or @title='Log out' or @aria-label='Log out']")
    ))
    logout_btn.click()
    wait.until(lambda d: "#/dashboard" not in d.current_url)


@pytest.fixture()
def logged_in_customer(driver, base_url):
    """Log in as the test customer before the test, log out after."""
    ui_login(driver, base_url, CUSTOMER_EMAIL, CUSTOMER_PASSWORD, role="customer")
    yield driver
    # Navigate away to reset state — actual Supabase sign-out is handled by next test as needed
    driver.get(f"{base_url}/#/")


@pytest.fixture()
def logged_in_provider(driver, base_url):
    """Log in as the test provider before the test, log out after."""
    ui_login(driver, base_url, PROVIDER_EMAIL, PROVIDER_PASSWORD, role="provider")
    yield driver
    driver.get(f"{base_url}/#/")
