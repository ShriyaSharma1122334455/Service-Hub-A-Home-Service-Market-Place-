"""
Chunk 3 tests — AI-HIGH-01
Combined 25s download timeout on legacy verify_face route → 504.
"""
import asyncio
from unittest.mock import patch

import pytest
from httpx import ASGITransport, AsyncClient

from app.main import app

_FACE_BODY = {
    "id_image_url": "https://example.com/id.jpg",
    "selfie_url": "https://example.com/selfie.jpg",
    "user_id": "test-user",
}


@pytest.mark.asyncio
async def test_verify_face_timeout_returns_504():
    """AI-HIGH-01: Downloads exceeding combined 25s limit → structured 504 response."""

    async def _timeout_immediately(coro, timeout):
        coro.close()  # cleanly close the coroutine to avoid 'never awaited' warning
        raise asyncio.TimeoutError()

    with patch("asyncio.wait_for", new=_timeout_immediately):
        transport = ASGITransport(app=app)
        async with AsyncClient(transport=transport, base_url="http://test") as ac:
            response = await ac.post("/api/v1/verify/face", json=_FACE_BODY)

    assert response.status_code == 504, (
        f"Expected 504 (gateway timeout), got {response.status_code}: {response.text}"
    )
    body = response.json()
    assert "timed out" in body.get("detail", "").lower(), (
        f"Expected 'timed out' in detail field, got: {body}"
    )
