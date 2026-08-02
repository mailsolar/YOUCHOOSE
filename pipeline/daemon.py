"""
YOUCHOOSE - daemon.py v2
=========================
Fully autonomous, infinite scraping daemon.

Behaviour:
  1. On startup, seeds the search_queries table with all India-focused queries
  2. Picks the next unused (or least-recently-used) search query
  3. Searches YouTube for videos matching that query
  4. Scrapes every video until exactly 1 API call remains
  5. Hibernates - calculates exact seconds until midnight UTC quota reset
  6. Auto-wakes and loops back to step 2 with the next query
  7. After all queries are exhausted (~30-60 days), loops back to
     the beginning to catch newly uploaded videos

Also listens for manual "pending" scrape_jobs triggered from the Admin Panel.

Usage:
    python daemon.py              # Start autonomous loop
    python daemon.py --manual     # Only process admin-triggered jobs (old behaviour)
"""

import os
import sys
import io

# Force UTF-8 output on Windows to avoid cp1252 encoding errors
if sys.platform == "win32":
    sys.stdout = io.TextIOWrapper(sys.stdout.buffer, encoding="utf-8", errors="replace", line_buffering=True)
    sys.stderr = io.TextIOWrapper(sys.stderr.buffer, encoding="utf-8", errors="replace", line_buffering=True)
import time
import signal
import requests
from datetime import datetime, timezone, timedelta
from pathlib import Path
from dotenv import load_dotenv
from scrape import QuotaExhaustedError

load_dotenv(Path(__file__).parent / ".env")

SUPABASE_URL = os.getenv("SUPABASE_URL", "").rstrip("/")
# Use service role key to bypass RLS for pipeline writes
SUPABASE_KEY = os.getenv("SUPABASE_SERVICE_KEY") or os.getenv("SUPABASE_ANON_KEY", "")

if not os.getenv("SUPABASE_SERVICE_KEY"):
    print("[DAEMON] WARNING: SUPABASE_SERVICE_KEY not set. Using anon key — DB writes may fail due to RLS policies.")

HEADERS = {
    "apikey": SUPABASE_KEY,
    "Authorization": f"Bearer {SUPABASE_KEY}",
    "Content-Type": "application/json",
    "Prefer": "return=representation",
}

POLL_INTERVAL = 30         # seconds between job checks
MIN_QUOTA_RESERVE = 1      # stop scraping when only this many calls remain
VIDEOS_PER_QUERY = 15      # how many YouTube results to fetch per search query

running = True


def signal_handler(sig, frame):
    global running
    print("\n[DAEMON] Shutting down gracefully...")
    running = False


signal.signal(signal.SIGINT, signal_handler)
signal.signal(signal.SIGTERM, signal_handler)


# ─────────────────────────────────────────────────────────────
# QUERY ROTATION
# ─────────────────────────────────────────────────────────────
def seed_queries():
    """Insert all queries from search_queries.py into the DB if they don't exist."""
    from search_queries import get_all_queries

    all_queries = get_all_queries()
    print(f"[DAEMON] Seeding {len(all_queries)} search queries...")

    # Fetch existing queries
    resp = requests.get(
        f"{SUPABASE_URL}/rest/v1/search_queries",
        headers=HEADERS,
        params={"select": "query"},
        timeout=10,
    )
    existing = {row["query"] for row in resp.json()} if resp.status_code == 200 else set()

    # Insert missing ones
    new_queries = []
    for query_text, region, category in all_queries:
        if query_text not in existing:
            new_queries.append({
                "query": query_text,
                "region": region,
                "category": category,
            })

    if new_queries:
        # Batch insert (Supabase accepts arrays)
        resp = requests.post(
            f"{SUPABASE_URL}/rest/v1/search_queries",
            headers={**HEADERS, "Prefer": "return=minimal"},
            json=new_queries,
            timeout=30,
        )
        if resp.status_code in (200, 201):
            print(f"[DAEMON] Seeded {len(new_queries)} new queries.")
        else:
            print(f"[DAEMON] Seed warning: {resp.status_code} {resp.text[:200]}")
    else:
        print(f"[DAEMON] All {len(existing)} queries already seeded.")


