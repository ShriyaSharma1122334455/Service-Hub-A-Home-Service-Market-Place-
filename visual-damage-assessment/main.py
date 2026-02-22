"""
FastAPI server for visual damage assessment using Groq API.
"""
import base64
import io
import json
import os
import tempfile
from typing import Optional

from dotenv import load_dotenv
from fastapi import FastAPI, File, Form, HTTPException, UploadFile
from fastapi.middleware.cors import CORSMiddleware
from groq import Groq
from PIL import Image
from pydantic import BaseModel

load_dotenv()

# Groq vision models: short name -> API model id
GROQ_VISION_MODELS = {
    "llama4-maverick": "meta-llama/llama-4-maverick-17b-128e-instruct",
}
DEFAULT_VISION_MODEL = "llama4-maverick"

SYSTEM_PROMPT = """
You are a professional visual assessment assistant.

Given an image and a brief user goal (for example, "I want to paint this wall to this color, what is your recommendation?" or "Can I repair this myself or do I need an expert?"), use your expert judgment to

1. Carefully analyze the image,
2. Interpret the user's intent or goal, even if it is NOT explicitly an assessment request,
3. Assess the relevant state, damage, suitability, and potential issues visible in the image with respect to the user's stated goal,
4. Assume that the user is seeking to hire professional labour to complete this task. Any estimated cost you provide must be a realistic, full estimate as if the user will hire a contractor or professional labour for the work. Do not estimate for DIY. Always include all likely labour, materials, and any other associated costs in your quote.
5. Communicate ONLY a valid JSON object in the following format:

{
  "assessment": "",        // Concise assessment relevant to user's goal, referencing what the image shows.
  "recommendation": "",    // Expert recommendation or next steps for the user based on the assessment and goal.
  "estimated_cost_usd": "", // Provide a specific estimated cost in USD for the user to hire professional labour or a contractor to fully complete the work. Do NOT answer "N/A" or leave blank; always give your best professional estimate for the full cost involved, even if it is a rough range.
  "confidence_score": ""   // Percentage (e.g. 85%) of your confidence in this assessment.
}

Do not include explanations or information outside the JSON object.
Do not request clarification; do your best with what is provided.
"""


def assess_image(image_path: str, user_goal: str) -> Optional[dict]:
    """
    Run visual assessment on an image using Groq's vision model based on user's task or goal.
    The user does not need to explicitly request an assessment; system will infer the context.
    """
    api_key = os.getenv("GROQ_API_KEY")
    if not api_key:
        raise ValueError("GROQ_API_KEY not set in environment or .env")

    model_id = GROQ_VISION_MODELS.get(DEFAULT_VISION_MODEL)

    client = Groq(api_key=api_key)

    # Load image and encode as base64 (Groq accepts data URL or URL)
    image = Image.open(image_path)
    buffer = io.BytesIO()
    if image_path.lower().endswith(".png"):
        image.save(buffer, format="PNG")
        mime = "image/png"
    else:
        image.save(buffer, format="JPEG")
        mime = "image/jpeg"
    image_b64 = base64.b64encode(buffer.getvalue()).decode("utf-8")
    image_data_url = f"data:{mime};base64,{image_b64}"

    response = client.chat.completions.create(
        model=model_id,
        messages=[
            {"role": "system", "content": SYSTEM_PROMPT},
            {
                "role": "user",
                "content": [
                    {"type": "text", "text": user_goal},
                    {"type": "image_url", "image_url": {"url": image_data_url}},
                ],
            },
        ],
        max_tokens=1024,
    )

    output_text = (response.choices[0].message.content or "").strip()

    # Strip markdown code fences if present
    if output_text.startswith("```"):
        lines = output_text.split("\n")
        if lines[0].startswith("```"):
            lines = lines[1:]
        if lines and lines[-1].strip() == "```":
            lines = lines[:-1]
        output_text = "\n".join(lines)

    try:
        return json.loads(output_text)
    except json.JSONDecodeError:
        print("⚠️ Model did not return valid JSON.")
        print(output_text)
        return None

