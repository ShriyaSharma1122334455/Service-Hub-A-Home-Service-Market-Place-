_SIGNATURES = {
    b"\xff\xd8\xff": "image/jpeg",
    b"\x89PNG\r\n\x1a\n": "image/png",
}
_WEBP_RIFF = b"RIFF"
_WEBP_MARKER = b"WEBP"

ALLOWED_MIME_TYPES = {"image/jpeg", "image/png", "image/webp"}


def _detect_mime(data: bytes) -> str:
    """Detect image MIME type from leading magic bytes without any system library."""
    head = data[:12]
    if head[:3] == b"\xff\xd8\xff":
        return "image/jpeg"
    if head[:8] == b"\x89PNG\r\n\x1a\n":
        return "image/png"
    if head[:4] == _WEBP_RIFF and head[8:12] == _WEBP_MARKER:
        return "image/webp"
    return "application/octet-stream"


def validate_image_mime(data: bytes) -> str:
    """Reject uploads whose magic bytes don't match a supported image format.

    Raises ValueError with a user-facing message if the type is not allowed.
    Returns the detected MIME type string on success.
    """
    detected = _detect_mime(data)
    if detected not in ALLOWED_MIME_TYPES:
        raise ValueError(
            f"Unsupported file type: {detected}. Only JPEG, PNG, and WebP images are accepted."
        )
    return detected
