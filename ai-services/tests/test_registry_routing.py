"""
test_registry_routing.py — REG-01 through REG-06
Jurisdiction routing in check_nsopw: each supported state/city routes to the
correct REST helper, and a helper failure falls back to the NSOPW httpx scraper.
"""

import pytest
from unittest.mock import patch, AsyncMock

from app.services.nsopw_service import check_nsopw

# ── Shared stubs ─────────────────────────────────────────────────────────

_PASS = {
    "nsopwStatus": "pass",
    "matchFound": False,
    "matchDetails": [],
    "checkedAt": "2024-01-01T00:00:00+00:00",
    "source": "stub",
}

_NSOPW_FALLBACK = {
    "nsopwStatus": "pass",
    "matchFound": False,
    "matchDetails": [],
    "checkedAt": "2024-01-01T00:00:00+00:00",
    "source": "nsopw.gov",
}


# ── REG-01: Iowa ──────────────────────────────────────────────────────────

@pytest.mark.asyncio
async def test_reg01_iowa_routes_to_check_iowa():
    """REG-01: state=IA calls _check_iowa instead of the NSOPW scraper."""
    with patch(
        "app.services.nsopw_service._check_iowa",
        new=AsyncMock(return_value=_PASS),
    ) as mock_iowa:
        result = await check_nsopw("John", "Doe", state="IA")

    mock_iowa.assert_called_once_with("John", "Doe")
    assert result["source"] == "stub"


# ── REG-02: Missouri ─────────────────────────────────────────────────────

@pytest.mark.asyncio
async def test_reg02_missouri_routes_to_check_missouri():
    """REG-02: state=MO calls _check_missouri instead of the NSOPW scraper."""
    with patch(
        "app.services.nsopw_service._check_missouri",
        new=AsyncMock(return_value=_PASS),
    ) as mock_mo:
        result = await check_nsopw("Jane", "Smith", state="MO")

    mock_mo.assert_called_once_with("Jane", "Smith")
    assert result["source"] == "stub"


# ── REG-03: Washington DC ────────────────────────────────────────────────

@pytest.mark.asyncio
async def test_reg03_dc_routes_to_check_dc():
    """REG-03: state=DC calls _check_dc instead of the NSOPW scraper."""
    with patch(
        "app.services.nsopw_service._check_dc",
        new=AsyncMock(return_value=_PASS),
    ) as mock_dc:
        result = await check_nsopw("Alice", "Jones", state="DC")

    mock_dc.assert_called_once_with("Alice", "Jones")
    assert result["source"] == "stub"


# ── REG-04: Chicago ──────────────────────────────────────────────────────

@pytest.mark.asyncio
async def test_reg04_chicago_routes_to_check_chicago():
    """REG-04: state=IL + city=Chicago calls _check_chicago."""
    with patch(
        "app.services.nsopw_service._check_chicago",
        new=AsyncMock(return_value=_PASS),
    ) as mock_chi:
        result = await check_nsopw("Bob", "Williams", state="IL", city="Chicago")

    mock_chi.assert_called_once_with("Bob", "Williams")
    assert result["source"] == "stub"


# ── REG-05: Illinois (non-Chicago) skips _check_chicago ──────────────────

@pytest.mark.asyncio
async def test_reg05_illinois_non_chicago_does_not_call_check_chicago():
    """REG-05: state=IL + city!=Chicago must NOT call _check_chicago; falls back to httpx."""
    with patch(
        "app.services.nsopw_service._check_chicago"
    ) as mock_chi, patch(
        "app.services.nsopw_service._httpx_search",
        new=AsyncMock(return_value=_NSOPW_FALLBACK),
    ):
        result = await check_nsopw("Carol", "Brown", state="IL", city="Springfield")

    mock_chi.assert_not_called()
    assert result["nsopwStatus"] == "pass"


# ── REG-06: REST helper failure triggers NSOPW fallback ──────────────────

@pytest.mark.asyncio
async def test_reg06_rest_failure_falls_back_to_nsopw_httpx():
    """REG-06: When _check_iowa raises, check_nsopw falls back to the httpx scraper."""
    with patch(
        "app.services.nsopw_service._check_iowa",
        new=AsyncMock(side_effect=RuntimeError("API down")),
    ), patch(
        "app.services.nsopw_service._httpx_search",
        new=AsyncMock(return_value=_NSOPW_FALLBACK),
    ) as mock_httpx:
        result = await check_nsopw("John", "Doe", state="IA")

    mock_httpx.assert_called_once()
    assert result["source"] == "nsopw.gov"