app = FastAPI(
    title="Visual Damage Assessment API",
    description="Analyze images and assess damages or tasks using AI-powered visual assessment",
    version="1.0.0",
)

# Add CORS middleware for frontend integration
app.add_middleware(
    CORSMiddleware,
    allow_origins=["*"],  # Adjust in production
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)


class AssessmentResponse(BaseModel):
    """Response model for assessment results."""

    assessment: str
    recommendation: str
    estimated_cost_usd: str
    confidence_score: str


class ErrorResponse(BaseModel):
    """Response model for error cases."""

    error: str
    detail: Optional[str] = None


@app.get("/health")
async def health_check():
    """Health check endpoint."""
    return {"status": "healthy", "service": "Visual Damage Assessment API"}


@app.post(
    "/assess",
    response_model=AssessmentResponse,
    responses={
        400: {"model": ErrorResponse},
        422: {"model": ErrorResponse},
        500: {"model": ErrorResponse},
    },
)
async def assess_damage(
    image: UploadFile = File(..., description="Image file to analyze (JPEG or PNG)"),
    task: str = Form(
        default="I want an expert visual assessment for my goal.",
        description="Describe your goal or task related to the image (e.g., 'I want to repaint this wall', 'Is this safe?', 'What repair is needed?')",
    ),
):
    """
    Analyze an image and provide visual assessment with cost estimate.

    - **image**: Upload an image file (JPEG or PNG)
    - **task**: Describe your goal or task related to the image
    """
    try:
        # Validate file type
        allowed_types = {"image/jpeg", "image/png"}
        if image.content_type not in allowed_types:
            raise HTTPException(
                status_code=400,
                detail=f"Invalid file type. Allowed types: JPEG, PNG. Got: {image.content_type}",
            )

        # Validate file size (10MB max)
        max_size = 10 * 1024 * 1024
        contents = await image.read()
        if len(contents) > max_size:
            raise HTTPException(
                status_code=400,
                detail=f"File size exceeds maximum allowed (10MB). Got: {len(contents) / 1024 / 1024:.2f}MB",
            )

        # Save temporarily and assess
        with tempfile.NamedTemporaryFile(
            delete=False, suffix=".jpg" if image.content_type == "image/jpeg" else ".png"
        ) as tmp_file:
            tmp_file.write(contents)
            tmp_path = tmp_file.name

        try:
            result = assess_image(tmp_path, task)

            if result is None:
                raise HTTPException(
                    status_code=500,
                    detail="Failed to parse assessment response. Model did not return valid JSON.",
                )

            # Validate response structure
            required_fields = {
                "assessment",
                "recommendation",
                "estimated_cost_usd",
                "confidence_score",
            }
            if not all(field in result for field in required_fields):
                raise HTTPException(
                    status_code=500,
                    detail=f"Invalid response structure. Missing fields: {required_fields - set(result.keys())}",
                )

            return AssessmentResponse(**result)

        finally:
            # Clean up temporary file
            if os.path.exists(tmp_path):
                os.remove(tmp_path)

    except HTTPException:
        raise
    except ValueError as e:
        raise HTTPException(status_code=500, detail=str(e))
    except Exception as e:
        raise HTTPException(
            status_code=500, detail=f"Internal server error: {str(e)}"
        )


@app.get("/")
async def root():
    """Root endpoint with API information."""
    return {
        "message": "Visual Damage Assessment API",
        "endpoints": {
            "health": "/health",
            "assess": "/assess",
            "docs": "/docs",
            "redoc": "/redoc",
        },
    }


if __name__ == "__main__":
    import uvicorn

    uvicorn.run(
        app,
        host="0.0.0.0",
        port=8000,
        log_level="info",
    )
