"""
Quick diagnostic test for the Gemini API.
Run this AFTER stopping the daemon (Ctrl+C).
"""
import os
import requests
import time
from pathlib import Path
from dotenv import load_dotenv

load_dotenv(Path(__file__).parent / ".env")

GEMINI_API_KEY = os.getenv("GEMINI_API_KEY", "")

# Test different model endpoints
MODELS = [
    ("gemini-2.0-flash", "v1"),
    ("gemini-1.5-flash", "v1"),
]

SIMPLE_PROMPT = "What is the capital of India? Reply in one word."

for model, version in MODELS:
    endpoint = f"https://generativelanguage.googleapis.com/{version}/models/{model}:generateContent"
    
    payload = {
        "contents": [{"parts": [{"text": SIMPLE_PROMPT}]}],
        "generationConfig": {"temperature": 0.1, "maxOutputTokens": 50}
    }
    
    print(f"\n--- Testing {model} ({version}) ---")
    print(f"    URL: {endpoint}")
    
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
        elif resp.status_code == 429:
            print(f"    Rate limited! Headers: {dict(resp.headers)}")
            body = resp.text[:300]
            print(f"    Body: {body}")
        else:
            print(f"    Error body: {resp.text[:300]}")
    except Exception as e:
        print(f"    Exception: {e}")
    
    time.sleep(3)  # small pause between tests

print("\n\nDone! Use the model that returned 200.")
