"""
FastAPI server for visual damage assessment using Google AI Studio (Gemini API / Gemma 4).
"""
import asyncio
import hashlib
import logging
import os
import secrets
from typing import Optional

import httpx
import magic
from fastapi import Depends, FastAPI, File, Form, Header, HTTPException, Request, Response, UploadFile
from fastapi.middleware.cors import CORSMiddleware
from google.genai import errors as genai_errors
from pydantic import BaseModel
from slowapi import Limiter, _rate_limit_exceeded_handler
from slowapi.errors import RateLimitExceeded
from slowapi.middleware import SlowAPIMiddleware
from slowapi.util import get_remote_address

from gemini_vision import DEFAULT_VISION_MODEL, ImageValidationError, assess_image

logging.basicConfig(level=logging.INFO)
logger = logging.getLogger(__name__)

# Import-time probe: python-magic is a ctypes wrapper around the native
# libmagic library. `import magic` succeeds even when libmagic is missing,
# and the failure only surfaces on the first call. Probe once at startup
# with a known PNG header so a misconfigured image (no libmagic installed)
# fails loudly at boot instead of silently bypassing our anti-spoofing check.
try:
    _probe = magic.from_buffer(b"\x89PNG\r\n\x1a\n", mime=True)
    if _probe != "image/png":
        logger.warning(
            "libmagic probe returned unexpected MIME '%s'; anti-spoofing may be degraded",
            _probe,
        )
except Exception as exc:  # pragma: no cover - hard startup failure
    logger.critical(
        "libmagic is not available — magic-byte MIME validation cannot run. "
        "Install 'libmagic1' (Debian/Ubuntu) or 'libmagic' (Alpine/macOS). "
        "Original error: %s",
        exc,
    )
    raise RuntimeError(
        "libmagic native library is missing; refusing to start without "
        "anti-spoofing MIME validation."
    ) from exc

_ALLOWED_MIME_TYPES = {"image/jpeg", "image/png"}
_MAX_IMAGE_BYTES = 10 * 1024 * 1024  # 10 MB
_TASK_MAX_LENGTH = 500  # Maximum characters for task description
_SERVICE_TOKEN = os.getenv("VDA_SERVICE_API_KEY", "").strip()
_VISION_MODEL = os.getenv("VDA_VISION_MODEL", DEFAULT_VISION_MODEL).strip() or DEFAULT_VISION_MODEL

# Validate VDA_REQUIRE_AUTH with explicit value checking to prevent typos
_KNOWN_TRUE_VALUES = {"1", "true", "yes", "on"}
_KNOWN_FALSE_VALUES = {"0", "false", "no", "off"}
_auth_env = os.getenv("VDA_REQUIRE_AUTH", "true").strip().lower()

if _auth_env not in (_KNOWN_TRUE_VALUES | _KNOWN_FALSE_VALUES):
    logger.error(f"Invalid VDA_REQUIRE_AUTH value: {_auth_env!r}")
    logger.error(f"Valid values: {', '.join(sorted(_KNOWN_TRUE_VALUES | _KNOWN_FALSE_VALUES))}")
    raise ValueError(
        f"Invalid VDA_REQUIRE_AUTH value: {_auth_env!r}. "
        f"Valid values: {', '.join(sorted(_KNOWN_TRUE_VALUES | _KNOWN_FALSE_VALUES))}"
    )

_REQUIRE_SERVICE_AUTH = _auth_env in _KNOWN_TRUE_VALUES

# Log warning if auth is disabled
if not _REQUIRE_SERVICE_AUTH:
    logger.warning("⚠️  VDA_REQUIRE_AUTH is disabled - service authentication is turned off")
    logger.warning("   This should only be used in development/testing environments")
_ALLOWED_ORIGINS = [
    origin.strip()
    for origin in os.getenv("VDA_ALLOWED_ORIGINS", "").split(",")
    if origin.strip()
]

