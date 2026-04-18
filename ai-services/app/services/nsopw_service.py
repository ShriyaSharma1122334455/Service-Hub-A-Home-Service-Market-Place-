"""
NSOPW Background Check Service
================================
Dependencies: playwright, beautifulsoup4, difflib (stdlib)
Run once before use: playwright install chromium

Primary strategy:
    Searches the National Sex Offender Public Website by ZIP code using
    Playwright browser automation, then fuzzy-matches the result names
    against the provider name.

Fallback strategy:
    If Playwright is unavailable or fails, falls back to httpx-based
    HTTP scraping using first/last name against the NSOPW search form.

No offender data is stored. Only a boolean flag and status are returned.

Security:
    PII (names, zip codes) is NEVER logged. Only exception types and
    generic status messages appear in log output.

Return schema (same as before — keeps Express backend contract intact):
    nsopwStatus:  "pass" | "fail" | "pending"
    matchFound:   bool
    matchDetails: list of match objects (each contains only "name")
    checkedAt:    ISO timestamp
    source:       "nsopw.gov"
"""

import asyncio
import difflib
import logging
from datetime import datetime, timezone
from typing import Optional, List, Dict, Any

import httpx
from bs4 import BeautifulSoup

from app.models.schemas import NSopwCheckResponse, VerificationStatus

logger = logging.getLogger(__name__)

NSOPW_SEARCH_URL = "https://www.nsopw.gov/search-public-sex-offender-registries"
NSOPW_FORM_URL = "https://www.nsopw.gov/en/Search/Verify"
REQUEST_TIMEOUT = 15.0
MATCH_THRESHOLD = 0.85
NO_RESULTS_MARKERS = (
    "no results",
    "no records found",
    "no matches found",
    "did not return any results",
    "0 entries",
)
INTERSTITIAL_MARKERS = (
    "conditions of use",
    "before you will be allowed to search",
    "search public sex offender registries",
    "search by name and/or zip code",
    "captcha",
    "completely automated public turing test",
    "refine your criteria",
    "too many matches",
    "not available at this time",
)


# ── Public API ────────────────────────────────────────────────────────────

async def check_nsopw(
    first_name: str,
    last_name: str,
    state: Optional[str] = None,
    zip_code: Optional[str] = None,
) -> Dict[str, Any]:
    """
    Search NSOPW for a provider and check if their name appears in results.

    Uses Playwright (ZIP code search) as the primary strategy. Falls back
    to httpx scraping (first/last name) if Playwright is unavailable.

    PII is NEVER passed to any logger call.

    Args:
        first_name: Provider's legal first name.
        last_name:  Provider's legal last name.
        state:      Optional two-letter state code (e.g. "NJ").
        zip_code:   Optional five-digit ZIP code from their ID document.

    Returns:
        dict with nsopwStatus, matchFound, matchDetails, checkedAt, source.
    """
    checked_at = datetime.now(timezone.utc).isoformat()
    full_name = f"{first_name} {last_name}".strip()

    # Build the pending response up front so every except block can return it.
    pending_response: Dict[str, Any] = {
        "nsopwStatus": "pending",
        "matchFound": False,
        "matchDetails": [],
        "checkedAt": checked_at,
        "source": "nsopw.gov",
    }

    # ── Strategy 1: Playwright + ZIP Code ─────────────────────────────────
    if zip_code:
        try:
            result = await _playwright_search(full_name, zip_code, checked_at)
            if result is not None:
                return result
            # If _playwright_search returns None, fall through to httpx
            logger.info("Playwright search returned no definitive result — trying httpx")
        except Exception as exc:
            logger.warning(
                "Playwright strategy failed — %s: falling back to httpx",
                type(exc).__name__,
            )

    # ── Strategy 2: httpx Form Scraping ───────────────────────────────────
    try:
        result = await _httpx_search(first_name, last_name, checked_at)
        return result
    except Exception as exc:
        logger.error(
            "NSOPW check failed — %s: returning pending response",
            type(exc).__name__,
        )
        return pending_response


# ── Fallback helper (used by tests) ──────────────────────────────────────

def _fallback_response() -> NSopwCheckResponse:
    """
    Generate a safe fallback response when NSOPW cannot be reached.
    Marks the check for manual review but does NOT hard-block the provider.
    """
    return NSopwCheckResponse(
        status=VerificationStatus.MANUAL_REVIEW,
        is_clear=True,
        records_found=0,
        rejection_reason=None,
        used_fallback=True,
        self_declaration_required=True,
    )


# ── Strategy 1: Playwright Browser Automation ────────────────────────────

