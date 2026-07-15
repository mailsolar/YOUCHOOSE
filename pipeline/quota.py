"""
YOUCHOOSE — quota.py
Manages Gemini API daily quota tracking via Supabase.
"""

import os
from datetime import datetime, timezone, timedelta
import requests
from pathlib import Path
from dotenv import load_dotenv

load_dotenv(Path(__file__).parent / ".env")

SUPABASE_URL = os.getenv("SUPABASE_URL", "").rstrip("/")
SUPABASE_KEY = os.getenv("SUPABASE_ANON_KEY", "")

HEADERS = {
    "apikey": SUPABASE_KEY,
    "Authorization": f"Bearer {SUPABASE_KEY}",
    "Content-Type": "application/json",
    "Prefer": "return=representation",
}

DAILY_LIMIT = 1500  # Gemini 2.0 Flash free tier


def _today() -> str:
    return datetime.now(timezone.utc).strftime("%Y-%m-%d")


def _next_reset() -> str:
    """Next midnight UTC as ISO string."""
    now = datetime.now(timezone.utc)
    tomorrow = (now + timedelta(days=1)).replace(hour=0, minute=0, second=0, microsecond=0)
    return tomorrow.isoformat()


def _ensure_today_row():
    """Create today's quota row if it doesn't exist."""
    today = _today()

    resp = requests.get(
        f"{SUPABASE_URL}/rest/v1/api_quota",
        headers=HEADERS,
        params={"date": f"eq.{today}", "select": "date"},
        timeout=10,
    )

    if not resp.json():
        requests.post(
            f"{SUPABASE_URL}/rest/v1/api_quota",
            headers={**HEADERS, "Prefer": "return=minimal"},
            json={"date": today, "used": 0, "limit": DAILY_LIMIT, "reset_at": _next_reset()},
            timeout=10,
        )


def get_remaining() -> int:
    """Return how many Gemini API calls are left today."""
    _ensure_today_row()

    resp = requests.get(
        f"{SUPABASE_URL}/rest/v1/api_quota",
        headers=HEADERS,
        params={"date": f"eq.{_today()}", "select": "used,limit"},
        timeout=10,
    )

    rows = resp.json()
    if not rows:
        return DAILY_LIMIT

    used = rows[0].get("used", 0)
    limit = rows[0].get("limit", DAILY_LIMIT)
    return max(0, limit - used)


def get_status() -> dict:
    """Return full quota status for the admin panel."""
    _ensure_today_row()

    resp = requests.get(
        f"{SUPABASE_URL}/rest/v1/api_quota",
        headers=HEADERS,
        params={"date": f"eq.{_today()}", "select": "*"},
        timeout=10,
    )

    rows = resp.json()
    if not rows:
        return {"used": 0, "limit": DAILY_LIMIT, "remaining": DAILY_LIMIT, "available": True, "reset_at": _next_reset()}

    row = rows[0]
    remaining = max(0, row["limit"] - row["used"])
    return {
        "used": row["used"],
        "limit": row["limit"],
        "remaining": remaining,
        "available": remaining > 0,
        "reset_at": row.get("reset_at", _next_reset()),
    }


def increment(count: int = 1):
    """Record API usage — increment today's used count."""
    _ensure_today_row()

    # Use RPC-style PATCH to atomically increment
    # First get current value
    resp = requests.get(
        f"{SUPABASE_URL}/rest/v1/api_quota",
        headers=HEADERS,
        params={"date": f"eq.{_today()}", "select": "used"},
        timeout=10,
    )

    rows = resp.json()
    current = rows[0]["used"] if rows else 0

    requests.patch(
        f"{SUPABASE_URL}/rest/v1/api_quota",
        headers={**HEADERS, "Prefer": "return=minimal"},
        params={"date": f"eq.{_today()}"},
        json={"used": current + count},
        timeout=10,
    )


def is_available() -> bool:
    """Quick check: can we make another Gemini call?"""
    return get_remaining() > 0


if __name__ == "__main__":
    status = get_status()
    print(f"Quota status: {status['used']}/{status['limit']} used, {status['remaining']} remaining")
    print(f"Available: {status['available']}")
    print(f"Resets at: {status['reset_at']}")
