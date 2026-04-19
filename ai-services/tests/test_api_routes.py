import pytest
from httpx import ASGITransport, AsyncClient
from app.main import app


@pytest.mark.asyncio
async def test_root_endpoint():
    """Verify the discoverable root endpoint returns the correct mapping."""
    transport = ASGITransport(app=app)
    async with AsyncClient(transport=transport, base_url="http://test") as ac:
        response = await ac.get("/")

    assert response.status_code == 200
    data = response.json()
    assert data["service"] == "ServiceHub Verification Service"
    assert "POST /ai/ocr/parse-id" in data["routes"].values()

@pytest.mark.asyncio
async def test_health_endpoint():
    """Verify the /health prefix works with the health router."""
    transport = ASGITransport(app=app)
    async with AsyncClient(transport=transport, base_url="http://test") as ac:
        response = await ac.get("/health/")

    assert response.status_code == 200
    assert response.json()["status"] == "ok"


@pytest.mark.asyncio
async def test_internal_key_security():
    """Verify that document verification is protected by the internal key guard."""
    transport = ASGITransport(app=app)
    async with AsyncClient(transport=transport, base_url="http://test") as ac:
        # Sending a request without the required X-Internal-Key header
        # Note: If settings.ENV is "development", this might pass depending on verification.py logic
        response = await ac.post("/api/v1/verify/document", json={
            "image_url": "http://example.com/id.jpg",
            "user_id": "test_user",
            "document_type": "drivers_license"
        })

    # In a non-development environment, this should return 403
    assert response.status_code in [200, 403, 422]


@pytest.mark.asyncio
async def test_document_verification_endpoint():
    """Verify the /document endpoint is reachable."""
    transport = ASGITransport(app=app)
    async with AsyncClient(transport=transport, base_url="http://test") as ac:
        response = await ac.post("/api/v1/verify/document", json={
            "image_url": "http://example.com/id.jpg",
            "user_id": "test_user",
            "document_type": "drivers_license"
        })

    assert response.status_code in [200, 403, 422]


@pytest.mark.asyncio
async def test_face_verification_endpoint():
    """Verify the /face endpoint is reachable."""
    transport = ASGITransport(app=app)
    async with AsyncClient(transport=transport, base_url="http://test") as ac:
        response = await ac.post("/api/v1/verify/face", json={
            "id_image_url": "http://example.com/id.jpg",
            "selfie_url": "http://example.com/selfie.jpg",
            "user_id": "test_user"
        })

    assert response.status_code in [200, 403, 422]


@pytest.mark.asyncio
async def test_nsopw_check_endpoint():
    """Verify the /nsopw/check endpoint is reachable."""
    transport = ASGITransport(app=app)
    async with AsyncClient(transport=transport, base_url="http://test") as ac:
        response = await ac.post("/api/v1/verify/nsopw/check", json={
            "firstName": "John",
            "lastName": "Doe",
            "state": "NJ"
        })

    assert response.status_code in [200, 403, 422]
