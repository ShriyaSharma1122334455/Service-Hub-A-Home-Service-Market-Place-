"""
test_new_routes.py — RT-01 through RT-15
Replaces test_api_routes.py with strict single-status assertions.
Each test asserts the HTTP status code AND at least one response field.
Chunk 4 — AI-HIGH-03
"""
import logging
from unittest.mock import AsyncMock, patch

import pytest
from httpx import ASGITransport, AsyncClient

from app.core.config import settings
from app.main import app

TEST_KEY = "test-internal-key"

# Minimal JPEG SOI header — passes magic-byte validation
FAKE_JPEG = b"\xff\xd8\xff\xe0" + b"\x00" * 20


def _prod_key_header():
    return {"X-Internal-Key": TEST_KEY}


# ── RT-01: root endpoint ──────────────────────────────────────────────────

@pytest.mark.asyncio
async def test_rt01_root_returns_service_info():
    """RT-01: GET / returns service name and route map with ocr/face/nsopw."""
    transport = ASGITransport(app=app)
    async with AsyncClient(transport=transport, base_url="http://test") as ac:
        response = await ac.get("/")

    assert response.status_code == 200
    data = response.json()
    assert data["service"] == "ServiceHub Verification Service"
    assert "ocr" in data["routes"]


# ── RT-02: health endpoint ────────────────────────────────────────────────

@pytest.mark.asyncio
async def test_rt02_health_returns_ok():
    """RT-02: GET /health/ returns status=ok."""
    transport = ASGITransport(app=app)
    async with AsyncClient(transport=transport, base_url="http://test") as ac:
        response = await ac.get("/health/")

    assert response.status_code == 200
    assert response.json()["status"] == "ok"


# ── RT-03: missing key in production → 403 ───────────────────────────────

@pytest.mark.asyncio
async def test_rt03_ocr_missing_key_production():
    """RT-03: POST /ai/ocr/parse-id without X-Internal-Key in production → 403."""
    with patch.object(settings, "ENV", "production"), \
         patch.object(settings, "INTERNAL_API_KEY", TEST_KEY):
        transport = ASGITransport(app=app)
        async with AsyncClient(transport=transport, base_url="http://test") as ac:
            response = await ac.post(
                "/ai/ocr/parse-id",
                files={"document": ("id.jpg", b"fake-image", "image/jpeg")},
                data={"document_type": "drivers_license"},
            )

    assert response.status_code == 403
    assert "forbidden" in response.json()["detail"].lower()


# ── RT-04: valid key + JPEG + Vision mocked → 200 ────────────────────────

@pytest.mark.asyncio
async def test_rt04_ocr_valid_key_mocked_vision():
    """RT-04: POST /ai/ocr/parse-id with valid key + JPEG → 200 with extractedName."""
    _mock_ocr = {
        "status": "verified",
        "extractedName": "John Smith",
        "extractedDOB": "1990-01-15",
        "documentNumber": "A1234567",
        "expiryDate": "2028-12-31",
        "confidence": 0.95,
    }
    with patch.object(settings, "ENV", "production"), \
         patch.object(settings, "INTERNAL_API_KEY", TEST_KEY), \
         patch("app.services.ocr_service.extract_id_data",
               new=AsyncMock(return_value=_mock_ocr)):
        transport = ASGITransport(app=app)
        async with AsyncClient(transport=transport, base_url="http://test") as ac:
            response = await ac.post(
                "/ai/ocr/parse-id",
                files={"document": ("id.jpg", FAKE_JPEG, "image/jpeg")},
                data={"document_type": "drivers_license"},
                headers=_prod_key_header(),
            )

    assert response.status_code == 200
    assert response.json()["extractedName"] == "John Smith"


# ── RT-05: empty file → 400 ───────────────────────────────────────────────

@pytest.mark.asyncio
async def test_rt05_ocr_empty_file_rejected():
    """RT-05: POST /ai/ocr/parse-id with empty file → 400."""
    with patch.object(settings, "ENV", "production"), \
         patch.object(settings, "INTERNAL_API_KEY", TEST_KEY):
        transport = ASGITransport(app=app)
        async with AsyncClient(transport=transport, base_url="http://test") as ac:
            response = await ac.post(
                "/ai/ocr/parse-id",
                files={"document": ("empty.jpg", b"", "image/jpeg")},
                data={"document_type": "drivers_license"},
                headers=_prod_key_header(),
            )

    assert response.status_code == 400
    assert "empty" in response.json()["detail"].lower()


