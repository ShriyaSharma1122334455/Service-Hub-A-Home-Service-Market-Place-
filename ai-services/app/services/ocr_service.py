"""
OCR Service
===========
Uses Google Cloud Vision TEXT_DETECTION to extract text from US driver licences
and passports, then parses it into structured fields.

Driver licenses: AAMVA regex patterns for name, DOB, address, license number,
                 expiry, and issuing state.
Passports:       MRZ TD3 format parsing (lines 1 + 2 of the machine-readable zone)
                 for surname, given names, nationality, DOB, document number, expiry.

Sprint 1 research notes
-----------------------
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
from typing import Optional, Dict, Any

from google.cloud import vision
from google.oauth2 import service_account

from app.core.config import settings

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
    image_bytes: bytes,
    document_type: str = "drivers_license",
) -> Dict[str, Any]:
    """
    Accept raw file bytes + document_type string.
    Run Vision OCR → parse fields based on document type.

    Returns a dict with the normalized output schema:
        extractedName, extractedDOB, documentNumber, expiryDate,
        issuingState, rawText, confidence
    """
    # 1. Call Vision API
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
        return {
            "extractedName": None,
            "extractedDOB": None,
            "documentNumber": None,
            "expiryDate": None,
            "issuingState": None,
            "rawText": "Vision API unavailable",
            "confidence": 0.0,
            "status": "manual_review",
            "rejectionReason": "Document verification service temporarily unavailable.",
        }

    # 2. Parse text based on document type
    if document_type == "passport":
        parsed = _parse_passport_mrz(full_text)
    else:
        parsed = _parse_drivers_license(full_text)

    # 3. Normalize into consistent output schema
    result = {
        "extractedName": parsed.get("full_name"),
        "extractedDOB": parsed.get("date_of_birth"),
        "documentNumber": parsed.get("document_number"),
        "expiryDate": parsed.get("expiry_date"),
        "issuingState": parsed.get("issuing_state"),
        "rawText": full_text,
        "confidence": confidence,
    }

    # Determine status
    if not result["extractedName"] or not result["extractedDOB"]:
        result["status"] = "rejected"
        result["rejectionReason"] = (
            "Could not extract required fields (name, date of birth) from the document. "
            "Please upload a clearer, well-lit photo."
        )
    else:
        # Check expiry
        is_expired = _is_document_expired(result["expiryDate"])
        if is_expired:
            result["status"] = "rejected"
            result["rejectionReason"] = "The uploaded ID document has expired. Please upload a current document."
        else:
            result["status"] = "verified"
            result["rejectionReason"] = None

    return result


def is_document_expired(expiration_date_iso: Optional[str]) -> Optional[bool]:
    """Return True if the document expiry date has passed. Public helper."""
    return _is_document_expired(expiration_date_iso)


# ── Passport MRZ TD3 Parsing ─────────────────────────────────────────────

def _parse_passport_mrz(raw_text: str) -> Dict[str, Optional[str]]:
    """
    Parse MRZ TD3 format (two 44-character lines at the bottom of passports).

    Line 1 (44 chars): P<NATIONALITY SURNAME<<GIVEN<NAMES<<<<<<<<<<<<<<<
    Line 2 (44 chars): DOCNUMBER<CHECK DOB CHECK SEX EXPIRY CHECK COMPOSITE

    MRZ uses '<' as filler. Country codes are 3-letter (ISO 3166-1 alpha-3).
    """
    result = {
        "full_name": None,
        "date_of_birth": None,
        "document_number": None,
        "expiry_date": None,
        "issuing_state": None,
        "nationality": None,
    }

    # Find MRZ lines — two consecutive lines of 44+ chars with MRZ characters
    mrz_pattern = re.compile(r"[A-Z0-9<]{44,}", re.MULTILINE)
    mrz_lines = mrz_pattern.findall(raw_text.replace(" ", "").replace("\n", "\n"))

    # Also try to find them in the raw text with spaces stripped per-line
    if len(mrz_lines) < 2:
        lines = raw_text.strip().split("\n")
        mrz_lines = []
        for line in lines:
            cleaned = re.sub(r"[^A-Z0-9<]", "", line.upper())
            if len(cleaned) >= 44:
                mrz_lines.append(cleaned[:44])

    if len(mrz_lines) < 2:
        # Fallback: try regex-based extraction from raw text
        logger.warning("MRZ lines not found — falling back to regex extraction for passport")
        return _parse_passport_regex(raw_text)

    line1 = mrz_lines[-2][:44]  # Second-to-last qualifying line
    line2 = mrz_lines[-1][:44]  # Last qualifying line

    # ── Line 1: P<ISSUING_STATE SURNAME<<GIVEN_NAMES<<<<
    if line1.startswith("P"):
        # Nationality / issuing state (positions 2-4)
        nationality = line1[2:5].replace("<", "")
        if nationality:
            result["issuing_state"] = nationality
            result["nationality"] = nationality

        # Name field (positions 5-43)
        name_field = line1[5:44]
        name_parts = name_field.split("<<")
        if len(name_parts) >= 2:
            surname = name_parts[0].replace("<", " ").strip()
            given   = name_parts[1].replace("<", " ").strip()
            result["full_name"] = f"{given} {surname}".title() if given else surname.title()
        elif name_parts:
            result["full_name"] = name_parts[0].replace("<", " ").strip().title()

    # ── Line 2: DOCNUM___<CHECK DOB__CHECK SEX EXP__CHECK COMP...
    # Positions:  0-8: document number, 9: check digit
    #            13-18: DOB (YYMMDD), 19: check digit
    #            21-26: expiry (YYMMDD), 27: check digit
    doc_number = line2[0:9].replace("<", "").strip()
    if doc_number:
        result["document_number"] = doc_number

    dob_raw = line2[13:19]
    if re.match(r"\d{6}", dob_raw):
        result["date_of_birth"] = _mrz_date_to_iso(dob_raw, is_dob=True)

    exp_raw = line2[21:27]
    if re.match(r"\d{6}", exp_raw):
        result["expiry_date"] = _mrz_date_to_iso(exp_raw, is_dob=False)

    return result


def _parse_passport_regex(raw_text: str) -> Dict[str, Optional[str]]:
    """Fallback regex parsing for passport text when MRZ is unreadable."""
    result = {
        "full_name": None,
        "date_of_birth": None,
        "document_number": None,
        "expiry_date": None,
        "issuing_state": None,
    }

    # Name patterns
    name_match = re.search(
        r"(?:SURNAME|LAST\s*NAME|NOM)[:\s/]+([A-Z]+)[,\s]+(?:GIVEN\s*NAME|FIRST\s*NAME|PRENOM)[:\s/]+([A-Z\s]+)",
        raw_text, re.IGNORECASE,
    )
    if name_match:
        result["full_name"] = f"{name_match.group(2).strip()} {name_match.group(1).strip()}".title()

    # DOB
    dob = re.search(
        r"(?:DATE\s*OF\s*BIRTH|DOB|BIRTH\s*DATE|DATE\s*DE\s*NAISSANCE)[:\s]+([\d/\-\.]+)",
        raw_text, re.IGNORECASE,
    )
    if dob:
        result["date_of_birth"] = _normalise_date(dob.group(1))

    # Passport number
    doc_num = re.search(r"\b([A-Z]\d{8}|\d{9}|[A-Z]{2}\d{7})\b", raw_text)
    if doc_num:
        result["document_number"] = doc_num.group(1)

    # Expiry
    exp = re.search(
        r"(?:DATE\s*OF\s*EXP|EXPIR|EXP\.?\s*DATE)[:\s]+([\d/\-\.]+)",
        raw_text, re.IGNORECASE,
    )
    if exp:
        result["expiry_date"] = _normalise_date(exp.group(1))

    # Nationality/issuing state
    nat = re.search(r"(?:NATIONALITY|COUNTRY\s*CODE)[:\s]+([A-Z]{2,3})", raw_text, re.IGNORECASE)
    if nat:
        result["issuing_state"] = nat.group(1).upper()

    return result


def _mrz_date_to_iso(yymmdd: str, is_dob: bool = True) -> Optional[str]:
    """Convert MRZ YYMMDD to ISO YYYY-MM-DD, with century disambiguation."""
    try:
        yy = int(yymmdd[0:2])
        mm = int(yymmdd[2:4])
        dd = int(yymmdd[4:6])

        current_year = date.today().year % 100
        if is_dob:
            # DOB: if YY > current year, it's 1900s; otherwise 2000s
            century = 1900 if yy > current_year else 2000
        else:
            # Expiry: if YY < current year - 10, it's 2100s (unlikely); otherwise 2000s
            century = 2000

        full_year = century + yy
        return date(full_year, mm, dd).isoformat()
    except (ValueError, IndexError):
        return None


# ── Driver License AAMVA Parsing ──────────────────────────────────────────

def _parse_drivers_license(raw_text: str) -> Dict[str, Optional[str]]:
    """Regex-based field extraction from AAMVA-standard US driver license text."""
    result = {
        "full_name": None,
        "date_of_birth": None,
        "document_number": None,
        "expiry_date": None,
        "issuing_state": None,
        "address": None,
    }

    # Full name — AAMVA uses LN / FN labels
    name_match = re.search(
        r"(?:LN|LAST\s*NAME)[:\s]+([A-Z]+)[,\s]+(?:FN|FIRST\s*NAME)[:\s]+([A-Z]+)",
        raw_text, re.IGNORECASE,
    )
    if name_match:
        result["full_name"] = f"{name_match.group(2)} {name_match.group(1)}".title()
    else:
        # Fallback: first all-caps two-word line
        caps = re.findall(r"^[A-Z]{2,}\s+[A-Z]{2,}", raw_text, re.MULTILINE)
        if caps:
            result["full_name"] = caps[0].title()

    # Date of birth
    dob = re.search(
        r"(?:DOB|DATE\s*OF\s*BIRTH|BIRTH\s*DATE)[:\s]+(\d{1,2}[\/\-]\d{1,2}[\/\-]\d{2,4})",
        raw_text, re.IGNORECASE,
    )
    if dob:
        result["date_of_birth"] = _normalise_date(dob.group(1))

    # Expiration date
    exp = re.search(
        r"(?:EXP|EXPIRES?|EXPIRATION)[:\s]+(\d{1,2}[\/\-]\d{1,2}[\/\-]\d{2,4})",
        raw_text, re.IGNORECASE,
    )
    if exp:
        result["expiry_date"] = _normalise_date(exp.group(1))

    # Street address
    addr = re.search(
        r"\d{1,5}\s+[A-Z][A-Z\s]+(?:ST|AVE|RD|BLVD|DR|LN|WAY|CT)[.,\s]",
        raw_text, re.IGNORECASE,
    )
    if addr:
        result["address"] = addr.group(0).strip()

    # License / DL number
    id_num = re.search(r"\b(?:DL|ID|LIC)[:\s#]*([A-Z0-9]{6,15})\b", raw_text, re.IGNORECASE)
    if id_num:
        result["document_number"] = id_num.group(1).upper()

    # Issuing state
    state = re.search(r"(?:STATE|ISS)[:\s]+([A-Z]{2})\b", raw_text, re.IGNORECASE)
    if state:
        result["issuing_state"] = state.group(1).upper()

    return result


# ── Date helpers ──────────────────────────────────────────────────────────

def _normalise_date(raw: str) -> Optional[str]:
    """Convert MM/DD/YYYY (or variants) to ISO YYYY-MM-DD."""
    for fmt in ("%m/%d/%Y", "%m-%d-%Y", "%m/%d/%y", "%m-%d-%y",
                "%d/%m/%Y", "%d-%m-%Y", "%Y-%m-%d", "%d.%m.%Y"):
        try:
            return datetime.strptime(raw.strip(), fmt).date().isoformat()
        except ValueError:
            continue
    return raw  # Return as-is rather than None


def _is_document_expired(expiration_date_iso: Optional[str]) -> Optional[bool]:
    """Return True if the document expiry date has passed."""
    if not expiration_date_iso:
        return None
    try:
        return date.fromisoformat(expiration_date_iso) < date.today()
    except ValueError:
        return None


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
