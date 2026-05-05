"""
test_nsopw_observability.py — AI-LOW-01
NSOPW pending observability: WARNING log + counter on connectivity failures.
Chunk 7 — AI-LOW-01
"""
import logging
from unittest.mock import patch, AsyncMock

import httpx
import pytest

import app.services.nsopw_service as nsopw_mod
from app.services.nsopw_service import check_nsopw


@pytest.fixture(autouse=True)
def reset_pending_count():
    """Reset the module-level counter before/after each test."""
    nsopw_mod._pending_count = 0
    yield
    nsopw_mod._pending_count = 0


# ── NSOPW-UT-03: ConnectError → pending + WARNING ────────────────────────

@pytest.mark.asyncio
async def test_nsopwut03_connect_error_returns_pending_with_warning(caplog):
    """NSOPW-UT-03: httpx.ConnectError → nsopwStatus=pending AND logger.warning emitted."""
    with patch(
        "app.services.nsopw_service._httpx_search",
        new=AsyncMock(side_effect=httpx.ConnectError("connection refused")),
    ):
        with caplog.at_level(logging.WARNING):
            result = await check_nsopw("John", "Doe")

    assert result["nsopwStatus"] == "pending"
    warning_messages = [r.message for r in caplog.records if r.levelno == logging.WARNING]
    assert any(
        "pending" in m.lower() or "connectivity" in m.lower() or "connect" in m.lower()
        for m in warning_messages
    ), f"Expected a WARNING mentioning connectivity/pending, got warnings: {warning_messages}"


# ── NSOPW-UT-04: counter increments on ConnectError ──────────────────────

@pytest.mark.asyncio
async def test_nsopwut04_pending_counter_increments():
    """NSOPW-UT-04: _pending_count increments by 1 on ConnectError."""
    assert nsopw_mod._pending_count == 0

    with patch(
        "app.services.nsopw_service._httpx_search",
        new=AsyncMock(side_effect=httpx.ConnectError("refused")),
    ):
        await check_nsopw("John", "Doe")

    assert nsopw_mod._pending_count == 1


# ── Counter accumulates across calls ──────────────────────────────────────

@pytest.mark.asyncio
async def test_pending_counter_accumulates():
    """Counter accumulates across multiple connectivity failures."""
    with patch(
        "app.services.nsopw_service._httpx_search",
        new=AsyncMock(side_effect=httpx.ConnectError("refused")),
    ):
        await check_nsopw("John", "Doe")
        await check_nsopw("Jane", "Smith")

    assert nsopw_mod._pending_count == 2


# ── Non-connectivity errors do NOT increment the counter ──────────────────

@pytest.mark.asyncio
async def test_non_connectivity_error_does_not_increment_counter():
    """A ValueError in _httpx_search should NOT increment _pending_count."""
    with patch(
        "app.services.nsopw_service._httpx_search",
        new=AsyncMock(side_effect=ValueError("unexpected parse error")),
    ):
        result = await check_nsopw("John", "Doe")

    assert result["nsopwStatus"] == "pending"
    assert nsopw_mod._pending_count == 0
