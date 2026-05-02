"""NavBar helper — query and interact with the top navigation bar."""

from selenium.webdriver.common.by import By
from selenium.webdriver.remote.webdriver import WebDriver
from selenium.webdriver.support.ui import WebDriverWait
from selenium.webdriver.support import expected_conditions as EC
from selenium.common.exceptions import TimeoutException


class NavBar:
    """Helper that wraps NavBar interactions without being a full page object."""

    def __init__(self, driver: WebDriver, timeout: int = 10):
        self.driver = driver
        self.wait = WebDriverWait(driver, timeout)

    def _body_text(self) -> str:
        return self.driver.find_element(By.TAG_NAME, "body").text

    # ── Auth state detection ────────────────────────────────────────────────────

    def is_logged_in(self) -> bool:
        """True when the navbar shows a user avatar / name (logged-in state)."""
        try:
            self.wait.until(
                lambda d: "Log In" in d.find_element(By.TAG_NAME, "nav").text
                or "Log Out" in d.find_element(By.TAG_NAME, "nav").text
                or "Get Started" in d.find_element(By.TAG_NAME, "nav").text
            )
        except TimeoutException:
            pass
        nav_text = self.driver.find_element(By.TAG_NAME, "nav").text
        return "Log Out" not in nav_text and "Log In" not in nav_text and "Get Started" not in nav_text

    def is_guest(self) -> bool:
        """True when the navbar shows Login / Get Started (unauthenticated)."""
        try:
            nav = self.driver.find_element(By.TAG_NAME, "nav")
            return "Log In" in nav.text or "Get Started" in nav.text
        except Exception:
            return False

    # ── Actions ─────────────────────────────────────────────────────────────────

    def click_login(self):
        btn = self.wait.until(EC.element_to_be_clickable(
            (By.XPATH, "//button[normalize-space()='Log In']")
        ))
        btn.click()

    def click_register(self):
        btn = self.wait.until(EC.element_to_be_clickable(
            (By.XPATH, "//button[normalize-space()='Get Started']")
        ))
        btn.click()

    def click_logout(self):
        btn = self.wait.until(EC.element_to_be_clickable(
            (By.XPATH, "//button[.//svg[contains(@class,'lucide')]][@title or contains(@class,'text-red')]")
        ))
        btn.click()

    def click_dashboard(self):
        self.wait.until(EC.element_to_be_clickable(
            (By.XPATH, "//span[normalize-space()='Dashboard']")
        )).click()

    def click_profile(self):
        self.wait.until(EC.element_to_be_clickable(
            (By.XPATH, "//button[.//img[contains(@class,'rounded-full')]]")
        )).click()

    def click_help(self):
        self.wait.until(EC.element_to_be_clickable(
            (By.XPATH, "//span[normalize-space()='Help']")
        )).click()

    def has_nav_item(self, text: str) -> bool:
        try:
            nav = self.driver.find_element(By.TAG_NAME, "nav")
            return text in nav.text
        except Exception:
            return False
