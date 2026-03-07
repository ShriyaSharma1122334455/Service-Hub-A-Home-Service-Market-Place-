"""
Face Matching Service
=====================
Compares a live selfie to the face on the uploaded ID document.

Sprint 1 research notes
-----------------------
| Option               | Cost          | Accuracy | Setup   |
|----------------------|---------------|----------|---------|
| AWS Rekognition      | $0.001/call   | 99%+     | Low     |
| Google Vision        | N/A           | No match API | —   |
| DeepFace (local)     | Free          | High     | High    |
| face_recognition lib | Free          | Good     | Medium  |

Decision: AWS Rekognition. Free 5 000 calls/month (12 months), no GPU needed,
single API call with built-in confidence score. DeepFace is a good Sprint 5/6
self-hosted stretch goal if AWS costs become a concern after free tier.

Fallback: if Rekognition is unavailable → MANUAL_REVIEW (don't hard-block user).
"""

import logging
from typing import Optional

import httpx
import boto3
from botocore.exceptions import BotoCoreError, ClientError

from app.core.config import settings
from app.models.schemas import FaceMatchResponse, VerificationStatus

logger = logging.getLogger(__name__)


# ── Client factory ────────────────────────────────────────────────────────

def _get_rekognition_client():
    return boto3.client(
        "rekognition",
        region_name=settings.AWS_REGION,
        aws_access_key_id=settings.AWS_ACCESS_KEY_ID,
        aws_secret_access_key=settings.AWS_SECRET_ACCESS_KEY,
    )


# ── Helpers ───────────────────────────────────────────────────────────────

async def _download_image(url: str) -> Optional[bytes]:
    try:
        async with httpx.AsyncClient(timeout=15.0) as client:
            resp = await client.get(url)
            resp.raise_for_status()
            return resp.content
    except httpx.HTTPError as exc:
        logger.error("Image download failed (%s): %s", url, exc)
        return None


# ── Public API ────────────────────────────────────────────────────────────

async def compare_faces(
    id_image_url: str,
    selfie_url: str,
) -> FaceMatchResponse:
    """
    Compare the face on the ID document with the live selfie.
    Returns a FaceMatchResponse with similarity score and pass/fail.
    """
    threshold   = settings.FACE_MATCH_THRESHOLD
    id_bytes    = await _download_image(id_image_url)
    selfie_bytes = await _download_image(selfie_url)

    # Can't proceed if either image failed to download
    if not id_bytes or not selfie_bytes:
        return FaceMatchResponse(
            status=VerificationStatus.REJECTED,
            similarity_score=0.0,
            threshold_used=threshold,
            is_match=False,
            rejection_reason="Could not retrieve one or both images from Cloudinary.",
        )

    # Call AWS Rekognition CompareFaces
    try:
        client   = _get_rekognition_client()
        response = client.compare_faces(
            SourceImage={"Bytes": id_bytes},       # Reference: ID photo
            TargetImage={"Bytes": selfie_bytes},   # Target: live selfie
            SimilarityThreshold=0.0,               # Return all; we apply our own threshold
        )
    except (BotoCoreError, ClientError) as exc:
        logger.error("Rekognition error: %s", exc)
        return FaceMatchResponse(
            status=VerificationStatus.MANUAL_REVIEW,
            similarity_score=0.0,
            threshold_used=threshold,
            is_match=False,
            rejection_reason="Face matching service temporarily unavailable. Manual review required.",
        )

    face_matches = response.get("FaceMatches", [])
    unmatched    = response.get("UnmatchedFaces", [])

    # No face detected in selfie at all
    if not face_matches and not unmatched:
        return FaceMatchResponse(
            status=VerificationStatus.REJECTED,
            similarity_score=0.0,
            threshold_used=threshold,
            is_match=False,
            rejection_reason="No face detected in the selfie. Please retake in good lighting.",
            face_detected_in_selfie=False,
            face_detected_in_id=True,
        )

    # Face found in selfie but doesn't match ID
    if not face_matches:
        return FaceMatchResponse(
            status=VerificationStatus.REJECTED,
            similarity_score=0.0,
            threshold_used=threshold,
            is_match=False,
            rejection_reason="Selfie does not match the face on the ID document.",
            face_detected_in_selfie=True,
            face_detected_in_id=True,
        )

    # Take the best (highest-similarity) match
    best  = max(face_matches, key=lambda m: m["Similarity"])
    score = round(best["Similarity"], 2)
    match = score >= threshold

    return FaceMatchResponse(
        status=VerificationStatus.VERIFIED if match else VerificationStatus.REJECTED,
        similarity_score=score,
        threshold_used=threshold,
        is_match=match,
        rejection_reason=None if match else (
            f"Face similarity ({score:.1f}%) is below the required threshold ({threshold:.0f}%). "
            "Please ensure your selfie is clear, well-lit, and your full face is visible."
        ),
        face_detected_in_selfie=True,
        face_detected_in_id=True,
    )
