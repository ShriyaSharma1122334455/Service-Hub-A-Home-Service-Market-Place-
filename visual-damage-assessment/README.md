# Visual Damage Assessment API

AI-powered image analysis service that provides professional damage assessments, repair recommendations, and cost estimates using Groq's Llama 4 vision models.

## Features

- **Intelligent Image Analysis** - Advanced computer vision for accurate damage detection and assessment
- **Professional Cost Estimates** - Realistic cost projections for professional repair services
- **Expert Recommendations** - Contextual repair guidance based on damage severity and type
- **Secure Authentication** - Token-based service authentication with configurable access control
- **Input Validation** - Comprehensive validation with MIME type verification and size limits
- **RESTful API** - Clean, well-documented endpoints with OpenAPI specification

## Requirements

- Python 3.11 or higher
- Groq API key for vision model access

**Environment Variables:**
Create a `.env` file with the following configuration:

```env
# Required: Groq API credentials
GROQ_API_KEY=your_groq_api_key_here

# Required: Service authentication token
VDA_SERVICE_API_KEY=your_secure_token_here

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

2. **Install development dependencies (optional):**
   ```bash
   pip install -r requirements-dev.txt
   ```

3. **Configure environment:**
   ```bash
   cp .env.example .env
   # Edit .env with your credentials
   ```

4. **Run the server:**
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

- **Service Token Authentication** - Validates `X-Service-Token` header for authorized access
- **MIME Type Validation** - Verifies file content using magic bytes, not just headers
- **Prompt Injection Protection** - Sanitizes user input to prevent AI prompt manipulation
- **Input Length Limits** - Enforces 500 character limit for descriptions, 10MB for images
- **PII Redaction** - Automatically redacts sensitive information from logs
- **Model Validation** - Graceful fallback for invalid model configurations

**Configuration:**
- Authentication is enabled by default (`VDA_REQUIRE_AUTH=true`)
- CORS is disabled by default; configure `VDA_ALLOWED_ORIGINS` only when needed
- Always use HTTPS in production environments

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
- 51 comprehensive tests covering endpoints, validation, and security
- FastAPI endpoint tests (41 tests)
- Vision model integration tests (27 tests)
- Configuration validation tests (9 tests)

## Available Models

The service supports multiple Groq vision models:

- `llama4-scout` - Fast, efficient vision analysis (default)
- `llama4-maverick` - Enhanced accuracy for complex assessments
- `llama3.2-11b` - Balanced performance
- `llama3.2-90b` - Maximum capability

Configure via environment: `GROQ_VISION_MODEL=llama4-scout`

## Project Structure

```
visual-damage-assessment/
├── main.py                 # FastAPI application entry point
├── groq_vision.py         # Vision model integration
├── requirements.txt       # Production dependencies
├── requirements-dev.txt   # Development dependencies
├── pytest.ini            # Test configuration
├── Dockerfile            # Production container
├── docker-compose-dev.yml # Development environment
├── tests/                # Comprehensive test suite
│   ├── test_main.py      # API endpoint tests
│   ├── test_groq_vision.py # Vision logic tests
│   └── test_startup.py   # Configuration tests
└── docs/
    ├── README.md         # This file
    └── API.md           # API documentation
```

## Contributing

Please ensure all tests pass before submitting changes:

```bash
pytest tests/ -v
```

## License

See the main project repository for license information.
