from pydantic_settings import SettingsConfigDict, BaseSettings
from typing import List

class Settings(BaseSettings):
    # ── Pydantic V2 Configuration ─────────────────────────────────────────
    model_config = SettingsConfigDict(
        env_file=".env", 
        env_file_encoding="utf-8", 
        extra="ignore"
    )

    # ── Service ───────────────────────────────────────────────────────────
    ENV: str = "development"
    # NOTE: Port 8000 is taken by visual-damage-assessment (see docker-compose.yml).
    # ai-services MUST use 8001 to avoid conflict.
    PORT: int = 8001
    ALLOWED_ORIGINS: List[str] = [
        "http://localhost:3000",   # React frontend dev server
        "http://localhost:5000",   # Express backend
        "http://backend:5000",     # Docker service name
    ]

    # ── Google Cloud Vision (OCR) ─────────────────────────────────────────
    GOOGLE_APPLICATION_CREDENTIALS: str | None = None
    GOOGLE_CREDENTIALS_JSON: str | None = None

    # ── AWS Rekognition (Face Matching) ───────────────────────────────────
    AWS_ACCESS_KEY_ID: str = "AWS_ACCESS_KEY_ID"
    AWS_SECRET_ACCESS_KEY: str = "AWS_SECRET_ACCESS_KEY"
    AWS_REGION: str = "us-east-1"

    # ── Cloudinary (image source) ─────────────────────────────────────────
    CLOUDINARY_CLOUD_NAME: str = "CLOUDINARY_CLOUD_NAME"
    CLOUDINARY_API_KEY: str = "CLOUDINARY_API_KEY"
    CLOUDINARY_API_SECRET: str = "CLOUDINARY_API_SECRET"

    # ── Verification thresholds ───────────────────────────────────────────
    FACE_MATCH_THRESHOLD: float = 80.0

    # ── Internal service auth ─────────────────────────────────────────────
    # Express backend sends this header so only it can call this service
    INTERNAL_API_KEY: str = "INTERNAL_API_KEY"

settings = Settings()