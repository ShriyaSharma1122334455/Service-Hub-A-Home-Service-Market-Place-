"""
Verification Routes
====================
Matches the API contract from the project proposal Section 8.10:

  POST /ai/verify/document  →  OCR ID extraction
  POST /ai/verify/face      →  Face matching (selfie vs ID)
  POST /ai/verify/nsopw     →  NSOPW background check (providers only)

Called by the Express backend after Cloudinary uploads complete.
"""

import logging
from typing import Optional

from fastapi import APIRouter, HTTPException, Header, Depends

from app.core.config import settings
from app.models.schemas import (
    DocumentVerifyRequest, DocumentVerifyResponse,
    FaceMatchRequest,      FaceMatchResponse,
    NSopwCheckRequest,     NSopwCheckResponse,
    VerificationStatus,
)
from app.services import ocr_service, face_service, nsopw_service

logger = logging.getLogger(__name__)
router = APIRouter()


# ── Internal API key guard ────────────────────────────────────────────────

def verify_internal_key(x_internal_key: Optional[str] = Header(None)):
    """Only the Express backend should call these endpoints."""
    if settings.ENV == "development":
        return  # Skip in local dev
    if x_internal_key != settings.INTERNAL_API_KEY:
        raise HTTPException(status_code=403, detail="Forbidden: invalid internal API key")


# ── POST /ai/verify/document ──────────────────────────────────────────────

@router.post(
    "/document",
    response_model=DocumentVerifyResponse,
    summary="OCR ID extraction",
    description="Extracts data from an ID document using OCR. Validates expiration and extracted fields.",
)
async def verify_document(
    body: DocumentVerifyRequest,
    _: None = Depends(verify_internal_key),
):
    """
    Called from Express after the user uploads their ID to Cloudinary.
    Runs Google Vision OCR and returns structured fields + verification status.
    """
    logger.info("OCR request — user=%s doc_type=%s", body.user_id, body.document_type)

    status, extracted, confidence = await ocr_service.extract_id_data(body.image_url)

    is_expired = ocr_service.is_document_expired(extracted.expiration_date)

    if is_expired:
        status           = VerificationStatus.REJECTED
        rejection_reason = "The uploaded ID document has expired. Please upload a current document."
    elif status == VerificationStatus.REJECTED:
        rejection_reason = (
            "Could not extract required fields (name, date of birth) from the document. "
            "Please upload a clearer, well-lit photo."
        )
    elif status == VerificationStatus.MANUAL_REVIEW:
        rejection_reason = "Document verification service temporarily unavailable."
    else:
        rejection_reason = None

    return DocumentVerifyResponse(
        status=status,
        extracted_data=extracted if status == VerificationStatus.VERIFIED else None,
        confidence_score=confidence,
        rejection_reason=rejection_reason,
        is_expired=is_expired,
        document_authentic=confidence >= 0.7 if status == VerificationStatus.VERIFIED else None,
    )


# ── POST /api/v1/verify/face ──────────────────────────────────────────────

@router.post(
    "/face",
    response_model=FaceMatchResponse,
    summary="Face matching (selfie vs ID)",
    description="Compares a selfie image with the photo on the ID document using AWS Rekognition.",
)
async def verify_face(
    body: FaceMatchRequest,
    _: None = Depends(verify_internal_key),
):
    """
    Called from Express after the user captures their selfie.
    Uses AWS Rekognition. Threshold: 80% (configurable via FACE_MATCH_THRESHOLD).
    """
    logger.info("Face match request — user=%s", body.user_id)
    return await face_service.compare_faces(
        id_image_url=body.id_image_url,
        selfie_url=body.selfie_url,
    )


# ── POST /api/v1/verify/nsopw ─────────────────────────────────────────────

@router.post(
    "/nsopw",
    response_model=NSopwCheckResponse,
    summary="NSOPW background check (providers only)",
    description="Performs an NSOPW background check based on the provider's full name and state.",
)
async def check_nsopw(
    body: NSopwCheckRequest,
    _: None = Depends(verify_internal_key),
):
    """
    Searches NSOPW for the provider's name.
    Falls back to requiring self-declaration if the site is unavailable.
    Providers only — not called for customers.
    """
    logger.info("NSOPW check — user=%s name='%s'", body.user_id, body.full_name)
    return await nsopw_service.check_nsopw(
        full_name=body.full_name,
        state=body.state,
    )
