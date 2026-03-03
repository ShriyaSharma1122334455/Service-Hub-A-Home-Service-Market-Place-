from pydantic import BaseModel, Field, field_validator, EmailStr
from typing import Optional
from enum import Enum
import re


# ── Enums ─────────────────────────────────────────────────────────────────

class VerificationStatus(str, Enum):
    VERIFIED      = "verified"
    REJECTED      = "rejected"
    MANUAL_REVIEW = "manual_review"


class DocumentType(str, Enum):
    DRIVERS_LICENSE = "drivers_license"
    PASSPORT        = "passport"
    PASSPORT_CARD   = "passport_card"


# ── Document Verification ─────────────────────────────────────────────────

class DocumentVerifyRequest(BaseModel):
    image_url:     str          = Field(..., description="Cloudinary URL of the uploaded ID document")
    document_type: DocumentType = Field(DocumentType.DRIVERS_LICENSE)
    user_id:       str          = Field(..., description="ServiceHub MongoDB user ID")


class ExtractedIDData(BaseModel):
    full_name:       Optional[str] = None
    date_of_birth:   Optional[str] = None   # ISO: YYYY-MM-DD
    address:         Optional[str] = None
    id_number:       Optional[str] = None
    expiration_date: Optional[str] = None
    issue_state:     Optional[str] = None
    raw_text:        Optional[str] = None   # Full OCR dump for debugging


class DocumentVerifyResponse(BaseModel):
    status:             VerificationStatus
    extracted_data:     Optional[ExtractedIDData] = None
    confidence_score:   float = Field(..., ge=0.0, le=1.0)
    rejection_reason:   Optional[str] = None
    is_expired:         Optional[bool] = None
    document_authentic: Optional[bool] = None


# ── Face Matching ─────────────────────────────────────────────────────────

class FaceMatchRequest(BaseModel):
    id_image_url: str = Field(..., description="Cloudinary URL of the ID document")
    selfie_url:   str = Field(..., description="Cloudinary URL of the live selfie")
    user_id:      str = Field(..., description="ServiceHub MongoDB user ID")


class FaceMatchResponse(BaseModel):
    status:                   VerificationStatus
    similarity_score:         float = Field(..., ge=0.0, le=100.0)
    threshold_used:           float
    is_match:                 bool
    rejection_reason:         Optional[str]  = None
    face_detected_in_selfie:  Optional[bool] = None
    face_detected_in_id:      Optional[bool] = None


# ── NSOPW Check ───────────────────────────────────────────────────────────

class NSopwCheckRequest(BaseModel):
    full_name: str           = Field(..., description="Provider's legal name from their ID")
    state:     Optional[str] = Field(None, description="Two-letter state code, e.g. NJ")
    user_id:   str           = Field(..., description="ServiceHub MongoDB provider user ID")


class NSopwCheckResponse(BaseModel):
    status:                   VerificationStatus
    is_clear:                 bool  = Field(..., description="True = no records found")
    records_found:            int   = Field(0)
    rejection_reason:         Optional[str]  = None
    used_fallback:            bool  = Field(False)
    self_declaration_required: bool = Field(False)


# ── Profile Update ────────────────────────────────────────────────────────

class ProfileUpdateRequest(BaseModel):
    full_name: str       = Field(..., min_length=2, max_length=100, description="User's full name")
    email:     EmailStr  = Field(..., description="User's email address")
    phone:     Optional[str] = Field(None, description="Phone in E.164 format, e.g. +12025551234")
    bio:       Optional[str] = Field(None, max_length=500, description="Short bio (max 500 chars)")

    @field_validator("full_name")
    @classmethod
    def validate_full_name(cls, v: str) -> str:
        v = v.strip()
        if not re.match(r"^[A-Za-z\s\-']+$", v):
            raise ValueError("Name may only contain letters, spaces, hyphens, and apostrophes")
        return v

    @field_validator("phone")
    @classmethod
    def validate_phone(cls, v: Optional[str]) -> Optional[str]:
        if v is None or v == "":
            return None
        cleaned = v.strip()
        if not re.match(r"^\+?[1-9]\d{1,14}$", cleaned):
            raise ValueError("Phone must be in E.164 format, e.g. +12025551234")
        return cleaned


class ProfileUpdateResponse(BaseModel):
    message:    str
    full_name:  str
    email:      str
    phone:      Optional[str] = None
    bio:        Optional[str] = None
    avatar_url: Optional[str] = None


class ImageUploadResponse(BaseModel):
    message:    str
    secure_url: str
    public_id:  str
