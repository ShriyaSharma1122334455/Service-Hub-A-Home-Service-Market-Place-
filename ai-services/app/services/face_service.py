"""
Face Matching Service
=====================
Compares a live selfie to the face on the uploaded ID document using
AWS Rekognition CompareFaces with a 90% similarity threshold.

Returns:
    matched:              bool
    similarity:           float (0-100)
    confidence:           "high" | "medium" | "low"  (based on 90/75 thresholds)
    faceDetectedInId:     bool
    faceDetectedInSelfie: bool
    checkedAt:            ISO timestamp

Error handling:
    InvalidParameterException → no face detected
    ImageTooLargeException    → compression retry via Pillow
    ThrottlingException       → return pending status

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

Fallback: if Rekognition is unavailable → pending status (don't hard-block user).
"""

import io
import logging
from datetime import datetime, timezone
from typing import Dict, Any

import boto3
from botocore.exceptions import BotoCoreError, ClientError

from app.core.config import settings

logger = logging.getLogger(__name__)

# Similarity threshold for face match
FACE_MATCH_THRESHOLD = 90.0

# Confidence level thresholds
CONFIDENCE_HIGH_THRESHOLD = 90.0
CONFIDENCE_MEDIUM_THRESHOLD = 75.0

# Max image size for Rekognition (5 MB)
MAX_IMAGE_BYTES = 5 * 1024 * 1024


# ── Client factory ────────────────────────────────────────────────────────

def _get_rekognition_client():
    return boto3.client(
        "rekognition",
        region_name=settings.AWS_REGION,
        aws_access_key_id=settings.AWS_ACCESS_KEY_ID,
        aws_secret_access_key=settings.AWS_SECRET_ACCESS_KEY,
    )


# ── Image compression ────────────────────────────────────────────────────

def _compress_image(image_bytes: bytes, max_bytes: int = MAX_IMAGE_BYTES) -> bytes:
    """
    Compress image using Pillow if it exceeds max_bytes.
    Reduces quality iteratively until under the limit.
    """
    try:
        from PIL import Image

        if len(image_bytes) <= max_bytes:
            return image_bytes

        img = Image.open(io.BytesIO(image_bytes))

        # Convert RGBA to RGB if needed
        if img.mode in ("RGBA", "P"):
            img = img.convert("RGB")

        # Try reducing quality
        for quality in (85, 70, 55, 40):
            buffer = io.BytesIO()
            img.save(buffer, format="JPEG", quality=quality, optimize=True)
            compressed = buffer.getvalue()
            if len(compressed) <= max_bytes:
                logger.info(
                    "Compressed image from %d to %d bytes (quality=%d)",
                    len(image_bytes), len(compressed), quality,
                )
                return compressed

        # Last resort: resize
        ratio = (max_bytes / len(image_bytes)) ** 0.5
        new_size = (int(img.width * ratio), int(img.height * ratio))
        img = img.resize(new_size, Image.LANCZOS)
        buffer = io.BytesIO()
        img.save(buffer, format="JPEG", quality=50, optimize=True)
        compressed = buffer.getvalue()
        logger.info("Resized image from %d to %d bytes", len(image_bytes), len(compressed))
        return compressed

    except ImportError:
        logger.warning("Pillow not installed — cannot compress image")
        return image_bytes
    except Exception as exc:
        logger.warning("Image compression failed: %s", exc)
        return image_bytes


# ── Confidence level helper ───────────────────────────────────────────────

def _get_confidence_level(similarity: float) -> str:
    """Return 'high', 'medium', or 'low' based on similarity score."""
    if similarity >= CONFIDENCE_HIGH_THRESHOLD:
        return "high"
    elif similarity >= CONFIDENCE_MEDIUM_THRESHOLD:
        return "medium"
    else:
        return "low"


# ── Public API ────────────────────────────────────────────────────────────

