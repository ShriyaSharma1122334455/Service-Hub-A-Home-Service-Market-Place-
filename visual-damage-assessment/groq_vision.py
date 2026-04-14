"""
Shared Groq vision logic: prompt, model registry, and image assessment.

Both the FastAPI server (main.py) and the CLI helper (sample_groq_test.py)
import from here so the prompt and parsing logic stay in one place.
"""
import base64
import io
import json
import logging
import os
import re
from typing import Optional

from dotenv import load_dotenv
from groq import Groq
from PIL import Image

load_dotenv()

logger = logging.getLogger(__name__)

GROQ_VISION_MODELS: dict[str, str] = {
    "llama4-scout": "meta-llama/llama-4-scout-17b-16e-instruct",
    "llama4-maverick": "meta-llama/llama-4-maverick-17b-128e-instruct",
    "llama3.2-11b": "llama-3.2-11b-vision-preview",
    "llama3.2-90b": "llama-3.2-90b-vision-preview",
}
DEFAULT_VISION_MODEL = "llama4-scout"


def _validate_model_exists(model_key: str) -> str:
    """
    Validate model key and return the model ID, falling back to default if invalid.

    Args:
        model_key: Key from GROQ_VISION_MODELS or environment variable

    Returns:
        Valid model ID string
    """
    if model_key in GROQ_VISION_MODELS:
        return GROQ_VISION_MODELS[model_key]

    logger.warning(
        "Unknown vision model '%s', falling back to default '%s'",
        model_key,
        DEFAULT_VISION_MODEL
    )
    return GROQ_VISION_MODELS[DEFAULT_VISION_MODEL]

SYSTEM_PROMPT = """
You are a professional visual assessment assistant.

Given an image and a brief user goal (for example, "I want to paint this wall to \
this color, what is your recommendation?" or "Can I repair this myself or do I need \
an expert?"), use your expert judgment to

1. Carefully analyze the image,
2. Interpret the user's intent or goal, even if it is NOT explicitly an assessment request,
3. Assess the relevant state, damage, suitability, and potential issues visible in the \
image with respect to the user's stated goal,
4. Assume that the user is seeking to hire professional labour to complete this task. \
Any estimated cost you provide must be a realistic, full estimate as if the user will \
hire a contractor or professional labour for the work. Do not estimate for DIY. Always \
include all likely labour, materials, and any other associated costs in your quote.
5. Communicate ONLY a valid JSON object in the following format:

{
  "assessment": "",        // Concise assessment relevant to user's goal, referencing what the image shows.
  "recommendation": "",    // Expert recommendation or next steps for the user based on the assessment and goal.
  "estimated_cost_usd": "", // Provide a specific estimated cost in USD for the user to hire professional labour
                            // or a contractor to fully complete the work. Do NOT answer "N/A" or leave blank;
                            // always give your best professional estimate for the full cost involved, even if
                            // it is a rough range.
  "confidence_score": ""   // Percentage (e.g. 85%) of your confidence in this assessment.
}

Do not include explanations or information outside the JSON object.
Do not request clarification; do your best with what is provided.
"""

_REQUIRED_FIELDS = {"assessment", "recommendation", "estimated_cost_usd", "confidence_score"}


def _encode_image(image_bytes: bytes, mime_type: str) -> str:
    """Re-encode image bytes through PIL and return a base64 data URL."""
    pil_format = "PNG" if mime_type == "image/png" else "JPEG"
    image = Image.open(io.BytesIO(image_bytes))
    buffer = io.BytesIO()
    image.save(buffer, format=pil_format)
    b64 = base64.b64encode(buffer.getvalue()).decode("utf-8")
    return f"data:{mime_type};base64,{b64}"


def _strip_fences(text: str) -> str:
    """Remove markdown code fences that the model sometimes wraps JSON in."""
    if not text.startswith("```"):
        return text
    lines = text.split("\n")
    if lines[0].startswith("```"):
        lines = lines[1:]
    if lines and lines[-1].strip() == "```":
        lines = lines[:-1]
    return "\n".join(lines)