async def _playwright_search(
    full_name: str,
    zip_code: str,
    checked_at: str,
) -> Optional[Dict[str, Any]]:
    """
    Use Playwright to automate a ZIP-code search on nsopw.gov.

    Returns a result dict on success, or None if the page cannot be
    reached / parsed (caller should fall through to httpx strategy).
    """
    try:
        from playwright.async_api import async_playwright
    except ImportError:
        logger.warning("Playwright is not installed — skipping browser strategy")
        return None

    async with async_playwright() as pw:
        browser = await pw.chromium.launch(headless=True)
        context = await browser.new_context(
            user_agent=(
                "Mozilla/5.0 (Windows NT 10.0; Win64; x64) "
                "AppleWebKit/537.36 (KHTML, like Gecko) "
                "Chrome/124.0.0.0 Safari/537.36"
            )
        )
        context.set_default_timeout(30_000)
        page = await context.new_page()

        try:
            # ── 1. Load the NSOPW search page ─────────────────────────────
            await page.goto(NSOPW_SEARCH_URL, wait_until="networkidle")
            await asyncio.sleep(2)  # Respect the site

            # ── 2. Enter the ZIP code ─────────────────────────────────────
            zip_selectors = [
                "input[placeholder*='zip' i]",
                "input[placeholder*='ZIP' i]",
                "input[id*='zip' i]",
                "input[name*='zip' i]",
                "input[placeholder*='location' i]",
                "input[type='search']",
                "input[type='text']",
            ]
            zip_input = None
            for selector in zip_selectors:
                try:
                    zip_input = await page.wait_for_selector(
                        selector, timeout=3_000
                    )
                    if zip_input:
                        break
                except Exception:
                    continue

            if zip_input is None:
                logger.warning("NSOPW: ZIP input field not found")
                await browser.close()
                return None  # Fall through to httpx

            await zip_input.fill(zip_code)
            await asyncio.sleep(1)

            # ── 3. Submit the search ──────────────────────────────────────
            submit_selectors = [
                "button[type='submit']",
                "input[type='submit']",
                "button:has-text('Search')",
                "button:has-text('search')",
            ]
            submitted = False
            for selector in submit_selectors:
                try:
                    btn = await page.query_selector(selector)
                    if btn:
                        await btn.click()
                        submitted = True
                        break
                except Exception:
                    continue

            if not submitted:
                await zip_input.press("Enter")

            # ── 4. Wait for results ───────────────────────────────────────
            results_selectors = [
                "table",
                "div.results",
                "div[class*='result' i]",
                "tbody tr",
            ]
            for selector in results_selectors:
                try:
                    await page.wait_for_selector(selector, timeout=10_000)
                    break
                except Exception:
                    continue

            await asyncio.sleep(2)  # Allow JS rendering to settle

            # ── 5. Scan and match ─────────────────────────────────────────
            parsed_results = await _scan_page_results(page)

        finally:
            await browser.close()

    if parsed_results["status"] == "pending":
        return None

    if parsed_results["status"] == "no_results":
        return {
            "nsopwStatus": "pass",
            "matchFound": False,
            "matchDetails": [],
            "checkedAt": checked_at,
            "source": "nsopw.gov",
        }

    match_details = _fuzzy_match_candidates(full_name, parsed_results["names"])

    # ── 6. Build response in repo-standard schema ─────────────────────
    if match_details:
        return {
            "nsopwStatus": "fail",
            "matchFound": True,
            "matchDetails": match_details,
            "checkedAt": checked_at,
            "source": "nsopw.gov",
        }

    return {
        "nsopwStatus": "pass",
        "matchFound": False,
        "matchDetails": [],
        "checkedAt": checked_at,
        "source": "nsopw.gov",
    }


async def _scan_page_results(page) -> Dict[str, Any]:
    """
    Extract offender names from the current NSOPW page.

    Returns a dict with:
        status: "results" | "no_results" | "pending"
        names:  flat list of extracted offender/alias names

    Only real results pages should return "results" or "no_results".
    Search, conditions, CAPTCHA, and other interstitial pages return
    "pending" so callers do not mistakenly mark the check as a clean pass.

    Never logs any extracted name.
    """
    try:
        html = await page.content()
        return _parse_results_html(html)
    except Exception as exc:
        logger.warning("NSOPW scan_results error — %s", type(exc).__name__)
        return {"status": "pending", "names": []}


