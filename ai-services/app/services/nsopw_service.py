"""
NSOPW Background Check Service
================================
Searches the National Sex Offender Public Website for a provider's name.
No public API exists — implemented as HTTP scraping with self-declaration fallback.

Risk register note: NSOPW site structure may change.
Mitigation: fallback_response() is triggered on any failure, requiring the
provider to self-declare instead of hard-blocking onboarding.
"""

import logging
from typing import Optional

import httpx
from bs4 import BeautifulSoup

from app.models.schemas import NSopwCheckResponse, VerificationStatus

logger = logging.getLogger(__name__)

NSOPW_SEARCH_URL = "https://www.nsopw.gov/en/Search/Verify"
REQUEST_TIMEOUT  = 20.0


# ── Public API ────────────────────────────────────────────────────────────

async def check_nsopw(
    full_name: str,
    state: Optional[str] = None,
) -> NSopwCheckResponse:
    """
    Search NSOPW for a provider by name.
    Falls back to self-declaration if the site is unavailable.
    """
    parts = full_name.strip().split()
    if len(parts) < 2:
        return NSopwCheckResponse(
            status=VerificationStatus.MANUAL_REVIEW,
            is_clear=False,
            rejection_reason="Full name required for NSOPW check (first + last name).",
            used_fallback=True,
            self_declaration_required=True,
        )

    first = parts[0]
    last  = " ".join(parts[1:])

    try:
        return await _scrape_nsopw(first, last, state)
    except Exception as exc:
        logger.warning("NSOPW scrape failed — using self-declaration fallback. Reason: %s", exc)
        return _fallback_response()


# ── Scraping ──────────────────────────────────────────────────────────────

async def _scrape_nsopw(
    first_name: str,
    last_name: str,
    state: Optional[str],
) -> NSopwCheckResponse:
    payload = {
        "LastName":    last_name,
        "FirstName":   first_name,
        "Jurisdiction": state or "",
    }
    headers = {
        "User-Agent":   "ServiceHub-VerificationBot/1.0 (background-check; contact@servicehub.com)",
        "Accept":       "text/html,application/xhtml+xml",
        "Content-Type": "application/x-www-form-urlencoded",
    }

    async with httpx.AsyncClient(timeout=REQUEST_TIMEOUT, follow_redirects=True) as client:
        resp = await client.post(NSOPW_SEARCH_URL, data=payload, headers=headers)
        resp.raise_for_status()

    soup = BeautifulSoup(resp.text, "html.parser")
    return _parse_results(soup)


def _parse_results(soup: BeautifulSoup) -> NSopwCheckResponse:
    page_text = soup.get_text(separator=" ").lower()

    no_records_phrases = [
        "no records found",
        "no matching records",
        "no results found",
        "0 offenders found",
    ]
    if any(phrase in page_text for phrase in no_records_phrases):
        return NSopwCheckResponse(
            status=VerificationStatus.VERIFIED,
            is_clear=True,
            records_found=0,
        )

    result_rows = soup.select("table.offender-results tr, .search-result-row")
    count = len(result_rows)

    if count > 0:
        logger.warning("NSOPW returned %d potential record(s)", count)
        return NSopwCheckResponse(
            status=VerificationStatus.REJECTED,
            is_clear=False,
            records_found=count,
            rejection_reason=(
                f"Background check returned {count} potential record(s). "
                "Manual review required before onboarding this provider."
            ),
        )

    # Unexpected page structure — treat as inconclusive
    logger.warning("NSOPW response structure not recognised — falling back")
    return _fallback_response()


def _fallback_response() -> NSopwCheckResponse:
    """Used when NSOPW is unavailable or the response is unparseable."""
    return NSopwCheckResponse(
        status=VerificationStatus.MANUAL_REVIEW,
        is_clear=True,
        records_found=0,
        used_fallback=True,
        self_declaration_required=True,
    )
