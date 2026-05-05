"""
test_mime_validation.py — AI-MED-01
Magic-byte (MIME) validation on OCR and face-match upload endpoints.
Chunk 5 — AI-MED-01
"""
from unittest.mock import patch, AsyncMock

import pytest
from httpx import ASGITransport, AsyncClient

from app.core.config import settings
from app.main import app

TEST_KEY = "test-internal-key"
_PROD_HEADERS = {"X-Internal-Key": TEST_KEY}

# ZIP magic bytes — clearly not an image
_ZIP_BYTES = b"PK\x03\x04" + b"\x00" * 20
# Minimal valid JPEG (SOI marker)
_JPEG_BYTES = b"\xff\xd8\xff\xe0" + b"\x00" * 20


# ── AI-SEC-01: OCR rejects non-image file ────────────────────────────────

@pytest.mark.asyncio
async def test_aisec01_ocr_rejects_non_image():
    """AI-SEC-01: POST /ai/ocr/parse-id with ZIP magic bytes → 400 unsupported."""
    with patch.object(settings, "ENV", "production"), \
         patch.object(settings, "INTERNAL_API_KEY", TEST_KEY):
        transport = ASGITransport(app=app)
        async with AsyncClient(transport=transport, base_url="http://test") as ac:
            response = await ac.post(
                "/ai/ocr/parse-id",
                files={"document": ("evil.jpg", _ZIP_BYTES, "image/jpeg")},
                data={"document_type": "drivers_license"},
                headers=_PROD_HEADERS,
            )

    assert response.status_code == 400
    assert "unsupported" in response.json()["detail"].lower()


# ── AI-SEC-04a: face match rejects non-image id_image ────────────────────

@pytest.mark.asyncio
async def test_aisec04_face_rejects_non_image_id():
    """AI-SEC-04: POST /ai/face/match with ZIP magic bytes as id_image → 400 unsupported."""
    with patch.object(settings, "ENV", "production"), \
         patch.object(settings, "INTERNAL_API_KEY", TEST_KEY):
        transport = ASGITransport(app=app)
        async with AsyncClient(transport=transport, base_url="http://test") as ac:
            response = await ac.post(
                "/ai/face/match",
                files={
                    "id_image": ("evil.jpg", _ZIP_BYTES, "image/jpeg"),
                    "selfie": ("selfie.jpg", _JPEG_BYTES, "image/jpeg"),
                },
                headers=_PROD_HEADERS,
            )

    assert response.status_code == 400
    assert "unsupported" in response.json()["detail"].lower()


# ── AI-SEC-04b: face match rejects non-image selfie ──────────────────────

@pytest.mark.asyncio
async def test_aisec04_face_rejects_non_image_selfie():
    """AI-SEC-04: POST /ai/face/match with ZIP magic bytes as selfie → 400 unsupported."""
    with patch.object(settings, "ENV", "production"), \
         patch.object(settings, "INTERNAL_API_KEY", TEST_KEY):
        transport = ASGITransport(app=app)
        async with AsyncClient(transport=transport, base_url="http://test") as ac:
            response = await ac.post(
                "/ai/face/match",
                files={
                    "id_image": ("id.jpg", _JPEG_BYTES, "image/jpeg"),
                    "selfie": ("evil.jpg", _ZIP_BYTES, "image/jpeg"),
                },
                headers=_PROD_HEADERS,
            )

    assert response.status_code == 400
    assert "unsupported" in response.json()["detail"].lower()


# ── PNG accepted by OCR ───────────────────────────────────────────────────

@pytest.mark.asyncio
async def test_mime_ocr_accepts_png():
    """MIME: OCR endpoint accepts PNG magic bytes."""
    _mock_ocr = {"status": "verified", "extractedName": "Jane Doe", "confidence": 0.9}
    _png = b"\x89PNG\r\n\x1a\n" + b"\x00" * 20
    with patch.object(settings, "ENV", "production"), \
         patch.object(settings, "INTERNAL_API_KEY", TEST_KEY), \
         patch("app.services.ocr_service.extract_id_data",
               new=AsyncMock(return_value=_mock_ocr)):
        transport = ASGITransport(app=app)
        async with AsyncClient(transport=transport, base_url="http://test") as ac:
            response = await ac.post(
                "/ai/ocr/parse-id",
                files={"document": ("id.png", _png, "image/png")},
                data={"document_type": "drivers_license"},
                headers=_PROD_HEADERS,
            )

    assert response.status_code == 200


# ── JPEG accepted by face match ───────────────────────────────────────────

@pytest.mark.asyncio
async def test_mime_face_accepts_jpeg():
    """MIME: Face-match endpoint accepts JPEG magic bytes for both images."""
    _mock_face = {
        "matched": True, "similarity": 92.0, "confidence": "high",
        "faceDetectedInId": True, "faceDetectedInSelfie": True,
        "checkedAt": "2026-05-04T00:00:00+00:00",
        "status": "verified", "rejectionReason": None,
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
                    "id_image": ("id.jpg", _JPEG_BYTES, "image/jpeg"),
                    "selfie": ("selfie.jpg", _JPEG_BYTES, "image/jpeg"),
                },
                headers=_PROD_HEADERS,
            )

    assert response.status_code == 200
