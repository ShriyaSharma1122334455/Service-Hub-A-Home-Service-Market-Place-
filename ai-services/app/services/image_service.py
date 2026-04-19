"""
Image Service
=============
Handles profile-image uploads to Cloudinary.

Uses the same credentials already configured in core/config.py
(CLOUDINARY_CLOUD_NAME, CLOUDINARY_API_KEY, CLOUDINARY_API_SECRET).
"""

import logging
from fastapi import UploadFile, HTTPException

import cloudinary
import cloudinary.uploader

from app.core.config import settings

logger = logging.getLogger(__name__)

# ── Allowed file constraints ─────────────────────────────────────────────
ALLOWED_CONTENT_TYPES = {"image/jpeg", "image/png", "image/webp"}
MAX_FILE_SIZE_MB = 5
MAX_FILE_SIZE_BYTES = MAX_FILE_SIZE_MB * 1024 * 1024


# ── Configure Cloudinary (once on import) ─────────────────────────────────
cloudinary.config(
    cloud_name=settings.CLOUDINARY_CLOUD_NAME,
    api_key=settings.CLOUDINARY_API_KEY,
    api_secret=settings.CLOUDINARY_API_SECRET,
    secure=True,
)


# ── Public API ────────────────────────────────────────────────────────────

async def upload_profile_image(file: UploadFile, user_id: str) -> dict:
    """
    Validate and upload a profile image to Cloudinary.

    Returns:
        dict with ``secure_url`` and ``public_id``.

    Raises:
        HTTPException 400 — bad file type or size exceeded.
        HTTPException 500 — Cloudinary upload failure.
    """

    # 1. Validate content type
    if file.content_type not in ALLOWED_CONTENT_TYPES:
        raise HTTPException(
            status_code=400,
            detail=f"Invalid file type '{file.content_type}'. Allowed: JPEG, PNG, WebP.",
        )

    # 2. Read + validate size
    contents = await file.read()
    if len(contents) > MAX_FILE_SIZE_BYTES:
        raise HTTPException(
            status_code=400,
            detail=f"File size exceeds the {MAX_FILE_SIZE_MB} MB limit.",
        )

    # 3. Upload to Cloudinary
    try:
        result = cloudinary.uploader.upload(
            contents,
            folder="servicehub/avatars",
            public_id=user_id,
            overwrite=True,
            resource_type="image",
            transformation=[
                {"width": 400, "height": 400, "crop": "fill", "gravity": "face"},
                {"quality": "auto", "fetch_format": "auto"},
            ],
        )
        logger.info("Cloudinary upload OK — public_id=%s", result["public_id"])
        return {
            "secure_url": result["secure_url"],
            "public_id": result["public_id"],
        }

    except Exception as exc:
        logger.error("Cloudinary upload failed: %s", exc)
        raise HTTPException(
            status_code=500,
            detail="Image upload failed. Please try again later.",
        )
