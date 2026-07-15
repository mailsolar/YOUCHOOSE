"""
Test alternative Gemini models that might have separate quota pools.
"""
import os
import requests
import time
from pathlib import Path
from dotenv import load_dotenv

load_dotenv(Path(__file__).parent / ".env")

GEMINI_API_KEY = os.getenv("GEMINI_API_KEY", "")

MODELS = [
    "gemini-2.0-flash-lite",
    "gemini-2.5-flash",
    "gemini-2.5-flash-lite-preview-06-17",
    "gemini-2.0-flash-001",
    "gemini-2.0-flash-exp",
]

SIMPLE_PROMPT = "What is the capital of India? Reply in one word."

for model in MODELS:
    endpoint = f"https://generativelanguage.googleapis.com/v1beta/models/{model}:generateContent"
    
    payload = {
        "contents": [{"parts": [{"text": SIMPLE_PROMPT}]}],
        "generationConfig": {"temperature": 0.1, "maxOutputTokens": 50}
    }
    
    print(f"\n--- Testing {model} ---")
    
    try:
        resp = requests.post(
            f"{endpoint}?key={GEMINI_API_KEY}",
            json=payload,
            timeout=15,
        )
        print(f"    Status: {resp.status_code}")
        
        if resp.status_code == 200:
            text = resp.json()["candidates"][0]["content"]["parts"][0]["text"]
            print(f"    Response: {text.strip()}")
            print(f"    >>> THIS MODEL WORKS! <<<")
        else:
            # Show first 200 chars of error
            print(f"    Error: {resp.text[:200]}")
    except Exception as e:
        print(f"    Exception: {e}")
    
    time.sleep(2)

print("\n\nDone!")