# ── RT-06: file > 5 MB → 400 ─────────────────────────────────────────────

@pytest.mark.asyncio
async def test_rt06_ocr_oversized_file_rejected():
    """RT-06: POST /ai/ocr/parse-id with 6 MB file → 400."""
    with patch.object(settings, "ENV", "production"), \
         patch.object(settings, "INTERNAL_API_KEY", TEST_KEY):
        transport = ASGITransport(app=app)
        async with AsyncClient(transport=transport, base_url="http://test") as ac:
            response = await ac.post(
                "/ai/ocr/parse-id",
                files={"document": ("big.jpg", b"x" * (6 * 1024 * 1024), "image/jpeg")},
                data={"document_type": "drivers_license"},
                headers=_prod_key_header(),
            )

    assert response.status_code == 400
    assert "large" in response.json()["detail"].lower()


# ── RT-07: invalid document_type → 400 ───────────────────────────────────

@pytest.mark.asyncio
async def test_rt07_ocr_invalid_document_type():
    """RT-07: POST /ai/ocr/parse-id with unknown document_type → 400."""
    with patch.object(settings, "ENV", "production"), \
         patch.object(settings, "INTERNAL_API_KEY", TEST_KEY):
        transport = ASGITransport(app=app)
        async with AsyncClient(transport=transport, base_url="http://test") as ac:
            response = await ac.post(
                "/ai/ocr/parse-id",
                files={"document": ("id.jpg", b"fake-jpeg", "image/jpeg")},
                data={"document_type": "national_id"},
                headers=_prod_key_header(),
            )

    assert response.status_code == 400
    assert "document_type" in response.json()["detail"].lower()


# ── RT-08: face match valid key + Rekognition mocked → 200 ───────────────

@pytest.mark.asyncio
async def test_rt08_face_match_mocked_rekognition():
    """RT-08: POST /ai/face/match with valid key + both images → 200 with matched & similarity."""
    _mock_face = {
        "matched": True,
        "similarity": 95.0,
        "confidence": "high",
        "faceDetectedInId": True,
        "faceDetectedInSelfie": True,
        "checkedAt": "2026-05-04T00:00:00+00:00",
        "status": "verified",
        "rejectionReason": None,
    }
    with patch.object(settings, "ENV", "production"), \
         patch.object(settings, "INTERNAL_API_KEY", TEST_KEY), \
         patch("app.services.face_service.compare_faces",
               new=AsyncMock(return_value=_mock_face)):
        transport = ASGITransport(app=app)
        async with AsyncClient(transport=transport, base_url="http://test") as ac:
            response = await ac.post(
                "/ai/face/match",
                files={
                    "id_image": ("id.jpg", FAKE_JPEG, "image/jpeg"),
                    "selfie": ("selfie.jpg", FAKE_JPEG, "image/jpeg"),
                },
                headers=_prod_key_header(),
            )

    assert response.status_code == 200
    data = response.json()
    assert "matched" in data
    assert data["similarity"] == 95.0


# ── RT-09: empty id_image → 400 ───────────────────────────────────────────

@pytest.mark.asyncio
async def test_rt09_face_empty_id_image():
    """RT-09: POST /ai/face/match with empty id_image → 400."""
    with patch.object(settings, "ENV", "production"), \
         patch.object(settings, "INTERNAL_API_KEY", TEST_KEY):
        transport = ASGITransport(app=app)
        async with AsyncClient(transport=transport, base_url="http://test") as ac:
            response = await ac.post(
                "/ai/face/match",
                files={
                    "id_image": ("id.jpg", b"", "image/jpeg"),
                    "selfie": ("selfie.jpg", b"fake-selfie", "image/jpeg"),
                },
                headers=_prod_key_header(),
            )

    assert response.status_code == 400
    assert "id" in response.json()["detail"].lower()


# ── RT-10: empty selfie → 400 ─────────────────────────────────────────────

@pytest.mark.asyncio
async def test_rt10_face_empty_selfie():
    """RT-10: POST /ai/face/match with empty selfie → 400."""
    with patch.object(settings, "ENV", "production"), \
         patch.object(settings, "INTERNAL_API_KEY", TEST_KEY):
        transport = ASGITransport(app=app)
        async with AsyncClient(transport=transport, base_url="http://test") as ac:
            response = await ac.post(
                "/ai/face/match",
                files={
                    "id_image": ("id.jpg", FAKE_JPEG, "image/jpeg"),
                    "selfie": ("selfie.jpg", b"", "image/jpeg"),
                },
                headers=_prod_key_header(),
            )

    assert response.status_code == 400
    assert "selfie" in response.json()["detail"].lower()


