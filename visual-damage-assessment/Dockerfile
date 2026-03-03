# ── Visual Damage Assessment — Python/FastAPI ──────────────────────────────
#
# Multi-stage build:
#   development  → hot reload with uvicorn --reload
#   production   → minimal image, non-root user, no dev tools
#
# Usage:
#   docker compose up visual-assessment          # development (default)
#   docker compose build --target production     # production build
#
# Environment variables are injected at runtime via docker-compose env_file.
# NEVER copy .env into the image.

# ── Base stage (shared by both targets) ────────────────────────────────────
FROM python:3.11-slim AS base

WORKDIR /app

# Install system dependencies needed for compilation
RUN apt-get update && apt-get install -y \
    gcc \
    curl \
    && rm -rf /var/lib/apt/lists/*

# Copy and install Python dependencies first (layer cache optimisation)
COPY requirements.txt .
RUN pip install --no-cache-dir -r requirements.txt

# ── Development stage ───────────────────────────────────────────────────────
FROM base AS development

# Copy application source
COPY . .

EXPOSE 8000

HEALTHCHECK --interval=30s --timeout=10s --start-period=40s --retries=3 \
    CMD curl -f http://localhost:8000/health || exit 1

# Hot reload enabled for development
CMD ["python", "-m", "uvicorn", "main:app", "--host", "0.0.0.0", "--port", "8000", "--reload"]

# ── Production stage ────────────────────────────────────────────────────────
FROM base AS production

# Copy only the application files needed to run — no tests, no dev files
COPY main.py .
COPY . .

# Create non-root user for security
RUN addgroup --system appgroup && adduser --system --ingroup appgroup appuser
USER appuser

EXPOSE 8000

HEALTHCHECK --interval=30s --timeout=10s --start-period=40s --retries=3 \
    CMD curl -f http://localhost:8000/health || exit 1

# No --reload in production
CMD ["python", "-m", "uvicorn", "main:app", "--host", "0.0.0.0", "--port", "8000", "--workers", "2"]
