# Visual Damage Assessment API

AI-powered image analysis service that provides professional damage assessments, repair recommendations, and cost estimates using Google's Gemma 4 multimodal models via the Gemini API (Google AI Studio).

## Features

- **Intelligent Image Analysis** - Advanced computer vision for accurate damage detection and assessment
- **Professional Cost Estimates** - Realistic cost projections for professional repair services
- **Expert Recommendations** - Contextual repair guidance based on damage severity and type
- **Secure Authentication** - Token-based service authentication with configurable access control
- **Input Validation** - Comprehensive validation with MIME type verification and size limits
- **RESTful API** - Clean, well-documented endpoints with OpenAPI specification

## Requirements

- Python 3.11 or higher
- Google AI Studio / Gemini API key (`GEMINI_API_KEY`) for Gemma 4 vision access

**Environment Variables:**
Create a `.env` file with the following configuration:

```env
# Required: Google AI Studio API key (https://aistudio.google.com/apikey)
GEMINI_API_KEY=your_gemini_api_key_here

# Required: Service authentication token
VDA_SERVICE_API_KEY=your_secure_token_here

# Optional: Vision model — short key (gemma-4-26b-a4b, gemma-4-31b) or full id (e.g. gemma-4-26b-a4b-it)
# VDA_VISION_MODEL=gemma-4-26b-a4b

# Optional: Enable/disable authentication (default: true)
VDA_REQUIRE_AUTH=true

# Optional: Allowed CORS origins (comma-separated)
VDA_ALLOWED_ORIGINS=http://localhost:3000,http://localhost:5173
```

See `.env.example` for a complete template.

## Installation

### Local Development

1. **Install dependencies:**
   ```bash
   pip install -r requirements.txt
   ```

2. **Configure environment:**
   ```bash
   cp .env.example .env
   # Edit .env with your credentials
   ```

3. **Run the server:**
   ```bash
   python main.py
   ```

### Docker Deployment

**Development:**
```bash
docker compose -f docker-compose-dev.yml up --build
```

**Production:**
```bash
docker build -t vda-service .
docker run -p 8000:8000 --env-file .env vda-service
```

The API will be available at `http://localhost:8000`

## Usage

### Quick Start

```bash
curl -X POST http://localhost:8000/assess \
  -H "X-Service-Token: your_service_token" \
  -F "image=@damage.jpg" \
  -F "task=Assess wall damage and estimate repair cost"
```

### Response Example

```json
{
  "assessment": "The wall shows significant water damage with visible staining and paint peeling in a 3x4 foot area.",
  "recommendation": "Professional drywall repair and repainting recommended. Check for underlying moisture issues before repair.",
  "estimated_cost_usd": "$400-600",
  "confidence_score": "92%"
}
```

## API Documentation

### Endpoints

- `GET /` - Service information and available endpoints
- `GET /health` - Health check endpoint
- `POST /assess` - Analyze image and provide assessment

**Interactive Documentation:**
- Swagger UI: `http://localhost:8000/docs`
- ReDoc: `http://localhost:8000/redoc`

See [API.md](API.md) for detailed endpoint documentation.

## Security

The service implements multiple security layers:

- **Service Token Authentication** — validates `X-Service-Token` header for authorized access.
- **MIME Type Validation (anti-spoofing)** — verifies file content using magic bytes via `libmagic`. A startup probe refuses to boot if the native library is missing, so the check can never be silently bypassed.
- **Decompression-Bomb Guard** — rejects images whose declared dimensions exceed `25 Mpx` or `10 000 px` on any edge *before* Pillow materializes a pixel buffer, and promotes Pillow's bomb warnings to errors during resize.
- **Prompt Injection Protection** — strict JSON response schema enforced at the provider is the authoritative defense; NFKC normalization + invisible/bidi-char stripping + denylist sanitizer of the user task provide defense in depth, and the model is instructed to treat text *inside* the image as content, not instructions.
- **Rate Limiting** — per-route limits via `slowapi`, bucketed by a hash of the service token (or client IP if absent), so a leaked token can't burn unlimited model quota. Tune with `VDA_ASSESS_RATE_LIMIT` / `VDA_DEFAULT_RATE_LIMIT`.
- **Bounded Concurrency** — `/assess` is gated by an `asyncio.Semaphore` (`VDA_ASSESS_CONCURRENCY`, default 4) so a burst of large uploads can't queue unbounded upstream calls on a worker.
- **Input Length Limits** — 500-character cap on task text, 10 MB cap on images, per-field caps on model output.
- **PII Redaction** — emails, phone numbers, and SSN-like strings are scrubbed from log output.
- **Model Validation** — graceful fallback to the default model for unknown `VDA_VISION_MODEL` keys.

**Configuration:**
- Authentication is enabled by default (`VDA_REQUIRE_AUTH=true`).
- CORS is disabled by default; configure `VDA_ALLOWED_ORIGINS` only when needed.
- Always use HTTPS in production environments.

## Testing

Run the test suite to verify functionality:

```bash
# Run all tests
pytest tests/ -v

# Run with coverage report
pytest tests/ --cov=. --cov-report=html

# Run specific test file
pytest tests/test_main.py -v
```

**Test Coverage:**
- 65 tests covering endpoints, image safety, prompt sanitization, rate limiting, and configuration
- FastAPI endpoint + image-safety + rate-limit tests — `tests/test_main.py` (20 tests)
- Gemini/Gemma 4 vision logic tests — `tests/test_gemini_vision.py` (36 tests)
- Startup / `VDA_REQUIRE_AUTH` validation tests — `tests/test_startup.py` (9 tests)

## Available models

Hosted Gemma 4 models via the Gemini API:

- `gemma-4-26b-a4b` → `gemma-4-26b-a4b-it` (default) — MoE 26B/A4B, fast and cost-efficient with strong multimodal quality for assessments
- `gemma-4-31b` → `gemma-4-31b-it` — dense 31B, heavier reasoning option

You can also set `VDA_VISION_MODEL` to a full API model id (e.g. `gemma-4-26b-a4b-it`).

## Image pre-processing

Before any image is sent to the model, the service:

- Applies EXIF orientation so phone photos aren't analyzed sideways.
- Flattens transparent PNGs onto a white background.
- Downscales so the longest edge is at most **1024 px** (Lanczos resampling).
- Re-encodes as JPEG at quality 90.

This keeps damage cues (cracks, stains, rust, wear) clearly legible while cutting
upload size, latency, and token cost dramatically vs. sending the raw 4K photo
from a phone camera.

## Project Structure

```
visual-damage-assessment/
├── main.py                  # FastAPI application entry point
├── gemini_vision.py         # Gemini / Gemma 4 vision integration
├── requirements.txt         # Production dependencies
├── pytest.ini               # Test configuration
├── Dockerfile               # Production container image
├── docker-compose-dev.yml   # Development environment
├── .env.example             # Environment variable template
├── README.md                # This file
├── API.md                   # API documentation
└── tests/
    ├── test_main.py         # FastAPI endpoint, image-safety, rate-limit tests
    ├── test_gemini_vision.py# Vision logic + prompt-sanitization tests
    └── test_startup.py      # Startup configuration tests
```

## Contributing

Please ensure all tests pass before submitting changes:

```bash
pytest tests/ -v
```

## License

See the main project repository for license information.
