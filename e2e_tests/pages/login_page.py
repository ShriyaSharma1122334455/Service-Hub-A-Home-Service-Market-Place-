"""LoginPage — page object for the /login hash route."""

from selenium.webdriver.common.by import By
from .base_page import BasePage


class LoginPage(BasePage):

    # ── Navigation ──────────────────────────────────────────────────────────────

    def open(self):
        self.go_to("/login")
        self.wait_for(By.CSS_SELECTOR, "input[type='email']")
        return self

    def is_open(self) -> bool:
        return "/login" in self.current_hash()

    # ── Role selection ──────────────────────────────────────────────────────────

    def select_customer(self):
        """Click the 'User' role tab (maps to customer)."""
        self.click(By.XPATH, "//button[@type='button' and normalize-space(text())='User']")
        return self

    def select_provider(self):
        """Click the 'Provider' role tab."""
        self.click(By.XPATH, "//button[@type='button' and normalize-space(text())='Provider']")
        return self

    # ── Form fields ─────────────────────────────────────────────────────────────

    def enter_email(self, email: str):
        self.fill(By.CSS_SELECTOR, "input[type='email']", email)
        return self

    def enter_password(self, password: str):
        self.fill(By.CSS_SELECTOR, "input[type='password']", password)
        return self

    # ── Actions ─────────────────────────────────────────────────────────────────

    def submit(self):
        self.click(By.CSS_SELECTOR, "button[type='submit']")
        return self

    def login(self, email: str, password: str, role: str = "customer"):
        """Full login flow. role: 'customer' | 'provider'."""
        self.open()
        if role == "provider":
            self.select_provider()
        else:
            self.select_customer()
        self.enter_email(email)
        self.enter_password(password)
        self.submit()
        return self

    def login_and_wait_dashboard(self, email: str, password: str, role: str = "customer"):
        self.login(email, password, role)
        self.wait_for_url("/dashboard")
        return self

    # ── Assertions ──────────────────────────────────────────────────────────────

    def get_error(self) -> str | None:
        return self.get_alert_text()

    def has_error(self) -> bool:
        return self.get_error() is not None

    def click_sign_up_link(self):
        """Click the 'Sign up' link to go to registration."""
        self.click(By.XPATH, "//button[normalize-space()='Sign up']")
        return self
