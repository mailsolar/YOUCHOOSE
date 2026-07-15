-- ─────────────────────────────────────────────────────────────
-- YOUCHOOSE — Schema Update v3: Complex Rating + Autonomous Scraping
-- Run this in: Supabase Dashboard → SQL Editor → New Query → Run
-- ─────────────────────────────────────────────────────────────

-- ── REVIEWS — add deep analysis columns ──────────────────────
ALTER TABLE reviews ADD COLUMN IF NOT EXISTS detailed_metrics jsonb;
ALTER TABLE reviews ADD COLUMN IF NOT EXISTS praises_complaints jsonb;
ALTER TABLE reviews ADD COLUMN IF NOT EXISTS accurate_transcript text;

-- ── RESTAURANTS — add category if missing ────────────────────
ALTER TABLE restaurants ADD COLUMN IF NOT EXISTS category text DEFAULT 'restaurant';

-- ── SEARCH_QUERIES — dynamic query rotation for autonomous scraping ──
CREATE TABLE IF NOT EXISTS search_queries (
  id            serial PRIMARY KEY,
  query         text NOT NULL UNIQUE,
  region        text DEFAULT 'india',
  category      text DEFAULT 'general',
  last_used_at  timestamptz,
  use_count     int DEFAULT 0,
  videos_found  int DEFAULT 0,
  created_at    timestamptz DEFAULT now()
);

-- Index for picking the next query efficiently
CREATE INDEX IF NOT EXISTS search_queries_last_used_idx
  ON search_queries(last_used_at ASC NULLS FIRST);

CREATE INDEX IF NOT EXISTS search_queries_region_idx
  ON search_queries(region);

-- ── RLS for search_queries ───────────────────────────────────
ALTER TABLE search_queries ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Public read search_queries"
  ON search_queries FOR SELECT USING (true);

CREATE POLICY "Anon insert search_queries"
  ON search_queries FOR INSERT WITH CHECK (true);

CREATE POLICY "Anon update search_queries"
  ON search_queries FOR UPDATE USING (true);

-- ── USER_PROFILES — add avatar_url if missing ────────────────
ALTER TABLE user_profiles ADD COLUMN IF NOT EXISTS avatar_url text;
ALTER TABLE user_profiles ADD COLUMN IF NOT EXISTS name text;
ALTER TABLE user_profiles ADD COLUMN IF NOT EXISTS taste_preferences text[];

-- ── Allow user_profiles updates ──────────────────────────────
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_policies
    WHERE tablename = 'user_profiles' AND policyname = 'Anon update user_profiles'
  ) THEN
    CREATE POLICY "Anon update user_profiles"
      ON user_profiles FOR UPDATE USING (true);
  END IF;
END $$;
