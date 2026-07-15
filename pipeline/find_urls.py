"""
YOUCHOOSE — find_urls.py
=========================
Automatically searches YouTube for food review videos and appends
their URLs to urls.txt. Uses yt-dlp's built-in YouTube search —
no API key required.

Usage:
    python find_urls.py                     # Uses default search queries
    python find_urls.py "Mumbai food review" # Custom search query
    python find_urls.py --count 20          # Find more videos (default: 10)

After running, review urls.txt and then run:
    python scrape.py urls.txt
"""

import sys
import json
import subprocess
from pathlib import Path

URLS_FILE = Path(__file__).parent / "urls.txt"

# Default search queries — mix of global and Indian food creators
DEFAULT_QUERIES = [
    "ytsearch10:restaurant review food vlog 2024",
    "ytsearch5:Mark Wiens restaurant review",
    "ytsearch5:Best Ever Food Review Show street food",
    "ytsearch5:food review Mumbai restaurant",
    "ytsearch5:Keith Lee restaurant review",
    "ytsearch5:food blogger India restaurant honest review",
]


def search_youtube(query: str, count: int = 10) -> list[str]:
    """Use yt-dlp to search YouTube and return video URLs."""
    print(f"  Searching: {query}")

    # Replace count in ytsearch prefix if custom
    if not query.startswith("ytsearch"):
        query = f"ytsearch{count}:{query}"

    cmd = [
        "yt-dlp",
        "--flat-playlist",
        "--dump-json",
        "--no-warnings",
        "--quiet",
        query,
    ]

    result = subprocess.run(cmd, capture_output=True, text=True, timeout=60)

    urls = []
    for line in result.stdout.strip().splitlines():
        if not line:
            continue
        try:
            data = json.loads(line)
            video_id = data.get("id", "")
            title = data.get("title", "")
            duration = data.get("duration", 0) or 0

            # Skip very short clips (< 60 sec) or very long videos (> 30 min)
            # Ideal food review: 2–15 minutes
            if duration and (duration < 60 or duration > 1800):
                continue

            url = f"https://www.youtube.com/watch?v={video_id}"
            urls.append((url, title))
        except (json.JSONDecodeError, KeyError):
            continue

    return urls


def append_to_urls_file(new_entries: list[tuple[str, str]]):
    """Append new URLs to urls.txt, avoiding duplicates."""
    # Read existing URLs
    existing = set()
    if URLS_FILE.exists():
        for line in URLS_FILE.read_text().splitlines():
            line = line.strip()
            if line and not line.startswith("#"):
                existing.add(line)

    added = 0
    lines_to_add = []

    for url, title in new_entries:
        if url not in existing:
            lines_to_add.append(f"# {title}")
            lines_to_add.append(url)
            existing.add(url)
            added += 1

    if lines_to_add:
        with open(URLS_FILE, "a", encoding="utf-8") as f:
            f.write("\n")
            f.write("\n".join(lines_to_add))
            f.write("\n")

    return added


def main():
    # Parse args
    custom_query = None
    count = 10

    args = sys.argv[1:]
    for i, arg in enumerate(args):
        if arg == "--count" and i + 1 < len(args):
            count = int(args[i + 1])
        elif not arg.startswith("--"):
            custom_query = arg

    queries = [f"ytsearch{count}:{custom_query}"] if custom_query else DEFAULT_QUERIES

    print(f"\nYOUCHOOSE — URL Finder")
    print(f"{'='*50}")
    print(f"Searching YouTube for food review videos...\n")

    all_entries = []
    for query in queries:
        try:
            entries = search_youtube(query, count)
            all_entries.extend(entries)
            print(f"  Found {len(entries)} videos")
        except Exception as e:
            print(f"  [WARN] Search failed: {e}")

    print(f"\nTotal found: {len(all_entries)} videos")

    added = append_to_urls_file(all_entries)
    print(f"Added {added} new URLs to urls.txt")
    print(f"\nFile: {URLS_FILE}")
    print(f"\nNext step: python scrape.py urls.txt")


if __name__ == "__main__":
    main()
