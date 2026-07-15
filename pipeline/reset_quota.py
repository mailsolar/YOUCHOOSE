import os
from datetime import datetime, timezone
import requests
from dotenv import load_dotenv

load_dotenv(".env")

SUPABASE_URL = os.getenv("SUPABASE_URL", "").rstrip("/")
SUPABASE_KEY = os.getenv("SUPABASE_ANON_KEY", "")

HEADERS = {
    "apikey": SUPABASE_KEY,
    "Authorization": f"Bearer {SUPABASE_KEY}",
    "Content-Type": "application/json",
    "Prefer": "return=minimal",
}

today = datetime.now(timezone.utc).strftime("%Y-%m-%d")

# Reset today's quota to 0
resp = requests.patch(
    f"{SUPABASE_URL}/rest/v1/api_quota",
    headers=HEADERS,
    params={"date": f"eq.{today}"},
    json={"used": 0}
)

if resp.status_code in (200, 204):
    print("Successfully reset today's quota to 0/1500 for the new key!")
else:
    print(f"Failed to reset quota: {resp.text}")
