"""
OCR Service
===========
Uses Google Cloud Vision to extract text from US driver licences and passports,
then parses it into structured fields via regex.

Sprint 1 research notes
-----------------------
Three options evaluated:

| API                          | Cost/1000   | Structured output? | Decision |
|------------------------------|-------------|---------------------|----------|
| Google Vision (text detect)  | $1.50       | Raw — we parse      | ✅ MVP   |
| Google Document AI (ID proc) | $65         | Pre-parsed fields   | Sprint 4 upgrade if <90% accuracy |
| AWS Textract AnalyzeID       | $15         | Pre-parsed fields   | Fallback option |

Starting with Vision + regex (free 1 000 calls/month) and upgrading only if
accuracy is insufficient after Sprint 2 real-image testing.
"""

import re
import json
import logging
from datetime import datetime, date
from typing import Optional, Tuple

import httpx
from google.cloud import vision
from google.oauth2 import service_account

from app.core.config import settings
from app.models.schemas import ExtractedIDData, VerificationStatus

logger = logging.getLogger(__name__)


# ── Client factory ────────────────────────────────────────────────────────

def _build_vision_client() -> vision.ImageAnnotatorClient:
    if settings.GOOGLE_CREDENTIALS_JSON:
        info = json.loads(settings.GOOGLE_CREDENTIALS_JSON)
        creds = service_account.Credentials.from_service_account_info(info)
        return vision.ImageAnnotatorClient(credentials=creds)
    # Falls back to GOOGLE_APPLICATION_CREDENTIALS file path or ADC
    return vision.ImageAnnotatorClient()


# ── Public API ────────────────────────────────────────────────────────────

async def extract_id_data(
    image_url: str,
) -> Tuple[VerificationStatus, ExtractedIDData, float]:
    """
    Download image from Cloudinary → run Vision OCR → parse fields.

    Returns:
        (status, extracted_data, confidence_score 0–1)
    """
    # 1. Download image
    try:
        async with httpx.AsyncClient(timeout=15.0) as client:
            resp = await client.get(image_url)
            resp.raise_for_status()
            image_bytes = resp.content
    except httpx.HTTPError as exc:
        logger.error("Image download failed: %s", exc)
        return VerificationStatus.REJECTED, ExtractedIDData(raw_text="Image download failed"), 0.0

    # 2. Call Vision API
    try:
        vision_client = _build_vision_client()
        image      = vision.Image(content=image_bytes)
        response   = vision_client.text_detection(image=image)

        if response.error.message:
            raise RuntimeError(response.error.message)

        full_text  = response.full_text_annotation.text if response.full_text_annotation else ""
        confidence = _estimate_confidence(response)

    except Exception as exc:
        logger.error("Vision API error: %s", exc)
        return VerificationStatus.MANUAL_REVIEW, ExtractedIDData(raw_text="Vision API unavailable"), 0.0

    # 3. Parse text → structured fields
    extracted = _parse_id_text(full_text)

    # Need at minimum name + DOB to be useful
    if not extracted.full_name or not extracted.date_of_birth:
        return VerificationStatus.REJECTED, extracted, confidence

    return VerificationStatus.VERIFIED, extracted, confidence


def is_document_expired(expiration_date_iso: Optional[str]) -> Optional[bool]:
    """Return True if the document expiry date has passed."""
    if not expiration_date_iso:
        return None
    try:
        return date.fromisoformat(expiration_date_iso) < date.today()
    except ValueError:
        return None


# ── Parsing helpers ───────────────────────────────────────────────────────

def _parse_id_text(raw_text: str) -> ExtractedIDData:
    """Regex-based field extraction from AAMVA-standard US ID text."""
    data = ExtractedIDData(raw_text=raw_text)

    # Full name — AAMVA uses LN / FN labels
    name_match = re.search(
        r"(?:LN|LAST\s*NAME)[:\s]+([A-Z]+)[\s,\n]+(?:FN|FIRST\s*NAME)[:\s]+([A-Z]+)",
        raw_text, re.IGNORECASE,
    )
    if name_match:
        data.full_name = f"{name_match.group(1)} {name_match.group(2)}".title()
    else:
        # Fallback: first all-caps two-word line
        caps = re.findall(r"^[A-Z]{2,}\s+[A-Z]{2,}", raw_text, re.MULTILINE)
        if caps:
            data.full_name = caps[0].title()

    # Date of birth
    dob = re.search(
        r"(?:DOB|DATE\s*OF\s*BIRTH|BIRTH\s*DATE)[:\s]+(\d{1,2}[\/\-]\d{1,2}[\/\-]\d{2,4})",
        raw_text, re.IGNORECASE,
    )
    if dob:
        data.date_of_birth = _normalise_date(dob.group(1))

    # Expiration date
    exp = re.search(
        r"(?:EXP|EXPIRES?|EXPIRATION)[:\s]+(\d{1,2}[\/\-]\d{1,2}[\/\-]\d{2,4})",
        raw_text, re.IGNORECASE,
    )
    if exp:
        data.expiration_date = _normalise_date(exp.group(1))

    # Street address
    addr = re.search(
        r"\d{1,5}\s+[A-Z][A-Z\s]+(?:ST|AVE|RD|BLVD|DR|LN|WAY|CT)[.,\s]",
        raw_text, re.IGNORECASE,
    )
    if addr:
        data.address = addr.group(0).strip()

    # ID / DL number
    id_num = re.search(r"\b(?:DL|ID)[:\s#]*([A-Z0-9]{6,15})\b", raw_text, re.IGNORECASE)
    if id_num:
        data.id_number = id_num.group(1).upper()

    # Issue state
    state = re.search(r"(?:STATE|ISS)[:\s]+([A-Z]{2})\b", raw_text, re.IGNORECASE)
    if state:
        data.issue_state = state.group(1).upper()

    return data


def _normalise_date(raw: str) -> Optional[str]:
    """Convert MM/DD/YYYY (or variants) to ISO YYYY-MM-DD."""
    for fmt in ("%m/%d/%Y", "%m-%d-%Y", "%m/%d/%y", "%m-%d-%y"):
        try:
            return datetime.strptime(raw.strip(), fmt).date().isoformat()
        except ValueError:
            continue
    return raw  # Return as-is rather than None


def _estimate_confidence(response) -> float:
    """Derive overall confidence from per-symbol Vision scores."""
    try:
        scores = [
            sym.confidence
            for page  in response.full_text_annotation.pages
            for block in page.blocks
            for para  in block.paragraphs
            for word  in para.words
            for sym   in word.symbols
            if sym.confidence > 0
        ]
        return round(sum(scores) / len(scores), 3) if scores else 0.75
    except Exception:
        return 0.75
