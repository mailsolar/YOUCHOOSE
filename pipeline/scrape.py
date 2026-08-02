"""
YOUCHOOSE Pipeline — scrape.py v2
==================================
Smart scraper with:
  - De-duplication: never re-scrapes a URL (tracked in scraped_urls table)
  - Quota awareness: checks daily Gemini limit before each call
  - Rank recomputation: updates restaurant rank_score after each new review

Usage:
    python scrape.py <video_url>
    python scrape.py urls.txt
    python scrape.py --auto <count>      (auto-find + scrape N new URLs)
"""

import os
import sys
import json
import re
import time
import subprocess
import tempfile
import requests
from pathlib import Path
from datetime import datetime, timezone

from dotenv import load_dotenv
import quota
from google import genai
from google.genai import types
from google.genai.errors import APIError

class QuotaExhaustedError(Exception):
    pass

# ── Load .env ─────────────────────────────────────────────────
load_dotenv(Path(__file__).parent / ".env")

SUPABASE_URL    = os.getenv("SUPABASE_URL", "").rstrip("/")
SUPABASE_KEY    = os.getenv("SUPABASE_SERVICE_KEY") or os.getenv("SUPABASE_ANON_KEY", "")
GEMINI_API_KEY  = os.getenv("GEMINI_API_KEY", "")

HEADERS = {
    "apikey":        SUPABASE_KEY,
    "Authorization": f"Bearer {SUPABASE_KEY}",
    "Content-Type":  "application/json",
    "Prefer":        "return=representation",
}


# ── Config check ──────────────────────────────────────────────
def check_config():
    errors = []
    if not SUPABASE_URL or "YOUR_PROJECT_REF" in SUPABASE_URL:
        errors.append("SUPABASE_URL is not set in .env")
    if not SUPABASE_KEY:
        errors.append("SUPABASE_ANON_KEY is not set in .env")
    if not GEMINI_API_KEY:
        errors.append("GEMINI_API_KEY is not set in .env")
    if errors:
        for e in errors:
            print(f"  [ERROR] {e}")
        sys.exit(1)


# ── De-duplication ────────────────────────────────────────────
def is_already_scraped(url: str) -> bool:
    """Check if URL exists in scraped_urls table."""
    resp = requests.get(
        f"{SUPABASE_URL}/rest/v1/scraped_urls",
        headers=HEADERS,
        params={"url": f"eq.{url}", "select": "url"},
        timeout=10,
    )
    return len(resp.json()) > 0


def record_scraped(url: str, status: str, error: str = None):
    """Record a URL as processed in scraped_urls table."""
    payload = {
        "url": url,
        "status": status,
        "error_message": error,
        "processed_at": datetime.now(timezone.utc).isoformat(),
    }
    requests.post(
        f"{SUPABASE_URL}/rest/v1/scraped_urls",
        headers={**HEADERS, "Prefer": "return=minimal"},
        json=payload,
        timeout=10,
    )


# ── Step 1: Extract video metadata + transcript ──────────────
def extract_video_data(url: str) -> dict:
    print(f"\n[1/4] Fetching video metadata: {url}")

    with tempfile.TemporaryDirectory() as tmpdir:
        cmd = [
            "yt-dlp",
            "--write-auto-subs",
            "--sub-format", "vtt",
            "--skip-download",
            "--dump-json",
            "--no-warnings",
            "-o", f"{tmpdir}/%(id)s",
            url,
        ]
        result = subprocess.run(cmd, capture_output=True, text=True, timeout=120)

        if result.returncode != 0:
            raise RuntimeError(f"yt-dlp failed:\n{result.stderr[:500]}")

        meta = json.loads(result.stdout)

        video_id      = meta.get("id", "")
        title         = meta.get("title", "")
        description   = meta.get("description", "")[:2000]
        uploader      = meta.get("uploader", "")
        uploader_id   = meta.get("uploader_id", "")
        thumbnail_url = meta.get("thumbnail", "")
        platform      = detect_platform(url)

        transcript = ""
        vtt_files = list(Path(tmpdir).glob("*.vtt"))
        audio_path = None
        
        if vtt_files:
            raw_vtt = vtt_files[0].read_text(encoding="utf-8", errors="ignore")
            transcript = clean_vtt(raw_vtt)
            print(f"       Transcript: {len(transcript)} chars")
        else:
            print("       No transcript — downloading audio for Gemini...")
            fd, audio_path = tempfile.mkstemp(suffix=".mp3")
            os.close(fd)
            audio_cmd = [
                "yt-dlp",
                "-f", "bestaudio",
                "--extract-audio",
                "--audio-format", "mp3",
                "--audio-quality", "9",
                "--no-warnings",
                "-o", audio_path,
                url,
            ]
            subprocess.run(audio_cmd, capture_output=True, timeout=300)

        return {
            "video_id":       video_id,
            "url":            url,
            "title":          title,
            "description":    description,
            "transcript":     transcript,
            "audio_path":     audio_path,
            "uploader":       uploader,
            "uploader_id":    f"@{uploader_id}" if uploader_id else uploader,
            "thumbnail_url":  thumbnail_url,
            "platform":       platform,
        }


