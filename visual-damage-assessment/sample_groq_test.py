"""
Visual assessment assistant using Groq API.

Note: openai/gpt-oss-20b is text-only and does not accept images. For tasks requiring
visual understanding, we use Groq's vision models (Llama 4 or Llama 3.2 vision).
"""
import base64
import io
import json
import os
import sys

from dotenv import load_dotenv
from groq import Groq
from PIL import Image

load_dotenv()

# Groq vision models: short name -> API model id

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

def assess_image(
    image_path: str,
    user_goal: str
) -> dict | None:
    """
    Run visual assessment on an image using Groq's vision model based on user's task or goal.
    The user does not need to explicitly request an assessment; system will infer the context.
    """
    api_key = os.getenv("GROQ_API_KEY")
    if not api_key:
        raise ValueError("GROQ_API_KEY not set in environment or .env")

    model_id = "meta-llama/llama-4-maverick-17b-128e-instruct"

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


if __name__ == "__main__":
    import argparse

    parser = argparse.ArgumentParser(
        description="Run visual assessment on an image file using Groq Vision model."
    )
    parser.add_argument("image_path", help="Path to the image file")
    parser.add_argument(
        "--task",
        default="I want an expert visual assessment for my goal.",
        help="Briefly describe your goal or task related to the image (e.g., 'I want to repaint this wall', 'Is this safe?', 'What repair is needed?').",
    )
    args = parser.parse_args()

    result = assess_image(args.image_path, args.task)
    print(result)