def _parse_results_html(html: str) -> Dict[str, Any]:
    """
    Parse NSOPW HTML and return a conservative classification.

    "pending" is returned when the HTML looks like a search, conditions,
    CAPTCHA, or other non-results page.
    """
    soup = BeautifulSoup(html, "html.parser")
    page_text = _normalise_page_text(soup.get_text(separator=" "))

    table = soup.find("table")
    if table is not None:
        table_text = _normalise_page_text(table.get_text(separator=" "))
        if _contains_any_marker(table_text, NO_RESULTS_MARKERS):
            return {"status": "no_results", "names": []}

        parsed_table = _extract_names_from_table(table)
        if parsed_table["names"]:
            return parsed_table

    container = (
        soup.find("div", class_=lambda c: c and "result" in c.lower())
        or soup.find("ul", class_=lambda c: c and "result" in c.lower())
    )
    if container is not None:
        container_text = _normalise_page_text(container.get_text(separator=" "))
        if _contains_any_marker(container_text, NO_RESULTS_MARKERS):
            return {"status": "no_results", "names": []}

        container_names = _extract_names_from_container(container)
        if container_names:
            return {"status": "results", "names": container_names}

    if _contains_any_marker(page_text, INTERSTITIAL_MARKERS):
        return {"status": "pending", "names": []}

    logger.warning("NSOPW: page did not contain a recognisable results view")
    return {"status": "pending", "names": []}


def _extract_names_from_table(table) -> Dict[str, Any]:
    """Extract offender and alias names from a tabular NSOPW results view."""
    names: List[str] = []
    headers = table.find_all("th")
    offender_idx = None
    alias_idx = None

    for i, th in enumerate(headers):
        header_text = _normalise_page_text(th.get_text(separator=" "))
        if "offender" in header_text and offender_idx is None:
            offender_idx = i
        if "alias" in header_text and alias_idx is None:
            alias_idx = i

    if headers and offender_idx is None:
        return {"status": "pending", "names": []}

    if offender_idx is None:
        offender_idx = 0

    for row in table.find_all("tr"):
        cells = row.find_all("td")
        if not cells:
            continue

        if offender_idx < len(cells):
            offender_name = _extract_primary_name(cells[offender_idx])
            if offender_name:
                names.append(offender_name)

        if alias_idx is not None and alias_idx < len(cells):
            names.extend(_extract_alias_names(cells[alias_idx]))

    if not names:
        return {"status": "pending", "names": []}

    return {"status": "results", "names": names}


def _extract_names_from_container(container) -> List[str]:
    """Extract candidate names from list-style or card-style result containers."""
    names: List[str] = []

    for item in container.find_all(["li", "div"], recursive=False):
        text = item.get_text(separator=" ").strip()
        if _is_probable_name(text):
            names.append(text)

    return names


def _extract_primary_name(cell) -> Optional[str]:
    """Extract the main offender name from a result cell."""
    link = cell.find("a")
    text = link.get_text(separator=" ").strip() if link else cell.get_text(separator=" ").strip()
    return text if _is_probable_name(text) else None


def _extract_alias_names(cell) -> List[str]:
    """Extract alias names from a result cell."""
    aliases: List[str] = []
    for alias_line in cell.get_text(separator="\n").split("\n"):
        alias_line = alias_line.strip()
        if _is_probable_name(alias_line):
            aliases.append(alias_line)
    return aliases


def _normalise_page_text(value: str) -> str:
    """Collapse whitespace and lowercase page text for marker matching."""
    return " ".join(value.lower().split())


def _contains_any_marker(text: str, markers: tuple[str, ...]) -> bool:
    """Check whether any known marker phrase is present in normalised text."""
    return any(marker in text for marker in markers)


def _is_probable_name(value: str) -> bool:
    """
    Filter obvious non-name strings so we only match realistic candidates.

    NSOPW results commonly use LASTNAME, FIRSTNAME format, but aliases may
    also arrive as simple space-separated names.
    """
    cleaned = " ".join(value.split()).strip()
    if len(cleaned) < 2:
        return False

    lowered = cleaned.lower()
    if _contains_any_marker(lowered, NO_RESULTS_MARKERS + INTERSTITIAL_MARKERS):
        return False

    if any(char.isdigit() for char in cleaned):
        return False

    alpha_chars = sum(1 for char in cleaned if char.isalpha())
    return alpha_chars >= 2


# ── Strategy 2: httpx Form Scraping (fallback) ───────────────────────────

