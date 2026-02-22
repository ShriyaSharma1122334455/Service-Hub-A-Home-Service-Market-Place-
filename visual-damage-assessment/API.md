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

**What it does:** Takes an image and a task description, sends it to Groq's Llama 4 vision model, and returns a structured assessment including damage analysis, recommendations, and estimated cost for professional repair.

**How it works:**
1. Validates the image file (JPEG/PNG, max 10MB)
2. Encodes the image as base64
3. Sends both the image and task to the AI model with a professional assessment prompt
4. Parses the AI response and returns structured data

**Input (multipart/form-data):**

| Field | Type | Required | Description |
|-------|------|----------|-------------|
| `image` | File | Yes | Image file (JPEG or PNG). Max 10MB. |
| `task` | String | No | What you want assessed (e.g., "I want to repaint this wall", "Is this safe?"). Defaults to generic assessment. |

**Example:**
```bash
curl -X POST "http://localhost:8000/assess" \
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
  "detail": "Invalid file type. Allowed types: JPEG, PNG. Got: image/gif"
}
```

File too large (400):
```json
{
  "detail": "File size exceeds maximum allowed (10MB). Got: 15.50MB"
}
```

Missing API key (500):
```json
{
  "detail": "GROQ_API_KEY not set in environment or .env"
}
```

Invalid response from AI (500):
```json
{
  "detail": "Failed to parse assessment response. Model did not return valid JSON."
}
```
