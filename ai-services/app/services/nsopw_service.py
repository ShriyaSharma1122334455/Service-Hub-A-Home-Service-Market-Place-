"""
NSOPW Background Check Service
================================
Searches the National Sex Offender Public Website for a provider's name.
No public API exists — implemented as HTTP scraping with fuzzy name matching
and self-declaration fallback.

Returns:
    nsopwStatus:  "pass" | "fail" | "pending"
    matchFound:   bool
    matchDetails: list of match objects
    checkedAt:    ISO timestamp
    source:       "nsopw.gov"

Security:
    PII (names) is NEVER logged. Only redacted references are used in log output.

Risk register note: NSOPW site structure may change.
Mitigation: fallback_response() is triggered on any failure, requiring the
provider to self-declare instead of hard-blocking onboarding.
"""

import logging
from datetime import datetime, timezone
from typing import Optional, List, Dict, Any

import httpx
from bs4 import BeautifulSoup

logger = logging.getLogger(__name__)

NSOPW_SEARCH_URL = "https://www.nsopw.gov/en/Search/Verify"
REQUEST_TIMEOUT = 15.0  # 15 second timeout as specified


# ── Fuzzy matching ────────────────────────────────────────────────────────

def _fuzzy_name_similarity(name1: str, name2: str) -> float:
    """
    Compute similarity between two names using SequenceMatcher.
    Returns a float 0.0 - 1.0.
    """
    try:
        from difflib import SequenceMatcher
        # Normalise: lowercase, strip whitespace, remove punctuation
        n1 = " ".join(name1.lower().split())
        n2 = " ".join(name2.lower().split())
        return SequenceMatcher(None, n1, n2).ratio()
    except Exception:
        return 0.0


def _is_fuzzy_match(
    input_first: str,
    input_last: str,
    result_name: str,
    threshold: float = 0.80,
) -> bool:
    """
    Check if a result name fuzzy-matches the input first+last name.
    Tries both "first last" and "last first" orderings.
    """
    full_name = f"{input_first} {input_last}"
    reverse_name = f"{input_last} {input_first}"

    sim_forward = _fuzzy_name_similarity(full_name, result_name)
    sim_reverse = _fuzzy_name_similarity(reverse_name, result_name)

    return max(sim_forward, sim_reverse) >= threshold


# ── Public API ────────────────────────────────────────────────────────────

async def check_nsopw(
    first_name: str,
    last_name: str,
    state: Optional[str] = None,
) -> Dict[str, Any]:
    """
    Search NSOPW for a provider by first/last name.
    Falls back to pending + self-declaration if the site is unavailable.
    PII is NEVER logged.

    Returns:
        nsopwStatus:  "pass" | "fail" | "pending"
        matchFound:   bool
        matchDetails: list[dict]
        checkedAt:    ISO timestamp
        source:       "nsopw.gov"
    """
    checked_at = datetime.now(timezone.utc).isoformat()

    if not first_name.strip() or not last_name.strip():
        logger.info("NSOPW check — insufficient name data (PII redacted)")
        return {
            "nsopwStatus": "pending",
            "matchFound": False,
            "matchDetails": [],
            "checkedAt": checked_at,
            "source": "nsopw.gov",
            "selfDeclarationRequired": True,
            "reason": "Full name required for NSOPW check (first + last name).",
        }

    try:
        return await _scrape_nsopw(first_name, last_name, state, checked_at)
    except httpx.TimeoutException:
        logger.warning("NSOPW scrape timed out after %.0fs — returning pending", REQUEST_TIMEOUT)
        return _fallback_response(checked_at)
    except httpx.HTTPError as exc:
        logger.warning("NSOPW HTTP error — returning pending. Status: %s", getattr(exc, 'response', 'N/A'))
        return _fallback_response(checked_at)
    except Exception as exc:
        logger.warning("NSOPW scrape failed — returning pending. Type: %s", type(exc).__name__)
        return _fallback_response(checked_at)


# ── Scraping ──────────────────────────────────────────────────────────────