def detect_platform(url: str) -> str:
    url = url.lower()
    if "youtube.com" in url or "youtu.be" in url:
        return "youtube"
    if "instagram.com" in url:
        return "instagram"
    if "tiktok.com" in url:
        return "tiktok"
    return "other"


def clean_vtt(vtt: str) -> str:
    lines = vtt.splitlines()
    text_lines = []
    for line in lines:
        line = line.strip()
        if not line or line.startswith("WEBVTT") or "-->" in line:
            continue
        line = re.sub(r"<[^>]+>", "", line)
        if line:
            text_lines.append(line)
    deduped = []
    for line in text_lines:
        if not deduped or deduped[-1] != line:
            deduped.append(line)
    return " ".join(deduped)


# ── Step 2: Gemini extraction ─────────────────────────────────
GEMINI_ENDPOINT = (
    "https://generativelanguage.googleapis.com/v1beta/models/"
    "gemini-2.5-flash:generateContent"
)

EXTRACTION_PROMPT = """
You are an expert Indian food intelligence assistant. Analyze the following video content from a food review/vlog and extract structured restaurant information. The video is most likely about a restaurant, street food stall, cafe, or food experience in India.

VIDEO TITLE: {title}
VIDEO DESCRIPTION: {description}
TRANSCRIPT: {transcript}

Extract the following information and return ONLY a valid JSON object. If you cannot determine a value with reasonable confidence, use null.

{{
  "restaurant_name": "exact name of the restaurant/food place",
  "cuisine": "cuisine type (e.g. North Indian, South Indian, Mughlai, Chinese, Italian, Street Food, Biryani, Seafood)",
  "category": "restaurant | street_stall | cafe | bar | dhaba | cloud_kitchen | food_truck | bakery",
  "dishes": ["dish 1", "dish 2", "dish 3"],
  "must_try": "the single best dish according to the reviewer",
  "price_range": "budget | mid_range | premium | luxury",
  "rating": 4.5,
  "address": "street address or locality/area if mentioned (e.g. Fort Area, Koramangala 5th Block)",
  "city": "city name (e.g. Mumbai, Delhi, Bangalore, Pune, Hyderabad)",
  "state": "Indian state (e.g. Maharashtra, Karnataka, Tamil Nadu)",
  "country": "India",
  "hours": "opening hours if mentioned (e.g. Until 10 PM)",
  "parking": "available | difficult | unknown"
}}

Rules:
- This is specifically for INDIAN food content. Default country to "India" unless clearly from another country.
- rating must be a decimal number between 1.0 and 5.0. Infer from the reviewer's sentiment, tone, and explicit comments. If overwhelmingly positive, use 4.0-5.0. If mixed, use 2.5-3.5. If negative, use 1.0-2.5.
- dishes should be actual dish names mentioned (e.g. "Butter Chicken", "Vada Pav", "Masala Dosa"), not generic terms.
- city: Try hard to identify the Indian city. Look for clues in area names, landmarks, or accents.
- category: classify accurately — "dhaba" for roadside eateries, "street_stall" for carts/stalls.
- price_range: "budget" = under ₹200/person, "mid_range" = ₹200-800, "premium" = ₹800-2000, "luxury" = ₹2000+.
- If no restaurant is clearly identifiable, return {{"restaurant_name": null}}.
- Return ONLY the JSON object, no markdown, no explanation.
"""