# Rate-limit knobs (env-tunable so tests can crank them down).
_ASSESS_RATE_LIMITS = os.getenv("VDA_ASSESS_RATE_LIMIT", "20/minute;200/hour")
_DEFAULT_RATE_LIMIT = os.getenv("VDA_DEFAULT_RATE_LIMIT", "60/minute")
# Maximum concurrent /assess handlers that may hit the Gemini API from this
# worker. Protects against saturation when many 10 MB uploads land at once.
_ASSESS_CONCURRENCY = int(os.getenv("VDA_ASSESS_CONCURRENCY", "4"))


def _rate_limit_key(request: Request) -> str:
    """
    Bucket callers by service token (authenticated backends) or by IP
    (anyone else). Using the token keeps a single backend from being
    penalized for having many real customers, while ensuring a leaked
    token still can't burn unlimited Gemini quota.
    """
    token = request.headers.get("X-Service-Token", "").strip()
    if token:
        # Hash so the raw token never appears in in-memory limit keys / logs.
        return "token:" + hashlib.sha256(token.encode("utf-8")).hexdigest()[:16]
    return "ip:" + get_remote_address(request)


limiter = Limiter(
    key_func=_rate_limit_key,
    default_limits=[_DEFAULT_RATE_LIMIT],
    headers_enabled=True,
)

# Bounded worker-local concurrency for /assess. asyncio.Semaphore is created
# lazily (inside the handler) to attach to the running loop FastAPI uses.
_assess_semaphore: Optional[asyncio.Semaphore] = None


def _get_assess_semaphore() -> asyncio.Semaphore:
    global _assess_semaphore
    if _assess_semaphore is None:
        _assess_semaphore = asyncio.Semaphore(_ASSESS_CONCURRENCY)
    return _assess_semaphore


app = FastAPI(
    title="Visual Damage Assessment API",
    description="Analyze images and assess damages or tasks using AI-powered visual assessment",
    version="1.0.0",
)

app.state.limiter = limiter
app.add_exception_handler(RateLimitExceeded, _rate_limit_exceeded_handler)
app.add_middleware(SlowAPIMiddleware)

if _ALLOWED_ORIGINS:
    app.add_middleware(
        CORSMiddleware,
        allow_origins=_ALLOWED_ORIGINS,
        allow_credentials=False,
        allow_methods=["POST", "GET"],
        allow_headers=["Content-Type", "X-Service-Token"],
    )
else:
    logger.info("CORS middleware not enabled (VDA_ALLOWED_ORIGINS is empty).")


class AssessmentResponse(BaseModel):
    assessment: str
    recommendation: str
    estimated_cost_usd: str
    confidence_score: str


class ErrorResponse(BaseModel):
    error: str
    detail: Optional[str] = None


async def require_service_token(
    x_service_token: Optional[str] = Header(default=None, alias="X-Service-Token"),
):
    """Allow only trusted backend callers to use /assess."""
    if not _REQUIRE_SERVICE_AUTH:
        return
    if not _SERVICE_TOKEN:
        logger.error("VDA service auth is required but VDA_SERVICE_API_KEY is not set.")
        raise HTTPException(
            status_code=503,
            detail="Service is not configured for authenticated access.",
        )
    if not x_service_token or not secrets.compare_digest(x_service_token, _SERVICE_TOKEN):
        raise HTTPException(status_code=401, detail="Unauthorized")


@app.get("/")
async def root():
    """API information and available endpoints."""
    return {
        "message": "Visual Damage Assessment API",
        "endpoints": {
            "health": "/health",
            "assess": "/assess",
            "docs": "/docs",
            "redoc": "/redoc",
        },
    }


@app.get("/health")
async def health_check():
    """Liveness probe."""
    return {"status": "healthy", "service": "Visual Damage Assessment API"}


