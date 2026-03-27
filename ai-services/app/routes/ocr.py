"""
OCR Parse Route
================
Dedicated endpoint for ID document OCR parsing with normalized output.

  POST /ai/ocr/parse-id  →  Download image, run Vision OCR, parse fields

Supports both passports (MRZ TD3) and US driver's licenses (AAMVA regex).
Called by the Express backend after Cloudinary uploads complete.
"""

import logging
from typing import Optional

from fastapi import APIRouter, Depends, Header, HTTPException

from app.core.config import settings
from app.models.schemas import OcrParseRequest, OcrParseResponse
from app.services import ocr_service

logger = logging.getLogger(__name__)
router = APIRouter()


# ── Internal API key guard (same pattern as verification.py) ──────────────

def verify_internal_key(x_internal_key: Optional[str] = Header(None)):
    """Only the Express backend should call these endpoints."""
    if settings.ENV == "development":
        return
    if x_internal_key != settings.INTERNAL_API_KEY:
        raise HTTPException(status_code=403, detail="Forbidden: invalid internal API key")


# ── POST /ai/ocr/parse-id ────────────────────────────────────────────────

@router.post(
    "/parse-id",
    response_model=OcrParseResponse,
    summary="OCR ID document parsing",
    description="Downloads image, runs Google Vision OCR, and returns "
                "normalized extracted fields for passports (MRZ) or "
                "driver's licenses (regex).",
)
async def parse_id(
    body: OcrParseRequest,
    _: None = Depends(verify_internal_key),
):
    """
    Called from Express after the user uploads their ID to Cloudinary.
    Dispatches to MRZ parser for passports or regex parser for DLs.
    """
    logger.info("OCR parse-id — doc_type=%s", body.document_type)
    return await ocr_service.parse_id_document(
        image_url=body.image_url,
        document_type=body.document_type,
    )
