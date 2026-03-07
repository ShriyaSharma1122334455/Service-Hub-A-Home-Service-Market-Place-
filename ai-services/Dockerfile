FROM python:3.11-slim

# Set working directory
WORKDIR /app

# Install system dependencies needed by lxml / httpx
RUN apt-get update && apt-get install -y --no-install-recommends \
    gcc \
    libxml2-dev \
    libxslt-dev \
    && rm -rf /var/lib/apt/lists/*

# Install Python dependencies first (layer caching)
COPY requirements.txt .
RUN pip install --no-cache-dir -r requirements.txt

# Copy application code
COPY app/ ./app/

# Expose the service port
EXPOSE 8001

# Start with uvicorn — app/main.py contains the FastAPI instance named `app`
CMD ["uvicorn", "app.main:app", "--host", "0.0.0.0", "--port", "8001"]