# Configure GenAI Client
client = genai.Client(api_key=GEMINI_API_KEY)

def extract_with_gemini(video_data: dict) -> dict | None:
    print("[2/4] Extracting restaurant data with Gemini...")

    if not quota.is_available():
        print("  [QUOTA] Daily limit reached. Stopping.")
        raise QuotaExhaustedError("Daily limit reached.")

    # Only pass transcript text if we aren't uploading audio
    transcript_text = video_data["transcript"][:4000] if video_data.get("transcript") else "NO TRANSCRIPT. PLEASE LISTEN TO AUDIO."

    prompt = EXTRACTION_PROMPT.format(
        title=video_data["title"],
        description=video_data["description"],
        transcript=transcript_text,
    )

    audio_file = None
    try:
        contents = [prompt]
        if video_data.get("audio_path") and os.path.exists(video_data["audio_path"]):
            print("       Uploading audio to Gemini (this might take a few seconds)...")
            audio_file = client.files.upload(file=video_data["audio_path"])
            contents.append(audio_file)

        max_retries = 3
        for attempt in range(max_retries):
            try:
                resp = client.models.generate_content(
                    model="gemini-2.5-flash",
                    contents=contents,
                    config=types.GenerateContentConfig(
                        temperature=0.1,
                        max_output_tokens=1024,
                        response_mime_type="application/json"
                    )
                )
                quota.increment()
                break
            except APIError as e:
                if e.code == 429:
                    wait_time = 30 * (2 ** attempt)
                    print(f"  [RATE LIMIT] Gemini 429 — waiting {wait_time}s before retry ({attempt+1}/{max_retries})...")
                    time.sleep(wait_time)
                else:
                    raise
        else:
            print("  [RATE LIMIT] All retries exhausted. Triggering hibernation.")
            raise QuotaExhaustedError("Persistent 429 Rate Limit")

        text = resp.text.strip()
        text = re.sub(r"^```(?:json)?\s*", "", text)
        text = re.sub(r"\s*```$", "", text)

        try:
            extracted = json.loads(text)
        except json.JSONDecodeError as e:
            print(f"  [WARN] Could not parse Gemini response: {e}")
            return None

        if not extracted.get("restaurant_name"):
            print("  [WARN] No restaurant identified in this video.")
            return None

        print(f"  Found: {extracted['restaurant_name']} ({extracted.get('city', '?')})")
        print(f"  Rating: {extracted.get('rating')} | Dishes: {extracted.get('dishes', [])}")
        return extracted

    except Exception as e:
        if isinstance(e, QuotaExhaustedError):
            raise
        print(f"  [ERROR] Gemini API error: {e}")
        return None
    finally:
        # Cleanup audio on Gemini side
        if audio_file:
            try:
                client.files.delete(name=audio_file.name)
            except:
                pass


# ── Step 3: Geocoding ─────────────────────────────────────────
def geocode(name: str, address: str, city: str, country: str) -> tuple[float | None, float | None]:
    # 1. Try exact address first
    query_parts = [p for p in [address, city, country] if p]
    if query_parts:
        query = ", ".join(query_parts)
        print(f"[3/4] Geocoding address: {query}")
        try:
            resp = requests.get(
                "https://nominatim.openstreetmap.org/search",
                params={"q": query, "format": "json", "limit": 1},
                headers={"User-Agent": "YOUCHOOSE-Pipeline/2.0"},
                timeout=10,
            )
            results = resp.json()
            if results:
                lat = float(results[0]["lat"])
                lng = float(results[0]["lon"])
                print(f"       Coordinates found: {lat:.4f}, {lng:.4f}")
                return lat, lng
        except Exception as e:
            print(f"  [WARN] Address geocoding failed: {e}")

    # 2. Fallback to name + city
    fallback_parts = [p for p in [name, city, country] if p]
    if len(fallback_parts) >= 2:  # at least name and country/city
        query = ", ".join(fallback_parts)
        print(f"       Geocoding fallback (name): {query}")
        try:
            resp = requests.get(
                "https://nominatim.openstreetmap.org/search",
                params={"q": query, "format": "json", "limit": 1},
                headers={"User-Agent": "YOUCHOOSE-Pipeline/2.0"},
                timeout=10,
            )
            results = resp.json()
            if results:
                lat = float(results[0]["lat"])
                lng = float(results[0]["lon"])
                print(f"       Coordinates found: {lat:.4f}, {lng:.4f}")
                return lat, lng
        except Exception as e:
            print(f"  [WARN] Fallback geocoding failed: {e}")

    print("       No coordinates found.")
    return None, None


