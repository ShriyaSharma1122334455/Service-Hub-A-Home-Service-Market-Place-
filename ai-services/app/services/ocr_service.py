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
        r"(?:LN|LAST\s*NAME)[:\s]+([A-Z]+)[\s,]+(?:FN|FIRST\s*NAME[:\s]+)?([A-Z]+)",
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


# ── MRZ Parsing (Passport TD3 — two 44‑char lines) ──────────────────────

def _parse_mrz(raw_text: str) -> Optional[dict]:
    """
    Attempt to find and parse Machine Readable Zone (TD3 format).

    TD3 layout (ICAO 9303):
      Line 1 (44 chars): P<ISSUING_COUNTRY SURNAME<<GIVEN_NAMES<<<…
      Line 2 (44 chars): DOC_NUMBER(9) CHK NATIONALITY DOB(6) CHK SEX EXP(6) CHK OPT(14) CHK OVERALL_CHK

    Returns dict with parsed fields on success, or None if no valid MRZ found.
    """
    # Find candidate MRZ lines — sequences of 44+ chars using MRZ charset
    mrz_pattern = re.compile(r"[A-Z0-9<]{44,}")
    candidates = mrz_pattern.findall(raw_text.upper().replace(" ", ""))

    if len(candidates) < 2:
        # Also try line-by-line (OCR often adds spaces within MRZ)
        lines = raw_text.upper().split("\n")
        cleaned = [re.sub(r"[^A-Z0-9<]", "", line) for line in lines]
        candidates = [c for c in cleaned if len(c) >= 44]

    if len(candidates) < 2:
        return None

    line1 = candidates[-2][:44]  # Take last two qualifying lines
    line2 = candidates[-1][:44]

    # Validate line 1 starts with P (passport)
    if not line1.startswith("P"):
        return None

    # ── Parse Line 1 ──────────────────────────────────────────────────
    issuing_country = line1[2:5].replace("<", "")

    name_section = line1[5:]
    name_parts = name_section.split("<<")
    surname = name_parts[0].replace("<", " ").strip().title() if name_parts else ""
    given_names = (
        name_parts[1].replace("<", " ").strip().title()
        if len(name_parts) > 1 else ""
    )
    full_name = f"{given_names} {surname}".strip() if given_names else surname

    # ── Parse Line 2 ──────────────────────────────────────────────────
    doc_number = line2[0:9].replace("<", "").strip()
    nationality = line2[10:13].replace("<", "")
    dob_raw = line2[13:19]       # YYMMDD
    expiry_raw = line2[21:27]    # YYMMDD

    dob_iso = _mrz_date_to_iso(dob_raw, is_birth_date=True)
    expiry_iso = _mrz_date_to_iso(expiry_raw, is_birth_date=False)

    return {
        "full_name": full_name,
        "document_number": doc_number,
        "issuing_state": issuing_country or nationality,
        "date_of_birth": dob_iso,
        "expiry_date": expiry_iso,
    }


def _mrz_date_to_iso(yymmdd: str, is_birth_date: bool = True) -> Optional[str]:
    """Convert MRZ YYMMDD to ISO YYYY-MM-DD.

    For birth dates: YY > 50 → 19XX, else 20XX.
    For expiry dates: always 20XX (passports don't expire in the 1900s).
    """
    if not yymmdd or len(yymmdd) != 6 or not yymmdd.isdigit():
        return None

    yy = int(yymmdd[0:2])
    mm = yymmdd[2:4]
    dd = yymmdd[4:6]

    if is_birth_date:
        century = 1900 if yy > 50 else 2000
    else:
        century = 2000

    year = century + yy

    try:
        # Validate the date is real
        datetime.strptime(f"{year}-{mm}-{dd}", "%Y-%m-%d")
        return f"{year}-{mm}-{dd}"
    except ValueError:
        return None


# ── Public API: parse_id_document ────────────────────────────────────────

async def parse_id_document(
    image_url: str,
    document_type: str,
) -> "OcrParseResponse":
    """
    Unified OCR entry point for the /ai/ocr/parse-id endpoint.

    1. Download image → 2. Vision OCR → 3. Route to MRZ or regex parser
    → 4. Return normalised OcrParseResponse.
    """
    from app.models.schemas import OcrParseResponse

    # 1. Download image
    try:
        async with httpx.AsyncClient(timeout=15.0) as client:
            resp = await client.get(image_url)
            resp.raise_for_status()
            image_bytes = resp.content
    except httpx.HTTPError as exc:
        logger.error("Image download failed: %s", exc)
        return OcrParseResponse(
            success=False,
            error="image_download_failed",
            document_type=document_type,
        )

    # 2. Call Vision API
    try:
        vision_client = _build_vision_client()
        image = vision.Image(content=image_bytes)
        response = vision_client.text_detection(image=image)

        if response.error.message:
            raise RuntimeError(response.error.message)

        full_text = (
            response.full_text_annotation.text
            if response.full_text_annotation else ""
        )
        confidence = _estimate_confidence(response)

    except Exception as exc:
        logger.error("Vision API error: %s", exc)
        return OcrParseResponse(
            success=False,
            error="vision_api_error",
            document_type=document_type,
        )

    # No text detected
    if not full_text.strip():
        return OcrParseResponse(
            success=False,
            error="no_text_detected",
            document_type=document_type,
            raw_text="",
        )

    # 3. Dispatch to correct parser
    if document_type == "passport":
        mrz_result = _parse_mrz(full_text)
        if mrz_result:
            return OcrParseResponse(
                success=True,
                document_type=document_type,
                extracted_name=mrz_result["full_name"],
                extracted_dob=mrz_result["date_of_birth"],
                document_number=mrz_result["document_number"],
                expiry_date=mrz_result["expiry_date"],
                issuing_state=mrz_result["issuing_state"],
                raw_text=full_text,
                confidence=confidence,
                parse_method="mrz",
            )
        else:
            # Fallback to regex if MRZ lines not found
            logger.warning("No MRZ lines found in passport — falling back to regex")
            parsed = _parse_id_text(full_text)
            return OcrParseResponse(
                success=True,
                document_type=document_type,
                extracted_name=parsed.full_name,
                extracted_dob=parsed.date_of_birth,
                document_number=parsed.id_number,
                expiry_date=parsed.expiration_date,
                issuing_state=parsed.issue_state,
                raw_text=full_text,
                confidence=confidence,
                parse_method="regex",
            )

    else:
        # drivers_license — use existing AAMVA regex parser
        parsed = _parse_id_text(full_text)
        return OcrParseResponse(
            success=True,
            document_type=document_type,
            extracted_name=parsed.full_name,
            extracted_dob=parsed.date_of_birth,
            document_number=parsed.id_number,
            expiry_date=parsed.expiration_date,
            issuing_state=parsed.issue_state,
            raw_text=full_text,
            confidence=confidence,
            parse_method="regex",
        )

