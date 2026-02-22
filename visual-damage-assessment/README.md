# Visual Damage Assessment API

Analyzes images to provide professional damage assessments, repair recommendations, and cost estimates. Uses Groq's Llama 4 vision model.

## Requirements

- `.env` file with API Key
- Python 3.14+
- Dependencies: `pip install -r requirements.txt`

## Running

**Local:**
```bash
python main.py
```

**Docker:**
```bash
docker-compose up --build
```

API runs at `http://localhost:8000`

## API

See [API.md](API.md) for endpoint documentation.

Interactive docs available at `/docs` when running.
