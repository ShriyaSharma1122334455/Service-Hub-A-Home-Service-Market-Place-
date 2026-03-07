"""
Profile Routes
==============
Endpoints for profile validation and avatar uploads.

  PUT  /api/v1/profile/{user_id}         →  Validate & return sanitised profile
  POST /api/v1/profile/{user_id}/avatar  →  Upload image to Cloudinary
"""

import logging
from typing import Optional

from fastapi import APIRouter, HTTPException, Header, Depends, UploadFile, File

from app.core.config import settings
from app.models.schemas import (
    ProfileUpdateRequest,
    ProfileUpdateResponse,
    ImageUploadResponse,
)
from app.services import image_service

logger = logging.getLogger(__name__)
router = APIRouter()


# ── Internal API key guard (same pattern as verification.py) ──────────────

def verify_internal_key(x_internal_key: Optional[str] = Header(None)):
    """Only the Express backend should call these endpoints."""
    if settings.ENV == "development":
        return
    if x_internal_key != settings.INTERNAL_API_KEY:
        raise HTTPException(status_code=403, detail="Forbidden: invalid internal API key")


# ── PUT /api/v1/profile/{user_id} ────────────────────────────────────────

@router.put(
    "/{user_id}",
    response_model=ProfileUpdateResponse,
    summary="Validate profile fields",
    description="Validates profile data (name, email, phone, bio) and returns sanitised values.",
)
async def update_profile(
    user_id: str,
    body: ProfileUpdateRequest,
    _: None = Depends(verify_internal_key),
):
    """
    Called from Express when a user submits the profile-edit form.
    Pydantic does the heavy lifting — if the request reaches this point
    the data has already passed validation.
    """
    logger.info("Profile update — user=%s", user_id)

    return ProfileUpdateResponse(
        message="Profile validated successfully",
        full_name=body.full_name,
        email=body.email,
        phone=body.phone,
        bio=body.bio,
        avatar_url=None,  # avatar is updated via the /avatar endpoint
    )


# ── POST /api/v1/profile/{user_id}/avatar ────────────────────────────────

@router.post(
    "/{user_id}/avatar",
    response_model=ImageUploadResponse,
    summary="Upload profile avatar",
    description="Uploads an image to Cloudinary and returns the secure URL.",
)
async def upload_avatar(
    user_id: str,
    file: UploadFile = File(..., description="Profile image (JPEG, PNG, or WebP — max 5 MB)"),
    _: None = Depends(verify_internal_key),
):
    """
    Accepts a multipart file upload, validates type/size,
    uploads to Cloudinary, and returns the secure_url + public_id.
    """
    logger.info("Avatar upload — user=%s filename=%s", user_id, file.filename)

    result = await image_service.upload_profile_image(file, user_id)

    return ImageUploadResponse(
        message="Avatar uploaded successfully",
        secure_url=result["secure_url"],
        public_id=result["public_id"],
    )
