"""RegisterPage — page object for the /register hash route.

The register form has a multi-step flow:
  Customer: Step 0 (Account details only) → submit
  Provider: Step 0 (Account) → Step 1 (Business) → Step 2 (Services) → submit
"""

from selenium.webdriver.common.by import By
from .base_page import BasePage


class RegisterPage(BasePage):

    def open(self):
        self.go_to("/register")
        self.wait_for(By.CSS_SELECTOR, "input[placeholder='John Doe']")
        return self

    def is_open(self) -> bool:
        return "/register" in self.current_hash()

    # ── Role selection ──────────────────────────────────────────────────────────

    def select_customer(self):
        self.click(By.XPATH, "//button[@type='button' and normalize-space(text())='Customer']")
        return self

    def select_provider(self):
        self.click(By.XPATH, "//button[@type='button' and normalize-space(text())='Provider']")
        return self

    # ── Step 0 fields ───────────────────────────────────────────────────────────

    def enter_name(self, name: str):
        self.fill(By.CSS_SELECTOR, "input[placeholder='John Doe']", name)
        return self

    def enter_email(self, email: str):
        self.fill(By.CSS_SELECTOR, "input[type='email']", email)
        return self

    def enter_phone(self, phone: str):
        self.fill(By.CSS_SELECTOR, "input[type='tel'], input[placeholder*='phone' i], input[placeholder*='Phone' i]", phone)
        return self

    def enter_password(self, password: str):
        self.fill(By.CSS_SELECTOR, "input[type='password']", password)
        return self

    # ── Step 1 (Provider — Business details) ────────────────────────────────────

    def enter_business_name(self, name: str):
        self.fill(By.CSS_SELECTOR, "input[placeholder*='Business' i], input[placeholder*='business' i]", name)
        return self

    def enter_business_description(self, desc: str):
        area = self.wait_for(By.CSS_SELECTOR, "textarea")
        area.clear()
        area.send_keys(desc)
        return self

    # ── Step 2 (Provider — Services) ────────────────────────────────────────────

    def select_first_category(self):
        """Click the first available service category checkbox/button."""
        cat_btn = self.wait_clickable(
            By.XPATH,
            "(//button[contains(@class,'rounded') and not(@type='submit') and not(@type='button' and normalize-space()='Next')])[1]"
        )
        cat_btn.click()
        return self

    def enter_service_description(self, desc: str):
        area = self.wait_for(By.CSS_SELECTOR, "textarea")
        area.clear()
        area.send_keys(desc)
        return self

    def enter_service_price(self, price: str):
        price_input = self.wait_for(By.CSS_SELECTOR, "input[type='number'], input[placeholder*='price' i]")
        price_input.clear()
        price_input.send_keys(price)
        return self

    # ── Navigation between steps ─────────────────────────────────────────────────

    def click_next(self):
        self.click(By.XPATH, "//button[normalize-space()='Next']")
        return self

    def click_submit(self):
        self.click(By.CSS_SELECTOR, "button[type='submit']")
        return self

    # ── Convenience flows ────────────────────────────────────────────────────────

    def register_customer(self, name: str, email: str, phone: str, password: str):
        """Complete customer registration (single-step)."""
        self.open()
        self.select_customer()
        self.enter_name(name)
        self.enter_email(email)
        self.enter_phone(phone)
        self.enter_password(password)
        self.click_submit()
        return self

    # ── Assertions ───────────────────────────────────────────────────────────────

    def get_error(self) -> str | None:
        return self.get_alert_text()

    def has_error(self) -> bool:
        return self.get_error() is not None

    def click_login_link(self):
        self.click(By.XPATH, "//button[normalize-space()='Log in']")
        return self
