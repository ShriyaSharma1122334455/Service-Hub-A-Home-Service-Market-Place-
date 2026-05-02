"""BasePage — shared helpers for all page objects."""

from selenium.webdriver.common.by import By
from selenium.webdriver.remote.webdriver import WebDriver
from selenium.webdriver.remote.webelement import WebElement
from selenium.webdriver.support.ui import WebDriverWait
from selenium.webdriver.support import expected_conditions as EC
from selenium.common.exceptions import TimeoutException, NoSuchElementException


DEFAULT_TIMEOUT = 12


class BasePage:
    def __init__(self, driver: WebDriver, base_url: str):
        self.driver = driver
        self.base_url = base_url.rstrip("/")
        self.wait = WebDriverWait(driver, DEFAULT_TIMEOUT)

    # ── Navigation ─────────────────────────────────────────────────────────────

    def go_to(self, hash_path: str):
        """Navigate to a hash-routed path, e.g. '/login' → '/#/login'."""
        path = hash_path if hash_path.startswith("/") else f"/{hash_path}"
        self.driver.get(f"{self.base_url}/#/{path.lstrip('/')}")

    def current_hash(self) -> str:
        """Return the current hash path without the leading '#'."""
        return self.driver.current_url.split("#")[-1] if "#" in self.driver.current_url else "/"

    # ── Wait helpers ───────────────────────────────────────────────────────────

    def wait_for(self, by: By, selector: str, timeout: int = DEFAULT_TIMEOUT) -> WebElement:
        return WebDriverWait(self.driver, timeout).until(
            EC.presence_of_element_located((by, selector))
        )

    def wait_clickable(self, by: By, selector: str, timeout: int = DEFAULT_TIMEOUT) -> WebElement:
        return WebDriverWait(self.driver, timeout).until(
            EC.element_to_be_clickable((by, selector))
        )

    def wait_for_text(self, text: str, timeout: int = DEFAULT_TIMEOUT):
        """Wait until the given text appears anywhere in the page body."""
        WebDriverWait(self.driver, timeout).until(
            EC.text_to_be_present_in_element((By.TAG_NAME, "body"), text)
        )

    def wait_for_url(self, partial: str, timeout: int = DEFAULT_TIMEOUT):
        WebDriverWait(self.driver, timeout).until(EC.url_contains(partial))

    def is_text_present(self, text: str) -> bool:
        return text in self.driver.find_element(By.TAG_NAME, "body").text

    # ── Interaction helpers ────────────────────────────────────────────────────

    def click(self, by: By, selector: str):
        self.wait_clickable(by, selector).click()

    def fill(self, by: By, selector: str, text: str):
        el = self.wait_for(by, selector)
        el.clear()
        el.send_keys(text)

    def get_text(self, by: By, selector: str) -> str:
        return self.wait_for(by, selector).text

    def element_exists(self, by: By, selector: str, timeout: int = 4) -> bool:
        try:
            WebDriverWait(self.driver, timeout).until(
                EC.presence_of_element_located((by, selector))
            )
            return True
        except TimeoutException:
            return False

    # ── Notification / alert ───────────────────────────────────────────────────

    def get_alert_text(self, timeout: int = 8) -> str | None:
        """Return text of a [role=alert] element, or None if not present."""
        try:
            el = WebDriverWait(self.driver, timeout).until(
                EC.presence_of_element_located((By.CSS_SELECTOR, "[role='alert']"))
            )
            return el.text
        except TimeoutException:
            return None
