from fastapi import FastAPI
from fastapi.middleware.cors import CORSMiddleware
from contextlib import asynccontextmanager

from app.core.config import settings
from app.routes import health, profile
from app.routes import ocr_routes, face_routes, nsopw_routes
# Legacy verification routes kept for backward compatibility
from app.routes import verification as legacy_verification
from app.middleware.timer import TimingMiddleware


@asynccontextmanager
async def lifespan(app: FastAPI):
    print(f"🚀 ServiceHub Verification Service starting on port {settings.PORT}")
    print(f"📋 Environment: {settings.ENV}")
    print("📡 Standardized routes:")
    print("   POST /ai/ocr/parse-id")
    print("   POST /ai/face/match")
    print("   POST /ai/nsopw/check")
    yield
    print("🛑 Verification Service shutting down")


app = FastAPI(
    title="ServiceHub Verification Service",
    description="AI-powered ID verification, face matching, and NSOPW check",
    version="2.0.0",
    lifespan=lifespan,
    docs_url="/docs",
    redoc_url="/redoc",
)

# Custom Timing Middleware
app.add_middleware(TimingMiddleware)

# CORS Middleware
app.add_middleware(
    CORSMiddleware,
    allow_origins=settings.ALLOWED_ORIGINS,
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)

# ── Standardized Routes ──────────────────────────────────────────────────
#
# POST /ai/ocr/parse-id    — OCR ID extraction
# POST /ai/face/match      — Face matching (selfie vs ID)
# POST /ai/nsopw/check     — NSOPW background check
#
app.include_router(ocr_routes.router,   prefix="/ai/ocr",   tags=["OCR"])
app.include_router(face_routes.router,  prefix="/ai/face",  tags=["Face Matching"])
app.include_router(nsopw_routes.router, prefix="/ai/nsopw", tags=["NSOPW"])

# ── Utility Routes ───────────────────────────────────────────────────────
app.include_router(health.router,  prefix="/health",  tags=["Health"])
app.include_router(profile.router, prefix="/api/v1/profile", tags=["Profile"])

# ── Legacy Routes (backward compatibility) ────────────────────────────────
# Keep the old /api/v1/verify/* paths alive so existing backend code still works
# until verificationController.js is updated to call /ai/* paths.
app.include_router(legacy_verification.router, prefix="/api/v1/verify", tags=["Verification (Legacy)"])


@app.get("/")
async def root():
    return {
        "service": "ServiceHub Verification Service",
        "version": "2.0.0",
        "status": "online",
        "routes": {
            "ocr":   "POST /ai/ocr/parse-id",
            "face":  "POST /ai/face/match",
            "nsopw": "POST /ai/nsopw/check",
        },
        "legacy_routes": {
            "document": "POST /api/v1/verify/document",
            "face":     "POST /api/v1/verify/face",
            "nsopw":    "POST /api/v1/verify/nsopw",
        },
        "docs": "/docs",
    }