async def compare_faces(
    id_image_bytes: bytes,
    selfie_bytes: bytes,
) -> Dict[str, Any]:
    """
    Compare the face on the ID document with the live selfie.

    Accepts two raw image buffers directly (no URL download needed).
    Returns a dict with: matched, similarity, confidence, faceDetectedInId,
    faceDetectedInSelfie, checkedAt.
    """
    checked_at = datetime.now(timezone.utc).isoformat()

    if not id_image_bytes or not selfie_bytes:
        return {
            "matched": False,
            "similarity": 0.0,
            "confidence": "low",
            "faceDetectedInId": False,
            "faceDetectedInSelfie": False,
            "checkedAt": checked_at,
            "status": "rejected",
            "rejectionReason": "One or both images are empty.",
        }

    # Call AWS Rekognition CompareFaces
    try:
        client = _get_rekognition_client()
        response = client.compare_faces(
            SourceImage={"Bytes": id_image_bytes},
            TargetImage={"Bytes": selfie_bytes},
            SimilarityThreshold=0.0,  # Return all matches; we apply our own threshold
        )
    except ClientError as exc:
        error_code = exc.response.get("Error", {}).get("Code", "")

        # No face detected in one of the images
        if error_code == "InvalidParameterException":
            error_msg = str(exc)
            face_in_id = "source" not in error_msg.lower()
            face_in_selfie = "target" not in error_msg.lower()
            logger.warning("Rekognition InvalidParameterException: %s", error_code)
            return {
                "matched": False,
                "similarity": 0.0,
                "confidence": "low",
                "faceDetectedInId": face_in_id,
                "faceDetectedInSelfie": face_in_selfie,
                "checkedAt": checked_at,
                "status": "rejected",
                "rejectionReason": "No face detected in one or both images. Please retake in good lighting.",
            }

        # Image too large — try compression and retry
        if error_code == "ImageTooLargeException":
            logger.warning("Rekognition ImageTooLargeException — attempting compression retry")
            try:
                compressed_id = _compress_image(id_image_bytes)
                compressed_selfie = _compress_image(selfie_bytes)

                response = client.compare_faces(
                    SourceImage={"Bytes": compressed_id},
                    TargetImage={"Bytes": compressed_selfie},
                    SimilarityThreshold=0.0,
                )
            except (BotoCoreError, ClientError) as retry_exc:
                logger.error("Rekognition retry after compression failed: %s", retry_exc)
                return {
                    "matched": False,
                    "similarity": 0.0,
                    "confidence": "low",
                    "faceDetectedInId": True,
                    "faceDetectedInSelfie": True,
                    "checkedAt": checked_at,
                    "status": "pending",
                    "rejectionReason": "Image too large even after compression. Please upload smaller images.",
                }

        # Throttling — return pending
        elif error_code == "ThrottlingException":
            logger.warning("Rekognition ThrottlingException — returning pending status")
            return {
                "matched": False,
                "similarity": 0.0,
                "confidence": "low",
                "faceDetectedInId": True,
                "faceDetectedInSelfie": True,
                "checkedAt": checked_at,
                "status": "pending",
                "rejectionReason": "Face matching service is temporarily rate-limited. Please try again shortly.",
            }

        else:
            logger.error("Rekognition error: %s", exc)
            return {
                "matched": False,
                "similarity": 0.0,
                "confidence": "low",
                "faceDetectedInId": True,
                "faceDetectedInSelfie": True,
                "checkedAt": checked_at,
                "status": "pending",
                "rejectionReason": "Face matching service temporarily unavailable.",
            }

    except (BotoCoreError, Exception) as exc:
        logger.error("Rekognition error: %s", exc)
        return {
            "matched": False,
            "similarity": 0.0,
            "confidence": "low",
            "faceDetectedInId": True,
            "faceDetectedInSelfie": True,
            "checkedAt": checked_at,
            "status": "pending",
            "rejectionReason": "Face matching service temporarily unavailable.",
        }

    face_matches = response.get("FaceMatches", [])
    unmatched = response.get("UnmatchedFaces", [])

    # No face detected in selfie at all
    if not face_matches and not unmatched:
        return {
            "matched": False,
            "similarity": 0.0,
            "confidence": "low",
            "faceDetectedInId": True,
            "faceDetectedInSelfie": False,
            "checkedAt": checked_at,
            "status": "rejected",
            "rejectionReason": "No face detected in the selfie. Please retake in good lighting.",
        }

    # Face found in selfie but doesn't match ID
    if not face_matches:
        return {
            "matched": False,
            "similarity": 0.0,
            "confidence": "low",
            "faceDetectedInId": True,
            "faceDetectedInSelfie": True,
            "checkedAt": checked_at,
            "status": "rejected",
            "rejectionReason": "Selfie does not match the face on the ID document.",
        }

    # Take the best (highest-similarity) match
    best = max(face_matches, key=lambda m: m["Similarity"])
    score = round(best["Similarity"], 2)
    is_match = score >= FACE_MATCH_THRESHOLD
    confidence_level = _get_confidence_level(score)

    return {
        "matched": is_match,
        "similarity": score,
        "confidence": confidence_level,
        "faceDetectedInId": True,
        "faceDetectedInSelfie": True,
        "checkedAt": checked_at,
        "status": "verified" if is_match else "rejected",
        "rejectionReason": None if is_match else (
            f"Face similarity ({score:.1f}%) is below the required threshold ({FACE_MATCH_THRESHOLD:.0f}%). "
            "Please ensure your selfie is clear, well-lit, and your full face is visible."
        ),
    }
