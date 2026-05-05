"""
Chunk 1 tests — AI-CRIT-01 / AI-HIGH-02
Dev-mode bypass warnings + ENV validation (RT-15, AI-SEC-06, AI-SEC-02, AI-SEC-03).
"""
import logging
from unittest.mock import AsyncMock, patch

import pytest
from httpx import ASGITransport, AsyncClient

from app.core.config import settings
from app.main import app

_NSOPW_BODY = {"firstName": "John", "lastName": "Doe"}
_DUMMY_NSOPW = {"nsopwStatus": "pass", "matchFound": False}


async def _call_nsopw(headers=None):
    transport = ASGITransport(app=app)
    async with AsyncClient(transport=transport, base_url="http://test") as ac:
        return await ac.post("/ai/nsopw/check", json=_NSOPW_BODY, headers=headers or {})


# ── RT-15: warning must be emitted when bypass fires ─────────────────────

@pytest.mark.asyncio
async def test_rt15_bypass_logs_warning(caplog):
    """RT-15: logger.warning is emitted when dev-mode bypass activates."""
    with patch.object(settings, "ENV", "development"), \
         patch("app.services.nsopw_service.check_nsopw",
               new=AsyncMock(return_value=_DUMMY_NSOPW)):
        with caplog.at_level(logging.WARNING):
            await _call_nsopw()

    assert any("bypass" in r.message.lower() for r in caplog.records), (
        "Expected a log record containing 'bypass' but none found. "
        f"Records: {[r.message for r in caplog.records]}"
    )


# ── AI-SEC-06: bypass gives 200 AND logs warning ──────────────────────────

@pytest.mark.asyncio
async def test_aisec06_dev_mode_accessible_without_key(caplog):
    """AI-SEC-06: No key in dev mode → 200 (bypass active) + warning logged."""
    with patch.object(settings, "ENV", "development"), \
         patch("app.services.nsopw_service.check_nsopw",
               new=AsyncMock(return_value=_DUMMY_NSOPW)):
        with caplog.at_level(logging.WARNING):
            response = await _call_nsopw()  # no X-Internal-Key

    assert response.status_code == 200, f"Expected 200, got {response.status_code}"
    assert any("bypass" in r.message.lower() for r in caplog.records), (
        "Expected warning containing 'bypass'"
    )


# ── AI-SEC-02: empty key in production → 403 ─────────────────────────────

@pytest.mark.asyncio
async def test_aisec02_empty_key_production():
    """AI-SEC-02: Empty X-Internal-Key header in production ENV → 403."""
    with patch.object(settings, "ENV", "production"), \
         patch.object(settings, "INTERNAL_API_KEY", "real-secret-key"):
        response = await _call_nsopw(headers={"X-Internal-Key": ""})

    assert response.status_code == 403
    assert response.json()["detail"] == "Forbidden: invalid internal API key"


# ── AI-SEC-03: wrong key in production → 403 ─────────────────────────────

@pytest.mark.asyncio
async def test_aisec03_wrong_key_production():
    """AI-SEC-03: Wrong X-Internal-Key value in production ENV → 403."""
    with patch.object(settings, "ENV", "production"), \
         patch.object(settings, "INTERNAL_API_KEY", "real-secret-key"):
        response = await _call_nsopw(headers={"X-Internal-Key": "wrong-key"})

    assert response.status_code == 403
    assert response.json()["detail"] == "Forbidden: invalid internal API key"


# ── Unknown ENV must NOT bypass auth ─────────────────────────────────────

@pytest.mark.asyncio
async def test_unknown_env_enforces_key():
    """Unknown ENV value ('staging') must never bypass the key check."""
    with patch.object(settings, "ENV", "staging"), \
         patch.object(settings, "INTERNAL_API_KEY", "real-secret-key"):
        response = await _call_nsopw()  # no key header

    assert response.status_code == 403
