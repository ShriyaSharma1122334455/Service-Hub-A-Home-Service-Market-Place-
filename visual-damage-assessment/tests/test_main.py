"""
Tests for main.py — the FastAPI VDA service.

All tests use the synchronous TestClient (no real Groq calls are made).
assess_image is patched wherever the endpoint logic would invoke it.
"""

from unittest.mock import patch

import pytest

import main as main_module

GOOD_RESULT = {
    "assessment": "Minor surface cracks visible along the lower wall.",
    "recommendation": "Sand, fill, and repaint the affected area.",
    "estimated_cost_usd": "$200-$400",
    "confidence_score": "87%",
}


# ═════════════════════════════════════════════════════════════════════════
# 1. Informational endpoints
# ═════════════════════════════════════════════════════════════════════════

class TestInfoEndpoints:
    def test_root_returns_200_with_endpoint_list(self, client):
        res = client.get("/")
        assert res.status_code == 200
        body = res.json()
        assert "endpoints" in body
        assert "/assess" in body["endpoints"].values()

    def test_health_returns_healthy(self, client):
        res = client.get("/health")
        assert res.status_code == 200
        assert res.json()["status"] == "healthy"


# ═════════════════════════════════════════════════════════════════════════
# 2. Authentication
# ═════════════════════════════════════════════════════════════════════════

class TestAuthentication:
    def test_missing_token_returns_401(self, client, jpeg_bytes):
        res = client.post(
            "/assess",
            files={"image": ("img.jpg", jpeg_bytes, "image/jpeg")},
        )
        assert res.status_code == 401

    def test_wrong_token_returns_401(self, client, jpeg_bytes):
        res = client.post(
            "/assess",
            files={"image": ("img.jpg", jpeg_bytes, "image/jpeg")},
            headers={"X-Service-Token": "wrong-token"},
        )
        assert res.status_code == 401

    def test_correct_token_passes_auth_guard(self, client, auth_headers, jpeg_bytes):
        with patch("main.assess_image", return_value=GOOD_RESULT):
            res = client.post(
                "/assess",
                files={"image": ("img.jpg", jpeg_bytes, "image/jpeg")},
                headers=auth_headers,
            )
        assert res.status_code == 200


# ═════════════════════════════════════════════════════════════════════════
# 3. File validation
# ═════════════════════════════════════════════════════════════════════════

class TestFileValidation:
    def test_unsupported_mime_type_returns_400(self, client, auth_headers):
        res = client.post(
            "/assess",
            files={"image": ("file.gif", b"GIF89a\x01\x00\x01\x00", "image/gif")},
            headers=auth_headers,
        )
        assert res.status_code == 400

    def test_oversized_file_returns_400(self, client, auth_headers, jpeg_bytes, monkeypatch):
        # Patch the size limit to 5 bytes so any real image triggers it.
        monkeypatch.setattr(main_module, "_MAX_IMAGE_BYTES", 5)
        res = client.post(
            "/assess",
            files={"image": ("img.jpg", jpeg_bytes, "image/jpeg")},
            headers=auth_headers,
        )
        assert res.status_code == 400

    def test_content_mismatch_returns_400(self, client, auth_headers):
        # Send random bytes declared as JPEG — magic byte check should reject it.
        res = client.post(
            "/assess",
            files={"image": ("img.jpg", b"\x00\x01\x02\x03\x04\x05", "image/jpeg")},
            headers=auth_headers,
        )
        assert res.status_code == 400

    def test_task_too_long_returns_422(self, client, auth_headers, jpeg_bytes):
        with patch("main.assess_image", return_value=GOOD_RESULT):
            res = client.post(
                "/assess",
                files={"image": ("img.jpg", jpeg_bytes, "image/jpeg")},
                data={"task": "x" * 600},
                headers=auth_headers,
            )
        # FastAPI enforces max_length via 422 Unprocessable Entity
        assert res.status_code == 422

    def test_png_image_accepted(self, client, auth_headers, png_bytes):
        with patch("main.assess_image", return_value=GOOD_RESULT):
            res = client.post(
                "/assess",
                files={"image": ("img.png", png_bytes, "image/png")},
                headers=auth_headers,
            )
        assert res.status_code == 200


# ═════════════════════════════════════════════════════════════════════════
# 4. Groq / model failures
# ═════════════════════════════════════════════════════════════════════════

class TestModelFailures:
    def test_missing_groq_key_returns_503(self, client, auth_headers, jpeg_bytes):
        with patch("main.assess_image", side_effect=ValueError("GROQ_API_KEY is not set")):
            res = client.post(
                "/assess",
                files={"image": ("img.jpg", jpeg_bytes, "image/jpeg")},
                headers=auth_headers,
            )
        assert res.status_code == 503

    def test_model_returns_none_gives_500(self, client, auth_headers, jpeg_bytes):
        with patch("main.assess_image", return_value=None):
            res = client.post(
                "/assess",
                files={"image": ("img.jpg", jpeg_bytes, "image/jpeg")},
                headers=auth_headers,
            )
        assert res.status_code == 500

    def test_unexpected_error_returns_500(self, client, auth_headers, jpeg_bytes):
        with patch("main.assess_image", side_effect=RuntimeError("boom")):
            res = client.post(
                "/assess",
                files={"image": ("img.jpg", jpeg_bytes, "image/jpeg")},
                headers=auth_headers,
            )
        assert res.status_code == 500


# ═════════════════════════════════════════════════════════════════════════
# 5. Successful assessment
# ═════════════════════════════════════════════════════════════════════════

class TestSuccessfulAssessment:
    def test_response_matches_assessment_schema(self, client, auth_headers, jpeg_bytes):
        with patch("main.assess_image", return_value=GOOD_RESULT):
            res = client.post(
                "/assess",
                files={"image": ("img.jpg", jpeg_bytes, "image/jpeg")},
                data={"task": "Check the wall for cracks"},
                headers=auth_headers,
            )
        assert res.status_code == 200
        body = res.json()
        assert body["assessment"] == GOOD_RESULT["assessment"]
        assert body["recommendation"] == GOOD_RESULT["recommendation"]
        assert body["estimated_cost_usd"] == GOOD_RESULT["estimated_cost_usd"]
        assert body["confidence_score"] == GOOD_RESULT["confidence_score"]

    def test_default_task_used_when_not_provided(self, client, auth_headers, jpeg_bytes):
        with patch("main.assess_image", return_value=GOOD_RESULT) as mock_assess:
            res = client.post(
                "/assess",
                files={"image": ("img.jpg", jpeg_bytes, "image/jpeg")},
                headers=auth_headers,
            )
        assert res.status_code == 200
        # The default task string should have been passed through
        called_goal = mock_assess.call_args[0][2]
        assert isinstance(called_goal, str) and len(called_goal) > 0
