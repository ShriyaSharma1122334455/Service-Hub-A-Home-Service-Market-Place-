from pydantic_settings import BaseSettings
from typing import List


class Settings(BaseSettings):
    # ── Service ───────────────────────────────────────────────────────────
    ENV: str = "development"
    PORT: int = 8001
    ALLOWED_ORIGINS: List[str] = [
        "http://localhost:3000",   # React frontend dev server
        "http://localhost:5000",   # Express backend
        "http://backend:5000",     # Docker service name
    ]

    # ── Google Cloud Vision (OCR) ─────────────────────────────────────────
    GOOGLE_APPLICATION_CREDENTIALS: str = ""
    GOOGLE_CREDENTIALS_JSON: str = ""   # Alternative: raw JSON string for deployment

    # ── AWS Rekognition (Face Matching) ───────────────────────────────────
    AWS_ACCESS_KEY_ID: str = ""
    AWS_SECRET_ACCESS_KEY: str = ""
    AWS_REGION: str = "us-east-1"

    # ── Cloudinary (image source) ─────────────────────────────────────────
    CLOUDINARY_CLOUD_NAME: str = ""
    CLOUDINARY_API_KEY: str = ""
    CLOUDINARY_API_SECRET: str = ""

    # ── Verification thresholds ───────────────────────────────────────────
    FACE_MATCH_THRESHOLD: float = 80.0

    # ── Internal service auth ─────────────────────────────────────────────
    # Express backend sends this header so only it can call this service
    INTERNAL_API_KEY: str = "change-me-in-production"

    class Config:
        env_file = ".env"
        env_file_encoding = "utf-8"


settings = Settings()