def pick_next_query() -> dict | None:
    """
    Pick the next search query to use.
    Priority:
      1. Queries never used (last_used_at IS NULL), ordered by id
      2. Queries last used more than 30 days ago (monthly recycling)
    """
    # First: never-used queries
    resp = requests.get(
        f"{SUPABASE_URL}/rest/v1/search_queries",
        headers=HEADERS,
        params={
            "last_used_at": "is.null",
            "order": "id.asc",
            "limit": "1",
            "select": "*",
        },
        timeout=10,
    )
    rows = resp.json()
    if rows:
        return rows[0]

    # Second: oldest used query (30+ days ago for recycling)
    thirty_days_ago = (datetime.now(timezone.utc) - timedelta(days=30)).isoformat()
    resp = requests.get(
        f"{SUPABASE_URL}/rest/v1/search_queries",
        headers=HEADERS,
        params={
            "last_used_at": f"lt.{thirty_days_ago}",
            "order": "last_used_at.asc",
            "limit": "1",
            "select": "*",
        },
        timeout=10,
    )
    rows = resp.json()
    if rows:
        return rows[0]

    # All queries used within last 30 days — nothing to do
    return None


def mark_query_used(query_id: int, videos_found: int):
    """Mark a query as used with timestamp and video count."""
    requests.patch(
        f"{SUPABASE_URL}/rest/v1/search_queries",
        headers={**HEADERS, "Prefer": "return=minimal"},
        params={"id": f"eq.{query_id}"},
        json={
            "last_used_at": datetime.now(timezone.utc).isoformat(),
            "use_count": f"use_count + 1",  # Won't work as RPC, fix below
            "videos_found": videos_found,
        },
        timeout=10,
    )
    # Supabase REST doesn't support increment in PATCH, so do a separate fetch+update
    resp = requests.get(
        f"{SUPABASE_URL}/rest/v1/search_queries",
        headers=HEADERS,
        params={"id": f"eq.{query_id}", "select": "use_count"},
        timeout=10,
    )
    rows = resp.json()
    current_count = rows[0]["use_count"] if rows else 0
    requests.patch(
        f"{SUPABASE_URL}/rest/v1/search_queries",
        headers={**HEADERS, "Prefer": "return=minimal"},
        params={"id": f"eq.{query_id}"},
        json={
            "last_used_at": datetime.now(timezone.utc).isoformat(),
            "use_count": current_count + 1,
            "videos_found": videos_found,
        },
        timeout=10,
    )


# ─────────────────────────────────────────────────────────────
# ADMIN JOB HANDLER (manual triggers from Admin Panel)
# ─────────────────────────────────────────────────────────────
def check_pending_jobs() -> dict | None:
    """Find the oldest pending scrape job from admin panel."""
    resp = requests.get(
        f"{SUPABASE_URL}/rest/v1/scrape_jobs",
        headers=HEADERS,
        params={
            "status": "eq.pending",
            "order": "created_at.asc",
            "limit": "1",
            "select": "*",
        },
        timeout=10,
    )
    jobs = resp.json()
    return jobs[0] if jobs else None


def update_job(job_id: str, updates: dict):
    """Update a scrape job record."""
    requests.patch(
        f"{SUPABASE_URL}/rest/v1/scrape_jobs",
        headers={**HEADERS, "Prefer": "return=minimal"},
        params={"id": f"eq.{job_id}"},
        json=updates,
        timeout=10,
    )


def create_auto_job() -> str:
    """Create a scrape_jobs entry for autonomous scraping (for admin visibility)."""
    resp = requests.post(
        f"{SUPABASE_URL}/rest/v1/scrape_jobs",
        headers=HEADERS,
        json={
            "status": "running",
            "triggered_by": "auto-daemon",
            "started_at": datetime.now(timezone.utc).isoformat(),
        },
        timeout=10,
    )
    if resp.status_code in (200, 201):
        return resp.json()[0]["id"]
    return None


