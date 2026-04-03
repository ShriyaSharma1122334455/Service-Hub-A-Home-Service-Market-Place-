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

logger = logging.getLogger(__name__)
router = APIRouter()


# ── Internal API key guard ────────────────────────────────────────────────

def verify_internal_key(x_internal_key: Optional[str] = Header(None)):
    """Only the Express backend should call these endpoints."""
    if settings.ENV == "development":
        return
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
    if not selfie_bytes:
        raise HTTPException(status_code=400, detail="Empty selfie uploaded")

    logger.info("Face match request — id_size=%d selfie_size=%d", len(id_bytes), len(selfie_bytes))

    result = await face_service.compare_faces(id_bytes, selfie_bytes)
    return result
