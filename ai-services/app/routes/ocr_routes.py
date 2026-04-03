"""
OCR Routes
==========
POST /ai/ocr/parse-id  →  Extract structured data from ID document via OCR

Called by the Express backend after the user uploads their ID.
The backend sends the raw file bytes + document_type as multipart form data.
"""

import logging
from typing import Optional

from fastapi import APIRouter, HTTPException, Header, Depends, UploadFile, File, Form

from app.core.config import settings
from app.services import ocr_service

logger = logging.getLogger(__name__)
router = APIRouter()


# ── Internal API key guard ────────────────────────────────────────────────

def verify_internal_key(x_internal_key: Optional[str] = Header(None)):
    """Only the Express backend should call these endpoints."""
    if settings.ENV == "development":
        return
    if x_internal_key != settings.INTERNAL_API_KEY:
        raise HTTPException(status_code=403, detail="Forbidden: invalid internal API key")


# ── POST /parse-id  (mounted at /ai/ocr → full path: /ai/ocr/parse-id) ──

@router.post(
    "/parse-id",
    summary="OCR ID extraction",
    description="Extracts structured data from an ID document (passport or driver's license) using Google Cloud Vision OCR.",
)
async def parse_id(
    document: UploadFile = File(..., description="ID document image (JPEG/PNG/WebP)"),
    document_type: str = Form("drivers_license", description="passport or drivers_license"),
    _: None = Depends(verify_internal_key),
):
    """
    Accepts raw file bytes + document_type via multipart form data.
    Runs Google Vision OCR and returns structured fields + verification status.
    """
    if document_type not in ("passport", "drivers_license"):
        raise HTTPException(status_code=400, detail="document_type must be 'passport' or 'drivers_license'")

    image_bytes = await document.read()
    if not image_bytes:
        raise HTTPException(status_code=400, detail="Empty file uploaded")

    if len(image_bytes) > 5 * 1024 * 1024:
        raise HTTPException(status_code=400, detail="File too large. Maximum 5MB.")

    logger.info("OCR parse-id request — doc_type=%s size=%d bytes", document_type, len(image_bytes))

    result = await ocr_service.extract_id_data(image_bytes, document_type)
    return result