async def _httpx_search(
    first_name: str,
    last_name: str,
    checked_at: str,
) -> Dict[str, Any]:
    """
    Original httpx-based scraping approach using first/last name fields.
    Used as a fallback when Playwright is unavailable or ZIP code is missing.
    """
    pending_response: Dict[str, Any] = {
        "nsopwStatus": "pending",
        "matchFound": False,
        "matchDetails": [],
        "checkedAt": checked_at,
        "source": "nsopw.gov",
    }

    headers = {
        "User-Agent": (
            "Mozilla/5.0 (Windows NT 10.0; Win64; x64) "
            "AppleWebKit/537.36 (KHTML, like Gecko) "
            "Chrome/124.0.0.0 Safari/537.36"
        ),
        "Accept": (
            "text/html,application/xhtml+xml,application/xml;"
            "q=0.9,image/webp,*/*;q=0.8"
        ),
        "Accept-Language": "en-US,en;q=0.9",
        "Accept-Encoding": "gzip, deflate, br",
        "Connection": "keep-alive",
        "Upgrade-Insecure-Requests": "1",
    }

    async with httpx.AsyncClient(
        timeout=REQUEST_TIMEOUT,
        follow_redirects=True,
        headers=headers,
    ) as client:

        # ── Step 1: GET the search page to obtain cookies / form fields ───
        get_resp = await client.get(NSOPW_FORM_URL)
        get_resp.raise_for_status()
        cookies = get_resp.cookies

        get_soup = BeautifulSoup(get_resp.text, "html.parser")

        # ── Step 2: Locate the search form ────────────────────────────────
        form = get_soup.find("form")
        if form is None:
            logger.warning("NSOPW scrape: search form not found on page")
            return pending_response

        action = form.get("action", NSOPW_FORM_URL)
        if action.startswith("/"):
            action = "https://www.nsopw.gov" + action

        # ── Step 3: Collect hidden inputs ─────────────────────────────────
        post_body: Dict[str, str] = {}
        for hidden in form.find_all("input", {"type": "hidden"}):
            name = hidden.get("name")
            value = hidden.get("value", "")
            if name:
                post_body[name] = value

        # ── Step 4: Determine visible field names and fill them ───────────
        text_inputs = form.find_all(
            "input", {"type": lambda t: t is None or t.lower() in ("text", "search")}
        )

        first_name_key = None
        last_name_key = None

        for inp in text_inputs:
            field_name = (inp.get("name") or "").lower()
            field_id = (inp.get("id") or "").lower()
            field_placeholder = (inp.get("placeholder") or "").lower()
            hint = f"{field_name} {field_id} {field_placeholder}"

            if "first" in hint and first_name_key is None:
                first_name_key = inp.get("name")
            elif "last" in hint and last_name_key is None:
                last_name_key = inp.get("name")

        if first_name_key is None:
            first_name_key = "FirstName"
        if last_name_key is None:
            last_name_key = "LastName"

        post_body[first_name_key] = first_name
        post_body[last_name_key] = last_name

        # ── Step 5: POST the form ─────────────────────────────────────────
        post_resp = await client.post(action, data=post_body, cookies=cookies)
        post_resp.raise_for_status()

    # ── Step 6: Parse the results page ────────────────────────────────────
    parsed_results = _parse_results_html(post_resp.text)

    if parsed_results["status"] == "pending":
        return pending_response

    if parsed_results["status"] == "no_results":
        return {
            "nsopwStatus": "pass",
            "matchFound": False,
            "matchDetails": [],
            "checkedAt": checked_at,
            "source": "nsopw.gov",
        }

    # ── Step 7: Extract names and fuzzy-match ─────────────────────────────
    full_name = f"{first_name} {last_name}"
    match_details = _fuzzy_match_candidates(full_name, parsed_results["names"])

    if match_details:
        return {
            "nsopwStatus": "fail",
            "matchFound": True,
            "matchDetails": match_details,
            "checkedAt": checked_at,
            "source": "nsopw.gov",
        }

    return {
        "nsopwStatus": "pass",
        "matchFound": False,
        "matchDetails": [],
        "checkedAt": checked_at,
        "source": "nsopw.gov",
    }


# ── Shared matching logic ────────────────────────────────────────────────

def _fuzzy_match_candidates(
    input_name: str,
    candidates: List[str],
) -> List[Dict[str, Any]]:
    """
    Fuzzy-match input_name against a list of candidate name strings.

    Candidates from NSOPW may be in LASTNAME, FIRSTNAME format.
    Each candidate is converted to FIRSTNAME LASTNAME before comparison.
    The original unconverted form is also checked as a fallback.
    Returns a list of match-detail dicts for candidates exceeding the
    similarity threshold. Never logs any name value.
    """
    if not candidates:
        return []

    normalised_input = input_name.strip().lower()
    match_details: List[Dict[str, Any]] = []

    for candidate in candidates:
        if not candidate:
            continue

        # Convert LASTNAME, FIRSTNAME → FIRSTNAME LASTNAME
        if "," in candidate:
            parts = candidate.split(",", 1)
            converted = f"{parts[1].strip()} {parts[0].strip()}".lower()
        else:
            converted = candidate.strip().lower()

        # Check converted form
        ratio_converted = difflib.SequenceMatcher(
            None, normalised_input, converted
        ).ratio()
        if ratio_converted > MATCH_THRESHOLD:
            match_details.append({"name": candidate})
            continue

        # Also check original unconverted form
        ratio_original = difflib.SequenceMatcher(
            None, normalised_input, candidate.strip().lower()
        ).ratio()
        if ratio_original > MATCH_THRESHOLD:
            match_details.append({"name": candidate})

    return match_details