def _sanitize_task_input(task: str, max_length: int = 500) -> str:
    """
    Sanitize user task input to prevent prompt injection attacks.

    Args:
        task: Raw user input describing their goal
        max_length: Maximum allowed length (default: 500)

    Returns:
        Sanitized task string safe for use in prompts
    """
    if not isinstance(task, str):
        return ""

    sanitized = task

    # Truncate to max length first
    if len(sanitized) > max_length:
        sanitized = sanitized[:max_length]

    # Define injection patterns to remove
    injection_patterns = [
        # Instruction overrides
        r'ignore\s+(previous|all|above|prior)\s+instructions?',
        r'disregard\s+(previous|all|above|prior)\s+instructions?',
        r'forget\s+(previous|all|above|prior)\s+instructions?',
        # System role attempts
        r'system\s*:',
        r'assistant\s*:',
        r'\[\s*system\s*\]',
        r'\[\s*assistant\s*\]',
        # Delimiter/fence attempts
        r'###\s*system',
        r'###\s*assistant',
        r'```system',
        r'```assistant',
        # Role switching attempts
        r'you\s+are\s+now',
        r'act\s+as\s+(a|an)\s+',
        r'pretend\s+to\s+be',
        # Direct instruction overrides
        r'new\s+instructions?:',
        r'updated\s+instructions?:',
        r'override\s+instructions?',
    ]

    # Remove injection patterns (case-insensitive)
    for pattern in injection_patterns:
        sanitized = re.sub(pattern, '', sanitized, flags=re.IGNORECASE)

    # Normalize whitespace (collapse multiple spaces/newlines)
    sanitized = re.sub(r'\s+', ' ', sanitized).strip()

    return sanitized


def _redact_for_logging(text: str, max_length: int = 200) -> str:
    """
    Redact PII and truncate text for safe logging.

    Args:
        text: Raw text that may contain sensitive information
        max_length: Maximum length of output (default: 200 chars)

    Returns:
        Redacted and truncated text safe for logging
    """
    # Truncate first to limit processing
    truncated = text[:max_length]

    # Redact email addresses
    truncated = re.sub(
        r'\b[A-Za-z0-9._%+-]+@[A-Za-z0-9.-]+\.[A-Z|a-z]{2,}\b',
        '[EMAIL]',
        truncated
    )

    # Redact phone numbers (various formats)
    truncated = re.sub(
        r'\b(?:\+?1[-.\s]?)?\(?\d{3}\)?[-.\s]?\d{3}[-.\s]?\d{4}\b',
        '[PHONE]',
        truncated
    )

    # Redact SSN patterns (XXX-XX-XXXX)
    truncated = re.sub(
        r'\b\d{3}-\d{2}-\d{4}\b',
        '[SSN]',
        truncated
    )

    if len(text) > max_length:
        truncated += "..."

    return truncated


def assess_image(
    image_bytes: bytes,
    mime_type: str,
    user_goal: str,
    model: str = DEFAULT_VISION_MODEL,
) -> Optional[dict]:
    """
    Run a visual assessment using Groq's vision model.

    Args:
        image_bytes: Raw bytes of the image (JPEG or PNG).
        mime_type:   MIME type string, e.g. "image/jpeg" or "image/png".
        user_goal:   The customer's stated goal or task.
        model:       Key from GROQ_VISION_MODELS (default: DEFAULT_VISION_MODEL).

    Returns:
        Parsed dict with assessment fields, or None if the model response
        could not be parsed as JSON.

    Raises:
        ValueError: If GROQ_API_KEY is not configured.
        KeyError:   If the requested model key is not in GROQ_VISION_MODELS.
    """
    api_key = os.getenv("GROQ_API_KEY")
    if not api_key:
        raise ValueError("GROQ_API_KEY is not set in environment or .env")

    model_id = _validate_model_exists(model)
    image_data_url = _encode_image(image_bytes, mime_type)

    # Sanitize user input to prevent prompt injection
    sanitized_goal = _sanitize_task_input(user_goal)

    client = Groq(api_key=api_key)
    response = client.chat.completions.create(
        model=model_id,
        messages=[
            {"role": "system", "content": SYSTEM_PROMPT},
            {
                "role": "user",
                "content": [
                    {"type": "text", "text": f"User's stated goal:\n{sanitized_goal}"},
                    {"type": "image_url", "image_url": {"url": image_data_url}},
                ],
            },
        ],
        max_tokens=1024,
        timeout=60,
    )

    raw = (response.choices[0].message.content or "").strip()
    cleaned = _strip_fences(raw)

    try:
        return json.loads(cleaned)
    except json.JSONDecodeError:
        redacted_output = _redact_for_logging(cleaned)
        logger.warning("Model did not return valid JSON:\n%s", redacted_output)
        return None
