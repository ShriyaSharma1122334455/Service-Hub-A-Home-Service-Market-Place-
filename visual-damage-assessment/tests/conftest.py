"""
Shared fixtures for VDA service tests.

Env vars are set here (before any app module is imported) so that
module-level constants in main.py (_SERVICE_TOKEN, _REQUIRE_SERVICE_AUTH)
are initialised with test values.
"""

import io
import os

# Must be set before `main` is imported so module-level constants are correct.
os.environ.setdefault("VDA_SERVICE_API_KEY", "test-token-abc")
os.environ.setdefault("VDA_REQUIRE_AUTH", "true")
os.environ.setdefault("GROQ_API_KEY", "fake-groq-key-for-tests")
os.environ.setdefault("VDA_ALLOWED_ORIGINS", "")

import pytest
from PIL import Image
from starlette.testclient import TestClient

from main import app

TEST_TOKEN = "test-token-abc"


def make_jpeg_bytes() -> bytes:
    """Return the bytes of a minimal 1×1 pixel JPEG image."""
    buf = io.BytesIO()
    Image.new("RGB", (1, 1), color=(100, 149, 237)).save(buf, format="JPEG")
    return buf.getvalue()


def make_png_bytes() -> bytes:
    """Return the bytes of a minimal 1×1 pixel PNG image."""
    buf = io.BytesIO()
    Image.new("RGB", (1, 1), color=(100, 149, 237)).save(buf, format="PNG")
    return buf.getvalue()


@pytest.fixture(scope="session")
def client():
    """Synchronous TestClient wrapping the FastAPI app (session-scoped — fast)."""
    return TestClient(app)


@pytest.fixture(scope="session")
def auth_headers():
    return {"X-Service-Token": TEST_TOKEN}


@pytest.fixture(scope="session")
def jpeg_bytes():
    return make_jpeg_bytes()


@pytest.fixture(scope="session")
def png_bytes():
    return make_png_bytes()
