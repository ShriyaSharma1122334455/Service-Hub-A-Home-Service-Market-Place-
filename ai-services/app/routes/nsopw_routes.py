"""
NSOPW Routes
=============
POST /ai/nsopw/check  →  NSOPW background check for providers

Called by the Express backend after OCR + face match pass.
Accepts JSON body with firstName, lastName, and optional state.
"""

import logging
from typing import Optional

from fastapi import APIRouter, HTTPException, Header, Depends
from pydantic import BaseModel, Field

from app.core.config import settings
from app.services import nsopw_service

logger = logging.getLogger(__name__)
router = APIRouter()


# ── Request schema ────────────────────────────────────────────────────────

class NsopwCheckBody(BaseModel):
    firstName: str = Field(..., min_length=1, description="Provider's first name")
    lastName: str = Field(..., min_length=1, description="Provider's last name")
    state: Optional[str] = Field(None, description="Two-letter state code, e.g. NJ")
    zipCode: Optional[str] = Field(None, description="Five-digit ZIP code from ID document")


# ── Internal API key guard ────────────────────────────────────────────────

def verify_internal_key(x_internal_key: Optional[str] = Header(None)):
    """Only the Express backend should call these endpoints."""
    if settings.ENV == "development":
        return
    if x_internal_key != settings.INTERNAL_API_KEY:
        raise HTTPException(status_code=403, detail="Forbidden: invalid internal API key")


# ── POST /check  (mounted at /ai/nsopw → full path: /ai/nsopw/check) ────

@router.post(
    "/check",
    summary="NSOPW background check",
    description="Searches the National Sex Offender Public Website for the provider's name.",
)
async def check_nsopw(
    body: NsopwCheckBody,
    _: None = Depends(verify_internal_key),
):
    """
    Accepts firstName, lastName, optional state, and optional zipCode.
    Primary: Playwright browser automation with ZIP code search.
    Fallback: httpx scraping with first/last name.
    Returns pass/fail/pending. PII is never logged.
    """
    logger.info("NSOPW check request received (PII redacted)")

    result = await nsopw_service.check_nsopw(
        first_name=body.firstName,
        last_name=body.lastName,
        state=body.state,
        zip_code=body.zipCode,
    )
    return result
