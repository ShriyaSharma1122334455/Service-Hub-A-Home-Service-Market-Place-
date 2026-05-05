"""
Chunk 2 tests — AI-CRIT-02
Face match threshold reads from settings, not hardcoded constant.
Tests: FACE-UT-01, FACE-UT-02, FACE-UT-03
"""
from unittest.mock import MagicMock, patch

import pytest

from app.core.config import settings
from app.services.face_service import compare_faces


def _rekognition_mock(similarity: float):
    """Return a mock Rekognition client that reports the given similarity score."""
    mock_client = MagicMock()
    mock_client.compare_faces.return_value = {
        "FaceMatches": [{"Similarity": similarity}],
        "UnmatchedFaces": [],
    }
    return mock_client


# ── FACE-UT-01: high similarity → matched=True, status=verified ──────────

@pytest.mark.asyncio
async def test_face_ut01_high_similarity_verified():
    """FACE-UT-01: Rekognition returns 95% similarity → matched=True, status='verified'."""
    with patch("app.services.face_service.boto3.client", return_value=_rekognition_mock(95.0)), \
         patch.object(settings, "FACE_MATCH_THRESHOLD", 90.0):
        result = await compare_faces(b"id-bytes", b"selfie-bytes")

    assert result["matched"] is True
    assert result["status"] == "verified"
    assert result["similarity"] == 95.0


# ── FACE-UT-02: low similarity → matched=False, status=rejected ──────────

@pytest.mark.asyncio
async def test_face_ut02_low_similarity_rejected():
    """FACE-UT-02: Rekognition returns 75% similarity → matched=False, status='rejected'."""
    with patch("app.services.face_service.boto3.client", return_value=_rekognition_mock(75.0)), \
         patch.object(settings, "FACE_MATCH_THRESHOLD", 90.0):
        result = await compare_faces(b"id-bytes", b"selfie-bytes")

    assert result["matched"] is False
    assert result["status"] == "rejected"
    assert result["similarity"] == 75.0


# ── FACE-UT-03: threshold is read from settings at call time ─────────────

@pytest.mark.asyncio
async def test_face_ut03_threshold_from_settings():
    """FACE-UT-03: FACE_MATCH_THRESHOLD=80 makes 85% a match (would fail at the old 90)."""
    with patch("app.services.face_service.boto3.client", return_value=_rekognition_mock(85.0)), \
         patch.object(settings, "FACE_MATCH_THRESHOLD", 80.0):
        result = await compare_faces(b"id-bytes", b"selfie-bytes")

    assert result["matched"] is True, (
        "With threshold=80 and similarity=85, matched should be True. "
        "Failure means face_service.py is ignoring settings.FACE_MATCH_THRESHOLD."
    )
    assert result["status"] == "verified"
