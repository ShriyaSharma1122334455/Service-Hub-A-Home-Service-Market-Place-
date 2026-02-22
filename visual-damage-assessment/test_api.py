#!/usr/bin/env python3
"""
Test script for the Visual Damage Assessment API.
"""
import argparse
import json
import sys
from pathlib import Path

try:
    import requests
except ImportError:
    print("Error: requests library not installed. Install with: pip install requests")
    sys.exit(1)


def test_health(base_url: str) -> bool:
    """Test the health check endpoint."""
    try:
        response = requests.get(f"{base_url}/health", timeout=5)
        if response.status_code == 200:
            print("✓ Health check passed")
            print(f"  Response: {response.json()}")
            return True
        else:
            print(f"✗ Health check failed: {response.status_code}")
            return False
    except Exception as e:
        print(f"✗ Health check error: {e}")
        return False


def test_root(base_url: str) -> bool:
    """Test the root endpoint."""
    try:
        response = requests.get(f"{base_url}/", timeout=5)
        if response.status_code == 200:
            print("✓ Root endpoint passed")
            data = response.json()
            print(f"  Available endpoints: {', '.join(data.get('endpoints', {}).keys())}")
            return True
        else:
            print(f"✗ Root endpoint failed: {response.status_code}")
            return False
    except Exception as e:
        print(f"✗ Root endpoint error: {e}")
        return False


def test_assess(base_url: str, image_path: str, task: str) -> bool:
    """Test the assessment endpoint."""
    try:
        if not Path(image_path).exists():
            print(f"✗ Image file not found: {image_path}")
            return False

        with open(image_path, "rb") as f:
            files = {"image": f}
            data = {"task": task}
            response = requests.post(
                f"{base_url}/assess", files=files, data=data, timeout=30
            )

        if response.status_code == 200:
            print("✓ Assessment endpoint passed")
            result = response.json()
            print(f"  Assessment: {result.get('assessment', 'N/A')[:100]}...")
            print(f"  Recommendation: {result.get('recommendation', 'N/A')[:100]}...")
            print(f"  Estimated Cost: {result.get('estimated_cost_usd', 'N/A')}")
            print(f"  Confidence: {result.get('confidence_score', 'N/A')}")
            return True
        else:
            print(f"✗ Assessment endpoint failed: {response.status_code}")
            print(f"  Response: {response.text}")
            return False

    except requests.exceptions.Timeout:
        print("✗ Assessment request timed out (30s)")
        return False
    except Exception as e:
        print(f"✗ Assessment error: {e}")
        return False


def main():
    parser = argparse.ArgumentParser(
        description="Test the Visual Damage Assessment API"
    )
    parser.add_argument(
        "--url",
        default="http://localhost:8000",
        help="Base URL of the API (default: http://localhost:8000)",
    )
    parser.add_argument(
        "--image",
        help="Path to test image file for assessment test",
    )
    parser.add_argument(
        "--task",
        default="I want an expert visual assessment for my goal.",
        help="Task description for assessment test",
    )
    parser.add_argument(
        "--all",
        action="store_true",
        help="Run all tests (requires --image)",
    )

    args = parser.parse_args()

    print(f"Testing Visual Damage Assessment API at {args.url}\n")

    results = {
        "health": test_health(args.url),
        "root": test_root(args.url),
    }

    if args.all:
        if not args.image:
            print("\n⚠ Skipping assessment test: --image required for --all")
        else:
            print()
            results["assess"] = test_assess(args.url, args.image, args.task)
    elif args.image:
        print()
        results["assess"] = test_assess(args.url, args.image, args.task)

    # Summary
    print(f"\n{'='*50}")
    passed = sum(1 for v in results.values() if v)
    total = len(results)
    print(f"Results: {passed}/{total} tests passed")

    if passed == total:
        print("✓ All tests passed!")
        return 0
    else:
        print("✗ Some tests failed")
        return 1


if __name__ == "__main__":
    sys.exit(main())