# ─────────────────────────────────────────────────────────────
# AUTONOMOUS SCRAPING CYCLE
# ─────────────────────────────────────────────────────────────
def run_scrape_cycle():
    """
    One full autonomous cycle:
      1. Pick the next query
      2. Search YouTube
      3. Scrape until quota is at MIN_QUOTA_RESERVE
    Returns number of restaurants added.
    """
    import quota
    from scrape import process_url, is_already_scraped
    from find_urls import search_youtube

    # Check quota first
    remaining = quota.get_remaining()
    if remaining <= MIN_QUOTA_RESERVE:
        print(f"[DAEMON] Only {remaining} API call(s) left. Hibernating...")
        return -1  # Signal to hibernate

    # Pick next query
    query_row = pick_next_query()
    if not query_row:
        print("[DAEMON] All queries used within last 30 days. Waiting for recycling window...")
        return -2  # Signal that all queries are exhausted

    query_text = query_row["query"]
    query_id = query_row["id"]
    region = query_row.get("region", "india")

    print(f"\n{'='*60}")
    print(f"[DAEMON] >> Query: \"{query_text}\"")
    print(f"[DAEMON]    Region: {region} | Quota remaining: {remaining}")
    print(f"{'='*60}")

    # Create a visible job entry for the admin panel
    job_id = create_auto_job()

    # Search YouTube
    search_term = f"ytsearch{VIDEOS_PER_QUERY}:{query_text}"
    try:
        entries = search_youtube(search_term, VIDEOS_PER_QUERY)
        urls = [url for url, title in entries]
    except Exception as e:
        print(f"[DAEMON] Search failed: {e}")
        mark_query_used(query_id, 0)
        if job_id:
            update_job(job_id, {
                "status": "failed",
                "finished_at": datetime.now(timezone.utc).isoformat(),
                "error_log": f"Search failed: {str(e)[:300]}",
            })
        return 0

    print(f"[DAEMON] Found {len(urls)} candidate videos")
    mark_query_used(query_id, len(urls))

    # Process each URL until quota runs out
    processed = 0
    added = 0
    skipped = 0
    failed = 0

    for url in urls:
        if not running:
            break

        # Check quota before each video
        remaining = quota.get_remaining()
        if remaining <= MIN_QUOTA_RESERVE:
            print(f"\n[DAEMON] [!] Quota at {remaining}. Stopping to preserve reserve.")
            break

        # Skip already scraped
        if is_already_scraped(url):
            skipped += 1
            continue

        try:
            result = process_url(url)
        except QuotaExhaustedError:
            print(f"\n[DAEMON] [!] Quota Exhausted exception caught. Triggering hibernation.")
            return -1

        processed += 1

        if result["status"] == "success":
            if result.get("added"):
                added += 1
        elif result["status"] == "failed":
            failed += 1
        else:
            skipped += 1

    # Update the admin-visible job
    if job_id:
        update_job(job_id, {
            "status": "done",
            "finished_at": datetime.now(timezone.utc).isoformat(),
            "videos_processed": processed,
            "videos_added": added,
            "error_log": f"Query: \"{query_text}\" | Skipped: {skipped}, Failed: {failed}",
        })

    print(f"\n[DAEMON] [OK] Cycle complete: {processed} processed, {added} added, {skipped} skipped, {failed} failed")

    # Check if we should continue with another query or hibernate
    remaining = quota.get_remaining()
    if remaining <= MIN_QUOTA_RESERVE:
        return -1  # hibernate
    return added


def calculate_sleep_until_reset() -> int:
    """Calculate seconds until next midnight UTC (quota reset)."""
    now = datetime.now(timezone.utc)
    tomorrow = (now + timedelta(days=1)).replace(hour=0, minute=0, second=0, microsecond=0)
    delta = (tomorrow - now).total_seconds()
    return int(delta) + 60  # Add 60s buffer to ensure quota is fully reset


def hibernate():
    """Sleep until quota resets at midnight UTC."""
    sleep_seconds = calculate_sleep_until_reset()
    hours = sleep_seconds // 3600