# ── Step 4: Upsert into Supabase ──────────────────────────────
def find_or_create_restaurant(extracted: dict, lat: float | None, lng: float | None) -> str | None:
    """Find existing restaurant by name+city or create new. Returns UUID."""
    name = extracted["restaurant_name"]
    city = extracted.get("city", "")

    # Search for existing
    resp = requests.get(
        f"{SUPABASE_URL}/rest/v1/restaurants",
        headers=HEADERS,
        params={
            "name": f"eq.{name}",
            "city": f"eq.{city}" if city else "is.null",
            "select": "id",
        },
        timeout=10,
    )
    existing = resp.json()

    if existing:
        rid = existing[0]["id"]
        print(f"  Restaurant exists: {rid}")
        return rid

    # Create new
    payload = {
        "name":     name,
        "cuisine":  extracted.get("cuisine"),
        "category": extracted.get("category", "restaurant"),
        "address":  extracted.get("address"),
        "city":     city or None,
        "country":  extracted.get("country", "India"),
        "lat":      lat,
        "lng":      lng,
        "hours":    extracted.get("hours"),
        "parking":  extracted.get("parking", "unknown"),
    }

    resp = requests.post(
        f"{SUPABASE_URL}/rest/v1/restaurants",
        headers=HEADERS,
        json=payload,
        timeout=10,
    )

    if resp.status_code not in (200, 201):
        raise RuntimeError(f"Restaurant insert failed: {resp.status_code} {resp.text[:300]}")

    rid = resp.json()[0]["id"]
    print(f"  New restaurant: {rid}")
    return rid


def insert_review(video_data: dict, extracted: dict, restaurant_id: str) -> bool:
    """Insert review. Returns True if inserted, False if duplicate."""
    payload = {
        "restaurant_id":  restaurant_id,
        "video_url":      video_data["url"],
        "platform":       video_data["platform"],
        "creator_handle": video_data["uploader_id"],
        "creator_name":   video_data["uploader"],
        "rating":         extracted.get("rating"),
        "dishes":         extracted.get("dishes", []),
        "transcript":     video_data["transcript"][:5000],
        "thumbnail_url":  video_data["thumbnail_url"],
        "processed_at":   datetime.now(timezone.utc).isoformat(),
    }

    resp = requests.post(
        f"{SUPABASE_URL}/rest/v1/reviews",
        headers={**HEADERS, "Prefer": "return=minimal"},
        json=payload,
        timeout=10,
    )

    if resp.status_code in (200, 201):
        print("  Review inserted.")
        return True
    elif resp.status_code == 409:
        print("  Review already exists (duplicate URL).")
        return False
    else:
        print(f"  [WARN] Review insert: {resp.status_code} {resp.text[:200]}")
        return False


def recompute_rank(restaurant_id: str):
    """Call the DB function to recompute rank_score."""
    resp = requests.post(
        f"{SUPABASE_URL}/rest/v1/rpc/recompute_rank",
        headers=HEADERS,
        json={"rid": restaurant_id},
        timeout=10,
    )
    if resp.status_code in (200, 204):
        print("  Rank recomputed.")
    else:
        print(f"  [WARN] Rank recompute: {resp.status_code}")


