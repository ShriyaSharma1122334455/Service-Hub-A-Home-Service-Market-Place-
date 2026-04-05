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
    summary="OCR ID extraction",
    description="Extracts data from an ID document using OCR. Validates expiration and extracted fields.",
)
async def verify_document(
    body: DocumentVerifyRequest,
    _: None = Depends(verify_internal_key),
):
    """
    Called from Express after the user uploads their ID to Supabase Storage.
    Downloads the image via signed URL, runs Google Vision OCR,
    and returns structured fields + verification status.
    """
    import httpx

    logger.info("OCR request — user=%s doc_type=%s", body.user_id, body.document_type)

    # 1. Download the image from the signed URL
    try:
        async with httpx.AsyncClient(timeout=30.0) as client:
            img_resp = await client.get(str(body.image_url))
            img_resp.raise_for_status()
            image_bytes = img_resp.content
    except Exception as exc:
        logger.error("Failed to download ID image: %s", exc)
        return {
            "status": "manual_review",
            "extractedName": None,
            "extractedDOB": None,
            "confidence": 0.0,
            "error": f"Failed to download image: {str(exc)}",
        }

    # 2. Call the OCR service with raw bytes
    result = await ocr_service.extract_id_data(image_bytes, body.document_type)

    # 3. Return the dict directly — Node.js backend reads extractedName, extractedDOB, etc.
    return result


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
    import httpx

    # Download ID Image
    try:
        async with httpx.AsyncClient(timeout=30.0) as client:
            id_resp = await client.get(str(body.id_image_url))
            id_resp.raise_for_status()
            id_bytes = id_resp.content
    except Exception as exc:
        logger.error("Failed to download ID image for face match: %s", exc)
        return {"status": "rejected", "similarity_score": 0.0, "threshold_used": 90.0, "is_match": False, "face_detected_in_id": False, "face_detected_in_selfie": False, "rejection_reason": "Failed to download ID image"}

    # Download Selfie Image
    try:
        async with httpx.AsyncClient(timeout=30.0) as client:
            selfie_resp = await client.get(str(body.selfie_url))
            selfie_resp.raise_for_status()
            selfie_bytes = selfie_resp.content
    except Exception as exc:
        logger.error("Failed to download Selfie image for face match: %s", exc)
        return {"status": "rejected", "similarity_score": 0.0, "threshold_used": 90.0, "is_match": False, "face_detected_in_id": True, "face_detected_in_selfie": False, "rejection_reason": "Failed to download selfie image"}

    res = await face_service.compare_faces(
        id_image_bytes=id_bytes,
        selfie_bytes=selfie_bytes,
    )
    
    return {
        "status": res.get("status", "rejected"),
        "similarity_score": res.get("similarity", 0.0),
        "threshold_used": 90.0,
        "is_match": res.get("matched", False),
        "rejection_reason": res.get("rejectionReason"),
        "face_detected_in_selfie": res.get("faceDetectedInSelfie", False),
        "face_detected_in_id": res.get("faceDetectedInId", False)
    }


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
    
    # Split full_name into first_name and last_name
    name_parts = body.full_name.strip().split()
    first_name = name_parts[0] if name_parts else ""
    last_name = " ".join(name_parts[1:]) if len(name_parts) > 1 else ""

    res = await nsopw_service.check_nsopw(
        first_name=first_name,
        last_name=last_name,
        state=body.state,
    )
    
    status_map = {
        "pass": "verified",
        "fail": "rejected",
        "pending": "manual_review"
    }
    
    return {
        "status": status_map.get(res.get("nsopwStatus", "pending"), "manual_review"),
        "is_clear": not res.get("matchFound", True) and res.get("nsopwStatus") == "pass",
        "records_found": len(res.get("matchDetails", [])),
        "rejection_reason": res.get("reason"),
        "used_fallback": res.get("selfDeclarationRequired", False),
        "self_declaration_required": res.get("selfDeclarationRequired", False)
    }