# -------------------------------------------------------------
# MAIN LOOP
# -------------------------------------------------------------
def main():
    manual_only = "--manual" in sys.argv
    once_mode   = "--once"   in sys.argv   # GitHub Actions / CI mode

    mode_label = (
        "Once (CI/GitHub Actions — exit when quota exhausted)"
        if once_mode else
        ("Manual (admin jobs only)" if manual_only else "Autonomous (infinite loop)")
    )

    print(f"+{'='*58}+")
    print(f"|  YOUCHOOSE - Autonomous Scrape Daemon v2                |")
    print(f"|  Mode: {mode_label[:50]:<50}|")
    print(f"|  Press Ctrl+C to stop gracefully                        |")
    print(f"+{'='*58}+\n")

    if not manual_only:
        # Seed the query bank into the database
        try:
            seed_queries()
        except Exception as e:
            print(f"[DAEMON] Warning: Could not seed queries: {e}")
            print("[DAEMON] Will continue - queries may already be seeded.\n")

    while running:
        try:
            # Always check for manual admin jobs first
            job = check_pending_jobs()
            if job:
                print(f"\n[DAEMON] [ADMIN] Job detected: {job['id']}")
                execute_admin_job(job)
                continue

            if manual_only:
                # Old behaviour: just poll and wait
                ts = datetime.now().strftime("%H:%M:%S")
                print(f"[{ts}] No pending jobs.", end="\r")
                time.sleep(POLL_INTERVAL)
                continue

            # Autonomous mode: run a scrape cycle
            result = run_scrape_cycle()

            if result == -1:
                # Quota exhausted
                if once_mode:
                    # GitHub Actions / CI: just exit — scheduler will re-run tomorrow
                    print("\n[DAEMON] Quota exhausted. Exiting (CI mode — will resume tomorrow).")
                    sys.exit(0)
                else:
                    # Server daemon: hibernate until reset
                    hibernate()
            elif result == -2:
                # All queries used within 30 days
                if once_mode:
                    print("[DAEMON] All queries recycled recently. Nothing to do today. Exiting.")
                    sys.exit(0)
                else:
                    print("[DAEMON] All queries recycled recently. Sleeping 6 hours...")
                    for _ in range(360):  # 6 hours in 60-second chunks
                        if not running:
                            break
                        time.sleep(60)
            else:
                # Brief pause between cycles to be polite
                print(f"[DAEMON] Pausing 10s before next cycle...")
                time.sleep(10)

        except requests.exceptions.ConnectionError:
            print("[DAEMON] Connection error — retrying in 60s...")
            time.sleep(60)
        except Exception as e:
            print(f"[DAEMON] Unexpected error: {e}")
            import traceback
            traceback.print_exc()
            time.sleep(30)

    print("\n[DAEMON] Stopped.")


def execute_admin_job(job: dict):
    """Execute a manually triggered scrape job from the admin panel."""
    import quota
    from scrape import process_batch
    from find_urls import search_youtube

    job_id = job["id"]
    print(f"[DAEMON] Executing admin job: {job_id}")

    update_job(job_id, {
        "status": "running",
        "started_at": datetime.now(timezone.utc).isoformat(),
    })

    try:
        remaining = quota.get_remaining()
        print(f"[DAEMON] Quota remaining: {remaining}")

        if remaining <= 0:
            update_job(job_id, {
                "status": "done",
                "finished_at": datetime.now(timezone.utc).isoformat(),
                "videos_processed": 0,
                "videos_added": 0,
                "error_log": "Quota exhausted — no calls available today.",
            })
            return

        # Use the next dynamic query instead of generic terms
        query_row = pick_next_query()
        if query_row:
            search_term = f"ytsearch{min(remaining, 20)}:{query_row['query']}"
            mark_query_used(query_row["id"], 0)
        else:
            search_term = f"ytsearch{min(remaining, 20)}:best food review India 2024"

        print(f"[DAEMON] Searching: {search_term}")

        all_urls = []
        try:
            entries = search_youtube(search_term)
            all_urls = [url for url, title in entries]
        except Exception as e:
            print(f"[DAEMON] Search failed: {e}")

        all_urls = list(dict.fromkeys(all_urls))
        print(f"[DAEMON] Found {len(all_urls)} candidate URLs")

        if not all_urls:
            update_job(job_id, {
                "status": "done",
                "finished_at": datetime.now(timezone.utc).isoformat(),
                "videos_processed": 0,
                "videos_added": 0,
                "error_log": "No new URLs found from search.",
            })
            return

        results = process_batch(all_urls, max_count=remaining)

        update_job(job_id, {
            "status": "done",
            "finished_at": datetime.now(timezone.utc).isoformat(),
            "videos_processed": results["processed"],
            "videos_added": results["added"],
            "error_log": f"Skipped: {results['skipped']}, Failed: {results['failed']}",
        })

        print(f"[DAEMON] Admin job complete. Processed: {results['processed']}, Added: {results['added']}")

    except QuotaExhaustedError:
        print(f"[DAEMON] Job failed: Quota Exhausted")
        update_job(job_id, {
            "status": "failed",
            "finished_at": datetime.now(timezone.utc).isoformat(),
            "error_log": "Quota Exhausted during job execution.",
        })
        hibernate()
    except Exception as e:
        print(f"[DAEMON] Job failed: {e}")
        import traceback
        traceback.print_exc()
        update_job(job_id, {
            "status": "failed",
            "finished_at": datetime.now(timezone.utc).isoformat(),
            "error_log": str(e)[:500],
        })


if __name__ == "__main__":
    main()
