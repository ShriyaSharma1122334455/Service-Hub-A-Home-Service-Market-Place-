"""
Face Matching Routes
====================
POST /ai/face/match  →  Compare selfie with ID document face

Called by the Express backend after the user captures their selfie.
The backend sends two image buffers as multipart form data.
"""

import logging
from typing import Optional

from fastapi import APIRouter, HTTPException, Header, Depends, UploadFile, File

from app.core.config import settings
from app.services import face_service
from app.utils.file_validation import validate_image_mime

logger = logging.getLogger(__name__)
router = APIRouter()


# ── Internal API key guard ────────────────────────────────────────────────

def verify_internal_key(x_internal_key: Optional[str] = Header(None)):
    """Only the Express backend should call these endpoints."""
    if settings.ENV == "development":
        logger.warning("internal key bypass active", extra={"route": "face"})
        return
    if settings.ENV != "production":
        logger.error(
            "Unrecognised ENV=%r — internal key check enforced", settings.ENV
        )
    if x_internal_key != settings.INTERNAL_API_KEY:
        raise HTTPException(status_code=403, detail="Forbidden: invalid internal API key")


# ── POST /match  (mounted at /ai/face → full path: /ai/face/match) ───────

@router.post(
    "/match",
    summary="Face matching (selfie vs ID)",
    description="Compares a selfie image with the photo on the ID document using AWS Rekognition.",
)
async def match_face(
    id_image: UploadFile = File(..., description="ID document image containing reference face"),
    selfie: UploadFile = File(..., description="Live selfie image"),
    _: None = Depends(verify_internal_key),
):
    """
    Accepts two image buffers via multipart form data.
    Uses AWS Rekognition CompareFaces with 90% similarity threshold.
    """
    id_bytes = await id_image.read()
    selfie_bytes = await selfie.read()

    if not id_bytes:
        raise HTTPException(status_code=400, detail="Empty ID image uploaded")
    try:
        validate_image_mime(id_bytes)
    except ValueError as exc:
        raise HTTPException(status_code=400, detail=str(exc))

    if not selfie_bytes:
        raise HTTPException(status_code=400, detail="Empty selfie uploaded")
    try:
        validate_image_mime(selfie_bytes)
    except ValueError as exc:
        raise HTTPException(status_code=400, detail=str(exc))

    logger.info("Face match request — id_size=%d selfie_size=%d", len(id_bytes), len(selfie_bytes))

    result = await face_service.compare_faces(id_bytes, selfie_bytes)
    return result