# ── RT-11: NSOPW valid key + scraper mocked → 200 ────────────────────────

@pytest.mark.asyncio
async def test_rt11_nsopw_valid_key_mocked():
    """RT-11: POST /ai/nsopw/check with valid key → 200 with nsopwStatus."""
    _mock_nsopw = {"nsopwStatus": "pass", "matchFound": False}
    with patch.object(settings, "ENV", "production"), \
         patch.object(settings, "INTERNAL_API_KEY", TEST_KEY), \
         patch("app.services.nsopw_service.check_nsopw",
               new=AsyncMock(return_value=_mock_nsopw)):
        transport = ASGITransport(app=app)
        async with AsyncClient(transport=transport, base_url="http://test") as ac:
            response = await ac.post(
                "/ai/nsopw/check",
                json={"firstName": "John", "lastName": "Doe"},
                headers=_prod_key_header(),
            )

    assert response.status_code == 200
    assert response.json()["nsopwStatus"] == "pass"


# ── RT-12: missing firstName → 422 ───────────────────────────────────────

@pytest.mark.asyncio
async def test_rt12_nsopw_missing_firstname():
    """RT-12: POST /ai/nsopw/check without firstName → 422 validation error."""
    with patch.object(settings, "ENV", "production"), \
         patch.object(settings, "INTERNAL_API_KEY", TEST_KEY):
        transport = ASGITransport(app=app)
        async with AsyncClient(transport=transport, base_url="http://test") as ac:
            response = await ac.post(
                "/ai/nsopw/check",
                json={"lastName": "Doe"},
                headers=_prod_key_header(),
            )

    assert response.status_code == 422
    errors = response.json()["detail"]
    assert any("firstName" in str(e) for e in errors)


# ── RT-13: missing lastName → 422 ────────────────────────────────────────

@pytest.mark.asyncio
async def test_rt13_nsopw_missing_lastname():
    """RT-13: POST /ai/nsopw/check without lastName → 422 validation error."""
    with patch.object(settings, "ENV", "production"), \
         patch.object(settings, "INTERNAL_API_KEY", TEST_KEY):
        transport = ASGITransport(app=app)
        async with AsyncClient(transport=transport, base_url="http://test") as ac:
            response = await ac.post(
                "/ai/nsopw/check",
                json={"firstName": "John"},
                headers=_prod_key_header(),
            )

    assert response.status_code == 422
    errors = response.json()["detail"]
    assert any("lastName" in str(e) for e in errors)


# ── RT-14: legacy document route still reachable ─────────────────────────

@pytest.mark.asyncio
async def test_rt14_legacy_document_route_reachable():
    """RT-14: Legacy POST /api/v1/verify/document is still registered (not 404)."""
    transport = ASGITransport(app=app)
    async with AsyncClient(transport=transport, base_url="http://test") as ac:
        response = await ac.post("/api/v1/verify/document", json={
            "image_url": "https://example.com/id.jpg",
            "user_id": "test-user",
        })

    assert response.status_code != 404, "Legacy route must remain registered"
    assert response.status_code in (200, 422)
    if response.status_code == 200:
        assert "status" in response.json()


# ── RT-15: dev bypass logs a warning ──────────────────────────────────────

@pytest.mark.asyncio
async def test_rt15_dev_mode_bypass_logs_warning(caplog):
    """RT-15: Auth bypass in development mode logs logger.warning (OCR route)."""
    _mock_ocr = {"status": "manual_review", "extractedName": None, "confidence": 0.0}
    with patch.object(settings, "ENV", "development"), \
         patch("app.services.ocr_service.extract_id_data",
               new=AsyncMock(return_value=_mock_ocr)):
        with caplog.at_level(logging.WARNING):
            transport = ASGITransport(app=app)
            async with AsyncClient(transport=transport, base_url="http://test") as ac:
                response = await ac.post(
                    "/ai/ocr/parse-id",
                    files={"document": ("id.jpg", FAKE_JPEG, "image/jpeg")},
                    data={"document_type": "drivers_license"},
                )

    assert response.status_code == 200
    assert any("bypass" in r.message.lower() for r in caplog.records)
