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
    # Option 1: Raw JSON string (e.g. from Docker / CI secret)
    if settings.GOOGLE_CREDENTIALS_JSON:
        info = json.loads(settings.GOOGLE_CREDENTIALS_JSON)
        creds = service_account.Credentials.from_service_account_info(info)
        return vision.ImageAnnotatorClient(credentials=creds)

    # Option 2: Path to a service-account JSON file (from .env)
    if settings.GOOGLE_APPLICATION_CREDENTIALS:
        import os
        cred_path = settings.GOOGLE_APPLICATION_CREDENTIALS
        if os.path.isfile(cred_path):
            creds = service_account.Credentials.from_service_account_file(cred_path)
            logger.info("Loaded Vision credentials from file: %s", cred_path)
            return vision.ImageAnnotatorClient(credentials=creds)
        else:
            logger.warning("GOOGLE_APPLICATION_CREDENTIALS path does not exist: %s", cred_path)

    # Option 3: Falls back to Application Default Credentials (ADC)
    logger.info("Using Application Default Credentials for Vision API")
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
        image = vision.Image(content=image_bytes)
        response = vision_client.text_detection(image=image)

        if response.error.message:
            raise RuntimeError(response.error.message)

        full_text = response.full_text_annotation.text if response.full_text_annotation else ""
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
            given = name_parts[1].replace("<", " ").strip()
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
        r"(?:LN|LAST\s*NAME)[:\s]+([A-Z]+)[\s,\n]+(?:FN|FIRST\s*NAME)[:\s]+([A-Z]+)",
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
    """
    Regex-based field extraction from US driver license OCR text.
    Uses multiple fallback strategies since DL formats vary wildly by state.
    """
    result = {
        "full_name": None,
        "date_of_birth": None,
        "document_number": None,
        "expiry_date": None,
        "issuing_state": None,
        "address": None,
    }

    logger.info("RAW OCR TEXT for DL:\n%s", raw_text)

    # ── Full name ─────────────────────────────────────────────────────────
    # Strategy 1: Labeled fields (LN/FN, LAST NAME/FIRST NAME)
    name_match = re.search(
        r"(?:LN|LAST\s*NAME|SURNAME)[:\s/]+([A-Za-z\-']+)"
        r"[\s,;]+(?:FN|FIRST\s*NAME|GIVEN\s*NAME)[:\s/]+([A-Za-z\-'\s]+)",
        raw_text, re.IGNORECASE,
    )
    if name_match:
        result["full_name"] = f"{name_match.group(2).strip()} {name_match.group(1).strip()}".title()

    # Strategy 2: "NAME" or "NM" label followed by text
    if not result["full_name"]:
        name2 = re.search(
            r"(?:^|\n)\s*(?:NAME|NM|FULL\s*NAME)[:\s]+([A-Za-z\-'\s,]+)",
            raw_text, re.IGNORECASE | re.MULTILINE,
        )
        if name2:
            raw_name = name2.group(1).strip().rstrip(",")
            # Handle "LASTNAME, FIRSTNAME" format
            if "," in raw_name:
                parts = raw_name.split(",", 1)
                result["full_name"] = f"{parts[1].strip()} {parts[0].strip()}".title()
            else:
                result["full_name"] = raw_name.title()

    # Strategy 3: Look for two consecutive all-caps words (common on DLs)
    if not result["full_name"]:
        caps_lines = re.findall(r"^([A-Z][A-Z\-']+(?:\s+[A-Z][A-Z\-']+){1,3})\s*$", raw_text, re.MULTILINE)
        # Filter out common non-name lines
        skip_words = {"DRIVER", "LICENSE", "IDENTIFICATION", "CARD", "STATE", "DEPARTMENT",
                      "MOTOR", "VEHICLES", "CLASS", "REAL", "EXPIRES", "ISSUED", "NONE"}
        for line in caps_lines:
            words = line.split()
            if len(words) >= 2 and not any(w.upper() in skip_words for w in words):
                result["full_name"] = line.title()
                break

    # Strategy 4: Find any line with 2-4 capitalized words that looks like a name
    if not result["full_name"]:
        name_lines = re.findall(r"^([A-Z][a-z]+(?:\s+[A-Z][a-z]+){1,3})\s*$", raw_text, re.MULTILINE)
        if name_lines:
            result["full_name"] = name_lines[0].strip()

    # ── Date of Birth ─────────────────────────────────────────────────────
    # Strategy 1: Labeled DOB
    dob_patterns = [
        r"(?:DOB|DATE\s*OF\s*BIRTH|BIRTH\s*DATE|BD|BORN)[:\s/]+(\d{1,2}[\\/\-\.]\d{1,2}[\\/\-\.]\d{2,4})",
        r"(?:DOB|DATE\s*OF\s*BIRTH|BIRTH\s*DATE|BD|BORN)[:\s/]+(\d{4}[\\/\-\.]\d{1,2}[\\/\-\.]\d{1,2})",
        r"(?:DOB|DATE\s*OF\s*BIRTH|BD)[:\s/]+(\d{8})",  # MMDDYYYY compressed
    ]
    for pattern in dob_patterns:
        dob = re.search(pattern, raw_text, re.IGNORECASE)
        if dob:
            raw_dob = dob.group(1)
            if len(raw_dob) == 8 and raw_dob.isdigit():
                # Compressed MMDDYYYY
                raw_dob = f"{raw_dob[:2]}/{raw_dob[2:4]}/{raw_dob[4:]}"
            result["date_of_birth"] = _normalise_date(raw_dob)
            break

    # Strategy 2: Find any date-like string near DOB context
    if not result["date_of_birth"]:
        # Look for any date within 50 chars of "DOB" or "BIRTH"
        dob_context = re.search(r"(?:DOB|BIRTH).{0,50}", raw_text, re.IGNORECASE | re.DOTALL)
        if dob_context:
            date_in_context = re.search(r"(\d{1,2}[\\/\-\.]\d{1,2}[\\/\-\.]\d{2,4})", dob_context.group(0))
            if date_in_context:
                result["date_of_birth"] = _normalise_date(date_in_context.group(1))

    # ── Expiration date ───────────────────────────────────────────────────
    exp_patterns = [
        r"(?:EXP|EXPIRES?|EXPIRATION|EXPIRY)[:\s/]+(\d{1,2}[\\/\-\.]\d{1,2}[\\/\-\.]\d{2,4})",
        r"(?:EXP|EXPIRES?|EXPIRATION|EXPIRY)[:\s/]+(\d{4}[\\/\-\.]\d{1,2}[\\/\-\.]\d{1,2})",
    ]
    for pattern in exp_patterns:
        exp = re.search(pattern, raw_text, re.IGNORECASE)
        if exp:
            result["expiry_date"] = _normalise_date(exp.group(1))
            break

    # ── Street address ────────────────────────────────────────────────────
    addr = re.search(
        r"\d{1,5}\s+[A-Za-z][A-Za-z\s]+(?:ST|AVE|RD|BLVD|DR|LN|WAY|CT|PL|CIR|TERR?|PKWY)[.,\s]",
        raw_text, re.IGNORECASE,
    )
    if addr:
        result["address"] = addr.group(0).strip()

    # ── License / DL number ───────────────────────────────────────────────
    dl_patterns = [
        r"(?:DL|DLN|ID|LIC|LICENSE|LICENCE)\s*(?:NO|NUMBER|NUM|#)?[:\s#]*([A-Z0-9]{4,15})",
        r"(?:^|\n)\s*(?:NO|NUM|NUMBER)[:\s]+([A-Z0-9]{6,15})",
        r"\b([A-Z]\d{7,14})\b",  # Common format: letter + digits
    ]
    for pattern in dl_patterns:
        id_num = re.search(pattern, raw_text, re.IGNORECASE)
        if id_num:
            val = id_num.group(1).upper()
            # Skip too-short values or things that look like dates
            if len(val) >= 5 and not re.match(r"^\d{1,2}\d{1,2}\d{2,4}$", val):
                result["document_number"] = val
                break

    # ── Issuing state ─────────────────────────────────────────────────────
    US_STATES = {
        "AL", "AK", "AZ", "AR", "CA", "CO", "CT", "DE", "FL", "GA",
        "HI", "ID", "IL", "IN", "IA", "KS", "KY", "LA", "ME", "MD",
        "MA", "MI", "MN", "MS", "MO", "MT", "NE", "NV", "NH", "NJ",
        "NM", "NY", "NC", "ND", "OH", "OK", "OR", "PA", "RI", "SC",
        "SD", "TN", "TX", "UT", "VT", "VA", "WA", "WV", "WI", "WY",
        "DC",
    }
    state = re.search(r"(?:STATE|ISS|ISSUING)[:\s]+([A-Z]{2})\b", raw_text, re.IGNORECASE)
    if state and state.group(1).upper() in US_STATES:
        result["issuing_state"] = state.group(1).upper()
    else:
        # Look for standalone state abbreviation near "STATE" context or at top of doc
        for st in US_STATES:
            if re.search(rf"\b{st}\b", raw_text[:200]):
                result["issuing_state"] = st
                break

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
            for page in response.full_text_annotation.pages
            for block in page.blocks
            for para in block.paragraphs
            for word in para.words
            for sym in word.symbols
            if sym.confidence > 0
        ]
        return round(sum(scores) / len(scores), 3) if scores else 0.75
    except Exception:
        return 0.75
