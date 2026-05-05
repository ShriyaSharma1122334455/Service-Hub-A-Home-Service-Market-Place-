"""
test_ocr_passport_fallback.py — AI-MED-02
Passport plain-text fallback when MRZ and labeled-field regex both fail.
Chunk 6 — AI-MED-02
"""
from unittest.mock import MagicMock, patch

import pytest

from app.services.ocr_service import _parse_passport_plain_text, extract_id_data


def _make_mock_vision_response(text: str):
    """Return a minimal Vision API response mock with the given full text."""
    mock_annotation = MagicMock()
    mock_annotation.text = text
    mock_annotation.pages = []   # causes _estimate_confidence to return 0.75

    mock_response = MagicMock()
    mock_response.error.message = ""
    mock_response.full_text_annotation = mock_annotation
    return mock_response


# ── OCR-UT-07a: _parse_passport_plain_text extracts name ─────────────────

def test_ocrut07a_plain_text_extracts_surname_given():
    """OCR-UT-07: _parse_passport_plain_text parses SURNAME / GIVEN NAMES on consecutive lines."""
    text = (
        "UNITED STATES OF AMERICA\n"
        "PASSPORT\n"
        "SURNAME\n"
        "JOHNSON\n"
        "GIVEN NAMES\n"
        "ALICE MARIE\n"
    )
    result = _parse_passport_plain_text(text)
    assert result["full_name"] is not None
    name_lower = result["full_name"].lower()
    assert "johnson" in name_lower
    assert "alice" in name_lower


# ── OCR-UT-07b: _parse_passport_plain_text extracts DOB with month name ──

def test_ocrut07b_plain_text_extracts_dob_month_name():
    """OCR-UT-07b: _parse_passport_plain_text parses 'BORN 15 Mar 1985' → ISO date."""
    text = "SURNAME\nSMITH\nGIVEN NAMES\nBOB\nBORN 15 Mar 1985\n"
    result = _parse_passport_plain_text(text)
    assert result["date_of_birth"] == "1985-03-15"


# ── OCR-UT-08: all parsing fails → manual_review (not rejected) ───────────

@pytest.mark.asyncio
async def test_ocrut08_passport_all_parsing_fails_manual_review():
    """OCR-UT-08: Passport where Vision reads text but nothing is parseable → manual_review."""
    _gibberish = "AAAA BBBB CCCC DDDD EEEE FFFF GGGG"
    mock_response = _make_mock_vision_response(_gibberish)
    with patch("app.services.ocr_service._build_vision_client") as mock_factory:
        mock_factory.return_value.text_detection.return_value = mock_response
        result = await extract_id_data(b"fake-bytes", "passport")

    assert result["status"] == "manual_review", (
        f"Expected manual_review for unreadable passport, got: {result['status']}"
    )
    assert result["extractedName"] is None


# ── Integration: plain-text fallback is wired into extract_id_data ────────

@pytest.mark.asyncio
async def test_passport_plain_text_fallback_integration():
    """Integration: SURNAME/GIVEN NAMES format (fails MRZ + regex) → fields extracted via plain-text."""
    _passport_text = (
        "UNITED STATES OF AMERICA\n"
        "PASSPORT\n"
        "SURNAME\n"
        "JOHNSON\n"
        "GIVEN NAMES\n"
        "ALICE MARIE\n"
        "BORN 12 Mar 1988\n"
    )
    mock_response = _make_mock_vision_response(_passport_text)
    with patch("app.services.ocr_service._build_vision_client") as mock_factory:
        mock_factory.return_value.text_detection.return_value = mock_response
        result = await extract_id_data(b"fake-bytes", "passport")

    assert result["extractedName"] is not None, "Plain-text fallback should have extracted the name"
    assert "johnson" in result["extractedName"].lower()
    assert result["extractedDOB"] == "1988-03-12"
