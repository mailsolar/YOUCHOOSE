"""Quick connection test — verifies Supabase tables exist and are reachable."""
import os, requests
from pathlib import Path
from dotenv import load_dotenv

load_dotenv(Path(__file__).parent / ".env")

URL = os.getenv("SUPABASE_URL", "").rstrip("/")
KEY = os.getenv("SUPABASE_ANON_KEY", "")
HEADERS = {"apikey": KEY, "Authorization": f"Bearer {KEY}"}

print("YOUCHOOSE — Connection Test")
print("=" * 40)

for table in ["restaurants", "reviews"]:
    resp = requests.get(f"{URL}/rest/v1/{table}?limit=1", headers=HEADERS, timeout=10)
    if resp.status_code == 200:
        print(f"  [OK]  Table '{table}' reachable — {len(resp.json())} rows")
    else:
        print(f"  [ERR] Table '{table}' — {resp.status_code}: {resp.text[:120]}")
