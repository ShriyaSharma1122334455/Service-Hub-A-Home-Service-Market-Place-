import magic

ALLOWED_MIME_TYPES = {"image/jpeg", "image/png", "image/webp"}


def validate_image_mime(data: bytes) -> str:
    """Detect MIME type from magic bytes and reject anything that isn't an image.

    Raises ValueError with a user-facing message if the type is not allowed.
    Returns the detected MIME type string on success.
    """
    detected = magic.from_buffer(data[:2048], mime=True)
    if detected not in ALLOWED_MIME_TYPES:
        raise ValueError(
            f"Unsupported file type: {detected}. Only JPEG, PNG, and WebP images are accepted."
        )
    return detected