@app.post(
    "/assess",
    response_model=AssessmentResponse,
    responses={
        400: {"model": ErrorResponse},
        422: {"model": ErrorResponse},
        429: {"model": ErrorResponse},
        500: {"model": ErrorResponse},
        503: {"model": ErrorResponse},
    },
)
@limiter.limit(_ASSESS_RATE_LIMITS)
async def assess_damage(
    request: Request,
    response: Response,
    _: None = Depends(require_service_token),
    image: UploadFile = File(..., description="Image file to analyze (JPEG or PNG)"),
    task: str = Form(
        default="I want an expert visual assessment for my goal.",
        max_length=_TASK_MAX_LENGTH,
        description=(
            "Describe your goal or task related to the image "
            "(e.g., 'I want to repaint this wall', 'Is this safe?', 'What repair is needed?'). "
            f"Maximum {_TASK_MAX_LENGTH} characters."
        ),
    ),
):
    """
    Analyze an image and provide a visual assessment with cost estimate.

    - **image**: JPEG or PNG, max 10 MB
    - **task**: What you want assessed or achieved
    """
    if image.content_type not in _ALLOWED_MIME_TYPES:
        raise HTTPException(
            status_code=400,
            detail=f"Invalid file type '{image.content_type}'. Allowed: JPEG, PNG.",
        )

    contents = await image.read()

    if len(contents) > _MAX_IMAGE_BYTES:
        raise HTTPException(
            status_code=400,
            detail=(
                f"File size {len(contents) / 1024 / 1024:.2f} MB exceeds the 10 MB limit."
            ),
        )

    # Validate file content using magic bytes (prevents MIME type spoofing)
    try:
        detected_mime = magic.from_buffer(contents, mime=True)
    except Exception as exc:
        logger.warning(f"Failed to detect file type: {exc}")
        raise HTTPException(
            status_code=400,
            detail="Unable to verify file type. Please upload a valid image.",
        )

    if detected_mime not in _ALLOWED_MIME_TYPES:
        raise HTTPException(
            status_code=400,
            detail=(
                f"File content does not match declared type. "
                f"Detected: {detected_mime}, Expected: JPEG or PNG."
            ),
        )

    # Gate the blocking Gemini call through a bounded semaphore so a burst
    # of large uploads can't queue unbounded model calls on this worker.
    semaphore = _get_assess_semaphore()
    try:
        async with semaphore:
            result = await asyncio.to_thread(
                assess_image, contents, image.content_type, task, _VISION_MODEL
            )
    except ImageValidationError as exc:
        # Dedicated class for pre-decode safety rejections (dimension / bomb
        # guard). Map to 400 without surfacing the internal reason verbatim.
        logger.warning(f"Image validation failed: {exc}")
        raise HTTPException(
            status_code=400,
            detail="Image failed safety checks (dimensions or format). Please upload a standard photo.",
        )
    except ValueError as exc:
        logger.error(f"ValueError during assessment: {exc}")
        raise HTTPException(
            status_code=503,
            detail="Service temporarily unavailable. Please try again later.",
        )
    except KeyError as exc:
        logger.error(f"Unknown vision model: {exc}")
        raise HTTPException(status_code=500, detail="Internal configuration error.")
    except httpx.TimeoutException as exc:
        logger.error(f"Upstream Gemini request timed out: {exc}")
        raise HTTPException(
            status_code=504,
            detail="Upstream AI provider timed out. Please try again.",
        )
    except genai_errors.APIError as exc:
        logger.error(
            "Gemini API error: code=%s message=%s",
            getattr(exc, "code", "?"),
            getattr(exc, "message", str(exc)),
        )
        raise HTTPException(
            status_code=502,
            detail="Upstream AI provider returned an error.",
        )
    except Exception as exc:
        logger.exception("Unexpected error during assessment")
        raise HTTPException(
            status_code=500,
            detail="An unexpected error occurred. Please try again later.",
        )

    if result is None:
        raise HTTPException(
            status_code=500,
            detail="Model did not return valid JSON. Please try again.",
        )

    required = {"assessment", "recommendation", "estimated_cost_usd", "confidence_score"}
    missing = required - set(result.keys())
    if missing:
        raise HTTPException(
            status_code=500,
            detail=f"Incomplete model response. Missing fields: {missing}",
        )

    return AssessmentResponse(**result)


if __name__ == "__main__":
    import uvicorn

    uvicorn.run(app, host="0.0.0.0", port=8000, log_level="info")