# ── Main pipeline ─────────────────────────────────────────────
def process_url(url: str) -> dict:
    """Process a single URL. Returns status dict."""
    url = url.strip()
    if not url or url.startswith("#"):
        return {"url": url, "status": "skipped", "reason": "comment or empty"}

    print(f"\n{'='*60}")
    print(f"Processing: {url}")
    print(f"{'='*60}")

    # Check dedup
    if is_already_scraped(url):
        print("  Already scraped — skipping.")
        return {"url": url, "status": "skipped", "reason": "duplicate"}

    # Check quota
    remaining = quota.get_remaining()
    if remaining <= 0:
        print("  [QUOTA] No Gemini calls left today.")
        return {"url": url, "status": "skipped", "reason": "quota_exhausted"}

    print(f"  Quota: {remaining} calls remaining")

    try:
        # 1. yt-dlp
        video_data = extract_video_data(url)

        # 2. Gemini
        extracted = extract_with_gemini(video_data)
        if not extracted:
            record_scraped(url, "skipped", "no restaurant found or quota")
            return {"url": url, "status": "skipped", "reason": "no_restaurant"}

        # 3. Geocode
        lat, lng = geocode(
            extracted.get("restaurant_name", ""),
            extracted.get("address", ""),
            extracted.get("city", ""),
            extracted.get("country", ""),
        )

        # 4. Supabase
        print("[4/4] Saving to Supabase...")
        restaurant_id = find_or_create_restaurant(extracted, lat, lng)
        if restaurant_id:
            added = insert_review(video_data, extracted, restaurant_id)
            recompute_rank(restaurant_id)

            record_scraped(url, "success")
            return {
                "url": url,
                "status": "success",
                "restaurant": extracted["restaurant_name"],
                "added": added,
            }

        record_scraped(url, "failed", "could not create restaurant")
        return {"url": url, "status": "failed"}

    except QuotaExhaustedError:
        print("\n  [ERROR] Quota Exhausted! Bubble up to Daemon.")
        raise
    except Exception as e:
        print(f"\n  [ERROR] {e}")
        record_scraped(url, "failed", str(e)[:300])
        return {"url": url, "status": "failed", "error": str(e)}

    finally:
        audio_path = video_data.get("audio_path") if "video_data" in locals() else None
        if audio_path and os.path.exists(audio_path):
            try:
                os.remove(audio_path)
            except:
                pass
        time.sleep(15)  # 15s delay = 4 RPM, keeping us off rate-limit radar


def process_batch(urls: list[str], max_count: int = None) -> dict:
    """Process a list of URLs with quota awareness. Returns summary."""
    results = {"processed": 0, "added": 0, "skipped": 0, "failed": 0}

    for i, url in enumerate(urls):
        url = url.strip()
        if not url or url.startswith("#"):
            continue

        if max_count and results["processed"] >= max_count:
            print(f"\n  Reached max count ({max_count}). Stopping.")
            break

        if not quota.is_available():
            print(f"\n  Quota exhausted after {results['processed']} videos.")
            break

        result = process_url(url)
        results["processed"] += 1

        if result["status"] == "success":
            results["added"] += 1 if result.get("added") else 0
        elif result["status"] == "failed":
            results["failed"] += 1
        else:
            results["skipped"] += 1

    return results


def main():
    check_config()

    if len(sys.argv) < 2:
        print(__doc__)
        sys.exit(0)

    arg = sys.argv[1]

    if arg == "--auto":
        # Auto mode: find new URLs and scrape them
        count = int(sys.argv[2]) if len(sys.argv) > 2 else 10
        print(f"Auto mode: finding up to {count} new URLs...")

        from find_urls import search_youtube, append_to_urls_file
        entries = search_youtube(f"ytsearch{count}:restaurant food review vlog", count)
        new_urls = [url for url, title in entries]
        print(f"Found {len(new_urls)} candidate URLs")

        results = process_batch(new_urls, max_count=count)
        print(f"\nResults: {results}")

    elif arg.endswith(".txt"):
        path = Path(arg)
        if not path.exists():
            print(f"File not found: {arg}")
            sys.exit(1)
        urls = [line for line in path.read_text().splitlines() if line.strip() and not line.startswith("#")]
        print(f"Batch mode: {len(urls)} URLs to process")
        results = process_batch(urls)
        print(f"\nResults: {results}")

    else:
        result = process_url(arg)
        print(f"\nResult: {result}")

    print(f"\n{'='*60}")
    print("Pipeline complete.")


if __name__ == "__main__":
    main()
