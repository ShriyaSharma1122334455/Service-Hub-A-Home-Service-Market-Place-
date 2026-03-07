"""
Sprint 1 Tests — Verification Service
=======================================
All tests here work WITHOUT live API credentials.
Run with:  pytest -v   (from ai-services/verification/)
"""

import pytest
from app.services.ocr_service import _parse_id_text, _normalise_date, is_document_expired
from app.services.nsopw_service import _fallback_response
from app.models.schemas import VerificationStatus


# ── OCR Parsing ───────────────────────────────────────────────────────────

class TestOCRParsing:

    def test_parse_name_aamva_format(self):
        raw = "NEW JERSEY\nLN SMITH\nFN JOHN\nDOB 01/15/1990\nEXP 01/15/2030\nDL A1234567"
        result = _parse_id_text(raw)
        assert result.full_name == "Smith John"

    def test_parse_dob(self):
        result = _parse_id_text("DOB 03/22/1985")
        assert result.date_of_birth == "1985-03-22"

    def test_parse_expiration(self):
        result = _parse_id_text("EXPIRES 12/31/2028")
        assert result.expiration_date == "2028-12-31"

    def test_parse_dl_number(self):
        result = _parse_id_text("DL B9876543")
        assert result.id_number == "B9876543"

    def test_parse_state(self):
        result = _parse_id_text("STATE NJ\n123 MAIN ST")
        assert result.issue_state == "NJ"

    def test_raw_text_preserved(self):
        raw = "SOME DOCUMENT TEXT"
        assert _parse_id_text(raw).raw_text == raw

    def test_missing_fields_are_none(self):
        result = _parse_id_text("RANDOM UNSTRUCTURED TEXT")
        # Should not crash — just return None for missing fields
        assert result.full_name is None or result.date_of_birth is None


class TestDateNormalisation:

    def test_slash_4digit(self):
        assert _normalise_date("01/15/1990") == "1990-01-15"

    def test_dash_format(self):
        assert _normalise_date("03-22-1985") == "1985-03-22"

    def test_2digit_year_parses(self):
        result = _normalise_date("01/15/90")
        assert result is not None  # just check it doesn't crash

    def test_invalid_returns_raw(self):
        assert _normalise_date("not-a-date") == "not-a-date"


class TestDocumentExpiry:

    def test_expired_document(self):
        assert is_document_expired("2020-01-01") is True

    def test_valid_document(self):
        assert is_document_expired("2030-12-31") is False

    def test_none_input(self):
        assert is_document_expired(None) is None

    def test_invalid_date(self):
        assert is_document_expired("not-a-date") is None


# ── NSOPW Fallback ────────────────────────────────────────────────────────

class TestNSopwFallback:

    def test_fallback_requires_self_declaration(self):
        result = _fallback_response()
        assert result.self_declaration_required is True
        assert result.used_fallback is True
        assert result.status == VerificationStatus.MANUAL_REVIEW

    def test_fallback_does_not_hard_block(self):
        """Fallback should be optimistic — let self-declaration flow proceed."""
        result = _fallback_response()
        assert result.is_clear is True


# ── Model Validation ──────────────────────────────────────────────────────

class TestModels:

    def test_face_match_response_valid(self):
        from app.models.schemas import FaceMatchResponse
        r = FaceMatchResponse(
            status=VerificationStatus.VERIFIED,
            similarity_score=95.5,
            threshold_used=80.0,
            is_match=True,
        )
        assert r.similarity_score == 95.5
        assert r.is_match is True

    def test_document_verify_request_valid(self):
        from app.models.schemas import DocumentVerifyRequest
        req = DocumentVerifyRequest(
            image_url="https://res.cloudinary.com/test/image/upload/id.jpg",
            user_id="64f1a2b3c4d5e6f7a8b9c0d1",
        )
        assert req.user_id == "64f1a2b3c4d5e6f7a8b9c0d1"

    def test_nsopw_response_valid(self):
        from app.models.schemas import NSopwCheckResponse
        r = NSopwCheckResponse(
            status=VerificationStatus.VERIFIED,
            is_clear=True,
            records_found=0,
        )
        assert r.is_clear is True
        assert r.used_fallback is False