async def _scrape_nsopw(
    first_name: str,
    last_name: str,
    state: Optional[str],
    checked_at: str,
) -> Dict[str, Any]:
    """Submit search form to nsopw.gov and parse the results."""
    payload = {
        "LastName": last_name,
        "FirstName": first_name,
        "Jurisdiction": state or "",
    }
    headers = {
        "User-Agent": "ServiceHub-VerificationBot/1.0 (background-check; contact@servicehub.com)",
        "Accept": "text/html,application/xhtml+xml",
        "Content-Type": "application/x-www-form-urlencoded",
    }

    async with httpx.AsyncClient(timeout=REQUEST_TIMEOUT, follow_redirects=True) as client:
        resp = await client.post(NSOPW_SEARCH_URL, data=payload, headers=headers)
        resp.raise_for_status()

    soup = BeautifulSoup(resp.text, "html.parser")
    return _parse_results(soup, first_name, last_name, checked_at)


def _parse_results(
    soup: BeautifulSoup,
    first_name: str,
    last_name: str,
    checked_at: str,
) -> Dict[str, Any]:
    """Parse the NSOPW results page and apply fuzzy name matching."""
    page_text = soup.get_text(separator=" ").lower()

    # Check for "no records" indicators
    no_records_phrases = [
        "no records found",
        "no matching records",
        "no results found",
        "0 offenders found",
    ]
    if any(phrase in page_text for phrase in no_records_phrases):
        return {
            "nsopwStatus": "pass",
            "matchFound": False,
            "matchDetails": [],
            "checkedAt": checked_at,
            "source": "nsopw.gov",
        }

    # Extract result rows from the table
    result_rows = soup.select("table.offender-results tr, .search-result-row, .offender-row")

    if not result_rows:
        # Unexpected page structure — treat as pending, not fail
        logger.warning("NSOPW response structure not recognised — returning pending")
        return _fallback_response(checked_at)

    # Apply fuzzy name matching against each result
    match_details: List[Dict[str, Any]] = []
    for row in result_rows:
        row_text = row.get_text(separator=" ").strip()
        if not row_text or len(row_text) < 3:
            continue

        # Extract name from the row (first cell or full text)
        cells = row.select("td")
        result_name = cells[0].get_text(separator=" ").strip() if cells else row_text

        if _is_fuzzy_match(first_name, last_name, result_name):
            # Build match detail without storing raw PII
            similarity = max(
                _fuzzy_name_similarity(f"{first_name} {last_name}", result_name),
                _fuzzy_name_similarity(f"{last_name} {first_name}", result_name),
            )
            match_details.append({
                "similarity": round(similarity, 3),
                "location": cells[1].get_text(strip=True) if len(cells) > 1 else None,
                "fuzzyMatch": True,
            })

    if match_details:
        # PII is NOT logged — only count
        logger.warning("NSOPW fuzzy match found %d potential record(s)", len(match_details))
        return {
            "nsopwStatus": "fail",
            "matchFound": True,
            "matchDetails": match_details,
            "checkedAt": checked_at,
            "source": "nsopw.gov",
            "reason": (
                f"Background check returned {len(match_details)} potential record(s). "
                "Manual review required before onboarding this provider."
            ),
        }

    # Rows found but no fuzzy match — clear
    return {
        "nsopwStatus": "pass",
        "matchFound": False,
        "matchDetails": [],
        "checkedAt": checked_at,
        "source": "nsopw.gov",
    }


def _fallback_response(checked_at: str) -> Dict[str, Any]:
    """
    Used when NSOPW is unavailable, times out, or the response is unparseable.
    Returns pending without throwing — never blocks onboarding on a timeout.
    """
    return {
        "nsopwStatus": "pending",
        "matchFound": False,
        "matchDetails": [],
        "checkedAt": checked_at,
        "source": "nsopw.gov",
        "selfDeclarationRequired": True,
        "reason": "NSOPW check could not be completed at this time. Self-declaration required.",
    }
