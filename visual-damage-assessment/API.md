# Visual Damage Assessment API

## GET /

Get basic API information and available endpoints.

**What it does:** Returns a welcome message with a list of all available endpoints.

**Input:** None

**Output:**
```json
{
  "message": "Visual Damage Assessment API",
  "endpoints": {
    "health": "/health",
    "assess": "/assess",
    "docs": "/docs",
    "redoc": "/redoc"
  }
}
```

---

## GET /health

Quick health check for the API.

**What it does:** Confirms the API is running and responding normally.

**Input:** None

**Output:**
```json
{
  "status": "healthy",
  "service": "Visual Damage Assessment API"
}
```

---

## POST /assess

Analyze an image and get a professional damage assessment with cost estimate.

**Authentication:** Requires `X-Service-Token: <VDA_SERVICE_API_KEY>` when `VDA_REQUIRE_AUTH=true` (default). If auth is disabled for local testing (`VDA_REQUIRE_AUTH=false`), this header is not required.

**What it does:** Takes an image and a task description, sends it to Groq's Llama 4 vision model, and returns a structured assessment including damage analysis, recommendations, and estimated cost for professional repair.

**How it works:**
1. Validates the image file (JPEG/PNG, max 10MB)
2. Reads image bytes and prepares them for model input
3. Verifies actual file content using magic-byte MIME detection (anti-spoofing check)
4. Sends both the image and task to the AI model with a professional assessment prompt
4. Parses and validates the AI response structure before returning it

**Input (multipart/form-data):**

| Field | Type | Required | Description |
|-------|------|----------|-------------|
| `image` | File | Yes | Image file (JPEG or PNG). Max 10MB. |
| `task` | String | No | What you want assessed (e.g., "I want to repaint this wall", "Is this safe?"). Defaults to generic assessment. |

**Example:**
```bash
curl -X POST "http://localhost:8000/assess" \
  -H "X-Service-Token: your_shared_secret" \
  -F "image=@wall_damage.jpg" \
  -F "task=Can I repair this water damage myself or do I need a professional?"
```

**Output (Success - 200):**
```json
{
  "assessment": "The wall shows significant water damage with visible mold growth in the corners...",
  "recommendation": "You should hire a professional mold remediation specialist...",
  "estimated_cost_usd": "$2,500-$4,000",
  "confidence_score": "92%"
}
```

**Errors:**

Invalid file type (400):
```json
{
  "detail": "Invalid file type 'image/gif'. Allowed: JPEG, PNG."
}
```

File too large (400):
```json
{
  "detail": "File size 15.50 MB exceeds the 10 MB limit."
}
```

Unauthorized (401):
```json
{
  "detail": "Unauthorized"
}
```

Service auth misconfiguration (503):
```json
{
  "detail": "Service is not configured for authenticated access."
}
```

Task validation error (422):
```json
{
  "detail": [
    {
      "loc": ["body", "task"],
      "msg": "String should have at most 500 characters",
      "type": "string_too_long"
    }
  ]
}
```

Upstream model/service temporarily unavailable (503):
```json
{
  "detail": "Service temporarily unavailable. Please try again later."
}
```

Invalid response from AI (500):
```json
{
  "detail": "Model did not return valid JSON. Please try again."
}
```

Incomplete model response (500):
```json
{
  "detail": "Incomplete model response. Missing fields: {'confidence_score'}"
}
```
